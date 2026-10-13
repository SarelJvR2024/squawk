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
 *  A WRITE IS ALWAYS A DRY RUN FIRST. `write` and `batch-write` without --yes
 *  only print what would change; nothing is sent. Run again with --yes once
 *  that diff looks right.
 *
 *  FIELDS THIS WILL NOT TOUCH: attachments, progress, actions, rootCauses,
 *  events — see the SQL file's own note: those are UNIONED across devices by
 *  src/lib/merge.ts, not replaced, and a shallow patch here would silently
 *  throw away whatever another device's merge would have kept. Patch text
 *  fields (observation, evidenceProves, note, and the like) — that is what
 *  this was built for.
 *
 *  EVERY WRITE STAMPS payload.updatedAt, NOT JUST THE ROW'S updated_at
 *  COLUMN. The two are different things read by different code: the row's
 *  updated_at is squawk_push()'s own "only write if newer" guard, but
 *  src/lib/merge.ts's device-side merge (what decides, on every tablet,
 *  whether a pulled row or the device's own local copy wins) compares
 *  payload.updatedAt — a field INSIDE the JSON, not the wrapping row. A write
 *  here that only bumped the row would satisfy squawk_push and sail straight
 *  past it, while every device quietly kept its own older local copy forever
 *  — correct by the merge's own rules, since nothing ever told it this patch
 *  was newer. Found the hard way, on a live FAOR audit: ninety-odd cleaned
 *  observations sat correctly in Supabase for two hours while not one device
 *  picked them up, because the payload's own timestamp was never touched.
 *
 *  `batch-write` IS `write` FOR MANY RECORDS IN ONE PASS — the same guard,
 *  the same dry-run-first rule, the same single squawk_push() door, just
 *  driven from a file instead of four flags. Built for exactly the case a
 *  single `write` cannot cover on its own: cleaning up every check in one
 *  discipline/area in one sitting (e.g. every KSIA-CIV-* record) instead of
 *  one invocation per check id. A malformed or no-merge-field entry in the
 *  batch stops the WHOLE run before anything is sent — partial writes from a
 *  batch that was half wrong would be a worse mess than the one being
 *  cleaned up. */

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
  node scripts/supabase-admin.mjs read        --entity <code> --visit <id> [--kind <kind>] [--id <recordId>]
  node scripts/supabase-admin.mjs write       --entity <code> --visit <id> --kind <kind> --id <recordId> --file <patch.json> [--yes]
  node scripts/supabase-admin.mjs batch-write --entity <code> --visit <id> --file <patches.json> [--yes]

batch-write's --file holds a JSON array: [{ "kind": "...", "id": "...", "patch": { ... } }, ...]
One entry per record to touch — e.g. every KSIA-CIV-* response in one file to clean up Civil in one pass.

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

/** The no-merge-field guard, shared by `write` and `batch-write` — refusing
 *  a patch here is the one check that keeps a shallow patch from stomping a
 *  field src/lib/merge.ts unions across devices. Returns the offending keys,
 *  empty when the patch is clean. */
function noMergeFields(patch) {
  return Object.keys(patch).filter((k) => NO_MERGE_FIELDS.has(k));
}

/** Fetch the one existing record a patch applies to, and fold the patch into
 *  its payload. Throws rather than returning null on anything but exactly
 *  one match, so a caller never has to remember to check.
 *
 *  STAMPS payload.updatedAt TO `now` UNLESS THE PATCH ALREADY SETS ONE —
 *  see the module doc comment for why this is not optional. `now` is also
 *  returned so the caller uses the exact same moment for the row's own
 *  updated_at column; the two columns disagree by milliseconds otherwise,
 *  which is harmless but needless. */
async function loadForPatch(entity, visit, kind, id, patch) {
  const existing = await rest(`/rest/v1/squawk_records?${params({ entity, visit, kind, id })}`);
  if (existing.length !== 1) {
    throw new Error(`expected exactly one existing record, found ${existing.length}`);
  }
  const row = existing[0];
  const now = Date.now();
  const nextPayload = { ...row.payload, ...patch, updatedAt: patch.updatedAt ?? now };
  return { row, nextPayload, now };
}

function printDiff(label, row, patch) {
  console.log(`--- ${label} ---`);
  for (const k of Object.keys(patch)) {
    console.log(`  ${k}: ${JSON.stringify(row.payload[k])} -> ${JSON.stringify(patch[k])}`);
  }
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
  const touchedNoMerge = noMergeFields(patch);
  if (touchedNoMerge.length) {
    console.error(
      `Refusing: ${touchedNoMerge.join(", ")} must go through the app's own merge (src/lib/merge.ts), not a direct patch.`
    );
    process.exit(1);
  }

  let row, nextPayload, now;
  try {
    ({ row, nextPayload, now } = await loadForPatch(entity, visit, kind, id, patch));
  } catch (e) {
    console.error(e.message[0].toUpperCase() + e.message.slice(1) + ".");
    process.exit(1);
  }

  printDiff(`${kind}/${id}`, row, { ...patch, updatedAt: nextPayload.updatedAt });

  if (!yes) {
    console.log("\nDry run only — nothing sent. Re-run with --yes to write.");
    return;
  }

  const result = await rest(`/rest/v1/rpc/squawk_push`, {
    method: "POST",
    body: JSON.stringify({
      records: [
        { entity, visit, kind, id, updated_at: now, payload: nextPayload },
      ],
    }),
  });
  console.log(result === 1 ? "Written." : "Not written — a newer record already exists.");
}

/** `write`, for a whole file of records at once — see the module doc comment
 *  for why this is additive to `write` rather than a replacement, and why a
 *  bad entry stops the entire batch before anything is sent. */
async function cmdBatchWrite(args) {
  const entity = flag(args, "entity");
  const visit = flag(args, "visit");
  const file = flag(args, "file");
  const yes = args.includes("--yes");
  if (!entity || !visit || !file) return usage();

  const entries = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(entries) || entries.length === 0) {
    console.error('Expected --file to contain a non-empty JSON array of { "kind", "id", "patch" }.');
    process.exit(1);
  }

  /* PASS ONE: VALIDATE EVERY ENTRY BEFORE TOUCHING THE NETWORK TO WRITE
     ANYTHING. A batch that fails on entry 40 of 50 after already writing 39
     is a worse mess than the one being cleaned up — so every entry is
     checked and fetched first, and the whole run stops on the first problem
     with nothing sent. */
  const prepared = [];
  for (const [i, entry] of entries.entries()) {
    const where = `entry ${i} (${entry?.kind ?? "?"}/${entry?.id ?? "?"})`;
    if (!entry?.kind || !entry?.id || !entry?.patch || typeof entry.patch !== "object") {
      console.error(`Refusing the whole batch: ${where} is missing kind, id, or patch.`);
      process.exit(1);
    }
    const touchedNoMerge = noMergeFields(entry.patch);
    if (touchedNoMerge.length) {
      console.error(
        `Refusing the whole batch: ${where} touches ${touchedNoMerge.join(", ")}, which must go through the app's own merge (src/lib/merge.ts), not a direct patch.`
      );
      process.exit(1);
    }
    let row, nextPayload, now;
    try {
      ({ row, nextPayload, now } = await loadForPatch(entity, visit, entry.kind, entry.id, entry.patch));
    } catch (e) {
      console.error(`Refusing the whole batch: ${where} — ${e.message}.`);
      process.exit(1);
    }
    prepared.push({ kind: entry.kind, id: entry.id, patch: entry.patch, row, nextPayload, now });
  }

  for (const { kind, id, patch, row, nextPayload } of prepared) {
    printDiff(`${kind}/${id}`, row, { ...patch, updatedAt: nextPayload.updatedAt });
  }
  console.log(`\n${prepared.length} record(s) ready.`);

  if (!yes) {
    console.log("Dry run only — nothing sent. Re-run with --yes to write.");
    return;
  }

  const result = await rest(`/rest/v1/rpc/squawk_push`, {
    method: "POST",
    body: JSON.stringify({
      records: prepared.map(({ kind, id, nextPayload, now }) => ({
        entity, visit, kind, id, updated_at: now, payload: nextPayload,
      })),
    }),
  });
  console.log(
    `${result} of ${prepared.length} record(s) written (the rest already had a newer version on the server).`
  );
}

const [cmd, ...rest_] = process.argv.slice(2);
requireConfig();
if (cmd === "read") await cmdRead(rest_);
else if (cmd === "write") await cmdWrite(rest_);
else if (cmd === "batch-write") await cmdBatchWrite(rest_);
else usage();
