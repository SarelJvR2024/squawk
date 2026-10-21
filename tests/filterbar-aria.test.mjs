import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* TASK 3 OF THE OVERNIGHT REFINEMENT PASS — FilterBar's selected-state
 * accessibility. Before this, every single-select chip row (Closure's
 * status row, Capture's NC/Open pin, Review's filters, Forms' Form/Status
 * rows — every FilterGroup without `multi: true`) rendered
 * `aria-pressed={group.multi ? selected : undefined}`, which is `undefined`
 * on every single-select chip whether or not it is the one chosen: a screen
 * reader had no way to tell which chip, if any, was selected. A multi-select
 * row (`multi: true`) is a set of independent toggles and keeps
 * `aria-pressed`, which is already the right role for that shape — this
 * only had to fix the single-select case, and had to do it without
 * resetting multi-select's own correct behaviour. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = fs.readFileSync(path.join(root, "src", "components", "ui", "FilterBar.tsx"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

check(
  "a single-select group's chip row is exposed as a radiogroup",
  /role={single \? "radiogroup" : undefined}/.test(src)
);

check(
  "each chip in a single-select group is a radio with its selected state exposed",
  /role={single \? "radio" : undefined}/.test(src) &&
    /aria-checked={single \? selected : undefined}/.test(src)
);

check(
  "multi-select chips keep aria-pressed, unchanged",
  /aria-pressed={group\.multi \? selected : undefined}/.test(src),
  "the fix is additive for single-select; multi-select's own correct behaviour must not move"
);

check(
  "single and multi are mutually exclusive, derived from the same flag",
  /const single = !group\.multi;/.test(src)
);

check(
  "the visible caption doubles as the radiogroup's accessible name rather than being announced twice",
  /aria-label={single \? group\.label : undefined}/.test(src) &&
    /aria-hidden={single \|\| undefined}/.test(src)
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
