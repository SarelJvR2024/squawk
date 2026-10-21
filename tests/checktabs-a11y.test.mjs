import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* TASKS 1 + 3 OF THE OVERNIGHT REFINEMENT PASS — CheckDetail's panel
 * selector already had role="tablist"/role="tab"/role="tabpanel" and
 * aria-selected (an earlier pass's work — see checkscreen.test.mjs's own
 * "the tabs are reachable to a screen reader as tabs"). What was missing is
 * the rest of the accessible tabs model the brief calls for: aria-controls/
 * aria-labelledby actually tying a tab to the one shared tabpanel, roving
 * tabindex (only the open tab — or a group's first, if none of its tabs is
 * open — stays in the normal Tab order), and arrow-key/Home/End navigation
 * within each group's own tablist. Every existing panel (the register's
 * panels array) is untouched; this is markup and keyboard behaviour only.
 * Static source read — no browser/Playwright in this sandbox. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = fs.readFileSync(path.join(root, "src", "components", "CheckDetail.tsx"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

check(
  "there is one stable id shared between every tab and the one tabpanel",
  /panelBaseId = useId\(\)/.test(src)
);

check(
  "each tab points at the shared tabpanel via aria-controls",
  /aria-controls={`\$\{panelBaseId\}-tabpanel`}/.test(src)
);

check(
  "the tabpanel is labelled by whichever tab is actually open",
  /id={`\$\{panelBaseId\}-tabpanel`}/.test(src) &&
    /aria-labelledby={`\$\{panelBaseId\}-tab-\$\{openKey\}`}/.test(src)
);

check(
  "roving tabindex: only the open tab (or a group's own first tab) is in the normal tab order",
  /const inTabOrder = groupHasOpen \? on : i === 0;/.test(src) &&
    /tabIndex={inTabOrder \? 0 : -1}/.test(src)
);

check(
  "ArrowRight/ArrowLeft move focus within a group's own tablist, wrapping",
  /next = i < 0 \? 0 : \(i \+ 1\) % list\.length/.test(src) &&
    /next = i < 0 \? list\.length - 1 : \(i - 1 \+ list\.length\) % list\.length/.test(src)
);

check(
  "Home/End jump to the first/last tab in that same group",
  /e\.key === "Home"\) next = 0/.test(src) && /e\.key === "End"\) next = list\.length - 1/.test(src)
);

check(
  "moving focus with the keyboard also activates the tab landed on",
  /btn\.focus\(\);\s*if \(btn\.dataset\.key\) setPanel\(btn\.dataset\.key\);/.test(src)
);

check(
  "the keydown handler is scoped to its own group's tablist, not the whole strip",
  /querySelectorAll<HTMLButtonElement>\('\[role="tab"\]'\)/.test(src),
  "three separate role=tablist groups share one shared tabpanel; each must cycle its own tabs only"
);

check(
  "the tabpanel itself is reachable by Tab (APG recommendation for a panel with no focusable child)",
  /role="tabpanel"[\s\S]{0,80}tabIndex={0}/.test(src)
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
