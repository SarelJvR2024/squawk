/** Domain model — see design document section 6 (data model).
 *  Library (versioned, shared across sites) is kept separate from
 *  instance (what was found on one visit) so the checklist can change
 *  between cycles without corrupting history. */

export type Compliance = "C" | "NC" | "N/A" | "NV";

/** Whether the evidence a check needs has actually been produced — a
 *  question separate from the compliance verdict itself (a check can be
 *  marked Compliant on ACSA's say-so while the proof is still outstanding,
 *  see `Response.evidencePending`). Replaced the "compliant, evidence
 *  pending" and "not available" compliance buttons, 2 October 2026 (Sarel:
 *  "remove that option... introduce an evidence functionality"), because
 *  neither actually answered this question — one said the verdict was C
 *  with a caveat, the other overloaded "NV" to mean both "we'll look at
 *  this later" (on the field screen) and "nothing was available" (on the
 *  desk screen).
 *
 *  `null` means nobody has said anything about evidence yet — not the same
 *  as `noneAvailable`, which is an auditor's deliberate statement that
 *  there is none to collect. */
export type EvidenceStatus =
  | "noneAvailable"
  | "specificNotAvailable"
  | "toBeProvided"
  | "providedForReview";

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
  /** Set when this site's own requirement CONTRADICTS the check as written —
   *  not merely adds detail to it.
   *
   *  Sarel, 2026-09-10: "still keep the check as the ACSA audit check but add
   *  the airport specific requirement and highlight it in the heading so that
   *  it is clear there is a conflict."
   *
   *  The check text is NOT rewritten. ACSA's register is the client's document
   *  and a row silently edited to say something ACSA never wrote is a row
   *  nobody can reconcile against their copy. Both figures are carried, both
   *  are shown, and the heading says which one governs here — so an auditor
   *  cannot read the title alone and audit to the wrong interval, which is
   *  exactly what MEC-037 invites today: it is titled "A 3 yearly ... Piping
   *  Pressure test" while D060 021M cl. 4.17.5 makes it YEARLY at King Shaka. */
  conflict?: {
    /** What the check's own requirement text says, quoted. */
    checkSays: string;
    /** What ACSA requires at THIS site, quoted. */
    siteRequires: string;
    /** The clause that settles it. */
    source: string;
    /** Which way the site's rule cuts against the check, in one word.
     *  "stricter" is the dangerous one — auditing to the check would pass an
     *  installation the site's own manual says is overdue. */
    direction: "stricter" | "looser" | "different";
  };
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
 *  This lives in its own file, loaded on demand — 9,836 options across 324
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
  /* ---- the register review, agreed with Sarel 2026-09-10 ---------------- */
  /** WHAT DECIDES WHETHER THIS CHECK IS COMPLIANT.
   *
   *  Three values, and they answer one question — not "what activities happen
   *  on an audit", which is what `vtype` records and why `vtype` says almost
   *  nothing (it reads "Site Physical Verification" on 299 of the 324 and
   *  "Evidence" on 313; almost every check is in almost every category).
   *
   *    Document  a certificate, report, register, drawing or lab result. The
   *              number or the signature IS the compliance, and nothing on site
   *              substitutes for it.
   *    Asset     a physical thing or a condition of one — a colour, a vent, a
   *              guard, a crack, a lid. No file makes a faded marking compliant.
   *    Practice  a way of working. Whether the round actually happens, whether
   *              a below-threshold reading actually produces the action. Fails
   *              while every document in the file reads clean.
   *
   *  THE THRESHOLD IS NOT A FOURTH VALUE. 274 of the 324 carry a measurable
   *  figure, so a "Specification" category would swallow the register and
   *  distinguish nothing. It belongs in `complianceTest`. */
  confirmedBy: "Document" | "Asset" | "Practice" | null;
  /** What the WALK contributes — a separate axis from `confirmedBy`, and
   *  deliberately so.
   *
   *    examine    go and look; the walk can settle it
   *    reconcile  go and look to prove the record is THIS asset's — a serial
   *               number against a certificate, a measured distance against a
   *               drawing, the cooling towers on site against the certificates
   *               held
   *    none       there is nothing to see; a walk here would be theatre
   *
   *  A Document check is very often `reconcile`, which is the whole point of
   *  keeping two axes: a calibration certificate IS the compliance AND the walk
   *  is what proves it belongs to the meter in front of you. Collapsing the two
   *  loses that, and losing it is how a certificate for a spare instrument gets
   *  accepted for the one in the field. */
  inspect: "examine" | "reconcile" | "none" | null;
  /** WHAT MAKES IT COMPLIANT, in a sentence an auditor can hold the evidence
   *  against. Written for the 95 checks whose `evidenceExpected` was a stub —
   *  "Test records", "Inspection; programme", nine of them empty — and for
   *  every check whose ACSA threshold conflicts with its own wording. Null
   *  where `evidenceExpected` already says it properly. */
  complianceTest: string | null;
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
  /** WHERE THIS PHOTOGRAPH WAS TAKEN, in the auditor's own words.
   *
   *  Not the register's `area` column and not a coordinate. "Stand 12", "north
   *  switch room", "Pier B roof" — the words somebody would use on the radio to
   *  send a maintenance team to the same spot. A photograph without one is an
   *  image of a defect nobody can find again, which is a photograph that proves
   *  nothing.
   *
   *  Inherited from the inspection it is attached to at the moment of capture,
   *  because on a walk the camera is always where the auditor is; editable per
   *  photograph, because one inspection can carry evidence from two places.
   *
   *  Optional and absent-means-empty — see Response.location for why that does
   *  not need a persist version bump. */
  location?: string;
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
  /** WHICH asset this photograph is of — the name on the plate, and its
   *  number, tag or reference.
   *
   *  A caption says what is wrong. These say what it is wrong WITH, and that
   *  is the half a maintenance planner needs to act: "corroded busbar" is a
   *  photograph, "corroded busbar, MV Switchboard 3B, tag SW-3B-011" is a job
   *  card. Written down on the apron with the plate in front of the auditor,
   *  it is thirty seconds; reconstructed afterwards it is a site visit.
   *
   *  BOTH ARE OPTIONAL, deliberately. Plenty of evidence has no single asset
   *  behind it — a cable trench, a housekeeping shot, a document on a desk —
   *  and a required field on those would either be left blank and nag or be
   *  filled with something untrue. An uncaptioned photograph is incomplete; an
   *  unattributed one is merely not about one asset.
   *
   *  Free text, NOT a link to the asset register. The register is not here yet,
   *  and what the auditor reads off the plate is the evidence either way. When
   *  the register does arrive these become what a real assetId is matched
   *  against, and nothing captured now is wasted. */
  assetName?: string;
  assetRef?: string;
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
  /** ACSA SAYS COMPLIANT, AND THE EVIDENCE IS STILL TO COME.
   *
   *  Sarel, 2026-09-12: "ACSA's explanation is that they are compliant but
   *  need to be verified when they submit the evidence" — and "we can maybe
   *  later use this tag to generate an RFI to request the information".
   *
   *  DELIBERATELY A FLAG ON "C" AND NOT A FIFTH `Compliance` VALUE. A fifth
   *  token would fall through every count, rating, export and completion rule
   *  that currently switches on the four — ten sites in `src/lib` alone — and
   *  each one is a place a check silently stops being counted. This is also
   *  what the state actually is: compliant, with the proof outstanding. So
   *  every existing rule keeps treating it as "C" and nothing had to be
   *  rewired to add it.
   *
   *  The invariant, enforced in `setCompliance` and nowhere else: this can
   *  only ever be true while `compliance === "C"`. Any other answer clears it,
   *  because "evidence pending" against a non-compliance is not a statement
   *  anybody made.
   *
   *  Optional, so a record written before this existed reads as false and no
   *  store migration is needed. */
  evidencePending?: boolean;
  /** Whether the evidence this check needs has been produced — see
   *  EvidenceStatus. `null` is "nobody has said" rather than "none exists";
   *  the register has to be able to tell those apart. */
  evidenceStatus: EvidenceStatus | null;
  /** The list of what is missing, for `specificNotAvailable`. Unused by the
   *  other three states and left blank rather than cleared retroactively if
   *  the status changes — a note typed once is not worth losing to a tap
   *  that changed something else.
   *
   *  DECISION REVERSED. This used to double as `toBeProvided`'s own list
   *  too — one field, read differently depending on which status was
   *  selected, so switching between the two statuses showed the same items
   *  under a different heading rather than two genuinely separate lists.
   *  Sarel: "the list of evidence for evidence pending and specific
   *  evidence not available is two seperate lists, allow to keep seperate
   *  lists" — see evidencePendingNote below, `toBeProvided`'s own field. */
  evidenceStatusNote: string;
  /** `toBeProvided`'s own list — what, and by when. See the note on
   *  evidenceStatusNote above for why this is a separate field rather than
   *  the same one read two ways. */
  evidencePendingNote: string;
  observation: string;
  evidencePicked: number[];
  issuesPicked: number[];
  walkaboutPicked: number | null;
  attachments: Attachment[];
  /** DERIVED, and written only by the store: true when every mode this check's
   *  vtype declares has been answered. Every one of the 324 checks needs both
   *  a document review and the asset seen (see the note on needsDesk/
   *  needsField in src/lib/verification.ts) and is not captured until both
   *  halves are done — before per-portal tracking existed this flag went
   *  true on the first save from either screen, so a check could read as
   *  complete with nobody having looked at the asset. Never set this
   *  directly; call commit(id, portal). */
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
  /** WHERE THE ASSET WAS INSPECTED, in the auditor's own words.
   *
   *  The register's `area` column is a CATEGORY — 133 of them at KSIA and a
   *  third are not places at all ("Appointments", "Documentation", "Lessons
   *  learnt"). It cannot say where the auditor was standing, and a finding that
   *  cannot be walked back to is a finding nobody can close.
   *
   *  Free text with the site's areas offered as suggestions, never a closed
   *  list: real zone names have not been supplied by ACSA yet, and forcing a
   *  wrong category is worse than a blank.
   *
   *  Optional because every record captured before this field existed has no
   *  location, and absent is the honest reading of that — not-captured, never
   *  "nowhere". Same shape as `feedback?` and `adhoc?`: an absent optional that
   *  reads as empty needs no persist version bump, because there is nothing for
   *  a migration to convert.
   *
   *  Written on commit from the screen's running location, so the auditor types
   *  where they are once per place rather than once per check. */
  location?: string;
  flaggedForField: boolean;
  /** AN INTERNAL NOTE ON THE CHECK ITSELF, NOT ON THE ASSET IT AUDITS.
   *
   *  Sarel: "add an internal flag option to tag with a note on how to
   *  improve this check." Everything else on this record is the audit —
   *  what ACSA's register asks for and what TPJV found. This is the one
   *  field that is about the register row, not the site: the wording is
   *  ambiguous, the evidence list is missing something, the threshold
   *  looks stale — feedback for whoever next revises the check-points
   *  (see BACKLOG.md, "Re-cut the register against ACSA's full policy
   *  set"), never sent to ACSA and never counted in a rating.
   *
   *  Optional, same shape as `location` and `feedback` — a record written
   *  before this existed simply has none, which reads correctly as
   *  "nobody flagged it", so no persist version bump is needed. */
  improvementFlag?: boolean;
  /** Only meaningful while `improvementFlag` is true — what should change,
   *  and why. Left as typed rather than cleared if the flag is toggled
   *  off, the same choice `evidenceStatusNote` makes: a note typed once
   *  is not worth losing to an accidental tap. */
  improvementNote?: string;
  /** When this record last changed, on whichever device changed it.
   *
   *  THE FIELD THAT MAKES A MERGE POSSIBLE. Two auditors capture the same
   *  audit on two devices; combining them means knowing, record by record,
   *  which side is newer. The timestamps that were already here cannot answer
   *  that — capturedAt, deskDoneAt and fieldDoneAt are only written on commit,
   *  so an answer typed and not yet saved has nothing to compare, and a
   *  finding's createdAt says when it was raised rather than when it was last
   *  edited.
   *
   *  Optional, because records captured before this existed do not have one.
   *  The migration back-fills from the best timestamp each record already
   *  carried, and the merge reads a missing value as 0 — which is correct:
   *  anything touched since the upgrade genuinely is newer. */
  updatedAt?: number;
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
  /** The Title this hazard has in the portal's Findings list, once it has been
   *  there.
   *
   *  Set by the SharePoint sync on the first successful create and never
   *  changed afterwards. It is what makes a second sync an UPDATE rather than
   *  a duplicate: without it, every sync would mint a new id and the register
   *  would grow a fresh copy of the same hazard at every visit.
   *
   *  Absent means "not in the portal yet", which is the honest state for a
   *  hazard raised an hour ago on a walk. */
  portalId?: string;
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
  /** Which SystemAssessment.events this hazard was raised FROM, by their id —
   *  the asset-system equivalent of findingIds above. What findingIds's
   *  presence-check does for the loose-findings count, this does for the
   *  asset-assurance events list on the HIRA screen: once an event's id is in
   *  some hazard's list, it has been pulled through and stops being offered
   *  again. Optional and usually empty — most hazards still come from
   *  consolidating findings, the walk, or ACSA directly. */
  sourceSystemEventIds?: string[];
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
  /** WHICH PHYSICAL AREAS OF THE AIRPORT this event would reach, not which
   *  discipline wrote it up. Sarel: "should be able to select any of the
   *  areas of the airport as part of the impact." Plural for the same
   *  reason disciplines and systems are — an uncontained fuel release at a
   *  stand reaches the apron and could reach the terminal apron road, and a
   *  hazard that can only name one area understates what it actually
   *  threatens. Register areas (register.ts's areasAt), not free text —
   *  consistent with disciplines and systems, which are the register's own
   *  vocabulary rather than the auditor's phrasing of it. */
  areas: string[];
  /** IMPACTS THE REGISTER'S ASSET SYSTEMS DO NOT NAME. Sarel: "also allow
   *  to add other impacts." Systems above is the register's fixed list; an
   *  event can plausibly threaten something the register never enumerated
   *  as a system at all — reputational exposure, a contractual penalty, a
   *  third party's equipment on the apron — and forcing that into the
   *  systems list would either invent a fake system or drop the impact.
   *  Free text, deliberately: there is no register vocabulary for this to
   *  be checked against. */
  otherImpacts: string[];
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
  /** Which physical assets this is about, by their register tag.
   *
   *  A finding says something is wrong; the asset says what it is wrong WITH,
   *  and that is the half a maintenance planner needs to raise a job card.
   *
   *  Plural because one record regularly covers several — "three of the eight
   *  runway edge fittings" is one finding and three assets — and optional
   *  because plenty are not about a specific asset at all: a missing register,
   *  an appointment nobody made, a procedure nobody signed. A required field on
   *  those would be filled with something untrue.
   *
   *  Tags, not object references. The register is a separate file that will be
   *  replaced wholesale when ACSA supplies the real one, and a link that
   *  survives that replacement has to be by tag. An id whose row has gone is
   *  still shown, as itself — see assetsById(). */
  assetIds?: string[];
  /** Same vocabulary as a finding's — ROOT_CAUSES in src/lib/store.ts. A hazard
   *  built from several findings usually has one cause behind all of them, and
   *  that is the thing the remediation has to address. */
  rootCause: string;
  /** Plural — see MitigatingAction. */
  actions: MitigationAction[];
  /** THE CARRY-FORWARD GATE, not a summary of `actions` above. Driven by the
   *  follow-up screen's verification flow (src/lib/carryforward.ts), same as
   *  a Finding's own field of the same name — deliberately not derived from
   *  whether every mitigating action is Closed, because a hazard can have all
   *  its named actions done and still be waiting on verification, or be
   *  verified closed with an action still nominally open on paper. */
  actionStatus: ActionStatus;
  createdAt: number;
  createdBy: string;
  /** When this record last changed. See the note on Response.updatedAt — it is
   *  what lets two devices' work be combined without guessing. */
  updatedAt?: number;
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
  /** Which physical assets this is about, by their register tag.
   *
   *  A finding says something is wrong; the asset says what it is wrong WITH,
   *  and that is the half a maintenance planner needs to raise a job card.
   *
   *  Plural because one record regularly covers several — "three of the eight
   *  runway edge fittings" is one finding and three assets — and optional
   *  because plenty are not about a specific asset at all: a missing register,
   *  an appointment nobody made, a procedure nobody signed. A required field on
   *  those would be filled with something untrue.
   *
   *  Tags, not object references. The register is a separate file that will be
   *  replaced wholesale when ACSA supplies the real one, and a link that
   *  survives that replacement has to be by tag. An id whose row has gone is
   *  still shown, as itself — see assetsById(). */
  assetIds?: string[];
  rootCause: string;
  /** Plural — see MitigatingAction. */
  actions: MitigationAction[];
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
  /** When this record last changed. See the note on Response.updatedAt — it is
   *  what lets two devices' work be combined without guessing. */
  updatedAt?: number;
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

/** A HAZARDOUS EVENT THIS FINDING COULD LEAD TO, AND HOW LIKELY IT IS.
 *
 *  Plural, and that is the point. "TRF 02 oil below the minimum threshold" is
 *  one finding with at least three futures: a transformer trip that takes a
 *  stand off supply, a winding failure that costs a replacement and a
 *  lead-time, and an oil fire. They are not variations of one event — they have
 *  different likelihoods and different consequences, and an audit that records
 *  only the worst one over-rates the common case while an audit that records
 *  only the likely one under-rates the severe. Recording them separately is
 *  what makes a finding's risk arguable rather than asserted.
 *
 *  The LIKELIHOOD here is ACSA B170 001M's 1–5, the same scale the finding's
 *  own rating uses — not the ERM instrument's. They are separate instruments
 *  and must never be derived from one another; see the header of src/lib/erm.ts.
 *
 *  Severity is deliberately NOT on this record. A hazard's severity is agreed
 *  by the group on the matrix and lives on the Hazard, which is where a rating
 *  of record belongs; this is the walk-up list that feeds that conversation.
 *  Adding a severity here would create a second, un-agreed rating for the same
 *  event, which is exactly the drift ratingConfirmed exists to stop.
 *
 *  Optional on its holder and absent-means-empty, so no persist version has to
 *  move: an item recorded before this existed has no possible events, and that
 *  is the honest reading of an absent field. */
export interface PossibleEvent {
  id: string;
  /** The event, not the paperwork. "Uncontained oil fire at AS1", not
   *  "maintenance report inadequate" — the finding already says that. */
  event: string;
  likelihood: Likelihood | null;
  /** Why it is that likely, in the auditor's own words. Optional, and worth
   *  more than the number on its own when the group argues the rating. */
  note: string;
  /** THE EVIDENCE BEHIND THE EVENT — Sarel: "the risk event is linked to the
   *  failure of an asset system or a specific finding... a hierarchy or
   *  linked evidence of non-compliance and findings all contributing to the
   *  risk, giving the full picture. Multiple assets and findings can
   *  contribute to the same hazardous event." Only meaningful for a
   *  SystemAssessment's events — a carried finding's own possible events
   *  (closure screen) are already tied to the one finding they were raised
   *  against, so both stay optional and unused there. Carried through
   *  verbatim onto the Hazard when the event is promoted (see
   *  promoteSystemEvent in hazards/page.tsx), the same way a consolidated
   *  hazard's findingIds are. */
  findingIds?: string[];
  assetIds?: string[];
  createdAt: number;
  createdBy: string;
}

/* ---------- the asset system's own assessment ----------

   THE RATING OF RECORD, AND WHERE IT FINALLY LIVES.

   ACSA rates, reports and compares ASSET SYSTEMS year on year — that is the row
   in their register and the unit a Cluster report is written about. Squawk had
   ratings on findings and on hazards and none on the thing ACSA actually
   publishes, so an asset system's band was something a reader had to infer from
   the worst finding under it. Inferring it is wrong twice over: three Amber
   findings on one system is not an Amber system, and a system with no findings
   at all is not automatically Green — it may simply not have been looked at.

   So the asset system carries its own severity, its own likelihood and its own
   `ratingConfirmed`, agreed by the group on B170 001M like every other rating
   in this product, and the band and treatment strategy are DERIVED from the
   cell rather than typed. Nothing here is computed from the findings under it:
   the findings are evidence the group reads before agreeing the cell, and the
   screen shows them all for that reason. */

/** One root cause, of several. ACSA's own list is a closed vocabulary — see
 *  ROOT_CAUSES in src/lib/store.ts — but an asset system regularly fails for
 *  more than one reason at once (no budget AND no competent person), and
 *  forcing a single choice loses whichever the auditor did not pick. */
export interface RootCauseNote {
  id: string;
  /** From ROOT_CAUSES where it fits, free text where it does not. The list is
   *  ACSA's and this is not the place to extend it, so anything outside it is
   *  recorded as written rather than mapped onto the nearest member. */
  cause: string;
  note: string;
  createdAt: number;
  createdBy: string;
}

/** One mitigation action, of several. Each carries its own owner, date and
 *  status, because an asset system's remediation is regularly three jobs owned
 *  by three people on three timelines — a single owner/date pair forces the
 *  auditor to write the other two into a comment where nothing tracks them. */
export interface MitigationAction {
  id: string;
  /** Optional because SystemAssessment (below), the first thing to use this
   *  type, is already scoped to one discipline and never needed a second per
   *  entry. Finding and Hazard, which reuse this type for their own
   *  `actions` (Sarel: "adding a discipline and person and date to each
   *  mitigation action" — a consolidated hazard spans disciplines by nature,
   *  so an action to fix it belongs to whichever discipline is actually
   *  doing the work), always set it. */
  discipline?: string;
  action: string;
  owner: string;
  /** ISO date, as everywhere else. Blank is a real state and it is flagged
   *  rather than defaulted: a target date nobody agreed is worse than none. */
  dueDate: string;
  status: ActionStatus;
  /** Which visit this was logged at. Optional for the same reason as
   *  `discipline` — SystemAssessment did not need it — but Finding and
   *  Hazard always set it: Sarel wants to "add additional mitigating
   *  actions and also review any previously identified" at each audit, and
   *  that needs to say which audit added which, the same reason
   *  ProgressNote carries a visit. */
  originVisit?: string;
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
}

export interface SystemAssessment {
  /** `${discipline}|${system}` — the pair, because an asset system name is only
   *  unique within its discipline. */
  key: string;
  discipline: string;
  system: string;
  severity: Severity | null;
  likelihood: Likelihood | null;
  /** THE GATE, as everywhere else. A severity and likelihood that nobody tapped
   *  on the matrix is a suggestion; every count, dashboard and export ignores
   *  the rating until this is true. */
  ratingConfirmed: boolean;
  /** Why the group agreed that cell. Not optional in spirit — a band with no
   *  reasoning is the thing ACSA sends back — but blank is allowed, because
   *  forcing prose produces prose nobody means. */
  ratingRationale: string;
  rootCauses: RootCauseNote[];
  actions: MitigationAction[];
  /** THE HAZARDOUS EVENTS THIS ASSET SYSTEM COULD LEAD TO, same shape and same
   *  reasoning as a carried finding's PossibleEvent (see PossibleEvents.tsx):
   *  one asset system regularly has several distinct futures, each with its
   *  own likelihood, and recording only the worst over-rates the common case.
   *
   *  UNLIKE a carried finding's possible events, these are meant to be
   *  promoted — Sarel: "allow to add multiple hazardous events per asset
   *  system which must pull through to the hira view." The asset-system panel
   *  is where the group is already looking at a system as a whole, so naming
   *  its likely events here and turning each into a Hazard (see
   *  Hazard.sourceSystemEventIds) is a shorter path than waiting for a
   *  finding to exist to consolidate from. */
  events: PossibleEvent[];
  /** The assessor's summary of the asset system as a whole. */
  note: string;
  assessedBy: string;
  assessedAt: number | null;
  /** See Response.updatedAt — what lets two devices' work be combined. */
  updatedAt?: number;
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
  /** WHAT HAPPENS NEXT, as distinct from `action`.
   *
   *  `action` is the remediation — what has to be done to fix the thing. This
   *  is the next step in getting it done: who is being chased, what the site
   *  committed to at the close-out meeting, which report is being waited for.
   *  ACSA's own sheet folds the two into one cell and it is regularly filled
   *  with the chase rather than the fix, which is how a finding arrives at the
   *  next audit with no recorded remedy at all. Two fields, two questions.
   *
   *  Optional and absent-means-empty — no persist version has to move. */
  nextStep?: string;
  /** The hazardous events this finding could lead to, each with its own
   *  likelihood. See PossibleEvent. Absent-means-empty. */
  possibleEvents?: PossibleEvent[];
  /** When this record last changed. See the note on Response.updatedAt — it is
   *  what lets two devices' work be combined without guessing. */
  updatedAt?: number;
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
  /* DECLARING WHAT WAS ALREADY BEING WRITTEN (2026-09-10, task #67).
   *
   *  The walk screen's camera does `addCapture({ ...m, area, createdBy })` and
   *  `m` is PhotoButton's full payload, so every one of these has been landing
   *  in the persisted record since captures existed — undeclared, because
   *  TypeScript does not excess-property-check a spread. Nothing about the
   *  stored data changes here and no migration is needed; the type is being
   *  corrected to match what is on disk.
   *
   *  `thumbDataUrl` is the one that matters. It is the copy that rides the
   *  shared record between devices, so an unassigned capture can be reviewed by
   *  an engineer who was not on the apron — which is the whole point of the
   *  tray. Without this declaration the Visual review screen could not read it
   *  and every loose photograph would have rendered as "on the device that took
   *  it" while its thumbnail sat in the same object. */
  thumbDataUrl?: string;
  caption?: string;
  width?: number;
  height?: number;
  bytes?: number;
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

/** SOMETHING SEEN ON THE WALK THAT THE REGISTER DOES NOT COVER.
 *
 *  The 324 check-points are what ACSA asked us to look at. They are not
 *  everything there is to see, and the most valuable thing in an audit is
 *  regularly the thing nobody thought to put on the list. Until this existed
 *  an auditor standing in front of an undocumented defect had two options —
 *  raise a Finding, which demands a discipline, a title and eventually a
 *  rating, or lose it. Ten seconds of typing on an apron is the budget, so
 *  most of them were lost.
 *
 *  IT IS NOT ONE OF THE 324, AND NOTHING MAY LET IT LOOK LIKE ONE.
 *
 *  · Its own id series — WALK-xxxxx, which no register row can collide with.
 *    Random rather than sequential for the same reason findings are: two
 *    auditors on two devices both minting WALK-03 would merge into one record
 *    and lose an observation, and the merge keys on id.
 *  · It creates no Response, so it cannot reach the completion figure. That
 *    figure counts responses to register checks and nothing else — a "312 of
 *    324" reading must not become 313 because somebody recorded an
 *    observation.
 *  · Every export says which it is.
 *
 *  Almost everything is optional on purpose. An unattributed observation is a
 *  real state and forcing a discipline on it produces a lie; a half-captured
 *  item completed back at the hotel is worth infinitely more than a lost one.
 *  The description is the one thing that cannot be blank, because an item with
 *  no description is not a record of anything. */
export interface AdHocItem {
  /** WALK-xxxxx. Never a register id. */
  id: string;
  /** Same vocabulary as a Hazard's, deliberately — a parallel origin
   *  vocabulary is how two words come to mean the same thing and neither can
   *  be reported on. "consolidated" is absent because an ad-hoc item is by
   *  definition not consolidated from anything. */
  origin: "field" | "acsa" | "tpjv";
  /** What you found. Required. */
  description: string;
  /** Optional, and null is a real answer. */
  discipline: string | null;
  /** The register asset system, where the auditor can name one. Null is
   *  common and honest: plenty of what is worth recording is not about a
   *  system on our list, and that is itself evidence about the register. */
  system: string | null;
  /** Where it was seen, in whatever words are true. Free text, because zone
   *  names do not exist yet and the register's categories are not places. */
  area: string;
  /** Same four values as a check's, so the control and the vocabulary are the
   *  same everywhere. Usually NC. Not forced. */
  outcome: Compliance | null;
  note: string;
  attachments: Attachment[];
  /** Set when somebody raises a finding from this item, so the observation and
   *  the finding stay attached rather than becoming two accounts of one thing.
   *  Null until then, which is the normal state on the walk. */
  findingId: string | null;
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
}

/** How the ACSA site representative was told. SWP-07 says "verbally at once",
 *  so in-person and phone are the ones that satisfy it; a message or an email
 *  is a record of having tried, not a notification. Stored so the register can
 *  show which, rather than flattening every notification into "notified". */
export type NotifyMethod = "in-person" | "phone" | "radio" | "message" | "email";

/** The stage an Immediate Safety Finding has reached.
 *
 *  DERIVED from the timestamps, never stored — see isfStage() in src/lib/isf.ts.
 *  A stored status and the timestamps it summarises drift apart the first time
 *  one is written without the other, and then the register says "notified" for
 *  something with no notification time on it. */
export type IsfStage = "raised" | "notified" | "issued" | "closed";

/** How soon the underlying issue needs the corrective action done — not how
 *  urgently SWP-07's immediate response happened, which is already the
 *  `raisedAt`→`notifiedAt`→`writtenIssuedAt` clocks. An ISF that was
 *  notified in two minutes can still need a slow structural fix; this is the
 *  second clock, not a restatement of the first. No existing vocabulary in
 *  this app answers this question (checked: `priority`/`ErmPriority` are the
 *  ERM instrument's output, a different thing), so this is new. */
export type Urgency = "Immediate" | "Within 24 hours" | "Within a week" | "Routine";

export const URGENCIES: readonly Urgency[] = [
  "Immediate",
  "Within 24 hours",
  "Within a week",
  "Routine",
];

/** An Immediate Safety Finding — TK-003 form 1, on the tablet.
 *
 *  STILL NOT A FINDING — it does not carry between visits, it is not in the
 *  Findings register, and SWP-07's own clocks (raised → notified verbally →
 *  written notice → closed) stay the one authoritative lifecycle for
 *  "is the danger gone". That boundary this type's comment drew before is
 *  unchanged.
 *
 *  WHAT CHANGED (Sarel, 1 October 2026): the form now also captures a risk
 *  assessment — severity, likelihood, root cause, mitigating actions, an
 *  asset system — in the same vocabulary as B170 001M, reusing
 *  `RecordActions` rather than inventing a second rating UI. That is
 *  additional diagnostic context for the finding, not a merger into the
 *  Findings register: nothing here feeds year-on-year comparison, and
 *  `ratingConfirmed`/`actionStatus` are this record's own, not shared with
 *  any Finding or Hazard. See OPEN-QUESTIONS.md if this read is wrong.
 *  SWP-07 sets its whole shape — stop, make safe only if it can be done without
 *  risk, notify the ACSA site representative VERBALLY AT ONCE, complete the
 *  form, issue written notification THE SAME DAY — and none of those steps has
 *  an equivalent on a finding.
 *
 *  Two consequences run through the fields below.
 *
 *  First, it is raised in seconds, in a place the person raising it wants to
 *  leave. So only `description` is required to save one. Everything else can be
 *  filled in afterwards, from somewhere safer, and an ISF sitting half-complete
 *  in the register is doing its job — it exists, and the register says what is
 *  missing. A form that demanded every field before it would save is a form
 *  that gets filled in later from memory, or not at all.
 *
 *  Second, the times are the compliance record. `raisedAt` to `notifiedAt` is
 *  the gap SWP-07 calls "at once", and `raisedAt` to `writtenIssuedAt` is the
 *  one it calls "the same day". Both are what a reviewer asks about, so both
 *  are recorded as instants rather than inferred from when a row was edited.
 *  `raisedAt` itself IS correctable, though — Sarel's field list asked for an
 *  editable date and time, same reasoning as the PPE check's: an ISF phoned
 *  in from the apron and typed up later needs its own real raise time, not
 *  whatever the tablet happened to say when someone got round to the form. */
export interface SafetyFinding {
  /** ISF-xxxxx. Prefix is deliberate: it is the photograph prefix too, so an
   *  image in the export zip reads ISF-7K2P9_P01 and nobody has to ask which
   *  record it belongs to. */
  id: string;
  entity: string;
  originVisit: string;

  /** The moment the auditor stopped. Not when the form was finished. */
  raisedAt: number;
  /** Who saw it happen. */
  raisedBy: string;
  /** Who is filling in this record. Usually the same person as `raisedBy`,
   *  deliberately a separate field for the time it is not — an ISF phoned in
   *  from the apron and typed up by somebody else back at the desk is still
   *  one event seen by one person, attributed to both correctly. */
  recordedBy: string;

  /** Free text, because the danger does not check the register first. What
   *  happened. */
  description: string;
  /** Where, in words somebody can walk to without asking. */
  location: string;
  /** Further detail beyond the short `location` above — which bay, which
   *  side of it, what else was nearby. Optional in the sense that `location`
   *  alone already satisfies the register; this is for when a reader two
   *  years from now needs to find the exact spot. */
  locationDescription: string;
  discipline: string | null;
  /** The named asset system(s) this is about — Baggage handling system, Fire
   *  system, and so on, same list `systemsAt()` gives Hazards. Distinct from
   *  `assetIds` below: this is the CATEGORY, assetIds are specific tagged
   *  items within it.
   *
   *  DECISION REVERSED — plural, like Hazard.systems. Sarel: "asset system
   *  should be a multi select" — a single immediate danger can span more
   *  than one system (a fire in a baggage hall is both Fire and Baggage
   *  handling), and the single-select version could only ever name one. */
  assetSystems: string[];
  /** The register tags this is about, where there are any. Same reasoning as a
   *  finding's: plenty of immediate risks are not about one tagged asset. */
  assetIds?: string[];

  /** SWP-07's "make safe" has two halves and they are different questions: what
   *  could happen to a person, and what was actually done. Recording only the
   *  second is how "made safe" ends up meaning nothing. */
  riskToPersons: string;
  immediateAction: string;
  /** What actually happened as a result — property damage, a delay, a near
   *  miss with no injury. Distinct from `riskToPersons`, which is specifically
   *  about people; an ISF can have a real impact with nobody at risk. */
  actualImpact: string;
  /** The reasonable worst case if this had gone differently, or recurs. What
   *  the severity rating below is being judged against. */
  potentialImpact: string;
  /** How soon the underlying issue needs fixing — see Urgency. Independent of
   *  how fast the verbal notification happened. */
  urgency: Urgency | null;

  /** THE RISK ASSESSMENT, same instrument as Findings and Hazards — severity
   *  and likelihood on B170 001M, a root cause, one or more mitigating
   *  actions, all through the shared RecordActions component. See the note at
   *  the top of this interface: this does NOT make an ISF a Finding. Nothing
   *  here is agreed between audits or compared year-on-year; it is this
   *  record's own assessment of its own event. */
  severity: Severity | null;
  likelihood: Likelihood | null;
  /** Set by tapping the matrix cell, by nothing else — see RecordActions'
   *  own rule on this. */
  ratingConfirmed: boolean;
  rootCause: string;
  actions: MitigationAction[];
  /** Whether the mitigating work above is still open — independent of
   *  `closedAt` below, which is specifically "is the immediate danger gone".
   *  A finding can need weeks of corrective work after the danger itself was
   *  made safe in the first five minutes. */
  actionStatus: ActionStatus;

  /** The verbal notification. Null until it happens — and an ISF with a
   *  description and no notification is exactly the row the register should be
   *  shouting about. */
  notifiedTo: string;
  notifiedMethod: NotifyMethod | null;
  notifiedAt: number | null;

  /** The written notice, same day, to the airport contact and the ACSA Centre
   *  of Excellence. `writtenTo` is who it went to, so the record stands on its
   *  own when the sent item is in somebody's mailbox. */
  writtenTo: string;
  writtenIssuedAt: number | null;

  /** ACSA's Area or Dept Manager for where this happened — named, so the
   *  record says who on ACSA's side owns the area, not just that somebody
   *  was told (that is `notifiedTo`, which can be anybody on site). Plain
   *  text, same as `notifiedTo`/`writtenTo` above — not every manager named
   *  here is in the people directory yet, and this screen does not want a
   *  second interaction pattern for one field where those two already work. */
  acsaManagerName: string;

  /** THE SIGN-OFF. TPJV's authorised person, attesting the record above is
   *  accurate — same Signature shape and the same invalidation rule every
   *  other signed record in this app uses: change what it attests to and the
   *  mark is cleared. See signIsf() in src/lib/store.ts. */
  authorisedBy: string;
  authorisedSignature: Signature | null;

  /** Photographs, held exactly as a walk item's are: the media store keeps the
   *  bytes, this keeps the reference. */
  attachments: Attachment[];

  /** Set if the ISF is also written up as an audit finding. Most are — the
   *  danger is dealt with on the day and the underlying non-compliance is still
   *  reportable — but the two records answer different questions and are kept
   *  apart on purpose. */
  findingId: string | null;

  /** Closed means the risk to persons is gone, not that the paperwork is done.
   *  `closureNote` says who confirmed it and how. */
  closedAt: number | null;
  closedBy: string;
  closureNote: string;

  createdAt: number;
  updatedAt: number;
}

/* -------------------------------------------- incident and near-miss reports */

/** Which part of the body was affected — the exact fixed vocabulary Annexure
 *  1 of the OHS Act (Act 85 of 1993) uses, Regulation 9's General
 *  Administrative Regulations form for recording and investigating
 *  incidents. Null for a near miss nobody was hurt in. */
export type IncidentBodyPart =
  | "Head"
  | "Neck"
  | "Eye"
  | "Trunk"
  | "Finger"
  | "Hand"
  | "Arm"
  | "Foot"
  | "Leg"
  | "Internal"
  | "Multiple";

/** The effect on the person — same Annexure 1 vocabulary. */
export type IncidentEffect = "Sprain or strain" | "Contusion or wound" | "Fracture" | "Burn" | "Amputation";

/** An incident or a near-miss — TK-003 form 5, completed on any incident,
 *  signed by the completer and a competent person. Feeds SF-005 sheet 8.
 *
 *  BUILT AGAINST THE ACTUAL STATUTORY FORM, not a generic template:
 *  Annexure 1 of the OHS Act, 1993 (Act No 85 of 1993), Regulation 9 of the
 *  General Administrative Regulations, "Recording and Investigation of
 *  Incidents" — a South African employer does not design its own incident
 *  form, it completes this one. Section A below is its recording half;
 *  Section B its investigation half; Sections C/D its action and HS
 *  Committee remarks. `completedBy`/`competentPersonName` are Annexure 1's
 *  own two signers, not TPJV's invention.
 *
 *  THE DEPARTMENT OF LABOUR FIELDS ARE NOT ON TK-003 ITSELF. Contract
 *  clause C1.3 compliance item 10 requires incidents reported to the
 *  Provincial Director: Department of Labour as well as to ACSA — see
 *  docs/REGISTERS.md §3a — and the hardcopy form predates that contract
 *  requirement. Both notifications are tracked here because a form that
 *  only answers "did ACSA know" leaves the DoL obligation with nowhere to
 *  be recorded as done. */
export interface IncidentReport {
  /** `INC-xxxxx`. */
  id: string;
  entity: string;
  originVisit: string;

  /** A near miss and a recordable incident are the same form — Annexure 1's
   *  own "incident" already covers a near miss, which is why TK-003 names
   *  form 5 "Incident / Near-Miss" rather than splitting it into two. This
   *  is TPJV's one addition to the shape, not Annexure 1's: it decides
   *  whether `bodyPartAffected`/`effect` below are expected to be set. */
  isNearMiss: boolean;

  /* --------------------------------------------------- Section A: recording */
  date: string;
  time: string;
  location: string;
  /** The affected person — optional, because a near miss can have nobody
   *  involved by name (a dropped tool nobody was under). ContactPicker-
   *  backed like every other named person in this app, so typing someone
   *  not yet on file joins the directory the same way attendance and PPE
   *  already do. */
  affectedPersonContactId?: string;
  affectedPersonName: string;
  affectedPersonIdNumber: string;

  bodyPartAffected: IncidentBodyPart | null;
  effect: IncidentEffect | null;
  /** Annexure 1: "machine/process/type of work performed/exposure" — what
   *  was actually being done when it happened. */
  exposure: string;

  /** Annexure 1's own two notification questions. */
  reportedToCompensationCommissioner: boolean;
  /** The contract's addition — see the note on the interface above. */
  reportedToDoL: boolean;
  doLReference: string;
  doLNotifiedAt: number | null;

  /* ----------------------------------------------- Section B: investigation */
  investigatorContactId?: string;
  investigatorName: string;
  investigatorDesignation: string;
  investigationDate: string;
  description: string;
  suspectedCause: string;
  recommendedSteps: string;

  /* --------------------------------------------------- Sections C/D: action */
  /** Plural, same component as everywhere else in this app that tracks
   *  corrective work — see MitigationAction. */
  actions: MitigationAction[];
  actionStatus: ActionStatus;
  /** Annexure 1 Section D — the Health and Safety Committee's own remarks,
   *  added after the fact rather than at the point of recording. */
  hsCommitteeRemarks: string;

  /** The completer's sign-off. */
  completedBy: string;
  completedSignature: Signature | null;
  /** "A competent person" — Annexure 1's own phrase, not necessarily the
   *  investigator named above (the investigation can be delegated; this is
   *  who actually attests the record). */
  competentPersonName: string;
  competentPersonSignature: Signature | null;

  attachments: Attachment[];

  createdAt: number;
  updatedAt: number;
}

/* --------------------------------------------------------- interview records */

/** How far a day of interviews has got.
 *
 *  DERIVED from the timestamps, never stored — see interviewDayStage() in
 *  src/lib/interviews.ts. */
export type InterviewDayStage = "open" | "closed";

/** One person interviewed, on one day — the record Sarel actually asked for
 *  (28 September 2026): who, where, from and to, and their signature.
 *
 *  This used to carry a great deal more — quote-or-summary statements linked
 *  to check-points, a notice-given toggle, a "citable" verdict. Sarel's own
 *  words, looking at it live: "this is too formal, we just need a record of
 *  who we interview on which day, what the location was, from and to." What
 *  was said belongs to the auditor's own judgement on the check screen; this
 *  is evidence the conversation happened, at this time, in this place, with
 *  this person — the same job an attendance row does, for an interview rather
 *  than a shift. */
export interface InterviewEntry {
  id: string;
  /** Set when this row was added by picking a known person from the People
   *  directory — see the same field on AttendanceEntry and ContactPicker. */
  contactId?: string;
  name: string;
  /** Free text, and optional — the register does not withhold anything for
   *  its absence. Worth having when it is offered; not worth a form field that
   *  makes "just Peter" feel like it was filled in wrong. */
  role: string;

  location: string;
  /** `startedAt` is immutable, for the same reason a signature's timestamp is:
   *  a record whose own time can be rewritten afterwards is not a record.
   *  `endedAt` is null while the interview is still running. */
  startedAt: number;
  endedAt: number | null;

  /** Their mark. Held exactly as an attendance signature is — its own key in
   *  the media store, a reference that is never reused, cleared if `name`,
   *  `role` or `location` changes afterwards, because it is a mark on THAT
   *  statement of who and where. */
  signature: Signature | null;

  createdAt: number;
  updatedAt: number;
}

/** A day of interviews, and the record of that day.
 *
 *  ONE RECORD PER SITE PER CALENDAR DAY, opened or returned exactly as a
 *  SiteDay is — two registers for one day is the same silent failure there as
 *  it is for attendance, and it is guarded the same way.
 *
 *  ACSA asked for this by name — scope 4.2, the on-site audit phase:
 *  "Interview key personnel and stakeholders (e.g. Airport Operations
 *  Departments, Contractors, etc.) to gather information and insights." It is
 *  also priced — pricing schedule 1.2.6(b), "Interviews with key personnel and
 *  stakeholders", at every one of the ten airports. An interview nobody
 *  recorded is an activity TPJV was paid for and cannot evidence.
 *
 *  CLOSED BY AN APPROVAL, not by the last entry. `closedAt`/`closedBy` are the
 *  "approval at the end to close off the record of the day's interviews" Sarel
 *  asked for — one attestation that the day's list is complete and correct,
 *  separate from any one person's own signature. `closeSignature` is optional:
 *  the approval is real the moment it is pressed, and a drawn mark on top of
 *  it is a stronger record where the auditor wants one, not a requirement. */
export interface InterviewDay {
  /** `INT-xxxxx`. The prefix every entry's signature reference is built on. */
  id: string;
  entity: string;
  originVisit: string;

  /** The calendar date, `YYYY-MM-DD`, in the auditor's own timezone — see
   *  localDate() in src/lib/attendance.ts, reused here rather than copied. */
  date: string;

  /** Where the day's interviews were held, and why — both optional, both
   *  header-level rather than repeated per person, since they are usually
   *  true of the whole day's round of conversations, not any one of them.
   *  Added 1 October 2026 when the per-person-only forms were reworked
   *  around a consistent header; absent on any day opened before that, which
   *  reads correctly as "not recorded" rather than as an error. */
  location: string;
  purpose: string;

  openedAt: number;
  openedBy: string;

  entries: InterviewEntry[];
  /** Somebody who was meant to be interviewed and was not available — the
   *  same ApologyEntry shape the attendance register uses, and the same
   *  reasoning: it is the opposite fact about the same "who we meant to
   *  talk to" list, never one of `entries`, because nothing here is a
   *  conversation that happened. OPTIONAL for the same reason — no
   *  migration owed to a day that already exists on a device. */
  apologies?: ApologyEntry[];

  /** The closing approval. Null while the day is still open to more entries. */
  closedAt: number | null;
  closedBy: string;
  closeSignature: Signature | null;

  createdAt: number;
  updatedAt: number;
}

/* --------------------------------------- site attendance and the daily diary */

/** Somebody's mark, drawn on the glass.
 *
 *  DELIBERATELY NOT AN Attachment. An attachment is evidence hung on a record —
 *  a photograph of the thing being described. A signature is an attestation
 *  *about* the record: it says the person agrees with what the row states about
 *  them. Filing it as a photograph would put it in the export's Photographs
 *  sheet beside pictures of switchgear, and would let the same code that
 *  deletes a photograph delete somebody's signature.
 *
 *  Held to the same storage rules as a photograph, and for the same reasons
 *  (docs/REGISTERS.md §1): the bytes live under their own key outside the
 *  persisted value, it carries a reference so the workbook and the record agree
 *  what to call it, it is backed up to the record store because a signature
 *  that exists on one tablet is a signature that can be lost, and a capture
 *  that could not be stored says so rather than leaving a row that looks
 *  signed.
 *
 *  `signedName` is typed, not drawn, and it exists so the record still says WHO
 *  signed if the image is ever lost. It is not itself a signature — a register
 *  of typed names is a list somebody made up. */
export interface Signature {
  /** `ATT-7K2P9_S01`. The day's own id and a sequence number, never reused. */
  ref: string;
  /** Key into the media store, never the bytes. */
  blobKey: string;
  /** The name as typed, so the row is still attributable without the image. */
  signedName: string;
  signedAt: number;
  width?: number;
  height?: number;
  bytes?: number;
  /** Where the record copy lives, once uploaded. The local copy is never
   *  deleted because this is set. */
  cloudUrl?: string;
  cloudAt?: number;
  /** Why the last upload failed, if it did. Shown, never swallowed. */
  cloudError?: string;
}

/** One person, on site, on one day — TK-003 form 2.
 *
 *  "Site Attendance & Induction Confirmation", completed on arrival each day and
 *  signed by each person, per day. It feeds SF-005 sheet 4, Induction & Access.
 *
 *  The induction half is not decoration. Contract Data 20.1 gives access to
 *  sites "Following Airside Induction and Permit Process completions", so a
 *  person whose induction or airside permit has lapsed is a person who should
 *  not be past the gate — and the permits are per person, per airport, and
 *  expiry-dated. A register that records only that somebody was there, and not
 *  that they were entitled to be, answers the easy half of the question. */
export interface AttendanceEntry {
  id: string;
  /** Set when this row was added by picking a known person from the People
   *  directory rather than typing a name from scratch — see ContactPicker.
   *  Nothing here reads it back out of the directory after creation; it is
   *  only a record of where the row came from. */
  contactId?: string;
  name: string;
  /** Employer — TPJV, a subconsultant, ACSA. Free text: it is what they say. */
  organisation: string;
  role: string;

  /** On the day. Arrival is what the form is completed on; departure is filled
   *  in later and is deliberately NOT part of what the signature covers. */
  arrivedAt: number | null;
  departedAt: number | null;

  /** Where they worked, and what they did — added 28 September 2026, on
   *  Sarel's word watching the register live: "a record of everyone that was
   *  on site for the day … location(s) … notes on what was done … like an
   *  action log of the day."
   *
   *  Both free text and both optional. `location` is worded for more than one
   *  place — a person moves through a substation and a switchroom in one
   *  morning, and forcing that into a single field is still simpler than a
   *  list nobody will maintain on a tablet. `notes` is the activity itself,
   *  attributed to the person who did it: "Assisted T. Nkosi with the AGL
   *  vault inspection" says who helped with what without a second structured
   *  field to fill in.
   *
   *  NEITHER IS PART OF WHAT THE SIGNATURE COVERS — see SIGNED_FIELDS. A
   *  person signs to attesting who they are, who they work for and that their
   *  induction is confirmed; what they did that day is filled in and refined
   *  as the day goes, including by somebody else closing it out, and must not
   *  silently unsign them. */
  location: string;
  notes: string;

  /** The induction confirmation. `inductionRef` is the airside induction or
   *  AVSEC permit number, `inductionExpires` the date on it. */
  inductionConfirmed: boolean;
  inductionRef: string;
  inductionExpires: number | null;

  /** Null until they sign, and cleared again if anything they signed for
   *  changes — see SIGNED_FIELDS in src/lib/attendance.ts. */
  signature: Signature | null;

  createdAt: number;
  updatedAt: number;
}

/** What one diary entry is about. A fixed, named set rather than free text
 *  for the same reason PpeItemKey is: Sarel asked for these specifically
 *  ("weather people equipment general progress risks issues"), and a log
 *  whose categories can be spelled differently each day cannot be scanned
 *  or filtered by category. */
export type DiaryCategory =
  | "weather"
  | "people"
  | "equipment"
  | "progress"
  | "risks"
  | "issues"
  | "general";

/** One dated, categorised line in the day's diary — Sarel: "for each entry
 *  capture the category ie weather people equipment general progress risks
 *  isues etc. For each entry i should be allowed to capfure a time."
 *
 *  `at` is the entry's OWN time, separate from `createdAt` — an auditor
 *  logging at 16:00 that it rained at 10:00 should be able to say so, the
 *  same reasoning as an observation's capture time versus event time
 *  elsewhere in this app.
 *
 *  OPTIONAL (2026-10-04) — Sarel: "link a time each entry as optional."
 *  `null` means nobody set one, which is different from "unknown" or
 *  "midnight": a general note logged without a specific moment in mind
 *  stays untimed rather than inheriting whatever `Date.now()` happened to
 *  read when the category button was tapped. Every entry captured before
 *  this changed already carries a real number, which still reads
 *  correctly, so no migration is needed. */
export interface DiaryEntry {
  id: string;
  category: DiaryCategory;
  at: number | null;
  text: string;
  /** Evidence for this one line — photographs and an optional voice note,
   *  the same Attachment shape every other record in the app uses (added
   *  4 October 2026, Sarel: "should be able to add multiple photos for each
   *  entry, also should be able to add a voice note for each entry"). Kept
   *  separate from SiteDay.attachments, which is about the day as a whole —
   *  these belong to the specific thing this line is describing. */
  attachments: Attachment[];
  createdAt: number;
  updatedAt: number;
}

/** One TPJV person marked as having worked on site this day — Sarel: "add a
 *  section to select which people worked on the project on the day from the
 *  TPJV team." Deliberately lighter than Attendance: no signature, no
 *  induction, no arrival/departure time — just attribution, who actually
 *  did the work this diary is an account of. */
export interface DiaryWorker {
  id: string;
  contactId?: string;
  name: string;
  company: string;
}

/** A site day — TK-003 form 2's register, and the daily diary that goes with it.
 *
 *  ONE RECORD PER SITE PER CALENDAR DAY, and the store enforces it. Two records
 *  for one day is two half-attendance-registers, and the failure is silent: each
 *  looks complete, and the one somebody exports is the one that is wrong.
 *
 *  SF-005 has no sheet for this. It was added as J14 of the O.R. Tambo safety
 *  file because the question it answers — who was on site the day that finding
 *  was raised — is the one TPJV is most likely to be asked a year later, and the
 *  hardest to reconstruct.
 *
 *  THE DIARY IS A LOG OF DATED, CATEGORISED LINES, NOT A CHECKLIST. Rebuilt
 *  1 October 2026 from a single free-text field into `diaryEntries`, on
 *  Sarel's own word for what each line needs: a category and a time. TK-003
 *  form 8, the Daily Site Closeout, is still the real checklist — a
 *  different form, whose job is catching a safety finding that was raised
 *  and not reported — and a category tag is not a pass/fail tick: this
 *  still reads as an account of the day, now one a reader can scan by kind
 *  (weather, people, equipment, progress, risks, issues, general) instead
 *  of as one paragraph. */
export interface SiteDay {
  /** `ATT-xxxxx`. The prefix every signature reference on the day is built on. */
  id: string;
  entity: string;
  originVisit: string;

  /** The calendar date, `YYYY-MM-DD`, in the auditor's own timezone.
   *
   *  A string rather than an instant, on purpose: "the site day" is a day on a
   *  calendar at an airport in South Africa, not a point in time, and storing an
   *  instant invites a UTC comparison that puts an 02:00 arrival on the day
   *  before. Deliberately NOT editable once opened — see updateSiteDay in
   *  store.ts — because this record is shared with Attendance and moving the
   *  date would either collide with a real day or re-file somebody's
   *  attendance onto a day they were not there. */
  date: string;

  /** Where the day was spent, and why TPJV was on site — both optional,
   *  header-level rather than repeated on every attendee's row. Added
   *  1 October 2026 alongside the same two fields on InterviewDay. */
  location: string;
  purpose: string;

  openedAt: number;
  openedBy: string;

  /** The day's own working window — when the crew started and finished, as
   *  distinct from any one entry's own time, or from an individual
   *  attendee's arrival/departure. Both optional: null until set. */
  dayStart: number | null;
  dayEnd: number | null;

  diaryEntries: DiaryEntry[];
  /** One attestation for the whole day's diary — "this is an accurate
   *  record of the day" — separate from any individual entry and from the
   *  attendance register's own per-person signatures. Cleared if an entry
   *  is added, changed or removed after signing, same reasoning as every
   *  other signature in this app: see diarySignedFieldsChanged() in
   *  src/lib/diary.ts. */
  diarySignature: Signature | null;
  /** Who from the TPJV team worked on site this day. See DiaryWorker. */
  workedBy: DiaryWorker[];

  entries: AttendanceEntry[];
  attachments: Attachment[];

  /** TK-003 form 8, the Daily Site Closeout — NOT a general end-of-day
   *  checklist. Its one real question is its own, not Annexure 1's: "any
   *  safety findings today (Y/N) — all logged in SF-005 sheet 9 (Y/N)". It
   *  exists to catch a finding raised on the day and not reported, which is
   *  why it is a reconciliation against the ISF register rather than a
   *  housekeeping checklist (locking doors, storing tools) the way a
   *  generic "daily closeout" template would be. Signed by the team lead
   *  and, where the ACSA escort present signs on TPJV's own device, by them
   *  too — the same "second party signs on our tablet" question Form 1
   *  already answers in practice (see SafetyFinding.authorisedSignature),
   *  decided the same way here for consistency.
   *
   *  null means "not yet closed out" for the two Y/N questions, same
   *  reasoning as every other tri-state in this app — a default of false
   *  would read as "no findings today" before anyone actually checked. */
  closeoutFindingsToday: boolean | null;
  closeoutAllLoggedSheet9: boolean | null;
  /** Free text, worth having the moment either Y/N above needs explaining —
   *  a "yes, findings today" with nothing logged yet, or a limitation on
   *  what could actually be checked. */
  closeoutNotes: string;
  closeoutLeadName: string;
  closeoutLeadSignature: Signature | null;
  closeoutAcsaName: string;
  closeoutAcsaSignature: Signature | null;
  closeoutClosedAt: number | null;

  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------- PPE checks */

/** One item's state on one person. `missing` and `compliant` are both a
 *  verdict reached by looking; `notApplicable` is its own state rather than
 *  an absence, because hearing protection genuinely does not apply outside a
 *  declared noise zone and a blank tick there must not read the same as a
 *  missing one. */
export type PpeStatus = "compliant" | "missing" | "notApplicable";

/** The three items Sarel asked this register to check — hi-vis, safety
 *  footwear, and hearing protection where the day's PPE check says a noise
 *  zone was visited (see PpeCheck.noiseZone). A fixed, named set rather than
 *  a free-text list: ACSA's own site rules name these, and a checklist whose
 *  items can be retyped differently each day is not a checklist.
 *
 *  The TYPE lives here, same as everything else this file declares; the
 *  actual PPE_ITEMS array and PPE_ITEM_LABEL text live in src/lib/ppe.ts
 *  instead of here, because this file is a pure leaf — nothing in it imports
 *  from anywhere else in src/lib, which is what lets a test load it (or a
 *  module that imports it) without the path-alias loader every other lib
 *  file needs. A runtime array is a value a test might reasonably import on
 *  its own; it belongs with the rest of ppe.ts's logic, not here. */
export type PpeItemKey = "hiVisJacket" | "safetyShoes" | "hearingProtection";

/** One person's PPE check, on one occasion. */
export interface PpeEntry {
  id: string;
  contactId?: string;
  name: string;
  organisation: string;
  role: string;

  items: Record<PpeItemKey, PpeStatus>;
  notes: string;

  /** Cleared if `name`, `organisation`, `role` or any item changes
   *  afterwards — the same rule as every other signature in this app; see
   *  signedFieldsChanged() in src/lib/ppe.ts. */
  signature: Signature | null;

  createdAt: number;
  updatedAt: number;
}

/** A PPE check, covering however many people were checked at one time and
 *  place — a gate check as a crew arrives, a spot check mid-morning. Unlike
 *  attendance and interviews this is NOT one record per calendar day: the
 *  same day can have a morning gate check and an afternoon spot check in a
 *  different area, and forcing them into one register would make the second
 *  check overwrite the first one's header. */
export interface PpeCheck {
  /** `PPE-xxxxx`. The prefix every entry's signature reference is built on. */
  id: string;
  entity: string;
  originVisit: string;

  date: string;
  location: string;
  purpose: string;
  /** Whether this occasion was in a declared noise zone — decides whether a
   *  blank hearing-protection tick defaults to "not applicable" or to
   *  "missing" when a person is added. Still editable per person afterwards;
   *  this only sets what a new row starts as. */
  noiseZone: boolean;

  openedAt: number;
  openedBy: string;

  people: PpeEntry[];

  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------- toolbox talks */

/** One person who attended — TK-003 form 6 is signed by every attendee, no
 *  exceptions, so this carries the same shape attendance and PPE entries do. */
export interface ToolboxAttendee {
  id: string;
  contactId?: string;
  name: string;
  organisation: string;
  role: string;

  signature: Signature | null;

  createdAt: number;
  updatedAt: number;
}

/** A toolbox talk — TK-003 form 6, completed before each mobilisation, every
 *  attendee signs. Feeds SF-005 sheet 10.
 *
 *  ONE RECORD PER TALK, not per day — a crew can be briefed on fall
 *  protection before one task and on permit-to-work before another the same
 *  morning, and folding both into one record is how the second topic gets
 *  lost inside the first's attendee list. Same reasoning as PPE and site
 *  access: "Start a talk" always opens a new one. */
export interface ToolboxTalk {
  /** `TBX-xxxxx`. The prefix every attendee's signature reference is built on. */
  id: string;
  entity: string;
  originVisit: string;

  date: string;
  /** What was actually discussed — the whole point of the record. */
  topic: string;
  /** Who gave the talk. Free text, same reasoning as every other named-but-
   *  not-necessarily-on-file field in this app (ISF's acsaManagerName,
   *  authorisedBy): not every facilitator is in the directory yet, and this
   *  is a single name, not a list ContactPicker's multi-add pattern fits. */
  facilitator: string;
  location: string;

  openedAt: number;
  openedBy: string;

  attendees: ToolboxAttendee[];

  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------- attendance register */

/** One row in a signed attendance register — a name, who they were there
 *  for, how to reach them, and their mark.
 *
 *  DELIBERATELY NOT AttendanceEntry (see SiteDay below): no induction,
 *  arrival/departure, or location/activity tracking. Sarel, 3 October 2026,
 *  replacing the old daily register with this one — a plain sign-in sheet
 *  for a meeting: "name, signature, phone/email... no induction/entitlement
 *  or arrival-departure tracking." */
export interface AttendanceRow {
  id: string;
  contactId?: string;
  name: string;
  organisation: string;
  role: string;
  /** Contact details for whoever is not yet in the people directory —
   *  captured right here, on the row, the moment they sign in rather than
   *  deferred to the People screen. Blank is not an error; not every
   *  register needs them. */
  phone: string;
  email: string;

  signature: Signature | null;

  createdAt: number;
  updatedAt: number;
}

/** Somebody invited to the meeting this register is for, who said ahead of
 *  time that they would not be there. Never a row in `rows` — a row is a
 *  presence: a name, a mark, proof somebody was in the room. An apology is
 *  the opposite fact about the same list of invitees, and merging the two
 *  is how a reviewer reading the register six months later cannot tell
 *  "signed" from "sent regrets" apart. No signature, because there is
 *  nothing here anybody signed. */
export interface ApologyEntry {
  id: string;
  contactId?: string;
  name: string;
  organisation: string;
  role: string;
  /** Why, in their own words — optional. Half the value of an apology is
   *  just the name; the reason is a bonus, not a requirement. */
  reason: string;

  createdAt: number;
  updatedAt: number;
}

/** An attendance register — a signed sign-in sheet for one meeting, muster
 *  or briefing. ONE RECORD PER REGISTER YOU CREATE, not per day, same
 *  reasoning as ToolboxTalk: a morning muster and an afternoon toolbox
 *  attendance are two different registers, and folding both into one
 *  per-day record is how the second one gets lost inside the first's row
 *  list.
 *
 *  CREATABLE AHEAD OF TIME. `date` and `time` are what the register is FOR
 *  — set at creation, editable afterwards, and never defaulted to "now" by
 *  anything other than the creation screen's own starting point — so a
 *  blank register for next Tuesday's muster can be created today and have
 *  nobody sign it until Tuesday. `openedAt` is the separate, unedited
 *  record of when the device actually created it. */
export interface AttendanceRegister {
  /** `ATR-xxxxx` — distinct from the legacy `ATT-xxxxx` SiteDay id, so the
   *  two are never confusable in an export or a signature reference. */
  id: string;
  entity: string;
  originVisit: string;

  date: string;
  /** `HH:MM`, 24-hour, free text validated by the input itself — when the
   *  meeting is or was. */
  time: string;
  location: string;
  purpose: string;

  openedAt: number;
  openedBy: string;

  rows: AttendanceRow[];
  /** Invited, did not attend, said so ahead of time. See ApologyEntry.
   *  OPTIONAL rather than defaulted to `[]` at the type level, same reason
   *  as every other array added to a persisted record after the fact — see
   *  AdHocItem's own note on `VisitData.adhoc` — so no migration is owed to
   *  a register that already exists on a device. */
  apologies?: ApologyEntry[];

  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------- site access */

/** Which side a visitor to one area was on — the question Sarel's own answer
 *  to "what does this form need" came back to: "who went from ACSA and
 *  TPJV". Free text would let the same organisation drift into five
 *  spellings across a log; a fixed choice keeps "who was from which side" a
 *  question the register can actually be filtered by. */
export type SiteAccessSide = "ACSA" | "TPJV" | "Other";

/** One person who entered the area this log is about. */
export interface SiteAccessVisitor {
  id: string;
  contactId?: string;
  name: string;
  side: SiteAccessSide;
  /** Free text — a subconsultant or a specific department, where naming it
   *  matters more than which side of the table they sit on. */
  organisation: string;

  signature: Signature | null;

  createdAt: number;
  updatedAt: number;
}

/** One area visited, on one occasion — TPJV's own addition to the site-form
 *  set, for exactly what Sarel named: where the team went, why, who escorted
 *  them in, and who from each side was actually there. Not folded into
 *  attendance, which answers "who was on site that day" at the level of the
 *  whole airport; this answers "who was standing in THIS switchroom, and
 *  under whose escort" — the finer-grained question a finding raised in that
 *  specific area is checked against. */
export interface SiteAccessLog {
  /** `ACC-xxxxx`. The prefix every visitor's signature reference is built on. */
  id: string;
  entity: string;
  originVisit: string;

  date: string;
  /** The area or zone itself — "MV switchroom, Pier B", "airside apron,
   *  Stand 14". This is what `location` means on every other form here, but
   *  it is the whole point of this one rather than incidental to it, so it
   *  gets the more specific name. */
  area: string;
  purpose: string;
  escortedBy: string;

  /** When the team went in. Stamped the moment "Log this visit" is tapped,
   *  same as every other form's openedAt, and from then on this doubles as
   *  the editable START TIME Sarel asked for. */
  openedAt: number;
  openedBy: string;
  /** When the team came back out, if recorded — nullable like DiaryEntry.at:
   *  a visit still being walked has no end yet, and a blank is more honest
   *  than a fabricated one. */
  endTime: number | null;

  /** The log's own observation, separate from any one visitor — what the
   *  team saw or noted about the area itself while they were in it. */
  notes: string;

  people: SiteAccessVisitor[];

  createdAt: number;
  updatedAt: number;
}

/* --------------------------------- the document and evidence collection log */

/** How a document reached TPJV's hands.
 *
 *  It matters to custody, not to compliance. A certificate photographed on a
 *  maintenance office desk is evidence TPJV holds a picture of; the paper is
 *  still ACSA's and there is nothing to give back. A file handed over is a file
 *  that has to go back, and the log is what says whether it did. */
export type EvidenceMedium =
  | "paper"
  | "digital"
  | "photographed"
  | "portal"
  | "verbal";

/** Where an item has got to. DERIVED from the timestamps, never stored — see
 *  evidenceStage() in src/lib/evidence.ts, and the same reasoning as every
 *  other stage in this app. */
export type EvidenceStage = "requested" | "received" | "returned" | "unavailable";

/** One document asked for, handed over, or refused — TK-003 form 7.
 *
 *  "Document & Evidence Collection Log", completed as evidence is collected and
 *  signed by the collector. It feeds the findings register and TK-012.
 *
 *  IT LOOKS LIKE AUDIT CAPTURE AND IT IS NOT. That mistake is why this form was
 *  missed off the first, inferred list of what the tablet should replace: it
 *  tracks ACSA's OWN documents, handed over on site, which is a chain-of-custody
 *  record rather than an observation. What the auditor concluded from the
 *  document belongs on the check screen. What this answers is narrower and
 *  nobody else answers it: what did they give us, who gave it to us, is it a
 *  copy or their only original, and have we given it back.
 *
 *  180 of the 324 check-points are `confirmedBy: "Document"` — the number or the
 *  signature on a piece of paper IS the compliance — so this is the register
 *  behind more than half the audit.
 *
 *  REQUESTED IS A STATE, AND IT IS THE USEFUL ONE. A log that records only what
 *  arrived cannot say what is outstanding, and what is outstanding is the entire
 *  reason an RFI exists. It is also the other half of the "compliant, evidence
 *  pending" tag on a response: that tag says somebody owes us a document, and
 *  this is where the owing is tracked and closed. */
export interface EvidenceItem {
  /** `DOC-xxxxx`. The prefix for this item's photographs and its signature. */
  id: string;
  entity: string;
  originVisit: string;

  /** What it is, in enough detail to ask for it again. `documentNo` and
   *  `revision` are separate because a register entry naming the wrong revision
   *  of the right document is the commonest way an evidence trail breaks. */
  title: string;
  documentNo: string;
  revision: string;
  /** The date ON the document, not the date it was handed over. */
  documentDate: number | null;

  /** Asked for. Null where somebody simply produced it unprompted, which
   *  happens and is worth being able to record honestly. */
  requestedAt: number | null;
  requestedFrom: string;

  /** Handed over. `receivedFrom` is the person, not the department: "the
   *  maintenance office gave us the logbook" is not custody. */
  receivedAt: number | null;
  receivedFrom: string;
  /** The TPJV collector, who is the person form 7 is signed by. */
  receivedBy: string;
  medium: EvidenceMedium | null;

  /** ACSA'S ONLY COPY, OR OURS TO KEEP.
   *
   *  The one field that makes this a custody record rather than a list. An
   *  original in TPJV's bag is an obligation with a clock on it, and the
   *  register says which ones are still out. */
  isOriginal: boolean;
  returnedAt: number | null;
  returnedTo: string;

  /** ACSA said it cannot be produced.
   *
   *  A real and reportable outcome rather than an absence: a document that does
   *  not exist is usually the finding, and a log that only records what arrived
   *  loses it. Cleared automatically if the document later turns up — producing
   *  it contradicts the declaration. */
  unavailableAt: number | null;
  unavailableReason: string;

  /** The check-points this document bears on. It bears on them; the auditor
   *  still decides what it proves, on the check screen. */
  checkIds: string[];

  /** Photographs of the document itself, where that is how it was captured. */
  attachments: Attachment[];
  /** The collector's mark. TK-003 form 7 is signed by the collector, who is a
   *  TPJV person on a TPJV device. */
  signature: Signature | null;

  notes: string;
  createdAt: number;
  updatedAt: number;
}

/** A person on the programme — TPJV or ACSA, at one airport or at Corporate.
 *
 *  ENTERED ONCE, NOT RE-TYPED AT EVERY AUDIT. Sarel: a contact is "programme-
 *  wide, flat across visits" — a person's role at KSIA does not change between
 *  the March and September audit, so unlike a finding or an evidence item this
 *  carries no `originVisit` at all. It carries `site` instead: the entity this
 *  person is based at, read the same on every visit opened at that site, or
 *  the head-office entity for somebody at Corporate — there is no separate
 *  "Corporate" flag, because programme.json already has one entity of kind
 *  "head-office" and a second spelling of the same fact is how the two drift.
 *
 *  `site` can also be `SITE_ALL` ("ALL", see src/lib/people.ts) — Sarel:
 *  "allow to select airports all as an option". That is a SCOPE, not a
 *  PLACE, and deliberately not folded into the existing Corporate/head-office
 *  entity: a regional TPJV engineer who covers every site is not based at
 *  head office, and a second meaning for "head-office" is exactly the kind of
 *  drift the Corporate field above already avoided once.
 *
 *  A standalone reference list for now (Sarel, same conversation): it does not
 *  feed the free-text contact fields already on ISF or elsewhere. Wiring the
 *  directory in as an autocomplete source is a deliberately separate step. */
export interface Contact {
  id: string;
  site: string;
  name: string;
  surname: string;
  role: string;
  /** One of ALL_DISCIPLINES, or empty — not every contact is discipline-
   *  specific (an admin or corporate contact has none). */
  discipline: string;
  /** The employer — TPJV, ACSA, a named contractor. Distinct from
   *  `department`, which is an org unit within that employer ("Engineering",
   *  "Operations"); the two answer different questions and a contact can
   *  have one without the other. */
  company: string;
  department: string;
  location: string;
  /** Added 3 October 2026 for the new attendance register, which needs a
   *  way to reach somebody who signed in — blank for every contact on file
   *  before then, and for anyone added since who nobody has asked yet. */
  phone: string;
  email: string;
  createdAt: number;
  updatedAt: number;
}
