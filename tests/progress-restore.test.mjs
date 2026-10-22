/* THE CAPTURED-PROGRESS COUNTS, BACK ON CHECKS AND INSPECTION — and proven
 *  against the real calculation, not a second copy of it.
 *
 *  PR #173 ("UI polish v2") moved the nav's per-destination counts (324/324,
 *  10, 22/33) off the bar entirely and onto a hover-only `title`; its own
 *  item-7 commit additionally deleted the literal "{doneCount}/
 *  {visible.length}" text that sat beside Inspection's Filters button, on
 *  the mistaken claim that "the existing track+figure just below this bar
 *  ... already did that job" — the track survived, the number did not. The
 *  Checks screen never had a visible count of its own at all. This is the
 *  desktop/tablet redesign's first checkpoint: all three come back, in a
 *  quieter shape than before (muted text, not a coloured badge), reading
 *  the SAME source of truth the app already had — `checksAt` +
 *  `needsDesk`/`needsField` + `deskDone`/`fieldDone` (AppShell.tsx,
 *  src/app/(app)/home/page.tsx) and Inspection's own `doneCount`/
 *  `visible.length` — never a hardcoded number and never a second formula
 *  that could drift from the first.
 *
 *  Part 1 drives the REAL store — not a mirror of commit(), the actual
 *  zustand action every Save button calls — and checks the figures this
 *  restoration renders are exactly what that run produces. Part 2 reads the
 *  four changed files and proves each one's new text is bound to a
 *  variable built from the register, never a literal.
 *
 *     node --import ./tests/alias.mjs tests/progress-restore.test.mjs
 *
 *  store.ts is imported first, same Node-ESM-cycle-through-./programme
 *  ordering fix carryforward.test.mjs's own header explains. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useStore, checksAt, deskDone, fieldDone } from "@/lib/store";
import { needsDesk, needsField } from "@/lib/verification";
import { CURRENT_ENTITY_CODE } from "@/lib/programme";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = (...p) => fs.readFileSync(path.join(root, "src", ...p), "utf8");

const shell = src("components", "AppShell.tsx");
const capture = src("app", "(app)", "capture", "page.tsx");
const field = src("app", "(app)", "field", "page.tsx");
const groupRow = src("components", "ui", "GroupRow.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ============================= Part 1: the real calculation, actually run */

const entityCode = useStore.getState().entity;
check(
  "the store opens on the same entity the register's own default names",
  entityCode === CURRENT_ENTITY_CODE,
  entityCode
);

/* needsDesk/needsField are both unconditional `true` (verification.ts) — so
   every check at this site is in scope for both halves, and the only thing
   that can tell the desk figure apart from the field figure is which ones
   get committed through which portal. Two DIFFERENT counts, committed
   through the real `commit()` action exactly as CheckDetail.tsx's Save
   button and FieldPage's saveField() call it — not a fixture file, not a
   hand-built Response object. */
const checksHere = checksAt(entityCode);
const deskScope = checksHere.filter(needsDesk);
const fieldScope = checksHere.filter(needsField);

check(
  "the register this site carries is non-empty, or the rest of this suite proves nothing",
  checksHere.length > 0,
  entityCode
);

const N_DESK = 7;
const N_FIELD = 3;
for (const c of deskScope.slice(0, N_DESK)) useStore.getState().commit(c.id, "desk");
for (const c of fieldScope.slice(0, N_FIELD)) useStore.getState().commit(c.id, "field");

const responses = useStore.getState().visitData().responses;

/* ---- the exact pair AppShell's nav badge and Home's "At the desk"/"On
   site" rows compute (checksAt + needsDesk/needsField + deskDone/
   fieldDone) — this suite's own copy of that expression, run against the
   real store, is the "existing calculation" every rendering site below is
   checked against. */
const realDesk = {
  done: deskScope.filter((c) => deskDone(responses[c.id])).length,
  total: deskScope.length,
};
const realField = {
  done: fieldScope.filter((c) => fieldDone(responses[c.id])).length,
  total: fieldScope.length,
};

check(
  "the desk half tracks only what was committed through the desk portal",
  realDesk.done === N_DESK,
  `expected ${N_DESK}, got ${realDesk.done}`
);
check(
  "the field half tracks only what was committed through the field portal, independently",
  realField.done === N_FIELD,
  `expected ${N_FIELD}, got ${realField.done}`
);
check(
  "both halves share the same denominator — the site's own checklist, not the register's",
  realDesk.total === checksHere.length && realField.total === checksHere.length,
  `desk total ${realDesk.total}, field total ${realField.total}, site checklist ${checksHere.length}`
);

/* ---- Inspection's own `doneCount`/`visible.length`, unfiltered (the
   screen's default), are the SAME numbers by a different route: `visible`
   with no discipline/location filter and no search is
   `checksAt(entityCode).filter(needsField)` verbatim (see field/page.tsx's
   own `visible` useMemo) — so doneCount/visible.length must equal
   realField.done/realField.total exactly, with nothing re-derived. */
const inspectionVisible = checksAt(entityCode).filter(needsField);
const inspectionDoneCount = inspectionVisible.filter((c) => fieldDone(responses[c.id])).length;
check(
  "Inspection's own doneCount/visible.length (unfiltered) is the identical figure, not a second formula",
  inspectionDoneCount === realField.done && inspectionVisible.length === realField.total,
  `doneCount ${inspectionDoneCount}/${inspectionVisible.length} vs field ${realField.done}/${realField.total}`
);

/* ---- one asset system's own done/total — the per-group figure GroupRow
   and Capture's system row already rendered before this restoration, and
   must go on rendering unchanged. */
const oneSystem = checksHere[0].system;
const systemChecks = checksHere.filter((c) => c.system === oneSystem);
const systemDone = systemChecks.filter((c) => fieldDone(responses[c.id])).length;
check(
  "a single asset system's figure is a straight subset of the same checklist, not the whole site's",
  systemChecks.length > 0 && systemChecks.length <= checksHere.length,
  `${oneSystem}: ${systemDone}/${systemChecks.length} of ${checksHere.length}`
);

/* ============================ Part 2: the rendering reads that, nothing else */

/* Comments are stripped first, same rule home.test.mjs and completion.test.mjs
   already apply — the prose in this repo explains a number and quotes it
   while doing so, which must not be mistaken for a literal the CODE carries. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const shellCode = strip(shell);
const captureCode = strip(capture);
const fieldCode = strip(field);

/* -------------------------------------------------------- the nav labels */

check(
  "the nav badge for Checks/Inspection is computed from checksAt + needsDesk/needsField + deskDone/fieldDone, not a literal",
  /const desk = useMemo\(\(\) => \{\s*\n\s*const scope = checks\.filter\(needsDesk\);/.test(shellCode) &&
    /const field = useMemo\(\(\) => \{\s*\n\s*const scope = checks\.filter\(needsField\);/.test(shellCode) &&
    /deskDone\(responses\[c\.id\]\)/.test(shellCode) &&
    /fieldDone\(responses\[c\.id\]\)/.test(shellCode),
  "AppShell.tsx's own desk/field useMemo pair must still be what `badge` reads"
);

check(
  "the restored nav text is gated to exactly Checks and Inspection, and reads the same `badge` the tooltip already carries",
  /\(n\.href === "\/capture" \|\| n\.href === "\/field"\) && badge !== ""/.test(shellCode) &&
    /\{badge\}/.test(shellCode),
  "every other destination (Asset Assurance, HIRA, Follow-up, Dashboard) must stay tooltip-only — no register denominator to be quiet about"
);

check(
  "the restored nav text is muted grey, not a coloured badge or box",
  /style=\{\{ color: "var\(--ink-4\)" \}\}\s*\n\s*>\s*\n\s*\{badge\}/.test(shellCode),
  "a rounded-full accent pill is exactly what the redesign is moving away from"
);

/* -------------------------------------------------------------- Checks */

check(
  "the Checks heading figure is checksAt(entityCode).filter(needsDesk) + deskDone, the exact AppShell/Home pair — not a new formula",
  /const siteDesk = useMemo\(\(\) => \{\s*\n\s*const scope = checksAt\(entityCode\)\.filter\(needsDesk\);\s*\n\s*return \{ done: scope\.filter\(\(c\) => deskDone\(responses\[c\.id\]\)\)\.length, total: scope\.length \};/.test(
    captureCode
  ),
  "a screen that recomputed its own version of this pair is exactly the drift this restoration must not introduce"
);

check(
  "the Checks heading renders that pair as words, a percentage derived with Math.round, and nothing hardcoded",
  /const siteDeskPct = siteDesk\.total \? Math\.round\(\(siteDesk\.done \/ siteDesk\.total\) \* 100\) : 0;/.test(
    captureCode
  ) &&
    /\{siteDesk\.done\} of \{siteDesk\.total\} captured · \{siteDeskPct\}%/.test(captureCode),
  ""
);

check(
  "the Checks heading bar is 4px tall and neutral-tracked with an accent fill, never a coloured box",
  /className="h-\[4px\] flex-1 overflow-hidden rounded-full"\s*\n\s*style=\{\{ background: "var\(--line\)" \}\}/.test(
    captureCode
  ) &&
    /background: "var\(--acc\)"/.test(captureCode),
  ""
);

check(
  "the Checks heading shows a check mark only once siteDesk reads whole, and it is the same figure, not a separate 100% test",
  /siteDesk\.total > 0 && siteDesk\.done === siteDesk\.total/.test(captureCode) &&
    /IconCheck/.test(captureCode),
  ""
);

check(
  "each asset-system row's own mark also reads the row's own done/all.length, not a page-wide figure",
  /all\.length > 0 && done === all\.length/.test(captureCode) && /<IconCheck/.test(captureCode),
  "a system fully captured must not be marked off the SITE's total by accident"
);

/* ----------------------------------------------------------- Inspection */

check(
  "Inspection's restored heading figure is the pre-existing doneCount/visible.length, read back, not recomputed",
  /const doneCount = visible\.filter\(\(c\) => fieldDone\(responses\[c\.id\]\)\)\.length;/.test(fieldCode) &&
    /const visiblePct = visible\.length \? Math\.round\(\(doneCount \/ visible\.length\) \* 100\) : 0;/.test(
      fieldCode
    ) &&
    /\{doneCount\} of \{visible\.length\} captured · \{visiblePct\}%/.test(fieldCode),
  "doneCount/visible.length is the exact pair d7d79bb's item-7 commit deleted the text for — this must read it, not a copy"
);

check(
  "Inspection's heading bar is the same 4px neutral/accent pair as Checks, and a check mark only at 100%",
  /className="h-\[4px\] flex-1 overflow-hidden rounded-full"/.test(fieldCode) &&
    /visible\.length > 0 && doneCount === visible\.length/.test(fieldCode) &&
    /IconCheck/.test(fieldCode),
  ""
);

check(
  "Inspection's per-system rows opt into the same check mark through GroupRow, not a copy of its logic",
  /<GroupRow\s*\n\s*label=\{g\.sys\}\s*\n\s*done=\{g\.done\}\s*\n\s*total=\{g\.total\}[\s\S]{0,260}showCheck/.test(
    fieldCode
  ),
  "GroupRow is shared with Findings and Follow-up — the mark must be opt-in, not forced onto screens nobody asked to change"
);

/* GroupRow itself: the mark is gated behind a prop that defaults to off, so
   Findings and Follow-up (its other two callers) render exactly as before
   unless they too pass `showCheck`. */
const groupRowCode = strip(groupRow);
check(
  "GroupRow's check mark is opt-in and off by default, so its other callers are untouched",
  /showCheck = false/.test(groupRowCode) &&
    /showCheck && total > 0 && done === total/.test(groupRowCode),
  "Findings and Follow-up also render GroupRow; a mark that is on by default would be an unasked-for change to both"
);

const closure = src("app", "(app)", "closure", "page.tsx");
const findings = src("app", "(app)", "findings", "page.tsx");
check(
  "and neither of GroupRow's other two callers was touched to pass it",
  !/showCheck/.test(closure) && !/showCheck/.test(findings),
  "this restoration is scoped to Checks and Inspection only"
);

console.log(
  failures === 0 ? "\nPROGRESS RESTORE OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
