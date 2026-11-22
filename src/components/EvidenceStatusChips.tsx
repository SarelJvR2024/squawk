"use client";

/** THE STATUS-FILTER COUNT CHIPS — build prompt 6: "Count chips act as
 *  filters", driven by the new 3-state `displayStatus`. Shared between
 *  "By document" (evidence/page.tsx) and the new "By check"
 *  (EvidenceByCheckView.tsx) — code review on this branch caught the two
 *  originally carrying their own copy of this exact markup and counting
 *  logic, which had already drifted once (the two views were counting
 *  over two DIFFERENT populations without anyone meaning that). One
 *  component now; the caller decides which items it counts over, so the
 *  counting rule can never again silently diverge from what the list
 *  below the chips actually shows. */

import { useMemo } from "react";
import { DISPLAY_STATUS_LABEL, displayStatus } from "@/lib/evidence";
import type { EvidenceDisplayStatus } from "@/lib/evidence";
import type { EvidenceItem } from "@/lib/types";

export default function EvidenceStatusChips({
  items,
  value,
  onChange,
}: {
  /** The exact items the list below these chips renders from — counts are
   *  taken over this same set, never a wider or narrower one. */
  items: EvidenceItem[];
  value: "all" | EvidenceDisplayStatus;
  onChange: (v: "all" | EvidenceDisplayStatus) => void;
}) {
  const counts = useMemo(() => {
    const c: Record<"all" | EvidenceDisplayStatus, number> = {
      all: items.length,
      requested: 0,
      received: 0,
      unavailable: 0,
    };
    for (const e of items) c[displayStatus(e)]++;
    return c;
  }, [items]);

  return (
    <div className="mb-3 flex flex-wrap gap-[6px]" role="radiogroup" aria-label="Filter by status">
      {(
        [
          ["all", "All"],
          ["requested", DISPLAY_STATUS_LABEL.requested],
          ["received", DISPLAY_STATUS_LABEL.received],
          ["unavailable", DISPLAY_STATUS_LABEL.unavailable],
        ] as const
      ).map(([key, label]) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            className="rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)]"
            style={
              selected
                ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
            }
          >
            {label} ({counts[key]})
          </button>
        );
      })}
    </div>
  );
}
