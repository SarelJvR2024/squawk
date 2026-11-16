import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* REVIEW TABLE V2 — Sarel's three follow-ups on the approved mockup, on top
 * of the Review risk-fields addendum (see
 * docs/capture-review/review-table-v2-discovery.md). Same bespoke
 * `node`-test-with-regex-on-source-text convention
 * tests/review-risk-fields.test.mjs already established for this screen;
 * this file is additive to that one rather than duplicating its 35
 * assertions.
 *
 * Needs the alias loader: reviewRisk.ts imports risk.ts/riskVocab.ts by
 * relative, extensionless specifiers. evidence.ts does not strictly need it
 * (its only runtime-relevant imports are type-only), but runs fine under it
 * too, so one run covers both. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

const R = await import("../src/lib/reviewRisk.ts");
const E = await import("../src/lib/evidence.ts");

const types = read("src", "lib", "types.ts");
const storeSrc = read("src", "lib", "store.ts");
const table = read("src", "components", "ReviewRiskTable.tsx");
const panel = read("src", "components", "ReviewRiskPanel.tsx");
const evidencePage = read("src", "app", "(app)", "evidence", "page.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const mkFinding = (overrides = {}) => ({
  id: "F-TEST1",
  checkId: null,
  entity: "FAOR",
  discipline: "Electrical",
  system: "LV Distribution",
  area: "",
  title: "Test finding",
  description: "",
  issueIndex: null,
  severity: null,
  likelihood: null,
  ratingConfirmed: false,
  rootCause: "",
  actions: [],
  progress: [],
  actionStatus: "Open",
  originVisit: "2026-11",
  priorRating: null,
  adHoc: true,
  attachments: [],
  suggestedEvent: "",
  createdAt: 0,
  createdBy: "",
  ...overrides,
});

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
  checkIds: [],
  attachments: [],
  signature: null,
  notes: "",
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

/* ---- 1 · the Type tag — absent-means-non-compliance, read through one function */

check(
  "an untouched finding reads as non-compliance by default",
  R.findingTypeFor(mkFinding()) === "non-compliance"
);
check(
  "an explicit observation reads as observation",
  R.findingTypeFor(mkFinding({ findingType: "observation" })) === "observation"
);
check(
  "an explicit non-compliance reads as non-compliance",
  R.findingTypeFor(mkFinding({ findingType: "non-compliance" })) === "non-compliance"
);
check(
  "FINDING_TYPE_LABEL carries exactly the two tags, labelled for a reader",
  R.FINDING_TYPE_LABEL["non-compliance"] === "Non-compliance" &&
    R.FINDING_TYPE_LABEL.observation === "Observation" &&
    Object.keys(R.FINDING_TYPE_LABEL).length === 2
);
check(
  "neither issueIndex nor adHoc is read as the Type tag — findingTypeFor only reads findingType",
  /return f\.findingType \?\? "non-compliance"/.test(read("src", "lib", "reviewRisk.ts"))
);

/* ---- 2 · Discipline / Asset system filters — same filter matcher, no second list */

check(
  "a discipline filter matches exactly that discipline",
  R.matchesReviewRiskFilter(mkFinding({ discipline: "Mechanical" }), { kind: "discipline", discipline: "Mechanical" })
);
check(
  "a discipline filter excludes every other discipline",
  !R.matchesReviewRiskFilter(mkFinding({ discipline: "Electrical" }), { kind: "discipline", discipline: "Mechanical" })
);
check(
  "a system filter matches exactly that asset system",
  R.matchesReviewRiskFilter(mkFinding({ system: "Fire Detection" }), { kind: "system", system: "Fire Detection" })
);
check(
  "a system filter excludes every other system",
  !R.matchesReviewRiskFilter(mkFinding({ system: "LV Distribution" }), { kind: "system", system: "Fire Detection" })
);
check(
  "the table reuses ALL_DISCIPLINES/systemsOf/systemsAt from the register, not a second vocabulary",
  /import \{ ALL_DISCIPLINES, checksAt, systemsAt, systemsOf \} from "@\/lib\/register"/.test(table)
);
check(
  "the table renders a Discipline filter and an Asset system filter, aria-labelled",
  /Filter by discipline/.test(table) && /Filter by asset system/.test(table)
);
check(
  "the asset system filter narrows by the active discipline filter, via systemsOf — not a static list",
  /filter\.kind === "discipline" \? systemsOf\(entityCode, filter\.discipline\) : systemsAt\(entityCode\)/.test(table)
);

/* ---- 3 · the wide table's fixed column set — no toggle any more */

/* "Asset system" dropped from the column-header set — Sarel: "put asset
   system below the discipline in the same column" — it is no longer its
   own header, just a second line inside the Discipline cell (checked
   separately below). */
for (const col of ["Type", "Discipline", "Audit check", "Root cause", "Impact", "Timeline", "Evidence"]) {
  check(`the table always renders a "${col}" column header`, new RegExp(`<Th>${col}</Th>|>${col}<`).test(table));
}
check(
  "Discipline and Asset system share one column — no separate Asset system header",
  !/<Th>Asset system<\/Th>/.test(table)
);
/* 16 Nov 2026 — Sarel: "we're not going to do severity and likelihood
   ratings on a finding level, for now... only on an asset system level."
   Severity, Likelihood and the derived Rating column are gone from this
   table — see ReviewRiskTable.tsx's own header. */
check(
  "Severity, Likelihood and Rating are gone — no column header, no cell left for any of them",
  !/<Th>Severity<\/Th>/.test(table) &&
    !/<Th>Likelihood<\/Th>/.test(table) &&
    !/<Th>Rating<\/Th>/.test(table) &&
    !/Severity for \$\{f\.title/.test(table) &&
    !/Likelihood for \$\{f\.title/.test(table)
);
check(
  "the column-toggle UI is gone — this is one fixed table, not a customisable one",
  !/DEFAULT_COLUMNS/.test(table) && !/toggleColumn/.test(table)
);
/* ---- reference codes removed from the UI (presentation only) ---------
 * See "Review pages: remove audit-check reference codes from the UI" —
 * the Audit check cell now shows the check's own readable requirement
 * text (via checksAt()), never a portalIdFor() reference code. f.checkId
 * itself is untouched as the lookup key/filter/grouping value. */
check(
  "a checkless finding's Audit check cell reads General, not a blank or a broken id",
  /\{f\.checkId \? \([\s\S]{0,300}\) : \([\s\S]{0,120}General/.test(table)
);
check(
  "a linked finding's Audit check cell shows its readable requirement text, resolved via checksAt — not a reference code",
  /checksById\.get\(f\.checkId\)\?\.requirement/.test(table) && /checksAt\(entityCode\)/.test(table)
);
check(
  "portalIdFor is not called anywhere in this file any more — the ref-code column dropped it",
  !/portalIdFor/.test(table)
);
/* PRIORITY 1 (review redesign) — the bottom "Risk & root cause summary"
 * roll-up (RollupTable + the two MultiCountCards) was removed outright,
 * with no replacement dashboard — see /review page.tsx and this file's own
 * PR description. rollupBy/countByMultiSelect themselves are untouched in
 * reviewRisk.ts (still directly tested by review-risk-fields.test.mjs);
 * only this table's own use of them is gone. */
check(
  "the bottom roll-up summary is gone — no RollupTable/MultiCountCard left wired into this file",
  !/RollupTable/.test(table) &&
    !/MultiCountCard/.test(table) &&
    !/Risk & root cause summary/.test(table) &&
    !/rollupAxis/.test(table)
);
check(
  "a finding with no asset system reads General, muted — same convention as Audit check",
  /\{f\.system \|\| <span className="italic"[\s\S]{0,40}>General<\/span>\}/.test(table)
);
check(
  "the Evidence column shows inline photo thumbnails, not only a count — Sarel: 'add the photos in the row so that the photos can be viewed inline'",
  /photoAttachments\.slice\(0, 4\)\.map/.test(table) &&
    /EvidenceThumb/.test(table) &&
    /f\.attachments\.filter\(\(a\) => a\.kind === "voice"\)\.length/.test(table)
);

/* ---- 4 · the Type tag's own panel toggle and table rendering ----------- */

check(
  "the table shows the Type tag read-only, via findingTypeFor — editing stays in the panel",
  /const type = findingTypeFor\(f\)/.test(table) && /FINDING_TYPE_LABEL\[type\]/.test(table)
);
check(
  "the panel's Type toggle patches findingType, through onChange like every other field here",
  /onClick={\(\) => onChange\(\{ findingType: t \}\)}/.test(panel)
);
check(
  "the panel's RiskPatch now carries findingType, so the toggle type-checks against a real field",
  /"rootCauseConfirmed"\s*\n\s*\| "findingType"/.test(panel)
);

/* ---- 5 · Evidence tracking stage — a narrower read, not a new EvidenceStage value */

check("nothing requested, received or refused reads as not started", E.trackingStage(mkEvidence()) === "notStarted");
check(
  "requested with nothing received reads as requested",
  E.trackingStage(mkEvidence({ requestedAt: 1 })) === "requested"
);
check(
  "received with no analysis reads as received, not analysis",
  E.trackingStage(mkEvidence({ requestedAt: 1, receivedAt: 2 })) === "received"
);
check(
  "received AND analysed reads as analysis",
  E.trackingStage(mkEvidence({ requestedAt: 1, receivedAt: 2, analysisAt: 3 })) === "analysis"
);
check(
  "returned outranks everything, even a prior analysis",
  E.trackingStage(mkEvidence({ requestedAt: 1, receivedAt: 2, analysisAt: 3, returnedAt: 4 })) === "returned"
);
check(
  "refused with nothing received reads as unavailable",
  E.trackingStage(mkEvidence({ unavailableAt: 1 })) === "unavailable"
);
check(
  "receiving outranks a stale unavailable declaration, same ordering evidenceStage already uses",
  E.trackingStage(mkEvidence({ unavailableAt: 1, receivedAt: 2 })) === "received"
);
check(
  "TRACKING_LABEL names all six stages for a reader",
  ["notStarted", "requested", "received", "analysis", "returned", "unavailable"].every(
    (s) => typeof E.TRACKING_LABEL[s] === "string" && E.TRACKING_LABEL[s].length > 0
  )
);
check(
  "Analysis is NOT folded into EvidenceStage/evidenceStage() — a separate, narrower function",
  /export function trackingStage/.test(read("src", "lib", "evidence.ts")) &&
    !/analysis/.test(read("src", "lib", "evidence.ts").match(/export type EvidenceStage[^;]*;/)?.[0] ?? "") &&
    !/"analysis"/.test(read("src", "lib", "types.ts").match(/export type EvidenceStage[^;]*;/)?.[0] ?? "")
);

/* ---- 6 · disciplineFor / groupByDiscipline — scoping at any level --------- */

const lookup = (m) => (id) => m[id];

check(
  "an item's own discipline wins over any check lookup",
  E.disciplineFor(mkEvidence({ discipline: "Civil", checkIds: ["X"] }), lookup({ X: "Electrical" })) === "Civil"
);
check(
  "with no discipline of its own, it falls back to its first check's discipline",
  E.disciplineFor(mkEvidence({ checkIds: ["X", "Y"] }), lookup({ X: "Mechanical", Y: "Civil" })) === "Mechanical"
);
check(
  "with nothing to go on, it reads Unassigned rather than dropping the item",
  E.disciplineFor(mkEvidence(), lookup({})) === "Unassigned"
);

const groups = E.groupByDiscipline(
  [
    mkEvidence({ id: "a", requestedAt: 1 }),
    mkEvidence({ id: "b", requestedAt: 1, receivedAt: 2 }),
    mkEvidence({ id: "c" }),
  ],
  (e) => (e.id === "c" ? "Mechanical" : "Electrical")
);
const elec = groups.find((g) => g.discipline === "Electrical");
const mech = groups.find((g) => g.discipline === "Mechanical");
check(
  "groupByDiscipline counts land in the right discipline's bucket",
  elec?.counts.requested === 1 && elec?.counts.received === 1 && elec?.items.length === 2
);
check(
  "a discipline with nothing outstanding still gets its own group, not folded away",
  mech?.counts.notStarted === 1 && mech?.items.length === 1
);
check(
  "groups come back sorted by discipline name",
  groups.map((g) => g.discipline).join(",") === "Electrical,Mechanical"
);

/* ---- 7 · the type, the migration, the store action --------------------- */

check(
  "EvidenceItem carries the new discipline/system/analysis fields",
  /discipline\?:\s*string;/.test(types) &&
    /system\?:\s*string;/.test(types) &&
    /analysisAt: number \| null;/.test(types) &&
    /analysisNote: string;/.test(types)
);
check(
  "Finding carries findingType, optional, the two-value tag",
  /findingType\?:\s*"non-compliance" \| "observation";/.test(types)
);
check(
  "the version bumped again, to at least 41",
  Number(/version:\s*(\d+),/.exec(storeSrc)?.[1] ?? 0) >= 41
);
check(
  "a v41 migration backfills analysisAt/analysisNote on every existing item",
  /from < 41[\s\S]{0,800}analysisAt: e\.analysisAt \?\? null[\s\S]{0,120}analysisNote: e\.analysisNote \?\? ""/.test(
    storeSrc
  )
);
check(
  "the v41 migration never drops an item or its existing fields",
  /from < 41[\s\S]{0,800}st\.evidenceItems = st\.evidenceItems\.map\(\(e\) => \(\{\s*\.\.\.e,/.test(storeSrc)
);
check(
  "addEvidenceItem seeds analysisAt/analysisNote on every new record",
  /addEvidenceItem: \(title, seed\)[\s\S]{0,1300}analysisAt: null[\s\S]{0,80}analysisNote: ""/.test(storeSrc)
);

/* ---- 8 · the evidence page's own request-creation UI, widened ---------- */

check(
  "the evidence page offers a Discipline and Asset system picker alongside check-points",
  /ALSO BEARS ON — A DISCIPLINE OR ASSET SYSTEM, OVERALL/.test(evidencePage)
);
check(
  "that picker reuses ALL_DISCIPLINES/systemsOf/systemsAt too — one vocabulary, two screens",
  /ALL_DISCIPLINES/.test(evidencePage) && /systemsOf\(entityCode, e\.discipline\)/.test(evidencePage) && /systemsAt\(entityCode\)/.test(evidencePage)
);
check(
  "the page has a new ANALYSIS field, gated on receivedAt like CANNOT BE PRODUCED is gated on its absence",
  /label="ANALYSIS"/.test(evidencePage) && /e\.receivedAt \? \(/.test(evidencePage)
);
check(
  "the page still has no path to a response, a status or a finding — custody, never compliance",
  !/setResponse|patchResponse|setCompliance|addFinding/.test(evidencePage)
);
/* PRIORITY 5 (review redesign) — "By discipline" is now the default,
 * confirmed with the user. "By document" (the old custody form) is
 * untouched and still reachable as a tab — only the initial state
 * changed, not the screen itself. */
check(
  "the By-discipline view is now the default — confirmed with the user, not an accidental flip",
  /useState<"document" \| "discipline">\("discipline"\)/.test(evidencePage)
);
check(
  "By document itself is untouched -- still one of the two view options, still a real tab",
  /\["document", "By document"\]/.test(evidencePage) && /\["discipline", "By discipline"\]/.test(evidencePage)
);

/* ---- 9 · the panel reuses the real request-creation logic, not a copy -- */

check(
  "the panel's evidence requests call the SAME store action /evidence's own \"Log it\" button calls",
  /addEvidenceItem\(`Evidence for/.test(panel)
);
check(
  "and then hands off to the real page's own deep link, rather than building a second editor",
  /router\.push\(`\/evidence\?open=/.test(panel)
);
check(
  "the panel never writes to compliance/response/finding fields from the Evidence section either",
  !/setResponse|patchResponse|setCompliance/.test(panel)
);

/* ---- 10 · capture surfaces still show none of the review-only fields --- */

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
    `${surface[surface.length - 1]} carries none of findingType/the Risk components either`,
    !src.includes("findingType") && !src.includes("ReviewRiskPanel") && !src.includes("ReviewRiskTable")
  );
}

/* ---- 11 · PRIORITY 2 (review redesign) — sort, and counts that cannot
   drift from what is on screen ------------------------------------------- */

check(
  "visible is sorted by Discipline then Asset system, General (no system) last within its discipline",
  /localeCompare\(b\.discipline \|\| ""\)/.test(table) &&
    /\(a\.system \|\| GENERAL_SYSTEM_SORT_KEY\)\.localeCompare\(b\.system \|\| GENERAL_SYSTEM_SORT_KEY\)/.test(table) &&
    /GENERAL_SYSTEM_SORT_KEY = String\.fromCharCode\(0xffff\)/.test(table)
);
check(
  "every row rendered comes from `visible` with no slice/limit in between — scrolling reaches all of them, no silent pagination",
  /visible\.map\(\(f\) => \{/.test(table) && !/visible\.slice\(/.test(table)
);
/* The All/Priority I/II/III/Not rated/Root cause unconfirmed CHIP ROW is
   gone — Sarel: "remove these filters" (screenshot of exactly that row).
   The four dropdown filters (Discipline/Asset system/Impact area/Root
   cause category) stay; matchesReviewRiskFilter itself still supports
   every filter kind (checked directly below), there's simply no chip
   bound to priority/notRated/unconfirmed any more. */
check(
  "the status filter chip row (All/Priority/Not rated/Root cause unconfirmed) is gone",
  !/Priority \{p\} \(/.test(table) &&
    !/Not rated \(\{countNotRated/.test(table) &&
    !/Root cause unconfirmed \(\{findings\.filter/.test(table) &&
    !/function FilterChip/.test(table)
);
check(
  "the four dropdown filters (Discipline/Asset system/Impact area/Root cause category) still work",
  /Filter by discipline/.test(table) &&
    /Filter by asset system/.test(table) &&
    /Filter by impact area/.test(table) &&
    /Filter by root cause category/.test(table)
);
check(
  "the on-screen count line is computed from `visible`, the exact array the rows below render from — not findings.length, which would drift the moment a filter is active",
  /\{visible\.length\} finding/.test(table)
);
check(
  "every chip's own count and the sorted `visible` both go through the same matchesReviewRiskFilter — a chip's count always equals what clicking it would show",
  (() => {
    const findings = [
      mkFinding({ id: "A", discipline: "Electrical", system: "LV Distribution", severity: "A - Catastrophic", likelihood: "5 - Frequent" }),
      mkFinding({ id: "B", discipline: "Civil", system: "", severity: null, likelihood: null }),
      mkFinding({ id: "C", discipline: "Electrical", system: "AGL", severity: "E - Negligible", likelihood: "1 - Extremely Improbable" }),
    ];
    const priorityICount = findings.filter((f) => R.matchesReviewRiskFilter(f, { kind: "priority", priority: "I" })).length;
    const visibleUnderThatFilter = findings.filter((f) => R.matchesReviewRiskFilter(f, { kind: "priority", priority: "I" }));
    return priorityICount === 1 && visibleUnderThatFilter.length === priorityICount && visibleUnderThatFilter[0].id === "A";
  })()
);
check(
  "Discipline-major, Asset-system-minor sort, General last within a discipline — behavioral, against the real comparator shape",
  (() => {
    const findings = [
      mkFinding({ id: "1", discipline: "Electrical", system: "" }),
      mkFinding({ id: "2", discipline: "Civil", system: "Markings" }),
      mkFinding({ id: "3", discipline: "Electrical", system: "AGL" }),
    ];
    const sorted = [...findings].sort((a, b) => {
      const byDiscipline = (a.discipline || "").localeCompare(b.discipline || "");
      if (byDiscipline !== 0) return byDiscipline;
      return (a.system || "\uFFFF").localeCompare(b.system || "\uFFFF");
    });
    return sorted.map((f) => f.id).join(",") === "2,3,1";
  })()
);

/* ---- 12 · PRIORITY 2 (review redesign) — Root cause/Impact are now
   inline-editable in the table, not panel-only ---------------------------- */

check(
  "the Root cause cell is wrapped in the same stopPropagation guard severity/likelihood already use — opening its editor never selects the row",
  /Root cause categories for \$\{f\.title \|\| f\.id\}[\s\S]{0,20}onClick=\{\(e\) => e\.stopPropagation\(\)\}|onClick=\{\(e\) => e\.stopPropagation\(\)\}[\s\S]{0,200}Root cause categories for/.test(
    table
  )
);
check(
  "the Impact cell carries the same guard",
  /Impact areas for \$\{f\.title \|\| f\.id\}[\s\S]{0,20}onClick=\{\(e\) => e\.stopPropagation\(\)\}|onClick=\{\(e\) => e\.stopPropagation\(\)\}[\s\S]{0,200}Impact areas for/.test(
    table
  )
);
check(
  "both inline editors toggle through the SAME toggleMulti the panel already uses — one function, two surfaces",
  /rootCauseCategories: toggleMulti\(f\.rootCauseCategories, v\)/.test(table) &&
    /impactAreas: toggleMulti\(f\.impactAreas, v\)/.test(table) &&
    /toggleMulti,?$/m.test(table.match(/import \{[\s\S]{0,400}\} from "@\/lib\/reviewRisk"/)?.[0] ?? "")
);
check(
  "the inline editors read the same vocabulary as the panel and the bulk bar — ROOT_CAUSES/IMPACT_AREAS, not a third list",
  /options=\{ROOT_CAUSES\}/.test(table) && /options=\{IMPACT_AREAS\}/.test(table)
);
check(
  "the inline editor is a native <details> disclosure, not a hand-rolled popover needing its own outside-click/escape handling",
  /function MultiSelectCell/.test(table) && /<details/.test(table) && /<summary/.test(table)
);
check(
  "toggling a value inside the editor never closes it — the toggle handler is on a Chip inside the body, not on <summary>",
  (() => {
    const start = table.indexOf("function MultiSelectCell");
    const fn = start === -1 ? "" : table.slice(start, table.indexOf("\n}\n", start) + 2);
    const summary = fn.match(/<summary[\s\S]*?<\/summary>/)?.[0] ?? "";
    return fn.includes("onToggle(o)") && !summary.includes("onToggle");
  })()
);

/* ---- 13 · Timeline column — Sarel: "make sure that column is in the
   table, and that we can do inline editing of that field." Single-select
   (a plain <select>, not the multi-select popover Root cause/Impact use),
   since a finding is remedied on ONE of these, not several. ------------- */

const riskVocab = read("src", "lib", "riskVocab.ts");
check(
  "TIMELINES is exactly the three categories confirmed with Sarel, in order",
  /export const TIMELINES = \["Immediate", "Before next audit", "Long term"\];/.test(riskVocab)
);
check(
  "Finding.timeline is a single optional string — not a multi-select array like rootCauseCategories/impactAreas",
  /timeline\?:\s*string;/.test(types)
);
check(
  "the table imports TIMELINES from reviewRisk.ts, the one re-export point, not a second copy of the list",
  /TIMELINES,?$/m.test(table.match(/import \{[\s\S]{0,400}\} from "@\/lib\/reviewRisk"/)?.[0] ?? "")
);
check(
  "the Timeline cell is a plain <select>, aria-labelled, offering every TIMELINES option plus a blank",
  /aria-label=\{`Timeline for \$\{f\.title \|\| f\.id\}`\}/.test(table) &&
    /\{TIMELINES\.map\(\(t\) => \(/.test(table)
);
check(
  "the Timeline cell is wrapped in the same stopPropagation guard Severity/Likelihood/Root cause/Impact already use",
  /Timeline for \$\{f\.title \|\| f\.id\}[\s\S]{0,400}onClick=\{\(e\) => e\.stopPropagation\(\)\}|onClick=\{\(e\) => e\.stopPropagation\(\)\}[\s\S]{0,80}aria-label=\{`Timeline for/.test(
    table
  )
);
check(
  "picking a Timeline writes through onChange, the same per-row patch every other inline edit here uses",
  /onChange\(f\.id, \{ timeline: e\.target\.value \|\| undefined \}\)/.test(table)
);
check(
  "the version bumped again, to at least 43, for Finding.timeline",
  Number(/version:\s*(\d+),/.exec(storeSrc)?.[1] ?? 0) >= 43 && /from < 43/.test(storeSrc)
);

console.log(failures === 0 ? "\nREVIEW TABLE V2 OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
