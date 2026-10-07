"use client";

import { useTabGuard } from "@/lib/tabGuard";

/** Blocks interaction the moment a second tab or window of Squawk is open on
 *  this device — see src/lib/tabGuard.ts for why this exists and why it
 *  refuses rather than tries to merge. No dismiss and no backdrop click: the
 *  two tabs are actively racing to overwrite each other's next write for as
 *  long as both stay open, so "I understand, continue anyway" would be
 *  inviting the exact loss this screen exists to stop. It clears itself the
 *  moment the other tab actually closes — nothing here is a one-time
 *  warning the auditor has to remember to come back from. */
export default function TabGuard() {
  const another = useTabGuard();
  if (!another) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6 text-center"
      style={{ background: "rgba(16,10,32,.92)" }}
      role="alertdialog"
      aria-modal="true"
      aria-label="Squawk is open more than once on this device"
    >
      <div
        className="max-w-[420px] rounded-[16px] border p-[22px]"
        style={{ background: "var(--panel)", borderColor: "var(--bad-line)" }}
      >
        <b className="mb-2 block text-[15px] font-bold" style={{ color: "var(--bad)" }}>
          Squawk is open in more than one tab or window on this device
        </b>
        <p className="mb-2 text-[12.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
          Each one keeps its own copy of today&apos;s audit, and whichever is used
          last silently overwrites the other&apos;s work — this is how real
          captures were lost earlier today.
        </p>
        <p className="text-[12.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
          <b>Close every other Squawk tab or window on this device</b>, leaving
          only the one you mean to use. This message clears itself the moment
          you do.
        </p>
      </div>
    </div>
  );
}
