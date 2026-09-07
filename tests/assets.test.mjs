/* The asset register, while it is still a stand-in.
 *
 *  A finding says something is wrong; the asset says what it is wrong WITH.
 *  ACSA has not supplied the register, so this one is invented — built so the
 *  linking, the screens and the export are ready and tested for the day the
 *  real one arrives.
 *
 *  That is a reasonable thing to do and a dangerous thing to do carelessly, and
 *  most of this suite is about the second half: an invented asset tag filed
 *  against a real finding, in a system ACSA reads, is worse than no tag at all.
 *  Three guards, deliberately redundant, and this checks all three:
 *
 *    the TAG says SAMPLE-      · so it is obvious wherever it appears
 *    meta.source says sample   · so the screens can shout about it
 *    the SYNC drops them       · so they never reach the portal
 *
 *  The third is asserted in sharepoint.test.mjs, next to the code that does it. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const reg = JSON.parse(src("data", "assets.sample.json"));
const lib = src("lib", "assets.ts");
const picker = src("components", "AssetPicker.tsx");
const types = src("lib", "types.ts");
const exportsSrc = src("lib", "exports.ts");
const checks = JSON.parse(src("data", "checks.json"));
const sites = JSON.parse(src("data", "source", "sites_RevA2.json")).sites;

/* --------------------------- it says what it is --------------------------- */

check(
  "the register declares itself a stand-in",
  reg.meta.source === "sample" && /NOT ACSA DATA/.test(reg.meta.title),
  reg.meta.title
);

check(
  "EVERY tag carries SAMPLE-, not just the file header",
  reg.assets.every((a) => a.assetId.startsWith("SAMPLE-")),
  "a tag pasted into an email or a screenshot has to say so on its own"
);

check(
  "and no tag could be mistaken for a portal id",
  !reg.assets.some((a) => /^[A-Z]+-[A-Z]{3}-P\d+$/.test(a.assetId)),
  "KSIA-ELE-P01 is a FINDING in the portal; an asset must not look like one"
);

check(
  "it says how to replace it",
  /assets\.sample\.json/.test(lib) && typeof reg.meta.replaceWith === "string" &&
    /meta\.source to "acsa"/.test(reg.meta.replaceWith),
  "the day it arrives this should be a file swap, not a code change"
);

/* --------------------- it is coherent with the register ------------------- */

const DISCIPLINES = new Set(checks.map((c) => c.discipline));
const SYSTEMS = new Set(checks.map((c) => c.system));
const ENTITIES = new Set(sites.map((s) => s.entityCode));

check(
  "every asset sits at a real site",
  reg.assets.every((a) => ENTITIES.has(a.entityCode)),
  "a picker scoped by entity would silently show nothing for a bad code"
);

check(
  "every discipline is one the register actually audits",
  reg.assets.every((a) => DISCIPLINES.has(a.discipline)),
  [...new Set(reg.assets.map((a) => a.discipline))].filter((d) => !DISCIPLINES.has(d)).join(", ")
);

check(
  "and every asset system is too",
  reg.assets.every((a) => SYSTEMS.has(a.system)),
  "the picker scopes by system; an invented one would never be reachable"
);

check(
  "all ten sites have assets, so no site opens an empty picker",
  new Set(reg.assets.map((a) => a.entityCode)).size === sites.length,
  String(new Set(reg.assets.map((a) => a.entityCode)).size)
);

check(
  "tags are unique — they are the join key",
  new Set(reg.assets.map((a) => a.assetId)).size === reg.assets.length,
  `${reg.assets.length} assets, ${new Set(reg.assets.map((a) => a.assetId)).size} distinct tags`
);

/* ------------------------------- the loader ------------------------------- */

check(
  "the register is fetched on first use, not shipped in the initial bundle",
  /inflight \?\?= import\("@\/data\/assets\.sample\.json"\)/.test(lib),
  "460 kB the tablet on the apron should not pay for until it asks"
);

check(
  "isSample() answers TRUE before the file has loaded",
  /return cache\?\.meta\.source !== "acsa";/.test(lib),
  '"we do not know yet" and "it is sample data" must fail the same way'
);

check(
  "the picker is scoped to the entity, always",
  /a\.entityCode === where\.entityCode &&/.test(lib),
  "a King Shaka finding must not be able to link a Cape Town chiller"
);

check(
  "searching drops the discipline and system scope",
  /const scoped = q\.trim\(\)\.length > 0 \? \{\} : \{ discipline, system \}/.test(picker),
  "searching means the auditor has decided the scope is wrong"
);

check(
  "a linked id whose row has gone is still shown, as itself",
  /name: "not in the register"/.test(lib),
  "dropping it makes a finding look unlinked when somebody linked it"
);

check(
  "the picker says how many rows it is NOT showing",
  /Showing \{rows\.length\} of \{total\}/.test(picker),
  "40 of 1,506 with no total sends somebody looking for an asset on a list they cannot see"
);

/* ------------------------------ the linking ------------------------------- */

check(
  "a finding and a hazard can both carry asset links",
  (types.match(/assetIds\?: string\[\];/g) || []).length === 2
);

check(
  "and they are OPTIONAL on both",
  !/assetIds: string\[\];/.test(types),
  "a missing register, an appointment nobody made — plenty of findings are about no asset at all"
);

check(
  "the picker warns while the register is a stand-in",
  /Stand-in register\./.test(picker) && /SAMPLE-/.test(picker)
);

check(
  "the workbook carries the links",
  /\{ header: "Assets", width: 34, wrap: true \}/.test(exportsSrc) &&
    /assetCell\(f\.assetIds\)/.test(exportsSrc) &&
    /assetCell\(h\.assetIds\)/.test(exportsSrc),
  "captured and then not in the deliverable is the same as not captured"
);

check(
  "as TAGS, not names copied out of a file that will be replaced",
  /return \(ids \?\? \[\]\)\.join\(", "\);/.test(exportsSrc),
  "a name copied into the workbook goes stale the day the register is swapped"
);

check(
  "asset links needed NO migration of their own — absent already means none",
  !/assetIds/.test(src("lib", "store.ts").split("migrate:")[1] ?? "") &&
    /name: "acsa-assurance-v1"/.test(src("lib", "store.ts")),
  "a migration that sets undefined to undefined is ceremony"
);

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nASSETS OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
