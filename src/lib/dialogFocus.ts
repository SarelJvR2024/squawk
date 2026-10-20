"use client";

import { useEffect, useRef } from "react";

/** THE ONE FOCUS MECHANISM EVERY SHEET-STYLE DIALOG SHARES.
 *
 *  Sheet.tsx and SharedSheet.tsx are two different markups for the same
 *  thing — a backdrop, a centred/bottom-pinned panel, a close button, Escape
 *  and backdrop-click already wired to the same `onClose`. Before this, only
 *  the backdrop-click half of "an accessible dialog" existed on either of
 *  them: no initial focus, no keyboard trap, no focus returned to whatever
 *  opened it, and nothing tying the panel to its own title for a screen
 *  reader. Fixed once, here, rather than twice, so the two cannot drift.
 *
 *  WHAT IT DOES, each time `open` becomes true:
 *   · Remembers whatever had focus before the dialog opened (the trigger),
 *     so it can be given back on close.
 *   · Focuses the first focusable element inside the dialog — UNLESS
 *     something inside it is already focused. Two of this app's own callers
 *     of Sheet.tsx (RaiseFindingSheet, RelinkPhotoSheet) already put
 *     `autoFocus` on a specific field deliberately, and that already wins:
 *     React/the browser focuses it during commit, before this effect runs,
 *     so `document.activeElement` already reads as inside the dialog by the
 *     time this checks. A sheet with no such field falls back to the first
 *     focusable control, or the dialog surface itself if it has none.
 *   · Traps Tab inside the dialog: Shift+Tab from the first focusable
 *     element wraps to the last, Tab from the last wraps to the first.
 *   · Calls `onClose` on Escape. SharedSheet already had this at the
 *     AppShell level (its own global Escape handler sets sharedOpen false);
 *     this adds the same key for every OTHER sheet, which previously had no
 *     Escape handling anywhere — closing one needed a pointer. Harmless to
 *     add beside SharedSheet's existing handler: both end up calling the
 *     same setter with the same value.
 *
 *  WHAT IT DELIBERATELY LEAVES ALONE: backdrop-click close is each
 *  component's own `onClick={onClose}` on the backdrop <div>, unchanged.
 *
 *  Called unconditionally — every render, open or not — because React hooks
 *  cannot be called only on some renders. The effect itself is the part that
 *  does nothing while `open` is false. */
export function useDialogFocusTrap<T extends HTMLElement>(
  open: boolean,
  onClose: () => void
) {
  const containerRef = useRef<T | null>(null);
  const triggerRef = useRef<Element | null>(null);
  /* onClose is very often a fresh arrow function every render (every sheet
     here writes it inline). Reading it through a ref kept current on every
     render means the trap effect below only needs to run on an open/close
     transition, not on every parent re-render, while Escape still calls
     whichever onClose is current rather than a stale one from first open. */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    triggerRef.current = document.activeElement;

    const focusables = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);

    /* Only steal focus if nothing inside the dialog has it already —
       autoFocus on a specific field, where this app already has one, has
       already won the race by the time this runs. */
    if (!container.contains(document.activeElement)) {
      const first = focusables()[0] ?? container;
      first.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        /* Nothing to cycle through — keep focus on the dialog itself
           rather than letting Tab escape it. */
        e.preventDefault();
        container?.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      /* Give it back to whatever opened the dialog — unless that element is
         itself gone from the document (removed while the dialog was open),
         in which case there is nothing sane to return focus to. */
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [open]);

  return containerRef;
}
