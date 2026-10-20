"use client";

/** THE FILTERS POPOVER — one button, every axis in one tap.
 *
 *  NOT the same thing as FilterBar (src/components/ui/FilterBar.tsx).
 *  FilterBar is a per-axis `<details>` disclosure: each screen that uses it
 *  owns the whole row and chooses what stays pinned outside it. This is for
 *  a screen with several SIMULTANEOUS axes that do not read naturally as a
 *  stack of chip rows — Field/Inspection's discipline-vs-location toggle, a
 *  `<select>` and a free-text search, which cost 170–230px stacked across
 *  three rows before any content appeared (the UX audit's bucket-4, option
 *  3). One button opens one small panel holding all of them; nothing about
 *  what the controls DO changes, only how they are surfaced.
 *
 *  Self-contained open/close state, no portal — a `relative` wrapper with an
 *  invisible full-screen backdrop plus an anchored panel, the same shape
 *  AppShell's own header dropdowns already use (see the role switcher at
 *  AppShell.tsx). On a phone the panel pins to the screen edges rather than
 *  anchoring to the button, so it opens within thumb's reach one-handed
 *  instead of as a narrow dropdown that can run off either side. */

import { useEffect, useState, type ReactNode } from "react";
import { IconX } from "@/components/ui/icons";

export function FilterPopover({
  label = "Filters",
  /** A short one-line readout of what is currently applied, e.g.
   *  "Electrical · 'ramp'" — shown on the button itself so the common case
   *  (checking what is active) never requires opening the panel at all. */
  summary,
  /** How many of the panel's axes are non-default right now. Rendered as a
   *  small count badge on the button — the "Filters (2)" shape the audit's
   *  option 3 describes — and omitted entirely at 0 so a screen with
   *  nothing applied reads as unfiltered, not "0 filters". */
  activeCount = 0,
  children,
  className = "",
}: {
  label?: string;
  summary?: ReactNode;
  activeCount?: number;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex min-h-[44px] w-full items-center gap-2 rounded-[11px] border px-3 py-[9px] text-left text-[11.5px] transition-[var(--t)]"
        style={
          activeCount > 0
            ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }
            : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
        }
      >
        <span
          aria-hidden
          className="shrink-0 font-mono text-[9px] transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          ›
        </span>
        <span className="min-w-0 flex-1 truncate font-display font-semibold">
          {label}
          {activeCount > 0 && (
            <span
              className="ml-[6px] inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold"
              style={{ background: "var(--acc)", color: "var(--on-acc)" }}
            >
              {activeCount}
            </span>
          )}
        </span>
        {summary && (
          <span className="min-w-0 shrink-[2] truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
            {summary}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Invisible, full-screen — tapping anywhere outside the panel
              closes it, same as AppShell's own dropdowns. */}
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={label}
            /* Pinned to the viewport's edges on a phone — reachable
               one-handed wherever the button happened to be — and an
               anchored dropdown from `sm` up, where there is room for one. */
            className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+58px)] z-[75] max-h-[min(70vh,560px)] overflow-y-auto rounded-[16px] border p-[14px] sm:absolute sm:inset-x-auto sm:top-[calc(100%+7px)] sm:left-0 sm:max-h-none sm:w-[min(420px,92vw)]"
            style={{ background: "var(--menu-bg)", borderColor: "var(--menu-line)", boxShadow: "var(--e3)" }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <b className="font-display text-[12.5px]">{label}</b>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] transition-[var(--t)]"
                style={{ color: "var(--ink-3)" }}
              >
                <IconX width={14} height={14} />
              </button>
            </div>
            <div className="flex flex-col gap-3">{children}</div>
          </div>
        </>
      )}
    </div>
  );
}
