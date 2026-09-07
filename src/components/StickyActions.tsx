"use client";

/** The action bar that does not scroll away.
 *
 *  The check screen has had one of these since it was built: a bar pinned to
 *  the bottom carrying the record's state on the left and Save / Save & next on
 *  the right. The findings screen did not, and the hazard register had no save
 *  affordance at all.
 *
 *  That mattered more than it sounds. Measured on an iPad Air in landscape
 *  (1180x820), the findings screen's Save & next sat at y=1258 — below the fold
 *  before the auditor scrolls at all — and after the matrix, the root-cause
 *  chips, the advice panel, the treatment box and three more fields it is a
 *  long way down. An auditor working a register of forty findings scrolls to
 *  the bottom forty times to press a button that could have been under their
 *  thumb the whole time.
 *
 *  So it lives here, once, and every screen that records something uses it.
 *  STICKY rather than fixed: it pins while the panel it belongs to is on screen
 *  and releases when the panel ends, so two of them on one page cannot fight,
 *  and it never floats over a screen it has nothing to do with.
 *
 *  It pins to --bottom-nav rather than to zero. On a phone the navigation is a
 *  fixed bar along the bottom, and a zero offset would park Save & next behind
 *  it; on a tablet the variable is 0 and this is the old behaviour exactly. */

import type { ReactNode } from "react";

export default function StickyActions({
  state,
  children,
}: {
  /** What the record's position is, in words. On the left, quiet, always
   *  visible — the same place the check screen puts it. */
  state?: ReactNode;
  /** The buttons. Right-aligned, the primary one last. */
  children: ReactNode;
}) {
  return (
    <div
      className="sticky z-[7] -mx-[17px] mt-4 flex flex-wrap items-center justify-between gap-3 border-t px-[17px] pt-2.5"
      style={{
        /* Above the bottom bar on a phone, and at the bottom of the viewport
           everywhere else — --bottom-nav is 0 where there is no bar.
           
           THE HOME INDICATOR is padded for by whichever of the two is lowest
           on the screen. Pinned to a bare bottom-0 on an iPhone, Save & next —
           the most-pressed button in the app — sat underneath the one piece of
           screen furniture nobody can move. */
        bottom: "var(--bottom-nav)",
        paddingBottom: "calc(0.625rem + var(--sticky-safe))",
        background: "var(--panel)",
        borderColor: "var(--line)",
        boxShadow: "0 -4px 16px -8px rgba(22,16,40,.14)",
      }}
    >
      <div className="font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
        {state}
      </div>
      {/* ml-auto so the buttons stay on the right even when the state line
          is long enough to wrap them onto their own row — otherwise the
          primary action jumps to the left edge on a narrower tablet. */}
      <div className="ml-auto flex flex-wrap gap-[7px]">{children}</div>
    </div>
  );
}
