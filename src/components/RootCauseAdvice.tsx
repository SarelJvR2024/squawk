"use client";

/** Candidate root causes, and — the point of the whole thing — the question to
 *  ask instead.
 *
 *  A root cause is something the responsible person knows and the auditor does
 *  not. An assistant that reads a finding and announces "Maintenance backlog"
 *  has guessed; what it can genuinely do is sharpen the question that would
 *  settle it. So `askInstead` is rendered at least as prominently as the cause
 *  itself, and a candidate with a good question and low confidence is worth
 *  more here than a confident one with none.
 *
 *  Nothing is applied. Tapping a cause sets the chip; the questions are for the
 *  auditor to use in the room and are never written into the record.
 *
 *  One component, used from the check screen and the findings screen, following
 *  the pattern the rating UI already set: the same advice written twice drifts
 *  apart, and the version nobody is looking at is the one that goes wrong. */

import { useState } from "react";
import {
  assist,
  parseRootCauses,
  rootCauseContext,
  useAssistAvailable,
  useVisionOn,
  type AdviceSubject,
  type RootCauseCandidate,
} from "@/lib/assist";
import { ROOT_CAUSES } from "@/lib/store";
import { getBlob } from "@/lib/media";
import type { Attachment, Check } from "@/lib/types";
import { IconSpark } from "@/components/ui/icons";

const CONF_TONE: Record<RootCauseCandidate["confidence"], string> = {
  high: "var(--good)",
  medium: "var(--warn)",
  low: "var(--ink-4)",
};

export default function RootCauseAdvice({
  finding,
  check,
  attachments = [],
  onPick,
}: {
  /** A finding, or a hazard wearing the same four fields. */
  finding: AdviceSubject;
  check?: Check;
  /** The photographs on the check this finding came from, if any. */
  attachments?: Attachment[];
  /** Sets the root-cause chip. The only thing this component can change. */
  onPick: (cause: string) => void;
}) {
  const aiOn = useAssistAvailable();
  const vision = useVisionOn();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RootCauseCandidate[] | null>(null);

  if (!aiOn) return null;

  const photos = attachments.filter((a) => a.kind === "photo" && a.blobKey && !a.unavailable);
  const captions = photos.map((a) => a.caption?.trim()).filter(Boolean) as string[];

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      /* Vision sends the images; without it the captions carry the visual
         evidence, which is exactly why an uncaptioned photograph is treated as
         incomplete elsewhere. */
      const blobs = vision
        ? ((await Promise.all(photos.slice(0, 8).map((a) => getBlob(a.blobKey!)))).filter(
            Boolean
          ) as Blob[])
        : [];
      const raw = await assist(
        "rootcause",
        rootCauseContext(finding, ROOT_CAUSES, check, captions),
        blobs
      );
      const parsed = parseRootCauses(raw, ROOT_CAUSES);
      if (!parsed.length) {
        throw new Error("No candidate came back in the register's own vocabulary.");
      }
      setCandidates(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-[7px] flex flex-col gap-[7px]">
      <div className="flex flex-wrap items-center gap-[7px]">
        <button
          type="button"
          onClick={suggest}
          disabled={busy}
          className="inline-flex h-[30px] items-center gap-[5px] rounded-[8px] border px-[9px] text-[10.5px] font-semibold transition-[var(--t)] disabled:opacity-50"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          title="Proposes candidate causes and, more usefully, the questions that would settle them. Advisory — you decide."
        >
          <IconSpark width={12} height={12} />
          {busy ? "Thinking…" : candidates ? "Suggest again" : "Suggest root causes"}
        </button>
        {photos.length > 0 && (
          <span className="text-[9.5px]" style={{ color: "var(--ink-4)" }}>
            {vision
              ? `Photographs are sent to the assistant for this step (${Math.min(photos.length, 8)}).`
              : "Photograph captions are sent; the images themselves are not."}
          </span>
        )}
      </div>

      {error && (
        <span className="text-[10.5px]" style={{ color: "var(--bad)" }}>
          {error}
        </span>
      )}

      {candidates?.map((c, i) => (
        <div
          key={`${c.cause}-${i}`}
          className="flex flex-col gap-[5px] rounded-[9px] border px-[9px] py-[8px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
        >
          <div className="flex flex-wrap items-center gap-[7px]">
            <button
              type="button"
              onClick={() => onPick(c.cause)}
              className="inline-flex h-[28px] items-center rounded-[8px] border px-[10px] text-[11px] font-semibold"
              style={{ background: "var(--panel)", borderColor: "var(--acc)", color: "var(--acc)" }}
            >
              {c.cause}
            </button>
            <span
              className="font-mono text-[9px] tracking-[.04em] uppercase"
              style={{ color: CONF_TONE[c.confidence] }}
            >
              {c.confidence} confidence
            </span>
          </div>

          {c.reasoning && (
            <span className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
              {c.reasoning}
            </span>
          )}

          {/* The question is the deliverable. It is styled to be read first
              even though it sits second, because the cause is a guess and the
              question is the thing an auditor can actually use in the room. */}
          {c.askInstead && (
            <div
              className="rounded-[7px] border px-[8px] py-[6px]"
              style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)" }}
            >
              <div
                className="mb-[2px] font-mono text-[8.5px] tracking-[.06em] uppercase"
                style={{ color: "var(--warn)" }}
              >
                Ask instead
              </div>
              <div className="text-[11.5px] leading-[1.5]" style={{ color: "var(--warn)" }}>
                {c.askInstead}
              </div>
            </div>
          )}
        </div>
      ))}

      {candidates && (
        <span className="text-[9.5px]" style={{ color: "var(--ink-4)" }}>
          Proposals. Tapping a cause sets the chip; the questions are yours to put to
          the responsible person and are not recorded.
        </span>
      )}
    </div>
  );
}
