import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* "IMPORT OBSERVATION PACK" — parsing, planning, writing and undoing, all
 *  against the real workbook this feature shipped against
 *  (tests/fixtures/ORTIA_Observations_App_Entry_Pack_14Oct2026.xlsx, copied
 *  into the repo the same way KSIA-register-review.xlsx already is, rather
 *  than read from a path outside it that would not exist for anyone else
 *  running this suite).
 *
 *  A real round trip, not a source-text stand-in — this suite imports
 *  src/lib/importPack.ts and src/lib/store.ts and runs them, the same
 *  reasoning sync-coverage.test.mjs and merge.test.mjs already give for
 *  doing that rather than asserting against the source as text. It needs the
 *  alias loader for that (see tests/run-all.sh and the NEEDS_ALIAS set in
 *  tests/suite-table.test.mjs).
 *
 *  THE INVARIANTS THIS PINS, each one load-bearing per the task this shipped
 *  against:
 *
 *    · selecting a file parses and plans — it writes nothing until Confirm;
 *    · Confirm writes exactly the rows the preview said it would;
 *    · nothing imported ever carries a severity, a likelihood, a
 *      ratingConfirmed:true, or a set outcome — the matrix and the
 *      compliance buttons are for a person, never for an import;
 *    · a second import of the SAME file writes nothing new and reports every
 *      row already imported, including the text appended to a check's note;
 *    · a Check id the current entity's register does not have is listed and
 *      skipped, not thrown;
 *    · "remove everything imported from this file" removes exactly the
 *      records and the appended text this file produced, and nothing a
 *      person captured by hand;
 *    · the persist key and the migration version are untouched by any of it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

import {
  applyImportPlan,
  buildImportPlan,
  computeImportKey,
  parseObservationPack,
  planCounts,
  undoImport,
} from "@/lib/importPack";
import { checksAt, useStore } from "@/lib/store";

/* ---------------------------------------------------- fixture + plumbing */

const FILE_NAME = "ORTIA_Observations_App_Entry_Pack_14Oct2026.xlsx";
const bytes = new Uint8Array(
  fs.readFileSync(path.join(root, "tests", "fixtures", FILE_NAME))
);

const ENTITY = "FAOR";
const VISIT = "2026-09";
const checks = checksAt(ENTITY);

const baseCtx = {
  entity: ENTITY,
  visit: VISIT,
  auditor: "Test Auditor",
  existingAdhoc: [],
  existingFindings: [],
  existingHazards: [],
  checks,
  responses: {},
};

/* ------------------------------------------- 1 · parsing the real workbook */

const pack = parseObservationPack(bytes, FILE_NAME);

check("parses exactly 4 ad-hoc item rows", pack.adhoc.length === 4, String(pack.adhoc.length));
check("parses exactly 4 finding rows", pack.findings.length === 4, String(pack.findings.length));
check("parses exactly 2 hazard rows", pack.hazards.length === 2, String(pack.hazards.length));
check(
  "parses exactly 8 check-observation rows",
  pack.checkObservations.length === 8,
  String(pack.checkObservations.length)
);

check(
  '"(none)" reads as null, not as literal text',
  pack.adhoc[0].system === null && pack.findings[1].system === null
);
check(
  '"(decide in the room)" reads as null, not as literal text',
  pack.adhoc[0].outcomeRaw === null
);
const fd3 = pack.findings.find((f) => f.ref === "FD3");
check(
  "a literal that is NOT one of the two blank markers is preserved as written",
  fd3?.linkedChecks === "(ad-hoc; no single check)",
  fd3?.linkedChecks
);
check(
  "a hazard's blank Systems column is an empty list, not a one-item list containing the marker",
  pack.hazards.find((h) => h.ref === "HD2")?.systems.length === 0
);

check(
  "a non-workbook file is refused rather than silently misread",
  (() => {
    try {
      parseObservationPack(new TextEncoder().encode("not a zip file"), "bad.xlsx");
      return false;
    } catch {
      return true;
    }
  })()
);

/* -------------------------------------------------------- 2 · the id key */

check(
  "computeImportKey is deterministic for the same file, sheet and ref",
  computeImportKey(bytes, "Ad-hoc items", "W1") === computeImportKey(bytes, "Ad-hoc items", "W1")
);
check(
  "computeImportKey differs by ref",
  computeImportKey(bytes, "Ad-hoc items", "W1") !== computeImportKey(bytes, "Ad-hoc items", "W2")
);
check(
  "computeImportKey differs by sheet, even for the same ref text",
  computeImportKey(bytes, "Ad-hoc items", "W1") !== computeImportKey(bytes, "Findings", "W1")
);
check(
  "computeImportKey differs when the file content differs by even one byte",
  computeImportKey(bytes, "Ad-hoc items", "W1") !==
    computeImportKey(new Uint8Array([...bytes, 0]), "Ad-hoc items", "W1")
);

/* --------------------------------------------- 3 · blocked with no scope */

const blockedPlan = buildImportPlan(pack, bytes, { ...baseCtx, entity: "", visit: "" });
check(
  "blocked, in words, when no entity/visit is currently selected",
  typeof blockedPlan.blockedReason === "string" && blockedPlan.blockedReason.length > 0
);
const blockedResult = applyImportPlan(blockedPlan, {
  addAdhoc: () => "x",
  addFinding: () => "x",
  addHazard: () => "x",
  getResponse: () => ({ observation: "" }),
  patchResponse: () => {},
  auditor: "Test Auditor",
  visit: VISIT,
});
check(
  "a blocked plan writes nothing even if applied",
  blockedResult.adhocWritten === 0 &&
    blockedResult.findingsWritten === 0 &&
    blockedResult.hazardsWritten === 0 &&
    blockedResult.checkObservationsWritten === 0
);

/* ---------------------------------------- 4 · origin defaulting (ad hoc) */

const originPack = (originRaw) => ({
  fileName: "synthetic.xlsx",
  adhoc: [
    {
      ref: "S1",
      originRaw,
      description: "synthetic row",
      discipline: null,
      system: null,
      area: "",
      outcomeRaw: null,
      note: "",
    },
  ],
  findings: [],
  hazards: [],
  checkObservations: [],
});
const synthBytes = new TextEncoder().encode("synthetic");
check(
  'a blank Origin defaults to "field"',
  buildImportPlan(originPack(null), synthBytes, { ...baseCtx }).adhoc[0].origin === "field"
);
check(
  'an unrecognised Origin value defaults to "field" rather than being invented into the vocabulary',
  buildImportPlan(originPack("site manager"), synthBytes, { ...baseCtx }).adhoc[0].origin === "field"
);
check(
  'a recognised Origin value ("acsa") is carried through as-is',
  buildImportPlan(originPack("acsa"), synthBytes, { ...baseCtx }).adhoc[0].origin === "acsa"
);

/* ------------------------------------------------- 5 · preview writes nothing */

useStore.setState({
  entity: ENTITY,
  visit: VISIT,
  auditor: "Test Auditor",
  byVisit: {},
  findings: [],
  hazards: [],
});

const beforeAdhoc = (useStore.getState().visitData().adhoc ?? []).length;
const beforeFindings = useStore.getState().findings.length;
const beforeHazards = useStore.getState().hazards.length;

const ctx1 = {
  ...baseCtx,
  existingAdhoc: useStore.getState().visitData().adhoc ?? [],
  responses: useStore.getState().visitData().responses,
};
const plan1 = buildImportPlan(pack, bytes, ctx1);
check("a freshly built plan is not blocked", plan1.blockedReason === null);

check(
  "parsing and planning alone — choosing the file — writes nothing to the store",
  (useStore.getState().visitData().adhoc ?? []).length === beforeAdhoc &&
    useStore.getState().findings.length === beforeFindings &&
    useStore.getState().hazards.length === beforeHazards
);

const counts1 = planCounts(plan1);
check("plan: 4 ad-hoc rows to write on a first import", counts1.adhoc.toWrite === 4, String(counts1.adhoc.toWrite));
check("plan: 4 finding rows to write on a first import", counts1.findings.toWrite === 4, String(counts1.findings.toWrite));
check("plan: 2 hazard rows to write on a first import", counts1.hazards.toWrite === 2, String(counts1.hazards.toWrite));
check(
  "plan: all 8 check-observation rows resolve and are due to write — every Check id this pack names exists in FAOR's register",
  counts1.checkObservations.toWrite === 8 && counts1.checkObservations.unmapped === 0,
  `toWrite=${counts1.checkObservations.toWrite} unmapped=${counts1.checkObservations.unmapped}`
);

/* ----------------------------------------------- 6 · confirm writes them */

const actions = {
  addAdhoc: useStore.getState().addAdhoc,
  addFinding: useStore.getState().addFinding,
  addHazard: useStore.getState().addHazard,
  getResponse: useStore.getState().response,
  patchResponse: useStore.getState().patch,
  auditor: "Test Auditor",
  visit: VISIT,
};

const result1 = applyImportPlan(plan1, actions);
check("confirm writes exactly 4 ad-hoc items", result1.adhocWritten === 4, String(result1.adhocWritten));
check("confirm writes exactly 4 findings", result1.findingsWritten === 4, String(result1.findingsWritten));
check("confirm writes exactly 2 hazards", result1.hazardsWritten === 2, String(result1.hazardsWritten));
check(
  "confirm appends exactly 8 check notes",
  result1.checkObservationsWritten === 8,
  String(result1.checkObservationsWritten)
);

const adhocNow = () => useStore.getState().visitData().adhoc ?? [];
const findingsNow = () =>
  useStore.getState().findings.filter((f) => f.entity === ENTITY && f.originVisit === VISIT);
const hazardsNow = () =>
  useStore.getState().hazards.filter((h) => h.entity === ENTITY && h.originVisit === VISIT);

check("the store now holds exactly 4 ad-hoc items", adhocNow().length === 4, String(adhocNow().length));
check("the store now holds exactly 4 findings", findingsNow().length === 4, String(findingsNow().length));
check("the store now holds exactly 2 hazards", hazardsNow().length === 2, String(hazardsNow().length));

/* ------------------------------------------- 7 · no rating, ever, anywhere */

check(
  "no imported finding carries a severity, a likelihood, or ratingConfirmed:true",
  findingsNow().every((f) => f.severity === null && f.likelihood === null && f.ratingConfirmed === false)
);
check(
  "no imported hazard carries a severity, a likelihood, or ratingConfirmed:true",
  hazardsNow().every((h) => h.severity === null && h.likelihood === null && h.ratingConfirmed === false)
);
check(
  "no imported hazard has an ERM rating set either",
  hazardsNow().every((h) => h.ermConsequence === null && h.ermLikelihood === null && h.ermConfirmed === false)
);
check(
  "no imported ad-hoc item carries a set outcome",
  adhocNow().every((a) => a.outcome === null)
);
check(
  "every written record carries this file's import key",
  adhocNow().every((a) => !!a.importKey) &&
    findingsNow().every((f) => !!f.importKey) &&
    hazardsNow().every((h) => !!h.importKey)
);
check(
  'every imported hazard uses the app\'s own "tpjv" origin',
  hazardsNow().every((h) => h.origin === "tpjv")
);

/* ---------------------------------------------- 8 · hazard -> finding link */

const fd1Plan = plan1.findings.find((f) => f.row.ref === "FD1");
const hd1Plan = plan1.hazards.find((h) => h.row.ref === "HD1");
const fd1 = findingsNow().find((f) => f.importKey === fd1Plan.importKey);
const hd1 = hazardsNow().find((h) => h.importKey === hd1Plan.importKey);
check(
  "HD1's one Finding ref (FD1) resolves to exactly the finding this import created for FD1",
  !!fd1 && !!hd1 && hd1.findingIds.length === 1 && hd1.findingIds[0] === fd1.id
);

const hd2Plan = plan1.hazards.find((h) => h.row.ref === "HD2");
const hd2 = hazardsNow().find((h) => h.importKey === hd2Plan.importKey);
check(
  "HD2's three Finding refs (FD2, FD3, FD4) all resolve",
  !!hd2 && hd2.findingIds.length === 3
);

/* ------------------------------------------ 9 · findings carry the sheet as-is */

check(
  "rootCause is carried through exactly as the sheet wrote it — nothing stripped, nothing added",
  fd1.rootCause === fd1Plan.row.rootCause
);
check(
  "the finding's description includes the sheet's Linked checks text as plain text, not a structured link",
  fd1.description.includes(`Linked checks: ${fd1Plan.row.linkedChecks}`)
);
check(
  "the finding's one mitigation action carries the sheet's text with no invented owner or due date",
  fd1.actions.length === 1 && fd1.actions[0].owner === "" && fd1.actions[0].dueDate === "" && fd1.actions[0].action === fd1Plan.row.mitigation
);
check(
  'the finding is adHoc, checkId-less, and defaults actionStatus to "Open" — the app\'s own default for a new finding',
  fd1.adHoc === true && fd1.checkId === null && fd1.actionStatus === "Open"
);

/* ---------------------------------------- 10 · check note appended, marked */

const bfmResponse = () => useStore.getState().response("KSIA-BFM-012");
check(
  "the check's note now contains the imported text, visibly marked Imported, TPJV-proposed",
  bfmResponse().observation.includes("Imported, TPJV-proposed")
);
check(
  "the check's compliance is untouched by the import",
  bfmResponse().compliance === null
);

/* ------------------------------------------- 11 · idempotent re-import */

const ctx2 = {
  entity: ENTITY,
  visit: VISIT,
  auditor: "Test Auditor",
  existingAdhoc: adhocNow(),
  existingFindings: findingsNow(),
  existingHazards: hazardsNow(),
  checks,
  responses: useStore.getState().visitData().responses,
};
const plan2 = buildImportPlan(pack, bytes, ctx2);
const counts2 = planCounts(plan2);
check(
  "second import of the identical file: every row already imported, nothing to write",
  counts2.adhoc.toWrite === 0 &&
    counts2.adhoc.alreadyImported === 4 &&
    counts2.findings.toWrite === 0 &&
    counts2.findings.alreadyImported === 4 &&
    counts2.hazards.toWrite === 0 &&
    counts2.hazards.alreadyImported === 2 &&
    counts2.checkObservations.toWrite === 0 &&
    counts2.checkObservations.alreadyImported === 8,
  JSON.stringify(counts2)
);

const result2 = applyImportPlan(plan2, actions);
check(
  "re-running the already-imported plan creates and appends nothing new",
  result2.adhocWritten === 0 &&
    result2.findingsWritten === 0 &&
    result2.hazardsWritten === 0 &&
    result2.checkObservationsWritten === 0
);
check(
  "store counts are unchanged after the idempotent second import",
  adhocNow().length === 4 && findingsNow().length === 4 && hazardsNow().length === 2
);
const bfmOccurrences = (bfmResponse().observation.match(/Imported, TPJV-proposed/g) ?? []).length;
check(
  "the check note was not appended a second time on the idempotent re-import",
  bfmOccurrences === 1,
  String(bfmOccurrences)
);

/* ------------------------------------------- 12 · unmapped check, skipped */

const unmappedPack = {
  fileName: "unmapped-test.xlsx",
  adhoc: [],
  findings: [],
  hazards: [],
  checkObservations: [
    { checkCode: "NOPE-999", discipline: "Electrical", observation: "a check that does not exist", askOrVerify: "" },
    { checkCode: "BFM-012", discipline: "Building & Facilities", observation: "a real one, different file", askOrVerify: "" },
  ],
};
const unmappedBytes = new TextEncoder().encode("a different file's bytes, for the unmapped test");
const unmappedPlan = buildImportPlan(unmappedPack, unmappedBytes, {
  ...baseCtx,
  responses: useStore.getState().visitData().responses,
});
check(
  "an unknown Check id is resolved to null (unmapped), not guessed at",
  unmappedPlan.checkObservations[0].resolvedCheckId === null
);
check(
  "a real Check id in the same pack still resolves correctly",
  unmappedPlan.checkObservations[1].resolvedCheckId === "KSIA-BFM-012"
);

let unmappedThrew = false;
let unmappedResult = null;
try {
  unmappedResult = applyImportPlan(unmappedPlan, actions);
} catch {
  unmappedThrew = true;
}
check("applying a plan with an unmapped check id does not throw", !unmappedThrew);
check(
  "the unmapped row is skipped and the mapped row in the same pack is still written",
  !!unmappedResult && unmappedResult.checkObservationsWritten === 1
);

/* -------------------------------------------------------------- 13 · undo */

/* A manually captured item, with no import key, must survive undo. */
const manualId = useStore.getState().addAdhoc({
  origin: "field",
  description: "A manually captured item, not from any import.",
  discipline: null,
  system: null,
  area: "Apron",
  outcome: null,
  note: "",
  attachments: [],
  findingId: null,
  createdBy: "Test Auditor",
});

const fileKeys = new Set([
  ...plan1.adhoc.map((r) => r.importKey),
  ...plan1.findings.map((r) => r.importKey),
  ...plan1.hazards.map((r) => r.importKey),
  ...plan1.checkObservations.map((r) => r.importKey),
]);

const undoActions = {
  removeAdhoc: useStore.getState().removeAdhoc,
  removeFinding: useStore.getState().removeFinding,
  removeHazard: useStore.getState().removeHazard,
  getResponse: useStore.getState().response,
  patchResponse: useStore.getState().patch,
};
const undoCtx = {
  adhoc: adhocNow(),
  findings: findingsNow(),
  hazards: hazardsNow(),
  checks,
  responses: useStore.getState().visitData().responses,
};
const undoResult = undoImport(fileKeys, undoCtx, undoActions);

check(
  "undo removes exactly 4 ad-hoc items, 4 findings and 2 hazards",
  undoResult.adhocRemoved === 4 && undoResult.findingsRemoved === 4 && undoResult.hazardsRemoved === 2,
  JSON.stringify(undoResult)
);
check(
  "undo strips the appended check-note block from every check this file wrote to (8)",
  undoResult.checkObservationsStripped === 8,
  String(undoResult.checkObservationsStripped)
);
check(
  "after undo, this entity/visit holds no ad-hoc item, finding or hazard from this import",
  adhocNow().filter((a) => fileKeys.has(a.importKey)).length === 0 &&
    findingsNow().filter((f) => fileKeys.has(f.importKey)).length === 0 &&
    hazardsNow().filter((h) => fileKeys.has(h.importKey)).length === 0
);
check(
  "a manually captured ad-hoc item (no import key) survives the undo untouched",
  adhocNow().some((a) => a.id === manualId)
);
check(
  "BFM-012's note no longer carries THIS file's imported block",
  !bfmResponse().observation.includes(FILE_NAME)
);
check(
  "BFM-012's note still carries the unrelated, differently-keyed append from the unmapped-check test — undo only touches this file's own key",
  bfmResponse().observation.includes("a real one, different file")
);

/* --------------------------------------------- 14 · the hard invariants */

const typesSrc = fs.readFileSync(path.join(root, "src", "lib", "types.ts"), "utf8");
const storeSrc = fs.readFileSync(path.join(root, "src", "lib", "store.ts"), "utf8");

check(
  "importKey is declared optional on AdHocItem, Finding and Hazard — absent means not imported, no migration owed",
  (typesSrc.match(/importKey\?: string;/g) ?? []).length === 3
);
check('the persist key "acsa-assurance-v1" is unchanged', /name: "acsa-assurance-v1"/.test(storeSrc));
check("the migration version is unchanged", /version: 37,/.test(storeSrc));
check(
  "removeFinding is a real store action, filtering by id the same way removeHazard already does — not a direct mutation from outside the store",
  /removeFinding: \(id\) =>\s*\n\s*set\(\(s\) => \(\{ findings: s\.findings\.filter\(\(f\) => f\.id !== id\) \}\)\)/.test(
    storeSrc
  )
);

console.log(failures === 0 ? "\nIMPORT PACK OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
