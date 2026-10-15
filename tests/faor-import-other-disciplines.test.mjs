import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The SECOND wave of TPJV's hazard-mapping import — Electrical, Mechanical,
 *  Energy & Demand Management, Process Safety & Risk — alongside
 *  tests/faor-import.test.mjs (the FIRST wave: Civil, Building &
 *  Facilities). Same style, same reasoning: this checks the committed
 *  extraction (src/data/source/faorHazardImportOtherDisciplines2026-10.json)
 *  and the importer (scripts/import-faor-hazards-other-disciplines.mjs)
 *  against the register and the app's own B170 001M matrix (src/lib/
 *  risk.ts) — never by running the TS module, same reasoning as
 *  crosswalk.test.mjs: this file is read, not executed, and
 *  risk-matrix.test.mjs is the one guard against the RED/AMBER sets below
 *  drifting from risk.ts's own.
 *
 *  THE INVARIANT THIS PINS: the workbook's own "Cell"/"Band (computed)"
 *  columns are never imported (this app derives the band itself), and
 *  "linkedChecks"/"ratingBasis" — both present on the source rows but
 *  neither read by the importer — stay unread for a CHECKED reason, not a
 *  forgotten one: linkedChecks is exactly the register's own checks for
 *  that discipline+system pair (verified below, not assumed), and
 *  ratingBasis is a short tag for a sentence ratingRationale already says
 *  in full prose on every row. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const json = (...p) => JSON.parse(fs.readFileSync(path.join(root, ...p), "utf8"));
const src = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
};

const rows = json("src", "data", "source", "faorHazardImportOtherDisciplines2026-10.json");
const checks = json("src", "data", "checks.json");
const registerSystems = new Set(checks.map((c) => `${c.discipline}|${c.system}`));

check("48 asset systems", rows.length === 48, String(rows.length));

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
  "every event carries an event, a root cause and an action — none silently blank",
  rows.every((r) => r.events.every((e) => e.event && e.rootCause && e.action))
);

check("84 hazardous events across the 48 systems", rows.reduce((n, r) => n + r.events.length, 0) === 84);

check(
  "severity/likelihood values are the app's own enum strings, not the spreadsheet's em-dash wording",
  rows.every((r) => /^[A-E] - /.test(r.severity) && /^[1-5] - /.test(r.likelihood))
);

/* "linkedChecks" IS the register's own checks for that pair, exactly — not
   new information, which is why the importer never writes it anywhere. */
check(
  "every row's linkedChecks is exactly the register's own checks for that discipline+system — confirmed redundant, not dropped data",
  rows.every((r) => {
    const actual = checks
      .filter((c) => c.discipline === r.discipline && c.system === r.assetSystem)
      .map((c) => c.id)
      .sort();
    return JSON.stringify(actual) === JSON.stringify([...r.linkedChecks].sort());
  }),
  JSON.stringify(
    rows
      .filter((r) => {
        const actual = checks
          .filter((c) => c.discipline === r.discipline && c.system === r.assetSystem)
          .map((c) => c.id)
          .sort();
        return JSON.stringify(actual) !== JSON.stringify([...r.linkedChecks].sort());
      })
      .map((r) => `${r.discipline}|${r.assetSystem}`)
  )
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

const bands = rows.map((r) => bandFor(r.severity, r.likelihood));
check(
  "computed from severity/likelihood, this pack's own split is 6 Red, 41 Amber, 1 Green — verified against the workbook's own Band (computed) column, which agrees on all 48 rows (no KNOWN_BAND_MISMATCHES needed this wave)",
  bands.filter((b) => b === "Red").length === 6 &&
    bands.filter((b) => b === "Amber").length === 41 &&
    bands.filter((b) => b === "Green").length === 1,
  JSON.stringify(["Red", "Amber", "Green"].map((b) => [b, bands.filter((x) => x === b).length]))
);

const script = src("scripts", "import-faor-hazards-other-disciplines.mjs");

check("the importer never writes the workbook's own Cell or Band text", !script.includes("row.cell") && !script.includes("row.band") && !script.includes("row.Cell"));
check("the importer never writes linkedChecks or ratingBasis — confirmed redundant above, not forgotten", !script.includes("row.linkedChecks") && !script.includes("row.ratingBasis"));
check("every seeded record is marked seeded: true", /seeded:\s*true/.test(script));
check("ratingConfirmed is always false on import — a suggestion, never agreed", /ratingConfirmed:\s*false/.test(script));
check("imported actions get no owner or due date by default", /owner:\s*""/.test(script) && /dueDate:\s*""/.test(script));
check("the bundle targets FAOR's 2026-09 visit", script.includes('ENTITY = "FAOR"') && script.includes('VISIT = "2026-09"'));
check("built as the app's own capture-bundle format, not a direct store write", script.includes('kind: "squawk-capture-bundle"'));
check(
  "each event's hazard-library 'source' (HZ-xx or TPJV draft) is carried as plain text on the root cause's own note, never invented or validated",
  script.includes("e.source") && script.includes("`Source: ${e.source}`")
);

const types = src("src", "lib", "types.ts");
check("PossibleEvent.seeded exists and is optional", /seeded\?:\s*boolean/.test(types));
check("SystemAssessment.directionOfRisk exists and is optional", /directionOfRisk\?:\s*string/.test(types));

const store = src("src", "lib", "store.ts");
check("persist key untouched", store.includes('"acsa-assurance-v1"'));
check(
  "the migration version is unchanged — this import adds no new field, unlike the first hazard-mapping wave",
  /version:\s*37,/.test(store)
);

/* The two hazard-mapping waves must never collide — same entity/visit,
   disjoint disciplines, so a device that has merged both still ends up
   with 27 + 48 = 75 distinct SystemAssessment keys, not 48 overwriting 27
   or vice versa. */
const firstWave = json("src", "data", "source", "faorHazardImport2026-10.json");
const firstWaveKeys = new Set(firstWave.map((r) => `${r.discipline}|${r.assetSystem}`));
const secondWaveKeys = new Set(rows.map((r) => `${r.discipline}|${r.assetSystem}`));
check(
  "zero discipline|system keys shared between the two hazard-mapping waves",
  [...firstWaveKeys].every((k) => !secondWaveKeys.has(k)),
  JSON.stringify([...firstWaveKeys].filter((k) => secondWaveKeys.has(k)))
);

process.exit(failures ? 1 : 0);
