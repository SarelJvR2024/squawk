import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Interview records — one register per site per day, rebuilt 28 September
 *  2026 on Sarel's word watching the earlier version live: "this is too
 *  formal, we just need a record of who we interview on which day, what the
 *  location was, from and to. and space for their signature and an approval
 *  at the end to close of the record of the days interviews."
 *
 *  Shaped exactly like site attendance, so this suite guards the same class
 *  of rule, executed rather than read wherever a plausible refactor could
 *  invert it:
 *
 *    One day, one record    openInterviewDay opens or returns; the screen has
 *                           no control that could ask for a second register
 *                           for the same date.
 *
 *    A signature signs a    Name, role, location — patch any of those and the
 *    statement              mark is cleared. The TIMES are deliberately
 *                           outside that list, in both directions: ending an
 *                           interview hours later must not wipe a signature
 *                           given at the time.
 *
 *    The day closes on an   dayCanClose refuses while anybody is still
 *    approval, not a tally  running or nothing is recorded — the approval is
 *                           a statement that the list is complete, not a
 *                           head-count. Signing every entry is NOT required
 *                           to close: a person who declined to sign is still
 *                           an honest record of the day.
 *
 *    References never       Deleting S01 does not free S01, for entries and
 *    reused                 for the closing approval alike. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "interviews", "page.tsx");
const shell = src("components", "AppShell.tsx");
const hub = src("app", "(app)", "forms", "page.tsx");

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
  dayCanClose,
  dayGaps,
  dayText,
  durationMs,
  entryGaps,
  interviewDayStage,
  isSigned,
  nextSignatureRef,
  patchInvalidatesSignature,
  stillRunning,
  unbackedSignatures,
} = await import(path.join(here, "..", "src", "lib", "interviews.ts"));

const STARTED = new Date("2026-09-29T10:05:00").getTime();
const ENDED = STARTED + 20 * 60000;

const sig = (over = {}) => ({
  ref: "INT-7K2P9_S01",
  blobKey: "sig-abc",
  signedName: "T. Nkosi",
  signedAt: ENDED,
  width: 600,
  height: 264,
  bytes: 4000,
  ...over,
});

/* Exactly what addInterviewEntry creates: a name and a stamped start. */
const entry = (over = {}) => ({
  id: "e1",
  name: "T. Nkosi",
  role: "",
  location: "",
  startedAt: STARTED,
  endedAt: null,
  signature: null,
  createdAt: STARTED,
  updatedAt: STARTED,
  ...over,
});

const complete = (over = {}) =>
  entry({
    role: "Facilities Manager",
    location: "Maintenance office, Pier B",
    endedAt: ENDED,
    signature: sig(),
    ...over,
  });

const day = (over = {}) => ({
  id: "INT-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  date: "2026-09-29",
  openedAt: STARTED,
  openedBy: "Sarel Jansen van Rensburg",
  entries: [],
  closedAt: null,
  closedBy: "",
  closeSignature: null,
  createdAt: STARTED,
  updatedAt: STARTED,
  ...over,
});

const ctx = {
  siteName: "O.R. Tambo International Airport (FAOR)",
  siteCode: "ORTIA",
  visitId: "2026-09",
};

/* --------------------------------------------------- 1. one day, one record */

check(
  "opening a day returns the existing one rather than making a second",
  /openInterviewDay[\s\S]{0,900}const existing = s0\.interviewDays\.find\([\s\S]{0,200}if \(existing\) return existing\.id/.test(
    store
  ),
  "two registers for one day both look complete and only one gets exported"
);
check(
  "matched on entity AND date",
  /openInterviewDay[\s\S]{0,900}d\.entity === s0\.entity && d\.date === day/.test(store)
);
check(
  "a day's date cannot be patched afterwards",
  /updateInterviewDay[\s\S]{0,700}id: d\.id[\s\S]{0,200}entity: d\.entity[\s\S]{0,200}date: d\.date/.test(
    store
  )
);
check(
  "the screen has no control that could ask for a duplicate",
  !/addInterviewDay|createInterviewDay/.test(page) && /openInterviewDay/.test(page)
);

/* -------------------------------- 2. what a signature signs for, and what not */

check(
  "the signed statement is name, role and location",
  JSON.stringify([...SIGNED_FIELDS]) === JSON.stringify(["name", "role", "location"]),
  `got ${JSON.stringify([...SIGNED_FIELDS])}`
);
check("changing the name invalidates it", patchInvalidatesSignature({ name: "X" }) === true);
check("changing the role invalidates it", patchInvalidatesSignature({ role: "X" }) === true);
check(
  "changing the location invalidates it",
  patchInvalidatesSignature({ location: "X" }) === true
);
check(
  "ENDING THE INTERVIEW DOES NOT",
  patchInvalidatesSignature({ endedAt: ENDED }) === false,
  "the person may sign before or after the clock is stopped; neither wipes the other"
);
check(
  "nor does correcting the start time",
  patchInvalidatesSignature({ startedAt: STARTED + 60000 }) === false
);
check("an empty patch invalidates nothing", patchInvalidatesSignature({}) === false);
check(
  "the store clears the signature when the patch says so",
  /updateInterviewEntry[\s\S]{0,700}interviewPatchInvalidatesSignature\(safe\)[\s\S]{0,300}invalidates \? \{ signature: null \}/.test(
    store
  )
);
check(
  "and the signature cannot be set by a stray patch",
  /updateInterviewEntry[\s\S]{0,400}const \{ id: _i, createdAt: _c, signature: _s, \.\.\.safe \}/.test(
    store
  ),
  "signing goes through signInterviewEntry, which is where the reference is assigned"
);

/* -------------------------------------------- 3. a typed name is not a signature */

check("a bare entry is not signed", isSigned(entry()) === false);
check("a stored mark is signed", isSigned(complete()) === true);
check(
  "a signature object with no bytes behind it is NOT signed",
  isSigned(entry({ signature: sig({ blobKey: "" }) })) === false
);

/* -------------------------------------------- 4. references, never reused */

check("the first signature on a day is S01", nextSignatureRef("INT-7K2P9", []) === "INT-7K2P9_S01");
check(
  "numbering runs across the day",
  nextSignatureRef("INT-7K2P9", [complete(), entry({ id: "e2" })]) === "INT-7K2P9_S02"
);
check(
  "re-signing does not reuse the old reference",
  nextSignatureRef("INT-7K2P9", [
    complete({ signature: sig({ ref: "INT-7K2P9_S01" }) }),
    entry({ id: "e2", signature: sig({ ref: "INT-7K2P9_S03" }) }),
  ]) === "INT-7K2P9_S04"
);
check(
  "the store assigns the reference, not the pad",
  /signInterviewEntry[\s\S]{0,600}nextInterviewSignatureRef\(id, d\.entries\)/.test(store)
);
check(
  "a superseded mark's bytes are released",
  /signInterviewEntry[\s\S]{0,1200}previous\.blobKey !== sig\.blobKey[\s\S]{0,80}delBlob\(previous\.blobKey\)/.test(
    store
  )
);

/* ---------------------------------------- 5. the day closes on an approval */

check("a day with nobody recorded cannot close", dayCanClose(day()) === false);
check(
  "a day with somebody still running cannot close",
  dayCanClose(day({ entries: [entry()] })) === false,
  "an interview mid-conversation is not a complete list yet"
);
check(
  "a day where everybody has ended CAN close, signed or not",
  dayCanClose(day({ entries: [complete(), entry({ id: "e2", endedAt: ENDED, signature: null })] })) ===
    true,
  "a person who declined to sign is still an honest record of the day"
);
check(
  "the store refuses to close a day that cannot close",
  /closeInterviewDay[\s\S]{0,400}if \(!d \|\| d\.entries\.length === 0 \|\| d\.entries\.some\(\(e\) => !e\.endedAt\)\) return/.test(
    store
  ),
  "guarded in the store too, not only by the screen disabling the button"
);
check(
  "the closing approval gets its own reference",
  /closeInterviewDay[\s\S]{0,600}ref: `\$\{id\}_APPROVAL`/.test(store)
);
check(
  "reopening releases the approval signature's bytes",
  /reopenInterviewDay[\s\S]{0,300}delBlob\(d\.closeSignature\.blobKey\)/.test(store)
);
check(
  "the screen disables the close button until the day can close",
  /disabled=\{!canClose\}/.test(page)
);
check(
  "closing is offered without a drawn signature too",
  /Close without drawing a signature/.test(page),
  "the approval is real the moment it is pressed; the mark is a stronger record, not a requirement"
);

/* --------------------------------------------------------- 6. what is owed */

const gaps = entryGaps(entry());
for (const f of ["location", "end time", "signature"]) {
  check(`a bare entry reports '${f}' missing`, gaps.includes(f));
}
check("a name IS enough to start one", !gaps.includes("name"));
check("a role is NOT reported missing — it is optional", !entryGaps(entry({ role: "" })).includes("role"));
check("a complete entry owes nothing", entryGaps(complete()).length === 0,
  `got ${JSON.stringify(entryGaps(complete()))}`);

check("an empty day says nobody is recorded", dayGaps(day()).includes("nobody recorded"));
const mixed = day({ entries: [complete(), entry({ id: "e2", endedAt: ENDED })] });
check("a day with an unsigned entry counts it", dayGaps(mixed).some((g) => /unsigned/.test(g)));
check(
  "a day with somebody still running counts it",
  dayGaps(day({ entries: [entry()] })).some((g) => /still running/.test(g))
);
check(
  "a day where everyone is done and signed owes nothing",
  dayGaps(day({ entries: [complete()] })).length === 0
);

/* ------------------------------------------------------- 7. running, timed */

check("a running interview reports no duration while the clock is unread",
  durationMs(entry(), 0) === null);
check("it measures from startedAt once the clock is read",
  durationMs(entry(), STARTED + 600000) === 600000);
check("an ended interview has a duration even with the clock unread",
  durationMs(complete(), 0) === ENDED - STARTED);
check("a clock that went backwards cannot produce a negative duration",
  durationMs(entry({ endedAt: STARTED - 5000 }), 0) === 0);
check(
  "still running is started-and-not-ended",
  stillRunning(mixed).length === 0,
  "both entries in this fixture have ended"
);
check(
  "and it finds the one that has not",
  stillRunning(day({ entries: [complete(), entry({ id: "e2" })] })).length === 1
);

/* ------------------------------------------------------- 8. the closed stage */

check("a fresh day is open", interviewDayStage(day()) === "open");
check("a closed one reads closed", interviewDayStage(day({ closedAt: ENDED })) === "closed");

/* -------------------------------------------------------- 9. the day as text */

const bare = dayText(day(), ctx);
check("it says nobody has been recorded", bare.includes("— not recorded —"));
check("it says the record is not yet closed", bare.includes("NOT YET CLOSED"));
check("it carries the id and the date", bare.includes("INT-7K2P9") && bare.includes("2026-09-29"));
check("it carries the site", bare.includes("O.R. Tambo International Airport"));

const full = dayText(
  day({
    entries: [complete(), entry({ id: "e2", name: "P. Mahlangu", endedAt: ENDED })],
    closedAt: ENDED + 60000,
    closedBy: "Sarel Jansen van Rensburg",
    closeSignature: sig({ ref: "INT-7K2P9_APPROVAL" }),
  }),
  ctx
);
check("a signed entry names its reference", full.includes("INT-7K2P9_S01"));
check("an unsigned entry says NOT SIGNED rather than a blank line", full.includes("NOT SIGNED"));
check("the location is printed", full.includes("Maintenance office, Pier B"));
check("closure names who approved it", full.includes("Sarel Jansen van Rensburg"));
check("and the approval's own reference", full.includes("INT-7K2P9_APPROVAL"));
check(
  "it cites the scope, so the reader knows what it is",
  full.includes("Scope of Work, Part C3")
);
check(
  "testimony is nowhere in it — this is not that kind of record",
  !/BEARS ON|VERBATIM|SUMMARY|citab/i.test(full)
);

/* ----------------------------------------- 10. signatures only on this device */

check(
  "an entry signature with no record copy is reported",
  unbackedSignatures(day({ entries: [complete()] })).length === 1
);
check(
  "and so is an unbacked approval signature",
  unbackedSignatures(day({ closeSignature: sig() })).length === 1
);
check(
  "one that has been backed up is not",
  unbackedSignatures(day({ entries: [complete({ signature: sig({ cloudUrl: "https://x" }) })] }))
    .length === 0
);
check(
  "the screen does not imply a sync button that would clear it",
  /THE RECORD COPY IS NOT WIRED YET/.test(page)
);

/* --------------------------------------------------- 11. the store's guarantees */

check(
  "only a name is needed to start one",
  /addInterviewEntry:\s*\(id: string, name: string, seed\?/.test(store)
);
check(
  "the entry is stamped with a start as of now",
  /addInterviewEntry[\s\S]{0,700}startedAt: now/.test(store)
);
check(
  "id, entity and date cannot be patched on the day",
  /updateInterviewDay[\s\S]{0,700}id: d\.id[\s\S]{0,200}entity: d\.entity[\s\S]{0,200}date: d\.date/.test(
    store
  )
);
check("interview days are persisted", /partialize[\s\S]{0,600}interviewDays: s\.interviewDays/.test(store));
check(
  "the persisted shape was versioned",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 18 &&
    /name: "acsa-assurance-v1"/.test(store)
);
check(
  "the migration defaults the slice rather than leaving it undefined",
  /from < 18[\s\S]{0,500}Array\.isArray\(st\.interviewDays\)[\s\S]{0,80}st\.interviewDays = \[\]/.test(
    store
  )
);
check(
  "removing a day releases every signature it carries",
  /removeInterviewDay[\s\S]{0,700}delBlobs\(keys\)/.test(store)
);

const useInterviewDaysBody = /export function useInterviewDays[\s\S]*?\n}/.exec(store)?.[0] ?? "";
check(
  "the register is scoped by entity, NOT by visit",
  /d\.entity === entity/.test(useInterviewDaysBody) && !/originVisit/.test(useInterviewDaysBody)
);
check(
  "days sort on the date string, not on when the record was opened",
  /a\.date < b\.date/.test(useInterviewDaysBody)
);

/* ------------------------------------------------------------ 12. reachable */

check(
  "the register has a route",
  fs.existsSync(path.join(here, "..", "src", "app", "(app)", "interviews", "page.tsx"))
);
check("it is reachable from the Forms hub", /href: "\/interviews"/.test(hub));
check("it is not another entry in the nav bar", !/href:\s*"\/interviews"/.test(shell));
check(
  "a screen off the nav bar still has a heading of its own",
  /"\/interviews": "Interview records"/.test(shell)
);
check(
  "it is not reachable directly from the shell's own menu any more",
  !/label="Interview records"/.test(shell)
);
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">Interview records<\/h2>/.test(page)
);
check(
  "the clock is read as an external system, not called during render",
  !/const now = Date\.now\(\)/.test(page) && /useNow\(\)/.test(page)
);
check(
  "the local-date helper is imported from attendance rather than duplicated",
  /import \{ localDate \} from "@\/lib\/attendance"/.test(page)
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
