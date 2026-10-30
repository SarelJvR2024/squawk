/** What Squawk writes back to the portal, and what it refuses to.
 *
 *  Two lists and one document library, named by the register itself:
 *
 *    meta.keys — "checkpoints[].id is the portal key (Check-points list, Title
 *    column); priorFindings2025[].portalId is the Findings list Title. Keep
 *    both unchanged in Squawk so results can sync back."
 *
 *  Everything below hangs off that sentence. Title is the join, in both
 *  directions, which is why `checkpoints[].id` and `priorFindings2025[].portalId`
 *  have been preserved verbatim since the register was vendored.
 *
 *  THE THREE RULES THIS FILE EXISTS TO ENFORCE
 *
 *  1. A rating nobody agreed is not a rating. `ermConfirmed` gates every rating
 *     field. A severity the assistant proposed and a person never looked at
 *     must not appear in a portal that feeds the Audit & Risk Committee — it
 *     would be indistinguishable from a judgement once it is in there.
 *
 *  2. A blank status is NOT compliant. A check nobody answered is left alone.
 *     Writing "" into a compliance column turns "we did not get to it" into
 *     "we looked and it was fine", and no reader could tell afterwards.
 *
 *  3. Nothing is written twice. Every write is matched on Title first and
 *     PATCHed if it is there. Running the sync a second time produces the same
 *     portal, not a doubled one.
 *
 *  WHICH RATING GOES IN. The portal rates on ACSA's ERM instrument, not on
 *  B170 001M. That is measured, not assumed: run both matrices over all 56
 *  rateable prior findings and ERM reproduces 54, B170 only 42 — and 13 of
 *  B170's 14 misses land exactly on the five cells where the two instruments
 *  disagree (1B, 3B, 4C). If the portal were B170 those are the cells it would
 *  get RIGHT. So the ERM consequence, likelihood, priority and tolerance are
 *  what go back. The B170 rating stays in the workbook, where the safety case
 *  reads it.
 *
 *  AND IN THE PORTAL'S OWN WORDS. The portal spells its scales "C - Significant"
 *  and "3 - Likely". Those exact strings are DERIVED from the vendored register
 *  below rather than typed out here, so they cannot drift from what is actually
 *  in the list.
 *
 *  A note for whoever reads this next to src/app/api/assist/route.ts, where a
 *  near-identical looking set of words is a documented DEFECT: these are not
 *  the same thing. Telling a model that B170 001M's likelihood 3 means "Likely"
 *  inverts its meaning — B170's level 3 is "Remote", occurrence history, and an
 *  opinion given against the wrong word is worthless. Writing the portal's own
 *  string back into the portal's own column is a round trip. One is a
 *  description of a scale; the other is a value in a vocabulary that belongs to
 *  somebody else. */

import priorRaw from "@/data/priorFindings.json";
import { localDate } from "./attendance";
import * as erm from "./erm";
import { photoFilename } from "./photos";
import { signatureFilename } from "./signatures";
import { portalIdFor, siteCodeFor, siteFor } from "./sites";
import { apologiesOf } from "./attendanceRegister";
import { MEDIUM_LABEL } from "./evidence";
import { bandFor, BAND_META } from "./risk";
import type {
  AdHocItem,
  AnswerLibrary,
  Attachment,
  AttendanceRegister,
  Check,
  EvidenceItem,
  Finding,
  ErmConsequence,
  ErmLikelihood,
  Hazard,
  MitigationAction,
  PriorFinding,
  ProgressNote,
  Response,
  Signature,
  SystemAssessment,
  Verification,
} from "./types";

/* ------------------------------------------------- the portal's vocabulary */

/** The severity and likelihood strings, read off the register rather than
 *  written here.
 *
 *  All ten are present in the real portal data, so nothing is invented — which
 *  matters, because inventing ACSA's wording is exactly the thing this project
 *  does not do. If a level ever stops appearing in the register this map loses
 *  it and the sync reports the gap rather than guessing a replacement. */
function observed(field: "severity" | "likelihood"): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of priorRaw as unknown as PriorFinding[]) {
    const v = (p as unknown as Record<string, string>)[field];
    if (typeof v === "string" && v.trim()) m.set(v.trim().charAt(0), v.trim());
  }
  return m;
}

const SEVERITY_WORDS = observed("severity");
const LIKELIHOOD_WORDS = observed("likelihood");

/** ERM's consequence axis runs 5 (Catastrophic) down to 1 (Minor); the portal's
 *  runs A down to E. They map by position.
 *
 *  AND THE WORDS ARE ALREADY THE SAME ONES. ERM's own labels are "4 - Critical"
 *  and "3 - Significant"; the portal's are "B - Critical" and "C - Significant".
 *  Same vocabulary, different index. That is a fourth independent confirmation
 *  that the portal rates on ERM, and it sharpens what the assist-route defect
 *  actually was: not somebody inventing a generic scale, but somebody
 *  describing ERM's scale and labelling it B170 001M. B170's level 3 is
 *  "Remote" — occurrence history — and ERM's level 3 is "Likely" — a
 *  probability band. Telling a model the second while naming the first inverts
 *  the meaning, which is exactly why that fix mattered.
 *
 *  So this conversion changes the index and nothing else. If the two ever stop
 *  agreeing on the words, `portalSeverity` returns null rather than writing a
 *  string the portal does not use. */
const CONSEQUENCE_LETTER: Record<ErmConsequence, string> = {
  "5 - Catastrophic": "A",
  "4 - Critical": "B",
  "3 - Significant": "C",
  "2 - Moderate": "D",
  "1 - Minor": "E",
};

/** The word after the index, "4 - Critical" -> "critical". */
const wordOf = (s: string) => s.split("-").slice(1).join("-").trim().toLowerCase();

export function portalSeverity(c: ErmConsequence | null | undefined): string | null {
  if (!c) return null;
  const letter = CONSEQUENCE_LETTER[c];
  const portal = letter ? SEVERITY_WORDS.get(letter) : undefined;
  if (!portal) return null;
  /* Refuse rather than write a string the portal does not use. If ACSA
     rewords one axis and not the other, a silent mismatch here would put a
     value in the list that no view or filter matches — which looks synced and
     is not. */
  return wordOf(portal) === wordOf(c) ? portal : null;
}

export function portalLikelihood(l: ErmLikelihood | null | undefined): string | null {
  if (!l) return null;
  const portal = LIKELIHOOD_WORDS.get(String(l).charAt(0));
  if (!portal) return null;
  return wordOf(portal) === wordOf(l) ? portal : null;
}

/* ------------------------------------------------------------ the columns */

/** The logical fields the sync knows how to write, and the display names a
 *  SharePoint list might carry them under.
 *
 *  Matched case- and space-insensitively against the list's ACTUAL columns at
 *  run time. Nothing here is an internal name and nothing here is guessed into
 *  a write: a logical field whose column is not present is reported in the plan
 *  and simply not written. That is deliberate — a portal with no Progress
 *  column should still be able to receive the ratings. */
export const FIELD_CANDIDATES: Record<string, string[]> = {
  title: ["Title"],
  discipline: ["Discipline"],
  assetSystem: ["Asset system", "Asset System", "AssetSystem"],
  observation: ["Observation", "Finding", "Description"],
  severity: ["Severity", "Consequence"],
  likelihood: ["Likelihood", "Probability"],
  riskPriority: ["Risk priority", "Risk Priority", "Priority"],
  tolerance: ["Tolerance", "Risk rating", "Risk Rating"],
  status: ["Status"],
  dateRaised: ["Date raised", "Date Raised", "Raised"],
  rootCause: ["Root cause", "Root Cause"],
  treatment: ["Risk treatment", "Risk Treatment", "Treatment"],
  owner: ["Owner", "Responsible", "Responsible person"],
  targetDate: ["Target date", "Target Date", "Due date"],
  progress: ["Progress/Update", "Progress / Update", "Progress", "Update"],
  /* THE FOLLOW-UP SCREEN'S OWN "evidence requested" — Verification.
     evidenceRequested — asked against a CARRIED finding, not the Checks
     screen's own evidence-request chips (those fold into `observation`
     above and never had a column of their own). See Verification.
     evidenceRequested's doc comment in types.ts: "both sections required",
     the two reading as a pair with `evidence`/`treatment` rather than one
     box doing both jobs. Aliases say "follow-up"/"outstanding" so a portal
     operator never files this under the Checks-screen sentence. */
  evidenceRequested: ["Evidence requested (follow-up)", "Evidence requested", "Evidence outstanding"],
  /* THE ACSA DISCUSSION LOG — Verification.discussionLog — a separate,
     dated, append-only log from `progress` above, for the conversation
     itself rather than what moved. Same ProgressNote shape as `progress`,
     flattened the same way via flattenProgress(). See Verification.
     discussionLog's doc comment in types.ts. */
  discussionLog: ["ACSA discussion log", "Discussion log", "Discussion Log"],
  /* Verification.evidencePending — DELIBERATELY SEPARATE from Response.
     evidencePending below: this one is about whether the proof a CARRIED
     finding is waiting on has arrived, not about this visit's own
     check-point answer. See Verification.evidencePending's doc comment.
     Declared here for completeness, but — same as Response.evidencePending,
     which has no entry of its own below for the same reason — no portal
     column takes a flag cleanly, so it is folded into the row's text (the
     last-cycle findings loop's `treatment`) rather than written as its own
     value. */
  evidencePending: ["Evidence pending (follow-up)", "Follow-up evidence pending"],
  compliance: ["Compliance", "Result", "Outcome"],
  /* THE INSPECTION SCREEN'S OWN VERDICT, SEPARATE FROM `compliance` ABOVE.
     See Response.fieldCompliance's own doc comment in types.ts — this is the
     walk's own OutcomeControl answer, a second independent axis on the same
     check, deliberately never pulled through to or from the Checks screen's
     own verdict. It never had a column at all until now, so a portal reader
     saw only `compliance` (the desk half) and had no way to tell the two
     apart even once this exists — hence aliases that read unambiguously as
     the OTHER column, not a rename of it. `null` (not yet answered on the
     walk) is sent through as-is, same as `evidenceVerdict` below — a
     genuinely unset verdict must not be mistaken for a cleared one. */
  fieldCompliance: ["Field compliance", "Field Compliance", "Inspection compliance", "Site verdict"],
  /* THE EVIDENCE QUESTION, SEPARATE FROM THE CHECK'S OWN VERDICT. Replaced
     the chip-picking "Evidence to request" tab (never synced) — see the
     note at the checkpoints loop's values object in buildPlan(). */
  evidenceProves: ["Evidence proves", "What evidence proves", "What the evidence proves"],
  evidenceVerdict: ["Evidence verdict", "Evidence compliance", "Evidence outcome"],
  /* HAS THE PROOF BEEN PRODUCED — a different question again from
     evidenceVerdict/evidenceProves above (what the evidence SAYS once it
     exists) and from the older evidencePending flag (folded into
     `observation`, below). Added 2 October 2026 alongside
     Response.evidenceStatus and never synced before now. `evidenceStatusNote`
     carries whichever of evidenceStatusNote/evidencePendingNote is the
     active one for the current status — see the checkpoints loop. */
  evidenceStatus: ["Evidence status", "Evidence Status", "Evidence availability"],
  evidenceStatusNote: ["Evidence status note", "Evidence note", "What is outstanding"],
  /* ONE READ, instead of the observation, evidenceProves and findings columns
     above being three places a reader assembles the same picture by hand.
     Written only by the "AI merge" action in ExportPanel — see
     Response.combinedComment's own doc comment in types.ts for what feeds it
     and why it is never auto-generated. A list with no column for this is no
     different from one missing any other logical field here: reported in the
     plan, simply not written. */
  combinedComment: ["Combined comment", "Combined Comment", "Merged comment", "Summary"],
  auditor: ["Auditor", "Assessed by", "Captured by"],
  assessedOn: ["Assessed on", "Date assessed", "Assessed"],
  reference: ["Reference", "Source"],
  assets: ["Assets", "Asset", "Asset tag", "Asset ID", "Equipment"],
  /* THE PHOTOGRAPH COLUMNS. Prince Mahlangu, 17 September 2026, on the first
     five files to reach the library: "They carry no metadata at all: CheckID,
     AssetSystem, PhotographReference, CaptionSource and AttachedBy are blank,
     and the Photos column on the check-points is empty, so nothing links a
     picture to its check-point."

     He is right, and it was never written rather than written wrongly: the
     upload PUT the bytes and stopped. A photograph filed under no check-point
     is an image in a folder, not evidence. His own column names lead each
     list, because those are the ones the library actually has. */
  checkId: ["CheckID", "Check ID", "Check-point", "Check point", "CheckPoint"],
  /* THE OTHER HALF OF "a photograph prints beside a finding" — Prince
     Mahlangu, 29 October 2026: a report matches EITHER this column on the
     file, or the finding's own `photos` column (hazardPhotoRefs(), on the
     Findings list) naming the file's reference. That second half already
     existed; this one did not. Only ever written when exactly one finding
     can be named without guessing — see findingIdForCheck() in buildPlan. */
  findingId: ["FindingID", "Finding ID", "Finding-ID"],
  photographReference: [
    "PhotographReference", "Photograph reference", "Photograph Reference",
    "Photo reference", "PhotoRef",
  ],
  captionSource: ["CaptionSource", "Caption source", "Caption Source"],
  attachedBy: ["AttachedBy", "Attached by", "Attached By", "Captured by", "Photographer"],
  /* "PhotoDescription" leads here too — Prince Mahlangu, 29 October 2026,
     reading the real O.R. Tambo library's column list: the column is one
     word, which `norm()`'s space/case-insensitive match cannot bridge to
     "Description" or "What it shows" below. Without it, a list built with
     that exact name reported `caption` as missing and never wrote a single
     photograph's text — the same class of silent gap as every other entry
     in this block. */
  caption: ["PhotoDescription", "Photo description", "Caption", "Description", "What it shows"],
  /* A SECOND, DELIBERATELY DUPLICATE WRITE OF THE SAME TEXT, AS ITS OWN
     FIELD — found 30 October 2026, reading the real O.R. Tambo Evidence
     library directly: it carries BOTH a "Description" column (`caption`'s
     own first match above, already correct — confirmed holding every
     synced photo's own caption, word for word) AND a separate "Description
     of subject" column that the external ACSA report tool reads from
     instead, which was empty for every synced photo because nothing ever
     wrote to it. Squawk has no way to know which of a site's own columns a
     downstream tool was built against, so rather than guess which one is
     "the real one" and risk drifting out of sync with the report the
     moment that guess is wrong, `evidenceValues()` below sends the
     identical string to both logical fields. Each resolves independently
     against ITS OWN candidates (mapFields never shares a hit across keys),
     so a library with only one of the two columns gets exactly the one
     write it has room for and reports the other as missing, same as any
     column a site genuinely does not have — never a forced second write
     onto the column `caption` already claimed. */
  descriptionOfSubject: ["Description of subject", "Description of Subject"],
  location: ["Location", "Where", "Where taken"],
  takenAt: ["TakenAt", "Taken at", "Taken On", "Date taken", "Photograph date"],
  /* WHAT the photograph is of, not where it was taken — an auditor fills
     both in at capture time (Attachment.assetName/assetRef) and the findings
     view shows them folded into the same line as Location, so it reads as
     synced the same way. It was not: these two never had a column of their
     own and were silently dropped. Separate from `assets` below, which is
     the HAZARD's register asset tags on the Findings list — this is the
     free-text plate name/number on one photograph, on the Evidence library. */
  assetName: ["Asset name", "Asset Name"],
  assetRef: ["Asset ref", "Asset Ref", "Asset reference", "Asset number"],
  /* On the CHECK-POINT row, not on the file: the references of every
     photograph filed against that check, so a reader on the check-point can
     see there is evidence and what it is called. The other half of Prince's
     second point. */
  photos: ["Photos", "Photographs", "Photograph"],
  /* A LINK, NOT A REFERENCE. The Photos column names the photographs; this one
     gets you to them.
     Sarel, 17 September 2026, choosing it over attaching the files: a reader on
     a Findings row saw "KSIA-ELE-001_P01" as text and had three or four clicks
     to the image. Attaching the real files would have meant a tenant-wide
     SharePoint write scope in a browser token, a sync that could no longer be
     safely re-run, and every photograph stored twice. A link is one click and
     costs none of that.
     Deliberately NOT sharing a candidate with `photos` — "Evidence" used to be
     on both and two logical fields resolving to one column means the second
     quietly overwrites the first. */
  evidenceLink: ["EvidenceLink", "Evidence link", "Evidence folder", "Evidence", "Photos link"],

  /* THE ATTENDANCE REGISTER'S OWN COLUMNS. One row per person — attendee or
     apology — so a reader on the portal can filter and count people the way
     registerSheet's workbook rows already let them. `title`, `location` and
     `status` are shared with the lists above on purpose: the same word means
     the same thing everywhere in this file. */
  registerDate: ["Date"],
  time: ["Time"],
  purpose: ["Purpose"],
  name: ["Name"],
  organisation: ["Organisation", "Organization", "Company", "Employer"],
  role: ["Role", "Designation"],
  phone: ["Phone", "Phone number", "Cell", "Contact number"],
  email: ["Email", "Email address"],
  signed: ["Signed", "Signature"],
  apologyReason: ["Apology reason", "Apology Reason", "Reason"],

  /* THE EVIDENCE LOG'S OWN COLUMNS. TK-003 form 7 — what ACSA's document was,
     who gave it and took it back, and (the point of the whole exercise, Sarel:
     "maintain the link to the audit checks") which check-points it bears on.
     `title` here is still the join key, same as every other list — the
     document's own name goes in `documentTitle`. */
  documentTitle: ["Document title", "Document Title", "Title of document"],
  documentNo: ["Document No", "Document no.", "Document Number", "Doc No"],
  revision: ["Revision", "Rev"],
  documentDate: ["Document date", "Document Date"],
  requestedAt: ["Requested", "Date requested", "Requested on"],
  requestedFrom: ["Requested from", "Requested From"],
  receivedAt: ["Received", "Date received", "Received on"],
  receivedFrom: ["Received from", "Received From"],
  receivedBy: ["Received by", "Collected by"],
  medium: ["Medium"],
  originalOrCopy: ["Original or copy", "Original/Copy", "Original"],
  returnedAt: ["Returned", "Date returned"],
  returnedTo: ["Returned to"],
  unavailable: ["Unavailable"],
  unavailableReason: ["Unavailable reason", "Reason"],
  /* PLURAL, and deliberately not sharing a candidate with the photo library's
     singular `checkId` — one evidence item can bear on several check-points,
     and folding it into `checkId` would make the second one quietly overwrite
     the first. */
  checkPoints: ["Check-points", "Check points", "Checkpoints", "Related check-points"],
  notes: ["Notes", "Note", "Comments"],

  /* THE ASSET RISK LIST'S OWN COLUMNS. One row per (discipline, asset system)
     pair — the same rows systemsSheet's workbook export already derives by
     grouping the register's own checks. `severity`/`likelihood` here are
     B170 001M, not ERM — this is a new list with no ACSA-authored vocabulary
     of its own to honour, unlike the Findings list's rating columns, so the
     register's own words go across untranslated. */
  band: ["Band", "Risk band", "Rating"],
  strategy: ["Treatment strategy", "Risk treatment strategy", "Strategy"],
  ratingAgreed: ["Rating agreed", "Agreed"],
  rationale: ["Why that cell", "Rationale", "Why", "Justification"],
  events: ["Possible hazardous events", "Possible events", "Hazardous events"],
  /* Added 14 October 2026 for the FAOR hazard-mapping import, which carries
     this per asset system (SystemAssessment.directionOfRisk) and had no
     portal column to land on until now. */
  directionOfRisk: ["Direction of risk", "Direction of risk (inspection and maintenance)"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** WHAT THE PORTAL HAS TO LOOK LIKE, in one place.
 *
 *  The lists Squawk writes to, the columns it needs in each, and the names it
 *  will accept for them used to be three facts in two files: the field lists
 *  sat in SyncPanel, the list-name patterns were regexes inline in its reader,
 *  and FIELD_CANDIDATES was here. Whoever builds the SharePoint site needs all
 *  three and has to be told them EXACTLY — a column called something Squawk
 *  does not recognise is silently skipped — so they are one export now, and the
 *  readiness screen renders them from this rather than from a list somebody
 *  typed out beside it. */

/** By display name, because internal names are `field_7` and nobody builds a
 *  list to those. A space is allowed where a hyphen is: SharePoint's own new-
 *  list dialog will happily produce "Check points". */
export const LIST_NAMES = {
  checkpoints: /^check[-\s]?points?$/i,
  findings: /^findings?$/i,
  /** Not anchored: this one matches a library's name loosely on purpose —
      "Documents", "Shared Documents" and "Evidence" are all the same thing
      here, and a site has exactly one of them worth writing photographs to. */
  evidence: /document|shared|evidence/i,
  attendance: /^attendance([-\s]?registers?)?$/i,
  /** TK-003 form 7 — distinct from `evidence` above, which is the photo
   *  library. A list, not a drive: rows with fields, not uploaded files. */
  evidenceLog: /^(evidence\s*(log|register)|document\s*(and|&)?\s*evidence\s*(collection)?\s*log)s?$/i,
  assetRisk: /^asset\s*(risk|systems?|assurance)(\s*register)?$/i,
} as const;

export const CHECK_FIELDS = [
  "title", "discipline", "assetSystem", "compliance", "observation",
  "evidenceProves", "evidenceVerdict", "evidenceStatus", "evidenceStatusNote",
  "auditor", "assessedOn", "photos", "evidenceLink",
] as const;

/** One row per PERSON — attendee or apology — not per register. Mirrors
 *  `attendanceRegisterSheet` in exports.ts exactly: the same columns, the
 *  same "apologies get the same columns, not a second list" choice, so a
 *  reader moving between the workbook and the portal finds the same shape
 *  in both. */
export const ATTENDANCE_FIELDS = [
  "title", "registerDate", "time", "purpose", "location",
  "name", "organisation", "role", "phone", "email",
  "status", "signed", "apologyReason",
] as const;

/** One row per DOCUMENT — TK-003 form 7, the chain-of-custody log, not the
 *  checks it bears on. `checkPoints` is what keeps the link alive. */
export const EVIDENCE_LOG_FIELDS = [
  "title", "documentTitle", "documentNo", "revision", "documentDate",
  "requestedAt", "requestedFrom", "receivedAt", "receivedFrom", "receivedBy",
  "medium", "originalOrCopy", "returnedAt", "returnedTo",
  "unavailable", "unavailableReason", "checkPoints", "signed", "notes",
] as const;

/** One row per (discipline, asset system) pair — same grouping systemsSheet's
 *  workbook export already does over the register's own checks. */
export const ASSET_RISK_FIELDS = [
  "title", "discipline", "assetSystem", "severity", "likelihood", "band",
  "strategy", "ratingAgreed", "rationale", "rootCause", "treatment", "owner",
  "targetDate", "events", "auditor", "assessedOn", "notes",
] as const;

/** The columns on the EVIDENCE LIBRARY itself — metadata on the uploaded file,
 *  not on a list row. Every one of these is something the library cannot
 *  reconstruct from the file: which check-point the photograph answers, what it
 *  shows, whether a person or the assistant wrote that, and who attached it.
 *
 *  A library with no `checkId` on its files is a folder of JPEGs. That is what
 *  the first upload produced, and the reason this list exists. */
export const EVIDENCE_FIELDS = [
  "checkId", "findingId", "photographReference", "discipline", "assetSystem", "caption",
  "descriptionOfSubject",
  "captionSource", "attachedBy", "location", "takenAt", "assetName", "assetRef",
] as const;

export const FINDING_FIELDS = [
  "title", "discipline", "assetSystem", "observation", "severity", "likelihood",
  "riskPriority", "tolerance", "status", "rootCause", "treatment", "owner",
  "targetDate", "progress", "dateRaised", "assets", "photos", "evidenceLink",
] as const;

/** The column contract, for a person to build against: the name to create, and
 *  the other names that would also be matched. Derived from FIELD_CANDIDATES,
 *  so a change to what the sync looks for changes what the screen asks for. */
export function columnContract(
  fields: readonly string[]
): { key: string; create: string; alsoAccepts: string[] }[] {
  return fields.map((key) => {
    const names = FIELD_CANDIDATES[key] ?? [];
    return { key, create: names[0] ?? key, alsoAccepts: names.slice(1) };
  });
}

export interface FieldMap {
  /** logical name -> the list's INTERNAL column name. */
  resolved: Record<string, string>;
  /** Logical names this list has no column for. Reported, never guessed. */
  missing: string[];
  /** logical name -> the options a Choice column will accept, read off the
   *  column itself. Absent for every other kind of column. See `portalChoice`. */
  choices: Record<string, string[]>;
  /** The resolved fields whose column is a HYPERLINK, read off the column.
   *
   *  A hyperlink column does not take a string. Graph wants
   *  `{ Url, Description }`, and writing the bare URL to one is rejected — so
   *  this is not cosmetic, it decides whether the write lands at all. It is
   *  read from the column rather than assumed, because the same field is a
   *  plain text column on a list somebody built differently, and Squawk should
   *  write whichever the list actually is. */
  links: Record<string, true>;
}

/** Build the map from the list's own columns.
 *
 *  NO STRUCTURAL GUARD AGAINST TWO KEYS RESOLVING TO ONE COLUMN. Safety here
 *  is candidate-list discipline alone — see `evidenceLink`'s own comment,
 *  above, for the incident that discipline exists to prevent: two logical
 *  fields sharing a column means the second key processed silently
 *  overwrites the first in the PATCH body, with nothing in `missing` or
 *  `choiceMismatches` to say so, because both keys legitimately "resolved".
 *  `caption`/`descriptionOfSubject` are deliberately disjoint candidate
 *  lists for exactly this reason. Adding a third near-duplicate field is
 *  the moment this should become a real check rather than a comment.
 *
 *  A read-only column (Created, Modified, computed) is treated as absent: it
 *  exists, and writing to it fails the whole PATCH, which would take the rows
 *  that were fine down with it. */
export function mapFields(
  columns: {
    name: string;
    displayName: string;
    readOnly?: boolean;
    choice?: { choices?: string[] };
    hyperlinkOrPicture?: unknown;
  }[],
  wanted: string[]
): FieldMap {
  type Col = {
    name: string;
    readOnly?: boolean;
    choice?: { choices?: string[] };
    hyperlinkOrPicture?: unknown;
  };
  const byDisplay = new Map<string, Col>();
  for (const c of columns) byDisplay.set(norm(c.displayName), c);
  /* AND BY INTERNAL NAME, as a second pass.
   *
   *  Display names are what somebody building a list types, which is why they
   *  are what FIELD_CANDIDATES holds — but they are also what somebody RENAMES
   *  later, and renaming a column in SharePoint's list UI changes only the
   *  display name. The internal name it was created with never moves.
   *
   *  TPJV's Check-points and Findings lists, read on 16 September 2026, are
   *  exactly that case: the built-in Title column is still internally `Title`
   *  and still holds every portal id — the sync READ 33 of them and matched
   *  them — but its display name had been changed, so a display-only lookup
   *  reported the join key as absent and the plan offered to write rows that
   *  could never be found again.
   *
   *  Display name still wins: it is what a person deliberately chose, and a
   *  list with both an "Observation" column and something internally named
   *  `Observation` should write to the one the builder meant. This only
   *  catches what the first pass missed. */
  const byInternal = new Map<string, Col>();
  for (const c of columns) byInternal.set(norm(c.name), c);

  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  const choices: Record<string, string[]> = {};
  const links: Record<string, true> = {};
  for (const key of wanted) {
    const names = FIELD_CANDIDATES[key] ?? [];
    const hit =
      names.map((d) => byDisplay.get(norm(d))).find((c) => c && !c.readOnly) ??
      names.map((d) => byInternal.get(norm(d))).find((c) => c && !c.readOnly);
    if (hit) {
      resolved[key] = hit.name;
      if (hit.choice?.choices?.length) choices[key] = hit.choice.choices;
      if (hit.hyperlinkOrPicture) links[key] = true;
    } else missing.push(key);
  }
  return { resolved, missing, choices, links };
}

/* ------------------------------------------- speaking the column's language */

/** Turn a value into the option the column will actually accept.
 *
 *  Prince Mahlangu, 16 September 2026, reading the lists after the first real
 *  sync: "the values are the bare codes C, NC and NV instead of the portal
 *  choices 'C - Compliant', 'NC - Non-compliant' and 'NV - Not available' —
 *  the web part copes, the lists show codes."
 *
 *  THE STRINGS ARE NOT WRITTEN DOWN HERE, and that is the whole point. ACSA's
 *  choice wording appears nowhere in the vendored register, so typing it into
 *  this file would be Squawk inventing their vocabulary — the one thing this
 *  project does not do. It is read off the column instead, the same way the
 *  internal column names are, so a choice ACSA rewords is picked up by the
 *  next run rather than drifting silently.
 *
 *  THE MATCH IS ON THE CODE, not on the words: "C" finds "C - Compliant"
 *  because the option's leading code is C. An exact option is taken as-is,
 *  which is why the severity and likelihood values — already the portal's own
 *  strings, derived from the register — pass through untouched.
 *
 *  Returns null when the column offers options and NONE of them fit. That is
 *  reported rather than written: a value a Choice column will reject either
 *  fails the whole PATCH or lands as something nobody chose. */
export function portalChoice(value: string, choices: string[] | undefined): string | null {
  if (!choices?.length) return value;
  const v = value.trim();
  if (!v) return v;
  const exact = choices.find((c) => c.trim() === v);
  if (exact) return exact;
  const loose = choices.find((c) => norm(c) === norm(v));
  if (loose) return loose;
  /* The option's leading code, up to the first separator: "C - Compliant" -> C,
     "3 - Likely" -> 3. Compared case-insensitively against the whole value.
     NOT a slash: every code/description pair the register actually uses is
     split by " - ", never "/" — but "N/A - Not applicable" has a slash
     INSIDE its own code, and splitting on it broke "N/A" into "N" before
     either half got anywhere near matching "A". A real compliance value
     never wrote to a column offering this choice, silently or not: the
     code never reconstructed to "N/A" to be compared at all. */
  const code = (c: string) => c.split(/[\s\-–—:,]+/)[0]?.trim().toLowerCase() ?? "";
  const byCode = choices.find((c) => code(c) === v.toLowerCase());
  return byCode ?? null;
}

/** Every value in these rows that the column it is bound for will refuse.
 *  Shown in the plan, so a mismatch is seen before it is written. */
export function choiceMismatches(
  map: FieldMap,
  rows: PlannedRow[]
): { field: string; value: string; offered: string[] }[] {
  const seen = new Set<string>();
  const out: { field: string; value: string; offered: string[] }[] = [];
  for (const r of rows) {
    for (const [key, v] of Object.entries(r.values)) {
      const offered = map.choices[key];
      if (!offered?.length || typeof v !== "string" || !v.trim()) continue;
      if (portalChoice(v, offered) !== null) continue;
      const k = `${key}\u0000${v}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ field: key, value: v, offered });
    }
  }
  return out;
}

/** Drop anything with no column, and anything with nothing to say.
 *
 *  `undefined` and `null` are always skipped. THE EMPTY STRING DEPENDS ON THE
 *  ACTION, and that distinction is the whole point of this signature.
 *
 *  On a CREATE there is nothing underneath to lose, so an empty string is just
 *  an empty new cell.
 *
 *  On an UPDATE it would write over whatever is already in the portal. The
 *  first real sync, 16 September 2026, updated 33 rows in a list ACSA had
 *  seeded themselves — and every check answered without an observation typed
 *  carried `observation: ""`, which went in and blanked theirs. Nobody asked
 *  for that. Tapping Compliant without adding a note is not a statement that
 *  the portal's existing text should go.
 *
 *  Sarel's rule, the same day: "make updates skip empty values." So an update
 *  can fill a cell and change a cell, and can never empty one. The cost is
 *  that a deletion made in Squawk does not propagate — rare, visible in the
 *  workbook either way, and a person can clear the cell in SharePoint. That is
 *  the cheaper mistake by a distance. */
/** CAN THIS LIST BE SYNCED AT ALL?
 *
 *  `title` is not one field among the others — it is the JOIN. Every row is
 *  matched on Title in both directions: `buildPlan` reads the Titles already
 *  in the list to decide create against update, and `mintPortalId` continues
 *  the portal's own sequence from them. A list Squawk cannot write a Title to
 *  is a list where every run creates the same rows again, because nothing it
 *  wrote is findable next time.
 *
 *  That is the doubling sync — the failure this whole file's third rule exists
 *  to prevent, and the one that looks like it worked, twice, until somebody
 *  reads the report. So it is a refusal, not a warning among warnings.
 *
 *  Seen for real on 16 September 2026: TPJV's Check-points and Findings lists
 *  both came back with no writable Title, and the plan offered to write anyway.
 *  Either the column was renamed (only the display name "Title" is accepted)
 *  or it is read-only, which `mapFields` treats as absent on purpose — writing
 *  to a read-only column fails the whole PATCH and takes the good rows with
 *  it. */
export function canJoin(map: FieldMap | null | undefined): boolean {
  return !!map && !map.missing.includes("title");
}

/** The sentence to put in front of somebody, naming the list. */
export function joinRefusal(list: string): string {
  return `${list} has no writable Title column, so Squawk cannot match rows in it. Title is the key every row is found by — without it each run would create the same rows again instead of updating them. Check whether Title has been renamed (only the display name "Title" is accepted) or made read-only.`;
}

export function projectFields(
  map: FieldMap,
  values: Record<string, string | number | null | undefined>,
  /* Defaults to "create" — the permissive case — so a caller that forgets to
     say which it is cannot silently acquire the power to blank cells. */
  action: RowAction = "create"
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(values)) {
    const col = map.resolved[key];
    if (!col || v === undefined || v === null) continue;
    if (action === "update" && v === "") continue;
    /* A Choice column takes one of its own options or nothing. An option that
       matches is substituted; a value with no match is left as it is and
       reported by choiceMismatches, because guessing at a column's vocabulary
       is how "C" ended up in a list whose options read "C - Compliant". */
    if (typeof v === "string" && map.choices[key]?.length) {
      out[col] = portalChoice(v, map.choices[key]) ?? v;
      continue;
    }
    /* A HYPERLINK COLUMN DOES NOT TAKE A STRING. Graph wants
       `{ Url, Description }`, and a bare URL is rejected — so this decides
       whether the write lands, not how it looks. The description is the last
       path segment, which is the visit folder ("2026-09"), because "click
       here" in an audit record helps nobody. */
    if (typeof v === "string" && map.links[key]) {
      const label = decodeURIComponent(v.split("/").filter(Boolean).pop() ?? "Evidence");
      out[col] = { Url: v, Description: label };
      continue;
    }
    out[col] = v;
  }
  return out;
}

/* ------------------------------------------- indexing what is already there */

export interface ExistingIndex {
  /** Title -> item id, for THIS SITE'S rows only. */
  byTitle: Map<string, string>;
  /** Titles this site has more than one row for. The join is ambiguous for
   *  every one of them, so they are refused rather than resolved. */
  duplicates: string[];
  /** Rows in the list belonging to some other site. Counted, never touched. */
  foreign: number;
  /** And their Titles, so "which rows are these?" is answerable from inside
   *  Squawk rather than by hand in SharePoint. A diagnosis nobody can run
   *  without a SharePoint tutorial is a diagnosis that does not get run. */
  foreignTitles: string[];
  /** Rows whose Title is empty. Counted so a list full of them is visible. */
  untitled: number;
}

/** Build the Title -> item id index the plan joins on.
 *
 *  THIS USED TO BE THREE LINES IN THE PANEL AND IT WAS WRONG IN TWO WAYS.
 *
 *  It indexed EVERY row in the list with no notion of which site the row
 *  belonged to, and it did so into a plain Map — so two rows sharing a Title
 *  silently collapsed to whichever came last, and an update could land on a
 *  row nobody meant. Squawk is the only thing writing to that portal, and six
 *  rows for Bram Fischer came out of a King Shaka test; the mechanism is still
 *  unproven, but a join that cannot say which site a row is for, and that
 *  resolves an ambiguous key by arrival order, is not a join anybody should be
 *  betting a system of record on.
 *
 *  So: rows whose Title does not carry this site's code are not indexed at
 *  all — they cannot be matched, so they cannot be written. A Title this site
 *  has twice is recorded as ambiguous and refused. Both counts are reported,
 *  because "nothing matched" and "half the list is another airport's" are very
 *  different answers to why a plan looks wrong. */
export function indexExisting(
  rows: { title: string; id: string }[],
  siteCode: string
): ExistingIndex {
  const prefix = `${siteCode}-`.toLowerCase();
  const byTitle = new Map<string, string>();
  const seen = new Set<string>();
  const dupes = new Set<string>();
  let foreign = 0;
  const foreignTitles: string[] = [];
  let untitled = 0;

  for (const r of rows) {
    const t = (r.title ?? "").trim();
    if (!t) {
      untitled++;
      continue;
    }
    if (!t.toLowerCase().startsWith(prefix)) {
      foreign++;
      foreignTitles.push(t);
      continue;
    }
    if (seen.has(t)) dupes.add(t);
    seen.add(t);
    byTitle.set(t, r.id);
  }
  for (const t of dupes) byTitle.delete(t);

  return { byTitle, duplicates: [...dupes], foreign, foreignTitles, untitled };
}

/** Does this Title belong to the site being synced?
 *
 *  The last gate before a write. Every Title the plan mints comes from
 *  portalIdFor, which always leads with the site's code — so a row that fails
 *  this is a bug in Squawk, not a mis-typed list, and it must not reach the
 *  portal. */
export function belongsToSite(title: string, siteCode: string): boolean {
  return title.toLowerCase().startsWith(`${siteCode}-`.toLowerCase());
}

/** AN "INTERNAL WORKING AREA" ITEM NEVER SYNCS TO THE PORTAL — see
 *  AdHocItem.internal's own note in types.ts. Same rule, same name, as
 *  exports.ts's own externallyVisible — kept as a small duplicate here
 *  rather than a shared import because the two files do not otherwise
 *  import from each other and a single boolean is not worth starting to.
 *
 *  ONCE PROMOTED (`findingId` set) IT STOPS BEING EXCLUDED: hazardPhotoRefs
 *  below already walks `adhoc` by `findingId` regardless of this flag, and a
 *  promoted internal item's evidence has to keep reaching the portal through
 *  it exactly the way a promoted (non-internal) walk item's always has. */
function externallyVisible(a: AdHocItem): boolean {
  return !a.internal || !!a.findingId;
}

/* --------------------------------------------------------------- the plan */

export interface SyncInput {
  entity: string;
  visit: string;
  /** This visit's findings, used only to notice a non-compliant check with
   *  nothing written behind it. Optional so the plan builder's own tests do
   *  not have to care. */
  findings?: Finding[];
  /** This visit's inspection items. Their photographs are evidence exactly as
   *  a check's are; see the walk over them in buildPlan. */
  adhoc?: AdHocItem[];
  visitLabel: string;
  /** The display name of the document library the photographs are going into,
   *  so evidenceFolder knows whether it is already inside "Evidence". Optional
   *  because the plan builder's own tests do not resolve a library. */
  library?: string;
  /** The folder that library ALREADY has for this site, from siteFolderIn.
   *  Undefined means the sync did not find one and the site table's own
   *  spelling is used. */
  siteFolder?: string | null;
  /** The document library's own webUrl, straight off the drive rather than
   *  built from its display name — "Shared Documents" lives at
   *  /Shared%20Documents and guessing that is how a link column ends up
   *  pointing at nothing. Undefined means no link is written at all. */
  libraryUrl?: string;
  checks: Check[];
  responses: Record<string, Response>;
  /** Keyed by CHECK ID, same as useAnswers() — not `library` above, which is
   *  the SharePoint drive's display name; the two are unrelated things that
   *  happen to share an English word. Resolves `Response.evidencePicked`,
   *  `issuesPicked` and `walkaboutPicked` into the sentences the checkpoints
   *  loop folds into `observation`, the same way CheckDetail's own "compose"
   *  button would. Optional/nullable so the plan builder's own tests do not
   *  have to load the 356 kB library, and so a pick made before the library
   *  has finished loading still produces a plan — just one sync behind on
   *  those sentences, never blocked on them. */
  answerLibrary?: Record<string, AnswerLibrary> | null;
  /** The CONSOLIDATED view. The portal's Findings list receives hazards, not
   *  findings, and that is not a shortcut — see buildPlan. */
  hazards: Hazard[];
  prior: PriorFinding[];
  verifications: Record<string, Verification>;
  auditor: string;
  /** This visit's attendance registers. Optional for the same reason adhoc
   *  and findings are — the plan builder's own tests do not have to care. */
  attendanceRegisters?: AttendanceRegister[];
  /** THE ENTITY'S evidence items, not the visit's — useEvidenceItems() spans
   *  visits on purpose (an original borrowed last visit is still outstanding
   *  this one), same as the dashboard. buildPlan filters to this visit's own
   *  items itself, the same way evidenceLogSheet's export does, so an item
   *  requested two visits ago and still unreturned does not get a second,
   *  wrong-dated row here. */
  evidenceItems?: EvidenceItem[];
  /** This visit's asset-system ratings, keyed `${discipline}|${system}` —
   *  see useSystems(). Optional for the same reason the rest are. */
  systems?: Record<string, SystemAssessment>;
  /** Held back from THIS sync run, not dropped from the audit.
   *
   *  Sarel: "I captured some electrical info but didnt want to sync it yet
   *  but i want to sync everything else." A capture mistake or an answer
   *  still being checked is common, and the only tool for it before this was
   *  "sync nothing" — withholding one discipline meant withholding all of
   *  them, every time, until the one thing was ready. Checked against
   *  `Check.discipline` (check-points, and the asset-risk pairs derived
   *  from the same checks) and `Hazard.disciplines` (a hazard spanning an
   *  excluded discipline is held back whole — see the hazards loop's own
   *  note). Attendance, the evidence log and signatures carry no
   *  discipline and are never affected. Absent or empty means what it
   *  always meant: everything goes. */
  excludedDisciplines?: string[];
}

export type RowAction = "create" | "update";

export interface PlannedRow {
  /** The Title this row joins on. */
  key: string;
  action: RowAction;
  /** Existing SharePoint item id, when this is an update. */
  itemId?: string;
  /** The hazard this row came from, so a Title minted on create can be written
   *  back to it and the next sync updates instead of creating again. */
  hazardId?: string;
  /** Logical field values, before the column map is applied. */
  values: Record<string, string | number | null | undefined>;
  /** One line a person can read, so the preview means something. */
  summary: string;
}

export interface PlannedFile {
  /** The record this photograph belongs to: a check-point id for a register
   *  check, or the WALK- id for an inspection item. Informational — the upload
   *  addresses the file by name — but it is what makes the plan readable. */
  checkId: string;
  filename: string;
  /** The attachment itself, not just its local key.
   *
   *  A photograph's BYTES live in up to two places — this device's IndexedDB
   *  and the record copy — and which of them answers is not a thing the plan
   *  can know: the local key rides in the persisted JSON and crosses to every
   *  device on the audit, while the image does not. Planning on `blobKey`
   *  alone meant an auditor who joined the audit rather than taking the
   *  photographs uploaded nothing and was told the images were "no longer on
   *  this device", when the record held every one of them. */
  attachment: Attachment;
  caption: string;
  /** The library columns for this file, in the same shape as PlannedRow.values
   *  so projectFields writes both the same way. Everything the library cannot
   *  work out from the bytes: which check-point it answers, what it shows, who
   *  attached it. See EVIDENCE_FIELDS. */
  values: Record<string, string>;
  /** The day folder this file's own bytes upload into — see `dayFolder`. Not
   *  `SyncPlan.folder`: that is the visit's own folder, used for EvidenceLink;
   *  this is one day's subfolder inside it, and two files in the same plan
   *  can carry different ones. */
  folder: string;
}

/** A signature's actual mark, going to the same evidence library the
 *  photographs do — `signedCell` already puts WHO and WHEN into the
 *  attendance/evidence-log row as text; this is the image behind it.
 *
 *  Deliberately not a PlannedFile: a signature has no check-point, no
 *  discipline, no asset system — EVIDENCE_FIELDS' columns do not describe
 *  it, and writing blanks into them would be worse than writing none. The
 *  file itself, named by its own ref, is the whole point; nothing here
 *  claims the library's photograph columns for it. */
export interface PlannedSignature {
  /** The attendance or evidence-log row this mark belongs to, for the plan
   *  preview's own readability only. */
  rowKey: string;
  filename: string;
  signature: Signature;
  caption: string;
  /** The day folder this signature's own bytes upload into — see
   *  `dayFolder` and `PlannedFile.folder`'s own note on why this is not
   *  `SyncPlan.folder`. */
  folder: string;
}

export interface SyncPlan {
  checkpoints: PlannedRow[];
  findings: PlannedRow[];
  /** One row per person — attendee or apology. See ATTENDANCE_FIELDS. */
  attendance: PlannedRow[];
  /** One row per document — TK-003 form 7. See EVIDENCE_LOG_FIELDS. Not to
   *  be confused with `evidence` below, the photo library. */
  evidenceLog: PlannedRow[];
  /** One row per (discipline, asset system) pair. See ASSET_RISK_FIELDS. */
  assetRisk: PlannedRow[];
  evidence: PlannedFile[];
  /** The actual marks behind `attendance`/`evidenceLog`'s `signed` text
   *  column — see PlannedSignature. Uploaded to the same evidence library,
   *  not written as rows. */
  signatures: PlannedSignature[];
  /** Why rows were left out, in the words of somebody who might disagree. */
  skipped: { what: string; why: string; count: number }[];
  /** Things that ARE going across and should be said out loud anyway.
   *
   *  Distinct from `skipped` on purpose. Skipped is "this is not being
   *  written"; a warning is "this is being written and it will read as less
   *  than it is". Prince Mahlangu found the first one by reading the portal:
   *  fifteen non-compliant check-points with no finding behind any of them, so
   *  Energy and Demand Management came out Acceptable with a non-compliant
   *  check underneath it. Sarel's rule: warn, do not block — a non-compliant
   *  answer is still the truth and still belongs in the portal. */
  warnings: { what: string; why: string; count: number }[];
  folder: string;
}

/** ACSA's Progress/Update is ONE cell that gets typed over at every follow-up.
 *  Squawk keeps the entries with their author, date and outcome; this is
 *  where the log is flattened back into their format on the way out —
 *  their shape, our history, and nothing lost at this end.
 *
 *  THE OUTCOME. `ProgressNote.outcome` exists so "a status that moved from
 *  'Open - repeat' to 'Closed' shows WHEN it moved" (see its own doc comment
 *  in types.ts) — kept per entry rather than only on the record. It was
 *  written correctly and shown correctly in the app's own Follow-up/Closure
 *  timeline (carryforward.ts's `streamFor`), and exports.ts's own Progress/
 *  Update cell already includes it — but this flatten, the one that reaches
 *  ACSA's portal (used for Verification.progress, Hazard.progress, and
 *  Verification.discussionLog, and reused by exports.ts for the last of
 *  those), never read it. Same bug class as MitigationAction.system in
 *  flattenActions just below: a field captured and shown on-device, silently
 *  dropped on the way to the one place ACSA and management actually read. */
export function flattenProgress(notes: ProgressNote[] | undefined): string {
  if (!notes?.length) return "";
  return notes
    .map(
      (n) =>
        `${new Date(n.at).toLocaleDateString("en-ZA")} — ${n.by}${n.outcome ? ` · ${n.outcome}` : ""}: ${n.note}`
    )
    .join("\n");
}

/** A hazard (or finding) can carry several mitigating actions now, each with
 *  its own discipline, owner and date — the portal's `treatment` field is
 *  still one text cell, so this flattens the same way flattenProgress does.
 *
 *  THE SYSTEM TAG. `MitigationAction.system` (hazardPromotion.ts, the
 *  hazard-auto-merge feature) names which asset system an action was copied
 *  in from, for exactly the case `discipline` already exists to disambiguate:
 *  a hazard consolidated from 2+ asset systems. It was written correctly and
 *  shown correctly in the app's own hazard-register UI, but this flatten —
 *  the one ACSA's portal actually reads — never read it, so the portal (and
 *  the exported workbook's matching cell, exports.ts's Finding/Hazard sheets,
 *  which must stay byte-for-byte identical to this one — see their own
 *  comments) silently dropped which system each multi-system action belonged
 *  to. Same `[System]` convention `buildPromotedHazardPatch` already uses
 *  for the root-cause text it builds alongside these actions, prepended
 *  ahead of the discipline segment. */
export function flattenActions(actions: MitigationAction[] | undefined): string {
  if (!actions?.length) return "";
  return actions
    .map(
      (m) =>
        `${m.system ? `[${m.system}] ` : ""}${m.discipline ? `${m.discipline} — ` : ""}${m.action} · ${m.owner || "NO OWNER"} · ${m.dueDate || "NO TARGET DATE"} · ${m.status}`
    )
    .join("\n");
}

/** The signature as one cell — who, and when, the same text
 *  `attendanceRegister.ts`'s own `registerText()` prints in the plain-text
 *  register, so a reader moving between the portal and the printed text
 *  finds the same words. Blank for an apology: nobody signs one. */
function signedCell(s: Signature | null): string {
  if (!s) return "";
  const when = new Date(s.signedAt).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${s.signedName} · ${when}`;
}

/** `<site>-RISK-<discipline>-<system>` — DETERMINISTIC, unlike a hazard's
 *  mintPortalId. An asset system is one of a fixed, enumerable set (the
 *  register's own disciplines and systems), so the pair itself is already a
 *  stable key — no taken-set or sequence counter needed, and a re-sync finds
 *  the same row from the pair alone, every time. */
function assetRiskTitle(entityCode: string, discipline: string, system: string): string {
  const site = siteCodeFor(entityCode);
  const disc = discipline.slice(0, 3).toUpperCase() || "GEN";
  const sys = system.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "SYSTEM";
  return `${site}-RISK-${disc}-${sys}`;
}

/** The single owner or date the portal's own `owner`/`targetDate` fields
 *  expect — the first action that set one, same "good enough for one field"
 *  compromise the follow-up and review screens make for the same reason. */
function firstOwner(actions: MitigationAction[] | undefined): string {
  return actions?.find((a) => a.owner)?.owner ?? "";
}
function firstDueDate(actions: MitigationAction[] | undefined): string | null {
  return actions?.find((a) => a.dueDate)?.dueDate || null;
}

/** The evidence folder for one VISIT to one site, RELATIVE TO THE LIBRARY it
 *  is being written into: `King Shaka International Airport FALE/2026-09`.
 *
 *  THE PATH IS RELATIVE, and that word is the whole of the second fix here.
 *  The document library on the ACSA site is itself named "Evidence", and this
 *  function used to prepend `Evidence/` to a path that Graph already resolves
 *  from that library's root. The first real upload therefore landed in
 *  `.../Evidence/Evidence/King Shaka International Airport FALE/2026-09/`,
 *  which reads to anybody browsing it as a mistake, because it is one.
 *
 *  The prefix is kept when the library is called anything else — a generic
 *  "Documents" library wants its evidence in a folder of its own rather than
 *  loose among whatever else lives there. So the caller passes the name of the
 *  library it actually resolved, and this decides from that, rather than from
 *  an assumption about how the site is laid out.
 *
 *  Per site, derived from the site table so a new airport gets the same shape
 *  without anybody editing a path by hand — that part was always right.
 *
 *  NO MONTH/VISIT SEGMENT — see dayFolder below. A photograph's reference is
 *  scoped to the CHECK, not to the visit — nextPhotoRef counts the
 *  attachments on that check's response. Uploads use
 *  `conflictBehavior=replace`, deliberately, so that re-running a sync does
 *  not litter the library with `..._P01 1.jpg`. The collision that would
 *  risk — the first photograph of KSIA-ELE-001 in September 2026 silently
 *  overwritten by the first photograph of the same check in March 2027 — is
 *  what a VISIT folder originally existed to prevent (Sarel, 16 September
 *  2026: "add a audit date into the hierarchy maybe"). A DAY folder prevents
 *  it just as well, and more finely: two different visits landing on the
 *  exact same calendar date is not a real case this register has to plan
 *  for, so dayFolder below carries that guarantee now and this function no
 *  longer needs to. */
export function evidenceFolder(
  entityCode: string,
  library?: string,
  siteFolder?: string | null
): string {
  const s = siteFor(entityCode);
  /* An unknown library keeps the prefix: that is the old behaviour, and it is
     the right one for a library that is not already about evidence. */
  const nested = !/^evidence$/i.test((library ?? "").trim());
  const parts = [
    nested ? "Evidence" : "",
    (siteFolder ?? "").trim() || (s ? `${s.name} ${s.icao}` : ""),
  ].filter(Boolean);
  return parts.join("/");
}

/** `{the site's own folder}/20260915` — ONE FOLDER PER DAY, inside it, no
 *  month/visit folder in between.
 *
 *  Sarel, 7 October 2026: "create a folder for each day and put the photos
 *  in each day it was captured" — first with a visit folder still in the
 *  middle, then: "So no month folder only [site]/7 OCT 2026... wait,
 *  20261007, use this format." Every photograph and signature now files
 *  directly under the site's own folder (EvidenceLink keeps pointing there —
 *  one stable link per check-point/finding row, unaffected by which day
 *  anything inside it was captured on), in a day folder named `YYYYMMDD`.
 *
 *  `when` is the capture moment — a photograph's EXIF `takenAt` where one
 *  exists, its `createdAt` otherwise; a signature's `signedAt`, always
 *  present. `localDate` reads it in the auditor's own timezone, the same
 *  rule attendance.ts uses for every other "which day was this" question —
 *  a photograph taken just after midnight SAST must not file itself under
 *  the day before because UTC still called it that.
 *
 *  FALLS BACK TO THE SITE FOLDER, not a day folder, when `when` is not a
 *  real timestamp — `createdAt` is required on every Attachment the app
 *  writes today, but a record from before that was true, or a test fixture
 *  missing it, must not turn into a literal "NaNNaNNaN" folder in a system
 *  of record. The site folder is at least a real place; an invented date is
 *  a wrong one. */
function dayFolder(siteFolder: string, when: number): string {
  if (!Number.isFinite(when)) return siteFolder;
  /* YYYYMMDD, not YYYY-MM-DD — Sarel's own correction, mid-request. */
  const day = localDate(when).replace(/-/g, "");
  return siteFolder ? `${siteFolder}/${day}` : day;
}

/** What a sync would write against a site NOBODY HAS AUDITED YET.
 *
 *  Twice in September 2026 a sync ran while the app was set to Bram Fischer —
 *  once writing six BFIA check-point rows and once a photograph — against a
 *  site whose audit is 27 to 29 October. ACSA reads those lists: the portal's
 *  dashboard shows every site at once, so Bram Fischer read as part-audited six
 *  weeks early, and Prince asked for the rows to be reversed.
 *
 *  Nothing in the sync was wrong. The Check-points list holds all ten sites by
 *  design, the rows carried the correct BFIA prefix, and belongsToSite passed
 *  because Bram Fischer WAS the site the app was on. Every check the code had
 *  said yes. What nobody checked is whether that site has been audited yet, and
 *  that is the only question that would have caught it.
 *
 *  BEFORE THE WINDOW OPENS ONLY, and that restraint is the point. A sync after
 *  the audit is ordinary — write-ups, follow-ups, a correction in November to
 *  something captured in September — and a warning that fires on those gets
 *  dismissed by reflex within a week, which is worth less than no warning at
 *  all. Before the window is the one case that cannot be legitimate: the site
 *  has not been visited, so there is nothing to have captured.
 *
 *  Dates are compared as plain `YYYY-MM-DD` strings, deliberately. The audit
 *  window is a calendar date in South Africa, not an instant, and parsing it
 *  into a Date drags in the device's timezone to no purpose. A wrong device
 *  clock is caught separately, on the pre-flight screen. */
export interface EarlySync {
  site: string;
  icao: string;
  /** First day of the audit, `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** Whole days from today until the audit opens. Always 1 or more. */
  days: number;
  /** The month is agreed, the days are not. The warning says so rather than
   *  quoting from/to, which are the month's bounds and would read as a
   *  four-week audit nobody agreed to. */
  tbc: boolean;
}

export function syncedBeforeAudit(entityCode: string, today: string): EarlySync | null {
  const s = siteFor(entityCode);
  if (!s?.audit?.from) return null;
  const now = (today ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(now)) return null;
  if (now >= s.audit.from) return null;
  const day = 86_400_000;
  const days = Math.ceil((Date.parse(`${s.audit.from}T00:00:00Z`) - Date.parse(`${now}T00:00:00Z`)) / day);
  return { site: s.name, icao: s.icao, from: s.audit.from, to: s.audit.to, days, tbc: !!s.audit.tbc };
}

/** The folder THE LIBRARY ALREADY HAS for this site, if it has one.
 *
 *  ACSA pre-created ten folders at the top of the Evidence library, one per
 *  site, and their spelling is not Squawk's: "King Shaka International FALE",
 *  not "King Shaka International Airport FALE"; "OR Tambo International FAOR",
 *  not "O.R. Tambo International Airport FAOR"; "Corporate Office", with no
 *  code at all. Minting Squawk's own name would leave two folders per airport
 *  and no way for a reader to know which one holds the evidence.
 *
 *  Three passes, most certain first. The ICAO code is what actually identifies
 *  a site, so the second pass takes any folder ending in it — that is how a
 *  person reads these names, and it survives ACSA renaming the words in front
 *  of the code. The last pass is for Corporate Office, which has no code.
 *  Nothing matched means nothing is assumed: the caller falls back to the site
 *  table's spelling and creates it. */
export function siteFolderIn(entityCode: string, names: string[]): string | null {
  const s = siteFor(entityCode);
  if (!s) return null;
  const strip = (t: string) =>
    t.toLowerCase().replace(/\b(acsa|international|airport)\b/g, "").replace(/[^a-z0-9]/g, "");
  const withCode = strip(`${s.name} ${s.icao}`);
  const nameOnly = strip(s.name);
  const endsWithCode = new RegExp(`(^|[^a-z0-9])${s.icao}$`, "i");
  return (
    names.find((n) => strip(n) === withCode) ??
    names.find((n) => endsWithCode.test(n.trim())) ??
    names.find((n) => strip(n) === nameOnly) ??
    null
  );
}

/** The Title for a hazard that has never been in the portal.
 *
 *  The observed convention is `KSIA-ELE-P01` — site, discipline, then a
 *  sequence. A new one continues the sequence rather than restarting it, so
 *  this has to see every Title already taken; `taken` is the live list read
 *  back from SharePoint, not a guess from local state, because somebody else
 *  may have added rows since the last sync.
 *
 *  A consolidated hazard spans disciplines by nature (that is the point of
 *  consolidating). The FIRST discipline is used for the id and every one of
 *  them still goes in the Discipline column — an id has to pick one, a record
 *  does not. */
export function mintPortalId(
  entityCode: string,
  disciplines: string[],
  taken: Set<string>
): string {
  const site = siteCodeFor(entityCode);
  const disc = (disciplines[0] ?? "GEN").slice(0, 3).toUpperCase();
  const prefix = `${site}-${disc}-P`;
  let n = 0;
  for (const t of taken) {
    if (!t.startsWith(prefix)) continue;
    const got = Number(t.slice(prefix.length));
    if (Number.isFinite(got)) n = Math.max(n, got);
  }
  return `${prefix}${String(n + 1).padStart(2, "0")}`;
}

/** Build the whole plan without writing anything.
 *
 *  This is the safety property that matters most in the feature: an auditor
 *  sees every row that would be created or changed, and every row that would
 *  NOT be and why, BEFORE any request with a method other than GET is made.
 *  A sync you cannot preview is a sync you have to trust, and nobody should
 *  have to trust this one.
 *
 *  WHY HAZARDS AND NOT FINDINGS. A finding carries the B170 001M rating; only
 *  a hazard carries the ERM one, and the portal rates on ERM. That is not a
 *  convenient coincidence, it is the model: findings are what one discipline
 *  wrote up at one check-point, and the same missing fuse was PF-02 for
 *  Electrical and PF-21 for Process Safety in March 2025 — two rows, two
 *  ratings, one fuse. The hazard is the event, it is what persists year on
 *  year, and it is what the register should therefore contain. Syncing
 *  findings would put the duplication back.
 *
 *  So a finding nobody has consolidated yet does not go across, and the plan
 *  says so out loud rather than letting it look synced. */
/** WHAT A NON-COMPLIANT CHECK SAYS WHEN NOBODY TYPED ANYTHING.
 *
 *  Sarel, 16 September 2026: "it might be NC because the airport could not
 *  provide compliant evidence. So let's by default on the sync just say
 *  NC - No compliance evidence could be provided, or something like that but
 *  technically correct."
 *
 *  The "technically correct" is the whole difficulty, and the reason this is a
 *  named constant rather than a string in a template. Squawk knows exactly two
 *  things about such a check: an auditor marked it non-compliant, and nobody
 *  wrote anything down. It does NOT know that the airport was asked and could
 *  not produce evidence — that may well be what happened, and it is the most
 *  likely reading, but it is a cause nobody recorded. Writing it as though it
 *  were observed would put a claim into ACSA's system of record that no
 *  auditor made, on a row ACSA reads and acts on.
 *
 *  So the sentence states what IS known and nothing more. It is still useful:
 *  it tells a reader the gap is real rather than a sync fault, and it tells
 *  the audit team the detail is owed.
 *
 *  IT ALSO CLOSES A HOLE THIS FILE OPENED EARLIER TODAY. Since an update no
 *  longer writes an empty string, a check that went non-compliant with no
 *  observation would otherwise leave whatever the portal already had sitting
 *  underneath the new answer — old text under a fresh NC, which reads as
 *  though somebody wrote it about this audit. A placeholder is better than
 *  either a blank or a stranger's sentence. */
export const NC_WITHOUT_DETAIL =
  "Non-compliant. No supporting evidence or observation was recorded during the audit — detail to follow from the audit team.";

/** `Response.evidenceStatus`, spelled out — mirrors CheckDetail's own
 *  EVIDENCE_STATUSES hints, stated as a fact about the record rather than as
 *  an instruction to the auditor (CheckDetail's "attach what was handed
 *  over" is guidance for the tablet, not something a portal reader needs).
 *  Kept here rather than imported from the component, same as
 *  NC_WITHOUT_DETAIL above: this file speaks for itself and does not reach
 *  into React to do it. */
const EVIDENCE_STATUS_TEXT: Record<string, string> = {
  noneAvailable: "No evidence available — nothing exists to collect for this check.",
  specificNotAvailable:
    "Specific evidence not available — something was asked for and could not be produced.",
  toBeProvided: "Evidence pending — to be provided by ACSA after the visit.",
  providedForReview: "Evidence provided for review.",
};

/** Mirrors assist.ts's own private `lower()` — a walkabout option's label
 *  reads as a mid-sentence clause ("On the walkabout: lights were off..."),
 *  the same way composeObservation() folds it in. */
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Mirrors assist.ts's own private `list()` — "A, B and C" rather than a
 *  bare comma join, so the resolved sentence reads the same whether it came
 *  from Compose on the tablet or from this file at sync time. */
function list(xs: string[]): string {
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** The library columns for one photograph.
 *
 *  `captionSource` is spelled out rather than passed through as the stored
 *  token: "assistant" in a portal column read by ACSA should say what it means,
 *  because the difference between a caption an auditor wrote and one a model
 *  proposed is exactly the kind of thing that gets lost and should not be.
 *  Absent means an auditor typed it, which is the same rule the export uses. */
function evidenceValues(
  a: Attachment,
  checkId: string,
  discipline: string,
  assetSystem: string,
  /** The consolidating hazard's own portal key, or "" when there is none to
   *  write — see findingIdForCheck() and the walk-item/Verification call
   *  sites, each of which decides this for its own kind of photograph
   *  rather than this function guessing from `checkId` alone. */
  findingId: string
): Record<string, string> {
  return {
    checkId,
    findingId,
    photographReference: a.ref ?? "",
    discipline,
    assetSystem,
    caption: a.caption?.trim() ?? "",
    /* Same string as `caption`, as its own field — see descriptionOfSubject's
       own candidates, above, for why this is deliberately written twice. */
    descriptionOfSubject: a.caption?.trim() ?? "",
    captionSource:
      a.captionSource === "assistant"
        ? "Assistant, accepted by the auditor"
        : a.caption?.trim()
          ? "Auditor"
          : "",
    attachedBy: a.createdBy ?? "",
    location: a.location?.trim() ?? "",
    takenAt: a.takenAt ? new Date(a.takenAt).toISOString() : "",
    assetName: a.assetName?.trim() ?? "",
    assetRef: a.assetRef?.trim() ?? "",
  };
}

/** THE PHOTOGRAPHS BEHIND A HAZARD, by reference.
 *
 *  Sarel, 17 September 2026, with a screenshot of the portal's Findings list:
 *  "findings tab is where the info goes." He is right that this is where ACSA
 *  reads — a check-point row is the register, a finding is the thing somebody
 *  has to act on — and a finding whose evidence you cannot find is an assertion.
 *
 *  Three hops, because that is genuinely how far apart they sit — and there
 *  are two different first hops, not one:
 *    - a REGISTER finding: a photograph hangs off a CHECK, the finding names
 *      the check it came from (`checkId`), and a hazard consolidates findings.
 *    - a WALK finding: a photograph hangs off an AD-HOC ITEM instead (there is
 *      no check — nothing on the register to hang it off), the item names the
 *      finding it was raised into (`findingId`), and the same hazard
 *      consolidation follows. This half was missing until now: the upload
 *      itself worked (see the ad-hoc evidence loop above), but nothing ever
 *      walked back from a hazard to an ad-hoc item's photographs, so a walk
 *      finding's evidence reached the library with no Photos/EvidenceLink
 *      reference pointing at it from the Findings list at all.
 *
 *  Squawk never attached a photograph to a hazard directly and should not
 *  start — the photograph is evidence of what was seen at one check or one
 *  walk item, and a hazard spanning four of them would otherwise claim all
 *  four images as one observation.
 *
 *  Deduplicated and ordered: two findings on one check are ordinary after a
 *  consolidation, and the same reference twice in a cell reads as two
 *  photographs. */
function hazardPhotoRefs(
  h: Hazard,
  findings: Finding[] | undefined,
  responses: Record<string, Response>,
  adhoc: AdHocItem[] | undefined
): string[] {
  if (!h.findingIds?.length) return [];
  const mine = new Set(h.findingIds);
  const refs = new Set<string>();
  for (const f of findings ?? []) {
    if (!mine.has(f.id) || !f.checkId) continue;
    for (const a of responses[f.checkId]?.attachments ?? []) {
      if (a.kind !== "photo" || a.unavailable || !a.ref) continue;
      if (!a.blobKey && !a.cloudUrl) continue;
      refs.add(a.ref);
    }
  }
  for (const item of adhoc ?? []) {
    if (!item.findingId || !mine.has(item.findingId)) continue;
    for (const a of item.attachments ?? []) {
      if (a.kind !== "photo" || a.unavailable || !a.ref) continue;
      if (!a.blobKey && !a.cloudUrl) continue;
      refs.add(a.ref);
    }
  }
  return [...refs].sort();
}

/** The URL of this visit's evidence folder, for the link column.
 *
 *  Built from the library's own webUrl plus the folder the plan is already
 *  writing to, so the link and the upload cannot disagree — the alternative was
 *  assembling it from the library's DISPLAY name, and "Shared Documents" lives
 *  at /Shared%20Documents.
 *
 *  Each segment is encoded separately: the folder is "King Shaka International
 *  FALE/2026-09" and encodeURI would leave the slash alone but so would
 *  encodeURIComponent on the whole string mangle it. */
function evidenceFolderUrl(libraryUrl: string | undefined, folder: string): string {
  const base = (libraryUrl ?? "").replace(/\/+$/, "");
  if (!base) return "";
  const path = folder.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return path ? `${base}/${path}` : base;
}

export function buildPlan(
  x: SyncInput,
  existing: {
    checkpoints: Map<string, string>;
    findings: Map<string, string>;
    attendance?: Map<string, string>;
    evidenceLog?: Map<string, string>;
    assetRisk?: Map<string, string>;
  },
  unconsolidatedFindings = 0
): SyncPlan {
  const folder = evidenceFolder(x.entity, x.library, x.siteFolder);
  const folderUrl = evidenceFolderUrl(x.libraryUrl, folder);
  /* See SyncInput.excludedDisciplines. A Set, read in every loop below that
     has a discipline to check against — never rebuilt per check. */
  const excluded = new Set(x.excludedDisciplines ?? []);
  /* ONLY THIS ENTITY'S OWN RECORDS, even if the caller handed us more.
     checks/prior are already a pure function of x.entity (checksAt(),
     priorFindingsAt()) and adhoc/responses/systems come from a hook already
     scoped to the entity+visit in view (useAdhoc(), useResponses(), …) — but
     findings, hazards, attendance registers and evidence items each carry
     their OWN entity tag, so this file does not have to trust every future
     caller to never pass a second airport's records by mistake. One real
     incident already got past a narrower guard (see excludedDisciplines'
     own ad-hoc gap, fixed the same day as this) — this is the same kind of
     mistake in a different shape, closed the same way: checked here, not
     only at the call site. */
  const sameEntity = <T extends { entity: string }>(rows: T[] | undefined): T[] =>
    (rows ?? []).filter((r) => r.entity === x.entity);
  const entityFindings = sameEntity(x.findings);
  const entityHazards = sameEntity(x.hazards);
  const entityAttendanceRegisters = sameEntity(x.attendanceRegisters);
  const entityEvidenceItems = sameEntity(x.evidenceItems);

  /* A PHOTOGRAPH'S OWN FindingID COLUMN — Prince Mahlangu, 29 October 2026:
   *  "A photograph prints beside a finding, in every report, only when the
   *  file's Finding ID column holds the finding's ID … or the finding's
   *  Photograph references column lists the file's reference." The second
   *  half already exists (`hazardPhotoRefs()` below, written into the
   *  Findings row's own `photos` column); this is the first half, and it
   *  needs a hazard's portal key — the exact Title the Findings-list row
   *  below mints — BEFORE the check-point loop a few lines down runs, since
   *  a check's photographs are evaluated well ahead of the hazards loop
   *  that would otherwise mint it.
   *
   *  So the minting happens HERE instead, once, in the same order and off
   *  the same `taken` set the hazards loop used to carry on its own — see
   *  that loop's own comment, a few hundred lines down, where it now just
   *  reads this map rather than minting a second time. Two mints of the
   *  same deterministic function over the same inputs would always agree,
   *  but a lookup cannot silently drift from a second copy of the logic
   *  the way two copies of the SAME loop eventually do in this file. */
  const hazardKeyTaken = new Set(existing.findings.keys());
  const hazardPortalKey = new Map<string, string>();
  for (const h of entityHazards) {
    /* Mirrors the real loop's own hold-back, below: an excluded hazard
       never reaches the portal this run, so it mints no key here either —
       a photograph behind it must read as unlinked, not as linked to a key
       that will never actually exist on the list. */
    if (h.disciplines.some((d) => excluded.has(d))) continue;
    const key = h.portalId ?? mintPortalId(x.entity, h.disciplines, hazardKeyTaken);
    hazardKeyTaken.add(key);
    hazardPortalKey.set(h.id, key);
  }
  /* finding.id -> the hazard it was consolidated into's portal key, for
   *  every finding that actually made it into a (non-excluded) hazard. A
   *  finding nobody has consolidated yet, or whose hazard was held back,
   *  is simply absent — findingIdForCheck() below reads that as "nothing
   *  to write", not as a reason to guess. */
  const findingPortalKey = new Map<string, string>();
  for (const h of entityHazards) {
    const key = hazardPortalKey.get(h.id);
    if (!key) continue;
    for (const fid of h.findingIds ?? []) findingPortalKey.set(fid, key);
  }
  /** A CHECK-POINT'S photographs carry no finding of their own — a check's
   *  attachments are captured at the check, not per-issue — so a photograph
   *  can only be attributed to ONE finding when the check behind it has
   *  exactly one. Two findings on the same check (two issues raised against
   *  it) leaves every one of its photographs unable to say which finding it
   *  is evidence for; the finding's own `photos` column (hazardPhotoRefs())
   *  already carries this correctly at the hazard level in that case, so
   *  nothing is lost by leaving the file's own column blank rather than
   *  guessing between them. */
  const findingsByCheckId = new Map<string, Finding[]>();
  for (const f of entityFindings) {
    if (!f.checkId) continue;
    const list = findingsByCheckId.get(f.checkId) ?? [];
    list.push(f);
    findingsByCheckId.set(f.checkId, list);
  }
  const findingIdForCheck = (checkId: string): string => {
    const fs = findingsByCheckId.get(checkId);
    if (!fs || fs.length !== 1) return "";
    return findingPortalKey.get(fs[0].id) ?? "";
  };
  const checkpoints: PlannedRow[] = [];
  const findings: PlannedRow[] = [];
  const attendance: PlannedRow[] = [];
  const evidenceLog: PlannedRow[] = [];
  const assetRisk: PlannedRow[] = [];
  const evidence: PlannedFile[] = [];
  const signatures: PlannedSignature[] = [];
  const skipped: SyncPlan["skipped"] = [];
  const warnings: SyncPlan["warnings"] = [];

  /* --- check-points: only the ones somebody actually answered --------- */
  let unanswered = 0;
  let excludedChecks = 0;
  for (const c of x.checks) {
    /* HELD BACK, NOT LOST. See SyncInput.excludedDisciplines. Checked before
       `unanswered` so a held-back discipline reports as held back rather
       than as if nobody had answered it — the two reasons read very
       differently to somebody reviewing the plan. */
    if (excluded.has(c.discipline)) {
      excludedChecks++;
      continue;
    }
    const r = x.responses[c.id];
    if (!r || !r.compliance) {
      unanswered++;
      continue;
    }
    const key = portalIdFor(x.entity, c.id);
    const itemId = existing.checkpoints.get(key);
    /* THE THREE LIBRARY PICKS, ALL RESOLVED THE SAME WAY composeObservation()
       DOES. `r.observation` may already contain these sentences — if the
       auditor composed it before picking, or typed it by hand — or may not,
       if a pick came after. Rather than guess which, each is resolved fresh
       from the pick every sync, the same reasoning as evidencePending below:
       a sync that depends on the free-text field happening to still agree
       with the structured one is a sync with a silent failure mode. A
       duplicated sentence in `observation` is visible and harmless; a
       missing one is neither. */
    const lib = x.answerLibrary?.[c.id] ?? null;
    const evidenceNames = lib
      ? r.evidencePicked.map((i) => lib.EO[i]?.label).filter((v): v is string => !!v)
      : [];
    const evidenceRequestedText = evidenceNames.length
      ? `Evidence requested: ${list(evidenceNames)}.`
      : "";
    const issuesText = lib
      ? r.issuesPicked
          .map((i) => lib.IO[i]?.finding)
          .filter((v): v is string => !!v)
          .join(" ")
      : "";
    const walkaboutOption =
      lib && r.walkaboutPicked !== null ? lib.WO[r.walkaboutPicked] : undefined;
    const walkaboutText = walkaboutOption
      ? `On the walkabout: ${lowerFirst(walkaboutOption.label)}.`
      : "";
    /* Held rather than pushed inline, because the photograph walk below fills
       in its `photos` column once it knows what the references are. */
    const row: PlannedRow = {
      key,
      action: itemId ? "update" : "create",
      itemId,
      values: {
        title: key,
        discipline: c.discipline,
        assetSystem: c.system,
        compliance: r.compliance,
        /* THE INSPECTION SCREEN'S OWN, SEPARATE VERDICT — see
           Response.fieldCompliance's doc comment and the fieldCompliance
           entry in FIELD_CANDIDATES above. Sent through as `null` when the
           walk has not answered this check, same reasoning as
           evidenceVerdict below: an unset verdict must read as unset on the
           portal, not fold into (or get confused with) `compliance` above,
           which is a different question answered on a different screen. */
        fieldCompliance: r.fieldCompliance,
        /* EVIDENCE PENDING GOES ACROSS, IN THE OBSERVATION.
           The portal's compliance column has four values and "Compliant,
           evidence pending" is not one of them — it is a C with a flag on it,
           and inventing a fifth token for ACSA's list is the one thing this
           file will not do. But writing a bare C for a check whose record has
           not been produced says "we looked and it was fine", which is rule 2
           of this file's header in the other direction. So the flag travels as
           the first sentence of the observation, where a reader of the portal
           sees it on the same row as the C. */
        observation:
          [
            r.evidencePending
              ? "EVIDENCE PENDING — compliant on the auditor's assessment; the record was not produced during the audit."
              : "",
            evidenceRequestedText,
            issuesText,
            walkaboutText,
            r.observation?.trim() || "",
          ]
            .filter(Boolean)
            .join(" ") ||
          /* Only for a non-compliant answer. A compliant or not-applicable
             check with nothing typed needs no sentence — the status is the
             whole statement. See NC_WITHOUT_DETAIL. */
          (r.compliance === "NC" ? NC_WITHOUT_DETAIL : ""),
        /* WHAT THE EVIDENCE PROVES, AND THE VERDICT IT SUPPORTS — replacing
           "Evidence to request" (never synced; it only ever existed as chips
           on the check screen, never reached the portal) now that the
           screen asks a different question. `evidenceVerdict` is written
           raw ("C"/"NC"/"NV") the same way `compliance` above is — any
           Choice column it lands on is matched through `portalChoice()`
           exactly like compliance is, so Prince's column can offer
           "Compliant"/"Non-compliant"/"Not Verified", "C - Compliant", or
           the bare codes, and all three resolve the same way. `null` (not
           yet judged) is sent through rather than coerced to an empty
           string, so an unset verdict reads as unset on the portal too, not
           as a blank that could be mistaken for "cleared". */
        evidenceProves: r.evidenceProves?.trim() || null,
        evidenceVerdict: r.evidenceVerdict,
        /* HAS THE PROOF BEEN PRODUCED — see EVIDENCE_STATUS_TEXT. Spelled out
           rather than sent as the stored camelCase token: unlike compliance
           and evidenceVerdict, this field has no pre-existing ACSA
           vocabulary to defer to (it is Squawk's own, 2 October 2026), so
           there is no portal code for "noneAvailable" to resolve against —
           writing the sentence is the only way it is legible on a Text
           column, and it still matches cleanly if Prince ever builds a
           Choice column whose options read the same way. The active note is
           whichever of evidenceStatusNote/evidencePendingNote the current
           status actually uses — see Response.evidenceStatusNote. */
        evidenceStatus: r.evidenceStatus ? EVIDENCE_STATUS_TEXT[r.evidenceStatus] : null,
        evidenceStatusNote:
          (r.evidenceStatus === "specificNotAvailable"
            ? r.evidenceStatusNote?.trim()
            : r.evidenceStatus === "toBeProvided"
              ? r.evidencePendingNote?.trim()
              : "") || null,
        /* Sent only once a merge has actually run — see Response.combinedComment.
           `null`, not "", for the same reason evidenceVerdict is sent as `null`
           above: a check nobody has merged yet should read as un-merged on the
           portal, not as a blank that could be mistaken for "nothing to say". */
        combinedComment: r.combinedComment?.trim() || null,
        auditor: x.auditor,
        assessedOn: new Date().toISOString(),
        /* NEVER r.reviewStatus/reviewStatusNote HERE, same as improvementFlag/
           improvementNote above them in types.ts are never here — a
           reviewer's own sign-off and what needs to change before it is
           approved are for the team, not for ACSA. See Response.reviewStatus's
           own doc comment. */
      },
      summary: `${key} · ${c.discipline} · ${r.compliance}${r.evidencePending ? " (evidence pending)" : ""}`,
    };
    checkpoints.push(row);

    const refs: string[] = [];
    for (const a of r.attachments ?? []) {
      /* Either source will do. `unavailable` is the one real exclusion: it is
         set when the browser evicted the image and there is no record copy,
         and it means the bytes are gone rather than elsewhere. */
      if (a.kind !== "photo" || a.unavailable) continue;
      if (!a.blobKey && !a.cloudUrl) continue;
      evidence.push({
        checkId: key,
        filename: photoFilename(a),
        attachment: a,
        caption: a.caption?.trim() ?? "",
        values: evidenceValues(a, key, c.discipline, c.system, findingIdForCheck(c.id)),
        folder: dayFolder(folder, a.takenAt ?? a.createdAt),
      });
      /* And the other direction: the check-point row names its photographs, so
         a reader on the check-point can see there IS evidence and what it is
         called, rather than having to go looking in a library. */
      if (a.ref) refs.push(a.ref);
    }
    if (refs.length) {
      row.values.photos = refs.join(", ");
      /* Only where there are photographs to reach. A link on a row with no
         evidence behind it sends a reader to a folder to find nothing. */
      if (folderUrl) row.values.evidenceLink = folderUrl;
    }
  }
  if (unanswered) {
    skipped.push({
      what: "check-points",
      why: "no compliance captured — a blank status is NOT compliant, and writing one would say we looked",
      count: unanswered,
    });
  }
  if (excludedChecks) {
    skipped.push({
      /* Deliberately not "check-points" again — the UI keys this list on
         `what`, and a second entry sharing the "no compliance captured"
         row's key would collide with it. */
      what: "check-points (discipline held back)",
      why: `held back this run — ${[...excluded].join(", ")} excluded from this sync, not from the audit`,
      count: excludedChecks,
    });
  }

  /* PLACEHOLDER: what a non-compliant check says when nobody typed anything.
   *
   *  It still goes across — a non-compliant check is the truth and the portal
   *  should carry it. But the portal rates an asset system from its FINDINGS,
   *  so an NC nobody wrote a finding for leaves the rating reading better than
   *  the evidence. Found in the real portal by Prince Mahlangu, 16 September
   *  2026: Energy and Demand Management at King Shaka reading Acceptable with
   *  a non-compliant check-point behind it. */
  const withFinding = new Set(
    entityFindings.map((f) => f.checkId).filter((id): id is string => !!id)
  );
  const bareNC = x.checks.filter(
    (c) =>
      !excluded.has(c.discipline) &&
      x.responses[c.id]?.compliance === "NC" &&
      !withFinding.has(c.id)
  ).length;
  if (bareNC) {
    warnings.push({
      what: "non-compliant check-points have no finding behind them",
      why: "they go across as non-compliant, but the portal rates an asset system from its findings — so the rating will read better than the evidence until each one has its finding written",
      count: bareNC,
    });
  }

  /* THE SAME GAP, FOR INTERNAL ITEMS — but worse: a bare NC check-point above
   *  still reaches the portal, just under-rated. An internal item marked NC
   *  with no finding behind it reaches the portal NOT AT ALL — see
   *  externallyVisible's own note above — so its photographs are invisible
   *  to every sync and every report built from one, silently, with nothing
   *  in this plan even naming it (it never gets far enough to be counted
   *  anywhere else). The NC-auto-raises-a-finding guarantee (store.ts's
   *  addAdhoc/updateAdhoc) only fires on a write; an item that was already
   *  stuck this way before that guarantee existed, and has not been
   *  touched since, stays stuck until something raises its finding by hand
   *  — see store.ts's backfillInternalNcFindings for the one-time catch-up
   *  this warning exists to point at. */
  const internalNcNoFinding = (x.adhoc ?? []).filter(
    (a) => a.internal && a.outcome === "NC" && a.findingId == null && !(a.discipline && excluded.has(a.discipline))
  ).length;
  if (internalNcNoFinding) {
    warnings.push({
      what: "internal working-area items marked non-compliant have no finding behind them",
      why: "an internal item only reaches the portal once it is a finding — these, and their photographs, will not sync at all until each one has its finding raised",
      count: internalNcNoFinding,
    });
  }

  /* --- AND THE INSPECTION ITEMS' PHOTOGRAPHS --------------------------
   *
   *  Sarel, 16 September 2026, having just captured one: "not sure how to sync
   *  the photo now to sharepoint." He could not, and nothing said so.
   *
   *  The evidence walk above iterates the REGISTER and reads each check's
   *  response. An inspection item is ad-hoc — a WALK- id, not a register id,
   *  held in its own slice — so it was never visited, and its photographs were
   *  invisible to the sync entirely. The count on the tile did not include
   *  them, so there was not even a number to notice was wrong.
   *
   *  A photograph of something found on a walk is evidence in exactly the way
   *  a photograph attached to a check-point is. The reference already keeps
   *  them apart without anybody thinking about it — `WALK-A3F2K_P01.jpg`
   *  against `KSIA-ELE-001_P01.jpg` — so they can share a folder safely.
   *
   *  The ITEM itself still does not become a portal row. That is a different
   *  and larger question: the Check-points list is keyed on register ids and a
   *  walk item has none, so where an inspection belongs in the portal is a
   *  decision for ACSA rather than a gap to fill quietly. Today it reaches the
   *  portal the way it always has — through a finding, consolidated into a
   *  hazard. */
  let excludedWalkPhotos = 0;
  for (const item of x.adhoc ?? []) {
    /* NOT VISIBLE EXTERNALLY, so not uploaded here at all — see
       externallyVisible's own note just above. Skipped ahead of the
       discipline hold-back check below: an internal item's photographs are
       not "held back this run", they are simply never part of this sync. */
    if (!externallyVisible(item)) continue;
    /* HELD BACK, NOT LOST. See SyncInput.excludedDisciplines — the same rule
       the register path applies. This loop was never checking it at all: a
       walk item in a discipline the auditor held back from this run still
       uploaded anyway, and once item.discipline started reaching the Asset
       system/Discipline columns for real (see evidenceValues() below), the
       file that should not have gone across was also correctly labelled as
       the thing it was meant to withhold. Checked per item, before its
       photographs, same as a check-point is checked before its row. */
    if (item.discipline && excluded.has(item.discipline)) {
      excludedWalkPhotos += (item.attachments ?? []).filter(
        (a) => a.kind === "photo" && !a.unavailable && (a.blobKey || a.cloudUrl)
      ).length;
      continue;
    }
    for (const a of item.attachments ?? []) {
      if (a.kind !== "photo" || a.unavailable) continue;
      if (!a.blobKey && !a.cloudUrl) continue;
      evidence.push({
        checkId: item.id,
        filename: photoFilename(a),
        attachment: a,
        caption: a.caption?.trim() ?? "",
        /* NOT the register's discipline/asset system — a walk item is not off
           the list, so there is no check to read those from. But the item
           carries its OWN discipline/system (AddItemSheet lets the auditor
           set both, same vocabulary as a check's), and that was being
           discarded here even when set. Still blank, not guessed, when the
           auditor genuinely left it unset — an empty column reads as "not
           applicable here", a wrong one reads as fact; this only stops
           throwing away a real answer that was already sitting on the item.
           THE LIBRARY'S OWN CheckID COLUMN, THOUGH, was always item.id — the
           WALK- id — even once an office review had set item.checkId to a
           real register check. The file's own name and folder still keep
           item.id (nothing about where this photograph came from or how it
           was found should change), but the column a reader filters and
           reports on must say what it is evidence FOR once that is known —
           the same portal-formatted Title a check-point photo's own column
           carries, not the internal KSIA- form. */
        values: evidenceValues(
          a,
          item.checkId ? portalIdFor(x.entity, item.checkId) : item.id,
          item.discipline ?? "",
          item.system ?? "",
          /* A walk item's OWN findingId, singular — "promote to finding"
             raises exactly one, never several, so this is never the
             multi-finding ambiguity findingIdForCheck() exists to avoid. */
          item.findingId ? findingPortalKey.get(item.findingId) ?? "" : ""
        ),
        folder: dayFolder(folder, a.takenAt ?? a.createdAt),
      });
    }
  }
  if (excludedWalkPhotos) {
    skipped.push({
      what: "walk photographs (discipline held back)",
      why: `held back this run — ${[...excluded].join(", ")} excluded from this sync, not from the audit`,
      count: excludedWalkPhotos,
    });
  }

  /* --- this visit's hazards ------------------------------------------- */
  let unrated = 0;
  let excludedHazards = 0;
  for (const h of entityHazards) {
    /* HELD BACK WHOLE if it touches ANY excluded discipline — see
       SyncInput.excludedDisciplines. A hazard spanning Electrical and Civil
       is exactly the case `disciplines` being plural already plans for (the
       March 2025 KSIA fuse: two write-ups, one hazard), and there is no
       partial-hazard write — the portal takes one row with one event, one
       description, one rating, so there is nothing to cut the Electrical
       half out of. Holding back a Civil hazard a day longer is a far
       smaller cost than syncing Electrical content the auditor explicitly
       asked to hold. */
    if (h.disciplines.some((d) => excluded.has(d))) {
      excludedHazards++;
      continue;
    }
    /* A hazard whose ERM cell NOBODY AGREED still goes across — it is a real
       exposure and the portal should carry it — but WITHOUT a rating. A
       severity the assistant proposed and a person never looked at is
       indistinguishable from a judgement once it is in a list that feeds the
       Audit & Risk Committee. */
    const agreed = h.ermConfirmed && !!h.ermConsequence && !!h.ermLikelihood;
    if (!agreed) unrated++;

    /* Minted once already, above — see hazardPortalKey's own comment, at
       the top of this function, for why it has to happen there and not
       here. Every hazard that reaches this line passed the same exclusion
       check that loop applied, so the key is always there. */
    const key = hazardPortalKey.get(h.id)!;
    const itemId = existing.findings.get(key);
    const priority = agreed ? erm.ermPriority(h.ermConsequence!, h.ermLikelihood!) : null;
    const hazardRefs = hazardPhotoRefs(h, entityFindings, x.responses, x.adhoc);
    findings.push({
      key,
      action: itemId ? "update" : "create",
      itemId,
      hazardId: h.id,
      values: {
        title: key,
        discipline: h.disciplines.join(", "),
        assetSystem: h.systems.join(", "),
        observation: [h.event, h.description].filter(Boolean).join(" — "),
        severity: agreed ? portalSeverity(h.ermConsequence) : null,
        likelihood: agreed ? portalLikelihood(h.ermLikelihood) : null,
        riskPriority: priority,
        tolerance: priority ? (erm.ERM_PRIORITY_META[priority].tolerance ?? null) : null,
        status: h.actionStatus || "Open",
        rootCause: h.rootCause ?? "",
        treatment: flattenActions(h.actions),
        owner: firstOwner(h.actions),
        targetDate: firstDueDate(h.actions),
        progress: flattenProgress(h.progress),
        assets: sendableAssets(h.assetIds).join(", ") || null,
        dateRaised: h.createdAt ? new Date(h.createdAt).toISOString() : null,
        /* Absent, never "" — an update with an empty string would wipe
           whatever ACSA has in the cell. Same rule as the check-point's. */
        ...(hazardRefs.length ? { photos: hazardRefs.join(", ") } : {}),
        ...(hazardRefs.length && folderUrl ? { evidenceLink: folderUrl } : {}),
      },
      summary: agreed
        ? `${key} · ${priority} · ${priority ? erm.ERM_PRIORITY_META[priority].tolerance : ""}`
        : `${key} · no agreed ERM cell — the hazard goes across, the rating does not`,
    });
  }
  if (unrated) {
    skipped.push({
      what: "hazard ratings",
      why: "nobody has agreed the ERM cell — the hazard syncs, the rating does not",
      count: unrated,
    });
  }
  if (excludedHazards) {
    skipped.push({
      what: "hazards",
      why: `held back this run — spans ${[...excluded].join(", ")}, excluded from this sync, not from the audit`,
      count: excludedHazards,
    });
  }
  const withheldAssets = entityHazards.reduce(
    (n, h) => n + (h.assetIds ?? []).length - sendableAssets(h.assetIds).length,
    0
  );
  if (withheldAssets) {
    skipped.push({
      what: "asset links",
      why: "they are SAMPLE- tags from the stand-in register — they go in the workbook, never into a system of record",
      count: withheldAssets,
    });
  }
  if (unconsolidatedFindings) {
    skipped.push({
      what: "findings not yet in a hazard",
      why: "the register carries hazards, not findings — consolidate them and sync again",
      count: unconsolidatedFindings,
    });
  }

  /* --- last cycle's findings, verified this visit ---------------------- */
  let unverified = 0;
  for (const p of x.prior) {
    const v = x.verifications[p.portalId];
    if (!v?.outcome) {
      unverified++;
      continue;
    }
    const itemId = existing.findings.get(p.portalId);
    /* EVIDENCE PENDING GOES ACROSS, IN treatment — the same convention
       Response.evidencePending uses on `observation` in the checkpoints
       loop above, for the same reason: no portal column takes a flag
       cleanly, and this row has no `observation` column of its own to carry
       it instead. See Verification.evidencePending's doc comment — it is
       about whether a CARRIED finding's requested closure evidence has
       arrived, not Response.evidencePending's own, different question. */
    const treatmentText = [
      v.evidencePending
        ? "EVIDENCE PENDING — closure evidence has been requested and has not yet been received."
        : "",
      v.action ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    findings.push({
      key: p.portalId,
      action: itemId ? "update" : "create",
      itemId,
      values: {
        title: p.portalId,
        status: v.outcome,
        progress: flattenProgress(v.progress),
        treatment: treatmentText,
        /* THE FOLLOW-UP SCREEN'S OWN "evidence requested" — Verification.
           evidenceRequested, not the Checks screen's chips. `null` when
           blank, same reasoning as evidenceVerdict/combinedComment
           elsewhere in this file: unasked must read as unasked, not as an
           empty string that could be mistaken for "nothing outstanding". */
        evidenceRequested: v.evidenceRequested?.trim() || null,
        /* THE ACSA DISCUSSION LOG — Verification.discussionLog, flattened
           with the same flattenProgress() `progress` above already uses;
           it is the exact same ProgressNote[] shape, just a separate log. */
        discussionLog: flattenProgress(v.discussionLog),
      },
      summary: `${p.portalId} · ${v.outcome} (last cycle)`,
    });

    /* --- AND THE VERIFICATION'S OWN EVIDENCE PHOTOS -----------------
     *
     *  Verification.attachments — the photographs an auditor attaches
     *  directly on THIS Follow-up/Closure screen (PR #148), as proof the
     *  carried finding above was actually fixed. Everything upstream of
     *  sync was already wired for them (store.ts, the upload queue, merge.ts's
     *  tombstone-aware union); this is the one site that turns them into
     *  evidence the portal actually receives — the exact same pattern the
     *  check-point loop and the walk-item loop above follow for their own
     *  photographs, just a third population of this same `evidence` array.
     *
     *  `v.attachments` is already the LIVE list by the time it gets here: a
     *  removal filters it in store.ts immediately, and merge.ts's
     *  unionAttachmentsWithTombstones() strips a removed id out of it on
     *  every merge — so, same as the check-point and walk-item loops just
     *  above, nothing further needs to consult removedAttachmentIds here. */
    for (const a of v.attachments ?? []) {
      if (a.kind !== "photo" || a.unavailable) continue;
      if (!a.blobKey && !a.cloudUrl) continue;
      evidence.push({
        checkId: p.portalId,
        filename: photoFilename(a),
        attachment: a,
        caption: a.caption?.trim() ?? "",
        /* A CARRIED finding keeps the discipline/asset system it was raised
           under, same as the check-point loop reads them off the register's
           own check rather than guessing. `p.assetSystem` is the mapped
           register system (nullable); `p.discipline` is never blank — see
           PriorFinding in types.ts. A Verification photo is evidence FOR
           this one carried finding and nothing else, by construction —
           the auditor attached it on THIS finding's own Follow-up screen —
           so `p.portalId` is always the answer, no lookup needed. */
        values: evidenceValues(a, p.portalId, p.discipline, p.assetSystem ?? "", p.portalId),
        folder: dayFolder(folder, a.takenAt ?? a.createdAt),
      });
    }
  }
  if (unverified) {
    skipped.push({
      what: "prior findings",
      why: "not verified this visit — left exactly as the portal has them",
      count: unverified,
    });
  }

  /* --- attendance registers: one row per person, attendee or apology --- */
  const existingAttendance = existing.attendance ?? new Map<string, string>();
  const site = siteCodeFor(x.entity);
  let blankRegisters = 0;
  for (const reg of entityAttendanceRegisters) {
    const people: { name: string; organisation: string; role: string; phone: string;
      email: string; signature: Signature | null; reason: string; isApology: boolean; id: string }[] = [
      ...reg.rows.map((r) => ({
        name: r.name, organisation: r.organisation, role: r.role, phone: r.phone,
        email: r.email, signature: r.signature, reason: "", isApology: false, id: r.id,
      })),
      ...apologiesOf(reg).map((a) => ({
        name: a.name, organisation: a.organisation, role: a.role, phone: "",
        email: "", signature: null, reason: a.reason, isApology: true, id: a.id,
      })),
    ];
    if (!people.length) {
      blankRegisters++;
      continue;
    }
    for (const p of people) {
      /* Every name, even a blank one someone hasn't filled in yet, still
         gets a row — the register's own `rowGaps` already flags a missing
         name as something owed, and silently leaving the row out of the
         portal would hide a headcount gap rather than surface it. */
      const key = `${site}-${reg.id}-${p.id}`;
      const itemId = existingAttendance.get(key);
      attendance.push({
        key,
        action: itemId ? "update" : "create",
        itemId,
        values: {
          title: key,
          registerDate: reg.date,
          time: reg.time,
          purpose: reg.purpose,
          location: reg.location,
          name: p.name,
          organisation: p.organisation,
          role: p.role,
          phone: p.phone,
          email: p.email,
          status: p.isApology ? "Apology" : "Attended",
          signed: signedCell(p.signature),
          apologyReason: p.reason,
        },
        summary: `${key} · ${p.name || "(no name)"} · ${p.isApology ? "apology" : "attended"}`,
      });
      if (p.signature) {
        signatures.push({
          rowKey: key,
          filename: signatureFilename(p.signature),
          signature: p.signature,
          caption: `Signature: ${p.name || "(no name)"}, ${reg.date}`,
          folder: dayFolder(folder, p.signature.signedAt),
        });
      }
    }
  }
  if (blankRegisters) {
    skipped.push({
      what: "attendance registers",
      why: "nobody signed in and nobody sent apologies yet",
      count: blankRegisters,
    });
  }

  /* --- evidence log: TK-003 form 7, the chain-of-custody record ---------
   *
   *  THIS VISIT'S OWN ITEMS, not the entity's every item ever — same filter
   *  evidenceLogSheet's export already applies. useEvidenceItems() spans
   *  visits on purpose (an original borrowed last visit and still out is
   *  still worth showing on the dashboard), but a sync writes one visit's
   *  capture, same as every other list here. */
  const existingEvidenceLog = existing.evidenceLog ?? new Map<string, string>();
  let blankDocuments = 0;
  for (const item of entityEvidenceItems.filter((e) => e.originVisit === x.visit)) {
    if (!item.title.trim()) {
      blankDocuments++;
      continue;
    }
    const key = `${site}-${item.id}`;
    const itemId = existingEvidenceLog.get(key);
    evidenceLog.push({
      key,
      action: itemId ? "update" : "create",
      itemId,
      values: {
        title: key,
        documentTitle: item.title,
        documentNo: item.documentNo,
        revision: item.revision,
        documentDate: item.documentDate ? new Date(item.documentDate).toISOString() : null,
        requestedAt: item.requestedAt ? new Date(item.requestedAt).toISOString() : null,
        requestedFrom: item.requestedFrom,
        receivedAt: item.receivedAt ? new Date(item.receivedAt).toISOString() : null,
        receivedFrom: item.receivedFrom,
        receivedBy: item.receivedBy,
        medium: item.medium ? MEDIUM_LABEL[item.medium] : "",
        originalOrCopy: item.isOriginal ? "Original" : "Copy",
        returnedAt: item.returnedAt ? new Date(item.returnedAt).toISOString() : null,
        returnedTo: item.returnedTo,
        unavailable: item.unavailableAt ? "Yes" : "No",
        unavailableReason: item.unavailableReason,
        /* THE LINK TO THE AUDIT CHECKS — every check-point this document
           bears on, in the portal's own ids, so a reader on the evidence
           log can trace straight back to the check-point it was produced
           for without going by filename. */
        checkPoints: item.checkIds.map((id) => portalIdFor(x.entity, id)).sort().join(", "),
        signed: signedCell(item.signature),
        notes: item.notes,
      },
      summary: `${key} · ${item.title}${item.unavailableAt ? " (declared unavailable)" : item.returnedAt ? " (returned)" : item.receivedAt ? " (received)" : " (outstanding)"}`,
    });
    if (item.signature) {
      signatures.push({
        rowKey: key,
        filename: signatureFilename(item.signature),
        signature: item.signature,
        caption: `Signature: ${item.receivedBy || "(no name)"}, ${item.title}`,
        folder: dayFolder(folder, item.signature.signedAt),
      });
    }
    /* AND THE DOCUMENT'S OWN PHOTOGRAPHS — EvidenceItem.attachments, where
       that is how it was captured (a photo of the page rather than a scan
       on file). Every other evidence loop in this file queues its own
       `.attachments` into `evidence`; this one only ever pushed the
       signature. Same bug class as MitigationAction.system and
       ProgressNote.outcome before it — captured correctly, shown correctly
       in the Evidence screen's own UI, silently never reaching the portal.
       `checkId` here is the column a reader filters and reports on, same
       rule the walk-item loop above follows: one check named, use it; more
       than one or none, fall back to this row's own key rather than
       guessing which check the photograph is really of. EvidenceItem
       carries no discipline/asset system of its own — see its own shape in
       types.ts — so those stay blank rather than invented. */
    const singleCheckId = item.checkIds.length === 1 ? item.checkIds[0] : null;
    for (const a of item.attachments ?? []) {
      if (a.kind !== "photo" || a.unavailable) continue;
      if (!a.blobKey && !a.cloudUrl) continue;
      evidence.push({
        checkId: singleCheckId ? portalIdFor(x.entity, singleCheckId) : key,
        filename: photoFilename(a),
        attachment: a,
        caption: a.caption?.trim() ?? "",
        /* No finding concept on an EvidenceItem — see its own shape in
           types.ts, same reason discipline/asset system above stay blank
           rather than invented. */
        values: evidenceValues(a, singleCheckId ? portalIdFor(x.entity, singleCheckId) : key, "", "", ""),
        folder: dayFolder(folder, a.takenAt ?? a.createdAt),
      });
    }
  }
  if (blankDocuments) {
    skipped.push({
      what: "evidence log entries",
      why: "no document title captured yet",
      count: blankDocuments,
    });
  }

  /* --- asset risk: one row per (discipline, asset system) pair ----------
   *
   *  Same grouping systemsSheet's workbook export already does over the
   *  register's own checks, so the two never disagree about which pairs
   *  exist. A pair with nothing recorded against it yet is skipped entirely
   *  — there is nothing here to tell apart from "not reached" and inventing
   *  a row for it would read as an assessment nobody made. */
  const existingAssetRisk = existing.assetRisk ?? new Map<string, string>();
  const seenPairs = new Set<string>();
  let emptyPairs = 0;
  let excludedPairs = 0;
  for (const c of x.checks) {
    const system = c.system?.trim() || "No asset system recorded";
    const pairKey = `${c.discipline}|${system}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    /* Held back with the rest of the discipline — see
       SyncInput.excludedDisciplines. After the dedup above, so this counts
       distinct PAIRS the same way emptyPairs does, not one per check. */
    if (excluded.has(c.discipline)) {
      excludedPairs++;
      continue;
    }
    const a = x.systems?.[pairKey];
    /* ROOT CAUSES AND ACTIONS NOW LIVE ON EACH HAZARDOUS EVENT, NOT POOLED AT
       THE SYSTEM LEVEL — see PossibleEvent's own header. Flattened across
       every event (plus anything still waiting in unassignedRootCauses/
       unassignedActions — a migration leftover nobody has filed onto a
       hazard yet, see SystemAssessment's own header) so the portal keeps
       seeing everything a device has captured, the same as before this
       moved. */
    const allRootCauses = [
      ...(a?.events ?? []).flatMap((e) => e.rootCauses ?? []),
      ...(a?.unassignedRootCauses ?? []),
    ];
    const allActions = [
      ...(a?.events ?? []).flatMap((e) => e.actions ?? []),
      ...(a?.unassignedActions ?? []),
    ];
    const hasContent =
      !!a &&
      (a.ratingConfirmed ||
        allRootCauses.length > 0 ||
        allActions.length > 0 ||
        a.events.length > 0 ||
        a.note.trim() !== "" ||
        a.ratingRationale.trim() !== "" ||
        !!a.directionOfRisk?.trim());
    if (!hasContent) {
      emptyPairs++;
      continue;
    }
    const key = assetRiskTitle(x.entity, c.discipline, system);
    const itemId = existingAssetRisk.get(key);
    /* THE RATING ITSELF IS GATED, exactly as a hazard's is — a severity and
       likelihood nobody confirmed is a suggestion, not a fact for a portal
       the Audit & Risk Committee reads. Root causes, actions and events
       still go across unconfirmed: unfinished work in progress has value,
       the same reasoning an unrated hazard's own fields already get. */
    const agreed = a!.ratingConfirmed === true;
    const band = agreed ? bandFor(a!.severity, a!.likelihood) : null;
    assetRisk.push({
      key,
      action: itemId ? "update" : "create",
      itemId,
      values: {
        title: key,
        discipline: c.discipline,
        assetSystem: system,
        severity: agreed ? a!.severity : null,
        likelihood: agreed ? a!.likelihood : null,
        band: agreed && band ? BAND_META[band].label : null,
        strategy: agreed && band ? BAND_META[band].strategy : null,
        ratingAgreed: agreed ? "Yes" : "No",
        rationale: a!.ratingRationale ?? "",
        rootCause: allRootCauses
          .map((r) => (r.note ? `${r.cause} — ${r.note}` : r.cause))
          .join("\n"),
        treatment: flattenActions(allActions),
        owner: firstOwner(allActions),
        targetDate: firstDueDate(allActions),
        events: a!.events
          .map((e) => [e.event, e.likelihood, e.note].filter(Boolean).join(" · "))
          .join("\n"),
        auditor: a!.assessedBy ?? "",
        assessedOn: a!.assessedAt ? new Date(a!.assessedAt).toISOString() : null,
        notes: a!.note ?? "",
        directionOfRisk: a!.directionOfRisk ?? "",
        /* NEVER a!.internalNote HERE. It is the team's own working note on
           this asset system — see the field's own doc comment in types.ts —
           and this values object is what gets written to the live
           SharePoint list. */
      },
      summary: agreed
        ? `${key} · ${band ? BAND_META[band].label : ""}`
        : `${key} · no agreed rating — the work goes across, the rating does not`,
    });
  }
  if (emptyPairs) {
    skipped.push({
      what: "asset systems",
      why: "no rating, root cause, action or event recorded against them yet",
      count: emptyPairs,
    });
  }
  if (excludedPairs) {
    skipped.push({
      /* Deliberately not "asset systems" again — see the check-points skip
         entry's own note on why the UI's key would collide. */
      what: "asset systems (discipline held back)",
      why: `held back this run — ${[...excluded].join(", ")} excluded from this sync, not from the audit`,
      count: excludedPairs,
    });
  }

  return {
    checkpoints,
    findings,
    attendance,
    evidenceLog,
    assetRisk,
    evidence,
    signatures,
    skipped,
    warnings,
    folder,
  };
}

/** Asset links that are safe to send.
 *
 *  A `SAMPLE-` tag is a stand-in invented so the linking could be built before
 *  ACSA supplied the register. It belongs in the workbook, where a person is
 *  reading and the prefix tells them what it is. It does NOT belong in the
 *  portal, where a machine files it against a real finding and nobody looks at
 *  it again — an invented asset number in a system of record is worse than no
 *  asset number at all.
 *
 *  So the sync drops them, and the plan says how many it dropped. When the real
 *  register arrives its tags carry no prefix and this returns them untouched;
 *  the guard turns itself off. */
export function sendableAssets(ids: string[] | undefined): string[] {
  return (ids ?? []).filter((id) => !id.startsWith("SAMPLE-"));
}

/** Totals for the confirm line, so nobody presses a button that says "Sync"
 *  without knowing what it is about to do. */
export function planTotals(plan: SyncPlan) {
  const count = (rows: PlannedRow[], a: RowAction) => rows.filter((r) => r.action === a).length;
  return {
    checkpointsNew: count(plan.checkpoints, "create"),
    checkpointsChanged: count(plan.checkpoints, "update"),
    findingsNew: count(plan.findings, "create"),
    findingsChanged: count(plan.findings, "update"),
    attendanceNew: count(plan.attendance, "create"),
    attendanceChanged: count(plan.attendance, "update"),
    evidenceLogNew: count(plan.evidenceLog, "create"),
    evidenceLogChanged: count(plan.evidenceLog, "update"),
    assetRiskNew: count(plan.assetRisk, "create"),
    assetRiskChanged: count(plan.assetRisk, "update"),
    photographs: plan.evidence.length,
    signatures: plan.signatures.length,
    writes:
      plan.checkpoints.length +
      plan.findings.length +
      plan.attendance.length +
      plan.evidenceLog.length +
      plan.assetRisk.length +
      plan.evidence.length +
      plan.signatures.length,
  };
}

/** How the writer gets an image's bytes. Takes the attachment, not a local
 *  key, and THROWS rather than returning null — a photograph that cannot be
 *  read is reported by filename with the reason, never dropped. */
export type PhotoBlobReader = (a: Attachment) => Promise<Blob>;
