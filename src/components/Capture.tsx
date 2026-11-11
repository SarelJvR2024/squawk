"use client";

/** The capture controls — microphone, camera, and the strip of what has been
 *  attached. Shared by the desk workspace (CheckDetail) and field mode so a
 *  voice note behaves identically whether it is taken at a desk or on the
 *  apron.
 *
 *  Targets are 44px because these are pressed with a gloved thumb on a tablet,
 *  which is also why recording is a press-to-start / press-to-stop toggle
 *  rather than press-and-hold: holding a tablet steady against an ear defeater
 *  while talking is not a thing anyone manages one-handed. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  delBlob,
  extensionFor,
  formatBytes,
  formatDuration,
  getBlob,
  preparePhoto,
  putBlob,
  supportsRecording,
  useBlobUrl,
  useIsClient,
  useDictation,
  useRecorder,
  type RecorderResult,
} from "@/lib/media";
import {
  assist,
  captionContext,
  parseCaption,
  transcribe,
  useAssistAvailable,
  useTranscribeAvailable,
  useVisionOn,
} from "@/lib/assist";
import { useDictationEnabled, useEntityCode, useStore } from "@/lib/store";
import { useRecordStore } from "@/lib/sync";
import { fullPhotoBlob } from "@/lib/recordimage";
import type { Attachment } from "@/lib/types";
import { IconCamera, IconCheck, IconDownload, IconEdit, IconMic, IconPaperclip, IconSpark, IconX } from "./ui/icons";
import { Pill } from "./ui/primitives";

const uid = () => Math.random().toString(36).slice(2, 10);

export interface CapturedMedia {
  kind: "photo" | "voice" | "file";
  name: string;
  blobKey: string;
  mimeType: string;
  durationSec?: number;
  transcript?: string;
  transcriptSource?: "browser" | "service";
  thumbDataUrl?: string;
  width?: number;
  height?: number;
  bytes?: number;
  takenAt?: number;
  caption?: string;
}

/** Narrowed per button, so a caller building a `Capture` (field tray) or an
 *  `Attachment` (a check) that is itself still `"photo" | "voice"`-only —
 *  see `field/page.tsx` — gets that guarantee from the type, not just from
 *  which component happens to be on screen. Each button only ever
 *  constructs its own kind; this says so once instead of trusting every
 *  call site to know it. */
export type PhotoCapture = CapturedMedia & { kind: "photo" };
export type VoiceCapture = CapturedMedia & { kind: "voice" };
export type FileCapture = CapturedMedia & { kind: "file" };

const TAP =
  "inline-flex h-[44px] items-center justify-center gap-[7px] rounded-[11px] border px-[13px] text-[12px] font-semibold transition-[var(--t)] active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed";

/** The square, label-less form for sitting INSIDE the observation box.
 *
 *  A separate constant rather than a `className` override: both strings set
 *  height and padding, and which one wins is decided by the order Tailwind
 *  emitted the rules, not by the order they appear in the template. A prop
 *  that swaps the whole base class is the version that cannot surprise
 *  somebody later.
 *
 *  34px, not 44. These are a convenience at a desk, sat in a text field; the
 *  controls an auditor reaches for in gloves on an apron — Photo, and the
 *  compliance answer — keep their 44px in the bar below. */
const TAP_INLINE =
  "inline-flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border text-[12px] font-semibold transition-[var(--t)] active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed";

/** Two big tiles, not a row of small pills — Sarel, on the Raise screen:
 *  "make the photo and voice note buttons bigger, more prominent." A
 *  separate constant for the same reason TAP_INLINE is one and not a
 *  `className` override: Tailwind resolves two classes setting the same
 *  property by the order it emitted the underlying rules, not by the order
 *  they appear on the element, so `${TAP} h-[60px]` is not reliably taller
 *  than TAP — only a different base class is. `flex-1` so two of these
 *  side by side split the width evenly and read as the primary action on
 *  the screen, the way Photo/Voice note is meant to on this one. */
const TAP_LARGE =
  "inline-flex h-[60px] flex-1 items-center justify-center gap-[9px] rounded-[14px] border text-[14px] font-bold transition-[var(--t)] active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed";

/** What to say when this device cannot store a capture.
 *
 *  EVIDENCE THAT WAS NOT STORED MUST NEVER BE SILENT. Both write paths used to
 *  be `await putBlob(...)` followed straight by onCaptured(...), with no catch:
 *  a full tablet meant the promise rejected, the attachment was never added,
 *  and the auditor — who had just pressed the shutter on a defect at a national
 *  key point — saw nothing at all. No error, no photograph, no reason to
 *  believe anything had gone wrong. They would walk on.
 *
 *  A quota is the case that will actually happen, so it gets its own sentence
 *  and a way out rather than a shrug. */
function whyItFailed(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "QuotaExceededError" || /quota/i.test(String(err))) {
    return "No room left on this device — it was NOT stored. Open Export, download this audit's photographs, then clear them and take it again.";
  }
  return `This device could not store it — it was NOT saved. ${
    err instanceof Error && err.message ? err.message : "Try again."
  }`;
}

/* ---------- voice ---------- */

export function VoiceNoteButton({
  onCaptured,
  compact = false,
  inline = false,
  large = false,
  className = "",
}: {
  onCaptured: (m: VoiceCapture) => void;
  compact?: boolean;
  /** Square and 34px, for sitting inside the observation box. Implies
   *  `compact` — there is no room for a label — and while recording it still
   *  widens to carry the running timer, because a recording that does not
   *  show it is running is how an auditor loses a note. */
  inline?: boolean;
  /** 60px and flex-1 — see TAP_LARGE's own doc comment. Takes priority over
   *  `inline`; a button cannot be both a corner-fitting square and a
   *  prominent tile. */
  large?: boolean;
  /* So a caller can stretch it in a grid cell, as PhotoButton already allows.
     It lands on the wrapper AND the button, because the wrapper is what a
     grid or flex parent actually measures. */
  className?: string;
}) {
  const dict = useDictation();
  const entityCode = useEntityCode();
  /* Opt-in, and read here rather than inside useDictation so the hook stays a
     plain wrapper over the browser API and the consent decision lives in one
     visible place. */
  const dictationOn = useDictationEnabled();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /* Assume the control is available until the client can actually check.
     The server cannot know, and guessing "unavailable" would both mismatch on
     hydration and flash a disabled button at an auditor who has a microphone. */
  const isClient = useIsClient();
  const supported = !isClient || supportsRecording();

  /* Read by `finishRecording` below AFTER this component may already have
     unmounted (see useRecorder's own `onInterrupted`) — a ref, not state,
     so the interrupted-recording path still sees whatever the live
     transcript actually said right up to the moment it was cut off. */
  const transcriptRef = useRef(dict.transcript);
  useEffect(() => {
    transcriptRef.current = dict.transcript;
  }, [dict.transcript]);

  /* THE SAME SAVE, WHETHER THE AUDITOR STOPPED IT OR SOMETHING ELSE DID.
   *  Sarel: "make sure that voice recordings... are not lost when any
   *  compliance buttons are captured or updated." Shared between the manual
   *  Stop in `toggle()` below and `useRecorder`'s own `onInterrupted` (fired
   *  from its unmount effect when this component disappears mid-recording)
   *  so a recording cut off by something else is stored exactly the way one
   *  stopped on purpose is — not a second, thinner save path that could drift
   *  from the real one. */
  const finishRecording = useCallback(
    async (result: RecorderResult) => {
      const blobKey = `voice-${uid()}`;
      await putBlob(blobKey, result.blob);
      onCaptured({
        kind: "voice",
        name: `${entityCode}-voice-${new Date()
          .toISOString()
          .slice(11, 19)
          .replace(/:/g, "")}.${extensionFor(result.mimeType)}`,
        blobKey,
        mimeType: result.mimeType,
        durationSec: result.durationSec,
        /* Only what the engine actually heard. Empty is a correct answer. */
        transcript: (dictationOn && transcriptRef.current.trim()) || undefined,
        transcriptSource:
          dictationOn && transcriptRef.current.trim() ? "browser" : undefined,
      });
    },
    [entityCode, dictationOn, onCaptured]
  );

  const rec = useRecorder((result) => {
    /* CUT OFF MID-RECORDING, NOT DISCARDED — see finishRecording's own
       comment. There is nobody left on screen to show "Voice note
       attached" to by the time this fires, so it is silent on success;
       the point is that the recording itself still reaches the record,
       the same one it would have joined had the auditor pressed Stop. */
    void finishRecording(result).catch(() => {
      /* Best-effort. Nothing is left mounted to tell a failure to — see
         whyItFailed's own note on why a silent loss is the worse half of
         this problem; a failed save here is at least no worse than the
         bug this exists to fix, not a new way to lose the same note. */
    });
  });

  const recording = rec.state === "recording";

  async function toggle() {
    if (busy) return;
    if (!recording) {
      setBusy(true);
      const ok = await rec.start();
      /* Dictation rides along with the recording but is never required by it:
         if the engine refuses, the audio still records. It runs only when the
         auditor has switched it on, because it is not on-device. */
      if (ok && dictationOn && dict.supported) dict.start();
      setBusy(false);
      return;
    }
    setBusy(true);
    dict.stop();
    try {
      const result = await rec.stop();
      if (result) {
        await finishRecording(result);
        setFailed(null);
      }
    } catch (err) {
      /* Said out loud, and kept on screen. A note that was recorded and then
         not stored is worse than one never taken: the auditor believes they
         have it. */
      setFailed(whyItFailed(err));
    } finally {
      dict.reset();
      /* In a finally, because a throw between here and setBusy(false) used to
         leave the button stuck mid-record with nothing said. */
      setBusy(false);
    }
  }

  /* Recording always shows the timer, so the inline form drops its fixed
     width for as long as it is running rather than clipping the clock. */
  const base = inline ? (recording ? `${TAP_INLINE} w-auto px-[9px] gap-[5px]` : TAP_INLINE) : large ? TAP_LARGE : TAP;
  const labelled = !compact && !inline;
  const iconSize = large ? 20 : 15;

  if (!supported) {
    return (
      <span
        className={base}
        style={{
          background: "var(--sunken)",
          borderColor: "var(--line-2)",
          color: "var(--ink-4)",
        }}
        title="This browser cannot record audio. Type the observation instead."
      >
        <IconMic width={iconSize} height={iconSize} />
        {labelled ? "Voice unavailable" : null}
      </span>
    );
  }

  return (
    /* `flex-1` lands HERE, not only on the button inside — Sarel: "make the
       photo and voice note button the same size." This span, not the
       button, is the actual flex item in a caller's `flex` row (it exists
       to hold the Discard button and the live-transcript readout beside
       the mic button while recording), so a `large` button whose grow
       class only reached the button never actually grew: the span sized
       itself to its content and the button's flex-1 had nothing to expand
       into. */
    <span className={`inline-flex items-center gap-2 ${large ? "flex-1" : ""} ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || rec.state === "requesting"}
        aria-label={recording ? "Stop recording" : "Record a voice note"}
        title={recording ? "Stop recording" : "Record a voice note"}
        className={`${base} ${className}`}
        style={
          recording
            ? { background: "var(--bad)", borderColor: "var(--bad)", color: "#fff" }
            : {
                background: "var(--panel)",
                borderColor: "var(--line-2)",
                color: "var(--ink-2)",
              }
        }
      >
        {/* An unmistakable recording state for the field — Sarel's field-capture
           mobile pass: a still mic icon on a red button is easy to miss glancing
           down mid-walk; a pulsing dot beside it reads as "this is live" the way
           a running timer alone does not. Decorative only — the red fill, the
           timer and the aria-label already carry the actual state. */}
        {recording && (
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 animate-pulse rounded-full"
            style={{ background: "#fff" }}
          />
        )}
        <IconMic width={iconSize} height={iconSize} />
        {rec.state === "requesting"
          ? inline
            ? null
            : "Allow microphone…"
          : recording
            ? /* The inline form shows the clock alone; the labelled one keeps
                 "Stop · 0:03", which is what says the tap stops it. */
              inline
              ? formatDuration(rec.elapsed)
              : `Stop · ${formatDuration(rec.elapsed)}`
            : labelled
              ? "Voice note"
              : null}
      </button>
      {recording && (
        <button
          type="button"
          onClick={() => {
            dict.stop();
            dict.reset();
            rec.cancel();
          }}
          aria-label="Discard this recording"
          className={base}
          style={{
            background: "var(--panel)",
            borderColor: "var(--line-2)",
            color: "var(--ink-3)",
          }}
        >
          <IconX width={14} height={14} />
        </button>
      )}
      {failed && (
        /* role=alert: a capture that was not stored has to reach somebody who
           is looking at the apron rather than at the tablet. */
        <span role="alert" className="text-[10.5px] font-semibold" style={{ color: "var(--bad)" }}>
          {failed}
        </span>
      )}
      {rec.error && (
        <span className="text-[10.5px]" style={{ color: "var(--bad)" }}>
          {rec.error}
        </span>
      )}
      {/* While the browser engine is listening, say so. It is not on-device
          and the auditor is entitled to see that it is running, every time,
          rather than having agreed to it once in a panel weeks ago. */}
      {recording && dictationOn && dict.supported && (
        <span className="flex min-w-0 flex-col leading-[1.35]">
          <span className="text-[9.5px] font-semibold tracking-[.04em] uppercase" style={{ color: "var(--warn)" }}>
            live text on · speech sent to the browser&rsquo;s service
          </span>
          {dict.transcript && (
            <span
              className="max-w-[280px] truncate text-[10.5px] italic"
              style={{ color: "var(--ink-3)" }}
              title={dict.transcript}
            >
              {dict.transcript}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/* ---------- photo ----------

   A file input with `capture` opens the rear camera directly on both iPadOS
   and Android, and degrades to the file picker on a desktop browser — which
   is what an auditor writing up at a desk actually wants. */

export function PhotoButton({
  onCaptured,
  compact = false,
  label,
  primary = false,
  className = "",
  inline = false,
  large = false,
}: {
  onCaptured: (m: PhotoCapture) => void;
  compact?: boolean;
  label?: string;
  primary?: boolean;
  className?: string;
  /** Square and 34px, for sitting beside VoiceNoteButton's own `inline` form
   *  inside the observation box — added for the field-capture mobile pass so
   *  Camera is reachable from the one place on CheckDetail that is always on
   *  screen without scrolling or switching tabs, same reasoning as
   *  VoiceNoteButton's own `inline` prop. Implies `compact`. */
  inline?: boolean;
  /** 60px and flex-1 — see TAP_LARGE's own doc comment. Takes priority over
   *  `inline`. */
  large?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const entityCode = useEntityCode();
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          /* Let the same photograph be taken twice in a row — without this the
             input holds the previous value and fires nothing. */
          e.target.value = "";
          let stored = 0;
          const lost: string[] = [];
          for (const file of files) {
            try {
              /* Downscaled and re-encoded before it is stored. A phone photo is
                 4-12 MB as taken; twenty of those fill the tablet's quota and
                 the audit stops mid-morning. See preparePhoto in
                 src/lib/media.ts. */
              const prepared = await preparePhoto(file);
              const blobKey = `photo-${uid()}`;
              await putBlob(blobKey, prepared.blob);
              onCaptured({
                kind: "photo",
                name: file.name || `${entityCode}-photo.${extensionFor(prepared.mimeType)}`,
                blobKey,
                mimeType: prepared.mimeType,
                thumbDataUrl: prepared.thumbDataUrl || undefined,
                width: prepared.width || undefined,
                height: prepared.height || undefined,
                bytes: prepared.bytes,
                takenAt: prepared.takenAt ?? undefined,
                /* Deliberately empty. An uncaptioned photograph reads as
                   incomplete until a person says what it shows. */
                caption: "",
              });
              stored++;
            } catch (err) {
              /* PER FILE, and the loop goes on. Selecting eight photographs and
                 having the second one fail used to abort the rest as well — six
                 more photographs of a defect gone, with nothing said. */
              lost.push(file.name || "a photograph");
              setFailed(whyItFailed(err));
            }
          }
          /* One clear line when SOME got through, because "3 stored, 2 not" is
             the only version of this an auditor can act on. When none did, the
             message from the catch already says why, and saying "0 stored" over
             the top of it would be noise. */
          if (lost.length && stored > 0) {
            setFailed(
              `${stored} stored, ${lost.length} NOT stored (${lost.join(", ")}). ` +
                "Open Export, download this audit's photographs, then clear them and take these again."
            );
          } else if (!lost.length) {
            setFailed(null);
          }
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={label ?? "Take a photograph"}
        className={`${inline ? TAP_INLINE : large ? TAP_LARGE : TAP} ${className}`}
        style={
          primary
            ? {
                background: "var(--acc)",
                borderColor: "var(--acc)",
                color: "var(--on-acc)",
                boxShadow: "var(--e1)",
              }
            : {
                background: "var(--panel)",
                borderColor: "var(--line-2)",
                color: "var(--ink-2)",
              }
        }
      >
        <IconCamera width={large ? 20 : 15} height={large ? 20 : 15} />
        {compact || inline ? null : (label ?? "Photo")}
      </button>
      {failed && (
        /* Kept until the next capture succeeds rather than flashed for two
           seconds: an auditor mid-walk is looking at a switch room, not at the
           tablet, and a photograph that was not stored is not a notification —
           it is a thing they have to go back and do again. */
        <span
          role="alert"
          className="max-w-[34ch] text-[10.5px] leading-[1.4] font-semibold"
          style={{ color: "var(--bad)" }}
        >
          {failed}
        </span>
      )}
    </>
  );
}

/* ---------- evidence file, any format ----------

   Sarel: "add an option to add multiple evidence files all general
   formats." Photo and voice each know their own shape — an image gets
   downscaled and thumbnailed, audio gets a duration and a transcript —
   and neither of those is true of a spreadsheet or a PDF. No `accept`
   and no `capture`, deliberately: this is the plain file picker, not the
   camera, and it takes anything the OS will hand over. Stored exactly as
   selected, one putBlob per file, same as a photograph's original before
   preparePhoto touches it — there is nothing to re-encode a document
   into. */

export function FileButton({
  onCaptured,
  compact = false,
  className = "",
}: {
  onCaptured: (m: FileCapture) => void;
  compact?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          /* Let the same file be picked twice in a row — without this the
             input holds the previous value and fires nothing. */
          e.target.value = "";
          let stored = 0;
          const lost: string[] = [];
          for (const file of files) {
            try {
              const blobKey = `file-${uid()}`;
              await putBlob(blobKey, file);
              onCaptured({
                kind: "file",
                name: file.name || "evidence file",
                blobKey,
                mimeType: file.type || "application/octet-stream",
                bytes: file.size,
                takenAt: file.lastModified || undefined,
              });
              stored++;
            } catch (err) {
              /* PER FILE, and the loop goes on — see the identical reasoning
                 on PhotoButton above. Picking six documents and having the
                 third fail should not lose the other five. */
              lost.push(file.name || "a file");
              setFailed(whyItFailed(err));
            }
          }
          if (lost.length && stored > 0) {
            setFailed(
              `${stored} stored, ${lost.length} NOT stored (${lost.join(", ")}). ` +
                "Open Export, download this audit's photographs, then clear them and add these again."
            );
          } else if (!lost.length) {
            setFailed(null);
          }
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Attach evidence files"
        title="Attach one or more files as evidence — any format: PDF, Word, Excel, photos taken elsewhere, anything."
        className={`${TAP} ${className}`}
        style={{
          background: "var(--panel)",
          borderColor: "var(--line-2)",
          color: "var(--ink-2)",
        }}
      >
        <IconPaperclip width={15} height={15} />
        {compact ? null : "Files"}
      </button>
      {failed && (
        <span
          role="alert"
          className="max-w-[34ch] text-[10.5px] leading-[1.4] font-semibold"
          style={{ color: "var(--bad)" }}
        >
          {failed}
        </span>
      )}
    </>
  );
}

/* ---------- rendering what was captured ---------- */

/** Structural minimum, so the same thumbnail renders an Attachment on a check
 *  and an unassigned Capture in the field tray. */
export interface ThumbSource {
  name: string;
  blobKey?: string;
  dataUrl?: string;
  unavailable?: boolean;
}

export function PhotoThumb({ a, size = 44 }: { a: ThumbSource; size?: number }) {
  const { url, missing } = useBlobUrl(a.blobKey);
  const src = url ?? a.dataUrl ?? null;
  if (a.unavailable || (missing && !a.dataUrl)) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-[8px] border text-[8px]"
        style={{
          width: size,
          height: size,
          background: "var(--sunken)",
          borderColor: "var(--line-2)",
          color: "var(--ink-4)",
        }}
        title="No image stored — this record predates real capture."
      >
        none
      </span>
    );
  }
  if (!src) {
    return (
      <span
        className="shrink-0 rounded-[8px] border"
        style={{ width: size, height: size, background: "var(--sunken)", borderColor: "var(--line-2)" }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={a.name}
      className="shrink-0 rounded-[8px] border object-cover"
      style={{ width: size, height: size, borderColor: "var(--line-2)" }}
    />
  );
}

/** One line, in words, saying what leaves the device on this screen. */
function VisionNote() {
  const vision = useVisionOn();
  return (
    <span className="text-[9.5px]" style={{ color: "var(--ink-4)" }}>
      {vision
        ? "Photographs are sent to the assistant for this step."
        : "Photograph captions are sent; the images themselves are not."}
    </span>
  );
}

const MINI =
  "inline-flex h-[30px] items-center gap-[5px] rounded-[8px] border px-[9px] text-[10.5px] font-semibold transition-[var(--t)] disabled:opacity-50 disabled:cursor-not-allowed";

/** One recorded note: the player, what was said, and the two optional steps
 *  that turn what was said into what gets written down.
 *
 *  The steps are deliberately separate and deliberately manual.
 *
 *    Transcribe   sends this note's audio to the transcription service and
 *                 stores what came back, VERBATIM. That is the only thing that
 *                 ever overwrites `transcript`.
 *    Write it up  asks the model to turn that verbatim text into the written
 *                 observation for this check. The result is held in `revised`,
 *                 beside the transcript, labelled as a suggestion.
 *    Use it       is the only thing that puts any of it into the audit record,
 *                 and an auditor has to press it.
 *
 *  Keeping the verbatim text after the rewrite is the point. A tidy sentence
 *  that quietly dropped one of three items, or turned 40mm into 40cm, is
 *  exactly the failure this application exists to prevent, and the only way to
 *  catch it is to still have the original next to the audio. */
function VoiceRow({
  a,
  onRemove,
  onUpdate,
  writeUp,
  onAccept,
}: {
  a: Attachment;
  onRemove?: () => void;
  onUpdate?: (patch: Partial<Attachment>) => void;
  writeUp?: (transcript: string) => Promise<string>;
  onAccept?: (text: string) => void;
}) {
  const { url, missing } = useBlobUrl(a.blobKey);
  const src = url ?? a.dataUrl ?? null;
  const dead = a.unavailable || (missing && !a.dataUrl);
  const canTranscribe = useTranscribeAvailable();
  const [busy, setBusy] = useState<"hearing" | "writing" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showTranscribe = !dead && !!a.blobKey && !!onUpdate && canTranscribe;
  const showWriteUp = !dead && !!a.transcript && !!writeUp && !!onUpdate;

  async function runTranscribe() {
    if (!a.blobKey || !onUpdate) return;
    setBusy("hearing");
    setError(null);
    try {
      const blob = await getBlob(a.blobKey);
      if (!blob) throw new Error("The audio for this note is no longer stored.");
      const { text } = await transcribe(blob, a.name || "note.webm");
      /* A re-transcription replaces the verbatim text, so any earlier rewrite
         of the OLD text is now stale and is cleared rather than left sitting
         under a transcript it no longer came from. */
      onUpdate({
        transcript: text,
        transcriptSource: "service",
        transcribedAt: Date.now(),
        revised: undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runWriteUp() {
    if (!a.transcript || !writeUp || !onUpdate) return;
    setBusy("writing");
    setError(null);
    try {
      onUpdate({ revised: await writeUp(a.transcript) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant is unavailable.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="flex flex-col gap-[7px] rounded-[8px] border px-[9px] py-[7px]"
      style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <IconMic width={13} height={13} style={{ color: "var(--ink-3)" }} />
        {dead ? (
          <span className="text-[10.5px] line-through" style={{ color: "var(--ink-4)" }}>
            no audio stored — recorded before capture worked
          </span>
        ) : src ? (
          <audio controls src={src} className="h-[32px] max-w-[220px]" preload="metadata" />
        ) : (
          <span className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
            loading…
          </span>
        )}
        {/* A duration is metadata, not a status — item 4 of Sarel's second
            visual-hierarchy pass takes the brand accent off it. */}
        {!dead && <Pill>{formatDuration(a.durationSec)}</Pill>}

        {showTranscribe && (
          <button
            type="button"
            onClick={runTranscribe}
            disabled={busy !== null}
            className={MINI}
            style={{
              background: "var(--panel)",
              borderColor: "var(--line-2)",
              color: "var(--ink-2)",
            }}
            title="Sends this recording to the transcription service and stores what it heard, word for word."
          >
            <IconMic width={12} height={12} />
            {busy === "hearing"
              ? "Listening…"
              : a.transcript
                ? "Transcribe again"
                : "Transcribe"}
          </button>
        )}
        {showWriteUp && (
          <button
            type="button"
            onClick={runWriteUp}
            disabled={busy !== null}
            className={MINI}
            style={{
              background: "var(--panel)",
              borderColor: "var(--line-2)",
              color: "var(--ink-2)",
            }}
            title="Turns what you said into the written observation for this check. Advisory — nothing is recorded until you accept it."
          >
            <IconSpark width={12} height={12} />
            {busy === "writing" ? "Writing…" : a.revised ? "Write it up again" : "Write it up"}
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this voice note"
            className="ml-auto flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] border"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
          >
            <IconX width={12} height={12} />
          </button>
        )}
      </div>

      {error && (
        <span className="text-[10.5px]" style={{ color: "var(--bad)" }}>
          {error}
        </span>
      )}

      {a.transcript && (
        <div className="flex flex-col gap-[5px]">
          <span
            className="text-[9px] font-semibold tracking-[.05em] uppercase"
            style={{ color: "var(--ink-4)" }}
          >
            {a.transcriptSource === "service"
              ? "Transcribed · word for word"
              : a.transcriptSource === "browser"
                ? "Heard live by the browser · word for word"
                : "Typed"}
          </span>
          {/* EDITABLE, NOT JUST READ — Sarel: "allow the user to edit the
             transcribed text." A transcription service or a browser's live
             dictation mishears a word often enough that a quoted, read-only
             span left the only fix as discard-and-redo. Editing it by hand
             clears `transcriptSource`: the words are no longer purely what
             a machine heard, the same "absent means an auditor typed it"
             convention this field already used for a note typed from
             scratch. */}
          {onUpdate ? (
            <textarea
              value={a.transcript}
              onChange={(e) => onUpdate({ transcript: e.target.value, transcriptSource: undefined })}
              aria-label="Edit the transcribed text"
              rows={2}
              className="w-full resize-y rounded-[6px] border px-[8px] py-[5px] text-[11px] italic outline-none"
              style={{ background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
            />
          ) : (
            <span className="text-[11px] italic" style={{ color: "var(--ink-3)" }}>
              “{a.transcript}”
            </span>
          )}
          {/* USE IT, VERBATIM — THE GAP Sarel found: "when I add a voice note
             to a new finding, it saves it linked to the photo and not in the
             main finding description box, which means I have to copy it out
             of that box and paste it into the main finding again." Before
             this button, the ONLY way anything here reached the record was
             via "Write it up" — which needs the assistant configured — so a
             transcript sat on this card, read-only, and the only way out was
             a manual copy/paste. The rewrite step stays optional and stays
             manual (see this component's own doc comment on why); this is
             the exact same "Use it" action, just for the words actually
             spoken rather than a model's rewrite of them, and it needs
             nothing configured to work. Named for where it goes, not just
             what it does, so recording a voice note never again leaves
             somebody wondering why the words are not where they typed
             everything else. */}
          {onAccept && (
            <button
              type="button"
              onClick={() => onAccept(a.transcript!)}
              className={MINI}
              style={{
                background: "var(--panel)",
                borderColor: "var(--line-2)",
                color: "var(--ink-2)",
              }}
            >
              <IconCheck width={12} height={12} />
              Use it, word for word
            </button>
          )}
        </div>
      )}

      {a.revised && (
        <div
          className="flex flex-col gap-[5px] rounded-[8px] border px-[8px] py-[6px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
        >
          <span
            className="text-[9px] font-semibold tracking-[.05em] uppercase"
            style={{ color: "var(--ink-4)" }}
          >
            Suggested wording — not in the record
          </span>
          <span className="text-[11.5px]" style={{ color: "var(--ink-1)" }}>
            {a.revised}
          </span>
          <div className="flex items-center gap-[6px]">
            {onAccept && (
              <button
                type="button"
                onClick={() => onAccept(a.revised!)}
                className={MINI}
                style={{
                  background: "var(--acc)",
                  borderColor: "var(--acc)",
                  color: "var(--on-acc)",
                }}
              >
                {/* "Use the rewrite", not bare "Use it" — now that the
                   verbatim transcript just above has its own "Use it, word
                   for word" button, two buttons both reading "Use it" on
                   the same card is exactly the ambiguity Sarel asked this
                   fix to remove. */}
                Use the rewrite
              </button>
            )}
            {onUpdate && (
              <button
                type="button"
                onClick={() => onUpdate({ revised: undefined })}
                className={MINI}
                style={{
                  background: "var(--panel)",
                  borderColor: "var(--line-2)",
                  color: "var(--ink-3)",
                }}
              >
                Discard
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** One photograph: what it shows, and the field that says so.
 *
 *  The caption is the point of this component. A photograph with no caption is
 *  a JPEG in an IndexedDB store that nobody can search, nobody can report on
 *  and nobody will recognise in six months — the workbook row would carry a
 *  filename and a timestamp. So an uncaptioned photograph is shown as
 *  incomplete, in the same warn colour a finding with no owner uses, and it
 *  stays that way until a person types something or accepts a proposal.
 *
 *  *Describe this photo* is a proposal and nothing else: it fills the field,
 *  marks the caption as the assistant's, and waits. The auditor edits it or
 *  types over it, and editing it hands authorship back to them. */
/** ONE DATALIST, ONE ID, RENDERED ONCE PER SCREEN.
 *
 *  A photograph's location box offers the same suggestions as the inspection's
 *  own — the site's areas plus every place already named on this walk — and a
 *  <datalist> is addressed by id, so it cannot be re-rendered per photograph
 *  without duplicating the id eight times on one page. The screen renders
 *  <LocationOptions> once and every location box on it points here. A screen
 *  that renders none still works: `list` naming an element that is not there is
 *  an input with no suggestions, not an error. */
export const LOCATION_LIST_ID = "squawk-locations";

export function LocationOptions({ values }: { values: string[] }) {
  return (
    <datalist id={LOCATION_LIST_ID}>
      {values.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}

function PhotoRow({
  a,
  onRemove,
  onUpdate,
  onMove,
  compact = false,
  hideDescribe = false,
  onAddVoice,
  voiceNotes,
  onRemoveVoiceNote,
  onUpdateVoiceNote,
  writeUpVoiceNote,
  hideVoiceAccept = false,
}: {
  a: Attachment;
  onRemove?: () => void;
  onUpdate?: (patch: Partial<Attachment>) => void;
  /** See AttachmentStrip's own doc comment on `onMove` — re-links this
   *  photograph to a different check. */
  onMove?: () => void;
  compact?: boolean;
  /** Hides the "Describe" (AI auto-caption) button on this one row. See
   *  AttachmentStrip's own `hideDescribe` — raise/page.tsx is the first
   *  caller that wants a manual, voice-first flow with no AI step; every
   *  other screen keeps Describe. */
  hideDescribe?: boolean;
  /** Offers a "Voice note" button that records audio tied to THIS
   *  photograph (Attachment.photoId), separate from a note for the
   *  finding/check as a whole — Sarel: "there should be a voice note
   *  button for the photo as well." Omit it and no per-photo recording
   *  control is shown. */
  onAddVoice?: (m: VoiceCapture) => void;
  /** Voice notes already tied to THIS photograph (Attachment.photoId ===
   *  a.id), rendered directly under it so it is never ambiguous which one
   *  a note belongs to — "make sure it's clear where note is captured,
   *  either for the finding or for the photo." */
  voiceNotes?: Attachment[];
  onRemoveVoiceNote?: (id: string) => void;
  onUpdateVoiceNote?: (id: string, patch: Partial<Attachment>) => void;
  writeUpVoiceNote?: (transcript: string) => Promise<string>;
  /** Hides this photo's own nested voice note's "Use it, word for word"
   *  button — see AttachmentStrip's own `hideVoiceAccept`. */
  hideVoiceAccept?: boolean;
}) {
  const { url, missing } = useBlobUrl(a.blobKey);
  const src = url ?? a.thumbDataUrl ?? a.dataUrl ?? null;
  const dead = a.unavailable || (missing && !a.dataUrl && !a.thumbDataUrl);
  const aiOn = useAssistAvailable();
  const vision = useVisionOn();
  const recordStore = useRecordStore();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const caption = a.caption ?? "";
  const uncaptioned = !dead && !caption.trim();
  const size = compact ? 48 : 64;

  /* THE RECORD COPY, NOT ONLY THE LOCAL BLOB — Sarel: "why do i get this
     error" (The image for this photograph is no longer stored), asking to
     Describe a photo this device never took. This used to read only
     `getBlob(a.blobKey)`, which resolves on the capturing device and nowhere
     else — the same gap /api/photos and useRecordImage already exist to
     close on the Visual review screen, just never wired in here.
     `fullPhotoBlob` tries the local blob first (instant, works with no
     signal) and falls back to the record-store copy.

     AND NOW THE THUMBNAIL, RATHER THAN FAILING — Sarel: "change the describe
     button to also run on the thumbnail version, or if needed pull the full
     blob." Full resolution is still tried first and is still what gets sent
     when it exists — a 240px preview reads a label worse than a 1600px
     photograph does — but where neither the local blob nor the record copy
     exists (an offline capture that was never uploaded, say), the thumbnail
     that rides inside the synced record is always there, and a caption
     drafted off it beats no caption and an error at all. */
  async function describe() {
    if (!onUpdate) return;
    setBusy(true);
    setError(null);
    try {
      let blob: Blob;
      try {
        blob = await fullPhotoBlob(a, entityCode, visitId);
      } catch (e) {
        if (!a.thumbDataUrl) throw e;
        blob = await (await fetch(a.thumbDataUrl)).blob();
      }
      const raw = await assist("caption", captionContext(a), vision ? [blob] : []);
      const parsed = parseCaption(raw);
      if (!parsed) throw new Error("The assistant did not answer in the expected shape.");
      onUpdate({
        caption: parsed.caption,
        captionSource: "assistant",
      });
      if (!parsed.legible && parsed.note) setError(`Not fully legible: ${parsed.note}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-[6px] rounded-[8px] border px-[9px] py-[7px]"
      style={{
        background: "var(--panel)",
        borderColor: uncaptioned ? "var(--warn-line)" : "var(--line-2)",
      }}
    >
      {/* Wrapping, with the caption claiming a real minimum width. Unwrapped,
          the thumbnail and the two buttons took the row and left the caption
          about 110px on an iPad in landscape — which is the device this is for.
          A caption field nobody can read while typing gets short captions. */}
      <div className="flex flex-wrap items-start gap-2">
        {dead ? (
          <span
            className="flex shrink-0 items-center justify-center rounded-[8px] border text-[8px]"
            style={{ width: size, height: size, background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-4)" }}
            title="No image stored — this record predates real capture."
          >
            none
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Open ${a.name}`}
            className="shrink-0 rounded-[8px] border"
            style={{ borderColor: "var(--line-2)", padding: 0, lineHeight: 0 }}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.thumbDataUrl ?? src}
                alt={caption || a.name}
                className="rounded-[8px] object-cover"
                style={{ width: size, height: size }}
              />
            ) : (
              <span className="block rounded-[8px]" style={{ width: size, height: size, background: "var(--sunken)" }} />
            )}
          </button>
        )}

        <span className="flex min-w-[200px] flex-1 basis-[240px] flex-col gap-[4px]">
          {onUpdate ? (
            <input
              value={caption}
              onChange={(e) =>
                /* Typing over a proposal makes it the auditor's words again. */
                onUpdate({ caption: e.target.value, captionSource: "auditor" })
              }
              placeholder="What does this photograph show?"
              aria-label={`Caption for ${a.name}`}
              className="w-full rounded-[8px] border px-[8px] py-[6px] text-[11.5px] outline-none"
              style={{
                background: uncaptioned ? "var(--warn-bg)" : "var(--sunken)",
                borderColor: uncaptioned ? "var(--warn-line)" : "var(--line-2)",
              }}
            />
          ) : (
            <span className="text-[11.5px]" style={{ color: caption ? "var(--ink-1)" : "var(--warn)" }}>
              {caption || "No caption"}
            </span>
          )}

          {/* ASSET AND LOCATION CAPTURE REMOVED FROM THE PHOTO LEVEL, 13
              October 2026 — Sarel: "remove asset and location capture
              options on the photo level." The fields themselves
              (Attachment.location/assetName/assetRef) are untouched, and a
              value already recorded on a photograph still reads out here —
              there is just no longer a way to open or edit them from a
              photo's own row. Location capture at the point of a walk item
              is a separate thing (see field/page.tsx's own LocationOptions
              use) and is unaffected. */}
          {a.kind === "photo" && !dead && (a.location || a.assetName || a.assetRef) ? (
            <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
              {[a.location, a.assetName, a.assetRef].filter(Boolean).join(" · ")}
            </span>
          ) : null}

          {/* THE FILENAME/DATE/SIZE/SYNC-STATUS LINE THAT USED TO SIT HERE IS
              GONE — Sarel: "remove the text next to the image... this adds no
              value." Covered every photo on every screen this row renders on
              (Capture, Review, Findings, Inspection, Asset Assurance). Normal
              sync status ("in the record store"/"on this device only") is
              still visible in aggregate from AppShell's own banner and
              SharedPanel's counts, rather than repeated per photo.

              A FAILED UPLOAD IS THE ONE THING STILL SHOWN HERE, THOUGH — this
              is not decorative metadata, it is the one actionable thing an
              auditor standing at the asset can still do something about, and
              it was deliberately put where there is no hover to find it on
              (see the comment this used to carry): "An upload failure a
              person cannot read is an upload failure nobody can fix." */}
          {recordStore && !dead && a.cloudError && (
            <span
              role="alert"
              className="block w-full max-w-full whitespace-pre-wrap font-mono text-[9px]"
              style={{ color: "var(--bad)" }}
            >
              not sent — {a.cloudError}
            </span>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-[5px]">
          {!hideDescribe && aiOn && onUpdate && !dead && (
            <button
              type="button"
              onClick={describe}
              disabled={busy}
              className={MINI}
              style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
              title={
                vision
                  ? "Sends this photograph to the assistant and proposes a caption. You edit it."
                  : "Proposes a caption from the check's own text. The image itself is not sent."
              }
            >
              <IconSpark width={12} height={12} />
              {busy ? "Looking…" : "Describe"}
            </button>
          )}
          {onAddVoice && !dead && <VoiceNoteButton inline onCaptured={onAddVoice} />}
          {onMove && !dead && (
            <button
              type="button"
              onClick={onMove}
              className={MINI}
              style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
              title="This photograph is in the wrong place — re-link it to a different check-point"
            >
              <IconEdit width={12} height={12} />
              Move
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${a.name}`}
              className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] border"
              style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
            >
              <IconX width={12} height={12} />
            </button>
          )}
        </span>
      </div>

      {voiceNotes && voiceNotes.length > 0 && (
        <div
          className="ml-[2px] flex flex-col gap-[6px] border-l-2 pl-[9px]"
          style={{ borderColor: "var(--line-2)" }}
        >
          <span className="label-xs" style={{ color: "var(--ink-4)" }}>
            Note for this photo
          </span>
          {voiceNotes.map((v) => (
            <VoiceRow
              key={v.id}
              a={v}
              onRemove={onRemoveVoiceNote ? () => onRemoveVoiceNote(v.id) : undefined}
              onUpdate={onUpdateVoiceNote ? (patch) => onUpdateVoiceNote(v.id, patch) : undefined}
              writeUp={writeUpVoiceNote}
              /* "Use it, word for word" on a note tied to THIS photo fills
                 the photo's own caption, not the finding/check's field —
                 the whole point of a photo-specific note being distinct
                 from a general one. Suppressed entirely where the caller
                 already applies a transcript to the caption itself the
                 moment it arrives (hideVoiceAccept) — Sarel: "it should
                 just auto populate the correct text box and not rely on
                 the user to click... to copy to the notes." */
              onAccept={
                onUpdate && !hideVoiceAccept
                  ? (text) => onUpdate({ caption: caption ? `${caption}\n${text}` : text, captionSource: "auditor" })
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {error && (
        <span className="text-[10.5px]" style={{ color: "var(--bad)" }}>
          {error}
        </span>
      )}

      {open && src && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-6"
          style={{ background: "rgba(16,10,32,.72)" }}
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption || a.name}
            className="max-h-full max-w-full rounded-[11px]"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/** One attached file: name, size, and a way to open it. No thumbnail and no
 *  caption — unlike a photograph this is not evidence TPJV wrote up, it is
 *  ACSA's own document handed over on site (or a spreadsheet, a certificate,
 *  whatever an auditor picked), so the file's own name is the record of
 *  what it is. */
function FileRow({
  a,
  onRemove,
  onUpdate,
}: {
  a: Attachment;
  onRemove?: () => void;
  /** A plain typed description, same `caption` field a photograph carries —
   *  not an AI-proposed one, there is nothing here to send a model. Omit it
   *  and the description is read-only, same convention as every other row. */
  onUpdate?: (patch: Partial<Attachment>) => void;
}) {
  const { url, missing } = useBlobUrl(a.blobKey);
  const dead = a.unavailable || (missing && !a.dataUrl);
  const caption = a.caption ?? "";

  return (
    <div
      className="flex flex-col gap-[6px] rounded-[8px] border px-[9px] py-[7px]"
      style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
    >
      <div className="flex items-center gap-[9px]">
        <span
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px]"
          style={{ background: "var(--sunken)", color: "var(--ink-3)" }}
        >
          <IconPaperclip width={15} height={15} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[11.5px] font-semibold" style={{ color: "var(--ink-1)" }} title={a.name}>
            {a.name}
          </span>
          <span className="flex flex-wrap items-center gap-[6px] font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {dead ? (
              <span className="line-through">no longer stored on this device</span>
            ) : (
              <>
                {a.bytes ? <span>{formatBytes(a.bytes)}</span> : null}
                {a.mimeType && <span>{a.mimeType}</span>}
                {a.takenAt && <span>added {new Date(a.takenAt).toLocaleString("en-ZA")}</span>}
              </>
            )}
          </span>
        </span>
        {!dead && url && (
          <a
            href={url}
            download={a.name}
            aria-label={`Open ${a.name}`}
            title="Open or save this file"
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] border"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
          >
            <IconDownload width={13} height={13} />
          </a>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${a.name}`}
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] border"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
          >
            <IconX width={12} height={12} />
          </button>
        )}
      </div>
      {!dead && onUpdate && (
        <input
          value={caption}
          onChange={(e) => onUpdate({ caption: e.target.value })}
          aria-label={`Description of ${a.name}`}
          placeholder="What this file is"
          className="w-full rounded-[8px] border px-[9px] py-[5px] text-[11px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-1)" }}
        />
      )}
    </div>
  );
}

export function AttachmentStrip({
  attachments,
  onRemove,
  onUpdate,
  onMove,
  writeUp,
  onAccept,
  thumbSize = 44,
  hideDescribe = false,
  onAddVoice,
  hideVoiceAccept = false,
}: {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
  /** Persist a change to one note — a transcript coming back, a rewrite being
   *  produced or discarded. Omit it and a note is read-only. */
  onUpdate?: (id: string, patch: Partial<Attachment>) => void;
  /** Re-link a PHOTOGRAPH to a different check — Sarel, on the Review screen:
   *  "some photos might not be linked to the correct asset system or to the
   *  correct audit check... we must have a function there where we can
   *  change the asset type and/or audit question that it is linked to."
   *  Omit it and no "Move" button is offered — the caller decides whether
   *  re-linking makes sense on its screen (it does on Review, where photos
   *  from every check sit side by side for comparison; it would be a
   *  confusing thing to offer on, say, an ad-hoc walk item's own gallery,
   *  which has no checkId to move FROM in the first place). Voice notes and
   *  files are not offered this — the ask was specifically about photos. */
  onMove?: (id: string) => void;
  /** Turn a verbatim transcript into the written observation. Supplied by the
   *  caller because only the caller knows which check the note belongs to;
   *  omit it and the rewrite step is not offered. */
  writeUp?: (transcript: string) => Promise<string>;
  /** Put an accepted rewrite into the record. This component never does it. */
  onAccept?: (text: string) => void;
  thumbSize?: number;
  /** Hides the "Describe" (AI auto-caption) button and its VisionNote
   *  banner on every photo in this strip — Sarel, on the Raise screen:
   *  "remove the describe button." A screen built around a manual,
   *  voice-first note (raise/page.tsx) has no use for an AI captioning
   *  step; every other screen that renders a strip keeps it, so this
   *  defaults to false. */
  hideDescribe?: boolean;
  /** Offers a "Voice note" button on each photo that records audio tied to
   *  THAT photo (Attachment.photoId) rather than to the finding/check as a
   *  whole — Sarel: "there should be a voice note button for the photo as
   *  well." Supplied by the caller because only it knows how to persist a
   *  newly captured attachment, same reasoning as onAccept; omit it and no
   *  per-photo recording control is offered. */
  onAddVoice?: (photoId: string, m: VoiceCapture) => void;
  /** Hides every "Use it, word for word" button in this strip — the
   *  finding-level one (by never rendering it: `onAccept` below only ever
   *  reaches VoiceRow when this is false) and each photo's own nested one.
   *  For a caller that already applies a transcript to its destination
   *  field itself, the moment it arrives, rather than waiting for this
   *  button — Sarel: "it should just auto populate the correct text box
   *  and not rely on the user to click... to copy to the notes." Leaving
   *  the button up after that point is dead, confusing UI: a tap on it
   *  either does nothing new or, for the finding-level field, re-appends
   *  text already there. */
  hideVoiceAccept?: boolean;
}) {
  const aiOn = useAssistAvailable();
  const photos = attachments.filter((a) => a.kind === "photo");
  /* VOICE NOTES SPLIT IN TWO: one tied to a particular photograph
     (a.photoId, set only by the per-photo "Voice note" button above)
     renders directly under that photograph instead of here, so it is never
     ambiguous which one a note is about — Sarel: "make sure it's clear
     where note is captured, either for the finding or for the photo."
     Everything else — the normal case, unchanged from before photoId
     existed — is a note for the finding/check as a whole. */
  const voices = attachments.filter((a) => a.kind === "voice" && !a.photoId);
  const files = attachments.filter((a) => a.kind === "file");
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Stated on screen, once per strip rather than once per photograph —
          eight photographs used to mean the same sentence eight times. Whether
          a site photograph of a national key point leaves the device is the
          whole point of the ASSIST_VISION gate, so it is a line on the page and
          not a tooltip. */}
      {photos.length > 0 && aiOn && onUpdate && !hideDescribe && <VisionNote />}
      {photos.map((a) => (
        <PhotoRow
          key={a.id}
          a={a}
          compact={thumbSize < 44}
          onRemove={onRemove ? () => onRemove(a.id) : undefined}
          onUpdate={onUpdate ? (patch) => onUpdate(a.id, patch) : undefined}
          onMove={onMove ? () => onMove(a.id) : undefined}
          hideDescribe={hideDescribe}
          onAddVoice={onAddVoice ? (m) => onAddVoice(a.id, m) : undefined}
          voiceNotes={attachments.filter((v) => v.kind === "voice" && v.photoId === a.id)}
          onRemoveVoiceNote={onRemove}
          onUpdateVoiceNote={onUpdate}
          writeUpVoiceNote={writeUp}
          hideVoiceAccept={hideVoiceAccept}
        />
      ))}
      {voices.map((a) => (
        <VoiceRow
          key={a.id}
          a={a}
          onRemove={onRemove ? () => onRemove(a.id) : undefined}
          onUpdate={onUpdate ? (patch) => onUpdate(a.id, patch) : undefined}
          writeUp={writeUp}
          onAccept={hideVoiceAccept ? undefined : onAccept}
        />
      ))}
      {files.map((a) => (
        <FileRow
          key={a.id}
          a={a}
          onRemove={onRemove ? () => onRemove(a.id) : undefined}
          onUpdate={onUpdate ? (patch) => onUpdate(a.id, patch) : undefined}
        />
      ))}
    </div>
  );
}

/** Drop a blob that was written but never attached — used when a capture is
 *  discarded from the field tray before it is assigned to a check. */
export async function forgetMedia(blobKey: string | undefined) {
  if (blobKey) await delBlob(blobKey);
}
