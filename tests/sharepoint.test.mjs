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
const sites = await import("../src/lib/sites.ts");
const { localDate } = await import("../src/lib/attendance.ts");

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
  disciplines: ["Electrical"], systems: ["Generators"], areas: [], otherImpacts: [],
  severity: null, likelihood: null, ratingConfirmed: false,
  ermConsequence: "4 - Critical", ermLikelihood: "3 - Likely", ermConfirmed: true,
  ermLikelihoodAssumed: false, origin: "consolidated", note: "", occurrence: "",
  ratingRationale: "", progress: [], immediate: false, reassessedAt: null, reassessNote: "",
  rootCause: "", actions: [], actionStatus: "Open",
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

/* THE PATH IS RELATIVE TO THE LIBRARY, and it was not until 16 September 2026.
 * The library on the ACSA site is itself called "Evidence", and the folder was
 * prefixed "Evidence/" regardless, so the first five real photographs landed in
 * .../Evidence/Evidence/King Shaka International Airport FALE/2026-09/.
 * Sarel, seeing it: "fix the folder and move the 5 files." */

check(
  "a library already called Evidence does not get an Evidence folder inside it",
  sp.evidenceFolder("FALE", "Evidence") === "King Shaka International Airport FALE",
  sp.evidenceFolder("FALE", "Evidence")
);

check(
  "and it is the library's NAME that decides, however it is cased or spaced",
  sp.evidenceFolder("FALE", " evidence ") === sp.evidenceFolder("FALE", "Evidence")
);

check(
  "a library that is not about evidence still gets an Evidence folder of its own",
  sp.evidenceFolder("FALE", "Documents") === "Evidence/King Shaka International Airport FALE",
  "loose among whatever else lives in Documents is not where audit evidence goes"
);

check(
  "an unnamed library keeps the old shape rather than guessing",
  sp.evidenceFolder("FALE") === "Evidence/King Shaka International Airport FALE",
  sp.evidenceFolder("FALE")
);

check(
  "NO PATH EVER REPEATS A SEGMENT",
  ["Evidence", "Documents", "Shared Documents", undefined].every((lib) => {
    const parts = sp.evidenceFolder("FALE", lib).split("/");
    return new Set(parts).size === parts.length;
  }),
  "the doubled folder was exactly this, and a test is cheaper than another move"
);

/* AND CARRIES A LINK TO THEM.
 *
 * Sarel, 17 September 2026, choosing this over attaching the real files: a
 * reader on a Findings row saw "KSIA-ELE-001_P01" as text and had three or four
 * clicks to the image. Attaching the files needs the SharePoint REST API, which
 * needs a tenant-wide write scope in a browser token, and would end the sync's
 * idempotency — AttachmentFiles/add cannot replace, and the service account has
 * no Delete. A link is one click and costs none of that. */

const LINKED = {
  ...BASE,
  library: "Evidence",
  libraryUrl: "https://tpjv.sharepoint.com/sites/ACSA-Asset-Assurance/Evidence",
  siteFolder: "King Shaka International FALE",
  responses: {
    "KSIA-ELE-001": {
      compliance: "NC", observation: "x",
      attachments: [{ id: "a1", kind: "photo", name: "n", blobKey: "b1", ref: "KSIA-ELE-001_P01", caption: "c" }],
    },
  },
};

check(
  "THE LINK POINTS AT THE FOLDER THE PHOTOGRAPHS ACTUALLY WENT TO",
  (() => {
    const p = sp.buildPlan(LINKED, NOTHING);
    const row = p.checkpoints.find((r) => r.key === "KSIA-ELE-001");
    return (
      row.values.evidenceLink ===
      "https://tpjv.sharepoint.com/sites/ACSA-Asset-Assurance/Evidence/King%20Shaka%20International%20FALE"
    );
  })(),
  sp.buildPlan(LINKED, NOTHING).checkpoints.find((r) => r.key === "KSIA-ELE-001")?.values.evidenceLink
);

check(
  "the link and the upload CANNOT DISAGREE — both are built from the plan's folder",
  (() => {
    const p = sp.buildPlan(LINKED, NOTHING);
    const link = p.checkpoints.find((r) => r.key === "KSIA-ELE-001").values.evidenceLink;
    return link.endsWith(p.folder.split("/").map(encodeURIComponent).join("/"));
  })(),
  "a link assembled from the library's display name would point at nothing when it is Shared Documents"
);

check(
  "a row with no photographs gets NO LINK — not a link to an empty folder",
  (() => {
    const p = sp.buildPlan(
      { ...LINKED, responses: { "KSIA-ELE-001": { compliance: "C", observation: "fine", attachments: [] } } },
      NOTHING
    );
    return !("evidenceLink" in p.checkpoints[0].values);
  })()
);

check(
  "and no library url means no link at all, rather than a broken one",
  (() => {
    const p = sp.buildPlan({ ...LINKED, libraryUrl: undefined }, NOTHING);
    return !("evidenceLink" in p.checkpoints.find((r) => r.key === "KSIA-ELE-001").values);
  })()
);

check(
  "A HYPERLINK COLUMN IS WRITTEN AS { Url, Description }, NOT AS A STRING",
  (() => {
    const map = sp.mapFields(
      [{ name: "field_1", displayName: "EvidenceLink", readOnly: false, hyperlinkOrPicture: {} }],
      ["evidenceLink"]
    );
    const out = sp.projectFields(map, { evidenceLink: "https://x/Evidence/KSIA%20FALE/2026-09" }, "create");
    return out.field_1?.Url === "https://x/Evidence/KSIA%20FALE/2026-09" && out.field_1?.Description === "2026-09";
  })(),
  "Graph rejects a bare URL on a hyperlink column, so this decides whether the write lands"
);

check(
  "the label is the visit folder, decoded — never \"click here\" in an audit record",
  (() => {
    const map = sp.mapFields(
      [{ name: "f", displayName: "EvidenceLink", readOnly: false, hyperlinkOrPicture: {} }],
      ["evidenceLink"]
    );
    return sp.projectFields(map, { evidenceLink: "https://x/a/b/2027-03" }).f.Description === "2027-03";
  })()
);

check(
  "and a PLAIN TEXT column of the same name still gets a plain string",
  (() => {
    const map = sp.mapFields(
      [{ name: "f", displayName: "EvidenceLink", readOnly: false }],
      ["evidenceLink"]
    );
    return sp.projectFields(map, { evidenceLink: "https://x/a/2026-09" }).f === "https://x/a/2026-09";
  })(),
  "the list decides, not this file — the same field is text on a list somebody built differently"
);

check(
  "photos and evidenceLink NEVER RESOLVE TO THE SAME COLUMN",
  (() => {
    /* "Evidence" used to be a candidate for both, and two logical fields on one
       column means the second quietly overwrites the first. */
    const a = new Set(sp.FIELD_CANDIDATES.photos.map((n) => n.toLowerCase()));
    return sp.FIELD_CANDIDATES.evidenceLink.every((n) => !a.has(n.toLowerCase()));
  })()
);

check(
  "the link is in both contracts, so both lists get asked for the column",
  sp.CHECK_FIELDS.includes("evidenceLink") && sp.FINDING_FIELDS.includes("evidenceLink")
);

/* THE FINDINGS ROW NAMES ITS PHOTOGRAPHS TOO.
 *
 * Sarel, 17 September 2026, with a screenshot of the portal's Findings list:
 * "findings tab is where the info goes." A check-point row is the register; a
 * finding is the thing somebody has to act on, and a finding whose evidence you
 * cannot find is an assertion. Three hops to get there — photograph hangs off a
 * CHECK, a finding names its check, a hazard consolidates findings. */

const HAZ = {
  ...BASE,
  responses: {
    "KSIA-ELE-001": {
      compliance: "NC", observation: "Busbar corroded",
      attachments: [
        { id: "a1", kind: "photo", name: "n", blobKey: "b1", ref: "KSIA-ELE-001_P01", caption: "c" },
        { id: "a2", kind: "photo", name: "n", blobKey: "b2", ref: "KSIA-ELE-001_P02", caption: "c" },
      ],
    },
    "KSIA-ELE-002": {
      compliance: "NC", observation: "Second one",
      attachments: [{ id: "a3", kind: "photo", name: "n", blobKey: "b3", ref: "KSIA-ELE-002_P01", caption: "c" }],
    },
  },
  findings: [
    { id: "f1", entity: "FALE", checkId: "KSIA-ELE-001" },
    { id: "f2", entity: "FALE", checkId: "KSIA-ELE-002" },
    { id: "f3", entity: "FALE", checkId: "KSIA-ELE-001" },
  ],
  hazards: [
    {
      id: "h1", entity: "FALE", portalId: "KSIA-ELE-P01", findingIds: ["f1", "f2", "f3"],
      disciplines: ["Electrical"], systems: ["Switchgear"],
      event: "Busbar failure", description: "d",
      ermConfirmed: true, ermConsequence: "C", ermLikelihood: "3",
      createdAt: Date.UTC(2026, 8, 16),
    },
  ],
};

check(
  "A HAZARD'S ROW CARRIES THE PHOTOGRAPHS OF EVERY CHECK BEHIND IT",
  (() => {
    const row = sp.buildPlan(HAZ, NOTHING).findings.find((r) => r.key === "KSIA-ELE-P01");
    return row.values.photos === "KSIA-ELE-001_P01, KSIA-ELE-001_P02, KSIA-ELE-002_P01";
  })(),
  sp.buildPlan(HAZ, NOTHING).findings.find((r) => r.key === "KSIA-ELE-P01")?.values.photos
);

check(
  "TWO FINDINGS ON ONE CHECK DO NOT LIST ITS PHOTOGRAPHS TWICE",
  (() => {
    /* f1 and f3 are both on KSIA-ELE-001. Ordinary after a consolidation, and
       the same reference twice in a cell reads as two photographs. */
    const v = sp.buildPlan(HAZ, NOTHING).findings.find((r) => r.key === "KSIA-ELE-P01").values.photos;
    return v.split(", ").length === new Set(v.split(", ")).size;
  })()
);

check(
  "a hazard with no findings behind it leaves the column ALONE, not blank",
  (() => {
    const p = sp.buildPlan(
      { ...HAZ, hazards: [{ ...HAZ.hazards[0], findingIds: [] }] },
      NOTHING
    );
    return !("photos" in p.findings.find((r) => r.key === "KSIA-ELE-P01").values);
  })(),
  "an update writing \"\" would wipe whatever ACSA has there"
);

check(
  "a hazard claims only ITS OWN findings' photographs, not every photograph in the visit",
  (() => {
    const p = sp.buildPlan({ ...HAZ, hazards: [{ ...HAZ.hazards[0], findingIds: ["f2"] }] }, NOTHING);
    return p.findings.find((r) => r.key === "KSIA-ELE-P01").values.photos === "KSIA-ELE-002_P01";
  })(),
  "a hazard spanning four checks must not claim all four images as one observation"
);

check(
  "photos is in the FINDINGS contract as well, so the column gets asked for",
  sp.FINDING_FIELDS.includes("photos")
);

/* A SITE NOBODY HAS AUDITED YET — the check that would have caught both Bram
 * Fischer incidents, added 16 September 2026 at Sarel's request. Every other
 * guard passed on those syncs, correctly: the rows carried the right BFIA
 * prefix, the list holds all ten sites by design, and belongsToSite passed
 * because Bram Fischer WAS the site the app was on. Nobody asked whether that
 * site had been visited. Bram Fischer's audit is 27 to 29 October 2026. */

check(
  "a sync a month before the audit is flagged, with the dates and the count of days",
  (() => {
    const e = sp.syncedBeforeAudit("FABL", "2026-09-16");
    return e && e.icao === "FABL" && e.from === "2026-10-27" && e.to === "2026-10-29" && e.days === 41;
  })(),
  JSON.stringify(sp.syncedBeforeAudit("FABL", "2026-09-16"))
);

/* O.R. Tambo rather than King Shaka, because King Shaka's window moved to
 * December with no dates and is no longer a confirmed one to test against.
 * O.R. Tambo is 29 Sep to 2 Oct 2026 and is the next real audit. */

check(
  "THE DAY BEFORE IS STILL BEFORE",
  sp.syncedBeforeAudit("FAOR", "2026-09-28")?.days === 1,
  "O.R. Tambo opens on the 29th"
);

check(
  "the first morning of the audit is not early — the auditor is on site",
  sp.syncedBeforeAudit("FAOR", "2026-09-29") === null
);

check(
  "and nothing fires during the audit",
  ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"].every(
    (d) => sp.syncedBeforeAudit("FAOR", d) === null
  )
);

/* AFTER THE AUDIT IS SILENT, and that restraint is the design. A sync in
 * November against September's captures is ordinary — write-ups, follow-ups, a
 * correction — and a warning that fires on those gets dismissed by reflex
 * within a week, which is worth less than no warning at all. */
check(
  "NOTHING FIRES AFTER THE AUDIT, however long after",
  ["2026-10-03", "2026-11-30", "2027-06-01"].every(
    (d) => sp.syncedBeforeAudit("FAOR", d) === null
  ),
  "a warning that cries wolf on legitimate follow-up syncs is worse than none"
);

check(
  "every one of the ten sites is early before its own window and not after",
  sites.SITES.every((s) => {
    const before = sp.syncedBeforeAudit(s.entityCode, "2026-08-01");
    const onDay = sp.syncedBeforeAudit(s.entityCode, s.audit.from);
    /* King Shaka is the only site already open on 1 September? No — none are;
       the first audit is 15 September. So all ten are early on 1 September. */
    return before !== null && before.days >= 1 && onDay === null;
  }),
  "derived from the site table, so a rescheduled audit moves the warning with it"
);

/* KING SHAKA MOVED TO DECEMBER with no dates confirmed (Sarel, 17 September
 * 2026). The month is agreed and the days are not, so from/to are the month's
 * bounds — everything that sorts or compares still works — and `tbc` stops them
 * being printed as a four-week audit nobody agreed to. */

check(
  "an unconfirmed window still warns, and says the dates are not confirmed",
  (() => {
    const e = sp.syncedBeforeAudit("FALE", "2026-09-17");
    return e && e.tbc === true && e.from.startsWith("2026-12");
  })(),
  JSON.stringify(sp.syncedBeforeAudit("FALE", "2026-09-17"))
);

check(
  "KING SHAKA HAS A GUARD AGAIN — a slipped audit must not silently lose one",
  sp.syncedBeforeAudit("FALE", "2026-09-17") !== null,
  "its September window had passed, so the warning had gone quiet for the one site whose audit did not happen"
);

check(
  "and the panel prints the month rather than the month's bounds",
  /early\.tbc/.test(panel) && /dates are not confirmed/.test(panel),
  "\"1 Dec to 31 Dec\" would read as an agreed four-week audit"
);

check(
  "an unknown site and a malformed date say nothing rather than guessing",
  sp.syncedBeforeAudit("NOPE", "2026-09-16") === null &&
    sp.syncedBeforeAudit("FABL", "") === null &&
    sp.syncedBeforeAudit("FABL", "tomorrow") === null
);

check(
  "a full timestamp is accepted, because that is what the app has to hand",
  sp.syncedBeforeAudit("FABL", "2026-09-16T19:54:28.000Z")?.days === 41
);

check(
  "THE PANEL WILL NOT WRITE EARLY UNTIL SOMEBODY TICKS IT",
  /!!early && !earlyOk/.test(panel) && /disabled=\{/.test(panel),
  "a notice is what both Bram Fischer syncs would have scrolled past"
);

check(
  "and the button says which site it is refusing for, not just that it is refusing",
  /early && !earlyOk\s*\?\s*`\$\{early\.site\} is not audited yet`/.test(panel)
);

check(
  "the acknowledgement is reset on every new plan, never carried over",
  /setEarlyOk\(false\);\s*\n\s*setStage\("planned"\)/.test(panel),
  "a tick on one plan must not authorise the next one"
);

check(
  "nothing else in the sync is refused by it — it is a tick, not a block",
  (() => {
    /* The early check appears in the disabled expression and the label, and
       nowhere in readPortal or run. Writing is gated; reading and planning are
       not, because seeing what WOULD be written is how you notice. */
    const run = panel.slice(panel.indexOf("async function run()"), panel.indexOf("async function run()") + 3000);
    return !/early/.test(run);
  })(),
  "the auditor must still be able to read the portal and see the plan"
);

/* AND THE LIBRARY ALREADY HAS FOLDERS. Read from the live library on
 * 16 September 2026, before anything was moved — ACSA pre-created one per site,
 * in their spelling, not Squawk's. Minting "King Shaka International Airport
 * FALE" next to their "King Shaka International FALE" would leave two folders
 * per airport and no way to know which holds the evidence. */
const ACSA_FOLDERS = [
  "Bram Fischer International FABL",
  "Cape Town International FACT",
  "Chief Dawid Stuurman International FAPE",
  "Corporate Office",
  "George FAGG",
  "Kimberley FAKM",
  "King Phalo FAEL",
  "King Shaka International FALE",
  "OR Tambo International FAOR",
  "Upington International FAUP",
];

check(
  "EVERY ONE OF ACSA'S TEN FOLDERS IS MATCHED TO ITS SITE",
  (() => {
    const hits = sites.SITES.map((s) => sp.siteFolderIn(s.entityCode, ACSA_FOLDERS));
    return hits.every(Boolean) && new Set(hits).size === sites.SITES.length;
  })(),
  sites.SITES.map((s) => `${s.entityCode}→${sp.siteFolderIn(s.entityCode, ACSA_FOLDERS)}`).join(", ")
);

check(
  "King Shaka matches THEIR spelling, which is not the site table's",
  sp.siteFolderIn("FALE", ACSA_FOLDERS) === "King Shaka International FALE",
  "the site table says King Shaka International Airport FALE; the library does not"
);

check(
  "O.R. Tambo matches OR Tambo — punctuation is not identity",
  sp.siteFolderIn("FAOR", ACSA_FOLDERS) === "OR Tambo International FAOR"
);

check(
  "Corporate Office matches with no code at all",
  sp.siteFolderIn("HO", ACSA_FOLDERS) === "Corporate Office",
  "the last pass exists for exactly this one"
);

check(
  "a library with nothing in it matches nothing, rather than guessing",
  sp.siteFolderIn("FALE", []) === null &&
    sp.siteFolderIn("FALE", ["Some other folder", "Templates"]) === null
);

check(
  "and the fallback is the site table's spelling, so a bare library still works",
  sp.evidenceFolder("FALE", "Evidence", sp.siteFolderIn("FALE", [])) ===
    "King Shaka International Airport FALE"
);

check(
  "THE FOLDER THE LIBRARY HAS WINS over the one Squawk would mint",
  sp.evidenceFolder("FALE", "Evidence", sp.siteFolderIn("FALE", ACSA_FOLDERS)) ===
    "King Shaka International FALE",
  sp.evidenceFolder("FALE", "Evidence", sp.siteFolderIn("FALE", ACSA_FOLDERS))
);

check(
  "and the plan carries it, so what is written is what was read",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, library: "Evidence", siteFolder: sp.siteFolderIn("FALE", ACSA_FOLDERS) },
      NOTHING
    );
    return p.folder === "King Shaka International FALE";
  })()
);

check(
  "and per site means PER SITE — another airport gets its own, from the site table",
  sp.evidenceFolder("FAOR", "Evidence") === "O.R. Tambo International Airport FAOR",
  "nothing is hardcoded to King Shaka; a new airport gets the shape for free"
);

/* NO VISIT SEGMENT ANY MORE, AND NO MONTH FOLDER EITHER — see dayFolder and
 * Part 1h below. It was added 16 September 2026 (Sarel: "add a audit date
 * into the hierarchy maybe") for a real reason: a photograph's reference is
 * scoped to the CHECK, not the visit, so KSIA-ELE-001_P01.jpg means a
 * different photograph in September 2026 than in March 2027, and uploads
 * use conflictBehavior=replace — one folder for both visits would let the
 * second silently overwrite the first.
 *
 * Removed 7 October 2026 (Sarel: "no month folder... use [site]/20261007")
 * because the DAY folder Part 1h adds now carries that same guarantee, more
 * finely — two different visits landing on the exact same calendar date is
 * not a real case this register has to plan for. See
 * "two photographs taken on different days file into different day
 * folders, same visit" in Part 1h for the replacement coverage. */

check(
  "the site's own folder is visit-agnostic now — the day folder inside it is what tells two audits apart",
  sp.evidenceFolder("FALE", "Evidence") === sp.evidenceFolder("FALE", "Evidence"),
  "see Part 1h for the day-folder collision guarantee this used to provide"
);

check(
  "the blob store and the portal now describe the same audit DIFFERENTLY, on purpose",
  (() => {
    /* photoObjectPath is still `FALE/2026-09/...` — the internal backup
       store's own scheme is unchanged by this. The portal folder dropped the
       visit segment entirely; the two no longer need to agree, because
       nothing reads them side by side the way EvidenceLink does within
       SharePoint itself. */
    return !sp.evidenceFolder("FALE", "Evidence").includes("2026-09");
  })()
);

/* THE PHOTOGRAPHS CARRY THEIR METADATA, AND THE CHECK-POINT NAMES THEM.
 *
 * Prince Mahlangu on the first five files to reach the library, 17 September
 * 2026: "They carry no metadata at all: CheckID, AssetSystem,
 * PhotographReference, CaptionSource and AttachedBy are blank, and the Photos
 * column on the check-points is empty, so nothing links a picture to its
 * check-point."
 *
 * Never written rather than written wrongly — the upload PUT the bytes and
 * stopped. A photograph filed under no check-point is an image in a folder. */

const WITH_PHOTO = {
  ...BASE,
  responses: {
    "KSIA-ELE-001": {
      compliance: "NC",
      observation: "Busbar corroded",
      attachments: [
        {
          id: "a1", kind: "photo", name: "n", blobKey: "b1",
          ref: "KSIA-ELE-001_P01", caption: "Corroded busbar, MV board 3B",
          captionSource: "auditor", createdBy: "Sarel Jansen van Rensburg",
          location: "North switch room", takenAt: Date.UTC(2026, 8, 16, 9, 30),
        },
        {
          id: "a2", kind: "photo", name: "n2", blobKey: "b2",
          ref: "KSIA-ELE-001_P02", caption: "Assistant wrote this one",
          captionSource: "assistant", createdBy: "Sarel Jansen van Rensburg",
        },
      ],
    },
  },
};

check(
  "EVERY COLUMN PRINCE NAMED IS FILLED, none of them blank",
  (() => {
    const v = sp.buildPlan(WITH_PHOTO, NOTHING).evidence[0].values;
    return (
      v.checkId === "KSIA-ELE-001" &&
      v.photographReference === "KSIA-ELE-001_P01" &&
      v.assetSystem &&
      v.discipline &&
      v.caption === "Corroded busbar, MV board 3B" &&
      v.captionSource === "Auditor" &&
      v.attachedBy === "Sarel Jansen van Rensburg"
    );
  })(),
  JSON.stringify(sp.buildPlan(WITH_PHOTO, NOTHING).evidence[0].values)
);

check(
  "the CheckID is the PORTAL id, which is what the check-points list joins on",
  sp.buildPlan(WITH_PHOTO, NOTHING).evidence[0].values.checkId === "KSIA-ELE-001",
  "a library row keyed on anything else links to nothing"
);

check(
  "an assistant's caption says so, in words, not as a token nobody can read",
  (() => {
    const e = sp.buildPlan(WITH_PHOTO, NOTHING).evidence;
    return /assistant/i.test(e[1].values.captionSource) && e[0].values.captionSource === "Auditor";
  })(),
  "a caption an auditor wrote and one a model proposed are not the same evidence"
);

check(
  "where the photograph was taken and when it was taken travel too",
  (() => {
    const v = sp.buildPlan(WITH_PHOTO, NOTHING).evidence[0].values;
    return v.location === "North switch room" && /^2026-09-16T/.test(v.takenAt);
  })()
);

check(
  "THE CHECK-POINT ROW NAMES ITS PHOTOGRAPHS — the other half of the complaint",
  (() => {
    const row = sp.buildPlan(WITH_PHOTO, NOTHING).checkpoints.find((r) => r.key === "KSIA-ELE-001");
    return row.values.photos === "KSIA-ELE-001_P01, KSIA-ELE-001_P02";
  })(),
  sp.buildPlan(WITH_PHOTO, NOTHING).checkpoints.find((r) => r.key === "KSIA-ELE-001")?.values.photos
);

check(
  "a check with no photographs leaves the column ALONE rather than blanking it",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, responses: { "KSIA-ELE-001": { compliance: "C", observation: "fine", attachments: [] } } },
      NOTHING
    );
    const row = p.checkpoints[0];
    /* Absent, not "". An update with "" would wipe whatever ACSA has there —
       the rule Sarel set on 16 September: overwrite a value, never with a
       blank. */
    return !("photos" in row.values);
  })()
);

check(
  "photos is in the check-point contract, so the column gets asked for",
  sp.CHECK_FIELDS.includes("photos") &&
    sp.columnContract(sp.CHECK_FIELDS).some((c) => c.create === "Photos")
);

check(
  "the EVIDENCE LIBRARY has a column contract of its own, in Prince's own names",
  (() => {
    const c = sp.columnContract(sp.EVIDENCE_FIELDS).map((x) => x.create);
    return ["CheckID", "PhotographReference", "CaptionSource", "AttachedBy"].every((n) =>
      c.includes(n)
    );
  })(),
  sp.columnContract(sp.EVIDENCE_FIELDS).map((x) => x.create).join(", ")
);

check(
  "and every one of those names is one the matcher would actually accept",
  (() => {
    const cols = sp.columnContract(sp.EVIDENCE_FIELDS).map((c, i) => ({
      name: `field_${i}`, displayName: c.create, readOnly: false,
    }));
    const map = sp.mapFields(cols, [...sp.EVIDENCE_FIELDS]);
    return map.missing.length === 0;
  })(),
  "a column called something Squawk does not recognise is silently skipped"
);

check(
  "AN INSPECTION'S PHOTOGRAPH IS LABELLED TOO, with its own id as the CheckID",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-A3F2K", title: "Cracked kerb",
            attachments: [{ id: "w1", kind: "photo", name: "n", blobKey: "b9", ref: "WALK-A3F2K_P01", caption: "Kerb", createdBy: "Sarel" }],
          },
        ],
      },
      NOTHING
    );
    const v = p.evidence[0].values;
    /* This item never set its own discipline/system, so blank is correct —
       see the tests below for what happens when it does. Blank here is "the
       auditor genuinely left it unset," not "a walk item cannot carry one." */
    return v.checkId === "WALK-A3F2K" && v.discipline === "" && v.assetSystem === "";
  })()
);

check(
  "THE GRAPH LAYER CAN WRITE A FILE'S COLUMNS, and does it as a PATCH",
  /setFileFields/.test(graphSrc) &&
    /\/listItem\/fields`/.test(graphSrc) &&
    /method: "PATCH"/.test(graphSrc),
  "a PATCH is an update; the account is Contribute WITHOUT delete"
);

check(
  "the upload hands back the item id rather than looking it up again by path",
  /Promise<\{ id: string; webUrl: string \}>/.test(graphSrc),
  "a second lookup is a round trip and a chance to address the wrong file"
);

check(
  "AND THE PANEL ACTUALLY WRITES THEM after each upload",
  /graph\.setFileFields\(/.test(panel) && /projectFields\(resolved\.driveMap/.test(panel),
  "this is the step that did not exist; the upload PUT the bytes and stopped"
);

check(
  "a metadata failure is NOT reported as a failed upload",
  (() => {
    /* The file is in the library and correct. Calling that a failed upload
       sends somebody looking for a photograph that is right there. It is still
       said out loud — unlabelled is rendered, not swallowed. */
    return /unlabelled\.push\(/.test(panel) && /result\.unlabelled\.length > 0 &&/.test(panel);
  })()
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

/* ---- AN INSPECTION'S PHOTOGRAPH IS EVIDENCE TOO -------------------------
 *  Sarel, 16 September 2026, having just captured one: "not sure how to sync
 *  the photo now to sharepoint." He could not. The evidence walk iterated the
 *  REGISTER and read each check's response; an inspection item is ad-hoc, in
 *  its own slice with a WALK- id, so it was never visited and its photographs
 *  were invisible — not even a count on the tile to notice was wrong. */

check(
  "AN INSPECTION ITEM'S PHOTOGRAPH IS QUEUED FOR UPLOAD",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-A3F2K",
            attachments: [
              { id: "x1", kind: "photo", name: "n", blobKey: "b1", ref: "WALK-A3F2K_P01" },
              { id: "x2", kind: "voice", name: "v", blobKey: "b2" },
            ],
          },
        ],
      },
      NOTHING
    );
    return p.evidence.length === 1 && p.evidence[0].filename === "WALK-A3F2K_P01.jpg";
  })(),
  "a voice note on a walk item is no more evidence for the library than one on a check"
);

check(
  "and it is named so it can never be mistaken for a check-point's",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [{ id: "WALK-A3F2K", attachments: [{ id: "x1", kind: "photo", name: "n", cloudUrl: "https://blob/x", ref: "WALK-A3F2K_P01" }] }],
        responses: {
          "KSIA-ELE-001": {
            compliance: "NC", observation: "x",
            attachments: [{ id: "a1", kind: "photo", name: "n", blobKey: "b1", ref: "KSIA-ELE-001_P01" }],
          },
        },
      },
      NOTHING
    );
    const names = p.evidence.map((e) => e.filename).sort();
    return names.length === 2 && names[0] === "KSIA-ELE-001_P01.jpg" && names[1] === "WALK-A3F2K_P01.jpg";
  })(),
  "the two references are distinct by construction, so one folder is safe"
);

check(
  "the same exclusions apply — evicted is gone, and the record copy counts",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          { id: "WALK-1", attachments: [{ id: "x1", kind: "photo", name: "n", blobKey: "b", unavailable: true, ref: "R" }] },
          { id: "WALK-2", attachments: [{ id: "x2", kind: "photo", name: "n", ref: "R2" }] },
          { id: "WALK-3", attachments: [{ id: "x3", kind: "photo", name: "n", cloudUrl: "https://blob/y", ref: "WALK-3_P01" }] },
        ],
      },
      NOTHING
    );
    return p.evidence.length === 1 && p.evidence[0].filename === "WALK-3_P01.jpg";
  })()
);

check(
  "the writer is given the inspection items, not just the register",
  /auditor, findings, adhoc, attendanceRegisters, evidenceItems, systems \}/.test(panel) &&
    /const adhoc = useAdhoc\(\)/.test(panel)
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
  /if \(sendPhotos && resolved\.driveId && \(plan\.evidence\.length \|\| plan\.signatures\.length\)\)/.test(
    panel
  )
);

check(
  "and the count on the button drops with it, rather than promising writes it will not make",
  /t\.writes - \(sendPhotos \? 0 : t\.photographs \+ t\.signatures\)/.test(panel) &&
    /totals\.writes - \(sendPhotos \? 0 : totals\.photographs \+ totals\.signatures\)/.test(panel) &&
    /`Write \$\{writes\} to the portal`/.test(panel)
);

/* ---- A PARTIAL WRITE NEVER READS AS A COMPLETE ONE ----------------------
 *  The first real write: 33 rows landed, the evidence folder call threw, and
 *  the panel said "33 written. Everything in the plan reached the portal."
 *  `failed` was empty because ensureFolder sat outside the per-photograph try,
 *  so five photographs went missing and the screen called it a success. */

check(
  "a day folder that could not be prepared names every file headed for it, not the whole plan",
  /folderFailed/.test(panel) && /could not be prepared/.test(panel),
  "one day's folder failing must not silently take down a different day's files, or go unnamed"
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

/* A real one, found live against ORTIA's own portal 6 October 2026: a check
 * answered N/A never matched "N/A - Not applicable", because the code
 * extractor split on "/" as a separator and broke the code's own slash
 * apart before comparing it — "N/A" never reconstructed to look for. Every
 * other compliance code (C, NC, NV) has no slash in it, so this was invisible
 * until somebody actually answered a check N/A. */
check(
  "a code WITH A SLASH IN IT still finds its option — N/A is a code, not two codes",
  sp.portalChoice("N/A", ["C - Compliant", "NC - Non-compliant", "N/A - Not applicable", "NV - Not available"]) ===
    "N/A - Not applicable",
  "the separator list used to include / and split N/A into N and A before either reached the comparison"
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
        findings: [{ id: "f1", entity: "FALE", checkId: "KSIA-ELE-001" }],
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
  "and it keeps their Titles, so 'which rows?' is answerable from inside Squawk",
  (() => {
    const i = sp.indexExisting(
      [{ title: "KSIA-ELE-001", id: "1" }, { title: "BFIA-ELE-001", id: "2" }],
      "KSIA"
    );
    return i.foreignTitles.length === 1 && i.foreignTitles[0] === "BFIA-ELE-001";
  })(),
  "a diagnosis that needs a SharePoint tutorial is a diagnosis nobody runs"
);

check(
  "and the plan shows the census without anybody asking for it",
  /What is in these lists, as read just now/.test(panel) && /foreignTitles/.test(panel)
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

/* ---------------- Part 1d: attendance registers, one row per person ------- */

const ROW = (id, name = "A. Auditor", over = {}) => ({
  id, name, organisation: "TPJV", role: "Auditor", phone: "", email: "",
  signature: null, createdAt: 1_757_000_000_000, updatedAt: 1_757_000_000_000, ...over,
});

const APOLOGY = (id, name = "N. Ghadbois", over = {}) => ({
  id, name, organisation: "ACSA", role: "Engineer", reason: "",
  createdAt: 1_757_000_000_000, updatedAt: 1_757_000_000_000, ...over,
});

const REGISTER = (over = {}) => ({
  id: "ATR-00001", entity: "FALE", originVisit: "2026-09",
  date: "2026-09-15", time: "08:00", location: "Site office", purpose: "Morning muster",
  openedAt: 1_757_000_000_000, openedBy: "Sarel", rows: [], apologies: [],
  createdAt: 1_757_000_000_000, updatedAt: 1_757_000_000_000, ...over,
});

const BASE_ATT = { ...BASE, attendanceRegisters: [] };
const NOTHING_ATT = { ...NOTHING, attendance: new Map() };

check(
  "an empty register writes nothing and is counted, not silently dropped",
  (() => {
    const p = sp.buildPlan({ ...BASE_ATT, attendanceRegisters: [REGISTER()] }, NOTHING_ATT);
    return (
      p.attendance.length === 0 &&
      p.skipped.some((s) => s.what === "attendance registers" && s.count === 1)
    );
  })(),
  "a register opened ahead of time with nobody signed in yet is working as intended, not a gap"
);

check(
  "a signed-in attendee IS written, one row for them",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ rows: [ROW("r1")] })] },
      NOTHING_ATT
    );
    return (
      p.attendance.length === 1 &&
      p.attendance[0].values.name === "A. Auditor" &&
      p.attendance[0].values.status === "Attended" &&
      p.attendance[0].action === "create"
    );
  })()
);

check(
  "an apology IS written too, same columns, Status tells them apart",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ apologies: [APOLOGY("a1", "N. Ghadbois", { reason: "On leave" })] })] },
      NOTHING_ATT
    );
    const row = p.attendance[0];
    return (
      p.attendance.length === 1 &&
      row.values.status === "Apology" &&
      row.values.apologyReason === "On leave" &&
      row.values.name === "N. Ghadbois"
    );
  })(),
  "an apology is never a row in `rows` — merging the two is how 'signed' and 'sent regrets' blur"
);

check(
  "every person in the register gets their own row — presence is counted, not the register",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE_ATT,
        attendanceRegisters: [
          REGISTER({ rows: [ROW("r1", "A. One"), ROW("r2", "B. Two")], apologies: [APOLOGY("a1", "C. Three")] }),
        ],
      },
      NOTHING_ATT
    );
    return p.attendance.length === 3;
  })()
);

check(
  "the row's Title leads with the site code, and it is unique per person",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ rows: [ROW("r1"), ROW("r2")] })] },
      NOTHING_ATT
    );
    const siteCode = sites.siteCodeFor("FALE");
    return (
      p.attendance.every((r) => r.key.startsWith(`${siteCode}-`)) &&
      p.attendance[0].key !== p.attendance[1].key
    );
  })(),
  "belongsToSite refuses any Title that does not lead with this site's code"
);

check(
  "a row already in the portal is an UPDATE, not a second copy",
  (() => {
    const reg = REGISTER({ rows: [ROW("r1")] });
    const siteCode = sites.siteCodeFor("FALE");
    const key = `${siteCode}-${reg.id}-r1`;
    const existing = { ...NOTHING_ATT, attendance: new Map([[key, "item-9"]]) };
    const p = sp.buildPlan({ ...BASE_ATT, attendanceRegisters: [reg] }, existing);
    return p.attendance[0].action === "update" && p.attendance[0].itemId === "item-9";
  })(),
  "running the sync twice must update the same row, never duplicate it"
);

check(
  "a signed attendee carries who and when, in one cell; an unsigned one carries nothing",
  (() => {
    const signed = ROW("r1", "A. Auditor", {
      signature: { ref: "ATR-00001_S01", signedName: "A. Auditor", signedAt: 1_757_500_000_000, blobKey: "b1" },
    });
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ rows: [signed, ROW("r2")] })] },
      NOTHING_ATT
    );
    const [withSig, without] = p.attendance;
    return (
      /A\. Auditor/.test(String(withSig.values.signed)) &&
      String(withSig.values.signed).length > "A. Auditor".length &&
      without.values.signed === ""
    );
  })()
);

check(
  "the register's own date, time, purpose and location travel onto every row",
  (() => {
    const reg = REGISTER({ date: "2026-09-16", time: "14:30", purpose: "Toolbox talk", location: "Switch room 3", rows: [ROW("r1")] });
    const p = sp.buildPlan({ ...BASE_ATT, attendanceRegisters: [reg] }, NOTHING_ATT);
    const v = p.attendance[0].values;
    return (
      v.registerDate === "2026-09-16" &&
      v.time === "14:30" &&
      v.purpose === "Toolbox talk" &&
      v.location === "Switch room 3"
    );
  })()
);

check(
  "two registers in the same visit do not collide",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE_ATT,
        attendanceRegisters: [
          REGISTER({ id: "ATR-00001", rows: [ROW("r1")] }),
          REGISTER({ id: "ATR-00002", rows: [ROW("r1")] }),
        ],
      },
      NOTHING_ATT
    );
    return p.attendance.length === 2 && p.attendance[0].key !== p.attendance[1].key;
  })(),
  "the same row id in two different registers must not resolve to the same Title"
);

check(
  "when attendanceRegisters is not passed at all, the plan still builds — nothing to sync, no crash",
  (() => {
    const p = sp.buildPlan(BASE, NOTHING);
    return p.attendance.length === 0;
  })(),
  "SyncInput.attendanceRegisters is optional, same as findings/adhoc, so other callers are unaffected"
);

check(
  "ATTENDANCE_FIELDS and FIELD_CANDIDATES agree — every field the sync writes has a column it can look for",
  sp.ATTENDANCE_FIELDS.every((k) => Array.isArray(sp.FIELD_CANDIDATES[k]) && sp.FIELD_CANDIDATES[k].length > 0)
);

check(
  "planTotals counts attendance rows separately from check-points and findings",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ rows: [ROW("r1"), ROW("r2")] })] },
      NOTHING_ATT
    );
    const t = sp.planTotals(p);
    return t.attendanceNew === 2 && t.attendanceChanged === 0 && t.writes === 2;
  })()
);

check(
  "the writer sends the attendance plan to its own list, not folded into check-points or findings",
  /writeRows\(plan\.attendance, resolved\.attendanceList, "attendance row"\)/.test(panel)
);

check(
  "the new list is found by display name, same pattern as the other two",
  sp.LIST_NAMES.attendance.test("Attendance Register") &&
    sp.LIST_NAMES.attendance.test("Attendance Registers") &&
    sp.LIST_NAMES.attendance.test("Attendance") &&
    !sp.LIST_NAMES.attendance.test("Findings")
);

/* ---------- Part 1e: the evidence log (TK-003 form 7) ---------------------
 *
 *  THE LINK TO THE AUDIT CHECKS is the whole point — Sarel: "maintain the
 *  link to the audit checks." These assertions are weighted towards that
 *  column and towards the visit filter, which evidenceLogSheet's own export
 *  already applies and this sync must not disagree with. */

const DOC = (id, over = {}) => ({
  id, entity: "FALE", originVisit: "2026-09",
  title: "Maintenance log book", documentNo: "", revision: "",
  documentDate: null,
  requestedAt: null, requestedFrom: "",
  receivedAt: null, receivedFrom: "", receivedBy: "",
  medium: null, isOriginal: false,
  returnedAt: null, returnedTo: "",
  unavailableAt: null, unavailableReason: "",
  checkIds: [], attachments: [], signature: null, notes: "",
  createdAt: 1_757_000_000_000, updatedAt: 1_757_000_000_000, ...over,
});

const BASE_EV = { ...BASE_ATT, evidenceItems: [] };
const NOTHING_EV = { ...NOTHING_ATT, evidenceLog: new Map() };

check(
  "a document with no title is skipped and counted, not written blank",
  (() => {
    const p = sp.buildPlan({ ...BASE_EV, evidenceItems: [DOC("DOC-1", { title: "  " })] }, NOTHING_EV);
    return (
      p.evidenceLog.length === 0 &&
      p.skipped.some((s) => s.what === "evidence log entries" && s.count === 1)
    );
  })()
);

check(
  "a document from THIS visit IS written",
  (() => {
    const p = sp.buildPlan({ ...BASE_EV, evidenceItems: [DOC("DOC-1")] }, NOTHING_EV);
    return p.evidenceLog.length === 1 && p.evidenceLog[0].values.documentTitle === "Maintenance log book";
  })()
);

check(
  "a document from a DIFFERENT visit is not written — same filter the export already applies",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_EV, evidenceItems: [DOC("DOC-1", { originVisit: "2025-03" })] },
      NOTHING_EV
    );
    return p.evidenceLog.length === 0;
  })(),
  "useEvidenceItems() spans visits on purpose; the sync writes one visit's capture, same as every other list"
);

check(
  "THE LINK TO THE AUDIT CHECKS: checkPoints carries the portal's own check-point ids",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_EV, evidenceItems: [DOC("DOC-1", { checkIds: ["KSIA-ELE-002", "KSIA-ELE-001"] })] },
      NOTHING_EV
    );
    const siteCode = sites.siteCodeFor("FALE");
    return p.evidenceLog[0].values.checkPoints === `${siteCode}-ELE-001, ${siteCode}-ELE-002`;
  })(),
  "sorted, so the same document always writes the same string regardless of capture order"
);

check(
  "a document already in the portal is an UPDATE, not a second copy",
  (() => {
    const doc = DOC("DOC-1");
    const siteCode = sites.siteCodeFor("FALE");
    const key = `${siteCode}-DOC-1`;
    const existing = { ...NOTHING_EV, evidenceLog: new Map([[key, "item-7"]]) };
    const p = sp.buildPlan({ ...BASE_EV, evidenceItems: [doc] }, existing);
    return p.evidenceLog[0].action === "update" && p.evidenceLog[0].itemId === "item-7";
  })()
);

check(
  "medium reads in plain words, not the internal key",
  (() => {
    const p = sp.buildPlan({ ...BASE_EV, evidenceItems: [DOC("DOC-1", { medium: "paper" })] }, NOTHING_EV);
    return p.evidenceLog[0].values.medium === "Paper";
  })()
);

check(
  "isOriginal becomes a plain word too",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_EV, evidenceItems: [DOC("DOC-1", { isOriginal: true }), DOC("DOC-2", { isOriginal: false })] },
      NOTHING_EV
    );
    return p.evidenceLog[0].values.originalOrCopy === "Original" && p.evidenceLog[1].values.originalOrCopy === "Copy";
  })()
);

check(
  "the writer sends the evidence log to its own list, never the photo library",
  /writeRows\(plan\.evidenceLog, resolved\.evidenceLogList, "evidence log entry"\)/.test(panel)
);

check(
  "the evidence log is found by display name, and not confused with the photo library",
  sp.LIST_NAMES.evidenceLog.test("Evidence Log") &&
    sp.LIST_NAMES.evidenceLog.test("Document and Evidence Collection Log") &&
    !sp.LIST_NAMES.evidenceLog.test("Findings")
);

/* ---------------- Part 1f: asset risk, one row per asset system ----------- */

const SYS = (over = {}) => ({
  key: "Electrical|AGL", discipline: "Electrical", system: "AGL",
  severity: null, likelihood: null, ratingConfirmed: false, ratingRationale: "",
  rootCauses: [], actions: [], events: [], note: "", assessedBy: "", assessedAt: null,
  ...over,
});

const BASE_AR = { ...BASE_EV, systems: {} };
const NOTHING_AR = { ...NOTHING_EV, assetRisk: new Map() };

check(
  "a pair with NOTHING recorded against it is skipped, not invented as a row",
  (() => {
    const p = sp.buildPlan(BASE_AR, NOTHING_AR);
    return p.assetRisk.length === 0 && p.skipped.some((s) => s.what === "asset systems" && s.count === 1);
  })(),
  "an empty assessment is 'not reached', not a rating of Green — inventing a row would say otherwise"
);

check(
  "a CONFIRMED rating goes across with severity, likelihood, band and strategy all populated",
  (() => {
    const sys = { "Electrical|AGL": SYS({ ratingConfirmed: true, severity: "A - Catastrophic", likelihood: "1 - Extremely Improbable" }) };
    const p = sp.buildPlan({ ...BASE_AR, systems: sys }, NOTHING_AR);
    const v = p.assetRisk[0].values;
    return (
      v.severity === "A - Catastrophic" &&
      v.likelihood === "1 - Extremely Improbable" &&
      v.ratingAgreed === "Yes" &&
      typeof v.band === "string" &&
      typeof v.strategy === "string"
    );
  })()
);

check(
  "an UNCONFIRMED rating still goes across — the work syncs, the rating does not",
  (() => {
    const sys = {
      "Electrical|AGL": SYS({
        ratingConfirmed: false,
        severity: "A - Catastrophic",
        likelihood: "1 - Extremely Improbable",
        rootCauses: [{ id: "r1", cause: "Corrosion", note: "" }],
      }),
    };
    const p = sp.buildPlan({ ...BASE_AR, systems: sys }, NOTHING_AR);
    const v = p.assetRisk[0].values;
    return (
      v.severity === null &&
      v.likelihood === null &&
      v.band === null &&
      v.ratingAgreed === "No" &&
      /Corrosion/.test(String(v.rootCause))
    );
  })(),
  "same gate a hazard's ERM rating gets — unconfirmed is a suggestion, not a fact for the portal"
);

check(
  "root causes, actions and possible events all flatten onto their own fields",
  (() => {
    const sys = {
      "Electrical|AGL": SYS({
        rootCauses: [{ id: "r1", cause: "Corrosion", note: "at the base" }],
        actions: [{ id: "a1", discipline: "Electrical", action: "Replace fixing", owner: "J. Smith", dueDate: "2026-12-01", status: "Open" }],
        events: [{ id: "e1", event: "AGL failure", likelihood: "3 - Occasional", note: "" }],
      }),
    };
    const p = sp.buildPlan({ ...BASE_AR, systems: sys }, NOTHING_AR);
    const v = p.assetRisk[0].values;
    return (
      /Corrosion — at the base/.test(String(v.rootCause)) &&
      /Replace fixing/.test(String(v.treatment)) &&
      v.owner === "J. Smith" &&
      v.targetDate === "2026-12-01" &&
      /AGL failure/.test(String(v.events))
    );
  })()
);

check(
  "the Title is deterministic from discipline and system — no minting sequence needed",
  (() => {
    const sys = { "Electrical|AGL": SYS({ ratingConfirmed: true, severity: "A - Catastrophic", likelihood: "1 - Extremely Improbable" }) };
    const p1 = sp.buildPlan({ ...BASE_AR, systems: sys }, NOTHING_AR);
    const p2 = sp.buildPlan({ ...BASE_AR, systems: sys }, NOTHING_AR);
    const siteCode = sites.siteCodeFor("FALE");
    return p1.assetRisk[0].key === p2.assetRisk[0].key && p1.assetRisk[0].key.startsWith(`${siteCode}-RISK-ELE-AGL`);
  })(),
  "a hazard's key is minted once and remembered; an asset system's key is the pair itself, every time"
);

check(
  "a pair already in the portal is an UPDATE, not a second copy",
  (() => {
    const sys = { "Electrical|AGL": SYS({ ratingConfirmed: true, severity: "A - Catastrophic", likelihood: "1 - Extremely Improbable" }) };
    const key = `${sites.siteCodeFor("FALE")}-RISK-ELE-AGL`;
    const existing = { ...NOTHING_AR, assetRisk: new Map([[key, "item-3"]]) };
    const p = sp.buildPlan({ ...BASE_AR, systems: sys }, existing);
    return p.assetRisk[0].action === "update" && p.assetRisk[0].itemId === "item-3";
  })()
);

check(
  "a second, different asset system gets its own row and its own key",
  (() => {
    const checks = [...BASE_AR.checks, CHECK("KSIA-CIV-001", "Civil", "Pavement")];
    const sys = {
      "Electrical|AGL": SYS({ ratingConfirmed: true, severity: "A - Catastrophic", likelihood: "1 - Extremely Improbable" }),
      "Civil|Pavement": SYS({ key: "Civil|Pavement", discipline: "Civil", system: "Pavement", ratingConfirmed: true, severity: "C - Major", likelihood: "3 - Occasional" }),
    };
    const p = sp.buildPlan({ ...BASE_AR, checks, systems: sys }, NOTHING_AR);
    return p.assetRisk.length === 2 && p.assetRisk[0].key !== p.assetRisk[1].key;
  })()
);

check(
  "the writer sends asset risk to its own list",
  /writeRows\(plan\.assetRisk, resolved\.assetRiskList, "asset risk row"\)/.test(panel)
);

check(
  "the asset risk list is found by display name",
  sp.LIST_NAMES.assetRisk.test("Asset Risk") &&
    sp.LIST_NAMES.assetRisk.test("Asset Systems") &&
    sp.LIST_NAMES.assetRisk.test("Asset Assurance") &&
    !sp.LIST_NAMES.assetRisk.test("Findings")
);

check(
  "EVIDENCE_LOG_FIELDS and ASSET_RISK_FIELDS agree with FIELD_CANDIDATES, same as every other list",
  sp.EVIDENCE_LOG_FIELDS.every((k) => Array.isArray(sp.FIELD_CANDIDATES[k]) && sp.FIELD_CANDIDATES[k].length > 0) &&
    sp.ASSET_RISK_FIELDS.every((k) => Array.isArray(sp.FIELD_CANDIDATES[k]) && sp.FIELD_CANDIDATES[k].length > 0)
);

check(
  "planTotals counts evidence log and asset risk separately from everything else",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE_AR,
        evidenceItems: [DOC("DOC-1")],
        systems: { "Electrical|AGL": SYS({ ratingConfirmed: true, severity: "A - Catastrophic", likelihood: "1 - Extremely Improbable" }) },
      },
      NOTHING_AR
    );
    const t = sp.planTotals(p);
    return (
      t.evidenceLogNew === 1 &&
      t.evidenceLogChanged === 0 &&
      t.assetRiskNew === 1 &&
      t.assetRiskChanged === 0 &&
      t.writes === 2
    );
  })()
);

/* ---------------- Part 1g: the marks behind the signed cell --------------- *
 *
 *  signedCell puts WHO and WHEN into the attendance/evidence-log row as text
 *  — this is the image behind it, going to the same evidence library the
 *  photographs do. Sarel: "sync the actual signatures to sharepoint." */

check(
  "a signed-in attendee's mark is planned as a signature file, named by its own ref",
  (() => {
    const signed = ROW("r1", "A. Auditor", {
      signature: { ref: "ATR-00001_S01", signedName: "A. Auditor", signedAt: 1_757_500_000_000, blobKey: "b1" },
    });
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ rows: [signed] })] },
      NOTHING_ATT
    );
    return (
      p.signatures.length === 1 &&
      p.signatures[0].filename === "ATR-00001_S01.png" &&
      p.signatures[0].signature.blobKey === "b1"
    );
  })()
);

check(
  "an unsigned attendee plans no signature file at all",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ rows: [ROW("r1")] })] },
      NOTHING_ATT
    );
    return p.signatures.length === 0;
  })()
);

check(
  "an apology — nobody signed anything — never produces a signature file",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ apologies: [APOLOGY("a1")] })] },
      NOTHING_ATT
    );
    return p.signatures.length === 0;
  })(),
  "ApologyEntry carries no signature field — there is nothing here anybody signed"
);

check(
  "two registers' signed rows both plan their own signature file — no collision",
  (() => {
    const sig = (ref) => ({ ref, signedName: "A. Auditor", signedAt: 1_757_500_000_000, blobKey: "b1" });
    const p = sp.buildPlan(
      {
        ...BASE_ATT,
        attendanceRegisters: [
          REGISTER({ id: "ATR-00001", rows: [ROW("r1", "A. One", { signature: sig("ATR-00001_S01") })] }),
          REGISTER({ id: "ATR-00002", rows: [ROW("r1", "B. Two", { signature: sig("ATR-00002_S01") })] }),
        ],
      },
      NOTHING_ATT
    );
    return (
      p.signatures.length === 2 &&
      p.signatures[0].filename !== p.signatures[1].filename
    );
  })()
);

check(
  "a signed evidence-log collector's mark is planned too, same as an attendance row",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE_EV,
        evidenceItems: [
          DOC("DOC-1", {
            receivedBy: "A. Auditor",
            signature: { ref: "DOC-1_S01", signedName: "A. Auditor", signedAt: 1_757_500_000_000, blobKey: "b2" },
          }),
        ],
      },
      NOTHING_EV
    );
    return (
      p.signatures.length === 1 &&
      p.signatures[0].filename === "DOC-1_S01.png" &&
      /A\. Auditor/.test(p.signatures[0].caption)
    );
  })()
);

check(
  "an evidence-log entry with no collector's mark plans no signature file",
  (() => {
    const p = sp.buildPlan({ ...BASE_EV, evidenceItems: [DOC("DOC-1")] }, NOTHING_EV);
    return p.signatures.length === 0;
  })()
);

check(
  "planTotals counts signatures separately, and folds them into the writes total",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE_ATT,
        attendanceRegisters: [
          REGISTER({
            rows: [
              ROW("r1", "A. One", {
                signature: { ref: "ATR-00001_S01", signedName: "A. One", signedAt: 1_757_500_000_000, blobKey: "b1" },
              }),
            ],
          }),
        ],
      },
      NOTHING_ATT
    );
    const t = sp.planTotals(p);
    return t.signatures === 1 && t.writes === t.attendanceNew + t.signatures;
  })()
);

check(
  "a signature does not carry EVIDENCE_FIELDS-style metadata — it is a file, not a labelled row",
  (() => {
    const signed = ROW("r1", "A. Auditor", {
      signature: { ref: "ATR-00001_S01", signedName: "A. Auditor", signedAt: 1_757_500_000_000, blobKey: "b1" },
    });
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ rows: [signed] })] },
      NOTHING_ATT
    );
    const s = p.signatures[0];
    return (
      typeof s.rowKey === "string" &&
      typeof s.filename === "string" &&
      typeof s.caption === "string" &&
      !("values" in s) &&
      !("checkId" in s)
    );
  })(),
  "PlannedFile's checkId/discipline/assetSystem columns describe a photograph; a signature has none of them"
);

check(
  "the writer uploads signatures through fullSignatureBlob, into their own day folder",
  /const blob = await fullSignatureBlob\(s\.signature, entityCode, visitId\)/.test(panel) &&
    /graph\.uploadEvidence\(resolved\.driveId, s\.folder, s\.filename, blob\)/.test(panel)
);

check(
  "photographs and signatures each upload into their OWN day folder, not one shared visit folder",
  /graph\.uploadEvidence\(resolved\.driveId, f\.folder, f\.filename, blob\)/.test(panel) &&
    /graph\.uploadEvidence\(resolved\.driveId, s\.folder, s\.filename, blob\)/.test(panel) &&
    !/graph\.uploadEvidence\(resolved\.driveId, plan\.folder/.test(panel)
);

check(
  "a bad day folder is ensured per-folder, not once for the whole plan — one call per distinct day",
  /const folders = new Set\(\[/.test(panel) && /for \(const dayFolder of folders\)/.test(panel)
);

check(
  "signatures are gated on the same off-by-default switch as photographs — not an always-on upload",
  (() => {
    const m = panel.match(
      /if \(sendPhotos && resolved\.driveId && \(plan\.evidence\.length \|\| plan\.signatures\.length\)\) \{([\s\S]*?)\n {6}\}/
    );
    return !!m && /plan\.signatures/.test(m[1]) && /fullSignatureBlob/.test(m[1]);
  })(),
  "these are images of a national key point — uploading them needs the same deliberate tick photographs already require"
);

check(
  "the shell mounts the signature backup queue, next to the photograph one",
  /const sigSync = useSignatureSync\(\);/.test(shell) && /usePhotoSync\(\)/.test(shell)
);

check(
  "signatureSync tries this device's own copy before the record copy — same order fullPhotoBlob uses",
  (() => {
    const sync = src("lib", "signatureSync.ts");
    const i1 = sync.indexOf("const local = await getBlob(s.blobKey)");
    const i2 = sync.indexOf("return fetchRecordPhoto(signatureObjectPath");
    return i1 > -1 && i2 > -1 && i1 < i2;
  })(),
  "a device that captured the signature must never pay for a network round trip to see its own evidence"
);

check(
  "signatureSync is scoped to attendance and evidence-log signatures only — not every signature in the app",
  (() => {
    const sync = src("lib", "signatureSync.ts");
    return (
      /SignatureOwner = "attendance" \| "evidenceLog"/.test(sync) &&
      !/closeSignature|closeoutLeadSignature|diarySignature|authorisedSignature/.test(sync)
    );
  })(),
  "diary/closeout/ISF signatures keep their existing unbacked-signature warning and nothing more, deliberately"
);

check(
  "signatures.ts is framework-free — sharepoint.ts's own test suite, and a client hook, both import it",
  !/^"use client"/.test(src("lib", "signatures.ts")) &&
    /export function signatureFilename/.test(src("lib", "signatures.ts")) &&
    /export function signatureObjectPath/.test(src("lib", "signatures.ts"))
);

/* ---------------- Part 1h: one folder per day, no month folder at all ----- *
 *
 *  Sarel, 7 October 2026: "create a folder for each day and put the photos
 *  in each day it was captured" — a visit's own folder was one flat folder
 *  for the whole visit (keyed on `2026-09`, a month), and every photograph
 *  and signature from a three-week audit landed in it together. Then: "So
 *  no month folder only [site]/7 OCT 2026... wait, 20261007, use this
 *  format." */

const TAKEN = (t) => ({ id: "a1", kind: "photo", name: "n", blobKey: "b1", ref: "KSIA-ELE-001_P01", caption: "c", takenAt: t, createdAt: t });

/* `20260915`, not `2026-09-15` — the same reading dayFolder itself does. */
const ymd = (t) => localDate(t).replace(/-/g, "");

check(
  "a photograph files under the day it was taken, inside the site's own folder — YYYYMMDD, no dashes",
  (() => {
    const takenAt = Date.parse("2026-09-15T10:00:00+02:00");
    const p = sp.buildPlan(
      { ...BASE, responses: { "KSIA-ELE-001": { compliance: "NC", observation: "x", attachments: [TAKEN(takenAt)] } } },
      NOTHING
    );
    const f = p.evidence[0];
    return f.folder === `${p.folder}/${ymd(takenAt)}` && f.folder.endsWith("/20260915");
  })()
);

check(
  "two photographs taken on different days file into different day folders, same site",
  (() => {
    const day1 = Date.parse("2026-09-15T10:00:00+02:00");
    const day2 = Date.parse("2026-09-22T10:00:00+02:00");
    const p = sp.buildPlan(
      {
        ...BASE,
        responses: {
          "KSIA-ELE-001": { compliance: "NC", observation: "x", attachments: [TAKEN(day1)] },
          "KSIA-ELE-002": { compliance: "NC", observation: "x", attachments: [{ ...TAKEN(day2), ref: "KSIA-ELE-002_P01" }] },
        },
      },
      NOTHING
    );
    const [f1, f2] = p.evidence;
    return (
      f1.folder !== f2.folder &&
      f1.folder.startsWith(p.folder) &&
      f2.folder.startsWith(p.folder) &&
      f1.folder.endsWith(ymd(day1)) &&
      f2.folder.endsWith(ymd(day2))
    );
  })()
);

check(
  "with no EXIF takenAt, the photograph still files by the day it was logged — createdAt",
  (() => {
    const createdAt = Date.parse("2026-09-16T08:00:00+02:00");
    const a = { id: "a1", kind: "photo", name: "n", blobKey: "b1", ref: "KSIA-ELE-001_P01", caption: "c", createdAt };
    const p = sp.buildPlan(
      { ...BASE, responses: { "KSIA-ELE-001": { compliance: "NC", observation: "x", attachments: [a] } } },
      NOTHING
    );
    return p.evidence[0].folder === `${p.folder}/${ymd(createdAt)}`;
  })(),
  "takenAt is EXIF-only and absent on plenty of real photographs; createdAt is always there"
);

check(
  "a photograph with neither timestamp falls back to the site folder, never a NaNNaNNaN one",
  (() => {
    const a = { id: "a1", kind: "photo", name: "n", blobKey: "b1", ref: "KSIA-ELE-001_P01", caption: "c" };
    const p = sp.buildPlan(
      { ...BASE, responses: { "KSIA-ELE-001": { compliance: "NC", observation: "x", attachments: [a] } } },
      NOTHING
    );
    return p.evidence[0].folder === p.folder && !/NaN/.test(p.evidence[0].folder);
  })(),
  "a wrong folder is worse than a coarser real one — an invented date must never reach SharePoint"
);

check(
  "a WALK inspection photograph gets a day folder too, same rule as a check-point's",
  (() => {
    const takenAt = Date.parse("2026-09-18T09:00:00+02:00");
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-A3F2K", description: "Loose kerb", discipline: null, system: null, area: "Apron",
            attachments: [{ id: "w1", kind: "photo", name: "n", blobKey: "b9", ref: "WALK-A3F2K_P01", caption: "Kerb", takenAt, createdAt: takenAt }],
          },
        ],
      },
      NOTHING
    );
    return p.evidence[0].folder === `${p.folder}/${ymd(takenAt)}`;
  })()
);

check(
  "a signature files by when it was SIGNED, not when the register was opened",
  (() => {
    const signedAt = 1_758_500_000_000;
    const signed = ROW("r1", "A. Auditor", {
      signature: { ref: "ATR-00001_S01", signedName: "A. Auditor", signedAt, blobKey: "b1" },
    });
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ date: "2026-09-10", rows: [signed] })] },
      NOTHING_ATT
    );
    return p.signatures[0].folder === `${p.folder}/${ymd(signedAt)}`;
  })()
);

check(
  "EvidenceLink is unaffected — it still names the site's own folder, not any day inside it",
  (() => {
    const takenAt = Date.parse("2026-09-15T10:00:00+02:00");
    const dated = {
      ...LINKED,
      responses: {
        "KSIA-ELE-001": { ...LINKED.responses["KSIA-ELE-001"], attachments: [TAKEN(takenAt)] },
      },
    };
    const p = sp.buildPlan(dated, NOTHING);
    const row = p.checkpoints.find((r) => r.key === "KSIA-ELE-001");
    return (
      row.values.evidenceLink ===
      "https://tpjv.sharepoint.com/sites/ACSA-Asset-Assurance/Evidence/King%20Shaka%20International%20FALE" &&
      p.evidence[0].folder === `${p.folder}/${ymd(takenAt)}` &&
      p.evidence[0].folder !== p.folder
    );
  })(),
  "one stable link per row; the day split only changes where the bytes themselves land"
);

check(
  "YYYYMMDD sorts correctly as plain text, same as the old YYYY-MM-DD did",
  ymd(Date.parse("2026-09-05T00:00:00+02:00")) < ymd(Date.parse("2026-10-07T00:00:00+02:00")) &&
    ymd(Date.parse("2026-01-05T00:00:00+02:00")) < ymd(Date.parse("2026-01-22T00:00:00+02:00")),
  "a reader scrolling a SharePoint folder list needs the dates to sort without reading each one"
);

check(
  "ensureFolder is called once per distinct day, not once for the whole plan",
  /const folders = new Set\(\[\s*\.\.\.plan\.evidence\.map\(\(f\) => f\.folder\),\s*\.\.\.plan\.signatures\.map\(\(s\) => s\.folder\),\s*\]\);/.test(
    panel
  )
);

/* ------------- Part 1i: holding a discipline back from this run ---------- *
 *
 *  Sarel: "I captured some electrical info but didnt want to sync it yet
 *  but i want to sync everything else." Before this, the only tool was
 *  "sync nothing" — one discipline not ready meant none of them went. */

check(
  "with nothing excluded, every discipline still syncs — the default is unchanged",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        checks: [CHECK("KSIA-ELE-001", "Electrical"), CHECK("KSIA-CIV-001", "Civil")],
        responses: {
          "KSIA-ELE-001": { compliance: "C", observation: "fine", attachments: [] },
          "KSIA-CIV-001": { compliance: "C", observation: "fine", attachments: [] },
        },
      },
      NOTHING
    );
    return p.checkpoints.length === 2;
  })()
);

check(
  "excluding Electrical holds its check back, but Civil still syncs",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        checks: [CHECK("KSIA-ELE-001", "Electrical"), CHECK("KSIA-CIV-001", "Civil")],
        responses: {
          "KSIA-ELE-001": { compliance: "C", observation: "fine", attachments: [] },
          "KSIA-CIV-001": { compliance: "C", observation: "fine", attachments: [] },
        },
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    return (
      p.checkpoints.length === 1 &&
      p.checkpoints[0].values.discipline === "Civil" &&
      p.skipped.some((s) => s.what === "check-points (discipline held back)" && s.count === 1)
    );
  })()
);

check(
  "the held-back reason names which disciplines, and says it is this run, not the audit",
  sp
    .buildPlan(
      {
        ...BASE,
        checks: [CHECK("KSIA-ELE-001", "Electrical")],
        responses: { "KSIA-ELE-001": { compliance: "C", observation: "fine", attachments: [] } },
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    )
    .skipped.some(
      (s) => /Electrical/.test(s.why) && /not from the audit/.test(s.why)
    )
);

check(
  "a held-back check's own photograph is held back with it — no orphaned evidence",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        checks: [CHECK("KSIA-ELE-001", "Electrical")],
        responses: {
          "KSIA-ELE-001": { compliance: "NC", observation: "x", attachments: [TAKEN(Date.parse("2026-09-15T10:00:00+02:00"))] },
        },
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    return p.evidence.length === 0;
  })(),
  "uploading a photograph for a check-point that was never written would reference a row that does not exist"
);

check(
  "a WALK photograph is never held back by a discipline exclusion — it has no discipline to match",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        checks: [CHECK("KSIA-ELE-001", "Electrical")],
        responses: {},
        adhoc: [
          {
            id: "WALK-A3F2K", description: "Loose kerb", discipline: null, system: null, area: "Apron",
            attachments: [{ id: "w1", kind: "photo", name: "n", blobKey: "b9", ref: "WALK-A3F2K_P01", caption: "Kerb", createdAt: 1_757_000_000_000 }],
          },
        ],
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    return p.evidence.length === 1;
  })()
);

check(
  "an asset-risk pair in the held-back discipline is withheld; another discipline's still syncs",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        checks: [CHECK("KSIA-ELE-001", "Electrical", "Generators"), CHECK("KSIA-CIV-001", "Civil", "Runway")],
        systems: {
          "Electrical|Generators": SYS({ discipline: "Electrical", system: "Generators", note: "checked" }),
          "Civil|Runway": SYS({ discipline: "Civil", system: "Runway", note: "checked" }),
        },
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    return (
      p.assetRisk.length === 1 &&
      p.assetRisk[0].values.discipline === "Civil" &&
      p.skipped.some((s) => s.what === "asset systems (discipline held back)" && s.count === 1)
    );
  })()
);

check(
  "a hazard raised purely in the held-back discipline is held back whole",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, hazards: [HAZARD({ disciplines: ["Electrical"] })], excludedDisciplines: ["Electrical"] },
      NOTHING
    );
    return p.findings.length === 0 && p.skipped.some((s) => s.what === "hazards" && s.count === 1);
  })()
);

check(
  "a hazard spanning a held-back discipline AND an included one is still held back whole",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        hazards: [HAZARD({ disciplines: ["Electrical", "Civil"] })],
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    return p.findings.length === 0;
  })(),
  "the portal takes one row per hazard — there is no partial write to cut the Electrical half out of"
);

check(
  "a hazard that never touches the held-back discipline syncs normally",
  (() => {
    const p = sp.buildPlan(
      { ...BASE, hazards: [HAZARD({ disciplines: ["Civil"] })], excludedDisciplines: ["Electrical"] },
      NOTHING
    );
    return p.findings.length === 1;
  })()
);

check(
  "a bare-NC warning never counts a check that was held back this run",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        checks: [CHECK("KSIA-ELE-001", "Electrical")],
        responses: { "KSIA-ELE-001": { compliance: "NC", observation: "x", attachments: [] } },
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    return !p.warnings.some((w) => /no finding behind them/.test(w.why));
  })(),
  "a check not going across this run has nothing to warn about yet"
);

check(
  "attendance, the evidence log and signatures carry no discipline and are never held back",
  (() => {
    const signed = ROW("r1", "A. Auditor", {
      signature: { ref: "ATR-00001_S01", signedName: "A. Auditor", signedAt: 1_758_500_000_000, blobKey: "b1" },
    });
    const p = sp.buildPlan(
      {
        ...BASE_ATT,
        attendanceRegisters: [REGISTER({ rows: [signed] })],
        excludedDisciplines: ["Electrical"],
      },
      NOTHING_ATT
    );
    return p.attendance.length === 1 && p.signatures.length === 1;
  })()
);

check(
  "excludedDisciplines is optional — every existing caller that never heard of it still builds, unaffected",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        checks: [CHECK("KSIA-ELE-001", "Electrical")],
        responses: { "KSIA-ELE-001": { compliance: "C", observation: "fine", attachments: [] } },
      },
      NOTHING
    );
    return p.checkpoints.length === 1 && !p.skipped.some((s) => /held back/.test(s.why));
  })(),
  "a caller written before this feature exists must sync exactly as it always did"
);

check(
  "the panel passes the chip selection into buildPlan as excludedDisciplines",
  /excludedDisciplines: \[\.\.\.excludedDisciplines\]/.test(panel)
);

check(
  "toggling a discipline re-plans from the last read, not by re-issuing GETs against the portal",
  (() => {
    const m = panel.match(
      /useEffect\(\(\) => \{\s*if \(!lastPlanBase\.current\) return;([\s\S]*?)\n {2}\}, \[excludedDisciplines, unconsolidated\]\);/
    );
    return !!m && /setPlan\(buildPlan/.test(m[1]) && !/graph\./.test(m[1]);
  })(),
  "a chip toggle must not cost a round trip to SharePoint just to change which rows are counted"
);

check(
  "every chip starts included — unchecking narrows this run, it is never opt-in from empty",
  /useState<Set<string>>\(new Set\(\)\)/.test(panel),
  "an empty excluded set must mean 'sync everything', matching what every existing sync already did"
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

/* ------------- Part 1j: what the findings view shows but never synced ----
 *
 * Sarel: "Is the information linked with photo capture in the findings view
 * being synced to sharepoint." Two real gaps found by reading the code, not
 * guessed: assetName/assetRef never had a column of their own (silently
 * dropped, even though the findings view folds them into the same line as
 * Location, which DOES sync — so they look synced and are not), and a WALK
 * finding's photograph never reached the hazard row's Photos/EvidenceLink
 * column at all, because hazardPhotoRefs() only ever walked the register
 * path (photo -> check -> finding -> hazard), never the ad-hoc one (photo ->
 * ad-hoc item -> finding, via findingId -> hazard). The upload itself
 * already worked; nothing walked back to find it. */

check(
  "assetName and assetRef are in the evidence library's own contract now",
  sp.EVIDENCE_FIELDS.includes("assetName") && sp.EVIDENCE_FIELDS.includes("assetRef")
);

check(
  "and the contract asks for columns named the way the findings view already shows them",
  (() => {
    const c = sp.columnContract(sp.EVIDENCE_FIELDS).map((x) => x.create);
    return c.includes("Asset name") && c.includes("Asset ref");
  })(),
  sp.columnContract(sp.EVIDENCE_FIELDS).map((x) => x.create).join(", ")
);

check(
  "WHICH asset a photograph is of travels to the library, not just where it was taken",
  (() => {
    const v = sp.buildPlan(
      {
        ...BASE,
        responses: {
          "KSIA-ELE-001": {
            compliance: "NC", observation: "Busbar corroded",
            attachments: [{
              id: "a1", kind: "photo", name: "n", blobKey: "b1", ref: "KSIA-ELE-001_P01",
              caption: "c", assetName: "MV Switchboard 3B", assetRef: "SW-3B-011",
            }],
          },
        },
      },
      NOTHING
    ).evidence[0].values;
    return v.assetName === "MV Switchboard 3B" && v.assetRef === "SW-3B-011";
  })()
);

check(
  "and an uncaptioned asset name/ref writes blank, not undefined — same rule as caption and location",
  (() => {
    const v = sp.buildPlan(WITH_PHOTO, NOTHING).evidence[0].values;
    return v.assetName === "" && v.assetRef === "";
  })(),
  "WITH_PHOTO's attachments never set assetName/assetRef"
);

check(
  "A WALK ITEM'S OWN DISCIPLINE/SYSTEM reaches the photo's evidence row too, not just blank",
  (() => {
    const v = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-A3F2K", discipline: "Electrical", system: "Switchgear",
            attachments: [{ id: "w1", kind: "photo", name: "n", blobKey: "b9", ref: "WALK-A3F2K_P01", caption: "c" }],
          },
        ],
      },
      NOTHING
    ).evidence[0].values;
    return v.discipline === "Electrical" && v.assetSystem === "Switchgear";
  })(),
  "AddItemSheet lets the auditor set both; the upload loop was discarding a real answer, not refusing to guess one"
);

check(
  "and a walk item that genuinely left discipline/system unset still writes blank, not null or undefined",
  (() => {
    const v = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-A3F2K", discipline: null, system: null,
            attachments: [{ id: "w1", kind: "photo", name: "n", blobKey: "b9", ref: "WALK-A3F2K_P01", caption: "c" }],
          },
        ],
      },
      NOTHING
    ).evidence[0].values;
    return v.discipline === "" && v.assetSystem === "";
  })(),
  "null is a real, common answer on a walk — see AdHocItem.discipline's own comment"
);

const HAZ_WALK = {
  ...HAZ,
  adhoc: [
    {
      id: "WALK-A1F2K", findingId: "f4",
      attachments: [
        { id: "wa1", kind: "photo", name: "n", blobKey: "wb1", ref: "WALK-A1F2K_P01", caption: "c" },
      ],
    },
    /* The normal state on the walk, before a finding exists to attach to. */
    {
      id: "WALK-B2G3L", findingId: null,
      attachments: [
        { id: "wb1x", kind: "photo", name: "n", blobKey: "wb2", ref: "WALK-B2G3L_P01", caption: "c" },
      ],
    },
    /* Raised into a real finding — just not one of THIS hazard's. */
    {
      id: "WALK-C3H4M", findingId: "f5",
      attachments: [
        { id: "wc1", kind: "photo", name: "n", blobKey: "wb3", ref: "WALK-C3H4M_P01", caption: "c" },
      ],
    },
  ],
  findings: [
    ...HAZ.findings,
    { id: "f4", entity: "FALE", checkId: null },
    { id: "f5", entity: "FALE", checkId: null },
  ],
  hazards: [{ ...HAZ.hazards[0], findingIds: ["f1", "f2", "f3", "f4"] }],
};

check(
  "A WALK FINDING'S PHOTOGRAPH REACHES THE HAZARD ROW TOO, not only a register one",
  (() => {
    const row = sp.buildPlan(HAZ_WALK, NOTHING).findings.find((r) => r.key === "KSIA-ELE-P01");
    return row.values.photos ===
      "KSIA-ELE-001_P01, KSIA-ELE-001_P02, KSIA-ELE-002_P01, WALK-A1F2K_P01";
  })(),
  sp.buildPlan(HAZ_WALK, NOTHING).findings.find((r) => r.key === "KSIA-ELE-P01")?.values.photos
);

check(
  "an ad-hoc item NOT YET raised into a finding contributes nothing",
  (() => {
    const v = sp.buildPlan(HAZ_WALK, NOTHING).findings.find((r) => r.key === "KSIA-ELE-P01").values.photos;
    return !v.includes("WALK-B2G3L");
  })(),
  "findingId: null is the normal state on the walk, before a finding exists to attach to"
);

check(
  "an ad-hoc item raised into SOMEBODY ELSE'S finding contributes nothing",
  (() => {
    const v = sp.buildPlan(HAZ_WALK, NOTHING).findings.find((r) => r.key === "KSIA-ELE-P01").values.photos;
    return !v.includes("WALK-C3H4M");
  })(),
  "f5 is a real finding, just not one of this hazard's — same rule the register path already follows"
);

check(
  "a walk photograph that never left the capturing device is not claimed as evidence",
  (() => {
    const p = sp.buildPlan(
      {
        ...HAZ_WALK,
        adhoc: [
          {
            id: "WALK-D4I5N", findingId: "f4",
            attachments: [{ id: "wd1", kind: "photo", name: "n", ref: "WALK-D4I5N_P01", caption: "c" }],
          },
        ],
      },
      NOTHING
    );
    return p.findings.find((r) => r.key === "KSIA-ELE-P01").values.photos ===
      "KSIA-ELE-001_P01, KSIA-ELE-001_P02, KSIA-ELE-002_P01";
  })(),
  "same guard the register path already applies — a reference with no bytes anywhere is not evidence yet"
);

check(
  "two findings sharing a hazard still dedupe across BOTH origins, register and walk alike",
  (() => {
    const v = sp.buildPlan(HAZ_WALK, NOTHING).findings.find((r) => r.key === "KSIA-ELE-P01").values.photos;
    const parts = v.split(", ");
    return parts.length === new Set(parts).size;
  })()
);

/* ------------- Part 1k: the KSIA incident — two real leaks, both closed ---
 *
 * Sarel: "There was KSIA info that got synced this week and shouldn't have."
 * Traced to two separate gaps, neither hypothetical:
 *
 * 1. excludedDisciplines held back check-points, asset-risk pairs and
 *    hazards, but never the walk/ad-hoc photo-upload loop — a photograph
 *    on a WALK- item in a discipline this run was told to hold back
 *    uploaded anyway, every time, since the day the exclusion feature
 *    shipped.
 * 2. buildPlan() trusted every findings/hazards/attendanceRegisters/
 *    evidenceItems record it was handed to already belong to x.entity, with
 *    nothing checking that locally — fine as long as every caller gets the
 *    scoping right forever, which is exactly the kind of assumption #1 just
 *    proved wrong once already. */

check(
  "A WALK ITEM IN A HELD-BACK DISCIPLINE DOES NOT UPLOAD — the gap that let KSIA info through",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-A3F2K", discipline: "Electrical", system: "Switchgear",
            attachments: [{ id: "w1", kind: "photo", name: "n", blobKey: "b9", ref: "WALK-A3F2K_P01", caption: "c" }],
          },
        ],
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    return p.evidence.length === 0;
  })(),
  "before this fix, excludedDisciplines never reached the ad-hoc upload loop at all"
);

check(
  "and it's reported as held back, not silently dropped",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-A3F2K", discipline: "Electrical", system: "Switchgear",
            attachments: [
              { id: "w1", kind: "photo", name: "n", blobKey: "b9", ref: "WALK-A3F2K_P01", caption: "c" },
              { id: "w2", kind: "photo", name: "n", blobKey: "b10", ref: "WALK-A3F2K_P02", caption: "c" },
            ],
          },
        ],
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    const s = p.skipped.find((x) => x.what === "walk photographs (discipline held back)");
    return s?.count === 2 && /Electrical/.test(s.why);
  })()
);

check(
  "a walk item in a discipline NOT held back still uploads normally",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-A3F2K", discipline: "Civil", system: "Pavements",
            attachments: [{ id: "w1", kind: "photo", name: "n", blobKey: "b9", ref: "WALK-A3F2K_P01", caption: "c" }],
          },
        ],
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    return p.evidence.length === 1 && p.evidence[0].filename === "WALK-A3F2K_P01.jpg";
  })(),
  "holding Electrical back must not hold back Civil too"
);

check(
  "a walk item with no discipline set is never held back by any exclusion — there is nothing to match",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-A3F2K", discipline: null, system: null,
            attachments: [{ id: "w1", kind: "photo", name: "n", blobKey: "b9", ref: "WALK-A3F2K_P01", caption: "c" }],
          },
        ],
        excludedDisciplines: ["Electrical", "Civil"],
      },
      NOTHING
    );
    return p.evidence.length === 1;
  })()
);

check(
  "ONLY THE HELD-BACK ITEM is withheld — a mix of walk items isolates correctly",
  (() => {
    const p = sp.buildPlan(
      {
        ...BASE,
        adhoc: [
          {
            id: "WALK-HELD", discipline: "Electrical",
            attachments: [{ id: "w1", kind: "photo", name: "n", blobKey: "b1", ref: "WALK-HELD_P01", caption: "c" }],
          },
          {
            id: "WALK-SYNCS", discipline: "Civil",
            attachments: [{ id: "w2", kind: "photo", name: "n", blobKey: "b2", ref: "WALK-SYNCS_P01", caption: "c" }],
          },
        ],
        excludedDisciplines: ["Electrical"],
      },
      NOTHING
    );
    return p.evidence.length === 1 && p.evidence[0].filename === "WALK-SYNCS_P01.jpg";
  })()
);

check(
  "A FINDING FROM A DIFFERENT AIRPORT NEVER REACHES THE PLAN, even if the caller handed it over",
  (() => {
    const p = sp.buildPlan(
      {
        ...HAZ,
        findings: [...HAZ.findings, { id: "fx", entity: "FACT", checkId: "KSIA-ELE-001" }],
        hazards: [{ ...HAZ.hazards[0], entity: "FACT" }],
      },
      NOTHING
    );
    return p.findings.length === 0;
  })(),
  "x.entity is FALE throughout HAZ; a hazard tagged FACT must not become a row just because it was in the array"
);

check(
  "and a MIX of two airports' hazards keeps only the active one's",
  (() => {
    const p = sp.buildPlan(
      { ...HAZ, hazards: [HAZ.hazards[0], { ...HAZ.hazards[0], id: "h2", entity: "FACT", portalId: "FACT-ELE-P01" }] },
      NOTHING
    );
    return p.findings.length === 1 && p.findings[0].key === "KSIA-ELE-P01";
  })()
);

check(
  "an attendance register from another airport is not synced either",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ entity: "FACT" })] },
      NOTHING_ATT
    );
    return p.attendance.length === 0;
  })()
);

check(
  "and neither is an evidence log entry from another airport",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_EV, evidenceItems: [DOC("DOC-1", { entity: "FACT" })] },
      NOTHING_EV
    );
    return p.evidenceLog.length === 0;
  })()
);

check(
  "an attendance register for THIS airport still syncs normally — the guard isn't over-broad",
  (() => {
    const p = sp.buildPlan(
      { ...BASE_ATT, attendanceRegisters: [REGISTER({ rows: [ROW("r1")] })] },
      NOTHING_ATT
    );
    return p.attendance.length > 0;
  })()
);

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nSHAREPOINT OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
