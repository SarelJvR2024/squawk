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

import { useRef, useState } from "react";
import {
  delBlob,
  extensionFor,
  formatDuration,
  getBlob,
  putBlob,
  supportsRecording,
  useBlobUrl,
  useIsClient,
  useDictation,
  useRecorder,
} from "@/lib/media";
import { transcribe, useTranscribeAvailable } from "@/lib/assist";
import { useDictationEnabled, useEntityCode } from "@/lib/store";
import type { Attachment } from "@/lib/types";
import { IconCamera, IconMic, IconSpark, IconX } from "./ui/icons";
import { Pill } from "./ui/primitives";

const uid = () => Math.random().toString(36).slice(2, 10);

export interface CapturedMedia {
  kind: "photo" | "voice";
  name: string;
  blobKey: string;
  mimeType: string;
  durationSec?: number;
  transcript?: string;
  transcriptSource?: "browser" | "service";
}

const TAP =
  "inline-flex h-[44px] items-center justify-center gap-[7px] rounded-[11px] border px-[13px] text-[12px] font-semibold transition-[var(--t)] active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed";

/* ---------- voice ---------- */

export function VoiceNoteButton({
  onCaptured,
  compact = false,
}: {
  onCaptured: (m: CapturedMedia) => void;
  compact?: boolean;
}) {
  const rec = useRecorder();
  const dict = useDictation();
  const entityCode = useEntityCode();
  /* Opt-in, and read here rather than inside useDictation so the hook stays a
     plain wrapper over the browser API and the consent decision lives in one
     visible place. */
  const dictationOn = useDictationEnabled();
  const [busy, setBusy] = useState(false);
  /* Assume the control is available until the client can actually check.
     The server cannot know, and guessing "unavailable" would both mismatch on
     hydration and flash a disabled button at an auditor who has a microphone. */
  const isClient = useIsClient();
  const supported = !isClient || supportsRecording();

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
    const result = await rec.stop();
    if (result) {
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
        transcript: (dictationOn && dict.transcript.trim()) || undefined,
        transcriptSource:
          dictationOn && dict.transcript.trim() ? "browser" : undefined,
      });
    }
    dict.reset();
    setBusy(false);
  }

  if (!supported) {
    return (
      <span
        className={TAP}
        style={{
          background: "var(--sunken)",
          borderColor: "var(--line-2)",
          color: "var(--ink-4)",
        }}
        title="This browser cannot record audio. Type the observation instead."
      >
        <IconMic width={15} height={15} />
        {compact ? null : "Voice unavailable"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || rec.state === "requesting"}
        aria-label={recording ? "Stop recording" : "Record a voice note"}
        className={TAP}
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
        <IconMic width={15} height={15} />
        {rec.state === "requesting"
          ? "Allow microphone…"
          : recording
            ? `Stop · ${formatDuration(rec.elapsed)}`
            : compact
              ? null
              : "Voice note"}
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
          className={TAP}
          style={{
            background: "var(--panel)",
            borderColor: "var(--line-2)",
            color: "var(--ink-3)",
          }}
        >
          <IconX width={14} height={14} />
        </button>
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
}: {
  onCaptured: (m: CapturedMedia) => void;
  compact?: boolean;
  label?: string;
  primary?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const entityCode = useEntityCode();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          /* Let the same photograph be taken twice in a row — without this the
             input holds the previous value and fires nothing. */
          e.target.value = "";
          if (!file) return;
          const blobKey = `photo-${uid()}`;
          await putBlob(blobKey, file);
          onCaptured({
            kind: "photo",
            name: file.name || `${entityCode}-photo.${extensionFor(file.type)}`,
            blobKey,
            mimeType: file.type || "image/jpeg",
          });
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={label ?? "Take a photograph"}
        className={`${TAP} ${className}`}
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
        <IconCamera width={15} height={15} />
        {compact ? null : (label ?? "Photo")}
      </button>
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
        className="flex shrink-0 items-center justify-center rounded-[7px] border text-[8px]"
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
        className="shrink-0 rounded-[7px] border"
        style={{ width: size, height: size, background: "var(--sunken)", borderColor: "var(--line-2)" }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={a.name}
      className="shrink-0 rounded-[7px] border object-cover"
      style={{ width: size, height: size, borderColor: "var(--line-2)" }}
    />
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
      className="flex flex-col gap-[7px] rounded-[9px] border px-[9px] py-[7px]"
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
        {!dead && <Pill tone="accent">{formatDuration(a.durationSec)}</Pill>}

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
            className="ml-auto flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] border"
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
        <div className="flex flex-col gap-[2px]">
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
          <span className="text-[11px] italic" style={{ color: "var(--ink-3)" }}>
            “{a.transcript}”
          </span>
        </div>
      )}

      {a.revised && (
        <div
          className="flex flex-col gap-[5px] rounded-[7px] border px-[8px] py-[6px]"
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
                Use it
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

export function AttachmentStrip({
  attachments,
  onRemove,
  onUpdate,
  writeUp,
  onAccept,
  thumbSize = 44,
}: {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
  /** Persist a change to one note — a transcript coming back, a rewrite being
   *  produced or discarded. Omit it and a note is read-only. */
  onUpdate?: (id: string, patch: Partial<Attachment>) => void;
  /** Turn a verbatim transcript into the written observation. Supplied by the
   *  caller because only the caller knows which check the note belongs to;
   *  omit it and the rewrite step is not offered. */
  writeUp?: (transcript: string) => Promise<string>;
  /** Put an accepted rewrite into the record. This component never does it. */
  onAccept?: (text: string) => void;
  thumbSize?: number;
}) {
  const photos = attachments.filter((a) => a.kind === "photo");
  const voices = attachments.filter((a) => a.kind === "voice");
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {photos.length > 0 && (
        <div className="no-scrollbar flex gap-[6px] overflow-x-auto">
          {photos.map((a) => (
            <span key={a.id} className="relative shrink-0">
              <PhotoThumb a={a} size={thumbSize} />
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(a.id)}
                  aria-label={`Remove ${a.name}`}
                  className="absolute -top-[5px] -right-[5px] flex h-[18px] w-[18px] items-center justify-center rounded-full border"
                  style={{
                    background: "var(--panel)",
                    borderColor: "var(--line-2)",
                    color: "var(--ink-3)",
                  }}
                >
                  <IconX width={9} height={9} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {voices.map((a) => (
        <VoiceRow
          key={a.id}
          a={a}
          onRemove={onRemove ? () => onRemove(a.id) : undefined}
          onUpdate={onUpdate ? (patch) => onUpdate(a.id, patch) : undefined}
          writeUp={writeUp}
          onAccept={onAccept}
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
