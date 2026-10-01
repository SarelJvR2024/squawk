import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* DAILY DIARY — rebuilt 1 October 2026 from a single free-text field into
 *  dated, categorised entries, after Sarel asked to "capture the day, start
 *  time, end time, and for each entry capture the category... For each
 *  entry i should be allowed to capture a time. Add save and delete and
 *  signature." Still the same SiteDay record attendance.ts owns — the diary
 *  only moved to its own screen, it did not become a second register. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "diary", "page.tsx");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const {
  DIARY_CATEGORIES,
  DIARY_CATEGORY_LABEL,
  diaryGaps,
  diaryLines,
  isDiarySigned,
  sortedEntries,
  unbackedDiarySignature,
} = await import(path.join(here, "..", "src", "lib", "diary.ts"));

const sig = (over = {}) => ({
  ref: "ATT-7K2P9_DIARY",
  blobKey: "sig-abc",
  signedName: "T. Nkosi",
  signedAt: Date.now(),
  width: 600,
  height: 264,
  bytes: 4000,
  ...over,
});

const entry = (over = {}) => ({
  id: "d1",
  category: "general",
  at: 1000,
  text: "",
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

const day = (over = {}) => ({
  id: "ATT-7K2P9",
  entity: "FAOR",
  date: "2026-10-01",
  openedAt: 1,
  openedBy: "Sarel Jansen van Rensburg",
  location: "",
  purpose: "",
  dayStart: null,
  dayEnd: null,
  diaryEntries: [],
  diarySignature: null,
  entries: [],
  attachments: [],
  ...over,
});

/* ----------------------------------------------- 1. the fixed category set */

check(
  "there are seven categories",
  DIARY_CATEGORIES.length === 7,
  JSON.stringify(DIARY_CATEGORIES)
);
for (const cat of ["weather", "people", "equipment", "progress", "risks", "issues", "general"]) {
  check(`"${cat}" is one of them`, DIARY_CATEGORIES.includes(cat));
  check(`"${cat}" has a label`, typeof DIARY_CATEGORY_LABEL[cat] === "string" && DIARY_CATEGORY_LABEL[cat].length > 0);
}

/* ----------------------------------------------------- 2. what is still owed */

check("an empty diary says so", diaryGaps(day()).includes("no diary entries"));
check(
  "entries alone are not an attestation — unsigned still owes",
  diaryGaps(day({ diaryEntries: [entry()] })).includes("diary not signed")
);
check(
  "a signed, non-empty diary owes nothing",
  diaryGaps(day({ diaryEntries: [entry()], diarySignature: sig() })).length === 0
);

/* -------------------------------------------- 3. signed means a mark was made */

check("a day with no signature is not signed", isDiarySigned(day()) === false);
check(
  "a signature with no blobKey behind it is NOT signed",
  isDiarySigned(day({ diarySignature: sig({ blobKey: "" }) })) === false
);
check("a stored mark is signed", isDiarySigned(day({ diarySignature: sig() })) === true);

/* ------------------------------------------------------- 4. entries sort by time */

check(
  "entries are returned oldest first, regardless of insertion order",
  JSON.stringify(
    sortedEntries(day({ diaryEntries: [entry({ id: "b", at: 300 }), entry({ id: "a", at: 100 })] })).map(
      (e) => e.id
    )
  ) === JSON.stringify(["a", "b"])
);

/* ----------------------------------------------- 5. signatures only on this device */

check(
  "an unbacked signature is reported",
  unbackedDiarySignature(day({ diarySignature: sig() })).length === 1
);
check(
  "one backed up to the record store is not",
  unbackedDiarySignature(day({ diarySignature: sig({ cloudUrl: "https://x" }) })).length === 0
);
check("no signature at all is not reported as unbacked", unbackedDiarySignature(day()).length === 0);

/* ------------------------------------------------------------- 6. the text */

const bare = diaryLines(day());
check("an empty day's window reads as not recorded", bare.some((l) => l.includes("not recorded")));

const full = diaryLines(
  day({
    dayStart: new Date("2026-10-01T07:00:00").getTime(),
    dayEnd: new Date("2026-10-01T16:30:00").getTime(),
    diaryEntries: [entry({ category: "weather", text: "Clear, light wind.", at: new Date("2026-10-01T07:15:00").getTime() })],
    diarySignature: sig(),
  })
);
check("it names the day's window", full.some((l) => l.includes("07:00") && l.includes("16:30")));
check("it carries the entry text", full.some((l) => l.includes("Clear, light wind.")));
check("it names the category", full.some((l) => l.includes("WEATHER")));
check("a signed diary names its reference", full.some((l) => l.includes("ATT-7K2P9_DIARY")));

/* ------------------------------------------------------------ 7. the store */

check(
  "adding an entry clears the day's signature",
  /addDiaryEntry[\s\S]{0,700}diarySignature: null,/.test(store)
);
check(
  "patching an entry clears the day's signature",
  /updateDiaryEntry[\s\S]{0,500}diarySignature: null,/.test(store)
);
check(
  "removing an entry clears the day's signature",
  /removeDiaryEntry[\s\S]{0,400}diarySignature: null,/.test(store)
);
check(
  "a patch cannot smuggle a different id or createdAt onto an entry",
  /updateDiaryEntry[\s\S]{0,300}const \{ id: _i, createdAt: _c, \.\.\.safe \} = p;/.test(store)
);
check(
  "the store assigns the reference, not the screen",
  /signDiary[\s\S]{0,300}ref: `\$\{id\}_DIARY`/.test(store)
);
check(
  "re-signing releases the previous mark's blob",
  /signDiary[\s\S]{0,500}previous\.blobKey !== sig\.blobKey\) void delBlob\(previous\.blobKey\)/.test(store)
);
check(
  "the persisted shape was versioned to carry the rebuilt diary",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 22
);
check(
  "the v22 migration backfills dayStart/dayEnd/diarySignature rather than leaving them undefined",
  /from < 22[\s\S]{0,1500}dayStart: d\.dayStart \?\? null[\s\S]{0,80}dayEnd: d\.dayEnd \?\? null[\s\S]{0,80}diarySignature: d\.diarySignature \?\? null/.test(
    store
  )
);
check(
  "the v22 migration converts old free text into one general entry rather than discarding it",
  /from < 22[\s\S]{0,2200}category: "general" as const,[\s\S]{0,200}text,/.test(store),
  "a day that had something written in it must not go silently blank"
);
check(
  "a day with no old text migrates to an empty log, not a fabricated entry",
  /from < 22[\s\S]{0,2400}: \[\],/.test(store)
);
check(
  "DiaryEntry carries its own category and time, same shape described in types.ts",
  /interface DiaryEntry \{[\s\S]{0,200}category: DiaryCategory;[\s\S]{0,100}at: number;/.test(types)
);
check(
  "SiteDay no longer carries the old free-text diary field",
  !/diary: string;/.test(types)
);

/* ------------------------------------------------------------- 8. reachable */

check("the screen has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "diary", "page.tsx")));
check("it is reachable from the shell", /router\.push\("\/diary"\)/.test(shell) || /href:\s*"\/diary"/.test(shell));
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">Daily diary<\/h2>/.test(page)
);

/* -------------------------------------------------- 9. the UI Sarel asked for */

check(
  "the day's start and end time are editable",
  /DAY START[\s\S]{0,200}type="time"[\s\S]{0,200}dayStart/.test(page) &&
    /DAY END[\s\S]{0,200}type="time"[\s\S]{0,200}dayEnd/.test(page)
);
check(
  "tapping a category immediately adds an entry — no separate add step",
  /DIARY_CATEGORIES\.map\(\(cat\) => \(\s*<Btn key=\{cat\} onClick=\{\(\) => addEntry\(day\.id, cat\)\}/.test(page)
);
check(
  "each entry has its own editable time",
  /type="time"[\s\S]{0,120}value=\{timeInputValue\(e\.at\)\}/.test(page)
);
check(
  "each entry has its own editable category",
  /<select[\s\S]{0,120}value=\{e\.category\}/.test(page)
);
check("there is a Delete control per entry", /removeEntry\(day\.id, e\.id\)/.test(page) && /Delete/.test(page));
check(
  "there is no control that deletes the whole day — that would take the attendance register with it",
  !/removeSiteDay|deleteSiteDay/.test(page)
);
check(
  "there is one signature for the whole day, not per entry",
  /signDiary\(day\.id, s\)/.test(page) && !/signDiary\(day\.id, e\.id/.test(page)
);
check(
  "the declaration names the day as a record, not a checklist",
  /confirms this is an accurate record of\s*\n?\s*the day/.test(page)
);
check("signing is disabled with nothing to attest to", /disabled=\{entries\.length === 0\}/.test(page));
check(
  "there is a visible Save action, not just silent autosave",
  /Save\{!pinned \? " & close" : ""\}/.test(page)
);
check(
  "saving gives a visible confirmation",
  /savedId === day\.id \? <Pill tone="accent">✓ SAVED<\/Pill>/.test(page)
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
