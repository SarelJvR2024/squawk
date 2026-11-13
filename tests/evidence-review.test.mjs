import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useStore } from "@/lib/store";

/* EVIDENCE REVIEW — Sarel's "Evidence" review-screen brief, translated onto
 * this app's real architecture (no Postgres tables, no RLS — see
 * docs/capture-review/evidence-review-discovery.md for the full translation
 * and every judgement call made along the way). Same bespoke
 * node-test-with-regex-on-source-text convention the other three passes of
 * this initiative used (review-risk-fields.test.mjs,
 * review-table-v2.test.mjs), PLUS real store runs where the behaviour is
 * worth more than a pattern match — reRequestEvidence's field-clearing in
 * particular, same reasoning compliancefinding.test.mjs gives for running
 * the real store rather than reading its source.
 *
 * Needs the alias loader (TS files imported by extensionless specifier, and
 * `@/lib/store` resolved to src/lib/store.ts):
 *   node --import ./tests/alias.mjs tests/evidence-review.test.mjs
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

const E = await import("../src/lib/evidence.ts");
const R = await import("../src/lib/review.ts");

const types = read("src", "lib", "types.ts");
const storeSrc = read("src", "lib", "store.ts");
const assistPrompts = read("src", "lib", "assistPrompts.ts");
const assistLib = read("src", "lib", "assist.ts");
const view = read("src", "components", "EvidenceReviewView.tsx");
const panel = read("src", "components", "EvidenceReviewPanel.tsx");
const reviewDetail = read("src", "components", "ReviewDetail.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const mkEvidence = (overrides = {}) => ({
  id: "DOC-TEST1",
  entity: "FAOR",
  originVisit: "2026-11",
  title: "Test document",
  documentNo: "",
  revision: "",
  documentDate: null,
  requestedAt: null,
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
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

/* ---- 1 · the type and the migration ------------------------------------ */

check(
  "EvidenceItem carries the new insufficientAt/insufficientReason pair, same shape as unavailableAt/unavailableReason",
  /insufficientAt: number \| null;/.test(types) && /insufficientReason: string;/.test(types)
);
check(
  "EvidenceItem carries an optional complianceRating, a new narrow type — not a widened Compliance",
  /complianceRating\?:\s*EvidenceComplianceRating;/.test(types)
);
check(
  "EvidenceComplianceRating is its own type, not folded into the app-wide Compliance union",
  /export type EvidenceComplianceRating = "compliant" \| "partial" \| "nonCompliant";/.test(types)
);
check(
  "the app-wide Compliance type is untouched — still exactly C/NC/N-A/NV",
  /export type Compliance = "C" \| "NC" \| "N\/A" \| "NV";/.test(types)
);
check(
  "the version bumped again, to at least 42",
  Number(/version:\s*(\d+),/.exec(storeSrc)?.[1] ?? 0) >= 42
);
check(
  "a v42 migration backfills insufficientAt/insufficientReason on every existing item, without dropping its other fields",
  /from < 42[\s\S]{0,700}st\.evidenceItems = st\.evidenceItems\.map\(\(e\) => \(\{\s*\.\.\.e,[\s\S]{0,200}insufficientAt: e\.insufficientAt \?\? null[\s\S]{0,120}insufficientReason: e\.insufficientReason \?\? ""/.test(
    storeSrc
  )
);
check(
  "addEvidenceItem seeds insufficientAt/insufficientReason on every new record",
  /addEvidenceItem: \(title, seed\)[\s\S]{0,1500}insufficientAt: null[\s\S]{0,80}insufficientReason: ""/.test(storeSrc)
);

/* ---- 2 · trackingStage — "uploaded" and "insufficient" ------------------ */

check(
  "EvidenceTrackingStage gained uploaded and insufficient, alongside every stage review-table-v2 already had",
  E.TRACKING_LABEL.uploaded === "Uploaded" &&
    E.TRACKING_LABEL.insufficient === "Insufficient" &&
    E.TRACKING_LABEL.notStarted &&
    E.TRACKING_LABEL.requested &&
    E.TRACKING_LABEL.received &&
    E.TRACKING_LABEL.analysis &&
    E.TRACKING_LABEL.returned &&
    E.TRACKING_LABEL.unavailable
);
check(
  "requested with nothing attached still reads as requested",
  E.trackingStage(mkEvidence({ requestedAt: 1 })) === "requested"
);
check(
  "attaching a file after the request moves it to uploaded (test 4, first half)",
  E.trackingStage(mkEvidence({ requestedAt: 1, attachments: [{ id: "a", kind: "file", name: "x", createdAt: 2 }] })) ===
    "uploaded"
);
check(
  "marking it received moves uploaded to received (test 4, second half)",
  E.trackingStage(
    mkEvidence({
      requestedAt: 1,
      attachments: [{ id: "a", kind: "file", name: "x", createdAt: 2 }],
      receivedAt: 3,
    })
  ) === "received"
);
check(
  "received and analysed still reads as analysis, unchanged from review-table-v2",
  E.trackingStage(mkEvidence({ requestedAt: 1, receivedAt: 2, analysisAt: 3 })) === "analysis"
);
check(
  "insufficientAt outranks received/analysis — the latest real fact wins",
  E.trackingStage(mkEvidence({ requestedAt: 1, receivedAt: 2, analysisAt: 3, insufficientAt: 4 })) === "insufficient"
);
check(
  "returned still outranks everything, insufficient included",
  E.trackingStage(
    mkEvidence({ requestedAt: 1, receivedAt: 2, insufficientAt: 3, returnedAt: 4 })
  ) === "returned"
);

/* ---- 3 · status cannot skip forward ------------------------------------ */

check(
  "requested straight to analysed is structurally impossible: analysisAt with no receivedAt never reads as analysis (test 3)",
  E.trackingStage(mkEvidence({ requestedAt: 1, analysisAt: 2 })) !== "analysis" &&
    E.trackingStage(mkEvidence({ requestedAt: 1, analysisAt: 2 })) === "requested"
);
check(
  "the panel's own AI 'Analyse evidence' button is disabled until the item has actually been received — the one place analysisAt is set outside the per-document editor",
  /const canAnalyse = !!item\.receivedAt;/.test(panel) &&
    /disabled={aiBusy !== null \|\| !canAnalyse}/.test(panel)
);
check(
  "the row action button only offers 'Analyse' once the stage is received, 'Open' once it is analysed — no direct requested-to-analysed button",
  /stage === "received" \? "Analyse" : "Open"/.test(view)
);

/* ---- 4 · re-request keeps files and history (test 5) — REAL STORE ------ */

{
  useStore.setState({
    entity: "FAOR",
    visit: "2026-11",
    auditor: "Test Auditor",
    evidenceItems: [],
  });
  const id = useStore.getState().addEvidenceItem("Maintenance logs");
  useStore.getState().addEvidenceAttachment(id, {
    kind: "file",
    name: "logs.pdf",
    mimeType: "application/pdf",
    createdBy: "Test Auditor",
  });
  useStore.getState().updateEvidenceItem(id, { receivedAt: Date.now() });
  useStore.getState().updateEvidenceItem(id, {
    insufficientAt: Date.now(),
    insufficientReason: "Wrong revision",
  });
  const before = useStore.getState().evidenceItems.find((e) => e.id === id);
  check(
    "marking insufficient does not touch attachments or receivedAt",
    before.attachments.length === 1 && !!before.receivedAt && !!before.insufficientAt
  );

  useStore.getState().reRequestEvidence(id);
  const after = useStore.getState().evidenceItems.find((e) => e.id === id);
  check(
    "re-request clears the insufficient declaration",
    after.insufficientAt === null && after.insufficientReason === ""
  );
  check(
    "re-request keeps the file attached — 'keeps files and history' (test 5)",
    after.attachments.length === 1 && after.attachments[0].name === "logs.pdf"
  );
  check(
    "re-request stamps a fresh requestedAt, which is what reads the item back as requested",
    after.requestedAt > before.requestedAt && E.trackingStage(after) === "requested"
  );
  check(
    "the old file, predating the fresh ask, does not fool trackingStage back into 'uploaded'",
    after.attachments[0].createdAt < after.requestedAt
  );
}

/* ---- 5 · creating a request (tests 1 and 2) ----------------------------- */

{
  useStore.setState({ entity: "FAOR", visit: "2026-11", auditor: "Test Auditor", evidenceItems: [] });
  const id = useStore.getState().addEvidenceItem("General discipline doc", { discipline: "Electrical" });
  const e = useStore.getState().evidenceItems.find((x) => x.id === id);
  check(
    "a request with only a discipline saves — system and checkIds stay empty (test 1)",
    e.discipline === "Electrical" && !e.system && e.checkIds.length === 0
  );
}
check(
  "the table shows a purple General tag, gated on the item's own system field, for exactly this shape (test 1)",
  /e\.system \? \(/.test(view) && /<Pill tone="accent">General<\/Pill>/.test(view)
);
check(
  "the Add-request dialog's save button is disabled without a discipline — creating one with no discipline is rejected (test 2)",
  /disabled={!title\.trim\(\) \|\| !discipline}/.test(view)
);

/* ---- reference codes removed from the UI (presentation only) ---------
 * "Review pages: remove audit-check reference codes from the UI" — the
 * Evidence review tab now shows the linked check's own readable
 * requirement text, never its portalIdFor() reference code. The purple
 * General tag asserted just above is untouched (it is the EvidenceItem's
 * own discipline-level General state, not a check reference). */
check(
  "the table's 'Linked to' subline shows the linked check's requirement text, with no portalIdFor() prefix or separator",
  /check\.requirement\.slice\(0, \d+\)/.test(view) && !/portalIdFor\(entityCode, check\.id\)/.test(view)
);
check(
  "the Add-request sheet's Audit check <select> options read the requirement text, not `${c.id} — ...`",
  /\{c\.requirement\.slice\(0, \d+\)\}/.test(view) && !/\{c\.id\} —/.test(view)
);
check(
  "the panel's own Audit check <select> options and its 'Feeds into' hint both read requirement text, with no raw check id and no portalIdFor import",
  /\{c\.requirement\.slice\(0, \d+\)\}/.test(panel) &&
    !/\{c\.id\} —/.test(panel) &&
    !/\$\{linkedCheck\.id\}/.test(panel) &&
    !/portalIdFor/.test(panel)
);
check(
  "the panel's 'General — not linked to a check' fallback is untouched",
  /"General — not linked to a check"/.test(panel)
);
check(
  "discipline is marked required in the dialog, asset system and check optional, matching 3.5",
  /DISCIPLINE" hint="required"/.test(view) &&
    /ASSET SYSTEM" hint="optional/.test(view) &&
    /AUDIT CHECK" hint="optional"/.test(view)
);

/* ---- 6 · asset-system filter narrows to the discipline, resets on change */

check(
  "the asset system filter options come from systemsOf(entityCode, disciplineFilter) — scoped to the picked discipline",
  /disciplineFilter === "all" \? \[\] : systemsOf\(entityCode, disciplineFilter\)/.test(view)
);
check(
  "changing the discipline filter resets the asset system filter to all",
  /setDisciplineFilter\(e\.target\.value\);\s*setSystemFilter\("all"\);/.test(view)
);
check(
  "the panel's own discipline change clears system and checkIds too — the same rule, in the right panel",
  /discipline: e\.target\.value \|\| undefined,\s*system: undefined,\s*checkIds: \[\],/.test(panel)
);

/* ---- 7 · status pill counts reflect the active discipline/system filters, not the status filter itself */

check(
  "counts (cards and pills alike) are computed from baseFiltered — discipline/system filtered, never status-filtered",
  /for \(const e of baseFiltered\) c\[trackingStage\(e\)\]\+\+;/.test(view)
);
check(
  "the visible (status-filtered) rows are a SEPARATE list from the counts, so a pill's own count never reads its own filtered length",
  /const visible = useMemo\(\(\) => \{[\s\S]{0,300}return baseFiltered\.filter/.test(view)
);

/* ---- 8 · a discipline with N requests renders N rows (regression) ------ */

check(
  "the table maps every item in a discipline's group with no slice/limit — the collapsed-table regression this brief names (test 8)",
  /g\.items\.map\(\(e\) => \(/.test(view) && !/g\.items\.slice\(/.test(view)
);

/* ---- 9 · AI suggestion: pending changes nothing, Accept writes, Reject doesn't */

check(
  "a pending suggestion is plain component state, never written to the EvidenceItem until Accept — Reject only clears local state",
  /const \[suggestion, setSuggestion\] = useState<Suggestion \| null>\(null\);/.test(panel) &&
    /function reject\(\) \{\s*\/\* EPHEMERAL/.test(panel) &&
    (() => {
      const rejectBody = panel.match(/function reject\(\) \{[\s\S]{0,400}?\n  \}/)?.[0] ?? "";
      return !/patch\(/.test(rejectBody);
    })()
);
check(
  "Accept is the only path that calls patch() with the suggestion's own text",
  /function accept\(\)[\s\S]{0,200}if \(!suggestion\) return;/.test(panel) &&
    /function accept\(\)[\s\S]{0,1600}patch\(item\.id, \{/.test(panel)
);
check(
  "no pending-suggestion field or table is persisted on EvidenceItem or in the migration — it stays ephemeral, per the grounding",
  !/evidenceAiSuggestions|pendingSuggestion/.test(types) && !/evidenceAiSuggestions|pendingSuggestion/.test(storeSrc)
);
check(
  "the auto-create-draft-Finding path exists but defaults OFF, behind one named flag (§4.5's CONFIRM WITH SAREL)",
  /const AUTO_CREATE_FINDING_ON_ACCEPT = false;/.test(panel) &&
    /if \(AUTO_CREATE_FINDING_ON_ACCEPT && findingText\)/.test(panel)
);

/* ---- 10 · evidenceAxisFor / combined compliance (§4 judgement call) ----- */

check(
  "unrated evidence leaves the axis exactly the existing evidenceVerdict — 'if no evidence is rated, combined is unaffected'",
  R.evidenceAxisFor("C", [mkEvidence({ complianceRating: undefined })]) === "C" &&
    R.evidenceAxisFor(null, []) === null
);
check(
  "a nonCompliant-rated item drags the axis to NC even if the auditor's own evidenceVerdict was C",
  R.evidenceAxisFor("C", [mkEvidence({ complianceRating: "nonCompliant" })]) === "NC"
);
check(
  "a partial rating reads as NV, not a fifth Compliance value",
  R.evidenceAxisFor(null, [mkEvidence({ complianceRating: "partial" })]) === "NV"
);
check(
  "worst-of across several items: one compliant and one non-compliant item still reads NC",
  R.evidenceAxisFor("C", [
    mkEvidence({ id: "a", complianceRating: "compliant" }),
    mkEvidence({ id: "b", complianceRating: "nonCompliant" }),
  ]) === "NC"
);
check(
  "reviewCombinedCompliance's own signature is untouched — still three plain Compliance|null arguments",
  /export function reviewCombinedCompliance\(\s*compliance: Compliance \| null,\s*evidenceVerdict: Compliance \| null,\s*siteInspection: Compliance \| null\s*\)/.test(
    read("src", "lib", "review.ts")
  )
);
check(
  "ReviewDetail computes evidenceAxis from this check's own linked EvidenceItems and feeds it into reviewCombinedCompliance in place of the raw verdict",
  /evidenceForCheck = useMemo\(\s*\(\) => evidenceItems\.filter\(\(e\) => e\.checkIds\.includes\(check\.id\)\)/.test(
    reviewDetail
  ) &&
    /const evidenceAxis = r \? evidenceAxisFor\(r\.evidenceVerdict, evidenceForCheck\) : null;/.test(reviewDetail) &&
    /reviewCombinedCompliance\(r\.compliance, evidenceAxis, r\.siteInspection\)/.test(reviewDetail)
);
check(
  "the Evidence cell on the sticky strip now shows the axis, not the raw unweighted verdict",
  /<StatusCell label="Evidence" value={evidenceAxis}/.test(reviewDetail)
);
check(
  "the three EVIDENCE_VERDICTS buttons further down the screen still write the raw evidenceVerdict, untouched",
  /onClick={\(\) => patch\(check\.id, \{ evidenceVerdict: on \? null : v\.key \}\)}/.test(reviewDetail)
);

/* ---- 11 · scoping — the RLS test's real equivalent in this architecture */

{
  useStore.setState({
    entity: "FAOR",
    visit: "2026-11",
    auditor: "Test Auditor",
    evidenceItems: [],
  });
  const faorId = useStore.getState().addEvidenceItem("FAOR doc");
  useStore.setState({ entity: "CPT", visit: "2026-11" });
  const cptId = useStore.getState().addEvidenceItem("CPT doc");
  const faorOnly = useStore.getState().evidenceItems.filter((e) => e.entity === "FAOR");
  const cptOnly = useStore.getState().evidenceItems.filter((e) => e.entity === "CPT");
  check(
    "an item created at one entity is scoped to it and does not leak into another entity's list",
    faorOnly.some((e) => e.id === faorId) &&
      !faorOnly.some((e) => e.id === cptId) &&
      cptOnly.some((e) => e.id === cptId) &&
      !cptOnly.some((e) => e.id === faorId)
  );
}

/* ---- 12 · AI task plumbing — evidenceAnalysis/evidenceSummary ----------- */

check(
  "assistPrompts.ts's Task union carries both new tasks",
  /\| "evidenceAnalysis"/.test(assistPrompts) && /\| "evidenceSummary"/.test(assistPrompts)
);
check(
  "both tasks have their own TASK_PROMPT entry, following the JSON-task convention the existing hazard/caption tasks use",
  /evidenceAnalysis:\s*`/.test(assistPrompts) && /evidenceSummary:\s*"/.test(assistPrompts)
);
check(
  "evidenceAnalysis's prompt is built from B170_SCALES, like 'rating' — not a restated scale",
  /evidenceAnalysis:[\s\S]{0,600}\$\{B170_SCALES\}/.test(assistPrompts)
);
check(
  "evidenceAnalysis is in JUDGEMENT (it is an opinion on severity/likelihood), evidenceSummary is not",
  /JUDGEMENT: Task\[\] = \[[\s\S]{0,200}"evidenceAnalysis",?\s*\];/.test(assistPrompts) &&
    !new RegExp('JUDGEMENT: Task\\[\\] = \\[[\\s\\S]{0,250}"evidenceSummary"').test(assistPrompts)
);
check(
  "assist.ts's AssistTask union and the new parser exist, following parseRootCauses' own 'caller supplies the allowed list' convention",
  /\| "evidenceAnalysis"/.test(assistLib) &&
    /\| "evidenceSummary"/.test(assistLib) &&
    /export function parseEvidenceAnalysis\(/.test(assistLib)
);

/* Run the real parser rather than only reading it — a JSON-shape bug here is
   exactly the kind of thing a regex match on the source would miss. */
const A = await import("../src/lib/assist.ts");
{
  const raw = '{"findingText":"Register not signed for March.","severity":"B","likelihood":"3","reason":"Two of twelve entries unsigned."}';
  const parsed = A.parseEvidenceAnalysis(raw, ["A", "B", "C", "D", "E"], ["1", "2", "3", "4", "5"]);
  check(
    "a well-formed evidenceAnalysis reply parses with the right fields",
    parsed?.findingText === "Register not signed for March." &&
      parsed?.severity === "B" &&
      parsed?.likelihood === "3" &&
      parsed?.reason === "Two of twelve entries unsigned."
  );
  const bad = A.parseEvidenceAnalysis(
    '{"findingText":"x","severity":"Z","likelihood":"9","reason":"y"}',
    ["A", "B", "C", "D", "E"],
    ["1", "2", "3", "4", "5"]
  );
  check(
    "a severity/likelihood outside the allowed list is dropped, not passed through",
    bad?.severity === "" && bad?.likelihood === ""
  );
  const prose = A.parseEvidenceAnalysis("Sure, here is my analysis of the document.", ["A"], ["1"]);
  check("a reply with no JSON at all fails to parse rather than being guessed at", prose === null);
}

/* ---- 13 · share list with discipline — reuses the existing export pattern */

check(
  "shareListText is a sibling to logText, not a mode flag added onto TK-003's own composer",
  /export function shareListText\(/.test(read("src", "lib", "evidence.ts")) &&
    /export function logText\(/.test(read("src", "lib", "evidence.ts"))
);
{
  const items = [
    mkEvidence({ id: "a", discipline: "Electrical", title: "Register" }),
    mkEvidence({ id: "b", discipline: "Mechanical", title: "Other" }),
  ];
  const text = E.shareListText(items, "Electrical", (e) => e.discipline, {
    siteName: "Test Airport",
    visitId: "2026-11",
  });
  check(
    "shareListText only includes the picked discipline's items",
    text.includes("Register") && !text.includes("Other")
  );
  check("shareListText carries a blank Provided? column for the airport to tick", text.includes("Provided?"));
}
check(
  "the view's own Share button is disabled with no discipline picked, since the export is per-discipline",
  /disabled={disciplineFilter === "all"}[\s\S]{0,200}onClick={shareDiscipline}/.test(view)
);

/* ---- 14 · sortWithinDiscipline — asset system order, General last ------ */

{
  const items = [
    mkEvidence({ id: "general", system: undefined }),
    mkEvidence({ id: "z-system", system: "Z System" }),
    mkEvidence({ id: "a-system", system: "A System" }),
  ];
  const sorted = E.sortWithinDiscipline(items).map((e) => e.id);
  check(
    "sorted by asset system name, General (no system) last",
    sorted[0] === "a-system" && sorted[1] === "z-system" && sorted[2] === "general"
  );
}

/* ---- 15 · nothing new reaches a capture surface ------------------------- */

const CAPTURE_SURFACES = [
  ["src", "app", "(app)", "capture", "page.tsx"],
  ["src", "app", "(app)", "field", "page.tsx"],
  ["src", "app", "(app)", "raise"],
  ["src", "app", "(app)", "workspace", "page.tsx"],
];
function readAllTsx(dir) {
  const full = path.join(here, "..", ...dir);
  if (!fs.existsSync(full)) return "";
  const stat = fs.statSync(full);
  if (stat.isFile()) return fs.readFileSync(full, "utf8");
  let out = "";
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.isDirectory()) out += readAllTsx([...dir, entry.name]);
    else if (/\.tsx?$/.test(entry.name)) out += fs.readFileSync(path.join(full, entry.name), "utf8");
  }
  return out;
}
for (const surface of CAPTURE_SURFACES) {
  const src = readAllTsx(surface);
  check(
    `${surface[surface.length - 1]} carries none of the new Evidence-review components or fields`,
    !src.includes("EvidenceReviewView") &&
      !src.includes("EvidenceReviewPanel") &&
      !src.includes("complianceRating") &&
      !src.includes("insufficientAt")
  );
}
check(
  "the Audit Checks tab's own captured-progress wording is untouched by this pass — no X of Y readout was edited",
  !/needsDesk|usePortfolio|useAuditProgress/.test(view) && !/needsDesk|usePortfolio|useAuditProgress/.test(panel)
);

console.log(failures === 0 ? "\nEVIDENCE REVIEW OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
