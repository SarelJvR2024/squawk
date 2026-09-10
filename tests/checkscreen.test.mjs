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
 *  reference and needs a better way in than a stack; and knowing what evidence
 *  to ask for is the most important thing on the capture side.
 *
 *  THEN HE USED IT, and the second brief was just as specific: it is still too
 *  busy, the compliance buttons are too big and should go down to the pinned
 *  bar where there is open space, the ACSA background and the answer chips
 *  should be ONE space with tabs at the top rather than two columns, and the
 *  only things that should never move are a short line saying what to ask and
 *  what evidence is needed. So the two columns are one tabbed panel now, and
 *  the compliance buttons live in the same pinned bar as Save.
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
  "THE QUESTION AND THE EVIDENCE NEEDED ARE NOT IN A TAB",
  at("{check.question}") < at('role="tablist"') &&
    at("{evidenceLine}") < at('role="tablist"') &&
    at("{evidenceLine}") > at("{check.question}"),
  "the two lines the conversation starts from are the two that must never move"
);

check(
  "the question is whole at rest, and one line only once the screen has been scrolled",
  /stuck \? " line-clamp-1" : ""[\s\S]{0,200}\{check\.question\}/.test(codeOnly) &&
    !/truncate[^"]*"[\s\S]{0,200}\{check\.question\}/.test(codeOnly),
  "reading half of what you are about to ask is worse than a third line — but a pinned line on a phone is a line of the check you cannot see"
);

check(
  "the brief and the tabs are pinned with the check's identity, not left to scroll",
  at('className="relative z-[6] sm:sticky sm:top-0"') < at("{check.question}") &&
    at("{check.question}") < at('role="tablist"') &&
    at('role="tablist"') < at('role="tabpanel"'),
  "a strip scrolled under the pinned answer bar cannot be pressed at all"
);

check(
  "the evidence line is one line, and says where the rest of it is",
  /truncate[\s\S]{0,120}\{evidenceLine\}/.test(codeOnly) &&
    /setPanel\("acsa"\)/.test(codeOnly) &&
    /all of it/.test(codeOnly),
  "the longest evidence sentence in the register runs to 606 characters"
);

check(
  "and the order in the panels is standard, then plain reading",
  at("The standard to audit against") < at("In plain English"),
  `${at("The standard to audit against")} / ${at("In plain English")}`
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

const header = codeOnly.slice(at('className="relative z-[6] sm:sticky'), at("{needsField(check) && ("));
const pinnedBar = codeOnly.slice(at('className="sticky bottom-0 z-[7]"'));

check(
  "THE FOUR COMPLIANCE BUTTONS ARE IN THE PINNED BOTTOM BAR, WITH SAVE",
  /STATUSES\.map/.test(pinnedBar) && /setCompliance\(check\.id/.test(pinnedBar),
  "they were the biggest thing on the screen and they were above the material the decision is made from"
);

check(
  "and they are gone from the header, not copied into two places",
  !/STATUSES\.map/.test(header),
  "two sets of compliance buttons is two things to keep in step"
);

check(
  "the bar is still pinned, so the answer is on screen at every scroll position",
  /className="sticky bottom-0 z-\[7\]"/.test(codeOnly),
  "moving them down is only safe because this bar does not scroll away"
);

check(
  "four across on a phone, carrying ACSA's own code, and the full word everywhere else",
  /grid min-w-\[300px\] flex-1 grid-cols-4 gap-\[5px\]/.test(codeOnly) &&
    /<span className="sm:hidden">\{key\}<\/span>/.test(codeOnly) &&
    /aria-label=\{label\}/.test(codeOnly),
  "four full labels wrap to two rows at 390px, and the full word must still reach a screen reader"
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
  /paddingBottom: "calc\([\d.]+rem \+ var\(--sticky-safe\)\)"/.test(pinned),
  "the rule is that it pads at all; the figure moves when the bar's own spacing does"
);

check(
  "the box is an input at rest and a box to write in once the cursor is in it",
  /min-h-\[44px\][\s\S]{0,120}focus:min-h-\[112px\][\s\S]{0,60}sm:min-h-\[68px\]/.test(codeOnly),
  "a pinned six-line box leaves two lines of check above it on a phone"
);

/* THE TOOLBAR MOVED DOWN, and the reason it scrolls did not move with it.
   Compose, Draft, Voice and Photo used to be their own row above the
   observation field; they are in the answer bar now, beside the compliance
   buttons, because three stacked strips of furniture between the box you type
   in and the buttons that answer the check was one strip too many. On a phone
   they are still ONE ROW THAT SCROLLS rather than two that wrap: at 44px a
   wrapped toolbar is a second 50px band off a 664px screen for the whole
   session, and this bar already spends better than a third of it. */
check(
  "the toolbar scrolls sideways rather than wrapping to a second 50px band",
  /flex w-full flex-nowrap items-center gap-\[6px\] overflow-x-auto sm:w-auto sm:overflow-visible \[&>\*\]:shrink-0/.test(
    codeOnly
  ),
  ""
);
check(
  "and it sits in the answer bar, not above the observation field",
  pinned.indexOf("Compose from taps") > pinned.indexOf("THE ANSWER, AND WHAT COMMITS IT"),
  "Sarel asked for these on the same row as Compliant / Non-compliant"
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

/* The five capture panels are now TABS, so "first in the column" means first in
   the strip AND the one open before anybody taps anything. */
check(
  "EVIDENCE TO REQUEST IS THE FIRST THING IN THE CAPTURE COLUMN",
  at('key: "evidence"') < at('key: "answers"') && at('key: "evidence"') < at('key: "issues"'),
  "Sarel: the most important there is to know what evidence to ask for"
);

/* A DECISION OF SAREL'S THAT HE LATER REVERSED, and both halves are recorded
   because a test that quietly forgets the first one is a test that cannot
   explain itself.
     Then: "the most important there is to know what evidence to ask for", so
     Evidence to request opened by default.
     Now (10 Sep): "The first tab should be ACSA requirements/threshold —
     exactly the requirement/threshold from the ACSA register."
   Evidence to request is still first in the ANSWER LIBRARY, which is what the
   assertion above guards. What changed is that ACSA's own requirement is no
   longer behind five tabs of our material: it is its own group, rendered
   first, and it is what the screen opens on. You read the requirement, then
   you go and collect the evidence for it. */
check(
  "ACSA's own requirement is the first tab in the strip",
  at('group: "acsa"') > 0 && /\(\["acsa", "do", "read"\] as const\)/.test(codeOnly),
  "it was fourth in Reference, behind five tabs of TPJV's own material"
);
check(
  "and it is the tab already open, not one to go and find",
  /useState\("standard"\)/.test(codeOnly),
  "a default of anything else buries the thing he named as most important"
);

/* THE COUNTS ARE THE PRICE OF TABBING. One panel on screen means four off it,
   and a tab that only said "Evidence to request" would hide that three were
   picked. Without the badges this change trades scrolling for blindness. */
check(
  "EVERY TAB CAN SAY WHAT HAS BEEN TAPPED IN IT",
  /badge: `\$\{r\.evidencePicked\.length\}\/\$\{a\.EO\.length\}`/.test(codeOnly),
  "evidence says picked-of-total, because both halves matter"
);
check(
  "issues count only when there IS one",
  /r\.issuesPicked\.length > 0 \? \{ badge: String\(r\.issuesPicked\.length\) \}/.test(codeOnly),
  "a zero on every check is noise on the one thing that must stand out"
);
check(
  "the strip WRAPS wherever there is room, and scrolls sideways only on a phone",
  /sm:flex-wrap sm:overflow-visible/.test(codeOnly) &&
    /overflow-x-auto border-b px-5/.test(codeOnly),
  "a tab pushed off the right edge is a panel nobody knows is there — but five rows of PINNED strip is most of a 664px phone"
);

check(
  "there is exactly ONE set of compliance buttons in the file",
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

/* ONE STRIP, TWO GROUPS: what the auditor DOES with the check, then what the
   auditor READS to do it. Both are `panels.push`, which is what makes the
   merge real rather than two strips drawn next to each other. */
check(
  "the doing and the reading are tabs in the same list",
  (codeOnly.match(/group: "do"/g) || []).length >= 5 &&
    (codeOnly.match(/group: "read"/g) || []).length >= 4,
  "five capture panels and four reference panels, in one strip"
);

check(
  "a tab exists only where the register carries that field",
  /if \(check\.basis\)\n\s*panels\.push/.test(codeOnly) &&
    /if \(pf\?\.note\)\n\s*panels\.push/.test(codeOnly) &&
    /check\.acsaRequirement \|\|\n?\s*check\.acsaEvidence\.length > 0/.test(codeOnly),
  "a thin check shows the tabs it has, not empty ones"
);

check(
  "THE OPEN TAB IS RESOLVED AGAINST WHAT EXISTS, not trusted",
  /const openKey = panels\.some\(\(t\) => t\.key === panel\) \? panel : panels\[0\]\.key;/.test(codeOnly),
  "a key carried from the last check must never open a panel this one does not have"
);

check(
  "and it is deliberately NOT reset when the check changes",
  !/setPanel\("evidence"\);/.test(codeOnly.slice(at("if (shownFor !== check.id)"), at("useEffect(() => {"))),
  "an auditor walking a discipline works the same panel check after check"
);

check(
  "the panel takes the whole width and scrolls inside itself from lg",
  /lg:min-h-0 lg:flex-1 lg:overflow-y-auto/.test(codeOnly) &&
    /role="tabpanel"/.test(codeOnly),
  "below lg the whole screen scrolls, and flex-1 there spilled the content out of a short box"
);

check(
  "the tabs are reachable to a screen reader as tabs",
  /role="tablist"/.test(codeOnly) && /role="tab"/.test(codeOnly) && /aria-selected=\{on\}/.test(codeOnly)
);

/* ---------------------- the two layout bugs this turned up ---------------- */

check(
  "the header compacts only where the screen actually scrolls",
  /const onScroll = \(\) => setStuck\(el\.scrollTop > 24\);/.test(codeOnly) &&
    /stuck && !titleOpen/.test(codeOnly),
  "from lg the panel scrolls inside itself, so stuck stays false and the full title stays"
);

check(
  "and the long ones keep their way out",
  /longTitle && !titleOpen \? " line-clamp-2 sm:line-clamp-3" : ""/.test(codeOnly) &&
    /Show the full wording/.test(codeOnly)
);

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nCHECK SCREEN OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
