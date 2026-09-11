"use client";

import type { Compliance } from "@/lib/types";
import { IconCheck, IconClock, IconDash, IconX } from "@/components/ui/icons";

/** THE OUTCOME OF ONE INSPECTION. One control, four segments.
 *
 *  ACSA's four values, and the repo's own words for them, unchanged:
 *  C Pass · NC Fail · N/A Not applicable · NV Later.
 *
 *  AN OUTCOME IS NOT A RATING, and the palette is where that gets taught
 *  wrongly. `--bad` (#B93338) and `--warn` (#946511) mean Unacceptable and
 *  Tolerable — they are band colours, in the report, on the dashboard and on
 *  every rating pill in the product. The four inspection buttons used to fill
 *  with them, so a Fail rendered in the colour of an Unacceptable rating and a
 *  Later in the colour of a Tolerable one. A reader who learns that
 *  equivalence on this screen then misreads every genuine band elsewhere,
 *  which is the more expensive half of the mistake.
 *
 *  So this control carries state with FILL AND WEIGHT in the brand indigo
 *  family and does not touch the rating palette at all. What separates the
 *  four is the icon and the word, which survive a projector, sunlight and a
 *  colour-blind reader in a way a hue never does.
 *
 *  Sizing: 56px on the inspection screen, 44px where it is denser. Equal
 *  widths, full container width, always in the same order — the point is that
 *  the same outcome is under the same thumb on every item, so it can be hit
 *  without being read. */

export const OUTCOMES: { key: Compliance; label: string; Icon: typeof IconCheck }[] = [
  { key: "C", label: "Pass", Icon: IconCheck },
  { key: "NC", label: "Fail", Icon: IconX },
  { key: "N/A", label: "N/A", Icon: IconDash },
  { key: "NV", label: "Later", Icon: IconClock },
];

export default function OutcomeControl({
  value,
  onChange,
  size = 56,
  idPrefix,
}: {
  value: Compliance | null;
  /** Never destructive: the caller keeps the note and the photographs. Passing
   *  null back is how the same segment tapped twice clears the outcome, which
   *  has to be possible — a status set by mistake that cannot be unset is how
   *  a blank "not captured" becomes an untrue "Pass". */
  onChange: (next: Compliance | null) => void;
  size?: number;
  /** Distinguishes the group when several are on one page, for screen readers. */
  idPrefix?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Outcome"
      className="grid w-full grid-cols-4 gap-[3px] rounded-[12px] border p-[3px]"
      /* The trough carries a border as well as a fill. Without it, four white
         segments on a white card read as four separate buttons again — which
         is the thing this replaced. */
      style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
    >
      {OUTCOMES.map(({ key, label, Icon }) => {
        const on = value === key;
        return (
          <button
            key={key}
            id={idPrefix ? `${idPrefix}-${key}` : undefined}
            role="radio"
            aria-checked={on}
            aria-label={label}
            onClick={() => onChange(on ? null : key)}
            className="flex flex-col items-center justify-center gap-[3px] rounded-[9px] font-display text-[10.5px] font-semibold transition-[var(--t)] active:translate-y-[1px]"
            style={{
              minHeight: size,
              /* Solid fill, white ink and a lift for the chosen one; a quiet
                 surface for the rest. Nothing else changes, so the eye has one
                 thing to find. */
              background: on ? "var(--acc)" : "var(--panel)",
              color: on ? "var(--on-acc)" : "var(--ink-2)",
              boxShadow: on ? "var(--e2)" : "none",
              fontWeight: on ? 700 : 600,
            }}
          >
            <Icon width={16} height={16} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
