import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* RAISE A FINDING FROM THE FINDINGS SCREEN ITSELF.
 *
 * Sarel: "there might be findings that we pick up which is not relating to a
 * specific audit check... make sure there's an easy way to capture findings,
 * to link it to a discipline and or asset type and or a question or a
 * check." The Findings screen (src/app/(app)/findings/page.tsx) reviews and
 * rates findings that already exist — until this change, nothing on it let
 * an auditor RAISE one, so a non-compliance with no check behind it had
 * nowhere to go but the walk screen's ad-hoc-item-then-promote flow.
 *
 * These assertions are source-read, like adhoc.test.mjs's own coverage of
 * AddItemSheet.tsx: the shape a UI call sends to addFinding is exactly as
 * checkable from the call site as from running it, and this repo's own
 * suites already draw that line (see AddItemSheet's own addFinding call,
 * which no suite re-executes either). What genuinely needs RUNNING rather
 * than reading — whether a non-check finding actually carries into a later
 * visit's Follow-up screen — is proved separately, against the real
 * exported functions, in tests/carryforward.test.mjs's own "a finding raised
 * outside the register" section. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const types = read("src", "lib", "types.ts");
const sheet = read("src", "components", "RaiseFindingSheet.tsx");
const addItemSheet = read("src", "components", "AddItemSheet.tsx");
const findingsPage = read("src", "app", "(app)", "findings", "page.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* Comments discuss the trap; the CODE is what has to be right. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const sheetCode = codeOnly(sheet);

/* ---- 1 · the data model already supports a checkless finding ----------- */

check(
  "Finding.checkId is nullable — a finding can exist with no check behind it",
  /checkId: string \| null;/.test(types.slice(types.indexOf("export interface Finding"))),
  "this is the field this whole feature hangs off; it already existed before this change"
);
check(
  "Finding.discipline and .system are required on every finding",
  /discipline: string;\s*\n\s*system: string;/.test(
    types.slice(types.indexOf("export interface Finding"))
  ),
  "every finding fits a discipline and an asset system, check or no check"
);

/* ---- 2 · the new sheet exists and is reachable from the Findings screen - */

check(
  "RaiseFindingSheet is a real component",
  /export default function RaiseFindingSheet/.test(sheetCode)
);
check(
  "it is built on this app's own Sheet primitive, not a hand-rolled modal",
  /import Sheet from "@\/components\/ui\/Sheet";/.test(sheetCode) &&
    /<Sheet\b/.test(sheetCode),
  "src/components/ui/Sheet.tsx is the established pattern — AddItemSheet and the findings screen's own CheckDetail popup both use it"
);
check(
  "the Findings screen imports and renders it",
  /import RaiseFindingSheet from "@\/components\/RaiseFindingSheet";/.test(
    codeOnly(findingsPage)
  ) && /<RaiseFindingSheet\b/.test(codeOnly(findingsPage))
);
check(
  "there is a visible way to open it",
  /onClick=\{\(\) => setRaiseOpen\(true\)\}/.test(codeOnly(findingsPage)) &&
    /Raise a finding/.test(findingsPage),
  "a sheet nobody can open is not an entry point"
);

/* ---- 3 · what it actually requires, and what it does not --------------- */

/* Scoped to the save() function's own body, not the whole file — the picker
   also reads `!discipline`/`!system` to decide whether picking a check-point
   should autofill them (see "a check narrows the discipline/system" below),
   and that convenience is not a validation gate. */
const saveBody = sheetCode.slice(
  sheetCode.indexOf("const save = () => {"),
  sheetCode.indexOf("\n  };", sheetCode.indexOf("const save = () => {"))
);

check(
  "discipline is required to save",
  /if \(!discipline\) \{/.test(saveBody),
  "Sarel: findings fit a discipline — that part is not optional"
);
check(
  "asset system is NOT required",
  !/if \(!system\)/.test(saveBody),
  'Sarel: "and or asset type" — optional, same as AddItemSheet\'s own picker'
);
check(
  "a check-point is NOT required",
  !/if \(!checkId\)/.test(saveBody),
  'Sarel: "and or a question or a check" — this is the exact case outstandingFor() already carries with no checkId filter'
);
check(
  "what was found is required to save",
  /if \(!t\) \{/.test(saveBody) && /const t = title\.trim\(\);/.test(saveBody)
);

/* ---- 4 · the check-point search reuses the ⌘K palette's own logic ------- */

check(
  "the check search is the same fuzzy match the jump-to-check palette uses",
  /portalIdFor\(entityCode, c\.id\)\} \$\{c\.requirement\} \$\{c\.system\} \$\{c\.discipline\} \$\{c\.acsaThreshold\}`/.test(
    sheetCode
  ),
  "one fuzzy-search rule in this app, built once in AppShell.tsx and reused here, not reinvented"
);

/* ---- 5 · the submit shape matches AddItemSheet's own raiseFinding call -- */

/* THE SAME DEFAULT SHAPE, FIELD FOR FIELD — so the two capture paths (the
   walk screen's promote-an-observation flow, and this screen's general
   capture) cannot drift into two different shapes of finding. Extracted as
   its own block from each file so later fields cannot silently match on a
   shorter prefix. */
const sheetCall = sheetCode.slice(
  sheetCode.indexOf("const id = addFinding({"),
  sheetCode.indexOf("});", sheetCode.indexOf("const id = addFinding({"))
);
const addItemCall = codeOnly(addItemSheet).slice(
  codeOnly(addItemSheet).indexOf("const id = addFinding({"),
  codeOnly(addItemSheet).indexOf("});", codeOnly(addItemSheet).indexOf("const id = addFinding({"))
);

for (const field of [
  "issueIndex: null,",
  "severity: null,",
  "likelihood: null,",
  "ratingConfirmed: false,",
  "rootCause: \"\",",
  "actions: [],",
  "actionStatus: \"Open\",",
  "priorRating: null,",
  "suggestedEvent: \"\",",
  "progress: [],",
  "adHoc: true,",
]) {
  check(
    `both capture paths default ${field.replace(/,$/, "")} identically`,
    sheetCall.includes(field) && addItemCall.includes(field),
    "a finding raised from the walk and one raised from this screen must be the same shape"
  );
}
check(
  "both stamp originVisit from the live visit, not a literal",
  /originVisit: visitId,/.test(sheetCall) && /originVisit: visitId,/.test(addItemCall)
);
check(
  "both stamp createdBy from the live auditor, not a literal",
  /createdBy: auditor,/.test(sheetCall) && /createdBy: auditor,/.test(addItemCall)
);
check(
  "checkId is passed straight through — null unless a check was actually picked",
  /checkId,/.test(sheetCall) && !/checkId: null,/.test(sheetCall),
  "AddItemSheet's own call hardcodes checkId: null because that flow can never have one; this screen's picker means checkId is a variable, not a literal"
);

console.log(failures === 0 ? "\nRAISE A FINDING OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
