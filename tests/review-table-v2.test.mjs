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
  /import \{ ALL_DISCIPLINES, systemsAt, systemsOf \} from "@\/lib\/register"/.test(table)
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

for (const col of ["Type", "Discipline", "Asset system", "Audit check", "Severity", "Likelihood", "Rating", "Root cause", "Impact", "Evidence"]) {
  check(`the table always renders a "${col}" column header`, new RegExp(`<Th>${col}</Th>|>${col}<`).test(table));
}
check(
  "the column-toggle UI is gone — this is one fixed table, not a customisable one",
  !/DEFAULT_COLUMNS/.test(table) && !/toggleColumn/.test(table)
);
check(
  "a checkless finding's Audit check cell reads General, not a blank or a broken id",
  /\{f\.checkId \? \([\s\S]{0,80}portalIdFor\(entityCode, f\.checkId\)[\s\S]{0,300}General/.test(table)
);
check(
  "a finding with no asset system reads General, muted — same convention as Audit check",
  /\{f\.system \? \([\s\S]{0,40}f\.system[\s\S]{0,40}\) : \([\s\S]{0,60}className="italic"[\s\S]{0,60}General/.test(
    table
  )
);
check(
  "the Evidence column reads attachments directly — photo and voice counts, nothing else",
  /f\.attachments\.filter\(\(a\) => a\.kind === "photo"\)\.length/.test(table) &&
    /f\.attachments\.filter\(\(a\) => a\.kind === "voice"\)\.length/.test(table)
);
check(
  "the Rating cell is still read-only — no input bound to it, same guard as before",
  (() => {
    const cellMatch = table.match(/READ-ONLY[\s\S]{0,500}?<\/td>/);
    if (!cellMatch) return false;
    const cell = cellMatch[0];
    return /Pill/.test(cell) && !/<select/.test(cell) && !/<input/.test(cell);
  })()
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
check(
  "the new By-discipline view defaults off — the screen still opens on By document",
  /useState<"document" \| "discipline">\("document"\)/.test(evidencePage)
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

console.log(failures === 0 ? "\nREVIEW TABLE V2 OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
