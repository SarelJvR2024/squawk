"use client";

/** What happened to this item, at every audit.
 *
 *  The three-year cycle exists so an item can be followed across visits, and
 *  until this screen showed the history there was no way to do it. A
 *  verification has always been stored per visit, so a March 2025 finding gets
 *  its own record at September 2026 and another at March 2027 — the data was
 *  there from the start. But the closure screen read the CURRENT visit's record
 *  and nothing else, so an item that had been "Open - repeat" twice before
 *  closing looked exactly like one closed first time.
 *
 *  That difference is the whole point of following up. An item nobody could
 *  shift in two audits is a different conversation from one that went away
 *  quietly, and the second visit is where you decide to escalate.
 *
 *  Reads only. Recording happens on the panel this sits under. */

import type { HistoryEntry } from "@/lib/carryforward";
import type { VerificationOutcome } from "@/lib/types";

/* The four outcomes exactly as VerificationOutcome declares them. Typing a
   fifth by hand is how a status silently loses its colour and reads as
   "Not verified" — so this is keyed by the type, not by memory. */
const TONE: Record<VerificationOutcome, string> = {
  Closed: "good",
  "Partially closed": "warn",
  "Open - repeat": "bad",
  "Not verified": "ink-3",
};

const when = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function ItemTimeline({
  history,
  priorLabel,
  priorRating,
}: {
  history: HistoryEntry[];
  /** The audit that raised it, which is not in the history — nothing was
   *  verified there, it was found there. */
  priorLabel?: string;
  priorRating?: string | null;
}) {
  if (!history.length && !priorLabel) return null;

  return (
    <div className="mt-3">
      <div className="label-xs mb-1.5">History · every audit that touched this</div>
      <ol className="relative ml-[7px] border-l pl-[15px]" style={{ borderColor: "var(--line-2)" }}>
        {/* Where it started. Drawn differently because nothing was verified
            here — this is the visit that RAISED it. */}
        {priorLabel && (
          <li className="relative pb-3">
            <span
              className="absolute top-[4px] -left-[21px] h-[9px] w-[9px] rounded-full border-2"
              style={{ background: "var(--panel)", borderColor: "var(--ink-4)" }}
            />
            <div className="flex flex-wrap items-baseline gap-2">
              <b className="font-display text-[11.5px]">{priorLabel}</b>
              <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                raised
              </span>
              {priorRating && (
                <span
                  className="rounded-full px-[7px] py-[1px] font-mono text-[9px] font-semibold"
                  style={{ background: "var(--sunken)", color: "var(--ink-2)" }}
                >
                  {priorRating}
                </span>
              )}
            </div>
          </li>
        )}

        {history.map((h) => {
          const tone = h.outcome ? TONE[h.outcome] : "ink-3";
          return (
            <li key={h.visit} className="relative pb-3.5">
              <span
                className="absolute top-[4px] -left-[21px] h-[9px] w-[9px] rounded-full border-2"
                style={{
                  background: h.when === "current" ? `var(--${tone})` : "var(--panel)",
                  borderColor: `var(--${tone})`,
                }}
              />
              <div className="flex flex-wrap items-baseline gap-2">
                <b className="font-display text-[11.5px]">{h.label}</b>
                {h.outcome ? (
                  <span
                    className="rounded-full px-[7px] py-[1px] font-mono text-[9px] font-semibold"
                    style={{ background: `var(--${tone}-bg)`, color: `var(--${tone})` }}
                  >
                    {h.outcome.toUpperCase()}
                  </span>
                ) : (
                  <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    no outcome recorded
                  </span>
                )}
                {h.when === "current" && (
                  <span className="font-mono text-[9px]" style={{ color: "var(--acc)" }}>
                    this visit
                  </span>
                )}
                {h.verifiedAt && (
                  <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {when(h.verifiedAt)}
                    {h.verifiedBy ? ` · ${h.verifiedBy.split(" ")[0]}` : ""}
                  </span>
                )}
              </div>

              {h.evidence && (
                <div className="mt-[3px] text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                  {h.evidence}
                </div>
              )}
              {h.attachments > 0 && (
                <div className="mt-[2px] font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  {h.attachments} attachment{h.attachments === 1 ? "" : "s"}
                </div>
              )}
              {h.action && (
                <div
                  className="mt-[5px] rounded-[7px] border px-[8px] py-[5px] text-[11px] leading-[1.5]"
                  style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
                >
                  <span className="font-mono text-[8.5px] tracking-[.06em] uppercase">
                    Still to happen
                  </span>
                  <div>{h.action}</div>
                </div>
              )}

              {/* The dated log, in the order it was written. */}
              {h.progress.map((n, i) => (
                <div key={`${n.at}-${i}`} className="mt-[5px] flex gap-2 text-[11px] leading-[1.5]">
                  <span
                    className="shrink-0 font-mono text-[9px]"
                    style={{ color: "var(--ink-4)" }}
                    title={new Date(n.at).toLocaleString("en-ZA")}
                  >
                    {when(n.at)}
                  </span>
                  <span style={{ color: "var(--ink-2)" }}>
                    {n.note}
                    <span className="ml-1.5 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                      {n.by.split(" ")[0]}
                      {n.outcome ? ` · ${n.outcome}` : ""}
                    </span>
                  </span>
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
