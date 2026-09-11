import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* WHERE THE WORK WAS DONE, AND THE FURNITURE THAT WAS IN THE WAY OF DOING IT.
 *
 * One session's worth of changes, all of them from Sarel using the app on his
 * own phone and laptop rather than from a spec. They are covered together
 * because they are one change of mind about what the Inspection screen is: a
 * list of work with a filter over it, not a tree to browse; and a record that
 * says where it happened, not only what it was.
 *
 * The assertions fall into four groups:
 *
 *   LOCATION       Every inspection and every photograph can say where it was.
 *                  Free text, never a closed list — ACSA has not supplied real
 *                  zone names and the register's `area` column is a category, a
 *                  third of whose values are not places at all. Optional and
 *                  absent-means-empty, which is why no persist version bump is
 *                  needed; the running location is offered and written on
 *                  commit, never written into a record merely opened.
 *
 *   THE FILTER     The top level of the hierarchy became a filter. What the
 *                  tree keeps is the asset system, which is the unit ACSA
 *                  rates. A search still beats the filter, because the check
 *                  for the thing in front of the auditor must be findable.
 *
 *   WALK ITEMS     Filed into their asset system with the rest of the work,
 *                  marked as added by hand, and STILL outside every count.
 *
 *   THE SHELL      The document does not scroll. A `position: absolute`
 *                  descendant with no positioned ancestor inflated the html box
 *                  and carried the entire chrome off the top of the screen.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const types = read("src", "lib", "types.ts");
const field = read("src", "app", "(app)", "field", "page.tsx");
const capture = read("src", "components", "Capture.tsx");
const review = read("src", "app", "(app)", "review", "page.tsx");
const closure = read("src", "app", "(app)", "closure", "page.tsx");
const shell = read("src", "components", "AppShell.tsx");
const css = read("src", "app", "globals.css");
const store = read("src", "lib", "store.ts");
const addSheet = read("src", "components", "AddItemSheet.tsx");
const exports_ = read("src", "lib", "exports.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};
/* Comments discuss the trap; the CODE is what has to be right. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const fieldCode = codeOnly(field);
const captureCode = codeOnly(capture);

/* ---- 1 · the record can say where ---------------------------------------- */

check(
  "an inspection carries where it was done",
  /^\s*location\?: string;/m.test(types.slice(types.indexOf("export interface Response"))),
  "the register's area column is a category, not a place"
);

check(
  "and so does a photograph, independently",
  /^\s*location\?: string;/m.test(
    types.slice(types.indexOf("export interface Attachment"), types.indexOf("export interface Response"))
  ),
  "one inspection can carry evidence from two places"
);

check(
  "both are optional, so no persist version has to move",
  /location\?: string;/.test(types) && !/location: string;/.test(types),
  "absent-means-empty is the shape feedback? and adhoc? already use — there is nothing for a migration to convert"
);

check(
  "and the persist key is untouched",
  /name: "acsa-assurance-v1"/.test(store),
  "the key never changes; the version does"
);

/* ---- 2 · the running location, and what writes it ------------------------ */

check(
  "the screen carries a running location",
  /const \[here, setHere\] = useState\(\(\) => lastLocationIn\(/.test(fieldCode),
  "typed once per place, not once per check"
);

check(
  "picked up from the record rather than from storage",
  /function lastLocationIn\(responses: Record<string, Response \| undefined>\): string/.test(field),
  "the record is the only thing that survives the device being handed over"
);

check(
  "opening a check does not write a location into it",
  !/useEffect\([\s\S]{0,200}patch\(c\.id, \{ location/.test(fieldCode),
  "a place on a record somebody only looked at is a place nobody stood in"
);

check(
  "saving one does",
  /const saveField = \(id: string\) => \{[\s\S]{0,400}?if \(!existing && here\.trim\(\)\) patch\(id, \{ location: here\.trim\(\) \}\);/.test(
    fieldCode
  ),
  "commit is the moment the auditor says this inspection happened"
);

check(
  "and every field commit goes through it",
  !/commit\(c\.id, "field"\)/.test(fieldCode) && /saveField\(c\.id\)/.test(fieldCode),
  "a route that saves a check and loses where it was is the one that will be used"
);

check(
  "an existing location is never overwritten by the running one",
  /const existing = responses\[id\]\?\.location\?\.trim\(\);/.test(fieldCode),
  "the auditor typed it; the screen does not know better"
);

/* ---- 3 · a photograph inherits the place, without a tap ------------------ */

check(
  "a photograph taken on a check inherits its location",
  /location: r\?\.location\?\.trim\(\) \|\| here,/.test(fieldCode),
  "the camera is always where the auditor is"
);

check(
  "and one taken on a walk item inherits the item's",
  /location: value\.area\.trim\(\),/.test(codeOnly(addSheet)),
  ""
);

check(
  "the photograph's own location is editable",
  /onChange=\{\(e\) => onUpdate\(\{ location: e\.target\.value \}\)\}/.test(captureCode),
  "inherited is a default, not a fact"
);

check(
  "the suggestions come from one datalist, declared once",
  /export const LOCATION_LIST_ID = "squawk-locations";/.test(capture) &&
    /export function LocationOptions\(\{ values \}: \{ values: string\[\] \}\)/.test(capture) &&
    /<LocationOptions values=\{knownLocations\} \/>/.test(field),
  "a datalist is addressed by id and cannot be re-rendered per photograph"
);

check(
  "places already named on this walk are suggested first",
  /for \(const r of Object\.values\(responses\)\) \{\s*\n\s*push\(r\?\.location\);/.test(fieldCode),
  "the next location on a walk is nearly always one of the last few"
);

check(
  "and the box is free text, never a closed list",
  /list=\{LOCATION_LIST_ID\}/.test(fieldCode) && !/<select[^>]*location/i.test(fieldCode),
  "real zone names have not been supplied; forcing a wrong category is worse than a blank"
);

/* ---- 4 · the photograph card is not a wall of empty boxes ---------------- */

check(
  "asset, reference and location are folded behind one control",
  /const \[details, setDetails\] = useState\(false\);/.test(captureCode) &&
    /details && \(\s*\n\s*<span className="flex flex-wrap gap-\[5px\]">/.test(captureCode),
  "four fields per photograph, times several photographs, is a wall between the auditor and the next check"
);

check(
  "and a folded panel never hides a value",
  /const filled = \[a\.location, a\.assetName, a\.assetRef\]\.filter\(Boolean\)\.join\(" · "\);/.test(
    captureCode
  ) && /\{filled \? filled : details \? "hide asset & location" : "\+ asset & location"\}/.test(captureCode),
  "the summary reads the fields out, so shut is not the same as unknown"
);

/* ---- 5 · the camera and the microphone are out of the reading order ------ */

check(
  "the capture tools are in the sheet's footer, not its body",
  /footer=\{[\s\S]{0,1200}?<PhotoButton[\s\S]{0,900}?<VoiceNoteButton/.test(fieldCode),
  "pinned, never scrolled away, and out of the middle of the form"
);

check(
  "and the link off to the desk screen is gone",
  !/Full check-point →/.test(fieldCode) && !/useRouter/.test(fieldCode),
  "it left the walk for the desk screen mid-walk, which is the opposite of what this screen is for"
);

/* ---- 6 · the top level is a filter ---------------------------------------- */

check(
  "the screen holds a filter, defaulting to everything",
  /const \[filter, setFilter\] = useState\(""\);/.test(fieldCode),
  "nothing is hidden until the auditor chooses to hide it"
);

check(
  "a filter the axis does not carry is read as all of them, not corrected later",
  /const activeFilter = filter && tops\.includes\(filter\) \? filter : "";/.test(fieldCode),
  "clearing it a render later flashes an empty screen first"
);

check(
  "the options come off the whole register, not off what is showing",
  /for \(const c of checksAt\(entityCode\)\.filter\(needsField\)\) set\.add\(topOf\(c\)\);/.test(fieldCode),
  "a filter whose options change as you use it cannot be undone"
);

check(
  "it is a select, not a chip strip",
  /aria-label=\{groupBy === "area" \? "Filter by location" : "Filter by discipline"\}/.test(fieldCode),
  "133 register categories in a horizontally scrolling row is not a filter anybody can use"
);

check(
  "a search still beats the filter",
  /if \(s\) \{[\s\S]{0,600}?\}\s*\n\s*if \(activeFilter\) return list\.filter/.test(fieldCode),
  "the check for the thing in front of the auditor must be findable whatever was set in another building"
);

check(
  "and the screen says so when it does",
  /Searching every \{groupBy === "area" \? "location" : "discipline"\}, not just/.test(field),
  "a row count jumping past the filter reads as the filter being broken"
);

check(
  "the tree that is left starts at the asset system",
  /for \(const c of visible\) bucket\(c\.system\?\.trim\(\) \|\| NO_SYSTEM\)\.checks\.push\(c\);/.test(
    fieldCode
  ),
  "the asset system is the unit ACSA rates, reports and compares year on year"
);

check(
  "and the unattributed bucket sorts last",
  /a\.sys === NO_SYSTEM \? 1 : b\.sys === NO_SYSTEM \? -1 : a\.sys\.localeCompare\(b\.sys\)/.test(
    fieldCode
  ),
  "it is a residue, not an asset system"
);

/* ---- 7 · walk items are filed in, and still outside every count ---------- */

check(
  "walk items are bucketed by asset system with the checks",
  /for \(const it of walkVisible\) bucket\(it\.system\?\.trim\(\) \|\| NO_SYSTEM\)\.walk\.push\(it\);/.test(
    fieldCode
  ),
  ""
);

check(
  "the group's fraction counts check-points only",
  /done: doneOf\(b\.checks\),\s*\n\s*total: b\.checks\.length,/.test(fieldCode),
  "a denominator that grows as you work is not a denominator"
);

check(
  "and the walk count is stated beside the fraction, never inside it",
  /<Pill tone="accent">\+\{g\.walk\.length\}<\/Pill>/.test(field),
  ""
);

check(
  "an unattributed walk item survives every filter",
  /const own = \(groupBy === "area" \? it\.area : it\.discipline\)\?\.trim\(\);\s*\n\s*return !own \|\| own === activeFilter;/.test(
    fieldCode
  ),
  "a filter that hides an unattributed observation makes the one record nobody can re-derive the easiest to lose"
);

/* ---- 8 · the follow-up screen ------------------------------------------- */

check(
  "asset systems on Follow-up are shut by default",
  /const \[openSystems, setOpenSystems\] = useState<string\[\] \| null>\(null\);/.test(
    codeOnly(closure)
  ),
  "33 open items across a dozen systems, all open, is a scroll with no shape to it"
);

check(
  "except the one the detail pane is showing",
  /openSystems === null\s*\n?\s*\? active\?\.system === g\.sys/.test(codeOnly(closure)),
  "a detail pane showing a finding whose row is inside a shut group has lost track of what it is showing"
);

check(
  "and the first press inherits that, rather than shutting it",
  /const base =\s*\n?\s*cur \?\? \(active\?\.system \? \[active\.system\] : \[\]\);/.test(
    codeOnly(closure)
  ),
  ""
);

check(
  "a rating band is written out in full",
  /\{p\.rating\}/.test(closure) && !/p\.rating\.slice\(0, 4\)/.test(closure),
  "TOLE and UNAC are not abbreviations anybody agreed, on the screen that decides whether a band improved"
);

check(
  "the five figures are one line, not five cards and a line",
  !/Verified closed", counts\.closed/.test(closure) &&
    /verified closed", "good"\]/.test(closure),
  "the same five numbers rendered twice cost about 110px of a laptop screen"
);

/* ---- 9 · the shell is locked to the viewport ----------------------------- */

check(
  "the shell cannot be scrolled out of view",
  /html,\s*\n\s*body \{\s*\n\s*height: 100%;\s*\n\s*overflow: hidden;/.test(css),
  "an sr-only span 1,077px down an inner scroller inflated the html box and took the masthead with it"
);

check(
  "and a stray absolute resolves inside it, where overflow can clip it",
  /className="relative flex h-screen flex-col overflow-hidden"/.test(shell),
  "Tailwind's sr-only is position: absolute; with no positioned ancestor it resolves against the initial containing block"
);

check(
  "the shell is the visible viewport, not 100vh, where the browser knows the difference",
  /style=\{\{ height: "100dvh" \}\}/.test(shell),
  "on a phone 100vh is the viewport with the chrome retracted, so the bottom nav sits under the address bar"
);

check(
  "the audit strip does not restate the masthead on a phone",
  /no-scrollbar hidden shrink-0 items-center overflow-x-auto border-b px-3\.5 py-\[7px\] sm:flex/.test(
    shell
  ),
  "the masthead already says KSIA and Sep 2026, in the app's largest type, and never scrolls"
);

check(
  "and everything it did is still reachable at every width",
  /label="All audits"[\s\S]{0,300}?onClick=\{\(\) => \{ setMore\(false\); setAudits\(true\); \}\}/.test(
    shell
  ),
  "hiding the only route to another site would be worse than the duplication"
);

/* ---- 10 · a photograph taken on one device is visible on the other ------- */

check(
  "Review falls back to the thumbnail that actually crosses between devices",
  /const src = url \?\? a\.thumbDataUrl \?\? a\.dataUrl \?\? null;/.test(review),
  "a blobKey is a pointer into local IndexedDB; the thumbnail rides inside the persisted JSON"
);

check(
  "in the lightbox as well as the tile",
  (review.match(/url \?\? a\.thumbDataUrl \?\? a\.dataUrl \?\? null/g) ?? []).length >= 2,
  "a tile that paints and a lightbox that does not is a photograph you can see until you tap it"
);

check(
  "and it is only called missing when it truly is",
  /if \(a\.unavailable \|\| \(missing && !a\.thumbDataUrl && !a\.dataUrl\)\) \{/.test(review),
  ""
);

check(
  "the two reasons an image is not here are told apart",
  /\{a\.unavailable\s*\n?\s*\? "no image stored — captured before this worked"\s*\n?\s*: "the image is on the device that took it"\}/.test(
    review
  ),
  "telling an auditor their evidence is corrupt old data when it is one sync away is worse than telling them nothing"
);

/* ---- 11 · and it reaches the workbook ----------------------------------- */

check(
  "the register sheet carries where each check was inspected",
  /r\?\.location\?\.trim\(\) \?\? "",/.test(exports_) &&
    /\{ header: "Where it was inspected", width: 28 \},/.test(exports_),
  "a location the auditor typed that never leaves the device is a location nobody can act on"
);

check(
  "the photographs sheet carries where each one was taken",
  /a\.location\?\.trim\(\) \?\? "",/.test(exports_) &&
    /\{ header: "Where it was taken", width: 28 \},/.test(exports_),
  ""
);

check(
  "as its own column, not folded into the register's Area",
  /\{ header: "Area", width: 20 \},\s*\n\s*\{ header: "Where it was taken", width: 28 \},/.test(
    exports_
  ),
  "Area is ACSA's category; a third of the values at KSIA are not places"
);

check(
  "on both the register photographs and the walk photographs",
  (exports_.match(/a\.location\?\.trim\(\) \?\? "",/g) ?? []).length >= 2,
  "a reader looking for an image should not have to know which of two places it was captured from"
);

console.log(failures === 0 ? "\nLOCATION OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
