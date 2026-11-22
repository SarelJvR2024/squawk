import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEvidenceList,
  buildEvidenceImportPlan,
  evidenceImportCounts,
  applyEvidenceImportPlan,
} from "@/lib/evidenceImport";

/* BULK EVIDENCE LIST UPLOAD — build prompt 6, 22 Nov 2026: "upload a
 *  CSV/XLSX of evidence items per check (columns: check id, evidence
 *  name). Preview, then import." Same parse/plan/apply split as
 *  tests/import-pack.test.mjs tests for the observation pack, at a
 *  smaller scale — two columns, no cross-record writes, no undo. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(...parts) {
  return fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
}

let failed = 0;
function check(name, condOrFn, why) {
  try {
    const cond = typeof condOrFn === "function" ? (condOrFn(), true) : condOrFn;
    if (cond === false) throw new Error(why ?? "failed");
    console.log("PASS ", name);
  } catch (e) {
    failed++;
    console.log("FAIL ", name, e.message);
  }
}

const csv = (text) => new TextEncoder().encode(text);

/* ---------- parseEvidenceList: CSV ---------- */

check("parses a plain CSV by header name, not column position", () => {
  const rows = parseEvidenceList(
    csv("evidence name,check id\nDaily log,A1\nCertificate,A2\n"),
    "list.csv",
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { rowIndex: 2, checkId: "A1", title: "Daily log" });
  assert.deepEqual(rows[1], { rowIndex: 3, checkId: "A2", title: "Certificate" });
});
check("header matching is case-insensitive and column order doesn't matter", () => {
  const rows = parseEvidenceList(csv("Check ID,Evidence Name\nA1,Daily log\n"), "list.csv");
  assert.deepEqual(rows[0], { rowIndex: 2, checkId: "A1", title: "Daily log" });
});
check("a quoted field can carry a comma — the one thing a naive split would break on", () => {
  const rows = parseEvidenceList(
    csv('check id,evidence name\nA1,"Daily log, Jan–Sep 2026"\n'),
    "list.csv",
  );
  assert.equal(rows[0].title, "Daily log, Jan–Sep 2026");
});
check("blank trailing rows are skipped, not counted as empty data", () => {
  const rows = parseEvidenceList(csv("check id,evidence name\nA1,Daily log\n\n"), "list.csv");
  assert.equal(rows.length, 1);
});
check("missing either required column throws, naming exactly what was expected", () => {
  assert.throws(
    () => parseEvidenceList(csv("check id,notes\nA1,x\n"), "list.csv"),
    /check id.*evidence name/,
  );
});
check("a file with only a header throws rather than silently importing nothing", () => {
  assert.throws(() => parseEvidenceList(csv("check id,evidence name\n"), "list.csv"), /header row/);
});

/* ---------- buildEvidenceImportPlan ---------- */

const CHECKS = [
  { id: "A1", requirement: "r1", discipline: "Electrical", system: "AGL" },
  { id: "A2", requirement: "r2", discipline: "Electrical", system: "AGL" },
];

check("a row whose check id is in the register maps to it", () => {
  const plan = buildEvidenceImportPlan([{ rowIndex: 2, checkId: "A1", title: "Daily log" }], CHECKS, []);
  assert.equal(plan.rows[0].check, CHECKS[0]);
  assert.equal(plan.rows[0].alreadyLogged, false);
});
check("a row whose check id is not in the register is unmapped, not silently dropped", () => {
  const plan = buildEvidenceImportPlan([{ rowIndex: 2, checkId: "Z9", title: "Daily log" }], CHECKS, []);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].check, null);
});
check("a row matching an existing item's check id + title (case-insensitive) is alreadyLogged", () => {
  const existing = [{ checkIds: ["A1"], title: "Daily log" }];
  const plan = buildEvidenceImportPlan(
    [{ rowIndex: 2, checkId: "A1", title: "DAILY LOG" }],
    CHECKS,
    existing,
  );
  assert.equal(plan.rows[0].alreadyLogged, true);
});
check("the same title on a DIFFERENT check is not a duplicate", () => {
  const existing = [{ checkIds: ["A2"], title: "Daily log" }];
  const plan = buildEvidenceImportPlan(
    [{ rowIndex: 2, checkId: "A1", title: "Daily log" }],
    CHECKS,
    existing,
  );
  assert.equal(plan.rows[0].alreadyLogged, false);
});
check("an empty file is blocked with a reason, not silently a no-op import", () =>
  assert.equal(buildEvidenceImportPlan([], CHECKS, []).blockedReason, "That file has no rows to import."));

/* ---------- evidenceImportCounts ---------- */

check("counts split mapped-new / already-logged / unmapped correctly", () => {
  const plan = buildEvidenceImportPlan(
    [
      { rowIndex: 2, checkId: "A1", title: "New one" },
      { rowIndex: 3, checkId: "A1", title: "Already here" },
      { rowIndex: 4, checkId: "Z9", title: "Nowhere" },
    ],
    CHECKS,
    [{ checkIds: ["A1"], title: "Already here" }],
  );
  assert.deepEqual(evidenceImportCounts(plan), { total: 3, toImport: 1, unmapped: 1, alreadyLogged: 1 });
});

/* ---------- applyEvidenceImportPlan ---------- */

check("apply writes one new evidence item per importable row, and returns how many", () => {
  const plan = buildEvidenceImportPlan(
    [
      { rowIndex: 2, checkId: "A1", title: "New one" },
      { rowIndex: 3, checkId: "A1", title: "Already here" },
      { rowIndex: 4, checkId: "Z9", title: "Nowhere" },
    ],
    CHECKS,
    [{ checkIds: ["A1"], title: "Already here" }],
  );
  const written = [];
  const n = applyEvidenceImportPlan(plan, (title, seed) => {
    written.push({ title, seed });
    return "DOC-X";
  });
  assert.equal(n, 1);
  assert.deepEqual(written, [{ title: "New one", seed: { checkIds: ["A1"] } }]);
});

/* ---------- Setup wiring ---------- */

const setup = src("src", "app", "(app)", "setup", "page.tsx");
check("Setup has the bulk evidence list upload section", () =>
  assert.match(setup, /Bulk evidence list upload/));
check("nothing is written until Confirm is pressed — the file picker only parses and builds a plan", () =>
  assert.match(
    setup,
    /setPlan\(buildEvidenceImportPlan\(rows, CHECKS, items\)\);/,
  ));
check("Confirm calls applyEvidenceImportPlan, not a second, different write path", () =>
  assert.match(setup, /const n = applyEvidenceImportPlan\(plan, addEvidenceItem\);/));
check("the preview shows every row's own status before anything is imported", () =>
  assert.match(setup, /Show every row/));

if (failed) process.exit(1);
console.log(failed ? "FAILED" : "all passed");
