import "@/lib/store";

/* EVERY FINDING COUNTS SOMEWHERE ON THE SUMMARY SHEET — Sarel: "when a
 *  finding is raised, it should... get pulled through to the report for the
 *  discipline as a non-compliance." Investigation found the mechanism
 *  already existed: exports.ts's summarySheet() counts every Finding into
 *  its discipline's own "Findings raised" column regardless of which screen
 *  raised it (the Raise tab, a check answered Non-compliant on Checks, or a
 *  walk item answered Non-compliant on Inspection all produce the same
 *  Finding shape). Sarel, after confirming that: "I just want to make sure
 *  that the same logic is also working similar to the inspections tab" —
 *  i.e. not only for the Raise tab.
 *
 *  THE ONE REAL GAP: `disciplines` used to come only from the register's own
 *  check-points, so a finding raised with no discipline attributed ("Not
 *  attributed" — offered identically on the Raise tab and on the
 *  Inspection screen's own discipline chips) had no row to count against on
 *  this sheet at all, from either screen. This suite runs the real
 *  summarySheet() — not a source-text match — and proves a finding raised
 *  either way, with or without a discipline, always lands in exactly one
 *  row. */

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const ex = await import("../src/lib/exports.ts");

const CHECK = (id, discipline, over = {}) => ({
  id,
  discipline,
  system: "AGL",
  assetClass: null,
  area: "Airside",
  requirement: "req",
  basis: null,
  evidenceExpected: null,
  target: null,
  vtype: null,
  question: null,
  walkabout: null,
  acsaDocs: [],
  acsaRequirement: "",
  acsaThreshold: "",
  acsaEvidence: [],
  acsaConflict: "",
  coverage: "covered",
  siteVariant: null,
  confirmedBy: null,
  inspect: null,
  complianceTest: null,
  basisConfidence: null,
  basisNote: null,
  ...over,
});

const FINDING = (id, discipline, over = {}) => ({
  id,
  checkId: null,
  entity: "FALE",
  discipline,
  system: "",
  area: "",
  title: "t",
  description: "d",
  issueIndex: null,
  severity: null,
  likelihood: null,
  ratingConfirmed: false,
  rootCause: "",
  actions: [],
  progress: [],
  actionStatus: "Open",
  originVisit: "2026-09",
  priorRating: null,
  adHoc: true,
  attachments: [],
  suggestedEvent: "",
  createdAt: Date.now(),
  createdBy: "Auditor",
  ...over,
});

const BASE = {
  entity: "FALE",
  visit: "2026-09",
  checks: [CHECK("KSIA-ELE-001", "Electrical")],
  responses: {},
  findings: [],
  prior: [],
  verifications: {},
  library: null,
};

const rowFor = (sheet, discipline) => {
  const col = sheet.columns.findIndex((c) => c.header === "Discipline");
  const findingsCol = sheet.columns.findIndex((c) => c.header === "Findings raised");
  const row = sheet.rows.find((r) => r[col] === discipline);
  return row ? row[findingsCol] : undefined;
};

/* ---- 1 · a finding raised with no discipline gets its own row ----------- */

check(
  "a finding raised with no discipline ('Not attributed' on either the Raise tab or Inspection's own chips) gets a 'Not attributed' row, not silence",
  (() => {
    const x = {
      ...BASE,
      findings: [FINDING("F-1", "")],
    };
    const sheet = ex.summarySheet(x);
    return rowFor(sheet, "Not attributed") === 1;
  })(),
  JSON.stringify(ex.summarySheet({ ...BASE, findings: [FINDING("F-1", "")] }).rows)
);

/* ---- 2 · a finding named with a discipline the register never uses still
   gets a row, not just the ones the 324 check-points happen to cover ------ */

check(
  "a finding tagged with a discipline the register's own check-points never use still gets a row",
  (() => {
    const x = {
      ...BASE,
      findings: [FINDING("F-2", "Energy & Demand Management")],
    };
    const sheet = ex.summarySheet(x);
    return rowFor(sheet, "Energy & Demand Management") === 1;
  })()
);

/* ---- 3 · a finding raised via the Inspection screen's own route (walk item
   answered Non-compliant → raiseFindingFromAdhoc) counts IDENTICALLY to one
   raised via the Raise tab — same Finding shape, same counting, no special
   case for either screen. adHoc: true on both; the only real difference
   between the two raise paths (checkId) does not change this sheet's own
   discipline count either way. ----------------------------------------- */

check(
  "a finding shaped like one raised from the Inspection screen's own NC-walk-item path counts the same as one from the Raise tab",
  (() => {
    const raiseTabShaped = FINDING("F-3", "Mechanical", { checkId: null, adHoc: true });
    const inspectionShaped = FINDING("F-4", "Mechanical", { checkId: null, adHoc: true, title: "Seen on the walk" });
    const sheet = ex.summarySheet({ ...BASE, findings: [raiseTabShaped, inspectionShaped] });
    return rowFor(sheet, "Mechanical") === 2;
  })()
);

/* ---- 4 · a discipline the register DOES cover keeps counting the findings
   it already did — this fix is additive, not a regression on the existing,
   working case --------------------------------------------------------- */

check(
  "a finding against a register discipline still counts there, same as before this fix",
  (() => {
    const x = {
      ...BASE,
      findings: [FINDING("F-5", "Electrical")],
    };
    const sheet = ex.summarySheet(x);
    return rowFor(sheet, "Electrical") === 1;
  })()
);

/* ---- 5 · nothing is counted twice — a finding with no discipline shows up
   in "Not attributed" only, never also folded into a register row -------- */

check(
  "a 'Not attributed' finding is not ALSO double-counted into any register discipline's own row",
  (() => {
    const x = {
      ...BASE,
      findings: [FINDING("F-6", "")],
    };
    const sheet = ex.summarySheet(x);
    return rowFor(sheet, "Electrical") === 0 && rowFor(sheet, "Not attributed") === 1;
  })()
);

console.log(
  failures === 0 ? "\nSUMMARY DISCIPLINE COVERAGE OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
