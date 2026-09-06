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
 *  `sticky bottom-0` rather than `fixed`: it pins while the panel it belongs to
 *  is on screen and releases when the panel ends, so two of them on one page
 *  cannot fight, and it never floats over a screen it has nothing to do with. */

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
      className="sticky bottom-0 z-[7] -mx-[17px] mt-4 flex flex-wrap items-center justify-between gap-3 border-t px-[17px] py-2.5"
      style={{
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
