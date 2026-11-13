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
  fieldObservation: "",
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

/* ========================================================== Bug 5 ========
 *  Response.fieldObservation — the Inspection screen's OWN note (its own
 *  textarea, on the walk) — distinct from Response.observation (the Checks
 *  screen's own write-up). Found the same day, by the same standing review,
 *  as the sync.ts cross-device gap: before fieldObservation existed, the
 *  walk's note box read and wrote `observation` directly, so the two notes
 *  were one and the same text in the workbook too — this pins them apart
 *  here the same way Bug 1 above pins fieldCompliance apart from Status. */

check(
  "Response.fieldObservation has its OWN column in the Register sheet, independent of Observation",
  (() => {
    const x = {
      ...BASE,
      responses: {
        "KSIA-ELE-001": RESP({
          checkId: "KSIA-ELE-001",
          compliance: "C",
          observation: "Fine on the desk",
          fieldObservation: "Fine on the walk",
        }),
      },
    };
    const sheet = ex.registerSheet(x);
    return (
      cellOf(sheet, 0, "Observation").includes("Fine on the desk") &&
      cellOf(sheet, 0, "Field observation") === "Fine on the walk" &&
      !cellOf(sheet, 0, "Field observation").includes("Fine on the desk") &&
      !cellOf(sheet, 0, "Observation").includes("Fine on the walk")
    );
  })(),
  (() => {
    const x = {
      ...BASE,
      responses: {
        "KSIA-ELE-001": RESP({
          checkId: "KSIA-ELE-001",
          compliance: "C",
          observation: "Fine on the desk",
          fieldObservation: "Fine on the walk",
        }),
      },
    };
    const sheet = ex.registerSheet(x);
    return JSON.stringify(sheet.rows[0]);
  })()
);

check(
  "a check with no fieldObservation typed yet renders BLANK, not a copy of Observation",
  (() => {
    const x = {
      ...BASE,
      responses: {
        "KSIA-ELE-001": RESP({ checkId: "KSIA-ELE-001", compliance: "C", observation: "Fine" }),
      },
    };
    const sheet = ex.registerSheet(x);
    return cellOf(sheet, 0, "Field observation") === "" && cellOf(sheet, 0, "Observation") === "Fine";
  })(),
  "a regression check: the two notes must never be folded into one on the way into the workbook either"
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

/* ---- EvidenceItem.attachments reaches the Photographs sheet — same cycle,
   same bug class as the Closure sheet's own fields (see this file's own
   header comment): captured correctly, shown correctly on the Evidence
   screen, never reaching the workbook's one consolidated photo sheet. ---- */

check(
  "a chain-of-custody document's own photograph is its OWN row on the consolidated Photographs sheet",
  (() => {
    const x = {
      ...BASE_CLOSURE,
      evidenceItems: [
        {
          id: "DOC-1", entity: "FALE", originVisit: "2026-09",
          title: "Maintenance log book", documentNo: "", revision: "", documentDate: null,
          requestedAt: null, requestedFrom: "", receivedAt: null, receivedFrom: "", receivedBy: "",
          medium: null, isOriginal: false, returnedAt: null, returnedTo: "",
          unavailableAt: null, unavailableReason: "", checkIds: [], notes: "",
          createdAt: 1, updatedAt: 1, signature: null,
          attachments: [
            { id: "e1", kind: "photo", name: "n1", ref: "DOC-1_P01", caption: "the logbook cover", createdBy: "Sarel" },
            { id: "e2", kind: "voice", name: "n2" },
          ],
        },
      ],
    };
    const sheet = ex.photographsSheet(x);
    return (
      sheet.rows.length === 1 &&
      cellOf(sheet, 0, "File") === "DOC-1_P01.jpg" &&
      cellOf(sheet, 0, "Check") === "DOC-1" &&
      cellOf(sheet, 0, "Caption") === "the logbook cover" &&
      /Evidence log|TK-003/.test(String(cellOf(sheet, 0, "Source")))
    );
  })(),
  "a voice note must not count as a photograph here either; with no checkIds this falls back to the document's own id"
);

check(
  "and a document naming exactly one check carries that check's portal id on this sheet too",
  (() => {
    const x = {
      ...BASE_CLOSURE,
      evidenceItems: [
        {
          id: "DOC-1", entity: "FALE", originVisit: "2026-09",
          title: "t", documentNo: "", revision: "", documentDate: null,
          requestedAt: null, requestedFrom: "", receivedAt: null, receivedFrom: "", receivedBy: "",
          medium: null, isOriginal: false, returnedAt: null, returnedTo: "",
          unavailableAt: null, unavailableReason: "", checkIds: ["KSIA-ELE-001"], notes: "",
          createdAt: 1, updatedAt: 1, signature: null,
          attachments: [{ id: "e1", kind: "photo", name: "n1", ref: "DOC-1_P01" }],
        },
      ],
    };
    const sheet = ex.photographsSheet(x);
    return cellOf(sheet, 0, "Check") === "KSIA-ELE-001";
  })()
);

/* ========================================================== Bug 3 ========
 *  Chandre Smit, reading the Electrical report, 31 October 2026: a
 *  walkabout photograph never showed Non-compliant, even where the caption
 *  plainly said so — the Photographs sheet carried no Compliance column at
 *  all, and a walk item promoted to a finding without its own three-way
 *  outcome ever tapped synced blank everywhere, SharePoint included (see
 *  sharepoint.ts's effectiveWalkOutcome()). Real execution against
 *  photographsSheet()/walkSheet(), same reason as every other check in this
 *  file — a column that exists but reads the wrong field is a bug a text
 *  search for "Compliance" would call fixed while it is still wrong. */

check(
  "the Photographs sheet has its own Compliance column, from the check's own r.compliance",
  (() => {
    const x = {
      ...BASE,
      responses: { "KSIA-ELE-001": RESP({ checkId: "KSIA-ELE-001", compliance: "NC",
        attachments: [{ id: "r1", kind: "photo", name: "n", ref: "KSIA-ELE-001_P01" }] }) },
    };
    const sheet = ex.photographsSheet(x);
    return cellOf(sheet, 0, "Compliance") === "Non-compliant";
  })()
);

check(
  "a walk item's own explicit outcome reaches its photograph's Compliance column",
  (() => {
    const x = {
      ...BASE, checks: [], responses: {},
      adhoc: [{ id: "WALK-1", outcome: "C", findingId: null,
        attachments: [{ id: "a1", kind: "photo", name: "n", ref: "WALK-1_P01" }] }],
    };
    const sheet = ex.photographsSheet(x);
    return cellOf(sheet, 0, "Compliance") === "Compliant";
  })()
);

check(
  "A WALK ITEM PROMOTED TO A FINDING READS NON-COMPLIANT even with no outcome ever tapped",
  (() => {
    const x = {
      ...BASE, checks: [], responses: {},
      adhoc: [{ id: "WALK-1", outcome: null, findingId: "F-AAAAA",
        attachments: [{ id: "a1", kind: "photo", name: "n", ref: "WALK-1_P01" }] }],
    };
    const sheet = ex.photographsSheet(x);
    return cellOf(sheet, 0, "Compliance") === "Non-compliant";
  })(),
  "raiseFindingFromAdhoc never required the outcome control to be tapped first — a raised finding IS a non-compliance regardless"
);

check(
  "and the same item's row on the Walk sheet itself reads Non-compliant, not blank",
  (() => {
    const x = {
      ...BASE, checks: [], responses: {},
      adhoc: [{ id: "WALK-1", origin: "field", description: "d", discipline: null, system: null,
        area: "", outcome: null, note: "", attachments: [], findingId: "F-AAAAA",
        createdAt: 1, createdBy: "Sarel" }],
    };
    const sheet = ex.walkSheet(x);
    return cellOf(sheet, 0, "Outcome") === "Non-compliant";
  })()
);

check(
  "an item with neither an outcome nor a finding stays genuinely blank — unanswered is still a real state",
  (() => {
    const x = {
      ...BASE, checks: [], responses: {},
      adhoc: [{ id: "WALK-1", outcome: null, findingId: null,
        attachments: [{ id: "a1", kind: "photo", name: "n", ref: "WALK-1_P01" }] }],
    };
    const sheet = ex.photographsSheet(x);
    return cellOf(sheet, 0, "Compliance") === "";
  })()
);

check(
  "a Verification's and an evidence-log document's photographs stay blank — neither carries a Compliance verdict",
  (() => {
    const x = {
      ...BASE_CLOSURE,
      verifications: {
        "KSIA-ELE-P01": { pf: "KSIA-ELE-P01", outcome: "Closed", evidence: "", verifiedBy: "Sarel", verifiedAt: 1,
          attachments: [{ id: "v1", kind: "photo", name: "n", ref: "KSIA-ELE-P01_P01" }] },
      },
      evidenceItems: [{
        id: "DOC-1", entity: "FALE", originVisit: "2026-09", title: "t", documentNo: "", revision: "",
        documentDate: null, requestedAt: null, requestedFrom: "", receivedAt: null, receivedFrom: "",
        receivedBy: "", medium: null, isOriginal: false, returnedAt: null, returnedTo: "",
        unavailableAt: null, unavailableReason: "", checkIds: [], notes: "", createdAt: 1, updatedAt: 1,
        signature: null, attachments: [{ id: "e1", kind: "photo", name: "n", ref: "DOC-1_P01" }],
      }],
    };
    const sheet = ex.photographsSheet(x);
    return sheet.rows.length === 2 && sheet.rows.every((_, i) => cellOf(sheet, i, "Compliance") === "");
  })()
);

/* ---- AN UNCAPTIONED PHOTO CARRIES ITS OWN RECORD'S DESCRIPTION — same
 *  fallback as sharepoint.ts's evidenceValues() (see tests/sharepoint.test.mjs's
 *  own block on this), ported here because exports.ts had drifted: it kept
 *  reading "NO CAPTION" for the identical photo after sharepoint.ts started
 *  carrying the finding/walk item's own description across. Only kicks in
 *  when nobody captioned the photo itself. ------------------------------ */

check(
  "a finding's own uncaptioned photo carries the finding's own description as its Caption, source marked as carried across",
  (() => {
    const x = {
      ...BASE,
      checks: [],
      responses: {},
      findings: [{
        id: "F-LDA3G", entity: "FALE", checkId: null, discipline: "Electrical", system: "AGL",
        title: "Seen on the walk", description: "Corrosion on the mounting bracket",
        attachments: [{ id: "fa1", kind: "photo", name: "n", ref: "F-LDA3G_P01" }],
      }],
    };
    const sheet = ex.photographsSheet(x);
    return (
      cellOf(sheet, 0, "Caption") === "Corrosion on the mounting bracket" &&
      /Carried from the record's own description/.test(String(cellOf(sheet, 0, "Caption source")))
    );
  })()
);

check(
  "a caption someone actually typed on the finding's photo always wins over the finding's own description",
  (() => {
    const x = {
      ...BASE,
      checks: [],
      responses: {},
      findings: [{
        id: "F-LDA3G", entity: "FALE", checkId: null, discipline: "Electrical", system: "AGL",
        title: "t", description: "Corrosion on the mounting bracket",
        attachments: [{
          id: "fa1", kind: "photo", name: "n", ref: "F-LDA3G_P01",
          caption: "Close-up of the crack", captionSource: "auditor",
        }],
      }],
    };
    const sheet = ex.photographsSheet(x);
    return cellOf(sheet, 0, "Caption") === "Close-up of the crack" && cellOf(sheet, 0, "Caption source") === "Auditor";
  })()
);

check(
  "a walk item's own uncaptioned photo carries ITS OWN description the same way",
  (() => {
    const x = {
      ...BASE, checks: [], responses: {},
      adhoc: [{
        id: "WALK-ZZZ99", findingId: null, description: "Door sensor not resetting",
        attachments: [{ id: "wz1", kind: "photo", name: "n", ref: "WALK-ZZZ99_P01" }],
      }],
    };
    const sheet = ex.photographsSheet(x);
    return (
      cellOf(sheet, 0, "Caption") === "Door sensor not resetting" &&
      /Carried from the record's own description/.test(String(cellOf(sheet, 0, "Caption source")))
    );
  })()
);

check(
  "a register check-point's uncaptioned photo is UNCHANGED — no fallback invented for it",
  (() => {
    const x = {
      ...BASE,
      responses: { "KSIA-ELE-001": RESP({
        checkId: "KSIA-ELE-001", compliance: "NC", observation: "Busbar corroded",
        attachments: [{ id: "a1", kind: "photo", name: "n", ref: "KSIA-ELE-001_P01" }],
      }) },
    };
    const sheet = ex.photographsSheet(x);
    return cellOf(sheet, 0, "Caption") === "" && cellOf(sheet, 0, "Caption source") === "NO CAPTION";
  })(),
  "a check's own observation is a different field, read by a different column already — this fallback is scoped to findings and walk items only"
);

/* ---- A FINDING TAGGED OBSERVATION ON /review MUST NOT EXPORT AS NC -----
 *  Ported from tests/sharepoint.test.mjs's own block on this (found by the
 *  standing SharePoint sync-integrity review): this sheet hardcoded
 *  Non-compliant for every finding's own photo regardless of
 *  Finding.findingType. ----------------------------------------------- */

check(
  "a finding's own photo still reads Non-compliant when findingType is unset — the existing default is unchanged",
  (() => {
    const x = {
      ...BASE,
      checks: [],
      responses: {},
      findings: [{
        id: "F-OBS1", entity: "FALE", checkId: null, discipline: "Electrical", system: "AGL",
        title: "t", description: "d",
        attachments: [{ id: "fo1", kind: "photo", name: "n", ref: "F-OBS1_P01" }],
      }],
    };
    const sheet = ex.photographsSheet(x);
    return cellOf(sheet, 0, "Compliance") === "Non-compliant";
  })()
);

check(
  "a finding explicitly tagged findingType: \"observation\" exports Compliance blank, not Non-compliant",
  (() => {
    const x = {
      ...BASE,
      checks: [],
      responses: {},
      findings: [{
        id: "F-OBS2", entity: "FALE", checkId: null, discipline: "Electrical", system: "AGL",
        title: "t", description: "d", findingType: "observation",
        attachments: [{ id: "fo2", kind: "photo", name: "n", ref: "F-OBS2_P01" }],
      }],
    };
    const sheet = ex.photographsSheet(x);
    return cellOf(sheet, 0, "Compliance") === "";
  })(),
  "the bug this test guards: this column hardcoded Non-compliant for every finding's photo regardless of findingType"
);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
