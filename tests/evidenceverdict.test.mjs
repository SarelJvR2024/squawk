import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* WHAT THE EVIDENCE PROVES, AND THE VERDICT IT SUPPORTS.
 *
 *  Sarel, 11 October 2026, in one breath: remove "Evidence to request",
 *  "Likely answers" and "Issues found" from the check screen — three
 *  chip-picking tabs over the Answer Library — and in the Evidence status
 *  tab, add a text box for what the evidence proves plus Compliant/
 *  Non-compliant/Not Verified for the evidence itself. Then: wire it into
 *  the SharePoint sync (see tests/sharepoint.test.mjs, Part 1l), and surface
 *  it on the Asset Assurance view too (see tests/systems.test.mjs).
 *
 *  Two fields, a different question each from everything already on
 *  Response: `evidenceStatus` (EVIDENCE_STATUSES, evidencestatus.test.mjs)
 *  asks whether the proof EXISTS; `compliance` (the top-level STATUSES) is
 *  the check's own verdict; this pair asks what the evidence ITSELF says,
 *  once it exists — a check can read Compliant while its own evidence
 *  verdict disagrees, and that gap is deliberate, not a bug to reconcile
 *  automatically.
 *
 *  Source-read, like checkscreen.test.mjs and evidencestatus.test.mjs,
 *  whose shape this file follows exactly. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const types = read("src/lib/types.ts");
const store = read("src/lib/store.ts");
const detail = read("src/components/CheckDetail.tsx");
const codeOnly = detail.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ---- the type ------------------------------------------------------------ */

check(
  "evidenceProves is a required string, not optional",
  /evidenceProves: string;/.test(types)
);
check(
  "evidenceVerdict reuses Compliance rather than inventing a parallel type",
  /evidenceVerdict: Compliance \| null;/.test(types)
);

/* ---- the migration — every response already on a tablet predates this --- */

check(
  "the store version moved past every build that predates this field",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 33
);
check(
  "emptyResponse declares both fields, so a fresh response is explicit",
  /evidenceProves: "",\s*\n\s*evidenceVerdict: null,/.test(store)
);
check(
  "a migration backfills both fields on every response already on a device",
  /if \(from < 33 && st\.byVisit\) \{[\s\S]{0,1500}r\.evidenceProves = ""[\s\S]{0,200}r\.evidenceVerdict = null/.test(
    store
  )
);

/* ---- the fallback response CheckDetail renders before any patch --------- */

/* A response that does not exist yet (nobody has touched this check) is
   rendered from a literal default in CheckDetail, not from emptyResponse —
   a second place the same fields have to be declared, and the kind of gap
   that leaves a controlled textarea starting undefined (a React warning the
   moment the first patch makes it a string) rather than "". Caught here
   before it shipped: the fallback object was updated for evidenceStatus at
   v27 and evidencePendingNote at v31, and this field was missing from it
   until this exact check was written. */
check(
  "and CheckDetail's own not-yet-touched fallback carries the same two fields",
  /evidencePendingNote: "",\s*\n\s*evidenceProves: "",\s*\n\s*evidenceVerdict: null,/.test(codeOnly)
);

/* ---- the UI: a text box, and three verdicts, not five -------------------- */

check(
  "EVIDENCE_VERDICTS reuses three of Compliance's four values — not N/A",
  /key: "C", label: "Compliant"/.test(codeOnly) &&
    /key: "NC", label: "Non-compliant"/.test(codeOnly) &&
    /key: "NV", label: "Not Verified"/.test(codeOnly) &&
    !/key: "N\/A", label: "Compliant"/.test(codeOnly),
  "evidence cannot answer whether a check applies at all, only what it shows once it does"
);
check(
  "the textbox is unconditional, like the status buttons above it — no gate on the Answer Library",
  /value=\{r\.evidenceProves\}/.test(codeOnly) &&
    /onChange=\{\(e\) => patch\(check\.id, \{ evidenceProves: e\.target\.value \}\)\}/.test(codeOnly)
);
check(
  "a verdict tap toggles off on a second tap, same pattern as EVIDENCE_STATUSES",
  /onClick=\{\(\) => patch\(check\.id, \{ evidenceVerdict: on \? null : v\.key \}\)\}/.test(codeOnly)
);
check(
  "the three removed tabs do not come back",
  !/key: "evidence"/.test(codeOnly) &&
    !/key: "answers"/.test(codeOnly) &&
    !/key: "issues"/.test(codeOnly)
);

console.log(failures === 0 ? "\nEVIDENCE VERDICT OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
