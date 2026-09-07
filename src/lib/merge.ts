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

import type { Attachment, Finding, Hazard, ProgressNote, Response, Verification } from "./types";
import type { VisitData } from "./store";

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
  attachmentsAdded: number;
  progressAdded: number;
  /** Records BOTH devices changed. The newer won; these are named so somebody
   *  can look at what the older one said. */
  contested: Contested[];
  /** Photographs that arrived with no image this device can show — they had
   *  not reached the record store when the bundle was made. */
  photographsWithoutImage: number;
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

/** Union by id, theirs appended where this device has never seen it.
 *  Order is preserved so a strip of photographs does not reshuffle on merge. */
function unionAttachments(mine: Attachment[], theirs: Attachment[]): Attachment[] {
  const seen = new Set(mine.map((a) => a.id));
  return [...mine, ...theirs.filter((a) => !seen.has(a.id))];
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
}

export interface MergeResult {
  visitData: VisitData;
  findings: Finding[];
  hazards: Hazard[];
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
    attachmentsAdded: 0,
    progressAdded: 0,
    contested: [],
    photographsWithoutImage: 0,
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
    const attachments = unionAttachments(m.attachments ?? [], t.attachments ?? []);
    report.attachmentsAdded += attachments.length - (m.attachments?.length ?? 0);

    const bothTouched = when(m) > 0 && when(t) > 0;
    if (when(t) > when(m)) {
      responses[checkId] = { ...t, attachments };
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
      responses[checkId] = { ...m, attachments };
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
    const attachments = unionAttachments(m.attachments ?? [], t.attachments ?? []);
    const progress = unionProgress(m.progress, t.progress);
    report.attachmentsAdded += attachments.length - (m.attachments?.length ?? 0);
    report.progressAdded += progress.length - (m.progress?.length ?? 0);
    const newer = when(t) > when(m) ? t : m;
    verifications[pf] = { ...newer, attachments, progress };
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

  /* --------------------------------------------------- captures, notes --- */
  const captureIds = new Set((mine.visitData.captures ?? []).map((c) => c.id));
  const captures = [
    ...(mine.visitData.captures ?? []),
    ...(theirs.visit.captures ?? []).filter((c) => !captureIds.has(c.id)),
  ];

  const feedback = { ...(mine.visitData.feedback ?? {}) };
  for (const [checkId, notes] of Object.entries(theirs.visit.feedback ?? {})) {
    const seen = new Set((feedback[checkId] ?? []).map((n) => n.id));
    feedback[checkId] = [
      ...(feedback[checkId] ?? []),
      ...notes.filter((n) => !seen.has(n.id)),
    ];
  }

  /* ------------------------------------------------ findings, hazards --- */
  const findings = mergeRecords(mine.findings, theirs.findings, report.findings, "finding", report);
  const hazards = mergeRecords(mine.hazards, theirs.hazards, report.hazards, "hazard", report);

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
    visitData: { responses, verifications, captures, feedback },
    findings,
    hazards,
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

/** One line an auditor can read without unfolding anything. */
export function summarise(r: MergeReport): string {
  const n = (c: Counts) => c.added.length + c.updated.length;
  const bits = [
    `${n(r.responses)} check${n(r.responses) === 1 ? "" : "s"}`,
    `${n(r.findings)} finding${n(r.findings) === 1 ? "" : "s"}`,
    `${n(r.hazards)} hazard${n(r.hazards) === 1 ? "" : "s"}`,
  ];
  const tail = r.contested.length
    ? ` · ${r.contested.length} both devices had changed`
    : "";
  return `Merged from ${r.from}: ${bits.join(", ")}${tail}`;
}
