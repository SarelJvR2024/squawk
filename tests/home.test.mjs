import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The home screen is an ORIENTATION screen, and the three ways it could stop
 * being one are all invisible from a screenshot.
 *
 *   It could start counting the register. Every other list screen in this repo
 *   has had that bug: 324 is the checklist at three of the ten sites and the
 *   denominator at none of the other seven, so a literal count or a read of
 *   CHECKS produces a percentage that is simply wrong at Corporate Office and
 *   says nothing about it.
 *
 *   It could become a second dashboard. /dashboard is the analytical view —
 *   compliance, the B170 001M risk profile, movement against 2025, the
 *   portfolio table. Two screens showing the same figures is how they come to
 *   disagree, and the one nobody maintains is the one people read.
 *
 *   Its map of the system could drift from the system. The flow strip names
 *   seven screens and their routes; a route renamed with the strip left behind
 *   is a landing page confidently pointing at a 404, which is worse than no
 *   map at all.
 *
 * It reads the source, as risk-matrix, capture and scope do, because all three
 * failures are in what the code says rather than in what it renders. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = (...p) => fs.readFileSync(path.join(root, "src", ...p), "utf8");

const home = src("app", "(app)", "home", "page.tsx");
const dashboard = src("app", "(app)", "dashboard", "page.tsx");
const shell = src("components", "AppShell.tsx");
const store = src("lib", "store.ts");
const rootPage = src("app", "page.tsx");
const manifest = src("app", "manifest.ts");
const sw = fs.readFileSync(path.join(root, "public", "sw.js"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* -------------------------------------- Part 1: the screen exists and lands */

check(
  "the home screen is its own route under the app shell",
  fs.existsSync(path.join(root, "src", "app", "(app)", "home", "page.tsx")),
  "it must sit inside (app) or it gets no masthead, no nav and no h1"
);

check(
  "the bare address lands on it",
  /redirect\("\/home"\)/.test(rootPage),
  "arriving in the middle of a 315-row check-list is the complaint this screen fixes"
);

check(
  "THE MANIFEST STILL STARTS AT /capture",
  /start_url: "\/capture"/.test(manifest),
  "start_url must be a real screen, never a redirect — a launch that begins with a network request fails on an apron"
);

check(
  "the home screen is precached, so a bookmark opens it with no signal",
  /const ROUTES = \[[\s\S]*?"\/home"/.test(sw),
  "it is where the bare address lands; unreachable offline it is an error page"
);

check(
  "the redirecting root is still never precached",
  !/const ROUTES = \[[\s\S]*?"\/",/.test(sw),
  "a cached redirected response handed to a navigation is a hard error in every browser"
);

check(
  "the brand mark is how you get back to it",
  /href=\{role === "acsa" \? "\/dashboard" : "\/home"\}/.test(shell),
  "a ninth nav destination costs a swipe on a bar that already overflows a portrait iPad"
);

check(
  "and the screen names itself in the one h1",
  /pathname === "\/home"[\s\S]{0,80}"Home"/.test(shell),
  "/home has no NAV row to take a label from, so the heading would have read 'Squawk'"
);

/* ------------------------------------ Part 2: every number is derived */

check(
  "the checklist length is this site's, not the register's",
  /checksAt\(entityCode\)/.test(home) && !/\bCHECKS\b/.test(home),
  "324 is the denominator at three of the ten sites and at none of the other seven"
);

check(
  "the desk and field totals come from what the register declares",
  /checks\.filter\(needsDesk\)/.test(home) && /checks\.filter\(needsField\)/.test(home),
  "counting rows that have walkabout text is a proxy that silently drops a check when the text is blank"
);

/* The whole point of the screen is counts, so a literal one is the easiest bug
   to write and the hardest to see. 324, 319, 200, 315, 299, 290 and 3,086 are
   all derived somewhere in this repo; none of them may be typed into what the
   screen renders.
 *
 *  COMMENTS ARE STRIPPED FIRST, deliberately. The prose in this repo explains
 *  where a number comes from and quotes it while doing so — that is the
 *  documentation working, not a hardcoded count. What must not carry one is the
 *  code. */
const code = home.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
for (const n of ["324", "319", "200", "315", "299", "290", "3086"]) {
  check(
    `no literal ${n} in what the screen renders`,
    !new RegExp(`\\b${n}\\b`).test(code),
    "a written-down count is a number that stops being true at the next site"
  );
}

check(
  "the site count on the calendar strip is counted, not written",
  /calendar\.length/.test(home) && /startedEntities\.size/.test(home),
  "'ten sites' becomes wrong the day an eleventh entity is added to programme.json"
);

check(
  "'started' is read off captured work rather than a flag",
  /startedEntities = /.test(home) && !/\.live\b/.test(home),
  "`live` was a flag somebody had to remember to set, and the dashboard stopped trusting it"
);

check(
  "reading across audits goes through the named selector",
  /useAuditProgress\(\)/.test(home) && !/useStore\(\(s\) => s\.byVisit\)/.test(home),
  "a screen that reaches into byVisit shows whatever scope was last selected"
);

check(
  "and that selector is per entity AND visit, not a portfolio roll-up",
  /export function useAuditProgress\(\): AuditProgress\[\]/.test(store) &&
    /entity: string;\s*\n\s*visit: string;/.test(store),
  "rolling March and September into one row reports a visit as further along than it is"
);

check(
  "an unconfirmed rating is counted as outstanding, never as a rating",
  /f\.ratingConfirmed && f\.severity && f\.likelihood/.test(home),
  "a severity seeded by an issue button is a suggestion; the audit rates as a group"
);

/* ------------------------------- Part 3: it is not a second dashboard */

/* Each of these is the dashboard's job. Duplicated here they would be two
   figures for one fact, computed twice, drifting apart the first time either
   is corrected. */
for (const [what, re] of [
  ["the compliance breakdown", /compliance === "(C|NC|NV)"/],
  ["the B170 001M heat map", /SEVERITIES|LIKELIHOODS|bandFor/],
  ["movement against 2025", /\bmovement\(/],
  ["the ten-site portfolio table", /usePortfolio\(\)/],
]) {
  check(
    `the home screen does not repeat ${what}`,
    !re.test(home),
    "the analytical view is /dashboard, and it is the one that has the context for it"
  );
}

check(
  "the dashboard still owns those figures",
  /bandFor/.test(dashboard) && /usePortfolio\(\)/.test(dashboard) && /movement\(/.test(dashboard),
  "if these have moved, this suite is asserting against a screen that no longer exists"
);

check(
  "the audit window is formatted in one place",
  /export function auditWindow/.test(src("lib", "programme.ts")) &&
    /auditWindow\(/.test(home) &&
    /auditWindow,/.test(dashboard),
  "'15–18 Sep 2026' on one screen and '15 Sep – 18 Sep 2026' on the other read as two facts"
);

/* ---------------------------- Part 4: the map matches the system */

const flow = [...home.matchAll(/href: "(\/[a-z]+)",\s*\n\s*label: "([^"]+)"/g)].map((m) => ({
  href: m[1],
  label: m[2],
}));

check("the flow strip names seven screens", flow.length === 7, `found ${flow.length}`);

for (const step of flow) {
  check(
    `${step.href} is a real route`,
    fs.existsSync(path.join(root, "src", "app", "(app)", step.href.slice(1), "page.tsx")),
    "a landing page pointing at a 404 is worse than no map"
  );
  check(
    `${step.href} is labelled "${step.label}", exactly as the navigation labels it`,
    new RegExp(`\\{ href: "${step.href}", label: "${step.label}"`).test(shell),
    "an auditor told to go to Follow-up must find a destination called Follow-up"
  );
}

check(
  "the flow runs capture → inspection → review → findings → hazards → closure → dashboard",
  flow.map((s) => s.href).join(" ") ===
    "/capture /field /review /findings /hazards /closure /dashboard",
  flow.map((s) => s.href).join(" ")
);

/* ------------------------------------------- Part 5: it renders honestly */

check(
  "the clock is read as an external system, with 0 as its server snapshot",
  /useSyncExternalStore\(subscribeClock, clockSnapshot, clockOnServer\)/.test(home) &&
    /const clockOnServer = \(\) => 0;/.test(home),
  "Date.now() during render makes the server's HTML and the first client render differ, and React rebuilds the tree"
);

check(
  "its snapshot is cached rather than freshly read on every call",
  /clockNow \|\|= Date\.now\(\)/.test(home),
  "a snapshot returning a new value each call is an infinite render loop, not a fresh reading"
);

check(
  "and nothing the clock touches renders before it is known",
  /now > 0/.test(code) && !/\bconst now = Date\.now\(\)/.test(code),
  "a value that differs between the server and the first client render tears the tree down"
);

check(
  "a status dot says what its colour means",
  [...home.matchAll(/<Dot\b[\s\S]*?\/>/g)].every((m) => /label=/.test(m[0])),
  "roughly one man in twelve cannot separate the red one from the green one"
);

check(
  "the calendar strip's scroller is positioned, so the viewport cannot pan",
  /className="hide-scrollbar relative[^"]*overflow-x-auto/.test(home),
  "unpositioned, its ten cards counted toward the document's scroll area and the whole shell panned 1,244px sideways on a phone"
);

check(
  "an empty audit says so rather than drawing an empty chart",
  /<Empty>/.test(home),
  "a zeroed panel reads as a broken screen"
);

check(
  "it uses the shared primitives rather than a parallel set",
  /from "@\/components\/ui\/primitives"/.test(home),
  "a second Btn is how two buttons come to look nearly the same"
);

check(
  "and no raw colour anywhere — both themes come from the tokens",
  !/#[0-9a-fA-F]{3,8}\b/.test(home),
  "a hex is a colour that only works in one theme"
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
