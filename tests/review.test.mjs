import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Visual review, and the one rule it exists to protect.
 *
 *  The people who can tell whether a photograph shows the right panel are
 *  mostly not the people holding the tablet. Before this screen, visual
 *  evidence was reachable only by opening the single check that carried it —
 *  a discipline lead reviewing electrical evidence had to already know which
 *  of 324 checks to open. Nobody does that, so nobody reviewed.
 *
 *  The rule: a review comment is a conversation ABOUT the evidence. It is never
 *  merged into `Response.observation`, which is the auditor's record of what
 *  they found, nor into `Finding.description`, which is what reaches ACSA and
 *  the SACAA. An engineer who thinks their aside might be quoted in an audit
 *  report writes a different, more careful, less useful comment — and a report
 *  that quietly absorbed one would be misattributing a finding.
 *
 *  Source-read, like the other offline suites. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const review = src("app", "(app)", "review", "page.tsx");
const store = src("lib", "store.ts");
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

/* ------------------------------- Part 1: feedback never becomes the record */

/* REWRITTEN 2026-09-10 (task #67). This used to read
     !/appendObservation|observation:/.test(review)
   which tested for a STRING, not for the rule. The moment the screen grew a
   view model with an `observation` field on it — a READ, for display, of what
   the auditor already wrote — the assertion failed while the rule it protects
   was never in danger. A test that fires on the wrong thing gets edited to
   pass, and then it is guarding nothing.

   The rule is about WRITES. This screen may mutate exactly three things, all of
   them feedback, and anything else reaching the store from here would be the
   real violation. */
const STORE_WRITERS_ALLOWED = ["addFeedback", "toggleFeedbackResolved", "removeFeedback"];
const writersUsed = [...review.matchAll(/useStore\(\(s\) => s\.(\w+)\)/g)].map((m) => m[1]);
const forbidden = writersUsed.filter(
  (w) => !STORE_WRITERS_ALLOWED.includes(w) && !["role"].includes(w)
);

check(
  "the review screen writes nothing but feedback",
  forbidden.length === 0,
  `reaches the store for: ${forbidden.join(", ")} — a comment about a photograph is not the auditor's record of what they found`
);

check(
  "and never touches the observation or the finding text",
  !/\bpatch\(|appendObservation|setObservation|patchFinding|addFinding/.test(review),
  ""
);

check(
  "the review screen never writes a finding",
  !/addFinding|updateFinding/.test(review),
  "a comment must not become what reaches ACSA"
);

check(
  "feedback is its own type, not a field on Response or Finding",
  /export interface FeedbackNote \{/.test(types) &&
    !/feedback[?]?: (string|FeedbackNote\[\])[;,][\s\S]{0,200}?export interface Finding/.test(types),
  ""
);

check(
  "the screen says so on the face of it",
  /not written into the record/.test(review),
  "an engineer needs to know their aside will not be quoted at them"
);

/* ------------------------------------ Part 2: feedback belongs to one audit */

check(
  "feedback lives inside the visit's own data",
  /interface VisitData \{[\s\S]*?feedback\?: Record<string, FeedbackNote\[\]>;[\s\S]*?\}/.test(
    store
  ),
  "a comment on September's photograph is not a comment on March's"
);

check(
  "feedback is written through the scoped helper",
  /addFeedback: \(checkId, text\) => \{[\s\S]*?writeScope\(/.test(store),
  ""
);

check(
  "the review screen reads feedback through the scoped hook",
  /useFeedback\(\)/.test(review) &&
    !/useStore\(\(s\) => s\.(feedback|byVisit)\)/.test(review),
  ""
);

check(
  "adding the field needed no migration",
  /feedback\?: Record/.test(store) && /absent-means-empty/.test(store),
  "an optional field reads correctly on an older persisted visit"
);

/* ----------------------------------------- Part 3: who said it is recorded */

check(
  "every note carries its author and side",
  /author: string;/.test(types) && /role: Role;/.test(types) &&
    /author: get\(\)\.auditor,/.test(store) && /role: get\(\)\.role,/.test(store),
  "an engineer's read of a photograph and an auditor's are both worth telling apart"
);

check(
  "the side is shown on the note",
  /n\.role === "acsa" \? "ACSA" : "TPJV"/.test(review),
  ""
);

check(
  "an empty comment is not posted",
  /const body = text\.trim\(\);\s*\n\s*if \(!body\) return;/.test(store),
  ""
);

/* ------------------------------------ Part 4: a resolved thread is not erased */

check(
  "marking a comment dealt with keeps it",
  /resolvedAt: n\.resolvedAt \? null : Date\.now\(\)/.test(store),
  "a thread that erases itself is no use at the next visit"
);

check(
  "resolving is reversible",
  /toggleFeedbackResolved/.test(store) && /Reopen this comment/.test(review),
  "a mis-tap must not bury a comment"
);

/* --------------------------------------- Part 5: it is actually reviewable */

check(
  "discipline is the first control, not a dropdown",
  /\["All", \.\.\.disciplinesAt\(entityCode\)\.filter/.test(review),
  "an engineer reads their own discipline and no other"
);

check(
  "the screen is scoped to the entity and visit in view",
  /useEntity\(\)/.test(review) && /useVisitId\(\)/.test(review),
  "per discipline per airport is the whole request"
);

check(
  "only rows that actually carry evidence are listed",
  /if \(!r \|\| r\.attachments\.length === 0\) continue;/.test(review) &&
    /if \(w\.attachments\.length === 0\) continue;/.test(review),
  "what was skipped is the dashboard's job, not this screen's — and it holds for a walk item as much as a check"
);

/* ---- task #67 · the walk is evidence too --------------------------------- */

/* An auditor photographs something ACSA's list does not cover. Until this, the
   photograph existed on the tablet and was invisible to the engineer reviewing
   evidence — and those are disproportionately the ones worth a second opinion,
   because nobody wrote a check for them and there is no threshold to fall back
   on. */
check(
  "walk items reach the review screen",
  /const adhoc = useAdhoc\(\);/.test(review) && /for \(const w of adhoc\)/.test(review),
  ""
);

check(
  "and are marked as hand-added rather than passed off as register checks",
  /isWalk: true,/.test(review) && /\{it\.isWalk && \(/.test(review) &&
    /ADDED ON THE WALK/.test(review),
  "'this was not on ACSA's list' is the single most useful thing a reviewer can know about the row"
);

check(
  "an unattributed walk item gets a named bucket, not a blank one",
  /const NO_SYSTEM = "No asset system recorded";/.test(review) &&
    /const NO_DISCIPLINE = "No discipline recorded";/.test(review) &&
    /w\.discipline \?\? NO_DISCIPLINE/.test(review),
  "discipline is nullable on a walk item and null is honest — but a blank in a filter list reads as a bug and silently hides the row"
);

check(
  "a walk item is opened where it was recorded, not on a check screen it has no id for",
  /active\.isWalk \? "\/field" : `\/capture\?check=\$\{active\.key\}`/.test(review) &&
    /Open on the walk/.test(review),
  ""
);

check(
  "comments key off the row's own id, so a walk item can carry a thread",
  /addFeedback\(active\.key, draft\)/.test(review) &&
    /toggleFeedbackResolved\(active\.key, n\.id\)/.test(review) &&
    /removeFeedback\(active\.key, n\.id\)/.test(review),
  "the feedback map is keyed by string, so a WALK id needs no schema change"
);

/* The tray is the third source, and the one most worth a second opinion: a
   capture is a photograph nobody has yet said what it is OF. */
check(
  "the fields a capture already carried are declared, without a store migration",
  /thumbDataUrl\?: string;\n  caption\?: string;/.test(types) &&
    /DECLARING WHAT WAS ALREADY BEING WRITTEN/.test(types),
  "the walk bar spreads PhotoButton's whole payload into addCapture, so these have been on disk all along — correcting the type changes no stored data and needs no version bump"
);

check(
  "unassigned captures reach the review screen too",
  /const captures = useCaptures\(\);/.test(review) && /for \(const cap of captures\)/.test(review),
  "a loose photograph is the one a discipline lead can settle in five seconds and an auditor can wonder about all week"
);

check(
  "and each is its own row with its own thread",
  /key: cap\.id,/.test(review) && /feedback\[cap\.id\]/.test(review),
  "a pile with one comment box is a pile nobody triages"
);

check(
  "a capture is adapted to an Attachment rather than the media components learning a second shape",
  /function captureAsAttachment\(c: Capture\): Attachment/.test(review) &&
    /thumbDataUrl: c\.thumbDataUrl,/.test(review),
  "one renderer, one set of fallbacks, one placeholder wording"
);

check(
  "an unassigned capture says it is unassigned rather than reading as uncaptured",
  /NOT ASSIGNED TO A CHECK/.test(review) && /Assign it on the walk/.test(review),
  ""
);

check(
  "the list sorts on one clock, whichever kind of row it is",
  /rows\.sort\(\(a, b\) => b\.capturedAt - a\.capturedAt\)/.test(review),
  "a check's capturedAt and a walk item's createdAt are both flattened onto the row, so the newest evidence leads regardless of where it came from"
);

check(
  "unavailable media is labelled rather than rendered blank",
  /no image stored — captured before this worked/.test(review) &&
    /no audio stored/.test(review),
  ""
);

check(
  "a photograph can be opened full size",
  /function Lightbox/.test(review) && /cursor-zoom-in/.test(review),
  "a 4:3 thumbnail does not settle whether that is the right panel"
);

check(
  "voice transcripts are shown to the reviewer",
  /a\.transcript &&/.test(review),
  ""
);

check(
  "object URLs go through the shared hook, so they are revoked",
  /useBlobUrl/.test(review) && !/URL\.createObjectURL/.test(review),
  "a reviewer scrolling a day of photographs would leak megabytes otherwise"
);

/* --------------------------------------------- Part 6: engineers can reach it */

check(
  "Review is in the navigation",
  /\{ href: "\/review", label: "Review"/.test(shell),
  ""
);

check(
  "ACSA can reach Visual review despite being read-only elsewhere",
  /n\.href !== "\/dashboard" && n\.href !== "\/review"/.test(shell),
  "their engineers answering a photograph is the point of the screen"
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nREVIEW OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
