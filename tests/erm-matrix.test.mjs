import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ACSA's SECOND matrix — J050 001FW Combined Assurance Framework cl. 9.2.2.
 *
 * This exists for the same reason the B170 test does, and for one more: the two
 * matrices look similar enough to be confused, and their consequence axes run in
 * OPPOSITE directions. B170 severity goes A (Catastrophic) → E (Negligible);
 * ERM consequence goes 5 (Catastrophic) → 1 (Minor). Anyone "tidying" the two
 * into one shape inverts this matrix silently, and the priorities stay
 * plausible-looking while being exactly wrong. */

const here = path.dirname(fileURLToPath(import.meta.url));
const erm = fs.readFileSync(path.join(here, "..", "src", "lib", "erm.ts"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* Part 1 — the grid, transcribed independently from the framework PDF.
   Rows are consequence 5→1, columns likelihood 1→5. */
const EXPECTED = {
  "5": ["II", "I", "I", "I", "I"],
  "4": ["II", "II", "I", "I", "I"],
  "3": ["III", "II", "II", "I", "I"],
  "2": ["III", "III", "II", "II", "I"],
  "1": ["III", "III", "III", "II", "II"],
};

/* Pull the PRIORITY table straight out of the source. */
const block = erm.slice(erm.indexOf("const PRIORITY"), erm.indexOf("export function ermPriority"));
for (const [cons, row] of Object.entries(EXPECTED)) {
  const line = block.split("\n").find((l) => l.trim().startsWith(`"${cons}":`));
  check(`consequence ${cons} row is present`, !!line);
  if (!line) continue;
  row.forEach((want, i) => {
    const lik = String(i + 1);
    const m = line.match(new RegExp(`"${lik}":\\s*"(I{1,3})"`));
    check(`cell consequence ${cons} × likelihood ${lik} is ${want}`, m && m[1] === want, m ? m[1] : "missing");
  });
}

/* Part 2 — the distribution: 10 I, 9 II, 6 III.
   Worth stating plainly, because B170's split is 6 Red / 12 Amber / 7 Green.
   The ERM matrix is markedly harsher: 10 of its 25 cells demand immediate
   action where B170 puts 6 in Red. That is a real difference between the two
   instruments, not an error in either. */
const counts = { I: 0, II: 0, III: 0 };
Object.values(EXPECTED).forEach((r) => r.forEach((p) => counts[p]++));
check("ten cells are Priority I (Unacceptable)", counts.I === 10, String(counts.I));
check("nine cells are Priority II (Tolerable)", counts.II === 9, String(counts.II));
check("six cells are Priority III (Acceptable)", counts.III === 6, String(counts.III));
check("all 25 cells are accounted for", counts.I + counts.II + counts.III === 25);

/* Part 3 — the axis direction, which is the trap. */
check(
  "consequence runs 5 Catastrophic down to 1 Minor",
  /"5 - Catastrophic"[\s\S]{0,120}"1 - Minor"/.test(erm)
);
check("consequence is NOT lettered A-E like B170", !/"A - /.test(erm));
check(
  "likelihood carries ACSA's own words",
  ["Not Likely", "Slight", "Highly Likely", "Expected"].every((w) => erm.includes(w))
);
check(
  "the percentage bands from the template are carried",
  erm.includes("25% to 54%") && erm.includes("Greater than 85%")
);

/* Part 4 — tolerance vocabulary and the scoping rule. */
check("I is Unacceptable", /I:\s*\{[\s\S]{0,80}Unacceptable/.test(erm));
check("II is Tolerable", /II:\s*\{[\s\S]{0,80}Tolerable/.test(erm));
check("III is Acceptable", /III:\s*\{[\s\S]{0,80}Acceptable/.test(erm));
check(
  "cl. 9.1.2 — I and II enter the assurance plan",
  /entersAssurancePlan[\s\S]{0,160}p === "I" \|\| p === "II"/.test(erm)
);

/* Part 5 — the two instruments must not be silently fused. */
check(
  "the ERM suggestion is declared as an assumption, not a conversion",
  erm.includes("likelihoodIsAssumed")
);
check(
  "the file says why the likelihood axes cannot be converted",
  /OCCURRENCE-based/.test(erm) && /PROBABILITY-based/.test(erm)
);

/* ---- Part 5: the two instruments stay separate in the CODE, not only in the
       comments. Carried over from the suite this file replaces, which guarded
       an erm.ts that was declared and deliberately empty while ACSA had not
       supplied the scale. The scale has now arrived; the separation it was
       protecting has not stopped mattering. */

const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const riskSrc = read("src", "lib", "risk.ts");
const typesSrc = read("src", "lib", "types.ts");
const actionsSrc = read("src", "components", "RecordActions.tsx");
const exportsSrc = read("src", "lib", "exports.ts");
const ermCode = erm.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

check(
  "erm.ts does not import risk.ts's scales",
  !/from\s+["']\.\/risk["']/.test(ermCode),
  "it imports the Severity and Likelihood TYPES for suggestErm, and nothing else"
);
for (const name of ["SEVERITIES", "LIKELIHOODS", "BAND_META", "bandFor", "cellCode", "BAND_AS_RATING"]) {
  check(
    `erm.ts's code does not use risk.ts's ${name}`,
    !new RegExp(`(^|[^A-Z_])${name}\\b`, "m").test(ermCode)
  );
}
check(
  "risk.ts knows nothing about ERM",
  !/\bERM\b/.test(riskSrc.replace(/\/\*[\s\S]*?\*\//g, ""))
);

/* ---- CONTAMINATION RUNS BOTH WAYS, and only one way was tested -------------

   tests/risk-matrix.test.mjs bans ERM's nine labels from risk.ts. That guards
   the direction the June defect actually travelled — ERM's words onto B170's
   axis, where level 3 read "Likely" and ACSA's B170 level 3 means the opposite.

   Nothing guarded the return trip. B170's words on the ERM axis would be just
   as wrong and rather harder to notice, because ERM's likelihood is a
   probability band: "3 - Remote" sitting where "3 - Likely (25%–54%)" belongs
   reads like a definition rather than a mistake.

   These eight words are B170's alone — no level of the ERM scale uses any of
   them — so a bare-word match is safe here. The four that DO collide
   (Catastrophic, Minor, Likely, Slight) are asserted below on the full label
   including its index, never on the word, because both instruments use them at
   different levels and a bare-word test passes when the label is wrong. */
const B170_ONLY_WORDS = [
  "Hazardous",
  "Major",
  "Negligible",
  "Extremely Improbable",
  "Improbable",
  "Remote",
  "Occasional",
  "Frequent",
];
for (const w of B170_ONLY_WORDS) {
  check(
    `B170's "${w}" has not reached the ERM instrument`,
    !new RegExp(`\\b${w}\\b`).test(ermCode),
    "comments may discuss the other instrument; the code may not carry its words"
  );
}

/* The colliding four, on the full label. "Minor" is the dangerous one: it is
   B170 severity D and ERM consequence 1, so the bare word is true of both and
   proves nothing about either. */
for (const label of ["D - Minor", "A - Catastrophic", "E - Negligible", "3 - Remote"]) {
  check(
    `the B170 label "${label}" is not in the ERM module`,
    !erm.includes(`"${label}"`)
  );
}
for (const label of ["5 - Catastrophic", "1 - Minor", "3 - Likely", "2 - Slight"]) {
  check(
    `the ERM label "${label}" IS in the ERM module, where it belongs`,
    erm.includes(`"${label}"`)
  );
}

/* The five cells. Computed here from both instruments rather than asserted as
   a remembered number, so the day either grid is edited this says so. */
const RED = new Set(["5A", "5B", "5C", "4A", "4B", "3A"]);
const AMBER = new Set(["5D","5E","4C","4D","4E","3B","3C","3D","2A","2B","2C","1A"]);
const b170Band = (c) => (RED.has(c) ? "Red" : AMBER.has(c) ? "Amber" : "Green");
const consFor = { A: "5", B: "4", C: "3", D: "2", E: "1" };
const asBand = { I: "Red", II: "Amber", III: "Green" };
const disagree = [];
for (const S of ["A", "B", "C", "D", "E"]) {
  for (const L of ["1", "2", "3", "4", "5"]) {
    const ermSaid = asBand[EXPECTED[consFor[S]][Number(L) - 1]];
    if (ermSaid !== b170Band(`${L}${S}`)) disagree.push(`${L}${S}`);
  }
}
check(
  "the two instruments disagree on exactly five cells",
  disagree.length === 5,
  disagree.join(",")
);
check(
  "and they are 1B, 2A, 3B, 4C, 5D — the five the Rev A2 register was queried over",
  disagree.slice().sort().join(",") === "1B,2A,3B,4C,5D",
  disagree.slice().sort().join(",")
);
check(
  "ERM is the harsher instrument everywhere they differ",
  disagree.every((cell) => {
    const L = cell[0], S = cell[1];
    const rank = { Green: 0, Amber: 1, Red: 2 };
    return rank[asBand[EXPECTED[consFor[S]][Number(L) - 1]]] > rank[b170Band(cell)];
  }),
  "10/9/6 against 6/12/7 — if ERM ever reads softer, one of the grids has been inverted"
);

/* Gating. A rating the team did not agree reaches nothing, on either
   instrument, and a carried likelihood is not an agreement. */
check(
  "the Hazard type carries the ERM axis by its own name",
  /ermConsequence: ErmConsequence \| null;/.test(typesSrc) &&
    /ermLikelihood: ErmLikelihood \| null;/.test(typesSrc) &&
    /ermConfirmed: boolean;/.test(typesSrc),
  "calling it ermSeverity is how the two axes get treated as the same axis"
);
check(
  "a carried likelihood is recorded as an assumption",
  /ermLikelihoodAssumed: boolean;/.test(typesSrc)
);
check(
  "carrying the B170 rating across does not agree the ERM one",
  /ermConfirmed: false,/.test(actionsSrc) && /likelihoodIsAssumed/.test(actionsSrc),
  "a derived rating that arrives agreed is the silent conversion this instrument forbids"
);
check(
  "tapping an ERM cell clears the assumption",
  /ermLikelihoodAssumed: false,/.test(actionsSrc)
);
check(
  "and the screen says the carried likelihood was not agreed",
  /carried across, not agreed/.test(actionsSrc)
);
check(
  "an unagreed ERM rating reaches no export column",
  /h\.ermConfirmed \? \(h\.ermConsequence \?\? ""\) : ""/.test(exportsSrc)
);
check(
  "the export carries the priority, the tolerance and the response",
  /ERM priority/.test(exportsSrc) &&
    /ERM tolerance/.test(exportsSrc) &&
    /ERM response \(cl\. 9\.2\.2\)/.test(exportsSrc)
);
check(
  "and clause 9.1.2 — whether it enters the Combined Assurance Coverage Plan",
  /Combined Assurance Coverage Plan \(cl\. 9\.1\.2\)/.test(exportsSrc) &&
    /entersAssurancePlan/.test(exportsSrc),
  "this is the reason the ERM rating is carried at all"
);
check(
  "the workbook explains the two instruments to whoever opens it",
  /J050 001FW/.test(exportsSrc) && /1B, 2A, 3B, 4C, 5D/.test(exportsSrc)
);

console.log(`\n${failures === 0 ? "ERM MATRIX OK" : `${failures} FAILURES`}`);
process.exit(failures ? 1 : 0);
