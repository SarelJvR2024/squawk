import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* One audit per entity per visit.
 *
 *  The programme has always been modelled correctly — ten entities, a three-year
 *  cycle, two visits a year, all of it data in programme.json. The data layer
 *  was not. `responses` was keyed by checkId alone and `verifications` by pf
 *  alone, with no entity or visit anywhere in persisted state, so capturing
 *  KSIA-ELE-001 at King Shaka and then switching to O.R. Tambo showed King
 *  Shaka's answer, and September's capture overwrote March's. The app could
 *  hold exactly one cell of a sixty-cell grid, silently.
 *
 *  Silently is the problem. Nothing on screen said the answer belonged to
 *  another airport. This suite reads the source, as risk-matrix.test.mjs and
 *  capture.test.mjs do, and its job is to stop scope being dropped again by an
 *  edit that looks local. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const exports_ = src("lib", "exports.ts");
const appShell = src("components", "AppShell.tsx");
const checkDetail = src("components", "CheckDetail.tsx");

/* Every screen that reads captured data. If one of these reaches into the
   store's raw slices instead of the scoped hooks, it is showing whatever the
   last scope happened to be. */
const screens = [
  ["capture/page.tsx", src("app", "(app)", "capture", "page.tsx")],
  ["field/page.tsx", src("app", "(app)", "field", "page.tsx")],
  ["findings/page.tsx", src("app", "(app)", "findings", "page.tsx")],
  ["closure/page.tsx", src("app", "(app)", "closure", "page.tsx")],
  ["dashboard/page.tsx", src("app", "(app)", "dashboard", "page.tsx")],
  ["AppShell.tsx", appShell],
  ["CheckDetail.tsx", checkDetail],
  ["ExportPanel.tsx", src("components", "ExportPanel.tsx")],
];

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------------------------------------------- Part 1: the scope exists */

check(
  "the scope key is the entity and the visit together",
  /export const scopeKey = \(entityCode: string, visitId: string\) =>/.test(store) &&
    /`\$\{entityCode\}\/\$\{visitId\}`/.test(store),
  ""
);

check(
  "captured data is stored under that key, not flat",
  /byVisit: Record<string, VisitData>/.test(store) &&
    /interface VisitData \{[\s\S]*?responses: Record<string, Response>;[\s\S]*?verifications: Record<string, Verification>;[\s\S]*?captures: Capture\[\];[\s\S]*?\}/.test(
      store
    ),
  "responses, verifications and captures all belong to one visit"
);

check(
  "the current entity and visit are part of persisted state",
  /partialize:[\s\S]*?entity: s\.entity,[\s\S]*?visit: s\.visit,[\s\S]*?byVisit: s\.byVisit,/.test(
    store
  ),
  "closing the tablet mid-audit must reopen on the same audit"
);

check(
  "a finding knows which entity it was raised at",
  /entity: string;/.test(types) && /originVisit: string;/.test(types),
  "this pair is what a later visit reads to see what an earlier one left open"
);

check(
  "the store stamps the entity onto a finding rather than trusting the caller",
  /* Not anchored to the end of the literal: the record also carries an
     updatedAt now, and what this is guarding is that the ENTITY comes from the
     store rather than from whatever the caller passed. */
  /\{ \.\.\.f, entity: s\.entity, id, createdAt: Date\.now\(\)/.test(store),
  "a screen that forgot to pass it would file the finding at the wrong airport"
);

/* --------------------------------------- Part 2: every write lands in scope */

check(
  "scoped writes go through one helper",
  /const writeScope = \(fn: \(d: VisitData\) => Partial<VisitData>\) =>/.test(store),
  "a second write path is how the first one drifted"
);

for (const name of ["patch", "addCapture", "dropCapture"]) {
  check(
    `${name} writes through writeScope`,
    new RegExp(`${name}: \\([^)]*\\) =>\\s*\\n?\\s*writeScope\\(`).test(store),
    ""
  );
}

check(
  "patchVerification writes through writeScope",
  /patchVerification: \(pf, p\) => \{[\s\S]*?writeScope\(/.test(store),
  ""
);

check(
  "withdrawing a finding only touches this entity and visit",
  /f\.entity === s\.entity &&\s*\n?\s*f\.originVisit === s\.visit/.test(store),
  "untapping an issue button must not withdraw a finding from another audit"
);

check(
  "resetting clears the current visit only",
  /resetVisit: \(\) =>/.test(store) && !/resetAll/.test(store),
  "wiping the whole programme to restart one visit is not what anyone means"
);

/* ------------------------------------- Part 3: every screen reads in scope */

for (const [name, text] of screens) {
  check(
    `${name} does not read the store's raw slices`,
    !/useStore\(\(s\) => s\.(responses|verifications|captures|findings)\)/.test(text) &&
      !/useStore\(\(s\) => s\.responses\[/.test(text),
    "raw reads bypass the scope and show whatever was last selected"
  );
}

/* The first version of this suite checked that screens did not read the raw
   store slices, and missed that three of them read a CURRENT_ENTITY module
   constant instead — same bug, different door. Both doors are shut now. */
for (const [name, text] of screens) {
  check(
    `${name} does not read a module-level entity or visit constant`,
    !/CURRENT_ENTITY\b/.test(text) && !/CURRENT_VISIT_ID/.test(text) && !/CURRENT_VISIT\b/.test(text),
    "the current entity is state, not a constant — the dashboard named the wrong airport this way"
  );
}

check(
  "no CURRENT_ENTITY constant exists to be reached for",
  !/export const CURRENT_ENTITY =/.test(fs.readFileSync(path.join(here, "..", "src", "lib", "programme.ts"), "utf8")),
  "removing it is what stops the next screen doing the same thing"
);

check(
  "capture names media with the entity in view",
  /const entityCode = useEntityCode\(\);/.test(
    fs.readFileSync(path.join(here, "..", "src", "components", "Capture.tsx"), "utf8")
  ),
  "a voice note taken at Cape Town was filenamed FALE-voice-…"
);

check(
  "field mode asks for the location axis of the entity in view",
  /locationAxis\(entityCode\)/.test(
    fs.readFileSync(path.join(here, "..", "src", "app", "(app)", "field", "page.tsx"), "utf8")
  ),
  "the default argument silently resolved to the programme's starting entity"
);

check(
  "the scoped hooks exist",
  ["useVisitData", "useResponses", "useVerifications", "useCaptures", "useVisitFindings"]
    .every((h) => new RegExp(`export (const|function) ${h}`).test(store)),
  ""
);

check(
  "an empty scope returns a stable reference",
  /const EMPTY_VISIT: VisitData = Object\.freeze\(/.test(store),
  "a fresh object per call would re-render forever"
);

check(
  "findings selectors are memoised",
  /useMemo\(\s*\n?\s*\(\) => all\.filter/.test(store),
  "filtering in a zustand selector returns a new array every call"
);

/* --------------------------------------- Part 4: nothing is hardcoded to one site */

check(
  "owners follow the entity",
  /export function responsibleFor\(entityCode: string\)/.test(store) &&
    !/"KSIA Electrical Engineer"/.test(store),
  "an action at Cape Town cannot be owned by the KSIA Electrical Engineer"
);

check(
  "the deprecated single-site VISITS constant is gone",
  !/export const VISITS/.test(store) && !/export const CURRENT_VISIT\b/.test(store),
  "it hardcoded site: KSIA on all six visits"
);

check(
  "an export names the audit it is of",
  /entity: string;\s*\n\s*visit: string;/.test(exports_) &&
    !/CURRENT_ENTITY/.test(exports_) &&
    !/CURRENT_VISIT_ID/.test(exports_),
  "a workbook produced at Cape Town must not be filenamed for King Shaka"
);

check(
  "the export filename takes the scope as arguments",
  /export function exportFilename\(\s*\n?\s*entityCode: string,\s*\n?\s*visitId: string,/.test(
    exports_
  ),
  ""
);

/* ------------------------------------------- Part 5: the scope is selectable */

check(
  "the shell offers an entity picker",
  /onChange=\{\(e\) => setEntity\(e\.target\.value\)\}/.test(appShell) &&
    /ENTITIES\.map/.test(appShell),
  "ten entities are no use if only one can be opened"
);

check(
  "the cycle strip selects the visit",
  /onClick=\{\(\) => setVisit\(v\.id\)\}/.test(appShell),
  "two visits a year, six in the cycle — each must be openable"
);

check(
  "the cycle strip shows only this entity's visits",
  /const visits = useVisits\(entityCode\);/.test(appShell),
  "useVisits merges the programme seeds with audits created in the app, for this entity only"
);

check(
  "switching entity lands on a visit that entity has",
  /const visits = mergeVisits\(s\.customVisits, code\)/.test(store) &&
    /keep \? s\.visit : \(fallback\?\.id \?\? s\.visit\)/.test(store),
  "carrying a visit id across entities would open a visit that does not exist"
);

/* --------------------------------------------- Part 6: nothing is lost on upgrade */

check(
  "v5 migrates rather than discards",
  /if \(from < 5\)/.test(store) && /st\.byVisit = \{/.test(store),
  ""
);

check(
  "pre-scope data is filed under the programme's own entity and visit",
  /const key = scopeKey\(CURRENT_ENTITY_CODE, CURRENT_VISIT_ID\);/.test(store) &&
    /responses: st\.responses \?\? \{\}/.test(store) &&
    /verifications: st\.verifications \?\? \{\}/.test(store) &&
    /captures: st\.captures \?\? \[\]/.test(store),
  "a tablet mid-audit at v4 captured at the entity the programme file named"
);

check(
  "pre-scope findings are stamped with an entity",
  /entity: f\.entity \?\? CURRENT_ENTITY_CODE/.test(store),
  "an unstamped finding would vanish from every scoped view"
);

check(
  "the persisted store key is still unchanged",
  /name: "acsa-assurance-v1"/.test(store),
  "renaming it orphans every in-flight capture on a tablet"
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nSCOPE OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
