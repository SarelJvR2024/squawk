"use client";

/** THE FULL IMAGE, WHEREVER IT HAPPENS TO BE.
 *
 *  Sarel, on the Visual review screen on his laptop: "the photos are coming
 *  through at very low quality, we cant actually use these images."
 *
 *  He was looking at the thumbnail. A photograph exists in up to three places
 *  and only one of them is evidence:
 *
 *    the local blob   1600px, in THIS device's IndexedDB under `blobKey`.
 *                     A pointer into local storage, so it resolves on the
 *                     device that took the photograph and nowhere else.
 *    the record copy  the same 1600px image in the blob store, reachable
 *                     through /api/photos by a device that can prove it is on
 *                     this audit. This is the one that crosses.
 *    thumbDataUrl     240px, riding inside the persisted JSON. A list-row
 *                     preview. It crosses to every device, which is exactly
 *                     why it was mistaken for the photograph.
 *
 *  This hook prefers them in that order, and the order matters: the local copy
 *  is instant and works on an apron with no signal, so a device that HAS the
 *  bytes never pays for a network round trip to look at its own evidence.
 *
 *  WHY THE THUMBNAIL WAS NOT SIMPLY MADE BIGGER. It lives inside the persisted
 *  JSON, which rewrites on every keystroke and is pushed whole over the shared
 *  record. Measured on a real photograph of a printed page: 240px costs 7 KB,
 *  640px costs 78 KB. Across a hundred-photograph day that is 7.6 MB rewritten
 *  per keystroke. The thumbnail stays a thumbnail. */

import { useEffect, useState } from "react";
import { getBlob, useBlobUrl } from "./media";
import { photoObjectPath } from "./photos";
import { PASS_KEY } from "./shared";
import type { Attachment } from "./types";

/* ------------------------------------------------------- the record copy */

/** Where a device keeps the proof that it is on this audit. Read lazily and in
 *  a try/catch: this module is imported by server-rendered components, and a
 *  browser with site data blocked throws on read rather than returning null. */
function passphrase(): string | null {
  try {
    return localStorage.getItem(PASS_KEY);
  } catch {
    return null;
  }
}

/** The object path for an attachment's record copy, or null if it has none.
 *  `cloudUrl` is the flag: it is set only once the upload came back. */
export function recordPath(
  a: Attachment,
  entityCode: string,
  visitId: string
): string | null {
  return a.kind === "photo" && a.cloudUrl && entityCode && visitId
    ? photoObjectPath(entityCode, visitId, a)
    : null;
}

/** The record copy, as bytes. Throws with a sentence a person can act on —
 *  callers put it in front of an auditor rather than swallowing it. */
export async function fetchRecordPhoto(path: string): Promise<Blob> {
  const pass = passphrase();
  if (!pass) {
    throw new Error(
      "this device has not joined the audit — enter the team passphrase under More → Shared record"
    );
  }
  const r = await fetch("/api/photos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathname: path, passphrase: pass }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `the record copy could not be fetched (${r.status})`);
  }
  return r.blob();
}

/** THE FULL-RESOLUTION BYTES, for an export or an upload — local first, then
 *  the record copy.
 *
 *  Never the thumbnail. A 240px preview in an evidence zip or in ACSA's
 *  SharePoint library is worse than a gap, because a gap is visible and a
 *  blurred photograph of a certificate looks like evidence until somebody
 *  tries to read it. So this returns the real image or it throws, and the
 *  caller says which photographs it could not get. */
export async function fullPhotoBlob(
  a: Attachment,
  entityCode: string,
  visitId: string
): Promise<Blob> {
  if (a.blobKey) {
    const local = await getBlob(a.blobKey);
    if (local) return local;
  }
  const path = recordPath(a, entityCode, visitId);
  if (!path) {
    throw new Error(
      "the image is not on this device and was never copied to the record — export it from the device that took it"
    );
  }
  return fetchRecordPhoto(path);
}

export interface RecordImage {
  /** The best source found, or null while still looking. */
  url: string | null;
  /** True when all that could be found is the 240px preview. */
  thumbOnly: boolean;
  /** Fetching the record copy right now. */
  loading: boolean;
  /** Why the record copy could not be fetched. Shown, never swallowed. */
  error: string | null;
}

export function useRecordImage(
  a: Attachment,
  entityCode: string,
  visitId: string
): RecordImage {
  const { url: local } = useBlobUrl(a.blobKey);
  const [remote, setRemote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = recordPath(a, entityCode, visitId);

  useEffect(() => {
    /* The local copy wins and costs nothing — never go to the network for a
       photograph this device already holds. */
    if (local || !path) return;
    let live = true;
    let objectUrl: string | null = null;

    (async () => {
      /* The passphrase is how a device proves it is on this audit. Without one
         there is nothing to ask with, and the route would refuse anyway — so
         fall through to the preview quietly rather than showing an error for
         something the auditor has not been asked to do yet. */
      if (!passphrase()) return;

      setLoading(true);
      try {
        const blob = await fetchRecordPhoto(path);
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setRemote(objectUrl);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "The record copy could not be fetched.");
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
      /* Or the tablet leaks a megabyte per photograph viewed across a day. */
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [local, path]);

  const full = local ?? remote;
  return {
    url: full ?? a.thumbDataUrl ?? a.dataUrl ?? null,
    thumbOnly: !full && !!(a.thumbDataUrl || a.dataUrl),
    loading,
    error,
  };
}
