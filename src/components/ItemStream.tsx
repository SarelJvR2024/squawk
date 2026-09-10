"use client";

/** EVERYTHING THAT HAPPENED TO ONE CARRIED FINDING, IN ONE COLUMN.
 *
 *  Sarel, on the Follow-up screen: "on the right panel we show the details of
 *  the finding and the timeline of all the comments and updates — when it was
 *  logged, when evidence was uploaded, when comments was added, when visual
 *  inspections was added, when next audits reviewed it and confirmed the
 *  compliance or non compliance. In some cases it might be opened then next
 *  audit closed and then opened again the next audit, we want to see that
 *  history."
 *
 *  It replaces ItemTimeline, which showed one row per audit assembled from the
 *  verification alone. That was the right idea at the wrong grain: a row per
 *  audit cannot say that the photograph came three weeks after the outcome, or
 *  that two updates were logged by different people, and it had nowhere to put
 *  a photograph or a voice note at all. The record already held every one of
 *  those facts — see streamFor() in src/lib/carryforward.ts, which does the
 *  reading. This only draws it.
 *
 *  THE OPEN → CLOSED → OPEN SEQUENCE is the thing the component exists for, and
 *  it is carried in WORDS on every outcome entry ("Audit found it closed",
 *  "Audit found it still open — a repeat"), never by the colour of a dot. The
 *  colour is a second reading of something written, so the sequence survives a
 *  greyscale printout, direct sun on an apron, and a colour-blind reader.
 *
 *  PRECISION IS NEVER INVENTED. Entries the record dates only to an audit —
 *  the 2025 register carries a date but no time, a verification saved before
 *  stamping existed carries neither — are marked as belonging to the audit
 *  rather than shown to the minute. A timeline that displays a time it does not
 *  have is lying about how much it knows. */

import type { StreamEntry, StreamKind } from "@/lib/carryforward";
import {
  IconCamera,
  IconCheck,
  IconClipboard,
  IconClock,
  IconFlag,
  IconMic,
  IconPlus,
} from "@/components/ui/icons";

/** What each kind of entry looks like. The WORD comes off the entry itself —
 *  streamFor() writes it — so this map decides only the glyph and the tone, and
 *  a kind added there without a row here still renders, plainly. */
const LOOK: Record<StreamKind, { Icon: typeof IconCheck; tone: string }> = {
  raised: { Icon: IconFlag, tone: "var(--acc)" },
  outcome: { Icon: IconCheck, tone: "var(--acc)" },
  evidence: { Icon: IconClipboard, tone: "var(--good)" },
  action: { Icon: IconClock, tone: "var(--warn)" },
  next: { Icon: IconClock, tone: "var(--warn)" },
  photo: { Icon: IconCamera, tone: "var(--acc)" },
  voice: { Icon: IconMic, tone: "var(--acc)" },
  note: { Icon: IconPlus, tone: "var(--ink-3)" },
  event: { Icon: IconFlag, tone: "var(--warn)" },
  check: { Icon: IconClipboard, tone: "var(--ink-3)" },
};

const stamp = (e: StreamEntry) =>
  e.dated === "exact"
    ? new Date(e.at).toLocaleString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : /* No time in the record, so none is shown. The audit is the precision we
         actually have. */
      `${e.visitLabel} · date not recorded`;

export default function ItemStream({ entries }: { entries: StreamEntry[] }) {
  return (
    <div className="mt-4">
      <div className="label-xs mb-2" style={{ color: "var(--ink-4)" }}>
        History · everything recorded against this, oldest first
      </div>

      {entries.length === 0 ? (
        <div
          className="rounded-[11px] border px-3 py-2.5 text-[11.5px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line)", color: "var(--ink-3)" }}
        >
          {/* Not "no history" — there is a difference between a finding nobody
              has touched and a finding whose history was lost, and only one of
              those is true here. */}
          Nothing has been recorded against this yet. An outcome, a photograph or
          an update on this visit will be the first entry.
        </div>
      ) : (
        <ol className="relative m-0 list-none p-0">
          {/* The rail. Decorative: every entry states its kind, its audit and
              its time in text. */}
          <span
            aria-hidden
            className="absolute top-[10px] bottom-[10px] left-[9px] w-px"
            style={{ background: "var(--line)" }}
          />
          {entries.map((e, i) => {
            const look = LOOK[e.kind] ?? { Icon: IconPlus, tone: "var(--ink-3)" };
            /* The audit is repeated only when it CHANGES, so a run of six
               entries from one visit reads as one visit rather than as six
               labels. The first entry always states it. */
            const newRound = i === 0 || entries[i - 1].visit !== e.visit;
            return (
              <li key={`${e.at}-${e.kind}-${i}`} className="relative pb-3 pl-[26px]">
                <span
                  aria-hidden
                  className="absolute top-[2px] left-0 flex h-[19px] w-[19px] items-center justify-center rounded-full border"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: look.tone }}
                >
                  <look.Icon width={11} height={11} />
                </span>

                {newRound && (
                  <div
                    className="mb-[3px] font-mono text-[9px] tracking-[0.08em] uppercase"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {e.visitLabel}
                  </div>
                )}

                <div className="text-[12px] leading-[1.4] font-semibold">{e.label}</div>

                {e.detail && (
                  <div
                    className="mt-[2px] text-[12px] leading-[1.5] whitespace-pre-wrap"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {e.detail}
                  </div>
                )}

                <div
                  className="mt-[3px] flex flex-wrap items-center gap-x-2 font-mono text-[9px]"
                  style={{ color: "var(--ink-4)" }}
                >
                  <span>{stamp(e)}</span>
                  {e.by && <span>· {e.by}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
