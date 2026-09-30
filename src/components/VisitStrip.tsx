"use client";

import type { TimelineCell, TimelineState } from "@/lib/carryforward";

/** ONE CARRIED ITEM, ACROSS EVERY AUDIT, AS A SHAPE.
 *
 *  The argument for a strip rather than a sentence: **recurrence becomes a
 *  shape.** A row of unbroken solid-red cells is an item that keeps being
 *  checked and keeps still being open — the eye catches that before the brain
 *  reads anything. A row of unbroken carried cells is an item nobody has
 *  answered in three visits. No amount of prose does either.
 *
 *  "REPEAT" NEVER MEANS "WAS CLOSED, THEN REOPENED." Open - repeat is what
 *  this visit records when an item that was already open gets checked again
 *  and is STILL not fixed — it never closed in between. Once something is
 *  actually marked Closed it stops carrying (carriesWork/outstandingFor key
 *  on actionStatus !== "Closed") and cannot come back as the same carried
 *  item, so a cell can never legitimately read "closed, then found again."
 *  The word has to say the thing that is true every time: the item remains
 *  open.
 *
 *  COLOUR IS NOT THE CARRIER. `--bad` and `--warn` mean Unacceptable and
 *  Tolerable everywhere in this product — they are band colours, and a closed
 *  finding is not "green" and an open one is not "red": they are lifecycle
 *  states, not ratings, and teaching a reader otherwise makes every genuine
 *  rating on the screen less legible. So state is carried by FILL and SHAPE —
 *  outlined open, solid muted closed, hatched not-audited — with the word in
 *  the tooltip and in the accessible label. The one exception is `repeat`,
 *  which may raise its voice: it is the finding that matters most and the only
 *  one that should interrupt a calm screen.
 *
 *  NOT AUDITED IS NEVER BLANK. It is hatched and it says so. A blank cell
 *  reads as "nothing was wrong" and it means "we do not know", which is the
 *  opposite, and it is the single most expensive misreading this strip could
 *  invite. */

const WORD: Record<TimelineState, string> = {
  before: "not yet raised",
  raised: "raised",
  carried: "still open, nothing recorded",
  partial: "partially closed",
  closed: "verified closed",
  repeat: "checked again — remains open",
  notVerified: "not verified",
  notAudited: "NOT AUDITED — nobody looked",
  scheduled: "not yet",
};

function cellStyle(state: TimelineState): React.CSSProperties {
  const line = "var(--line-2)";
  switch (state) {
    case "before":
    case "scheduled":
      return { background: "transparent", border: `1px solid ${line}`, opacity: 0.4 };
    case "notAudited":
      /* Hatched, and unmistakably not empty. */
      return {
        border: `1px dashed var(--ink-4)`,
        backgroundImage:
          "repeating-linear-gradient(45deg, var(--ink-4) 0 1px, transparent 1px 4px)",
        opacity: 0.6,
      };
    case "raised":
      return { background: "var(--acc)", border: "1px solid var(--acc)" };
    case "carried":
    case "notVerified":
      return { background: "transparent", border: "2px solid var(--ink-3)" };
    case "partial":
      /* Half filled: the work started and did not finish, said in shape. */
      return {
        border: "2px solid var(--ink-3)",
        backgroundImage: "linear-gradient(to top, var(--ink-3) 50%, transparent 50%)",
      };
    case "closed":
      return { background: "var(--ink-4)", border: "1px solid var(--ink-4)", opacity: 0.55 };
    case "repeat":
      return { background: "var(--bad)", border: "1px solid var(--bad)" };
  }
}

export default function VisitStrip({
  cells,
  size = 14,
  /** Show each visit's label under its cell. Off in a dense list. */
  labels = false,
}: {
  cells: TimelineCell[];
  size?: number;
  labels?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-end gap-[3px]">
      {cells.map((c) => (
        <span key={c.visit} className="flex flex-col items-center gap-[2px]">
          <span
            title={`${c.label} — ${WORD[c.state]}${c.by ? ` (${c.by})` : ""}`}
            aria-label={`${c.label}: ${WORD[c.state]}`}
            role="img"
            className="block rounded-[3px]"
            style={{ width: size, height: size, ...cellStyle(c.state) }}
          />
          {labels && (
            <span className="font-mono text-[8px]" style={{ color: "var(--ink-4)" }}>
              {c.label.replace(" ", " ")}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
