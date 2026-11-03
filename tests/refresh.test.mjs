import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* A BUTTON, NOT A GESTURE.
 *
 *  Sarel: "add functionakity that when i swipe down on mobile that the
 *  screen refresh." A touch gesture was built first — pull down on a
 *  scroller already at its own top calls syncNow() — and then deliberately
 *  backed out: "maybe to be safe add a refresh button instead of adding the
 *  scroll down to refresh." A custom touch gesture on a screen that already
 *  scrolls for 168,000 pixels, two days before a live audit, is exactly the
 *  kind of thing worth being cautious about; a menu button that calls the
 *  same action is not.
 *
 *  Source-read, same as tablet.test.mjs — this is a menu item inside a
 *  masthead dropdown, not a flow worth standing up a browser for. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const shell = src("components", "AppShell.tsx");
const panel = src("components", "SharedPanel.tsx");
const css = src("app", "globals.css");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

check(
  "THE NATIVE RELOAD-ON-OVERSCROLL IS STILL OFF — no gesture was quietly re-added to replace this",
  /overscroll-behavior-y: contain;/.test(css)
);

check(
  "no touch-gesture refresh component exists — the button replaced it, not sat beside it",
  !/PullToRefresh/.test(shell)
);

check(
  "Refresh is a plain menu item, reached in one tap from the More menu",
  /label="Refresh"/.test(shell) && /hint="Pull the latest from the team record now"/.test(shell)
);

check(
  "it calls the exact same syncNow() the Shared record sheet's own \"Sync now\" button uses — one action, not two",
  /onClick=\{\(\) => \{ setMore\(false\); shared\.syncNow\(\); \}\}/.test(shell) &&
    /onClick=\{shared\.syncNow\}/.test(panel),
  "a second copy of what a sync does is how the two drift"
);

check(
  "hidden entirely where there is nothing to refresh (no shared record configured for this deployment)",
  /\{shared && shared\.state !== "off" && shared\.unlocked && \(/.test(shell)
);

check(
  "ALSO hidden on a locked device, same as the Shared record panel's own Sync-now button — " +
    "syncNow() has no passphrase to sync with yet there and would otherwise silently do nothing",
  /\{shared && shared\.state !== "off" && shared\.unlocked && \(/.test(shell) &&
    /shared\.unlocked \? \(/.test(panel),
  "a looser gate here than SharedPanel's own is how a locked device gets a dead button"
);

/* ---------------------------------------------------------------------
 * A DIFFERENT "REFRESH" — THE APP ITSELF, NOT THE DATA.
 *
 * Sarel, after not seeing a shipped change on his phone: "add a refresh
 * button to the ap so that i can click to refresh it to make sure i get
 * the latest version of the app and pages." The item above already
 * covers pulling the latest DATA from the shared record; this is a
 * separate concern — pulling the latest CODE — and needed a separate
 * button, not a second job piled onto the first one's. */

check(
  "Refresh app is a distinct menu item, not folded into the data Refresh above",
  /label="Refresh app"/.test(shell) &&
    /hint="Check for the latest version and reload it"/.test(shell)
);

check(
  "it forces an update check rather than waiting for the browser's own clock to get around to it",
  /const reg = await navigator\.serviceWorker\?\.getRegistration\(\);/.test(shell) &&
    /await reg\?\.update\(\);/.test(shell)
);

check(
  "it always ends in a reload — found update or not, that is the honest answer to \"refresh it\"",
  /location\.reload\(\);\s*\n\s*\};/.test(shell)
);

check(
  "it is not gated on the shared record the way the data Refresh item is — the app itself needs no team record configured to be worth updating",
  /onClick=\{\(\) => \{ setMore\(false\); void refreshApp\(\); \}\}/.test(shell) &&
    !/shared[\s\S]{0,40}refreshApp/.test(shell)
);

console.log(failures === 0 ? "\nREFRESH OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
