"use client";

/** Real capture — microphone, camera, and the blob store behind them.
 *
 *  Before this file existed, "Voice note" flipped a boolean and wrote a
 *  hardcoded string from the Answer Library into the auditor's observation as
 *  though it had been dictated. Photographs got a filename and no image. That
 *  is fabricated evidence in a document that reaches the SACAA Director of
 *  Civil Aviation, so it is gone. Nothing in here invents content: if the
 *  microphone is unavailable the control says so and stays disabled.
 *
 *  Blobs never enter the Zustand store. That store persists as ONE JSON value
 *  in IndexedDB and rewrites itself on every keystroke — putting base64 audio
 *  in it would rewrite megabytes per character typed and exhaust the quota
 *  within a morning's capture. Media lives under its own keys and the
 *  attachment record carries only `blobKey`. See src/lib/store.ts. */

import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from "idb-keyval";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const MEDIA_PREFIX = "squawk-media/";

const mediaKey = (id: string) => `${MEDIA_PREFIX}${id}`;

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await idbSet(mediaKey(id), blob);
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await idbGet(mediaKey(id))) as Blob | undefined;
}

export async function delBlob(id: string): Promise<void> {
  await idbDel(mediaKey(id));
}

export async function delBlobs(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => idbDel(mediaKey(id))));
}

/* ---------- photographs ----------

   A phone photograph is 4-12 MB. Stored as taken, twenty of them fill a
   tablet's quota and the audit stops mid-morning with an opaque browser error.
   So every image is re-encoded before it is stored: longest edge 1600px, JPEG
   quality 0.82, which lands a typical photo at 300-600 KB and is still far more
   than enough to read a serial plate off.

   The canvas re-encode strips EXIF as a side effect, which is mostly welcome —
   GPS coordinates of a national key point are not something to carry around by
   accident. But WHEN a photograph was taken is audit evidence, so the capture
   timestamp is read out of the original first and kept on the attachment. It is
   read with a small purpose-built parser rather than a dependency: this needs
   one tag, and the failure mode of not finding it is simply that the record
   falls back to the time it was attached. */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/** The DateTimeOriginal EXIF tag (0x9003), as milliseconds, or null.
 *
 *  Deliberately shallow: it walks the APP1 segment far enough to find the tag
 *  and gives up on anything unexpected. A photograph with no readable EXIF is
 *  the normal case for a screenshot or a re-saved image, not an error. */
export async function exifTakenAt(file: Blob): Promise<number | null> {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null; // not a JPEG

    let off = 2;
    while (off + 4 < v.byteLength) {
      if (v.getUint8(off) !== 0xff) return null;
      const marker = v.getUint8(off + 1);
      const size = v.getUint16(off + 2);
      if (marker === 0xe1) {
        const tiff = off + 10; // skip "Exif\0\0"
        if (tiff + 8 > v.byteLength) return null;
        const le = v.getUint16(tiff) === 0x4949;
        const u16 = (o: number) => v.getUint16(o, le);
        const u32 = (o: number) => v.getUint32(o, le);
        const ifd0 = tiff + u32(tiff + 4);

        const findIn = (dir: number, tag: number): number | null => {
          if (dir + 2 > v.byteLength) return null;
          const n = u16(dir);
          for (let i = 0; i < n; i++) {
            const e = dir + 2 + i * 12;
            if (e + 12 > v.byteLength) return null;
            if (u16(e) === tag) return u32(e + 8);
          }
          return null;
        };

        /* DateTimeOriginal lives in the Exif sub-IFD, pointed at from IFD0. */
        const sub = findIn(ifd0, 0x8769);
        const at = sub === null ? null : findIn(tiff + sub, 0x9003);
        if (at === null) return null;

        const start = tiff + at;
        if (start + 19 > v.byteLength) return null;
        let str = "";
        for (let i = 0; i < 19; i++) str += String.fromCharCode(v.getUint8(start + i));
        /* "2026:09:06 14:22:31" */
        const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(str);
        if (!m) return null;
        const t = new Date(
          Number(m[1]), Number(m[2]) - 1, Number(m[3]),
          Number(m[4]), Number(m[5]), Number(m[6])
        ).getTime();
        return Number.isFinite(t) ? t : null;
      }
      if (marker === 0xda) return null; // start of scan; EXIF would have come first
      off += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}

export interface PreparedPhoto {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  takenAt: number | null;
  thumbDataUrl: string;
}

function drawTo(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Downscale, re-encode and measure. Returns the original untouched if the
 *  browser cannot decode it — a photograph that will not re-encode is still
 *  better evidence than no photograph. */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const takenAt = await exifTakenAt(file);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("undecodable"));
      el.src = url;
    });

    const full = drawTo(img, MAX_EDGE);
    const blob = await new Promise<Blob | null>((res) =>
      full.toBlob(res, "image/jpeg", JPEG_QUALITY)
    );
    /* A thumbnail small enough to sit in the persisted store, so a strip of
       photographs paints without an async read per tile. */
    const thumbDataUrl = drawTo(img, 240).toDataURL("image/jpeg", 0.6);

    if (!blob) throw new Error("no blob");
    return {
      blob,
      mimeType: "image/jpeg",
      width: full.width,
      height: full.height,
      bytes: blob.size,
      takenAt,
      thumbDataUrl,
    };
  } catch {
    return {
      blob: file,
      mimeType: file.type || "image/jpeg",
      width: 0,
      height: 0,
      bytes: file.size,
      takenAt,
      thumbDataUrl: "",
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** How much of the tablet the evidence is using.
 *
 *  A tablet running out of storage mid-audit must fail visibly. Reading the
 *  actual stored blobs rather than summing what the records claim, because the
 *  records are what would be wrong in the case worth catching. */
export async function photoBudget(): Promise<{ count: number; bytes: number }> {
  const all = await idbKeys();
  const mine = all.filter(
    (k): k is string => typeof k === "string" && k.startsWith(MEDIA_PREFIX)
  );
  let bytes = 0;
  let count = 0;
  for (const k of mine) {
    const b = (await idbGet(k)) as Blob | undefined;
    if (!b) continue;
    count++;
    bytes += b.size;
  }
  return { count, bytes };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Every media key in the store, orphans included.
 *
 *  Resetting by walking the audit's own records would leave behind anything
 *  whose record was already gone — a photograph taken and then deleted, a
 *  recording from a visit that was cleared. Over a few dry runs that is the
 *  quota filling up with files nothing points at, so a reset sweeps the
 *  prefix rather than trusting the index. */
export async function clearAllMedia(): Promise<number> {
  const all = await idbKeys();
  const mine = all.filter(
    (k): k is string => typeof k === "string" && k.startsWith(MEDIA_PREFIX)
  );
  await Promise.all(mine.map((k) => idbDel(k)));
  return mine.length;
}

/** True only after the first client render.
 *
 *  Capability detection reads `window`, so calling it during render makes the
 *  server and the client disagree — the server says "no microphone" and paints
 *  the disabled control, the client says "microphone" and paints the button,
 *  and React throws a hydration mismatch and rebuilds the tree. Gating on this
 *  makes the first client render identical to the server's, and the real
 *  answer arrives on the render after that. */
const neverChanges = () => () => {};
export function useIsClient(): boolean {
  /* useSyncExternalStore is the sanctioned way to say "this differs between
     server and client": the server snapshot is false, the client snapshot is
     true, and React handles the handover instead of a setState in an effect. */
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false
  );
}

/* ---------- capability detection ----------

   Detected, never assumed. An auditor on an iPad in an airport basement with
   the microphone permission denied must be told that, not handed a control
   that silently does nothing. */

export function supportsRecording(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** Safari (iPadOS — the likely field tablet) writes audio/mp4; Chrome and
 *  Android write audio/webm. Ask the browser rather than guessing, and fall
 *  back to its own default when it recognises none of them. */
export function pickAudioMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function extensionFor(mime: string | undefined): string {
  if (!mime) return "bin";
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("image/jpeg")) return "jpg";
  if (mime.startsWith("image/png")) return "png";
  return "bin";
}

export type RecorderState = "idle" | "requesting" | "recording" | "denied" | "unsupported";

export interface RecorderResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

/** Microphone recording. Returns the real blob and the real elapsed duration —
 *  both measured, neither assumed. */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  /* Release the microphone if the auditor navigates away mid-recording —
     otherwise the tablet keeps the mic indicator lit and the stream open. */
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    if (!supportsRecording()) {
      setState("unsupported");
      setError("This browser cannot record audio.");
      return false;
    }
    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setState("denied");
      setError(
        name === "NotAllowedError"
          ? "Microphone permission denied. Allow it in the browser's site settings, then try again."
          : name === "NotFoundError"
            ? "No microphone found on this device."
            : "Could not open the microphone."
      );
      return false;
    }

    const mimeType = pickAudioMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setState("unsupported");
      setError("This browser cannot record audio in a supported format.");
      return false;
    }

    chunksRef.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    streamRef.current = stream;
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    setElapsed(0);
    /* 1s timeslice so a long note still flushes chunks as it goes — a tab
       killed mid-recording then loses a second, not the whole note. */
    rec.start(1000);
    setState("recording");
    tickRef.current = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)),
      250
    );
    return true;
  }, []);

  const stop = useCallback((): Promise<RecorderResult | null> => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      cleanup();
      setState("idle");
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      rec.onstop = () => {
        const durationSec = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000)
        );
        const mimeType = rec.mimeType || pickAudioMime() || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        cleanup();
        setState("idle");
        setElapsed(0);
        resolve(blob.size > 0 ? { blob, mimeType, durationSec } : null);
      };
      rec.stop();
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    chunksRef.current = [];
    cleanup();
    setState("idle");
    setElapsed(0);
  }, [cleanup]);

  return { state, elapsed, error, start, stop, cancel };
}

/* ---------- dictation ----------

   Separate from recording on purpose. The audio note is the evidence and is
   always kept; a transcript is a convenience the browser may or may not be
   able to produce. Where it can (Chrome, Android, Edge) the auditor gets text
   they can correct. Where it cannot (iOS Safari) the note still records and
   the transcript field simply stays empty and typed by hand. A transcript is
   never invented to fill the gap. */

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function supportsDictation(): boolean {
  return !!speechCtor();
}

/** Live speech-to-text while recording, where the browser provides it.
 *  `lang` defaults to South African English; the auditors code-switch into
 *  Afrikaans, which this engine will not handle — hence the transcript is
 *  always editable and never authoritative. */
export function useDictation(lang = "en-ZA") {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) return false;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    finalRef.current = "";
    setTranscript("");
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const alt = e.results[i][0];
        if (!alt) continue;
        if (e.results[i].isFinal) finalRef.current += alt.transcript;
        else interim += alt.transcript;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    /* A dictation failure must never take the recording down with it — the
       audio is the evidence, the text is the convenience. */
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    try {
      rec.start();
    } catch {
      return false;
    }
    recRef.current = rec;
    setListening(true);
    return true;
  }, [lang]);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
  }, []);

  /* Same reason as useIsClient above: this must not differ between the
     server's render and the client's first one. */
  const client = useIsClient();
  return { transcript, listening, start, stop, reset, supported: client && supportsDictation() };
}

/* ---------- object URLs ----------

   A blob in IndexedDB needs an object URL to reach an <img> or <audio>, and
   that URL must be revoked or the tablet leaks a megabyte per photograph
   viewed across a day of capture. */

export function useBlobUrl(blobKey: string | null | undefined): {
  url: string | null;
  missing: boolean;
} {
  /* Resolved state carries the key it was resolved for, so switching to
     another attachment reads as "not loaded yet" on the very first render
     rather than briefly showing the previous blob. That is what keeps this
     effect from having to clear state synchronously on the way in. */
  const [resolved, setResolved] = useState<{
    key: string;
    url: string | null;
    missing: boolean;
  } | null>(null);

  useEffect(() => {
    if (!blobKey) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    getBlob(blobKey).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setResolved({ key: blobKey, url: null, missing: true });
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setResolved({ key: blobKey, url: objectUrl, missing: false });
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobKey]);

  const current = blobKey && resolved?.key === blobKey ? resolved : null;
  return { url: current?.url ?? null, missing: current?.missing ?? false };
}

/** mm:ss — the only place a duration is ever formatted, so a real elapsed
 *  number cannot drift back into a hardcoded "0:14". */
export function formatDuration(sec: number | undefined | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
