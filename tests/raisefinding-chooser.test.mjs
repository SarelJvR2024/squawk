import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* TASK 6 OF THE OVERNIGHT REFINEMENT PASS — "Raise a finding"'s asset-system
 * field used to render every matching system (up to 40) as an always-visible
 * row of pill chips the moment the field was reached: the "wall of chips"
 * the brief names, and a different shape from the check-point field right
 * below it, which already showed results only once there was something to
 * search for. This checks the asset-system field now matches that same
 * search-first pattern, drawing from the identical `systems` list and
 * discipline scoping — no option source, filtering rule, or default
 * selection changed, only when the results render. Static source read; no
 * browser/Playwright in this sandbox. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = fs.readFileSync(path.join(root, "src", "components", "RaiseFindingSheet.tsx"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

check(
  "the asset-system results only render once there is something to search for",
  /{systemQuery\.trim\(\) && \(/.test(src),
  "a chooser that still renders every option unconditionally is the wall of chips, just restyled"
);

check(
  "the same `systems` list — same option source, same discipline scoping — still feeds it",
  /systems\.length === 0[\s\S]{0,260}systems\.map\(\(s\)/.test(src)
);

check(
  "picking a result sets the same `system` state the cleared/chosen view reads",
  /onClick={\(\) => \{\s*setSystem\(s\);\s*setSystemQuery\(""\);/.test(src)
);

check(
  "a chosen asset system still shows as a clear, selected value with an obvious way to clear it",
  /{system \? \(/.test(src) && /aria-label="Clear asset system"/.test(src)
);

check(
  "the check-point chooser (the pattern this now matches) is unchanged",
  /{checkQuery\.trim\(\) && \(/.test(src)
);

check(
  "every field stays optional and the one required field is unchanged",
  /Pick a discipline\. Asset system and check-point are both optional, this is not\./.test(src)
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
