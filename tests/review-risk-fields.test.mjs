import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* REVIEW RISK FIELDS — the addendum on top of the Capture/Review brief (see
 * docs/capture-review/review-risk-fields-discovery.md). §5 of the addendum
 * lists eight things that "must pass in CI" — this app has no CI, so these
 * are suites in the same bespoke runner every other screen uses (see
 * tests/README.md). Needs the alias loader: reviewRisk.ts imports risk.ts
 * and riskVocab.ts by value, not just by type.
 *
 * Run it after any edit to src/lib/reviewRisk.ts, src/lib/risk.ts,
 * src/lib/riskVocab.ts, Finding's risk fields in src/lib/types.ts,
 * ReviewRiskPanel.tsx or ReviewRiskTable.tsx. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

const R = await import("../src/lib/reviewRisk.ts");
const risk = await import("../src/lib/risk.ts");

const types = read("src", "lib", "types.ts");
const panel = read("src", "components", "ReviewRiskPanel.tsx");
const table = read("src", "components", "ReviewRiskTable.tsx");
const reviewPage = read("src", "app", "(app)", "review", "page.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const mkFinding = (overrides = {}) => ({
  id: "F-TEST1",
  checkId: null,
  entity: "FAOR",
  discipline: "Electrical",
  system: "LV Distribution",
  area: "",
  title: "Test finding",
  description: "",
  issueIndex: null,
  severity: null,
  likelihood: null,
  ratingConfirmed: false,
  rootCause: "",
  actions: [],
  progress: [],
  actionStatus: "Open",
  originVisit: "2026-11",
  priorRating: null,
  adHoc: true,
  attachments: [],
  suggestedEvent: "",
  createdAt: 0,
  createdBy: "",
  ...overrides,
});

/* ---- 1 · all 25 matrix cells → expected priority, table-driven --------- */

const EXPECT_PRIORITY = {
  "1A": "II", "2A": "II", "3A": "I",  "4A": "I",  "5A": "I",
  "1B": "III","2B": "II", "3B": "II", "4B": "I",  "5B": "I",
  "1C": "III","2C": "II", "3C": "II", "4C": "II", "5C": "I",
  "1D": "III","2D": "III","3D": "II", "4D": "II", "5D": "II",
  "1E": "III","2E": "III","3E": "III","4E": "II", "5E": "II",
};

let wrongPriority = 0;
for (const s of risk.SEVERITIES) {
  for (const l of risk.LIKELIHOODS) {
    const cellLikelihoodFirst = `${l.charAt(0)}${s.charAt(0)}`;
    const expected = EXPECT_PRIORITY[cellLikelihoodFirst];
    const got = R.priorityFor({ severity: s, likelihood: l })?.priority;
    if (got !== expected) {
      wrongPriority++;
      console.log(`  MISMATCH ${cellLikelihoodFirst}: got ${got}, expected ${expected}`);
    }
  }
}
check("all 25 cells present in the expectation table", Object.keys(EXPECT_PRIORITY).length === 25);
check("every one of the 25 cells maps to the right priority", wrongPriority === 0, `${wrongPriority} wrong`);

check(
  "priority is read off the SAME band every other screen reads, not a second computation",
  /bandFor\(f\.severity, f\.likelihood\)/.test(read("src", "lib", "reviewRisk.ts")) &&
    /BAND_AS_PRIORITY\[band\]/.test(read("src", "lib", "reviewRisk.ts")),
  "priorityFor must call risk.ts's own bandFor/BAND_AS_PRIORITY, never re-derive a band from severity/likelihood itself"
);

/* ---- 2 · rating null when severity or likelihood is missing ------------ */

check(
  "no severity, no likelihood → not rated",
  R.priorityFor(mkFinding()) === null
);
check(
  "severity only → still not rated",
  R.priorityFor(mkFinding({ severity: "A - Catastrophic" })) === null
);
check(
  "likelihood only → still not rated",
  R.priorityFor(mkFinding({ likelihood: "5 - Frequent" })) === null
);
check(
  "both set → rated",
  R.priorityFor(mkFinding({ severity: "A - Catastrophic", likelihood: "5 - Frequent" }))?.priority === "I"
);

/* ---- 3 · "changing likelihood updates the rating" ----------------------- */
/* No component-test runner in this repo (no DOM/renderer dependency) — same
   convention tablet.test.mjs/checkscreen.test.mjs use for screen behaviour:
   assert from the real function AND that the table/panel source actually
   calls it fresh on every render (no cached/stale rating kept in state). */

check(
  "re-deriving after a likelihood change moves the priority, using the real function",
  (() => {
    const before = R.priorityFor(mkFinding({ severity: "A - Catastrophic", likelihood: "1 - Extremely Improbable" }));
    const after = R.priorityFor(mkFinding({ severity: "A - Catastrophic", likelihood: "5 - Frequent" }));
    return before?.priority === "II" && after?.priority === "I" && before.priority !== after.priority;
  })()
);
check(
  "the table's Rating cell calls priorityFor(f), not a value cached on the row",
  /priorityFor\(f\)/.test(table)
);
check(
  "the panel's result line calls priorityFor(finding) too — table and panel share one call",
  /priorityFor\(finding\)/.test(panel)
);

/* ---- 4 · multi-select save/load round-trip, empty array allowed -------- */

check(
  "toggling a value on then off returns to an empty array",
  (() => {
    const once = R.toggleMulti(undefined, "Operations");
    const twice = R.toggleMulti(once, "Operations");
    return Array.isArray(once) && once.length === 1 && Array.isArray(twice) && twice.length === 0;
  })()
);
check(
  "toggling two different values keeps both, in order added",
  (() => {
    const a = R.toggleMulti(undefined, "Operations");
    const b = R.toggleMulti(a, "Reputation");
    return b.length === 2 && b[0] === "Operations" && b[1] === "Reputation";
  })()
);
check(
  "an absent array round-trips as empty, not an error",
  Array.isArray(R.toggleMulti(undefined, "x")) &&
    (mkFinding().impactAreas === undefined) // absent-means-empty on the type itself
);

/* ---- 5 · bulk add/remove does not overwrite other values --------------- */

check(
  "bulk-adding one impact area leaves an existing one in place",
  (() => {
    const next = R.applyBulkMulti(["Operations"], ["Reputation"], []);
    return next.includes("Operations") && next.includes("Reputation") && next.length === 2;
  })()
);
check(
  "bulk-removing one leaves the rest untouched",
  (() => {
    const next = R.applyBulkMulti(["Operations", "Reputation", "Licenses"], [], ["Reputation"]);
    return next.includes("Operations") && next.includes("Licenses") && !next.includes("Reputation") && next.length === 2;
  })()
);
check(
  "a bulk edit of impact areas is a patch on impactAreas alone, never on rootCauseCategories/severity/etc.",
  (() => {
    const before = mkFinding({
      severity: "B - Hazardous",
      likelihood: "4 - Occasional",
      rootCauseCategories: ["Maintenance backlog"],
      impactAreas: ["Operations"],
    });
    const impactAreas = R.applyBulkMulti(before.impactAreas, ["Reputation"], []);
    const after = { ...before, impactAreas };
    return (
      after.severity === before.severity &&
      after.likelihood === before.likelihood &&
      after.rootCauseCategories === before.rootCauseCategories &&
      after.impactAreas.length === 2
    );
  })()
);
check(
  "the bulk bar's own apply only ever patches the one axis it touched — source-read",
  /impactAreas: applyBulkMulti/.test(table) && /rootCauseCategories: applyBulkMulti/.test(table),
  "each spread conditionally into the patch object, never both unconditionally"
);

/* ---- 6 · roll-up counts a finding once per selected value --------------- */

const two = mkFinding({ id: "F-TWO", impactAreas: ["Operations", "Reputation"] });
const one = mkFinding({ id: "F-ONE", impactAreas: ["Operations"] });
const none = mkFinding({ id: "F-NONE" });

const impactCounts = R.countByMultiSelect([two, one, none], (f) => f.impactAreas);
check(
  "a finding with two impact areas counts once in each, per the addendum's own example",
  impactCounts["Operations"] === 2 && impactCounts["Reputation"] === 1
);
check(
  "a finding with none selected contributes to no bucket",
  impactCounts["Licenses"] === undefined
);

const rolled = R.rollupBy(
  [
    mkFinding({ id: "A", discipline: "Electrical", severity: "A - Catastrophic", likelihood: "5 - Frequent" }),
    mkFinding({ id: "B", discipline: "Electrical" }),
    mkFinding({ id: "C", discipline: "Mechanical", severity: "E - Negligible", likelihood: "1 - Extremely Improbable" }),
  ],
  (f) => f.discipline
);
const elec = rolled.find((r) => r.key === "Electrical");
const mech = rolled.find((r) => r.key === "Mechanical");
check(
  "Not rated is its own count, per discipline, not folded into a priority bucket",
  elec?.counts.I === 1 && elec?.notRated === 1 && elec?.total === 2
);
check(
  "roll-up groups are independent — one discipline's counts cannot leak into another's",
  mech?.counts.III === 1 && mech?.notRated === 0 && mech?.total === 1
);

/* ---- 7 · the rating cannot be edited directly — no input renders it ---- */

check(
  "the table's Rating cell renders a read-only Pill, no <select>/<input> bound to it",
  (() => {
    /* Anchored on the cell's own "READ-ONLY" comment rather than the first
       `columns.includes("rating")` match, which is the column HEADER a few
       lines above the body cell and would otherwise match first. */
    const cellMatch = table.match(/READ-ONLY[\s\S]{0,500}?<\/td>/);
    if (!cellMatch) return false;
    const cell = cellMatch[0];
    return /Pill/.test(cell) && !/<select/.test(cell) && !/<input/.test(cell);
  })()
);
check(
  "the panel never renders an input whose value/checked is bound to a priority/rating field",
  !/value=\{priority/.test(panel) && !/checked=\{priority/.test(panel)
);
check(
  "priorityFor's own return type has no setter — it is a plain computed value, not form state",
  /export function priorityFor/.test(read("src", "lib", "reviewRisk.ts")) &&
    !/useState.*[Pp]riority/.test(panel) &&
    !/useState.*[Pp]riority/.test(table)
);

/* ---- 8 · capture surfaces show none of these fields --------------------- */

const CAPTURE_SURFACES = [
  ["src", "app", "(app)", "capture", "page.tsx"],
  ["src", "app", "(app)", "field", "page.tsx"],
  ["src", "app", "(app)", "raise"],
  ["src", "app", "(app)", "workspace", "page.tsx"],
];
const FORBIDDEN = ["rootCauseCategories", "impactAreas", "rootCauseNote", "rootCauseConfirmed", "ReviewRiskPanel", "ReviewRiskTable"];

function readAllTsx(dir) {
  const full = path.join(here, "..", ...dir);
  if (!fs.existsSync(full)) return "";
  const stat = fs.statSync(full);
  if (stat.isFile()) return fs.readFileSync(full, "utf8");
  let out = "";
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.isDirectory()) out += readAllTsx([...dir, entry.name]);
    else if (/\.tsx?$/.test(entry.name)) out += fs.readFileSync(path.join(full, entry.name), "utf8");
  }
  return out;
}

for (const surface of CAPTURE_SURFACES) {
  const src = readAllTsx(surface);
  const offenders = FORBIDDEN.filter((f) => src.includes(f));
  check(
    `${surface[surface.length - 1]} carries none of the new Review risk fields`,
    offenders.length === 0,
    offenders.join(", ")
  );
}

check(
  "/review itself is the only screen that imports the new Risk panel/table",
  reviewPage.includes("ReviewRiskPanel") && reviewPage.includes("ReviewRiskTable")
);

/* ---- additional: the type, the migration, the vocabulary --------------- */

check(
  "Finding carries the three new fields, all optional — absent-means-empty, no capture-surface migration needed",
  /rootCauseCategories\?:\s*string\[\]/.test(types) &&
    /impactAreas\?:\s*string\[\]/.test(types) &&
    /rootCauseNote\?:\s*string/.test(types) &&
    /rootCauseConfirmed\?:\s*boolean/.test(types)
);
check(
  "severity/likelihood/ratingConfirmed were NOT re-declared — only three fields are genuinely new",
  (types.match(/severity: Severity \| null;/g) ?? []).length === 1 ||
    /severity: Severity \| null;\s*\n\s*likelihood: Likelihood \| null;/.test(types),
  "Finding must still declare severity/likelihood/ratingConfirmed exactly once each"
);

const storeSrc = read("src", "lib", "store.ts");
check(
  "the Dexie/zustand version bumped and a v40 migration backfills the two new arrays",
  /version:\s*40/.test(storeSrc) && /from < 40/.test(storeSrc) && /rootCauseCategories: f\.rootCauseCategories \?\? \[\]/.test(storeSrc)
);
check(
  "the migration never deletes a finding or any of its existing fields",
  /st\.findings = st\.findings\.map\(\(f\) => \(\{\s*\.\.\.f,/.test(storeSrc.slice(storeSrc.indexOf("from < 40")))
);

check(
  "root cause CATEGORIES reuse ROOT_CAUSES, not the addendum's own provisional list",
  /import \{ IMPACT_AREAS, ROOT_CAUSES \} from "\.\/riskVocab"/.test(read("src", "lib", "reviewRisk.ts"))
);
check(
  "the addendum's own provisional category list is not spelled out anywhere as a real vocabulary",
  !/People & training/.test(read("src", "lib", "riskVocab.ts")) &&
    !/Equipment & design/.test(read("src", "lib", "riskVocab.ts")),
  "those six words are the brief's PROVISIONAL list — see the discovery note's open question"
);

console.log(failures === 0 ? "\nREVIEW RISK FIELDS OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
