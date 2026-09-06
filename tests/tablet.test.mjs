import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The tablet is the device, not a narrow desktop.
 *
 *  Three things were wrong at once, and all three cost capture rather than
 *  looks:
 *
 *  1. The desk build is a mouse design — 26px chips, 9px type. On an apron,
 *     tapped with a gloved thumb, a target missed twice is an auditor who
 *     stops capturing and writes on paper.
 *  2. The check screen went two-pane only at xl (1280px). An iPad in
 *     landscape is 1180px, so it stacked — and the reference column is first
 *     in the DOM, which put basis, thresholds and every ACSA document above
 *     the controls. Capture was below the fold on the exact device it was
 *     designed for.
 *  3. Field mode is the walkabout screen and was the one screen that never
 *     showed the walkabout options. 11,179 researched options sat in a library
 *     only the desk screen opened, and the flag marking which observations
 *     want a photograph rendered nowhere but a desk tooltip.
 *
 *  Source-read, like the other offline suites. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const css = src("app", "globals.css");
const detail = src("components", "CheckDetail.tsx");
const field = src("app", "(app)", "field", "page.tsx");
const capture = src("components", "Capture.tsx");

let failures = 0;
const check = (name, cond, detailText = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detailText ? `  [${detailText}]` : ""}`);
  }
};

/* --------------------------------------- Part 1: targets a thumb can hit */

check(
  "the touch floor applies where the pointer is coarse",
  /@media \(pointer: coarse\)/.test(css),
  "a mouse should see no change at all"
);

check(
  "buttons and selects get a 44px floor on touch",
  /button:not\(\.tap-tight\)[\s\S]{0,200}?min-height: 44px;/.test(css),
  ""
);

check(
  "icon-only controls get width too",
  /:has\(> svg:only-child\)[\s\S]{0,80}?min-width: 44px;/.test(css),
  "an icon button has no text to widen it"
);

check(
  "form fields are 16px on touch",
  /input,\s*\n\s*textarea,\s*\n\s*select \{\s*\n\s*font-size: 16px;/.test(css),
  "iOS zooms the page in below 16px and does not zoom back out"
);

check(
  "the floor is opt-out-able",
  /\.tap-tight/.test(css),
  "a global floor with no escape hatch breaks a dense strip somewhere"
);

check(
  "Answer Library chip rows opt in",
  /\.chip-row button \{[\s\S]{0,80}?min-height: 44px;/.test(css) &&
    /chip-row/.test(detail),
  "the chips are the capture control — they are the targets that matter most"
);

/* ------------------------------------- Part 2: capture is not below the fold */

check(
  "the check screen goes two-pane at lg, not xl",
  /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.08fr\)\]/.test(detail) &&
    !/xl:grid-cols-\[minmax/.test(detail),
  "an iPad in landscape is 1180px and was stacking"
);

check(
  "capture comes first when the panes stack",
  /order-1 px-5[\s\S]{0,60}?lg:order-2/.test(detail) &&
    /order-2 border-b[\s\S]{0,80}?lg:order-1/.test(detail),
  "the reference column is first in the DOM and would otherwise sit above the controls"
);

check(
  "the reference is still shown, not hidden",
  !/hidden lg:block[\s\S]{0,200}?reference/.test(detail) &&
    /siteVariant &&/.test(detail),
  "the site variant must never be collapsed away — 33 checks are stricter here"
);

/* ------------------------- Part 3: field mode does the walkabout it is for */

check(
  "field mode loads the Answer Library",
  /useAnswerLibrary\(\)/.test(field),
  "the walkabout screen was the one screen that never opened it"
);

check(
  "field mode shows the researched walkabout options",
  /library\?\.\[c\.id\]\?\.WO \?\? \[\]/.test(field) && /wo\.map\(\(w, i\) =>/.test(field),
  "four status buttons is not a visual inspection"
);

check(
  "tapping an option records it and its status, as FIELD work",
  /setWalkabout\(c\.id, i, w\.sets\);\s*\n\s*commit\(c\.id, "field"\);/.test(field),
  "tapped not typed, and credited to the half the tablet can actually answer"
);

check(
  "the photograph expectation is computed from the library flag",
  /wo\[picked\]\?\.photo === true && photos\.length === 0/.test(field),
  "the flag was carried in the data and rendered nowhere but a desk tooltip"
);

check(
  "and said on screen while the auditor is still in front of the asset",
  /Photograph expected for this observation/.test(field),
  ""
);

check(
  "the option's own photo marker is shown on the chip",
  /w\.photo \? " 📷" : ""/.test(field),
  ""
);

/* ------------------------------------------------- Part 4: less scrolling */

check(
  "field cards go three-up at lg rather than xl",
  /sm:grid-cols-2 lg:grid-cols-3/.test(field),
  "more cards per screen on a tablet in landscape is fewer scrolls"
);

/* --------------------------- Part 5: the scope bugs this pass turned up */

check(
  "media is named with the entity in view",
  /const entityCode = useEntityCode\(\);/.test(capture) &&
    !/CURRENT_ENTITY/.test(capture),
  "a voice note recorded at Cape Town was filenamed FALE-voice-…"
);

check(
  "field mode's zone note names the entity in view",
  !/CURRENT_ENTITY/.test(field),
  ""
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nTABLET OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
