import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* RUN, not just read — the one part of this suite that needs the alias
   loader (see tests/alias.mjs and NEEDS_ALIAS in tests/suite-table.test.mjs):

     node --import ./tests/alias.mjs tests/carryforward.test.mjs

   Everything above this import proves the MECHANISM is written correctly, by
   pattern-matching the source the way the rest of this file always has. It
   does not prove the mechanism actually DOES what it says against a finding
   that has no check behind it — RaiseFindingSheet.tsx's whole reason for
   existing (see its own header) — and that is exactly the case Sarel asked
   to see proved before testing it himself: "all the non-compliances we pick
   up now with our audit checks must get added onto that for follow-up
   audits." Part 7, right at the end, calls outstandingFor() and fromCarried()
   directly against a constructed Finding with checkId: null.

   store.ts is imported FIRST, deliberately — carryforward.ts and store.ts
   both reach into ./programme, and which one a test enters through decides
   which side of that cycle resolves its top-level bindings first. Entering
   through carryforward.ts directly hits a genuine TDZ ReferenceError on
   CURRENT_ENTITY_CODE under Node's ESM loader; entering through store.ts
   first does not. Node resolves a cycle differently from webpack (the app
   has shipped on this for months with no issue), so this is a test-harness
   ordering fix, not a production bug — and it is exactly the kind of thing
   only RUNNING the real module, rather than reading it, would ever surface. */
import "@/lib/store";
import { fromCarried, outstandingFor } from "@/lib/carryforward";

/* What an earlier visit left open must reach the next one.
 *
 *  Closure read one static file — the 23 March 2025 findings — and nothing
 *  else. A finding raised in this app, rated Red, with an owner and a due
 *  date, became a row in a list and then nothing: the next visit opened with
 *  no knowledge of it. The shell drew a three-year cycle across the top of
 *  every screen while the cycle was not implemented.
 *
 *  Source-read, like the other offline suites, because the failure mode is a
 *  screen quietly going back to reading PRIOR directly. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const cf = src("lib", "carryforward.ts");
const closure = src("app", "(app)", "closure", "page.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------------------------------- Part 1: both kinds of outstanding item */

check(
  "an outstanding item is either seeded or carried",
  /export type OutstandingSource = "seeded" \| "carried";/.test(cf),
  "a 2025 finding and one this app raised are the same question at the asset"
);

check(
  "a seeded item is keyed by the portal's own id",
  /key: p\.portalId,/.test(cf),
  "portalId is the Title of the item in ACSA's Findings list — the key a closure syncs back on"
);

check(
  "a carried item is keyed by its finding id",
  /key: f\.id,/.test(cf) && /findingId: f\.id,/.test(cf),
  "closing it here has to be able to close it there"
);

/* --------------------------------------------- Part 2: the chronology is right */

check(
  "only earlier visits can leave something outstanding",
  /f\.originVisit < visitId/.test(cf),
  "a finding raised this morning is this visit's work, not a carry-over"
);

check(
  "a closed finding stops carrying",
  /f\.actionStatus !== "Closed"/.test(cf),
  ""
);

/* This used to compare against a SEEDED_ENTITY constant, because there was one
   seeded set and it was King Shaka's. Rev A2 carries 78 open findings across
   three sites, so the entity comes off the record and the constant is gone —
   it was the last place another airport's findings could have been shown as
   King Shaka's. */
check(
  "seeded findings appear only at the entity they belong to",
  /priorFindingsAt\(entityCode\)/.test(cf) && !/SEEDED_ENTITY/.test(cf),
  "opening O.R. Tambo must not show King Shaka's 2025 findings as ORTIA's failures"
);

check(
  "and only on a visit after the one that raised them",
  /\.filter\(\(p\) => seededVisitOf\(p\) < visitId\)/.test(cf),
  "the March 2025 visit must not present its own findings as something it inherited"
);

check(
  "a finding that names a building rather than an asset system is still carried",
  /p\.assetSystem \?\? p\.assetSystemRecorded/.test(cf),
  "19 of the 78 do not join to a check — dropping them would lose real open findings"
);

check(
  "outstanding items are ordered oldest first",
  /a\.originVisit\.localeCompare\(b\.originVisit\)/.test(cf),
  "something open across two visits outranks this visit's newest arrival"
);

check(
  "visit ids sort chronologically as written",
  /"YYYY-MM"/.test(cf),
  "the ordering depends on it, so it is stated where it is relied on"
);

/* ------------------------------- Part 3: a suggestion does not become a rating */

check(
  "an unagreed rating carries forward as Not audited",
  /f\.ratingConfirmed && band \? BAND_AS_RATING\[band\] : "Not audited"/.test(cf),
  "surviving a visit must not lend a suggestion the authority of a decision"
);

/* ------------------------------------------ Part 4: closure reads the real list */

check(
  "closure reads outstanding items, not the static file",
  /useOutstanding\(\)/.test(closure) && !/\bPRIOR\b/.test(closure),
  "reading PRIOR directly is exactly the regression this guards"
);

check(
  "closure keys verification by the item key",
  /verifications\[p\.key\]/.test(closure) &&
    /patchVerification\(active\.key/.test(closure) &&
    !/active\.pf/.test(closure),
  ""
);

check(
  "closing a carried item closes the finding behind it",
  /if \(active\.findingId\) \{[\s\S]*?updateFinding\(active\.findingId, \{[\s\S]*?actionStatus:/.test(
    closure
  ),
  "otherwise it reappears next visit having been verified closed on this one"
);

check(
  "un-picking an outcome reopens the finding",
  /outcome === "Closed"\s*\n?\s*\? "Closed"[\s\S]*?: "Open",/.test(closure),
  "a mis-tap must not leave a finding closed"
);

check(
  "closure shows where each item came from",
  /originLabel/.test(closure) && /CARRIED FORWARD/.test(closure),
  "a 2025 finding and one carried from 2026 are not the same conversation"
);

check(
  "closure shows how long something has been open",
  /visitsOpen\(active, entityCode, visitId\)/.test(closure),
  '"open since Mar 2025" and "open across three visits" land differently'
);

/* ------------------------------ Part 5: no visit or site is written into the UI */

for (const [label, re] of [
  ["Mar 2025", /"Mar 2025"|>Mar 2025</],
  ["Sep 2026", /"Sep 2026"|>Sep 2026<|Sep 2026 checks/],
  ["Mar 2027", /"Mar 2027"|March 2027|>Mar 2027</],
  ["KSIA", /by KSIA|"KSIA"/],
]) {
  check(
    `closure does not hardcode ${label}`,
    !re.test(closure),
    "the lifecycle, the coverage heading and the carry-forward note all follow the scope"
  );
}

check(
  "the next visit is looked up, not assumed",
  /PROGRAMME_VISITS\.filter\(\s*\n?\s*\(v\) => v\.entity === entityCode && v\.id > visitId\s*\n?\s*\)\[0\]/.test(
    closure
  ),
  ""
);

/* ------------------- Closure carries only what carries -------------------- */

/* The brief said: of the 23 March 2025 findings, seven were rated Acceptable
   or not audited, so sixteen actually carry.

   THAT SPLIT DOES NOT EXIST IN THIS REPOSITORY'S DATA, and the first two
   assertions are what establishes it rather than my say-so. Rev A2 separates
   the two lists the brief's dataset conflated: priorFindings carries only
   items that needed mitigation, and the Acceptable / Not audited rows live in
   priorRatings, which is the per-asset-system position, not work.

   So the mechanism is built and correct, and at KSIA, ORTIA and CTIA it
   currently selects everything. It starts doing real work the moment a
   Squawk-raised finding is rated Acceptable and carried. */

const priorFindings = JSON.parse(
  fs.readFileSync(path.join(here, "..", "src", "data", "priorFindings.json"), "utf8")
);
const priorRatings = JSON.parse(
  fs.readFileSync(path.join(here, "..", "src", "data", "priorRatings.json"), "utf8")
);

check(
  "no seeded prior FINDING is Acceptable — every one of them carries work",
  priorFindings.length === 78 &&
    priorFindings.every((f) => f.tolerance === "Tolerable" || f.tolerance === "Unacceptable"),
  `${priorFindings.length} findings, tolerances ${[...new Set(priorFindings.map((f) => f.tolerance))].join("/")}`
);

check(
  "Acceptable and Not audited live on prior RATINGS, which are a different list",
  priorRatings.some((r) => r.rating === "Acceptable") &&
    priorRatings.some((r) => r.rating === "Not audited"),
  "the brief's 7-of-23 came from a dataset that had not separated the two"
);

check(
  "there is a predicate for it, and it turns on Acceptable",
  /export function carriesWork\(item: Outstanding\): boolean \{\s*return item\.rating !== "Acceptable";/.test(cf),
  "an item that needed no mitigation has nothing to verify was implemented"
);

check(
  'and it deliberately does NOT let "Not audited" off',
  /Not audited" on a CARRIED FINDING/.test(cf) && !/rating !== "Not audited"/.test(cf),
  "on a carried finding that string means nobody agreed a rating — an open question, not a settled one"
);

check(
  "the closure list shows what carries by default, and context only on request",
  /filter === "context" \? l\.filter\(\(p\) => !carriesWork\(p\)\) : l\.filter\(carriesWork\)/.test(closure)
);

check(
  "context is offered, not hidden — and only when there is some",
  /context\.length[\s\S]{0,120}Context only \(\$\{context\.length\}\)/.test(closure),
  "silently dropping rows is how a closure list stops being trusted"
);

check(
  "the list can be filtered to one discipline",
  /const \[discipline, setDiscipline\] = useState<string>\("all"\)/.test(closure) &&
    /discipline !== "all"\) l = l\.filter\(\(p\) => p\.discipline === discipline\)/.test(closure),
  "the closure conversation happens with one discipline in the room"
);

check(
  "and the picker only offers disciplines that have something behind them",
  /new Set\(carries\.map\(\(p\) => p\.discipline\)\)/.test(closure),
  "an empty tab is a dead end somebody taps once and stops trusting"
);

check(
  "the discipline chips are 44px, like everything else an auditor taps",
  /min-h-\[44px\] rounded-full border px-\[11px\]/.test(closure)
);

/* ------------------------------------- the timeline: every audit, as a shape */

/* A BLANK CELL IS THE DEFECT THIS SECTION GUARDS.
 *
 * A visit at which this entity was not audited reads, if it is left empty, as
 * "nothing was wrong". It means the opposite — nobody looked, so nothing about
 * the item can be claimed for that visit. King Shaka's Sep 2025 and Mar 2026
 * are both `skipped` in programme.json, so on the data we actually hold, two of
 * six cells on every carried finding are exactly this case. Get it wrong and
 * the most damning fact on the screen renders as a clean sheet. */

const strip = src("components", "VisitStrip.tsx");

check(
  "timelineFor gives EVERY visit a cell",
  /return visits\.map\(\(v\) => \{/.test(cf) && !/\.filter\(\(e\)[\s\S]{0,40}!== null\)[\s\S]{0,200}timelineFor/.test(cf),
  "historyFor drops empty visits on purpose; a timeline may not, because in a shape the gaps are the information"
);
check(
  "a skipped visit is marked not-audited",
  /if \(v\.state === "skipped"\) return \{ \.\.\.base, state: "notAudited" as const \};/.test(cf)
);
check(
  "and it is checked BEFORE the item's own dates",
  cf.indexOf('state: "notAudited"') < cf.indexOf('state: "before"'),
  "a visit nobody attended is not audited even where it falls after the finding was raised"
);
check(
  "not-audited renders as hatching, never as an empty cell",
  /case "notAudited":[\s\S]{0,300}repeating-linear-gradient/.test(strip)
);
check(
  "and it says so to a screen reader",
  /notAudited: "NOT AUDITED — nobody looked"/.test(strip)
);
check(
  "a visit that happened with nothing recorded is CARRIED, not not-audited",
  /return \{ \.\.\.base, state: "carried" as const \};/.test(cf),
  "an item nobody answered at a visit that did happen is a worse fact than one nobody could answer"
);

/* THE RATING PALETTE IS NOT THE LIFECYCLE PALETTE. #C73830 and #D58F0D mean
   Unacceptable and Tolerable everywhere in this product. A closed finding is
   not "green" and an open one is not "red" — they are states, not ratings, and
   borrowing the band colours here makes every genuine rating on the screen less
   legible. Repeat is the single exception the design allows. */
const stripCode = strip.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check(
  "only the repeat state may use a band colour",
  (stripCode.match(/var\(--bad\)/g) ?? []).length === 2 &&
    !/var\(--warn\)/.test(stripCode) &&
    !/var\(--good\)/.test(stripCode),
  "repeat is the finding that matters most and the only one allowed to raise its voice"
);
check(
  "state is carried by fill and shape as well",
  /linear-gradient\(to top/.test(strip) && /border: "2px solid/.test(strip)
);

/* TWO FIGURES COUNTING ONE THING MUST AGREE. visitsOpen() and visitsSurvived()
   both answer "how long has this been open"; a screen showing 0 in one place
   and 1 in another is a screen nobody believes twice. */
check(
  "visitsSurvived excludes the visit being decided now",
  /if \(c\.visit >= currentVisit\) return n;/.test(cf),
  "an item is not shown as having survived the meeting it is sitting in"
);
check(
  "and it excludes visits nobody attended",
  !/notAudited[\s\S]{0,80}n\+\+/.test(cf),
  "nobody was there, so the item did not survive anything"
);
check(
  "the closure screen passes it the visit in view",
  /visitsSurvived\(cells, visitId\)/.test(closure)
);

/* --------------------------------------------- grouped by asset system */

check(
  "the follow-up list groups by asset system",
  /No asset system recorded/.test(closure) && /grouped\.map\(\(g\) => \{/.test(closure),
  "the close-out conversation is held about a switchboard, not about a list of finding numbers"
);
check(
  "an item with no asset system gets an explicit bucket, not a guess",
  /p\.system\?\.trim\(\) \|\| "No asset system recorded"/.test(closure)
);
check(
  "the coverage guard is on the row, not only in the detail pane",
  /not covered this visit/.test(closure),
  "closure cannot be evidenced against a check nobody is doing, and the person deciding needs to know before they decide"
);
/* RETIRED 2026-09-10, and replaced rather than deleted.
   The legend explained the per-audit cell strip on each row. Sarel took the
   strip off the row — "don't have an icon per audit, just need to see the
   current status of the finding, and the year/month when it was logged" — so
   the legend was teaching a shape that is no longer drawn, which is worse than
   no legend at all. What it was protecting is that nothing on this screen is
   readable only as a shape or a colour; that property moved to the row's own
   status word and the date beside it, so the assertion moves with it. */
check(
  "the row states its status in words, not as a shape",
  /const status = o \?\? "Open";/.test(closure) &&
    /<Pill tone=\{tone\}>\{status\.toUpperCase\(\)\}<\/Pill>/.test(closure),
  "an item in this list is outstanding, so with nothing recorded it is Open — not 'not verified', which describes the auditor"
);
check(
  "and when it was logged, on the row",
  /\{p\.originLabel\}/.test(closure),
  "a row read out of the context of its audit marker still has to say which audit raised it"
);
check(
  "an open asset system reads as a timeline, oldest audit first",
  /byAudit: \(\(\) => \{/.test(closure) &&
    /return \[\.\.\.rounds\.values\(\)\]\.sort\(\(a, b\) => a\.visit\.localeCompare\(b\.visit\)\);/.test(
      closure
    ),
  "a Mar 2025 finding and a Sep 2026 one in the same system are different ages of problem and rendered identically before"
);

/* ------------- Part 7: a finding raised outside the register, for real --- */

/* THE SCENARIO THE OWNER ASKED TO SEE PROVED, not just inspected: a
 * non-compliance picked up with no check behind it (RaiseFindingSheet.tsx,
 * or the walk screen's own promote-an-observation flow — both produce this
 * exact shape) must still carry into a LATER visit's Follow-up screen. Every
 * assertion below calls the real exported functions against a plain,
 * hand-built Finding — nothing here re-implements outstandingFor()'s or
 * fromCarried()'s own logic, which is the whole point of running them rather
 * than describing them. */

const ENTITY = "FALE";
const EARLIER_VISIT = "2024-01"; // before every seeded/real visit this entity has
const LATER_VISIT = "2099-12"; // after every seeded/real finding this entity has

const baseFinding = (overrides) => ({
  id: "F-T0001",
  checkId: null,
  entity: ENTITY,
  discipline: "Electrical & Essential Power",
  system: "Standby Generators",
  area: "",
  title: "Standby generator fuel log missing",
  description: "No fuel consumption log found for the standby generator bank.",
  issueIndex: null,
  severity: "Major",
  likelihood: "Likely",
  ratingConfirmed: false,
  rootCause: "",
  actions: [],
  progress: [],
  actionStatus: "Open",
  originVisit: EARLIER_VISIT,
  priorRating: null,
  adHoc: true,
  suggestedEvent: "",
  createdAt: Date.now(),
  createdBy: "Test Auditor",
  ...overrides,
});

/* THE CASE THIS FEATURE EXISTS FOR: checkId is null — raised from
   RaiseFindingSheet.tsx (or the walk) with no check-point picked. */
const noCheckFinding = baseFinding({ id: "F-T0001", checkId: null });
/* The same finding, but raised against a specific check — included so the
   two are compared against each other, not just asserted in isolation. */
const withCheckFinding = baseFinding({
  id: "F-T0002",
  checkId: "FALE-ELE-005",
  discipline: "Electrical & Essential Power",
  system: "Standby Generators",
});
/* A finding that IS closed by the time the later visit opens — must not
   carry, proving this isn't "everything carries" dressed up as a feature. */
const closedFinding = baseFinding({ id: "F-T0003", checkId: null, actionStatus: "Closed" });
/* A finding raised ON the later visit itself — this visit's own work, not a
   carry-over; outstandingFor's own doc comment is explicit about this. */
const sameVisitFinding = baseFinding({
  id: "F-T0004",
  checkId: null,
  originVisit: LATER_VISIT,
});

const carried = fromCarried(noCheckFinding);
check(
  "fromCarried() reads a checkless finding with no special-casing",
  carried.source === "carried" && carried.key === "F-T0001" && carried.findingId === "F-T0001"
);
check(
  "fromCarried() carries the discipline and asset system through untouched",
  carried.discipline === "Electrical & Essential Power" && carried.system === "Standby Generators",
  `got discipline=${carried.discipline} system=${carried.system}`
);
check(
  "fromCarried() carries an unconfirmed rating as Not audited, for real",
  carried.rating === "Not audited",
  `got "${carried.rating}" for a finding with severity/likelihood set but ratingConfirmed: false`
);

const out = outstandingFor(ENTITY, LATER_VISIT, [
  noCheckFinding,
  withCheckFinding,
  closedFinding,
  sameVisitFinding,
]);
const outIds = out.filter((o) => o.source === "carried").map((o) => o.key);

check(
  "outstandingFor() carries the checkless finding into a later visit",
  outIds.includes("F-T0001"),
  `outstanding carried keys: ${outIds.join(", ")}`
);
check(
  "and it carries the check-raised one exactly the same way — checkId is not a filter",
  outIds.includes("F-T0002"),
  `outstanding carried keys: ${outIds.join(", ")}`
);
check(
  "a finding closed before the later visit does not carry",
  !outIds.includes("F-T0003")
);
check(
  "a finding raised ON the later visit is this visit's own work, not a carry-over",
  !outIds.includes("F-T0004")
);

const carriedRow = out.find((o) => o.key === "F-T0001");
check(
  "the carried row groups by the same discipline and asset system a closure screen reads",
  carriedRow?.discipline === "Electrical & Essential Power" &&
    carriedRow?.system === "Standby Generators",
  `got discipline=${carriedRow?.discipline} system=${carriedRow?.system}`
);
check(
  "the carried row knows which finding to close when this visit closes it",
  carriedRow?.findingId === "F-T0001"
);
check(
  "a checkless finding and a check-raised one on the same asset system both carry — same count either way",
  out.filter((o) => o.source === "carried" && o.system === "Standby Generators").length === 2
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nCARRY-FORWARD OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
