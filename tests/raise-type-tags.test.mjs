import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
let failed = 0;
function check(name, fn) {
  try { fn(); console.log("PASS ", name); }
  catch (e) { failed++; console.log("FAIL ", name, e.message); }
}
const src = readFileSync(new URL("../src/components/RaiseFindingSheet.tsx", import.meta.url), "utf8");
check("Raise a finding offers Non-compliance and Observation, defaulting to non-compliance", () => {
  assert.ok(src.includes('useState<"non-compliance" | "observation">("non-compliance")'));
  assert.ok(src.includes("Observation") && src.includes('"Finding type"'));
});
check("it offers Critical and Safety tags", () => {
  assert.ok(src.includes('"Finding tags"'));
  assert.ok(src.includes('["Critical", critical, setCritical]') && src.includes('["Safety", safetyTag, setSafetyTag]'));
});
check("the chosen type and tags are saved on the finding, tags only when set", () => {
  assert.ok(/findingType,\s*\.\.\.\(critical \? \{ critical: true \} : \{\}\),\s*\.\.\.\(safetyTag \? \{ safetyTag: true \} : \{\}\)/.test(src));
});
check("reset clears type and tags for the next finding", () =>
  assert.ok(/setFindingType\("non-compliance"\);\s*setCritical\(false\);\s*setSafetyTag\(false\);/.test(src)));
if (failed) process.exit(1);
console.log("all passed");
