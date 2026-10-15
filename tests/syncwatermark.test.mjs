import path from "node:path";
import { fileURLToPath } from "node:url";

/* nextPushWatermark (src/lib/syncWatermark.ts) — the one decision in the
 *  shared-record sync path that costs a record forever if it is wrong.
 *
 *  Found 15 October 2026, on a live audit: a device merged 48 asset-system
 *  ratings, every sync reported "Shared" with no error, and the shared
 *  record still held only 2 of them. The watermark had advanced past all
 *  48 on a bare 200 OK, with nobody having checked the record store
 *  actually held what was sent. THE INVARIANT THIS PINS: the watermark may
 *  never move past a record squawk_push did not confirm, whatever the HTTP
 *  status said.
 *
 *  Imported directly, like risk-matrix.test.mjs imports risk.ts — a
 *  relative path, not the "@/" alias, so this needs no loader and is never
 *  added to NEEDS_ALIAS. (shared.ts itself is not imported this way: it is
 *  "use client" code wired to React, fetch and localStorage, which is
 *  exactly why this one decision was pulled out of it into its own
 *  dependency-free module — see that module's own header.) */

const here = path.dirname(fileURLToPath(import.meta.url));
const { nextPushWatermark } = await import(
  path.join(here, "..", "src", "lib", "syncWatermark.ts")
);

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
};

check(
  "nothing to push leaves the watermark exactly where it was",
  nextPushWatermark([], [], 1000) === 1000
);

check(
  "every record confirmed — the watermark advances to the newest of them",
  nextPushWatermark(
    [
      { kind: "system", id: "Electrical|AGL", updated_at: 1200 },
      { kind: "system", id: "Electrical|Substations", updated_at: 1500 },
    ],
    [
      { kind: "system", id: "Electrical|AGL", updated_at: 1200 },
      { kind: "system", id: "Electrical|Substations", updated_at: 1500 },
    ],
    1000
  ) === 1500
);

/* THE EXACT FAILURE MODE THIS WAS BUILT FOR: 48 sent, only 2 confirmed. */
check(
  "even one unconfirmed record among many holds the ENTIRE batch back — a scalar watermark cannot skip just the bad one",
  nextPushWatermark(
    Array.from({ length: 48 }, (_, i) => ({ kind: "system", id: `S${i}`, updated_at: 1000 + i })),
    [
      { kind: "system", id: "S0", updated_at: 1000 },
      { kind: "system", id: "S1", updated_at: 1001 },
    ],
    999
  ) === 999
);

check(
  "a key reported back with updated_at null (genuinely absent) counts as unconfirmed, not confirmed-with-no-value",
  nextPushWatermark(
    [{ kind: "system", id: "Mechanical|Lifts", updated_at: 1100 }],
    [{ kind: "system", id: "Mechanical|Lifts", updated_at: null }],
    1000
  ) === 1000
);

check(
  "a legitimate stale skip (somebody else's newer value already won) still confirms the key — the device need not resend it forever",
  nextPushWatermark(
    [{ kind: "system", id: "Civil|Drainage", updated_at: 1100 }],
    /* squawk_push reports the value NOW on record, which can be newer than
       what this device sent — that is still a confirmation, not a miss. */
    [{ kind: "system", id: "Civil|Drainage", updated_at: 1300 }],
    1000
  ) === 1100
);

check(
  "confirmation is matched by kind AND id — a same-id different-kind row never stands in for the real one",
  nextPushWatermark(
    [{ kind: "system", id: "X", updated_at: 1100 }],
    [{ kind: "finding", id: "X", updated_at: 1100 }],
    1000
  ) === 1000
);

check(
  "an empty confirmed list (push attempted, server answered nothing back) never advances a non-empty send",
  nextPushWatermark(
    [{ kind: "system", id: "Electrical|AGL", updated_at: 1200 }],
    [],
    1000
  ) === 1000
);

/* shared.ts itself is "use client" + React + store-wired, not meant to load
   under plain Node — see this file's own header for why the decision was
   pulled out of it instead. Checked by reading its source, the same light
   touch the other *.test.mjs files give files they only read, not execute. */
const sharedSrc = await (async () => {
  const fs = await import("node:fs");
  return fs.readFileSync(path.join(here, "..", "src", "lib", "shared.ts"), "utf8");
})();
check(
  "shared.ts reads the watermark decision from syncWatermark.ts rather than re-deciding it inline",
  sharedSrc.includes('from "./syncWatermark"') && sharedSrc.includes("nextPushWatermark(records, json.confirmed")
);
check(
  "shared.ts no longer advances the push watermark unconditionally off records.reduce",
  !/local\.set\(\s*pushedKey\(entity, visit\),\s*String\(\s*records\.reduce/.test(sharedSrc)
);
check(
  "an unconfirmed push surfaces as a real error state, not a silent Shared",
  sharedSrc.includes("pushIncomplete") && sharedSrc.includes('setSyncState(refused || pushIncomplete ? "error" : "synced")')
);

const routeSrc = await (async () => {
  const fs = await import("node:fs");
  return fs.readFileSync(path.join(here, "..", "src", "app", "api", "sync", "route.ts"), "utf8");
})();
check(
  "the API route passes the full confirmed list back to the client, not just a count",
  routeSrc.includes("confirmed,") && routeSrc.includes("written = confirmed.length")
);

const sqlSrc = await (async () => {
  const fs = await import("node:fs");
  return fs.readFileSync(path.join(here, "..", "supabase", "0001_shared_record.sql"), "utf8");
})();
check(
  "squawk_push returns a table of confirmed keys, not a bare integer count",
  sqlSrc.includes("returns table(kind text, id text, updated_at bigint)") &&
    !sqlSrc.includes("returns integer")
);
check(
  "a key the upsert skips because a newer value already stood is still reported back as confirmed, via the pre-write snapshot",
  sqlSrc.includes("existing as (") && sqlSrc.includes("coalesce(u.updated_at, e.updated_at)")
);
check(
  "the migration file stays idempotent to re-run — the return-type change is dropped first, as the file's own install note requires",
  sqlSrc.includes("drop function if exists public.squawk_push(jsonb);")
);

process.exit(failures ? 1 : 0);
