import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Starting again, safely.
 *
 *  A dry run needs a clean sheet twice in a morning, without anyone opening a
 *  browser console. But everything a reset does is unrecoverable: there is no
 *  server copy and no undo, and a tablet's IndexedDB is the only place a
 *  half-captured audit exists. So the control has to be reachable AND hard to
 *  hit by accident, and it has to actually clear the media — clearing records
 *  alone leaves blobs nothing points at, which is how a tablet fills up over a
 *  few test runs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const media = src("lib", "media.ts");
const panel = src("components", "ResetPanel.tsx");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------------------------------------- Part 1: it is actually reachable */

check(
  "there is a Reset control in the shell",
  /setResetting\(true\)/.test(shell) && /ResetPanel/.test(shell),
  "prompting Claude is not a reset mechanism for someone mid-dry-run"
);

/* IT IS IN THE "MORE" MENU NOW, under a rule, named for what it does.
   It stood in the masthead all day beside Export — a control that clears
   captured work, one press from a control that saves it, on a tablet being
   carried. In the menu it is last, separated, and labelled "Start again ·
   Clear captured work for a dry run" rather than the single word "Reset",
   which says nothing about what is destroyed. */
check(
  "Start again is a menu item, not a button standing in the header all day",
  /label="Start again"/.test(shell) &&
    /Clear captured work for a dry run/.test(shell) &&
    !/<span className="hidden lg:inline">Reset<\/span>/.test(shell),
  ""
);

check(
  "ACSA cannot reset the audit",
  /\{role !== "acsa" && RESET_ENABLED && \(\s*\n?\s*<>[\s\S]{0,900}?setResetting\(true\)/.test(shell),
  "their role is read-only everywhere else"
);

/* DECISION: Sarel, 5 October 2026 — official O.R. Tambo work started, and the
   menu item is hidden behind RESET_ENABLED for now (see the constant's own
   comment in AppShell.tsx). Everything above it — the panel, the local wipe,
   the cross-device propagation, the form coverage — is untouched and still
   fully tested; only the one entry point into it is switched off. */
check(
  "the menu item is switched off for now, not deleted — one flag, not a removal",
  /const RESET_ENABLED = false;/.test(shell) && /role !== "acsa" && RESET_ENABLED &&/.test(shell),
  "official audit work started 5 October 2026 — a reset reaching a real audit by accident is a worse failure than during the dry run"
);

check(
  "Escape closes it, like the other panels",
  /setResetting\(false\);/.test(shell),
  ""
);

/* ------------------------------------------------ Part 2: two scopes, not one */

check(
  "this visit and everything are separate choices",
  /resetVisit: \(\) => void;/.test(store) && /resetEverything: \(\) => void;/.test(store),
  "wiping the programme to restart one visit is not what anyone means"
);

check(
  "resetting a visit leaves the other visits alone",
  /const rest = \{ \.\.\.st\.byVisit \};\s*\n\s*delete rest\[key\];/.test(store),
  ""
);

check(
  "resetting a visit drops only that visit's findings",
  /f\.entity === st\.entity && f\.originVisit === st\.visit/.test(store),
  ""
);

/* ---------------------------------------------------- Part 3: media goes too */

check(
  "a visit reset deletes that visit's media",
  /if \(keys\.length\) void delBlobs\(keys\);/.test(store),
  "records without blobs leaves orphans nothing can reach or clean up"
);

check(
  "it sweeps responses, verifications and captures",
  /Object\.values\(data\.responses\)/.test(store) &&
    /Object\.values\(data\.verifications\)/.test(store) &&
    /data\.captures\.map\(\(c\) => c\.blobKey\)/.test(store),
  "a recording attached to a closure verification is media too"
);

check(
  "a full reset sweeps the media prefix rather than the index",
  /export async function clearAllMedia/.test(media) &&
    /k\.startsWith\(MEDIA_PREFIX\)/.test(media) &&
    /void clearAllMedia\(\);/.test(store),
  "a photograph whose record was already deleted would otherwise survive forever"
);

/* --------------------------------------- Part 4: hard to do by accident */

check(
  "the button arms before it fires",
  /armed \? go\(\) : setArmed\(true\)/.test(panel),
  "one tap next to Export is a lost morning"
);

check(
  "arming can be cancelled",
  /\{armed && <Btn onClick=\{\(\) => setArmed\(false\)\}>Cancel<\/Btn>\}/.test(panel),
  ""
);

check(
  "changing scope disarms",
  /setScope\(k\);\s*\n\s*setArmed\(false\);/.test(panel),
  "arming for one scope and firing at another is the worst possible slip"
);

check(
  "the confirm says it cannot be undone",
  /This cannot be undone\./.test(panel),
  ""
);

check(
  "the confirm counts what is actually there",
  /thisVisit\.captured/.test(panel) && /everything\.attachments/.test(panel),
  "a warning with no numbers in it is a warning nobody reads"
);

check(
  "a clean sheet says so instead of offering a pointless reset",
  /Nothing captured here yet — already a clean sheet\./.test(panel) &&
    /disabled=\{nothingToClear\}/.test(panel),
  ""
);

/* -------------------------------- Part 5: reference data is never cleared */

check(
  "the panel says what a reset does not touch",
  /reference data and are never cleared/.test(panel),
  "the obvious worry is that resetting throws away the 324 checks or the 2025 findings"
);

check(
  "and that is true — reset only clears captured state",
  /byVisit: \{\},\s*\n\s*findings: \[\],/.test(store) && !/CHECKS = \[\]/.test(store),
  "CHECKS, the Answer Library and PRIOR are loaded from files, not state"
);

/* DECISION REVERSED, in effect rather than in words: resetEverything's own
   set() silently never cleared hazards or any of the Tier 1 forms (ISF,
   interviews, site days/diary, PPE, site access, toolbox talks, incident
   reports, attendance registers) — a dry run's "Start again → Everything"
   left HIRA and every tablet form showing data from a supposedly clean
   sheet. Found live, the night before the real O.R. Tambo audit, by someone
   actually using the button. Both reset functions now cover every flat
   captured-state array the store has, not just the two that existed when
   this panel was first built. */
check(
  "a full reset clears HIRA and every Tier 1 form, not just findings",
  [
    "hazards",
    "safetyFindings",
    "interviewDays",
    "siteDays",
    "evidenceItems",
    "ppeChecks",
    "siteAccessLogs",
    "toolboxTalks",
    "incidentReports",
    "attendanceRegisters",
  ].every((field) => new RegExp(`${field}: \\[\\]`).test(store)),
  "hazards and the tablet forms are flat arrays just like findings, and must be cleared the same way"
);

check(
  "a visit-only reset scopes HIRA and the forms to that visit, same as findings",
  [
    "hazards",
    "safetyFindings",
    "interviewDays",
    "siteDays",
    "evidenceItems",
    "ppeChecks",
    "siteAccessLogs",
    "toolboxTalks",
    "incidentReports",
    "attendanceRegisters",
  ].every((field) => new RegExp(`${field}: st\\.${field}\\.filter\\(\\(r\\) => !mine\\(r\\)\\)`).test(store))
);

console.log(
  failures === 0 ? "\nRESET OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
