#!/usr/bin/env node
/** Manual, out-of-band read/write against the shared audit record.
 *
 *  Not part of the app — nothing here is imported by src/. This is for the
 *  one job the app's own /api/sync route cannot do: let somebody read a
 *  record or patch a few of its text fields directly, on demand, from a
 *  terminal, for something like rewriting a batch of check notes. Every run
 *  is a human typing a command; nothing here is scheduled or automatic.
 *
 *  SAME DOOR, SAME SECRET. Reuses SUPABASE_URL/SUPABASE_SECRET_KEY, the exact
 *  two env vars /api/sync already requires — see supabase/0001_shared_record.sql
 *  for why the secret key is the only way in and the publishable key can do
 *  nothing. No new credential, no new place to leak one.
 *
 *  WRITES GO THROUGH squawk_push(), THE APP'S OWN FUNCTION — never a raw
 *  table POST. PostgREST's bare upsert overwrites unconditionally; the SQL
 *  file's own comment warns against exactly that. squawk_push() keeps the
 *  "only write if newer" rule intact, so this tool cannot push a stale value
 *  over a tablet's more recent capture just because it ran later.
 *
 *  A WRITE IS ALWAYS A DRY RUN FIRST. `write` without --yes only prints what
 *  would change; nothing is sent. Run it again with --yes once that diff
 *  looks right.
 *
 *  FIELDS THIS WILL NOT TOUCH: attachments, progress, actions, rootCauses,
 *  events — see the SQL file's own note: those are UNIONED across devices by
 *  src/lib/merge.ts, not replaced, and a shallow patch here would silently
 *  throw away whatever another device's merge would have kept. Patch text
 *  fields (observation, evidenceProves, note, and the like) — that is what
 *  this was built for.
 */

import { readFileSync } from "node:fs";

const NO_MERGE_FIELDS = new Set([
  "attachments", "progress", "actions", "rootCauses", "rootCauseNotes",
  "events", "findingIds", "sourceSystemEventIds",
]);

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;

function usage() {
  console.log(`
Usage:
  node scripts/supabase-admin.mjs read  --entity <code> --visit <id> [--kind <kind>] [--id <recordId>]
  node scripts/supabase-admin.mjs write --entity <code> --visit <id> --kind <kind> --id <recordId> --file <patch.json> [--yes]

Env required: SUPABASE_URL, SUPABASE_SECRET_KEY (same as /api/sync).
`);
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

function requireConfig() {
  if (URL_ && KEY) return;
  console.error("Missing SUPABASE_URL and/or SUPABASE_SECRET_KEY in the environment.");
  process.exit(1);
}

async function rest(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

function params({ entity, visit, kind, id }) {
  const p = new URLSearchParams({ entity: `eq.${entity}`, visit: `eq.${visit}` });
  if (kind) p.set("kind", `eq.${kind}`);
  if (id) p.set("id", `eq.${id}`);
  return p;
}

async function cmdRead(args) {
  const entity = flag(args, "entity");
  const visit = flag(args, "visit");
  if (!entity || !visit) return usage();
  const kind = flag(args, "kind");
  const id = flag(args, "id");
  const rows = await rest(`/rest/v1/squawk_records?${params({ entity, visit, kind, id })}`);
  console.log(JSON.stringify(rows, null, 2));
  console.log(`\n${rows.length} record(s).`);
}

async function cmdWrite(args) {
  const entity = flag(args, "entity");
  const visit = flag(args, "visit");
  const kind = flag(args, "kind");
  const id = flag(args, "id");
  const file = flag(args, "file");
  const yes = args.includes("--yes");
  if (!entity || !visit || !kind || !id || !file) return usage();

  const patch = JSON.parse(readFileSync(file, "utf8"));
  const touchedNoMerge = Object.keys(patch).filter((k) => NO_MERGE_FIELDS.has(k));
  if (touchedNoMerge.length) {
    console.error(
      `Refusing: ${touchedNoMerge.join(", ")} must go through the app's own merge (src/lib/merge.ts), not a direct patch.`
    );
    process.exit(1);
  }

  const existing = await rest(`/rest/v1/squawk_records?${params({ entity, visit, kind, id })}`);
  if (existing.length !== 1) {
    console.error(`Expected exactly one existing record, found ${existing.length}.`);
    process.exit(1);
  }
  const row = existing[0];
  const nextPayload = { ...row.payload, ...patch };

  console.log("--- current ---");
  for (const k of Object.keys(patch)) console.log(`${k}:`, JSON.stringify(row.payload[k]));
  console.log("--- proposed ---");
  for (const k of Object.keys(patch)) console.log(`${k}:`, JSON.stringify(patch[k]));

  if (!yes) {
    console.log("\nDry run only — nothing sent. Re-run with --yes to write.");
    return;
  }

  const result = await rest(`/rest/v1/rpc/squawk_push`, {
    method: "POST",
    body: JSON.stringify({
      records: [
        { entity, visit, kind, id, updated_at: Date.now(), payload: nextPayload },
      ],
    }),
  });
  console.log(result === 1 ? "Written." : "Not written — a newer record already exists.");
}

const [cmd, ...rest_] = process.argv.slice(2);
requireConfig();
if (cmd === "read") await cmdRead(rest_);
else if (cmd === "write") await cmdWrite(rest_);
else usage();
