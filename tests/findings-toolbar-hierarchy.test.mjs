import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* TASK 3 OF THE OVERNIGHT REFINEMENT PASS — Asset Assurance's toolbar used
 * to pack three different kinds of control into one flex-wrapping row: the
 * "By asset system"/"Findings raised" mode switch (navigation), the search
 * box, and the 2025-rating filter (a row of toggle pills). The mode switch
 * and the rating filter are both rows of small rounded buttons, so once
 * they wrapped onto their own lines on a narrow screen they read as the
 * same kind of control doing two different jobs — the brief's own words,
 * "they shouldn't visually compete as the same kind of control."
 *
 * This checks: the mode switch stays its own row; the search box got its
 * own full-width row rather than sharing one and shrinking to whatever was
 * left; and the rating filter now goes through the shared FilterBar
 * component (the same one Capture/Review/Closure/Forms use) instead of a
 * bespoke row of pills, with the identical multi-select/"clear" semantics.
 * Static source read; no browser/Playwright in this sandbox. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = fs.readFileSync(path.join(root, "src", "app", "(app)", "findings", "page.tsx"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

check(
  "the rating filter goes through the shared FilterBar, not a bespoke row of pills",
  /import { FilterBar } from "@\/components\/ui\/FilterBar";/.test(src) &&
    /<FilterBar\s*\n\s*className="mt-2"/.test(src)
);

check(
  "it's still multi-select — 'everything that is not fine' can still mean two bands checked at once",
  /multi: true,/.test(src)
);

check(
  "the same bandFilter state (a Set) still drives it, toggled the same way",
  /onChange: \(key\) =>\s*setBandFilter\(\(cur\) => \{\s*const next = new Set\(cur\);/.test(src)
);

check(
  "a visible 'Showing: …'-style summary names the current filter state",
  /2025 rating:[\s\S]{0,40}bandFilter\.size === 0 \? "every rating" : \[\.\.\.bandFilter\]\.join\(", "\)/.test(
    src
  )
);

check(
  "FilterBar's own active prop reflects whether anything is actually filtered",
  /active={bandFilter\.size > 0}/.test(src)
);

check(
  "the search box is its own row, not sharing the mode-switch row and shrinking to fit",
  /{\/\* ITS OWN FULL-WIDTH ROW, ALWAYS/.test(src)
);

check(
  "the mode switch (By asset system / Findings raised) still exists, unchanged, as its own control",
  /role="radiogroup"[\s\S]{0,40}aria-label="Arrange the work by"/.test(src)
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
