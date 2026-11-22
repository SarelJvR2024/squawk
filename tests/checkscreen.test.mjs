/* The check screen, redesigned twice.
 *
 *  FIRST (ui-refresh): seven reference panels and the compliance buttons
 *  merged into one tabbed strip above two columns — the question and the
 *  evidence line stayed pinned above the tabs, out of them, because those
 *  are the two things a conversation actually starts from.
 *
 *  SECOND (build prompt 3, "the check, one screen", 21 Nov 2026): the tab
 *  strip is gone too. Sarel's brief this time: "One slim header... The
 *  question, with two buttons... Three one-line channel rows in fixed
 *  order... Open issues on this check shown as a row... Two fields,
 *  always: Internal note and Observation... Result, then one Next
 *  button... Replace the tab strip with this structure. Keep every
 *  existing capability reachable; nothing is deleted without a
 *  replacement." A reference panel that used to be the tab already open
 *  by default (ACSA requirement) is a button that opens a Sheet now; the
 *  two tabs the row list did not name (ACSA wording, Flag for review) and
 *  the carried-forward prior finding fold into one "More" Sheet rather
 *  than being deleted.
 *
 *  So this suite still asserts two different kinds of thing, and the
 *  second still matters more than the first:
 *
 *    1. that the new shape is the shape build prompt 3 asked for, and
 *    2. THAT NOTHING WAS DROPPED. Every field the register carries for a
 *       check is still rendered somewhere, reachable from this screen —
 *       a redesign that quietly loses the external basis is not a
 *       tidier screen, it is a smaller audit.
 *
 *  Source-read, like the other offline suites. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const detail = src("components", "CheckDetail.tsx");
/* The ACSA-requirement content (standard, threshold, site variant/conflict,
   "compliant when") lives in its own component, reused unchanged — see
   AcsaRequirementPanel.tsx's own header note. Checked together: CheckDetail
   renders it via <AcsaRequirementPanel>, the literal text being checked for
   lives in the extracted file now. */
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
  "THE QUESTION AND THE CHANNEL ROWS ARE NOT BEHIND A SHEET — on screen by default",
  at("{check.question}") < at('font-semibold">Interview<') &&
    at('font-semibold">Interview<') < at('font-semibold">Evidence<') &&
    at('font-semibold">Evidence<') < at('font-semibold">Walk<') &&
    !/role="tablist"/.test(codeOnly),
  "the tab strip is gone outright, not relabelled — everything build prompt 3 names a row is flat content, not a panel you switch to"
);

check(
  "the question is whole at rest, and one line only once the screen has been scrolled",
  /stuck \? " line-clamp-1" : ""[\s\S]{0,200}\{check\.question\}/.test(codeOnly) &&
    !/truncate[^"]*"[\s\S]{0,200}\{check\.question\}/.test(codeOnly),
  "reading half of what you are about to ask is worse than a third line — but a pinned line on a phone is a line of the check you cannot see"
);

check(
  "ONLY THE IDENTITY IS PINNED NOW — the question, rows, note and Observation scroll normally",
  at('className="sticky top-0 z-[6] border-b px-5') < at("{check.question}") &&
    at("{check.question}") < at("Interview"),
  "build prompt 3: 'One slim header' — the old version pinned the question and the tab strip too; this one pins only the check's own identity and heading"
);

check(
  "the full evidence line is never cut off — one tap away, in the Evidence Sheet, not truncated on the row forever",
  /Evidence needed<\/div>/.test(codeOnly) &&
    /<RefText>\{evidenceLine\}<\/RefText>/.test(codeOnly),
  "Sarel: make sure it expands so all the text is visible, not cut off — the longest evidence sentence in the register runs to 606 characters; the flat row previews it truncated, the Sheet behind it never does"
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

/* ------------------------ the answer, always on screen -------------------- */

const header = codeOnly.slice(
  at('className="sticky top-0 z-[6] border-b px-5'),
  at("{check.question && channels.interview && (")
);
/* The className grows with the responsive rules it needs — anchor on the
   prefix, not the exact attribute value, so an appended class does not
   move this slice. */
const pinnedBar = codeOnly.slice(at('className="sticky bottom-0 z-[7]'));

check(
  "THE COMPLIANCE BUTTONS ARE IN THE PINNED BOTTOM BAR, WITH NEXT CHECK",
  /STATUSES\.map\(/.test(pinnedBar) && /setCompliance\(check\.id/.test(pinnedBar),
  "they were the biggest thing on the screen and they were above the material the decision is made from"
);

check(
  "and they are gone from the header, not copied into two places",
  !/STATUSES\./.test(header),
  "two sets of compliance buttons is two things to keep in step"
);

check(
  "the bar is still pinned, so the answer is on screen at every scroll position",
  /className="sticky bottom-0 z-\[7\]/.test(codeOnly),
  "moving them down is only safe because this bar does not scroll away"
);

check(
  "FOUR IN ONE ROW AT EVERY WIDTH, AND BOTH QUALIFIERS STAY VISUALLY QUIETER",
  /grid min-w-\[280px\] flex-1 grid-cols-4 gap-\[4px\]">/.test(codeOnly) &&
    /const quiet = st\.group === "qualifier"/.test(codeOnly) &&
    /quiet \? "border" : "border-\[1\.5px\]"/.test(codeOnly),
  "two verdicts and two qualifiers (N/A, and NV) fit one row at every width — N/A and NV still shouldn't look like the same kind of answer as Discussed/Non-compliance"
);

check(
  "the row comes from ONE list, so the keyboard and the screen cannot disagree",
  (codeOnly.match(/^export const STATUSES/gm) || []).length === 1 &&
    /\{STATUSES\.map\(\(st\) => \{/.test(codeOnly),
  "a second array would let key 3 mean one thing to the hand and another to the eye"
);

check(
  "the outcome buttons show the full word, not the ACSA code, at every width",
  /<st\.Icon width=\{12\} height=\{12\} className="shrink-0" \/>\s*\n\s*<span>\{st\.label\}<\/span>/.test(
    codeOnly
  ) &&
    !/<span className="sm:hidden">\{st\.short\}<\/span>/.test(codeOnly),
  "a 390px screenshot showed C/NC — the button must read Discussed/Non-compliance/Not applicable at every width, not just from sm"
);

check(
  "and each is still a 44px target",
  (codeOnly.match(/min-h-\[44px\] min-w-0 items-center justify-center/g) || []).length === 1
);

check(
  "the chosen answer carries a ring, not just a tint — it is read in daylight",
  /boxShadow: `inset 0 0 0 1px var\(--\$\{tone\}\)/.test(codeOnly) &&
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
  "and Next check sits in the same pinned block, not somewhere else",
  /STATUSES\.map\(\(st\) => \{/.test(pinned) && /onClick=\{onNext\}/.test(pinned),
  "what writes the answer and what commits it belong together — build prompt 2 (21 Nov 2026) replaced the separate Save/Save & next pair with the one commit-and-advance action onNext already is"
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

check(
  "COMPOSE, DRAFT AND THE MIC ARE INSIDE THE OBSERVATION BOX",
  /aria-label="Compose from taps"/.test(codeOnly) &&
    /"Drafting…" : "Draft with AI"/.test(codeOnly) &&
    /<VoiceNoteButton\s+inline/.test(codeOnly),
  "three labelled buttons in the bar put the ways in somewhere other than the field"
);
check(
  "the box reserves room for them rather than running text underneath — 260px",
  /pr-\[260px\]/.test(codeOnly) && !/pr-\[164px\]/.test(codeOnly) && !/pr-\[248px\]/.test(codeOnly)
);
check(
  "and they are anchored to the top, so they do not walk down a box that grows on focus",
  /absolute top-\[5px\] right-\[5px\]/.test(codeOnly)
);
check(
  "PHOTO IS IN THE PINNED BAR, INLINE WITH VOICE; FILE STAYS EVIDENCE-STATUS-ONLY",
  /<PhotoButton\s+inline/.test(pinned) &&
    !/<FileButton/.test(pinned) &&
    /<PhotoButton/.test(codeOnly) &&
    /<FileButton/.test(codeOnly),
  "Camera reachable without leaving the always-visible bar; File stays the one place an auditor reaches for it"
);

check(
  "what is already attached is shown in it",
  /\{photos > 0 && \(/.test(pinned) && /\{voice && <Pill>voice note<\/Pill>\}/.test(pinned),
  "the desk-width label row carrying that count is hidden on a phone"
);

check(
  "A DRAFT IS STILL A PROPOSAL — nothing writes itself into the audit",
  /\{draft !== null && \(/.test(pinned) && /Discard/.test(pinned) && /Use it/.test(pinned),
  ""
);

/* -------------------------- evidence leads the capture -------------------- */

check(
  "evidence to request, likely answers and issues found do not come back",
  !/key: "evidence"/.test(codeOnly) &&
    !/key: "answers"/.test(codeOnly) &&
    !/key: "issues"/.test(codeOnly),
  "chip-picking tabs, replaced by what the evidence proves — see EVIDENCE_VERDICTS"
);

check(
  "ACSA's own requirement is its own button, primary, beside How to ask",
  /onClick=\{\(\) => setSheet\("standard"\)\}/.test(codeOnly) &&
    /ACSA requirement/.test(codeOnly) &&
    /onClick=\{\(\) => setSheet\("howToAsk"\)\}/.test(codeOnly),
  "build prompt 3: 'The question, with two buttons: How to ask... and ACSA requirement'"
);

check(
  "the evidence status tab carries what the evidence proves and a verdict",
  /value=\{r\.evidenceProves\}/.test(codeOnly) &&
    /EVIDENCE_VERDICTS\.map/.test(codeOnly) &&
    /evidenceVerdict: on \? null : v\.key/.test(codeOnly),
  "Sarel: a text box for what the evidence proves, and Compliant/Non-compliant/Not Verified"
);
check(
  "the verdict buttons are exactly Compliant, Non-compliant and Not Verified — no N/A",
  /key: "C", label: "Compliant"/.test(codeOnly) &&
    /key: "NC", label: "Non-compliant"/.test(codeOnly) &&
    /key: "NV", label: "Not Verified"/.test(codeOnly),
  "evidence cannot answer whether a check applies at all, only what it shows once it does"
);

check(
  "there is exactly ONE definition of the compliance buttons in the file",
  (codeOnly.match(/^export const STATUSES/gm) || []).length === 1 &&
    (codeOnly.match(/(?<!EVIDENCE_)STATUSES\.map\(/g) || []).length === 1,
  "one array, mapped once — a second copy would be a second thing to keep in step"
);

/* --------------------------- NOTHING WAS DROPPED -------------------------- */

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

/* --------------------- the three channel rows + Issues --------------------- */

check(
  "Interview, Evidence and Walk each gate on their own channel — a switched-off channel's row is not shown",
  /\{channels\.interview && \(/.test(codeOnly) &&
    /\{channels\.evidence && \(/.test(codeOnly) &&
    /\{channels\.walk && \(/.test(codeOnly),
  "build prompt 3: 'A row for a switched-off channel is not shown'"
);

check(
  "Interview and Walk each offer a real tick AND an N/A, not one combined toggle",
  /interviewDone: !r\.interviewDone, interviewNA: false/.test(codeOnly) &&
    /interviewNA: !r\.interviewNA, interviewDone: false/.test(codeOnly) &&
    /walkNA: !r\.walkNA/.test(codeOnly),
  "'Each channel on a check: tick (done), N/A, or empty' — three states need two independent controls, not a cycle nobody can see the state of"
);

check(
  "Evidence counts settled items of total linked, same many-to-many EvidenceReviewView already reads",
  /useEvidenceItems\(\)\.filter\(\(e\) => e\.checkIds\.includes\(check\.id\)\)/.test(codeOnly) &&
    /\["received", "analysis", "returned"\]\.includes\(trackingStage\(e\)\)/.test(codeOnly),
  "'Evidence (e.g. \"2 of 3\", Open)'"
);

check(
  "Issues shows a row even at zero, not a tab that only exists once there is something in it",
  /No issues/.test(codeOnly) && /checkFindings\.length > 0/.test(codeOnly),
  "a row that disappears at zero looks like it was never built"
);

/* ------------------- an internal note, both scopes, never synced ---------- */

/* THIS CHECK, THIS AUDIT — build prompt 3, 21 Nov 2026. New field, new row,
   confirmed with Sarel to sit beside (not replace) the asset-system-wide
   note below. */
check(
  "the new internal note is read and written through THIS CHECK's own response, not the system's",
  /value=\{r\.internalNote \?\? ""\}/.test(detail) &&
    /patch\(check\.id, \{ internalNote: e\.target\.value \}\)/.test(detail),
  "one note per check-point, for this audit — the asset-system-wide note is a different field, see below"
);

check(
  "and it says plainly it is never printed, right on the row",
  /Internal note — never printed in any report/.test(detail)
);

/* THIS ASSET SYSTEM, EVERY AUDIT — 13 October 2026, kept alongside the one
   above rather than replaced by it (confirmed with Sarel, not assumed):
   see tests/sharepoint.test.mjs's own "the reviewer's own fields never
   reach the portal" section for the functional proof against the real
   sync code; this file checks the panel itself still exists, still warns
   on its face, and is still keyed to the system, reachable now from the
   "More" Sheet rather than its own tab. */
check(
  "the asset-system note is STILL reachable, keyed to the system, not the check",
  /const sysA = systemAssessment\(check\.discipline, check\.system\);/.test(detail) &&
    /patchSystem\(check\.discipline, check\.system, \{ internalNote: e\.target\.value \}\)/.test(detail),
  "every check under one asset system shares the same note, not a copy per check-point — build prompt 3 adds a check-level note beside it, it does not delete this one"
);

check(
  "and its own internal-only banner is still on the panel's face",
  /INTERNAL ONLY — never synced to SharePoint, never in a client report/.test(detail),
  "a label a reviewer can see is what stops a working note being mistaken for something client-facing"
);

/* ------------------- "More": ACSA wording, Flag for review, prior -------- */

check(
  "ACSA wording, Flag for review and the prior finding are all reachable from one overflow Sheet",
  /sheet === "more"/.test(codeOnly) &&
    /ACSA wording/.test(codeOnly) &&
    /Flag for review/.test(codeOnly) &&
    /Prior finding/.test(codeOnly),
  "confirmed with Sarel: folded into one 'More' Sheet, not deleted — the row list build prompt 3 named does not mention these three, and 'nothing is deleted without a replacement' still applies to what it left out"
);

check(
  "the register-metadata pills (mode, confirmedBy, inspect) moved into that same Sheet, not deleted",
  /modeLabels\(check\)\.map\(\(m\) => \{/.test(codeOnly) &&
    /check\.confirmedBy\.toUpperCase\(\)/.test(codeOnly) &&
    /GO AND RECONCILE/.test(codeOnly),
  "the old header's icon row — prompt 3: 'remove the icon row clutter' — moved, it did not vanish"
);

check(
  "but the genuinely safety-relevant warnings (conflict, no ACSA basis, an unacceptable prior rating) stay pinned, not buried in More",
  /NO ACSA BASIS/.test(header) && /CONFLICT ·/.test(header) && /2025 UNACCEPTABLE/.test(header),
  "clutter and a warning an auditor cannot afford to miss are not the same thing"
);

/* ---------------------- the two layout bugs this turned up ---------------- */

check(
  "the header compacts only where the screen actually scrolls",
  /const onScroll = \(\) => setStuck\(el\.scrollTop > 24\);/.test(codeOnly) &&
    /stuck && !titleOpen/.test(codeOnly)
);

check(
  "and the long ones keep their way out",
  /longTitle && !titleOpen \? " line-clamp-2 sm:line-clamp-3" : ""/.test(codeOnly) &&
    /Show the full wording/.test(codeOnly)
);

/* --------------------------------------------------------------------------
   the reviewer's own sign-off is on ReviewDetail.tsx, not here — see
   tests/review.test.mjs's own section on it. CheckDetail (Capture, Field)
   is a capture-time workspace; "fit to share with the client" is a
   review-time question, asked on /review's own detail pane now. */

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nCHECK SCREEN OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
