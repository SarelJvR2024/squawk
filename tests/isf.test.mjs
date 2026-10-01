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
  ISF_SIGNED_FIELDS,
  isfSignedFieldsChanged,
  isfStage,
  isVerbal,
  missingFields,
  noticeText,
  notifyGapMs,
  sameDay,
  unbackedIsfSignature,
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
  recordedBy: "Sarel Jansen van Rensburg",
  description: "Exposed busbar in the MV room, door standing open",
  location: "",
  locationDescription: "",
  discipline: null,
  assetSystem: null,
  riskToPersons: "",
  immediateAction: "",
  actualImpact: "",
  potentialImpact: "",
  urgency: null,
  severity: null,
  likelihood: null,
  ratingConfirmed: false,
  rootCause: "",
  actions: [],
  actionStatus: "Open",
  notifiedTo: "",
  notifiedMethod: null,
  notifiedAt: null,
  writtenTo: "",
  writtenIssuedAt: null,
  acsaManagerName: "",
  authorisedBy: "",
  authorisedSignature: null,
  attachments: [],
  findingId: null,
  closedAt: null,
  closedBy: "",
  closureNote: "",
  createdAt: RAISED_AT,
  updatedAt: RAISED_AT,
};
const sig = (over = {}) => ({
  ref: "ISF-7K2P9_ISF",
  blobKey: "sig-abc",
  signedName: "T. Nkosi",
  signedAt: RAISED_AT + 300000,
  width: 600,
  height: 264,
  bytes: 4000,
  ...over,
});
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
  "risk rating",
  "root cause",
  "authorised signature",
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
  severity: "B - Hazardous",
  likelihood: "4 - Occasional",
  ratingConfirmed: true,
  rootCause: "Maintenance backlog",
  authorisedSignature: sig(),
};
check("a complete finding reports nothing missing", missingFields(full).length === 0,
  `got ${JSON.stringify(missingFields(full))}`);

/* --------------------------------------------- 4b. the risk assessment and sign-off */

check(
  "ISF_SIGNED_FIELDS covers the substance, not the procedural fields",
  ISF_SIGNED_FIELDS.includes("description") &&
    ISF_SIGNED_FIELDS.includes("severity") &&
    ISF_SIGNED_FIELDS.includes("rootCause") &&
    !ISF_SIGNED_FIELDS.includes("notifiedTo") &&
    !ISF_SIGNED_FIELDS.includes("writtenTo") &&
    !ISF_SIGNED_FIELDS.includes("closedAt"),
  "notifiedTo/writtenTo/closure move after signing as a matter of course"
);
check(
  "changing the description invalidates the authorised signature",
  isfSignedFieldsChanged({ description: "Something else" }) === true
);
check(
  "changing the severity invalidates it",
  isfSignedFieldsChanged({ severity: "A - Catastrophic" }) === true
);
check("an empty patch invalidates nothing", isfSignedFieldsChanged({}) === false);
check(
  "marking the written notice issued does not invalidate it",
  isfSignedFieldsChanged({ writtenIssuedAt: RAISED_AT }) === false
);
check(
  "closing the finding does not invalidate it",
  isfSignedFieldsChanged({ closedAt: RAISED_AT, closedBy: "X" }) === false
);

check(
  "an unbacked authorised signature is reported",
  unbackedIsfSignature({ ...base, authorisedSignature: sig() }).length === 1
);
check(
  "one backed up to the record store is not",
  unbackedIsfSignature({ ...base, authorisedSignature: sig({ cloudUrl: "https://x" }) }).length === 0
);
check("no signature at all is not reported as unbacked", unbackedIsfSignature(base).length === 0);

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
check(
  "the notice carries the risk assessment — severity, likelihood, the agreed rating",
  fullNotice.includes("B - Hazardous") &&
    fullNotice.includes("4 - Occasional") &&
    fullNotice.includes("Maintenance backlog")
);
check(
  "an unconfirmed rating reads as not yet agreed, not a computed band",
  noticeText({ ...full, ratingConfirmed: false }, ctx).includes("not yet agreed"),
  "ratingConfirmed is set by tapping the matrix cell and by nothing else — see RecordActions"
);
check(
  "mitigating actions print as a numbered list when there are any",
  noticeText(
    {
      ...full,
      actions: [
        { id: "a1", action: "Replace the busbar cover", owner: "J. Dlamini", dueDate: "2026-10-15", status: "Open", discipline: "Electrical" },
      ],
    },
    ctx
  ).includes("Replace the busbar cover")
);
check(
  "a finding with no mitigating actions logged does not print an empty section",
  !fullNotice.includes("MITIGATING ACTIONS")
);
check(
  "the notice names the ACSA area or dept manager",
  noticeText({ ...full, acsaManagerName: "P. Mokoena" }, ctx).includes("P. Mokoena")
);
check(
  "an unsigned notice says so rather than omitting the authorised-by line",
  bareNotice.includes("AUTHORISED BY") && bareNotice.includes("NOT YET SIGNED")
);
check(
  "a signed notice carries the signature reference, not just a name",
  fullNotice.includes("ISF-7K2P9_ISF") && fullNotice.includes(sig().signedName)
);

/* ------------------------------------------------------- 6. the store's guarantees */

check(
  "only a description is needed to raise one",
  /addSafetyFinding:\s*\(description:\s*string,\s*seed\?/.test(store),
  "the signature must not grow required fields"
);
check(
  "id and entity cannot be patched after the fact",
  /updateSafetyFinding: \(id, p\) =>[\s\S]{0,1100}id:\s*f\.id[\s\S]{0,200}entity:\s*f\.entity[\s\S]{0,200}createdAt:\s*f\.createdAt/.test(
    store
  ),
  "a safety record that can be renamed to a different id or site is not a record"
);
check(
  "but raisedAt IS correctable — Sarel's field list asked for an editable date and time",
  !/updateSafetyFinding: \(id, p\) =>[\s\S]{0,400}raisedAt: f\.raisedAt/.test(store),
  "same reasoning as the PPE check: a finding backfilled from a paper note needs its own real raise time"
);
check(
  "safety findings are persisted",
  /partialize[\s\S]{0,400}safetyFindings:\s*s\.safetyFindings/.test(store)
);
check(
  "the persisted shape was versioned when the slice was added",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 14 &&
    /name: "acsa-assurance-v1"/.test(store),
  "the version goes UP as later slices land — 15 was the interview register. " +
    "What must never change is the key, and what must never go backwards is 14"
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
    /STILL NOT A FINDING/.test(types),
  'Sarel\'s 1 October field list added a B170 001M risk assessment, so the doc comment was rewritten to say the boundary still holds, not removed'
);

/* ---------------------------------------- 6b. the risk assessment in the store */

check(
  "the persisted shape was versioned to carry the risk assessment and sign-off",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 24
);
check(
  "a finding entered before the risk assessment existed backfills rather than reading undefined",
  /from < 24[\s\S]{0,1600}rootCause: f\.rootCause \?\? ""[\s\S]{0,300}actions: Array\.isArray\(f\.actions\) \? f\.actions : \[\]/.test(
    store
  )
);
check(
  "a patch that changes the signed substance clears the authorised signature",
  /updateSafetyFinding: \(id, p\) =>[\s\S]{0,1600}isfSignedFieldsChanged\(p\)[\s\S]{0,80}authorisedSignature: null/.test(
    store
  )
);
check(
  "signIsf mints a fixed, per-record reference and assigns it, not the screen",
  /signIsf: \(id, sig\) => \{[\s\S]{0,400}ref: `\$\{id\}_ISF`/.test(store)
);
check(
  "re-signing releases the previous mark's blob",
  /signIsf[\s\S]{0,500}previous\.blobKey !== sig\.blobKey\) void delBlob\(previous\.blobKey\)/.test(store)
);

/* --------------------------------------- 6c. Sarel's 1 October field list, on screen */

check(
  "the date and time are editable, not just stamped and read-only",
  /type="date"[\s\S]{0,120}value=\{dateInputValue\(f\.raisedAt\)\}/.test(page) &&
    /type="time"[\s\S]{0,120}value=\{timeInputValue\(f\.raisedAt\)\}/.test(page)
);
check("what happened is editable after raising, not only set at raise time", /WHAT HAPPENED/.test(page) && /patch\(f\.id, \{ description: e\.target\.value \}\)/.test(page));
check("identified by and recorded by are both captured", /IDENTIFIED BY/.test(page) && /RECORDED BY/.test(page));
check("a location description is captured alongside the short location", /LOCATION DESCRIPTION/.test(page));
check("the asset system is picked from the same taxonomy Hazards uses", /ASSET SYSTEM/.test(page) && /systemsAt\(entityCode\)/.test(page));
check("both impact questions are captured, as two distinct fields", /WHAT WAS THE IMPACT/.test(page) && /WHAT IS A POSSIBLE IMPACT/.test(page));
check(
  "the risk assessment reuses RecordActions — the same instrument as Findings and Hazards",
  /<RecordActions/.test(page) && /import RecordActions from "@\/components\/RecordActions"/.test(page)
);
check(
  "root-cause advice is wired in, not a second copy of the assistant prompt",
  /<RootCauseAdvice/.test(page) && /import RootCauseAdvice from "@\/components\/RootCauseAdvice"/.test(page)
);
check("urgency is captured from a fixed vocabulary", /URGENCIES\.map/.test(page));
check("the ACSA area or dept manager is captured", /AREA \/ DEPT MANAGER FROM ACSA/.test(page));
check(
  "the authorised person signs off, same Signature pattern as every other form",
  /AUTHORISED BY/.test(page) && /<SignaturePad/.test(page) && /signFinding\(f\.id, s\)/.test(page)
);
check(
  "an unbacked authorised signature warns before the tablet leaves site",
  /unbackedIsfSignature\(f\)\.length/.test(page)
);

/* ---------------------------------------------------------- 7. reachable, one clock */

check("the safety register has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "isf", "page.tsx")));
/* THEN: Safety was its own entry in the nav bar, href: "/isf".
   NOW (30 Sep): Sarel — "move safety and review menu items out of the main
   menu bar." It moved to the More menu, reached by router.push rather than
   an href in NAV; OFF_NAV keeps the page's own heading saying "Safety". */
check(
  'reachable, now from the More menu',
  /router\.push\("\/isf"\)/.test(shell) && /"\/isf": "Safety"/.test(shell)
);
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
