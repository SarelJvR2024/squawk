/* ------------------------------------------------------------------ the clock

   THE CLOCK IS AN EXTERNAL SYSTEM, and it is read as one.

   Every screen here is server-rendered, and the store rehydrates from IndexedDB
   afterwards — so the first client render has to match the server's HTML
   exactly, or React tears the tree down and rebuilds it. Date.now() during
   render cannot do that, and reading it in an effect and calling setState is a
   cascading render the React lint rule correctly refuses.

   useSyncExternalStore is the mechanism meant for exactly this: the server
   snapshot is 0, which every reader treats as "not known yet" and renders
   nothing for, and the client snapshot is a real time. Everything the clock
   touches is therefore ADDITIVE — it appears a frame after mount and nothing
   already on the screen changes.

   It ticks once a minute rather than being fixed at mount, because "2 min ago"
   left open on a stand for an hour is a lie the reader has no way to detect.

   Lifted out of the home screen when the safety findings register needed the
   same thing. Two copies of a clock is two answers to "is this notice overdue",
   and the one that matters here is whether SWP-07's same-day deadline has
   passed — so there is one timer, one subscriber set, and one snapshot. */

import { useSyncExternalStore } from "react";

const CLOCK_TICK = 60000;
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockSubs = new Set<() => void>();

export function subscribeClock(onChange: () => void): () => void {
  clockSubs.add(onChange);
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const cb of clockSubs) cb();
    }, CLOCK_TICK);
  }
  return () => {
    clockSubs.delete(onChange);
    if (clockSubs.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** Cached, because a snapshot that returns a new value on every call is an
 *  infinite render loop rather than a fresh reading. */
export const clockSnapshot = () => (clockNow ||= Date.now());
export const clockOnServer = () => 0;

/** The current time, or 0 until the device's clock is known.
 *
 *  Callers MUST treat 0 as "not known yet" and render nothing time-dependent
 *  for it. That is what keeps the first client render identical to the
 *  server's. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, clockSnapshot, clockOnServer);
}
