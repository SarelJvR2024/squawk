import assert from "node:assert/strict";
import { channelsOf, withChannels, channelCounts } from "../src/lib/channels.ts";

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("PASS ", name);
  } catch (e) {
    failed++;
    console.log("FAIL ", name, e.message);
  }
}

check("no entry means the check needs all three", () =>
  assert.deepEqual(channelsOf({}, "A"), { interview: true, evidence: true, walk: true }));
let c = withChannels({}, ["A", "B"], { walk: false });
check("walk can be switched off for several checks", () => {
  assert.equal(channelsOf(c, "A").walk, false);
  assert.equal(channelsOf(c, "B").walk, false);
});
check("the other channels are untouched", () => assert.equal(channelsOf(c, "A").evidence, true));
check("counts say how many checks need each channel", () =>
  assert.deepEqual(channelCounts(c, ["A", "B", "C"]), { interview: 3, evidence: 3, walk: 1 }));
c = withChannels(c, ["A"], { walk: true });
check("back to all three drops the entry", () => assert.deepEqual(Object.keys(c), ["B"]));
c = withChannels(c, ["B"], { walk: true, interview: false });
check("a patch can switch one on and another off", () => {
  assert.equal(c.B.interview, false);
  assert.equal(c.B.walk, undefined);
});
if (failed) process.exit(1);
console.log(failed ? "FAILED" : "all passed");
