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
import type { Attachment } from "./types";

export interface Outstanding {
  checkId: string;
  a: Attachment;
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
  const updateAttachment = useStore((s) => s.updateAttachment);

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

  const data = byVisit[`${entity}/${visit}`];
  const outstanding: Outstanding[] = [];
  let failed = 0;
  for (const [checkId, r] of Object.entries(data?.responses ?? {})) {
    for (const a of r.attachments) {
      if (a.kind !== "photo" || !a.blobKey || a.unavailable || a.cloudUrl) continue;
      outstanding.push({ checkId, a });
      if (a.cloudError) failed++;
    }
  }

  const run = useCallback(async () => {
    if (!on || running.current || !navigator.onLine) return;
    running.current = true;
    setUploading(true);
    try {
      const s = useStore.getState();
      const d = s.byVisit[`${s.entity}/${s.visit}`];
      const todo: Outstanding[] = [];
      for (const [checkId, r] of Object.entries(d?.responses ?? {})) {
        for (const a of r.attachments) {
          if (a.kind === "photo" && a.blobKey && !a.unavailable && !a.cloudUrl) {
            todo.push({ checkId, a });
          }
        }
      }
      /* One at a time. Eight parallel uploads on airport wifi is eight
         timeouts. */
      for (const { checkId, a } of todo) {
        if (!navigator.onLine) break;
        try {
          const { url } = await uploadOne(s.entity, s.visit, a);
          updateAttachment(checkId, a.id, {
            cloudUrl: url,
            cloudAt: Date.now(),
            cloudError: undefined,
          });
        } catch (e) {
          updateAttachment(checkId, a.id, {
            cloudError: e instanceof Error ? e.message : "The upload failed.",
          });
        }
      }
    } finally {
      running.current = false;
      setUploading(false);
    }
  }, [on, updateAttachment]);

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
