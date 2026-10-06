import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* SITE ACCESS LOG — one record per area visited, added 1 October 2026
 *  alongside PPE checks. Sarel's own answer to "what does this form need":
 *  "where we went, purpose, who escorted us, who went from ACSA and TPJV."
 *
 *  Like PPE, this is ONE RECORD PER OCCASION rather than one per day — the
 *  team can walk through four areas before lunch and each one is its own
 *  log, not buried inside one day's worth of everywhere. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "site-access", "page.tsx");
const shell = src("components", "AppShell.tsx");
const hub = src("app", "(app)", "forms", "page.tsx");
const exportsSrc = src("lib", "exports.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const {
  isSigned,
  logGaps,
  logText,
  nextSignatureRef,
  signedFieldsChanged,
  unbackedSignatures,
} = await import(path.join(here, "..", "src", "lib", "siteAccess.ts"));

const sig = (over = {}) => ({
  ref: "ACC-7K2P9_S01",
  blobKey: "sig-abc",
  signedName: "T. Nkosi",
  signedAt: Date.now(),
  width: 600,
  height: 264,
  bytes: 4000,
  ...over,
});

const visitor = (over = {}) => ({
  id: "v1",
  name: "T. Nkosi",
  side: "TPJV",
  organisation: "",
  signature: null,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const log = (over = {}) => ({
  id: "ACC-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  date: "2026-10-01",
  area: "MV switchroom, Pier B",
  purpose: "",
  escortedBy: "",
  openedAt: 1,
  openedBy: "Sarel Jansen van Rensburg",
  endTime: null,
  notes: "",
  people: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

/* ------------------------------------------- 1. which side a visitor is on */

check(
  "side is a fixed choice, not free text — ACSA, TPJV or Other",
  /export type SiteAccessSide = "ACSA" \| "TPJV" \| "Other";/.test(types),
  'Sarel: "who went from ACSA and TPJV" is a question the log should be filterable by'
);

/* --------------------------------------- 2. what a signature signs for */

check("changing the name invalidates it", signedFieldsChanged({ name: "X" }) === true);
check("changing the side invalidates it", signedFieldsChanged({ side: "ACSA" }) === true);
check("changing the organisation invalidates it", signedFieldsChanged({ organisation: "X" }) === true);
check("an empty patch invalidates nothing", signedFieldsChanged({}) === false);
check(
  "the store clears the signature when the patch says so",
  /updateSiteAccessVisitor[\s\S]{0,700}siteAccessSignedFieldsChanged\(safe\)[\s\S]{0,300}invalidates \? \{ signature: null \}/.test(
    store
  )
);

/* ------------------------------------------- 3. a typed name is not a signature */

check("a bare visitor is not signed", isSigned(visitor()) === false);
check("a stored mark is signed", isSigned(visitor({ signature: sig() })) === true);
check(
  "a signature object with no bytes behind it is NOT signed",
  isSigned(visitor({ signature: sig({ blobKey: "" }) })) === false
);

/* ------------------------------------------------------- 4. references */

check("the first signature on a log is S01", nextSignatureRef("ACC-7K2P9", []) === "ACC-7K2P9_S01");
check(
  "re-signing does not reuse the old reference",
  nextSignatureRef("ACC-7K2P9", [visitor({ signature: sig({ ref: "ACC-7K2P9_S03" }) })]) === "ACC-7K2P9_S04"
);
check(
  "the store assigns the reference, not the screen",
  /signSiteAccessVisitor[\s\S]{0,600}nextSiteAccessSignatureRef\(id, l\.people\)/.test(store)
);

/* ----------------------------------------------------- 5. what is still owed */

check("an empty log says nobody is recorded", logGaps(log()).includes("nobody recorded"));
check("a log with no area says so", logGaps(log({ area: "" })).includes("no area recorded"));
check("a log with no escort says so", logGaps(log({ people: [visitor()] })).includes("no escort recorded"));
check(
  "a complete log owes nothing",
  logGaps(log({ people: [visitor()], escortedBy: "P. Mahlangu" })).length === 0
);

/* -------------------------------------------- 6. signatures only on this device */

check(
  "a signature with no record copy is reported",
  unbackedSignatures(log({ people: [visitor({ signature: sig() })] })).length === 1
);
check(
  "one that has been backed up is not",
  unbackedSignatures(log({ people: [visitor({ signature: sig({ cloudUrl: "https://x" }) })] })).length === 0
);

/* ------------------------------------------------------------- 7. the text */

const bare = logText(log(), { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" });
check("it names the log", bare.includes("ACC-7K2P9"));
check("it carries the area", bare.includes("MV switchroom, Pier B"));
check("it carries the site", bare.includes("O.R. Tambo International Airport"));

const full = logText(
  log({ people: [visitor({ side: "ACSA", signature: sig() })], escortedBy: "P. Mahlangu" }),
  { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" }
);
check("a visitor's side is printed", full.includes("ACSA"));
check("the escort is printed", full.includes("P. Mahlangu"));
check("a signed row names its reference", full.includes("ACC-7K2P9_S01"));

check("an unrecorded end time reads as not recorded, not a fabricated clock reading", bare.includes("not recorded"));
const withEnd = logText(
  log({ endTime: new Date("2026-10-01T15:45:00").getTime(), notes: "Panel door was unlocked on arrival." }),
  { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" }
);
check("a recorded end time is printed", withEnd.includes("15:45"));
check("the log's own observation notes are printed", withEnd.includes("Panel door was unlocked on arrival."));
check("an empty notes field prints nothing for it", !bare.includes("Notes"));

/* ------------------------------------------------------------ 8. the store */

check(
  "opening a log never returns an existing one — every area visited is its own record",
  /openSiteAccessLog[\s\S]{0,100}=>/.test(store) && !/openSiteAccessLog[\s\S]{0,400}const existing/.test(store)
);
check("site access logs are persisted", /partialize[\s\S]{0,700}siteAccessLogs: s\.siteAccessLogs/.test(store));
check(
  "the persisted shape was versioned to carry the new slice",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 21
);
check(
  "the migration defaults the slice rather than leaving it undefined",
  /from < 21[\s\S]{0,700}Array\.isArray\(st\.siteAccessLogs\)[\s\S]{0,80}st\.siteAccessLogs = \[\]/.test(store)
);
check(
  "deleting a log releases its signatures",
  /removeSiteAccessLog[\s\S]{0,500}delBlobs\(keys\)/.test(store)
);
check(
  "a new log starts with no end time and no notes",
  /openSiteAccessLog[\s\S]{0,600}endTime: null,[\s\S]{0,80}notes: "",/.test(store)
);
check(
  "the persisted shape was versioned again to carry day/start/end/notes",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 29
);
check(
  "the migration backfills endTime and notes rather than leaving them undefined",
  /from < 29 && Array\.isArray\(st\.siteAccessLogs\)[\s\S]{0,500}endTime === undefined[\s\S]{0,40}endTime = null[\s\S]{0,120}notes === undefined[\s\S]{0,40}notes = ""/.test(
    store
  )
);
check(
  "SiteAccessLog declares the two new fields",
  /interface SiteAccessLog \{[\s\S]{0,1400}endTime: number \| null;[\s\S]{0,300}notes: string;/.test(types)
);

/* ------------------------------------------------------------- 9. reachable */

check("the register has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "site-access", "page.tsx")));
check("it is reachable from the Forms hub", /href: "\/site-access"/.test(hub));
check("it is not another entry in the nav bar", !/href:\s*"\/site-access"/.test(shell));
check("a screen off the nav bar still has a heading of its own", /"\/site-access": "Site access"/.test(shell));
check("it is not reachable directly from the shell's own menu any more", !/label="Site access"/.test(shell));
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">Site access log<\/h2>/.test(page)
);
check(
  "adding a visitor goes through the people-directory picker, not a bare input",
  /<ContactPicker/.test(page)
);
check(
  "each of the three sides is offered as its own button",
  /SIDES\.map/.test(page) && /\["ACSA", "TPJV", "Other"\]/.test(page)
);
check(
  "it is wired into the export workbook, named for what it is",
  /export function siteAccessSheet\(x: ExportInput\): Sheet \{/.test(exportsSrc) &&
    /name: "Site access",/.test(exportsSrc)
);

/* ---- 10. Sarel's follow-up: day/start/end, observation notes, one row per visitor ---- */

check(
  "the date is editable, not just stamped and read-only",
  /type="date"[\s\S]{0,80}value=\{l\.date\}[\s\S]{0,80}onChange=\{\(e\) => setLogDate\(l, e\.target\.value\)\}/.test(
    page
  )
);
check(
  "start time is editable",
  /type="time"[\s\S]{0,80}value=\{timeInputValue\(l\.openedAt\)\}[\s\S]{0,80}onChange=\{\(e\) => setStartTime\(l, e\.target\.value\)\}/.test(
    page
  )
);
check(
  "end time is editable and allowed to be blank",
  /type="time"[\s\S]{0,80}value=\{l\.endTime !== null \? timeInputValue\(l\.endTime\) : ""\}[\s\S]{0,80}onChange=\{\(e\) => setEndTime\(l, e\.target\.value\)\}/.test(
    page
  )
);
check(
  "editing the date keeps every time of day the log carries",
  /function setLogDate[\s\S]{0,500}openedAt: mergeDate\(l\.openedAt\),[\s\S]{0,100}endTime: l\.endTime !== null \? mergeDate\(l\.endTime\) : null,/.test(
    page
  )
);
check(
  "there is a log-level observation notes field, separate from any one visitor",
  /mini\(\s*\n\s*"NOTES",[\s\S]{0,200}<textarea[\s\S]{0,80}value=\{l\.notes\}[\s\S]{0,80}onChange=\{\(e\) => patchLog\(l\.id, \{ notes: e\.target\.value \}\)\}/.test(
    page
  )
);
check(
  "adding a visitor no longer auto-expands their row into the detail panel",
  !/addVisitor\(l\.id, p\.name,[\s\S]{0,200}setExpandedRowId\(rowId\)/.test(page) &&
    /onAdd=\{\(p\) => \{\s*\n\s*addVisitor\(l\.id, p\.name,/.test(page),
  'Sarel: "when adding a person to the site access just keep it in one row, dont show expanded box"'
);

/* -------------------------------------------- 10. the compact layout */

/* Sarel: apply the attendance register's compact header to this form too —
 *  the same space-saving field, replacing Field's own label row and
 *  bottom margin on every dense header grid this screen has. No apologies
 *  here, deliberately: a site access log has no "invited" list to measure
 *  a no-show against, only who actually walked in under escort. */

check(
  "the open-log header uses the same space-saving field as the attendance register, not Field",
  /function mini\(label: string, input: React\.ReactNode, hint\?: string\)/.test(page) &&
    !/<Field /.test(page)
);
check(
  "DATE, START and END sit in one compact row",
  /mini\(\s*\n\s*"DATE",/.test(page) &&
    /mini\(\s*\n\s*"START",/.test(page) &&
    /mini\(\s*\n\s*"END",/.test(page)
);
check(
  "AREA, PURPOSE and ESCORTED BY sit in one compact row",
  /mini\(\s*\n\s*"AREA",/.test(page) &&
    /mini\(\s*\n\s*"PURPOSE",/.test(page) &&
    /mini\(\s*\n\s*"ESCORTED BY",/.test(page)
);
check(
  "so does WHO WENT IN",
  /mini\(\s*\n\s*"WHO WENT IN",/.test(page)
);
check(
  "the creation panel's three fields are one compact row too, not three stacked",
  /mini\(\s*\n\s*"WHERE DID YOU GO\?",/.test(page)
);
check(
  "no apologies concept was added here — this form logs who actually went in, not who was invited",
  !/apolog/i.test(page),
  "a site access log has no invited list to measure a no-show against"
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
