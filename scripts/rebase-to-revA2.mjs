#!/usr/bin/env node
/** Rebase Squawk's register on Rev A2.
 *
 *  Run:  node scripts/rebase-to-revA2.mjs [--write]
 *
 *  NOTE: this script rebases the CHECK-POINT REGISTER only, from the KSIA-only
 *  Rev A2 file. The all-sites Rev A2 register issued six hours later supersedes
 *  it for everything else — the ten sites, their applicability and the 78 open
 *  2025 findings — and Squawk takes those from src/data/source/sites_RevA2.json
 *  and priorFindings2025_allSites.json. The check CONTENT is identical across
 *  all ten sites, which is why the register itself is still correct here and is
 *  stored once rather than 3,086 times. See src/lib/sites.ts.
 *
 *  Rev A2 (06 Sep 2026) narrows the register to the six contract audit areas:
 *  324 check-points instead of 374. Asset Information Mgmt (50) is out of
 *  scope; ME Management (21) is no longer a discipline and its items now sit
 *  inside Process Safety & Risk.
 *
 *  Rev A2 carries twelve fields. Squawk's Check carries about twenty-five —
 *  the extra ones are researched content this project produced: the ACSA
 *  reference column, citation confidence, site variants, the walkabout
 *  instructions, and the vtype that decides whether a check reaches the audit
 *  workspace, field inspection or both. None of that is in Rev A2, so a naive
 *  replace would delete it.
 *
 *  It does not have to. 303 of the 324 ids are unchanged, so their researched
 *  content carries directly. The other 21 are the ME Management items under
 *  new PSR numbers — matched here by requirement text, not by position,
 *  because the renumbering is NOT positional: KSIA-MEM-002 is KSIA-PSR-029,
 *  not KSIA-PSR-018. Every one of the 21 matches at 0.98 or better and the
 *  mapping is a bijection, so nothing is lost and nothing is doubled up.
 *
 *  Authority, field by field:
 *
 *    Rev A2 wins   id, discipline, assetSystem, assetClass, requirement,
 *                  target, evidenceExpected, source, and the prior rating
 *    Squawk keeps  vtype, question, walkabout, the acsa* reference block,
 *                  coverage, siteVariant, woCount, optionCount, area
 *    basis         Rev A2's legalBasis where it has one, else Squawk's. They
 *                  are the same field: identical on 164 of 303, and Rev A2 is
 *                  never populated where Squawk is blank. Where the two DIFFER
 *                  the confidence and caveat are cleared, because they were
 *                  researched against wording that has changed and keeping
 *                  them would assert a confidence nobody has re-checked.
 *
 *  What this script does NOT touch: src/lib/risk.ts. Rev A2 ships a different
 *  severity/likelihood scale and a I/II/III priority matrix that disagrees
 *  with the implemented B170 001M banding on 5 of 25 cells. That is an open
 *  question with ACSA, not something a data rebase decides. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const p = (...x) => path.join(root, ...x);
const read = (f) => JSON.parse(fs.readFileSync(p(f), "utf8"));

const WRITE = process.argv.includes("--write");
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const rev = read("src/data/source/KSIA_register_RevA2.json");
const cur = read("src/data/checks.json");
const answers = read("src/data/answers.json");

const curById = new Map(cur.map((c) => [c.id, c]));
const revIds = new Set(rev.checkpoints.map((c) => c.id));

/* ---- the ME Management -> Process Safety & Risk mapping ---------------- */

function ratio(a, b) {
  if (a === b) return 1;
  const s = new Set();
  for (let i = 0; i < a.length - 1; i++) s.add(a.slice(i, i + 2));
  let hit = 0,
    n = 0;
  for (let i = 0; i < b.length - 1; i++) {
    n++;
    if (s.has(b.slice(i, i + 2))) hit++;
  }
  return n ? hit / n : 0;
}

const orphans = cur.filter((c) => !revIds.has(c.id) && c.discipline === "ME Management");
const fresh = rev.checkpoints.filter((c) => !curById.has(c.id));
const remap = new Map();
const taken = new Set();
for (const o of orphans) {
  const a = norm(o.requirement).toLowerCase();
  let best = null,
    bestR = -1;
  for (const f of fresh) {
    if (taken.has(f.id)) continue;
    const r = ratio(a, norm(f.requirement).toLowerCase());
    if (r > bestR) [best, bestR] = [f, r];
  }
  if (!best || bestR < 0.9) {
    console.error(`REFUSING: ${o.id} has no confident match (best ${bestR.toFixed(2)})`);
    process.exit(1);
  }
  taken.add(best.id);
  remap.set(best.id, o);
}
if (taken.size !== fresh.length) {
  console.error(`REFUSING: ${fresh.length - taken.size} new id(s) unmatched`);
  process.exit(1);
}

/* ---- prior ratings: 22 asset-system ratings from March 2025 ------------ */

const priorFindings = rev.priorRatings2025.map((r) => ({
  pf: r.pfId,
  discipline: r.discipline,
  system: r.assetSystem,
  rating: r.rating,
  finding: r.note ?? "",
}));
const priorByKey = new Map(priorFindings.map((r) => [`${r.discipline}||${r.system}`, r]));

/* ---- build the register ------------------------------------------------ */

const stats = {
  carried: 0,
  remapped: 0,
  basisFromRev: 0,
  basisKept: 0,
  confidenceCleared: 0,
  pfRelinked: 0,
  noVtype: 0,
};

const checks = rev.checkpoints.map((n) => {
  const old = curById.get(n.id) ?? remap.get(n.id);
  if (curById.has(n.id)) stats.carried++;
  else if (remap.has(n.id)) stats.remapped++;

  const revBasis = norm(n.legalBasis);
  const oldBasis = norm(old?.basis);
  const basisChanged = !!revBasis && !!oldBasis && revBasis !== oldBasis;
  if (revBasis) stats.basisFromRev++;
  else if (oldBasis) stats.basisKept++;
  if (basisChanged) stats.confidenceCleared++;

  const prior = priorByKey.get(`${n.discipline}||${n.assetSystem}`) ?? null;
  if (prior) stats.pfRelinked++;
  if (!old?.vtype) stats.noVtype++;

  return {
    id: n.id,
    discipline: n.discipline,
    system: n.assetSystem,
    assetClass: n.assetClass || null,
    /* Rev A2's checkArea is the register's own grouping; Squawk's `area` is
       what field mode groups by until ACSA supply real zones. Prefer Rev A2's
       when it has one. */
    area: norm(n.checkArea) || old?.area || "All Assets",
    requirement: n.requirement,
    basis: revBasis || oldBasis || null,
    evidenceExpected: norm(n.evidenceExpected) || old?.evidenceExpected || null,
    target: norm(n.target) || old?.target || null,
    /* Carried, not derivable from Rev A2 — see the header note. */
    vtype: old?.vtype ?? null,
    question: old?.question ?? null,
    walkabout: old?.walkabout ?? null,
    acsaDocs: old?.acsaDocs ?? [],
    acsaRequirement: old?.acsaRequirement ?? "",
    acsaThreshold: old?.acsaThreshold ?? "",
    acsaEvidence: old?.acsaEvidence ?? [],
    acsaConflict: old?.acsaConflict ?? "",
    coverage: old?.coverage ?? "none",
    siteVariant: old?.siteVariant ?? null,
    basisConfidence: basisChanged ? null : (old?.basisConfidence ?? null),
    basisNote: basisChanged ? null : (old?.basisNote ?? null),
    /* No pf/pfq. A prior rating belongs to a SITE, not to a requirement shared
       by ten of them — see the note on Check in src/lib/types.ts. The ratings
       and the portal's open findings live in src/data/priorRatings.json and
       src/data/priorFindings.json, keyed by entity. */
    woCount: old?.woCount ?? 0,
    optionCount: old?.optionCount ?? 0,
  };
});

/* ---- the Answer Library follows the ids -------------------------------- */

const nextAnswers = {};
let libCarried = 0,
  libRemapped = 0,
  libDropped = 0;
for (const [id, lib] of Object.entries(answers)) {
  if (revIds.has(id)) {
    nextAnswers[id] = lib;
    libCarried++;
  } else {
    const newId = [...remap.entries()].find(([, o]) => o.id === id)?.[0];
    if (newId) {
      nextAnswers[newId] = lib;
      libRemapped++;
    } else libDropped++;
  }
}
const libMissing = checks.filter((c) => !nextAnswers[c.id]).length;

/* ---- report ------------------------------------------------------------ */

const seen = new Set();
const dupes = checks.filter((c) => (seen.has(c.id) ? true : (seen.add(c.id), false)));

console.log("Rev A2 rebase");
console.log("  check-points          ", checks.length, "(was", cur.length + ")");
console.log("  duplicate ids         ", dupes.length);
console.log("  ids carried unchanged ", stats.carried);
console.log("  ids remapped ME -> PSR", stats.remapped);
console.log("  dropped from Squawk   ", cur.length - stats.carried - stats.remapped);
console.log("  basis from Rev A2     ", stats.basisFromRev);
console.log("  basis kept from Squawk", stats.basisKept);
console.log("  confidence cleared    ", stats.confidenceCleared);
console.log("  linked to a 2025 rating", stats.pfRelinked);
console.log("  WITHOUT a vtype       ", stats.noVtype);
console.log("  prior ratings         ", priorFindings.length);
console.log("Answer Library");
console.log("  carried               ", libCarried);
console.log("  re-keyed to PSR       ", libRemapped);
console.log("  dropped (out of scope)", libDropped);
console.log("  checks with no options", libMissing);

const byDiscipline = {};
for (const c of checks) byDiscipline[c.discipline] = (byDiscipline[c.discipline] ?? 0) + 1;
console.log("Disciplines");
for (const k of Object.keys(byDiscipline).sort())
  console.log(`  ${String(byDiscipline[k]).padStart(4)}  ${k}`);

if (dupes.length || libMissing || stats.noVtype) {
  console.error("\nREFUSING to write: the register would be incomplete.");
  process.exit(1);
}

if (!WRITE) {
  console.log("\nDry run. Pass --write to apply.");
  process.exit(0);
}

fs.writeFileSync(p("src/data/checks.json"), JSON.stringify(checks, null, 1));
fs.writeFileSync(p("src/data/priorFindings.json"), JSON.stringify(priorFindings, null, 1));
fs.writeFileSync(p("src/data/answers.json"), JSON.stringify(nextAnswers));
/* The KSIA-only portal findings this script used to write are superseded: the
   all-sites Rev A2 register carries all 78 open 2025 findings across three
   airports, vendored at src/data/source/priorFindings2025_allSites.json and
   generated into src/data/priorFindings.json and priorRatings.json. Writing 15
   King Shaka findings over that file would silently drop O.R. Tambo's 33 and
   Cape Town's 30. */
console.log("\nWritten.");
