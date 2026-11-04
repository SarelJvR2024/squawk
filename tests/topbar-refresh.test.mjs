import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* A REFRESH BUTTON, RIGHT ON THE TOP BAR — Sarel: "Add a refresh sync
 *  feature which you put as a button on the top bar." The action already
 *  existed one tap deeper (the More menu's own "Refresh" item, and
 *  SharedPanel.tsx's "Sync now" inside the Shared record sheet) — this pins
 *  down that the new top-bar button calls the SAME shared.syncNow(), not a
 *  third copy, and is gated the same way the existing one already is:
 *  hidden with nothing configured to sync (state "off") and on a locked
 *  device (syncNow() has no passphrase yet and would otherwise no-op
 *  silently). Source-read, like fieldacsatab.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

check(
  "a top-bar button calls shared.syncNow() directly, on a tap, nothing in between",
  /onClick=\{\(\) => shared\.syncNow\(\)\}/.test(shell)
);

check(
  "it is gated exactly like the existing More-menu Refresh item — off deployments and locked devices stay hidden",
  /\{shared && shared\.state !== "off" && shared\.unlocked && \(/.test(shell)
);

check(
  "it is disabled while a sync from anywhere is already running, not a second race against it",
  /disabled=\{shared\.state === "syncing"\}/.test(shell)
);

check(
  "it explains itself with the SAME hint text the Shared record status already uses — one vocabulary for this state, not a second one invented for the button",
  (() => {
    const i = shell.indexOf('aria-label="Refresh — pull the latest from the team record"');
    if (i === -1) return false;
    const slice = shell.slice(Math.max(0, i - 400), i);
    return /title=\{sharedHint\}/.test(slice);
  })()
);

console.log(
  failures === 0 ? "\nTOP BAR REFRESH OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
