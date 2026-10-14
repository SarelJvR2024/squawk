import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* "IMPORT OBSERVATION PACK" AGAINST THE LIVE ORTIA ROUND'S OWN PACK —
 *  tests/fixtures/ORTIA_Observations_Import_Pack_v3_14Oct2026.xlsx, Adrian
 *  Barnes' six field notes (10–11 Oct 2026) and Sarel's own four (14 Oct
 *  2026), copied into the repo the same way the first observation pack
 *  (tests/fixtures/ORTIA_Observations_App_Entry_Pack_14Oct2026.xlsx,
 *  covered by tests/import-pack.test.mjs) already is.
 *
 *  This is the SAME parser/planner/writer (src/lib/importPack.ts) as that
 *  suite exercises — this pack only has a richer column shape ("Whose
 *  note", "Title", "From item", and "Findings drafts"/"Hazards drafts"
 *  sheet names rather than bare "Findings"/"Hazards") — so this suite does
 *  not re-prove every invariant import-pack.test.mjs already pins (undo,
 *  the blocked-with-no-scope path, an unmapped check id, origin defaulting
 *  for ACSA's OWN pack shape). It proves the things SPECIFIC to this pack
 *  and this task:
 *
 *    · exactly 10 ad-hoc items, 10 findings, 2 hazards, 35 check
 *      observations are created on import;
 *    · every rating field this import writes (severity/likelihood/outcome,
 *      on everything) is blank, and ratingConfirmed is false on every
 *      imported finding and hazard — never derived, never guessed;
 *    · each finding's "Hazard" column resolves to HD1, HD2 or literally
 *      "(none)" — never an invented or dangling reference;
 *    · running the import twice creates no duplicates, including the three
 *      Check ids this pack genuinely repeats from different field notes
 *      (BFM-004, CIV-052, CIV-053, …) — see the comment on the idempotency
 *      key fix in importPack.ts;
 *    · source wording survives verbatim: who raised each note (Sarel/
 *      Adrian Barnes), "Not evidenced; not yet verified", W7/FD7's ACSA-
 *      maintains/TPJV-audits wording, W10/FD10's maintenance-priority-only
 *      wording, and the HZ-/RC- template references, reported as plain,
 *      unverified text rather than invented links;
 *    · every BFM-/CIV-/PSR-/ELE-/MEC- check number this pack names resolves
 *      against FAOR's own register — the match/miss table this task asked
 *      for, pinned as a test rather than only reported in prose;
 *    · the persist key and migration version are untouched.
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

import { applyImportPlan, buildImportPlan, parseObservationPack, planCounts, undoImport } from "@/lib/importPack";
import { checksAt, useStore } from "@/lib/store";

/* ---------------------------------------------------- fixture + plumbing */

const FILE_NAME = "ORTIA_Observations_Import_Pack_v3_14Oct2026.xlsx";
const bytes = new Uint8Array(fs.readFileSync(path.join(root, "tests", "fixtures", FILE_NAME)));

const ENTITY = "FAOR";
const VISIT = "2026-09"; // the live FAOR round in src/data/programme.json
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

/* -------------------------------------------------- 1 · parsing the pack */

const pack = parseObservationPack(bytes, FILE_NAME);

check("parses exactly 10 ad-hoc item rows (W1–W10)", pack.adhoc.length === 10, String(pack.adhoc.length));
check("parses exactly 10 finding rows (FD1–FD10)", pack.findings.length === 10, String(pack.findings.length));
check("parses exactly 2 hazard rows (HD1, HD2)", pack.hazards.length === 2, String(pack.hazards.length));
check(
  "parses exactly 35 check-observation rows",
  pack.checkObservations.length === 35,
  String(pack.checkObservations.length)
);

/* "Findings drafts"/"Hazards drafts" — this pack's own sheet names — were
   actually found, not silently read as empty. */
check("the Findings sheet was found under its 'drafts' name", pack.findings.length > 0);
check("the Hazards sheet was found under its 'drafts' name", pack.hazards.length > 0);

/* "Whose note" and "Title" (Ad-hoc items), "From item" (Findings drafts,
   Check observations) — the columns this pack adds — are actually read. */
const w1 = pack.adhoc.find((a) => a.ref === "W1");
const w5 = pack.adhoc.find((a) => a.ref === "W5");
check('W1 is attributed to "Sarel" via Whose note', w1?.whoseNote === "Sarel", w1?.whoseNote);
check('W5 is attributed to "Adrian" via Whose note', w5?.whoseNote === "Adrian", w5?.whoseNote);
check("W1 carries its own Title", w1?.title === "Civil engineer-on-nights doing supervisor or technician work", w1?.title);

const fd1 = pack.findings.find((f) => f.ref === "FD1");
check('FD1\'s "From item" names W1', fd1?.fromItem === "W1", fd1?.fromItem);

const bfm004Rows = pack.checkObservations.filter((c) => c.checkCode === "BFM-004");
check("BFM-004 is named by three separate check-observation rows", bfm004Rows.length === 3, String(bfm004Rows.length));
check(
  "each of those three rows carries its own distinct From item",
  new Set(bfm004Rows.map((r) => r.fromItem)).size === 3,
  bfm004Rows.map((r) => r.fromItem).join(" | ")
);

/* ------------------------------------------- 2 · the check-number match */

/* The match/miss table this task asked for — pinned here rather than only
   reported in prose. Every BFM-/CIV-/PSR-/ELE-/MEC- code this pack names,
   across both the Findings' "Linked checks" column and the Check
   observations' own "Check" column, resolved against FAOR's register. */
const linkedCheckCodes = new Set();
for (const f of pack.findings) {
  if (!f.linkedChecks) continue;
  for (const c of f.linkedChecks.split(",").map((x) => x.trim())) {
    if (!/^[A-Z]+-\d+$/.test(c)) continue; // e.g. "(ad-hoc; no single check)" — not a code
    linkedCheckCodes.add(c);
  }
}
const checkObsCodes = new Set(pack.checkObservations.map((c) => c.checkCode));
const allCodes = new Set([...linkedCheckCodes, ...checkObsCodes]);
const registerIds = new Set(checks.map((c) => c.id));
const misses = [...allCodes].filter((code) => !registerIds.has(`KSIA-${code}`) && !registerIds.has(code));
check(
  "every short check number this pack names (Linked checks + Check observations) matches a FAOR register id",
  misses.length === 0,
  misses.join(", ")
);
check("the pack names at least 24 distinct check numbers across both columns", allCodes.size >= 24, String(allCodes.size));

/* ----------------------------------------- 3 · hazard reference resolves */

/* Every finding's own "Hazard" column resolves to HD1, HD2, or literally
   "(none)" — never an invented or dangling reference. */
const hazardRefs = { FD1: "HD1", FD2: "HD2", FD3: "HD2", FD4: "HD2" };
for (const [ref, expected] of Object.entries(hazardRefs)) {
  const row = pack.findings.find((f) => f.ref === ref);
  check(`${ref}'s Hazard column resolves to ${expected}`, row?.hazardRef === expected, row?.hazardRef);
}
for (const ref of ["FD5", "FD6", "FD7", "FD8", "FD9", "FD10"]) {
  const row = pack.findings.find((f) => f.ref === ref);
  check(`${ref}'s Hazard column resolves to "(none)"`, row?.hazardRef === null, String(row?.hazardRef));
}

const plan0 = buildImportPlan(pack, bytes, baseCtx);
check(
  "nothing in the plan reports a dangling Hazard reference",
  plan0.findings.every((f) => !f.hazardRefDangling)
);
check(
  "every finding's resolved hazard reference is HD1, HD2 or \"(none)\" — never anything else",
  plan0.findings.every((f) => {
    const r = f.row.hazardRef;
    return r === "HD1" || r === "HD2" || r === null;
  })
);

/* ------------------------------------------ 4 · source wording, verbatim */

const adrianRefs = ["W5", "W6", "W7", "W8", "W9", "W10"];
check(
  '"Not evidenced; not yet verified" is in every one of Adrian\'s own ad-hoc notes, verbatim',
  adrianRefs.every((ref) => pack.adhoc.find((a) => a.ref === ref)?.note.includes("Not evidenced; not yet verified"))
);
const adrianFindingRefs = ["FD5", "FD6", "FD7", "FD8", "FD9", "FD10"];
check(
  '"Not evidenced; not yet verified" is in every one of Adrian\'s findings\' descriptions, verbatim',
  adrianFindingRefs.every((ref) =>
    pack.findings.find((f) => f.ref === ref)?.description.includes("Not evidenced; not yet verified")
  )
);

const w7 = pack.adhoc.find((a) => a.ref === "W7");
check(
  "W7 keeps the exact ACSA-maintains / TPJV-audits-and-does-not-run wording",
  w7?.description.includes("ACSA should maintain it (Sarel, 14 Oct); TPJV audits it and does not run it.")
);
const fd7 = pack.findings.find((f) => f.ref === "FD7");
check(
  "FD7's mitigation says TPJV audits the CoC record, not that it runs it",
  fd7?.mitigation.includes("TPJV audits it.") && !/TPJV (runs|owns|maintains)/.test(fd7?.mitigation ?? "")
);

const fd10 = pack.findings.find((f) => f.ref === "FD10");
check(
  "FD10's mitigation explicitly rules out B170 001M/ERM conversion, verbatim",
  fd10?.mitigation.includes(
    "Use it for maintenance priority only; do not convert it into B170 001M or ERM ratings."
  )
);

/* --------------------------------------------- 5 · building the plan */

useStore.setState({
  entity: ENTITY,
  visit: VISIT,
  auditor: "Test Auditor",
  byVisit: {},
  findings: [],
  hazards: [],
});

const ctx1 = {
  ...baseCtx,
  existingAdhoc: useStore.getState().visitData().adhoc ?? [],
  responses: useStore.getState().visitData().responses,
};
const plan1 = buildImportPlan(pack, bytes, ctx1);
check("a freshly built plan is not blocked", plan1.blockedReason === null);

const counts1 = planCounts(plan1);
check("plan: 10 ad-hoc rows to write on a first import", counts1.adhoc.toWrite === 10, String(counts1.adhoc.toWrite));
check("plan: 10 finding rows to write on a first import", counts1.findings.toWrite === 10, String(counts1.findings.toWrite));
check("plan: 2 hazard rows to write on a first import", counts1.hazards.toWrite === 2, String(counts1.hazards.toWrite));
check(
  "plan: all 35 check-observation rows resolve and are due to write — every Check id this pack names exists in FAOR's register",
  counts1.checkObservations.toWrite === 35 && counts1.checkObservations.unmapped === 0,
  `toWrite=${counts1.checkObservations.toWrite} unmapped=${counts1.checkObservations.unmapped}`
);

/* Every check-observation row — including the duplicated Check codes — got
   its OWN distinct importKey, not a shared one (see the fix's own comment
   in importPack.ts). */
const keysByCheck = plan1.checkObservations.map((c) => c.importKey);
check(
  "all 35 check-observation rows have distinct import keys, including the repeated Check codes",
  new Set(keysByCheck).size === 35,
  String(new Set(keysByCheck).size)
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
check("confirm writes exactly 10 ad-hoc items", result1.adhocWritten === 10, String(result1.adhocWritten));
check("confirm writes exactly 10 findings", result1.findingsWritten === 10, String(result1.findingsWritten));
check("confirm writes exactly 2 hazards", result1.hazardsWritten === 2, String(result1.hazardsWritten));
check(
  "confirm appends exactly 35 check notes",
  result1.checkObservationsWritten === 35,
  String(result1.checkObservationsWritten)
);

const adhocNow = () => useStore.getState().visitData().adhoc ?? [];
const findingsNow = () => useStore.getState().findings.filter((f) => f.entity === ENTITY && f.originVisit === VISIT);
const hazardsNow = () => useStore.getState().hazards.filter((h) => h.entity === ENTITY && h.originVisit === VISIT);

check("the store now holds exactly 10 ad-hoc items", adhocNow().length === 10, String(adhocNow().length));
check("the store now holds exactly 10 findings", findingsNow().length === 10, String(findingsNow().length));
check("the store now holds exactly 2 hazards", hazardsNow().length === 2, String(hazardsNow().length));

/* The check BFM-004 was written to now carries all three appended blocks. */
const bfm004Response = () => useStore.getState().response("KSIA-BFM-004");
check(
  "KSIA-BFM-004's note carries all three of this file's appended observations",
  (bfm004Response().observation.match(/Imported, TPJV-proposed/g) ?? []).length === 3,
  bfm004Response().observation
);

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
check("no imported ad-hoc item carries a set outcome", adhocNow().every((a) => a.outcome === null));
check(
  "every written record carries this file's import key — the app's own provenance marker for this record family",
  adhocNow().every((a) => !!a.importKey) &&
    findingsNow().every((f) => !!f.importKey) &&
    hazardsNow().every((h) => !!h.importKey)
);
check(
  'every imported ad-hoc item resolves to the app\'s own "tpjv" origin (both Sarel and Adrian Barnes are TPJV\'s own auditors)',
  adhocNow().every((a) => a.origin === "tpjv")
);
check(
  'every imported hazard uses the app\'s own "tpjv" origin',
  hazardsNow().every((h) => h.origin === "tpjv")
);

/* Specifically: FD10's own finding, and the W10 ad-hoc item, never touch any
   rating path at all — the insurer note is maintenance-priority-only. */
const w10Item = adhocNow().find((a) => a.note.includes("ref W10"));
const fd10Finding = findingsNow().find((f) => f.description.includes("link its insurance risk assessment"));
check(
  "W10's ad-hoc item carries no outcome and no rating of any kind",
  !!w10Item && w10Item.outcome === null
);
check(
  "FD10's finding carries no severity/likelihood/ratingConfirmed and no ERM fields at all (Finding has none to set)",
  !!fd10Finding && fd10Finding.severity === null && fd10Finding.likelihood === null && fd10Finding.ratingConfirmed === false
);

/* -------------------------------------- 8 · attribution and title survive */

check(
  "W1's stored note says it was raised by Sarel, and carries its Title",
  !!w1 &&
    adhocNow().find((a) => a.importKey === plan1.adhoc.find((p) => p.row.ref === "W1").importKey)?.note.includes("Raised by Sarel.") &&
    adhocNow().find((a) => a.importKey === plan1.adhoc.find((p) => p.row.ref === "W1").importKey)?.note.includes("Title: Civil engineer-on-nights")
);
const w5Written = adhocNow().find((a) => a.importKey === plan1.adhoc.find((p) => p.row.ref === "W5").importKey);
check(
  "W5's stored note says it was raised by Adrian Barnes (spelled out, not the bare first name)",
  w5Written?.note.includes("Raised by Adrian Barnes.")
);
check(
  "W5's stored note still carries the sheet's own verbatim Note text, untouched, after the added attribution",
  w5Written?.note.includes("Not evidenced; not yet verified")
);

const fd1Written = findingsNow().find((f) => f.importKey === plan1.findings.find((p) => p.row.ref === "FD1").importKey);
check(
  "FD1's description carries the sheet's From item traceability line",
  fd1Written?.description.includes("From item: W1")
);

/* ---------------------------------------- 9 · hazard -> finding link, and the template references */

const hd1Plan = plan1.hazards.find((h) => h.row.ref === "HD1");
const hd1 = hazardsNow().find((h) => h.importKey === hd1Plan.importKey);
check(
  "HD1's one Finding ref (FD1) resolves to exactly the finding this import created for FD1",
  !!hd1 && hd1.findingIds.length === 1 && hd1.findingIds[0] === fd1Written.id
);
check(
  "HD1's note carries its own HZ-/RC- template references, verbatim, flagged as unverified",
  hd1.note.includes("HZ-43, HZ-41; RC-6, RC-9") && hd1.note.includes("not verified against template data")
);

const hd2Plan = plan1.hazards.find((h) => h.row.ref === "HD2");
const hd2 = hazardsNow().find((h) => h.importKey === hd2Plan.importKey);
check("HD2's three Finding refs (FD2, FD3, FD4) all resolve", !!hd2 && hd2.findingIds.length === 3);
check(
  "HD2's note carries its own HZ-/RC- template references, verbatim, flagged as unverified",
  hd2.note.includes("HZ-40, HZ-25, HZ-20; RC-7") && hd2.note.includes("not verified against template data")
);

/* Every HZ-/RC- id this pack names — reported, never invented or validated
   against anything, because this app holds no structured template data. */
const allTemplateText = `${hd1.note} ${hd2.note}`;
for (const id of ["HZ-20", "HZ-25", "HZ-40", "HZ-41", "HZ-43", "RC-6", "RC-7", "RC-9"]) {
  check(`template reference ${id} is carried through to the hazard's note`, allTemplateText.includes(id));
}

/* ------------------------------------------- 10 · idempotent re-import */

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
    counts2.adhoc.alreadyImported === 10 &&
    counts2.findings.toWrite === 0 &&
    counts2.findings.alreadyImported === 10 &&
    counts2.hazards.toWrite === 0 &&
    counts2.hazards.alreadyImported === 2 &&
    counts2.checkObservations.toWrite === 0 &&
    counts2.checkObservations.alreadyImported === 35,
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
  adhocNow().length === 10 && findingsNow().length === 10 && hazardsNow().length === 2
);
check(
  "KSIA-BFM-004's note still carries exactly three blocks — none duplicated on the idempotent re-import",
  (bfm004Response().observation.match(/Imported, TPJV-proposed/g) ?? []).length === 3
);

/* ------------------------------------------------------------- 11 · undo */

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
  "undo removes exactly 10 ad-hoc items, 10 findings and 2 hazards",
  undoResult.adhocRemoved === 10 && undoResult.findingsRemoved === 10 && undoResult.hazardsRemoved === 2,
  JSON.stringify(undoResult)
);
check(
  "undo strips the appended check-note block from every DISTINCT check this file wrote to (24 — 35 rows, 8 of them repeating a check already named)",
  undoResult.checkObservationsStripped === 24,
  String(undoResult.checkObservationsStripped)
);
check(
  "after undo, this entity/visit holds no ad-hoc item, finding or hazard from this import",
  adhocNow().filter((a) => fileKeys.has(a.importKey)).length === 0 &&
    findingsNow().filter((f) => fileKeys.has(f.importKey)).length === 0 &&
    hazardsNow().filter((h) => fileKeys.has(h.importKey)).length === 0
);
check("a manually captured ad-hoc item (no import key) survives the undo untouched", adhocNow().some((a) => a.id === manualId));
check("KSIA-BFM-004's note no longer carries any of this file's imported blocks", !bfm004Response().observation.includes("Imported, TPJV-proposed"));

/* --------------------------------------------- 12 · the hard invariants */

const storeSrc = fs.readFileSync(path.join(root, "src", "lib", "store.ts"), "utf8");
check('the persist key "acsa-assurance-v1" is unchanged', /name: "acsa-assurance-v1"/.test(storeSrc));
check("the migration version is unchanged — this import adds no new stored field", /version: 37,/.test(storeSrc));

console.log(failures === 0 ? "\nORTIA V3 PACK OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
