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
  "and drops null and undefined, but KEEPS an empty string",
  (() => {
    const m = sp.mapFields(COLS, ["title", "riskPriority"]);
    const out = sp.projectFields(m, { title: "", riskPriority: null });
    return out.Title === "" && !("field_3" in out);
  })(),
  "clearing a cell somebody emptied on purpose is a legitimate write; a null is not"
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
  /Write \$\{totals\.writes\} to the portal/.test(panel),
  "a button labelled only 'Sync' asks for trust it has not earned"
);

check(
  "no internal column name is hardcoded anywhere",
  !/field_\d/.test(spSrc) && !/field_\d/.test(panel) && /FIELD_CANDIDATES/.test(spSrc),
  "SharePoint internal names are not display names and are not guessable"
);

check(
  "the columns are read from the list on every run",
  /graph\.columns\(/.test(panel) && /mapFields\(await graph\.columns/.test(panel)
);

check(
  "ACSA cannot sync — the portal is where their copy comes from",
  /role !== "acsa" && graphConfigured\(\)/.test(shell)
);

check(
  "a hazard remembers the Title the portal gave it",
  /portalId\?: string;/.test(types) && /updateHazard\(row\.hazardId, \{ portalId: row\.key \}\)/.test(panel)
);

check(
  "the app says what is missing rather than half-working without a portal",
  /graphMissing/.test(graphSrc) && /graph\.graphMissing\(\)/.test(panel)
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
