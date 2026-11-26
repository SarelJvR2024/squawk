import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("PASS ", name); }
  catch (e) { failed++; console.log("FAIL ", name, e.message); }
}
const j = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const ref = j("../src/data/checkReference.json");
const checks = j("../src/data/checks.json");
const files = j("../src/data/acsaDocFiles.json");
const list = Array.isArray(checks) ? checks : checks.checks;

check("every register check has a reference entry, and no extra", () => {
  assert.equal(Object.keys(ref).length, list.length);
  for (const c of list) assert.ok(c.id in ref, c.id);
});
check("every spec carries its text; MEANS/CHECK are strings when present", () => {
  for (const r of Object.values(ref)) for (const s of r.specs ?? []) {
    assert.ok(s.text && s.text.length > 3);
    for (const k of ["means", "check", "source"]) if (k in s) assert.equal(typeof s[k], "string");
  }
});
check("ICAO status is cited or indicative, with at least one item", () => {
  for (const r of Object.values(ref)) if (r.icao) {
    assert.ok(["cited", "indicative"].includes(r.icao.status));
    assert.ok(r.icao.items.length > 0);
  }
});
check("frequency entries carry their meaning lines", () => {
  for (const r of Object.values(ref)) if (r.freq) assert.ok(r.freq.meaning.length > 0 && r.freq.tasks.length > 0);
});
check("ACSA library links all point at the TPJV SharePoint library", () => {
  assert.equal(files.length, 112);
  for (const f of files) assert.ok(f.url.startsWith("https://tpjv.sharepoint.com/01 Projects/ACSA Asset Assurance/"), f.name);
});
check("most cited ACSA codes resolve to a library file", () => {
  const codes = new Set(list.flatMap((c) => (c.acsaDocs ?? []).map((d) => d.doc).filter(Boolean)));
  const hit = [...codes].filter((c) => files.some((f) => f.name.toLowerCase().startsWith(c.toLowerCase() + " ")));
  assert.ok(hit.length >= codes.size - 8, `${hit.length}/${codes.size}`);
});
const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
check("Add an inspection item offers a gallery Upload beside the camera Photo button", () => {
  const t = src("../src/components/AddItemSheet.tsx");
  assert.ok(/fromLibrary\s+label="Upload"/.test(t));
});
check("Triage has a Clean up wording button that selects the visible findings; unavailable assistant is said, not hidden", () => {
  const t = src("../src/components/ReviewRiskTable.tsx");
  assert.ok(t.includes("Clean up wording") && t.includes('id="triage-bulk-bar"'));
  assert.ok(t.includes("not switched on for this deployment"));
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
