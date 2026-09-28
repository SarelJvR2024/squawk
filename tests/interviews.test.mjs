import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Interview records — the contract's on-site audit phase, on the tablet.
 *
 *  This is the only record in the app whose subject is a named person rather
 *  than an asset, and that changes what "wrong" costs. A misread meter reading
 *  corrupts a trend. A misattributed sentence puts words in somebody's mouth
 *  under TPJV's letterhead, and the first time that person reads it, every
 *  other statement in the file becomes arguable.
 *
 *  So the suite guards six things, and five of them are EXECUTED rather than
 *  read, because each is a rule a reasonable-looking refactor could invert:
 *
 *    Summary is the default   Both directions of error are possible and they
 *                             are not equal. A verbatim answer filed as a
 *                             summary loses a little force; a paraphrase filed
 *                             as a quote loses the audit. The unmarked case
 *                             has to be the cautious one.
 *
 *    Attribution is both      A name without a role does not tell a reader
 *                             whether the speaker would know. A role without a
 *                             name cannot be checked by anybody. Either alone
 *                             is a quotation from nobody.
 *
 *    Testimony is not         A statement BEARS ON a check-point. It does not
 *    evidence                 answer one. There is no path from this screen to
 *                             a Response and this suite holds it shut, because
 *                             the thirty Practice check-points are exactly the
 *                             ones where "he said it gets done" is the easiest
 *                             thing in the world to file as compliance.
 *
 *    The confirmation dies    What the interviewee agreed to was the text as
 *    with the text            it was read back. A confirmation that survives an
 *                             edit is a signature on a document somebody
 *                             altered afterwards.
 *
 *    Clock unknown            Until the device's clock is read, `now` is 0. A
 *                             running interview must report no duration rather
 *                             than fifty-six years. Same class of bug as the
 *                             ISF overdue badge, guarded here before it
 *                             happened rather than after.
 *
 *    References never reused  Source-read plus executed. A report citing S02
 *                             must still mean that sentence next year. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "interviews", "page.tsx");
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
  DEFAULT_KIND,
  KIND_LABEL,
  PARTY_LABEL,
  checkIdsCited,
  citationBlockers,
  durationMs,
  interviewStage,
  interviewText,
  isAttributable,
  isCitable,
  missingFields,
  nextStatementRef,
} = await import(path.join(here, "..", "src", "lib", "interviews.ts"));

const STARTED = new Date("2026-09-29T10:05:00").getTime();
const note = (over = {}) => ({
  id: "n1",
  ref: "INT-7K2P9_S01",
  question: "",
  answer: "",
  kind: "summary",
  checkIds: [],
  createdAt: STARTED,
  updatedAt: STARTED,
  ...over,
});

/* Exactly what addInterview creates: only the name is filled in. */
const base = {
  id: "INT-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  name: "T. Nkosi",
  role: "",
  organisation: "",
  party: null,
  contact: "",
  location: "",
  discipline: null,
  startedAt: STARTED,
  endedAt: null,
  conductedBy: "Sarel Jansen van Rensburg",
  noticeGiven: false,
  confirmedAt: null,
  notes: [],
  attachments: [],
  createdAt: STARTED,
  updatedAt: STARTED,
};
const ctx = {
  siteName: "O.R. Tambo International Airport (FAOR)",
  siteCode: "ORTIA",
  visitId: "2026-09",
  portalId: (id) => id.replace("KSIA-", "ORTIA-"),
};

/* ------------------------------------------- 1. summary is the safe default */

check("a new statement is a SUMMARY, not a quote", DEFAULT_KIND === "summary",
  `got ${DEFAULT_KIND}`);
check("the store creates statements with that default, not its own literal",
  /addInterviewNote[\s\S]{0,700}kind: DEFAULT_KIND/.test(store),
  "a second copy of the default is a second answer to what an unmarked statement is");
check("both kinds are labelled for a reader, not left as field names",
  KIND_LABEL.quote === "Verbatim" && KIND_LABEL.summary === "Summary");

/* ----------------------------------------------- 2. attribution needs both */

check("a name with no role is not attributable",
  isAttributable({ ...base, role: "" }) === false);
check("a role with no name is not attributable",
  isAttributable({ ...base, name: "", role: "Facilities Manager" }) === false);
check("a name and a role together are",
  isAttributable({ ...base, role: "Facilities Manager" }) === true);
check("whitespace is not a name",
  isAttributable({ ...base, name: "   ", role: "Millwright" }) === false);

/* ------------------------------------------------- 3. citable, and why not */

const full = {
  ...base,
  role: "Facilities Manager",
  party: "ACSA",
  location: "Maintenance office, Pier B",
  noticeGiven: true,
  endedAt: STARTED + 1_500_000,
  notes: [note({ answer: "The round is walked every morning before 06:00." })],
};
check("a complete interview is citable", isCitable(full) === true,
  `blocked by ${JSON.stringify(citationBlockers(full))}`);
check("an interview with nothing recorded is not citable",
  isCitable({ ...full, notes: [] }) === false);
check("an interview whose subject was never told is not citable",
  isCitable({ ...full, noticeGiven: false }) === false);
check("and the register is told WHY, not merely that",
  citationBlockers({ ...full, noticeGiven: false }).includes(
    "not told a record was being kept"
  ));
check("a citable interview has no blockers", citationBlockers(full).length === 0);
check("blockers name the missing half of the attribution",
  citationBlockers({ ...full, role: "" }).includes("no role recorded"));

/* ------------------------------------------------ 4. testimony is not evidence */

check(
  "a statement BEARS ON check-points — the field is not called answers",
  /checkIds: string\[\]/.test(types) && /bears on them\. It does not answer them/i.test(types)
);
check(
  "the screen says so where the links are made",
  /BEARS ON — DOES NOT SETTLE/.test(page),
  "the label is the only thing standing between a quote and a compliance answer"
);
check(
  "the screen has NO path to a response, a status or a finding",
  !/setResponse|patchResponse|saveResponse|setStatus|addFinding|useResponses/.test(page),
  "an interview that can mark a check compliant is how 'he said it gets done' becomes a fact"
);
check(
  "the type says it in the doc comment, where the next person will read it",
  /TESTIMONY IS NOT EVIDENCE/.test(types)
);
check(
  "the composed record says it to ACSA too",
  interviewText(full, ctx).includes("does not settle")
);

/* -------------------------------- 5. the confirmation does not survive an edit */

check(
  "editing a statement clears the confirmation",
  /updateInterviewNote[\s\S]{0,1400}confirmedAt: null/.test(store),
  "a confirmation that outlives the words is a signature on an altered document"
);
check(
  "adding one clears it too",
  /addInterviewNote[\s\S]{0,1400}confirmedAt: null/.test(store)
);
check(
  "removing one clears it too",
  /removeInterviewNote[\s\S]{0,400}confirmedAt: null/.test(store)
);
check(
  "a statement's id, ref and createdAt cannot be patched",
  /updateInterviewNote[\s\S]{0,500}const \{ id: _i, ref: _r, createdAt: _c, \.\.\.safe \}/.test(
    store
  ),
  "a reference that comes to mean a different sentence is worse than no reference"
);
check(
  "the screen warns that it will happen, rather than doing it silently",
  /EDITING ANY STATEMENT CLEARS THIS/.test(page)
);

/* ------------------------------------------------ 6. the clock, before it is read */

check(
  "a running interview reports no duration while the clock is unread",
  durationMs(base, 0) === null,
  `got ${durationMs(base, 0)}`
);
check(
  "a running interview measures from startedAt once it is",
  durationMs(base, STARTED + 600_000) === 600_000
);
check(
  "an ended interview has a duration even with the clock unread",
  durationMs({ ...base, endedAt: STARTED + 900_000 }, 0) === 900_000
);
check(
  "a clock that went backwards cannot produce a negative duration",
  durationMs({ ...base, endedAt: STARTED - 5000 }, 0) === 0
);

/* -------------------------------------------------------- 7. stages and gaps */

check("a fresh interview is open", interviewStage(base) === "open");
check("ending it is a stage", interviewStage({ ...base, endedAt: STARTED + 1 }) === "ended");
check(
  "confirmation outranks ending",
  interviewStage({ ...base, endedAt: STARTED + 1, confirmedAt: STARTED + 2 }) === "confirmed"
);
check(
  "a confirmation with no end time still reads confirmed rather than open",
  interviewStage({ ...base, confirmedAt: STARTED + 2 }) === "confirmed",
  "the read-back happens while they are standing there; the end time is admin"
);

const gaps = missingFields(base);
for (const f of [
  "role",
  "who they answer to",
  "where",
  "what was said",
  "end time",
  "told a record was being kept",
]) {
  check(`a bare interview reports '${f}' missing`, gaps.includes(f));
}
check("a name IS enough to start one — it is not reported missing",
  !gaps.includes("name"));
check("a complete interview reports nothing missing",
  missingFields(full).length === 0, `got ${JSON.stringify(missingFields(full))}`);
check(
  "a contact number is a convenience, not a gap",
  !missingFields({ ...full, contact: "" }).includes("contact")
);

/* --------------------------------------------- 8. references, never reused */

check("the first statement is S01", nextStatementRef("INT-7K2P9", []) === "INT-7K2P9_S01");
check(
  "the next one follows",
  nextStatementRef("INT-7K2P9", [note({ ref: "INT-7K2P9_S01" })]) === "INT-7K2P9_S02"
);
check(
  "deleting S02 does not free S02",
  nextStatementRef("INT-7K2P9", [
    note({ ref: "INT-7K2P9_S01" }),
    note({ ref: "INT-7K2P9_S03" }),
  ]) === "INT-7K2P9_S04",
  "a citation that silently comes to mean a different sentence is the failure"
);
check(
  "photographs are prefixed by the interview's own id",
  /addInterviewAttachment[\s\S]{0,600}nextPhotoRef\(id, iv\.attachments\)/.test(store)
);

/* ----------------------------------------------------- 9. the cited check-points */

const multi = {
  ...full,
  notes: [
    note({ id: "a", ref: "INT-7K2P9_S01", checkIds: ["KSIA-CIV-052", "KSIA-ELE-005"] }),
    note({ id: "b", ref: "INT-7K2P9_S02", checkIds: ["KSIA-ELE-005", "KSIA-PSR-011"] }),
  ],
};
check(
  "every check-point cited across the interview, deduplicated",
  JSON.stringify(checkIdsCited(multi)) ===
    JSON.stringify(["KSIA-CIV-052", "KSIA-ELE-005", "KSIA-PSR-011"]),
  `got ${JSON.stringify(checkIdsCited(multi))}`
);
check("an interview citing nothing cites nothing", checkIdsCited(base).length === 0);

/* -------------------------------------------------------- 10. the read-back text */

const bare = interviewText(base, ctx);
check("the record says plainly that nobody was told", bare.includes("NOT RECORDED as having been told"));
check("an unrecorded role is stated, not omitted",
  bare.includes("Role") && bare.includes("— not recorded —"));
check("a still-running interview says so rather than showing a blank",
  bare.includes("still open"));
check("it says it has not been confirmed", bare.includes("NOT YET CONFIRMED"));
check("it carries the interview's id", bare.includes("INT-7K2P9"));
check("it carries the site", bare.includes("O.R. Tambo International Airport"));
check("it cites the scope, so the reader knows what it is",
  bare.includes("Scope of Work, Part C3"));

const text = interviewText(multi, ctx);
check("every statement is marked verbatim or summary",
  text.includes("[SUMMARY]"), "an unmarked paraphrase read back invites a yes about words nobody said");
check(
  "a verbatim statement is marked as one",
  interviewText(
    { ...full, notes: [note({ kind: "quote", answer: "We walk it every morning." })] },
    ctx
  ).includes("[VERBATIM]")
);
check(
  "check-points are printed in this site's numbering, not the canonical one",
  text.includes("ORTIA-CIV-052") && !text.includes("KSIA-CIV-052"),
  "a reader holding the ORTIA workbook cannot find a KSIA row"
);
check("a confirmed record says when", 
  interviewText({ ...full, confirmedAt: STARTED + 1_600_000 }, ctx).includes(
    "Read back and confirmed"
  ));
check("the party is named beside the organisation",
  PARTY_LABEL.contractor === "Contractor" &&
    interviewText({ ...full, organisation: "Bidvest", party: "contractor" }, ctx).includes(
      "Bidvest (Contractor)"
    ));

/* ----------------------------------------------------- 11. the store's guarantees */

check(
  "only a name is needed to start one",
  /addInterview:\s*\(name:\s*string,\s*seed\?/.test(store),
  "the signature must not grow required fields"
);
check(
  "id, entity and startedAt cannot be patched after the fact",
  /updateInterview[\s\S]{0,700}id: iv\.id[\s\S]{0,200}entity: iv\.entity[\s\S]{0,200}startedAt: iv\.startedAt/.test(
    store
  ),
  "an interview that can be re-dated afterwards is not a record"
);
check("interviews are persisted", /partialize[\s\S]{0,400}interviews: s\.interviews/.test(store));
check(
  "the persisted shape was versioned when the slice was added",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 15 &&
    /name: "acsa-assurance-v1"/.test(store),
  "the version goes UP as later slices land — 16 was the site-day register. " +
    "What must never change is the key, and what must never go backwards is 15"
);
check(
  "the migration defaults the slice rather than leaving it undefined",
  /from < 15[\s\S]{0,400}Array\.isArray\(st\.interviews\)[\s\S]{0,80}st\.interviews = \[\]/.test(
    store
  ),
  "undefined.map is a white screen on a tablet that hydrated last week"
);
/* The FUNCTION BODY, not a character window after its name: the selector that
   follows useInterviews in store.ts is useVisitHazards, which is scoped by
   visit on purpose, and a loose window reads its `originVisit` as this one's. */
const useInterviewsBody = /export function useInterviews[\s\S]*?\n}/.exec(store)?.[0] ?? "";
check(
  "the register is scoped by entity, NOT by visit",
  /iv\.entity === entity/.test(useInterviewsBody) &&
    !/originVisit/.test(useInterviewsBody),
  "who has already been asked is what the next team needs to know"
);
check(
  "removing a photograph removes its bytes",
  /removeInterviewAttachment[\s\S]{0,500}delBlob\(gone\.blobKey\)/.test(store)
);

/* ------------------------------------------------------------ 12. reachable */

check(
  "the interview register has a route",
  fs.existsSync(path.join(here, "..", "src", "app", "(app)", "interviews", "page.tsx"))
);
check('it is reachable from the shell', /router\.push\("\/interviews"\)/.test(shell));
check(
  "it is NOT a tenth entry in the nav bar",
  !/href:\s*"\/interviews"/.test(shell),
  "the bar already costs a swipe at eight; fourteen more forms cannot each take a slot"
);
check(
  "a screen off the nav bar still has a heading of its own",
  /OFF_NAV/.test(shell) && /"\/interviews": "Interview records"/.test(shell),
  "otherwise a screen reader announces the app's name where every other screen names the work"
);
/* The menu row itself, so the guard being read is the one wrapping THIS item
   and not some other `role !== "acsa"` further up the file. */
const interviewMenuItem =
  /\{role !== "acsa" && \(\s*<MoreItem[\s\S]*?\/interviews"\);? \}\}/.exec(shell)?.[0] ?? "";
check(
  "ACSA, who are read-only across the audit, are not offered it",
  interviewMenuItem.includes("Interview records"),
  "every other nav destination is disabled for them; this one must not be the exception"
);
check(
  "telling them a record is kept comes before writing anything down",
  page.indexOf("TELL THEM A RECORD IS BEING KEPT") < page.indexOf("WHAT WAS SAID"),
  "it belongs at the start of the conversation, not the end of the form"
);
check(
  "the clock is read as an external system, not called during render",
  !/const now = Date\.now\(\)/.test(page) && /useNow\(\)/.test(page)
);
check(
  "the thirty Practice check-points are offered first",
  /confirmedBy === "Practice"/.test(page) &&
    /Confirmed by practice/.test(page),
  "they are the ones an interview is the only evidence for"
);
check(
  "but every other check-point is still offered",
  /Every other check-point/.test(page),
  "an interview often speaks to a document check too, and hiding those files the sentence wrongly"
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
