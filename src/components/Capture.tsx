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
  putBlob,
  supportsRecording,
  useBlobUrl,
  useDictation,
  useRecorder,
} from "@/lib/media";
import { CURRENT_ENTITY } from "@/lib/programme";
import type { Attachment } from "@/lib/types";
import { IconCamera, IconMic, IconX } from "./ui/icons";
import { Pill } from "./ui/primitives";

const uid = () => Math.random().toString(36).slice(2, 10);

export interface CapturedMedia {
  kind: "photo" | "voice";
  name: string;
  blobKey: string;
  mimeType: string;
  durationSec?: number;
  transcript?: string;
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
  const [busy, setBusy] = useState(false);
  const supported = supportsRecording();

  const recording = rec.state === "recording";

  async function toggle() {
    if (busy) return;
    if (!recording) {
      setBusy(true);
      const ok = await rec.start();
      /* Dictation rides along with the recording but is never required by it:
         if the engine refuses, the audio still records. */
      if (ok && dict.supported) dict.start();
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
        name: `${CURRENT_ENTITY.code}-voice-${new Date()
          .toISOString()
          .slice(11, 19)
          .replace(/:/g, "")}.${extensionFor(result.mimeType)}`,
        blobKey,
        mimeType: result.mimeType,
        durationSec: result.durationSec,
        /* Only what the engine actually heard. Empty is a correct answer. */
        transcript: dict.transcript.trim() || undefined,
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
      {recording && dict.supported && dict.transcript && (
        <span
          className="max-w-[280px] truncate text-[10.5px] italic"
          style={{ color: "var(--ink-3)" }}
          title={dict.transcript}
        >
          {dict.transcript}
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
            name: file.name || `${CURRENT_ENTITY.code}-photo.${extensionFor(file.type)}`,
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

function VoiceRow({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const { url, missing } = useBlobUrl(a.blobKey);
  const src = url ?? a.dataUrl ?? null;
  const dead = a.unavailable || (missing && !a.dataUrl);

  return (
    <div
      className="flex items-center gap-2 rounded-[9px] border px-[9px] py-[7px]"
      style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
    >
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
      {a.transcript && (
        <span
          className="max-w-[260px] truncate text-[10.5px] italic"
          style={{ color: "var(--ink-3)" }}
          title={a.transcript}
        >
          “{a.transcript}”
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this voice note"
          className="ml-auto flex h-[28px] w-[28px] items-center justify-center rounded-[7px] border"
          style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
        >
          <IconX width={12} height={12} />
        </button>
      )}
    </div>
  );
}

export function AttachmentStrip({
  attachments,
  onRemove,
  thumbSize = 44,
}: {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
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
        <VoiceRow key={a.id} a={a} onRemove={onRemove ? () => onRemove(a.id) : undefined} />
      ))}
    </div>
  );
}

/** Drop a blob that was written but never attached — used when a capture is
 *  discarded from the field tray before it is assigned to a check. */
export async function forgetMedia(blobKey: string | undefined) {
  if (blobKey) await delBlob(blobKey);
}
