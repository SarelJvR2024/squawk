import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* TASK 3 OF THE OVERNIGHT REFINEMENT PASS — Inspection's search used to live
 * inside the FilterPopover, behind a tap on the "Filters · …" button: the
 * one way an auditor standing at an asset finds the check for it was hidden
 * behind the control that also changes what is filtered. This checks the
 * search box now sits OUTSIDE the <FilterPopover>…</FilterPopover> block in
 * the source, rather than between its open and close tags, and that the
 * popover still carries the axis switch and the discipline/location select
 * (nothing about grouping/filtering availability was removed — only where
 * search sits moved). Static source read; no browser in this sandbox. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const page = fs.readFileSync(path.join(root, "src", "app", "(app)", "field", "page.tsx"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const popoverOpen = page.indexOf("<FilterPopover");
const popoverClose = page.indexOf("</FilterPopover>");
const searchInput = page.indexOf('aria-label="Search any check"');

check(
  "the FilterPopover block is findable once, in order",
  popoverOpen !== -1 && popoverClose !== -1 && popoverOpen < popoverClose
);

check(
  "the search box exists exactly once",
  (page.match(/aria-label="Search any check"/g) ?? []).length === 1
);

check(
  "the search box sits BEFORE the FilterPopover opens — not nested inside it",
  searchInput !== -1 && searchInput < popoverOpen,
  "search must be reachable without opening Filters, not buried inside the popover"
);

check(
  "the axis switch (By discipline / By location) is still inside the popover",
  /radiogroup[\s\S]{0,80}Group the list by/.test(page.slice(popoverOpen, popoverClose))
);

check(
  "the discipline/location select is still inside the popover",
  /<DisciplineSelect/.test(page.slice(popoverOpen, popoverClose))
);

check(
  "the photo-linkage filters are still inside the popover",
  /Photo filters/.test(page.slice(popoverOpen, popoverClose))
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
