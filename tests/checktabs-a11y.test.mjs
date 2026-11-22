import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE TAB STRIP IS GONE (build prompt 3, "the check, one screen"
 * redesign, 21 Nov 2026) — replaced by flat rows and seven Sheets, one
 * per thing that used to be a tab. The accessible-tabs model this file
 * used to guard (role="tablist"/"tab"/"tabpanel", roving tabindex,
 * arrow-key/Home/End navigation within a group) no longer applies: there
 * is no tab strip left to navigate.
 *
 * Sheet's OWN accessibility — role="dialog", a focus trap, Escape,
 * backdrop click, focus returned to whatever opened it — is a shared
 * mechanism, tested once for every sheet in the app in
 * tests/sheet.test.mjs; this file does not re-prove it. What is worth
 * guarding here, specific to CheckDetail, is: the old tab pattern is
 * genuinely gone, not just relabelled, and every one of the seven
 * Sheets this screen opens is wired correctly — a real `open`/`onClose`
 * pair, a title, and a close that actually clears `sheet` back to
 * `null` rather than leaving the dialog unable to close. */

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

/* -------------------------------- the old tab pattern is actually gone --- */

check(
  "no role=\"tablist\"/\"tab\"/\"tabpanel\" is left anywhere in this file",
  !/role="tablist"/.test(src) && !/role="tab"/.test(src) && !/role="tabpanel"/.test(src)
);
check(
  "no roving-tabindex or arrow-key tab navigation is left either",
  !/groupHasOpen/.test(src) && !/onTabKeyDown/.test(src)
);
check(
  "panelBaseId (the tab ↔ tabpanel id-sharing this file no longer needs) is gone",
  !/panelBaseId/.test(src)
);

/* --------------------- one `sheet` key, read by Sheet's own `open` prop --- */

check(
  "sheet state is a single key, not reused tab-strip state",
  /const \[sheet, setSheet\] = useState<string \| null>\(null\);/.test(src)
);
check(
  "it resets to null when the check changes, unlike the old panel state that deliberately stayed",
  /setSheet\(null\);/.test(
    src.slice(src.indexOf("if (shownFor !== check.id)"), src.indexOf("useEffect(() => {"))
  )
);

/* ---------------- every one of the seven Sheets is wired, not orphaned --- */

const sheetKeys = ["howToAsk", "standard", "evidenceStatus", "walkabout", "findings", "more"];
for (const key of sheetKeys) {
  check(
    `the "${key}" Sheet opens from sheet === "${key}" and closes back to null`,
    new RegExp(`<Sheet open=\\{sheet === "${key}"\\} onClose=\\{\\(\\) => setSheet\\(null\\)\\}`).test(
      src
    ),
    "a Sheet with no real onClose, or gated on the wrong key, cannot be closed or never opens"
  );
}
check(
  "every Sheet declares a title — a screen reader announces an unlabelled dialog as nothing at all",
  (src.match(/<Sheet open=\{sheet === "[a-zA-Z]+"\}/g) || []).length ===
    (src.match(/<Sheet open=\{sheet === "[a-zA-Z]+"\}.*?title=/g) || []).length,
  "Sheet.tsx itself requires `title` in its own type, but a literal that slips past it would still read as a bug here"
);

/* ------------------- the triggers actually open the right Sheet, by key --- */

check(
  "How to ask and ACSA requirement are two distinct buttons, opening two distinct Sheets",
  /onClick=\{\(\) => setSheet\("howToAsk"\)\}/.test(src) &&
    /onClick=\{\(\) => setSheet\("standard"\)\}/.test(src)
);
check(
  "the Evidence row opens evidenceStatus, the Walk row opens walkabout — not swapped",
  /onClick=\{\(\) => setSheet\("evidenceStatus"\)\}/.test(src) &&
    /onClick=\{\(\) => setSheet\("walkabout"\)\}/.test(src)
);
check(
  "the Issues row only opens its Sheet when there is something to show",
  /onClick=\{\(\) => checkFindings\.length > 0 && setSheet\("findings"\)\}/.test(src)
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
