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
  /** The March 2025 finding covering this check's asset system, if any. Kept on
   *  the check itself so filters, pills and counts stay synchronous. */
  pf: string | null;
  pfq: string | null;
  /** Walkabout options available — lets field mode filter without loading the library. */
  woCount: number;
  optionCount: number;
}

export interface PriorFinding {
  pf: string;
  discipline: string;
  system: string;
  rating: "Unacceptable" | "Tolerable" | "Acceptable" | "Not audited";
  finding: string;
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
  /** Measured elapsed seconds. Absent for a photograph. */
  durationSec?: number;
  /** Typed by the auditor, or dictated by the browser and then corrected by
   *  the auditor. Never generated on their behalf. */
  transcript?: string;
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
  captured: boolean;
  capturedBy: string;
  capturedAt: number | null;
  flaggedForField: boolean;
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
  actionStatus: ActionStatus;
  originVisit: string;
  priorRating: string | null;
  adHoc: boolean;
  createdAt: number;
  createdBy: string;
}

export interface Verification {
  pf: string;
  outcome: VerificationOutcome | null;
  evidence: string;
  attachments: Attachment[];
  verifiedBy: string;
  verifiedAt: number | null;
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
