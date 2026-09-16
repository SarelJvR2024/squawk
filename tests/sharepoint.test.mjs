/* The SharePoint sync: what it writes, and — mostly — what it refuses to.
 *
 *  This suite is weighted deliberately towards REFUSALS. A sync that writes
 *  the right rows is worth having; a sync that writes a rating nobody agreed,
 *  or a blank compliance, or a second copy of every hazard at every visit, is
 *  worse than no sync at all, because it is wrong inside a system of record
 *  that other people read and act on.
 *
 *  Part 1 exercises the real functions — the plan builder, the column mapper
 *  and the vocabulary conversion are pure and importable, so they are tested
 *  by running them, not by reading them.
 *
 *  Part 2 reads the source for the properties that are not expressible as a
 *  return value: that the token is never persisted, that nothing but a GET is
 *  issued before the confirm, and that no internal column name is hardcoded. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const sp = await import("../src/lib/sharepoint.ts");

/** The source with its COMMENTS REMOVED.
 *
 *  graph.ts's header explains at length that the token is never put in
 *  localStorage or IndexedDB — and a naive text search for those words then
 *  fails on the very comment promising they are absent. An assertion about
 *  what the code does has to read the code. */
const codeOnly = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const graphSrc = src("lib", "graph.ts");
const graphCode = codeOnly(graphSrc);
const spSrc = src("lib", "sharepoint.ts");
const panel = src("components", "SyncPanel.tsx");
const callback = src("app", "graph-callback", "page.tsx");
const shell = src("components", "AppShell.tsx");
const types = src("lib", "types.ts");

/* ------------------------- Part 1: the portal's vocabulary ---------------- */

/* ERM's own labels and the portal's are the SAME WORDS on a different index:
   ERM "4 - Critical", portal "B - Critical". That is a fourth independent
   confirmation that the portal rates on ERM, after the 54/56 matrix fit, the
   framework document and the five-cell disagreement. */

check(
  "an ERM consequence converts to the portal's letter, keeping the word",
  sp.portalSeverity("4 - Critical") === "B - Critical" &&
    sp.portalSeverity("5 - Catastrophic") === "A - Catastrophic" &&
    sp.portalSeverity("1 - Minor") === "E - Minor",
  String(sp.portalSeverity("4 - Critical"))
);

check(
  "all five consequences convert",
  ["5 - Catastrophic", "4 - Critical", "3 - Significant", "2 - Moderate", "1 - Minor"].every(
    (c) => typeof sp.portalSeverity(c) === "string"
  )
);

check(
  "all five likelihoods convert, unchanged — both scales already number 1 to 5",
  ["1 - Not Likely", "2 - Slight", "3 - Likely", "4 - Highly Likely", "5 - Expected"].every(
    (l) => sp.portalLikelihood(l)?.charAt(0) === l.charAt(0)
  )
);

check(
  "nothing at all converts to a value when the rating is absent",
  sp.portalSeverity(null) === null && sp.portalLikelihood(null) === null,
  "an absent rating must not become a string the portal will happily store"
);

/* ------------------------------ Part 1b: the column map ------------------- */

const COLS = [
  { name: "Title", displayName: "Title" },
  { name: "field_3", displayName: "Risk priority" },
  { name: "OData__x0041_bc", displayName: "Root Cause" },
  { name: "Created", displayName: "Created", readOnly: true },
  { name: "field_9", displayName: "Progress/Update" },
];

check(
  "a column is found by its DISPLAY name and written by its INTERNAL one",
  (() => {
    const m = sp.mapFields(COLS, ["title", "riskPriority", "rootCause", "progress"]);
    return (
      m.resolved.riskPriority === "field_3" &&
      m.resolved.rootCause === "OData__x0041_bc" &&
      m.resolved.progress === "field_9"
    );
  })(),
  "guessing an internal name produces a 200 OK that writes nothing"
);

check(
  "matching ignores case and punctuation",
  sp.mapFields([{ name: "x", displayName: "risk  priority" }], ["riskPriority"]).resolved
    .riskPriority === "x"
);

check(
  "a field with no column is REPORTED, never guessed at",
  (() => {
    const m = sp.mapFields(COLS, ["title", "owner", "tolerance"]);
    return m.missing.includes("owner") && m.missing.includes("tolerance") && !("owner" in m.resolved);
  })()
);

check(
  "a read-only column counts as absent",
  sp.mapFields([{ name: "Created", displayName: "Created", readOnly: true }], ["assessedOn"]).missing
    .length === 1,
  "writing to a computed column fails the whole PATCH and takes the good rows with it"
);

check(
  "projecting drops every field with no column",
  (() => {
    const m = sp.mapFields(COLS, ["title", "riskPriority", "owner"]);
    const out = sp.projectFields(m, { title: "X", riskPriority: "I", owner: "Nobody" });
    return out.Title === "X" && out.field_3 === "I" && !("owner" in out) && Object.keys(out).length === 2;
  })()
);

check(
  "null and undefined are always dropped",
  (() => {
    const m = sp.mapFields(COLS, ["title", "riskPriority"]);
    const out = sp.projectFields(m, { title: "X", riskPriority: null });
    return out.Title === "X" && !("field_3" in out);
  })()
);

/* AN EMPTY STRING DEPENDS ON THE ACTION, and this is the assertion that came
 * out of the first real sync. 33 rows were updated in a list ACSA had seeded
 * themselves, and every check answered without an observation typed carried
 * `observation: ""` — which went in and blanked theirs. Tapping Compliant
 * without adding a note is not a statement that the portal's text should go.
 *
 * Sarel, 16 September 2026: "overwrite if there is a value but if blank then
 * dont override with a blank." */

check(
  "AN UPDATE NEVER EMPTIES A CELL",
  (() => {
    const m = sp.mapFields(COLS, ["title", "riskPriority"]);
    const out = sp.projectFields(m, { title: "", riskPriority: "I" }, "update");
    return !("Title" in out) && out.field_3 === "I";
  })(),
  "a blank leaves whatever the portal already has; a value still overwrites it"
);

check(
  "but a create may write an empty cell, having nothing underneath to lose",
  (() => {
    const m = sp.mapFields(COLS, ["title"]);
    return sp.projectFields(m, { title: "" }, "create").Title === "";
  })()
);

check(
  "and the default is the permissive one, so a caller cannot silently gain the power to blank",
  (() => {
    const m = sp.mapFields(COLS, ["title"]);
    return sp.projectFields(m, { title: "" }).Title === "";
  })(),
  "forgetting the argument must not turn an update into a create"
);

check(
  "the writer passes each row's own action rather than one for the batch",
  /projectFields\(list\.map, row\.values, row\.action\)/.test(panel),
  "a plan mixes creates and updates in the same list"
);

/* -------------------------------- Part 1c: the plan ----------------------- */

const CHECK = (id, discipline = "Electrical", system = "AGL") => ({
  id, discipline, system, area: "Airside", title: id, mode: "Desk",
});

const HAZARD = (over = {}) => ({
  id: "h1", entity: "FALE", originVisit: "2026-09", event: "Uncontrolled diesel fire",
  description: "at the standby generator", why: "", findingIds: ["f1"],
  disciplines: ["Electrical"], systems: ["Generators"],
  severity: null, likelihood: null, ratingConfirmed: false,
  ermConsequence: "4 - Critical", ermLikelihood: "3 - Likely", ermConfirmed: true,
  ermLikelihoodAssumed: false, origin: "consolidated", note: "", occurrence: "",
  ratingRationale: "", progress: [], immediate: false, reassessedAt: null, reassessNote: "",
  rootCause: "", action: "", owner: "", dueDate: "", actionStatus: "Open",
  createdAt: 1_757_000_000_000, createdBy: "Sarel", ...over,
});

const BASE = {
  entity: "FALE", visit: "2026-09", visitLabel: "Sep 2026",
  checks: [CHECK("KSIA-ELE-001"), CHECK("KSIA-ELE-002")],
  responses: {},
  hazards: [],
  prior: [],
  verifications: {},
  auditor: "Sarel Jansen van Rensburg",
};
const NOTHING = { checkpoints: new Map(), findings: new Map() };

check(
  "a check nobody answered is NOT written",
  (() => {
    const p = sp.buildPlan({ ...BASE, responses: { "KSIA-ELE-001": { compliance: null, observation: "", attachments: [] } } }, NOTHING);
    return p.checkpoints.length === 0 && p.skipped.some((s) => s.what === "check-points" && s.count === 2);
  })(),
  "a blank status is NOT compliant — writing one says we looked and it was fine"
);

check(
  "and the reason says so, in the plan, where somebody reads it",
  sp
    .buildPlan({ ...BASE }, NOTHING)
    .skipped.some((s) => /blank status is NOT compliant/i.test(s.why))
);

check(
  "an answered check IS written",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, responses: { "KSIA-ELE-001": { compliance: "C", observation: "Fine", attachments: [] } } },
      NOTHING
    );
    return p.checkpoints.length === 1 && p.checkpoints[0].values.compliance === "C";
  })()
);

check(
  "an AGREED ERM cell reaches the portal, in the portal's own words",
  (() => {
    const p = sp.buildPlan({ ...BASE, hazards: [HAZARD()] }, NOTHING);
    const v = p.findings[0].values;
    return v.severity === "B - Critical" && v.likelihood === "3 - Likely" && v.riskPriority === "I";
  })(),
  JSON.stringify(sp.buildPlan({ ...BASE, hazards: [HAZARD()] }, NOTHING).findings[0]?.values)
);

check(
  "A RATING NOBODY AGREED DOES NOT — the hazard goes across, the rating is null",
  (() => {
    const p = sp.buildPlan({ ...BASE, hazards: [HAZARD({ ermConfirmed: false })] }, NOTHING);
    const v = p.findings[0].values;
    return (
      p.findings.length === 1 &&
      v.severity === null &&
      v.likelihood === null &&
      v.riskPriority === null &&
      v.tolerance === null
    );
  })(),
  "a suggestion in a list that feeds the Audit & Risk Committee reads as a judgement"
);

check(
  "and the plan says out loud that it withheld it",
  sp
    .buildPlan({ ...BASE, hazards: [HAZARD({ ermConfirmed: false })] }, NOTHING)
    .skipped.some((s) => s.what === "hazard ratings" && s.count === 1)
);

check(
  "an unrated hazard is still a row — it is a real exposure",
  sp.buildPlan({ ...BASE, hazards: [HAZARD({ ermConfirmed: false })] }, NOTHING).findings.length === 1
);

check(
  "a hazard already in the portal is an UPDATE, not a second copy",
  (() => {
    const existing = { checkpoints: new Map(), findings: new Map([["KSIA-ELE-P09", "17"]]) };
    const p = sp.buildPlan({ ...BASE, hazards: [HAZARD({ portalId: "KSIA-ELE-P09" })] }, existing);
    return p.findings[0].action === "update" && p.findings[0].itemId === "17";
  })(),
  "running the sync twice must produce the same portal, not a doubled one"
);

check(
  "a hazard with no portal id yet is minted one that CONTINUES the sequence",
  (() => {
    const existing = {
      checkpoints: new Map(),
      findings: new Map([["KSIA-ELE-P01", "1"], ["KSIA-ELE-P08", "8"]]),
    };
    const p = sp.buildPlan({ ...BASE, hazards: [HAZARD()] }, existing);
    return p.findings[0].key === "KSIA-ELE-P09" && p.findings[0].action === "create";
  })(),
  "restarting at P01 would collide with rows ACSA is already looking at"
);

check(
  "two new hazards do not get the same id",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, hazards: [HAZARD({ id: "h1" }), HAZARD({ id: "h2" })] },
      NOTHING
    );
    return p.findings[0].key !== p.findings[1].key;
  })()
);

check(
  "a created row carries its hazard id, so the Title can be written back",
  sp.buildPlan({ ...BASE, hazards: [HAZARD()] }, NOTHING).findings[0].hazardId === "h1",
  "without the write-back every visit mints a new id and the register grows a duplicate"
);

check(
  "a prior finding nobody verified is left exactly as the portal has it",
  (() => {
    const prior = [{ portalId: "KSIA-ELE-P01", entityCode: "FALE" }];
    const p = sp.buildPlan({ ...BASE, prior }, NOTHING);
    return p.findings.length === 0 && p.skipped.some((s) => s.what === "prior findings");
  })()
);

check(
  "a verified one carries its outcome and its flattened progress log",
  (() => {
    const prior = [{ portalId: "KSIA-ELE-P01", entityCode: "FALE" }];
    const verifications = {
      "KSIA-ELE-P01": {
        pf: "KSIA-ELE-P01", outcome: "Open - repeat", evidence: "", attachments: [],
        verifiedBy: "Sarel", verifiedAt: 1,
        progress: [
          { at: 1_757_000_000_000, by: "Sarel", visit: "2026-09", outcome: null, note: "PO raised" },
          { at: 1_757_100_000_000, by: "Sarel", visit: "2026-09", outcome: null, note: "Parts late" },
        ],
      },
    };
    const p = sp.buildPlan({ ...BASE, prior, verifications }, NOTHING);
    const prog = String(p.findings[0].values.progress);
    return (
      p.findings[0].values.status === "Open - repeat" &&
      /PO raised/.test(prog) &&
      /Parts late/.test(prog) &&
      /Sarel/.test(prog)
    );
  })(),
  "ACSA's Progress cell is one field that gets typed over; we keep the log and flatten it on the way out"
);

check(
  "BOTH log entries survive the flattening — it joins, it does not take the last",
  sp
    .flattenProgress([
      { at: 1_757_000_000_000, by: "A", visit: "v", outcome: null, note: "first" },
      { at: 1_757_100_000_000, by: "B", visit: "v", outcome: null, note: "second" },
    ])
    .split("\n").length === 2
);

check(
  "an empty log flattens to an empty string, not to the word undefined",
  sp.flattenProgress(undefined) === "" && sp.flattenProgress([]) === ""
);

check(
  "the evidence folder is the one the library already has, per site",
  sp.evidenceFolder("FALE") === "Evidence/King Shaka International Airport FALE",
  sp.evidenceFolder("FALE")
);

check(
  "photographs on an answered check are queued for upload",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        responses: {
          "KSIA-ELE-001": {
            compliance: "NC", observation: "x",
            attachments: [
              { id: "a1", kind: "photo", name: "n", blobKey: "b1", ref: "KSIA-ELE-001_P01", caption: "c" },
              { id: "a2", kind: "voice", name: "v", blobKey: "b2" },
            ],
          },
        },
      },
      NOTHING
    );
    return p.evidence.length === 1 && p.evidence[0].filename === "KSIA-ELE-001_P01.jpg";
  })(),
  "a voice note is not evidence for the photograph library"
);

check(
  "A PHOTOGRAPH THIS DEVICE NEVER TOOK IS STILL QUEUED, if the record holds it",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        responses: {
          "KSIA-ELE-001": {
            compliance: "NC", observation: "x",
            attachments: [
              /* No blobKey: the bytes are not here. This is every photograph on
                 the audit as seen by the auditor who did not take it, and the
                 plan used to skip all of them silently. */
              { id: "a1", kind: "photo", name: "n", cloudUrl: "https://blob/x", ref: "KSIA-ELE-001_P01", caption: "c" },
            ],
          },
        },
      },
      NOTHING
    );
    return p.evidence.length === 1 && !!p.evidence[0].attachment;
  })(),
  "the plan carries the attachment, so the writer can go to the record copy for the bytes"
);

check(
  "an evicted photograph with no record copy is NOT queued",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        responses: {
          "KSIA-ELE-001": {
            compliance: "NC", observation: "x",
            attachments: [
              { id: "a1", kind: "photo", name: "n", blobKey: "b1", unavailable: true, ref: "R" },
              { id: "a2", kind: "photo", name: "n", ref: "R2" },
            ],
          },
        },
      },
      NOTHING
    );
    return p.evidence.length === 0;
  })(),
  "unavailable means the bytes are gone, not elsewhere — queueing it would fail every run"
);

check(
  "EVIDENCE PENDING REACHES THE PORTAL, and never as a fifth compliance token",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        responses: {
          "KSIA-ELE-001": {
            compliance: "C", evidencePending: true, observation: "Register sighted on screen.",
            attachments: [],
          },
        },
      },
      NOTHING
    );
    const row = p.checkpoints[0];
    return (
      row.values.compliance === "C" &&
      /EVIDENCE PENDING/.test(String(row.values.observation)) &&
      /Register sighted on screen\./.test(String(row.values.observation)) &&
      /evidence pending/i.test(row.summary)
    );
  })(),
  "a bare C on a check whose record was never produced reads as 'we looked and it was fine'"
);

check(
  "a check with no pending flag gets its observation unaltered",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        responses: { "KSIA-ELE-001": { compliance: "C", observation: "Plain.", attachments: [] } },
      },
      NOTHING
    );
    return p.checkpoints[0].values.observation === "Plain.";
  })()
);

/* ---- THE JOIN KEY IS A REFUSAL, NOT A WARNING ---------------------------
 *
 *  16 September 2026, the first real read of TPJV's site: both lists came back
 *  with no writable Title, the plan listed it as one of three skipped fields,
 *  and the write button was enabled. Rows written without a Title can never be
 *  matched again, so the NEXT run would have created every one of them a second
 *  time — the doubling sync this file's third rule exists to prevent, arriving
 *  through the field mapper rather than through the plan. */

check(
  "a list with no writable Title cannot be joined",
  !sp.canJoin({ resolved: {}, missing: ["title"] }) &&
    !sp.canJoin({ resolved: {}, missing: ["title", "owner"] }) &&
    sp.canJoin({ resolved: { title: "Title" }, missing: ["owner"] }),
  "Title is how every row is found; without it each run recreates what the last one wrote"
);

check(
  "and a missing map is not quietly treated as joinable",
  !sp.canJoin(null) && !sp.canJoin(undefined)
);

check(
  "THE PANEL REFUSES TO CREATE, rather than warning and letting it through",
  /blockedCreates\.length > 0/.test(panel) && /Cannot create rows — no Title column/.test(panel),
  "an enabled button next to a warning is a warning nobody reads"
);

/* BUT ONLY WHEN IT BITES. An UPDATE was found by the Title already in the
   portal and is addressed by its item id; its Title does not change and not
   writing one costs nothing. The first cut refused the whole write, which on
   the day it shipped would have blocked 33 perfectly safe updates — and a
   guard that stops work it did not need to stop is a guard somebody switches
   off. */
check(
  "an update-only plan on an unjoinable list is still allowed",
  /r\.action === "create"/.test(panel) &&
    /blockedCreates/.test(panel) &&
    /updates only/.test(panel),
  "a row addressed by its item id does not need its Title rewritten"
);

/* ---- AND THE COLUMN IS FOUND BY ITS INTERNAL NAME TOO ------------------
 *
 *  What actually happened: the built-in Title column was still internally
 *  `Title` and still held every portal id — the sync READ 33 of them and
 *  matched them — but its display name had been changed in the list UI, and
 *  the mapper only ever looked at display names. */

check(
  "a renamed column is still found by the internal name it was created with",
  (() => {
    const m = sp.mapFields(
      [{ name: "Title", displayName: "Check-point reference" }],
      ["title"]
    );
    return m.resolved.title === "Title" && m.missing.length === 0;
  })(),
  "renaming in SharePoint's list UI changes the display name only"
);

check(
  "and the display name still wins when both could match",
  (() => {
    const m = sp.mapFields(
      [
        { name: "field_7", displayName: "Observation" },
        { name: "Observation", displayName: "Something else" },
      ],
      ["observation"]
    );
    return m.resolved.observation === "field_7";
  })(),
  "the display name is what a person deliberately chose"
);

check(
  "a read-only column is still absent, by either name",
  (() => {
    const m = sp.mapFields(
      [{ name: "Title", displayName: "Title", readOnly: true }],
      ["title"]
    );
    return m.missing.includes("title");
  })(),
  "writing to a read-only column fails the whole PATCH and takes the good rows with it"
);

check(
  "it is told apart from an ordinary skipped field, in its own tone",
  /tone=\{blockedCreates\.includes\(l\) \? "bad" : "warn"\}/.test(panel) &&
    /joinRefusal\(l\)/.test(panel),
  "a missing Owner column costs one field; a missing Title costs idempotency — and the tone follows whether it actually blocks"
);

check(
  "the refusal says what to go and look at",
  /renamed/.test(sp.joinRefusal("Findings")) &&
    /read-only/.test(sp.joinRefusal("Findings")) &&
    /Findings/.test(sp.joinRefusal("Findings")),
  "only the display name Title is accepted, and mapFields treats read-only as absent"
);

/* ---- PHOTOGRAPHS ARE OFF UNTIL SOMEBODY TICKS THE BOX -------------------
 *  Sarel, 16 September 2026: "we dont need to send the photos itself to
 *  sharepoint at this stage." Off rather than deleted, and off rather than
 *  remembered — a switch that stayed on from a previous session would put a
 *  national key point's photographs into SharePoint without anybody deciding
 *  to this time. */

check(
  "the photograph upload is switched OFF by default",
  /useState\(false\);/.test(panel.slice(panel.indexOf("const [sendPhotos"), panel.indexOf("const [sendPhotos") + 120)),
  "and not read back from storage, so the decision is made each time"
);

check(
  "nothing is uploaded unless it is on",
  /if \(sendPhotos && resolved\.driveId && plan\.evidence\.length\)/.test(panel)
);

check(
  "and the count on the button drops with it, rather than promising writes it will not make",
  /t\.writes - \(sendPhotos \? 0 : t\.photographs\)/.test(panel) &&
    /totals\.writes - \(sendPhotos \? 0 : totals\.photographs\)/.test(panel) &&
    /`Write \$\{writes\} to the portal`/.test(panel)
);

/* ---- A PARTIAL WRITE NEVER READS AS A COMPLETE ONE ----------------------
 *  The first real write: 33 rows landed, the evidence folder call threw, and
 *  the panel said "33 written. Everything in the plan reached the portal."
 *  `failed` was empty because ensureFolder sat outside the per-photograph try,
 *  so five photographs went missing and the screen called it a success. */

check(
  "a folder that could not be prepared names every photograph it took down",
  /folderReady/.test(panel) && /could not be prepared/.test(panel),
  "one call failing all five must not be one silence"
);

check(
  "and whatever stops the sync is counted against the plan, not left out of it",
  /const short = total - written - failed\.length;/.test(panel) &&
    /never attempted/.test(panel)
);

check(
  "the summary says how many OF HOW MANY",
  /\{result\.written\} of \{totals\?\.writes \?\? result\.written\} written/.test(panel),
  "a bare count cannot be checked against anything"
);

/* ---- AND THE ROOT OF A LIBRARY IS ADDRESSED DIFFERENTLY ----------------- */

check(
  "a folder at the top of the library is created against /root/children",
  /`\/drives\/\$\{driveId\}\/root\/children`/.test(graphCode) &&
    /root:\/\$\{encodeURI\(parent\)\}:\/children/.test(graphCode),
  "an empty path renders /root:/:/children, and Graph answers \"Resource not found for the segment 'root:'\""
);

/* ---- SPEAKING THE COLUMN'S OWN LANGUAGE ---------------------------------
 *
 *  Prince Mahlangu, reading the lists after the first real sync: "the values
 *  are the bare codes C, NC and NV instead of the portal choices 'C -
 *  Compliant', 'NC - Non-compliant' and 'NV - Not available' — the web part
 *  copes, the lists show codes."
 *
 *  The strings are NOT in this repo and must not be: ACSA's choice wording
 *  appears nowhere in the vendored register, so typing it out would be Squawk
 *  inventing their vocabulary. It is read off the column instead, exactly as
 *  the internal column names are. */

check(
  "THE CHOICE WORDING IS NOWHERE IN THE SOURCE — it is read off the column",
  !/C - Compliant|NC - Non-compliant|NV - Not available/.test(src("lib", "sharepoint.ts").replace(/\/\*[\s\S]*?\*\//g, "")) &&
    /choice/.test(graphCode) &&
    /\$select=name,displayName,readOnly,choice/.test(graphCode),
  "a hardcoded vocabulary drifts the moment somebody rewords an option"
);

check(
  "a bare code finds the option whose code it is",
  sp.portalChoice("C", ["C - Compliant", "NC - Non-compliant", "NV - Not available"]) ===
    "C - Compliant" &&
    sp.portalChoice("NC", ["C - Compliant", "NC - Non-compliant"]) === "NC - Non-compliant"
);

check(
  "an exact option passes through untouched",
  sp.portalChoice("4 - Critical", ["4 - Critical", "3 - Major"]) === "4 - Critical",
  "severity and likelihood already carry the portal's own words, derived from the register"
);

check(
  "a column with no options leaves the value alone",
  sp.portalChoice("anything", undefined) === "anything" &&
    sp.portalChoice("anything", []) === "anything",
  "a free-text column is not a Choice column"
);

check(
  "AND A VALUE NOTHING OFFERS IS REPORTED, not quietly written as something else",
  sp.portalChoice("Q", ["C - Compliant", "NC - Non-compliant"]) === null,
  "guessing at a column's vocabulary is how C ended up in a list offering C - Compliant"
);

check(
  "projectFields substitutes the option a Choice column will take",
  (() => {
    const m = sp.mapFields(
      [{ name: "Compliance", displayName: "Compliance", choice: { choices: ["C - Compliant", "NC - Non-compliant"] } }],
      ["compliance"]
    );
    return sp.projectFields(m, { compliance: "NC" }).Compliance === "NC - Non-compliant";
  })()
);

check(
  "and mapFields carries the options it found, per field",
  (() => {
    const m = sp.mapFields(
      [
        { name: "Compliance", displayName: "Compliance", choice: { choices: ["C - Compliant"] } },
        { name: "Observation", displayName: "Observation" },
      ],
      ["compliance", "observation"]
    );
    return m.choices.compliance?.length === 1 && !("observation" in m.choices);
  })()
);

/* ---- A NON-COMPLIANT ANSWER WITH NOTHING BEHIND IT ----------------------
 *  Prince again: the fifteen non-compliant check-points carry no finding, so
 *  Energy and Demand Management at King Shaka reads Acceptable with a
 *  non-compliant check-point behind it.
 *
 *  Sarel's rule, the same day: "in the app we need to have a warning or
 *  reminder that there are NC with no details, but it should still sync
 *  through as non compliant to sharepoint." Warn, never block — a
 *  non-compliant answer is the truth and belongs in the portal. */

check(
  "A NON-COMPLIANT CHECK WITH NO FINDING IS WARNED ABOUT",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, responses: { "KSIA-ELE-001": { compliance: "NC", observation: "", attachments: [] } } },
      NOTHING
    );
    return p.warnings.some((w) => /no finding behind them/.test(w.what)) &&
      p.warnings.find((w) => /no finding/.test(w.what))?.count === 1;
  })()
);

/* ---- AND IT DOES NOT GO ACROSS WORDLESS ---------------------------------
 *  Sarel: "it might be NC because the airport could not provide compliant
 *  evidence. So let's by default on the sync just say NC - No compliance
 *  evidence could be provided, or something like that but technically
 *  correct."
 *
 *  The technically-correct part is the constraint. Squawk knows an auditor
 *  marked it non-compliant and that nobody wrote anything down. It does NOT
 *  know the airport was asked and could not produce evidence — likely, but a
 *  cause nobody recorded, and ACSA acts on these rows. */

check(
  "A NON-COMPLIANT CHECK WITH NO OBSERVATION CARRIES A PLACEHOLDER",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, responses: { "KSIA-ELE-001": { compliance: "NC", observation: "", attachments: [] } } },
      NOTHING
    );
    return p.checkpoints[0].values.observation === sp.NC_WITHOUT_DETAIL;
  })(),
  "since an update no longer writes a blank, the alternative is ACSA's old text under a fresh NC"
);

check(
  "and the placeholder claims only what is known",
  /no supporting evidence or observation was recorded/i.test(sp.NC_WITHOUT_DETAIL) &&
    !/could not provide|refused|failed to produce|unable to/i.test(sp.NC_WITHOUT_DETAIL),
  "why it is non-compliant is a cause nobody recorded; saying it would be Squawk making the finding"
);

check(
  "a typed observation beats the placeholder",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, responses: { "KSIA-ELE-001": { compliance: "NC", observation: "Panel door missing.", attachments: [] } } },
      NOTHING
    );
    return p.checkpoints[0].values.observation === "Panel door missing.";
  })()
);

check(
  "and a compliant or not-applicable check with nothing typed gets no sentence",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        responses: {
          "KSIA-ELE-001": { compliance: "C", observation: "", attachments: [] },
          "KSIA-ELE-002": { compliance: "N/A", observation: "", attachments: [] },
        },
      },
      NOTHING
    );
    return p.checkpoints.every((r) => r.values.observation === "");
  })(),
  "the status is the whole statement; a sentence there would be padding in a system of record"
);

check(
  "and it still goes across — a warning is not a refusal",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, responses: { "KSIA-ELE-001": { compliance: "NC", observation: "", attachments: [] } } },
      NOTHING
    );
    return p.checkpoints.length === 1 && p.checkpoints[0].values.compliance === "NC";
  })()
);

check(
  "a non-compliant check that HAS a finding is not warned about",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        findings: [{ id: "f1", checkId: "KSIA-ELE-001" }],
        responses: { "KSIA-ELE-001": { compliance: "NC", observation: "", attachments: [] } },
      },
      NOTHING
    );
    return !p.warnings.some((w) => /no finding/.test(w.what));
  })()
);

check(
  "warnings are told apart from skipped — one is written, the other is not",
  (() => {
    const p = sp.buildPlan({ ...BASE }, NOTHING);
    return Array.isArray(p.warnings) && Array.isArray(p.skipped);
  })() && /plan\.warnings\.map/.test(panel) && /plan\.skipped\.map/.test(panel)
);

/* ---- AND WHICH LIST IT CHOSE IS SHOWN, NOT INFERRED ---------------------
 *  The site has thirteen lists and the matcher takes the first whose name
 *  fits. Which one it picked decides where every row lands. */

check(
  "the readiness step names the lists it will write to",
  /chose: \{/.test(panel) && /Writing to/.test(panel),
  "\"all found\" does not say WHICH, and each airport has its own list"
);

/* ---- THE JOIN IS SITE-AWARE, AND AMBIGUITY IS REFUSED -------------------
 *
 *  Six rows for Bram Fischer came out of a King Shaka test, and Squawk is the
 *  only thing writing to that portal. The mechanism is still unproven, but the
 *  index it joined on could not have caught it either way: it took EVERY Title
 *  in the list with no notion of which airport a row was for, into a plain Map,
 *  so two rows sharing a Title silently collapsed to whichever came last and an
 *  update could land on a row nobody meant.
 *
 *  Each airport has its own list of checks — Sarel, 16 September 2026 — which
 *  makes both of those a live risk rather than a theoretical one. */

check(
  "ANOTHER AIRPORT'S ROW IS NEVER INDEXED, so it can never be written",
  (() => {
    const i = sp.indexExisting(
      [
        { title: "KSIA-ELE-001", id: "1" },
        { title: "BFIA-ELE-001", id: "2" },
        { title: "ORTIA-ELE-001", id: "3" },
      ],
      "KSIA"
    );
    return i.byTitle.size === 1 && i.byTitle.get("KSIA-ELE-001") === "1" && i.foreign === 2;
  })()
);

check(
  "A TITLE THE SITE HAS TWICE IS REFUSED, not resolved by arrival order",
  (() => {
    const i = sp.indexExisting(
      [
        { title: "KSIA-ELE-001", id: "1" },
        { title: "KSIA-ELE-001", id: "9" },
        { title: "KSIA-ELE-002", id: "2" },
      ],
      "KSIA"
    );
    return (
      i.duplicates.length === 1 &&
      i.duplicates[0] === "KSIA-ELE-001" &&
      !i.byTitle.has("KSIA-ELE-001") &&
      i.byTitle.has("KSIA-ELE-002")
    );
  })(),
  "a Map kept the last one and updated a row nobody meant"
);

check(
  "an untitled row is counted rather than indexed under the empty string",
  (() => {
    const i = sp.indexExisting([{ title: "", id: "1" }, { title: "   ", id: "2" }], "KSIA");
    return i.untitled === 2 && i.byTitle.size === 0;
  })()
);

check(
  "the prefix match is on the site code and its separator, not a loose contains",
  (() => {
    const i = sp.indexExisting(
      [
        { title: "KSIA-ELE-001", id: "1" },
        { title: "NOTKSIA-ELE-001", id: "2" },
        { title: "KSIAX-ELE-001", id: "3" },
      ],
      "KSIA"
    );
    return i.byTitle.size === 1 && i.foreign === 2;
  })()
);

check(
  "belongsToSite is the same rule, for the gate before a write",
  sp.belongsToSite("KSIA-ELE-001", "KSIA") &&
    !sp.belongsToSite("BFIA-ELE-001", "KSIA") &&
    !sp.belongsToSite("KSIAX-1", "KSIA")
);

check(
  "AND THE WRITER GATES ON IT, refusing rather than trusting the plan",
  /belongsToSite\(row\.key, indexes\.siteCode\)/.test(panel) &&
    /does not belong to/.test(panel),
  "every Title the plan mints leads with the site code, so a failure here is a bug in Squawk"
);

check(
  "the reader indexes per site instead of hoovering the whole list",
  /indexExisting\(/.test(panel) && !/existing\.checkpoints\.set\(/.test(panel),
  "the three lines this replaced had no idea which airport a row was for"
);

check(
  "duplicates and another airport's rows are both reported in the plan",
  /dupes\.length > 0/.test(panel) && /belong to another/.test(panel),
  "\"nothing matched\" and \"half this list is another airport's\" are different answers"
);

check(
  "the totals a person confirms against are the rows that would actually be written",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, hazards: [HAZARD()], responses: { "KSIA-ELE-001": { compliance: "C", observation: "", attachments: [] } } },
      NOTHING
    );
    const t = sp.planTotals(p);
    return t.writes === p.checkpoints.length + p.findings.length + p.evidence.length && t.writes === 2;
  })()
);

check(
  "findings nobody consolidated are counted out loud, not silently dropped",
  sp
    .buildPlan({ ...BASE }, NOTHING, 4)
    .skipped.some((s) => /not yet in a hazard/.test(s.what) && s.count === 4),
  "the register carries hazards; a finding in none of them would otherwise just look synced"
);

/* ---------------------- Part 1d: the stand-in asset register -------------- */

/* The register is not ACSA's yet. Sarel asked for the linking to be built
   against a stand-in so it is ready and tested for the day it arrives, which
   puts one obligation on all of it: AN INVENTED ASSET TAG MUST NOT REACH A
   SYSTEM OF RECORD. It belongs in the workbook, where a person is reading and
   the SAMPLE- prefix tells them what it is; it does not belong in the portal,
   where a machine files it against a real finding and nobody looks again. */

check(
  "a stand-in tag is NOT sent to the portal",
  sp.sendableAssets(["SAMPLE-KSIA-ELE-A001", "SAMPLE-KSIA-MEC-A004"]).length === 0,
  "an invented asset number in a system of record is worse than no asset number"
);

check(
  "a real tag IS — the guard turns itself off when the register is real",
  (() => {
    const out = sp.sendableAssets(["KSIA-ELE-0042", "SAMPLE-KSIA-ELE-A001"]);
    return out.length === 1 && out[0] === "KSIA-ELE-0042";
  })()
);

check(
  "no links at all is not an error",
  sp.sendableAssets(undefined).length === 0 && sp.sendableAssets([]).length === 0
);

check(
  "the plan SAYS how many links it withheld rather than dropping them quietly",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, hazards: [HAZARD({ assetIds: ["SAMPLE-KSIA-ELE-A001", "SAMPLE-KSIA-ELE-A002"] })] },
      NOTHING
    );
    return p.skipped.some((s) => s.what === "asset links" && s.count === 2);
  })(),
  "silently dropping a field somebody filled in is how a sync stops being trusted"
);

check(
  "and the row carries null rather than an empty string for them",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, hazards: [HAZARD({ assetIds: ["SAMPLE-KSIA-ELE-A001"] })] },
      NOTHING
    );
    return p.findings[0].values.assets === null;
  })(),
  "null is dropped by projectFields; an empty string would CLEAR a cell somebody else filled"
);

check(
  "a real tag reaches the row",
  (() => {
    const p = sp.buildPlan({ ...BASE, hazards: [HAZARD({ assetIds: ["KSIA-ELE-0042"] })] }, NOTHING);
    return p.findings[0].values.assets === "KSIA-ELE-0042";
  })()
);

check(
  "there is a column candidate for it, so a real register can sync one day",
  Array.isArray(sp.FIELD_CANDIDATES.assets) && sp.FIELD_CANDIDATES.assets.includes("Assets")
);

/* -------------------- Part 2: properties the source has to carry ---------- */

check(
  "there is no client secret anywhere in the Graph client",
  !/client_secret/i.test(graphSrc),
  "an app-only secret would give Squawk standing write access and attribute every write to a robot"
);

check(
  "it is PKCE, with S256",
  /code_challenge_method=S256/.test(graphSrc) && /code_verifier/.test(graphSrc)
);

check(
  "THE ACCESS TOKEN IS NEVER PERSISTED",
  !/localStorage|sessionStorage|idbStorage|indexedDB/i.test(graphCode) &&
    /let token: \{/.test(graphCode),
  "a bearer token for the evidence library, on a tablet carried around a national key point"
);

check(
  "and the suite is reading the CODE, not the comment that promises it",
  /localStorage/.test(graphSrc) && !/localStorage/.test(graphCode),
  "a text search that trips on its own documentation is not an assertion"
);

check(
  "and it is not put in the store either",
  !/access_token/.test(src("lib", "store.ts"))
);

check(
  "the sign-in listener refuses a message from another origin",
  /e\.origin !== window\.location\.origin/.test(graphSrc)
);

check(
  "and the callback posts to this origin, never to a wildcard",
  /window\.location\.origin\s*\n?\s*\)/.test(callback) && !/postMessage\([^)]*"\*"/.test(callback)
);

check(
  "the sign-in state is checked on the way back",
  /state !== state|squawkGraph\.state !== state/.test(graphSrc)
);

check(
  "the scope is DELEGATED — the auditor's own access, never more",
  /Sites\.ReadWrite\.All/.test(graphSrc) && !/\.default/.test(graphSrc)
);

check(
  "every collection is read to the LAST page",
  /@odata\.nextLink/.test(graphSrc),
  "reading only the first page of 324 check-points would duplicate everything after it"
);

check(
  "a Graph failure carries the message, not just a status code",
  /j\.error\?\.message/.test(graphSrc),
  "\"403\" tells an auditor nothing; \"you cannot write to this list\" tells them who to ring"
);

check(
  "an evidence upload REPLACES its own reference rather than renaming",
  /conflictBehavior=replace/.test(graphSrc),
  "rename would produce '..._P01 1.jpg' and break the cross-reference the workbook prints"
);

check(
  "NOTHING IS WRITTEN BEFORE THE PLAN IS SHOWN",
  (() => {
    /* Every mutating call lives in run(), and run() is only reachable from a
       button rendered once a plan exists. Proven structurally: the read path
       must not mention any of them. */
    const readFn = panel.slice(panel.indexOf("async function read()"), panel.indexOf("async function run()"));
    return !/createItem|updateItem|uploadEvidence|ensureFolder/.test(readFn);
  })(),
  "a sync you cannot preview is one somebody has to trust rather than check"
);

check(
  "and the writing function is the only one that mutates",
  (() => {
    const runFn = panel.slice(panel.indexOf("async function run()"));
    return /createItem/.test(runFn) && /updateItem/.test(runFn) && /uploadEvidence/.test(runFn);
  })()
);

check(
  "the confirm button says how many writes it is about to make",
  /`Write \$\{writes\} to the portal`/.test(panel),
  "a button labelled only 'Sync' asks for trust it has not earned — and the number is what it will ACTUALLY send, which is not the plan's total while the photographs are off"
);

check(
  "no internal column name is hardcoded anywhere",
  /* THE CODE, not the comments. sharepoint.ts now explains in prose that an
     internal name looks like `field_7` and that nobody builds a list to one —
     and this assertion, reading the raw file, failed on the very sentence
     promising the code does not contain them. Same trap the header of this
     suite describes for the token, one file along. */
  !/field_\d/.test(codeOnly(spSrc)) &&
    !/field_\d/.test(codeOnly(panel)) &&
    /FIELD_CANDIDATES/.test(spSrc),
  "SharePoint internal names are not display names and are not guessable"
);

check(
  "the columns are read from the list on every run",
  /graph\.columns\(/.test(panel) && /mapFields\(await graph\.columns/.test(panel)
);

check(
  "ACSA cannot sync — the portal is where their copy comes from",
  /role !== "acsa" && \(/.test(shell) && /SyncPanel/.test(shell)
);

/* ------------------------- the setup is a screen, not an absence ---------- */

/* THE BUTTON IS NO LONGER GATED ON THE THING IT SETS UP.
 *
 *  It used to render only where a portal was already configured, which meant
 *  the one screen that knows what the setup needs was behind the setup. That
 *  is where this feature sat: not broken, invisible. */
check(
  "the Sync button is offered whether or not a portal is configured yet",
  !/graphConfigured\(\)/.test(shell),
  "hiding it hid the only screen that says what is missing"
);

check(
  "and the panel opens on a readiness list, not on a dead end",
  /const steps: Step\[\]/.test(panel) &&
    /state: configured && !graph\.tenantLooksWrong\(\) \? "ok" : "todo"/.test(panel),
  "the first step is green only when the four variables are set AND the tenant is one the registration will accept"
);

check(
  "a step that has not been reached says so rather than reading as a failure",
  /"ok" \| "todo" \| "waiting"/.test(panel) && /NOT CHECKED YET/.test(panel),
  "half of setting this up is knowing which half is your problem"
);

check(
  "the state is in words as well as in colour",
  /DONE.*TO DO.*NOT CHECKED YET|"DONE"[\s\S]{0,120}"TO DO"/.test(panel),
  ""
);

check(
  "the redirect URI it tells you to register is the one this deployment actually uses",
  /window\.location\.origin\}\/graph-callback/.test(panel),
  "a redirect URI typed from memory is the single most common way this fails"
);

check(
  "it says the variables are read at BUILD time",
  /build time/i.test(panel) && /redeploy/i.test(panel),
  "setting them without a new deploy changes nothing, and looks identical"
);

/* --------------- one source of truth for what the portal must look like --- */

check(
  "the list names, the fields and the column names are all exported from one place",
  /export const LIST_NAMES/.test(spSrc) &&
    /export const CHECK_FIELDS/.test(spSrc) &&
    /export const FINDING_FIELDS/.test(spSrc) &&
    /export function columnContract/.test(spSrc),
  ""
);

check(
  "the reader matches lists with those names rather than its own regexes",
  /LIST_NAMES\.checkpoints/.test(panel) &&
    /LIST_NAMES\.findings/.test(panel) &&
    /LIST_NAMES\.evidence/.test(panel) &&
    !/\/\^check-\?points\?\$\/i/.test(panel),
  "two copies of the name would drift, and the drift would be silent"
);

check(
  "a list called \"Check points\" — which is what SharePoint's own dialog produces — is matched",
  sp.LIST_NAMES.checkpoints.test("Check points") &&
    sp.LIST_NAMES.checkpoints.test("Check-points") &&
    sp.LIST_NAMES.checkpoints.test("Checkpoints") &&
    !sp.LIST_NAMES.checkpoints.test("Check-points archive"),
  ""
);

/* THE CONTRACT IS DERIVED, NOT RESTATED. Whoever builds the SharePoint site
   builds it from this screen; a screen that listed the column names in its own
   words would be a second copy to keep in step with the matcher, and the cost
   of them disagreeing is a column that exists and is silently never written. */
const contract = sp.columnContract(sp.CHECK_FIELDS);
check(
  "the column contract names exactly the fields the sync maps, in order",
  contract.length === sp.CHECK_FIELDS.length &&
    contract.every((c, i) => c.key === sp.CHECK_FIELDS[i]),
  ""
);
check(
  "every name it tells you to create is one the matcher would actually accept",
  contract.every((c) => (sp.FIELD_CANDIDATES[c.key] ?? [])[0] === c.create) &&
    contract.every((c) =>
      c.alsoAccepts.every((n) => (sp.FIELD_CANDIDATES[c.key] ?? []).includes(n))
    ),
  "a contract that asks for a column the sync does not look for is worse than none"
);
check(
  "and the map built from those very names resolves every field",
  (() => {
    const columns = contract.map((c) => ({ name: `field_${c.key}`, displayName: c.create }));
    const map = sp.mapFields(columns, [...sp.CHECK_FIELDS]);
    return map.missing.length === 0;
  })(),
  "build the site to the screen and nothing should be reported missing"
);

check(
  "a hazard remembers the Title the portal gave it",
  /portalId\?: string;/.test(types) && /updateHazard\(row\.hazardId, \{ portalId: row\.key \}\)/.test(panel)
);

check(
  "the app says what is missing rather than half-working without a portal",
  /graphMissing/.test(graphSrc) && /graph\.graphMissing\(\)/.test(panel)
);

/* ------------------------------- TPJV's registration, as Prince built it --
 *
 *  15 September 2026: single tenant, SPA redirect on the live origin only, no
 *  client secret, delegated Sites.ReadWrite.All with admin consent, and the
 *  service account holding Contribute WITHOUT Delete. Each of those four is a
 *  property the code has to match or the sync fails on the day, in a terminal
 *  building, with an AADSTS number for a message. */

check(
  "NO REGISTRATION VALUE IS IN THE REPOSITORY — this one is public",
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(graphCode) &&
    !/sharepoint\.com/i.test(graphCode) &&
    !/vercel\.app/i.test(graphCode),
  "a client id and a tenant id are not credentials, and are still not worth publishing next to the site they open"
);

check(
  "and every one of them comes from the environment, with no fallback to hide an empty one",
  /NEXT_PUBLIC_GRAPH_CLIENT_ID \?\? ""/.test(graphCode) &&
    /NEXT_PUBLIC_GRAPH_TENANT \?\? ""/.test(graphCode) &&
    /NEXT_PUBLIC_GRAPH_SITE \?\? ""/.test(graphCode) &&
    /NEXT_PUBLIC_GRAPH_ORIGIN \?\? ""/.test(graphCode)
);

check(
  "THE TENANT IS NAMED WHEN IT IS MISSING",
  /NEXT_PUBLIC_GRAPH_TENANT/.test(
    graphCode.slice(graphCode.indexOf("export function graphMissing"), graphCode.indexOf("export function tenantLooksWrong"))
  ),
  "it used to default to organizations, so an empty one was never reported and the sign-in failed instead"
);

check(
  "and a tenant set to a common endpoint is refused BEFORE a sign-in, by name",
  /organizations/.test(graphCode) && /AADSTS50194/.test(graphCode) &&
    /graph\.tenantLooksWrong\(\)/.test(panel),
  "the single-tenant registration refuses /common, /organizations and /consumers"
);

check(
  "an unset redirect origin reads as NOT CHECKED, never as fine",
  /if \(!GRAPH_ORIGIN\) return true;/.test(graphCode) &&
    /redirectOriginKnown/.test(graphCode) &&
    /graph\.redirectOriginKnown\(\)/.test(panel),
  "a red step that fires because a variable is empty teaches people to ignore the step"
);

check(
  "THE ONE REGISTERED REDIRECT IS CHECKED BEFORE A PASSWORD IS TYPED",
  /redirectRegistered/.test(graphCode) && /graph\.redirectRegistered\(\)/.test(panel),
  "only the live origin is registered; a preview build meets AADSTS50011 mid-sign-in"
);

check(
  "and the sign-in step waits on it rather than offering a sign-in that cannot work",
  /!graph\.redirectRegistered\(\)\s*\?\s*"waiting"/.test(panel) ||
    /!configured \|\| !graph\.redirectRegistered\(\)/.test(panel)
);

check(
  "NOTHING IN THE GRAPH LAYER CAN DELETE",
  !/method:\s*"DELETE"/i.test(graphCode) && !/\bdeleteItem\b/.test(graphCode),
  "the service account has Contribute without Delete — a DELETE would 403, and should never be written in the first place"
);

check(
  "the writer uses create and update only",
  /createItem/.test(panel) && /updateItem/.test(panel) && !/delete/i.test(panel.replace(/\/\*[\s\S]*?\*\//g, "")),
  "create and update, as Prince permissioned it"
);

check(
  "photographs are uploaded from wherever the bytes are, not only from this device",
  /fullPhotoBlob/.test(panel) && !/getBlob/.test(panel),
  "an auditor who joined the audit rather than taking the photographs still uploads every one"
);

check(
  "portalId needed NO migration of its own — absent is the correct default",
  /* `portalId:` the field, not portalIdFor() the helper — which the photograph
     migration does use, and which is a different thing entirely. */
  !/portalId\s*[:=]/.test(src("lib", "store.ts").split("migrate:")[1] ?? "") &&
    /name: "acsa-assurance-v1"/.test(src("lib", "store.ts")),
  "a migration that sets undefined to undefined is ceremony, and the persist key must never move"
);

check(
  "the persist key is still the one a tablet's audit is stored under",
  /name: "acsa-assurance-v1"/.test(src("lib", "store.ts"))
);

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nSHAREPOINT OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
