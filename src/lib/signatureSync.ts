"use client";

/** Getting every ATTENDANCE-REGISTER AND EVIDENCE-LOG SIGNATURE off the
 *  tablet and into the record store — the same gap sync.ts closes for
 *  check-point and walk photographs, left open for signatures.
 *
 *  SignaturePad.tsx's own header says a signature is held to the same four
 *  rules as a photograph, backed up included: "a signature that exists only
 *  on one tablet is a signature that goes with the tablet, and the person
 *  who would have to sign again is at another airport by then." Nothing
 *  ever actually did the backing up — `Signature.cloudUrl` existed on the
 *  type and every register's own `unbackedSignatures`-style helper could
 *  already say a signature was outstanding, but nothing queued the upload
 *  that would clear it. The SharePoint sync needs exactly this: it uploads a
 *  signature's actual bytes from whichever device is doing the sync, and a
 *  confirmed case already happened — Sarel's RESA data-loss incident — of
 *  that device not being the one that captured the data.
 *
 *  Scoped to the two signature kinds the SharePoint sync actually uploads
 *  (attendance rows, evidence-log entries), not every signature in the app.
 *  Diary, closeout, ISF, PPE, toolbox, interviews and incident signatures
 *  keep exactly the behaviour they had — their own unbacked-signature
 *  warnings still flag the same gap, which stays open for them.
 *
 *  Same design as sync.ts, deliberately:
 *    - a signature is queued the moment it is captured, uploaded when there
 *      is a network;
 *    - the queue is DERIVED from the records, not held separately, so it
 *      survives a reload, a crashed tab and a flat battery;
 *    - a failure is recorded on the signature and shown, not swallowed;
 *    - the local copy is never touched;
 *    - uploads run one at a time.
 *
 *  Reuses /api/photos rather than a new route: that store is a generic
 *  private blob-by-pathname store gated on the team passphrase, not a
 *  photograph-specific one — it already allows `image/png`, which is what
 *  SignaturePad.tsx writes. */

import { useCallback, useEffect, useRef, useState } from "react";
import { getBlob } from "./media";
import { fetchRecordPhoto } from "./recordimage";
import { signatureFilename, signatureObjectPath } from "./signatures";
import { useRecordStore } from "./sync";
import { useStore } from "./store";
import type { Signature } from "./types";

export type SignatureOwner = "attendance" | "evidenceLog";

export interface OutstandingSignature {
  /** The attendance register id, or the evidence-log item id. */
  ownerId: string;
  /** The attendance row id. Absent for an evidence-log signature — one item,
   *  one signature, nothing to pick out. */
  rowId?: string;
  s: Signature;
  owner: SignatureOwner;
  entity: string;
  visit: string;
}

/** THE FULL BYTES, wherever they happen to be — local first, then the record
 *  copy, same order and same reasoning as recordimage.ts's fullPhotoBlob: a
 *  device that captured the signature has it instantly and for free, and a
 *  device that only joined the audit (or is doing the SharePoint sync from a
 *  different tablet, as actually happened — see this file's header) still
 *  gets the real bytes rather than nothing. Throws rather than returning
 *  null, so the SharePoint sync's own plan can say exactly which signature
 *  it could not get and why, the same way it already does for a photograph
 *  with no record copy. */
export async function fullSignatureBlob(
  s: Signature,
  entityCode: string,
  visitId: string
): Promise<Blob> {
  if (s.blobKey) {
    const local = await getBlob(s.blobKey);
    if (local) return local;
  }
  if (s.cloudUrl && entityCode && visitId) {
    return fetchRecordPhoto(signatureObjectPath(entityCode, visitId, s));
  }
  throw new Error(
    "the signature is not on this device and was never copied to the record — export it from the device it was captured on, or back it up first"
  );
}

async function uploadOneSignature(
  entityCode: string,
  visitId: string,
  s: Signature
): Promise<{ url: string }> {
  const blob = await getBlob(s.blobKey);
  if (!blob) throw new Error("The signature is no longer stored on this device.");
  const form = new FormData();
  form.append("file", blob, signatureFilename(s));
  form.append("pathname", signatureObjectPath(entityCode, visitId, s));
  const r = await fetch("/api/photos", { method: "POST", body: form });
  const j = (await r.json()) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error ?? "The upload failed.");
  return { url: j.url };
}

export interface SignatureSyncState {
  /** Signatures with no record copy yet. */
  outstanding: number;
  /** Signatures whose last attempt failed. */
  failed: number;
  uploading: boolean;
  run: () => void;
  online: boolean;
}

/** A signature worth queuing: it has bytes on this device and no record copy
 *  yet. Exactly `sync.ts`'s `wants`, for `Signature` instead of `Attachment`
 *  — both carry the same `blobKey`/`cloudUrl` shape on purpose. */
function wants(s: Signature | null | undefined): s is Signature {
  return !!s && !!s.blobKey && !s.cloudUrl;
}

/** Mounted once, in the shell, next to usePhotoSync — so the queue drains
 *  whichever screen the auditor is on. */
export function useSignatureSync(): SignatureSyncState {
  const on = useRecordStore();
  const attendanceRegisters = useStore((s) => s.attendanceRegisters);
  const evidenceItems = useStore((s) => s.evidenceItems);
  const updateAttendanceRegister = useStore((s) => s.updateAttendanceRegister);
  const updateEvidenceItem = useStore((s) => s.updateEvidenceItem);

  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(true);
  /* A ref, not state: the loop reads it to decide whether to keep going, and
     a re-render in the middle of an upload must not start a second loop. */
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

  const outstanding: OutstandingSignature[] = [];
  let failed = 0;
  for (const r of attendanceRegisters) {
    for (const row of r.rows) {
      if (!wants(row.signature)) continue;
      outstanding.push({
        ownerId: r.id,
        rowId: row.id,
        s: row.signature,
        owner: "attendance",
        entity: r.entity,
        visit: r.originVisit,
      });
      if (row.signature.cloudError) failed++;
    }
  }
  for (const e of evidenceItems) {
    if (!wants(e.signature)) continue;
    outstanding.push({
      ownerId: e.id,
      s: e.signature,
      owner: "evidenceLog",
      entity: e.entity,
      visit: e.originVisit,
    });
    if (e.signature.cloudError) failed++;
  }

  /* Writes the upload's result back onto the one row it came from — read
     fresh from the store rather than the closure above, same reason
     sync.ts's own write-back does: the loop below can run long enough for
     other edits to land in between. */
  const writeBack = useCallback(
    (o: OutstandingSignature, patch: Partial<Signature>) => {
      if (o.owner === "attendance") {
        const r = useStore.getState().attendanceRegisters.find((x) => x.id === o.ownerId);
        if (!r) return;
        updateAttendanceRegister(o.ownerId, {
          rows: r.rows.map((row) =>
            row.id === o.rowId && row.signature
              ? { ...row, signature: { ...row.signature, ...patch } }
              : row
          ),
        });
      } else {
        const e = useStore.getState().evidenceItems.find((x) => x.id === o.ownerId);
        if (!e || !e.signature) return;
        updateEvidenceItem(o.ownerId, { signature: { ...e.signature, ...patch } });
      }
    },
    [updateAttendanceRegister, updateEvidenceItem]
  );

  const run = useCallback(async () => {
    if (!on || running.current || !navigator.onLine) return;
    running.current = true;
    setUploading(true);
    try {
      const s = useStore.getState();
      const todo: OutstandingSignature[] = [];
      for (const r of s.attendanceRegisters) {
        for (const row of r.rows) {
          if (!wants(row.signature)) continue;
          todo.push({
            ownerId: r.id,
            rowId: row.id,
            s: row.signature,
            owner: "attendance",
            entity: r.entity,
            visit: r.originVisit,
          });
        }
      }
      for (const e of s.evidenceItems) {
        if (!wants(e.signature)) continue;
        todo.push({
          ownerId: e.id,
          s: e.signature,
          owner: "evidenceLog",
          entity: e.entity,
          visit: e.originVisit,
        });
      }
      /* One at a time — airport wifi pushing several in parallel is how you
         get several timeouts instead of one success. */
      for (const o of todo) {
        if (!navigator.onLine) break;
        try {
          const { url } = await uploadOneSignature(o.entity, o.visit, o.s);
          writeBack(o, { cloudUrl: url, cloudAt: Date.now(), cloudError: undefined });
        } catch (e) {
          writeBack(o, { cloudError: e instanceof Error ? e.message : "The upload failed." });
        }
      }
    } finally {
      running.current = false;
      setUploading(false);
    }
  }, [on, writeBack]);

  /* Drain when there is something to send and a network to send it on. The
     dependency is the COUNT, same reasoning as sync.ts: signing somebody in
     starts the queue, editing an unrelated field does not. */
  const count = outstanding.length;
  useEffect(() => {
    if (!on || !online || count === 0) return;
    const t = setTimeout(() => void run(), 1200);
    return () => clearTimeout(t);
  }, [on, online, count, run]);

  return { outstanding: count, failed, uploading, run, online };
}
