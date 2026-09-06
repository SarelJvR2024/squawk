import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nCARRY-FORWARD OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
