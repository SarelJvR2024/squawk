"use client";

/** Getting every photograph off the tablet and into the record store.
 *
 *  The hard part is not the upload, it is that an auditor is offline for most
 *  of an audit. An apron, a substation basement, a fuel farm — none of them
 *  have a usable signal, and the app is built to work without one. So this is a
 *  queue, not a request:
 *
 *    - a photograph is queued the moment it is captured, and uploaded when
 *      there is a network;
 *    - the queue is DERIVED from the records rather than held separately, so it
 *      survives a reload, a crashed tab and a flat battery. Anything with a
 *      blobKey and no cloudUrl is outstanding, by definition, forever, until it
 *      is uploaded;
 *    - a failure is recorded on the photograph and shown, not swallowed;
 *    - and the local copy is never touched. The device keeps its own. An
 *      auditor checking a photograph they took an hour ago must not need a
 *      network to do it.
 *
 *  Uploads run one at a time. A tablet on airport wifi pushing eight images in
 *  parallel is how you get eight timeouts instead of one success. */

import { useCallback, useEffect, useRef, useState } from "react";
import { getBlob } from "./media";
import { photoObjectPath } from "./photos";
import { useStore } from "./store";
import type { VisitData } from "./store";
import type {
  Attachment,
  EvidenceItem,
  IncidentReport,
  SafetyFinding,
  SiteDay,
} from "./types";

export interface Outstanding {
  /** Whichever id names the record the photograph hangs off — a check-point,
   *  a WALK- item, an ISF, a site day, a diary entry, an evidence item or an
   *  incident. Only ever shown as a count on screen, not read apart. */
  checkId: string;
  a: Attachment;
  /** Writes `cloudUrl`/`cloudError` back onto this exact attachment, in
   *  whichever record it actually lives on. Bound at collection time so the
   *  upload loop never needs to know, or re-derive, which of the app's seven
   *  attachment-carrying record types this one came from. */
  write: (patch: Partial<Attachment>) => void;
}

function wantsUpload(a: Attachment): boolean {
  return a.kind === "photo" && !!a.blobKey && !a.unavailable && !a.cloudUrl;
}

/** EVERY ATTACHMENT-CARRYING RECORD, found the hard way — 14 October 2026,
 *  after two devices on the same audit showed different asset-system
 *  ratings (a separate, now-fixed gap in src/lib/shared.ts) prompted a check
 *  of what else only ever reached one device. This loop used to cover
 *  Response (check-points) and AdHocItem (the walk) alone — added 13 October
 *  2026 for the walk specifically, with the exact same comment this one now
 *  carries: "the record and its 240px thumbnail reached the shared record;
 *  the image did not." Four more record types carry their own photographs
 *  and were never in this loop at all: SafetyFinding (ISF), SiteDay (and its
 *  own diary entries), EvidenceItem and IncidentReport.
 *
 *  `Verification` ALSO declared `attachments: Attachment[]` from the start,
 *  and until 18 October 2026 nothing in the app ever wrote one — grepped,
 *  confirmed, left out rather than built for nothing. The Follow-up screen
 *  now does (Sarel: "upload 'verification' photo's or information for
 *  closure… doesn't make sense to keep them under 'inspection'"), so it is
 *  the eighth record in this loop, same pattern as the seven before it. */
interface AttachmentActions {
  updateAttachment: (checkId: string, attachmentId: string, p: Partial<Attachment>) => void;
  updateAdhocAttachment: (id: string, attachmentId: string, p: Partial<Attachment>) => void;
  updateIsfAttachment: (id: string, attachmentId: string, p: Partial<Attachment>) => void;
  updateDayAttachment: (id: string, attachmentId: string, p: Partial<Attachment>) => void;
  updateDiaryEntryAttachment: (
    id: string,
    entryId: string,
    attachmentId: string,
    p: Partial<Attachment>
  ) => void;
  updateEvidenceAttachment: (id: string, attachmentId: string, p: Partial<Attachment>) => void;
  updateIncidentAttachment: (id: string, attachmentId: string, p: Partial<Attachment>) => void;
  updateVerificationAttachment: (pf: string, attachmentId: string, p: Partial<Attachment>) => void;
}

function collectOutstanding(
  entityCode: string,
  d: VisitData | undefined,
  safetyFindings: SafetyFinding[],
  siteDays: SiteDay[],
  evidenceItems: EvidenceItem[],
  incidentReports: IncidentReport[],
  actions: AttachmentActions
): Outstanding[] {
  const out: Outstanding[] = [];
  const mine = (x: { entity: string }) => x.entity === entityCode;

  for (const [checkId, r] of Object.entries(d?.responses ?? {})) {
    for (const a of r.attachments) {
      if (wantsUpload(a)) out.push({ checkId, a, write: (p) => actions.updateAttachment(checkId, a.id, p) });
    }
  }
  for (const item of d?.adhoc ?? []) {
    for (const a of item.attachments) {
      if (wantsUpload(a)) out.push({ checkId: item.id, a, write: (p) => actions.updateAdhocAttachment(item.id, a.id, p) });
    }
  }
  for (const [pf, v] of Object.entries(d?.verifications ?? {})) {
    for (const a of v.attachments ?? []) {
      if (wantsUpload(a)) out.push({ checkId: pf, a, write: (p) => actions.updateVerificationAttachment(pf, a.id, p) });
    }
  }
  for (const x of safetyFindings.filter(mine)) {
    for (const a of x.attachments) {
      if (wantsUpload(a)) out.push({ checkId: x.id, a, write: (p) => actions.updateIsfAttachment(x.id, a.id, p) });
    }
  }
  for (const x of evidenceItems.filter(mine)) {
    for (const a of x.attachments) {
      if (wantsUpload(a)) out.push({ checkId: x.id, a, write: (p) => actions.updateEvidenceAttachment(x.id, a.id, p) });
    }
  }
  for (const x of incidentReports.filter(mine)) {
    for (const a of x.attachments) {
      if (wantsUpload(a)) out.push({ checkId: x.id, a, write: (p) => actions.updateIncidentAttachment(x.id, a.id, p) });
    }
  }
  for (const x of siteDays.filter(mine)) {
    for (const a of x.attachments) {
      if (wantsUpload(a)) out.push({ checkId: x.id, a, write: (p) => actions.updateDayAttachment(x.id, a.id, p) });
    }
    for (const entry of x.diaryEntries) {
      for (const a of entry.attachments) {
        if (wantsUpload(a)) {
          out.push({
            checkId: entry.id,
            a,
            write: (p) => actions.updateDiaryEntryAttachment(x.id, entry.id, a.id, p),
          });
        }
      }
    }
  }
  return out;
}

/** True where the deployment has a record store configured. */
let available: boolean | null = null;
let probe: Promise<boolean> | null = null;

export function useRecordStore(): boolean {
  const [on, setOn] = useState(available ?? false);
  useEffect(() => {
    if (available !== null) return;
    probe ??= fetch("/api/photos")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => (available = !!j.available))
      .catch(() => (available = false));
    probe.then(setOn);
  }, []);
  return on;
}

export async function uploadOne(
  entityCode: string,
  visitId: string,
  a: Attachment
): Promise<{ url: string }> {
  const blob = await getBlob(a.blobKey!);
  if (!blob) throw new Error("The image is no longer stored on this device.");
  const form = new FormData();
  form.append("file", blob, `${a.ref ?? a.id}.jpg`);
  form.append("pathname", photoObjectPath(entityCode, visitId, a));
  const r = await fetch("/api/photos", { method: "POST", body: form });
  const j = (await r.json()) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error ?? "The upload failed.");
  return { url: j.url };
}

export interface SyncState {
  /** Photographs on this device with no record copy yet. */
  outstanding: number;
  /** Photographs whose last attempt failed. */
  failed: number;
  uploading: boolean;
  /** Somebody pressing "upload now" rather than waiting for the queue. */
  run: () => void;
  online: boolean;
}

/** Drives the queue for the audit in view. Mounted once, in the shell. */
export function usePhotoSync(): SyncState {
  const on = useRecordStore();
  const entity = useStore((s) => s.entity);
  const visit = useStore((s) => s.visit);
  const byVisit = useStore((s) => s.byVisit);
  const safetyFindings = useStore((s) => s.safetyFindings);
  const siteDays = useStore((s) => s.siteDays);
  const evidenceItems = useStore((s) => s.evidenceItems);
  const incidentReports = useStore((s) => s.incidentReports);
  const updateAttachment = useStore((s) => s.updateAttachment);
  const updateAdhocAttachment = useStore((s) => s.updateAdhocAttachment);
  const updateIsfAttachment = useStore((s) => s.updateIsfAttachment);
  const updateDayAttachment = useStore((s) => s.updateDayAttachment);
  const updateDiaryEntryAttachment = useStore((s) => s.updateDiaryEntryAttachment);
  const updateEvidenceAttachment = useStore((s) => s.updateEvidenceAttachment);
  const updateIncidentAttachment = useStore((s) => s.updateIncidentAttachment);
  const updateVerificationAttachment = useStore((s) => s.updateVerificationAttachment);

  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(true);
  /* A ref, not state: the loop reads it to decide whether to keep going, and a
     re-render in the middle of an upload must not start a second loop. */
  const running = useRef(false);

  useEffect(() => {
    const set = () => setOnline(navigator.onLine);
    set();
    addEventListener("online", set);
    addEventListener("offline", set);
    return () => {
      removeEventListener("online", set);
      removeEventListener("offline", set);
    };
  }, []);

  const actions: AttachmentActions = {
    updateAttachment,
    updateAdhocAttachment,
    updateIsfAttachment,
    updateDayAttachment,
    updateDiaryEntryAttachment,
    updateEvidenceAttachment,
    updateIncidentAttachment,
    updateVerificationAttachment,
  };
  const outstanding = collectOutstanding(
    entity,
    byVisit[`${entity}/${visit}`],
    safetyFindings,
    siteDays,
    evidenceItems,
    incidentReports,
    actions
  );
  const failed = outstanding.filter(({ a }) => a.cloudError).length;

  const run = useCallback(async () => {
    if (!on || running.current || !navigator.onLine) return;
    running.current = true;
    setUploading(true);
    try {
      const s = useStore.getState();
      const todo = collectOutstanding(
        s.entity,
        s.byVisit[`${s.entity}/${s.visit}`],
        s.safetyFindings,
        s.siteDays,
        s.evidenceItems,
        s.incidentReports,
        s
      );
      /* One at a time. Eight parallel uploads on airport wifi is eight
         timeouts. */
      for (const { a, write } of todo) {
        if (!navigator.onLine) break;
        try {
          const { url } = await uploadOne(s.entity, s.visit, a);
          write({ cloudUrl: url, cloudAt: Date.now(), cloudError: undefined });
        } catch (e) {
          write({ cloudError: e instanceof Error ? e.message : "The upload failed." });
        }
      }
    } finally {
      running.current = false;
      setUploading(false);
    }
  }, [on]);

  /* Drain when there is something to send and a network to send it on. The
     dependency is the COUNT, so capturing a photograph starts the queue and a
     caption edit does not. */
  const count = outstanding.length;
  useEffect(() => {
    if (!on || !online || count === 0) return;
    const t = setTimeout(() => void run(), 1200);
    return () => clearTimeout(t);
  }, [on, online, count, run]);

  return { outstanding: count, failed, uploading, run, online };
}
