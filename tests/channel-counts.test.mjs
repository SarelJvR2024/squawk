/* BUILD PROMPT 1 ("Make channel switches count") — needsDesk/needsField stop
 *  counting a check against a screen that has nothing left to ask it.
 *
 *  Before this, needsDesk/needsField were hardcoded `() => true` (see the
 *  long doc comment above them in src/lib/verification.ts) — correct for
 *  every audit until Setup could switch a channel off per check. Once it
 *  can, a check with every channel off still showed up in Checks' "x of 324
 *  captured" denominator and the Inspection nav badge, so it could never be
 *  marked done without someone opening a screen that had nothing on it to
 *  answer. This file is the behavioural counterpart to tests/channels.test.mjs
 *  (which only tests the config shape) and tests/portals.test.mjs (which
 *  checks the call sites are wired, by source pattern, not by running them). */

import assert from "node:assert/strict";
import { needsDesk, needsField } from "../src/lib/verification.ts";

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

const check1 = { id: "CHK-1" };

check("with no config, every check still needs desk and field — unchanged default", () => {
  assert.equal(needsDesk(check1), true);
  assert.equal(needsField(check1), true);
});

check("switching walk off drops the check from needsField, not needsDesk", () => {
  const config = { "CHK-1": { walk: false } };
  assert.equal(needsField(check1, config), false);
  assert.equal(needsDesk(check1, config), true);
});

check("switching both interview and evidence off drops the check from needsDesk", () => {
  const config = { "CHK-1": { interview: false, evidence: false } };
  assert.equal(needsDesk(check1, config), false);
  assert.equal(needsField(check1, config), true);
});

check("either interview or evidence alone is enough to still need the desk", () => {
  assert.equal(needsDesk(check1, { "CHK-1": { evidence: false } }), true);
  assert.equal(needsDesk(check1, { "CHK-1": { interview: false } }), true);
});

check("every channel off takes the check off both screens", () => {
  const config = { "CHK-1": { interview: false, evidence: false, walk: false } };
  assert.equal(needsDesk(check1, config), false);
  assert.equal(needsField(check1, config), false);
});

/* isComplete is exported by src/lib/store.ts, not verification.ts — it is
   the function the "x of 324 captured" counts and the save toast actually
   call, so the fix has to reach it, not stop at needsDesk/needsField
   themselves reading right in isolation. */
const storeModule = await import("../src/lib/store.ts");

/* isComplete looks the id up in the real register (checkById) — an id it
   does not recognise falls back to "either half saved", skipping
   needsDesk/needsField entirely, so this needs a REAL check id, not CHK-1
   above. Any row does; the id itself carries no meaning for this test. */
const REAL_ID = "KSIA-ELE-001";

check("a check with no channels needs both deskDoneAt and fieldDoneAt to read complete", () => {
  assert.equal(storeModule.isComplete(REAL_ID, { deskDoneAt: 1, fieldDoneAt: null }), false);
  assert.equal(storeModule.isComplete(REAL_ID, { deskDoneAt: 1, fieldDoneAt: 2 }), true);
});

check("a desk-only check (walk switched off) is complete once the desk half is saved", () => {
  const config = { [REAL_ID]: { walk: false } };
  assert.equal(
    storeModule.isComplete(REAL_ID, { deskDoneAt: 1, fieldDoneAt: null }, config),
    true
  );
});

check("a check with no channels left needing it is complete with neither half saved", () => {
  const config = { [REAL_ID]: { interview: false, evidence: false, walk: false } };
  assert.equal(
    storeModule.isComplete(REAL_ID, { deskDoneAt: null, fieldDoneAt: null }, config),
    true
  );
});

/* THE CASE THE ABOVE MISSES: a check with every channel off never gets a
   Response at all, because nothing left routes to it (see needsDesk/
   needsField's own scoping of Capture/Field) — so `r` here is `undefined`,
   not an object with null fields. AppShell's masthead ring and Home's
   dashboard strip both read isComplete with exactly this `r`, so this is
   the case that actually matters on screen, not the one above with an
   empty object standing in for "never touched". */
check("a check with no channels left needing it is complete with NO response at all", () => {
  const config = { [REAL_ID]: { interview: false, evidence: false, walk: false } };
  assert.equal(storeModule.isComplete(REAL_ID, undefined, config), true);
});

check("a check that still needs a channel is NOT complete with no response at all", () => {
  const config = { [REAL_ID]: { walk: false } };
  assert.equal(storeModule.isComplete(REAL_ID, undefined, config), false);
  assert.equal(storeModule.isComplete(REAL_ID, undefined), false);
});

check(
  "isComplete with no config argument is unchanged — still needs both halves",
  () => {
    assert.equal(storeModule.isComplete(REAL_ID, { deskDoneAt: 1, fieldDoneAt: null }), false);
  }
);

if (failed) process.exit(1);
console.log(failed ? "FAILED" : "all passed");
