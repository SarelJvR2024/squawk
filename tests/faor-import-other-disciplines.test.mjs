import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
 *  in full prose on every row.
 *
 *  ONE DELIBERATE DIFFERENCE FROM THE FIRST WAVE, on Sarel's own explicit
 *  instruction (15 Oct 2026): this import writes `ratingConfirmed: true` —
 *  THE FINAL SUBMISSION, not a suggestion — and strips the pack's own
 *  "not agreed with ACSA" / "Provisional, suggested by TPJV for the rating
 *  session" / "Re-set it against the ORTIA capture" / "re-assess it
 *  against the 2026 capture" clauses out of the stored ratingRationale, so
 *  the record does not say "final" in one field and "not yet agreed" in
 *  the next. What survives stripping is checked below by actually RUNNING
 *  the importer and reading its output — not just by reading the script's
 *  own text — because this is the one invariant worth proving against the
 *  real bundle. */

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
check(
  "ratingConfirmed is always true on import — the final submission, not a suggestion left for later",
  /ratingConfirmed:\s*true/.test(script) && !/ratingConfirmed:\s*false/.test(script)
);
check("imported actions get no owner or due date by default", /owner:\s*""/.test(script) && /dueDate:\s*""/.test(script));
check("the bundle targets FAOR's 2026-09 visit", script.includes('ENTITY = "FAOR"') && script.includes('VISIT = "2026-09"'));
check("built as the app's own capture-bundle format, not a direct store write", script.includes('kind: "squawk-capture-bundle"'));
check(
  "each event's hazard-library 'source' (HZ-xx or TPJV draft) is carried as plain text on the root cause's own note, never invented or validated",
  script.includes("e.source") && script.includes("`Source: ${e.source}`")
);

/* THE REAL PROOF: run the importer against the real source file and read its
   actual output, not just the script's own text — a stripping regex that
   silently fails to match leaves the "not agreed" language right there in
   the bundle, and only running it catches that. */
const outPath = path.join(os.tmpdir(), `faor-other-disciplines-test-${process.pid}.squawk.json`);
try {
  execFileSync(process.execPath, [path.join(root, "scripts", "import-faor-hazards-other-disciplines.mjs"), "--out", outPath]);
  const bundle = JSON.parse(fs.readFileSync(outPath, "utf8"));
  const systems = Object.values(bundle.visit.systems);

  check("the real output has all 48 systems", systems.length === 48, String(systems.length));
  check(
    "every written SystemAssessment has ratingConfirmed: true — not a suggestion",
    systems.every((s) => s.ratingConfirmed === true)
  );
  check(
    "no written ratingRationale says 'not agreed', 'Provisional', 'rating session', 'Re-set it' or 're-assess it against the 2026 capture' — this is the final submission, said once, not twice",
    systems.every(
      (s) =>
        !/not agreed|Provisional|rating session|Re-set it|re-assess it against the 2026/.test(s.ratingRationale)
    ),
    JSON.stringify(
      systems
        .filter((s) =>
          /not agreed|Provisional|rating session|Re-set it|re-assess it against the 2026/.test(s.ratingRationale)
        )
        .map((s) => s.key)
    )
  );
  check(
    "no ratingRationale was emptied by the stripping — the actual reasoning for the number survives",
    systems.every((s) => s.ratingRationale.trim().length > 0)
  );
  check(
    "every written record is still marked seeded: true — provenance is unchanged by the final-submission decision",
    systems.every((s) => s.seeded === true) &&
      systems.every((s) => s.events.every((e) => e.seeded === true))
  );
} finally {
  fs.rmSync(outPath, { force: true });
}

const types = src("src", "lib", "types.ts");
check("PossibleEvent.seeded exists and is optional", /seeded\?:\s*boolean/.test(types));
check("SystemAssessment.directionOfRisk exists and is optional", /directionOfRisk\?:\s*string/.test(types));

const store = src("src", "lib", "store.ts");
check("persist key untouched", store.includes('"acsa-assurance-v1"'));
check(
  /* UX-audit P1 added disciplineFilterByEntity (src/lib/store.ts), an
     unrelated persisted field, and bumped the version 37 -> 38 for it.
     This assertion's own point — that importing this file's hazard
     mapping adds no new stored field of ITS OWN — still holds; it is
     re-pinned to the version that change actually landed on. */
  "the migration version is unchanged — this import adds no new field, unlike the first hazard-mapping wave",
  /version:\s*38,/.test(store)
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
