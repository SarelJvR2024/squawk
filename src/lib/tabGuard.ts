/** Detects when Squawk is open more than once at once on this device — the
 *  confirmed cause of a real data-loss incident, 7 October 2026: two tabs
 *  open on the same tablet, each holding its own in-memory copy of the
 *  audit, and whichever one last saved ANYTHING — even an unrelated edit —
 *  silently overwrote the other's work in IndexedDB on its next write.
 *  There was no cross-tab coordination anywhere in this app before this —
 *  confirmed by grep, zero hits for BroadcastChannel or a `storage` listener
 *  — so the two copies never knew about each other.
 *
 *  THE FIX IS NOT TO MERGE THEM. Two tabs are the SAME device, so this is
 *  not the cross-DEVICE problem the Supabase shared record already solves
 *  with a real newer-wins rule — it is one browser silently splitting its
 *  own single source of truth in two. The safe answer is to say so, loudly,
 *  and let the auditor close one, not to invent a second merge algorithm for
 *  a situation that should never exist in the first place. */

import { useEffect, useState } from "react";

const CHANNEL = "squawk-tabs";
/* How often a tab announces itself. Short enough that a second tab is caught
   within a couple of seconds of opening, not so short it is a meaningful
   battery or radio cost on a tablet carrying a whole day's audit. */
const HEARTBEAT_MS = 2000;
/* A peer not heard from in this long is treated as gone — covers a crash or
   a killed tab that never got to send `bye`, at the cost of the guard
   lagging a few seconds behind a real close. */
const STALE_AFTER_MS = 6000;

type Msg = { type: "ping" | "pong" | "bye"; id: string };

/** True whenever another tab or window of Squawk is open right now, on this
 *  device. Polls by heartbeat rather than a single ping/pong exchange, so a
 *  tab that opens, closes and reopens is detected every time, and a crashed
 *  tab drops out within one stale window instead of being believed forever.
 *  False (never true) where BroadcastChannel is unsupported — a guard that
 *  cannot detect anything must not claim it checked. */
export function useTabGuard(): boolean {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const id = Math.random().toString(36).slice(2);
    const channel = new BroadcastChannel(CHANNEL);
    const seen = new Map<string, number>();

    const prune = () => {
      const now = Date.now();
      for (const [peer, at] of seen) {
        if (now - at > STALE_AFTER_MS) seen.delete(peer);
      }
      setPresent(seen.size > 0);
    };

    channel.onmessage = (e: MessageEvent<Msg>) => {
      const msg = e.data;
      if (!msg || msg.id === id) return;
      if (msg.type === "bye") {
        seen.delete(msg.id);
        prune();
        return;
      }
      seen.set(msg.id, Date.now());
      /* Reply once, so a tab that opens into a room of several others does
         not have to wait for the next heartbeat to be seen by all of them. */
      if (msg.type === "ping") channel.postMessage({ type: "pong", id });
      prune();
    };

    channel.postMessage({ type: "ping", id });
    const heartbeat = window.setInterval(() => {
      channel.postMessage({ type: "ping", id });
      prune();
    }, HEARTBEAT_MS);

    const bye = () => channel.postMessage({ type: "bye", id });
    window.addEventListener("beforeunload", bye);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", bye);
      bye();
      channel.close();
    };
  }, []);

  return present;
}
