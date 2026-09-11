import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE FOLLOW-UP SCREEN, AS THE THING THAT ANSWERS "WHY IS THIS STILL OPEN?"
 *
 * Sarel, after using it on a laptop, gave one instruction with four halves:
 *
 *   "Don't have an icon per audit, just need to see the current status of the
 *    finding, and the year/month when it was logged. I like this idea of the
 *    timeline view — let's bring that into the left panel: when you expand an
 *    asset system it brings up this timeline view of all findings in order of
 *    the audit timeline, and the current status of each finding. In the right
 *    hand side panel we then show the details of the finding — remember it can
 *    be a check or evidence or a photo, we are merging it all in this view —
 *    and the timeline of all the comments and updates: when it was logged, when
 *    evidence was uploaded, when comments was added, when visual inspections
 *    was added, when next audits reviewed it and confirmed the compliance or
 *    non compliance. In some cases it might be opened, then next audit closed,
 *    and then opened again the next audit — we want to see that history. Need
 *    to capture remediation actions and next steps and updates logged to the
 *    current audit. Also allow the capture of multiple possible hazardous
 *    events and the likelihood recorded for each finding."
 *
 * Almost all of the data was already in the record. The screen was reading one
 * visit's copy of it, so an item closed in 2026 and found open again in 2027
 * looked exactly like an item somebody had not got round to. These assertions
 * are about the reading, the two new fields, and the one rule the new fields
 * must not break: no second, un-agreed rating for anything.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const types = read("src", "lib", "types.ts");
const store = read("src", "lib", "store.ts");
const carry = read("src", "lib", "carryforward.ts");
const closure = read("src", "app", "(app)", "closure", "page.tsx");
const stream = read("src", "components", "ItemStream.tsx");
const events = read("src", "components", "PossibleEvents.tsx");
const merge = read("src", "lib", "merge.ts");
const exports_ = read("src", "lib", "exports.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const closureCode = codeOnly(closure);
const eventsCode = codeOnly(events);
const streamCode = codeOnly(stream);

/* ---- 1 · the left panel is a timeline, not a strip ---------------------- */

check(
  "the per-audit cell strip is off the row",
  !/<VisitStrip/.test(closureCode),
  "Sarel: don't have an icon per audit, just the current status and when it was logged"
);

check(
  "and the legend that taught it went with it",
  !/visits, oldest first:/.test(closure),
  "a legend for a control that does not exist costs a row AND teaches something untrue"
);

check(
  "findings in an open asset system are grouped by the audit that raised them",
  /byAudit: \(\(\) => \{/.test(closureCode) &&
    /rounds\.set\(p\.originVisit, \{/.test(closureCode),
  ""
);

check(
  "oldest audit first",
  /\[\.\.\.rounds\.values\(\)\]\.sort\(\(a, b\) => a\.visit\.localeCompare\(b\.visit\)\)/.test(
    closureCode
  ),
  "visit ids are YYYY-MM, so they sort lexicographically — no date parsing anywhere in that file"
);

check(
  "each round says which audit it is",
  /raised \{round\.label\}/.test(closure),
  ""
);

check(
  "and each row carries its own status and date",
  /const status = o \?\? "Open";/.test(closureCode) && /\{p\.originLabel\}/.test(closureCode),
  "an item in this list is outstanding, so with nothing recorded it is Open"
);

check(
  "the rail is decorative, and says so",
  /aria-hidden\s*\n?\s*className="absolute inset-y-0 left-\[14px\] w-px"/.test(closure),
  "every fact on the row is in text; the line is a second reading of it"
);

/* ---- 2 · the right panel merges everything, in one order ---------------- */

check(
  "there is one stream, assembled from the record rather than from one visit",
  /export function streamFor\(/.test(carry) && /export function useStream\(/.test(carry),
  ""
);

for (const kind of ["raised", "outcome", "evidence", "action", "next", "photo", "voice", "note", "event"]) {
  check(
    `the stream carries ${kind}`,
    new RegExp(`kind: "${kind}"`).test(carry) || new RegExp(`\\| "${kind}"`).test(carry),
    ""
  );
}

check(
  "an update carries the status as it stood when it was written",
  /label: n\.outcome \? `Update logged · \$\{n\.outcome\}` : "Update logged"/.test(carry),
  "'PO raised' while it was Open - repeat means something different from the same words after it closed"
);

check(
  "a photograph on a follow-up is named for what it means",
  /"Photograph — went and looked"/.test(carry),
  "Sarel asked for when visual inspections was added; a file type is not that"
);

check(
  "the outcome each audit recorded is a stream entry, in words",
  /label: `Audit found it \$\{OUTCOME_WORD\[rec\.outcome\]\}`/.test(carry),
  "opened, then closed, then opened again is the sequence this screen exists to show"
);

check(
  "and the words come off ACSA's own outcome vocabulary, not a parallel one",
  /const OUTCOME_WORD: Record<VerificationOutcome, string>/.test(carry),
  ""
);

check(
  "every visit is read, not just the one in view",
  /for \(const v of visits\) \{\s*\n\s*const rec = byVisit\[scopeKey\(entityCode, v\.id\)\]\?\.verifications\?\.\[portalId\];/.test(
    carry
  ),
  "the screen used to read the current visit's copy, so a repeat looked like unfinished work"
);

check(
  "a visit that recorded nothing gets no entry",
  /if \(!rec\) continue;/.test(carry),
  "inventing a row for a visit nobody wrote in is putting words in their mouth"
);

check(
  "oldest first, with a stable tie-break",
  /out\.sort\(\(a, b\) => a\.at - b\.at \|\| a\.kind\.localeCompare\(b\.kind\)\)/.test(carry),
  "several entries fall back to the same visit start; without the tie-break the list reshuffles per render"
);

/* ---- 3 · precision is never invented ------------------------------------ */

check(
  "an entry says whether its time is real",
  /dated: "exact" \| "visit";/.test(carry),
  ""
);

check(
  "and the undated ones are shown as belonging to the audit, not to a minute",
  /`\$\{e\.visitLabel\} · date not recorded`/.test(stream),
  "a timeline that displays a time it does not have is lying about how much it knows"
);

check(
  "the visit's own start is the floor, derived rather than guessed",
  /Date\.parse\(`\$\{v\.id\}-01T00:00:00Z`\)/.test(carry),
  ""
);

/* ---- 4 · remediation, next step, updates -------------------------------- */

check(
  "remediation is asked for on every item, not only on the ones still open",
  /Remediation action — what fixes it/.test(closure) &&
    !/\{v\?\.outcome && v\.outcome !== "Closed" && \(\s*\n\s*<>\s*\n\s*<div className="mt-4 mb-2 font-display text-\[11px\] font-semibold">\s*\n\s*Mitigation action/.test(
      closure
    ),
  "a closed item's remedy is the single most useful sentence at the next audit"
);

check(
  "next step is its own field",
  /nextStep\?: string;/.test(types) &&
    /Next step — what happens next/.test(closure) &&
    /patchVerification\(active\.key, \{ nextStep: e\.target\.value \}\)/.test(closureCode),
  "ACSA's sheet folds the fix and the chase into one cell, and it gets filled with the chase"
);

check(
  "the warn border only marks a real gap",
  /!v\?\.action && v\?\.outcome && v\.outcome !== "Closed"/.test(closureCode),
  "a closed item with no action is untidy, not wrong"
);

check(
  "the dated update log is still there and still appends",
  /addProgress\(active\.key, progressText\)/.test(closureCode),
  "ACSA's Progress/Update is one cell that gets typed over"
);

/* ---- 4b · the panel's own furniture (Sarel, 2026-09-11) ------------------ */

check(
  "Save & next walks the order the left panel draws, not register order",
  /const displayOrder = useMemo\(\s*\n\s*\(\) => grouped\.flatMap\(\(g\) => g\.byAudit\.flatMap\(\(round\) => round\.items\)\),/.test(
    closureCode
  ) && /const i = displayOrder\.findIndex\(\(p\) => p\.key === active\.key\);/.test(closureCode),
  "it walked `list`, which is carry-forward order and has no relation to what is on screen — so next landed several asset systems away"
);

check(
  "and the order is derived from the grouping rather than sorted a second time",
  !/displayOrder[\s\S]{0,200}\.sort\(/.test(closureCode),
  "two definitions of one order is how the list and the button come to disagree"
);

check(
  "landing in a folded asset system opens it",
  /if \(next\.system !== active\.system\) \{/.test(closureCode) &&
    /setOpenSystems\(\(cur\) => \{/.test(closureCode),
  "a detail pane showing a finding whose row is inside a shut group is a screen that has lost track of what it is showing"
);

check(
  "the last item says so rather than silently re-selecting itself",
  /that was the last one/.test(closure),
  "`list[i + 1] ?? active.key` made the end of the list indistinguishable from a save that did nothing"
);

check(
  "the save bar is stuck to the bottom of the panel",
  /className="sticky bottom-0 z-\[6\] -mx-\[18px\] -mb-\[18px\] mt-4 flex flex-wrap items-center justify-between/.test(
    closure
  ),
  "Sarel: the save button should stick at the bottom so that it is always visible"
);

check(
  "and it is opaque, so the pane scrolls under it rather than through it",
  /background: "var\(--panel\)" \}\}\s*\n\s*>/.test(closure),
  ""
);

/* ---- 5 · many possible events, each with a likelihood ------------------- */

check(
  "PossibleEvent is declared, with a likelihood of its own",
  /export interface PossibleEvent \{/.test(types) &&
    /likelihood: Likelihood \| null;/.test(types),
  ""
);

/* The slice is the interface BODY, bounded by its own closing brace, not by
   whatever declaration happens to follow it — SystemAssessment moved in
   between and it legitimately carries a severity of its own. */
const iface = (name) => {
  const i = types.indexOf(`export interface ${name} {`);
  return i < 0 ? "" : types.slice(i, types.indexOf("\n}", i));
};

check(
  "AND NO SEVERITY",
  !/severity/i.test(iface("PossibleEvent")),
  "a severity typed here would be a second, un-agreed rating for the same event — the drift ratingConfirmed exists to stop"
);

check(
  "they hang off the visit's verification, so the timeline knows which audit thought of them",
  /possibleEvents\?: PossibleEvent\[\];/.test(types),
  ""
);

check(
  "the store can add, edit and remove them",
  /addPossibleEvent: \(/.test(store) &&
    /patchPossibleEvent: \(pf: string, id: string, p: Partial<PossibleEvent>\) => void;/.test(store) &&
    /removePossibleEvent: \(pf: string, id: string\) => void;/.test(store),
  ""
);

check(
  "a new one arrives UNRATED",
  /likelihood: likelihood \?\? null,/.test(codeOnly(store)),
  "the group agrees the likelihood on the matrix; a walk-up guess filed as one is the drift"
);

check(
  "a blank event is not recorded",
  /const text = event\.trim\(\);\s*\n\s*if \(!text\) return "";/.test(codeOnly(store)),
  ""
);

check(
  "the likelihood is B170 001M's scale, taken from risk.ts rather than retyped",
  /import \{ LIKELIHOODS \} from "@\/lib\/risk";/.test(events),
  "the ERM instrument's scale is a different one and they must never be derived from each other"
);

check(
  "the button shows the digit but the whole label is its accessible name",
  /aria-label=\{l\}/.test(eventsCode) && /const num = l\.split\(" "\)\[0\];/.test(eventsCode),
  "B170 carries the number inside the label because getting the direction backwards inverts the matrix"
);

check(
  "and the chosen one is written out in full, never only in a hover",
  /\{e\.likelihood \?\? "unrated"\}/.test(eventsCode),
  ""
);

check(
  "tapping the selected likelihood again clears it",
  /onPatch\(e\.id, \{ likelihood: on \? null : \(l as Likelihood\) \}\)/.test(eventsCode),
  "a wrong 4 is worse than unrated, so there has to be a way back"
);

/* ---- 6 · two auditors, one finding -------------------------------------- */

check(
  "possible events union on merge rather than losing to whoever saved last",
  /function unionEvents\(mine: PossibleEvent\[\] = \[\], theirs: PossibleEvent\[\] = \[\]\): PossibleEvent\[\]/.test(
    merge
  ) && /const possibleEvents = unionEvents\(m\.possibleEvents, t\.possibleEvents\);/.test(merge),
  "two auditors at the same transformer will name different futures for it — that is the point of recording them"
);

check(
  "and the merged verification carries the union",
  /verifications\[pf\] = \{ \.\.\.newer, attachments, progress, possibleEvents \};/.test(merge),
  ""
);

/* ---- 7 · it reaches the workbook ---------------------------------------- */

check(
  "the closure sheet carries the remediation and the next step separately",
  /\{ header: "Remediation action", width: 50, wrap: true \},/.test(exports_) &&
    /\{ header: "Next step", width: 44, wrap: true \},/.test(exports_),
  ""
);

check(
  "and every possible event with its likelihood",
  /\{ header: "Possible hazardous events", width: 62, wrap: true \},/.test(exports_) &&
    /likelihood not agreed/.test(exports_),
  "an unrated event says so rather than being blank — blank reads as 'no likelihood', which is not a state"
);

console.log(failures === 0 ? "\nFOLLOW-UP OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
