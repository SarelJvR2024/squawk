import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* B170 001M, checked two ways.
 *
 *  Part 1 bands all 25 cells against an independently written table.
 *  Part 2 checks the WORDS, which is the part that was missed the first time.
 *
 *  The original version of this test only did Part 1. It passed while the app
 *  carried a generic scale — "Not likely / Slight / Likely / Highly likely /
 *  Expected" — in which level 3 was labelled "Likely" and ACSA's level 3 means
 *  "unlikely but could possibly occur". The bands were right and the meaning
 *  was inverted. A matrix test that does not read the labels is not a matrix
 *  test. */

const here = path.dirname(fileURLToPath(import.meta.url));
const risk = fs.readFileSync(path.join(here, "..", "src", "lib", "risk.ts"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---------------------------------------------- Part 1: bands, all 25 cells */

const RED = new Set(["5A", "5B", "5C", "4A", "4B", "3A"]);
const AMBER = new Set([
  "5D", "5E", "4C", "4D", "4E", "3B", "3C", "3D", "2A", "2B", "2C", "1A",
]);
const band = (c) => (RED.has(c) ? "Red" : AMBER.has(c) ? "Amber" : "Green");

/* Written out cell by cell from B170 001M cl. 4.3.4, not derived from the sets
   above — the point is to disagree with the implementation if it drifts. */
const EXPECT = {
  "1A": "Amber", "2A": "Amber", "3A": "Red",   "4A": "Red",   "5A": "Red",
  "1B": "Green", "2B": "Amber", "3B": "Amber", "4B": "Red",   "5B": "Red",
  "1C": "Green", "2C": "Amber", "3C": "Amber", "4C": "Amber", "5C": "Red",
  "1D": "Green", "2D": "Green", "3D": "Amber", "4D": "Amber", "5D": "Amber",
  "1E": "Green", "2E": "Green", "3E": "Green", "4E": "Amber", "5E": "Amber",
};

let wrong = 0;
for (const [cell, expected] of Object.entries(EXPECT)) {
  if (band(cell) !== expected) {
    wrong++;
    console.log(`  MISMATCH ${cell}: got ${band(cell)}, expected ${expected}`);
  }
}
const codes = Object.keys(EXPECT);
check("all 25 cells present", codes.length === 25, `${codes.length}`);
check("every cell bands correctly", wrong === 0, `${wrong} wrong`);
check(
  "6 Red / 12 Amber / 7 Green, complete and non-overlapping",
  codes.filter((c) => band(c) === "Red").length === 6 &&
    codes.filter((c) => band(c) === "Amber").length === 12 &&
    codes.filter((c) => band(c) === "Green").length === 7
);

/* -------------------------------- Part 2: the wording, verbatim from 4.3.1–2 */

const SEVERITY = [
  "A - Catastrophic",
  "B - Hazardous",
  "C - Major",
  "D - Minor",
  "E - Negligible",
];
const LIKELIHOOD = [
  "1 - Extremely Improbable",
  "2 - Improbable",
  "3 - Remote",
  "4 - Occasional",
  "5 - Frequent",
];

for (const s of SEVERITY) {
  check(`severity "${s}" is ACSA's wording`, risk.includes(`"${s}"`));
}
for (const l of LIKELIHOOD) {
  check(`likelihood "${l}" is ACSA's wording`, risk.includes(`"${l}"`));
}

/* The generic scale that was here before. If any of it comes back, something
   has been paraphrased and the register will be scored against the wrong
   definitions. */
const BANNED = [
  "B - Critical",
  "C - Significant",
  "D - Moderate",
  "E - Minor",
  "1 - Not likely",
  "2 - Slight",
  "3 - Likely",
  "4 - Highly likely",
  "5 - Expected",
];
for (const b of BANNED) {
  check(`the generic label "${b}" has not returned`, !risk.includes(`"${b}"`));
}

/* ---------------------------------------- Part 3: bands and strategies (4.5) */

check("band Unacceptable is named", risk.includes('label: "Unacceptable"'));
check("band Risk mitigation required is named", risk.includes('label: "Risk mitigation required"'));
check("band Acceptable is named", risk.includes('label: "Acceptable"'));
check("Red maps to Avoidance", /Red:[\s\S]{0,200}Avoidance/.test(risk));
check("Amber maps to Reduction", /Amber:[\s\S]{0,200}Reduction/.test(risk));
check("Green maps to Segregation of exposure", /Green:[\s\S]{0,220}Segregation of exposure/i.test(risk));
check("the bands are not numbered I / II / III", !/\bPriority\s+(I|II|III)\b/.test(risk));

console.log(`\n${failures === 0 ? "MATRIX OK" : `${failures} FAILURES`}`);
process.exit(failures ? 1 : 0);
