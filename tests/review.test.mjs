import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The central place to review one audit check, and what it replaced.
 *
 *  REVERSED, 13 October 2026 — Sarel: "i want us to update the review page.
 *  this should be a page where you have the audit checks on the left per
 *  discipline and on the right panel have all evidence requests, evidence
 *  notes, compliance, observations, findings, photos all in one place
 *  everything you have in the system for that audit check. this should be
 *  the central place to review everything for an audit check and all
 *  compliance statuses and allow the editing and updating of all fields."
 *  Confirmed with him directly: this REPLACES the old screen, not alongside
 *  it.
 *
 *  Every assertion below this comment up to "the walk is evidence too" used
 *  to guard the OLD /review — a flat gallery of every photograph and voice
 *  note this visit captured, with Photo/Lightbox components of its own,
 *  walk items and unassigned captures folded in as rows, and a feedback
 *  thread deliberately kept OUT of the record for an engineer who was never
 *  on site. None of that exists on the page any more: it is gone outright,
 *  not hidden behind a flag, and this file stops asserting it rather than
 *  rewriting the same shape of test around machinery that is no longer
 *  there. (`FeedbackNote` itself, and the store's `addFeedback` /
 *  `toggleFeedbackResolved` / `removeFeedback` / `useFeedback`, are untouched
 *  — src/lib/shared.ts's sync layer still carries a "feedback" row kind, so
 *  that infrastructure stays; it simply has no screen writing to it any
 *  more.)
 *
 *  What replaced it is the same left-rail-plus-detail shape as Capture
 *  (src/app/(app)/capture/page.tsx): a discipline `<select>`, its asset
 *  systems collapsible, checks nested under them, and CheckDetail — the
 *  exact component Capture and Field use to edit a check in full — on the
 *  right. Reviewing a check and editing it are the same action on the same
 *  screen now, which is the whole point: everything the system holds for
 *  that check, in one place, editable.
 *
 *  Source-read, like the other offline suites. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const review = src("app", "(app)", "review", "page.tsx");
const types = src("lib", "types.ts");
const shell = src("components", "AppShell.tsx");

/* Comments discuss what this screen deliberately does NOT do (needsDesk,
   deskDone) by name, same as tests/location.test.mjs's own codeOnly — the
   CODE is what has to be right, not whether the word appears at all. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const reviewCode = codeOnly(review);

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------------------------------------- Part 1: the tree is the register */

check(
  "the rail is built from the register, per discipline",
  /disciplinesAt\(entityCode\)/.test(review) &&
    /checksOf\(\s*entityCode,\s*discipline\s*\)/.test(review),
  "the left rail is the audit checks, not a derived gallery of what happened to have photos"
);

/* The one real behavioural difference from Capture's own rail: Capture
   filters to `needsDesk` because a check with no question and no evidence to
   gather has nothing for a desk to progress. A reviewer needs the opposite —
   a physical-only check can still carry an observation, an attachment, or a
   finding worth a second look, and hiding it here would be the one place in
   the app nobody could go back and check that. */
check(
  "every check is listed, not only the ones a desk can answer",
  /checksOf\(\s*entityCode,\s*discipline\s*\)/.test(reviewCode) && !/needsDesk/.test(reviewCode),
  "needsDesk exists to keep a tablet from offering a dead question — it says nothing about whether there is something to review"
);

check(
  "no ad-hoc walk item reaches this screen",
  !/useAdhoc/.test(review) && !/AdHocItem/.test(review),
  "'audit checks... per discipline' is the register; a hand-added observation with no register id is reviewed where it was raised"
);

check(
  "and no loose capture is folded in as a row either",
  !/useCaptures\(\)/.test(review) && !/captureAsAttachment/.test(review),
  "the gallery's three row sources (checks, walk items, unassigned captures) collapse to one: the register"
);

/* --------------------------------------------- Part 2: review-shaped filters */

/* Capture's chips are a DESK WORKFLOW over the register — what is still open,
   what needs asking, what carries last year's finding. A reviewer going back
   over a finished visit is not working the desk a second time; they want
   whatever still needs a second look. REVERSED from the old file's own
   assertion here, which checked that discipline was a chip row rather than a
   dropdown — this screen deliberately takes Capture's rail shape instead,
   `<select>` included, because it is reviewing the same register the same
   way Capture captures it. */
check(
  "the filters are a reviewer's, not the desk's capture workflow",
  /\["all", "All"\]/.test(review) &&
    /"nc", "NC"/.test(review) &&
    /"findings", "Findings"/.test(review) &&
    !/"q", "Ask"/.test(review) &&
    !/"pf", "2025"/.test(review),
  "open/ask/2025 are about what is left to capture; non-compliant/findings/flagged/evidence are about what needs a second look"
);

check(
  "non-compliant checks can be isolated",
  /responses\[c\.id\]\?\.compliance === "NC"/.test(review),
  ""
);

check(
  "checks with a finding raised against them can be isolated",
  /useVisitFindings\(\)/.test(review) && /findingsOn\(c\.id\)\.length > 0/.test(review),
  "a finding living only on the Asset Assurance screen is a finding the reviewer of the check it came from has to go hunting for"
);

check(
  "flagged checks can be isolated",
  /responses\[c\.id\]\?\.improvementFlag/.test(review),
  "the same flag CheckDetail's own 'Flag for review' panel sets — one flag, read the same way everywhere"
);

check(
  "checks with evidence still outstanding can be isolated",
  /status === "toBeProvided" \|\| status === "specificNotAvailable"/.test(review),
  ""
);

check(
  "the discipline select shows reviewed/total, not desk-done/total",
  !/deskDone/.test(reviewCode) && !/deskAnswered/.test(reviewCode) && /reviewed\(/.test(reviewCode),
  "a desk commit flag is a capture-workflow concept; this screen reads straight off whatever is on the record"
);

/* ----------------------------------------- Part 3: no desk-commit machinery */

check(
  "there is no 'save all' — nothing here is a desk answer to commit",
  !/[Ss]ave all/.test(review) && !/useStore\(\(s\) => s\.commit\)/.test(review),
  "committing a desk answer is Capture's job; reviewing and editing a record that already exists needs no commit step of its own"
);

/* ------------------------------------------ Part 4: the detail is ReviewDetail
   REVERSED, 14 October 2026. Sarel, after trying the CheckDetail reuse this
   screen had since 13 October: "this section is confusing... i dont need all
   the policy references etc." ReviewDetail (src/components/ReviewDetail.tsx)
   is a trimmed, review-specific view — observation, evidence and its
   verdict, every photo/voice note with its caption — not the full editing
   workspace Capture and Field still share. */

check(
  "the selected check opens in ReviewDetail, not the full CheckDetail workspace",
  /import ReviewDetail from "@\/components\/ReviewDetail";/.test(review) &&
    /<ReviewDetail\s*\n\s*key=\{active\.id\}\s*\n\s*check=\{active\}/.test(review),
  "a reviewer's own trimmed view — observation, evidence, photos — not the policy references and full edit workspace Capture and Field use"
);

check(
  "prev/next are wired the same way Capture wires them",
  /onPrev=\{\(\) => move\(-1\)\}/.test(review) &&
    /onNext=\{\(\) => move\(1\)\}/.test(review),
  ""
);

check(
  "this screen itself writes nothing to the store — every edit goes through ReviewDetail",
  !/useStore\(\(s\) => s\.patch\)/.test(review) && !/useStore\(\(s\) => s\.commit\)/.test(review),
  "a second place reaching for patch() would be a second place that could disagree with ReviewDetail about what a field means"
);

/* No Photo/Lightbox pair of its own any more, and no useRecordImage either —
   see tests/location.test.mjs and tests/photoview.test.mjs for what replaced
   it: a photograph on a check is viewed and captioned through CheckDetail's
   own AttachmentStrip (src/components/Capture.tsx), the same strip Capture
   and Field already use, so there is exactly one place in the app that
   knows how to render an attachment. */
check(
  "there is no gallery-specific Photo or Lightbox component left on this screen",
  !/function Photo\(/.test(review) && !/function Lightbox/.test(review),
  "a photograph is rendered once, by CheckDetail, not reinvented per screen"
);

/* ----------------------------------------- Part 5: ids are the site's own */

check(
  "the display id on a row is the site's own portal id, same as every other screen",
  /portalIdFor\(entityCode, c\.id\)/.test(review),
  "KSIA-ELE-001 and ORTIA-ELE-001 are one requirement at two airports"
);

check(
  "the screen is scoped to the site in view, not the whole register",
  /useEntityCode\(\)/.test(review) && !/\bCHECKS\.(length|filter|map|find)\b/.test(review),
  "the register is shared by ten sites; reading it unscoped puts the wrong checklist in front of a reviewer"
);

check(
  "feedback is its own type, untouched by this rewrite",
  /export interface FeedbackNote \{/.test(types) &&
    !/feedback[?]?: (string|FeedbackNote\[\])[;,][\s\S]{0,200}?export interface Finding/.test(types),
  "the sync layer still carries a feedback row kind; removing the type would be removing infrastructure this change never asked for"
);

/* --------------------------------------------- Part 6: engineers can reach it */

/* THEN: Review was its own entry in the nav bar.
   NOW (30 Sep): Sarel — "move safety and review menu items out of the main
   menu bar." It moved to the More menu; OFF_NAV keeps the page's own
   heading saying "Review" now that NAV no longer does. Unaffected by this
   rewrite — the route and its place in the menu did not change, only what
   is behind it. */
check(
  "Review is reachable from the More menu",
  /label="Review"/.test(shell) && /"\/review": "Review"/.test(shell),
  "moved out of the nav bar on Sarel's direct word, but still one press away"
);

check(
  "ACSA can reach Review despite being read-only elsewhere",
  /n\.href !== "\/dashboard" && n\.href !== "\/review"/.test(shell),
  "reviewing and editing a check is the point of the screen, for both sides of the audit"
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nREVIEW OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
