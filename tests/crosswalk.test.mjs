import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The 2025 → current asset-system crosswalk. Validated against the real data
 *  files, and source-read for the wiring, like the other offline suites. */
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "src");
const json = (...p) => JSON.parse(fs.readFileSync(path.join(root, ...p), "utf8"));
const src = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
};

const cw = json("data", "assetSystemCrosswalk.json");
const checks = json("data", "checks.json");
const prior = json("data", "priorFindings.json");
const registerSystems = new Set(checks.map((c) => `${c.discipline}|${c.system}`));
const find = (rec) => cw.find((e) => e.recorded === rec);

check("split: taxiway maps to both current systems",
  JSON.stringify(find("Taxiways, Taxi-lanes & Service Road Surfaces")?.current) ===
  JSON.stringify(["Taxiways & Taxilanes", "Airside Service Roads & Perimeter"]));
check("split type recorded", find("Taxiways, Taxi-lanes & Service Road Surfaces")?.type === "split");
check("merge/to-confirm: Service Road Markings -> Markings", find("Service Road Markings")?.current[0] === "Markings" && find("Service Road Markings")?.type === "to-confirm");
check("2025-only: both landside entries map to nothing",
  ["Landside Roads & Markings", "Landside Road Surfaces"].every((n) => find(n)?.type === "2025-only" && find(n).current.length === 0));
check("every mapped current system exists on the register",
  cw.every((e) => e.current.every((s) => registerSystems.has(`${e.discipline}|${s}`))),
  JSON.stringify(cw.flatMap((e) => e.current.filter((s) => !registerSystems.has(`${e.discipline}|${s}`)))));
check("every unallocated Civil prior finding has a crosswalk entry",
  prior.filter((p) => !p.assetSystem && p.discipline === "Civil")
       .every((p) => cw.some((e) => e.discipline === p.discipline && e.recorded === p.assetSystemRecorded)));
check("entries never rewrite the 2025 wording: every recorded name exists in the 2025 data",
  cw.every((e) => prior.some((p) => p.assetSystemRecorded === e.recorded)));

const lib = src("lib", "crosswalk.ts");
check("exact match short-circuits on a register assetSystem", /if \(p\.assetSystem\) return \{ systems: \[p\.assetSystem\], type: "exact"/.test(lib));
check("unmapped name is returned, not dropped", /type: "unmapped"/.test(lib));
const dash = src("app", "(app)", "dashboard", "page.tsx");
const closure = src("app", "(app)", "closure", "page.tsx");
const exp = src("lib", "exports.ts");
check("dashboard compares through the crosswalk", dash.includes("mappingFor(p)") && dash.includes("worstRating"));
check("closure compares through the crosswalk", closure.includes("ratingOfItem") && closure.includes("checksOfItem"));
check("closure export covers via the crosswalk and adds two columns at the far right",
  exp.includes("map.systems.includes(c.system)") && exp.includes('"Mapping type"'));
check("persist key untouched", src("lib", "store.ts").includes("acsa-assurance-v1"));

process.exit(failures ? 1 : 0);
