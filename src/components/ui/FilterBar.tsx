"use client";

/** THE SHARED FILTER DISCLOSURE — generalised from the pattern Closure
 *  shipped first (src/app/(app)/closure/page.tsx), itself built because
 *  Sarel said: "these filters are not user friendly, there are too many
 *  visible at the same time and scattered all over." Closed by default, one
 *  line that always says what is currently showing, opening on tap to reveal
 *  one or more chip-row groups. Nothing is removed — every filter and every
 *  count is still reachable — the default state of the screen is just the
 *  work, not the controls above it.
 *
 *  Pulled out here rather than left as Closure's own markup because the
 *  identical problem — a chip row (or two) permanently eating 90–230px of a
 *  phone screen before any content appears — was independently re-typed on
 *  Capture, Review and Forms. Same component, same behaviour; each screen
 *  still owns its own filter state and the actual options/onChange wiring. */

import type { ReactNode } from "react";

export type FilterOption = { key: string; label: string };

export type FilterGroup = {
  /** A small caption to the left of the chip row, e.g. "Discipline". Omit
   *  for a group that doesn't need one (a single status row). */
  label?: string;
  options: FilterOption[];
  /** The selected key (single-select) or keys (multi-select, see `multi`). */
  value: string | string[];
  onChange: (key: string) => void;
  /** Multiple chips can be active at once; `value` is then read as an array
   *  and a tap toggles that one key rather than replacing the selection. */
  multi?: boolean;
  /** Matches Closure's two selected-chip looks: "solid" (accent fill, used
   *  for the primary status filter) or "soft" (accent-tinted, used for a
   *  secondary axis like discipline). Defaults to "solid". */
  variant?: "solid" | "soft";
  /** Extra classes appended to every chip in this group — e.g. Closure's
   *  discipline row forces `min-h-[44px]` where its status row does not,
   *  and that quirk is preserved per group rather than erased by this
   *  consolidation. */
  chipClassName?: string;
};

const unselectedStyle: React.CSSProperties = {
  background: "var(--panel)",
  borderColor: "var(--line-2)",
  color: "var(--ink-2)",
};

const selectedStyle = (variant: "solid" | "soft" = "solid"): React.CSSProperties =>
  variant === "soft"
    ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }
    : { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" };

function isSelected(g: FilterGroup, key: string): boolean {
  return g.multi ? (g.value as string[]).includes(key) : g.value === key;
}

function ChipRow({ group }: { group: FilterGroup }) {
  /* SELECTED-STATE ACCESSIBILITY, MATCHED TO WHAT THE GROUP ACTUALLY IS —
   *  overnight refinement, task 3. A multi-select row is a set of
   *  independent toggles, so `aria-pressed` on each chip (unchanged) is the
   *  right role. A single-select row is "choose exactly one of these" —
   *  the same pattern the Asset Assurance mode switch and the EVIDENCE
   *  verdict buttons elsewhere in this app already use (role="radiogroup" /
   *  role="radio" + aria-checked) — but every single-select FilterBar group
   *  (Closure's status row, Capture's NC/Open pin, Review's filters, …) was
   *  rendering as plain buttons with NO selected-state exposed at all:
   *  `aria-pressed={group.multi ? selected : undefined}` was `undefined`
   *  on every single-select chip, selected or not. A screen reader had no
   *  way to tell which chip, if any, was currently chosen. */
  const single = !group.multi;
  return (
    <div
      className="flex flex-wrap items-center gap-[6px]"
      role={single ? "radiogroup" : undefined}
      aria-label={single ? group.label : undefined}
    >
      {group.label && (
        <span className="label-xs" aria-hidden={single || undefined} style={{ color: "var(--ink-3)" }}>
          {group.label}
        </span>
      )}
      {group.options.map((o) => {
        const selected = isSelected(group, o.key);
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => group.onChange(o.key)}
            role={single ? "radio" : undefined}
            aria-checked={single ? selected : undefined}
            aria-pressed={group.multi ? selected : undefined}
            /* Same lift-on-hover/active `Chip` (primitives.tsx) already
               uses — these chip rows had no hover/active affordance at
               all, which is the thing that made a clickable filter chip
               and a read-only `Pill` hard to tell apart at a glance. */
            className={`rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)] hover:-translate-y-[1px] active:translate-y-0 ${group.chipClassName ?? ""}`}
            style={selected ? selectedStyle(group.variant) : unselectedStyle}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FilterBar({
  summary,
  active = false,
  groups,
  pinned,
  defaultOpen = false,
  className = "",
}: {
  /** What the disclosure's summary line reads, e.g. "everything that carries
   *  work" or "Electrical · Not yet verified" — built by the caller so each
   *  screen keeps its own wording. */
  summary: ReactNode;
  /** Whether a non-default filter is applied — drives the summary row's
   *  accent vs. neutral styling, same as Closure's `isDefault` check. */
  active?: boolean;
  groups: FilterGroup[];
  /** One group kept visible outside the disclosure — the mitigation the
   *  audit calls out for a filter used almost continuously (Capture's
   *  NC/Open toggle): folding literally everything adds a tap to the control
   *  an auditor reaches for all day. Optional; most screens don't need it. */
  pinned?: FilterGroup;
  /** Closure, Capture, Review and Forms all open shut — this is the shape
   *  Sarel signed off on. A screen with a reason to start open can pass
   *  true, but nothing in this pass does. */
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {pinned && <ChipRow group={pinned} />}

      <details className="group" open={defaultOpen || undefined}>
        <summary
          className="flex min-h-[44px] w-full cursor-pointer list-none items-start gap-2 rounded-[11px] border px-3 py-[9px] text-[11.5px] transition-[var(--t)]"
          style={
            active
              ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }
              : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
          }
        >
          <span
            aria-hidden
            className="mt-[1px] shrink-0 font-mono text-[9px] transition-transform group-open:rotate-90"
          >
            ›
          </span>
          <span className="min-w-0 flex-1">{summary}</span>
        </summary>

        <div className="mt-2 flex flex-col gap-2">
          {groups.map((g, i) => (
            <ChipRow key={g.label ?? i} group={g} />
          ))}
        </div>
      </details>
    </div>
  );
}
