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
import { useDictationEnabled, useEntityCode } from "@/lib/store";
import { useRecordStore } from "@/lib/sync";
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
  thumbDataUrl?: string;
  width?: number;
  height?: number;
  bytes?: number;
  takenAt?: number;
  caption?: string;
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
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          /* Let the same photograph be taken twice in a row — without this the
             input holds the previous value and fires nothing. */
          e.target.value = "";
          for (const file of files) {
            /* Downscaled and re-encoded before it is stored. A phone photo is
               4-12 MB as taken; twenty of those fill the tablet's quota and the
               audit stops mid-morning. See preparePhoto in src/lib/media.ts. */
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
          }
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
function PhotoRow({
  a,
  onRemove,
  onUpdate,
  compact = false,
}: {
  a: Attachment;
  onRemove?: () => void;
  onUpdate?: (patch: Partial<Attachment>) => void;
  compact?: boolean;
}) {
  const { url, missing } = useBlobUrl(a.blobKey);
  const src = url ?? a.thumbDataUrl ?? a.dataUrl ?? null;
  const dead = a.unavailable || (missing && !a.dataUrl && !a.thumbDataUrl);
  const aiOn = useAssistAvailable();
  const vision = useVisionOn();
  const recordStore = useRecordStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const caption = a.caption ?? "";
  const uncaptioned = !dead && !caption.trim();
  const size = compact ? 40 : 52;

  async function describe() {
    if (!a.blobKey || !onUpdate) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await getBlob(a.blobKey);
      if (!blob) throw new Error("The image for this photograph is no longer stored.");
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
      className="flex flex-col gap-[6px] rounded-[9px] border px-[9px] py-[7px]"
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
            className="flex shrink-0 items-center justify-center rounded-[7px] border text-[8px]"
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
            className="shrink-0 rounded-[7px] border"
            style={{ borderColor: "var(--line-2)", padding: 0, lineHeight: 0 }}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.thumbDataUrl ?? src}
                alt={caption || a.name}
                className="rounded-[6px] object-cover"
                style={{ width: size, height: size }}
              />
            ) : (
              <span className="block rounded-[6px]" style={{ width: size, height: size, background: "var(--sunken)" }} />
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
              className="w-full rounded-[7px] border px-[8px] py-[6px] text-[11.5px] outline-none"
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

          {/* WHICH asset, for a photograph. The caption says what is wrong;
              this says what it is wrong with, and that is the half a
              maintenance planner needs to raise a job card.

              Deliberately OPTIONAL and deliberately quiet — smaller, no warn
              border, no nag. Plenty of evidence has no single asset behind it
              (a trench, a housekeeping shot, a document on a desk), and a
              required field on those gets filled with something untrue. It
              stays visible rather than folded, because a field nobody can see
              is a field nobody fills, and it is one short row. */}
          {a.kind === "photo" && !dead && (onUpdate ? (
            <span className="flex flex-wrap gap-[5px]">
              <input
                value={a.assetName ?? ""}
                onChange={(e) => onUpdate({ assetName: e.target.value })}
                placeholder="Asset (optional)"
                aria-label={`Asset name for ${a.name}`}
                className="min-w-[110px] flex-1 basis-[140px] rounded-[6px] border px-[7px] py-[5px] text-[10.5px] outline-none"
                style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
              />
              <input
                value={a.assetRef ?? ""}
                onChange={(e) => onUpdate({ assetRef: e.target.value })}
                placeholder="No. / ref"
                aria-label={`Asset number or reference for ${a.name}`}
                className="w-[104px] shrink-0 rounded-[6px] border px-[7px] py-[5px] font-mono text-[10.5px] outline-none"
                style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
              />
            </span>
          ) : (a.assetName || a.assetRef) ? (
            <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
              {[a.assetName, a.assetRef].filter(Boolean).join(" · ")}
            </span>
          ) : null)}

          <span className="flex flex-wrap items-center gap-[6px] font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {/* Where this one actually is. "On this device only" is the honest
                state for most of an audit and is not an error — but an auditor
                is entitled to see it rather than assume a copy exists
                somewhere. */}
            {recordStore && !dead && (
              a.cloudUrl ? (
                <span style={{ color: "var(--good)" }} title={`Record copy stored ${a.cloudAt ? new Date(a.cloudAt).toLocaleString("en-ZA") : ""}`}>
                  in the record store
                </span>
              ) : a.cloudError ? (
                /* The WHOLE message, wrapped, on its own line.
                 *
                 *  This used to be 40 characters with the rest in a `title`
                 *  attribute. On the iPad this app is built for there is no
                 *  hover, so the part that says what to do — which store, which
                 *  token, create it Private — was unreachable on the only device
                 *  that matters. An upload failure a person cannot read is an
                 *  upload failure nobody can fix. */
                <span
                  role="alert"
                  className="block w-full max-w-full whitespace-pre-wrap"
                  style={{ color: "var(--bad)" }}
                >
                  not sent — {a.cloudError}
                </span>
              ) : (
                <span style={{ color: "var(--warn)" }}>on this device only</span>
              )
            )}
            {uncaptioned && (
              <span style={{ color: "var(--warn)" }}>Caption needed</span>
            )}
            {a.captionSource === "assistant" && caption && (
              <span title="Proposed by the assistant and accepted. Edit it to make it yours.">
                assistant caption
              </span>
            )}
            {a.ref && <span title="The name this photograph has in the export and the record store">{a.ref}</span>}
            {a.takenAt && <span>taken {new Date(a.takenAt).toLocaleString("en-ZA")}</span>}
            {a.width && a.height ? <span>{a.width}×{a.height}</span> : null}
            {a.bytes ? <span>{formatBytes(a.bytes)}</span> : null}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-[5px]">
          {aiOn && onUpdate && !dead && (
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
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${a.name}`}
              className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] border"
              style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
            >
              <IconX width={12} height={12} />
            </button>
          )}
        </span>
      </div>

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
            className="max-h-full max-w-full rounded-[12px]"
            onClick={(e) => e.stopPropagation()}
          />
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
  const aiOn = useAssistAvailable();
  const photos = attachments.filter((a) => a.kind === "photo");
  const voices = attachments.filter((a) => a.kind === "voice");
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Stated on screen, once per strip rather than once per photograph —
          eight photographs used to mean the same sentence eight times. Whether
          a site photograph of a national key point leaves the device is the
          whole point of the ASSIST_VISION gate, so it is a line on the page and
          not a tooltip. */}
      {photos.length > 0 && aiOn && onUpdate && <VisionNote />}
      {photos.map((a) => (
        <PhotoRow
          key={a.id}
          a={a}
          compact={thumbSize < 44}
          onRemove={onRemove ? () => onRemove(a.id) : undefined}
          onUpdate={onUpdate ? (patch) => onUpdate(a.id, patch) : undefined}
        />
      ))}
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
