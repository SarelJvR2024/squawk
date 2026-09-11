import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The hazard register.
 *
 *  A findings register answers "what did we see?" and a hazard register answers
 *  "what could happen?". They are not the same list, and the difference is not
 *  cosmetic: rating findings instead of hazards produces a risk profile made of
 *  paperwork. Three findings — no gaseous suppression in a substation, a
 *  fire-detection gap in the same room, an unsigned maintenance record for the
 *  panel in it — score as three medium paperwork risks where there is one red
 *  physical one, and the register that goes to ACSA is wrong in a way that
 *  reads perfectly plausible.
 *
 *  So this suite guards four things:
 *
 *    Consolidation   a finding belongs to at most one hazard, and a group that
 *                    names a finding nobody sent is refused. Both are enforced
 *                    in parseGroups and both are EXECUTED here, not read —
 *                    a double-counted finding is double-counted in every total
 *                    downstream and no regex would catch it.
 *
 *    Proposal only   nothing the assistant returns is applied. A grouping
 *                    becomes a hazard on a tap, and its rating stays unagreed
 *                    until somebody clicks a cell.
 *
 *    One block       the rating and treatment UI is written once. A second copy
 *                    of a risk matrix is how one screen gets a corrected label
 *                    and the other does not.
 *
 *    Likelihood      a photograph shows condition, not occurrence history. The
 *                    re-read prompt says so explicitly, because without it a
 *                    model looks at a rusty panel and pushes the likelihood up,
 *                    which is the wrong reasoning applied to the right
 *                    evidence.
 *
 *  Parts 1-3 run the real parsers out of src/lib/assist.ts. The rest is
 *  source-reading, like risk-matrix.test.mjs and photos.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const types = src("lib", "types.ts");
const store = src("lib", "store.ts");
const assistLib = src("lib", "assist.ts");
const route = src("app", "api", "assist", "route.ts");
const actions = src("components", "RecordActions.tsx");
const hazardsPage = src("app", "(app)", "hazards", "page.tsx");
const findingsPage = src("app", "(app)", "findings", "page.tsx");
const detail = src("components", "CheckDetail.tsx");
const advice = src("components", "HazardAdvice.tsx");
const exportsSrc = src("lib", "exports.ts");
const panel = src("components", "ExportPanel.tsx");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detailText = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detailText ? `  [${detailText}]` : ""}`);
  }
};

/* The real module, type annotations stripped by node. Its only value import is
   react, which resolves from node_modules — so these are the functions the app
   actually runs, not a copy of them. */
const { parseHazards, parseGroups, parseReassessment, consolidateContext, reassessContext } =
  await import(path.join(here, "..", "src", "lib", "assist.ts"));

/* -------------------------------------------- Part 1: parseHazards, executed */

const H_OK = JSON.stringify({
  hazards: [
    { event: "Uncontained fuel release on the apron", description: "d", why: "w", confidence: "high" },
    { event: "Loss of traceability on the hydrant", description: "", why: "", confidence: "nonsense" },
  ],
});
const hz = parseHazards(H_OK);
check("parseHazards reads both events", hz.length === 2, `${hz.length}`);
check("it keeps the event verbatim", hz[0].event === "Uncontained fuel release on the apron");
check(
  "an unrecognised confidence degrades to low, it does not throw and it does not become high",
  hz[1].confidence === "low",
  hz[1].confidence
);
check("prose instead of JSON yields nothing", parseHazards("Sure! Here are some hazards:").length === 0);
check(
  "a fenced block is still read — models wrap JSON despite being told not to",
  parseHazards("```json\n" + H_OK + "\n```").length === 2
);
check("an entry with no event is dropped", parseHazards(JSON.stringify({ hazards: [{ description: "x" }] })).length === 0);
check("a blank event is dropped", parseHazards(JSON.stringify({ hazards: [{ event: "   " }] })).length === 0);
check("at most three come back", parseHazards(JSON.stringify({ hazards: Array.from({ length: 9 }, (_, i) => ({ event: `e${i}` })) })).length === 3);
check(
  "parseHazards never returns a rating — the team agrees that, not the model",
  !Object.keys(hz[0]).some((k) => /severity|likelihood|band|rating/i.test(k)),
  Object.keys(hz[0]).join(",")
);

/* ------------------------------------- Part 2: parseGroups, the counting rule */

const KNOWN = ["F-AAA11", "F-BBB22", "F-CCC33"];
const groups = parseGroups(
  JSON.stringify({
    groups: [
      { event: "Substation fire nobody can suppress", findingIds: ["F-AAA11", "F-BBB22"], note: "n", confidence: "high" },
      /* Claims F-BBB22 again — already spoken for — plus a real one. */
      { event: "Second group", findingIds: ["F-BBB22", "F-CCC33"], confidence: "low" },
      /* Nothing but an id nobody sent. */
      { event: "Third group", findingIds: ["F-ZZZ99"], confidence: "high" },
    ],
  }),
  KNOWN
);
check("groups come back", groups.length === 2, `${groups.length}`);
check("the first group keeps both its findings", groups[0].findingIds.join() === "F-AAA11,F-BBB22");
check(
  "a finding claimed twice is kept in the FIRST group only",
  groups[1].findingIds.join() === "F-CCC33",
  groups[1].findingIds.join()
);
const allIds = groups.flatMap((g) => g.findingIds);
check(
  "no finding appears in two hazards — it would be double-counted in every total",
  new Set(allIds).size === allIds.length
);
check(
  "a group naming only findings nobody sent is refused, not created empty",
  !groups.some((g) => g.event === "Third group")
);
check("an unknown id never survives", !allIds.includes("F-ZZZ99"));
check("the consolidation note survives", groups[0].note === "n");
/* Prose used to yield nothing, and "nothing" quietly meant every finding was
   dropped. Now the model saying something unusable means every finding comes
   back UNGROUPED — which is the honest outcome: consolidation failed, and
   here is everything it failed on. */
const fromProse = parseGroups("I grouped them for you.", KNOWN);
check("prose yields no GROUPING", fromProse.every((g) => !g.event));
check(
  "but every finding still comes back, one per group",
  fromProse.length === KNOWN.length &&
    fromProse.flatMap((g) => g.findingIds).sort().join() === KNOWN.slice().sort().join(),
  "consolidation may be wrong about how things group; it may not lose a finding"
);
check(
  "and each is marked as not grouped rather than left blank",
  fromProse.every((g) => /Not grouped/.test(g.note ?? "")),
  "a reviewer has to see it was not grouped, not that it was not considered"
);

/* The same guarantee on a PARTIAL answer, which is the realistic case. */
const partial = parseGroups(
  JSON.stringify({ groups: [{ event: "One thing", findingIds: ["F-AAA11", "F-BBB22"] }] }),
  KNOWN
);
const placed = partial.flatMap((g) => g.findingIds);
check(
  "NOTHING IS LOST when the model places only some of them",
  placed.length === KNOWN.length && new Set(placed).size === KNOWN.length,
  "a wrongly merged pair HIDES a finding, so an over-long register is the safer error"
);
check(
  "the ones it did place keep their group",
  partial[0].findingIds.join() === "F-AAA11,F-BBB22"
);
check("an empty known-set refuses everything", parseGroups(JSON.stringify({ groups: [{ event: "e", findingIds: ["F-AAA11"] }] }), []).length === 0);
check(
  "parseGroups returns no rating either",
  !Object.keys(groups[0]).some((k) => /severity|likelihood|band/i.test(k))
);

/* ------------------------------------------ Part 3: parseReassessment, and it */

const re = parseReassessment(
  JSON.stringify({
    note: "Nothing seen on site changes this.",
    photographsSeen: ["KSIA-ELE-001_P01", 7],
    ratingComment: "",
    newHazards: [{ event: "Standing water under the panel", why: "w" }, { why: "no event" }],
  })
);
check("a re-read parses", !!re);
check("the note survives", re.note === "Nothing seen on site changes this.");
check("a non-string photograph reference is dropped", re.photographsSeen.join() === "KSIA-ELE-001_P01");
check("a new hazard with no event is dropped", re.newHazards.length === 1, `${re.newHazards.length}`);
check("the new hazard keeps its event", re.newHazards[0].event === "Standing water under the panel");
check("a re-read with no note at all is refused", parseReassessment(JSON.stringify({ photographsSeen: [] })) === null);
check("prose is refused", parseReassessment("It all looked fine.") === null);
check(
  "a re-read carries a COMMENT on the rating, never a rating",
  typeof re.ratingComment === "string" && re.severity === undefined && re.likelihood === undefined
);

/* ------------------------------- Part 4: what the context builders send, run */

const F = (id, over = {}) => ({
  id,
  checkId: null,
  entity: "FALE",
  discipline: "Electrical",
  system: "MV switchgear",
  area: "Terminal",
  title: "t",
  description: `description of ${id}`,
  issueIndex: null,
  severity: null,
  likelihood: null,
  ratingConfirmed: false,
  rootCause: "",
  suggestedEvent: "",
  action: "",
  owner: "",
  dueDate: "",
  actionStatus: "Open",
  originVisit: "2026-09",
  priorRating: null,
  adHoc: false,
  createdBy: "SJvR",
  createdAt: 0,
  ...over,
});

const ctx = consolidateContext([
  { finding: F("F-AAA11"), captions: ["a burnt busbar"] },
  { finding: F("F-BBB22"), captions: [] },
]);
check("the consolidation context names every finding id it expects back", /F-AAA11/.test(ctx) && /F-BBB22/.test(ctx));
check("it tells the model to answer in those ids and no others", /and no others/i.test(ctx));
check("captions are attributed to the finding they belong to", /Photographs on F-AAA11/.test(ctx));
check("a finding with no photographs claims none", !/Photographs on F-BBB22/.test(ctx));

const rctx = reassessContext(
  {
    event: "Substation fire",
    description: "d",
    why: "w",
    severity: null,
    likelihood: null,
    ratingConfirmed: false,
    discipline: "Electrical",
    system: "MV switchgear",
    rootCause: "",
  },
  [F("F-AAA11")],
  []
);
check("an unrated hazard says so rather than sending a blank", /Current rating: none set/.test(rctx));
check("the findings behind it go with it", /F-AAA11/.test(rctx));
check(
  "with no image supplied the model is told to say so, not to describe one",
  /rather than describing photographs you cannot see/i.test(rctx)
);

/* -------------------------------------- Part 5: the model, and what gates it */

check("Hazard is a type of its own, not a flag on Finding", /export interface Hazard \{/.test(types));
check("a hazard names an EVENT", /event: string;/.test(types));
check("it says what control failed", /why: string;/.test(types));
check("it carries the findings behind it", /findingIds: string\[\];/.test(types));
check("its B170 001M rating is gated", /ratingConfirmed: boolean;/.test(types));
check("its ERM rating is gated separately", /ermConfirmed: boolean;/.test(types));
check("a finding carries the event proposed for it", /suggestedEvent: string;/.test(types));

check("the store holds hazards", /hazards: Hazard\[\];/.test(store));
check("hazards are persisted", /\n\s+hazards: s\.hazards,/.test(store));
check("hazard ids are their own namespace", /HZ-\$\{uid\(\)/.test(store));
check("a hazard can be removed, freeing its findings to regroup", /removeHazard:/.test(store));
check("the persist key is untouched", /name: "acsa-assurance-v1"/.test(store));
check("the version was bumped rather than the key renamed", /version: 13,/.test(store));
check(
  "and every bump has a migration",
  [9, 10, 11, 12].every((v) => new RegExp(`if \\(from < ${v}\\)`).test(store))
);
check(
  "a consolidated hazard spans disciplines rather than borrowing the first one's",
  /disciplines: string\[\];/.test(types) && /systems: string\[\];/.test(types),
  "the same missing fuse was PF-02 to Electrical and PF-21 to Process Safety"
);
check(
  "and the register can say who raised it, ACSA included",
  /origin: "consolidated" \| "field" \| "acsa" \| "tpjv";/.test(types),
  "the closing session is where ACSA add what the check-list missed"
);
check(
  "occurrence history has its own field",
  /occurrence: string;/.test(types),
  "four of B170's five likelihood levels are defined by whether it has happened"
);
check(
  "the migration does not invent a hazard from a finding",
  /a finding\s*\n?\s*\*?\s*is not a hazard/i.test(store) || /is not a hazard/.test(store)
);
check("hazards are scoped to entity and visit like everything else", /export function useVisitHazards/.test(store));

/* --------------------------------- Part 6: one rating block, not three copies */

check("RecordActions exists", actions.length > 0);
/* 2026-09-10: the asset-system screen picks severity and likelihood with
   RatingPicker instead — Sarel: "remove the large rating matrix, make it more
   simple to select severity and likelihood". The block itself did not fork: the
   FINDING still renders RecordActions in full, in FindingDetail, which is what
   this assertion has always been about. RatingPicker takes its scales and its
   banding from the same src/lib/risk.ts, so there is still exactly one
   vocabulary for the instrument. */
check(
  "the finding pane renders it",
  /<RecordActions/.test(src("components", "FindingDetail.tsx"))
);
check(
  "and the asset-system screen picks the same scales from the same place",
  /import \{ LIKELIHOODS, LIKELIHOOD_DEF, SEVERITIES, SEVERITY_DEF \} from "@\/lib\/risk";/.test(
    src("components", "RatingPicker.tsx")
  ),
  "a second copy of B170 001M's scales is how two screens come to carry two vocabularies"
);
check("the hazard register renders it", /<RecordActions/.test(hazardsPage));
check(
  "the findings screen no longer carries its own matrix",
  !/SEVERITIES\.map/.test(findingsPage),
  "a second copy of the matrix is back on the findings screen"
);
check(
  "the hazard register does not carry one either",
  !/SEVERITIES\.map/.test(hazardsPage)
);
check(
  "only RecordActions paints the matrix",
  (actions.match(/(^|[^_])SEVERITIES\.map/g) ?? []).length === 2,
  "expected the picker and the definitions list, and nothing else"
);
check(
  "tapping a cell is what agrees the rating, and the only thing that does",
  /ratingConfirmed: true/.test(actions) && !/ratingConfirmed: true/.test(hazardsPage)
);
check(
  "an unagreed rating is drawn as a suggestion, not as a rating",
  /Suggested · click to agree/.test(actions)
);
check("the ERM block sits directly under the B170 001M one", 
  actions.indexOf("showErm &&") > actions.indexOf("Pick a cell to set severity") &&
  actions.indexOf("showErm &&") < actions.indexOf("What the scales mean"));
check("hazards ask for the ERM block and findings do not", /showErm\b/.test(hazardsPage) && !/showErm/.test(findingsPage));
check("RootCauseAdvice is used from the hazard register too", /<RootCauseAdvice/.test(hazardsPage));
/* 2026-09-10: the per-finding pane moved out of findings/page.tsx into
   FindingDetail.tsx when the Findings screen became an asset-system assessment.
   The advice renders in exactly the same place in the same JSX — it is lifted,
   not rewritten — so the assertion follows it to the file it now lives in. */
check(
  "and still from the check screen and the finding pane",
  /<RootCauseAdvice/.test(detail) &&
    /<RootCauseAdvice/.test(
      src("components", "FindingDetail.tsx")
    )
);

/* ------------------------------- Part 7: the prompts, and the rules in them */

check("the route has a hazard task", /\bhazard\b/.test(route) && /hazards":\[\{"event"/.test(route));
check("a consolidate task", /consolidate:/.test(route));
check("a reassess task", /reassess:/.test(route));
check(
  "the hazard prompt says to rate the hazard, not the document",
  /Rate the hazard, not the document/.test(route)
);
check(
  "it refuses to rate — severity and likelihood are the team's",
  /Do not rate it\./.test(route)
);
check(
  "the consolidate prompt puts a finding in at most one group",
  /may appear in at most one group/.test(route)
);
check(
  "it groups by the physical thing, not by discipline or severity",
  /Do not group by discipline, by asset system or by severity/.test(route)
);
check(
  "it uses photographs to test whether two write-ups are one thing",
  /same physical item/.test(route)
);
check(
  "and says so in the note when a photograph is what grouped them",
  /name which photographs/.test(route)
);
check(
  "THE RULE THAT MATTERS: a photograph may not raise a likelihood on its own",
  /may not be used to raise a likelihood on its own/.test(route)
);
check(
  "and the reason is given, so it survives an edit",
  /likelihood on this scale is occurrence history, which a photograph cannot show/.test(route)
);
check(
  "the re-read may raise a new hazard from something visible",
  /raise that as a separate hazard/.test(route)
);
check(
  '"nothing changed" is named as a good answer',
  /is a good answer and often the right one/.test(route)
);

/* ----------------------- Part 8: attribution — which photograph, which finding */

check("images may carry a label", /label\?: string;/.test(route));
check(
  "the label is sent immediately before its image",
  /images\.flatMap/.test(route) && /type: "text" as const, text: i\.label/.test(route)
);
check("a label is length-capped like any other client string", /i\.label\.slice\(0, 200\)/.test(route));
check(
  "the vision gate still drops every image when it is off",
  /THE ENFORCEMENT POINT/.test(route) && /: \[\];/.test(route)
);
check(
  "consolidation labels each image with the finding it belongs to",
  /attached to finding \$\{w\.findingId\}/.test(hazardsPage)
);
check("the client can send a labelled image", /export type AssistImage/.test(assistLib));
check(
  "the image cap is respected on the client too, not left to the route to refuse",
  /IMAGE_CAP/.test(hazardsPage)
);

/* ---------------------------------- Part 9: nothing applied without a tap */

check("a proposal must be accepted", /Accept as a hazard/.test(hazardsPage));
check("and can be dismissed", /Dismiss/.test(hazardsPage));
check(
  "accepting creates the hazard unrated",
  /ratingConfirmed: false/.test(hazardsPage) && !/ratingConfirmed: true/.test(hazardsPage)
);
check(
  "and unrated on ERM too",
  /ermConfirmed: false/.test(hazardsPage) && !/ermConfirmed: true/.test(hazardsPage)
);
check("the re-read is recorded only on a tap", /Record this on the hazard/.test(hazardsPage));
check(
  "a new hazard seen in a photograph is raised on a tap, not automatically",
  /Raise it/.test(hazardsPage)
);
check(
  "the screen says what an unrated hazard counts for",
  /counts nowhere until the group agrees a cell/.test(hazardsPage)
);
check("what leaves the device is stated on screen", /the images themselves are not/.test(hazardsPage));
check(
  "the hazard advice on the check screen only writes suggestedEvent",
  /suggestedEvent: event/.test(detail) && /onAccept/.test(advice)
);
check(
  "and it proposes, it does not rate",
  /severity and\s*\n?\s*likelihood stay/.test(advice) || /stay the audit team/.test(advice)
);

/* -------------------------------------------- Part 10: the export, both ways */

check("there is a Hazards sheet", /export function hazardsSheet/.test(exportsSrc));
check("it is in the full workbook", /hazardsSheet\(x\),/.test(exportsSrc));
check("and available on its own", /kind: "hazards"/.test(panel));
check("the panel passes the hazards through", /\n\s+hazards,/.test(panel));
/* The ERM axis is called IMPACT on every user-facing surface, decided
   9 September 2026. Not Severity — that word is genuinely B170's, and sharing
   it is how the two axes get read as one. Not Consequence either, which is
   cl. 9.2.2's own word and was what this column said until that decision: it
   is accurate but it does not distinguish the two instruments on sight, which
   is the whole job the name has to do here.

   The property this assertion guards has not changed — two instruments, two
   separately named axes, neither borrowing the other's word. Only the word
   chosen for the second one has. The TYPE is still ErmConsequence and is not
   renamed: a type renamed to match a label is churn, and the label is the part
   a person reads. */
check(
  "both instruments have their own columns, named by their own axes",
  /Severity \(B170 001M\)/.test(exportsSrc) &&
    /Impact \(ACSA ERM\)/.test(exportsSrc) &&
    !/Consequence \(ACSA ERM\)/.test(exportsSrc) &&
    /B170 001M rating state/.test(exportsSrc) &&
    /ERM rating state/.test(exportsSrc),
  "B170 has severity and ERM has impact — they are not the same axis"
);
check(
  "an unagreed B170 001M rating goes to its own column, marked",
  /Suggested cell \(not agreed\)/.test(exportsSrc) && /Suggested — not yet agreed/.test(exportsSrc)
);
check("the photographs behind a hazard are indexed", /Photograph files/.test(exportsSrc));
check(
  "a photograph on a check shared by two findings is counted once",
  /const seen = new Set<string>\(\);/.test(exportsSrc) && /function hazardPhotos/.test(exportsSrc)
);
check(
  "the findings sheet says where each finding ended up",
  /Consolidated into/.test(exportsSrc) && /"Not grouped"/.test(exportsSrc)
);
check(
  "the summary counts hazards separately from findings",
  /{ header: "Hazards", width: 9 }/.test(exportsSrc)
);
check(
  "and says why they must not be added together",
  /must never be added together/.test(exportsSrc)
);
check("the cover sheet counts what is not yet consolidated", /Findings not yet consolidated/.test(exportsSrc));

/* -------------------------------------------------- Part 11: getting to it */

check("Hazards is in the navigation", /href: "\/hazards"/.test(shell));
check(
  "its badge counts what is outstanding, not what is done",
  /ungrouped/.test(shell)
);

console.log(`\n${failures === 0 ? "HAZARDS OK" : `${failures} FAILURES`}`);
process.exit(failures ? 1 : 0);
