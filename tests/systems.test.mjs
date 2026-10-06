import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE ASSET SYSTEM ASSESSMENT — the rating ACSA actually publishes.
 *
 * Sarel: "on this page we are going to do the rating of the asset systems. We
 * can again use the same hierarchy which is in the checks page; in the
 * hierarchy we only have discipline and asset system. Per asset system we add
 * icons in the hierarchy for severity, likelihood and rating. In the right hand
 * panel we include a list of all open findings from previous audit, and the
 * current audit checks compliant and non compliant ones and the inspections to
 * give us the full view of the asset system. At the top of the panel we need to
 * be able to record the likelihood and severity and the system must calculate
 * the rating and strategy. We also need to be able to capture multiple root
 * causes, multiple mitigation actions."
 *
 * Three properties matter more than the layout, and most of these assertions
 * are about them:
 *
 *   NOTHING IS DERIVED FROM THE FINDINGS. Three Amber findings on one asset
 *   system is not an Amber system, and a system with no findings is not
 *   automatically Green — it may not have been looked at. The band comes from a
 *   cell the group taps, and the findings are the evidence they read first.
 *
 *   ONE MATRIX IN THE TREE. B170 001M is drawn by RecordActions and by nothing
 *   else. A second copy on this screen is exactly how two screens come to carry
 *   two vocabularies for one instrument.
 *
 *   A BLANK IS NEVER COMPLIANT AND AN UNAGREED CELL IS NEVER A RATING. Both are
 *   the same rule: the product must not report a decision nobody made.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const types = read("src", "lib", "types.ts");
const store = read("src", "lib", "store.ts");
const page = read("src", "app", "(app)", "findings", "page.tsx");
const treat = read("src", "components", "SystemTreatment.tsx");
const detail = read("src", "components", "FindingDetail.tsx");
const merge = read("src", "lib", "merge.ts");
const exports_ = read("src", "lib", "exports.ts");
const panel = read("src", "components", "ExportPanel.tsx");
const picker = read("src", "components", "RatingPicker.tsx");
const possibleEvents = read("src", "components", "PossibleEvents.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const pageCode = codeOnly(page);
const storeCode = codeOnly(store);
const treatCode = codeOnly(treat);

/* ---- 1 · the asset system carries its own rating ------------------------ */

check(
  "SystemAssessment is declared",
  /export interface SystemAssessment \{/.test(types),
  "ACSA rates asset systems; Squawk rated findings and hazards and had no rating on the thing ACSA publishes"
);

for (const f of [
  "severity: Severity | null;",
  "likelihood: Likelihood | null;",
  "ratingConfirmed: boolean;",
  "ratingRationale: string;",
  "rootCauses: RootCauseNote[];",
  "actions: MitigationAction[];",
]) {
  check(`it carries ${f.split(":")[0]}`, types.includes(f), "");
}

check(
  "the key is the discipline and the system, not the system alone",
  /`\$\{discipline\}\|\$\{system\}`/.test(storeCode),
  "an asset system name is only unique within its discipline"
);

check(
  "and one function owns that separator",
  /systemKey: \(discipline, system\) => `\$\{discipline\}\|\$\{system\}`/.test(storeCode),
  ""
);

check(
  "it hangs off the visit, so a band can be compared to the last audit's",
  /systems\?: Record<string, SystemAssessment>;/.test(store),
  "a single rating carried across visits could not say a system improved"
);

check(
  "absent-means-empty, so no persist version has to move",
  /systems\?: Record<string, SystemAssessment>;/.test(store) &&
    /name: "acsa-assurance-v1"/.test(store),
  ""
);

check(
  "reading an unassessed system returns an empty assessment and writes nothing",
  /systemAssessment: \(discipline, system\) => \{[\s\S]{0,600}?severity: null,[\s\S]{0,200}?ratingConfirmed: false,/.test(
    storeCode
  ),
  "forcing every caller to handle a null is how a screen ends up rendering a band for a system nobody rated"
);

/* ---- 2 · the band and the strategy are calculated ----------------------- */

check(
  "the band comes from bandFor, on this screen too",
  /const band = a \? bandFor\(a\.severity, a\.likelihood\) : null;/.test(pageCode),
  ""
);

check(
  "and the treatment strategy is read off the band, never typed",
  /Strategy · \{BAND_META\[band\]\.strategy\}/.test(page),
  "clause 4.6 pairs one strategy with each band; typing it is how a Red system ends up saying 'monitor'"
);

/* 2026-09-10: the 5x5 matrix came off THIS screen — Sarel: "remove the large
   rating matrix, make it more simple to select severity and likelihood." It is
   25 cells and about 300px above the evidence it is agreed from, met once per
   asset system, 75 times. RecordActions still draws it on the findings and
   hazard screens, where the group argues over a cell and points at it.
   What must not have changed, and is what these assertions now pin: the SCALES
   and the BANDING still come from one place, and a half-set rating is still not
   a rating. */
check(
  "THE SCREEN CARRIES NO SCALE OF ITS OWN",
  !/SEVERITIES/.test(pageCode) &&
    !/LIKELIHOODS/.test(pageCode) &&
    /<RatingPicker/.test(pageCode),
  "a second copy of B170 001M is how two screens come to carry two vocabularies for one instrument"
);

check(
  "and the picker takes both scales from risk.ts",
  /import \{ LIKELIHOODS, LIKELIHOOD_DEF, SEVERITIES, SEVERITY_DEF \} from "@\/lib\/risk";/.test(
    picker
  ),
  ""
);

check(
  "A HALF-SET RATING IS STILL NOT A RATING",
  /ratingConfirmed: !!s && !!l/.test(codeOnly(picker)),
  "the matrix enforces this by its shape — a cell is inherently a complete choice; two axes can be half-answered, so the code has to"
);

check(
  "and picking the chosen one again clears it, back to unrated",
  /onClick=\{\(\) => onPick\(on \? null : o\)\}/.test(codeOnly(picker)),
  "unrated is honest and a wrong C is not"
);

check(
  "the letter and the digit are shown, and the whole label is the accessible name",
  /aria-label=\{def\(o\)\}/.test(codeOnly(picker)) && /\{o\.charAt\(0\)\}/.test(codeOnly(picker)),
  "B170 carries the number inside the label because getting the direction backwards inverts the matrix"
);

check(
  "and the choice is written out in full, never only in a hover",
  /\{value \?\? `Not picked/.test(picker),
  "a device that has no hover is the device this is built for"
);

/* ---- 3 · an unagreed cell is not a rating ------------------------------- */

check(
  "the row says SUGGESTED for a cell nobody agreed",
  /confirmed \? BAND_META\[band\]\.label\.toUpperCase\(\) : "SUGGESTED"/.test(page),
  ""
);

/* ---- 3b · the row is three marks and two audits, minimised ------------- */

check(
  "severity, likelihood and rating are inline marks on the row",
  /<Marks/.test(pageCode) && /function Marks\(/.test(pageCode),
  "Sarel asked for icons per asset system in the hierarchy"
);

check(
  "and an unset half is a dash, not a blank",
  /\{v \? v\.charAt\(0\) : "—"\}/.test(pageCode),
  "a blank square in a column of ratings reads as a zero or as a rendering fault"
);

check(
  "THE PREVIOUS AUDIT'S BAND IS ON THE ROW BESIDE THIS ONE'S",
  /2025 \{pf\.rating\.toUpperCase\(\)\}/.test(page),
  "Sarel: we need to include previous rating and current audit's rating, the previous can be made transparent"
);

/* Sarel: "color code the asset systems to show previous classification, add
 *  filter for tolerable, unacceptable." The pill alone used to carry last
 *  year's band at reduced opacity; now the whole row is tinted by it too, so
 *  scanning the list for risk does not mean reading 75 small pills — and the
 *  pill itself went from a soft fill to a panel-coloured chip with the
 *  tone's border, because a soft fill in the same colour as the row it now
 *  sits on would have disappeared into it. */
check(
  "the row itself is tinted by last audit's band, not only the small pill",
  /const priorTone = pf \? TONE_VARS\[ratingTone\(pf\.rating\)\] : null;/.test(page) &&
    /background: on \? "var\(--acc-soft\)" : \(priorTone\?\.bg \?\? "transparent"\),/.test(page),
  "reading the colour of 75 rows one small pill at a time is not scanning"
);
check(
  "the pill no longer fades into the row it now sits on",
  /background: "var\(--panel\)",\s*\n\s*borderColor: priorTone\.line,\s*\n\s*color: priorTone\.fg,/.test(
    page
  ),
  "a soft-fill pill in the same tone as its now-tinted row would be invisible"
);
check(
  "the tone-to-CSS-variable table is correct for every tone, including neutral",
  /const TONE_VARS: Record<Tone, \{ fg: string; bg: string; line: string \}> = \{/.test(page) &&
    /neutral: \{ fg: "var\(--neu\)", bg: "var\(--neu-bg\)", line: "var\(--line-2\)" \},/.test(page),
  "neutral breaks the `--${tone}...` template on both counts — the colour variable is --neu, not --neutral, and it has no -line variant of its own"
);

check(
  "the previous rating is also a filter, not only a colour",
  /const \[bandFilter, setBandFilter\] = useState<Set<Tolerance>>\(new Set\(\)\);/.test(page) &&
    /const BANDS: Tolerance\[\] = \["Unacceptable", "Tolerable", "Acceptable", "Not audited"\];/.test(
      page
    ),
  "Sarel named Tolerable and Unacceptable; all four of Tolerance's own values are offered, the same set the row's own pill already prints"
);
check(
  "nothing checked reads as no filter, same rule the rest of the screen's filters use",
  /bandFilter\.size === 0 \|\|/.test(page),
  "a filter that starts narrowed is a trap on first load, not a feature"
);
check(
  "a system with no prior rating at all matches no band and drops out while any band is checked",
  /bandFilter\.has\(priorFor\(entityCode, discipline, x\.system\)\?\.rating as Tolerance\)/.test(page),
  "a system absent from the 2025 list has no previous classification to filter on"
);
check(
  "the filter is offered only where a previous classification exists to filter on",
  /mode === "systems" && \(/.test(page) &&
    /aria-label="Filter by the previous audit's rating"/.test(page),
  "the findings-raised view has no asset-system band to filter by"
);

check(
  "and a system 2025 did not rate says so rather than showing nothing",
  /2025 —/.test(page),
  "an absent baseline is a fact, not a blank"
);

check(
  "the row is two lines, not three",
  /className="relative flex w-full items-center gap-2 border-b px-\[10px\] py-\[7px\] text-left transition-\[var\(--t\)\]"/.test(
    page
  ),
  "Sarel: the section in the left panel for an asset system has a lot of white space"
);

check(
  "and NOT RATED where there is no cell at all",
  /NOT RATED/.test(page),
  "a system nobody rated must not read as Green"
);

check(
  "the panel says so too, in words",
  /suggested — counts nowhere until the group agrees it/.test(page),
  ""
);

check(
  "the rated figure counts only agreed ratings",
  /Object\.values\(systems\)\.filter\(\(x\) => x\.ratingConfirmed\)\.length/.test(pageCode),
  ""
);

check(
  "and who agreed it is stamped by the confirmation, not by every keystroke",
  /if \(p\.ratingConfirmed === true\) \{\s*\n\s*next\.assessedBy = get\(\)\.auditor;/.test(storeCode),
  "a stamp written on every keystroke says the rating was agreed when somebody fixed a typo"
);

/* ---- 4 · nothing is computed from the findings -------------------------- */

check(
  "the band is never derived from the findings under the system",
  !/worstBand/.test(pageCode) &&
    !/bandFor\([\s\S]{0,80}findings/.test(pageCode),
  "three Amber findings on one asset system is not an Amber system"
);

check(
  "and the screen says so where the evidence is listed",
  /None of this computes the band/.test(page),
  ""
);

check(
  "every asset system at the site is rateable, not only the ones carrying a finding",
  /const checks = checksAt\(entityCode\);/.test(pageCode) &&
    /byDiscipline\.get\(c\.discipline\)/.test(pageCode),
  "a system with nothing against it is the one that most needs a rating — 'we looked and it was sound' is a finding"
);

check(
  "the screen arrives on an asset system rather than an empty panel",
  /const firstKey = tree\[0\]\?\.systems\[0\]/.test(pageCode) &&
    /const shownKey =/.test(pageCode),
  "a right panel that says 'pick one' is half a screen of nothing and a press before any work starts"
);

check(
  "and the discipline holding it is open by default",
  /expanded === null \? key === shownDiscipline : expanded\.includes\(key\)/.test(pageCode),
  "a list whose default state contradicts the panel beside it has lost track of what it is showing"
);

check(
  "a search still wins over that default",
  /searching \|\| \(expanded === null/.test(pageCode),
  ""
);

check(
  "the panels can shrink inside their grid track",
  /className="min-w-0 rounded-\[13px\] border"/.test(page) &&
    /className="min-w-0 rounded-\[15px\] border p-\[18px\]"/.test(page),
  "a grid item's default min-width is auto, and the app shell is overflow:hidden — so an overflowing child is CLIPPED, not scrollable. At 375px the group count lost its last character."
);

/* ---- 4b · the flat register is still one press away --------------------- */

check(
  "the screen has two ways in",
  /const \[mode, setMode\] = useState<"systems" \| "findings">\("systems"\);/.test(pageCode),
  "an auditor rating what they raised this morning does not know which asset systems they are under"
);

check(
  "asset system is the default",
  /useState<"systems" \| "findings">\("systems"\)/.test(pageCode),
  "it is what the screen is for"
);

check(
  "the flat register lists every finding at this visit with its band",
  /data-finding=\{f\.id\}/.test(pageCode) && /const flat = useMemo\(/.test(pageCode),
  ""
);

check(
  "and it lands on one rather than saying 'pick one'",
  /flat\.find\(\(f\) => f\.id === activeFindingId\) \?\? flat\[0\] \?\? null/.test(pageCode),
  "the auditor is here to rate; a press before any rating starts is a press wasted"
);

check(
  "ONE PANE, BOTH ROUTES",
  (pageCode.match(/<FindingDetail f=/g) ?? []).length === 2,
  "a finding rated from the register and one rated from its asset system must not be able to differ"
);

check(
  "an unrated finding says NOT RATED, and a suggested one says SUGGESTED",
  /"SUGGESTED"/.test(pageCode) && /label="Not rated"|"Not rated"/.test(pageCode),
  ""
);

check(
  "the duplicate warning shows on the register too",
  (pageCode.match(/duplicateOf\.has\(f\.id\)/g) ?? []).length === 2,
  "it is the same defect whichever list the two rows are read in"
);

/* ---- 5 · the full view of the system ------------------------------------ */

check(
  "open items from earlier audits are listed",
  /Still open from an earlier audit/.test(page) && /useOutstanding/.test(pageCode),
  ""
);

check(
  "scoped with carriesWork, so context is not counted as work",
  /outstanding\.filter\(carriesWork\)/.test(pageCode),
  "an item rated Acceptable in 2025 required no mitigation, so there is nothing to verify"
);

check(
  "findings raised at this audit are listed",
  /Raised at this audit/.test(page),
  ""
);

check(
  "THIS AUDIT'S CHECK-POINTS ARE LISTED, COMPLIANT ONES INCLUDED",
  /This audit's check-points/.test(page) && /"COMPLIANT"/.test(page),
  "a system whose checks all passed and whose 2025 finding is still open is a real shape, and only both halves show it"
);

check(
  "and a blank status is NOT CAPTURED, never compliant",
  /: "NOT CAPTURED";/.test(pageCode),
  "a system read as compliant on checks nobody answered is a band agreed on evidence that does not exist"
);

check(
  "what the walk found is listed",
  /Seen on the walk, not on the register/.test(page),
  ""
);

check(
  "an empty section says it is empty rather than disappearing",
  /empty=\{?"?/.test(page) && /The walk found nothing here/.test(page),
  "'no finding was raised here' and 'this list did not render' look identical when a section vanishes"
);

check(
  "ONE DEFECT COUNTED TWICE IS STILL CALLED OUT",
  /duplicateFindings\(findings\)/.test(pageCode) &&
    /same issue, same check/.test(page),
  "two auditors tapping the same issue button mint two findings, and the merge keys on id so it keeps both"
);

check(
  "and it is said in the row, where the pair is side by side",
  /duplicateOf\.has\(f\.id\)/.test(pageCode),
  "behind a panel it is a warning nobody opens; in the list it is a decision somebody can settle"
);

check(
  "one finding still opens in full, in a sheet",
  /<FindingDetail f=\{f\}/.test(pageCode) && /export default function FindingDetail/.test(detail),
  "the per-finding work did not go away; it moved to where the evidence is read"
);

/* ---- 6 · several root causes, several mitigation actions ---------------- */

check(
  "the cause vocabulary is ACSA's, taken from the store rather than retyped",
  /import \{ ROOT_CAUSES \} from "@\/lib\/store";/.test(treat),
  "a second copy of a closed list is how a screen comes to offer a cause ACSA does not have"
);

check(
  "a cause outside their list is recorded as written",
  /A cause ACSA's list does not carry/.test(treat),
  "mapping it onto the nearest member would report a cause nobody chose"
);

check(
  "the same cause cannot be recorded twice",
  /const already = cur\.rootCauses\.find\(\(r\) => r\.cause === text\);/.test(storeCode),
  "pressing a chip that is already on is a mis-tap, not a second cause"
);

check(
  "tapping a chosen cause takes it off again",
  /if \(existing\) onRemoveCause\(existing\.id\);\s*\n\s*else onAddCause\(rc\);/.test(treatCode),
  "a list built by tapping has to be un-buildable the same way"
);

check(
  "each mitigation action carries its own owner, date and status",
  /export interface MitigationAction \{/.test(types) &&
    /owner: string;/.test(types) &&
    /dueDate: string;/.test(types) &&
    /status: ActionStatus;/.test(types),
  "closing out an asset system is regularly three jobs owned by three people on three timelines"
);

check(
  "AND NEITHER OWNER NOR DATE IS DEFAULTED",
  /owner: "",\s*\n\s*dueDate: "",/.test(storeCode),
  "defaulting the owner puts a name against a job nobody accepted; defaulting the date invents a commitment"
);

check(
  "a missing owner or date is said in words, not only as a border colour",
  /agree it at the out-brief/.test(treat),
  ""
);

/* ---- 6b · multiple hazardous events, pulled through to the HIRA screen --- */

const hazardsPage = read("src", "app", "(app)", "hazards", "page.tsx");
const carryforward = read("src", "lib", "carryforward.ts");

check(
  "SystemAssessment carries its own possible events, same shape as a carried finding's",
  /events: PossibleEvent\[\];/.test(types),
  "one asset system regularly has several distinct futures, each with its own likelihood"
);

check(
  "the store gives it add/patch/remove, same pattern as root causes and actions",
  /addSystemEvent: \(/.test(store) &&
    /patchSystemEvent: \(/.test(store) &&
    /removeSystemEvent: \(/.test(store),
  ""
);

check(
  "a blank assessment starts with none, not undefined",
  /rootCauses: \[\],\s*\n\s*actions: \[\],\s*\n\s*events: \[\],/.test(storeCode),
  "undefined.filter is how a half-captured audit becomes a white screen"
);

check(
  "the findings screen renders PossibleEvents for the active system",
  /import PossibleEvents from "@\/components\/PossibleEvents";/.test(page) &&
    /<PossibleEvents\s*\n\s*events=\{a\.events\}/.test(pageCode),
  "same component the closure screen uses for a carried finding's possible events"
);

check(
  "and offers this system's own findings and an asset picker to link as evidence",
  /import AssetPicker from "@\/components\/AssetPicker";/.test(page) &&
    /evidence=\{\(e\) => \{/.test(pageCode) &&
    /findingsBySystem\.get\(`\$\{active\.discipline\}\|\$\{active\.system\}`\)/.test(pageCode) &&
    /<AssetPicker/.test(pageCode),
  "picking from evidence already on screen, not typing a finding id from memory"
);

check(
  "PossibleEvents renders whatever evidence the caller supplies, but does not know what a finding or an asset is",
  /evidence\?: \(event: PossibleEvent\) => ReactNode;/.test(codeOnly(possibleEvents)),
  "the closure screen's own possible events have nothing to link — they are already tied to the one finding they were raised against"
);

/* Sarel: "allow me to minimize hazardous events" — a system like Runway
 *  carries a dozen, each with its own likelihood row, note and linked
 *  evidence, so finding the one you came for meant scrolling past every
 *  other one fully open. */
check(
  "an event can be minimized to a folded summary line",
  /const \[collapsed, setCollapsed\] = useState<Set<string>>\(new Set\(\)\);/.test(possibleEvents) &&
    /const isCollapsed = collapsed\.has\(e\.id\);/.test(possibleEvents),
  "a toggle the auditor reaches for, not a default — see the next check"
);
check(
  "nothing starts collapsed — a screen that worked before this looks the same until the auditor folds one away",
  /useState<Set<string>>\(new Set\(\)\)/.test(possibleEvents),
  "an empty Set means every event renders exactly as it always has on first paint"
);
check(
  "collapsing still leaves the likelihood and any findings/assets linked visible, as a summary",
  /const summaryOf = \(e: PossibleEvent\): string => \{/.test(possibleEvents) &&
    /bits\.push\(`\$\{e\.findingIds\.length\} finding/.test(possibleEvents) &&
    /bits\.push\(`\$\{e\.assetIds\.length\} asset/.test(possibleEvents),
  "folding an event away must not hide whether it has a likelihood or linked evidence, only the editing controls"
);
check(
  "removing an event does not require expanding it first",
  /<\/button>\s*\n\s*\{isCollapsed \? \(/.test(possibleEvents) &&
    /onClick=\{\(\) => onRemove\(e\.id\)\}/.test(possibleEvents),
  "the Remove button sits outside the collapsed/expanded branch"
);

check(
  "Hazard remembers which events it was raised from",
  /sourceSystemEventIds\?: string\[\];/.test(types),
  "the asset-assurance equivalent of findingIds — what stops an event being offered twice"
);

check(
  "the HIRA screen lists events not yet pulled through",
  /const promotedEventIds = useMemo\(\s*\n\s*\(\) => new Set\(hazards\.flatMap\(\(h\) => h\.sourceSystemEventIds \?\? \[\]\)\),/.test(
    codeOnly(hazardsPage)
  ) && /From asset assurance/.test(hazardsPage),
  "once an event's id is in some hazard's list it must stop being offered again"
);

check(
  "and a recorded event stops the empty-register dead end from firing",
  /if \(!hazards\.length && !findings\.length && !systemEventCandidates\.length\) \{/.test(
    codeOnly(hazardsPage)
  ),
  "an auditor who has recorded an event but raised no finding and no hazard yet must still see it, not a screen that only offers \"Go to capture\"/\"Go to the walk\" with no mention of what they just typed"
);

check(
  "and promoting one raises a hazard pre-filled from it, unrated",
  /function promoteSystemEvent\(discipline: string, system: string, event: PossibleEvent\) \{[\s\S]{0,900}?sourceSystemEventIds: \[event\.id\],/.test(
    codeOnly(hazardsPage)
  ),
  "severity and likelihood stay the group's to agree on the matrix, same as every other route to a hazard"
);

check(
  "and the findings and assets the event was linked to carry across too",
  /const linkedFindingIds = event\.findingIds \?\? \[\];/.test(codeOnly(hazardsPage)) &&
    /findingIds: linkedFindingIds,/.test(codeOnly(hazardsPage)) &&
    /\.\.\.\(event\.assetIds \?\? \[\]\),/.test(codeOnly(hazardsPage)),
  "Sarel: \"a hierarchy or linked evidence of non-compliance and findings all contributing to the risk, giving the full picture\" — losing that chain on promotion would throw the picture away at exactly the moment it becomes a rated hazard"
);

check(
  "the merge unions events by id, same as root causes and actions",
  /const events = unionById\(m\.events \?\? \[\], t\.events \?\? \[\]\);/.test(merge),
  ""
);

check(
  "the asset-systems export sheet carries them",
  /Possible hazardous events/.test(exports_) &&
    /\(a\?\.events \?\? \[\]\)/.test(exports_),
  ""
);

check(
  "and duplicate suggestions also search the asset-system events, not just hazards and closure",
  /for \(const sys of Object\.values\(d\.systems \?\? \{\}\)\) \{[\s\S]{0,120}?for \(const e of sys\.events \?\? \[\]\) add\(e\.event\);/.test(
    carryforward
  ),
  "typing the same event a third way is exactly what the suggestion list exists to catch"
);

check(
  "a fresh tablet backfills events on every already-assessed system",
  /if \(from < 20\) \{[\s\S]{0,500}?if \(!Array\.isArray\(systems\[sk\]\.events\)\) systems\[sk\]\.events = \[\];/.test(
    storeCode
  ),
  "a SystemAssessment from before this field reads .events as undefined, not an empty array, until the migration runs"
);

check(
  "the persist version moved to carry it",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 20,
  "the version goes up again with every later slice — 21 was PPE checks and the site access log"
);

/* ---- 7 · two auditors, one out-brief ------------------------------------ */

check(
  "root causes and mitigation actions union on merge",
  /function unionById<T extends \{ id: string \}>/.test(merge) &&
    /const rootCauses = unionById\(m\.rootCauses \?\? \[\], t\.rootCauses \?\? \[\]\);/.test(merge) &&
    /const actions = unionById\(m\.actions \?\? \[\], t\.actions \?\? \[\]\);/.test(merge),
  "two people add causes independently at the same out-brief; last-writer-wins loses one list entirely"
);

check(
  "while the band itself is last-writer-wins",
  /const newer = when\(t\) > when\(m\) \? t : m;\s*\n\s*assessedSystems\[key\] = \{ \.\.\.newer, rootCauses, actions, events \};/.test(
    merge
  ),
  "a band is one decision the group made, so the later copy is the one to keep"
);

check(
  "and the possible events union the same way as root causes and actions",
  /const events = unionById\(m\.events \?\? \[\], t\.events \?\? \[\]\);/.test(merge),
  "two auditors naming different futures for the same system at the same out-brief; last-writer-wins would drop one of their lists"
);

check(
  "and the merged visit carries them",
  /systems: assessedSystems/.test(merge),
  ""
);

/* ---- 8 · it reaches the workbook ---------------------------------------- */

check(
  "there is an Asset systems sheet",
  /export function systemsSheet\(x: ExportInput\): Sheet \{/.test(exports_) &&
    /name: "Asset systems",/.test(exports_),
  ""
);

check(
  "with every asset system on it, rated or not",
  /if \(seen\.has\(key\)\) continue;/.test(exports_) && /"NOT RATED"/.test(exports_),
  "omitting an unrated system reports the gap as an absence of risk"
);

check(
  "the cell is printed only where the rating was agreed",
  /agreed && band \? \(cellCode\(a!\.severity, a!\.likelihood\) \?\? ""\) : "",/.test(exports_),
  "a code against an unconfirmed pair reads exactly like one the group settled"
);

check(
  "the strategy is derived in the workbook as it is on screen",
  /agreed && band \? BAND_META\[band\]\.strategy : "",/.test(exports_),
  "the workbook cannot be allowed to disagree with the app about what C4 means"
);

check(
  "every root cause and every action reaches it",
  /\{ header: "Root causes", width: 56, wrap: true \},/.test(exports_) &&
    /\{ header: "Mitigation actions", width: 70, wrap: true \},/.test(exports_) &&
    /NO OWNER/.test(exports_),
  "an action with no owner says so in the workbook rather than exporting a blank cell"
);

check(
  "and the sheet is in the full workbook and offered on its own",
  /systemsSheet\(x\),/.test(exports_) && /kind: "systems",/.test(panel),
  ""
);

console.log(failures === 0 ? "\nSYSTEMS OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
