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

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
