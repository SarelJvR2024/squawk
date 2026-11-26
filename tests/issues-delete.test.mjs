import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("PASS ", name); }
  catch (e) { failed++; console.log("FAIL ", name, e.message); }
}
const table = readFileSync(new URL("../src/components/ReviewRiskTable.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/(app)/issues/page.tsx", import.meta.url), "utf8");

check("the table takes an optional onDeleteMany, so other screens show no Delete", () =>
  assert.ok(/onDeleteMany\?: \(ids: string\[\]\) => void/.test(table)));
check("the bulk bar offers Delete selected only when the screen allows it", () =>
  assert.ok(/onDelete &&/.test(table) && table.includes("Delete selected")));
check("deleting asks first, says how many go and that it cannot be undone", () => {
  assert.ok(table.includes("This cannot be undone."));
  assert.ok(table.includes("Yes, delete"));
  assert.ok(table.includes("Keep"));
});
check("the selection is cleared after a delete", () =>
  assert.ok(/onDeleteMany\(selectedFindings\.map\(\(f\) => f\.id\)\);\s*setSelected\(new Set\(\)\)/.test(table)));
check("the Issues screen deletes through the store's removeFinding and closes an open detail", () => {
  assert.ok(/onDeleteMany=\{\(ids\) => \{\s*for \(const id of ids\) removeFinding\(id\);/.test(page));
  assert.ok(page.includes("ids.includes(active.id)"));
});

if (failed) process.exit(1);
console.log("all passed");
