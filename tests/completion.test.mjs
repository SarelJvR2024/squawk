import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* A check is complete when every mode it declares has been answered.
 *
 *  There was one `captured` flag, set by whichever screen saved first. For the
 *  305 checks that need both a document review and the asset seen, ticking it
 *  at a desk marked it done — the dashboard counted it, the export said
 *  "Captured: Yes", and nobody had walked out to look at the pump. The auditor
 *  was told the truth by a banner and the data was not.
 *
 *  Completion is now per portal: a desk half and a field half, each stamped by
 *  whoever answered it, and `captured` derived from whether every declared mode
 *  is covered. The screens count their own half; only the dashboard, the
 *  progress ring and the export speak of "complete". */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const detail = src("components", "CheckDetail.tsx");
const field = src("app", "(app)", "field", "page.tsx");
const capture = src("app", "(app)", "capture", "page.tsx");
const shell = src("components", "AppShell.tsx");
const exports_ = src("lib", "exports.ts");

let failures = 0;
const check = (name, cond, detailText = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detailText ? `  [${detailText}]` : ""}`);
  }
};

/* ------------------------------------------- Part 1: the halves are recorded */

check(
  "a response carries both halves, each with who and when",
  /deskDoneBy: string;/.test(types) &&
    /deskDoneAt: number \| null;/.test(types) &&
    /fieldDoneBy: string;/.test(types) &&
    /fieldDoneAt: number \| null;/.test(types),
  "who looked at the asset is a different fact from who read the file"
);

check(
  "committing names the portal",
  /commit: \(checkId: string, portal: Portal\) => void;/.test(store) &&
    /export type Portal = "desk" \| "field";/.test(store),
  ""
);

check(
  "the desk screen commits desk work",
  /commit\(check\.id, "desk"\)/.test(detail),
  ""
);

check(
  "the field screen commits field work",
  /commit\(c\.id, "field"\)/.test(field) && !/commit\(c\.id\);/.test(field),
  ""
);

/* ------------------------------------ Part 2: complete is derived, not claimed */

check(
  "isComplete asks the register which modes this check declares",
  /const deskOk = !needsDesk\(c\) \|\| !!r\.deskDoneAt;/.test(store) &&
    /const fieldOk = !needsField\(c\) \|\| !!r\.fieldDoneAt;/.test(store),
  ""
);

check(
  "commit derives captured rather than setting it true",
  /const complete = isComplete\(checkId, next\);/.test(store) &&
    /captured: complete,/.test(store) &&
    !/captured: true,/.test(store),
  "asserting completion was the bug"
);

check(
  "the type says captured is derived and must not be set directly",
  /DERIVED, and written only by the store/.test(types),
  ""
);

check(
  "completing stamps who finished it, and only then",
  /\.\.\.\(complete \? \{ capturedBy: who, capturedAt: now \} : \{\}\)/.test(store),
  ""
);

/* -------------------------------- Part 3: each screen counts its own half */

check(
  "the desk view filters and counts on the desk half",
  /filter === "open"\) list = list\.filter\(\(c\) => !deskDone\(responses\[c\.id\]\)\)/.test(
    capture
  ) && /cs\.filter\(\(c\) => deskDone\(responses\[c\.id\]\)\)/.test(capture),
  "counting the derived flag here would hide desk work that is finished"
);

check(
  "the field view counts and greys out on the field half",
  /fieldDone\(responses\[c\.id\]\)/.test(field) && /opacity: fieldDone\(r\)/.test(field),
  "a card must not grey out because someone read a document at a desk"
);

/* The badges read done-of-total now rather than a bare outstanding count, so
   the halves are scoped by filtering the list first and then counting what is
   done in it — but the rule they guard is unchanged: a desk-done check that
   still needs the asset seen belongs on the Inspection badge, not off both. */
check(
  "the nav badges count their own half, each scoped to its own list",
  /checks\.filter\(needsDesk\)/.test(shell) &&
    /checks\.filter\(needsField\)/.test(shell) &&
    /deskDone\(responses\[c\.id\]\)/.test(shell) &&
    /fieldDone\(responses\[c\.id\]\)/.test(shell),
  "a desk-done check that still needs the asset seen must stay on the Inspection badge"
);
check(
  "and neither half is derived from the combined captured flag",
  !/\.captured\)\.length,\s*\n?\s*total/.test(shell),
  "captured means BOTH halves answered; a badge built on it would hide the outstanding one"
);

/* ----------------------------------------- Part 4: the auditor is told plainly */

check(
  "saving at the desk says what is still outstanding",
  /desk done\. Still needs the asset seen in Field\./.test(detail),
  "a plain 'saved' on half a check is the thing this whole change fixes"
);

check(
  "the status line names the half rather than claiming capture",
  /desk done by \$\{r\.deskDoneBy\.split\(" "\)\[0\]\} · awaiting site/.test(detail) &&
    /complete · \$\{r\.capturedBy\.split\(" "\)\[0\]\}/.test(detail),
  ""
);

/* --------------------------------------------- Part 5: the export tells ACSA */

check(
  "the register sheet reports both halves separately",
  /\{ header: "Desk done", width: 10 \}/.test(exports_) &&
    /\{ header: "Site seen", width: 10 \}/.test(exports_) &&
    /\{ header: "Complete", width: 10 \}/.test(exports_),
  "one Captured column would tell ACSA the site check happened when it did not"
);

check(
  "the summary reports desk and site alongside complete",
  /\["Desk done", deskDone\]/.test(exports_) && /\["Site seen", fieldSeen\]/.test(exports_),
  "'180 complete' hides whether the rest waits on documents or on a walk"
);

/* --------------------------- Part 6: the migration does not invent a site visit */

/* The version moves on as other things are persisted — v7 added the dictation
   preference. What this suite cares about is that the v6 step is still there
   and still runs for anyone upgrading from below it. */
check(
  "v6 migrates the old single flag",
  /if \(from < 6\)/.test(store) && /version: (?:[7-9]|\d{2,}),/.test(store),
  ""
);

check(
  "a dual-mode check carries to the desk half only",
  /const fieldOnly = !!c && needsField\(c\) && !needsDesk\(c\);/.test(store) &&
    /wasCaptured && fieldOnly/.test(store),
  "claiming the field half would assert a walk that may never have happened"
);

check(
  "and the migration says so, because some checks will reopen",
  /invented evidence this application exists\s*\n?\s*\*?\s*not to produce/.test(store) ||
    /invented evidence/.test(store),
  ""
);

console.log(
  failures === 0 ? "\nCOMPLETION OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
