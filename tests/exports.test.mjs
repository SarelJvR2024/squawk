/* The exported workbook — src/lib/exports.ts — for Response.fieldCompliance,
 *  the Inspection screen's own verdict. It was wired into store.ts, the UI
 *  and sharepoint.ts's portal sync (PR #163) but never reached the workbook:
 *  zero matches for the name anywhere in exports.ts before this fix.
 *
 *  Real execution, not a source-regex: a column that EXISTS but reads the
 *  wrong field, or overwrites a sibling column, is a bug a text search for
 *  the field's name would call "fixed" while it is still wrong. This builds
 *  the actual sheet via registerSheet() — the function the real export uses
 *  — and reads the resulting cells back out, the same way
 *  tests/sharepoint.test.mjs runs buildPlan() rather than reading its
 *  source. */

/* RUN, not just read — needs the alias loader (see tests/alias.mjs and
   NEEDS_ALIAS in tests/suite-table.test.mjs):

     node --import ./tests/alias.mjs tests/exports.test.mjs

   store.ts is imported FIRST, deliberately — exports.ts (via ./programme)
   and store.ts both reach into the same ./programme cycle, and which one a
   test enters through decides which side of it resolves its top-level
   bindings first. Entering through exports.ts directly hits a genuine TDZ
   ReferenceError on CURRENT_ENTITY_CODE under Node's ESM loader; entering
   through store.ts first does not. See tests/carryforward.test.mjs's own
   note on the exact same ordering fix — Node resolves a cycle differently
   from webpack (the app has shipped on this for months with no issue), so
   this is a test-harness ordering fix, not a production bug. */
import "@/lib/store";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const ex = await import("../src/lib/exports.ts");

/** A cell by column HEADER, not position — so a column rename or reorder
 *  fails this test loudly instead of silently comparing against the wrong
 *  index. `header` may be a string (exact match) or a RegExp, for the one
 *  column (`Status (<visit label>)`) whose header carries the visit. */
const cellOf = (sheet, rowIndex, header) => {
  const col = sheet.columns.findIndex((c) =>
    header instanceof RegExp ? header.test(c.header) : c.header === header
  );
  if (col < 0) {
    throw new Error(
      `no column headed "${header}" in "${sheet.name}" (have: ${sheet.columns.map((c) => c.header).join(", ")})`
    );
  }
  const row = sheet.rows[rowIndex];
  if (!row) throw new Error(`no row ${rowIndex} in "${sheet.name}" (${sheet.rows.length} rows)`);
  return row[col];
};

const CHECK = (id, over = {}) => ({
  id,
  discipline: "Electrical",
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

const RESP = (over = {}) => ({
  checkId: "x",
  compliance: null,
  fieldCompliance: null,
  evidenceStatus: null,
  evidenceStatusNote: "",
  evidencePendingNote: "",
  evidenceProves: "",
  evidenceVerdict: null,
  siteInspection: null,
  combinedComment: "",
  combinedCommentAt: null,
  observation: "",
  evidencePicked: [],
  issuesPicked: [],
  walkaboutPicked: null,
  attachments: [],
  captured: false,
  capturedBy: "",
  capturedAt: null,
  deskDoneBy: "",
  deskDoneAt: null,
  fieldDoneBy: "",
  fieldDoneAt: null,
  flaggedForField: false,
  ...over,
});

const BASE = {
  entity: "FALE",
  visit: "2026-09",
  checks: [CHECK("KSIA-ELE-001")],
  responses: {},
  findings: [],
  prior: [],
  verifications: {},
  library: null,
};

/* ========================================================== Bug 1 ========
 *  Response.fieldCompliance — the Inspection screen's OWN, separate verdict
 *  (OutcomeControl, on the walk) — distinct from Response.compliance (the
 *  Checks screen's verdict, set on Capture). See the field's own doc comment
 *  in types.ts: the two must never be folded into or mistaken for one
 *  another, in the workbook same as everywhere else. */

check(
  "Response.fieldCompliance has its OWN column in the Register sheet, independent of Status",
  (() => {
    const x = {
      ...BASE,
      responses: {
        "KSIA-ELE-001": RESP({ checkId: "KSIA-ELE-001", compliance: "C", fieldCompliance: "NC" }),
      },
    };
    const sheet = ex.registerSheet(x);
    return (
      cellOf(sheet, 0, /^Status/) === "Compliant" &&
      cellOf(sheet, 0, "Field compliance") === "Non-compliant"
    );
  })(),
  (() => {
    const x = {
      ...BASE,
      responses: {
        "KSIA-ELE-001": RESP({ checkId: "KSIA-ELE-001", compliance: "C", fieldCompliance: "NC" }),
      },
    };
    const sheet = ex.registerSheet(x);
    return JSON.stringify(sheet.rows[0]);
  })()
);

check(
  "a check with no fieldCompliance answered yet renders BLANK, not a copy of Status",
  (() => {
    const x = {
      ...BASE,
      responses: {
        "KSIA-ELE-001": RESP({ checkId: "KSIA-ELE-001", compliance: "C", fieldCompliance: null }),
      },
    };
    const sheet = ex.registerSheet(x);
    return cellOf(sheet, 0, "Field compliance") === "" && cellOf(sheet, 0, /^Status/) === "Compliant";
  })(),
  "a regression check: the two fields must never be folded into one on the way into the workbook either"
);

check(
  "and a check nobody has even opened yet (no Response at all) does not crash the sheet",
  (() => {
    const sheet = ex.registerSheet({ ...BASE, responses: {} });
    return cellOf(sheet, 0, "Field compliance") === "" && cellOf(sheet, 0, /^Status/) === "";
  })()
);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
