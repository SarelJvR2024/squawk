import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE ATTENDANCE REGISTER — replacing the daily arrival/departure log,
 *  3 October 2026. Sarel: "There must be an option to create a new
 *  attendance register... we can even create attendance registers ahead
 *  of time. It doesn't have to be on the day, so you can create blank
 *  attendance registers... the date and time and the location and the
 *  purpose of the meeting... rows where multiple people can be added...
 *  if they're not already on the system with the email and phone number
 *  they can be added in there."
 *
 *  Mirrors src/lib/toolbox.ts exactly: ONE RECORD PER REGISTER, not one
 *  per day — openAttendanceRegister never returns an existing one, the
 *  same as openToolboxTalk and unlike openSiteDay. See
 *  tests/attendance.test.mjs for what this replaced and what stayed —
 *  the daily diary and closeout are untouched, still on SiteDay. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "attendance", "page.tsx");
const peoplePage = src("app", "(app)", "people", "page.tsx");
const contactPicker = src("components", "ContactPicker.tsx");
const shell = src("components", "AppShell.tsx");
const hub = src("app", "(app)", "forms", "page.tsx");
const formsIndex = src("lib", "formsIndex.ts");
const exportsSrc = src("lib", "exports.ts");
const dashboard = src("app", "(app)", "dashboard", "page.tsx");
const merge = src("lib", "merge.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const {
  apologiesOf,
  isSigned,
  nextSignatureRef,
  registerGaps,
  registerText,
  rowGaps,
  signedFieldsChanged,
  unbackedSignatures,
} = await import(path.join(here, "..", "src", "lib", "attendanceRegister.ts"));

const sig = (over = {}) => ({
  ref: "ATR-7K2P9_S01",
  blobKey: "sig-abc",
  signedName: "T. Nkosi",
  signedAt: Date.now(),
  width: 600,
  height: 264,
  bytes: 4000,
  ...over,
});

const row = (over = {}) => ({
  id: "r1",
  name: "T. Nkosi",
  organisation: "",
  role: "",
  phone: "",
  email: "",
  signature: null,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const register = (over = {}) => ({
  id: "ATR-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  date: "2026-10-03",
  time: "08:00",
  location: "",
  purpose: "Morning muster",
  openedAt: 1,
  openedBy: "Sarel Jansen van Rensburg",
  rows: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

/* ------------------------------------- 1. what a signature signs for, and what not */

check("changing the name invalidates it", signedFieldsChanged({ name: "X" }) === true);
check("changing the organisation invalidates it", signedFieldsChanged({ organisation: "X" }) === true);
check("changing the role invalidates it", signedFieldsChanged({ role: "X" }) === true);
check(
  "CHANGING THE PHONE NUMBER DOES NOT",
  signedFieldsChanged({ phone: "0821234567" }) === false,
  "contact details are how to reach somebody, not part of the statement they signed"
);
check(
  "nor does changing the email address",
  signedFieldsChanged({ email: "x@y.com" }) === false
);
check("an empty patch invalidates nothing", signedFieldsChanged({}) === false);
check(
  "the store clears the signature when the patch says so",
  /updateAttendanceRow[\s\S]{0,700}attendanceRegisterSignedFieldsChanged\(safe\)[\s\S]{0,300}invalidates \? \{ signature: null \}/.test(
    store
  )
);

/* --------------------------------------------- 2. a typed name is not a signature */

check("a bare row is not signed", isSigned(row()) === false);
check("a stored mark is signed", isSigned(row({ signature: sig() })) === true);
check(
  "a signature object with no bytes behind it is NOT signed",
  isSigned(row({ signature: sig({ blobKey: "" }) })) === false
);

/* ----------------------------------------------------------------- 3. references */

check("the first signature on a register is S01", nextSignatureRef("ATR-7K2P9", []) === "ATR-7K2P9_S01");
check(
  "re-signing does not reuse the old reference",
  nextSignatureRef("ATR-7K2P9", [row({ signature: sig({ ref: "ATR-7K2P9_S03" }) })]) === "ATR-7K2P9_S04"
);
check(
  "the store assigns the reference, not the screen",
  /signAttendanceRow[\s\S]{0,600}nextAttendanceRegisterSignatureRef\(id, r\.rows\)/.test(store)
);

/* ---------------------------------------------------------------- 4. what is owed */

check("a bare row reports its name present but needs a signature", rowGaps(row()).includes("signature"));
check("a nameless row reports the name too", rowGaps(row({ name: "" })).includes("name"));
check("a signed row owes nothing", rowGaps(row({ signature: sig() })).length === 0);

check(
  "A BLANK REGISTER IS NOT A GAP — nobody expected yet is not nobody missing",
  registerGaps(register()).length === 0,
  "created ahead of time for next Tuesday's muster, blank is working as intended"
);
check(
  "a register with an unsigned row counts it",
  registerGaps(register({ rows: [row()] })).some((g) => /unsigned/.test(g))
);
check(
  "a complete register owes nothing",
  registerGaps(register({ rows: [row({ signature: sig() })] })).length === 0
);

/* --------------------------------------------- 5. signatures only on this device */

check(
  "a signature with no record copy is reported",
  unbackedSignatures(register({ rows: [row({ signature: sig() })] })).length === 1
);
check(
  "one that has been backed up is not",
  unbackedSignatures(register({ rows: [row({ signature: sig({ cloudUrl: "https://x" }) })] })).length === 0
);

/* ------------------------------------------------------------------- 6. the text */

const bare = registerText(register(), {
  siteName: "O.R. Tambo International Airport (FAOR)",
  siteCode: "ORTIA",
  visitId: "2026-09",
});
check("it names the register", bare.includes("ATR-7K2P9"));
check("it carries the purpose", bare.includes("Morning muster"));
check("it carries the date and time", bare.includes("2026-10-03") && bare.includes("08:00"));
check("it carries the site", bare.includes("O.R. Tambo International Airport"));
check("an empty register states that, rather than printing a blank", bare.includes("— not recorded —"));

const full = registerText(
  register({ rows: [row({ signature: sig(), phone: "0821234567", email: "t.nkosi@tpjv.co.za" })] }),
  { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" }
);
check("a signed row names its reference", full.includes("ATR-7K2P9_S01"));
check("contact details are printed when there are any", full.includes("0821234567") && full.includes("t.nkosi@tpjv.co.za"));

const noContact = registerText(register({ rows: [row()] }), {
  siteName: "O.R. Tambo International Airport (FAOR)",
  siteCode: "ORTIA",
  visitId: "2026-09",
});
check(
  "and the contact line is left out, not printed blank, when there are none",
  !noContact.includes("Contact")
);

/* ------------------------------------------------------------------- 7. the store */

check(
  "opening a register never returns an existing one — several registers a day is the whole point",
  /openAttendanceRegister[\s\S]{0,100}=>/.test(store) &&
    !/openAttendanceRegister[\s\S]{0,400}const existing/.test(store)
);
check(
  "nothing requires a field to be filled in to create one — a blank register is valid",
  /openAttendanceRegister: \(seed\) => \{/.test(store),
  "no draftDate.trim() or similar guard before the id is minted"
);
check("attendance registers are persisted", /partialize[\s\S]{0,700}attendanceRegisters: s\.attendanceRegisters/.test(store));
check(
  "the persisted shape was versioned to carry the new slice",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 28
);
check(
  "the migration defaults the slice rather than leaving it undefined",
  /from < 28[\s\S]{0,700}Array\.isArray\(st\.attendanceRegisters\)[\s\S]{0,80}st\.attendanceRegisters = \[\]/.test(store)
);
check(
  "deleting a register releases its rows' signatures",
  /removeAttendanceRegister[\s\S]{0,600}delBlobs\(keys\)/.test(store)
);

/* -------------------------------------- 8. phone and email, for real this time */

check(
  "Contact carries phone and email",
  /interface Contact \{[\s\S]{0,900}phone: string;[\s\S]{0,80}email: string;/.test(types)
);
check(
  "a contact without them on file is backfilled by the same migration, not left undefined",
  /from < 28[\s\S]{0,900}contact\.phone === undefined\) contact\.phone = ""[\s\S]{0,200}contact\.email === undefined\) contact\.email = ""/.test(
    store
  )
);
check(
  "the People screen can set them, not only the register row",
  /placeholder="Phone"/.test(peoplePage) && /placeholder="Email"/.test(peoplePage)
);
check(
  "ContactPicker carries phone and email through from a picked contact",
  /phone: c\.phone\.trim\(\)/.test(contactPicker) && /email: c\.email\.trim\(\)/.test(contactPicker)
);
check(
  "the register's own row captures them too, for somebody not yet on file",
  /placeholder="Phone \(optional\)"/.test(page) && /placeholder="Email \(optional\)"/.test(page)
);
check(
  "editing a row's contact details patches the directory contact too, when there is one",
  /if \(row\.contactId\) updateContact\(row\.contactId, \{ phone: ev\.target\.value \}\)/.test(page) &&
    /if \(row\.contactId\) updateContact\(row\.contactId, \{ email: ev\.target\.value \}\)/.test(page),
  "Sarel: added in any form, available in every other — the same promise ContactPicker already makes for a typed name"
);

/* ------------------------------------------------------------------ 9. reachable */

check("the register has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "attendance", "page.tsx")));
check("it is reachable from the Forms hub", /href: "\/attendance"/.test(hub));
check("it is not another entry in the nav bar", !/href:\s*"\/attendance"/.test(shell));
check(
  "a screen off the nav bar still has a heading of its own",
  /"\/attendance": "Attendance register"/.test(shell)
);
check("it is not reachable directly from the shell's own menu any more", !/label="Site attendance"/.test(shell));
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">Attendance register<\/h2>/.test(page)
);
check(
  "adding a row goes through the people-directory picker, not a bare input",
  /<ContactPicker/.test(page)
);
check(
  "the unbacked-signature warning tells the auditor before the tablet leaves site",
  /THE\s+RECORD COPY IS NOT WIRED YET/.test(page) && /COPY THE REGISTER OUT BEFORE/.test(page)
);
check(
  "the Forms hub reads attendance from the new register, not from SiteDay any more",
  /for \(const r of attendanceRegisters\.filter[\s\S]{0,200}kind: "attendance"/.test(formsIndex)
);
check(
  "it is wired into the export workbook, named for what it is",
  /export function attendanceRegisterSheet\(x: ExportInput\): Sheet \{/.test(exportsSrc) &&
    /name: "Attendance register",/.test(exportsSrc)
);
check(
  "the dashboard counts registers created, not the old day count",
  /label: "Attendance registers",[\s\S]{0,80}value: attendanceRegisters\.length/.test(dashboard)
);

/* ---------------------------------------------------------- 10. apologies */

/* Sarel: "add an option to capture a person to attend apologies if they
 *  don't attend." Deliberately NOT another row — a row is proof somebody
 *  was in the room and signed for it; an apology is the opposite fact
 *  about the same invitee list, and the two must never be confusable in
 *  the export six months later. */

const apology = (over = {}) => ({
  id: "a1",
  name: "P. Dlamini",
  organisation: "",
  role: "",
  reason: "",
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

check(
  "apologiesOf reads the optional field, defaulting to none rather than throwing",
  Array.isArray(apologiesOf(register())) &&
    apologiesOf(register()).length === 0 &&
    apologiesOf(register({ apologies: [apology()] })).length === 1,
  "a register persisted before this feature shipped has no apologies key at all"
);

check(
  "ApologyEntry is its own type, not a reuse of AttendanceRow",
  /export interface ApologyEntry \{/.test(types) &&
    !/export interface ApologyEntry \{[\s\S]{0,400}signature/.test(types),
  "nothing here is signed, so a signature field would be a lie"
);

check(
  "the register carries them as an optional slice, so no migration is owed to an existing register",
  /apologies\?: ApologyEntry\[\];/.test(types)
);

check(
  "the store can add, edit and remove an apology",
  /addApology: \(id, name, seed\) => \{/.test(store) &&
    /updateApology: \(id, apologyId, p\) => \{/.test(store) &&
    /removeApology: \(id, apologyId\) => \{/.test(store)
);

check(
  "adding one goes through the SAME record the row it is not — no signature, no phone, no email",
  /apologies: \[\s*\n\s*\.\.\.\(r\.apologies \?\? \[\]\),\s*\n\s*\{\s*\n\s*name,\s*\n\s*organisation: "",\s*\n\s*role: "",\s*\n\s*reason: "",/.test(
    store
  )
);

check(
  "they union across devices the same way rows do, not newer-wins-the-lot",
  /attendanceRegisters = mergeForm\(\s*\n\s*mine\.attendanceRegisters,\s*\n\s*theirs\.attendanceRegisters \?\? \[\],\s*\n\s*\["rows", "apologies"\],/.test(
    merge
  ),
  "without this, one device's apology additions are lost whenever the OTHER device's register happens to be newer"
);

const withApology = registerText(
  register({ rows: [row()], apologies: [apology({ role: "Site Manager", organisation: "ACSA", reason: "Travelling" })] }),
  { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" }
);
check("the printed register has an APOLOGIES section", withApology.includes("APOLOGIES"));
check("it names who, their role and organisation", withApology.includes("P. Dlamini — Site Manager, ACSA"));
check("and the reason, when one was given", withApology.includes("Travelling"));

const noApologies = registerText(register({ rows: [row()] }), {
  siteName: "O.R. Tambo International Airport (FAOR)",
  siteCode: "ORTIA",
  visitId: "2026-09",
});
check(
  "a register with nobody apologising prints no APOLOGIES section at all",
  !noApologies.includes("APOLOGIES")
);

check(
  "the open register screen offers the same people-directory picker apologies use",
  /APOLOGIES/.test(page) &&
    /placeholder="Invited but not attending — search the directory, or type a name"/.test(page)
);
check(
  "an apology row is visibly NOT an attendee row — its own pill, not SIGNED or NOT SIGNED",
  /<Pill>APOLOGY<\/Pill>/.test(page)
);
check(
  "removing one goes through removeApology, not removeAttendanceRow",
  /removeApology\(r\.id, a\.id\)/.test(page) && !/removeAttendanceRow\(r\.id, a\.id\)/.test(page)
);

check(
  "the export sheet tells attended and apologised apart with their own Status column",
  /"Attended", sigCell\(row\.signature\), ""/.test(exportsSrc) &&
    /"Apology", "", a\.reason/.test(exportsSrc) &&
    /\{ header: "Status", width: 12 \}/.test(exportsSrc) &&
    /\{ header: "Apology reason", width: 26 \}/.test(exportsSrc)
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
