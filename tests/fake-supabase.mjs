/* A Supabase that is not Supabase.
 *
 *  The sync suite must be able to fail Supabase on purpose, run two auditors
 *  against one record, and check that a stale push is REFUSED — none of which
 *  can be done against Sarel's real project, and all of which are the parts
 *  most worth testing. So this implements the two endpoints /api/sync actually
 *  calls, with the same semantics the SQL migration gives them:
 *
 *    POST /rest/v1/rpc/squawk_push   conditional upsert — a row is written only
 *                                    where it is NEWER than what is there
 *    GET  /rest/v1/squawk_records    everything in one audit after a cursor,
 *                                    ordered by the SERVER's clock
 *
 *  Plus three controls the real thing does not have: __reset to empty it
 *  between scenarios, __fail to make it answer 500 so the app's behaviour when
 *  the record is down can be driven rather than argued about, and __lag to hold
 *  a push open before it commits.
 *
 *  __lag exists because this fake was, for a while, BETTER BEHAVED THAN
 *  POSTGRES, and so proved something that was not true. Postgres stamps
 *  now() at the transaction's START and makes the rows visible at its COMMIT.
 *  A push that takes 400ms therefore lands carrying a timestamp from before it
 *  began — possibly older than a cursor another device was handed in the
 *  meantime, which is how a captured check can become permanently invisible to
 *  the rest of the team. Stamping per row at write time, in order, as this
 *  originally did, makes that race impossible to express.
 */

import http from "node:http";

export function fakeSupabase(port = 3901) {
  /* key -> { entity, visit, kind, id, updated_at, payload, server_at } */
  const rows = new Map();
  let seq = 0;
  let failing = false;
  let lagMs = 0;
  const stamp = () => new Date(Date.UTC(2026, 8, 8) + ++seq).toISOString();
  const key = (r) => `${r.entity}|${r.visit}|${r.kind}|${r.id}`;

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const send = (code, payload) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      if (url.pathname === "/__reset") {
        rows.clear();
        seq = 0;
        failing = false;
        return send(200, { ok: true });
      }
      if (url.pathname === "/__fail") {
        failing = url.searchParams.get("on") !== "0";
        return send(200, { failing });
      }
      /* Hold the NEXT push open for this many milliseconds before its rows
         become visible — a slow transaction, which is the only condition under
         which the commit-time race can be seen. */
      if (url.pathname === "/__lag") {
        lagMs = Number(url.searchParams.get("ms") ?? 0) || 0;
        return send(200, { lagMs });
      }
      if (url.pathname === "/__rows") {
        return send(200, [...rows.values()]);
      }

      /* The real thing refuses an unauthenticated call; so does this, because a
         route that forgot its key must fail loudly here rather than silently
         work in a test and 401 in production. */
      if (!req.headers.apikey || !req.headers.authorization) {
        return send(401, { message: "no api key" });
      }
      if (failing) return send(500, { message: "the record is down" });

      if (req.method === "POST" && url.pathname === "/rest/v1/rpc/squawk_push") {
        const incoming = JSON.parse(body || "{}").records ?? [];
        /* Newest wins inside the batch, exactly as `distinct on ... order by
           updated_at desc` does in the migration. */
        const deduped = new Map();
        for (const r of incoming) {
          const k = key(r);
          const seen = deduped.get(k);
          if (!seen || r.updated_at > seen.updated_at) deduped.set(k, r);
        }
        /* ONE stamp for the whole batch, taken now — now() is constant within
           a transaction and is read at its start, not at its commit. */
        const at = stamp();
        const winners = [];
        for (const [k, r] of deduped) {
          const cur = rows.get(k);
          if (cur && r.updated_at <= cur.updated_at) continue; // the WHERE clause
          winners.push([k, { ...r, server_at: at }]);
        }
        const commit = () => {
          for (const [k, r] of winners) rows.set(k, r);
        };
        if (lagMs) {
          const held = lagMs;
          lagMs = 0; // one push only, so a scenario cannot leak into the next
          setTimeout(commit, held);
        } else {
          commit();
        }
        return send(200, winners.length);
      }

      if (req.method === "GET" && url.pathname === "/rest/v1/squawk_records") {
        const eq = (p) => (url.searchParams.get(p) ?? "").replace(/^eq\./, "");
        const gt = (url.searchParams.get("server_at") ?? "").replace(/^gt\./, "");
        const out = [...rows.values()]
          .filter((r) => r.entity === eq("entity") && r.visit === eq("visit"))
          .filter((r) => !gt || r.server_at > gt)
          .sort((a, b) => (a.server_at < b.server_at ? -1 : 1))
          .map(({ kind, id, updated_at, payload, server_at }) => ({
            kind,
            id,
            updated_at,
            payload,
            server_at,
          }));
        return send(200, out);
      }

      send(404, { message: "not this endpoint" });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${port}`,
        rows,
        close: () => new Promise((r) => server.close(r)),
      })
    );
  });
}
