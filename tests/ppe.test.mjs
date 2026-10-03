import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* PPE CHECKS — added 1 October 2026 alongside the site access log, when the
 *  tablet forms were redesigned around a consistent header (date, location,
 *  purpose) and a people-directory-linked picker instead of a bare "type a
 *  name" field. Unlike attendance and interviews, a PPE check is ONE RECORD
 *  PER OCCASION, not one per calendar day — the store never opens-or-returns
 *  here, because a morning gate check and an afternoon spot check somewhere
 *  else are two different things to find again later. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "ppe", "page.tsx");
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
  PPE_ITEMS,
  blankItems,
  checkGaps,
  checkText,
  isSigned,
  missingItems,
  nextSignatureRef,
  signedFieldsChanged,
  unbackedSignatures,
} = await import(path.join(here, "..", "src", "lib", "ppe.ts"));

const sig = (over = {}) => ({
  ref: "PPE-7K2P9_S01",
  blobKey: "sig-abc",
  signedName: "T. Nkosi",
  signedAt: Date.now(),
  width: 600,
  height: 264,
  bytes: 4000,
  ...over,
});

const person = (over = {}) => ({
  id: "e1",
  name: "T. Nkosi",
  organisation: "",
  role: "",
  items: blankItems(false),
  notes: "",
  signature: null,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const check_ = (over = {}) => ({
  id: "PPE-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  date: "2026-10-01",
  location: "",
  purpose: "",
  noiseZone: false,
  openedAt: 1,
  openedBy: "Sarel Jansen van Rensburg",
  people: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

/* ---------------------------------------------------- 1. the three items */

check("there are exactly three PPE items", PPE_ITEMS.length === 3, JSON.stringify(PPE_ITEMS));
check("hi-vis jacket is one of them", PPE_ITEMS.includes("hiVisJacket"));
check("safety shoes is one of them", PPE_ITEMS.includes("safetyShoes"));
check("hearing protection is one of them", PPE_ITEMS.includes("hearingProtection"));

/* ---------------------------------------------- 2. hearing protection defaults */

check(
  "hearing protection defaults to missing in a declared noise zone",
  blankItems(true).hearingProtection === "missing"
);
check(
  "and to not applicable outside one",
  blankItems(false).hearingProtection === "notApplicable",
  "asking for a tick on PPE that does not apply is how a checklist stops being trusted"
);
check("the other two items default to missing either way", blankItems(true).hiVisJacket === "missing" && blankItems(false).hiVisJacket === "missing");

/* --------------------------------------- 3. what a signature signs for */

check("changing the name invalidates it", signedFieldsChanged({ name: "X" }) === true);
check("changing the organisation invalidates it", signedFieldsChanged({ organisation: "X" }) === true);
check("changing the role invalidates it", signedFieldsChanged({ role: "X" }) === true);
check(
  "changing an item's tick invalidates it",
  signedFieldsChanged({ items: blankItems(true) }) === true
);
check("an empty patch invalidates nothing", signedFieldsChanged({}) === false);
check("adding a note does not invalidate it", signedFieldsChanged({ notes: "x" }) === false);
check(
  "the store clears the signature when the patch says so",
  /updatePpePerson[\s\S]{0,700}ppeSignedFieldsChanged\(safe\)[\s\S]{0,300}invalidates \? \{ signature: null \}/.test(
    store
  )
);

/* ------------------------------------------- 4. a typed name is not a signature */

check("a bare person is not signed", isSigned(person()) === false);
check("a stored mark is signed", isSigned(person({ signature: sig() })) === true);
check(
  "a signature object with no bytes behind it is NOT signed",
  isSigned(person({ signature: sig({ blobKey: "" }) })) === false
);

/* ------------------------------------------------------- 5. what is missing */

check(
  "missing items are reported, N/A ones are not",
  JSON.stringify(missingItems(person({ items: { hiVisJacket: "missing", safetyShoes: "compliant", hearingProtection: "notApplicable" } }))) ===
    JSON.stringify(["hiVisJacket"])
);
check(
  "a fully compliant row has nothing missing",
  missingItems(
    person({ items: { hiVisJacket: "compliant", safetyShoes: "compliant", hearingProtection: "compliant" } })
  ).length === 0
);

/* ------------------------------------------------------ 6. references */

check("the first signature on a check is S01", nextSignatureRef("PPE-7K2P9", []) === "PPE-7K2P9_S01");
check(
  "re-signing does not reuse the old reference",
  nextSignatureRef("PPE-7K2P9", [person({ signature: sig({ ref: "PPE-7K2P9_S03" }) })]) === "PPE-7K2P9_S04"
);
check(
  "the store assigns the reference, not the screen",
  /signPpePerson[\s\S]{0,600}nextPpeSignatureRef\(id, c\.people\)/.test(store)
);

/* ----------------------------------------------------- 7. what is still owed */

check("an empty check says nobody is recorded", checkGaps(check_()).includes("nobody recorded"));
check(
  "a check with an unsigned person counts it",
  checkGaps(check_({ people: [person()] })).some((g) => /unsigned/.test(g))
);
check(
  "a check with missing PPE counts it",
  checkGaps(check_({ people: [person({ items: { hiVisJacket: "missing", safetyShoes: "compliant", hearingProtection: "notApplicable" } })] })).some(
    (g) => /missing PPE/.test(g)
  )
);
check(
  "a fully signed, fully compliant check owes nothing",
  checkGaps(
    check_({
      people: [
        person({
          items: { hiVisJacket: "compliant", safetyShoes: "compliant", hearingProtection: "notApplicable" },
          signature: sig(),
        }),
      ],
    })
  ).length === 0
);

/* -------------------------------------------- 8. signatures only on this device */

check(
  "a signature with no record copy is reported",
  unbackedSignatures(check_({ people: [person({ signature: sig() })] })).length === 1
);
check(
  "one that has been backed up is not",
  unbackedSignatures(check_({ people: [person({ signature: sig({ cloudUrl: "https://x" }) })] })).length === 0
);

/* ------------------------------------------------------------- 9. the text */

const bare = checkText(check_(), { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" });
check("it names the check", bare.includes("PPE-7K2P9"));
check("it carries the site", bare.includes("O.R. Tambo International Airport"));
check("it states the noise-zone flag", bare.includes("Noise zone"));

const full = checkText(
  check_({
    people: [person({ items: { hiVisJacket: "missing", safetyShoes: "compliant", hearingProtection: "notApplicable" }, signature: sig() })],
  }),
  { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" }
);
check("a missing item prints MISSING", full.includes("MISSING"));
check("a signed row names its reference", full.includes("PPE-7K2P9_S01"));

/* ------------------------------------------------------------ 10. the store */

check(
  "opening a check never returns an existing one — every occasion is new",
  /openPpeCheck[\s\S]{0,100}=>/.test(store) && !/openPpeCheck[\s\S]{0,400}const existing/.test(store),
  "a morning gate check and an afternoon spot check are two different records"
);
check("ppe checks are persisted", /partialize[\s\S]{0,700}ppeChecks: s\.ppeChecks/.test(store));
check(
  "the persisted shape was versioned to carry the new slice",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 21
);
check(
  "the migration defaults the slice rather than leaving it undefined",
  /from < 21[\s\S]{0,700}Array\.isArray\(st\.ppeChecks\)[\s\S]{0,80}st\.ppeChecks = \[\]/.test(store)
);
check(
  "deleting a check releases its signatures",
  /removePpeCheck[\s\S]{0,500}delBlobs\(keys\)/.test(store)
);
check(
  "a person carries their own Signature, same shape as every other form's",
  /PpeEntry \{[\s\S]{0,900}signature: Signature \| null/.test(types)
);

/* ------------------------------------------------------------- 11. reachable */

check("the register has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "ppe", "page.tsx")));
check("it is reachable from the Forms hub", /href: "\/ppe"/.test(hub));
check("it is not another entry in the nav bar", !/href:\s*"\/ppe"/.test(shell));
check("a screen off the nav bar still has a heading of its own", /"\/ppe": "PPE checks"/.test(shell));
check("it is not reachable directly from the shell's own menu any more", !/label="PPE checks"/.test(shell));
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">PPE checks<\/h2>/.test(page)
);
check(
  "adding a person goes through the people-directory picker, not a bare input",
  /<ContactPicker/.test(page)
);
check(
  "it is wired into the export workbook, named for what it is",
  /export function ppeSheet\(x: ExportInput\): Sheet \{/.test(exportsSrc) &&
    /name: "PPE checks",/.test(exportsSrc)
);

/* ---- 12. Sarel's follow-up: editable date/time, an agreement, a Save action ---- */

check(
  "the date and time are editable, not just stamped and read-only",
  /type="date"[\s\S]{0,80}value=\{c\.date\}[\s\S]{0,80}onChange=\{\(e\) => setCheckDate\(c, e\.target\.value\)\}/.test(page) &&
    /type="time"[\s\S]{0,80}value=\{timeInputValue\(c\.openedAt\)\}[\s\S]{0,80}onChange=\{\(e\) => setCheckTime\(c, e\.target\.value\)\}/.test(page)
);
check(
  "editing the date keeps the time of day, editing the time keeps the date",
  /function setCheckDate[\s\S]{0,300}merged\.getTime\(\) \}\)/.test(page) &&
    /function setCheckTime[\s\S]{0,300}openedAt: merged\.getTime\(\) \}\)/.test(page),
  "a check backfilled from a paper note needs its own real date and time, not whatever the tablet said when someone got round to it"
);
check(
  "a signature carries an explicit PPE and safety agreement, not a bare mark",
  /By signing,.*confirms the PPE ticked\s*\n?\s*above is what they are wearing, agrees to wear the PPE required on\s*\n?\s*this site, and confirms they are aware of the site/.test(
    page
  ),
  'Sarel: "get them to sign that they agree to wear their ppe and are aware of all ppe and safety requirements" — a bare signature under a set of ticks only says they were checked, not that they agreed to anything'
);
check(
  "the declaration is shown only while actually signing, addressed to the person by name",
  /signing === e\.id \? \(\s*\n\s*<>/.test(page) && /\{e\.name\.trim\(\) \|\| "this person"\}/.test(page)
);
check(
  "there is a visible Save action, not just silent autosave",
  /Save & close/.test(page),
  'Sarel: "There is no save button" — every field already autosaves, but nothing on screen said so or gave a deliberate "done" moment'
);
check(
  "saving gives a visible confirmation, not just a closed panel",
  /savedId === c\.id \? <Pill tone="accent">✓ SAVED<\/Pill>/.test(page)
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
