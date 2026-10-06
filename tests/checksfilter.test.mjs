/* The checks page's filter chips — Sarel: "add a filter for NA categories in
 *  the checks page."
 *
 *  Not Applicable already had its own compliance value and its own dot colour
 *  on the row; what it did not have was a way to see only those checks once
 *  they are scattered through a 56-row discipline. Same shape as the
 *  existing NC/2025 chips — a filter the auditor can toggle, nothing that
 *  changes how an answer is captured or saved.
 *
 *  Source-read, like capture.test.mjs's own suite — the filter chips are a
 *  short, literal array and a short, literal predicate, and reading them is
 *  more reliable here than mounting the tree to click a chip. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const page = src("app", "(app)", "capture", "page.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

check(
  "the Filter type has a case for N/A",
  /type Filter = "all" \| "open" \| "q" \| "nc" \| "na" \| "pf"/.test(page)
);

check(
  "an N/A chip is offered alongside NC and 2025, in the same chip array",
  /\["nc", "NC"\], \["na", "N\/A"\], \["pf", "2025"\]/.test(page)
);

check(
  "picking it filters on the compliance value N/A, the same value the portal and the dot colour both use",
  /if \(filter === "na"\) list = list\.filter\(\(c\) => responses\[c\.id\]\?\.compliance === "N\/A"\);/.test(page)
);

console.log(failures === 0 ? "\nCHECKS FILTER OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exitCode = failures ? 1 : 0;
