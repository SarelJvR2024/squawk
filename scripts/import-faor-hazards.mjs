#!/usr/bin/env node
/** Turn the FAOR Civil/Building & Facilities hazard-mapping spreadsheet into a
 *  Squawk capture bundle — the app's own safe, union-by-id merge-import
 *  format (src/lib/merge.ts), the same file two auditors already use to
 *  combine a day's work on the Team screen.
 *
 *  Run:  node scripts/import-faor-hazards.mjs [--out <path>]
 *
 *  Reads src/data/source/faorHazardImport2026-10.json — the cleaned,
 *  structured extraction of the spreadsheet's "Hazards and ratings" sheet
 *  (27 asset systems, Civil and Building & Facilities, every asset-system
 *  name already verified against the FAOR register — see the PR body).
 *
 *  WHAT THIS WRITES, per asset system: severity, likelihood and a rationale
 *  as a SUGGESTION ONLY — `ratingConfirmed: false`, exactly like every other
 *  rating in this app until a person agrees it on the matrix. Every
 *  hazardous event, root cause and mitigating action is marked
 *  `seeded: true` so it reads as distinct from something an auditor typed in
 *  the field — see PossibleEvent.seeded's own doc comment in types.ts.
 *
 *  WHAT THIS DOES NOT WRITE: the spreadsheet's own Cell/Rating text. This
 *  app never stores a band — every screen derives it from severity and
 *  likelihood through bandFor() (src/lib/risk.ts), and this import keeps
 *  that the same way: the imported severity/likelihood pair is the one
 *  thing of record, and whatever band the app computes from it is correct
 *  by definition, even where it reads differently from the spreadsheet's
 *  own colour (confirmed with Sarel: this is intended, not a bug to chase).
 *
 *  WHY A BUNDLE AND NOT A DIRECT WRITE: a bundle is merged through
 *  mergeBundle(), which unions by id rather than overwriting — so importing
 *  this twice, or importing it onto a device that already has field-captured
 *  systems data, cannot lose anything either side already holds. A direct
 *  write into anyone's store bypasses that safety net entirely.
 *
 *  The output file is NOT committed to the repo — it's imported once, from
 *  the Team screen, same as any other auditor's capture file. */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const ENTITY = "FAOR";
const VISIT = "2026-09";
const IMPORTED_BY = "FAOR hazard-mapping import (Oct 2026)";
const SOURCE_FILE = join(REPO_ROOT, "src/data/source/faorHazardImport2026-10.json");

function flag(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase().slice(0, 5);

function buildSystemAssessment(row, now) {
  const key = `${row.discipline}|${row.assetSystem}`;
  const events = row.events.map((e) => {
    const rootCauses = e.rootCause
      ? [
          {
            id: `RC-${uid()}`,
            cause: e.rootCause,
            note: "",
            createdAt: now,
            createdBy: IMPORTED_BY,
            seeded: true,
          },
        ]
      : [];
    const actions = e.action
      ? [
          {
            id: `MA-${uid()}`,
            action: e.action,
            owner: "",
            dueDate: "",
            status: "Open",
            createdAt: now,
            createdBy: IMPORTED_BY,
            seeded: true,
          },
        ]
      : [];
    return {
      id: `EV-${uid()}`,
      event: e.event,
      likelihood: null,
      note: "",
      rootCauses,
      actions,
      findingIds: [],
      assetIds: [],
      createdAt: now,
      createdBy: IMPORTED_BY,
      updatedAt: now,
      seeded: true,
    };
  });

  return [
    key,
    {
      key,
      discipline: row.discipline,
      system: row.assetSystem,
      severity: row.severity,
      likelihood: row.likelihood,
      ratingConfirmed: false,
      ratingRationale: row.ratingRationale ?? "",
      directionOfRisk: row.directionOfRisk ?? "",
      events,
      note: "",
      assessedBy: "",
      assessedAt: null,
      updatedAt: now,
      seeded: true,
    },
  ];
}

function main() {
  const args = process.argv.slice(2);
  const outPath = flag(
    args,
    "out",
    join(REPO_ROOT, `${ENTITY}_${VISIT}_hazard-import.squawk.json`)
  );

  const rows = JSON.parse(readFileSync(SOURCE_FILE, "utf8"));
  const now = Date.now();

  const systems = Object.fromEntries(rows.map((r) => buildSystemAssessment(r, now)));

  const bundle = {
    meta: {
      kind: "squawk-capture-bundle",
      version: 1,
      entity: ENTITY,
      visit: VISIT,
      exportedBy: IMPORTED_BY,
      exportedAt: now,
      counts: { responses: 0, findings: 0, hazards: 0, verifications: 0 },
      photographsNotUploaded: 0,
    },
    visit: {
      responses: {},
      verifications: {},
      captures: [],
      feedback: {},
      adhoc: [],
      systems,
    },
    findings: [],
    hazards: [],
    safetyFindings: [],
    interviewDays: [],
    siteDays: [],
    evidenceItems: [],
    ppeChecks: [],
    siteAccessLogs: [],
    toolboxTalks: [],
    incidentReports: [],
    attendanceRegisters: [],
  };

  writeFileSync(outPath, JSON.stringify(bundle, null, 2));
  console.log(`Wrote ${rows.length} asset systems to ${outPath}`);
  console.log(`entity=${ENTITY} visit=${VISIT}`);
  console.log(`Import it from the Team screen's "Merge a file" button.`);
}

main();
