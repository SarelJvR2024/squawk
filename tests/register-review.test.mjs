import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE REGISTER REVIEW, AS A THING THAT CANNOT SILENTLY DRIFT FROM THE REGISTER.
 *
 * Sarel: "the first things i want us to review in the 324 audit checks is to
 * critically look at it whether it requires a discussion to confirm compliance
 * or an actual piece of evidence like a COC or something that need to be
 * inspected physically in the airport or asset… it feels like there is too many
 * checks in multiple categories. do a thorough check again to determine how we
 * will confirm the compliance of an item. lets make this our first review and
 * along with it let record exactly what should be inspected and what we are
 * looking for as evidence to make the check compliant."
 *
 * And, narrowing what "physical" means: "look at what to inspect or what the
 * check and requirement refer to, is it something physical like an asset, a
 * color, a vent etc then its something to go see."
 *
 * The vocabulary he agreed is Document / Asset / Practice. These assertions are
 * about the ONE way this review can rot: register-review.json is a second file
 * keyed by check id, so a check added, renamed or removed in checks.json leaves
 * it quietly wrong — a classification for an id nobody audits, or an audited
 * check with no classification and an empty column in the workbook.
 *
 * They deliberately do NOT assert what any individual check was classified as.
 * That is a judgement Sarel is reviewing, and a test that pins it would turn his
 * review into a test failure.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const checks = JSON.parse(read("src", "data", "checks.json"));
const review = JSON.parse(read("src", "data", "source", "register-review.json"));
const script = read("register-review.mjs");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · every check, and only checks ----------------------------------- */

const ids = new Set(checks.map((c) => c.id));
const missing = checks.filter((c) => !review[c.id]).map((c) => c.id);
const stray = Object.keys(review).filter((k) => !ids.has(k));

check(
  "every check in the register is classified",
  missing.length === 0,
  missing.slice(0, 5).join(", ")
);

check(
  "and nothing is classified that is not a check",
  stray.length === 0,
  stray.slice(0, 5).join(", ")
);

check(
  "the review is in register order",
  Object.keys(review).join("|") === checks.map((c) => c.id).join("|"),
  "the workbook reads them in this order; out of order it stops matching the register a reviewer has open beside it"
);

/* ---- 2 · the vocabulary is closed --------------------------------------- */

const BY = new Set(["Document", "Asset", "Practice"]);
const INSPECT = new Set(["examine", "reconcile", "none"]);

check(
  "confirmedBy is one of the three Sarel agreed",
  Object.values(review).every((r) => BY.has(r.by)),
  "Document / Asset / Practice — a fourth would be a new decision, not a classification"
);

check(
  "and the threshold is NOT one of them",
  !Object.values(review).some((r) => /threshold|specification|requirement/i.test(r.by)),
  "274 of the 324 carry a measurable figure, so a Specification category would swallow the register and say nothing"
);

check(
  "go-and-see is one of three, and is a separate axis from confirmedBy",
  Object.values(review).every((r) => INSPECT.has(r.inspect)),
  ""
);

check(
  "a Document check may still be reconcile",
  Object.values(review).some((r) => r.by === "Document" && r.inspect === "reconcile"),
  "a calibration certificate IS the compliance, and the walk is what proves it belongs to the meter in front of you — collapsing the two axes loses that"
);

check(
  "every classification is argued, not just asserted",
  Object.values(review).every((r) => typeof r.why === "string" && r.why.length > 20),
  "the why column is what Sarel is reviewing; a blank one is a row he cannot overrule"
);

/* ---- 3 · a stub is never left as the compliance test --------------------- */

/* The 95 checks whose evidenceExpected is under 40 characters — "Test records",
   "Inspection; programme", and 9 that are simply empty — are the reason for the
   review. Each has to carry a written line saying what actually makes it
   compliant, or the workbook prints the stub back at the auditor. */
const evidenceOf = (c) =>
  Array.isArray(c.evidenceExpected) ? c.evidenceExpected.join(" ") : String(c.evidenceExpected ?? "");
const stubs = checks.filter((c) => evidenceOf(c).trim().length < 40);
const stubsWithoutProof = stubs.filter((c) => !review[c.id]?.proof);

check(
  "every check with a stub for its evidence carries a written compliance test",
  stubsWithoutProof.length === 0,
  `${stubsWithoutProof.length} of ${stubs.length} stubs still fall back to the stub: ${stubsWithoutProof
    .slice(0, 4)
    .map((c) => c.id)
    .join(", ")}`
);

check(
  "and a gap note is recorded against them",
  stubs.every((c) => (review[c.id]?.gaps ?? []).some((g) => /evidence stub|NO evidence stated|no ACSA evidence/i.test(g))),
  "the stub is the finding; fixing the column without recording that it was a stub loses the argument for re-cutting the register"
);

/* ---- 4 · gaps and proposals are text a person reads ---------------------- */

check(
  "gaps are a list, never a sentence with semicolons in it",
  Object.values(review).every((r) => r.gaps === undefined || Array.isArray(r.gaps)),
  "the Gaps sheet is one row per note, so each has to be its own decision"
);

check(
  "no gap note is empty",
  Object.values(review).every((r) => (r.gaps ?? []).every((g) => typeof g === "string" && g.length > 10)),
  ""
);

check(
  "the five source conflicts are all recorded",
  ["KSIA-MEC-037", "KSIA-MEC-075", "KSIA-MEC-077", "KSIA-MEC-038", "KSIA-MEC-091"].every((id) =>
    (review[id]?.gaps ?? []).some((g) => /CONFLICT|WRONG SYSTEM|ACSA .* says|conflicting/i.test(g))
  ),
  "MEC-037 is the sharp one: the check says the FALE fuel piping pressure test is 3-yearly, ACSA D060 021M cl. 4.17.5 says YEARLY — auditing to the check would pass an installation two years overdue"
);

/* ---- 5 · the review does not edit the master data ------------------------ */

check(
  "the review is a separate file, keyed by id",
  fs.existsSync(path.join(here, "..", "src", "data", "source", "register-review.json")),
  ""
);

/* DECIDED 2026-09-10. This assertion used to read the other way: "no
   classification field has been written into checks.json", because putting the
   three categories into the master data is a schema change and CLAUDE.md
   reserves those for Sarel. He made the call — "go ahead and make sure it is
   updated across the system" — so the fields are now master data and the
   assertion is inverted rather than deleted, since the reason it existed is
   worth keeping visible.

   What this file still owns is the ARGUMENT — the gap notes and the split
   proposals, which are the input to re-cutting the register and have no
   business in checks.json. tests/reviewfields.test.mjs owns the agreement
   between the two files and the wiring through the app. */
check(
  "the three categories are now master data, as Sarel decided",
  checks.every((c) => "confirmedBy" in c && "inspect" in c && "complianceTest" in c),
  ""
);

check(
  "and this file keeps only what checks.json should not hold",
  Object.values(review).some((r) => r.gaps) &&
    Object.values(review).some((r) => r.split) &&
    !checks.some((c) => "gaps" in c || "split" in c),
  "a gap note is an argument for changing the register, not a property of a check"
);

check(
  "the generator reads checks.json and never writes it",
  /readFileSync\("src\/data\/checks\.json"/.test(script) &&
    !/writeFileSync\([^)]*checks\.json/.test(script),
  ""
);

check(
  "every checkpoint id still round-trips",
  checks.every((c) => typeof c.id === "string" && /^KSIA-[A-Z]{3}-\d{3}$/.test(c.id)),
  "checkpoints[].id is the join key to the portal and to every prior finding — it does not get tidied"
);

/* ---- 6 · the workbook says what it is ------------------------------------ */

for (const sheet of ["Summary", "Review", "Gaps", "Gaps by kind", "Split or merge"]) {
  check(`the workbook carries the ${sheet} sheet`, new RegExp(`name: "${sheet}"`).test(script), "");
}

check(
  "a check with nothing to inspect says so rather than leaving the column blank",
  /— nothing to inspect on site/.test(script),
  "blank reads as 'not yet written', which is a different thing from 'there is nothing to see here'"
);

console.log(failures === 0 ? "\nREGISTER REVIEW OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
