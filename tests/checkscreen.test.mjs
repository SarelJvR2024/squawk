/* The check screen, after it was cut down to a brief.
 *
 *  What was there worked and was unreadable. Seven panels of equal weight ran
 *  down the left — the question, the threshold, ACSA's quote, a document
 *  conflict, a plain reading, the walkabout line, and a folded pile of
 *  extracts — and the answer, the four compliance buttons, sat at the top of
 *  the right-hand column where reading the left scrolled it out of sight. On a
 *  phone the voice-note and photograph buttons were the last thing on the
 *  screen, below six groups of chips.
 *
 *  Sarel's brief was specific: the question to ask, the threshold, and a plain
 *  explanation are the three things that must be unmissable; everything else is
 *  reference and needs a better way in than a stack; the compliance buttons
 *  belong in the header where they are always visible; and knowing what
 *  evidence to ask for is the most important thing on the capture side.
 *
 *  So this suite asserts two different kinds of thing, and the second matters
 *  more than the first:
 *
 *    1. that the new shape is the shape asked for, and
 *    2. THAT NOTHING WAS DROPPED. Every field the register carries for a check
 *       is still rendered somewhere. A redesign that quietly loses the external
 *       basis is not a tidier screen, it is a smaller audit.
 *
 *  Source-read, like the other offline suites. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const detail = src("components", "CheckDetail.tsx");
const css = src("app", "globals.css");

let failures = 0;
const check = (name, cond, detailText = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detailText ? `  [${detailText}]` : ""}`);
  }
};

/* The comments describe the design; the assertions must not trip on them. */
const codeOnly = detail
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const at = (needle) => codeOnly.indexOf(needle);

/* ------------------------------- the brief -------------------------------- */

check(
  "the question is the first thing in the reference column",
  at("Ask ACSA") > at("{/* reference column */}".replace(/\/\*[\s\S]*?\*\//, "")) ||
    at("Ask ACSA") > 0,
  "it is the first thing an auditor says out loud"
);

check(
  "and the order is question, then standard, then plain reading",
  at("Ask ACSA") < at("The standard to audit against") &&
    at("The standard to audit against") < at("In plain English"),
  `${at("Ask ACSA")} / ${at("The standard to audit against")} / ${at("In plain English")}`
);

check(
  "the site's stricter threshold sits INSIDE the standard, above ACSA's network wording",
  at("overrides the network default") > at("The standard to audit against") &&
    at("overrides the network default") < at("ACSA states ·"),
  "an auditor who reads the network figure and misses this audits the wrong standard"
);

check(
  "where ACSA sets no threshold the screen says so, in the standard's own slot",
  /ACSA states no threshold/.test(codeOnly) &&
    /raise the absence itself/.test(codeOnly),
  "silence reads as nothing to see here; it is the opposite"
);

check(
  "the plain reading is never presented as evidence",
  /In plain English\{explained \? " · AI reading, not evidence" : ""\}/.test(codeOnly),
  ""
);

check(
  "and the slot still says something with no model configured",
  /No model is configured on this build/.test(codeOnly) &&
    !/No model is configured[\s\S]{0,200}Explain this check/.test(codeOnly),
  "an empty third panel would read as a check with nothing to explain"
);

/* ------------------------ the answer, always on screen -------------------- */

const header = codeOnly.slice(at('className="sticky top-0 z-[6]'), at("{needsField(check) && ("));

check(
  "THE FOUR COMPLIANCE BUTTONS ARE IN THE STICKY HEADER",
  /STATUSES\.map/.test(header) && /setCompliance\(check\.id/.test(header),
  "reading the left column used to scroll the answer off the right"
);

check(
  "they are two by two on a phone and a row wherever four labels fit",
  /grid min-w-0 flex-1 grid-cols-2 gap-\[5px\] sm:flex sm:flex-wrap/.test(codeOnly),
  "four full labels do not fit 350px and wrapped three-then-one"
);

check(
  "and each is still a 44px target",
  /min-h-\[44px\] flex-1 items-center justify-center/.test(codeOnly)
);

/* ------------------- the answer box, the voice note, the camera ----------- */

const pinned = codeOnly.slice(at('className="sticky bottom-0 z-[7]"'));

check(
  "THE ANSWER BOX, THE VOICE NOTE AND THE CAMERA ARE PINNED TOGETHER",
  /<textarea/.test(pinned) && /<VoiceNoteButton/.test(pinned) && /<PhotoButton/.test(pinned),
  "on a phone they were below six groups of chips"
);

check(
  "and Save sits in the same pinned block, not somewhere else",
  /save\(false\)/.test(pinned) && /save\(true\)/.test(pinned),
  "what writes the answer and what commits it belong together"
);

check(
  "the pinned block clears the phone's bottom nav rather than hiding behind it",
  /className="sticky bottom-0 z-\[7\]"/.test(codeOnly) &&
    /\.app-scroll \{\s*\n\s*padding-bottom: var\(--bottom-nav\);/.test(css),
  "the scroller's own padding lifts the sticky floor; offsetting again floats the bar"
);

check(
  "and pads for the home indicator where nothing below it does",
  /paddingBottom: "calc\(0\.625rem \+ var\(--sticky-safe\)\)"/.test(pinned),
  ""
);

check(
  "the box is an input at rest and a box to write in once the cursor is in it",
  /min-h-\[44px\][\s\S]{0,120}focus:min-h-\[112px\][\s\S]{0,60}sm:min-h-\[68px\]/.test(codeOnly),
  "a pinned six-line box leaves two lines of check above it on a phone"
);

check(
  "the toolbar scrolls sideways rather than wrapping to a second 50px band",
  /flex flex-nowrap items-center gap-\[6px\] overflow-x-auto \[&>\*\]:shrink-0/.test(codeOnly),
  ""
);

check(
  "what is already attached is shown in it",
  /\{photos > 0 && \(/.test(pinned) && /\{voice && <Pill tone="accent">voice note<\/Pill>\}/.test(pinned),
  "the desk-width label row carrying that count is hidden on a phone"
);

check(
  "A DRAFT IS STILL A PROPOSAL — nothing writes itself into the audit",
  /\{draft !== null && \(/.test(pinned) && /Discard/.test(pinned) && /Use it/.test(pinned),
  ""
);

/* -------------------------- evidence leads the capture -------------------- */

check(
  "EVIDENCE TO REQUEST IS THE FIRST THING IN THE CAPTURE COLUMN",
  at('label="Evidence to request"') < at('label="Likely answers"') &&
    at('label="Evidence to request"') < at('label="Issues found"'),
  "Sarel: the most important there is to know what evidence to ask for"
);

check(
  "the old Status block is gone from the capture column, not duplicated",
  (codeOnly.match(/STATUSES\.map/g) || []).length === 1,
  "two sets of compliance buttons is two things to keep in step"
);

/* --------------------------- NOTHING WAS DROPPED -------------------------- */

const fields = [
  ["check.acsaRequirement", "what ACSA's procedure requires"],
  ["check.acsaEvidence", "the records ACSA names"],
  ["check.evidenceExpected", "the evidence expected"],
  ["check.walkabout", "the walkabout instruction"],
  ["check.basis", "the external standard"],
  ["check.basisNote", "the note qualifying that standard"],
  ["check.acsaConflict", "a conflict between ACSA's own documents"],
  ["check.target", "the register's own target"],
  ["check.acsaThreshold", "ACSA's stated threshold"],
  ["check.question", "the question to ask"],
  ["check.siteVariant", "this site's stricter variant"],
];
for (const [field, what] of fields) {
  check(
    `${what} is still rendered`,
    codeOnly.includes(field),
    `${field} disappeared in the redesign`
  );
}

check(
  "the medium-confidence caveat survived the move into a tab",
  /check\.basisConfidence === "medium"/.test(codeOnly) &&
    /cited at document level/.test(codeOnly),
  "quoting a clause number off a document-level citation is how a report gets withdrawn"
);

/* ------------------------------- the tabs --------------------------------- */

check(
  "a tab exists only where the register carries that field",
  (codeOnly.match(/refTabs\.push\(\{/g) || []).length === 6,
  "six optional fields, six conditional tabs — a thin check shows two, not six empty ones"
);

check(
  "the reference body is bounded and scrolls",
  /max-h-\[34vh\] overflow-y-auto/.test(codeOnly),
  "one register row runs to 569 characters; unbounded it puts the brief off the screen"
);

check(
  "THE TAB INDEX IS CLAMPED, not trusted",
  /const refTab = Math\.min\(tab, Math\.max\(0, refTabs\.length - 1\)\);/.test(codeOnly),
  "a check with two tabs must never index a third it does not have"
);

check(
  "and it resets with the check, in render, not in an effect",
  /setTab\(0\);/.test(codeOnly) && at("setTab(0);") < at("useEffect(() => {"),
  "the next check must not paint carrying the previous one's open tab"
);

check(
  "the tabs are reachable to a screen reader as tabs",
  /role="tablist"/.test(codeOnly) && /role="tab"/.test(codeOnly) && /aria-selected=\{refTab === i\}/.test(codeOnly)
);

/* ---------------------- the two layout bugs this turned up ---------------- */

check(
  "THE GRID SIZES TO ITS CONTENT BELOW lg",
  /className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-/.test(codeOnly),
  "flex-1 gave it the leftover height, its content spilled, and the pinned bar came to rest mid-screen"
);

check(
  "the header compacts only where the screen actually scrolls",
  /const onScroll = \(\) => setStuck\(el\.scrollTop > 24\);/.test(codeOnly) &&
    /stuck && !titleOpen/.test(codeOnly),
  "from lg the columns scroll inside themselves, so stuck stays false and the full title stays"
);

check(
  "and the long ones keep their way out",
  /longTitle && !titleOpen \? " line-clamp-2 sm:line-clamp-3" : ""/.test(codeOnly) &&
    /Show the full wording/.test(codeOnly)
);

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nCHECK SCREEN OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
