"use client";

/** "What hazard is this?" — the event a finding exposes, proposed early.
 *
 *  An audit that rates its findings ends up with a risk profile made of
 *  paperwork: "register not signed" scored as though the register were the
 *  danger. What gets rated is the event the missing control was protecting
 *  against, and naming that event is a judgement the auditor makes while still
 *  standing in front of the asset.
 *
 *  So this sits on the check screen, next to the issue chips, and writes to
 *  `Finding.suggestedEvent`. Consolidation later starts from something a person
 *  wrote rather than from nothing.
 *
 *  Nothing is applied. The button proposes; a tap accepts one; the field stays
 *  editable afterwards. Same rule as every other AI affordance here. */

import { useState } from "react";
import {
  assist,
  hazardContext,
  parseHazards,
  useAssistAvailable,
  useVisionOn,
  type HazardProposal,
} from "@/lib/assist";
import { getBlob } from "@/lib/media";
import type { Attachment, Check, Finding } from "@/lib/types";
import { IconSpark } from "@/components/ui/icons";

const CONF_TONE: Record<HazardProposal["confidence"], string> = {
  high: "var(--good)",
  medium: "var(--warn)",
  low: "var(--ink-4)",
};

export default function HazardAdvice({
  finding,
  check,
  attachments = [],
  onAccept,
}: {
  finding: Finding;
  check?: Check;
  attachments?: Attachment[];
  /** Stores the event on the finding. The only thing this component changes. */
  onAccept: (event: string) => void;
}) {
  const aiOn = useAssistAvailable();
  const vision = useVisionOn();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<HazardProposal[] | null>(null);

  if (!aiOn) return null;

  const photos = attachments.filter((a) => a.kind === "photo" && a.blobKey && !a.unavailable);
  const captions = photos.map((a) => a.caption?.trim()).filter(Boolean) as string[];

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const blobs = vision
        ? ((await Promise.all(photos.slice(0, 8).map((a) => getBlob(a.blobKey!)))).filter(
            Boolean
          ) as Blob[])
        : [];
      const parsed = parseHazards(
        await assist("hazard", hazardContext(finding, check, captions), blobs)
      );
      if (!parsed.length) throw new Error("Nothing usable came back — no event was named.");
      setProposals(parsed);
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
          title="Proposes the event this finding exposes. The rating goes on the event, not the paperwork. Advisory — you decide."
        >
          <IconSpark width={12} height={12} />
          {busy ? "Thinking…" : proposals ? "Ask again" : "What hazard is this?"}
        </button>
        {finding.suggestedEvent && (
          <span className="text-[9.5px]" style={{ color: "var(--ink-4)" }}>
            Currently: {finding.suggestedEvent}
          </span>
        )}
        {photos.length > 0 && !finding.suggestedEvent && (
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

      {proposals?.map((h, i) => (
        <div
          key={`${h.event}-${i}`}
          className="flex flex-col gap-[5px] rounded-[9px] border px-[9px] py-[8px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
        >
          <div className="flex flex-wrap items-center gap-[7px]">
            <button
              type="button"
              onClick={() => onAccept(h.event)}
              className="inline-flex h-[28px] items-center rounded-[8px] border px-[10px] text-left text-[11px] font-semibold"
              style={{ background: "var(--panel)", borderColor: "var(--acc)", color: "var(--acc)" }}
            >
              {h.event}
            </button>
            <span
              className="font-mono text-[9px] tracking-[.04em] uppercase"
              style={{ color: CONF_TONE[h.confidence] }}
            >
              {h.confidence} confidence
            </span>
          </div>
          {h.description && (
            <span className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
              {h.description}
            </span>
          )}
          {h.why && (
            <span className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
              <b>What it exposes:</b> {h.why}
            </span>
          )}
        </div>
      ))}

      {proposals && (
        <span className="text-[9.5px]" style={{ color: "var(--ink-4)" }}>
          Proposals, unrated. Tapping one records the event on this finding; severity and
          likelihood stay the audit team&rsquo;s to agree on the matrix.
        </span>
      )}
    </div>
  );
}
