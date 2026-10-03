import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* TOOLBOX TALK RECORD — TK-003 form 6, added 2 October 2026 alongside the
 *  incident/near-miss report and daily closeout. Mirrors src/lib/siteAccess.ts
 *  exactly: ONE RECORD PER TALK, not one per day — a crew briefed twice in a
 *  day as work moves between areas gets two records, each found later by
 *  what it covered. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const page = src("app", "(app)", "toolbox-talk", "page.tsx");
const shell = src("components", "AppShell.tsx");
const hub = src("app", "(app)", "forms", "page.tsx");
const exportsSrc = src("lib", "exports.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const {
  isSigned,
  nextSignatureRef,
  signedFieldsChanged,
  talkGaps,
  talkText,
  unbackedSignatures,
} = await import(path.join(here, "..", "src", "lib", "toolbox.ts"));

const sig = (over = {}) => ({
  ref: "TBX-7K2P9_S01",
  blobKey: "sig-abc",
  signedName: "T. Nkosi",
  signedAt: Date.now(),
  width: 600,
  height: 264,
  bytes: 4000,
  ...over,
});

const attendee = (over = {}) => ({
  id: "a1",
  name: "T. Nkosi",
  organisation: "",
  role: "",
  signature: null,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const talk = (over = {}) => ({
  id: "TBX-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  date: "2026-10-02",
  topic: "Working at height",
  facilitator: "",
  location: "",
  openedAt: 1,
  openedBy: "Sarel Jansen van Rensburg",
  attendees: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

/* --------------------------------------- 1. what a signature signs for */

check("changing the name invalidates it", signedFieldsChanged({ name: "X" }) === true);
check("changing the organisation invalidates it", signedFieldsChanged({ organisation: "X" }) === true);
check("changing the role invalidates it", signedFieldsChanged({ role: "X" }) === true);
check("an empty patch invalidates nothing", signedFieldsChanged({}) === false);
check(
  "the store clears the signature when the patch says so",
  /updateToolboxAttendee[\s\S]{0,700}toolboxSignedFieldsChanged\(safe\)[\s\S]{0,300}invalidates \? \{ signature: null \}/.test(
    store
  )
);

/* ------------------------------------------- 2. a typed name is not a signature */

check("a bare attendee is not signed", isSigned(attendee()) === false);
check("a stored mark is signed", isSigned(attendee({ signature: sig() })) === true);
check(
  "a signature object with no bytes behind it is NOT signed",
  isSigned(attendee({ signature: sig({ blobKey: "" }) })) === false
);

/* ------------------------------------------------------- 3. references */

check("the first signature on a talk is S01", nextSignatureRef("TBX-7K2P9", []) === "TBX-7K2P9_S01");
check(
  "re-signing does not reuse the old reference",
  nextSignatureRef("TBX-7K2P9", [attendee({ signature: sig({ ref: "TBX-7K2P9_S03" }) })]) === "TBX-7K2P9_S04"
);
check(
  "the store assigns the reference, not the screen",
  /signToolboxAttendee[\s\S]{0,600}nextToolboxSignatureRef\(id, t\.attendees\)/.test(store)
);

/* ----------------------------------------------------- 4. what is still owed */

check("an empty talk says nobody is recorded", talkGaps(talk()).includes("nobody recorded"));
check("a talk with no topic says so", talkGaps(talk({ topic: "" })).includes("no topic recorded"));
check(
  "a talk with an unsigned attendee counts it",
  talkGaps(talk({ attendees: [attendee()] })).some((g) => /unsigned/.test(g))
);
check(
  "a complete talk owes nothing",
  talkGaps(talk({ attendees: [attendee({ signature: sig() })] })).length === 0
);

/* -------------------------------------------- 5. signatures only on this device */

check(
  "a signature with no record copy is reported",
  unbackedSignatures(talk({ attendees: [attendee({ signature: sig() })] })).length === 1
);
check(
  "one that has been backed up is not",
  unbackedSignatures(talk({ attendees: [attendee({ signature: sig({ cloudUrl: "https://x" }) })] })).length === 0
);

/* ------------------------------------------------------------- 6. the text */

const bare = talkText(talk(), { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" });
check("it names the talk", bare.includes("TBX-7K2P9"));
check("it carries the topic", bare.includes("Working at height"));
check("it carries the site", bare.includes("O.R. Tambo International Airport"));

const full = talkText(
  talk({ attendees: [attendee({ signature: sig() })], facilitator: "P. Mahlangu" }),
  { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" }
);
check("the facilitator is printed", full.includes("P. Mahlangu"));
check("a signed row names its reference", full.includes("TBX-7K2P9_S01"));

/* ------------------------------------------------------------ 7. the store */

check(
  "opening a talk never returns an existing one — every talk is its own record",
  /openToolboxTalk[\s\S]{0,100}=>/.test(store) && !/openToolboxTalk[\s\S]{0,400}const existing/.test(store)
);
check("toolbox talks are persisted", /partialize[\s\S]{0,700}toolboxTalks: s\.toolboxTalks/.test(store));
check(
  "the persisted shape was versioned to carry the new slice",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 26
);
check(
  "the migration defaults the slice rather than leaving it undefined",
  /from < 26[\s\S]{0,700}Array\.isArray\(st\.toolboxTalks\)[\s\S]{0,80}st\.toolboxTalks = \[\]/.test(store)
);
check(
  "deleting a talk releases its signatures",
  /removeToolboxTalk[\s\S]{0,500}delBlobs\(keys\)/.test(store)
);

/* ------------------------------------------------------------- 8. reachable */

check("the register has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "toolbox-talk", "page.tsx")));
check("it is reachable from the Forms hub", /href: "\/toolbox-talk"/.test(hub));
check("it is not another entry in the nav bar", !/href:\s*"\/toolbox-talk"/.test(shell));
check("a screen off the nav bar still has a heading of its own", /"\/toolbox-talk": "Toolbox talk"/.test(shell));
check("it is not reachable directly from the shell's own menu any more", !/label="Toolbox talk"/.test(shell));
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">Toolbox talk<\/h2>/.test(page)
);
check(
  "adding an attendee goes through the people-directory picker, not a bare input",
  /<ContactPicker/.test(page)
);
check(
  "it is wired into the export workbook, named for what it is",
  /export function toolboxTalkSheet\(x: ExportInput\): Sheet \{/.test(exportsSrc) &&
    /name: "Toolbox talks",/.test(exportsSrc)
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
