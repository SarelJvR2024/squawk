/** Combining two auditors' work into one audit.
 *
 *  Squawk is local-first: the audit lives in this device's IndexedDB and
 *  nowhere else. That is right for an apron with no signal and wrong for a
 *  team, and a team is what does an ACSA audit. Until the shared record exists,
 *  this is how the day's work comes back together — each auditor exports a
 *  bundle, one device imports the others, and the result is one audit.
 *
 *  THE RULES, and why each one is what it is:
 *
 *  1. SAME AUDIT, OR NOTHING. A bundle names its entity and its visit and is
 *     refused against any other. Merging Cape Town's captures into King Shaka's
 *     visit is not a mistake anybody would notice in a workbook until the
 *     report was already with ACSA.
 *
 *  2. NEWER WINS, PER RECORD, NEVER SILENTLY. Where both devices changed the
 *     same check, the later `updatedAt` wins — and the report NAMES it, so a
 *     person can look at what was overwritten rather than discover it in the
 *     deliverable. A merge that quietly drops somebody's afternoon is worse
 *     than one that refuses.
 *
 *  3. EVIDENCE IS UNIONED, NEVER OVERWRITTEN. Attachments and progress logs do
 *     not follow rule 2. A photograph taken on either device is evidence, and
 *     losing one because the other device happened to save later would destroy
 *     it. Two auditors photographing the same defect end up with both
 *     photographs, which is correct and is what an audit wants.
 *
 *  4. PHOTOGRAPHS TRAVEL AS REFERENCES. A bundle carrying image bytes would run
 *     to hundreds of megabytes and could not be emailed or messaged. The
 *     records travel; the images are read from the record store, where the
 *     upload queue has already put them. Anything that has not reached the
 *     store yet arrives as a reference with no image, and the report says how
 *     many — because "some photographs are missing" discovered at report time
 *     is a bad afternoon.
 */

import type {
  ActionStatus,
  AttendanceRegister,
  Attachment,
  EvidenceItem,
  Finding,
  Hazard,
  IncidentReport,
  InterviewDay,
  MitigationAction,
  PossibleEvent,
  PpeCheck,
  ProgressNote,
  Response,
  SafetyFinding,
  SiteAccessLog,
  SiteDay,
  SystemAssessment,
  ToolboxTalk,
  Verification,
} from "./types";
import type { VisitData } from "./store";

/** A hazard or finding raised before 30 September 2026's reshape (see
 *  store.ts's `from < 25` migration) has areas/otherImpacts/actions all
 *  undefined rather than empty. A bundle — a file export, or a row pulled
 *  from the Supabase shared record — is never run through that migration:
 *  it is exactly as old as whichever device or cloud row it came from, EVERY
 *  time it arrives. Backfilling only at hydration leaves this device's own
 *  store correct right up until its next sync, which reintroduces the same
 *  stale shape from the cloud and blanks the HIRA screen again. So the same
 *  backfill runs here too, on everything incoming, not only once at
 *  hydration. */
function legacyAction(r: {
  action?: string;
  owner?: string;
  dueDate?: string;
  actionStatus: ActionStatus;
  createdAt: number;
  createdBy: string;
}): MitigationAction[] {
  return r.action
    ? [
        {
          id: Math.random().toString(36).slice(2, 10).toUpperCase().slice(0, 5),
          action: r.action,
          owner: r.owner ?? "",
          dueDate: r.dueDate ?? "",
          status: r.actionStatus,
          createdAt: r.createdAt,
          createdBy: r.createdBy,
        },
      ]
    : [];
}

export function normalizeHazard(h: Hazard): Hazard {
  const old = h as Hazard & { action?: string; owner?: string; dueDate?: string };
  const { action, owner, dueDate, ...rest } = old;
  return {
    ...rest,
    areas: rest.areas ?? [],
    otherImpacts: rest.otherImpacts ?? [],
    actions: Array.isArray(rest.actions) ? rest.actions : legacyAction(old),
  } as Hazard;
}

export function normalizeFinding(f: Finding): Finding {
  const old = f as Finding & { action?: string; owner?: string; dueDate?: string };
  const { action, owner, dueDate, ...rest } = old;
  return {
    ...rest,
    actions: Array.isArray(rest.actions) ? rest.actions : legacyAction(old),
  } as Finding;
}

export const BUNDLE_KIND = "squawk-capture-bundle";
export const BUNDLE_VERSION = 1;

export interface Bundle {
  meta: {
    kind: typeof BUNDLE_KIND;
    version: number;
    /** The audit this belongs to. Checked on import; see rule 1. */
    entity: string;
    visit: string;
    exportedBy: string;
    exportedAt: number;
    counts: {
      responses: number;
      findings: number;
      hazards: number;
      verifications: number;
    };
    /** Photographs on the exporting device with no copy in the record store.
     *  Stated in the bundle rather than worked out on import, because only the
     *  exporting device knows what it is holding. */
    photographsNotUploaded: number;
  };
  visit: VisitData;
  /** Scoped to this entity and visit on export — a bundle is one audit's work,
   *  not a copy of the whole programme. */
  findings: Finding[];
  hazards: Hazard[];
  /** HIRA aside, every Tier 1 form — flat across the whole programme, same
   *  as findings/hazards above and for the same reason: an ISF raised at an
   *  earlier visit, or an evidence item still outstanding from one, is still
   *  this entity's open business, not something a later visit's merge should
   *  drop. */
  safetyFindings: SafetyFinding[];
  interviewDays: InterviewDay[];
  siteDays: SiteDay[];
  evidenceItems: EvidenceItem[];
  ppeChecks: PpeCheck[];
  siteAccessLogs: SiteAccessLog[];
  toolboxTalks: ToolboxTalk[];
  incidentReports: IncidentReport[];
  attendanceRegisters: AttendanceRegister[];
}

/** What a merge did, in enough detail to be checked by a person. */
export interface MergeReport {
  entity: string;
  visit: string;
  from: string;
  exportedAt: number;
  responses: Counts;
  findings: Counts;
  hazards: Counts;
  verifications: Counts;
  /** One bucket for all nine Tier 1 forms, not nine of its own — see the
   *  same choice on ResetPanel's confirm screen. A person reading a sync
   *  report wants "did my forms come across," not nine counts to add up by
   *  hand to find out. */
  forms: Counts;
  attachmentsAdded: number;
  progressAdded: number;
  /** Records BOTH devices changed. The newer won; these are named so somebody
   *  can look at what the older one said. */
  contested: Contested[];
  /** Photographs that arrived with no image this device can show — they had
   *  not reached the record store when the bundle was made. */
  photographsWithoutImage: number;
  /** Findings that came from the SAME issue button on the SAME check but were
   *  raised on different devices, so they carry different ids and both survive.
   *
   *  REPORTED, NEVER COMBINED. The same issue button is legitimately raised
   *  twice — "no single line diagram displayed" is one finding per switch room,
   *  and the asset tags are how they are told apart. Silently folding those two
   *  together would destroy a real finding at a national key point, which is
   *  worse than the duplicate it was trying to tidy. A person decides; this
   *  only makes sure a person is asked.
   *
   *  Only pairs this merge BROUGHT TOGETHER are listed. One already sitting in
   *  the audit, that somebody has looked at and kept, must not be raised again
   *  every time two devices sync. */
  duplicates: Duplicate[];
}

/** Two or more findings that look like one defect. */
export interface Duplicate {
  checkId: string;
  issueIndex: number;
  /** The finding titles are identical by construction — they came from the same
   *  issue button — so one is enough to say what it is about. */
  title: string;
  /** Every finding in the group, in the order the audit holds them. */
  ids: string[];
  /** What each one says it is about, in the same order as `ids`. This is the
   *  fastest way to tell the two cases apart: different tags mean two real
   *  findings, no tags at all means somebody has to go and look. */
  assets: string[][];
}

export interface Counts {
  added: string[];
  updated: string[];
  kept: string[];
}

export interface Contested {
  kind: "response" | "finding" | "hazard" | "verification";
  id: string;
  mineAt: number;
  theirsAt: number;
  winner: "mine" | "theirs";
}

const when = (r: { updatedAt?: number } | undefined): number => r?.updatedAt ?? 0;
const empty = (): Counts => ({ added: [], updated: [], kept: [] });

/** A tombstone: an attachment id deliberately removed from a record, and
 *  when. See Response.removedAttachmentIds / Verification.removedAttachmentIds. */
type Tombstone = { id: string; at: number };

/** Merge two devices' tombstone logs the same way unionProgress merges
 *  ProgressNote[] — by identity, nothing dropped. Two devices can each
 *  remove a DIFFERENT attachment from the same record independently (one
 *  deletes a blurry photo, the other moves a mis-filed one elsewhere), and
 *  neither record of removal may be lost — if it were, a THIRD device that
 *  later merges from whichever side lost it could resurrect the attachment
 *  that side removed, even though the fix already reached that side once.
 *
 *  The same id tombstoned on both sides (independently removed in parallel,
 *  or carried forward from an earlier merge) keeps the LATER of the two
 *  `at`s: a later-known removal time only ever makes the tombstone MORE
 *  likely to block a stale resurrection, never less, and this bug is one
 *  where erring toward blocking is the safe side to err on. */
function unionTombstones(mine: Tombstone[] = [], theirs: Tombstone[] = []): Tombstone[] {
  const byId = new Map(mine.map((t) => [t.id, t]));
  for (const t of theirs) {
    const existing = byId.get(t.id);
    if (!existing || t.at > existing.at) byId.set(t.id, t);
  }
  return [...byId.values()];
}

/** The tombstone-aware union that actually belongs on Response/Verification
 *  attachments, in place of the plain `unionAttachments` above.
 *
 *  THE BUG: `removeAttachment`/`moveAttachment`/`removeVerificationAttachment`
 *  (store.ts) take an id out of `attachments` and bump the record's
 *  `updatedAt`, but a plain union-by-id has no concept of "this id was
 *  deliberately removed" — it just appends whatever `theirs` still has that
 *  `mine` doesn't carry by id. A `theirs` bundle that is a stale snapshot
 *  from BEFORE the removal/move happened still has the attachment, so the
 *  union puts it straight back. This happens even on the branch where
 *  `mine`'s record wins the "which side is newer" comparison in
 *  `mergeBundle` (device A's removal bumped `updatedAt` to now, so A's
 *  record beats B's older snapshot) — attachments are still unioned
 *  independently of which side's scalar fields won, so the stale copy of
 *  the attachment still gets appended unless this function stops it.
 *
 *  THE RULE, applied to BOTH sides rather than only to what `theirs` would
 *  add: an id is dropped from whichever side carries it when that side's own
 *  `updatedAt` is NOT newer than the id's tombstone `at` (from `tombstones`,
 *  the caller's already-merged union of both sides' removal logs — see
 *  `unionTombstones`). "Not newer than the tombstone" means that side has
 *  not been touched since the removal it is stale with respect to, so its
 *  copy is the stale one and must not survive the merge.
 *
 *  Symmetric on purpose, not only "filter what theirs would add": device A
 *  removes and syncs into stale device B — B's own PRE-EXISTING copy of the
 *  id must also drop out of the merge, not just future resurrections of it,
 *  or B's next export to a device C would carry the attachment right back
 *  out, undoing the removal one hop later than where it was supposed to
 *  stop. That is exactly the "third device" case this bug report calls out
 *  by name, and it is only prevented if a stale side's OWN existing copy is
 *  filtered here too, not just incoming ones.
 *
 *  If a side's own `updatedAt` IS newer than the tombstone's `at`, that side
 *  saw something after the removal — handled conservatively by letting its
 *  copy through, even though attachment ids are minted fresh per
 *  `addAttachment` call, so a genuine re-add under the SAME id after a
 *  removal should not actually happen in practice; this does not assert that
 *  it can't.
 *
 *  SAME ID, BOTH SIDES SURVIVING THE TOMBSTONE CHECK: until this fix, this
 *  function kept `mine`'s copy unconditionally whenever an id existed on
 *  both sides — correct for a brand new photo (nothing to compare against),
 *  wrong for the SAME photo whose caption, asset tag or other field was
 *  edited on only one side. A device whose local copy of a photo was never
 *  touched again after capture would permanently shadow any field-level
 *  edit written through a different path — the shared record's own `/api/
 *  sync`, say — forever, because `theirs`' copy of an id `mine` already held
 *  was simply discarded, no matter which side the record-level "newer wins"
 *  comparison (rule 2, see this file's header) had just favoured for every
 *  OTHER field of the same record. Found 30 October 2026: a caption written
 *  straight to the shared record survived there, then vanished the moment
 *  the capturing device's own next sync merged it back out.
 *
 *  THE FIX: for an id both sides still hold, pick the SIDE's whole
 *  attachment object by the same per-side `updatedAt` comparison rule 2
 *  already applies to every other field of the record — never a field-by-
 *  field splice, which would invent a merge of two different auditors' free
 *  text that neither one actually wrote. A side with nothing newer than the
 *  other keeps its own copy, exactly as before; only a side that genuinely
 *  IS newer now gets to say so for an id it shares with the other.
 *
 *  A RESIDUAL GAP THIS DOES NOT CLOSE: Attachment carries no `updatedAt` of
 *  its own, only the record around it does, so the choice above is by SIDE,
 *  not by comparing the two copies of the photo directly. A side that wins
 *  the record-level comparison for a reason that has nothing to do with
 *  this particular photo — some other field edited later — can still be
 *  carrying a stale, pre-upload copy of an id the OTHER side already
 *  finished uploading, and the whole-object swap would regress that photo
 *  from "uploaded" back to "local only". Closing this needs a per-
 *  attachment timestamp, which is a bigger change than this fix; see
 *  tests/merge.test.mjs's own block pinning today's actual behaviour so it
 *  stays visible rather than being tripped over later. */
function unionAttachmentsWithTombstones(
  mine: Attachment[],
  theirs: Attachment[],
  tombstones: Tombstone[],
  mineUpdatedAt: number,
  theirsUpdatedAt: number
): Attachment[] {
  const tombstonedAt = new Map(tombstones.map((t) => [t.id, t.at]));
  const survives = (a: Attachment, sideUpdatedAt: number) => {
    const removedAt = tombstonedAt.get(a.id);
    return removedAt === undefined || sideUpdatedAt > removedAt;
  };
  const keptMine = mine.filter((a) => survives(a, mineUpdatedAt));
  const keptTheirs = theirs.filter((a) => survives(a, theirsUpdatedAt));
  const theirsById = new Map(keptTheirs.map((a) => [a.id, a]));
  const mineIds = new Set(keptMine.map((a) => a.id));
  const merged = keptMine.map((a) => {
    const t = theirsById.get(a.id);
    if (!t) return a;
    return theirsUpdatedAt > mineUpdatedAt ? t : a;
  });
  const toAdd = keptTheirs.filter((a) => !mineIds.has(a.id));
  return [...merged, ...toAdd];
}

/** Progress notes have no id — they are an append-only log. Two devices can
 *  hold the same note only by having merged before, so identity is the whole
 *  content: when, who, and what was said. */
const noteKey = (n: ProgressNote) => `${n.at}|${n.by}|${n.note}`;

function unionProgress(mine: ProgressNote[] = [], theirs: ProgressNote[] = []): ProgressNote[] {
  const seen = new Set(mine.map(noteKey));
  const merged = [...mine, ...theirs.filter((n) => !seen.has(noteKey(n)))];
  return merged.sort((a, b) => a.at - b.at);
}

/** POSSIBLE EVENTS ARE A LIST TWO PEOPLE ADD TO, so they union rather than
 *  losing to whoever saved last. Two auditors standing at the same transformer
 *  will name different futures for it — that is the point of recording them —
 *  and last-writer-wins on the whole array would silently drop one of their
 *  lists with nothing on screen to say so. They carry an id, so identity is
 *  straightforward; order is by when they were recorded, so the list reads the
 *  way it was thought of. */
function unionEvents(mine: PossibleEvent[] = [], theirs: PossibleEvent[] = []): PossibleEvent[] {
  const seen = new Set(mine.map((e) => e.id));
  return [...mine, ...theirs.filter((e) => !seen.has(e.id))].sort(
    (a, b) => a.createdAt - b.createdAt
  );
}

/** Same union-by-id as unionEvents, for an asset system's own hazardous
 *  events — but an event now carries its own rootCauses/actions, so an id
 *  both devices have cannot just keep one side's copy wholesale the way
 *  unionEvents does: that would silently drop whichever side's causes or
 *  actions were not on the kept copy. Where an id exists on both sides, its
 *  causes/actions union (same reasoning as the system's own, see below) and
 *  the event's own scalar fields (event text, note) take whichever side is
 *  newer — the same "lists union, the cell is newer-wins" rule the asset
 *  system itself follows. */
function mergeSystemEvents(mine: PossibleEvent[] = [], theirs: PossibleEvent[] = []): PossibleEvent[] {
  const theirsById = new Map(theirs.map((e) => [e.id, e]));
  const mineIds = new Set(mine.map((e) => e.id));
  const merged = mine.map((m) => {
    const t = theirsById.get(m.id);
    if (!t) return m;
    /* mAt/tAt passed through as the fallback for a RootCauseNote, which
       carries no updatedAt of its own even though SystemTreatment.tsx does
       let the group edit one's text after it is typed — patchSystemEvent
       always re-stamps the EVENT's own updatedAt on that edit (see
       patchSystemEventRootCause in store.ts), which is exactly this
       fallback, so a cause edited on one side still wins the same way a
       MitigationAction's own updatedAt lets it win directly. See
       unionById's own header for the 30 October 2026 incident this fixes. */
    const mAt = when(m);
    const tAt = when(t);
    const rootCauses = unionById(m.rootCauses ?? [], t.rootCauses ?? [], mAt, tAt);
    const actions = unionById(m.actions ?? [], t.actions ?? [], mAt, tAt);
    const newer = tAt > mAt ? t : m;
    return { ...newer, rootCauses, actions };
  });
  return [...merged, ...theirs.filter((e) => !mineIds.has(e.id))].sort(
    (a, b) => a.createdAt - b.createdAt
  );
}

/** Union by id, theirs appended where this device has never seen it. The
 *  generic form of unionAttachments, for the lists an asset-system assessment
 *  carries: two auditors add root causes and mitigation actions independently
 *  at the same out-brief, and keeping only the later save loses one of them.
 *
 *  AN ID BOTH SIDES HOLD used to keep `mine`'s copy unconditionally — correct
 *  for a genuine duplicate, wrong the moment the item itself can be EDITED
 *  after creation, which a MitigationAction can (`status`, `system`, `owner`,
 *  `dueDate` — it carries its own `updatedAt`). Found 30 October 2026,
 *  immediately after unionAttachmentsWithTombstones' own version of this same
 *  bug (see that function's header): a mitigation action's `status` edited on
 *  one device, through the shared record, was silently overwritten back to
 *  stale by the OTHER device's next merge, with nothing on screen to say so
 *  — the exact field (MitigationAction.system) the SharePoint sync's own
 *  integrity review was founded on, resurfacing one layer up.
 *
 *  THE FIX, same shape as unionAttachmentsWithTombstones: an item whose OWN
 *  `updatedAt` is newer wins outright. An item with no `updatedAt` of its own
 *  (a RootCauseNote, say — it carries none, even though its `cause`/`note`
 *  text CAN be edited after creation, via SystemTreatment.tsx) or a tie
 *  falls back to `mineAt`/`theirsAt`, the ENCLOSING record's own updatedAt
 *  — the same side-level rule that function uses for Attachment, which has
 *  no per-item timestamp either, and the same protection a RootCauseNote
 *  edit gets in practice: patchSystemEventRootCause (store.ts) always
 *  re-stamps the parent EVENT's own updatedAt, which mergeSystemEvents
 *  passes through as exactly this fallback. Callers that do not pass
 *  mineAt/theirsAt keep exactly today's behaviour (mine wins a shared id),
 *  so this is backward compatible everywhere until a call site opts in. */
function unionById<T extends { id: string; updatedAt?: number }>(
  mine: T[],
  theirs: T[],
  mineAt = 0,
  theirsAt = 0
): T[] {
  const seen = new Set(mine.map((x) => x.id));
  const theirsById = new Map(theirs.map((x) => [x.id, x]));
  const merged = mine.map((m) => {
    const t = theirsById.get(m.id);
    if (!t) return m;
    const mItemAt = m.updatedAt ?? 0;
    const tItemAt = t.updatedAt ?? 0;
    if (tItemAt !== mItemAt) return tItemAt > mItemAt ? t : m;
    return theirsAt > mineAt ? t : m;
  });
  return [...merged, ...theirs.filter((x) => !seen.has(x.id))];
}

/** Why a bundle cannot be merged here, or null if it can. */
export function refuse(
  bundle: Bundle | null,
  into: { entity: string; visit: string }
): string | null {
  if (!bundle || typeof bundle !== "object" || !bundle.meta) {
    return "That file is not a Squawk capture bundle.";
  }
  if (bundle.meta.kind !== BUNDLE_KIND) {
    return "That file is not a Squawk capture bundle.";
  }
  if (bundle.meta.version > BUNDLE_VERSION) {
    return `That bundle was made by a newer version of Squawk (format ${bundle.meta.version}). Update this device first.`;
  }
  /* Rule 1, and the reason it is a refusal rather than a warning. */
  if (bundle.meta.entity !== into.entity || bundle.meta.visit !== into.visit) {
    return `That bundle is ${bundle.meta.entity} ${bundle.meta.visit}. This device has ${into.entity} ${into.visit} open. Open that audit first — captures are never merged across audits.`;
  }
  return null;
}

export interface MergeInput {
  entity: string;
  visit: string;
  visitData: VisitData;
  /** The whole programme's findings and hazards; only this audit's are touched. */
  findings: Finding[];
  hazards: Hazard[];
  /** Same deal, for all nine Tier 1 forms. */
  safetyFindings: SafetyFinding[];
  interviewDays: InterviewDay[];
  siteDays: SiteDay[];
  evidenceItems: EvidenceItem[];
  ppeChecks: PpeCheck[];
  siteAccessLogs: SiteAccessLog[];
  toolboxTalks: ToolboxTalk[];
  incidentReports: IncidentReport[];
  attendanceRegisters: AttendanceRegister[];
}

export interface MergeResult {
  visitData: VisitData;
  findings: Finding[];
  hazards: Hazard[];
  safetyFindings: SafetyFinding[];
  interviewDays: InterviewDay[];
  siteDays: SiteDay[];
  evidenceItems: EvidenceItem[];
  ppeChecks: PpeCheck[];
  siteAccessLogs: SiteAccessLog[];
  toolboxTalks: ToolboxTalk[];
  incidentReports: IncidentReport[];
  attendanceRegisters: AttendanceRegister[];
  report: MergeReport;
}

/** Merge a bundle into this device's state. Pure: it returns the next state and
 *  a report, and touches nothing. Refuse() is the caller's gate. */
export function mergeBundle(mine: MergeInput, theirs: Bundle): MergeResult {
  const report: MergeReport = {
    entity: theirs.meta.entity,
    visit: theirs.meta.visit,
    from: theirs.meta.exportedBy,
    exportedAt: theirs.meta.exportedAt,
    responses: empty(),
    findings: empty(),
    hazards: empty(),
    verifications: empty(),
    forms: empty(),
    attachmentsAdded: 0,
    progressAdded: 0,
    contested: [],
    photographsWithoutImage: 0,
    duplicates: [],
  };

  /* ---------------------------------------------------------- responses --- */
  const responses: Record<string, Response> = { ...mine.visitData.responses };
  for (const [checkId, t] of Object.entries(theirs.visit.responses ?? {})) {
    const m = responses[checkId];
    if (!m) {
      responses[checkId] = t;
      report.responses.added.push(checkId);
      report.attachmentsAdded += t.attachments?.length ?? 0;
      continue;
    }
    const removedAttachmentIds = unionTombstones(m.removedAttachmentIds, t.removedAttachmentIds);
    const attachments = unionAttachmentsWithTombstones(
      m.attachments ?? [],
      t.attachments ?? [],
      removedAttachmentIds,
      when(m),
      when(t)
    );
    report.attachmentsAdded += attachments.length - (m.attachments?.length ?? 0);

    /* Absent rather than `[]`, same as every other optional array field in
       this codebase (see Response.location's own note on this) — a record
       with nothing tombstoned reads exactly like one from before this field
       existed, which is also what keeps a plain merge of an untouched
       record byte-for-byte identical to not merging it at all. */
    const tombstones = removedAttachmentIds.length ? removedAttachmentIds : undefined;

    const bothTouched = when(m) > 0 && when(t) > 0;
    if (when(t) > when(m)) {
      responses[checkId] = { ...t, attachments, removedAttachmentIds: tombstones };
      report.responses.updated.push(checkId);
      if (bothTouched) {
        report.contested.push({
          kind: "response",
          id: checkId,
          mineAt: when(m),
          theirsAt: when(t),
          winner: "theirs",
        });
      }
    } else {
      responses[checkId] = { ...m, attachments, removedAttachmentIds: tombstones };
      report.responses.kept.push(checkId);
      if (bothTouched && when(m) > when(t)) {
        report.contested.push({
          kind: "response",
          id: checkId,
          mineAt: when(m),
          theirsAt: when(t),
          winner: "mine",
        });
      }
    }
  }

  /* ----------------------------------------------------- verifications --- */
  const verifications: Record<string, Verification> = { ...mine.visitData.verifications };
  for (const [pf, t] of Object.entries(theirs.visit.verifications ?? {})) {
    const m = verifications[pf];
    if (!m) {
      verifications[pf] = t;
      report.verifications.added.push(pf);
      continue;
    }
    const removedAttachmentIds = unionTombstones(m.removedAttachmentIds, t.removedAttachmentIds);
    const attachments = unionAttachmentsWithTombstones(
      m.attachments ?? [],
      t.attachments ?? [],
      removedAttachmentIds,
      when(m),
      when(t)
    );
    const progress = unionProgress(m.progress, t.progress);
    /* Same append-only-log reasoning as `progress`, for the ACSA discussion
       log — two auditors can each add a note between visits and neither must
       lose to the other on a plain newer-wins merge. */
    const discussionLog = unionProgress(m.discussionLog, t.discussionLog);
    const possibleEvents = unionEvents(m.possibleEvents, t.possibleEvents);
    report.attachmentsAdded += attachments.length - (m.attachments?.length ?? 0);
    report.progressAdded += progress.length - (m.progress?.length ?? 0);
    const newer = when(t) > when(m) ? t : m;
    verifications[pf] = {
      ...newer,
      attachments,
      /* Absent rather than `[]` — see the same note on the Response loop
         above. */
      removedAttachmentIds: removedAttachmentIds.length ? removedAttachmentIds : undefined,
      progress,
      discussionLog,
      possibleEvents,
    };
    if (when(t) > when(m)) report.verifications.updated.push(pf);
    else report.verifications.kept.push(pf);
    if (when(m) > 0 && when(t) > 0 && when(m) !== when(t)) {
      report.contested.push({
        kind: "verification",
        id: pf,
        mineAt: when(m),
        theirsAt: when(t),
        winner: when(t) > when(m) ? "theirs" : "mine",
      });
    }
  }

  /* ------------------------------------------ asset-system assessments --- */
  /* THE RATING IS LAST-WRITER-WINS; THE LISTS UNDER IT ARE NOT.
     A band is one decision the group made, so the later of two devices' copies
     is the one to keep — the same rule every other rated record here follows.
     Root causes and mitigation actions now live on each hazardous event
     rather than the system itself (see PossibleEvent's own header), so they
     union per-event — mergeSystemEvents does that, the same "lists union, a
     later edit to an event's own fields wins" rule this comment already
     describes. Anything still waiting in unassignedRootCauses/
     unassignedActions (a migration leftover, never written to by new
     capture — see SystemAssessment's own header) unions by id too: a person
     on one device filing an old entry onto a hazard must not make it
     reappear because the other device never saw that happen. */
  const assessedSystems: Record<string, SystemAssessment> = { ...(mine.visitData.systems ?? {}) };
  for (const [key, t] of Object.entries(theirs.visit.systems ?? {})) {
    const m = assessedSystems[key];
    if (!m) {
      assessedSystems[key] = t;
      continue;
    }
    const events = mergeSystemEvents(m.events ?? [], t.events ?? []);
    /* A cause/action one device already filed onto a hazard must not come
       back from the other device's stale copy of the unassigned pile just
       because that device has not synced the filing yet — so anything now
       sitting on some event is excluded from the union, not merely unioned
       alongside it. */
    const assignedCauseIds = new Set(events.flatMap((e) => (e.rootCauses ?? []).map((r) => r.id)));
    const assignedActionIds = new Set(events.flatMap((e) => (e.actions ?? []).map((a) => a.id)));
    const mAt = when(m);
    const tAt = when(t);
    const unassignedRootCauses = unionById(
      m.unassignedRootCauses ?? [],
      t.unassignedRootCauses ?? [],
      mAt,
      tAt
    ).filter((r) => !assignedCauseIds.has(r.id));
    const unassignedActions = unionById(
      m.unassignedActions ?? [],
      t.unassignedActions ?? [],
      mAt,
      tAt
    ).filter((a) => !assignedActionIds.has(a.id));
    const newer = tAt > mAt ? t : m;
    assessedSystems[key] = { ...newer, events, unassignedRootCauses, unassignedActions };
  }

  /* --------------------------------------------------- captures, notes --- */
  const captureIds = new Set((mine.visitData.captures ?? []).map((c) => c.id));
  const captures = [
    ...(mine.visitData.captures ?? []),
    ...(theirs.visit.captures ?? []).filter((c) => !captureIds.has(c.id)),
  ];

  /* Things seen on the walk. Union by id, newer wins — the same rule findings
     get, without a report bucket of its own: an ad-hoc item has no progress log
     to reconcile and no issue button to be a duplicate of, so there is nothing
     for a person to arbitrate. Losing one silently is the only failure worth
     guarding, and unioning by id is what prevents it. */
  const adhocById = new Map((mine.visitData.adhoc ?? []).map((a) => [a.id, a]));
  for (const t of theirs.visit.adhoc ?? []) {
    const m = adhocById.get(t.id);
    if (!m || (t.updatedAt ?? 0) > (m.updatedAt ?? 0)) adhocById.set(t.id, t);
  }
  const adhoc = [...adhocById.values()];

  const feedback = { ...(mine.visitData.feedback ?? {}) };
  for (const [checkId, notes] of Object.entries(theirs.visit.feedback ?? {})) {
    const seen = new Set((feedback[checkId] ?? []).map((n) => n.id));
    feedback[checkId] = [
      ...(feedback[checkId] ?? []),
      ...notes.filter((n) => !seen.has(n.id)),
    ];
  }

  /* ------------------------------------------------ findings, hazards --- */
  const findings = mergeRecords(
    mine.findings,
    theirs.findings.map(normalizeFinding),
    report.findings,
    "finding",
    report
  );
  const hazards = mergeRecords(
    mine.hazards,
    theirs.hazards.map(normalizeHazard),
    report.hazards,
    "hazard",
    report
  );

  /* -------------------------------------------- the nine Tier 1 forms --- */
  const safetyFindings = mergeForm(
    mine.safetyFindings,
    theirs.safetyFindings ?? [],
    ["attachments", "actions"],
    report
  );
  const interviewDays = mergeForm(
    mine.interviewDays,
    theirs.interviewDays ?? [],
    ["entries", "apologies"],
    report
  );
  const siteDays = mergeForm(
    mine.siteDays,
    theirs.siteDays ?? [],
    ["diaryEntries", "workedBy", "entries", "attachments"],
    report
  );
  const evidenceItems = mergeForm(mine.evidenceItems, theirs.evidenceItems ?? [], ["attachments"], report);
  const ppeChecks = mergeForm(mine.ppeChecks, theirs.ppeChecks ?? [], ["people"], report);
  const siteAccessLogs = mergeForm(mine.siteAccessLogs, theirs.siteAccessLogs ?? [], ["people"], report);
  const toolboxTalks = mergeForm(mine.toolboxTalks, theirs.toolboxTalks ?? [], ["attendees"], report);
  const incidentReports = mergeForm(
    mine.incidentReports,
    theirs.incidentReports ?? [],
    ["actions", "attachments"],
    report
  );
  const attendanceRegisters = mergeForm(
    mine.attendanceRegisters,
    theirs.attendanceRegisters ?? [],
    ["rows", "apologies"],
    report
  );

  /* Only the pairs THIS merge brought together. A duplicate already sitting in
     the audit — one somebody has looked at and decided to keep, because it is
     two switch rooms and not one — must not be raised again every time two
     devices sync. A system that repeats a question you have answered is one
     you stop reading. */
  const arriving = new Set(report.findings.added);
  report.duplicates = duplicateFindings(findings).filter((d) => d.ids.some((id) => arriving.has(id)));

  /* Photographs whose bytes are on neither this device nor the record store.
     Counted from what actually arrived, not from the exporter's claim. */
  const arrived = [
    ...report.responses.added.flatMap((id) => responses[id]?.attachments ?? []),
    ...Object.values(theirs.visit.responses ?? {}).flatMap((r) => r.attachments ?? []),
  ];
  const mineIds = new Set(
    Object.values(mine.visitData.responses ?? {}).flatMap((r) =>
      (r.attachments ?? []).map((a) => a.id)
    )
  );
  const counted = new Set<string>();
  for (const a of arrived) {
    if (mineIds.has(a.id) || counted.has(a.id)) continue;
    counted.add(a.id);
    if (!a.cloudUrl) report.photographsWithoutImage++;
  }

  return {
    visitData: { responses, verifications, captures, feedback, adhoc, systems: assessedSystems },
    findings,
    hazards,
    safetyFindings,
    interviewDays,
    siteDays,
    evidenceItems,
    ppeChecks,
    siteAccessLogs,
    toolboxTalks,
    incidentReports,
    attendanceRegisters,
    report,
  };
}

/** Findings and hazards merge the same way: by id, newer wins on the record,
 *  and the progress log is unioned rather than replaced. */
function mergeRecords<T extends { id: string; updatedAt?: number; progress?: ProgressNote[] }>(
  mine: T[],
  theirs: T[],
  counts: Counts,
  kind: "finding" | "hazard",
  report: MergeReport
): T[] {
  const byId = new Map(mine.map((r) => [r.id, r]));
  for (const t of theirs) {
    const m = byId.get(t.id);
    if (!m) {
      byId.set(t.id, t);
      counts.added.push(t.id);
      report.progressAdded += t.progress?.length ?? 0;
      continue;
    }
    const progress = unionProgress(m.progress, t.progress);
    report.progressAdded += progress.length - (m.progress?.length ?? 0);
    const newer = when(t) > when(m) ? t : m;
    byId.set(t.id, { ...newer, progress } as T);
    if (when(t) > when(m)) counts.updated.push(t.id);
    else counts.kept.push(t.id);
    if (when(m) > 0 && when(t) > 0 && when(m) !== when(t)) {
      report.contested.push({
        kind,
        id: t.id,
        mineAt: when(m),
        theirsAt: when(t),
        winner: when(t) > when(m) ? "theirs" : "mine",
      });
    }
  }
  /* Order: this device's records keep their positions, theirs are appended. */
  const order = [...mine.map((r) => r.id), ...theirs.map((r) => r.id).filter((id) => !mine.some((r) => r.id === id))];
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

/** The same rule as mergeRecords, generalised to the nine Tier 1 forms: newer
 *  wins on the record as a whole, but every id-bearing sub-list it carries —
 *  an ISF's actions, an interview day's entries, a PPE check's people, a site
 *  day's diary lines and workedBy and attendance entries, whatever the form
 *  happens to have — unions rather than follows the newer side. Two auditors
 *  adding different people to the same open interview day is exactly the
 *  "two people add to it independently" case a progress log already is for
 *  findings; a form's own entries are no different, just named differently
 *  per form. No report bucket of its own, same as adhoc — there is no
 *  progress log to reconcile and nothing for a person to arbitrate beyond
 *  "newer wins," so added/updated/kept is enough.
 *
 *  AN ID BOTH SIDES HOLD used to keep ONLY mine's copy of that entry — fine
 *  for an append-only list (a PPE check's people, say) and wrong the moment
 *  an entry can be edited after it exists, which an EvidenceItem/SafetyFinding/
 *  SiteDay/IncidentReport's `attachments` (a caption) and a SafetyFinding/
 *  IncidentReport's `actions` (a MitigationAction) both can. unionById now
 *  takes the ENCLOSING record's own mine/theirs updatedAt — already computed
 *  just below as `newer` — as the fallback for an item with no timestamp of
 *  its own; see that function's header for the 30 October 2026 incident this
 *  generalises from Response/Verification photos to every Tier 1 form. */
function mergeFlatRecords<T extends { id: string; updatedAt?: number }>(
  mine: T[] = [],
  theirs: T[] = [],
  listFields: (keyof T)[] = [],
  counts: Counts
): T[] {
  const byId = new Map(mine.map((r) => [r.id, r]));
  for (const t of theirs) {
    const m = byId.get(t.id);
    if (!m) {
      byId.set(t.id, t);
      counts.added.push(t.id);
      continue;
    }
    const mAt = when(m);
    const tAt = when(t);
    const newer = tAt > mAt ? t : m;
    const merged = { ...newer } as T;
    for (const field of listFields) {
      const mv = (m[field] as unknown as { id: string; updatedAt?: number }[] | undefined) ?? [];
      const tv = (t[field] as unknown as { id: string; updatedAt?: number }[] | undefined) ?? [];
      (merged as Record<string, unknown>)[field as string] = unionById(mv, tv, mAt, tAt);
    }
    byId.set(t.id, merged);
    if (tAt > mAt) counts.updated.push(t.id);
    else counts.kept.push(t.id);
  }
  const order = [...mine.map((r) => r.id), ...theirs.map((r) => r.id).filter((id) => !mine.some((r) => r.id === id))];
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

/** One form type's merge call, folded into the aggregate `forms` bucket
 *  rather than reported on its own — see the note on MergeReport.forms. */
function mergeForm<T extends { id: string; updatedAt?: number }>(
  mine: T[],
  theirs: T[],
  listFields: (keyof T)[],
  report: MergeReport
): T[] {
  const counts = empty();
  const merged = mergeFlatRecords(mine, theirs, listFields, counts);
  report.forms.added.push(...counts.added);
  report.forms.updated.push(...counts.updated);
  report.forms.kept.push(...counts.kept);
  return merged;
}

/** Findings that look like ONE defect raised twice.
 *
 *  The rule is the pair that identifies an issue button: the check it is on and
 *  which button it was. Two devices tapping the same button mint two random
 *  ids, so the merge — which keys on id — keeps both, and the audit counts one
 *  defect twice: twice in the register, rated twice, twice in what reaches
 *  ACSA.
 *
 *  This NEVER combines them, and that is deliberate rather than cautious. The
 *  same button is legitimately raised twice: "no single line diagram displayed"
 *  is one finding per switch room. Folding those together would destroy a real
 *  finding, which is a worse failure than the duplicate. So the rule is only
 *  ever used to ASK.
 *
 *  Ad-hoc findings (issueIndex null) are never grouped — they were typed by a
 *  person, and two people describing the same defect in their own words is not
 *  something a key can detect.
 */
export function duplicateFindings(findings: Finding[]): Duplicate[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!f.checkId || f.issueIndex === null || f.issueIndex === undefined) continue;
    const key = `${f.checkId}|${f.issueIndex}`;
    const g = groups.get(key);
    if (g) g.push(f);
    else groups.set(key, [f]);
  }
  const out: Duplicate[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    out.push({
      checkId: g[0].checkId as string,
      issueIndex: g[0].issueIndex as number,
      title: g[0].title,
      ids: g.map((f) => f.id),
      assets: g.map((f) => f.assetIds ?? []),
    });
  }
  return out;
}

/** One line an auditor can read without unfolding anything. */
export function summarise(r: MergeReport): string {
  const n = (c: Counts) => c.added.length + c.updated.length;
  const bits = [
    `${n(r.responses)} check${n(r.responses) === 1 ? "" : "s"}`,
    `${n(r.findings)} finding${n(r.findings) === 1 ? "" : "s"}`,
    `${n(r.hazards)} hazard${n(r.hazards) === 1 ? "" : "s"}`,
    `${n(r.forms)} form entr${n(r.forms) === 1 ? "y" : "ies"}`,
  ];
  const tail = r.contested.length
    ? ` · ${r.contested.length} both devices had changed`
    : "";
  /* Said in the one line, not folded away in a panel: a defect counted twice
     reaches ACSA as two, and the line is the only part everybody reads. */
  const dup = r.duplicates.length
    ? ` · ${r.duplicates.length} possible duplicate${r.duplicates.length === 1 ? "" : "s"} to look at`
    : "";
  return `Merged from ${r.from}: ${bits.join(", ")}${tail}${dup}`;
}
