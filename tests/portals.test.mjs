import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* A check appears where it can actually be answered.
 *
 *  The register declares, per row, how each check-point is verified: Evidence
 *  (a document to collect), Question (something to ask a person), Site
 *  Physical Verification (something to go and look at). Nothing read it.
 *  Capture listed the whole register — including the nine whose only mode is physical,
 *  which an auditor at a desk cannot answer at all. Field mode listed anything
 *  with walkabout text, which gave the right count by coincidence rather
 *  than by declaration.
 *
 *  Two failure modes to guard, and they pull in opposite directions:
 *
 *    - duplication: every check in both views, so neither list means anything
 *      and the tablet carries every row, including the 25 that cannot be done on site;
 *    - orphaning: a check in neither view, which is worse, because nothing on
 *      screen would ever say so.
 *
 *  Part 1 parses the register independently — the way risk-matrix.test.mjs
 *  bands the matrix against its own table — so the counts are checked against
 *  the data rather than against src/lib/verification.ts agreeing with itself.
 *  Part 2 reads the source to confirm the screens actually route through it. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");
const checks = JSON.parse(
  fs.readFileSync(path.join(here, "..", "src", "data", "checks.json"), "utf8")
);

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------------------- Part 1: the register, parsed independently ------ */

/* Deliberately not importing modesOf — this is a second opinion, not the same
   opinion twice. */
const isEvidence = (c) => (c.vtype ?? "").includes("Evidence");
const isQuestion = (c) => (c.vtype ?? "").includes("Question");
const isPhysical = (c) => (c.vtype ?? "").includes("Site Physical Verification");
const isDesk = (c) => isEvidence(c) || isQuestion(c);

const n = {
  total: checks.length,
  evidence: checks.filter(isEvidence).length,
  question: checks.filter(isQuestion).length,
  physical: checks.filter(isPhysical).length,
  desk: checks.filter(isDesk).length,
  both: checks.filter((c) => isDesk(c) && isPhysical(c)).length,
  neither: checks.filter((c) => !isDesk(c) && !isPhysical(c)).length,
};

check("the register holds 324 check-points (Rev A2)", n.total === 324, `got ${n.total}`);

check(
  "every check declares how it is verified",
  checks.every((c) => typeof c.vtype === "string" && c.vtype.length > 0),
  `${checks.filter((c) => !c.vtype).length} rows have no vtype`
);

check("Evidence: 313", n.evidence === 313, `got ${n.evidence}`);
check("Question: 80", n.question === 80, `got ${n.question}`);
check("Site Physical Verification: 299", n.physical === 299, `got ${n.physical}`);

/* The register carries the same facts twice — once as vtype, once as the
   columns. If they ever disagree, one of them is wrong and the routing is
   built on the wrong one. */
/* Under Rev A this held in both directions. Under Rev A2 it holds in one:
   everything declaring Evidence has an evidenceExpected, but two physical-only
   rows (KSIA-MEC-029, KSIA-PSR-016) carry the literal "Site inspection" in that
   column — which is the physical verification, not a document to collect. So
   the invariant is stated in the direction that is actually true, and the two
   exceptions are named rather than filtered away by a rule that would also
   swallow the four Evidence rows legitimately answered by a site inspection. */
const declaresEvidenceWithout = checks.filter((c) => isEvidence(c) && !c.evidenceExpected);
check(
  "every check declaring Evidence names the evidence expected",
  declaresEvidenceWithout.length === 0,
  `${declaresEvidenceWithout.length} declare Evidence with the column blank`
);

const evidenceColumnOnly = checks.filter((c) => c.evidenceExpected && !isEvidence(c));
check(
  "the only rows with an evidence column but no Evidence mode are the two site-inspection ones",
  evidenceColumnOnly.length === 2 &&
    evidenceColumnOnly.every(
      (c) => c.evidenceExpected.trim().toLowerCase() === "site inspection"
    ),
  evidenceColumnOnly.map((c) => `${c.id}=${c.evidenceExpected}`).join(", ")
);
check(
  "vtype agrees with the question column",
  checks.filter((c) => c.question).length === n.question,
  `${checks.filter((c) => c.question).length} vs ${n.question}`
);
check(
  "vtype agrees with the walkabout column",
  checks.filter((c) => c.walkabout).length === n.physical,
  `${checks.filter((c) => c.walkabout).length} vs ${n.physical}`
);

/* --------------------------- Part 2: no orphans, no blanket duplication ---- */

check(
  "no check is orphaned — every one reaches a view",
  n.neither === 0,
  `${n.neither} check(s) appear in neither Capture nor Field`
);

check(
  "the audit workspace is not the whole register",
  n.desk === 315 && n.desk < n.total,
  `desk ${n.desk} of ${n.total} — the 9 physical-only checks belong on the tablet`
);

check(
  "field inspection is not the whole register",
  n.physical === 299 && n.physical < n.total,
  `field ${n.physical} of ${n.total} — 25 desk-only checks must not reach the apron`
);

check(
  "the overlap is the 290 that genuinely need both",
  n.both === 290,
  `got ${n.both} — reading the record and seeing the asset are two acts on one requirement`
);

check(
  "the two views account for the register exactly",
  n.desk + n.physical - n.both === n.total,
  `${n.desk} + ${n.physical} - ${n.both} != ${n.total}`
);

/* ------------------------------ Part 3: the screens route through it ------- */

const verification = src("lib", "verification.ts");
const capture = src("app", "(app)", "capture", "page.tsx");
const field = src("app", "(app)", "field", "page.tsx");
const detail = src("components", "CheckDetail.tsx");

check(
  "routing lives in one module",
  /export function needsDesk/.test(verification) &&
    /export function needsField/.test(verification),
  "two screens deciding this separately is how they drift apart"
);

check(
  "routing reads the declared vtype",
  /const v = check\.vtype;/.test(verification),
  ""
);

check(
  "a row without a vtype still reaches a view rather than vanishing",
  /check\.evidenceExpected \|\| check\.acsaEvidence\.length > 0/.test(verification) &&
    /!!check\.walkabout \|\| check\.woCount > 0/.test(verification),
  "a check nobody can see is worse than one in the wrong place"
);

check(
  "the audit workspace filters to desk-verifiable checks",
  /checksOf\(entityCode, discipline\)\.filter\(needsDesk\)/.test(capture),
  "the systems are a tree in the list now, not a filter on it — the discipline is what the walk covers"
);

check(
  "field inspection filters on the declared mode, not the walkabout proxy",
  /checksAt\(entityCode\)\.filter\(needsField\)/.test(field) &&
    !/\.filter\(\(c\) => c\.walkabout \|\| c\.woCount > 0\)/.test(field),
  "walkabout text existing is not the register saying the asset must be seen"
);

check(
  "the discipline and system counts are filtered too",
  /checksOf\(entityCode, d\)\.filter\(needsDesk\)/.test(capture) &&
    /checksOf\(entityCode, discipline, sys\)\.filter\(needsDesk\)/.test(capture),
  "an unfiltered count beside a filtered list is a number that lies"
);

check(
  "the audit question set is one tap away",
  /"q", "Ask"/.test(capture) && /filter === "q"/.test(capture),
  "80 checks carry a question — they should not need hunting for"
);

/* --------------------------- Part 4: the auditor can see why ---------------- */

check(
  "a check says what it requires",
  /modeLabels\(check\)\.map/.test(detail),
  "being in a list without being told why is how people stop trusting the list"
);

check(
  "a desk check that also needs the asset seen says so",
  /needsField\(check\) &&/.test(detail) &&
    /appears in Field inspection too/.test(detail),
  "saving at the desk answers half of a 290-check overlap, and must not read as done"
);

check(
  "a field card shows the desk modes it also carries",
  /modeLabels\(c\)\s*\n?\s*\.filter\(\(m\) => m !== "Physical"\)/.test(field),
  ""
);

/* ----------------------------- Part 5: the numbers on the nav match the view */

const shell = src("components", "AppShell.tsx");

check(
  "the Checks badge is scoped to the desk list, not the whole register",
  /n\.href === "\/capture"\s*\n?\s*\? `\$\{desk\.done\}\/\$\{desk\.total\}`/.test(shell) &&
    !/CHECKS\.length/.test(shell),
  "a badge of 324 on a list of 315 cannot be worked down to zero"
);

check(
  "Inspection carries its own, scoped to the field list",
  /n\.href === "\/field"\s*\n?\s*\? `\$\{field\.done\}\/\$\{field\.total\}`/.test(shell)
);

check(
  "each badge counts its own half, not the derived complete flag",
  /needsDesk\(c\) && deskDone/.test(shell.replace(/\s+/g, " ")) ||
    (/checks\.filter\(needsDesk\)/.test(shell) && /deskDone\(responses\[c\.id\]\)/.test(shell)),
  "a desk-done check that still needs the asset seen must stay on the Inspection badge"
);

/* A bare number does not say which side of the work it counts. "299" beside
   Checks could be 299 done or 299 left, and the auditor who needs to know is
   the one least able to guess. */
check(
  "the counts read done of total where there IS a total",
  /`\$\{desk\.done\}\/\$\{desk\.total\}`/.test(shell) &&
    /`\$\{field\.done\}\/\$\{field\.total\}`/.test(shell) &&
    /`\$\{verified\}\/\$\{priorTotal\}`/.test(shell)
);
check(
  "and stay bare where there is no honest denominator",
  /findings\.length \|\| ""/.test(shell) && /ungrouped \|\| ""/.test(shell),
  "nobody knows how many findings an audit ought to find; inventing a total is worse"
);

/* The labels name the audit activity; the ROUTES do not move, because they are
   in deployed links, the palette and several suites. */
check(
  "the nav names the activity rather than the software action",
  /label: "Checks"/.test(shell) &&
    /label: "Inspection"/.test(shell) &&
    /label: "Follow-up"/.test(shell)
);
check(
  "and the routes are untouched",
  /href: "\/capture"/.test(shell) &&
    /href: "\/field"/.test(shell) &&
    /href: "\/closure"/.test(shell),
  "renaming a URL to match a label is churn with a real cost and no reader benefit"
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nPORTALS OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
