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
  /contactId: c\.id/.test(picker) && /organisation: c\.department\.trim\(\)/.test(picker) && /role: c\.role\.trim\(\)/.test(picker)
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

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
