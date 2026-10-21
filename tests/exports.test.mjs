/* The exported workbook — src/lib/exports.ts — for the four fields that were
 *  wired into store.ts, the UI and sharepoint.ts's portal sync (PR #163) but
 *  never reached the workbook: Response.fieldCompliance (the Inspection
 *  screen's own verdict) and Verification.evidenceRequested/discussionLog/
 *  evidencePending. Zero matches for any of the four names anywhere in
 *  exports.ts before this fix.
 *
 *  Real execution, not a source-regex: a column that EXISTS but reads the
 *  wrong field, or overwrites a sibling column, is a bug a text search for
 *  the field's name would call "fixed" while it is still wrong. These build
 *  the actual sheet via registerSheet()/closureSheet() — the functions the
 *  real export uses — and read the resulting cells back out, the same way
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
const sp = await import("../src/lib/sharepoint.ts");

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

/* ========================================================== Bug 2 ========
 *  Verification.evidenceRequested, Verification.discussionLog and
 *  Verification.evidencePending — all three confirmed by grep to have had
 *  zero matches in exports.ts. closureSheet() is the one sheet that reports
 *  a Verification record at all, so it is the one place that can carry
 *  them. Each is deliberately distinct from a similarly-named Response-level
 *  field — see their own doc comments in types.ts. */

const PRIOR = (over = {}) => ({
  portalId: "KSIA-ELE-P01",
  discipline: "Electrical",
  assetSystemRecorded: "AGL",
  assetSystem: null,
  tolerance: "Tolerable",
  observation: "Cable gland missing",
  ...over,
});

const BASE_CLOSURE = { ...BASE, checks: [], prior: [PRIOR()] };

check(
  "evidenceRequested, discussionLog and evidencePending ALL reach the Closure sheet, in their own columns",
  (() => {
    const log = [
      { at: 1_757_200_000_000, by: "Sarel", visit: "2026-09", outcome: null, note: "ACSA agreed an extension to November" },
    ];
    const x = {
      ...BASE_CLOSURE,
      verifications: {
        "KSIA-ELE-P01": {
          pf: "KSIA-ELE-P01",
          outcome: "Open - repeat",
          evidence: "Photo of the replaced gland",
          attachments: [],
          verifiedBy: "Sarel",
          verifiedAt: 1,
          /* leading/trailing space, to prove the column trims it */
          evidenceRequested: "  Updated maintenance certificate  ",
          evidencePending: true,
          discussionLog: log,
        },
      },
    };
    const sheet = ex.closureSheet(x);
    return (
      cellOf(sheet, 0, "Evidence requested") === "Updated maintenance certificate" &&
      cellOf(sheet, 0, "Evidence pending") !== "" &&
      /pending/i.test(String(cellOf(sheet, 0, "Evidence pending"))) &&
      /* THE DISCUSSION LOG MUST BE sharepoint.ts's OWN flattenProgress() OF
         THE RAW LOG — not a reimplementation that could drift from it. */
      cellOf(sheet, 0, "ACSA discussion log") === sp.flattenProgress(log) &&
      /ACSA agreed an extension to November/.test(cellOf(sheet, 0, "ACSA discussion log")) &&
      /* and the pre-existing columns are UNTOUCHED — the three new ones sit
         beside them, not instead of them */
      cellOf(sheet, 0, /^Verification/) === "Open - repeat" &&
      cellOf(sheet, 0, "Evidence of closure") === "Photo of the replaced gland"
    );
  })(),
  (() => {
    const log = [{ at: 1, by: "Sarel", visit: "2026-09", outcome: null, note: "x" }];
    const x = {
      ...BASE_CLOSURE,
      verifications: {
        "KSIA-ELE-P01": {
          pf: "KSIA-ELE-P01", outcome: "Open - repeat", evidence: "", attachments: [],
          verifiedBy: "Sarel", verifiedAt: 1,
          evidenceRequested: "  Updated maintenance certificate  ", evidencePending: true,
          discussionLog: log,
        },
      },
    };
    return JSON.stringify(ex.closureSheet(x).rows[0]);
  })()
);

check(
  "evidencePending is BLANK when not set — absent-means-false, same convention as every other optional flag in this workbook",
  (() => {
    const x = {
      ...BASE_CLOSURE,
      verifications: {
        "KSIA-ELE-P01": {
          pf: "KSIA-ELE-P01", outcome: "Closed", evidence: "", attachments: [],
          verifiedBy: "Sarel", verifiedAt: 1, action: "Done",
        },
      },
    };
    const sheet = ex.closureSheet(x);
    return (
      cellOf(sheet, 0, "Evidence pending") === "" &&
      cellOf(sheet, 0, "Evidence requested") === "" &&
      cellOf(sheet, 0, "ACSA discussion log") === "" &&
      cellOf(sheet, 0, "Remediation action") === "Done"
    );
  })()
);

/* ========================================================== Bug 3 ========
 *  Verification.attachments — the photographs an auditor attaches directly
 *  on the Follow-up/Closure screen (PR #148) — never reached the exported
 *  workbook at all. closureSheet() had no photo count/caption columns for
 *  them (unlike the Findings/Hazard sheets, which already carry
 *  "Photographs"/"Photograph files"/"Photograph captions" for their OWN
 *  attachments), and photographsSheet() enumerated only x.responses and
 *  x.adhoc — never x.verifications. */

check(
  "a verification's photographs get their own Photographs/files/captions columns on the Closure sheet",
  (() => {
    const x = {
      ...BASE_CLOSURE,
      verifications: {
        "KSIA-ELE-P01": {
          pf: "KSIA-ELE-P01",
          outcome: "Closed",
          evidence: "",
          verifiedBy: "Sarel",
          verifiedAt: 1,
          attachments: [
            { id: "v1", kind: "photo", name: "n1", ref: "KSIA-ELE-P01_P01", caption: "Replaced gland" },
            { id: "v2", kind: "photo", name: "n2", ref: "KSIA-ELE-P01_P02", caption: "" },
            /* A voice note on the same screen is not a photograph — see
               photosFor()'s own filter, which verificationPhotosFor() mirrors. */
            { id: "v3", kind: "voice", name: "n3" },
          ],
        },
      },
    };
    const sheet = ex.closureSheet(x);
    return (
      cellOf(sheet, 0, "Photographs") === 2 &&
      cellOf(sheet, 0, "Photograph files") === "KSIA-ELE-P01_P01.jpg · KSIA-ELE-P01_P02.jpg" &&
      cellOf(sheet, 0, "Photograph captions") === "Replaced gland · (no caption)"
    );
  })(),
  (() => {
    const x = {
      ...BASE_CLOSURE,
      verifications: {
        "KSIA-ELE-P01": {
          pf: "KSIA-ELE-P01", outcome: "Closed", evidence: "", verifiedBy: "Sarel", verifiedAt: 1,
          attachments: [{ id: "v1", kind: "photo", name: "n1", ref: "KSIA-ELE-P01_P01", caption: "Replaced gland" }],
        },
      },
    };
    const sheet = ex.closureSheet(x);
    return JSON.stringify({
      count: cellOf(sheet, 0, "Photographs"),
      files: cellOf(sheet, 0, "Photograph files"),
      captions: cellOf(sheet, 0, "Photograph captions"),
    });
  })()
);

check(
  "a verification with no attachments gets a zero count, not a blank or a crash",
  (() => {
    const sheet = ex.closureSheet(BASE_CLOSURE);
    return (
      cellOf(sheet, 0, "Photographs") === 0 &&
      cellOf(sheet, 0, "Photograph files") === "" &&
      cellOf(sheet, 0, "Photograph captions") === ""
    );
  })()
);

check(
  "a verification's photograph is its OWN row on the consolidated Photographs sheet",
  (() => {
    const x = {
      ...BASE_CLOSURE,
      verifications: {
        "KSIA-ELE-P01": {
          pf: "KSIA-ELE-P01",
          outcome: "Closed",
          evidence: "",
          verifiedBy: "Sarel",
          verifiedAt: 1,
          attachments: [
            {
              id: "v1", kind: "photo", name: "n1", ref: "KSIA-ELE-P01_P01",
              caption: "Replaced gland", captionSource: "auditor", createdBy: "Sarel",
            },
            { id: "v2", kind: "voice", name: "n2" },
          ],
        },
      },
    };
    const sheet = ex.photographsSheet(x);
    return (
      sheet.rows.length === 1 &&
      cellOf(sheet, 0, "File") === "KSIA-ELE-P01_P01.jpg" &&
      cellOf(sheet, 0, "Check") === "KSIA-ELE-P01" &&
      cellOf(sheet, 0, "Discipline") === "Electrical" &&
      cellOf(sheet, 0, "Caption") === "Replaced gland" &&
      /Follow-up|Closure/.test(String(cellOf(sheet, 0, "Source")))
    );
  })(),
  "a voice note must not count as a photograph here either"
);

check(
  "a verification's photograph does not collide with a check-point's or a walk item's on the same sheet",
  (() => {
    const x = {
      ...BASE_CLOSURE,
      checks: [CHECK("KSIA-ELE-001")],
      responses: {
        "KSIA-ELE-001": RESP({
          checkId: "KSIA-ELE-001", compliance: "NC",
          attachments: [{ id: "r1", kind: "photo", name: "n", ref: "KSIA-ELE-001_P01" }],
        }),
      },
      adhoc: [{ id: "WALK-1", attachments: [{ id: "a1", kind: "photo", name: "n", ref: "WALK-1_P01" }] }],
      verifications: {
        "KSIA-ELE-P01": {
          pf: "KSIA-ELE-P01", outcome: "Closed", evidence: "", verifiedBy: "Sarel", verifiedAt: 1,
          attachments: [{ id: "v1", kind: "photo", name: "n", ref: "KSIA-ELE-P01_P01" }],
        },
      },
    };
    const sheet = ex.photographsSheet(x);
    const files = sheet.rows.map((r) => r[sheet.columns.findIndex((c) => c.header === "File")]).sort();
    return files.length === 3 && files.join(",") === "KSIA-ELE-001_P01.jpg,KSIA-ELE-P01_P01.jpg,WALK-1_P01.jpg";
  })()
);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
