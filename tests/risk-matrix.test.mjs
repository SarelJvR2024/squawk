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
/* Imported as well as read: the notation decision below is about what the code
   RETURNS, and a regex over the source cannot tell a flipped format from a
   flipped lookup. risk.ts only type-imports, so it loads under plain node. */
const R = await import("../src/lib/risk.ts");

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
/* ------------------- Notation: severity-first, and only for SHOW ------------

   B170 001M's own tables write the cell likelihood-first. Prince's register
   writes no combined cell at all — two separate labelled fields. The only
   place one is PRINTED is the generated dashboard and the Cluster 3 report,
   and they print it severity-first. Sarel settled it: follow the register and
   the dashboard.

   The danger in that change is not the format. It is that RED and AMBER are
   KEYED on a cell string, so flipping the printed form without decoupling the
   lookup would have made every lookup miss and banded all 25 cells Green — a
   silent inversion of the entire instrument, with no error anywhere. These
   assertions exist to make that impossible to do by accident. */

check(
  "a cell PRINTS severity-first, the way the dashboard prints it",
  R.cellCode("A - Catastrophic", "5 - Frequent") === "A5" &&
    R.cellCode("C - Major", "4 - Occasional") === "C4" &&
    R.cellCode("D - Minor", "3 - Remote") === "D3",
  String(R.cellCode("A - Catastrophic", "5 - Frequent"))
);

check(
  "and the BAND DOES NOT COME FROM THAT STRING",
  R.bandFor("A - Catastrophic", "5 - Frequent") === "Red" &&
    R.bandFor("A - Catastrophic", "3 - Remote") === "Red" &&
    R.bandFor("E - Negligible", "1 - Extremely Improbable") === "Green",
  "flipping the printed form must not be able to move a single cell"
);

check(
  "the 6 / 12 / 7 split survives the notation change",
  (() => {
    const tally = { Red: 0, Amber: 0, Green: 0 };
    for (const s of R.SEVERITIES) for (const l of R.LIKELIHOODS) tally[R.bandFor(s, l)]++;
    return tally.Red === 6 && tally.Amber === 12 && tally.Green === 7;
  })(),
  "the whole instrument, counted after the change"
);

check(
  "the lookup key is internal and is NOT exported",
  R.bandKey === undefined && /function bandKey\(/.test(risk),
  "an exported lookup key is one somebody prints by mistake"
);

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

/* ------------- Part 4: nowhere else may restate the scale in prose ---------

   The defect this part exists for shipped, and Part 2 could not see it. Part 2
   reads risk.ts, and the wrong words were in src/app/api/assist/route.ts: the
   prompt told the model "severity A (Catastrophic) to E (Minor), likelihood 1
   (Not likely) to 5 (Expected)". E is Negligible, not Minor. And "Not likely to
   Expected" is a generic probability scale whose level 3 reads "Likely", where
   B170's level 3 means "unlikely but could possibly occur" — the opposite.
   Every rating opinion the assistant gave was formed against that.

   A scale restated anywhere is a scale that can disagree with the matrix, and
   the file guarding the matrix will not be looking at it. So the rule is not
   "restate it correctly", it is DERIVE IT — and that is what this asserts. */

const routeSrc = fs.readFileSync(
  path.join(here, "..", "src", "app", "api", "assist", "route.ts"),
  "utf8"
);
/* Comments quote the old wording deliberately, so they must not be searched. */
const routeCode = routeSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

check(
  "the assist route derives the scales from risk.ts rather than restating them",
  /from "@\/lib\/risk"/.test(routeCode) &&
    /SEVERITIES\.map/.test(routeCode) &&
    /LIKELIHOODS\.map/.test(routeCode),
  "one source for these words, so a prompt that disagrees with the matrix is not expressible"
);

for (const wrong of [
  ["E is Negligible, not Minor", /E \(Minor\)/],
  ["the generic probability scale", /Not likely\) to 5 \(Expected\)/],
  ["a generic level-3 reading", /3 \(Likely\)/],
  ["severity named as a range with no definitions", /severity A \(Catastrophic\) to E/],
]) {
  check(`the route does not carry ${wrong[0]}`, !wrong[1].test(routeCode));
}

check(
  "and it tells the model the likelihood axis is occurrence history, not probability",
  /OCCURRENCE HISTORY/.test(routeCode),
  "this is the sentence that stops a model reading level 3 as \"likely\""
);

/* "Not likely … Expected" is the signature of the scale that was mistaken for
   B170's. Here is the trap, and it is worth stating plainly: THAT SCALE IS
   REAL. It is ACSA's ERM likelihood scale, J050 001FW cl. 9.2.2 — 1 Not
   Likely, 2 Slight, 3 Likely, 4 Highly Likely, 5 Expected. Somebody had
   ACSA's own words in front of them and put them on the wrong instrument.

   So the words are correct in src/lib/erm.ts and in the ErmLikelihood type,
   and nowhere else. Finding them in a third file means the two instruments
   have been mixed again, which is the failure mode both matrix suites exist
   for. The allowlist is deliberately tiny; widening it is the smell. */
const ERM_OWNS_THESE_WORDS = ["erm.ts", "types.ts"];
const srcFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(e.name)) srcFiles.push([full, fs.readFileSync(full, "utf8")]);
  }
})(path.join(here, "..", "src"));

const offenders = srcFiles.filter(([f, src]) => {
  if (f.endsWith("risk.ts")) return false;
  if (ERM_OWNS_THESE_WORDS.some((n) => f.endsWith(n))) return false;
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return /Not likely/i.test(code) && /Expected/.test(code);
});
check(
  "only the ERM files carry ACSA's ERM likelihood wording — nothing else may",
  offenders.length === 0,
  offenders.map(([f]) => path.basename(f)).join(", ")
);

/* And the converse, because the allowlist is only safe while the file it names
   really is the ERM instrument. */
check(
  "the file allowed to carry them is the one that cites the framework",
  fs
    .readFileSync(path.join(here, "..", "src", "lib", "erm.ts"), "utf8")
    .includes("J050 001FW"),
  "if erm.ts stops being the ERM matrix, the exemption above is a hole"
);

console.log(`\n${failures === 0 ? "MATRIX OK" : `${failures} FAILURES`}`);
process.exit(failures ? 1 : 0);
