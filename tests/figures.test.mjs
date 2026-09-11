/* Do the numbers in the prose still match the register?
 *
 *  They did not. The Rev A2 register shrank the check-list from 374 rows to
 *  324, and the app followed it — every count on screen is derived. The PROSE
 *  did not. README, tests/README and a dozen source-file headers went on saying
 *  374 check-points, 11,179 researched options, "Capture lists 365 and Field
 *  lists 314", and an overlap of 305, for as long as nobody checked. Not one of
 *  those was true, and every one of them was written to be helpful.
 *
 *  A stale number in a comment is not a typo. This repo's comments are how the
 *  next person learns why a thing is the way it is, and a header that opens
 *  with a figure that is 15% wrong quietly devalues everything after it. Worse
 *  here than in most repos: a reader has no way to tell a stale figure from a
 *  deliberate one, and these particular figures are the shape of the ACSA
 *  engagement — how much work there is, and how it splits.
 *
 *  So the figures are now DERIVED FROM THE DATA and checked against the words.
 *  The suite reads checks.json and the Answer Library, works out what is true,
 *  and then reads every markdown file and source comment for a number written
 *  next to "check-points", "checks" or "options". Any that does not match is a
 *  failure naming the file and the line. It cannot drift again without saying
 *  so on the way past.
 *
 *    node --import ./tests/alias.mjs tests/figures.test.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { needsDesk, needsField, needsQuestion } from "@/lib/verification";
import { loadAnswers } from "@/lib/answers";
import checks from "@/data/checks.json";
import { checksFor } from "@/lib/sites";
import sitesRaw from "@/data/source/sites_RevA2.json";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------------------- what is actually true -------------------------- */

const library = await loadAnswers();
const TOTAL = checks.length;
const DESK = checks.filter(needsDesk).length;
const FIELD = checks.filter(needsField).length;
const BOTH = checks.filter((c) => needsDesk(c) && needsField(c)).length;
const OPTIONS = Object.values(library).reduce(
  (n, a) =>
    n +
    (a.EO?.length ?? 0) +
    (a.AO?.length ?? 0) +
    (a.IO?.length ?? 0) +
    (a.WO?.length ?? 0) +
    (a.OS?.length ?? 0),
  0
);

/* The other figures the prose is entitled to quote, derived the same way rather
   than listed — the portfolio across ten sites, the checks carrying a stricter
   site variant, and the ones carrying a question to ask. */
const PORTFOLIO = sitesRaw.sites.reduce((n, s) => n + checksFor(s.entityCode, checks).length, 0);
const VARIANTS = checks.filter((c) => c.siteVariant).length;
const QUESTIONS = checks.filter(needsQuestion).length;

/* The register review (2026-09-10) counts one more thing the prose now quotes:
   the checks whose evidenceExpected is too thin to say what makes them
   compliant. Derived here, like everything else, so the day somebody writes a
   real evidence line for one of them the figure in the prose goes stale and
   this suite says so — which is the whole point of the file. */
const evidenceOf = (c) =>
  Array.isArray(c.evidenceExpected) ? c.evidenceExpected.join(" ") : String(c.evidenceExpected ?? "");
const STUBS = checks.filter((c) => evidenceOf(c).trim().length < 40).length;

/* The size of the road not taken, derived so the argument against it stays
   true. verification.ts explains why the desk list was NOT moved onto
   `confirmedBy`: doing so drops every Asset check that has no record to
   reconcile, and each one of those still has evidence ACSA names by document
   and clause. If a reclassification ever changed how many that is, the comment
   would go stale silently — so the number is computed here. */
const WOULD_LEAVE_DESK = checks.filter(
  (c) =>
    ((c.vtype ?? "").includes("Evidence") || (c.vtype ?? "").includes("Question")) &&
    c.confirmedBy === "Asset" &&
    c.inspect !== "reconcile" &&
    !(c.vtype ?? "").includes("Question")
).length;
const NO_EVIDENCE = checks.filter((c) => evidenceOf(c).trim() === "").length;

/* And the review's own two headline figures, read off the review file rather
   than typed into the prose beside it. OPEN-QUESTIONS.md quotes both, and they
   move every time a gap is written or resolved. */
const reviewRaw = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "source", "register-review.json"), "utf8")
);
const GAPPED = Object.values(reviewRaw).filter((r) => r.gaps).length;
const GAP_NOTES = Object.values(reviewRaw).reduce((n, r) => n + (r.gaps?.length ?? 0), 0);

console.log(
  `      register: ${TOTAL} checks · desk ${DESK} · field ${FIELD} · both ${BOTH} · ${OPTIONS} options\n` +
    `      portfolio: ${PORTFOLIO} across ${sitesRaw.sites.length} sites · ${VARIANTS} site variants · ${QUESTIONS} with a question\n`
);

check(
  "the Answer Library covers every check in the register",
  Object.keys(library).length === TOTAL,
  `${Object.keys(library).length} keyed, ${TOTAL} checks`
);

check(
  "and every check is routed to at least one screen",
  checks.every((c) => needsDesk(c) || needsField(c)),
  "a check on neither screen is one nobody can answer"
);

/* --------------------- what the words say it is --------------------------- */

const ALLOWED = new Set([
  TOTAL, DESK, FIELD, BOTH, OPTIONS, PORTFOLIO, VARIANTS, QUESTIONS,
  STUBS, NO_EVIDENCE, GAPPED, GAP_NOTES, WOULD_LEAVE_DESK,
]);
const fmt = (n) => n.toLocaleString("en-US");

/* Every file whose prose is allowed to quote a register figure. */
const FILES = [
  "README.md",
  "tests/README.md",
  /* Added 2026-09-10 with the register review, which put three derived counts
     into this file's prose. A figure Sarel reads and acts on is exactly the
     kind this suite exists to keep true. */
  "OPEN-QUESTIONS.md",
  ...walk(path.join(root, "src")),
  ...walk(path.join(root, "tests")).filter((f) => /\.(mjs|js)$/.test(f)),
  /* This file quotes the superseded figures to explain what went wrong, which
     is the one place they are allowed to appear. */
].filter((f) => !f.endsWith("figures.test.mjs"));

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mjs|js|md)$/.test(e.name)) out.push(path.relative(root, full));
  }
  return out;
}

/* A number written immediately before one of the register's own nouns. Loose on
   purpose — "374 check-points", "11,179 researched options", "the 305 checks
   that need both" all read the same way to a person and all need to be true. */
const CLAIM = /([\d][\d,]{1,7})[ -](?:reviewed |researched |check[- ])?(?:check-points?|checks|options)\b/g;

const wrong = [];
for (const rel of FILES) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(CLAIM)) {
      const n = Number(m[1].replace(/,/g, ""));
      /* "Sep 2026 checks" is a visit, not a count. Nothing the register counts
         lands in this range, so a year is a year. */
      if (n >= 1990 && n <= 2100) continue;
      if (!ALLOWED.has(n)) wrong.push(`${rel}:${i + 1}  "${m[0]}"`);
    }
  });
}

check(
  "EVERY REGISTER FIGURE IN THE PROSE MATCHES THE REGISTER",
  wrong.length === 0,
  wrong.length
    ? `${wrong.length} stale:\n        ${wrong.join("\n        ")}`
    : ""
);

/* And the headline numbers are actually stated somewhere, so this suite cannot
   pass by the prose simply having stopped saying anything. */
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const testsReadme = fs.readFileSync(path.join(root, "tests", "README.md"), "utf8");

check(
  "the README states the size of the register",
  readme.includes(`${TOTAL} check-points`) || readme.includes(`${TOTAL} checks`),
  `expected ${TOTAL}`
);

check(
  "and the size of the Answer Library",
  readme.includes(`${fmt(OPTIONS)} researched options`),
  `expected ${fmt(OPTIONS)}`
);

check(
  "and how the work splits between the desk and the walk",
  readme.includes(`${DESK} a desk can progress`) &&
    readme.includes(`Field lists the ${FIELD} with something on site to do`),
  `expected desk ${DESK}, field ${FIELD}`
);

check(
  "the test notes carry the same split",
  testsReadme.includes(`desk ${DESK} · field ${FIELD} · overlap ${BOTH}`),
  `expected desk ${DESK} · field ${FIELD} · overlap ${BOTH}`
);

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nFIGURES OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
