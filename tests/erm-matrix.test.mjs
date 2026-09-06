import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ACSA's enterprise risk matrix — the test for an instrument that is DECLARED
 *  AND EMPTY.
 *
 *  This suite is unusual, so read why it exists before changing it.
 *
 *  The brief describes ERM as a second rating instrument carried on every
 *  hazard alongside B170 001M. B170 001M is in this repo verbatim and
 *  risk-matrix.test.mjs bands all 25 of its cells. The ERM matrix is not: its
 *  severity and likelihood wording, its band labels and its cell mapping are
 *  ACSA document content nobody has supplied.
 *
 *  Writing a plausible one would be the worst available option. A risk scale
 *  that looks official and is invented reaches an ACSA report as a number
 *  somebody acts on, and the failure is silent. It has already happened here in
 *  a different form: a severity/likelihood scale that banded correctly but
 *  meant something else, where level 3 read "Likely" and ACSA's level 3 means
 *  "unlikely but could possibly occur". Anyone rating against the label scored
 *  a notch low and nothing said so.
 *
 *  So until the real matrix arrives this suite asserts three things:
 *
 *    1. The scale is empty and available() is false.
 *    2. Nothing derives ERM from B170 001M.
 *    3. An unsupplied scale is SAID, not left blank — the screen and the export
 *       both carry the reason in words, because a blank band reads like "no
 *       risk" to anybody who did not build this.
 *
 *  When ACSA supply the matrix, fill ERM_SEVERITIES, ERM_LIKELIHOODS and
 *  ERM_BANDS in src/lib/erm.ts and REWRITE parts 1 and 2 of this file against
 *  their own table, the way risk-matrix.test.mjs is written against B170 001M —
 *  cell by cell, independently, so it disagrees with the implementation if the
 *  implementation drifts. Part 3 stands either way. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

const ermSrc = read("src", "lib", "erm.ts");
const riskSrc = read("src", "lib", "risk.ts");
const exportsSrc = read("src", "lib", "exports.ts");
const actionsSrc = read("src", "components", "RecordActions.tsx");
const typesSrc = read("src", "lib", "types.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* --------------------------------------- Part 1: the scale, as actually held */

const erm = await import(
  "data:text/javascript," +
    encodeURIComponent(
      ermSrc
        /* The file is TypeScript only in its annotations; strip those and it is
           valid JS. Importing it beats regexing it — this asserts the VALUES
           the app runs on, not the text of the file. */
        .replace(/:\s*string\[\]/g, "")
        .replace(/:\s*Record<string,\s*string>/g, "")
        .replace(/\(severity:\s*string \| null,\s*likelihood:\s*string \| null\)/g, "(severity, likelihood)")
        .replace(/\):\s*string \| null\s*\{/g, ") {")
        .replace(/\):\s*boolean\s*\{/g, ") {")
    )
);

check("ERM_SEVERITIES is empty", erm.ERM_SEVERITIES.length === 0, `${erm.ERM_SEVERITIES.length}`);
check("ERM_LIKELIHOODS is empty", erm.ERM_LIKELIHOODS.length === 0, `${erm.ERM_LIKELIHOODS.length}`);
check("ERM_BANDS is empty", Object.keys(erm.ERM_BANDS).length === 0);
check("available() is false", erm.available() === false);
check("ermCell() returns null while unavailable", erm.ermCell("A", "1") === null);
check("ermBand() returns null while unavailable", erm.ermBand("A", "1") === null);
check(
  "the reason is a sentence an auditor can act on, not a code",
  typeof erm.UNAVAILABLE_REASON === "string" && erm.UNAVAILABLE_REASON.length > 40
);
check(
  "the reason says the matrix has not been supplied",
  /has not been supplied/i.test(erm.UNAVAILABLE_REASON)
);
check(
  "the reason says what hazards ARE rated on meanwhile",
  /B170 001M/.test(erm.UNAVAILABLE_REASON)
);

/* ------------------------- Part 2: the two instruments are not wired together */

check(
  "erm.ts does not import risk.ts",
  !/from\s+["']\.\/risk["']/.test(ermSrc) && !/require\(["']\.\/risk["']\)/.test(ermSrc)
);
/* Comments stripped: the header legitimately NAMES the constants a future
   maintainer must fill in. It is the code that must not reach into risk.ts. */
const ermCode = ermSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
for (const name of ["SEVERITIES", "LIKELIHOODS", "BAND_META", "bandFor", "cellCode", "BAND_AS_RATING"]) {
  check(
    `erm.ts's code does not reference risk.ts's ${name}`,
    !new RegExp(`(^|[^A-Z_])${name}\\b`, "m").test(ermCode)
  );
}
check(
  "erm.ts carries no A-E severity scale of its own",
  !/["'][A-E]\s*-\s*(Catastrophic|Hazardous|Major|Minor|Negligible)/.test(ermSrc)
);
check(
  "risk.ts knows nothing about ERM",
  !/\bERM\b/.test(riskSrc.replace(/\/\*[\s\S]*?\*\//g, ""))
);
check(
  "erm.ts says in its own header that it must not be derived from B170 001M",
  /Do NOT derive this from B170 001M/.test(ermSrc)
);

/* The store must never write an ERM rating out of a B170 001M one. Nothing in
   the codebase may assign ermSeverity from severity. */
const allTs = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(e.name)) allTs.push([full, fs.readFileSync(full, "utf8")]);
  }
})(path.join(here, "..", "src"));

const derived = allTs.filter(([, src]) =>
  /ermSeverity\s*:\s*(f|h|record|active)?\.?severity\b/.test(src) ||
  /ermLikelihood\s*:\s*(f|h|record|active)?\.?likelihood\b/.test(src) ||
  /ermSeverity\s*:\s*BAND/.test(src)
);
check(
  "no file derives an ERM rating from the B170 001M one",
  derived.length === 0,
  derived.map(([f]) => path.basename(f)).join(", ")
);

/* -------------------------- Part 3: an unsupplied scale is said, not implied */

check(
  "the Hazard type declares the ERM fields",
  /ermSeverity:\s*string \| null;/.test(typesSrc) &&
    /ermLikelihood:\s*string \| null;/.test(typesSrc) &&
    /ermConfirmed:\s*boolean;/.test(typesSrc)
);
check(
  "ermConfirmed gates the ERM rating the way ratingConfirmed gates the other",
  /ratingConfirmed:\s*boolean;/.test(typesSrc)
);
check(
  "RecordActions asks erm.available() rather than assuming",
  /erm\.available\(\)/.test(actionsSrc)
);
check(
  "RecordActions shows the reason in words when the scale is missing",
  /erm\.UNAVAILABLE_REASON/.test(actionsSrc)
);
check(
  "RecordActions does not render an ERM picker when the scale is missing",
  /erm\.available\(\)\s*\?/.test(actionsSrc)
);
check(
  "the Hazards sheet has its own ERM columns",
  /Severity \(ACSA ERM\)/.test(exportsSrc) && /Likelihood \(ACSA ERM\)/.test(exportsSrc)
);
check(
  "the Hazards sheet keeps the two instruments in separate columns",
  /Severity \(B170 001M\)/.test(exportsSrc) && /Likelihood \(B170 001M\)/.test(exportsSrc)
);
check(
  "the export writes the unavailable reason into the ERM state column",
  /erm\.UNAVAILABLE_REASON/.test(exportsSrc)
);
check(
  "an unagreed ERM rating never reaches the ERM columns",
  /h\.ermConfirmed \?/.test(exportsSrc)
);
check(
  "the cover sheet explains the empty ERM columns",
  /not a rating of zero/i.test(exportsSrc)
);

console.log(`\n${failures === 0 ? "ERM OK" : `${failures} FAILURES`}`);
process.exit(failures ? 1 : 0);
