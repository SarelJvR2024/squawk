import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Site attendance and the daily diary — TK-003 form 2 on the tablet.
 *
 *  Two things make this different from the other project-evidence registers.
 *
 *  It is the first record that carries a SIGNATURE, which is the one capability
 *  the project's own roadmap called genuinely new, and which five of the eight
 *  TK-003 forms are worth nothing without: "an attendance register without
 *  signatures is a list somebody typed".
 *
 *  And it is the first with a UNIQUENESS rule. One record per site per calendar
 *  day, because two registers for one day is the quietest failure in this whole
 *  build — each looks complete, neither says the other exists, and the one that
 *  gets exported is the one that is wrong.
 *
 *  Twelve parts. Most are executed against the real module, because each guards
 *  a rule a plausible refactor could invert:
 *
 *    One day, one record    The store opens-or-returns and the screen has no
 *                           way to ask for a duplicate.
 *
 *    The date is local      "The site day" is a day on a calendar at an airport
 *                           in South Africa. toISOString() converts to UTC
 *                           first, which files a 01:30 arrival under yesterday.
 *
 *    A signature signs a    Name, employer, role, induction — change any of
 *    statement              those and the mark is cleared. The TIMES are
 *                           deliberately outside that list, and that is a
 *                           judgement worth guarding in both directions: a
 *                           departure recorded at five o'clock must NOT wipe
 *                           the morning's signatures.
 *
 *    A typed name is not    isSigned() requires stored bytes. The pad reports
 *    a signature            nothing to the caller when storage fails, so no row
 *                           can read as signed with nothing behind it.
 *
 *    Lapsed against the     A permit that expired last month does not make
 *    DAY, not against now   September's attendance improper. One that had
 *                           already expired in September does. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "attendance", "page.tsx");
const pad = src("components", "SignaturePad.tsx");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const {
  SIGNED_FIELDS,
  dayGaps,
  dayText,
  entryGaps,
  inductionLapsed,
  isSigned,
  localDate,
  nextSignatureRef,
  onSiteMs,
  patchInvalidatesSignature,
  stillOnSite,
  timesDisagree,
  unbackedSignatures,
} = await import(path.join(here, "..", "src", "lib", "attendance.ts"));

const ARRIVED = new Date("2026-09-29T07:12:00").getTime();
const LEFT = new Date("2026-09-29T16:40:00").getTime();

const sig = (over = {}) => ({
  ref: "ATT-7K2P9_S01",
  blobKey: "sig-abc123",
  signedName: "T. Nkosi",
  signedAt: ARRIVED + 60_000,
  width: 600,
  height: 264,
  bytes: 4211,
  ...over,
});

/* Exactly what addAttendee creates: a name and a stamped arrival. */
const person = (over = {}) => ({
  id: "e1",
  name: "T. Nkosi",
  organisation: "",
  role: "",
  arrivedAt: ARRIVED,
  departedAt: null,
  location: "",
  notes: "",
  inductionConfirmed: false,
  inductionRef: "",
  inductionExpires: null,
  signature: null,
  createdAt: ARRIVED,
  updatedAt: ARRIVED,
  ...over,
});

const complete = (over = {}) =>
  person({
    organisation: "Thabile Pridin JV",
    role: "Lead auditor",
    departedAt: LEFT,
    location: "MV switchroom, Pier B",
    notes: "Inspected AGL vault; assisted P. Mahlangu with DB3 fuse replacement",
    inductionConfirmed: true,
    inductionRef: "AVSEC-2026-0417",
    inductionExpires: new Date("2027-03-31T12:00:00").getTime(),
    signature: sig(),
    ...over,
  });

const day = (over = {}) => ({
  id: "ATT-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  date: "2026-09-29",
  openedAt: ARRIVED,
  openedBy: "Sarel Jansen van Rensburg",
  diary: "",
  entries: [],
  attachments: [],
  createdAt: ARRIVED,
  updatedAt: ARRIVED,
  ...over,
});

const ctx = {
  siteName: "O.R. Tambo International Airport (FAOR)",
  siteCode: "ORTIA",
  visitId: "2026-09",
};

/* ------------------------------------------------ 1. the date is a local day */

check(
  "the date is the local calendar day",
  localDate(new Date("2026-09-29T07:12:00").getTime()) === "2026-09-29"
);
check(
  "an arrival after midnight is filed under that day, not the one before",
  localDate(new Date("2026-09-29T01:30:00").getTime()) === "2026-09-29",
  "toISOString() would call this 2026-09-28 in South Africa"
);
check(
  "and a late-evening arrival is not pushed to the next day",
  localDate(new Date("2026-09-29T23:30:00").getTime()) === "2026-09-29"
);
/* The FUNCTION BODY. The module names toISOString in a comment, to say why it
   is not used; a whole-file grep reads that explanation as the offence. */
const localDateBody =
  /export function localDate[\s\S]*?\n}/.exec(src("lib", "attendance.ts"))?.[0] ?? "";
check(
  "it does not reach for toISOString to do it",
  localDateBody.length > 0 && !/toISOString/.test(localDateBody),
  "one UTC conversion is all it takes to disagree with the escort's log"
);

/* ------------------------------------------------- 2. one day, one record */

check(
  "opening a day returns the existing one rather than making a second",
  /openSiteDay[\s\S]{0,900}const existing = s0\.siteDays\.find\([\s\S]{0,200}if \(existing\) return existing\.id/.test(
    store
  ),
  "two registers for one day both look complete and only one gets exported"
);
check(
  "the day it looks for is matched on entity AND date",
  /openSiteDay[\s\S]{0,900}d\.entity === s0\.entity && d\.date === day/.test(store)
);
check(
  "a day's date cannot be patched afterwards",
  /updateSiteDay[\s\S]{0,700}id: d\.id[\s\S]{0,200}entity: d\.entity[\s\S]{0,200}date: d\.date/.test(
    store
  ),
  "moving a date either collides with a real day or re-files attendance onto a day nobody was there"
);
check(
  "the screen has no control that could ask for a duplicate",
  !/addSiteDay|createSiteDay/.test(page) && /openSiteDay|openDay/.test(page)
);

/* --------------------------------- 3. what a signature signs for, and what not */

check(
  "the signed statement is name, employer, role and the induction",
  JSON.stringify([...SIGNED_FIELDS]) ===
    JSON.stringify(["name", "organisation", "role", "inductionConfirmed", "inductionRef"]),
  `got ${JSON.stringify([...SIGNED_FIELDS])}`
);
check("changing the name invalidates it", patchInvalidatesSignature({ name: "X" }) === true);
check("changing the employer invalidates it", patchInvalidatesSignature({ organisation: "X" }) === true);
check("changing the role invalidates it", patchInvalidatesSignature({ role: "X" }) === true);
check(
  "withdrawing the induction confirmation invalidates it",
  patchInvalidatesSignature({ inductionConfirmed: false }) === true
);
check(
  "changing the permit number invalidates it",
  patchInvalidatesSignature({ inductionRef: "X" }) === true
);
check(
  "SIGNING OUT DOES NOT",
  patchInvalidatesSignature({ departedAt: LEFT }) === false,
  "clearing every signature at five o'clock leaves the register unsigned exactly when somebody reads it"
);
check(
  "nor does correcting an arrival time",
  patchInvalidatesSignature({ arrivedAt: ARRIVED + 60_000 }) === false
);
check(
  "nor does recording the permit's expiry date",
  patchInvalidatesSignature({ inductionExpires: 1 }) === false,
  "the expiry is a fact about the permit, not part of what the person attested"
);
check(
  "and recording where they worked does not invalidate it either",
  patchInvalidatesSignature({ location: "AGL vault" }) === false,
  "added 28 September 2026 — a location filled in as the day goes must not unsign the arrival"
);
check(
  "nor does adding a note on what was done",
  patchInvalidatesSignature({ notes: "Inspected the vault" }) === false,
  "activity notes are descriptive, not part of the personal attestation"
);
check(
  "an empty patch invalidates nothing",
  patchInvalidatesSignature({}) === false
);
check(
  "the store clears the signature when the patch says so",
  /updateAttendee[\s\S]{0,900}patchInvalidatesSignature\(safe\)[\s\S]{0,400}invalidates \? \{ signature: null \}/.test(
    store
  )
);
check(
  "and the signature cannot be set by a stray patch",
  /updateAttendee[\s\S]{0,400}const \{ id: _i, createdAt: _c, signature: _s, \.\.\.safe \}/.test(store),
  "signing goes through signAttendee, which is where the reference is assigned"
);

/* --------------------------------------- 4. a typed name is not a signature */

check("a row with no signature is not signed", isSigned(person()) === false);
check("a row with a stored mark is", isSigned(complete()) === true);
check(
  "a signature object with no bytes behind it is NOT signed",
  isSigned(person({ signature: sig({ blobKey: "" }) })) === false,
  "a typed name with no mark is a list entry"
);
check(
  "the pad reports nothing to its caller when storage fails",
  /catch \(err\)[\s\S]{0,700}setFailed\(/.test(pad) &&
    !/catch \(err\)[\s\S]{0,700}onSigned\(/.test(pad),
  "a row that reads as signed with nothing behind it is worse than an unsigned one"
);
check(
  "it refuses to store a pad nobody drew on",
  /disabled=\{!hasInk\(strokes\) \|\| !typed\.trim\(\)/.test(pad)
);
check(
  "the bytes go to the media store under their own key, not into the record",
  /const blobKey = `sig-\$\{uid\(\)\}`;\s*await putBlob\(blobKey, blob\)/.test(pad)
);
check(
  "a signature is PNG, not JPEG",
  /toBlob\([\s\S]{0,60}"image\/png"\)/.test(pad),
  "JPEG blocking artefacts around thin high-contrast strokes is the wrong compression for a name"
);
check(
  "it is NOT filed as an Attachment",
  /DELIBERATELY NOT AN Attachment/.test(types) &&
    !/kind: "signature"/.test(types),
  "the code that deletes a photograph would delete somebody's signature"
);

/* -------------------------------------------- 5. references, never reused */

check("the first signature on a day is S01", nextSignatureRef("ATT-7K2P9", []) === "ATT-7K2P9_S01");
check(
  "numbering runs across the day, not per person",
  nextSignatureRef("ATT-7K2P9", [complete(), person({ id: "e2" })]) === "ATT-7K2P9_S02"
);
check(
  "re-signing does not reuse the old reference",
  nextSignatureRef("ATT-7K2P9", [
    complete({ signature: sig({ ref: "ATT-7K2P9_S01" }) }),
    person({ id: "e2", signature: sig({ ref: "ATT-7K2P9_S03" }) }),
  ]) === "ATT-7K2P9_S04",
  "the first mark was of a different statement and must not be confusable with the second"
);
check(
  "the store assigns the reference, not the pad",
  /signAttendee[\s\S]{0,600}nextSignatureRef\(id, d\.entries\)/.test(store) &&
    !/nextSignatureRef/.test(pad),
  "only the day knows which numbers it has already used"
);
check(
  "a superseded mark's bytes are released",
  /signAttendee[\s\S]{0,1400}previous\.blobKey !== sig\.blobKey[\s\S]{0,80}delBlob\(previous\.blobKey\)/.test(
    store
  )
);

/* ------------------------------ 6. entitlement, judged against the day */

const dayDate = "2026-09-29";
check(
  "a permit with no expiry recorded is neither lapsed nor valid",
  inductionLapsed(person({ inductionExpires: null }), dayDate) === null,
  "unknown is its own answer and the register says so separately"
);
check(
  "a permit that expired before the day had lapsed",
  inductionLapsed(
    person({ inductionExpires: new Date("2026-09-01T12:00:00").getTime() }),
    dayDate
  ) === true
);
check(
  "a permit expiring after the day had not",
  inductionLapsed(
    person({ inductionExpires: new Date("2027-03-31T12:00:00").getTime() }),
    dayDate
  ) === false
);
check(
  "a permit expiring ON the day is still valid that day",
  inductionLapsed(
    person({ inductionExpires: new Date("2026-09-29T12:00:00").getTime() }),
    dayDate
  ) === false,
  "a permit is valid until the end of its expiry date, not until the morning of it"
);

/* ------------------------------------------------ 7. the times, and the day */

check("somebody still on site has no duration", onSiteMs(person()) === null);
check("a completed row does", onSiteMs(complete()) === LEFT - ARRIVED);
check(
  "a clock that went backwards cannot produce a negative duration",
  onSiteMs(person({ departedAt: ARRIVED - 1000 })) === 0
);
check(
  "a departure before its arrival is reported rather than corrected",
  timesDisagree(person({ departedAt: ARRIVED - 1000 })) === true,
  "the app does not know which of the two is the wrong one"
);
check("consistent times do not", timesDisagree(complete()) === false);
check("an open row cannot disagree", timesDisagree(person()) === false);

const mixed = day({
  entries: [complete(), person({ id: "e2", name: "P. Mahlangu" })],
});
check(
  "still on site is arrived-and-not-departed",
  stillOnSite(mixed).length === 1 && stillOnSite(mixed)[0].id === "e2"
);

/* ----------------------------------------------------- 8. what is still owed */

const gaps = entryGaps(person());
for (const f of ["organisation", "role", "induction confirmation", "signature"]) {
  check(`a bare row reports '${f}' missing`, gaps.includes(f));
}
check("a name IS enough to sign somebody in", !gaps.includes("name"));
check(
  "the arrival is already there, because it was stamped",
  !gaps.includes("arrival time"),
  "addAttendee records it; a blank time field gets a round number typed in at five o'clock"
);
check("a complete row owes nothing", entryGaps(complete()).length === 0,
  `got ${JSON.stringify(entryGaps(complete()))}`);

check(
  "an empty day says nobody is recorded",
  dayGaps(day()).includes("nobody recorded")
);
check(
  "a day with unsigned rows counts them",
  dayGaps(mixed).some((g) => /unsigned/.test(g))
);
check(
  "a day with people still on site says so",
  dayGaps(mixed).some((g) => /not signed out/.test(g))
);
check(
  "a day with no diary entry says so",
  dayGaps(mixed).includes("no diary entry")
);
check(
  "a finished day owes nothing",
  dayGaps(day({ entries: [complete()], diary: "Escorted from 07:10." })).length === 0,
  `got ${JSON.stringify(dayGaps(day({ entries: [complete()], diary: "x" })))}`
);

/* ----------------------------------------- 9. signatures only on this device */

check(
  "a signature with no record copy is reported",
  unbackedSignatures(day({ entries: [complete()] })).length === 1,
  "a signature that exists on one tablet goes with the tablet"
);
check(
  "one that has been backed up is not",
  unbackedSignatures(
    day({ entries: [complete({ signature: sig({ cloudUrl: "https://x/y.png" }) })] })
  ).length === 0
);
check(
  "and the screen tells the auditor before the tablet leaves site",
  /THE RECORD COPY IS NOT WIRED YET/.test(page) &&
    /COPY THE REGISTER OUT BEFORE/.test(page),
  "the upload queue does not walk signatures, so the warning must not imply a button that would clear it"
);

/* -------------------------------------------------------- 10. the day's text */

const bare = dayText(day(), ctx);
check("it names the form it is", bare.includes("TK-003 form 2"));
check("and the register it feeds", bare.includes("SF-005 sheet 4"));
check("and where it is held", bare.includes("J14"));
check("it says plainly that it settles no check-point", bare.includes("settles no check-point"));
check("an empty day states that, rather than printing a blank", bare.includes("— not recorded —"));
check("it carries the site", bare.includes("O.R. Tambo International Airport"));
check("it carries the date", bare.includes("2026-09-29"));

const full = dayText(
  day({ entries: [complete(), person({ id: "e2", name: "P. Mahlangu" })], diary: "MV rooms, Pier B." }),
  ctx
);
check("a signed row names its signature reference", full.includes("ATT-7K2P9_S01"));
check(
  "an unsigned row says NOT SIGNED rather than leaving the column off",
  full.includes("NOT SIGNED"),
  "a register that drops the signature column reads as though everybody signed"
);
check(
  "somebody who never signed out says so",
  full.includes("no departure recorded")
);
check(
  "an unconfirmed induction is stated, not omitted",
  full.includes("NOT CONFIRMED")
);
check(
  "a lapsed permit is called out on the day it lapsed",
  dayText(
    day({
      entries: [complete({ inductionExpires: new Date("2026-09-01T12:00:00").getTime() })],
    }),
    ctx
  ).includes("LAPSED ON THIS DATE")
);
check("the diary is in it", full.includes("MV rooms, Pier B."));
check(
  "each entry's location is in the text",
  full.includes("MV switchroom, Pier B")
);
check(
  "and what they did — the action-log half",
  full.includes("Inspected AGL vault; assisted P. Mahlangu with DB3 fuse replacement")
);
check(
  "who assisted whom is a sentence, not a second structured field",
  full.includes("assisted P. Mahlangu"),
  "\"maybe indicating who assisted with what\" — free text carries it without a link to maintain"
);
check(
  "an entry with nothing to say leaves the location and activity lines out, rather than printing them blank",
  !dayText(day({ entries: [person({ id: "e2", endedAt: LEFT })] }), ctx).includes("Location"),
  "these are optional; a blank 'Location — not recorded' on every silent row would be noise the diary already covers"
);
check("and what the day still owes", full.includes("STILL OWED"));

/* ---------------------------------------------------- 11. the store's guarantees */

check(
  "only a name is needed to sign somebody in",
  /addAttendee:\s*\(id: string, name: string, seed\?/.test(store)
);
check(
  "arrival is stamped by the store, not left to be typed",
  /addAttendee[\s\S]{0,900}arrivedAt: now/.test(store)
);
check("site days are persisted", /partialize[\s\S]{0,500}siteDays: s\.siteDays/.test(store));
check(
  "the persisted shape was versioned",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 16,
  "the version goes UP as later slices land — 17 was the evidence log"
);
check(
  "the migration defaults the slice rather than leaving it undefined",
  /from < 16[\s\S]{0,400}Array\.isArray\(st\.siteDays\)[\s\S]{0,80}st\.siteDays = \[\]/.test(store)
);
check(
  "and the key never moved",
  /name: "acsa-assurance-v1"/.test(store),
  "renaming it orphans every in-flight audit"
);

/* The FUNCTION BODY, not a window after the name — the selector following it is
   scoped by visit on purpose and a loose window reads that as this one's. */
const useSiteDaysBody = /export function useSiteDays[\s\S]*?\n}/.exec(store)?.[0] ?? "";
check(
  "the register is scoped by entity, NOT by visit",
  /d\.entity === entity/.test(useSiteDaysBody) && !/originVisit/.test(useSiteDaysBody),
  "the question is who was at this airport that day, not which audit it belonged to"
);
check(
  "days sort on the date string, not on when somebody opened the record",
  /a\.date < b\.date/.test(useSiteDaysBody),
  "a day opened late the following morning still belongs where its date puts it"
);
check(
  "deleting a day releases its signatures and photographs",
  /removeSiteDay[\s\S]{0,900}delBlobs\(\[\.\.\.keys, \.\.\.shots\]\)/.test(store)
);

/* ------------------------------------------------------------ 12. reachable */

check(
  "the register has a route",
  fs.existsSync(path.join(here, "..", "src", "app", "(app)", "attendance", "page.tsx"))
);
check('it is reachable from the shell', /router\.push\("\/attendance"\)/.test(shell));
check(
  "it is not a tenth entry in the nav bar",
  !/href:\s*"\/attendance"/.test(shell)
);
check(
  "a screen off the nav bar still has a heading of its own",
  /"\/attendance": "Site attendance and daily diary"/.test(shell)
);
const menuItems = [...shell.matchAll(/\{role !== "acsa" && \(\s*<MoreItem[\s\S]*?\/\>\s*\)\}/g)].map(
  (m) => m[0]
);
check(
  "ACSA, who are read-only across the audit, are not offered it",
  menuItems.some((m) => m.includes("Site attendance")),
  "every other destination is disabled for them; this one must not be the exception"
);
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">Site attendance/.test(page),
  "two h1s is the defect the a11y suite caught on the first two forms"
);
check(
  "the clock is read as an external system, not called during render",
  !/const now = Date\.now\(\)/.test(page) && /useNow\(\)/.test(page)
);
check(
  "a date input is parsed at local midday, not UTC midnight",
  /T12:00:00/.test(page),
  "midnight UTC lands on the previous day everywhere east of Greenwich"
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
