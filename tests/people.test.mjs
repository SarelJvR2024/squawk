import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE PEOPLE DIRECTORY — TPJV and ACSA contacts, per site and Corporate.
 *
 *  Sarel: "People directory — TPJV and ACSA contacts, per site and
 *  corporate." Then, answering the open questions directly:
 *
 *    - ONE FLAT LIST, TAGGED BY SITE, not a separate bucket per airport plus
 *      a bolted-on Corporate bucket. Corporate is not invented for this
 *      screen — programme.json already has one entity of kind "head-office".
 *    - FIELDS: name, surname, role, discipline, department, location.
 *    - A STANDALONE REFERENCE LIST for v1 — not wired into ISF's free-text
 *      contact fields or anywhere else yet.
 *    - PROGRAMME-WIDE, FLAT ACROSS VISITS — entered once, unlike a finding
 *      this carries no originVisit at all.
 *
 *  Source-read, like the other register suites: the failure mode this guards
 *  against is the shape drifting from what was actually agreed, not a
 *  rendering bug a browser suite would catch differently. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const types = read("src", "lib", "types.ts");
const store = read("src", "lib", "store.ts");
const page = read("src", "app", "(app)", "people", "page.tsx");
const shell = read("src", "components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* ---- 1 · the record itself ------------------------------------------- */

const contactBlock = types.slice(
  types.indexOf("export interface Contact"),
  types.indexOf("export interface Contact") + 700
);

check(
  "a contact carries a site, not an entity-plus-visit pair",
  /site: string;/.test(contactBlock),
  "one field says where this person is based"
);

check(
  "and it carries no originVisit at all",
  !/originVisit/.test(contactBlock),
  "Sarel: programme-wide, flat across visits — not re-typed every audit"
);

check(
  "the six agreed fields are all there",
  /name: string;/.test(contactBlock) &&
    /surname: string;/.test(contactBlock) &&
    /role: string;/.test(contactBlock) &&
    /discipline: string;/.test(contactBlock) &&
    /department: string;/.test(contactBlock) &&
    /location: string;/.test(contactBlock),
  "name, surname, role, discipline, department, location"
);

check(
  "and it is dated like every other record, for the merge",
  /createdAt: number;/.test(contactBlock) && /updatedAt: number;/.test(contactBlock),
  "the other half of every record in this app that two devices might both touch"
);

/* ---- 2 · the store slice ------------------------------------------------ */

check(
  "the store carries a flat contacts array",
  /contacts: Contact\[\];/.test(store),
  "not byVisit — this is one of the handful of truly flat slices"
);

check(
  "add, update and remove all exist",
  /addContact: \(seed: Omit<Contact, "id" \| "createdAt" \| "updatedAt">\) => string;/.test(
    store
  ) &&
    /updateContact: \(id: string, p: Partial<Contact>\) => void;/.test(store) &&
    /removeContact: \(id: string\) => void;/.test(store),
  "the same three-verb shape every other register in this app uses"
);

check(
  "adding one stamps both dates",
  /addContact: \(seed\) => \{[\s\S]{0,200}?createdAt: now, updatedAt: now/.test(
    codeOnly(store)
  ),
  "a contact with no updatedAt cannot be told apart from one nobody has touched since"
);

check(
  "the directory is persisted",
  /contacts: s\.contacts,/.test(store),
  "a contact typed once and lost on reload is not \"entered once\", it is entered every time"
);

check(
  "and a tablet that hydrated before it existed gets an empty directory, not a crash",
  /if \(from < 19\) \{[\s\S]{0,320}?if \(!Array\.isArray\(st\.contacts\)\) st\.contacts = \[\];/.test(
    store
  ),
  "the same migration shape every flat slice in this file already uses"
);

/* ---- 3 · the screen ----------------------------------------------------- */

const pageCode = codeOnly(page);

check(
  "only name and surname are required to add someone",
  /const canAdd = draft\.name\.trim\(\) && draft\.surname\.trim\(\);/.test(pageCode),
  "a form that will not save without a department is a form nobody fills in standing at a desk"
);

check(
  "Corporate is the existing head-office entity, not a second flag",
  /e\.kind === "head-office"/.test(pageCode) && !/=== "Corporate"/.test(pageCode),
  "programme.json already says which entity this is; a compared literal is how the two drift"
);

check(
  "grouped by site, Corporate sorted last",
  /ea\.kind === "head-office" \? 1 : -1/.test(pageCode),
  "opened at an airport, the person almost always wants THAT site's people first"
);

check(
  "the directory can be searched",
  /\[c\.name, c\.surname, c\.role, c\.discipline, c\.department, c\.location\]/.test(pageCode),
  "every field that could be what somebody remembers about a person"
);

check(
  "and filtered to one site, or all of them",
  /includeAll/.test(pageCode),
  "a directory that can only show one site at a time is ten separate directories"
);

check(
  "discipline offers the register's own vocabulary, not a free-typed guess",
  /ALL_DISCIPLINES\.map/.test(pageCode),
  "the same six disciplines used for mitigation actions and hazards"
);

check(
  "a contact can be removed",
  /removeContact\(c\.id\)/.test(pageCode),
  ""
);

/* ---- 4 · reachable from the app, gated like its siblings ---------------- */

check(
  "the More menu carries a line to it",
  /label="People directory"[\s\S]{0,400}?onClick=\{\(\) => \{ setMore\(false\); router\.push\("\/people"\); \}\}/.test(
    shell
  ),
  "same pattern as Interview records, Site attendance and Evidence log"
);

check(
  "hidden from the ACSA read-only role, like its siblings",
  /role !== "acsa" && \(\s*\n\s*<MoreItem\s*\n\s*icon=\{<IconTeam width=\{14\} height=\{14\} \/>\}\s*\n\s*label="People directory"/.test(
    shell
  ),
  "a TPJV/ACSA contact list is TPJV's own organisational tool, same reasoning as the other three site-logistics screens"
);

check(
  "the masthead knows its heading off the route",
  /"\/people": "People directory",/.test(shell),
  "otherwise it silently falls back to \"Squawk\""
);

check(
  "the site and discipline selects are labelled, not just their siblings",
  /aria-label=\{ariaLabel\}/.test(page) && (page.match(/ariaLabel="/g) || []).length === 5,
  "a11y.js caught this once already — a select with no accessible name and no visible <label>"
);

console.log(failures === 0 ? "\nPEOPLE OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
