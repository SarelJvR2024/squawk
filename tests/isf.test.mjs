import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Immediate Safety Findings — TK-003 form 1 on the tablet.
 *
 *  This is the only record in the app where being wrong can mean somebody is
 *  hurt and nobody was told. SWP-07 sets the sequence — stop, make safe only if
 *  it can be done without risk, notify the ACSA site representative VERBALLY AT
 *  ONCE, complete the form, issue written notification THE SAME DAY — and the
 *  scope of work says the same from ACSA's side: "all safety related findings
 *  picked up during the audit must be reported immediately".
 *
 *  So this suite guards five things, and four of them are EXECUTED rather than
 *  read, because each is a rule a plausible-looking refactor could quietly
 *  invert:
 *
 *    Verbal means verbal   "Notify VERBALLY at once" is not discharged by a
 *                          WhatsApp. A message is still recorded — what
 *                          happened is worth knowing — but it must not move the
 *                          finding out of `raised`, because `raised` is the
 *                          state the register shouts about.
 *
 *    Clock unknown         Until the device's clock is read, `now` is 0. An
 *                          unissued notice must read "unknown", not "late": an
 *                          overdue badge that appears on the first frame and
 *                          vanishes on the second is worse than one that never
 *                          appeared, because somebody saw it and watched it go.
 *                          This was a real bug, caught before it shipped.
 *
 *    Closed wins           An escort can make an area safe before anybody has
 *                          written anything. A register that still called that
 *                          "raised" would be chasing a risk that is gone.
 *
 *    The notice is honest  It states what is unknown instead of omitting it. A
 *                          notice that silently leaves out the immediate action
 *                          reads as though none was taken, and it goes to the
 *                          client under TPJV's name.
 *
 *    One field to raise    Source-read. The person raising this is standing in
 *                          front of the thing; a form that demands every field
 *                          first is a form filled in that evening from memory. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "isf", "page.tsx");
const shell = src("components", "AppShell.tsx");
const clock = src("lib", "clock.ts");
const home = src("app", "(app)", "home", "page.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const {
  isfStage,
  isVerbal,
  missingFields,
  noticeText,
  notifyGapMs,
  sameDay,
  writtenStatus,
} = await import(path.join(here, "..", "src", "lib", "isf.ts"));

/* A finding with every field empty, which is exactly what `addSafetyFinding`
   creates: only the description is required to raise one. */
const RAISED_AT = new Date("2026-09-29T09:15:00").getTime();
const base = {
  id: "ISF-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  raisedAt: RAISED_AT,
  raisedBy: "Sarel Jansen van Rensburg",
  description: "Exposed busbar in the MV room, door standing open",
  location: "",
  discipline: null,
  riskToPersons: "",
  immediateAction: "",
  notifiedTo: "",
  notifiedMethod: null,
  notifiedAt: null,
  writtenTo: "",
  writtenIssuedAt: null,
  attachments: [],
  findingId: null,
  closedAt: null,
  closedBy: "",
  closureNote: "",
  createdAt: RAISED_AT,
  updatedAt: RAISED_AT,
};
const ctx = { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" };

/* ---------------------------------------------------------- 1. verbal only */

check("in-person counts as verbal notification", isVerbal("in-person") === true);
check("phone counts as verbal notification", isVerbal("phone") === true);
check("radio counts as verbal notification", isVerbal("radio") === true);
check(
  "a message does NOT satisfy SWP-07's verbal notification",
  isVerbal("message") === false
);
check("an e-mail does NOT satisfy SWP-07's verbal notification", isVerbal("email") === false);
check("no method at all is not verbal", isVerbal(null) === false);

const messaged = { ...base, notifiedMethod: "message", notifiedAt: RAISED_AT + 60000 };
check(
  "a finding notified only by message stays at 'raised'",
  isfStage(messaged) === "raised",
  `got ${isfStage(messaged)}`
);
const phoned = { ...base, notifiedMethod: "phone", notifiedAt: RAISED_AT + 60000 };
check("a finding notified by phone reaches 'notified'", isfStage(phoned) === "notified");

/* ------------------------------------------------- 2. the clock before it is read */

check(
  "an unissued notice reads 'unknown' while the clock is unread",
  writtenStatus(base, 0) === "unknown",
  `got ${writtenStatus(base, 0)}`
);
check(
  "an unissued notice raised today is 'dueToday'",
  writtenStatus(base, RAISED_AT + 3600000) === "dueToday"
);
check(
  "an unissued notice raised yesterday is 'late'",
  writtenStatus(base, RAISED_AT + 86400000) === "late"
);
check(
  "an issued notice reads 'issued' even with the clock unread",
  writtenStatus({ ...base, writtenIssuedAt: RAISED_AT + 1000 }, 0) === "issued"
);
check(
  "same day is judged locally, not in UTC",
  sameDay(
    new Date("2026-09-29T02:00:00").getTime(),
    new Date("2026-09-29T23:00:00").getTime()
  ) === true
);

/* ------------------------------------------------------------ 3. closed wins */

const closedUnnotified = { ...base, closedAt: RAISED_AT + 120000 };
check(
  "a closed finding reads 'closed' even if nobody was ever notified",
  isfStage(closedUnnotified) === "closed",
  `got ${isfStage(closedUnnotified)}`
);
check("a bare finding reads 'raised'", isfStage(base) === "raised");
check(
  "issued outranks notified",
  isfStage({ ...phoned, writtenIssuedAt: RAISED_AT + 200000 }) === "issued"
);

/* ------------------------------------------------- 4. the gap, and what is missing */

check("the notify gap is null until somebody is told", notifyGapMs(base) === null);
check("the notify gap is measured from raisedAt", notifyGapMs(phoned) === 60000);
check(
  "a clock that went backwards cannot produce a negative gap",
  notifyGapMs({ ...base, notifiedAt: RAISED_AT - 5000 }) === 0
);

const gaps = missingFields(base);
for (const f of [
  "location",
  "risk to persons",
  "immediate action",
  "verbal notification",
  "written notice",
  "photograph",
]) {
  check(`a bare finding reports '${f}' missing`, gaps.includes(f));
}
const full = {
  ...phoned,
  notifiedTo: "T. Nkosi, Airport Manager",
  location: "MV switchroom, Pier B",
  riskToPersons: "Anyone entering could contact live parts",
  immediateAction: "Withdrew, warned two staff, escort locked the door",
  writtenIssuedAt: RAISED_AT + 200000,
  attachments: [{ id: "a1", kind: "photo", name: "p.jpg", ref: "ISF-7K2P9_P01", createdAt: 1 }],
};
check("a complete finding reports nothing missing", missingFields(full).length === 0,
  `got ${JSON.stringify(missingFields(full))}`);

/* --------------------------------------------------------- 5. the written notice */

const bareNotice = noticeText(base, ctx);
check(
  "the notice says plainly that nobody has been notified yet",
  bareNotice.includes("NOT YET NOTIFIED")
);
check(
  "the notice refuses to stand in for the verbal notification",
  bareNotice.includes("does not replace the verbal notification")
);
check(
  "an unrecorded immediate action is stated, not omitted",
  bareNotice.includes("IMMEDIATE ACTION TAKEN") && bareNotice.includes("— not recorded —")
);
check("the notice carries the finding's id", bareNotice.includes("ISF-7K2P9"));
check("the notice carries the site", bareNotice.includes("O.R. Tambo International Airport"));
check(
  "the notice cites SWP-07 and the scope, so the reader knows what it is",
  bareNotice.includes("SWP-07") && bareNotice.includes("Part C3")
);

const fullNotice = noticeText(full, ctx);
check(
  "a notified finding's notice names who was told and how",
  fullNotice.includes("T. Nkosi") && fullNotice.includes("Telephone")
);
check(
  "the notice lists photograph references so the reader can ask for them",
  fullNotice.includes("ISF-7K2P9_P01")
);
check(
  "a notified finding's notice drops the not-yet-notified warning",
  !fullNotice.includes("NOT YET NOTIFIED")
);

/* ------------------------------------------------------- 6. the store's guarantees */

check(
  "only a description is needed to raise one",
  /addSafetyFinding:\s*\(description:\s*string,\s*seed\?/.test(store),
  "the signature must not grow required fields"
);
check(
  "id, entity and raisedAt cannot be patched after the fact",
  /updateSafetyFinding[\s\S]{0,700}id:\s*f\.id[\s\S]{0,200}entity:\s*f\.entity[\s\S]{0,200}raisedAt:\s*f\.raisedAt/.test(
    store
  ),
  "a safety record that can be back-dated is not a record"
);
check(
  "safety findings are persisted",
  /partialize[\s\S]{0,400}safetyFindings:\s*s\.safetyFindings/.test(store)
);
check(
  "the persisted shape was versioned when the slice was added",
  /version:\s*14,/.test(store)
);
check(
  "the migration defaults the slice rather than leaving it undefined",
  /from < 14[\s\S]{0,400}Array\.isArray\(st\.safetyFindings\)[\s\S]{0,80}st\.safetyFindings = \[\]/.test(
    store
  ),
  "undefined.filter is a white screen on the apron"
);
check(
  "photographs are referenced by the finding's own id",
  /addIsfAttachment[\s\S]{0,600}nextPhotoRef\(id, f\.attachments\)/.test(store)
);
check(
  "removing a photograph removes its bytes",
  /removeIsfAttachment[\s\S]{0,500}delBlob\(gone\.blobKey\)/.test(store)
);
check(
  "the register is scoped by entity, NOT by visit",
  /useSafetyFindings[\s\S]{0,600}f\.entity === entity/.test(store) &&
    !/useSafetyFindings[\s\S]{0,600}originVisit === visit/.test(store),
  "an ISF left open by the last visit is what the next team needs to see"
);
check(
  "an ISF is its own record and not a Finding",
  /export interface SafetyFinding/.test(types) &&
    /This is NOT a Finding/.test(types)
);

/* ---------------------------------------------------------- 7. reachable, one clock */

check("the safety register has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "isf", "page.tsx")));
check('the nav carries it', /href:\s*"\/isf"/.test(shell));
check(
  "the notify control comes before the rest of the form",
  page.indexOf("TELL THE ACSA REPRESENTATIVE") < page.indexOf("IMMEDIATE RISK TO PERSONS"),
  "SWP-07 asks for the notification first and so should the screen"
);
check(
  "the clock is read as an external system, not called during render",
  !/const now = Date\.now\(\)/.test(page) && /useNow\(\)/.test(page)
);
check(
  "there is ONE clock, shared",
  /export function useNow/.test(clock) &&
    /useNow/.test(home) &&
    !/const clockSubs = new Set/.test(home),
  "two clocks is two answers to whether a notice is overdue"
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
