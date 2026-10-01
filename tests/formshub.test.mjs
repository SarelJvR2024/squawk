import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ALL FORMS, ONE LIST — Sarel: "have all forms easy to access, maybe in a
 *  calendar or some card type display."
 *
 *  Source-regex only, the same way every other page.tsx suite in this repo
 *  is checked: src/lib/formsIndex.ts imports useStore directly (a "use
 *  client" module built on zustand + idb-keyval), which is not something a
 *  plain Node process can safely execute outside the app — so this guards
 *  shape and wiring rather than running the hook. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const index = src("lib", "formsIndex.ts");
const hub = src("app", "(app)", "forms", "page.tsx");
const diary = src("app", "(app)", "diary", "page.tsx");
const shell = src("components", "AppShell.tsx");
const dashboard = src("app", "(app)", "dashboard", "page.tsx");
const picker = src("components", "ContactPicker.tsx");
const attendancePage = src("app", "(app)", "attendance", "page.tsx");
const interviewsPage = src("app", "(app)", "interviews", "page.tsx");
const ppePage = src("app", "(app)", "ppe", "page.tsx");
const siteAccessPage = src("app", "(app)", "site-access", "page.tsx");
const evidencePage = src("app", "(app)", "evidence", "page.tsx");
const isfPage = src("app", "(app)", "isf", "page.tsx");
const deepLink = src("lib", "deepLink.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/* ---------------------------------------------------- 1. the index itself */

check(
  "all seven form kinds are labelled",
  ["isf", "interview", "attendance", "diary", "ppe", "siteAccess", "evidence"].every((k) =>
    new RegExp(`${k}: "`).test(index)
  )
);
check("it reads every form slice from the store",
  /safetyFindings/.test(index) &&
    /interviewDays/.test(index) &&
    /siteDays/.test(index) &&
    /ppeChecks/.test(index) &&
    /siteAccessLogs/.test(index) &&
    /evidenceItems/.test(index)
);
check(
  "every slice is filtered to the entity in view",
  (index.match(/\.filter\(\([a-z]+\) => [a-z]+\.entity === entityCode\)/g) ?? []).length >= 6
);
check(
  "the diary row shares the attendance day's id rather than inventing a second record",
  /kind: "diary"[\s\S]{0,200}id: `\$\{d\.id\}-diary`/.test(index),
  "same SiteDay, a second row in the index — not a second container"
);
check(
  "ISF gaps are read from missingFields, the same function the ISF screen itself would use",
  /import \{ missingFields \} from "@\/lib\/isf"/.test(index) && /missingFields\(f\)/.test(index)
);
check(
  "rows are grouped and sorted newest day first",
  /export function groupByDate/.test(index) &&
    /a\.date < b\.date \? 1 : a\.date > b\.date \? -1/.test(index)
);

/* ------------------------------------------------------------- 2. the hub */

check("the hub has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "forms", "page.tsx")));
check("it is reachable from the shell", /router\.push\("\/forms"\)/.test(shell));
check("it is not another entry in the nav bar", !/href:\s*"\/forms"/.test(shell));
check("a screen off the nav bar still has a heading of its own", /"\/forms": "All forms"/.test(shell));
check(
  "it is the first item in the Forms group, ahead of each individual register",
  shell.indexOf('label="All forms"') < shell.indexOf('label="Interview records"') &&
    shell.indexOf('label="All forms"') < shell.indexOf('label="Site attendance"'),
  "nobody opening the menu should need to already know which form holds the record they want"
);
check(
  "the hub offers a tile for every form, not only a list of past records",
  ["isf", "interview", "attendance", "diary", "ppe", "siteAccess"].every((k) =>
    new RegExp(`kind: "${k}"`).test(hub)
  )
);
check(
  "ACSA, read-only across the audit, is offered only Safety",
  /role === "acsa" \? TILES\.filter\(\(t\) => t\.kind === "isf"\)/.test(hub)
);
check("it uses the shared index rather than re-deriving the rows", /useFormsIndex\(\)/.test(hub));
check("an empty programme says so plainly", /No forms recorded yet\./.test(hub));

/* -------------------------------------------------------------- 3. diary */

check("the diary has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "diary", "page.tsx")));
check("it is reachable from the shell", /router\.push\("\/diary"\)/.test(shell));
check("it is not another entry in the nav bar", !/href:\s*"\/diary"/.test(shell));
check("a screen off the nav bar still has a heading of its own", /"\/diary": "Daily diary"/.test(shell));
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">Daily diary<\/h2>/.test(diary)
);
check(
  "it opens or returns the SAME SiteDay attendance uses, not a second container",
  /useStore\(\(s\) => s\.openSiteDay\)/.test(diary) && !/openDiaryDay|addDiaryDay/.test(diary)
);
check(
  "attendance no longer carries the diary textarea — it moved here",
  !/DAILY DIARY" hint="what the day actually consisted of"/.test(attendancePage)
);

/* --------------------------------------------------------- 4. the dashboard */

check(
  "the dashboard panel links to the hub",
  /router\.push\("\/forms"\)/.test(dashboard) && /All forms, one list/.test(dashboard)
);
check(
  "the dashboard's tiles were extended with the new forms, not just the hub link",
  /label: "Daily diary"/.test(dashboard) &&
    /label: "PPE checks"/.test(dashboard) &&
    /label: "Site access logs"/.test(dashboard)
);

/* -------------------------------------------------------- 5. ContactPicker */

check("the component exists", fs.existsSync(path.join(here, "..", "src", "components", "ContactPicker.tsx")));
check("it reads the people directory", /useContacts\(\)/.test(picker));
check(
  "picking a known contact carries their id, organisation and role through",
  /contactId: c\.id/.test(picker) && /organisation: contactOrganisation\(c\)/.test(picker) && /role: c\.role\.trim\(\)/.test(picker)
);
check(
  "a name the directory does not have is still offered as its own row",
  /Add &ldquo;\{q\.trim\(\)\}&rdquo; as a new person/.test(picker),
  "not everyone who signs a register is in the directory yet"
);
check(
  "it is used on both the redesigned existing forms and the two new ones",
  /<ContactPicker/.test(attendancePage) && /<ContactPicker/.test(interviewsPage),
  "PPE and Site access are checked in their own suites"
);
check(
  "a typed name gets explicit empty organisation and role, not an absent key",
  /onAdd\(\{ name, organisation: "", role: "" \}\);/.test(picker),
  'a caller spreading this as a seed over {organisation: "", ...seed} gets undefined back if the key is merely absent — a spread copies an explicit undefined same as any other value, see the PPE bug this guards'
);
check(
  "the control can be disabled outright, not just refused inside the handler",
  /disabled\?: boolean/.test(picker) &&
    /disabled=\{disabled\}/.test(picker) &&
    /open && !disabled && q\.trim\(\)/.test(picker),
  "a handler that silently early-returns after the picker already cleared its own input is how an auditor is told a person was added when they were not"
);

/* --------------------------------------------- 6. the silent-drop fix */

check(
  "interviews disables the pinned picker on a closed day or before the clock loads",
  /disabled=\{todaysDay\?\.closedAt != null \|\| !now\}/.test(interviewsPage)
);
check(
  "attendance disables the pinned picker before the clock loads",
  /disabled=\{!now\}/.test(attendancePage)
);
check(
  "ppe defaults a typed person's organisation and role rather than passing them through raw",
  /organisation: p\.organisation \?\? "", role: p\.role \?\? ""/.test(src("app", "(app)", "ppe", "page.tsx")),
  'belt-and-suspenders alongside the ContactPicker fix above — this call site is what actually shipped the bug'
);

/* ---------------------------- 7. click a row from the hub, land on the record --- */

/* Sarel: "display all completed forms in a timeline and allow to click and
   view and edit them." The hub already listed every record in a timeline;
   the gap was that a click only opened the general screen for that kind,
   leaving the specific day or occasion to be found again. */

check(
  "every row's href carries the record's own id, not just the screen",
  /href: `\/isf\?open=\$\{f\.id\}`/.test(index) &&
    /href: `\/interviews\?open=\$\{d\.id\}`/.test(index) &&
    /href: `\/attendance\?open=\$\{d\.id\}`/.test(index) &&
    /href: `\/ppe\?open=\$\{c\.id\}`/.test(index) &&
    /href: `\/site-access\?open=\$\{l\.id\}`/.test(index) &&
    /href: `\/evidence\?open=\$\{e\.id\}`/.test(index)
);
check(
  "the diary row links by the shared SiteDay's real id, not the row's own suffixed id",
  /href: `\/diary\?open=\$\{d\.id\}`/.test(index),
  "the diary screen's openId compares against day.id — the -diary suffix from the row's own id would never match anything"
);

check(
  "the deep-link hook exists, reads ?open= once and strips it so it does not reopen on refresh",
  /export function useFormsHubDeepLink/.test(deepLink) &&
    /params\.get\("open"\)/.test(deepLink) &&
    /url\.searchParams\.delete\("open"\)/.test(deepLink)
);
check(
  "it is plain window.location, not the useSearchParams hook — a screen using it stays statically generated",
  !/useSearchParams\(/.test(deepLink)
);
check(
  "every register screen wires its own openId setter into the hook",
  [isfPage, interviewsPage, attendancePage, diary, ppePage, siteAccessPage, evidencePage].every((p) =>
    /useFormsHubDeepLink\(setOpenId\)/.test(p)
  )
);
check(
  "every register screen's row carries data-record-id so the hook can find and scroll to it",
  [isfPage, interviewsPage, attendancePage, ppePage, siteAccessPage, evidencePage].every((p) =>
    /data-record-id=\{[a-zA-Z]+\.id\}/.test(p)
  )
);
check(
  "the diary's pinned today panel and its list rows both carry data-record-id",
  /data-record-id=\{todaysDay\?\.id\}/.test(diary) && /data-record-id=\{day\.id\}/.test(diary)
);

/* --------------------------------- 8. a Completed / Needs attention filter --- */

check(
  "the hub offers a status filter alongside the kind filter",
  /type StatusFilter = "all" \| "completed" \| "needsAttention"/.test(hub)
);
check(
  "completed means nothing is still owed on the record, the same gapCount every row already carries",
  /status === "completed" \? r\.gapCount === 0 : r\.gapCount > 0/.test(hub)
);
check(
  "the default is All — the status filter narrows, it does not hide anything by default",
  /const \[status, setStatus\] = useState<StatusFilter>\("all"\)/.test(hub)
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
