import assert from "node:assert/strict";
import { splitNumbered, isIcao, basisItems, standardEvidence } from "../src/lib/standards.ts";
import { channelOf } from "../src/lib/attachmentChannel.ts";
import { readFileSync } from "node:fs";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("PASS ", name); }
  catch (e) { failed++; console.log("FAIL ", name, e.message); }
}

check("a numbered basis splits into its items", () =>
  assert.equal(splitNumbered("1. SANS 10400 2. ICAO Annex 14").length, 2));
check("ICAO is recognised by name, Annex 14 and the Docs", () => {
  assert.ok(isIcao("ICAO Annex 14 Vol I"));
  assert.ok(isIcao("see Doc 9137"));
  assert.ok(!isIcao("SANS 10400"));
});
check("basisItems flags only the ICAO items", () => {
  const b = basisItems("1. SANS 10400 2. ICAO Annex 14");
  assert.deepEqual(b.map((x) => x.icao), [false, true]);
});
check("empty basis gives no items", () => assert.deepEqual(basisItems(null), []));
check("standard evidence is a list, empty when none configured", () => {
  assert.deepEqual(standardEvidence(null), []);
  assert.ok(Array.isArray(standardEvidence("Test records; Inspection programme")));
});

check("a file is evidence, a voice note is the check's, a photo is the walk's when untagged", () => {
  assert.equal(channelOf({ kind: "file" }), "evidence");
  assert.equal(channelOf({ kind: "voice" }), "check");
  assert.equal(channelOf({ kind: "photo" }), "walk");
});
check("an explicit tag wins over the kind", () => {
  assert.equal(channelOf({ kind: "voice", channel: "walk" }), "walk");
  assert.equal(channelOf({ kind: "photo", channel: "evidence" }), "evidence");
});

const src = readFileSync(new URL("../src/components/CheckDetail.tsx", import.meta.url), "utf8");
check("the Evidence sheet strip no longer lists every non-photo attachment", () =>
  assert.ok(!/attachments=\{r\.attachments\.filter\(\(a\) => a\.kind !== "photo"\)\}/.test(src)));
check("the Walk sheet shows the walk note and walk-channel attachments", () => {
  assert.ok(src.includes("Recorded on the walk"));
  assert.ok(src.includes('channelOf(a) === "walk"'));
});
check("the check screen has the ICAO & standards and Evidence list buttons", () => {
  assert.ok(src.includes("ICAO &amp; standards") || src.includes("ICAO & standards"));
  assert.ok(src.includes("Evidence list"));
});

if (failed) process.exit(1);
console.log("all passed");
