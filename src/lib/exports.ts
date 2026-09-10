import type {
  AdHocItem,
  AnswerLibrary,
  Attachment,
  Check,
  Finding,
  Hazard,
  PriorFinding,
  Response,
  MitigationAction,
  RootCauseNote,
  SystemAssessment,
  Verification,
} from "./types";
import { BAND_AS_RATING, BAND_META, bandFor, cellCode, movement } from "./risk";
import { entity as entityOf, PROGRAMME_VISITS } from "./programme";
import { portalIdFor } from "./sites";
import { priorFor } from "./register";
import * as erm from "./erm";

/** Who raised the hazard, spelled out for a reader of the workbook. */
const ORIGIN_TEXT: Record<Hazard["origin"], string> = {
  consolidated: "Consolidated from findings",
  field: "Seen on the walk",
  acsa: "Raised by ACSA in the closing session",
  tpjv: "Raised by TPJV",
};
import { photoFilename } from "./photos";
import type { CellValue, Sheet } from "./xlsx";

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

/* Which audit is being exported travels with the data. It used to be read from
   a module constant, so a workbook produced while looking at Cape Town would
   still have been titled and filenamed for King Shaka's September visit — the
   one sheet where getting the subject wrong is least recoverable, because it
   leaves the room. */
const visitLabel = (visitId: string) =>
  PROGRAMME_VISITS.find((v) => v.id === visitId)?.label ?? visitId;

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

/** Asset links, as tags, for a workbook cell.
 *
 *  Tags only — the register is a separate file that gets replaced wholesale,
 *  and a name copied into the workbook would go stale the day it is. Blank
 *  where nothing is linked: plenty of findings are not about one asset, so an
 *  empty cell here is a legitimate answer and not an omission. */
function assetCell(ids: string[] | undefined): string {
  return (ids ?? []).join(", ");
}

export interface ExportInput {
  /** The entity and visit this export is of. Not optional — an export that
   *  cannot name its own subject should not be produced. */
  entity: string;
  visit: string;
  checks: Check[];
  responses: Record<string, Response>;
  findings: Finding[];
  /** The consolidated view of the same audit. Optional so an older caller —
   *  or a fixture written before the register existed — still produces a
   *  workbook, with an empty Hazards sheet rather than a crash. */
  hazards?: Hazard[];
  /** Things seen on the walk that the register does not cover. Optional for
   *  the same reason hazards are — an older caller still produces a workbook.
   *  They are NEVER folded into the register sheet or the completion figure:
   *  the whole value of an ad-hoc observation is that it was not on the list,
   *  and a row that cannot say so is a row that misrepresents our coverage. */
  adhoc?: AdHocItem[];
  prior: PriorFinding[];
  verifications: Record<string, Verification>;
  /** The asset systems' own ratings, keyed `${discipline}|${system}`. Optional
   *  for the same reason `adhoc` is — an older caller still produces a
   *  workbook, and an asset system nobody rated is reported as unrated rather
   *  than omitted. */
  systems?: Record<string, SystemAssessment>;
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
      portalIdFor(x.entity, c.id),
      c.discipline,
      c.system,
      c.area,
      c.assetClass,
      c.requirement,
      c.confirmedBy ?? "",
      /* Spelled out rather than left as the stored token. "none" in a cell
         reads as missing data; "nothing to see on site" is a finding about the
         check, and it is one an auditor should be able to sort on. */
      c.inspect === "reconcile"
        ? "Reconcile the record"
        : c.inspect === "examine"
          ? "Go and see"
          : c.inspect === "none"
            ? "Nothing to see on site"
            : "",
      c.complianceTest ?? c.evidenceExpected ?? "",
      c.vtype ?? "",
      c.target,
      c.acsaThreshold || "ACSA states no threshold",
      docs(c),
      /* A CONFLICT READS AS A CONFLICT IN THE WORKBOOK TOO. This column is
         where a reviewer at ACSA head office will meet it, and "FALE: yearly"
         beside a requirement headed "3 yearly" is a discrepancy they have to
         spot for themselves. Say it. */
      c.siteVariant?.conflict
        ? `CONFLICT (${c.siteVariant.conflict.direction}) — the check says "${c.siteVariant.conflict.checkSays}"; ${c.siteVariant.site} requires "${c.siteVariant.conflict.siteRequires}" per ${c.siteVariant.conflict.source}`
        : c.siteVariant
          ? `${c.siteVariant.site}: ${c.siteVariant.note}`
          : "",
      c.basis,
      c.basisConfidence === "medium" ? "cited at document level" : "",
      c.basisNote ?? "",
      c.acsaConflict,
      c.coverage,
      c.question,
      c.walkabout ?? "",
      priorFor(x.entity, c.discipline, c.system)?.key ?? "",
      /* Capture starts here. */
      r?.compliance ? STATUS_WORD[r.compliance] : "",
      /* WHERE THE ASSET WAS INSPECTED, and it is a different column from
         `Area`. Area is ACSA's category on the register; this is the auditor's
         own words for where they were standing, which is the half that lets
         somebody walk back to the thing and close the finding. */
      r?.location?.trim() ?? "",
      r?.observation ?? "",
      evidence ?? "",
      issues ?? "",
      walk,
      photos || "",
      voice || "",
      /* Both halves, separately. A single "Captured: Yes" on a check that
         needs the record read AND the asset seen would tell ACSA the site
         verification happened when only one of the two did. */
      r?.deskDoneAt ? "Yes" : "No",
      r?.deskDoneBy ?? "",
      when(r?.deskDoneAt),
      r?.fieldDoneAt ? "Yes" : "No",
      r?.fieldDoneBy ?? "",
      when(r?.fieldDoneAt),
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
      /* From the register review, agreed 2026-09-10. These three sit next to
         the requirement rather than at the far right, because they are how the
         reader decides what to go and do about the row. "Verification type" is
         kept beside them deliberately, not replaced — it is ACSA's own column
         and their copy of the workbook has to reconcile against ours. */
      { header: "Confirmed by", width: 13 },
      { header: "On the walk", width: 15 },
      { header: "Compliant when", width: 66, wrap: true },
      { header: "Verification type", width: 22, wrap: true },
      { header: "Target / limit", width: 58, wrap: true },
      { header: "ACSA states", width: 58, wrap: true },
      { header: "ACSA document & clause", width: 34, wrap: true },
      { header: `Site variant (${x.entity})`, width: 46, wrap: true },
      { header: "External basis", width: 52, wrap: true },
      { header: "Citation confidence", width: 18, wrap: true },
      { header: "Caveat on the basis", width: 46, wrap: true },
      { header: "Document issue", width: 40, wrap: true },
      { header: "ACSA coverage", width: 13 },
      { header: "Question put to ACSA", width: 48, wrap: true },
      { header: "Walkabout instruction", width: 48, wrap: true },
      { header: "Mar 2025 finding", width: 14 },
      { header: `Status (${visitLabel(x.visit)})`, width: 16 },
      { header: "Where it was inspected", width: 28 },
      { header: "Observation", width: 60, wrap: true },
      { header: "Evidence requested", width: 42, wrap: true },
      { header: "Issues found", width: 52, wrap: true },
      { header: "Walkabout observation", width: 38, wrap: true },
      { header: "Photos", width: 8 },
      { header: "Voice notes", width: 11 },
      { header: "Desk done", width: 10 },
      { header: "Desk done by", width: 22 },
      { header: "Desk done at", width: 13 },
      { header: "Site seen", width: 10 },
      { header: "Site seen by", width: 22 },
      { header: "Site seen at", width: 13 },
      { header: "Complete", width: 10 },
      { header: "Completed by", width: 22 },
      { header: "Completed at", width: 13 },
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
      f.checkId ? portalIdFor(x.entity, f.checkId) : "",
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
      assetCell(f.assetIds),
      f.rootCause,
      f.action,
      f.owner,
      iso(f.dueDate),
      f.actionStatus,
      /* ACSA's one Progress/Update cell, carrying the whole log — each entry
         dated and attributed, because a cell that has been typed over cannot
         say when a finding moved or who said so. */
      (f.progress ?? [])
        .map((n) => `${new Date(n.at).toISOString().slice(0, 10)} · ${n.by}: ${n.note}`)
        .join("\n"),
      f.priorRating ?? "",
      move ?? "",
      f.adHoc ? "Ad-hoc (raised in the field)" : "From a check-point",
      /* Where this finding ended up on the hazard register, and the event
         somebody named for it at the check. Without these a reader holding the
         Findings sheet cannot tell whether a finding was consolidated or
         overlooked, and "not grouped" is itself a finding about the audit. */
      (x.hazards ?? []).find((h) => h.findingIds.includes(f.id))?.id ?? "Not grouped",
      f.suggestedEvent,
      /* The photographs behind this finding, by their captions. A count alone
         tells a reader there is evidence but not what it shows, and the
         workbook is where most people will meet it. */
      photosFor(x, f.checkId).length,
      /* The files, so a reader can go from this row straight to the images in
         the zip. */
      photosFor(x, f.checkId).map(photoFilename).join(" · "),
      photosFor(x, f.checkId)
        .map((a) => a.caption?.trim() || "(no caption)")
        .join(" · "),
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
      { header: "Assets", width: 34, wrap: true },
      { header: "Root cause", width: 26 },
      { header: "Remediation action", width: 58, wrap: true },
      { header: "Owner", width: 30 },
      { header: "Due date", width: 12 },
      { header: "Action status", width: 15 },
      { header: "Progress / Update", width: 66, wrap: true },
      { header: "Mar 2025 rating", width: 15 },
      { header: "Movement", width: 13 },
      { header: "Origin", width: 26 },
      { header: "Consolidated into", width: 16 },
      { header: "Event proposed at the check", width: 44, wrap: true },
      { header: "Photographs", width: 12 },
      { header: "Photograph files", width: 44, wrap: true },
      { header: "Photograph captions", width: 60, wrap: true },
      { header: "Raised at visit", width: 14 },
      { header: "Raised by", width: 22 },
      { header: "Raised on", width: 12 },
    ],
    rows,
  };
}

/* ---------------------------------------------------------------- photographs */

/** Photographs attached to a check. Null checkId (an ad-hoc finding) has none
 *  of its own. */
function photosFor(x: ExportInput, checkId: string | null | undefined): Attachment[] {
  if (!checkId) return [];
  return (x.responses[checkId]?.attachments ?? []).filter((a) => a.kind === "photo");
}

/** One row per photograph.
 *
 *  A photograph nobody indexed is a photograph nobody will find. This sheet is
 *  the index: what it shows, where it belongs, who said so and when it was
 *  taken. `Caption source` is not decoration — a caption an auditor wrote and
 *  one a model proposed and a person accepted are different evidence, and a
 *  reader is entitled to tell them apart. */
export function photographsSheet(x: ExportInput): Sheet {
  const rows: CellValue[][] = [];
  for (const c of x.checks) {
    const r = x.responses[c.id];
    if (!r) continue;
    for (const a of r.attachments) {
      if (a.kind !== "photo") continue;
      rows.push([
        /* The filename in the zip. This column is how somebody reading the
           workbook finds the actual photograph. */
        photoFilename(a),
        a.ref ?? "",
        portalIdFor(x.entity, c.id),
        c.discipline,
        c.system,
        c.area,
        /* WHERE IT WAS TAKEN, in the auditor's own words, and it is a different
           column from `Area` on purpose. Area is the register's category — a
           third of the values at KSIA are not places at all. This is the one a
           maintenance planner can act on. */
        a.location?.trim() ?? "",
        /* WHICH asset, as the auditor read it off the plate. Both blank is a
           legitimate answer — plenty of evidence is not about one asset — so
           these stay empty rather than shouting the way the caption column
           does. A missing caption IS a defect; a missing asset is not. */
        a.assetName?.trim() ?? "",
        a.assetRef?.trim() ?? "",
        a.caption?.trim() ?? "",
        a.caption?.trim()
          ? a.captionSource === "assistant"
            ? "Assistant, accepted by the auditor"
            : "Auditor"
          : "NO CAPTION",
        when(a.takenAt) ?? "",
        when(a.createdAt),
        a.createdBy,
        a.width && a.height ? `${a.width}×${a.height}` : "",
        a.bytes ? Math.round(a.bytes / 1024) : "",
        a.unavailable
          ? "No image stored"
          : a.cloudUrl
            ? "On the device and in the record store"
            : "On the device only",
        a.cloudUrl ?? "",
        "Register check-point",
      ]);
    }
  }
  /* Photographs attached to something seen on the walk. Same sheet, because a
     reader looking for an image should not have to know which of two places it
     was captured from — and the last column says which it was. */
  for (const item of x.adhoc ?? []) {
    for (const a of item.attachments) {
      if (a.kind !== "photo") continue;
      rows.push([
        photoFilename(a),
        a.ref ?? "",
        item.id,
        item.discipline ?? "",
        item.system ?? "",
        item.area,
        a.location?.trim() ?? "",
        a.assetName?.trim() ?? "",
        a.assetRef?.trim() ?? "",
        a.caption?.trim() ?? "",
        a.caption?.trim()
          ? a.captionSource === "assistant"
            ? "Assistant, accepted by the auditor"
            : "Auditor"
          : "NO CAPTION",
        when(a.takenAt) ?? "",
        when(a.createdAt),
        a.createdBy,
        a.width && a.height ? `${a.width}×${a.height}` : "",
        a.bytes ? Math.round(a.bytes / 1024) : "",
        a.unavailable
          ? "No image stored"
          : a.cloudUrl
            ? "On the device and in the record store"
            : "On the device only",
        a.cloudUrl ?? "",
        "Seen on the walk — NOT one of the register check-points",
      ]);
    }
  }

  return {
    name: "Photographs",
    columns: [
      { header: "File", width: 26 },
      { header: "Reference", width: 22 },
      { header: "Check", width: 15 },
      { header: "Discipline", width: 20 },
      { header: "Asset system", width: 26 },
      { header: "Area", width: 20 },
      { header: "Where it was taken", width: 28 },
      { header: "Asset", width: 28 },
      { header: "Asset no. / ref", width: 18 },
      { header: "Caption", width: 62, wrap: true },
      { header: "Caption source", width: 30 },
      { header: "Taken", width: 18 },
      { header: "Attached", width: 18 },
      { header: "Attached by", width: 22 },
      { header: "Dimensions", width: 13 },
      { header: "Size (KB)", width: 10 },
      { header: "Where the image is", width: 34 },
      { header: "Record copy", width: 60 },
      { header: "Source", width: 46 },
    ],
    rows,
  };
}

/* --------------------------------------------------------- seen on the walk */

/** One row per thing seen on the walk that the register does not cover.
 *
 *  ITS OWN SHEET, and that is the point rather than a filing convenience. An
 *  ad-hoc observation put on the register sheet would be a 325th row on a
 *  324-row deliverable, and every count anybody took off that sheet would be
 *  wrong by however many we happened to see. Here it is unambiguous: this is
 *  what we found that nobody asked us to look for.
 *
 *  A cluster of these in one discipline is evidence about the check-list, not
 *  about the airport. Nothing computes that yet; the data is kept clean enough
 *  that it can be asked later. */
export function walkSheet(x: ExportInput): Sheet {
  const rows = (x.adhoc ?? []).map((a) => [
    a.id,
    ORIGIN_TEXT[a.origin],
    /* Blank is a real answer on all three. An observation nobody could
       attribute to a discipline is a normal state on a walk, and forcing one
       would put a guess in a client deliverable. */
    a.discipline ?? "",
    a.system ?? "",
    a.area,
    a.description,
    a.outcome ? STATUS_WORD[a.outcome] : "",
    a.note,
    a.attachments.filter((t) => t.kind === "photo").length,
    a.attachments.filter((t) => t.kind === "voice").length,
    /* Whether this observation became a finding. Empty means it has not — which
       is legitimate, and visible, rather than lost. */
    a.findingId ?? "",
    when(a.createdAt),
    a.createdBy,
  ]);

  return {
    name: "Seen on the walk",
    columns: [
      { header: "Item", width: 14 },
      { header: "Origin", width: 34 },
      { header: "Discipline", width: 20 },
      { header: "Asset system", width: 26 },
      { header: "Where", width: 26 },
      { header: "What was found", width: 66, wrap: true },
      { header: "Outcome", width: 16 },
      { header: "Notes", width: 50, wrap: true },
      { header: "Photographs", width: 12 },
      { header: "Voice notes", width: 12 },
      { header: "Raised as finding", width: 18 },
      { header: "Recorded", width: 18 },
      { header: "Recorded by", width: 22 },
    ],
    rows,
  };
}

/* ------------------------------------------------------------------- hazards */

/** Photographs behind a hazard: the ones on the checks its findings came from,
 *  de-duplicated. Two findings raised at one check share its photographs and a
 *  count that includes them twice is a count nobody can reconcile. */
function hazardPhotos(x: ExportInput, h: Hazard): Attachment[] {
  const seen = new Set<string>();
  const out: Attachment[] = [];
  for (const id of h.findingIds) {
    const f = x.findings.find((y) => y.id === id);
    if (!f?.checkId) continue;
    for (const a of photosFor(x, f.checkId)) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

/** One row per hazard, carrying BOTH rating instruments.
 *
 *  B170 001M and ACSA's enterprise risk matrix measure different things and
 *  neither is derived from the other, so they get their own columns and their
 *  own state column. The ERM columns are empty in this build and the state
 *  column says why in words — an empty band that reads like "no risk" is
 *  exactly the silent failure src/lib/erm.ts exists to prevent.
 *
 *  As on the findings sheet, an unagreed rating never reaches the rating
 *  columns. It goes in "Suggested cell", labelled. */
export function hazardsSheet(x: ExportInput): Sheet {
  const rows = (x.hazards ?? []).map((h) => {
    const agreed = h.ratingConfirmed;
    const band = agreed ? bandFor(h.severity, h.likelihood) : null;
    const suggested = !agreed ? cellCode(h.severity, h.likelihood) : null;
    const photos = hazardPhotos(x, h);
    return [
      h.id,
      h.event,
      h.description,
      h.why,
      /* Every discipline the hazard spans, not the first one's. Two write-ups
         of one physical defect in two disciplines is the case consolidation
         exists for, and a single value throws that away. */
      h.disciplines.join(" · "),
      h.systems.join(" · "),
      h.disciplines.length,
      h.findingIds.join(" · "),
      h.findingIds.length,
      ORIGIN_TEXT[h.origin],
      h.immediate ? "Yes — end-of-week critical review" : "",
      /* ACSA's occurrence history. Four of B170's five likelihood levels are
         defined by whether the event has happened and how often, so a
         likelihood set without this is a judgement with its evidence missing. */
      h.occurrence,
      /* B170 001M — the instrument this build carries. */
      agreed ? h.severity : "",
      agreed ? h.likelihood : "",
      agreed ? cellCode(h.severity, h.likelihood) : "",
      band ?? "",
      band ? BAND_META[band].label : "",
      band ? BAND_META[band].strategy : "",
      suggested ?? "",
      agreed ? "Agreed by the audit team" : "Suggested — not yet agreed",
      /* ACSA's ERM matrix — a separate instrument, gated separately.
         J050 001FW cl. 9.2.2. Nothing here is derived from the B170 columns
         above: a carried likelihood that nobody agreed stays out, and the
         state column says which of the two reasons it is out for. */
      h.ermConfirmed ? (h.ermConsequence ?? "") : "",
      h.ermConfirmed ? (h.ermLikelihood ?? "") : "",
      h.ermConfirmed ? (erm.ermCell(h.ermConsequence, h.ermLikelihood) ?? "") : "",
      h.ermConfirmed ? (erm.ermPriority(h.ermConsequence, h.ermLikelihood) ?? "") : "",
      (() => {
        const p = h.ermConfirmed ? erm.ermPriority(h.ermConsequence, h.ermLikelihood) : null;
        return p ? erm.ERM_PRIORITY_META[p].tolerance : "";
      })(),
      (() => {
        const p = h.ermConfirmed ? erm.ermPriority(h.ermConsequence, h.ermLikelihood) : null;
        return p ? erm.ERM_PRIORITY_META[p].action : "";
      })(),
      /* Clause 9.1.2 — the reason the ERM rating is carried at all. */
      (() => {
        const p = h.ermConfirmed ? erm.ermPriority(h.ermConsequence, h.ermLikelihood) : null;
        if (!p) return "";
        return erm.entersAssurancePlan(p)
          ? "Yes — cl. 9.1.2, I and II as a minimum"
          : "No — below the cl. 9.1.2 threshold";
      })(),
      h.ermConfirmed
        ? h.ermLikelihoodAssumed
          ? "Agreed, but the likelihood was carried from B170 001M"
          : "Agreed by the audit team"
        : h.ermConsequence || h.ermLikelihood
          ? "Suggested — not yet agreed"
          : "Not rated on ERM",
      h.ratingRationale,
      assetCell(h.assetIds),
      h.rootCause,
      h.action,
      h.owner,
      iso(h.dueDate),
      h.actionStatus,
      /* Their one Progress/Update cell, our whole log. */
      h.progress
        .map(
          (n) =>
            `${new Date(n.at).toISOString().slice(0, 10)} · ${n.by}: ${n.note}`
        )
        .join("\n"),
      h.note,
      when(h.reassessedAt) ?? "",
      h.reassessNote,
      photos.length,
      photos.map(photoFilename).join(" · "),
      photos.map((a) => a.caption?.trim() || "(no caption)").join(" · "),
      h.originVisit,
      h.createdBy,
      when(h.createdAt),
    ];
  });

  return {
    name: "Hazards",
    columns: [
      { header: "Hazard", width: 12 },
      { header: "Event", width: 44, wrap: true },
      { header: "Description", width: 58, wrap: true },
      { header: "What control failed, and what it protected", width: 58, wrap: true },
      { header: "Disciplines", width: 26, wrap: true },
      { header: "Asset systems", width: 30, wrap: true },
      { header: "Disciplines spanned", width: 18 },
      { header: "Findings behind it", width: 30 },
      { header: "Findings", width: 10 },
      { header: "Origin", width: 26 },
      { header: "Immediate (critical review)", width: 26 },
      { header: "Occurrence history (ACSA)", width: 50, wrap: true },
      { header: "Severity (B170 001M)", width: 18 },
      { header: "Likelihood (B170 001M)", width: 18 },
      { header: "Matrix cell", width: 11 },
      { header: "Band", width: 9 },
      { header: "Band meaning", width: 26 },
      { header: "Strategy (B170 001M)", width: 44, wrap: true },
      { header: "Suggested cell (not agreed)", width: 20 },
      { header: "B170 001M rating state", width: 26 },
      { header: "Impact (ACSA ERM)", width: 18 },
      { header: "Likelihood (ACSA ERM)", width: 18 },
      { header: "ERM cell", width: 10 },
      { header: "ERM priority", width: 12 },
      { header: "ERM tolerance", width: 14 },
      { header: "ERM response (cl. 9.2.2)", width: 42, wrap: true },
      { header: "Combined Assurance Coverage Plan (cl. 9.1.2)", width: 38, wrap: true },
      { header: "ERM rating state", width: 48, wrap: true },
      { header: "Why the cell was agreed", width: 50, wrap: true },
      { header: "Assets", width: 34, wrap: true },
      { header: "Root cause", width: 26 },
      { header: "Treatment", width: 58, wrap: true },
      { header: "Owner", width: 30 },
      { header: "Due date", width: 12 },
      { header: "Action status", width: 15 },
      { header: "Progress / Update", width: 66, wrap: true },
      { header: "Consolidation note", width: 58, wrap: true },
      { header: "Re-read after the walk", width: 18 },
      { header: "What the re-read changed", width: 58, wrap: true },
      { header: "Photographs", width: 12 },
      { header: "Photograph files", width: 44, wrap: true },
      { header: "Photograph captions", width: 60, wrap: true },
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
    const v = x.verifications[p.portalId];
    /* An unallocated finding names a building rather than a register asset
       system, so nothing covers it by definition and the column says so
       instead of reading as a coverage failure. */
    const covering = p.assetSystem
      ? x.checks.filter((c) => c.discipline === p.discipline && c.system === p.assetSystem)
      : [];
    const nc = covering.filter((c) => x.responses[c.id]?.compliance === "NC").length;
    return [
      p.portalId,
      p.discipline,
      p.assetSystem ?? p.assetSystemRecorded,
      p.tolerance,
      p.observation,
      v?.outcome ?? "",
      v?.evidence ?? "",
      /* WHAT FIXES IT, and separately WHAT HAPPENS NEXT. ACSA's own sheet
         folds the two into one cell, which is how a finding regularly arrives
         at the next audit with the chase recorded and no remedy at all. */
      v?.action ?? "",
      v?.nextStep ?? "",
      /* THE HAZARDOUS EVENTS THIS FINDING COULD LEAD TO, one per line with its
         likelihood. Plural because one finding usually has more than one, and
         an audit that records only the worst over-rates the common case. An
         event nobody has rated says so rather than being left blank — blank
         would read as "no likelihood", which is not a state. */
      (v?.possibleEvents ?? [])
        .map((e) => `${e.event} · ${e.likelihood ?? "likelihood not agreed"}${e.note ? ` — ${e.note}` : ""}`)
        .join("\n"),
      /* ACSA's Progress/Update is one cell, so the log is flattened into it —
         their format, our history. Each entry keeps its date, its author and
         the outcome as it stood, because a cell that has been typed over
         cannot say when an item moved or who said so. */
      (v?.progress ?? [])
        .map(
          (n) =>
            `${new Date(n.at).toISOString().slice(0, 10)} · ${n.by}${
              n.outcome ? ` · ${n.outcome}` : ""
            }: ${n.note}`
        )
        .join("\n"),
      v?.verifiedBy ?? "",
      when(v?.verifiedAt),
      covering.length,
      covering.length
        ? covering.map((c) => portalIdFor(x.entity, c.id)).join(", ")
        : p.assetSystem
          ? "No check covers this"
          : "Unallocated — discipline lead assigns in the field",
      nc,
      /* The coverage guard, carried into the export: closure cannot be evidenced
         against a check that is not being done. */
      covering.length === 0 && p.assetSystem ? "NOT COVERED THIS VISIT" : "",
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
      { header: `Verification (${visitLabel(x.visit)})`, width: 16 },
      { header: "Evidence of closure", width: 58, wrap: true },
      { header: "Remediation action", width: 50, wrap: true },
      { header: "Next step", width: 44, wrap: true },
      { header: "Possible hazardous events", width: 62, wrap: true },
      { header: "Progress / Update", width: 66, wrap: true },
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
        portalIdFor(x.entity, c.id),
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

/* --------------------------------------------------------- asset systems */

/** ONE ROW PER ASSET SYSTEM — the rating ACSA actually publishes.
 *
 *  Every asset system at the site, not only the ones somebody assessed: a
 *  system that was never rated is the gap this sheet exists to make visible,
 *  and omitting it would report the gap as an absence of risk. `Rating agreed`
 *  is the column that decides whether the band means anything, because a
 *  severity and likelihood nobody tapped on the matrix is a suggestion.
 *
 *  The band and the strategy are DERIVED here as they are on screen, from the
 *  same bandFor()/BAND_META, so the workbook cannot come to disagree with the
 *  app about what C4 means. */
export function systemsSheet(x: ExportInput): Sheet {
  const seen = new Set<string>();
  const rows: CellValue[][] = [];
  for (const c of x.checks) {
    const system = c.system?.trim() || "No asset system recorded";
    const key = `${c.discipline}|${system}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = x.systems?.[key];
    const band = bandFor(a?.severity ?? null, a?.likelihood ?? null);
    const agreed = a?.ratingConfirmed === true;
    const checks = x.checks.filter(
      (k) => k.discipline === c.discipline && (k.system?.trim() || "No asset system recorded") === system
    );
    const rs = checks.map((k) => x.responses[k.id]);
    const findings = x.findings.filter((f) => f.discipline === c.discipline && f.system === system);
    rows.push([
      c.discipline,
      system,
      a?.severity ?? "",
      a?.likelihood ?? "",
      /* THE CELL, AND ONLY WHERE IT WAS AGREED. A code printed against an
         unconfirmed pair would read in a workbook exactly like one the group
         settled, which is the one thing ratingConfirmed exists to prevent. */
      agreed && band ? (cellCode(a!.severity, a!.likelihood) ?? "") : "",
      agreed && band ? BAND_META[band].label : band ? "SUGGESTED — not agreed" : "NOT RATED",
      agreed && band ? BAND_META[band].strategy : "",
      agreed ? "Yes" : "No",
      a?.ratingRationale ?? "",
      (a?.rootCauses ?? [])
        .map((r: RootCauseNote) => (r.note ? `${r.cause} — ${r.note}` : r.cause))
        .join("\n"),
      (a?.actions ?? [])
        .map(
          (m: MitigationAction) =>
            `${m.action} · ${m.owner || "NO OWNER"} · ${m.dueDate || "NO TARGET DATE"} · ${m.status}`
        )
        .join("\n"),
      /* The evidence the band was agreed on, as counts. Not the band's
         derivation — nothing here computes it — but what a reader needs to
         argue with it. */
      checks.length,
      rs.filter((r) => r?.compliance === "C").length,
      rs.filter((r) => r?.compliance === "NC").length,
      rs.filter((r) => !r?.compliance).length,
      findings.length,
      x.prior.filter(
        (p) => p.discipline === c.discipline && (p.assetSystem ?? p.assetSystemRecorded) === system
      ).length,
      a?.assessedBy ?? "",
      when(a?.assessedAt),
      a?.note ?? "",
    ]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));

  return {
    name: "Asset systems",
    columns: [
      { header: "Discipline", width: 22 },
      { header: "Asset system", width: 32 },
      { header: "Severity", width: 20 },
      { header: "Likelihood", width: 22 },
      { header: "Cell", width: 8 },
      { header: "Rating", width: 26 },
      { header: "Treatment strategy (cl. 4.6)", width: 44, wrap: true },
      { header: "Rating agreed", width: 13 },
      { header: "Why that cell", width: 56, wrap: true },
      { header: "Root causes", width: 56, wrap: true },
      { header: "Mitigation actions", width: 70, wrap: true },
      { header: "Check-points", width: 13 },
      { header: "Compliant", width: 11 },
      { header: "Non-compliant", width: 14 },
      { header: "Not captured", width: 13 },
      { header: "Findings raised", width: 15 },
      { header: "2025 findings", width: 14 },
      { header: "Assessed by", width: 22 },
      { header: "Assessed on", width: 13 },
      { header: "Assessor's note", width: 60, wrap: true },
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
    /* Hazards are counted separately from findings, never summed with them.
       One hazard can stand behind four findings, and adding the two together
       would double-count the same exposure. */
    /* A hazard spanning two disciplines counts in both — it is one
       exposure, and each lead has to see it. The Hazards total on this sheet
       therefore reads higher than the register's count by design. */
    const hs = (x.hazards ?? []).filter((h) => h.disciplines.includes(d));
    const hAgreed = hs.filter((h) => h.ratingConfirmed);
    /* ITS OWN COLUMN, never added to Check-points or to Complete. "312 of 324"
       must not become "313 of 324" because somebody recorded an observation —
       the denominator is ACSA's list and the numerator has to be answers to it.
       Shown alongside so both numbers are readable at once, which is the whole
       ask: what we were sent to look at, and what we found anyway. */
    const walk = (x.adhoc ?? []).filter((a) => a.discipline === d);
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
      hs.length,
      hAgreed.length,
      hAgreed.filter((h) => bandFor(h.severity, h.likelihood) === "Red").length,
      walk.length,
    ];
  });

  return {
    name: "Summary",
    columns: [
      { header: "Discipline", width: 26 },
      { header: "Check-points", width: 13 },
      { header: "Complete", width: 10 },
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
      { header: "Hazards", width: 9 },
      { header: "Hazard rating agreed", width: 19 },
      { header: "Hazards red", width: 12 },
      { header: "Seen on the walk (not in the 324)", width: 28 },
    ],
    rows,
  };
}

/* --------------------------------------------------------------------- notes */

/** A cover sheet, so nobody has to be told verbally what a blank cell means. */
export function aboutSheet(x: ExportInput): Sheet {
  /* Complete means every mode the register declares has been answered. Desk
     and site are reported alongside it, because "180 complete" without them
     hides whether the remainder is waiting on documents or on a walk. */
  const captured = Object.values(x.responses).filter((r) => r.captured).length;
  const deskDone = Object.values(x.responses).filter((r) => r.deskDoneAt).length;
  const fieldSeen = Object.values(x.responses).filter((r) => r.fieldDoneAt).length;
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
      ["Entity", `${entityOf(x.entity).name} (${x.entity})`],
      ["Visit", visitLabel(x.visit)],
      ["Exported", new Date()],
      ["", ""],
      ["Check-points in scope", x.checks.length],
      ["Complete (all declared modes answered)", captured],
      ["Desk done", deskDone],
      ["Site seen", fieldSeen],
      ["Findings raised", x.findings.length],
      ["Ratings agreed by the team", agreed],
      ["Ratings still only suggested", x.findings.length - agreed],
      ["Hazards on the register", (x.hazards ?? []).length],
      [
        "Findings not yet consolidated",
        x.findings.filter(
          (f) => !(x.hazards ?? []).some((h) => h.findingIds.includes(f.id))
        ).length,
      ],
      ["2025 findings verified", `${verified} of ${x.prior.length}`],
      [
        "Seen on the walk (NOT part of the check-points in scope)",
        (x.adhoc ?? []).length,
      ],
      ["", ""],
      [
        "A blank status",
        "means the check-point has not been captured. It does not mean compliant.",
      ],
      [
        "Seen on the walk",
        "Things the audit team found on site that the check-list does not cover. They are on their own sheet and in their own count, and they are DELIBERATELY excluded from Check-points in scope and from Complete: the completion figure is answers to ACSA's list, and an observation nobody asked for must not move it. Their identifiers begin WALK- and can never be confused with a check-point. Where several of them fall in one discipline, that is worth reading as evidence about the check-list rather than about the airport.",
      ],
      [
        "Suggested vs agreed ratings",
        "An issue button in the tool carries a suggested severity and likelihood. That suggestion is NOT a rating. The severity, likelihood, cell, band and strategy columns are filled only where the audit team agreed the cell together; anything still only suggested appears in its own column and is marked as such in Rating state.",
      ],
      [
        "Findings and hazards",
        "A finding is what was observed — a missing record, a worn coupler. A hazard is the event the failed control was protecting against, and that is what carries a severity. One hazard can stand behind several findings, so the two counts are reported separately and must never be added together.",
      ],
      [
        "The ACSA ERM columns on the Hazards sheet",
        "ACSA's enterprise risk matrix, J050 001FW Combined Assurance Framework cl. 9.2.2. It is a SECOND instrument, not a variant of B170 001M: consequence 5 (Catastrophic) to 1 (Minor) — running the opposite direction to B170's A to E — by likelihood 1 to 5 as a probability band, giving priority I, II or III. Clause 9.1.2: risks rated I and II as a minimum enter the Combined Assurance Coverage Plan, which is the column that says so. Laid over B170 001M the two disagree on five cells (1B, 2A, 3B, 4C, 5D). That is not an error in either: they measure different things, and it is why the Compliance Check-list Template — which cites B170 001M in its header but prints this grid — should be read carefully. Nothing in this workbook derives one rating from the other; where the ERM likelihood was carried across from B170 rather than agreed on its own terms, the rating state column says so.",
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
    /* Before the findings, deliberately: the asset system is the unit ACSA
       reports, and a reader opening the workbook should meet the ratings before
       the evidence they were agreed on. */
    systemsSheet(x),
    findingsSheet(x),
    hazardsSheet(x),
    closureSheet(x),
    walkSheet(x),
    evidenceRequestSheet(x),
    photographsSheet(x),
  ];
}

export function exportFilename(
  entityCode: string,
  visitId: string,
  kind: string,
  ext = "xlsx"
): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return `${entityCode}_${visitId}_${kind}_${stamp}.${ext}`;
}
