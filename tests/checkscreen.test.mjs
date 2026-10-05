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
/* The ACSA-requirement content (standard, threshold, site variant/conflict,
   "compliant when") moved into its own component — see
   AcsaRequirementPanel.tsx's own header note — reused unchanged from the
   walk screen's new ACSA tab. Checked together: CheckDetail renders it via
   <AcsaRequirementPanel>, the literal text being checked for lives in the
   extracted file now. */
const acsaPanel = src("components", "AcsaRequirementPanel.tsx");
const detailAndPanel = detail + acsaPanel;
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
const codeOnly = detailAndPanel
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
  "the evidence line is whole at rest, and one line only once the screen has been scrolled",
  /stuck \? " truncate" : ""[\s\S]{0,120}\{evidenceLine\}/.test(codeOnly) &&
    /setPanel\("acsa"\)/.test(codeOnly) &&
    /ACSA wording/.test(codeOnly),
  "Sarel: make sure it expands so all the text is visible, not cut off — the longest evidence sentence in the register runs to 606 characters and used to be truncated at rest, same mistake the question line next to it never made"
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

/* A DECISION OF SAREL'S THAT HE LATER REVERSED: "In plain English" and
   "External basis" were two tabs in the Reference group — an AI reading of
   the check back in plain words, and the clause from an external instrument
   (SACAA, SANS, OHS Act) a check was built on where one applied. Sarel:
   "remove the external and in plain english buttons here" — the tab strip
   was already eight tabs scrolling sideways, and neither read as something
   an auditor reached for during a visit. Both panels, their state
   (`explained`), and the "basis"/"plain" keys are gone from CheckDetail.tsx;
   `check.basis`/`basisConfidence`/`basisNote` are unused here now but stay
   on the Check type and in the register data — removing a tab is not the
   same decision as removing what the register itself carries. */

/* ------------------------ the answer, always on screen -------------------- */

const header = codeOnly.slice(
  at('className="relative z-[6] sm:sticky'),
  at('{(check.question || evidenceLine) && (')
);
/* The className grew lg: variants once the bar became the right-hand
   column from lg (see the note on it in CheckDetail.tsx) — anchor on the
   prefix, not the exact attribute value, so an appended class does not
   move this slice. */
const pinnedBar = codeOnly.slice(at('className="sticky bottom-0 z-[7]'));

check(
  "THE COMPLIANCE BUTTONS ARE IN THE PINNED BOTTOM BAR, WITH SAVE",
  /STATUSES\.map\(/.test(pinnedBar) && /setCompliance\(check\.id/.test(pinnedBar),
  "they were the biggest thing on the screen and they were above the material the decision is made from"
);

check(
  "and they are gone from the header, not copied into two places",
  !/STATUSES\./.test(header),
  "two sets of compliance buttons is two things to keep in step"
);

check(
  "the bar is still pinned below lg, so the answer is on screen at every scroll position",
  /className="sticky bottom-0 z-\[7\]/.test(codeOnly),
  "moving them down is only safe because this bar does not scroll away"
);

/* A DECISION RECORDED HERE, THEN OVERRIDDEN TWICE, AND ALL THREE HALVES
   KEPT — same rule the "evidence to request" reversal below already
   follows: a test that quietly forgets what it used to guard cannot
   explain itself.

   THEN: the verdict and the non-answers were two rows, deliberately, not
   a way to fit five boxes across 390px. The top row was what the audit
   concludes about the asset; the bottom row was this check not applying
   here and ACSA not producing the document while we were on site.
   Rendered as five identical boxes those would read as five equal
   choices, so they were split.

   THEN (30 Sep): Sarel, looking at the live bar on a wide desktop window
   — "make these buttons smaller. this should all fit in one row." One
   grid of five, from lg (1024px) only: five columns wrapped labels to
   two lines at 820px, the tablet this app is actually built for.

   NOW (2 Oct): Sarel — "On the checks page we have an option for
   compliant pending evidence, i want to remove that option. Also remove
   the not available options." Both of STATUSES' two qualifier rows are
   gone — "Compliant, evidence pending" and "Not available" moved off the
   verdict entirely, into their own Evidence status panel, which asks a
   different question from this one (see EVIDENCE_STATUSES). Three
   buttons fit a single row at every width, so the lg-only five-column
   grid and its narrower fallback both went with them. STATUSES is left
   with two verdicts and one qualifier (N/A); `quiet` (from
   `st.group === "qualifier"`) still drops the border weight and lets
   toneStyle mute it, same as every earlier shape did. */
check(
  "THREE IN ONE ROW AT EVERY WIDTH, AND N/A STAYS VISUALLY QUIETER",
  /grid min-w-\[280px\] flex-1 grid-cols-3 gap-\[4px\]">/.test(codeOnly) &&
    !/grid-cols-3 gap-\[4px\] lg:grid-cols-5/.test(codeOnly) &&
    /const quiet = st\.group === "qualifier"/.test(codeOnly) &&
    /quiet \? "border" : "border-\[1\.5px\]"/.test(codeOnly),
  "two verdicts and one qualifier fit one row at every width now that the two tracking options moved to their own panel — but N/A still shouldn't look like the same kind of answer as a verdict"
);

check(
  "the row comes from ONE list, so the keyboard and the screen cannot disagree",
  (codeOnly.match(/^const STATUSES/gm) || []).length === 1 &&
    /\{STATUSES\.map\(\(st\) => \{/.test(codeOnly),
  "a second array would let key 3 mean one thing to the hand and another to the eye"
);

check(
  "ACSA's own code on a phone, the full phrase to a screen reader at every width",
  /<span className="sm:hidden">\{st\.short\}<\/span>/.test(codeOnly) &&
    /aria-label=\{st\.label\}/.test(codeOnly),
  "\"C\" read out loud is not an answer anybody should have to decode"
);

check(
  "and each is still a 44px target",
  /* One button definition now, not two, since the merge into a single
     five-column row — min-w-0 is what keeps all five columns equal width
     instead of one long label (e.g. "Compliant · pending") blowing its
     column wider than the rest. The 44px floor itself is unchanged. */
  (codeOnly.match(/min-h-\[44px\] min-w-0 items-center justify-center/g) || []).length === 1
);

check(
  "the chosen answer carries a ring, not just a tint — it is read in daylight",
  /boxShadow: `inset 0 0 0 1px var\(--\$\{tone\}\)`/.test(codeOnly) &&
    /aria-pressed=\{on\}/.test(codeOnly),
  "tinted background plus a coloured border washes out on a tablet at midday"
);

/* ------------------- the answer box, the voice note, the camera ----------- */

const pinned = codeOnly.slice(at('className="sticky bottom-0 z-[7]'));

check(
  "THE ANSWER BOX AND THE VOICE NOTE ARE PINNED TOGETHER",
  /<textarea/.test(pinned) && /<VoiceNoteButton/.test(pinned),
  "on a phone they were below six groups of chips"
);

check(
  "and Save sits in the same pinned block, not somewhere else",
  /save\(false\)/.test(pinned) && /save\(true\)/.test(pinned),
  "what writes the answer and what commits it belong together"
);

check(
  "the pinned block clears the phone's bottom nav rather than hiding behind it",
  /className="sticky bottom-0 z-\[7\]/.test(codeOnly) &&
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
  /min-h-\[44px\][\s\S]{0,200}focus:min-h-\[112px\][\s\S]{0,60}sm:min-h-\[68px\]/.test(codeOnly),
  "a pinned six-line box leaves two lines of check above it on a phone"
);

/* THE WRITING TOOLS ARE IN THE BOX THEY WRITE INTO.
   Sarel, 2026-09-12: "Move mic icon and choose from taps and draft with ai as
   small icons in the text box on the right."

   They were three labelled buttons in the bar, which put the three ways of
   filling the observation in a different place from the observation, and spent
   a row the compliance answer now uses for its second line. What is left in
   the bar is Photo — the one control used in gloves on an apron, where a 34px
   icon in a text field is the wrong target — and the pills saying what is
   attached. That row still scrolls rather than wrapping: at 44px a wrapped
   toolbar is a second 50px band off a 664px screen for the whole session. */
check(
  "COMPOSE, DRAFT AND THE MIC ARE INSIDE THE OBSERVATION BOX",
  /aria-label="Compose from taps"/.test(codeOnly) &&
    /"Drafting…" : "Draft with AI"/.test(codeOnly) &&
    /<VoiceNoteButton\s+inline/.test(codeOnly),
  "three labelled buttons in the bar put the ways in somewhere other than the field"
);
check(
  "the box reserves room for them rather than running text underneath",
  /pr-\[124px\]/.test(codeOnly)
);
check(
  "and they are anchored to the top, so they do not walk down a box that grows on focus",
  /absolute top-\[5px\] right-\[5px\]/.test(codeOnly)
);
/* Sarel, later: "remove the paperclip and photo icon, introduce them in
   the evidence section — all photos and evidence will be uploaded in the
   evidence section." Photo and File moved out of this bar into the
   Evidence status panel, the one place an auditor now reaches for either,
   rather than a second copy floating under every tab. */
check(
  "PHOTO AND FILE MOVED TO THE EVIDENCE STATUS PANEL, NOT THE PINNED BAR",
  !/<PhotoButton/.test(pinned) &&
    !/<FileButton/.test(pinned) &&
    /<PhotoButton/.test(codeOnly) &&
    /<FileButton/.test(codeOnly),
  "one upload surface, reached from Evidence status, not a second one under every tab"
);
check(
  "the remaining row still scrolls sideways rather than wrapping to a second 50px band",
  /flex flex-nowrap items-center gap-\[6px\] overflow-x-auto sm:overflow-visible \[&>\*\]:shrink-0/.test(
    codeOnly
  ),
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
/* A DECISION OF SAREL'S THAT HE LATER REVERSED, recorded for the same
   reason the one above it is: "make all buttons fit in one row (the
   buttons for acsa requirements, issues, walkabout...)" — twelve tabs
   beside a half-width reference panel wrapped to two rows even on a
   desk-width window, the same busyness the tabbed redesign was built to
   remove. The strip now scrolls sideways at every width instead. */
check(
  "the strip SCROLLS SIDEWAYS AT EVERY WIDTH, rather than wrapping to a second row",
  /className="flex flex-nowrap items-center gap-x-\[14px\] gap-y-\[5px\] overflow-x-auto border-b px-5 py-\[8px\] whitespace-nowrap"/.test(
    codeOnly
  ),
  "two rows of PINNED tab strip is most of a 664px phone, and it is no less true on a desk-width window beside a half-width reference panel"
);

/* (?<!EVIDENCE_) EXCLUDES EVIDENCE_STATUSES.map( — added 2 October 2026
   alongside STATUSES for the separate Evidence status panel. Its name
   ends in the same four letters, so a plain /STATUSES\.map\(/ search
   also matches inside "EVIDENCE_STATUSES.map(" and this check would
   fail for the wrong reason: two arrays that answer two different
   questions, not two copies of one. */
check(
  "there is exactly ONE definition of the compliance buttons in the file",
  (codeOnly.match(/^const STATUSES/gm) || []).length === 1 &&
    (codeOnly.match(/(?<!EVIDENCE_)STATUSES\.map\(/g) || []).length === 1,
  "one array, mapped once — a second copy would be a second thing to keep in step"
);

/* --------------------------- NOTHING WAS DROPPED -------------------------- */

/* A DECISION OF SAREL'S THAT HE LATER REVERSED: check.basis and
   check.basisNote — the external-instrument citation and its qualifying
   note — were rendered under "External basis", removed along with that tab
   (see the note above, under "the answer, always on screen"). They are no
   longer in this list because they are genuinely gone from the screen, not
   because this list stopped checking. */
const fields = [
  ["check.acsaRequirement", "what ACSA's procedure requires"],
  ["check.acsaEvidence", "the records ACSA names"],
  ["check.evidenceExpected", "the evidence expected"],
  ["check.walkabout", "the walkabout instruction"],
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

/* ------------------------------- the tabs --------------------------------- */

/* ONE STRIP, TWO GROUPS: what the auditor DOES with the check, then what the
   auditor READS to do it. Both are `panels.push`, which is what makes the
   merge real rather than two strips drawn next to each other. The reference
   group shrank from four tabs to two (ACSA wording, and the 2025 prior
   finding where one exists) once "In plain English" and "External basis"
   were removed — down from "at least 4", not a regression. */
check(
  "the doing and the reading are tabs in the same list",
  (codeOnly.match(/group: "do"/g) || []).length >= 5 &&
    (codeOnly.match(/group: "read"/g) || []).length >= 2,
  "capture panels and reference panels, in one strip"
);

check(
  "a tab exists only where the register carries that field",
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

/* Sarel, later: "the space to read the box of text is getting very small,
   rework this layout so that it is easier to read, maybe split into a left
   and right panel." The panel used to take the whole width and whatever
   height the capture column below it left over — on a desk-width window
   with photographs already attached, that could be a few lines of ACSA's
   own wording behind a scrollbar. It is half the width now, beside the
   capture column rather than above it, with the full leftover height to
   itself; the capture column gets the other half and scrolls its own
   Observation block the same way, so neither one is squeezed by the
   other's content any more. */
check(
  "the panel takes half the width from lg and scrolls inside itself",
  /lg:min-h-0 lg:w-1\/2 lg:shrink-0 lg:overflow-y-auto lg:border-r/.test(codeOnly) &&
    /role="tabpanel"/.test(codeOnly),
  "below lg the whole screen scrolls, and flex-1 there spilled the content out of a short box"
);

check(
  "and the capture column beside it scrolls its own Observation block the same way",
  /lg:static lg:flex lg:min-h-0 lg:w-1\/2 lg:shrink-0 lg:flex-col/.test(codeOnly) &&
    /border-t px-5 pt-\[9px\] pb-\[9px\] lg:min-h-0 lg:flex-1 lg:overflow-y-auto/.test(codeOnly),
  "a long observation with several photographs attached must not push the compliance buttons off the bottom of their own column"
);

check(
  "and the two columns sit in one row from lg, a plain stack below it",
  /lg:flex lg:min-h-0 lg:flex-1 lg:items-stretch/.test(codeOnly),
  "a two-column row on a phone is two half-width columns neither one can be read in"
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
