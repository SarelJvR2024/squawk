import type {
  AnswerLibrary,
  Check,
  Finding,
  PriorFinding,
  Response,
  Verification,
} from "./types";
import { BAND_AS_RATING, BAND_META, bandFor, cellCode, movement } from "./risk";
import { CURRENT_ENTITY, CURRENT_VISIT_ID, PROGRAMME_VISITS } from "./programme";
import type { Sheet } from "./xlsx";

/* The exports.
 *
 *  Two audiences. ACSA gets the register in the shape it already knows — the
 *  workbook Prince circulated — plus the findings and the closure position.
 *  TPJV gets the same thing as its own working record.
 *
 *  Two rules run through all of it:
 *
 *  1. A blank cell means "not captured", never "compliant". Where a status was
 *     not set the status column is empty and the row is still exported, because
 *     the gap is the point.
 *  2. Nothing is inferred. A suggested rating that the group never agreed is
 *     exported as a suggestion, in its own column, and the band columns stay
 *     empty — an export that quietly promoted a suggestion to a decision would
 *     be worse than no export at all.
 */

const VISIT_LABEL =
  PROGRAMME_VISITS.find((v) => v.id === CURRENT_VISIT_ID)?.label ?? CURRENT_VISIT_ID;

const STATUS_WORD: Record<string, string> = {
  C: "Compliant",
  NC: "Non-compliant",
  "N/A": "Not applicable",
  NV: "Not available",
};

const when = (ms: number | null | undefined) => (ms ? new Date(ms) : null);
const iso = (s: string) => (s ? new Date(`${s}T00:00:00`) : null);
const docs = (c: Check) =>
  c.acsaDocs.map((d) => `${d.doc}${d.clause ? ` cl. ${d.clause}` : ""}`).join("; ");

export interface ExportInput {
  checks: Check[];
  responses: Record<string, Response>;
  findings: Finding[];
  prior: PriorFinding[];
  verifications: Record<string, Verification>;
  /** Loaded lazily; when absent the evidence and issue labels fall back to indices. */
  library: Record<string, AnswerLibrary> | null;
}

/* ------------------------------------------------------------------ register */

/** One row per check-point, in the register's own shape, with the visit's capture
 *  alongside. This is the sheet that goes back to ACSA. */
export function registerSheet(x: ExportInput): Sheet {
  const rows = x.checks.map((c) => {
    const r = x.responses[c.id];
    const lib = x.library?.[c.id];
    const evidence = r?.evidencePicked
      .map((i) => lib?.EO[i]?.label ?? `#${i}`)
      .join("\n");
    const issues = r?.issuesPicked.map((i) => lib?.IO[i]?.finding ?? `#${i}`).join("\n");
    const walk =
      r?.walkaboutPicked !== null && r?.walkaboutPicked !== undefined
        ? (lib?.WO[r.walkaboutPicked]?.label ?? `#${r.walkaboutPicked}`)
        : "";
    const photos = r?.attachments.filter((a) => a.kind === "photo").length ?? 0;
    const voice = r?.attachments.filter((a) => a.kind === "voice").length ?? 0;

    return [
      c.id,
      c.discipline,
      c.system,
      c.area,
      c.assetClass,
      c.requirement,
      c.vtype ?? "",
      c.target,
      c.acsaThreshold || "ACSA states no threshold",
      docs(c),
      c.siteVariant ? `${c.siteVariant.site}: ${c.siteVariant.note}` : "",
      c.basis,
      c.basisConfidence === "medium" ? "cited at document level" : "",
      c.basisNote ?? "",
      c.acsaConflict,
      c.coverage,
      c.question,
      c.walkabout ?? "",
      c.pf ?? "",
      /* Capture starts here. */
      r?.compliance ? STATUS_WORD[r.compliance] : "",
      r?.observation ?? "",
      evidence ?? "",
      issues ?? "",
      walk,
      photos || "",
      voice || "",
      r?.captured ? "Yes" : "No",
      r?.capturedBy ?? "",
      when(r?.capturedAt),
    ];
  });

  return {
    name: "Register",
    columns: [
      { header: "Check", width: 15 },
      { header: "Discipline", width: 20 },
      { header: "Asset system", width: 26 },
      { header: "Area", width: 20 },
      { header: "Class", width: 10 },
      { header: "Requirement", width: 58, wrap: true },
      { header: "Verification type", width: 22, wrap: true },
      { header: "Target / limit", width: 58, wrap: true },
      { header: "ACSA states", width: 58, wrap: true },
      { header: "ACSA document & clause", width: 34, wrap: true },
      { header: `Site variant (${CURRENT_ENTITY.code})`, width: 46, wrap: true },
      { header: "External basis", width: 52, wrap: true },
      { header: "Citation confidence", width: 18, wrap: true },
      { header: "Caveat on the basis", width: 46, wrap: true },
      { header: "Document issue", width: 40, wrap: true },
      { header: "ACSA coverage", width: 13 },
      { header: "Question put to ACSA", width: 48, wrap: true },
      { header: "Walkabout instruction", width: 48, wrap: true },
      { header: "Mar 2025 finding", width: 14 },
      { header: `Status (${VISIT_LABEL})`, width: 16 },
      { header: "Observation", width: 60, wrap: true },
      { header: "Evidence requested", width: 42, wrap: true },
      { header: "Issues found", width: 52, wrap: true },
      { header: "Walkabout observation", width: 38, wrap: true },
      { header: "Photos", width: 8 },
      { header: "Voice notes", width: 11 },
      { header: "Captured", width: 10 },
      { header: "Captured by", width: 22 },
      { header: "Captured at", width: 13 },
    ],
    rows,
  };
}

/* ------------------------------------------------------------------ findings */

export function findingsSheet(x: ExportInput): Sheet {
  const rows = x.findings.map((f) => {
    const agreed = f.ratingConfirmed;
    const band = agreed ? bandFor(f.severity, f.likelihood) : null;
    const suggested = !agreed ? cellCode(f.severity, f.likelihood) : null;
    /* Movement compares like with like: the 2025 rating against this visit's
       band expressed in the same vocabulary. See BAND_AS_RATING. */
    const move =
      agreed && f.priorRating && band ? movement(f.priorRating, BAND_AS_RATING[band]) : null;
    return [
      f.id,
      f.checkId ?? "",
      f.discipline,
      f.system,
      f.area,
      f.title,
      f.description,
      /* Agreed rating: empty unless the group actually clicked the cell. */
      agreed ? f.severity : "",
      agreed ? f.likelihood : "",
      agreed ? cellCode(f.severity, f.likelihood) : "",
      band ?? "",
      band ? BAND_META[band].label : "",
      band ? BAND_META[band].strategy : "",
      /* And the suggestion, kept separate so nobody mistakes one for the other. */
      suggested ?? "",
      agreed ? "Agreed by the audit team" : "Suggested — not yet agreed",
      f.rootCause,
      f.action,
      f.owner,
      iso(f.dueDate),
      f.actionStatus,
      f.priorRating ?? "",
      move ?? "",
      f.adHoc ? "Ad-hoc (raised in the field)" : "From a check-point",
      f.originVisit,
      f.createdBy,
      when(f.createdAt),
    ];
  });

  return {
    name: "Findings",
    columns: [
      { header: "Finding", width: 12 },
      { header: "Check", width: 15 },
      { header: "Discipline", width: 20 },
      { header: "Asset system", width: 26 },
      { header: "Area", width: 20 },
      { header: "Title", width: 34, wrap: true },
      { header: "Finding as recorded", width: 62, wrap: true },
      { header: "Severity", width: 18 },
      { header: "Likelihood", width: 18 },
      { header: "Matrix cell", width: 11 },
      { header: "Band", width: 9 },
      { header: "Band meaning", width: 26 },
      { header: "Strategy (B170 001M)", width: 44, wrap: true },
      { header: "Suggested cell (not agreed)", width: 20 },
      { header: "Rating state", width: 26 },
      { header: "Root cause", width: 26 },
      { header: "Remediation action", width: 58, wrap: true },
      { header: "Owner", width: 30 },
      { header: "Due date", width: 12 },
      { header: "Action status", width: 15 },
      { header: "Mar 2025 rating", width: 15 },
      { header: "Movement", width: 13 },
      { header: "Origin", width: 26 },
      { header: "Raised at visit", width: 14 },
      { header: "Raised by", width: 22 },
      { header: "Raised on", width: 12 },
    ],
    rows,
  };
}

/* ------------------------------------------------------------------- closure */

export function closureSheet(x: ExportInput): Sheet {
  const rows = x.prior.map((p) => {
    const v = x.verifications[p.pf];
    const covering = x.checks.filter(
      (c) => c.discipline === p.discipline && c.system === p.system
    );
    const nc = covering.filter((c) => x.responses[c.id]?.compliance === "NC").length;
    return [
      p.pf,
      p.discipline,
      p.system,
      p.rating,
      p.finding,
      v?.outcome ?? "",
      v?.evidence ?? "",
      v?.verifiedBy ?? "",
      when(v?.verifiedAt),
      covering.length,
      covering.length ? covering.map((c) => c.id).join(", ") : "No check covers this",
      nc,
      /* The coverage guard, carried into the export: closure cannot be evidenced
         against a check that is not being done. */
      covering.length === 0 ? "NOT COVERED THIS VISIT" : "",
    ];
  });

  return {
    name: "Closure",
    columns: [
      { header: "Prior finding", width: 13 },
      { header: "Discipline", width: 20 },
      { header: "Asset system", width: 30 },
      { header: "Mar 2025 rating", width: 15 },
      { header: "Finding as raised in Mar 2025", width: 66, wrap: true },
      { header: `Verification (${VISIT_LABEL})`, width: 16 },
      { header: "Evidence of closure", width: 58, wrap: true },
      { header: "Verified by", width: 22 },
      { header: "Verified on", width: 12 },
      { header: "Checks covering it", width: 16 },
      { header: "Which checks", width: 40, wrap: true },
      { header: "Of those, non-compliant", width: 20 },
      { header: "Coverage guard", width: 22 },
    ],
    rows,
  };
}

/* ---------------------------------------------------------- evidence request */

/** One row per document asked for, which is what ACSA actually has to action.
 *  This is the list that leaves the room at the end of a workshop. */
export function evidenceRequestSheet(x: ExportInput): Sheet {
  const rows: (string | number | Date | null)[][] = [];
  for (const c of x.checks) {
    const r = x.responses[c.id];
    if (!r?.evidencePicked.length) continue;
    const lib = x.library?.[c.id];
    for (const i of r.evidencePicked) {
      const e = lib?.EO[i];
      rows.push([
        c.id,
        c.discipline,
        c.system,
        e?.label ?? `Evidence item #${i}`,
        e?.hint ?? "",
        docs(c),
        r.compliance === "NV" ? "Outstanding — not produced during the audit" : "Requested",
        r.capturedBy,
        when(r.capturedAt),
      ]);
    }
  }
  return {
    name: "Evidence request",
    columns: [
      { header: "Check", width: 15 },
      { header: "Discipline", width: 20 },
      { header: "Asset system", width: 26 },
      { header: "Record requested", width: 52, wrap: true },
      { header: "What makes it acceptable", width: 52, wrap: true },
      { header: "ACSA document & clause", width: 34, wrap: true },
      { header: "State", width: 40, wrap: true },
      { header: "Requested by", width: 22 },
      { header: "Requested on", width: 13 },
    ],
    rows,
  };
}

/* ------------------------------------------------------------------- summary */

export function summarySheet(x: ExportInput): Sheet {
  const disciplines = Array.from(new Set(x.checks.map((c) => c.discipline)));
  const rows = disciplines.map((d) => {
    const cs = x.checks.filter((c) => c.discipline === d);
    const rs = cs.map((c) => x.responses[c.id]).filter(Boolean) as Response[];
    const count = (k: string) => rs.filter((r) => r.compliance === k).length;
    const fs = x.findings.filter((f) => f.discipline === d);
    const agreed = fs.filter((f) => f.ratingConfirmed);
    const inBand = (b: string) =>
      agreed.filter((f) => bandFor(f.severity, f.likelihood) === b).length;
    return [
      d,
      cs.length,
      rs.filter((r) => r.captured).length,
      count("C"),
      count("NC"),
      count("N/A"),
      count("NV"),
      fs.length,
      agreed.length,
      fs.length - agreed.length,
      inBand("Red"),
      inBand("Amber"),
      inBand("Green"),
    ];
  });

  return {
    name: "Summary",
    columns: [
      { header: "Discipline", width: 26 },
      { header: "Check-points", width: 13 },
      { header: "Captured", width: 10 },
      { header: "Compliant", width: 11 },
      { header: "Non-compliant", width: 14 },
      { header: "Not applicable", width: 14 },
      { header: "Not available", width: 13 },
      { header: "Findings raised", width: 15 },
      { header: "Rating agreed", width: 13 },
      { header: "Rating outstanding", width: 17 },
      { header: "Red", width: 8 },
      { header: "Amber", width: 8 },
      { header: "Green", width: 8 },
    ],
    rows,
  };
}

/* --------------------------------------------------------------------- notes */

/** A cover sheet, so nobody has to be told verbally what a blank cell means. */
export function aboutSheet(x: ExportInput): Sheet {
  const captured = Object.values(x.responses).filter((r) => r.captured).length;
  const agreed = x.findings.filter((f) => f.ratingConfirmed).length;
  const verified = Object.values(x.verifications).filter((v) => v.outcome).length;
  return {
    name: "About this export",
    columns: [
      { header: "", width: 30 },
      { header: "", width: 96, wrap: true },
    ],
    rows: [
      ["Produced by", "Squawk — asset assurance capture, Thabile-Pridin JV"],
      ["Entity", `${CURRENT_ENTITY.name} (${CURRENT_ENTITY.code})`],
      ["Visit", VISIT_LABEL],
      ["Exported", new Date()],
      ["", ""],
      ["Check-points in scope", x.checks.length],
      ["Captured", captured],
      ["Findings raised", x.findings.length],
      ["Ratings agreed by the team", agreed],
      ["Ratings still only suggested", x.findings.length - agreed],
      ["Mar 2025 findings verified", `${verified} of ${x.prior.length}`],
      ["", ""],
      [
        "A blank status",
        "means the check-point has not been captured. It does not mean compliant.",
      ],
      [
        "Suggested vs agreed ratings",
        "An issue button in the tool carries a suggested severity and likelihood. That suggestion is NOT a rating. The severity, likelihood, cell, band and strategy columns are filled only where the audit team agreed the cell together; anything still only suggested appears in its own column and is marked as such in Rating state.",
      ],
      [
        "The risk matrix",
        "ACSA B170 001M: severity A–E by likelihood 1–5, written likelihood-first (3A), banded Red / Amber / Green. Clause 4.6 states that no other format is accepted by the SACAA Director of Civil Aviation.",
      ],
      [
        "Where ACSA states no threshold",
        'The "ACSA states" column reads "ACSA states no threshold" where ACSA\'s own documents set no interval, limit or acceptance value. That absence is an audit point in itself, not an omission from this export.',
      ],
      [
        "Citation confidence",
        'Where the external basis is marked "cited at document level", the instrument applies but the clause was not confirmed. Do not quote a clause number from those rows.',
      ],
      [
        "Movement",
        'The Movement column compares this visit\'s band against the March 2025 rating, treating Red as Unacceptable, Amber as Tolerable and Green as Acceptable. ACSA has not stated that equivalence; it is ours, and it is the only way the two visits can be compared. Say so if you disagree.',
      ],
      [
        "Coverage guard",
        "On the Closure sheet, a prior finding marked NOT COVERED THIS VISIT has no check-point in the current scope covering its asset system, so its closure cannot be evidenced against this visit's work.",
      ],
    ],
  };
}

/** Everything, in one workbook. */
export function fullWorkbook(x: ExportInput): Sheet[] {
  return [
    aboutSheet(x),
    summarySheet(x),
    registerSheet(x),
    findingsSheet(x),
    closureSheet(x),
    evidenceRequestSheet(x),
  ];
}

export function exportFilename(kind: string, ext = "xlsx"): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return `${CURRENT_ENTITY.code}_${CURRENT_VISIT_ID}_${kind}_${stamp}.${ext}`;
}
