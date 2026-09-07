"use client";

/** Registers the service worker, and says nothing at all when it works.
 *
 *  The worker is what makes Squawk open with no signal. Registration is
 *  deliberately quiet and deliberately non-blocking: it happens after load so
 *  it never competes with the first paint on a tablet coming up on the apron,
 *  and a browser that refuses it — a private window, a policy, an iOS version
 *  that has had enough — leaves the app working exactly as it did before.
 *  Nothing in the product depends on this succeeding. It only decides whether
 *  the NEXT launch needs a network.
 *
 *  A waiting worker is NOT activated here. Swapping builds under a running
 *  session can leave the page asking the old build for chunks the new cache
 *  does not hold, and doing that to somebody mid-observation on a live audit is
 *  not a trade worth making for a faster rollout. The pre-flight screen offers
 *  the swap as a button instead, where the auditor decides. */

import { useEffect } from "react";
import { loadAnswers } from "@/lib/answers";
import { loadAssets } from "@/lib/assets";

export default function OfflineReady() {
  useEffect(() => {
    const register = () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
          /* Nothing to say. The app is unchanged; only the next cold start with
             no signal is affected, and the pre-flight screen reports it. */
        });
      }
      warm();
    };
    if (document.readyState === "complete") register();
    else {
      addEventListener("load", register, { once: true });
      return () => removeEventListener("load", register);
    }
  }, []);

  return null;
}

/** Fetch the two lazy payloads while there is still a signal.
 *
 *  The Answer Library (9,836 researched options) and the asset register (1,506
 *  rows) are deliberately not in the initial bundle — a tablet coming up on the
 *  apron should not pay for them before it asks. But "on first use" and
 *  "offline-safe" pull against each other: an auditor who never happened to
 *  open an asset picker on wifi, and then needs one in a substation basement,
 *  gets an empty picker and no explanation.
 *
 *  So they are fetched deliberately rather than incidentally, after load and
 *  behind an idle callback so they never compete with the first paint. Both are
 *  idempotent and memoised in their own modules; calling them here just means
 *  the service worker has them cached before the signal goes. */
function warm() {
  const go = () => {
    void loadAnswers().catch(() => undefined);
    void loadAssets().catch(() => undefined);
  };
  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void })
      .requestIdleCallback(go, { timeout: 4000 });
  } else {
    /* Safari has no requestIdleCallback. A timeout is the honest fallback. */
    setTimeout(go, 1500);
  }
}
