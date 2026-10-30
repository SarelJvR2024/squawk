/* "If it is non-compliant, that audit check becomes a finding."
 *
 *  Sarel, 30 October 2026, looking at the Electrical report: the walk
 *  already had this rule — addAdhoc/updateAdhoc auto-raise a finding the
 *  moment outcome becomes "NC" (see adhoc.test.mjs). The REGISTER's 324
 *  checks did not: a check marked Non-compliant through the three
 *  Compliant/Non-compliant/N/A buttons (setCompliance) raised nothing
 *  unless an auditor also ticked a specific pre-defined "issue" — and that
 *  picker's checkbox list was removed from CheckDetail.tsx months ago.
 *
 *  THIS SUITE RUNS THE REAL STORE, not a source-text stand-in for it — see
 *  sync-coverage.test.mjs's own precedent for the same reasoning. The first
 *  version of this file was regex-on-source only, and independent review 30
 *  October 2026 found a real duplicate-raise bug that EVERY ONE of its 15
 *  static checks missed, because none of them actually called
 *  setCompliance and looked at what findings came out:
 *
 *    · THE GUARD WAS SCOPED BY VISIT. A finding's whole point is to persist
 *      across visits until closed, so a check still broken at the NEXT
 *      visit gets re-tapped Non-compliant (every Response starts fresh per
 *      visit) — the old guard looked only at THAT visit's findings, never
 *      saw the one still open from before, and minted a second. That is
 *      the NORMAL case for a persisting non-compliance, not a rare one.
 *    · THE SAME BUG BROKE FindingDetail.tsx's "link to a check" flow: it
 *      calls updateFinding to attach checkId to an orphan finding raised on
 *      an EARLIER visit, then calls setCompliance(checkId, "NC") — the
 *      visit-scoped guard missed the finding that call had just linked and
 *      raised a second one on the same check.
 *
 *  The fix scopes the guard by checkId + entity + "not already Closed"
 *  instead — a still-open finding from ANY visit blocks a duplicate, a
 *  CLOSED one does not (so a check that regresses after being fixed
 *  correctly gets a fresh finding of its own). Every scenario below is
 *  pinned by actually calling setCompliance/updateFinding and reading
 *  useStore's real resulting findings array — not a pattern match on the
 *  source that would have passed on the broken version too. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useStore } from "@/lib/store";

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

/* A real check from the actual register, so checkById.get() inside
   raiseFindingFromCheck resolves to a real Check rather than undefined. */
const CHECK_ID = "KSIA-ELE-001";

const reset = (visit = "2026-09") => {
  useStore.setState({
    entity: "FAOR",
    visit,
    auditor: "Test Auditor",
    byVisit: {},
    findings: [],
  });
};

const findingsFor = (checkId) => useStore.getState().findings.filter((f) => f.checkId === checkId);

/* ---- 1 · the basic case: NC raises exactly one finding ------------------ */

{
  reset();
  useStore.getState().setCompliance(CHECK_ID, "NC");
  const fs_ = findingsFor(CHECK_ID);
  check(
    "marking a check Non-compliant raises exactly one finding",
    fs_.length === 1,
    `${fs_.length} findings`
  );
  const f = fs_[0];
  check(
    "the raised finding is seeded from the real register check, not a guess",
    f?.checkId === CHECK_ID &&
      f?.adHoc === false &&
      f?.issueIndex === null &&
      f?.actionStatus === "Open" &&
      typeof f?.title === "string" &&
      f.title.length > 0,
    JSON.stringify(f)
  );
  check(
    "severity/likelihood/rating start unagreed, same as every other freshly raised finding",
    f?.severity === null && f?.likelihood === null && f?.ratingConfirmed === false
  );
}

/* ---- 2 · re-tapping NC on the SAME visit never duplicates ---------------- */

{
  reset();
  useStore.getState().setCompliance(CHECK_ID, "NC");
  useStore.getState().setCompliance(CHECK_ID, "NC");
  check(
    "tapping Non-compliant twice on the same check, same visit, raises only one finding",
    findingsFor(CHECK_ID).length === 1,
    `${findingsFor(CHECK_ID).length} findings`
  );
}

/* ---- 3 · THE BUG: a persisting non-compliance across TWO VISITS --------- */

{
  reset("2026-09");
  useStore.getState().setCompliance(CHECK_ID, "NC");
  const afterVisit1 = findingsFor(CHECK_ID);
  check("visit 1: one finding raised", afterVisit1.length === 1, `${afterVisit1.length}`);

  /* The next visit. A fresh Response (compliance: null) for this check —
     visitData() falls back to emptyResponse() per (entity, visit) — same as
     a real auditor opening this check again months later. The finding from
     visit 1 is untouched: still Open, still the same record. */
  useStore.setState({ visit: "2027-03" });
  useStore.getState().setCompliance(CHECK_ID, "NC");
  const afterVisit2 = findingsFor(CHECK_ID);
  check(
    "visit 2: the SAME still-open non-compliance does NOT mint a second finding",
    afterVisit2.length === 1,
    `${afterVisit2.length} findings — the bug independent review found: a visit-scoped guard cannot see visit 1's still-open finding`
  );
  check(
    "and it is the SAME finding, not a new one with the same count by coincidence",
    afterVisit2[0]?.id === afterVisit1[0]?.id
  );
}

/* ---- 4 · a CLOSED prior finding correctly allows a fresh one ------------ */

{
  reset("2026-09");
  useStore.getState().setCompliance(CHECK_ID, "NC");
  const first = findingsFor(CHECK_ID)[0];
  useStore.getState().updateFinding(first.id, { actionStatus: "Closed" });

  /* The check regresses on a later visit — a genuinely NEW non-compliance,
     not the same one still open. */
  useStore.setState({ visit: "2027-03" });
  useStore.getState().setCompliance(CHECK_ID, "NC");
  const fs_ = findingsFor(CHECK_ID);
  check(
    "once the prior finding is actually Closed, a later NC correctly raises a fresh one",
    fs_.length === 2,
    `${fs_.length} findings — a regression after a real fix is a new non-compliance, not a duplicate of the closed one`
  );
  check(
    "the fresh finding is a different record from the closed one",
    fs_.some((f) => f.id !== first.id && f.actionStatus === "Open")
  );
}

/* ---- 5 · THE BUG: FindingDetail.tsx's "link to a check" flow ------------ */

{
  reset("2026-09");
  /* An orphan finding, raised on an EARLIER visit via RaiseFindingSheet —
     no checkId yet, exactly LinkToCheck's own precondition (f.checkId is
     falsy, FindingDetail.tsx:189). */
  const orphanId = useStore.getState().addFinding({
    checkId: null,
    discipline: "Electrical",
    system: "AGL",
    area: "AGL",
    title: "Seen on a prior visit, not yet tied to a check",
    description: "Raised by hand on the Findings screen.",
    issueIndex: null,
    severity: null,
    likelihood: null,
    ratingConfirmed: false,
    rootCause: "",
    actions: [],
    actionStatus: "Open",
    originVisit: "2026-03",
    priorRating: null,
    suggestedEvent: "",
    progress: [],
    adHoc: false,
    createdBy: "Test Auditor",
  });

  /* A reviewer links it to a check on THIS visit — LinkToCheck.link()'s own
     exact sequence, FindingDetail.tsx:83-90. */
  useStore.getState().updateFinding(orphanId, { checkId: CHECK_ID });
  useStore.getState().setCompliance(CHECK_ID, "NC");

  const fs_ = findingsFor(CHECK_ID);
  check(
    "linking an orphan finding to a check does not raise a second, duplicate finding on it",
    fs_.length === 1,
    `${fs_.length} findings — the bug independent review found: the visit-scoped guard missed the just-linked finding (originVisit 2026-03 ≠ current visit 2026-09)`
  );
  check(
    "the one finding on the check is the orphan that was just linked, not a freshly minted generic one",
    fs_[0]?.id === orphanId,
    JSON.stringify(fs_[0])
  );
}

/* ---- 6 · a non-NC verdict never raises, and never removes --------------- */

{
  reset();
  useStore.getState().setCompliance(CHECK_ID, "C");
  check("marking Compliant raises nothing", findingsFor(CHECK_ID).length === 0);

  useStore.getState().setCompliance(CHECK_ID, "NC");
  check("then Non-compliant raises exactly one", findingsFor(CHECK_ID).length === 1);

  useStore.getState().setCompliance(CHECK_ID, "C");
  check(
    "correcting it back to Compliant does NOT withdraw the finding already raised — a person closes it, this file does not delete it",
    findingsFor(CHECK_ID).length === 1
  );
}

/* ---- 7 · the walk's own rule (raiseFindingFromAdhoc) is untouched -------- */

check(
  "the walk's own rule (raiseFindingFromAdhoc) is untouched by this change",
  /raiseFindingFromAdhoc: \(item\) =>\s*\n\s*get\(\)\.addFinding\(\{\s*\n\s*checkId: null,/.test(store)
);

check(
  "raiseFindingFromCheck is declared on the store interface",
  /raiseFindingFromCheck: \(checkId: string\) => string;/.test(store)
);

const summary = failures === 0 ? "COMPLIANCE-FINDING OK" : `${failures} FAILURES`;
console.log(`\n${summary}\n`);
process.exit(failures === 0 ? 0 : 1);
