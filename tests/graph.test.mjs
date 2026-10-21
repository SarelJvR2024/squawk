/* src/lib/graph.ts's retry logic, and the one regression it had: the
 *  message-based fallback (`RETRYABLE_MESSAGE`) undoing the deliberate 409
 *  exclusion `isRetryableStatus` documents at length. `ensureFolder` sends
 *  its folder-create with `conflictBehavior: "fail"` and reads a 409 there
 *  as "already exists, success" — not this function's to retry on its
 *  behalf, per that comment. But Microsoft Graph's actual message for that
 *  exact case, "The specified item name already exists.", matches
 *  RETRYABLE_MESSAGE too, so the fallback was retrying it up to
 *  MAX_ATTEMPTS times with growing backoff before `ensureFolder`'s own
 *  `.catch()` finally read the eventual throw as success anyway — several
 *  extra seconds of sync latency per newly-created evidence folder.
 *
 *  THE FIX IS SCOPED TO THE ONE CALL SITE, NOT TO THE STATUS CODE. A global
 *  "never retry a 409 on message" would be simpler, but `updateItem`'s list-
 *  write conflicts ("the resource has changed…") and `uploadEvidence`'s
 *  file-PUT races (the SAME "Name already exists" text, per `call()`'s own
 *  comment, from a destination file whose virus-scan lock had not released)
 *  are both genuine 409s with no success path of their own — they rely on
 *  this exact fallback and must keep retrying. So `call()` takes a
 *  `retryOn409Message` option, defaulting true, and only `ensureFolder`'s
 *  own folder-create call passes it false.
 *
 *  Part 1 RUNS `isRetryable()` — the one decision `call()` defers to,
 *  exported for exactly this, the same way sharepoint.ts exports
 *  `flattenProgress`/`buildPlan` so ITS rules are tested by running them, not
 *  by reading them (see that suite's own header). Part 2 reads the source
 *  for the one property a return value cannot express: that `ensureFolder`
 *  actually passes the option on its own call, and that no other call site
 *  was accidentally changed to pass it too. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* RUN, not just read — needs BOTH extra flags (see tests/run-all.sh and
   NEEDS_ALIAS/NEEDS_TRANSFORM_TYPES in tests/suite-table.test.mjs):

     node --experimental-transform-types --import ./tests/alias.mjs tests/graph.test.mjs

   `--experimental-transform-types`: GraphError's constructor uses TS
   parameter properties (`readonly status: number`), which Node's
   type-stripping alone cannot erase — that needs actual code generation
   (assigning `this.status = status`), not just dropping a type, and
   type-stripping refuses with "TypeScript parameter property is not
   supported in strip-only mode". This is pre-existing in graph.ts, not
   something this fix introduced. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const g = await import("../src/lib/graph.ts");

/* The exact wording Microsoft Graph returns for a folder-create conflict —
   quoted directly in the bug report, and in isRetryable's own doc comment. */
const NAME_EXISTS = "The specified item name already exists.";
const RESOURCE_CHANGED = "The resource has changed since the caller last read it.";

/* -------------------------- Part 1: isRetryable(), run ------------------- */

check(
  "ensureFolder's OWN 409 ('name already exists', retryOn409Message: false) is NOT retried",
  g.isRetryable(409, NAME_EXISTS, false) === false,
  `isRetryable(409, ${JSON.stringify(NAME_EXISTS)}, false)`
);

check(
  "the SAME 409/message, from a caller that did not opt out, IS STILL retried — updateItem's and uploadEvidence's genuine conflicts must not regress",
  g.isRetryable(409, NAME_EXISTS, true) === true &&
    g.isRetryable(409, NAME_EXISTS) === true, // default
  "a global 'never retry 409 on message' would silently break both of those"
);

check(
  "updateItem's list-write conflict — 409, 'resource has changed' — keeps retrying by default",
  g.isRetryable(409, RESOURCE_CHANGED) === true
);

check(
  "a 409 with neither flavour of message is not retried either way — nothing about this status itself is retryable",
  g.isRetryable(409, "Some other 409", false) === false &&
    g.isRetryable(409, "Some other 409", true) === false
);

check(
  "status-based retries (429/503/509/412) are UNCHANGED — retried regardless of the message or the 409 option",
  [429, 503, 509, 412].every(
    (status) => g.isRetryable(status, "irrelevant text", false) === true
  )
);

check(
  "the message match is status-agnostic everywhere EXCEPT the deliberate 409 exclusion — unchanged by this fix",
  g.isRetryable(404, NAME_EXISTS, true) === true && g.isRetryable(403, RESOURCE_CHANGED) === true
);

/* -------------------------------- Part 2: the wiring, read ---------------- */

const graphSrc = src("lib", "graph.ts");
const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const graphCode = codeOnly(graphSrc);

/* ensureFolder's folder-create call: the POST with conflictBehavior "fail",
   immediately followed (allowing for the object literal and the call's own
   formatting) by the opt-out. A regex loose enough to survive reformatting,
   tight enough that it only matches THIS call. */
const folderCreateBlock = graphCode.slice(
  graphCode.indexOf('"@microsoft.graph.conflictBehavior": "fail"')
);
check(
  "ensureFolder's folder-create call passes retryOn409Message: false",
  /retryOn409Message\s*:\s*false/.test(folderCreateBlock.slice(0, 400))
);

check(
  "and call() itself defers to isRetryable() rather than a reimplementation inline",
  /isRetryable\(res\.status, detail, retryOn409Message\)/.test(graphCode)
);

/* No OTHER call site opts out — uploadEvidence/setFileFields/updateItem/
   createItem must keep the default (retry allowed) or this fix has quietly
   widened past the one call site it was scoped to. */
for (const [name, fn] of [
  ["uploadEvidence", /export async function uploadEvidence[\s\S]*?\n\}/],
  ["setFileFields", /export async function setFileFields[\s\S]*?\n\}/],
  ["updateItem", /export async function updateItem[\s\S]*?\n\}/],
  ["createItem", /export async function createItem[\s\S]*?\n\}/],
]) {
  const m = graphCode.match(fn);
  check(
    `${name} does NOT opt out of the 409 message retry — only ensureFolder's own call does`,
    !!m && !/retryOn409Message/.test(m[0]),
    m ? "" : "function not found — check the regex"
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
