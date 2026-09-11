"use client";

import type { ReactNode } from "react";

/** ONE COLLAPSIBLE GROUP HEADER, USED BY EVERY SCREEN THAT GROUPS.
 *
 *  Extracted from the Checks navigator, where this shape was invented: a row
 *  that opens and shuts, names the group, says DONE OF TOTAL, and carries its
 *  own progress as a hairline underline rather than as a second stacked
 *  element. The Inspection screen needed the same thing at two levels, and a
 *  second implementation of it would have drifted from this one inside a
 *  month — they always do, and then two screens that group the same data look
 *  like two products.
 *
 *  Three rules the shape encodes, none of them cosmetic:
 *
 *  1. **The count reads done of total.** A bare number on a group header does
 *     not say whether it is work finished or work left, and the person who
 *     needs to know is the one least able to guess.
 *  2. **The count is of everything the group HAS, not of what a filter left
 *     standing.** "3/8" that changes meaning when you press a filter chip is
 *     not progress, it is arithmetic about a filter.
 *  3. **Open or shut is said in words** — `aria-expanded` — so the triangle is
 *     decoration and a screen reader is not asked to interpret a glyph. */

export default function GroupRow({
  label,
  done,
  total,
  open,
  onToggle,
  /** A second figure worth seeing without opening the group — non-compliances,
   *  say. Rendered after the count, never instead of it. */
  suffix,
  /** Pills and the like, between the label and the count. */
  children,
  /** Highlighted because what the auditor is working on lives in here. */
  holds = false,
  /** The nesting level. 0 is a top-level group, 1 a group inside one. */
  depth = 0,
  title,
  /** Sticks to the top of the scroller while its group is in view, so the
   *  auditor always knows which discipline or location they are inside. Off by
   *  default: two levels of sticky in a 664px viewport is a letterbox. */
  sticky = false,
  stickyTop = 0,
}: {
  label: string;
  done: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  suffix?: ReactNode;
  children?: ReactNode;
  holds?: boolean;
  depth?: 0 | 1;
  title?: string;
  sticky?: boolean;
  stickyTop?: number;
}) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      title={title ?? `${label} — ${done} of ${total} done`}
      className={`relative flex w-full items-center gap-[6px] overflow-hidden border-b text-left transition-[var(--t)] ${
        sticky ? "sticky z-[4]" : ""
      }`}
      style={{
        top: sticky ? stickyTop : undefined,
        borderColor: "var(--line)",
        /* A sticky row must paint its own background or the list scrolls
           through it. */
        background: holds ? "var(--acc-soft)" : sticky ? "var(--panel)" : "transparent",
        color: holds ? "var(--acc)" : "var(--ink-2)",
        paddingLeft: 9 + depth * 12,
        paddingRight: 11,
        /* 44px, because this is the control that opens the work. */
        minHeight: 44,
      }}
    >
      <span
        aria-hidden="true"
        className="shrink-0 font-mono text-[8px] leading-none"
        style={{ color: "var(--ink-4)" }}
      >
        {open ? "▼" : "▶"}
      </span>
      <b
        className="min-w-0 flex-1 truncate font-semibold"
        style={{ fontSize: depth === 0 ? 12 : 11 }}
      >
        {label}
      </b>
      {children}
      <span
        className="shrink-0 font-mono text-[9.5px]"
        style={{ color: holds ? "var(--acc)" : "var(--ink-4)" }}
      >
        {done}/{total}
        {suffix}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: "var(--line-2)" }}>
        <span
          className="block h-full"
          style={{ width: `${pct}%`, background: holds ? "var(--acc)" : "var(--good)" }}
        />
      </span>
    </button>
  );
}
