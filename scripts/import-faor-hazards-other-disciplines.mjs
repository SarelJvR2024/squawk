#!/usr/bin/env node
/** Turn TPJV's "ORTIA hazards, root causes, actions and suggested ratings"
 *  workbook (Electrical, Mechanical, Energy & Demand Management, Process
 *  Safety & Risk) into a Squawk capture bundle — the same safe, union-by-id
 *  merge-import format (src/lib/merge.ts) scripts/import-faor-hazards.mjs
 *  already uses for the FIRST wave of this hazard-mapping work (Civil and
 *  Building & Facilities). This is the SECOND wave, covering the other four
 *  disciplines; the two scripts' output never collides (verified: zero
 *  shared discipline|system keys between the two source files).
 *
 *  Run:  node scripts/import-faor-hazards-other-disciplines.mjs [--out <path>]
 *
 *  Reads src/data/source/faorHazardImportOtherDisciplines2026-10.json — 48
 *  asset systems, every discipline|assetSystem pair and every "linkedChecks"
 *  entry verified against src/data/checks.json before this was written (see
 *  the PR body): every pair matches a real register discipline+system, and
 *  every pack's own "linkedChecks" list is EXACTLY the register's own checks
 *  for that pair — confirmed redundant, not new information, which is why
 *  it is not written anywhere below.
 *
 *  WHAT THIS WRITES, per asset system — DIFFERENT FROM THE FIRST WAVE, ON
 *  SAREL'S OWN EXPLICIT INSTRUCTION (15 Oct 2026): severity, likelihood and a
 *  rationale as THE FINAL SUBMISSION, not a suggestion — `ratingConfirmed:
 *  true`, every hazardous event/root cause/action still marked `seeded:
 *  true` (that is provenance — it genuinely came from a desktop import, not
 *  someone typing on the walk — and is a separate fact from whether the
 *  rating itself is agreed). The pack's own "Rating agreed" column and
 *  ratingRationale text both say "not agreed with ACSA" / "Provisional,
 *  suggested by TPJV for the rating session" / "Re-set it against the ORTIA
 *  capture" / "re-assess it against the 2026 capture" on every row, because
 *  the pack was WRITTEN before that instruction — see `finalizeRationale`
 *  below, which strips exactly those clauses (and only those; the actual
 *  reasoning for each number — where it came from, which airport, which
 *  method — stays) so the stored rationale reads as a final position, not
 *  a draft one next to a flag that says it is final.
 *
 *  WHAT THIS DOES NOT WRITE, and why:
 *    · the workbook's own "Cell"/"Band (computed)" columns — same reasoning
 *      as the first wave: this app derives the band from severity/likelihood
 *      through bandFor() (src/lib/risk.ts), never stores one. (Unlike the
 *      first wave, every row here already agrees with bandFor() — see
 *      tests/faor-import-other-disciplines.test.mjs — so this is a
 *      consistency check that currently finds nothing to disagree with,
 *      not a known exception list.)
 *    · "linkedChecks" — redundant with the register itself (see above).
 *    · "ratingBasis" (e.g. "ACSA 2025 carried", "ORTIA discipline pattern
 *      (low confidence)") — a short tag for a sentence `ratingRationale`
 *      already says in full prose on every row; nothing of it is lost by
 *      not duplicating it into a second field.
 *
 *  WHAT THIS ADDS vs the first wave's importer: each event here also names a
 *  "source" — which of TPJV's own numbered hazard-library entries (HZ-01..
 *  HZ-43) it was drawn from, or "TPJV draft (not in the hazard library)" for
 *  one that is not. The first wave's events had no such column. This is
 *  carried as plain, verbatim text on the root cause's own `note` field
 *  (blank there in the first wave) — informational provenance, same
 *  principle as the Hazard Screening Template references the ORTIA
 *  observations-pack import (src/lib/importPack.ts) carries as unverified
 *  text rather than a validated link: nothing here claims HZ-16 means
 *  anything beyond "TPJV's own template entry 16", and nothing invents one
 *  for an event that says it has none.
 *
 *  WHY A BUNDLE AND NOT A DIRECT WRITE: see the first wave's own script —
 *  the reasoning is identical and unchanged. The output file is NOT
 *  committed to the repo — it is imported once, from the Team screen, same
 *  as any other auditor's capture file. */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const ENTITY = "FAOR";
const VISIT = "2026-09";
const IMPORTED_BY = "ORTIA other-disciplines hazard-mapping import (Oct 2026)";
const SOURCE_FILE = join(REPO_ROOT, "src/data/source/faorHazardImportOtherDisciplines2026-10.json");

function flag(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase().slice(0, 5);

/** Strips exactly the three clauses this pack's own ratingRationale text
 *  uses to say "this is not yet agreed, re-check it later" — nothing else.
 *  Verified against all 48 rows before this was written: every row matches
 *  one of these three exactly (word for word), stripping leaves no
 *  "not agreed"/"Provisional"/"rating session"/"Re-set it"/"re-assess"
 *  fragment behind on any row, and no row is emptied. A row that stops
 *  matching exactly (the source file changes) is left with its own text
 *  unstripped rather than partially mangled — this only removes a clause it
 *  can match in full. */
function finalizeRationale(text) {
  return text
    .replace(
      /\s*Provisional, suggested by TPJV for the rating session; not agreed with ACSA\. Re-set it against the ORTIA capture and ACSA's incident history\.\s*$/,
      ""
    )
    .replace(/\s*Suggested by TPJV for the rating session; not agreed with ACSA\.\s*$/, "")
    .replace(/\s*This is the 2025 position, not a 2026 finding: re-assess it against the 2026 capture\.\s*$/, "")
    .trim();
}

function buildSystemAssessment(row, now) {
  const key = `${row.discipline}|${row.assetSystem}`;
  const events = row.events.map((e) => {
    const rootCauses = e.rootCause
      ? [
          {
            id: `RC-${uid()}`,
            cause: e.rootCause,
            note: e.source ? `Source: ${e.source}` : "",
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
      ratingConfirmed: true,
      ratingRationale: row.ratingRationale ? finalizeRationale(row.ratingRationale) : "",
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
    join(REPO_ROOT, `${ENTITY}_${VISIT}_hazard-import-other-disciplines.squawk.json`)
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
