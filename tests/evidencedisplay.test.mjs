import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { displayStatus, satisfiesLabel, DISPLAY_STATUS_LABEL } from "../src/lib/evidence.ts";

/* THE UNIFIED EVIDENCE STATUS — build prompt 6, 22 Nov 2026: "redesign
 *  /evidence and the check's evidence row as one evidence record with two
 *  views... Statuses are exactly: Requested, Received, Not available."
 *
 *  This suite covers the two new pure functions (displayStatus,
 *  satisfiesLabel — shape tests, mirroring tests/channels.test.mjs), the
 *  new Response.evidenceNA field and its wiring into CheckDetail.tsx, and
 *  that both evidence views (By document, the pre-existing By discipline
 *  view left untouched, and the new By check) actually use the new status
 *  model rather than it being built and left unreachable — the same class
 *  of bug build prompt 3's code review caught, so this suite checks for
 *  it directly rather than assuming. */

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

/* ---------- displayStatus: collapses every richer fact to exactly 3 ---------- */

const item = (patch) => ({
  id: "DOC-1",
  entity: "X",
  originVisit: "V1",
  title: "",
  documentNo: "",
  revision: "",
  documentDate: null,
  requestedAt: Date.now(),
  requestedFrom: "",
  receivedAt: null,
  receivedFrom: "",
  receivedBy: "",
  medium: null,
  isOriginal: false,
  returnedAt: null,
  returnedTo: "",
  unavailableAt: null,
  unavailableReason: "",
  analysisAt: null,
  analysisNote: "",
  insufficientAt: null,
  insufficientReason: "",
  checkIds: [],
  attachments: [],
  signature: null,
  notes: "",
  createdAt: Date.now(),
  ...patch,
});

check("not started, requested, uploaded and insufficient all read as 'requested'", () => {
  assert.equal(displayStatus(item({})), "requested");
  assert.equal(displayStatus(item({ attachments: [{ createdAt: Date.now() }] })), "requested");
  assert.equal(displayStatus(item({ insufficientAt: Date.now() })), "requested");
});
check("declared unproducible reads as 'unavailable'", () =>
  assert.equal(displayStatus(item({ unavailableAt: Date.now() })), "unavailable"));
check("received outranks a stale 'unavailable' — producing a document contradicts declaring it unproducible", () =>
  assert.equal(displayStatus(item({ receivedAt: Date.now(), unavailableAt: Date.now() - 1000 })), "received"));
check("received, with or without analysis or return, still just reads 'received'", () => {
  assert.equal(displayStatus(item({ receivedAt: Date.now() })), "received");
  assert.equal(displayStatus(item({ receivedAt: Date.now(), analysisAt: Date.now() })), "received");
  assert.equal(
    displayStatus(item({ receivedAt: Date.now(), returnedAt: Date.now() })),
    "received",
  );
});
check("DISPLAY_STATUS_LABEL has exactly the spec's three words", () =>
  assert.deepEqual(DISPLAY_STATUS_LABEL, {
    requested: "Requested",
    received: "Received",
    unavailable: "Not available",
  }));

/* ---------- satisfiesLabel ---------- */

check("no check-point linked reads honestly, same words the custody register's own count already used", () =>
  assert.equal(satisfiesLabel([], (id) => id), "No check-point linked"));
check("one check — 'Satisfies check', singular, by the number an auditor actually sees", () =>
  assert.equal(satisfiesLabel(["A1"], (id) => `#${id}`), "Satisfies check #A1"));
check("several checks — 'Satisfies checks', plural, in the array's own order", () =>
  assert.equal(satisfiesLabel(["A1", "A2", "A3"], (id) => `#${id}`), "Satisfies checks #A1, #A2, #A3"));

/* ---------- Response.evidenceNA + CheckDetail wiring ---------- */

const types = src("src", "lib", "types.ts");
check("evidenceNA exists on Response, additive, same shape as interviewNA/walkNA", () =>
  assert.match(types, /evidenceNA\?: boolean;/));

const detail = src("src", "components", "CheckDetail.tsx");
check("the Evidence row has its own N/A button, same pattern as Interview/Walk's", () =>
  assert.match(detail, /onClick=\{\(\) => patch\(check\.id, \{ evidenceNA: !r\.evidenceNA \}\)\}/));
check("evidenceNA takes priority in the row's own status pill, same as evidenceStatus === 'noneAvailable' already did", () =>
  assert.match(detail, /r\.evidenceNA \|\| r\.evidenceStatus === "noneAvailable"/));

/* ---------- the By-document view actually uses the new status model ---------- */

const evidencePage = src("src", "app", "(app)", "evidence", "page.tsx");
check("By document has status-filter count chips, same role=radiogroup pattern EvidenceReviewView already uses", () =>
  assert.match(evidencePage, /role="radiogroup" aria-label="Filter by status"/));
check("and the chips are driven by the new displayStatus, not the richer evidenceStage", () =>
  assert.match(evidencePage, /for \(const e of items\) c\[displayStatus\(e\)\]\+\+;/));
check("each item row shows the real check numbers it satisfies, not just a count", () =>
  assert.match(evidencePage, /satisfiesLabel\(e\.checkIds, \(id\) => portalIdFor\(entityCode, id\)\)/));
check("re-request calls the existing store action, not a hand-rolled patch", () =>
  assert.match(evidencePage, /onClick=\{\(\) => reRequest\(e\.id\)\}/));
check("a third view, 'By check', is added alongside the other two, not replacing either", () => {
  assert.match(evidencePage, /\["document", "By document"\]/);
  assert.match(evidencePage, /\["discipline", "By discipline"\]/);
  assert.match(evidencePage, /\["check", "By check"\]/);
});
check("and it is actually RENDERED, not just added to the tab list", () =>
  assert.match(evidencePage, /\{view === "check" \? <EvidenceByCheckView onOpenRecord=\{openInDocumentView\} \/> : null\}/));

/* ---------- the By-check view, built fresh ---------- */

const byCheck = src("src", "components", "EvidenceByCheckView.tsx");
check("By check only shows checks Setup has the evidence channel on for", () =>
  assert.match(byCheck, /checksAt\(entityCode\)\.filter\(\(c\) => channelsOf\(config, c\.id\)\.evidence\)/));
check("an item satisfying several checks appears once under each, the many-to-many already in checkIds", () =>
  assert.match(byCheck, /for \(const id of e\.checkIds\) \{/));
check("Open jumps back to the full custody record, same precedent EvidenceReviewView's own onOpenRecord set", () =>
  assert.match(byCheck, /onClick=\{\(\) => onOpenRecord\(e\.id\)\}/));
check("same three quick actions as By document — Load file, mark status, re-request", () => {
  assert.match(byCheck, /<FileButton compact onCaptured=/);
  assert.match(byCheck, /Mark received/);
  assert.match(byCheck, /Not available/);
  assert.match(byCheck, /Re-request/);
});

if (failed) process.exit(1);
console.log(failed ? "FAILED" : "all passed");
