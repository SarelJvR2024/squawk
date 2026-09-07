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
 *  Plus two controls the real thing does not have: __reset to empty it between
 *  scenarios, and __fail to make it answer 500 so the app's behaviour when the
 *  record is down can be driven rather than argued about.
 */

import http from "node:http";

export function fakeSupabase(port = 3901) {
  /* key -> { entity, visit, kind, id, updated_at, payload, server_at } */
  const rows = new Map();
  let seq = 0;
  let failing = false;
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
        let written = 0;
        for (const [k, r] of deduped) {
          const cur = rows.get(k);
          if (cur && r.updated_at <= cur.updated_at) continue; // the WHERE clause
          rows.set(k, { ...r, server_at: stamp() });
          written++;
        }
        return send(200, written);
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
