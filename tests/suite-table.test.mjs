/* THE SUITE TABLE IN tests/README.md, CHECKED AGAINST THE SUITES.
 *
 * That table claims an assertion count per suite and a total, and the total is
 * quoted in every pull request description as evidence of how much is covered.
 * It was verified by hand when it was written. By 2026-09-10 eight of its rows
 * had gone stale and one suite was missing from it entirely — every one of them
 * drifting upward, so the table was understating the cover while reading as
 * though somebody had checked.
 *
 * A hand-verified number is verified once. This runs the source suites and
 * reads back the PASS lines they print, which is what "assertions run" means
 * everywhere else in this repo.
 *
 * SOURCE SUITES ONLY. The browser suites need a server, a build and a browser;
 * starting all thirteen to count their PASS lines would take minutes and would
 * fail for reasons that have nothing to do with the table. Their rows stay
 * hand-verified, and this file says so rather than pretending otherwise.
 *
 * It also does not run ITSELF — a suite that runs every suite including itself
 * does not terminate.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const readme = fs.readFileSync(path.join(here, "README.md"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* The three that import the app's real modules need the alias loader. Kept as
   one list rather than a try/catch, so a new suite that needs it fails loudly
   here instead of being silently counted as zero. */
const NEEDS_ALIAS = new Set(["sharepoint.test.mjs", "merge.test.mjs", "figures.test.mjs"]);
const SELF = "suite-table.test.mjs";

/* Every source suite needs a ROW, this file included — a suite that exempts
   itself from the table is the first one to go missing from it. Only the
   RUNNING is skipped for itself, because a suite that runs every suite
   including itself does not terminate. */
const suites = fs.readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();
const runnable = suites.filter((f) => f !== SELF);

/* ---- 1 · every source suite has a row ----------------------------------- */

const rowOf = (file) => {
  const m = readme.match(
    new RegExp(`\\| \`${file.replace(/\./g, "\\.")}\` \\| ([^|]+) \\| (\\d+) \\|`)
  );
  return m ? { server: m[1].trim(), count: Number(m[2]) } : null;
};

const unlisted = suites.filter((f) => !rowOf(f));
check(
  "every source suite appears in the table",
  unlisted.length === 0,
  unlisted.join(", ") || ""
);

/* ---- 2 · and its number is the number it actually prints ---------------- */

const stale = [];
for (const file of runnable) {
  const row = rowOf(file);
  if (!row) continue;
  const args = NEEDS_ALIAS.has(file)
    ? ["--import", "./tests/alias.mjs", `tests/${file}`]
    : [`tests/${file}`];
  let out;
  try {
    out = execFileSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  } catch (e) {
    /* A red suite is somebody else's failure to report, not this one's — but
       its output is still countable, so the table is still checked. */
    out = `${e.stdout ?? ""}`;
  }
  const actual = (out.match(/^PASS /gm) ?? []).length;
  if (actual !== row.count) stale.push(`${file}: table says ${row.count}, suite prints ${actual}`);
}

check(
  "and every row's assertion count is what the suite prints today",
  stale.length === 0,
  stale.join("\n        ")
);

/* ---- 3 · the total is the sum of the rows -------------------------------- */

/* Including the browser rows, which this file does not run — their numbers are
   taken from the table on trust, so the TOTAL is still checked even though the
   rows behind half of it are hand-verified. */
/* Two things this regex learned the hard way. [a-z0-9.-] and not [a-z], because
   a11y.js and e2e.js carry digits; and [^|]+ for the server column, because
   ai.js answers it "yes, two of them". A pattern that quietly skips four rows
   makes the total it is checking meaningless, and it fails silently — the sum
   just comes out lower and matches nothing. */
const rows = [...readme.matchAll(/\| `[a-z0-9.-]+\.(?:test\.mjs|js)` \| [^|]+ \| (\d+) \|/g)];
const sum = rows.reduce((n, m) => n + Number(m[1]), 0);
const claimed = Number((readme.match(/\*\*([\d,]+) assertions in total\*\*/) ?? [])[1]?.replace(/,/g, ""));

check(
  "the table has rows for every suite it counts",
  rows.length >= suites.length,
  `${rows.length} rows for ${suites.length} source suites plus the browser ones`
);

check(
  "the stated total is the sum of the rows",
  sum === claimed,
  `rows add to ${sum}, the prose says ${claimed}`
);

/* ---- 4 · and the suite count in the opening line ------------------------- */

const WORDS = {
  "thirty-eight": 38, "thirty-nine": 39, forty: 40, "forty-one": 41, "forty-two": 42,
  "forty-three": 43, "twenty-four": 24, "twenty-five": 25, "twenty-six": 26,
  "twenty-seven": 27, "twenty-eight": 28, "twenty-nine": 29,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};
const opening = readme.match(/^(\S+) suites, no framework\. (\S+) need a running server; ([\w-]+) do not\./m);
check(
  "the opening line's suite counts are words for the right numbers",
  opening
    ? WORDS[opening[3].toLowerCase()] === suites.length &&
      WORDS[opening[1].toLowerCase()] === rows.length
    : false,
  opening
    ? `says ${opening[1]} suites and ${opening[3]} without a server; there are ${rows.length} rows and ${suites.length} source suites`
    : "the opening line does not match its own shape"
);

console.log(failures === 0 ? "\nSUITE TABLE OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
