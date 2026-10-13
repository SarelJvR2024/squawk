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
 *  A WAITING WORKER IS ACTIVATED HERE NOW — Sarel, 13 October 2026: auto-update
 *  the builds and apps, instantly, rather than leaving it to the pre-flight
 *  screen's button. This reverses the earlier decision, recorded below for
 *  why it no longer applies.
 *
 *  THE ORIGINAL WORRY — "swapping builds under a running session can leave the
 *  page asking the old build for chunks the new cache does not hold" — is
 *  already covered by sw.js's own `promote()`: a new shell is stored only once
 *  every chunk it names has actually been fetched, so there is no build a
 *  reload can land on whose own assets are not there to serve it. What
 *  remains, and is real, is the interruption itself: a reload lands on
 *  whatever screen is open, closed sheets included, the instant a new build
 *  finishes installing, whether or not somebody is mid-check. No captured
 *  work is at risk either way — every field already writes straight into the
 *  persisted store on every keystroke, not only on Save — but a reload mid-tap
 *  still breaks the auditor's flow. Accepted, at Sarel's instruction, in
 *  exchange for a device that is never more than one load behind. */

import { useEffect } from "react";
import { loadAnswers } from "@/lib/answers";
import { loadAssets } from "@/lib/assets";

export default function OfflineReady() {
  useEffect(() => {
    const register = () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((reg) => {
            /* ALREADY WAITING, e.g. this tab loaded after another tab's install
               finished. Fires the same swap the pre-flight button used to. */
            if (reg.waiting) reg.waiting.postMessage("squawk:activate-update");

            reg.addEventListener("updatefound", () => {
              const next = reg.installing;
              if (!next) return;
              next.addEventListener("statechange", () => {
                /* `navigator.serviceWorker.controller` is set only once a worker
                   has ALREADY taken a page — so its presence here means this
                   install is an update, not the very first one. The first
                   install has nothing running yet to disrupt and needs no
                   message; it activates on its own once installed. */
                if (next.state === "installed" && navigator.serviceWorker.controller) {
                  next.postMessage("squawk:activate-update");
                }
              });
            });
          })
          .catch(() => {
            /* Nothing to say. The app is unchanged; only the next cold start with
               no signal is affected, and the pre-flight screen reports it. */
          });

        /* THE SWAP ITSELF. `controllerchange` fires once per activation, but a
           browser can fire it more than once across a session (another tab
           updating, for one) — the guard keeps this tab from reloading twice
           for the same build. */
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloaded) return;
          reloaded = true;
          location.reload();
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
