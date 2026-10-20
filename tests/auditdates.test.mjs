import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* CORRECT AN AUDIT'S OWN DATES, FROM THE AUDITS PANEL.
 *
 *  Sarel: "add option to change the date of the audit ie ORTIA audit of
 *  september was done early october, i need to change the date."
 *
 *  A visit's id ("2026-09") decides which month it is FILED under — carry-
 *  forward sorts by it, and changing it would mean a different visit, not a
 *  correction to this one. What the complaint is actually about is what a
 *  reader SEES: the label and window text the masthead strip and the Audits
 *  panel print, both plain `label`/`note` strings on the seeded Visit. The
 *  data layer for this (AuditDateOverride, setAuditDateOverride,
 *  clearAuditDateOverride) already existed in store.ts from an earlier ask
 *  of the same sentence — nothing had ever written one or read one back.
 *  This suite proves the whole path: write an override, confirm the merge
 *  function actually applies it the way auditWindow() formats every other
 *  audit window in this app, and that the Audits panel is wired to both
 *  ends of it.
 *
 *     node --import ./tests/alias.mjs tests/auditdates.test.mjs
 *
 *  store.ts imported first — same Node ESM cycle-ordering fix
 *  carryforward.test.mjs's own header explains. */
import { useStore, withDateOverride, scopeKey } from "@/lib/store";
import { auditWindow } from "@/lib/programme";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
};

/* ------------------------------- Part 1: the store actions, for real --- */

const ENTITY = "ORTIA";
const VISIT = "2026-09";

useStore.getState().setAuditDateOverride(ENTITY, VISIT, {
  auditFrom: "2026-10-05",
  auditTo: "2026-10-08",
});

const key = scopeKey(ENTITY, VISIT);
const stored = useStore.getState().auditDateOverrides[key];

check(
  "setAuditDateOverride writes a correction keyed by entity+visit, not by the visit id alone",
  stored?.auditFrom === "2026-10-05" && stored?.auditTo === "2026-10-08"
);
check(
  "it stamps who corrected it and when, same as every other store write",
  typeof stored?.updatedAt === "number" && typeof stored?.updatedBy === "string" && stored.updatedBy.length > 0
);

/* ------------------------- Part 2: the merge function, for real ------- */

const seeded = { id: VISIT, label: "Sep 2026", entity: ENTITY, state: "current", note: "Round 1 · 29–02 Oct" };

const corrected = withDateOverride(seeded, ENTITY, useStore.getState().auditDateOverrides);
check(
  "a visit WITH a dated correction shows the real window, run through the exact same auditWindow() every Entity-level window uses",
  corrected.note === auditWindow("2026-10-05", "2026-10-08", undefined)
);
check(
  "September audit, actually done in early October — the fixed note says October, not the seeded September text",
  corrected.note.includes("Oct") && !corrected.note.includes("Sep") && corrected.note !== seeded.note
);
check(
  "the visit's own id/label stay what they were seeded as — this never turns one visit into another",
  corrected.id === VISIT && corrected.label === seeded.label
);

const untouchedVisit = { id: "2025-05", label: "May 2025", entity: ENTITY, state: "done", note: "33 findings" };
const untouched = withDateOverride(untouchedVisit, ENTITY, useStore.getState().auditDateOverrides);
check(
  "a visit with NO correction passes through completely unchanged",
  untouched === untouchedVisit
);

/* ---- a free-text note, when no dates are given, wins over the seeded one —
   a SEPARATE visit, since setAuditDateOverride merges onto whatever is
   already stored (same invariant setCompliance/evidencePending relies on
   elsewhere) and VISIT above still carries the dated correction from Part 1. ---- */
useStore.getState().setAuditDateOverride(ENTITY, "2026-11", { note: "Final walk only, 14 Oct" });
const textOnlySeeded = { id: "2026-11", label: "Nov 2026", entity: ENTITY, state: "scheduled", note: "scheduled" };
const textOnly = withDateOverride(textOnlySeeded, ENTITY, useStore.getState().auditDateOverrides);
check(
  "a free-text note override is honoured when no auditFrom/auditTo are set",
  textOnly.note === "Final walk only, 14 Oct"
);

/* ---------------------------------------- Part 3: clearing it --------- */

useStore.getState().clearAuditDateOverride(ENTITY, VISIT);
check(
  "clearAuditDateOverride removes the correction entirely — not just blanks its fields",
  !(key in useStore.getState().auditDateOverrides)
);
const afterClear = withDateOverride(seeded, ENTITY, useStore.getState().auditDateOverrides);
check(
  "and the visit reads exactly as the programme seeded it again",
  afterClear === seeded
);

/* -------------------------------------- Part 4: the UI is wired up --- */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");
const storeSrc = src("lib", "store.ts");
const panel = src("components", "AuditsPanel.tsx");

check(
  "useVisits applies the correction to every visit it returns — the masthead strip needs nothing else wired",
  /mergeVisits\(custom, code\)\.map\(\(v\) => withDateOverride\(v, code, overrides\)\)/.test(storeSrc)
);
check(
  "useAllAudits applies it too — the Audits panel's own list",
  /visit: withDateOverride\(v, entityCode, overrides\)/.test(storeSrc)
);
check(
  "the Audits panel reads and writes both actions",
  /setAuditDateOverride = useStore\(\(s\) => s\.setAuditDateOverride\)/.test(panel) &&
    /clearAuditDateOverride = useStore\(\(s\) => s\.clearAuditDateOverride\)/.test(panel)
);
check(
  "editing one visit does not touch another — the editor is keyed to a single scopeKey",
  /editingKey === key/.test(panel) && /startEdit\(e\.code, v\.id\)/.test(panel)
);
check(
  "a blank date field is sent as undefined, not an empty string the override would treat as a real value",
  /auditFrom: editFrom \|\| undefined/.test(panel) && /auditTo: editTo \|\| undefined/.test(panel)
);
check(
  "clearing the correction is only offered once one actually exists",
  /auditDateOverrides\[editingKey!\] &&/.test(panel)
);

console.log(failures === 0 ? "\nAUDIT DATES OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
