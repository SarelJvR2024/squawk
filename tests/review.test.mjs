import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Visual review, and the one rule it exists to protect.
 *
 *  The people who can tell whether a photograph shows the right panel are
 *  mostly not the people holding the tablet. Before this screen, visual
 *  evidence was reachable only by opening the single check that carried it —
 *  a discipline lead reviewing electrical evidence had to already know which
 *  of 374 checks to open. Nobody does that, so nobody reviewed.
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

check(
  "the review screen never writes an observation",
  !/appendObservation|observation:/.test(review),
  "a comment about a photograph is not the auditor's record of what they found"
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
  /\["All", \.\.\.DISCIPLINES\.filter/.test(review),
  "an engineer reads their own discipline and no other"
);

check(
  "the screen is scoped to the entity and visit in view",
  /useEntity\(\)/.test(review) && /useVisitId\(\)/.test(review),
  "per discipline per airport is the whole request"
);

check(
  "only checks that actually carry evidence are listed",
  /responses\[c\.id\]\?\.attachments\.length \?\? 0\) > 0/.test(review),
  "what was skipped is the dashboard's job, not this screen's"
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
