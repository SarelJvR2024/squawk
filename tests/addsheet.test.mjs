import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE + SHEET — build prompt 5, 21 Nov 2026: one "Add" entry point on
 *  Checks, Evidence, Walk and Findings (today's stand-in for the Issues
 *  screen prompt 8 builds later), pre-filled with whatever context the
 *  opening screen already has (check id / asset system / discipline) so
 *  nothing already known is asked again.
 *
 *  This suite is source-pattern, like checkscreen.test.mjs and
 *  howtoask.test.mjs: it reads AddSheet.tsx and its four call sites and
 *  confirms the context object actually reaches each option, rather than
 *  being built and left unreachable (the exact class of bug code review
 *  caught in build prompt 3 — see that suite's own "built but not
 *  rendered" check). */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(...parts) {
  return fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
}

let failed = 0;
function check(name, cond, why) {
  if (cond) {
    console.log("PASS ", name);
  } else {
    failed++;
    console.log("FAIL ", name, why ?? "");
  }
}

const sheet = src("src", "components", "AddSheet.tsx");

/* ---------- the context object ---------- */

check(
  "the sheet takes the same three context fields every opener can supply",
  /presetCheckId\?: string;/.test(sheet) &&
    /presetSystem\?: string;/.test(sheet) &&
    /presetDiscipline\?: string;/.test(sheet),
);
check(
  "context shows as badges on the sheet, not asked again as form fields",
  /badges=\{/.test(sheet) && /hasContext \? \(/.test(sheet),
  "the spec: 'shown as chips. Nothing already known is asked again.'",
);
check(
  "no badges at all when nothing is known — a general open from Issues/Home",
  /const hasContext = Boolean\(presetCheckId \|\| presetSystem \|\| presetDiscipline\);/.test(sheet) &&
    /\) : undefined/.test(sheet),
);

/* ---------- Photo / Voice note ---------- */

check(
  "with a check in context, media attaches to THAT check, not the tray",
  /if \(presetCheckId\) \{\s*addAttachment\(presetCheckId, \{ \.\.\.m, createdBy: auditor \}\);/.test(sheet),
);
check(
  "with no check but a system known, the unassigned tray's area is pre-filled with it — not asked again",
  /addCapture\(\{ \.\.\.m, area: presetSystem \|\| "Unspecified", createdBy: auditor \}\);/.test(sheet),
  "no schema change: the same addCapture tray Inspection's own photo button already writes to, just a smarter area default",
);
check(
  "PhotoButton and VoiceNoteButton share the one handler — one place a captured photo or voice note is routed, not two",
  (sheet.match(/onCaptured=\{handleMedia\}/g) ?? []).length === 2,
);

/* ---------- Evidence ---------- */

check(
  "Evidence seeds checkIds/system/discipline from context, conditionally — never an explicit undefined that would blank addEvidenceItem's own defaults",
  /\.\.\.\(presetCheckId \? \{ checkIds: \[presetCheckId\] \} : \{\}\),/.test(sheet) &&
    /\.\.\.\(presetSystem \? \{ system: presetSystem \} : \{\}\),/.test(sheet) &&
    /\.\.\.\(presetDiscipline \? \{ discipline: presetDiscipline \} : \{\}\),/.test(sheet),
);
check(
  "and navigates to the SAME /evidence?open= deep link ReviewRiskPanel's own evidence-request buttons already use",
  /router\.push\(`\/evidence\?open=\$\{id\}`\);/.test(sheet),
);

/* ---------- Issue ---------- */

check(
  "Issue does not build a new form — it hands off to whatever the caller already uses to raise one, no context argument",
  /function handleIssue\(\) \{\s*onClose\(\);\s*onRaiseIssue\(\);\s*\}/.test(sheet),
  "prompt 8 owns the real Observation/Non-compliance + Critical/Safety issue form; this sheet's contract does not change when that lands",
);
check(
  "onRaiseIssue takes NO context — the caller gives RaiseFindingSheet the same presetX props directly, one source for that context, not two that could drift",
  /onRaiseIssue: \(\) => void;/.test(sheet),
  "code review on this branch caught an earlier version passing a ctx object here that every one of the four callers then silently discarded",
);
check(
  "same-screen evidence creation opens the new item directly, not through the /evidence?open= deep link",
  /onEvidenceCreated\?: \(id: string\) => void;/.test(sheet) &&
    /if \(onEvidenceCreated\) \{\s*onEvidenceCreated\(id\);\s*\} else \{\s*router\.push\(`\/evidence\?open=\$\{id\}`\);\s*\}/.test(sheet),
  "code review on this branch caught that the deep link relies on a mount-only effect (lib/deepLink.ts) which does not re-fire for a same-route navigation, so opening the sheet FROM the Evidence screen and tapping Evidence would create the item and never show it",
);

/* ---------- RaiseFindingSheet: the preset props actually reach its own state ---------- */

const raise = src("src", "components", "RaiseFindingSheet.tsx");
check(
  "RaiseFindingSheet accepts the same three preset fields the + sheet hands it",
  /presetCheckId\?: string;/.test(raise) &&
    /presetSystem\?: string;/.test(raise) &&
    /presetDiscipline\?: string;/.test(raise),
);
check(
  "and actually applies them to its own picker state on open — not just accepted and left unused",
  /if \(presetDiscipline\) setDiscipline\(presetDiscipline\);/.test(raise) &&
    /if \(presetSystem\) setSystem\(presetSystem\);/.test(raise) &&
    /if \(presetCheckId\) setCheckId\(presetCheckId\);/.test(raise),
  "the same 'built but not rendered' class of bug build prompt 3's code review caught — accepting a prop that nothing reads would be worse than not accepting it at all",
);
check(
  "applied on the transition into open, not every render — editing the preset by hand must not be fought on the next re-render",
  /useEffect\(\(\) => \{\s*if \(!open\) return;/.test(raise) && /\}, \[open\]\);/.test(raise),
);

/* ---------- each screen actually wires it in, with the right context ---------- */

const detail = src("src", "components", "CheckDetail.tsx");
check(
  "Checks (CheckDetail): the + button opens the sheet pre-filled with THIS check's own id/system/discipline",
  /<AddSheet\s+open=\{sheet === "add"\}[\s\S]{0,300}presetCheckId=\{check\.id\}[\s\S]{0,100}presetSystem=\{check\.system\}[\s\S]{0,100}presetDiscipline=\{check\.discipline\}/.test(
    detail,
  ),
);
check(
  "and 'Issue' there hands off to a RaiseFindingSheet carrying the SAME check context, not a blank one",
  /<RaiseFindingSheet\s+open=\{raiseOpen\}[\s\S]{0,300}presetCheckId=\{check\.id\}[\s\S]{0,100}presetSystem=\{check\.system\}[\s\S]{0,100}presetDiscipline=\{check\.discipline\}/.test(
    detail,
  ),
);

const field = src("src", "app", "(app)", "field", "page.tsx");
check(
  "Walk: the + button is additive to the existing toolbar, not a replacement for the photo button already there",
  /<IconFlag width=\{16\} height=\{16\} \/>/.test(field) && /aria-label="Add — photo, voice note, evidence or an issue"/.test(field),
  "field/page.tsx is the 2,700-line screen prompt 7 replaces wholesale — rewiring its existing, heavily-tested photo button is out of scope for this prompt",
);
check(
  "and reuses the SAME preset-discipline rule AddItemSheet's own pre-fill already uses on this screen, not a second, different one",
  (field.match(/presetDiscipline=\{groupBy === "discipline" \? activeFilter \|\| undefined : undefined\}/g) ?? [])
    .length === 2,
  "one for the + sheet, one for the RaiseFindingSheet it hands 'Issue' off to",
);

const findings = src("src", "app", "(app)", "findings", "page.tsx");
check(
  "Findings (today's Issues stand-in): + is a quiet secondary beside Raise a finding, which stays the primary action, unchanged",
  /<AddSheet\s+open=\{addOpen\}/.test(findings) && /Raise a finding/.test(findings),
);
check(
  "and 'Issue' from + reuses the SAME RaiseFindingSheet instance this screen already renders, not a second one",
  (findings.match(/<RaiseFindingSheet/g) ?? []).length === 1,
);

const evidence = src("src", "app", "(app)", "evidence", "page.tsx");
check(
  "Evidence: + is reachable from this screen's own header",
  /<AddSheet\s+open=\{addOpen\}/.test(evidence),
);
check(
  "with Issue available here too, since this screen never had any way to raise one before",
  /<RaiseFindingSheet\s+open=\{raiseOpen\}/.test(evidence),
);
check(
  "and Evidence passes its own setOpenId so a new item opens directly, not through the deep link that does nothing on this screen",
  /<AddSheet\s+open=\{addOpen\}[\s\S]{0,200}onEvidenceCreated=\{setOpenId\}/.test(evidence),
);

/* ---------- nothing already there was deleted ---------- */

check(
  "the old /raise route, RaiseFindingSheet's own Raise-a-finding button and Inspection's PhotoButton are all still exactly where they were",
  /addCapture\(\s*\{\s*\.\.\.m,\s*area: "Unspecified",\s*createdBy: auditor,\s*\}\s*\);\s*say\("Captured — assign it whenever you like"\);/.test(
    field,
  ) && /Raise a finding/.test(findings),
  "prompt 10, not this one, owns removing the old entry points — see AddSheet.tsx's own doc comment",
);

if (failed) process.exit(1);
console.log(failed ? "FAILED" : "all passed");
