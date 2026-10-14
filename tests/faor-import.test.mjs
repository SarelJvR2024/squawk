import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The FAOR Civil/Building & Facilities hazard-mapping spreadsheet import.
 *
 *  Source-data and script validation, same style as crosswalk.test.mjs: this
 *  checks the committed extraction (src/data/source/faorHazardImport2026-10.json)
 *  and the importer (scripts/import-faor-hazards.mjs) against the register and
 *  against the app's own B170 001M matrix (src/lib/risk.ts) — never by running
 *  the TS module, same reasoning as crosswalk.test.mjs: this file is read, not
 *  executed, and risk-matrix.test.mjs is the one guard against the RED/AMBER
 *  sets below drifting from risk.ts's own.
 *
 *  THE INVARIANT THIS PINS: the spreadsheet's own Cell/Rating text is never
 *  imported, and where it disagrees with the app's own formula, the
 *  disagreement is a known, named fact checked here — not something either
 *  silently overwrites or silently loses. A NEW disagreement showing up here
 *  (the source data changed and nobody updated KNOWN_BAND_MISMATCHES) fails
 *  the suite rather than importing quietly. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const json = (...p) => JSON.parse(fs.readFileSync(path.join(root, ...p), "utf8"));
const src = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
};

const rows = json("src", "data", "source", "faorHazardImport2026-10.json");
const checks = json("src", "data", "checks.json");
const registerSystems = new Set(checks.map((c) => `${c.discipline}|${c.system}`));

check("27 asset systems", rows.length === 27, String(rows.length));

check(
  "every asset system matches the FAOR register exactly — none dropped or renamed",
  rows.every((r) => registerSystems.has(`${r.discipline}|${r.assetSystem}`)),
  JSON.stringify(rows.filter((r) => !registerSystems.has(`${r.discipline}|${r.assetSystem}`))
    .map((r) => `${r.discipline}|${r.assetSystem}`))
);

check(
  "every row has at least one hazardous event",
  rows.every((r) => Array.isArray(r.events) && r.events.length > 0)
);

check(
  "every event carries both a root cause and an action — none silently blank",
  rows.every((r) => r.events.every((e) => e.event && e.rootCause && e.action))
);

check(
  "severity/likelihood values are the app's own enum strings, not the spreadsheet's em-dash wording",
  rows.every((r) => /^[A-E] - /.test(r.severity) && /^[1-5] - /.test(r.likelihood))
);

/* Mirrors risk.ts's RED/AMBER sets (see risk-matrix.test.mjs for the guard
 *  against this drifting from risk.ts's own). Likelihood-first, as bandFor
 *  looks it up — not cellCode's severity-first display form. */
const RED = new Set(["5A", "5B", "5C", "4A", "4B", "3A"]);
const AMBER = new Set(["5D", "5E", "4C", "4D", "4E", "3B", "3C", "3D", "2A", "2B", "2C", "1A"]);
const bandFor = (severity, likelihood) => {
  const key = `${likelihood.charAt(0)}${severity.charAt(0)}`;
  if (RED.has(key)) return "Red";
  if (AMBER.has(key)) return "Amber";
  return "Green";
};

const KNOWN_BAND_MISMATCHES = new Set(["Friction Measurement & Corrective Maintenance"]);

const mismatches = rows.filter((r) => bandFor(r.severity, r.likelihood) !== r.spreadsheetRating);

check(
  "every band mismatch between the computed rating and the spreadsheet's own is a known, named one — nothing new slipped in unnoticed",
  mismatches.every((r) => KNOWN_BAND_MISMATCHES.has(r.assetSystem)) &&
    mismatches.length === KNOWN_BAND_MISMATCHES.size,
  JSON.stringify(mismatches.map((r) => r.assetSystem))
);

check(
  "every row the app agrees with the spreadsheet on is NOT in the known-mismatch list",
  rows.filter((r) => bandFor(r.severity, r.likelihood) === r.spreadsheetRating)
    .every((r) => !KNOWN_BAND_MISMATCHES.has(r.assetSystem))
);

check(
  "the spreadsheet's own split is 2 Red, 21 Amber, 4 Green",
  rows.filter((r) => r.spreadsheetRating === "Red").length === 2 &&
    rows.filter((r) => r.spreadsheetRating === "Amber").length === 21 &&
    rows.filter((r) => r.spreadsheetRating === "Green").length === 4,
  JSON.stringify(["Red", "Amber", "Green"].map((b) => [b, rows.filter((r) => r.spreadsheetRating === b).length]))
);

const bundleScript = src("scripts", "import-faor-hazards.mjs");
check(
  "Rating agreed (ratingConfirmed) is hard-coded false — never read from the spreadsheet row",
  /ratingConfirmed:\s*false,/.test(bundleScript) && !bundleScript.includes("row.ratingAgreed") && !bundleScript.includes("row.ratingConfirmed")
);

/* ---- the 2025 -> current crosswalk: the spreadsheet's mapping sheet vs the
 *  already-merged src/data/assetSystemCrosswalk.json (PR #130). Every row on
 *  the spreadsheet's "Asset system mapping" sheet is one of three kinds:
 *  an exact match (current name = 2025 name, needs no entry), brand new this
 *  visit (no 2025 name to map from, needs no entry), or genuinely ambiguous
 *  (split / to-confirm / 2025-only — needs an entry). The crosswalk file is
 *  checked here against the third kind only; it does not need to carry the
 *  other two, and this is not rebuilding it, only confirming it still covers
 *  what the spreadsheet says needs covering. */
const crosswalk = json("src", "data", "assetSystemCrosswalk.json");
const AMBIGUOUS_2025_NAMES = [
  "Taxiways, Taxi-lanes & Service Road Surfaces",
  "Service Road Markings",
  "Landside Roads & Markings",
  "Landside Road Surfaces",
];
check(
  "every ambiguous 2025 mapping the spreadsheet names has a crosswalk entry",
  AMBIGUOUS_2025_NAMES.every((name) => crosswalk.some((e) => e.recorded === name)),
  JSON.stringify(AMBIGUOUS_2025_NAMES.filter((name) => !crosswalk.some((e) => e.recorded === name)))
);
check(
  "the split maps to both current systems the spreadsheet names",
  JSON.stringify(crosswalk.find((e) => e.recorded === "Taxiways, Taxi-lanes & Service Road Surfaces")?.current) ===
    JSON.stringify(["Taxiways & Taxilanes", "Airside Service Roads & Perimeter"])
);
check(
  "both Landside entries stay visible as 2025-only, not dropped",
  ["Landside Roads & Markings", "Landside Road Surfaces"].every(
    (name) => crosswalk.find((e) => e.recorded === name)?.type === "2025-only" &&
      crosswalk.find((e) => e.recorded === name)?.current.length === 0
  )
);

const script = src("scripts", "import-faor-hazards.mjs");

check("the importer never writes the spreadsheet's own Cell or Rating text", !script.includes("row.spreadsheetRating") && !script.includes("row.cell"));
check("every seeded record is marked seeded: true", /seeded:\s*true/.test(script));
check("ratingConfirmed is always false on import — a suggestion, never agreed", /ratingConfirmed:\s*false/.test(script));
check("imported actions get no owner or due date by default", /owner:\s*""/.test(script) && /dueDate:\s*""/.test(script));
check("the bundle targets FAOR's 2026-09 visit", script.includes('ENTITY = "FAOR"') && script.includes('VISIT = "2026-09"'));
check("built as the app's own capture-bundle format, not a direct store write", script.includes('kind: "squawk-capture-bundle"'));

const types = src("src", "lib", "types.ts");
check("PossibleEvent.seeded exists and is optional", /seeded\?:\s*boolean/.test(types));
check("SystemAssessment.directionOfRisk exists and is optional", /directionOfRisk\?:\s*string/.test(types));

const store = src("src", "lib", "store.ts");
check("persist key untouched", store.includes('"acsa-assurance-v1"'));
check(
  "version bumped for the new fields",
  Number(store.match(/version:\s*(\d+),/)?.[1] ?? 0) > 35
);

process.exit(failures ? 1 : 0);
