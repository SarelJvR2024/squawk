import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withHowToAsk, howToAskCount, mergeHowToAsk } from "../src/lib/howtoask.ts";

/* "How to ask" notes — build prompt 4, 21 Nov 2026: an optional per-check
 *  note, written in Setup, shown on the Checks screen during the interview.
 *  Site-wide (State.howToAsk), not per-visit, same shape as checkChannels
 *  before it. This suite covers the pure functions (shape test, mirroring
 *  tests/channels.test.mjs), the store wiring (persisted, no version bump),
 *  and that the note never reaches a report or SharePoint — it is internal
 *  guidance only. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(...parts) {
  return fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
}

let failed = 0;
function check(name, condOrFn, why) {
  try {
    const cond = typeof condOrFn === "function" ? (condOrFn(), true) : condOrFn;
    if (cond === false) throw new Error(why ?? "failed");
    console.log("PASS ", name);
  } catch (e) {
    failed++;
    console.log("FAIL ", name, e.message);
  }
}

/* ---------- pure functions ---------- */

check("no entry means no note", () => assert.equal(howToAskCount({}, ["A"]), 0));
let notes = withHowToAsk({}, ["A", "B"], "Ask the shift supervisor, not the operator.");
check("setting a note on several checks at once sets it on each", () => {
  assert.equal(notes.A, "Ask the shift supervisor, not the operator.");
  assert.equal(notes.B, "Ask the shift supervisor, not the operator.");
});
check("counts say how many of these checks have a real note", () =>
  assert.equal(howToAskCount(notes, ["A", "B", "C"]), 2));
notes = withHowToAsk(notes, ["B"], "   ");
check("a whitespace-only note does not count as set", () => assert.equal(howToAskCount(notes, ["B"]), 0));
check("but it is still stored, not deleted — the check id key stays", () =>
  assert.equal("B" in notes, true));
notes = withHowToAsk(notes, ["A"], "");
check("an empty string clears a note, same as whitespace", () => assert.equal(howToAskCount(notes, ["A"]), 0));

check("merging two devices' notes keeps a check only one side touched", () =>
  assert.deepEqual(
    mergeHowToAsk({ A: "mine" }, { B: "theirs" }),
    { A: "mine", B: "theirs" },
  ));
check("on a check both sides touched, mine wins — same convention as mergeChannelConfig", () =>
  assert.deepEqual(mergeHowToAsk({ A: "mine" }, { A: "theirs" }), { A: "mine" }));
check("merging is not destructive to the side that already agrees", () =>
  assert.deepEqual(mergeHowToAsk({ A: "mine" }, {}), { A: "mine" }));

/* ---------- store wiring ---------- */

const store = src("src", "lib", "store.ts");
check(
  "howToAsk is persisted",
  /partialize: \(s: State\) => \(\{[\s\S]{0,1000}howToAsk: s\.howToAsk/.test(store),
  "Setup-authored, site-wide notes must survive a reload like checkChannels does",
);
check(
  "the persist key and version are untouched — additive fields need neither",
  /name: "acsa-assurance-v1"/.test(store) && /version: 45,/.test(store),
  "howToAsk defaults to {} for a record that predates it, same as checkChannels",
);
check(
  "setHowToAsk delegates to the pure merge function, same pattern as setCheckChannels",
  /setHowToAsk: \(checkIds, note\) => \{\s*set\(\(s\) => \(\{ howToAsk: withHowToAsk\(s\.howToAsk, checkIds, note\) \}\)\);/.test(
    store,
  ),
);
check(
  "appendHowToAsk reads the CURRENT note from inside the store updater, not a value passed in",
  /appendHowToAsk: \(checkId, text\) => \{\s*set\(\(s\) => \{\s*const cur = s\.howToAsk\[checkId\] \?\? "";/.test(
    store,
  ),
  "a value passed as an argument can go stale during an async gap (transcription); reading state.howToAsk inside set()'s own updater cannot — code review on this branch caught the stale-closure version",
);

/* ---------- CheckDetail reads it from Setup's config, not per-visit ---------- */

const detail = src("src", "components", "CheckDetail.tsx");
check(
  "the Checks screen reads the note from State.howToAsk, not from the per-visit Response",
  /useStore\(\(s\) => s\.howToAsk\[check\.id\]\)/.test(detail),
  "a phrasing note does not change audit to audit — same scoping as channelConfig",
);
check(
  "the Sheet shows the real note when one is set",
  /howToAskNote\.trim\(\)[\s\S]{0,200}\{howToAskNote\}/.test(detail),
);
check(
  "and says honestly when there is none, pointing at where to add it",
  /No note set for this check\. Write one in Setup/.test(detail),
);

/* ---------- Setup: list, editor, apply-to-group, the count ---------- */

const setup = src("src", "app", "(app)", "setup", "page.tsx");
check("Setup has the How to ask notes section", () => assert.match(setup, /How to ask notes/));
check(
  "it shows a running count of how many checks have a note set",
  /\{howToAskTotal\} of \{CHECKS\.length\} set/.test(setup),
);
check(
  "every check's row shows whether it has a note, not just the ones that do",
  /\{set \? "Set" : "No note"\}/.test(setup),
  "Setup must show which checks have NO note, per the spec, not only the ones already filled in",
);
check(
  "apply-to-group replaces the group's notes, after a confirm — same destructive-bulk-action pattern as Reset to all three",
  /onApplyToSystem[\s\S]{0,400}window\.confirm[\s\S]{0,300}setHowToAsk\(systemIds, note\)/.test(setup) &&
    /onApplyToDiscipline[\s\S]{0,400}window\.confirm[\s\S]{0,300}setHowToAsk\(disciplineIds, note\)/.test(setup),
);
check(
  "the apply-to-system scope is the FULL asset system, not the search-narrowed group list",
  /const systemIds = CHECKS\.filter\(\s*\(x\) => x\.discipline === c\.discipline && x\.system === c\.system,\s*\)\.map\(\(x\) => x\.id\);/.test(
    setup,
  ),
  "code review on this branch caught `groupIds` (the search/discipline-filtered list) being used here instead — under an active search, \"Apply to N checks in this system\" would have silently covered only the visible subset",
);
check(
  "voice input appends through the store's own action, keyed by check id — not a prop closed over a note value",
  /<NoteMicButton checkId=\{check\.id\} \/>/.test(setup),
);
check(
  "NoteMicButton calls appendHowToAsk on both a normal stop and an interrupted recording",
  (() => {
    const body = setup.slice(setup.indexOf("function NoteMicButton"), setup.indexOf("function CheckNoteRow"));
    const interruptedCount = (body.match(/appendHowToAsk\(checkId, text\.trim\(\)\)/g) ?? []).length;
    return (
      /const rec = useRecorder\(\(result\) => \{/.test(body) &&
      interruptedCount === 2
    );
  })(),
  "one call for the normal Stop path, one for useRecorder's onInterrupted — a recording cut off by collapsing the row or opening another check must still reach the note, not be silently dropped",
);

/* ---------- never a report, never SharePoint ---------- */

const exportsSrc = src("src", "lib", "exports.ts");
const sharepointSrc = src("src", "lib", "sharepoint.ts");
check(
  "howToAsk is internal guidance only — it does not appear in either report builder",
  !exportsSrc.includes("howToAsk") && !sharepointSrc.includes("howToAsk"),
  "it is written once in Setup and read on the Checks screen; nothing in a report or SharePoint sync should ever touch it",
);

if (failed) process.exit(1);
console.log(failed ? "FAILED" : "all passed");
