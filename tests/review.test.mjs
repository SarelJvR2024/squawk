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

/* build prompt 8 (22 Nov 2026): /review is now a redirect — see this
   file's own Parts 1-3 retirement note below for what moved where. */
const review = src("app", "(app)", "review", "page.tsx");
const reviewDetail = src("components", "ReviewDetail.tsx");
const checkDetail = src("components", "CheckDetail.tsx");
const types = src("lib", "types.ts");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ----------------- Parts 1-3 RETIRED, build prompt 8 (22 Nov 2026) --------
 *
 *  /review is now a bare redirect to /issues?filter=toReview (see that
 *  file's own header). The "By check" tab this file's Parts 1-3 used to
 *  guard — the register tree, the reviewer-specific isolators (NC/
 *  findings/flagged/evidence/unsigned), the rail's sign-off marks, the
 *  reviewed/total discipline count — is retired outright, not hidden
 *  behind a flag: folded into the Checks screen's own "everything for one
 *  check is captured on that screen, nothing duplicated elsewhere" (build
 *  prompt 3), not into Issues, which is finding-centric and has no slot in
 *  its own filter-chip row (All/To review/Carried/Critical/Safety/Closed)
 *  for "every check, reviewer-filtered". The ~20 assertions this comment
 *  replaces are not rewritten against the Checks screen either: that
 *  screen was not built BY this prompt and asserting its exact source
 *  here would be guessing at an interface this prompt does not own.
 *
 *  Part 4 below (ReviewDetail.tsx itself) is UNTOUCHED and still fully
 *  correct — this prompt did not edit that component, and its own
 *  assertions keep passing because the component itself still exists,
 *  simply with no route left that mounts it (dead code, same category as
 *  EvidenceQuickCapture.tsx — see tests/review-table-v2.test.mjs's own
 *  note). The two checks in old Part 4 that asserted review/page.tsx
 *  ACTUALLY MOUNTING ReviewDetail (and wiring prev/next to it) are removed
 *  here for the same reason as Parts 1-3: that mount no longer exists.
 *  Build prompt 10 removes this dead code when it does its own
 *  "/closure and /review and /cleanup -> /issues... remove dead code only
 *  after the redirects work" pass — explicitly that prompt's job, not
 *  this one's. */
check(
  "/review is a bare redirect now, not a screen with its own tree/filters/ReviewDetail mount to guard",
  /redirect\("\/issues\?filter=toReview"\);/.test(review)
);

/* ------------------------------------------ Part 4: the detail is ReviewDetail
   REVERSED, 14 October 2026. Sarel, after trying the CheckDetail reuse this
   screen had since 13 October: "this section is confusing... i dont need all
   the policy references etc." ReviewDetail (src/components/ReviewDetail.tsx)
   is a trimmed, review-specific view — observation, evidence and its
   verdict, every photo/voice note with its caption — not the full editing
   workspace Capture and Field still share. */

/* The two checks that used to stand here (review/page.tsx actually
   mounting ReviewDetail, with prev/next wired to it) are removed, build
   prompt 8 — see this file's own Parts 1-3 retirement note above; /review
   no longer mounts anything at all. */

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

/* The reviewer's own sign-off lives on ReviewDetail — a review-time
   question ("is this fit to share with the client"), not a capture-time
   one, so it is not on CheckDetail (Capture, Field) at all. Two states,
   tapping the chosen one again clears back to "not yet reviewed", same
   shape as the Evidence status buttons right above it on the same
   screen — see tests/sharepoint.test.mjs for the functional proof that
   neither field it writes ever reaches the portal. */
check(
  "the detail pane carries the reviewer's own sign-off, not CheckDetail",
  /patch\(check\.id, \{\s*\n\s*reviewStatus: on \? null : key,/.test(reviewDetail) &&
    /\["approved", "good", IconCheck, "Approved for client"\]/.test(reviewDetail) &&
    /\["changesRequired", "warn", IconFlag, "Changes required"\]/.test(reviewDetail),
  "fit to share with the client is asked where the client-facing review happens, not on the capture workspace"
);

check(
  "a note is only asked for while changes are required, and who/when is shown once set",
  /r\.reviewStatus === "changesRequired" &&[\s\S]{0,300}reviewStatusNote/.test(reviewDetail) &&
    /r\.reviewStatusBy &&/.test(reviewDetail),
  "a note nobody can read because approval needed none is a field asked for no reason"
);

/* ------------------------------- Part 4b: pinned header, 15 October 2026 —
   Sarel: "keep the audit check description on top even when i scroll. also
   have the 3 compliance checks on top even when scrolling for (audit
   check, evidence, site inspection) and then a combined compliance of the
   3." */

check(
  "the check's own requirement wording sits inside a sticky header, not the scrolling body",
  /className="sticky top-0[^"]*"[\s\S]{0,1000}<h2[^>]*>\{check\.requirement\}<\/h2>/.test(reviewDetail),
  "pinned so a reviewer never loses sight of which check this is while scrolling the evidence below it"
);

check(
  "the sticky header carries all four compliance cells — audit check, evidence, site inspection, and the combined reading",
  /label="Audit check"/.test(reviewDetail) &&
    /label="Evidence"/.test(reviewDetail) &&
    /label="Site inspection"/.test(reviewDetail) &&
    /label="Combined"/.test(reviewDetail),
  "three axes the user named plus the derived combined one — all four, not a subset"
);

check(
  /* The Evidence review pass (docs/capture-review/evidence-review-discovery.md
     §4) widened the Evidence argument from the raw evidenceVerdict to
     evidenceAxisFor(evidenceVerdict, evidenceForCheck) — still fully
     derived, now through one more pure function rather than a stored
     field, which is exactly what this assertion guards. */
  "the combined cell is DERIVED from the other three, never a fifth stored field",
  /reviewCombinedCompliance\(r\.compliance, evidenceAxis, r\.siteInspection\)/.test(reviewDetail) &&
    /import \{ evidenceAxisFor, reviewCombinedCompliance \} from "@\/lib\/review";/.test(reviewDetail),
  "a stored combined value is the one that goes stale the first time one of the three it copies changes"
);

check(
  "the combined cell is marked when the review is still incomplete, so a clean-looking verdict is never mistaken for a finished one",
  /combinedPartial/.test(reviewDetail) &&
    /\.some\(\(v\) => v === null\)/.test(reviewDetail)
);

/* ---------------------------- Part 4c: the new third compliance axis --- */

check(
  "Response.siteInspection exists, reuses Compliance, and is independent of compliance/evidenceVerdict",
  /siteInspection: Compliance \| null;/.test(types)
);

check(
  "siteInspection is editable on ReviewDetail, reusing EVIDENCE_VERDICTS (now all four Compliance values) rather than a parallel set",
  /patch\(check\.id, \{ siteInspection: on \? null : v\.key \}\)/.test(reviewDetail) &&
    /EVIDENCE_VERDICTS\.map\(\(v\) => \{[\s\S]{0,200}r\.siteInspection === v\.key/.test(reviewDetail)
);

check(
  "EVIDENCE_VERDICTS carries all four Compliance values, not three — Compliant, Non-compliant, Not Verified, Not Applicable",
  /\{ key: "C", label: "Compliant"/.test(checkDetail) &&
    /\{ key: "NC", label: "Non-compliant"/.test(checkDetail) &&
    /\{ key: "NV", label: "Not Verified"/.test(checkDetail) &&
    /\{ key: "N\/A", label: "Not Applicable"/.test(checkDetail)
);

check(
  "the unanswered placeholder on Evidence and Site inspection reads 'Not Verified', not '— not yet' — the two meant the same thing",
  (reviewDetail.match(/emptyLabel="Not Verified"/g) ?? []).length === 2
);

/* ------------------------- Part 4d: evidence requested vs received ----- */

check(
  "what evidence the register asks for is shown, not only what was received",
  /Evidence requested/.test(reviewDetail) &&
    /check\.evidenceExpected \|\| \(check\.acsaEvidence\.length > 0/.test(reviewDetail),
  "the register's own evidenceExpected/acsaEvidence, already read by CheckDetail, was never surfaced here before"
);

check(
  "what was actually uploaded is labelled 'evidence received' and counted, not just rendered as an unlabelled photo strip",
  /Evidence received/.test(reviewDetail) &&
    /r\.attachments\.length > 0 &&[\s\S]{0,120}· \{r\.attachments\.length\}/.test(reviewDetail)
);

check(
  "the audit check observation notes are the first section, sitting immediately above the evidence they explain",
  /Audit check observation[\s\S]{0,3200}label-xs mb-1\.5">Evidence</.test(reviewDetail)
);

check(
  "the audit check's own compliance has a button grid, not only the sticky strip's select",
  /Audit check compliance[\s\S]{0,400}STATUSES\.map/.test(reviewDetail) &&
    /setCompliance\(check\.id, on \? null : st\.key\)/.test(reviewDetail)
);

/* ------------------------- Part 4e: raise a finding, without leaving --- */

check(
  "a finding raised here is always tied to the check on screen, not picked from a search",
  /addFinding\(\{[\s\S]{0,40}checkId: check\.id,/.test(reviewDetail)
);

check(
  "discipline and asset system default to the check's own, same convenience RaiseFindingSheet gives once a check is picked",
  /useState\(check\.discipline\)/.test(reviewDetail) && /useState\(check\.system\)/.test(reviewDetail)
);

check(
  "a headline is required, same rule RaiseFindingSheet and AddItemSheet both enforce",
  /if \(!title\) \{/.test(reviewDetail) && /setNewError\(/.test(reviewDetail)
);

check(
  "photo, voice and file capture here write into THIS check's own attachments, not a second store of evidence",
  /PhotoButton[\s\S]{0,100}addAttachment\(check\.id, \{ \.\.\.m, createdBy: auditor \}\)/.test(reviewDetail) &&
    /VoiceNoteButton[\s\S]{0,100}addAttachment\(check\.id, \{ \.\.\.m, createdBy: auditor \}\)/.test(reviewDetail) &&
    /FileButton[\s\S]{0,100}addAttachment\(check\.id, \{ \.\.\.m, createdBy: auditor \}\)/.test(reviewDetail)
);

check(
  "the new finding's capture buttons do not render a second photo strip — it shows once, in Evidence received",
  (() => {
    const i = reviewDetail.indexOf("Raise a finding");
    const section = reviewDetail.slice(i, reviewDetail.indexOf("</section>", i));
    return !/<AttachmentStrip/.test(section);
  })(),
  "the same attachments array already renders in the Evidence section above"
);

/* ----------------------------------------- Part 5: reference codes gone */

/* 13 Nov 2026 — "Review pages: remove audit-check reference codes from the
 * UI": the sidebar row (and ReviewDetail's own sticky header, and the Risk &
 * root cause table/panel) no longer shows a portal-id reference code, only
 * the check's own readable requirement text. f.checkId/check.id themselves
 * are untouched everywhere else they are supposed to drive linking, sync and
 * exports — see sites.test.mjs/photos.test.mjs/raisefinding.test.mjs, which
 * still pass and still assert portalIdFor() is used correctly in store.ts,
 * exports.ts, the raise-finding sheet and CheckDetail.tsx. */
/* The sidebar-row and entity-scoping checks that used to stand here are
   removed, build prompt 8 — /review has no sidebar or register reads of
   its own left to scope; see this file's own Parts 1-3 retirement note. */
check(
  "portalIdFor is no longer called anywhere on this screen — page.tsx and ReviewDetail.tsx both dropped it",
  !/portalIdFor/.test(review) && !/portalIdFor/.test(reviewDetail)
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
   menu bar." It moved to the More menu; OFF_NAV kept the page's own
   heading in sync with the More menu's own label while NAV didn't carry it.
   RENAMED (18 Nov): Sarel — "rename 'Review' to 'Triage'." Label only.
   BACK IN THE BAR (18 Nov, later the same day): Sarel — "move triage to
   the main toolbar." Full circle — NAV carries it again, so it needs no
   More-menu entry and no OFF_NAV fallback any more; its heading comes
   from NAV directly, same as every other bar tab. */
check(
  "Triage is back in the main nav bar, not the More menu",
  /\{ href: "\/review", label: "Triage", icon: IconSearch \}/.test(shell) &&
    !/label="Triage"/.test(shell) &&
    !/"\/review": "Triage"/.test(shell)
);

check(
  "ACSA can reach Review despite being read-only elsewhere",
  /role === "acsa" && n\.href !== "\/review"/.test(shell),
  "reviewing and editing a check is the point of the screen, for both sides of the audit"
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nREVIEW OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
