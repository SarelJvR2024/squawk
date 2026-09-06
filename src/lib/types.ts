/** Domain model — see design document section 6 (data model).
 *  Library (versioned, shared across sites) is kept separate from
 *  instance (what was found on one visit) so the checklist can change
 *  between cycles without corrupting history. */

export type Compliance = "C" | "NC" | "N/A" | "NV";

/* Verbatim from B170 001M cl. 4.3.1 and 4.3.2. See the note in risk.ts — these
   words are ACSA's, not ours, and paraphrasing them changes what a rating means. */
export type Severity =
  | "A - Catastrophic"
  | "B - Hazardous"
  | "C - Major"
  | "D - Minor"
  | "E - Negligible";

export type Likelihood =
  | "1 - Extremely Improbable"
  | "2 - Improbable"
  | "3 - Remote"
  | "4 - Occasional"
  | "5 - Frequent";

/** ACSA B170 001M bands — Red / Amber / Green, not I/II/III. */
export type Band = "Red" | "Amber" | "Green";

export type Coverage = "covered" | "partial" | "none";

export type VerificationOutcome =
  | "Closed"
  | "Partially closed"
  | "Open - repeat"
  | "Not verified";

export type ActionStatus = "Open" | "In progress" | "Closed";

export interface AcsaDocRef {
  doc: string | null;
  clause: string | null;
  title?: string | null;
}

export interface SiteVariant {
  site: string;
  note: string;
}

export interface EvidenceOption {
  label: string;
  hint?: string;
}
export interface AnswerOption {
  label: string;
  sets: Compliance;
  observation: string;
}
export interface IssueOption {
  label: string;
  finding: string;
  severity_hint: Severity;
  likelihood_hint: Likelihood;
}
export interface WalkaboutOption {
  label: string;
  sets?: Compliance;
  photo?: boolean;
}

/** The researched button set for one check (design doc section 7).
 *
 *  This lives in its own file, loaded on demand — 11,179 options across 374
 *  checks is 356 kB gzipped, and the dashboard, findings and closure screens
 *  never touch it. See src/lib/answers.ts. */
export interface AnswerLibrary {
  EO: EvidenceOption[];
  AO: AnswerOption[];
  IO: IssueOption[];
  OS: string[];
  WO: WalkaboutOption[];
}

export interface Check {
  id: string;
  discipline: string;
  system: string;
  assetClass: string | null;
  area: string;
  requirement: string;
  basis: string | null;
  evidenceExpected: string | null;
  target: string | null;
  vtype: string | null;
  question: string | null;
  walkabout: string | null;
  acsaDocs: AcsaDocRef[];
  acsaRequirement: string;
  acsaThreshold: string;
  acsaEvidence: string[];
  acsaConflict: string;
  coverage: Coverage;
  siteVariant: SiteVariant | null;
  /** How firm the external citation is. "medium" means the instrument certainly
   *  applies but the clause is cited at document level — say so on screen rather
   *  than letting an auditor quote a clause number nobody confirmed. */
  basisConfidence: "high" | "medium" | "low" | null;
  /** A caveat worth reading before quoting the basis — most often that ACSA's own
   *  cited standard is superseded or misattributed, which is a finding in itself. */
  basisNote: string | null;
  /* There were `pf` and `pfq` columns here — the March 2025 King Shaka finding
     covering this check's asset system, cached on the check so filters and
     pills stayed synchronous. They are gone. Rev A2 is ONE register shared by
     ten sites, so a King Shaka finding baked into a register row announced
     itself at Cape Town, at Corporate Office and at seven sites that have never
     been audited. The prior rating is a property of the site, not of the
     requirement: ask priorFor(entityCode, discipline, system). */
  /** Walkabout options available — lets field mode filter without loading the library. */
  woCount: number;
  optionCount: number;
}

export type Tolerance = "Unacceptable" | "Tolerable" | "Acceptable" | "Not audited";

/** One asset system's standing coming into this audit, at ONE site.
 *
 *  King Shaka carries the 22 ratings published in the March 2025 report.
 *  O.R. Tambo and Cape Town have no published rating table, so theirs are
 *  derived from their own 2025 portal findings — `derived` says which, because
 *  a derived rating must not be shown as though ACSA had signed it off. The
 *  other seven sites are baseline audits and have none. */
export interface PriorRating {
  /** Key a verification is stored under. King Shaka keeps PF-01…PF-22. */
  key: string;
  siteCode: string;
  entityCode: string;
  discipline: string;
  system: string;
  rating: Tolerance;
  note: string;
  derived: boolean;
  /** Portal ids of the findings a derived rating was computed from. */
  from?: string[];
}

/** One open 2025 finding as it stands in the ACSA portal's Findings list.
 *
 *  `portalId` is the Title of the portal item and is the sync key — it is
 *  never regenerated, reformatted or renumbered here.
 *
 *  `assetSystem` is null for the 19 findings that name a building or an area
 *  rather than a register asset system (Cargo Building, Parkade Bridges,
 *  Medical Surveillance Records and the rest). They are carried and shown, and
 *  the discipline lead allocates them in the field — dropping them because
 *  they do not join to a check would lose real open findings. */
export interface PriorFinding {
  portalId: string;
  portalItemId: number;
  siteCode: string;
  entityCode: string;
  discipline: string;
  disciplineCode: string;
  /** The asset system as the 2025 report worded it. */
  assetSystemRecorded: string;
  /** The register asset system it maps to, or null if it maps to none. */
  assetSystem: string | null;
  observation: string;
  /** Rev A2's own scale, carried verbatim for display. NOT fed to
   *  src/lib/risk.ts, whose B170 001M banding disagrees with it on five of
   *  twenty-five cells — see the open question in README.md. */
  severity: string | null;
  likelihood: string | null;
  riskPriority: string;
  tolerance: Tolerance;
  findingType: string;
  status: string;
  dateRaised: string;
  reference: string;
}

/* ---------- instance data ---------- */

export interface Attachment {
  id: string;
  kind: "photo" | "voice" | "file";
  name: string;
  /** Key into the media store (src/lib/media.ts), NOT the bytes. Blobs are
   *  held under their own IndexedDB keys because this record is persisted
   *  inside one JSON value that rewrites on every keystroke. */
  blobKey?: string;
  mimeType?: string;
  /** Legacy inline data from before the media store existed. Read, never
   *  written. */
  dataUrl?: string;
  /** The reference this photograph is known by, everywhere.
   *
   *  `KSIA-ELE-001_P01` — the check-point's portal id and a sequence number. It
   *  is the filename in the export zip, the object name in cloud storage, the
   *  first column of the Photographs sheet and the anchor a Word report will
   *  use. One identifier in every place, so somebody holding the workbook can
   *  find the image without asking anybody.
   *
   *  Sequence numbers are never reused. If P01 is deleted the next photograph
   *  is P03, not P02 — an audit reference that silently comes to mean a
   *  different image is worse than a gap in the numbering. */
  ref?: string;
  /** Where the record copy lives, once it has been uploaded. The LOCAL copy is
   *  never deleted because this is set — the device keeps its own. */
  cloudUrl?: string;
  cloudAt?: number;
  /** Why the last upload attempt failed, if it did. Shown, not swallowed. */
  cloudError?: string;
  /** Small inline preview, so a strip of photographs paints without an async
   *  read per tile. The full image lives in the media store under its blobKey
   *  and is NEVER put in the persisted value — see src/lib/media.ts. */
  thumbDataUrl?: string;
  width?: number;
  height?: number;
  bytes?: number;
  /** EXIF DateTimeOriginal, where the file carried one. When a photograph was
   *  taken is audit evidence; the canvas re-encode strips EXIF, so this is read
   *  off the original before it is downscaled. */
  takenAt?: number;
  /** What this photograph shows, in the auditor's words.
   *
   *  This is what makes a photograph searchable, reportable and usable at all.
   *  An uncaptioned photograph is shown as incomplete, the same as a finding
   *  with no owner: in six months nobody will know what they are looking at,
   *  and a reviewer reading the workbook has only a filename. */
  caption?: string;
  /** Set when the caption text came from the assistant and a person accepted
   *  it. A caption an auditor wrote and one a model proposed are not the same
   *  evidence and the export says which. */
  captionSource?: "auditor" | "assistant";
  /** Measured elapsed seconds. Absent for a photograph. */
  durationSec?: number;
  /** What was actually said, verbatim — typed by the auditor, heard by the
   *  browser's dictation engine, or returned by the transcription service.
   *  This is the record of the recording and is never overwritten by a tidied
   *  version of itself. */
  transcript?: string;
  /** Where `transcript` came from, so a reader can weigh it. "browser" is the
   *  on-device speech engine listening live while the note was recorded;
   *  "service" is the audio sent to the transcription service afterwards;
   *  absent means an auditor typed it. */
  transcriptSource?: "browser" | "service";
  /** The transcript rewritten as an audit-grade answer — a SUGGESTION, held
   *  beside the verbatim text rather than replacing it, and not in the audit
   *  record until the auditor accepts it into the observation. */
  revised?: string;
  transcribedAt?: number;
  /** Set by the v4 migration on attachments recorded before capture was real:
   *  the record exists but there is no audio or image behind it. Shown as
   *  unavailable rather than silently rendering an empty player. */
  unavailable?: boolean;
  createdAt: number;
  createdBy: string;
}

export interface Response {
  checkId: string;
  compliance: Compliance | null;
  observation: string;
  evidencePicked: number[];
  issuesPicked: number[];
  walkaboutPicked: number | null;
  attachments: Attachment[];
  /** DERIVED, and written only by the store: true when every mode this check's
   *  vtype declares has been answered. A check needing both a document review
   *  and the asset seen is not captured until both halves are done — before
   *  per-portal tracking existed this flag went true on the first save from
   *  either screen, so 305 checks could read as complete with nobody having
   *  looked at the asset. Never set this directly; call commit(id, portal). */
  captured: boolean;
  /** Who and when for the half that COMPLETED the check. */
  capturedBy: string;
  capturedAt: number | null;
  /** The desk half — evidence collected and questions asked, from Capture. */
  deskDoneBy: string;
  deskDoneAt: number | null;
  /** The field half — the asset seen, from Field inspection. */
  fieldDoneBy: string;
  fieldDoneAt: number | null;
  flaggedForField: boolean;
}

/* ---------- ACSA's SECOND instrument: the ERM matrix ----------

   J050 001FW *Combined Assurance Framework*, Version 1, 19 October 2017,
   clause 9.2.2. It rates BUSINESS RISK and decides what enters ACSA's Combined
   Assurance Coverage Plan. It is not a variant of B170 001M and not a competing
   version of it — see the header of src/lib/erm.ts.

   Consequence runs 5 → 1 with Catastrophic HIGH, the opposite direction to
   B170's A → E. The number is carried inside the label for that reason: getting
   the direction backwards inverts the entire matrix and nothing would say so. */

export type ErmConsequence =
  | "5 - Catastrophic"
  | "4 - Critical"
  | "3 - Significant"
  | "2 - Moderate"
  | "1 - Minor";

export type ErmLikelihood =
  | "1 - Not Likely"
  | "2 - Slight"
  | "3 - Likely"
  | "4 - Highly Likely"
  | "5 - Expected";

/** I = Unacceptable · II = Tolerable · III = Acceptable (cl. 9.2.2). */
export type ErmPriority = "I" | "II" | "III";

/** A hazard: the EVENT a set of findings exposes.
 *
 *  A finding says a document was missing or a coupler was worn. A hazard says
 *  what that missing control was protecting against — "uncontained fuel release
 *  on the apron" — and that is what gets rated, because rating the document
 *  produces a risk profile made of paperwork.
 *
 *  Hazards are scoped to an entity and a visit like everything else, and are
 *  built by consolidating findings: two write-ups in different disciplines'
 *  language frequently describe one physical thing. */
export interface Hazard {
  id: string;
  entity: string;
  originVisit: string;
  /** Under 15 words. The event, not the finding. */
  event: string;
  description: string;
  /** What control failed, and what it was protecting against. */
  why: string;
  /** The findings this consolidates. A hazard with none is one somebody raised
   *  directly at the register or on the walk, which is allowed and common. */
  findingIds: string[];
  /** PLURAL, and that is the whole point.
   *
   *  In the March 2025 KSIA register the same missing diesel cut-out fuse was
   *  recorded as PF-02 by Electrical and PF-21 by Process Safety: two entries,
   *  two Unacceptable ratings, one fuse — and closing it would have needed two
   *  verifications that could disagree. A consolidated hazard therefore spans
   *  disciplines by nature, and taking the first finding's discipline as the
   *  hazard's throws away exactly the fact that made it worth consolidating. */
  disciplines: string[];
  systems: string[];
  /** B170 001M, the instrument this repo actually carries. Gated by
   *  ratingConfirmed exactly as a finding is: the assistant may propose a
   *  rating, it may never agree one. */
  severity: Severity | null;
  likelihood: Likelihood | null;
  ratingConfirmed: boolean;
  /** ACSA's enterprise risk matrix — a SEPARATE instrument, deliberately not
   *  derived from B170 001M. J050 001FW cl. 9.2.2; see src/lib/erm.ts.
   *
   *  The axis is CONSEQUENCE, not severity. B170 001M has severity; this has
   *  consequence, they run in opposite directions, and calling them the same
   *  thing is how a rating gets carried across without anyone looking at it. */
  ermConsequence: ErmConsequence | null;
  ermLikelihood: ErmLikelihood | null;
  ermConfirmed: boolean;
  /** True while the ERM likelihood is still the one carried across from the
   *  B170 rating rather than one the session looked at.
   *
   *  The consequence scales map by position closely enough to suggest. The
   *  likelihood scales DO NOT: B170's is occurrence history ("has occurred
   *  rarely"), ERM's is probability ("Likely, 25-54%"). A hazard can sit at
   *  B170 level 3 and ERM level 2 with neither being wrong, so a carried
   *  likelihood is flagged as an assumption until somebody agrees it. */
  ermLikelihoodAssumed: boolean;
  /** Where it came from, and it matters who.
   *
   *  `acsa` in particular: the closing session is where ACSA add the hazards
   *  the check-list missed, and those are reported as theirs. A register that
   *  cannot say which hazards ACSA raised cannot show that the audit listened. */
  origin: "consolidated" | "field" | "acsa" | "tpjv";
  note: string;
  /** ACSA's occurrence history for this event, in their words.
   *
   *  Four of B170 001M's five likelihood levels are defined by whether the
   *  event has happened and how often — "has occurred rarely", "has occurred
   *  infrequently". That is ACSA's data, not ours, and without it the
   *  likelihood axis cannot honestly be set. So it gets its own field and its
   *  own prompt on screen rather than living in somebody's head. */
  occurrence: string;
  /** Why the group agreed the cell they agreed. A rating with no reasoning is
   *  a number nobody can defend eighteen months later. */
  ratingRationale: string;
  /** Dated, attributed updates. Same shape as a carried finding's — ACSA's
   *  Progress/Update is one cell that gets typed over, and this appends. */
  progress: ProgressNote[];
  /** Raised in the end-of-week critical review with ACSA. */
  immediate: boolean;
  /** Set by the post-walk re-read, so a reader can see it was looked at again
   *  and what changed. */
  reassessedAt: number | null;
  reassessNote: string;
  /** Same vocabulary as a finding's — ROOT_CAUSES in src/lib/store.ts. A hazard
   *  built from several findings usually has one cause behind all of them, and
   *  that is the thing the remediation has to address. */
  rootCause: string;
  action: string;
  owner: string;
  dueDate: string;
  actionStatus: ActionStatus;
  createdAt: number;
  createdBy: string;
}

export interface Finding {
  id: string;
  checkId: string | null;
  /** Which entity this was raised at. With originVisit it is what lets the
   *  next visit to the same airport see what the last one left open. */
  entity: string;
  discipline: string;
  system: string;
  area: string;
  title: string;
  description: string;
  /** Which Answer Library issue button raised this, so untapping the button
   *  withdraws exactly this finding. null for ad-hoc findings. */
  issueIndex: number | null;
  severity: Severity | null;
  likelihood: Likelihood | null;
  /** An issue button seeds a *suggested* rating. The rating only counts once
   *  the group has agreed it on the matrix — the audit rates as a group
   *  exercise, so a suggestion must never masquerade as a decision. */
  ratingConfirmed: boolean;
  rootCause: string;
  action: string;
  owner: string;
  dueDate: string;
  /** Dated, attributed updates on the remediation.
   *
   *  The four fields ACSA's dashboards carry are filled at different moments:
   *  root cause on the day with the responsible person in the room, the target
   *  date at close-out, progress weeks later. ACSA's own Progress/Update is one
   *  cell and gets typed over, so by the time a finding closes nobody can say
   *  when it moved or who said so. Same shape as a verification's log; the
   *  export flattens both into their single cell. */
  progress: ProgressNote[];
  actionStatus: ActionStatus;
  originVisit: string;
  priorRating: string | null;
  adHoc: boolean;
  /** The event this finding exposes, proposed early at the check and refined at
   *  consolidation. A suggestion until a hazard is actually created from it. */
  suggestedEvent: string;
  createdAt: number;
  createdBy: string;
}

/** One dated entry in a record's history.
 *
 *  ACSA's dashboards carry a single Progress/Update CELL, and a cell gets typed
 *  over. By the time a finding closes, nobody can say when it moved, who said
 *  so, or which audit they said it at — the only thing left is the last person's
 *  sentence. That is not a record, and a follow-up conversation eighteen months
 *  later is exactly when it matters.
 *
 *  So progress is a LOG. Each entry keeps its author, its timestamp and the
 *  visit it was recorded at, and the export flattens the whole log into ACSA's
 *  one cell — their format, our history. */
export interface ProgressNote {
  at: number;
  by: string;
  /** The visit this was recorded at, so the timeline can group by audit. */
  visit: string;
  /** The outcome as it stood when this was written, or null for a plain note.
   *  Kept per entry rather than only on the record, so a status that moved
   *  from "Open - repeat" to "Closed" shows WHEN it moved. */
  outcome: VerificationOutcome | null;
  note: string;
}

export interface Verification {
  pf: string;
  outcome: VerificationOutcome | null;
  evidence: string;
  attachments: Attachment[];
  verifiedBy: string;
  verifiedAt: number | null;
  /** What must still happen, when the outcome is anything but Closed.
   *
   *  Recorded against the CARRIED finding rather than raised as a new one, so
   *  the action stays attached to the thing it fixes. A new finding would break
   *  the chain back to March 2025 and the item would look like two problems. */
  action?: string;
  /** Progress at this visit. The timeline across visits is assembled by
   *  historyFor() in carryforward.ts, which reads every visit's copy. */
  progress?: ProgressNote[];
}

export interface Capture {
  id: string;
  kind: "photo" | "voice";
  name: string;
  /** As Attachment.blobKey — the media store holds the bytes. */
  blobKey?: string;
  mimeType?: string;
  /** Legacy inline data. Read, never written. */
  dataUrl?: string;
  durationSec?: number;
  transcript?: string;
  /** As Attachment.transcriptSource. Carried through assignCapture so a note
   *  dictated in the tray keeps its provenance once it reaches a check. */
  transcriptSource?: "browser" | "service";
  unavailable?: boolean;
  area: string;
  createdAt: number;
  createdBy: string;
}

export interface Visit {
  id: string;
  label: string;
  site: string;
  state: "done" | "skipped" | "current" | "scheduled";
  note: string;
}

export type Role = "tpjv" | "acsa";

/** A note left on a check's visual evidence during review.
 *
 *  Distinct from `Response.observation`, which is the auditor's record of what
 *  was found, and from `Finding.description`, which is what goes to ACSA. This
 *  is the conversation about the photograph — an engineer who was not on site
 *  asking whether that is the right panel, or confirming it has since been
 *  replaced. It is never merged into either of the other two. */
export interface FeedbackNote {
  id: string;
  /** The check whose evidence is being discussed. */
  checkId: string;
  text: string;
  author: string;
  /** Which side left it. An engineer's read of a photograph and an auditor's
   *  are both worth having, and worth telling apart. */
  role: Role;
  createdAt: number;
  /** Set when someone marks the point dealt with. The note stays — a thread
   *  that erases itself is no use at the next visit. */
  resolvedAt: number | null;
}
