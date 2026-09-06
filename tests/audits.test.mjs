import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Reaching any audit, and starting the next one.
 *
 *  programme.json seeds six visits and every one of them is at King Shaka.
 *  The other nine entities had none — so the entity picker could reach
 *  O.R. Tambo and there was nowhere to put anything captured there, and the
 *  cycle strip rendered empty above a visit id belonging to another airport.
 *
 *  The strip has been clickable since the scope re-key, but it reads as a
 *  progress indicator, so it went unused. Both problems are the same problem:
 *  the programme was treated as fixed data when it is the thing the work is
 *  organised around. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");
const programme = JSON.parse(
  fs.readFileSync(path.join(here, "..", "src", "data", "programme.json"), "utf8")
);

const store = src("lib", "store.ts");
const panel = src("components", "AuditsPanel.tsx");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------------------------- Part 1: the gap this exists to close ----- */

/* This suite opened by asserting the gap it exists to close: ten entities in
   the programme file and seeded visits for exactly ONE of them, so nine sites
   depended entirely on an audit being created by hand in the app. Rev A2's
   all-sites register carries the Round 1 calendar, so every site now opens on
   a real audit and the assertion is the other way round. Creating audits still
   matters — Round 2 is not in any file yet — and Part 2 onwards still covers
   it. */
const withVisits = new Set(programme.visits.map((v) => v.entity));
check(
  "every site opens on a seeded audit",
  programme.entities.length === 10 && withVisits.size === 10,
  `${withVisits.size} of ${programme.entities.length} entities have a seeded visit`
);

check(
  "every seeded visit belongs to an entity that exists",
  programme.visits.every((v) => programme.entities.some((e) => e.code === v.entity)),
  "a visit for an entity nobody can select is a visit nobody can open"
);

check(
  "every seeded visit id is YYYY-MM",
  programme.visits.every((v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v.id)),
  "carry-forward orders visits by sorting this string"
);

/* --------------------------------- Part 2: the programme is extensible ---- */

check(
  "audits created in the app are persisted",
  /customVisits: ProgrammeVisit\[\];/.test(store) && /customVisits: s\.customVisits,/.test(store),
  "creating an audit and losing it on reload is worse than not offering it"
);

check(
  "seeded and created audits merge into one ordering",
  /export function mergeVisits\(/.test(store) &&
    /\.sort\(\(a, b\) => a\.id\.localeCompare\(b\.id\)\)/.test(store),
  "'the previous visit' must mean the same to carry-forward and to the strip"
);

check(
  "a visit id is validated on the way in",
  /export const VISIT_ID = \/\^/.test(store) &&
    /if \(!VISIT_ID\.test\(visitId\)\)/.test(store),
  "a malformed id would sort wrongly and silently break carry-forward"
);

check(
  "a duplicate audit is refused",
  /already has an audit for/.test(store),
  ""
);

/* ------------------------------------ Part 3: deletion cannot lose work --- */

check(
  "a programme-seeded audit cannot be removed",
  /That audit comes from the programme and cannot be removed\./.test(store),
  ""
);

check(
  "an audit holding data cannot be removed",
  /That audit holds captured data\./.test(store) &&
    /const hasFindings = get\(\)\.findings\.some\(/.test(store),
  "findings live outside byVisit, so checking responses alone would miss them"
);

check(
  "the remove control only appears on an empty, app-created audit",
  /\{!seeded && !has && \(/.test(panel),
  ""
);

/* ------------------------------------------- Part 4: everything is reachable */

check(
  "the panel lists every entity, not just the ones with audits",
  /ENTITIES\.map\(\(e\) => \{/.test(panel) && /no audits yet/.test(panel),
  ""
);

check(
  "a scope holding data but no visit definition still appears",
  /for \(const key of Object\.keys\(byVisit\)\)/.test(store),
  "data the programme has forgotten would otherwise be unreachable"
);

check(
  "the list says what each audit holds",
  /complete · \$\{st!\.media\} media · \$\{st!\.findings\} findings/.test(panel),
  "'scheduled' and 'there is work in here' must be distinguishable without opening it"
);

check(
  "the audit in view is marked",
  /OPEN NOW/.test(panel),
  ""
);

/* ------------------------------------------- Part 5: the way in is visible */

check(
  "the strip names the action rather than looking like a progress bar",
  /All audits/.test(shell) && /tap a visit to open it/.test(shell),
  "it was already clickable and nobody clicked it"
);

check(
  "an entity with no audits offers to create the first",
  /No audits at \{entityOf\(entityCode\)\.short\} yet — create the first one/.test(shell),
  "an empty strip is not an explanation"
);

check(
  "the strip reads visits from the store, so a new audit appears at once",
  /const visits = useVisits\(entityCode\);/.test(shell) &&
    !/PROGRAMME_VISITS\.filter\(\(v\) => v\.entity === entityCode\)/.test(shell),
  ""
);

check(
  "creating an audit opens it",
  /openAudit\(newEntity, newId\);/.test(panel),
  "creating something and then having to find it is two steps too many"
);

console.log(
  failures === 0 ? "\nAUDITS OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
