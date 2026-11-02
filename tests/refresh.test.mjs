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
  /\{shared && shared\.state !== "off" && \(/.test(shell)
);

console.log(failures === 0 ? "\nREFRESH OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
