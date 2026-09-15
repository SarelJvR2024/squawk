/** Stamp the build being deployed into public/sw.js.
 *
 *  See the long note at the top of public/sw.js: a service worker whose bytes
 *  never change is a service worker the browser never re-installs, and that
 *  took the "Apply update" button on /preflight out of reach entirely.
 *
 *  ONLY WHEN THERE IS A BUILD ID. Vercel sets VERCEL_GIT_COMMIT_SHA; a
 *  developer running `next build` locally has neither, and stamping there
 *  would leave public/sw.js permanently modified in everybody's working tree
 *  for no gain. No id means this does nothing and says so.
 *
 *  Idempotent: it rewrites the one line whatever that line currently holds, so
 *  running it twice, or on an already-stamped checkout, is the same as running
 *  it once. */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sw = path.join(here, "..", "public", "sw.js");

const id =
  process.env.SQUAWK_BUILD ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  "";

if (!id) {
  console.log("stamp-sw: no build id in the environment — leaving sw.js as it is");
  process.exit(0);
}

/* A short, readable stamp. The full SHA buys nothing here — this value is only
   ever compared for INEQUALITY, by a browser deciding whether it is holding a
   different worker. */
const stamp = id.slice(0, 12).replace(/[^a-zA-Z0-9]/g, "");

const src = readFileSync(sw, "utf8");
const line = /^const BUILD = "[^"]*";$/m;
if (!line.test(src)) {
  console.error('stamp-sw: could not find `const BUILD = "...";` in public/sw.js');
  process.exit(1);
}

writeFileSync(sw, src.replace(line, `const BUILD = "${stamp}";`));
console.log(`stamp-sw: sw.js stamped ${stamp}`);
