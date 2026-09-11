"use client";

import type { ReactNode } from "react";
import { IconX } from "@/components/ui/icons";

/** A FOCUSED SURFACE WITH THE ACTION PINNED TO THE BOTTOM OF IT.
 *
 *  Extracted from the Add-item sheet, which is the one layout on the
 *  Inspection screen Sarel said reads cleanly. What makes it work is not the
 *  styling — it is the shape:
 *
 *  · **One thing at a time.** The list behind it is not competing for the
 *    screen, so the work gets the whole viewport instead of a slot between a
 *    sticky filter bar and a sticky action bar.
 *  · **The commit is always visible.** It is pinned to the bottom of the
 *    sheet, not at the end of the content — the reason the same work expanded
 *    in place needed scrolling to find Save, which on a walk means the auditor
 *    who cannot find it assumes they have already saved.
 *  · **It clears the home indicator**, so the action is reachable rather than
 *    sitting under an iOS gesture bar or an Android nav bar.
 *
 *  Full height on a phone and a centred card from `sm`, because a phone has no
 *  spare width to waste on a backdrop and a tablet reads better with the list
 *  still visible around it. */

export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  /* Pills and the like on the header row — an id, the modes a check carries,
     a prior rating. They identify what is open, so they belong beside the
     title rather than in the scrolling body. */
  badges,
  children,
  footer,
  /** Widen it where the content genuinely needs the room (a register check
      carries far more than an ad-hoc note). Phones ignore it: full width. */
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-start sm:pt-[6vh]"
      style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[94vh] w-full flex-col rounded-t-[20px] border sm:max-h-[86vh] sm:rounded-[20px] ${
          wide ? "sm:w-[min(760px,94vw)]" : "sm:w-[min(600px,94vw)]"
        }`}
        style={{
          background: "var(--panel)",
          borderColor: "var(--line-2)",
          boxShadow: "var(--e3)",
          /* The footer's own padding clears the home indicator. Without this
             the primary action sits under the gesture bar and cannot be
             pressed at all. */
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-3"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="min-w-0">
            {badges && (
              <div className="mb-[5px] flex flex-wrap items-center gap-[6px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                {badges}
              </div>
            )}
            <h3 className="text-[14px] leading-[1.35] font-bold">{title}</h3>
            {subtitle && (
              <p className="mt-[3px] text-[11px] leading-[1.45]" style={{ color: "var(--ink-3)" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            /* 44px like everything else an auditor taps. It is also the
               control somebody reaches for by accident, so it is far from the
               primary action rather than beside it. */
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px]"
            style={{ color: "var(--ink-3)" }}
          >
            <IconX width={16} height={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div
            /* justify-between rather than justify-end: a secondary and a
               primary side by side at 375px wrapped to two rows, which cost
               44px of the sheet and put the primary somewhere it moves. */
            className="flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
