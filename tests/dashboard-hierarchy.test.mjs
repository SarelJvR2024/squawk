import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* TASK 7 OF THE OVERNIGHT REFINEMENT PASS — three visual-hierarchy fixes to
 * the Dashboard, none of which may change a number, a denominator, or a
 * calculation:
 *
 *   1. The nine `kpi()` tiles (five headline numbers + four status-outcome
 *      numbers) all carried the same card/border/accent-stripe/23px-number
 *      treatment — nothing told a reader that four of the nine are a
 *      breakdown OF one of the other five ("Check-points assessed"), not
 *      four more facts of the same weight. The four status numbers now
 *      render through a separate, quieter `breakdown()` helper.
 *   2. The risk-profile heat map sat in a CSS grid row beside the asset
 *      table and stretched to match its height — default grid behaviour,
 *      and wrong for a tiny fixed heat map beside a table with one row per
 *      asset system. `items-start` stops the stretch.
 *   3. The asset table's six columns would otherwise compress illegibly on
 *      a phone; `whitespace-nowrap` on every cell lets the table overflow
 *      instead, and a visible "scroll for every column" caption (real
 *      text, not a decorative-only cue) names that overflow rather than
 *      leaving it to be discovered by accident.
 *
 * This reads the source for all three; it is not a rendered/visual test
 * (no browser/Playwright in this sandbox — see the final report) and does
 * not touch the numbers themselves, which the pre-existing scope.test.mjs/
 * sites.test.mjs already exercise against this same file. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = fs.readFileSync(path.join(root, "src", "app", "(app)", "dashboard", "page.tsx"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

check(
  "a separate, quieter renderer exists for the status breakdown",
  /const breakdown = \(label: string, value: number/.test(src)
);

check(
  "the breakdown renderer has no card border or accent stripe — it is visually subordinate to kpi()",
  (() => {
    const m = src.match(/const breakdown = \(label: string, value: number[\s\S]*?\n  \);/);
    return !!m && !/rounded-\[16px\] border/.test(m[0]) && !/absolute inset-x-0 top-0/.test(m[0]);
  })()
);

check(
  "all four status numbers (Compliant/Non-compliant/Awaiting evidence/Not applicable) go through it",
  /breakdown\("Compliant", stats\.C, "good"\)/.test(src) &&
    /breakdown\("Non-compliant", stats\.NC, "bad"\)/.test(src) &&
    /breakdown\("Awaiting evidence", stats\.NV, "warn"\)/.test(src) &&
    /breakdown\("Not applicable", stats\.NA\)/.test(src),
  "the four numbers themselves (stats.C / stats.NC / stats.NV / stats.NA) must be unchanged"
);

check(
  "the five headline tiles still go through the original kpi() renderer, unchanged",
  // The accent-sweep pass (#175, merged after this test was written) correctly
  // dropped the "acc" tone from this tile — it's a passive count, not a status
  // or selection — so this no longer asserts a tone argument, just that the
  // tile is still rendered through kpi() rather than some other renderer.
  /kpi\(`\$\{visitLabel\} rating`/.test(src) &&
    /kpi\("Check-points assessed", `\$\{stats\.captured\}\/\$\{stats\.total\}`\)/.test(src)
);

check(
  "the asset-table / risk-profile grid no longer stretches both panels to equal height",
  /grid items-start gap-3\.5 lg:grid-cols-\[1\.4fr_1fr\]/.test(src)
);

check(
  "the asset table's cells don't compress — they overflow instead",
  (src.match(/whitespace-nowrap/g) ?? []).length >= 6,
  "every column (discipline, asset system, assessed, severity, likelihood, tolerance) needs it, or some will still compress"
);

check(
  "a real, visible caption names the overflow rather than leaving it silent",
  /scroll for every column/.test(src)
);

check(
  "'Not yet rated' is still a neutral pill, never implied by a colour or a blank",
  /<Pill tone="neutral">Not yet rated<\/Pill>/.test(src)
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
