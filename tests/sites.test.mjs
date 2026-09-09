import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Ten sites, one register.
 *
 *  Rev A2 covers 3,086 check-points, and the tempting reading is that it is ten
 *  registers. It is not. Every site uses the same 324-item register and the same
 *  check-point numbers — KSIA-ELE-005, ORTIA-ELE-005 and CO-ELE-005 are the same
 *  requirement at three sites, which is the point: results compare across the
 *  group. Where a check-point does not apply, its number is simply not used
 *  there. So Squawk holds the register ONCE and derives each site's ids and its
 *  applicable set.
 *
 *  That derivation is the thing this suite exists to defend, and Part 1 does it
 *  the way risk-matrix.test.mjs bands the matrix: by recomputing every site's
 *  count from the register and the applicability rules and comparing against
 *  the counts Rev A2 publishes — 324 / 319 / 200, and 3,086 in total. If any of
 *  those disagree, the shortcut is not equivalent to the all-sites file and the
 *  register must be stored per site after all.
 *
 *  Part 3 is the other half, and it is the one that bites quietly. Almost
 *  nothing about this register is the same at all ten sites: not the count, not
 *  the disciplines (Corporate Office has no Civil work at all), not the asset
 *  systems, not the prior findings, and not the ids. Every one of those was a
 *  module-level constant computed from the whole register, which is how the
 *  audit workspace at Corporate Office would have offered a Civil tab with
 *  nothing behind it and a progress ring that could never reach 100%. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = (...p) => fs.readFileSync(path.join(root, "src", ...p), "utf8");
const data = (...p) => JSON.parse(fs.readFileSync(path.join(root, "src", "data", ...p), "utf8"));

const checks = data("checks.json");
const priorFindings = data("priorFindings.json");
const priorRatings = data("priorRatings.json");
const programme = data("programme.json");
const reg = data("source", "sites_RevA2.json");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------- Part 1: the derivation reproduces the all-sites register ---- */

/* Deliberately re-implemented rather than imported, so this is a second opinion
   on src/lib/sites.ts and not the same opinion twice. */
const removedFor = (cls) =>
  checks.filter((c) =>
    (reg.applicability[cls]?.removed ?? []).some(
      (r) => r.discipline === c.discipline && (r.system === "*" || r.system === c.system)
    )
  ).length;
const countFor = (cls) => checks.length - removedFor(cls);

check("the register itself is the Rev A2 324", checks.length === 324, `got ${checks.length}`);

check(
  "an international airport takes the full register",
  countFor("international") === 324,
  `got ${countFor("international")}`
);

check(
  "a regional airport is 319 — passenger boarding bridges removed",
  countFor("regional") === 319 && removedFor("regional") === 5,
  `${countFor("regional")}, ${removedFor("regional")} removed`
);

check(
  "Corporate Office is 200 — no airfield",
  countFor("corporate") === 200 && removedFor("corporate") === 124,
  `${countFor("corporate")}, ${removedFor("corporate")} removed`
);

const perSite = reg.sites.map((s) => ({ ...s, derived: countFor(s.class) }));
const wrong = perSite.filter((s) => s.derived !== s.checks);
check(
  "every site's derived count matches the count Rev A2 publishes",
  wrong.length === 0,
  wrong.map((s) => `${s.siteCode} ${s.derived}!=${s.checks}`).join(", ")
);

check(
  "and they add up to the register's own 3,086",
  perSite.reduce((n, s) => n + s.derived, 0) === reg.meta.totalCheckpoints,
  `${perSite.reduce((n, s) => n + s.derived, 0)} vs ${reg.meta.totalCheckpoints}`
);

check(
  "ten sites, each mapped to an entity the programme knows",
  reg.sites.length === 10 &&
    reg.sites.every((s) => programme.entities.some((e) => e.code === s.entityCode)),
  ""
);

check(
  "every entity carries the portal's site code as its short name",
  programme.entities.every(
    (e) => e.short === reg.sites.find((s) => s.entityCode === e.code)?.siteCode
  ),
  "the short code is the prefix on every exported check-point id — GRJ instead of GRG puts the wrong id in the portal"
);

/* --------------------- Part 2: the 2025 findings, per site ---------------- */

const bySite = (c) => priorFindings.filter((p) => p.siteCode === c).length;
check(
  "78 open 2025 findings — King Shaka 15, O.R. Tambo 33, Cape Town 30",
  priorFindings.length === 78 && bySite("KSIA") === 15 && bySite("ORTIA") === 33 && bySite("CTIA") === 30,
  `${priorFindings.length}: KSIA ${bySite("KSIA")}, ORTIA ${bySite("ORTIA")}, CTIA ${bySite("CTIA")}`
);

check(
  "the other seven sites are baseline audits and carry none",
  priorFindings.every((p) => ["KSIA", "ORTIA", "CTIA"].includes(p.siteCode)),
  "a baseline site showing another airport's findings is the bug this file exists to prevent"
);

const ids = priorFindings.map((p) => p.portalId);
check(
  "every portalId is unique",
  new Set(ids).size === ids.length,
  "portalId is the sync key into ACSA's Findings list"
);

check(
  "every portalId is prefixed with its own site",
  priorFindings.every((p) => p.portalId.startsWith(`${p.siteCode}-`)),
  ""
);

/* The join that makes a finding reachable from a check. A typo in a discipline
   or an asset system would silently orphan a finding rather than error. */
const valid = new Map();
for (const c of checks) {
  if (!valid.has(c.discipline)) valid.set(c.discipline, new Set());
  valid.get(c.discipline).add(c.system);
}
const badJoin = priorFindings.filter(
  (p) => p.assetSystem && !valid.get(p.discipline)?.has(p.assetSystem)
);
check(
  "every mapped asset system exists in the register under its own discipline",
  badJoin.length === 0,
  badJoin.map((p) => `${p.portalId}: ${p.discipline}/${p.assetSystem}`).join(", ")
);

check(
  "the 19 that name a building rather than an asset system are kept, not dropped",
  priorFindings.filter((p) => p.assetSystem === null).length === 19,
  `${priorFindings.filter((p) => p.assetSystem === null).length} — the discipline lead allocates these in the field`
);

check(
  "every finding still carries the words the 2025 report used",
  priorFindings.every((p) => p.assetSystemRecorded && p.observation && p.reference),
  ""
);

check(
  "a derived rating says it is derived",
  priorRatings.filter((r) => r.siteCode !== "KSIA").every((r) => r.derived === true) &&
    priorRatings.filter((r) => r.siteCode === "KSIA").every((r) => r.derived === false),
  "King Shaka's 22 were published in March 2025; the other two sites' are computed from their findings and must not be shown as though ACSA signed them off"
);

check(
  "King Shaka keeps its PF-nn rating keys",
  priorRatings.filter((r) => r.siteCode === "KSIA").every((r) => /^PF-\d\d$/.test(r.key)),
  ""
);

/* --------- Part 3: nothing computed from the whole register reaches a screen */

const store = src("lib", "store.ts");
const register = src("lib", "register.ts");
const sites = src("lib", "sites.ts");

check(
  "the pure lookups live outside the client store",
  /export function checksAt/.test(register) && /export function priorFor/.test(register),
  "src/lib/exports.ts writes a workbook and must not import a zustand store to do it"
);

check(
  "the register is filtered through one place",
  /export function checksFor\(entityCode: string, all: Check\[\]\)/.test(sites) &&
    /checksFor\(entityCode, CHECKS\)/.test(register),
  ""
);

check(
  "the portal id is derived from the site, not read off the register row",
  /export function portalIdFor\(entityCode: string, checkId: string\)/.test(sites) &&
    /\$\{siteCodeFor\(entityCode\)\}-\$\{suffixOf\(checkId\)\}/.test(sites),
  "ORTIA-ELE-001 and KSIA-ELE-001 are one requirement at two airports"
);

check(
  "the prior rating takes the entity",
  /export function priorFor\(entityCode: string, discipline: string, system: string\)/.test(
    register
  ),
  ""
);

check(
  "the register row no longer carries a prior finding at all",
  !checks.some((c) => "pf" in c || "pfq" in c) && !/pf: string \| null;/.test(src("lib", "types.ts")),
  "pf and pfq were King Shaka's March 2025 numbers baked onto a register shared by ten sites"
);

check(
  "the whole-register discipline list is named as the exception it is",
  /export const ALL_DISCIPLINES/.test(register) &&
    /export function disciplinesAt\(entityCode: string\)/.test(register),
  ""
);

/* Every screen that lists, counts or filters check-points. If one of these
   reaches for the whole register, its numbers are for a site that does not
   exist. */
const screens = [
  ["home/page.tsx", src("app", "(app)", "home", "page.tsx")],
  ["capture/page.tsx", src("app", "(app)", "capture", "page.tsx")],
  ["field/page.tsx", src("app", "(app)", "field", "page.tsx")],
  ["review/page.tsx", src("app", "(app)", "review", "page.tsx")],
  ["findings/page.tsx", src("app", "(app)", "findings", "page.tsx")],
  ["closure/page.tsx", src("app", "(app)", "closure", "page.tsx")],
  ["dashboard/page.tsx", src("app", "(app)", "dashboard", "page.tsx")],
  ["AppShell.tsx", src("components", "AppShell.tsx")],
  ["ExportPanel.tsx", src("components", "ExportPanel.tsx")],
];

for (const [name, text] of screens) {
  check(
    `${name} counts against this site's checklist, not the register`,
    !/\bCHECKS\.(length|filter|map|find)\b/.test(text) &&
      !/\bDISCIPLINES\b/.test(text) &&
      !/\bAREAS\b/.test(text) &&
      !/\bPRIOR\b/.test(text),
    "324 is not the denominator at seven of the ten sites"
  );
}

check(
  "the portfolio reads across scopes through one named selector",
  /export function usePortfolio\(\): PortfolioRow\[\]/.test(store) &&
    /const byVisit = useStore\(\(s\) => s\.byVisit\);/.test(store) &&
    !/useStore\(\(s\) => s\.byVisit\)/.test(src("app", "(app)", "dashboard", "page.tsx")),
  "reading across entities is legitimate exactly once, and it is named"
);

check(
  "the portfolio table shows real captured counts rather than a live flag",
  /portfolio\.find\(\(r\) => r\.code === n\.code\)/.test(
    src("app", "(app)", "dashboard", "page.tsx")
  ),
  "`live` was a flag somebody had to remember to set"
);

/* --------------------- Part 4: the id that reaches ACSA ------------------- */

const exportsSrc = src("lib", "exports.ts");
check(
  "the exported check-point id is the site's id",
  /portalIdFor\(x\.entity, c\.id\)/.test(exportsSrc),
  "a Cape Town workbook carrying KSIA-ELE-001 cannot be synced back to anything"
);

check(
  "a finding's check reference is the site's id too",
  /f\.checkId \? portalIdFor\(x\.entity, f\.checkId\) : ""/.test(exportsSrc),
  ""
);

check(
  "the closure sheet keys on the portal's finding id",
  /const v = x\.verifications\[p\.portalId\];/.test(exportsSrc) && /p\.portalId,/.test(exportsSrc),
  ""
);

check(
  "an unallocated finding is not reported as a coverage failure",
  /Unallocated — discipline lead assigns in the field/.test(exportsSrc) &&
    /covering\.length === 0 && p\.assetSystem \? "NOT COVERED THIS VISIT" : ""/.test(exportsSrc),
  "nothing covers a Cargo Building finding by definition — that is not the audit failing to cover it"
);

const detail = src("components", "CheckDetail.tsx");
check(
  "the check screen shows the site's id",
  /const portalId = portalIdFor\(entityCode, check\.id\);/.test(detail) &&
    /<span>\{portalId\}<\/span>/.test(detail),
  "an auditor quotes what is on the screen into an ACSA report"
);

/* ---------------- Part 5: every site opens on a real audit ---------------- */

const withVisits = new Set(programme.visits.map((v) => v.entity));
check(
  "all ten sites have a Round 1 visit",
  withVisits.size === 10,
  `${withVisits.size} of 10`
);

const calendarOk = reg.sites.every((s) =>
  programme.visits.some((v) => v.entity === s.entityCode && v.id === s.audit.visit)
);
check(
  "each Round 1 visit is the month the register's calendar gives it",
  calendarOk,
  ""
);

check(
  "the sites with 2025 findings have the visit those findings were raised on",
  ["FALE", "FAOR", "FACT"].every((code) => {
    const raised = new Set(
      priorFindings.filter((p) => p.entityCode === code).map((p) => p.dateRaised.slice(0, 7))
    );
    return [...raised].every((v) =>
      programme.visits.some((x) => x.entity === code && x.id === v)
    );
  }),
  "a finding with no origin visit has nothing to be carried from"
);

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nSITES OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
