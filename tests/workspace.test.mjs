import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE CONSOLIDATED CAPTURE TREE — /workspace, see its own page header for why
 * it exists (Sarel: the capture flow is "scattered" across Checks, Inspection
 * and Raise a finding; this is a faster front door onto the SAME record
 * store, not new functionality). Source-read, like topbar-refresh.test.mjs
 * and fieldacsatab.test.mjs — this is a page component, not a pure function,
 * and the repo's convention for that shape is reading the real source text
 * rather than a DOM-rendering harness this project does not have. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const page = src("app", "(app)", "workspace", "page.tsx");
const addItemSheet = src("components", "AddItemSheet.tsx");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · all disciplines at once, not one at a time ---------------------- */

check(
  "the tree does NOT restrict to one discipline via a <select> — every discipline renders, the brief's own ask",
  !/DisciplineSelect/.test(page) && /disciplines\.map\(\(discipline\)/.test(page)
);

check(
  "disciplines/systems/checks are read off the SAME register helpers every other screen uses, not a second copy",
  /checksOf|systemsOf|disciplinesAt/.test(page) &&
    /from "@\/lib\/store"/.test(page)
);

/* ---- 2 · the Add menu offers exactly Observation and Non-compliance ------ */

check(
  "the Add menu offers Observation",
  /Observation<\/span>/.test(page) && /General note — not a verdict/.test(page)
);

check(
  "the Add menu offers Non-compliance",
  /Non-compliance<\/span>/.test(page) && /Does not meet the requirement/.test(page)
);

check(
  "Evidence request is deliberately NOT in this pass's Add menu — no existing record to reuse yet (see discovery.md §4)",
  !/Evidence request/.test(page),
  "adding a third option with nothing behind it would be a button that does nothing"
);

/* ---- 3 · a CHECK row reuses setCompliance + CheckDetail, nothing new ----- */

check(
  "tapping Non-compliance on a check calls the SAME setCompliance action CheckDetail/Checks/Field already use",
  /setCompliance\(target\.check\.id, "NC"\)/.test(page)
);

check(
  "a check row opens the real CheckDetail component — one place that check's fields live, not a second editor",
  /<CheckDetail\b/.test(page) && /import CheckDetail from "@\/components\/CheckDetail"/.test(page)
);

check(
  "tapping Observation on a check does NOT touch compliance — only Non-compliance does",
  (() => {
    const m = page.match(/if \(kind === "non_compliance"[^}]*setCompliance\(target\.check\.id, "NC"\);\s*\}/);
    return !!m;
  })(),
  "an observation is a note, not a verdict — see the Add menu's own hint text"
);

/* ---- 4 · a DISCIPLINE/ASSET SYSTEM row reuses AddItemSheet, not a new sheet */

check(
  "non-check levels open the existing AddItemSheet, the same sheet Field already uses",
  /<AddItemSheet\b/.test(page) && /import AddItemSheet from "@\/components\/AddItemSheet"/.test(page)
);

check(
  "AddItemSheet gained presetSystem and presetOutcome — small, additive, optional props",
  /presetSystem\?: string \| null;/.test(addItemSheet) &&
    /presetOutcome\?: Compliance \| null;/.test(addItemSheet)
);

check(
  "presetSystem seeds the draft exactly like presetDiscipline always has",
  /system: presetSystem \?\? null,/.test(addItemSheet)
);

check(
  "presetOutcome seeds the draft exactly like presetDiscipline always has",
  /outcome: presetOutcome \?\? null,/.test(addItemSheet)
);

check(
  "both new props are reset on close the same way presetDiscipline/presetArea always were — no stale preset bleeding into the next open",
  (() => {
    const closeFn = addItemSheet.match(/const close = \(\) => \{[\s\S]*?onClose\(\);\s*\};/);
    return !!closeFn && /system: presetSystem \?\? null,/.test(closeFn[0]) &&
      /outcome: presetOutcome \?\? null,/.test(closeFn[0]);
  })()
);

check(
  "existing AddItemSheet callers (Field) are untouched — the new props are optional, not a required third argument",
  /presetSystem\?:/.test(addItemSheet) && /presetOutcome\?:/.test(addItemSheet),
  "optional props never break a caller that does not pass them"
);

/* ---- 5 · roll-up counts read BOTH register checks and walk items --------- */

check(
  "counts roll up Non-compliance and Observation from checks AND walk items together, same reading setCompliance's own NC-raises-a-finding rule uses for 'what counts as NC'",
  /function tally\(/.test(page) &&
    /r\.compliance === "NC"/.test(page) &&
    /a\.outcome === "NC"/.test(page)
);

/* ---- 6 · search auto-expands matches, per the brief's own ask ------------ */

check(
  "a search match auto-expands its branch rather than requiring a second tap",
  /const open = expanded\.has\(dKey\) \|\| \(!!q && anyChildMatches\);/.test(page)
);

/* ---- 7 · navigation: additional, not a replacement ----------------------- */

check(
  "the new screen is reachable from the More menu, not the main bar — same conservative rollout /raise itself got before earning a bar slot",
  /label="Capture \(all\)"/.test(shell) && /router\.push\("\/workspace"\)/.test(shell)
);

check(
  "OFF_NAV carries a heading for it, so the page title never silently falls back to \"Squawk\"",
  /"\/workspace": "Capture \(all\)",/.test(shell)
);

check(
  "the three screens this consolidates (Checks, Inspection, Raise a finding) don't route to or import /workspace",
  (() => {
    const field = src("app", "(app)", "field", "page.tsx");
    const raise = src("app", "(app)", "raise", "page.tsx");
    const capture = src("app", "(app)", "capture", "page.tsx");
    const linksToIt = /["'`]\/workspace["'`]|app\/\(app\)\/workspace/;
    return ![field, raise, capture].some((s) => linksToIt.test(s));
  })(),
  "this pass adds a new screen alongside them — it does not rewrite or link to the ones it may one day replace"
);

console.log(failures === 0 ? "\nWORKSPACE OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
