/* BUILD PROMPT 2 ("Check result and per-channel N/A") — the check result
 *  becomes Discussed / Non-compliance / Not applicable, plus the "Requires
 *  evidence to verify" verdict added 19 Nov 2026 stays a fourth option
 *  (confirmed with Sarel directly: the build-prompts doc's "exactly three
 *  options... Not verified no longer exists" was written without knowing
 *  about that two-days-earlier instruction — it describes the first three
 *  keys of STATUSES, not a removal of the fourth).
 *
 *  THE MAPPING CHOSEN: keep the stored Compliance keys exactly as they are
 *  ("C"/"NC"/"N/A"/"NV") and relabel only. No migration, because there is
 *  nothing to migrate — a response already stored as "C" already meant
 *  Discussed, under an older word for it. Confirmed with Sarel: SharePoint
 *  sync and `short` (the code dashboard/review/exports/SharePoint actually
 *  read) are UNCHANGED by this prompt; only `label`, what the check
 *  screen's own buttons say, changed.
 *
 *  Source-read, like checkscreen.test.mjs/portals.test.mjs — these are
 *  structural guarantees (the stored vocabulary didn't move, the save
 *  mechanics changed where the spec said to) that a browser suite would
 *  catch differently and more expensively, if at all. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");
const detail = src("components", "CheckDetail.tsx");
const capturePage = src("app", "(app)", "capture", "page.tsx");
const types = src("lib", "types.ts");
const exportsSrc = src("lib", "exports.ts");
const sharepointSrc = src("lib", "sharepoint.ts");

let failures = 0;
const check = (name, cond, detail2 = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail2 ? `  [${detail2}]` : ""}`);
  }
};

/* ------------------------- Part 1: the four labels, the unchanged keys --- */

check(
  "Discussed is key C, hotkey 1 — the stored value and ACSA's own code are untouched",
  /key: "C",\s*hotkey: "1",\s*label: "Discussed",\s*short: "C",/.test(detail)
);
check(
  "Non-compliance is key NC, hotkey 2",
  /key: "NC",\s*hotkey: "2",\s*label: "Non-compliance",\s*short: "NC",/.test(detail)
);
check(
  "Not applicable is key N/A, hotkey 3",
  /key: "N\/A",\s*hotkey: "3",\s*label: "Not applicable",\s*short: "N\/A",/.test(detail)
);
check(
  "Requires evidence to verify is still there, key NV, hotkey 6 — not removed",
  /key: "NV",\s*hotkey: "6",\s*label: "Requires evidence to verify",\s*short: "NV",/.test(
    detail
  ),
  "the build-prompts doc's \"exactly three\" describes the three above, not this one"
);
check(
  "exactly four STATUSES entries — no fifth invented, none of the old 4/5 revived",
  (detail.match(/key: "(C|NC|N\/A|NV)",\s*hotkey: "\d",/g) ?? []).length === 4
);

check(
  "the stored Compliance type is unchanged — four keys, same as before this prompt",
  /export type Compliance = "C" \| "NC" \| "N\/A" \| "NV";/.test(types),
  "no migration needed: the labels moved, the stored values never did"
);

/* ----------------- Part 2: SharePoint and exports read the SAME code ----- */

check(
  "exports.ts' STATUS_WORD is untouched by this prompt — still its own vocabulary",
  /C: "Compliant",/.test(exportsSrc) && /NC: "Non-compliant",/.test(exportsSrc),
  "Sarel, 21 Nov: no change to what SharePoint/exports get, only the check screen's own words"
);
check(
  "sharepoint.ts still writes the raw compliance code, not this screen's new label",
  /"NV"/.test(sharepointSrc),
  "the on-screen button says \"Requires evidence to verify\"; what syncs out is still the code"
);

/* ---------------------------- Part 3: save is automatic ------------------ */

check(
  "the separate Save / Save & next pair is gone",
  !/\bSave<\/Btn>/.test(detail) && !/Save &amp; next/.test(detail),
  "build prompt 2: \"remove the separate Save / Save & next pair\""
);
check(
  "one Next check action replaces them, primary, in the pinned answer bar",
  /<Btn variant="primary" onClick=\{onNext\}>\s*\n\s*<IconCheck width=\{14\} height=\{14\} \/>\s*\n\s*Next check/.test(
    detail
  )
);
check(
  "Prev still sits beside it — going backward is not one of the two removed actions",
  /<Btn icon onClick=\{onPrev\} aria-label="Previous">/.test(detail)
);
check(
  "onNext commits before it advances — the deliberate, forward save",
  /const onNext = useCallback\(\(\) => \{\s*\n\s*commit\(check\.id, "desk"\);/.test(detail)
);
check(
  "onPrev commits too — answering, then stepping back, must not lose the answer",
  /const onPrev = useCallback\(\(\) => \{\s*\n\s*commit\(check\.id, "desk"\);/.test(detail)
);
check(
  "the keyboard's ArrowRight/ArrowLeft still call the commit-wrapped onNext/onPrev",
  /if \(e\.key === "ArrowRight"\) onNext\(\);/.test(detail) &&
    /if \(e\.key === "ArrowLeft"\) onPrev\(\);/.test(detail)
);

check(
  "a passive departure (switching checks off the list, navigating away) also autosaves",
  /useEffect\(\(\) => \{\s*\n\s*const id = check\.id;\s*\n\s*return \(\) => \{\s*\n\s*if \(deskAnswered\(useStore\.getState\(\)\.response\(id\)\)\) commit\(id, "desk"\);/.test(
    detail
  ),
  "onPrev/onNext only cover leaving through this screen's own controls"
);
check(
  "that passive save is conditional, not unconditional like onNext's — a glance is not an answer",
  /if \(deskAnswered\(useStore\.getState\(\)\.response\(id\)\)\) commit\(id, "desk"\);/.test(
    detail
  ),
  "committing an untouched check would falsely stamp deskDoneAt"
);

/* ------------------ Part 4: the capture page's own manual-save UI is gone */

check(
  "Save All and the \"N to save\" badge are gone from the Checks list",
  !/saveAll/.test(capturePage) && !/to save/.test(capturePage),
  "nothing is ever left for a batch-save to catch once every departure autosaves"
);
check(
  "deskAnswered is still read, for the hollow-dot state of the check currently open",
  /deskAnswered/.test(capturePage)
);

console.log(failures === 0 ? "\nCHECK RESULT OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
