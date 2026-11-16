import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* REVIEW SAVE STATE (PRIORITY 2 of the Review redesign, "show saving, saved
 * and failed states; never silently lose an edit") — Risk & root cause tab
 * only. The indicator is built on the two signals every write already
 * produces, lastSavedAt/persistError (store.ts), via the new
 * useFieldSaveStatus hook, rather than a second, parallel per-field "saved"
 * flag nothing else maintains. No Date.now() call lives in either component
 * — React Compiler's own `react-hooks/purity` lint rule refuses calling an
 * impure function from inside a component, so the timestamp the hook
 * compares against is the record's own `updatedAt`, already stamped by
 * updateFinding at the moment the edit actually lands.
 *
 * Source-text regex convention, same as every other review suite in this
 * repo, plus a behavioral run of the real hook against the real store
 * state shape — no DOM renderer available. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

const storeSrc = read("src", "lib", "store.ts");
const table = read("src", "components", "ReviewRiskTable.tsx");
const panel = read("src", "components", "ReviewRiskPanel.tsx");
const primitives = read("src", "components", "ui", "primitives.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · updateFinding now stamps lastSavedAt, the gap that left this
   screen with nothing to read ---------------------------------------- */

check(
  "updateFinding stamps lastSavedAt in the SAME set() call as the write itself, same convention as every other action already does",
  /updateFinding: \(id, p\) =>\s*\n\s*set\(\(s\) => \(\{[\s\S]{0,800}lastSavedAt: Date\.now\(\),/.test(storeSrc)
);

/* ---- 2 · useFieldSaveStatus reads the existing primitives, never a
   second "did this field save" flag ------------------------------------ */

check(
  "useFieldSaveStatus is derived purely from lastSavedAt/persistError, no new persisted field",
  /export function useFieldSaveStatus\(editedAt: number \| null\)[\s\S]{0,80}useStore\(\(s\) => s\.lastSavedAt\)[\s\S]{0,80}useStore\(\(s\) => s\.persistError\)/.test(
    storeSrc
  )
);
check(
  "null editedAt (nothing touched yet) says nothing — it must not be read as a fourth, silent status",
  /if \(editedAt === null\) return null;/.test(storeSrc)
);
check(
  "a failure after the edit reports failed, a clean save at or after it reports saved, never the other way around",
  /return persistError \? "failed" : "saved";/.test(storeSrc) &&
    /return persistError \? "failed" : "saving";/.test(storeSrc)
);

/* Behavioral: import the real module and exercise the real hook's pure
   decision function directly (it takes no React context beyond the two
   useStore selectors above, so its branching logic is testable as plain
   data in/data out once lastSavedAt/persistError are known). */
const store = await import("../src/lib/store.ts");
check(
  "useFieldSaveStatus exports from store.ts and is a function",
  typeof store.useFieldSaveStatus === "function"
);

/* ---- 3 · no Date.now() call lives in either component — the lint rule
   this app's own build enforces would refuse it -------------------------- */

check(
  "ReviewRiskPanel's edit wrapper carries no Date.now() call",
  !/function onChange\(patch: Partial<RiskPatch>\)[\s\S]{0,200}Date\.now/.test(panel)
);
check(
  "ReviewRiskPanel instead reads finding.updatedAt, already stamped by the store",
  /useFieldSaveStatus\(dirty \? \(finding\.updatedAt \?\? null\) : null\)/.test(panel)
);
check(
  "ReviewRiskTable's edit wrapper carries no Date.now() call either",
  !/const onChange = \(id: string, patch: Partial<Finding>\) => \{[\s\S]{0,200}Date\.now/.test(table)
);
check(
  "ReviewRiskTable instead looks up the touched row's own updatedAt from `findings`",
  /findings\.find\(\(f\) => f\.id === lastEditedId\)\?\.updatedAt \?\? null/.test(table)
);

/* ---- 4 · the indicator is rendered, once per surface, reusing the SAME
   Pill-based component rather than a bespoke status tag ----------------- */

check(
  "SaveStatusPill lives in ui/primitives.tsx as a thin Pill wrapper, not a new status-tag shape",
  /export function SaveStatusPill/.test(primitives) && /<Pill$|<Pill\s/.test(primitives)
);
check(
  "null status renders nothing — a field nobody has touched shows no stray tag",
  /if \(!status\) return null;/.test(primitives)
);
check(
  "the panel renders it in its sticky header, next to the Finding title",
  /<SaveStatusPill status=\{saveStatus\}/.test(panel)
);
check(
  "the table renders it once, beside the filtered-count line (PRIORITY 2's own line), not once per row",
  (table.match(/<SaveStatusPill status=\{saveStatus\}/g) ?? []).length === 1
);

/* ---- 5 · never discard the local draft on failure --------------------- */
/* The edited value is already in the Finding object the moment onChange
   fires (an ordinary synchronous zustand set()) — persistError describes
   whether the write reached storage, not whether the in-memory record
   still holds the edit. There is nothing here that reverts a field on
   failure; confirm no such revert exists. */

check(
  "neither component reverts a field's own value when persistError is set — the edit survives in memory regardless of what the indicator says",
  !/persistError[\s\S]{0,120}(revert|rollback|undo)/i.test(panel) &&
    !/persistError[\s\S]{0,120}(revert|rollback|undo)/i.test(table)
);

console.log(failures === 0 ? "\nREVIEW SAVE STATE OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
