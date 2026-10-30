/* "If it is non-compliant, that audit check becomes a finding."
 *
 *  Sarel, 30 October 2026, looking at the Electrical report: the walk
 *  already had this rule — addAdhoc/updateAdhoc auto-raise a finding the
 *  moment outcome becomes "NC" (see adhoc.test.mjs). The REGISTER's 324
 *  checks did not. A check marked Non-compliant through the three
 *  Compliant/Non-compliant/N/A buttons on the Checks screen (setCompliance)
 *  used to raise nothing at all unless an auditor also ticked a specific
 *  pre-defined "issue" — and that picker (toggleIssue's own checkbox list)
 *  was removed from CheckDetail.tsx months ago. So a check could sit
 *  Non-compliant on a live audit with no finding tracking it toward closure
 *  at the next visit, and nothing on screen said so.
 *
 *  THE FIX, and why it is shaped the way it is:
 *    · Raised once, only when the check has no finding yet from ANY source
 *      — an issue-button finding on data from before the picker was
 *      removed, or one a desk reviewer wrote up by hand on the Findings
 *      screen (RaiseFindingSheet) — so re-confirming an already-NC check
 *      never mints a second.
 *    · NOT withdrawn when the verdict changes away from NC. Unlike
 *      toggleIssue's own removeFindingsForIssue, this mechanism owns no
 *      `issueIndex` that uniquely marks "its" finding — a desk reviewer's
 *      own finding against the same check would look identical. Leaving a
 *      stale finding for a person to close is the safer of the two wrong
 *      answers, not the deleting of one that was never this mechanism's to
 *      remove.
 *    · No photo requirement — matches the walk's own rule exactly. Sarel,
 *      asked directly: "any time it's Non-compliant."
 *
 *  Source-read, like the other store-behaviour suites (see adhoc.test.mjs's
 *  own header for why: store.ts is a "use client" zustand store wired to
 *  IndexedDB, not something this offline suite runs directly). */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const store = read("src", "lib", "store.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const slice = (needle, len) => {
  const i = store.indexOf(needle);
  return i === -1 ? "" : store.slice(i, i + len);
};

const setCompliance = slice("setCompliance: (checkId, c, evidencePending = false) => {", 700);
const raiseFindingFromCheck = slice("raiseFindingFromCheck: (checkId) => {", 900);

/* ---- setCompliance raises on NC, guarded against a duplicate ------------ */

check(
  "setCompliance still writes compliance and evidencePending exactly as before",
  /compliance: c,\s*\n\s*evidencePending: c === "C" \? evidencePending : false,/.test(setCompliance)
);

check(
  "setCompliance raises a finding only inside the NC branch, not on every call",
  /if \(c === "NC"\) \{/.test(setCompliance),
  setCompliance
);

check(
  "the NC branch checks for an EXISTING finding on this check before raising — never a blind raise",
  /get\(\)\.findings\.some\(\s*\n\s*\(f\) => f\.checkId === checkId && f\.entity === entity && f\.originVisit === visit\s*\n\s*\)/.test(
    setCompliance
  ),
  "scoped by checkId, entity AND originVisit — a same-id check at a different airport or an earlier visit must not count as already covered"
);

check(
  "raiseFindingFromCheck is called only when no finding was found, never unconditionally",
  /if \(!hasFinding\) get\(\)\.raiseFindingFromCheck\(checkId\);/.test(setCompliance)
);

check(
  "no photo condition gates the raise — Sarel: \"any time it's Non-compliant\"",
  !/attachments/.test(setCompliance) && !/photo/i.test(setCompliance)
);

/* ---- NOT withdrawn on a verdict change away from NC ---------------------- */

check(
  "setCompliance never calls removeFindingsForIssue or any other removal — a stale finding stays for a person to close, not silently deleted",
  !/removeFinding/.test(setCompliance),
  "deleting here could remove a finding a desk reviewer wrote up by hand against the same check — this mechanism cannot tell the two apart"
);

/* ---- raiseFindingFromCheck itself: register-seeded, not ad-hoc ---------- */

check(
  "raiseFindingFromCheck reads the REGISTER check (checkById) and the check's own response, not an AdHocItem",
  /const c = checkById\.get\(checkId\);/.test(raiseFindingFromCheck) &&
    /const r = get\(\)\.response\(checkId\);/.test(raiseFindingFromCheck)
);

check(
  "checkId is SET on the finding — the opposite of raiseFindingFromAdhoc's hardcoded null",
  /checkId,\s*\n\s*discipline: c\?\.discipline/.test(raiseFindingFromCheck)
);

check(
  "adHoc is false — this came off the 324-check register, not something seen free-form on the walk",
  /adHoc: false,/.test(raiseFindingFromCheck)
);

check(
  "issueIndex is null — not raised by a specific issue button, same convention raiseFindingFromAdhoc already uses",
  /issueIndex: null,/.test(raiseFindingFromCheck)
);

check(
  "title and description fall back to the check's own requirement text rather than writing an empty finding",
  /title: c\?\.requirement \|\| "Not compliant",/.test(raiseFindingFromCheck) &&
    /description: r\.observation \|\| c\?\.requirement \|\| "",/.test(raiseFindingFromCheck)
);

check(
  "severity/likelihood/rating start exactly as unagreed as every other freshly raised finding — never seeded with a guess",
  /severity: null,\s*\n\s*likelihood: null,\s*\n\s*ratingConfirmed: false,/.test(raiseFindingFromCheck)
);

/* ---- wired through addFinding, not a second, drifting copy -------------- */

check(
  "raiseFindingFromCheck ends in a single addFinding call, same as raiseFindingFromAdhoc — one shape, one place",
  /return get\(\)\.addFinding\(\{/.test(raiseFindingFromCheck)
);

/* ---- declared on the store's own interface, callable via get() ---------- */

check(
  "raiseFindingFromCheck is declared on the store interface",
  /raiseFindingFromCheck: \(checkId: string\) => string;/.test(store)
);

/* ---- the two mechanisms stay genuinely parallel, not a copy that drifts - */

check(
  "the walk's own rule (raiseFindingFromAdhoc) is untouched by this change",
  /raiseFindingFromAdhoc: \(item\) =>\s*\n\s*get\(\)\.addFinding\(\{\s*\n\s*checkId: null,/.test(store)
);

const summary = failures === 0 ? "COMPLIANCE-FINDING OK" : `${failures} FAILURES`;
console.log(`\n${summary}\n`);
process.exit(failures === 0 ? 0 : 1);
