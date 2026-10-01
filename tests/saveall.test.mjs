import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* SAVE ALL — every check this screen already knows is answered and not yet
 *  saved, committed in one press.
 *
 *  Sarel: "Build a save all option to save all audit checks which was
 *  updated but not saves." The screen already counted exactly this — the
 *  "{unsaved} to save" line beside the discipline picker is `deskAnswered`
 *  per check, the same predicate that turns a dot hollow. Save All is that
 *  count, made pressable: the same commit the check screen's own Save button
 *  makes (`commit(id, "desk")`), once per check the count found, not a
 *  parallel write path that could disagree with what the dot on screen
 *  already promised.
 *
 *  Source-read, like checkscreen.test.mjs — the failure mode worth guarding
 *  is Save All drifting from the predicate it is supposed to be a shortcut
 *  for, not a rendering bug a browser suite would catch differently. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");
const page = src("app", "(app)", "capture", "page.tsx");
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const pageCode = codeOnly(page);

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

check(
  "Save All is built on the same predicate the \"to save\" count already uses",
  /const saveAll = \(\) => \{[\s\S]{0,200}?if \(deskAnswered\(responses\[c\.id\]\)\)/.test(
    pageCode
  ),
  "deskAnswered, not a second definition of \"unsaved\" that could drift from the dot"
);

check(
  "it commits to the desk portal, the same call a single Save makes",
  /const saveAll = \(\) => \{[\s\S]{0,260}?commit\(c\.id, "desk"\);/.test(pageCode),
  "CheckDetail's own save() calls commit(check.id, \"desk\") — Save All is that, looped"
);

check(
  "it walks the same list the count is drawn from",
  /const saveAll = \(\) => \{\s*\n\s*let n = 0;\s*\n\s*for \(const c of visible\)/.test(
    pageCode
  ),
  "visible — the filtered, on-screen list — not every check in the audit regardless of what is shown"
);

check(
  "and reports back how many it actually saved",
  /setToast\(`\$\{n\} check\$\{n === 1 \? "" : "s"\} saved`\);/.test(pageCode),
  "a bulk action with no confirmation is one an auditor presses twice, unsure it did anything"
);

check(
  "the button only appears when there is something to save",
  /\{unsaved > 0 && \(\s*\n\s*<Btn\s*\n\s*variant="primary"\s*\n\s*onClick=\{saveAll\}/.test(
    pageCode
  ),
  "a button that is always there either nags at zero or does nothing when pressed"
);

console.log(failures === 0 ? "\nSAVE ALL OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
