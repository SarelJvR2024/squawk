import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The walk screen gets a second tab: ACSA's own requirement.
 *
 *  Sarel: "in the inspections view, when selecting a check the user can see
 *  the walkabout note, also [wants] a tab to switch to see the actual acsa
 *  requirement." The walk's "Full check-point →" link to the desk screen
 *  was removed on his own earlier instruction — leaving the walk for the
 *  desk mid-walk is the opposite of what this screen is for — so this is
 *  not that link come back: it is the same reference material, on the one
 *  screen, behind a tab rather than a navigation.
 *
 *  ONE COMPONENT, NOT TWO COPIES. The desk screen's "ACSA requirement" panel
 *  (CheckDetail.tsx) and the walk's new tab show the exact same thing, so
 *  the content was extracted into AcsaRequirementPanel.tsx and both screens
 *  render it — see that file's own header note. checkscreen.test.mjs and
 *  reviewfields.test.mjs were updated to read it alongside CheckDetail.tsx
 *  for the assertions that moved.
 *
 *  Source-read, like checkscreen.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const field = src("app", "(app)", "field", "page.tsx");
const detail = src("components", "CheckDetail.tsx");
const panel = src("components", "AcsaRequirementPanel.tsx");

let failures = 0;
const check = (name, cond, detail_ = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail_ ? `  [${detail_}]` : ""}`);
  }
};

/* ---- the panel is extracted once, used from both screens ---------------- */

check(
  "AcsaRequirementPanel is a pure, reusable component — just the Check, nothing else",
  /export default function AcsaRequirementPanel\(\{ check \}: \{ check: Check \}\)/.test(panel)
);

check(
  "the desk screen (CheckDetail) renders it rather than keeping its own copy",
  /body: <AcsaRequirementPanel check={check} \/>,/.test(detail) &&
    /import AcsaRequirementPanel from "\.\/AcsaRequirementPanel";/.test(detail),
  "two copies of the same panel is two places the next field rename gets missed in one of them"
);

check(
  "the walk screen (field) imports the same component, not a reimplementation",
  /import AcsaRequirementPanel from "@\/components\/AcsaRequirementPanel";/.test(field)
);

/* ---- the panel still carries everything it did on the desk screen -------- */

for (const text of [
  "What ACSA requires",
  "The standard to audit against",
  "Compliant when —",
  "ACSA states ·",
  "ACSA states no threshold",
  "Conflict — the check and ACSA",
]) {
  check(`the extracted panel still carries: "${text}"`, panel.includes(text));
}

/* ---- the walk screen's own tab state ------------------------------------- */

check(
  "the walk screen keeps a tab state, defaulting to the walkabout note",
  /const \[checkTab, setCheckTab\] = useState<"walkabout" \| "acsa">\("walkabout"\);/.test(field)
);

check(
  "opening a different check resets the tab to walkabout, same as issuesOpenFor resets per item",
  /onClick=\{\(\) => \{ setOpenItem\(c\.id\); setCheckTab\("walkabout"\); \}\}/.test(field),
  "a check opened to ACSA's wording must not leave the next one open to it too"
);

/* ---- the tab strip itself -------------------------------------------------- */

check(
  "the sheet renders a two-tab strip: Walkabout and ACSA requirement",
  /\["walkabout", "Walkabout"\],\s*\n\s*\["acsa", "ACSA requirement"\],/.test(field)
);

check(
  "the tabs are reachable to a screen reader as tabs, same pattern as the desk screen's strip",
  /role="tablist"/.test(field) && /role="tab"/.test(field) && /aria-selected=\{on\}/.test(field)
);

/* ---- switching actually swaps what renders -------------------------------- */

check(
  "picking the ACSA tab renders the panel instead of the walkabout content",
  /\{checkTab === "acsa" \? \(\s*\n\s*<AcsaRequirementPanel check=\{c\} \/>\s*\n\s*\) : \(/.test(field)
);

check(
  "the walkabout note, answer library and capture controls are still there on the other tab",
  (() => {
    const start = field.indexOf('{checkTab === "acsa" ? (');
    const end = field.indexOf("</Sheet>", start);
    const slice = field.slice(start, end === -1 ? field.length : end);
    return (
      /TPJV walkabout — physical check/.test(slice) &&
      /setWalkabout\(c\.id, i, w\.sets\)/.test(slice) &&
      /What you found · the observation on the record/.test(slice) &&
      /<AttachmentStrip/.test(slice)
    );
  })(),
  "the ACSA tab is additive — nothing the walk already captured should have moved or disappeared"
);

console.log(
  failures === 0 ? "\nFIELD ACSA TAB OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
