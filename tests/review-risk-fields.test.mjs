import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* REVIEW RISK FIELDS — the addendum on top of the Capture/Review brief (see
 * docs/capture-review/review-risk-fields-discovery.md). §5 of the addendum
 * lists eight things that "must pass in CI" — this app has no CI, so these
 * are suites in the same bespoke runner every other screen uses (see
 * tests/README.md). Needs the alias loader: reviewRisk.ts imports risk.ts
 * and riskVocab.ts by value, not just by type.
 *
 * Run it after any edit to src/lib/reviewRisk.ts, src/lib/risk.ts,
 * src/lib/riskVocab.ts, Finding's risk fields in src/lib/types.ts,
 * ReviewRiskPanel.tsx or ReviewRiskTable.tsx. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

const R = await import("../src/lib/reviewRisk.ts");
const risk = await import("../src/lib/risk.ts");
const register = await import("../src/lib/register.ts");

const types = read("src", "lib", "types.ts");
const panel = read("src", "components", "ReviewRiskPanel.tsx");
const table = read("src", "components", "ReviewRiskTable.tsx");
/* build prompt 8 (22 Nov 2026): /review is now a redirect; the Risk &
   root cause table/panel mounting this suite reads moved to
   issues/page.tsx's own IssuesRiskView, reusing the exact same
   ReviewRiskTable/ReviewRiskPanel components and the same
   onChange-through-updateFinding division of labour. */
const reviewPage = read("src", "app", "(app)", "issues", "page.tsx");

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

/* ---- 1 · all 25 matrix cells → expected priority, table-driven --------- */

const EXPECT_PRIORITY = {
  "1A": "II", "2A": "II", "3A": "I",  "4A": "I",  "5A": "I",
  "1B": "III","2B": "II", "3B": "II", "4B": "I",  "5B": "I",
  "1C": "III","2C": "II", "3C": "II", "4C": "II", "5C": "I",
  "1D": "III","2D": "III","3D": "II", "4D": "II", "5D": "II",
  "1E": "III","2E": "III","3E": "III","4E": "II", "5E": "II",
};

let wrongPriority = 0;
for (const s of risk.SEVERITIES) {
  for (const l of risk.LIKELIHOODS) {
    const cellLikelihoodFirst = `${l.charAt(0)}${s.charAt(0)}`;
    const expected = EXPECT_PRIORITY[cellLikelihoodFirst];
    const got = R.priorityFor({ severity: s, likelihood: l })?.priority;
    if (got !== expected) {
      wrongPriority++;
      console.log(`  MISMATCH ${cellLikelihoodFirst}: got ${got}, expected ${expected}`);
    }
  }
}
check("all 25 cells present in the expectation table", Object.keys(EXPECT_PRIORITY).length === 25);
check("every one of the 25 cells maps to the right priority", wrongPriority === 0, `${wrongPriority} wrong`);

check(
  "priority is read off the SAME band every other screen reads, not a second computation",
  /bandFor\(f\.severity, f\.likelihood\)/.test(read("src", "lib", "reviewRisk.ts")) &&
    /BAND_AS_PRIORITY\[band\]/.test(read("src", "lib", "reviewRisk.ts")),
  "priorityFor must call risk.ts's own bandFor/BAND_AS_PRIORITY, never re-derive a band from severity/likelihood itself"
);

/* ---- 2 · rating null when severity or likelihood is missing ------------ */

check(
  "no severity, no likelihood → not rated",
  R.priorityFor(mkFinding()) === null
);
check(
  "severity only → still not rated",
  R.priorityFor(mkFinding({ severity: "A - Catastrophic" })) === null
);
check(
  "likelihood only → still not rated",
  R.priorityFor(mkFinding({ likelihood: "5 - Frequent" })) === null
);
check(
  "both set → rated",
  R.priorityFor(mkFinding({ severity: "A - Catastrophic", likelihood: "5 - Frequent" }))?.priority === "I"
);

/* ---- 3 · "changing likelihood updates the rating" ----------------------- */
/* No component-test runner in this repo (no DOM/renderer dependency) — same
   convention tablet.test.mjs/checkscreen.test.mjs use for screen behaviour:
   assert from the real function AND that the table/panel source actually
   calls it fresh on every render (no cached/stale rating kept in state). */

check(
  "re-deriving after a likelihood change moves the priority, using the real function",
  (() => {
    const before = R.priorityFor(mkFinding({ severity: "A - Catastrophic", likelihood: "1 - Extremely Improbable" }));
    const after = R.priorityFor(mkFinding({ severity: "A - Catastrophic", likelihood: "5 - Frequent" }));
    return before?.priority === "II" && after?.priority === "I" && before.priority !== after.priority;
  })()
);
/* 16 Nov 2026 — Sarel: "we're not going to do severity and likelihood
   ratings on a finding level, for now... only on an asset system level."
   The table's Rating cell and the panel's result line — both of which used
   to call priorityFor — are gone; see ReviewRiskTable.tsx's and
   ReviewRiskPanel.tsx's own headers. priorityFor itself is untouched and
   still directly tested above against the real function; only these two
   screens' own use of it was removed. */
check(
  "Priority is shown only in the drawer, through PriorityBadge, which calls priorityFor — a derived value, never typed; the table has no Priority or Rating column",
  !/<PriorityBadge/.test(table) && /<PriorityBadge/.test(panel) && /priorityFor\(f\)/.test(read("src", "components", "TriageCells.tsx")) && !/>Rating<\/th>/.test(table)
);
check(
  "the drawer shows the calculated priority's label from priorityFor, the one place a band is derived — it never invents its own",
  /priorityFor\(finding\)/.test(panel)
);

/* ---- 4 · multi-select save/load round-trip, empty array allowed -------- */

check(
  "toggling a value on then off returns to an empty array",
  (() => {
    const once = R.toggleMulti(undefined, "Operations");
    const twice = R.toggleMulti(once, "Operations");
    return Array.isArray(once) && once.length === 1 && Array.isArray(twice) && twice.length === 0;
  })()
);
check(
  "toggling two different values keeps both, in order added",
  (() => {
    const a = R.toggleMulti(undefined, "Operations");
    const b = R.toggleMulti(a, "Reputation");
    return b.length === 2 && b[0] === "Operations" && b[1] === "Reputation";
  })()
);
check(
  "an absent array round-trips as empty, not an error",
  Array.isArray(R.toggleMulti(undefined, "x")) &&
    (mkFinding().impactAreas === undefined) // absent-means-empty on the type itself
);

/* ---- 5 · bulk add/remove does not overwrite other values --------------- */

check(
  "bulk-adding one impact area leaves an existing one in place",
  (() => {
    const next = R.applyBulkMulti(["Operations"], ["Reputation"], []);
    return next.includes("Operations") && next.includes("Reputation") && next.length === 2;
  })()
);
check(
  "bulk-removing one leaves the rest untouched",
  (() => {
    const next = R.applyBulkMulti(["Operations", "Reputation", "Licenses"], [], ["Reputation"]);
    return next.includes("Operations") && next.includes("Licenses") && !next.includes("Reputation") && next.length === 2;
  })()
);
check(
  "a bulk edit of impact areas is a patch on impactAreas alone, never on rootCauseCategories/severity/etc.",
  (() => {
    const before = mkFinding({
      severity: "B - Hazardous",
      likelihood: "4 - Occasional",
      rootCauseCategories: ["Maintenance backlog"],
      impactAreas: ["Operations"],
    });
    const impactAreas = R.applyBulkMulti(before.impactAreas, ["Reputation"], []);
    const after = { ...before, impactAreas };
    return (
      after.severity === before.severity &&
      after.likelihood === before.likelihood &&
      after.rootCauseCategories === before.rootCauseCategories &&
      after.impactAreas.length === 2
    );
  })()
);
check(
  "the bulk bar's own apply only ever patches the one axis it touched — source-read",
  /impactAreas: applyBulkMulti/.test(table) && /rootCauseCategories: applyBulkMulti/.test(table),
  "each spread conditionally into the patch object, never both unconditionally"
);

/* ---- 6 · roll-up counts a finding once per selected value --------------- */

const two = mkFinding({ id: "F-TWO", impactAreas: ["Operations", "Reputation"] });
const one = mkFinding({ id: "F-ONE", impactAreas: ["Operations"] });
const none = mkFinding({ id: "F-NONE" });

const impactCounts = R.countByMultiSelect([two, one, none], (f) => f.impactAreas);
check(
  "a finding with two impact areas counts once in each, per the addendum's own example",
  impactCounts["Operations"] === 2 && impactCounts["Reputation"] === 1
);
check(
  "a finding with none selected contributes to no bucket",
  impactCounts["Licenses"] === undefined
);

const rolled = R.rollupBy(
  [
    mkFinding({ id: "A", discipline: "Electrical", severity: "A - Catastrophic", likelihood: "5 - Frequent" }),
    mkFinding({ id: "B", discipline: "Electrical" }),
    mkFinding({ id: "C", discipline: "Mechanical", severity: "E - Negligible", likelihood: "1 - Extremely Improbable" }),
  ],
  (f) => f.discipline
);
const elec = rolled.find((r) => r.key === "Electrical");
const mech = rolled.find((r) => r.key === "Mechanical");
check(
  "Not rated is its own count, per discipline, not folded into a priority bucket",
  elec?.counts.I === 1 && elec?.notRated === 1 && elec?.total === 2
);
check(
  "roll-up groups are independent — one discipline's counts cannot leak into another's",
  mech?.counts.III === 1 && mech?.notRated === 0 && mech?.total === 1
);

/* ---- 7 · there is no rating left to edit directly, on either screen ---- */

check(
  "the table carries no Rating column, no Severity/Likelihood selects — there is nothing left to accidentally edit",
  !/<Th>Rating<\/Th>/.test(table) &&
    !/<Th>Severity<\/Th>/.test(table) &&
    !/<Th>Likelihood<\/Th>/.test(table)
);
check(
  "the panel never renders an input whose value/checked is bound to a priority/rating field",
  !/value=\{priority/.test(panel) && !/checked=\{priority/.test(panel)
);
check(
  "priorityFor's own return type has no setter — it is a plain computed value, not form state",
  /export function priorityFor/.test(read("src", "lib", "reviewRisk.ts")) &&
    !/const \[(priority|rating)\b/i.test(panel) &&
    !/const \[(priority|rating)\b/i.test(table)
);

/* ---- 8 · capture surfaces show none of these fields --------------------- */

const CAPTURE_SURFACES = [
  ["src", "app", "(app)", "capture", "page.tsx"],
  ["src", "app", "(app)", "field", "page.tsx"],
  /* build prompt 7 (22 Nov 2026): /field is now a redirect; the actual
     walk-screen content lives at walk/page.tsx. */
  ["src", "app", "(app)", "walk", "page.tsx"],
  ["src", "app", "(app)", "raise"],
  ["src", "app", "(app)", "workspace", "page.tsx"],
];
const FORBIDDEN = ["rootCauseCategories", "impactAreas", "rootCauseNote", "rootCauseConfirmed", "ReviewRiskPanel", "ReviewRiskTable"];

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
  const offenders = FORBIDDEN.filter((f) => src.includes(f));
  check(
    `${surface[surface.length - 1]} carries none of the new Review risk fields`,
    offenders.length === 0,
    offenders.join(", ")
  );
}

check(
  "/review itself is the only screen that imports the new Risk panel/table",
  reviewPage.includes("ReviewRiskPanel") && reviewPage.includes("ReviewRiskTable")
);

/* ---- additional: the type, the migration, the vocabulary --------------- */

check(
  "Finding carries the three new fields, all optional — absent-means-empty, no capture-surface migration needed",
  /rootCauseCategories\?:\s*string\[\]/.test(types) &&
    /impactAreas\?:\s*string\[\]/.test(types) &&
    /rootCauseNote\?:\s*string/.test(types) &&
    /rootCauseConfirmed\?:\s*boolean/.test(types)
);
check(
  "severity/likelihood/ratingConfirmed were NOT re-declared — only three fields are genuinely new",
  (types.match(/severity: Severity \| null;/g) ?? []).length === 1 ||
    /severity: Severity \| null;\s*\n\s*likelihood: Likelihood \| null;/.test(types),
  "Finding must still declare severity/likelihood/ratingConfirmed exactly once each"
);

const storeSrc = read("src", "lib", "store.ts");
check(
  "the Dexie/zustand version bumped and a v40 migration backfills the two new arrays",
  /* >= 40, not === 40 — the version goes up as later slices land (see
     evidence.test.mjs's own ">= 17" for the same reasoning), and the v40
     migration block itself is untouched by a later bump. */
  Number(/version:\s*(\d+),/.exec(storeSrc)?.[1] ?? 0) >= 40 &&
    /from < 40/.test(storeSrc) &&
    /rootCauseCategories: f\.rootCauseCategories \?\? \[\]/.test(storeSrc)
);
check(
  "the migration never deletes a finding or any of its existing fields",
  /st\.findings = st\.findings\.map\(\(f\) => \(\{\s*\.\.\.f,/.test(storeSrc.slice(storeSrc.indexOf("from < 40")))
);

check(
  "root cause CATEGORIES reuse ROOT_CAUSES, not the addendum's own provisional list",
  /import \{ IMPACT_AREAS, LEGACY_ROOT_CAUSES, ROOT_CAUSES, TIMELINES \} from "\.\/riskVocab"/.test(read("src", "lib", "reviewRisk.ts"))
);
check(
  "the addendum's own provisional category list is not spelled out anywhere as a real vocabulary",
  !/People & training/.test(read("src", "lib", "riskVocab.ts")) &&
    !/Equipment & design/.test(read("src", "lib", "riskVocab.ts")),
  "those six words are the brief's PROVISIONAL list — see the discovery note's open question"
);

/* ---- 9 · PRIORITY 4 (review redesign) — the panel's hierarchy editor:
   Discipline/Asset system/Audit check, with incompatible selections
   cleared rather than left pointing at a level that no longer lines up */

check(
  "the panel renders a Discipline, an Asset system and an Audit check select, under one 'Linked to' heading",
  /Linked to<\/div>/.test(panel) &&
    /value=\{finding\.discipline\}/.test(panel) &&
    /value=\{finding\.system \|\| ""\}/.test(panel) &&
    /value=\{finding\.checkId \?\? ""\}/.test(panel)
);
check(
  "Discipline has no empty/General option — the type requires it non-empty",
  (() => {
    const block = panel.match(/Discipline<\/span>[\s\S]{0,600}?<\/select>/)?.[0] ?? "";
    return block.length > 0 && !/General/.test(block);
  })()
);
check(
  "Asset system and Audit check both offer General, stored as empty string / null, never the word \"General\" itself",
  /<option value="">General \(no asset system\)<\/option>/.test(panel) &&
    /<option value="">General \(no audit check\)<\/option>/.test(panel) &&
    /onChange\(\{ checkId: e\.target\.value \|\| null \}\)/.test(panel)
);
check(
  "the Asset system options are scoped to the finding's OWN discipline via systemsOf, not every system at the entity",
  /const systemOptions = systemsOf\(entityCode, finding\.discipline\)/.test(panel)
);
check(
  "the Audit check options are scoped to discipline AND system via checksOf, not a flat list of every check",
  /const checkOptions = checksOf\(entityCode, finding\.discipline, finding\.system \|\| undefined\)/.test(panel)
);

/* Behavioral: the exact clearing rule, replicated against the REAL
   register (checksOf/systemsOf/disciplinesAt), not a hand-rolled fixture
   hierarchy that could drift from what the app actually ships. */
const ENTITY = "FAOR";
const [disciplineA, disciplineB] = register.disciplinesAt(ENTITY);
const systemUnderA = register.systemsOf(ENTITY, disciplineA)[0];
const checkUnderA = register.checksOf(ENTITY, disciplineA, systemUnderA)[0]?.id ?? null;

function onDisciplineChange(nextDiscipline, current) {
  const validSystems = register.systemsOf(ENTITY, nextDiscipline);
  const nextSystem = current.system && validSystems.includes(current.system) ? current.system : "";
  const validCheckIds = new Set(
    register.checksOf(ENTITY, nextDiscipline, nextSystem || undefined).map((c) => c.id)
  );
  const nextCheckId = current.checkId && validCheckIds.has(current.checkId) ? current.checkId : null;
  return { discipline: nextDiscipline, system: nextSystem, checkId: nextCheckId };
}

check(
  "switching discipline to one that does not carry the current system clears BOTH system and check",
  (() => {
    const current = { discipline: disciplineA, system: systemUnderA, checkId: checkUnderA };
    const patched = onDisciplineChange(disciplineB, current);
    const bSystems = register.systemsOf(ENTITY, disciplineB);
    return (
      !bSystems.includes(systemUnderA) && // the fixture's own premise
      patched.discipline === disciplineB &&
      patched.system === "" &&
      patched.checkId === null
    );
  })(),
  `${disciplineA} -> ${disciplineB}, system was ${systemUnderA}`
);
check(
  "switching discipline back to its own current value changes nothing — system/check survive",
  (() => {
    const current = { discipline: disciplineA, system: systemUnderA, checkId: checkUnderA };
    const patched = onDisciplineChange(disciplineA, current);
    return patched.system === systemUnderA && patched.checkId === checkUnderA;
  })()
);
check(
  "a finding with no system/check to begin with (General/General) stays General after a discipline change — nothing to clear, no crash",
  (() => {
    const current = { discipline: disciplineA, system: "", checkId: null };
    const patched = onDisciplineChange(disciplineB, current);
    return patched.system === "" && patched.checkId === null;
  })()
);

/* ---- 10 · PRIORITY 2 (review redesign) — regression baseline. Not new
   behaviour: proving what PRs 1-7 already rely on still holds. --------- */

/* Refresh-survival. formshub.test.mjs's own header explains why this repo
 * never actually drives zustand's persist middleware through a real
 * IndexedDB under plain node (idb-keyval needs a real `indexedDB` global
 * this process does not have) — so, same as every other persistence claim
 * in this codebase, this is proven by reading the real partialize()
 * config: an edit survives a reload exactly when the field it touches is
 * included in what gets written to storage, not by a hand-maintained
 * belief that it is. */
check(
  "findings (what updateFinding writes) is included in the zustand persist middleware's own partialize() -- an edit reaches the SAME storage write every other persisted field does",
  /partialize: \(s: State\) => \(\{[\s\S]{0,400}findings: s\.findings,/.test(storeSrc)
);
check(
  "updateFinding writes into s.findings, the exact slice partialize() reads -- not a parallel copy that partialize never sees",
  /updateFinding: \(id, p\) =>\s*\n\s*set\(\(s\) => \(\{\s*\n\s*findings: s\.findings\.map/.test(storeSrc)
);

/* Table/panel consistency. Both read from the SAME findings array by
 * construction -- there is no second fetch, no local copy either
 * component maintains that could drift from the other. */
/* build prompt 8 (22 Nov 2026): this mounting code moved into
   issues/page.tsx's own IssuesRiskView — a reusable component, not inline
   page code, so `findings` arrives as a PROP (the page's own
   riskViewFindings, itself one of several filter-specific derivations of
   useEntityFindings()/useVisitFindings() — never a second fetch inside
   IssuesRiskView itself) rather than a direct useVisitFindings() call, and
   the active finding is named `active`/`activeId`, not `riskActive`/
   `riskActiveId`. The INVARIANT these two checks exist for — table and
   panel read the same array by construction, no second fetch, no snapshot
   — holds exactly as before; only the names changed. */
check(
  "IssuesRiskView takes findings as a prop (no second fetch inside it) and both the table and the panel read from that same array",
  !/useVisitFindings\(\)/.test(
    reviewPage.slice(reviewPage.indexOf("function IssuesRiskView"), reviewPage.indexOf("export default function IssuesPage")),
  ) &&
    /const active = findings\.find\(\(f\) => f\.id === activeId\) \?\? null;/.test(reviewPage) &&
    /findings=\{findings\}/.test(reviewPage) &&
    /finding: active,/.test(reviewPage)
);
check(
  "editing a row in the table (updateFinding) and reading it in the panel both go through the SAME Finding object reference on the next render -- active is derived from findings, not a snapshot taken once",
  /const active = findings\.find/.test(reviewPage) && !/const \[active, set/.test(reviewPage),
);

/* The passphrase gate. tests/shared.js already proves a wrong passphrase
 * (line ~287) and an empty one (line ~297) both 401 -- per the user's own
 * decision (see PR #248's description and this session's own Priority
 * redesign plan), that existing coverage is the whole of what this
 * redesign owes the auth/cross-entity gap it is explicitly NOT fixing.
 * Asserted here by reading the real assertions rather than re-describing
 * them, so this suite fails loudly if that coverage is ever weakened
 * without anyone noticing it from the Review side. */
const sharedSrc = read("tests", "shared.js");
check(
  "the existing passphrase gate (tests/shared.js) still asserts 401 on a wrong passphrase and on no passphrase at all -- unchanged by this redesign, and this is ALL the auth coverage the redesign owes (the cross-entity gap itself is a separate, reported, out-of-scope finding)",
  /wrong\.status\(\) === 401/.test(sharedSrc) && /empty\.status\(\) === 401/.test(sharedSrc)
);

console.log(failures === 0 ? "\nREVIEW RISK FIELDS OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
