"use client";

import type { ReactNode } from "react";

/** THE ONE PAGE-HEADING ROW, SHARED — desktop/tablet redesign, phase 2, item A.
 *
 *  Checks (capture/page.tsx) grew this shape first, in phase 1: a single
 *  shrink-0 bar under the masthead carrying the screen's name on the left and
 *  its captured-progress figure beside it, instead of a page that had no
 *  heading at all. Inspection (field/page.tsx) carried an equivalent block —
 *  same title-plus-progress idea — but written out a second time, in-flow
 *  inside its own scrolling container rather than as a fixed bar, so the two
 *  screens' headings drifted apart in shape (one pinned, one not) even while
 *  agreeing on content.
 *
 *  This is the shared shell for both, and ONLY the shell: the title, the
 *  progress readout and any page actions are supplied by the caller as
 *  plain nodes. Checks' and Inspection's own progress markup — the exact
 *  `{done} of {total} captured · {pct}%` text and the 4px track underneath
 *  it — stays written out in each page's own file, unmoved, because
 *  `tests/progress-restore.test.mjs` reads that literal source out of
 *  `capture/page.tsx` and `field/page.tsx` by name and must keep finding it
 *  there. Moving the figure's OWN markup into this file would make both
 *  screens still agree on-screen while failing the one test that proves they
 *  are reading the real calculation and not a copy of it. So this component
 *  carries no arithmetic and no icon of its own — it only lays three slots
 *  out consistently: a title (left), a progress/status readout (left, after
 *  the title), and page actions (right, visually secondary to both).
 *
 *  One compact row, never a second full-width band: per the brief, nothing
 *  else on either screen should compete with this row for the top of the
 *  page — no breadcrumb, no separate workflow strip underneath it. */
export default function PageHeading({
  title,
  progress,
  actions,
  className = "",
}: {
  /** The screen's name — and, where one exists, its short subtitle — as a
   *  single node so the caller controls exactly what markup renders (Checks
   *  uses a bare `<h2>`; Inspection's carries a muted subtitle beside it). */
  title: ReactNode;
  /** The captured-progress readout: a track, the `done of total` words, and
   *  the completion mark where it applies. Left of center, immediately after
   *  the title — never recomputed here, only placed. */
  progress?: ReactNode;
  /** Page-level actions, visually secondary to the title and the progress
   *  figure beside it — kept quiet (ghost/icon buttons), never the accent
   *  colour reserved for a screen's one primary action elsewhere on it. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b px-4 py-2.5 ${className}`}
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">{title}</div>
      <div className="flex flex-wrap items-center gap-3">
        {progress}
        {/* `flex-wrap`, not `shrink-0` — Dashboard is this slot's first
            consumer with more than one control in it (desktop/tablet
            redesign round 5: the level toggle, the discipline filter and
            the role pill), and a fixed-width, non-wrapping row of three
            controls is exactly what ran a pill off the right edge of a
            390px phone instead of wrapping it onto its own line, the same
            overflow `min-w-0` elsewhere in this app exists to prevent.
            Checks and Inspection pass no `actions` at all, so this is a
            no-op for both — nothing about their own rendering changes. */}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
