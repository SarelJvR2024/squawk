/* Three fixes for a real data-loss incident, 7 October 2026 — confirmed live
 *  against the ORTIA audit: an auditor answered the RESA check (KSIA-CIV-015
 *  / ORTIA-CIV-015), later found it blank, and had to recapture it. A
 *  dedicated investigation ruled out the second (SharePoint-sync-only)
 *  device entirely — it never writes to `responses` and never had a row to
 *  push — and confirmed the mechanism on the capture device itself: Squawk
 *  was open in two tabs/windows at once, with zero cross-tab coordination,
 *  so whichever tab last saved anything silently overwrote the other's
 *  work in IndexedDB.
 *
 *  Three fixes, each closing one of the ranked root causes:
 *
 *    1. TabGuard (src/lib/tabGuard.ts, src/components/TabGuard.tsx) — the
 *       CONFIRMED cause. Detects a second tab via BroadcastChannel and
 *       blocks interaction with a refusal, not a merge: two tabs are the
 *       same device splitting its own single source of truth, not the
 *       cross-device case the Supabase shared record already handles.
 *    2. The hydration race (AppShell.tsx) — a tap in the gap between first
 *       paint and IndexedDB finishing loading used to be wiped the instant
 *       hydration's own merge landed. Nothing gated interactivity on
 *       `hydrated` before this; the sync poller had the guard, the shell
 *       that every interactive screen shares did not.
 *    3. The unguarded persist write (store.ts's idbStorage.setItem) — the
 *       exact bug class Capture.tsx already found and fixed for photo
 *       blobs (see its own header), left open for the whole audit's state:
 *       zustand's persist middleware never awaits `setItem`, so a write
 *       that throws became an unhandled rejection with nothing on screen.
 *
 *  Source-read, like capture.test.mjs's and sharepoint.test.mjs's own
 *  suites — async browser-API behaviour (BroadcastChannel timing, IndexedDB
 *  failure injection) is more reliably asserted on by reading what the code
 *  actually does than by simulating a fake IndexedDB and a fake second tab. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const tabGuardLib = src("lib", "tabGuard.ts");
const tabGuardUi = src("components", "TabGuard.tsx");
const banner = src("components", "PersistErrorBanner.tsx");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------------------------------- 1. the confirmed cause: two tabs --- */

check(
  "a second tab is detected via BroadcastChannel, not invented without one",
  /new BroadcastChannel\(CHANNEL\)/.test(tabGuardLib) &&
    /"BroadcastChannel" in window/.test(tabGuardLib),
  "a guard that cannot detect anything must not claim it checked"
);

check(
  "every tab announces itself on mount and on a heartbeat, not once only",
  /channel\.postMessage\(\{ type: "ping", id \}\)/.test(tabGuardLib) &&
    /setInterval\(/.test(tabGuardLib),
  "a once-only ping misses a tab that opens after this one already settled"
);

check(
  "a tab replies to a ping rather than waiting for the next heartbeat to be seen",
  /if \(msg\.type === "ping"\) channel\.postMessage\(\{ type: "pong", id \}\)/.test(tabGuardLib)
);

check(
  "a closing tab says so, so the guard does not wait out a full stale window to clear",
  /addEventListener\("beforeunload", bye\)/.test(tabGuardLib) &&
    /type: "bye"/.test(tabGuardLib)
);

check(
  "a peer not heard from in a while is pruned, so a crashed tab cannot pin the guard forever",
  /STALE_AFTER_MS/.test(tabGuardLib) && /now - at > STALE_AFTER_MS/.test(tabGuardLib)
);

check(
  "TabGuard renders nothing when no second tab is present",
  /if \(!another\) return null;/.test(tabGuardUi)
);

check(
  "and gives NO WAY TO DISMISS IT when one is — no onClick, no close button",
  !/onClick/.test(tabGuardUi),
  "two tabs are actively racing to overwrite each other for as long as both stay open; a dismiss would invite the exact loss this exists to stop"
);

check(
  "TabGuard is mounted in the shell every screen shares, not opted into per page",
  /<TabGuard \/>/.test(shell) && /import TabGuard from "@\/components\/TabGuard"/.test(shell)
);

/* ------------------------------------------- 2. the hydration race -------- */

check(
  "the shell reads `hydrated` from the store",
  /const hydrated = useStore\(\(s\) => s\.hydrated\);/.test(shell)
);

check(
  "and refuses to render the interactive shell — nav, children, everything — until it is true",
  /if \(!hydrated\) \{/.test(shell) && /Loading your audit/.test(shell),
  "a tap landing on the pre-hydration empty state is the exact gap hydration's own merge later overwrites"
);

/* ------------------------------------------- 3. the unguarded write ------- */

check(
  "the device's own storage write is wrapped in a try/catch, not fired bare",
  /setItem: async \(name: string, value: string\) => \{\s*try \{/.test(store)
);

check(
  "a failed write sets a visible error rather than becoming a silent rejection",
  /catch \(err\) \{\s*useStore\.setState\(\{ persistError: whyPersistFailed\(err\) \}\);/.test(store)
);

check(
  "a later successful write clears a previously-set error",
  /if \(useStore\.getState\(\)\.persistError\) useStore\.setState\(\{ persistError: null \}\);/.test(store)
);

check(
  "the quota case gets its own sentence, same as Capture.tsx's whyItFailed does for one photograph",
  /function whyPersistFailed/.test(store) &&
    /QuotaExceededError.*\|\|.*quota/.test(store.replace(/\n/g, " "))
);

check(
  "persistError is NOT persisted — it describes this device's storage right now, not the audit",
  (() => {
    const m = store.match(/partialize: \(s: State\) => \(\{([\s\S]*?)\}\),/);
    return !!m && !/persistError/.test(m[1]);
  })(),
  "a device that recovers must not show yesterday's failure on its next launch"
);

check(
  "the banner is dismissible, unlike TabGuard — the commit already succeeded in memory",
  /onClick=\{clear\}/.test(banner)
);

check(
  "the banner and TabGuard are both mounted, and the banner never blocks interaction the way TabGuard does",
  /<PersistErrorBanner \/>/.test(shell) && !/role="alertdialog"/.test(banner)
);

console.log(failures === 0 ? "\nDATA LOSS FIXES OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exitCode = failures ? 1 : 0;
