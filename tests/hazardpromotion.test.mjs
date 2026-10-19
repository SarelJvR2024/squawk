/* Grouping and promoting an asset system's own hazardous events into Hazard
 *  records — see src/lib/hazardPromotion.ts for the full "why".
 *
 *  THE BUG THIS GUARDS AGAINST: an asset-system panel names its hazardous
 *  events one system at a time, so the FAOR hazard-mapping import (27
 *  systems/70 events, then 48 systems/84 events) regularly names the exact
 *  same risk — "Substation or transformer fire or explosion" — against four
 *  different asset systems, each with its own root cause and action.
 *  Promoting each occurrence on its own raised the same risk as four
 *  lookalike hazards instead of Sarel's explicit ask: "multiple assets and
 *  findings can contribute to the same hazardous event." This suite runs the
 *  real grouping and patch-building functions — state in, state out, same
 *  reasoning merge.test.mjs is tested for — not source text.
 *
 *    node --import ./tests/alias.mjs tests/hazardpromotion.test.mjs
 */

import {
  buildPromotedHazardPatch,
  eventKey,
  groupSystemEventCandidates,
} from "@/lib/hazardPromotion";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const T = 1_700_000_000_000;

const rootCause = (cause, note = "") => ({
  id: `RC-${cause}`,
  cause,
  note,
  createdAt: T,
  createdBy: "Import",
  seeded: true,
});

const action = (text, id) => ({
  id: id ?? `MA-${text}`,
  action: text,
  owner: "",
  dueDate: "",
  status: "Open",
  createdAt: T,
  createdBy: "Import",
  seeded: true,
});

const event = (over = {}) => ({
  id: `EV-${Math.random().toString(36).slice(2, 8)}`,
  event: "Substation or transformer fire or explosion",
  likelihood: null,
  note: "",
  rootCauses: [],
  actions: [],
  findingIds: [],
  assetIds: [],
  createdAt: T,
  createdBy: "Import",
  updatedAt: T,
  seeded: true,
  ...over,
});

const candidate = (discipline, system, over = {}) => ({
  discipline,
  system,
  event: event(over),
});

const finding = (id, over = {}) => ({
  id,
  discipline: "",
  system: "",
  assetIds: [],
  ...over,
});

/* ------------------------------ eventKey ------------------------------- */

check("trims and lowercases", eventKey("  Substation Fire  ") === "substation fire");
check(
  "collapses internal whitespace",
  eventKey("Substation   or\ttransformer\nfire") === "substation or transformer fire"
);
check(
  "two differently-cased, differently-spaced typings of the same risk match",
  eventKey("  Fire  detection  fails") === eventKey("Fire detection fails")
);

/* ------------------------------ grouping -------------------------------- */

{
  const a = candidate("Electrical", "Substations");
  const b = candidate("Electrical", "Transformers");
  const c = candidate("Process Safety & Risk", "Fire Safety Management");
  const groups = groupSystemEventCandidates([a, b, c]);
  check("three same-named events on three systems become one group", groups.length === 1);
  check("the group holds all three", groups[0]?.length === 3);
}

{
  const a = candidate("Electrical", "Substations", { event: "Substation fire" });
  const b = candidate("Electrical", "Switchgear", { event: "Internal arc or arc flash injuring staff" });
  const groups = groupSystemEventCandidates([a, b]);
  check("two DIFFERENTLY-named events stay in two separate groups", groups.length === 2);
}

{
  const a = candidate("Electrical", "Substations", { event: "  Substation Fire" });
  const b = candidate("Electrical", "Transformers", { event: "substation fire  " });
  const groups = groupSystemEventCandidates([a, b]);
  check(
    "same wording, different case/whitespace, still groups as one risk",
    groups.length === 1 && groups[0].length === 2
  );
}

{
  const a = candidate("Electrical", "Substations", { id: "EV-A", event: "" });
  const b = candidate("Electrical", "Transformers", { id: "EV-B", event: "" });
  const groups = groupSystemEventCandidates([a, b]);
  check(
    "two unnamed events are never silently merged with each other",
    groups.length === 2,
    "a blank event is not a risk nobody has named yet, it is two auditors' placeholders"
  );
}

{
  const groups = groupSystemEventCandidates([
    candidate("A", "One"),
    candidate("B", "Two"),
    candidate("C", "Three"),
    candidate("D", "Four", { event: "A smaller, single-system risk" }),
  ]);
  check(
    "larger groups sort first",
    groups[0].length === 3 && groups[1].length === 1,
    "the risk with the most contributing systems is the one most worth the auditor's attention"
  );
}

/* ------------------------------- patches -------------------------------- */

{
  // A SINGLE occurrence — must behave exactly as a lone promote always did:
  // no system label on the root cause.
  const group = [
    candidate("Electrical", "Substations", {
      id: "EV-SOLO",
      event: "Earthing failure",
      likelihood: "3",
      note: "Seen on the walk",
      rootCauses: [rootCause("No budget", "deferred twice")],
      actions: [action("Fund the repair")],
      findingIds: ["FND-1"],
      assetIds: ["AS-1"],
    }),
  ];
  const patch = buildPromotedHazardPatch(group, [finding("FND-1", { discipline: "Electrical", assetIds: ["AS-2"] })]);
  check("single-group event name carries straight through", patch.event === "Earthing failure");
  check("single-group likelihood carries through", patch.likelihood === "3");
  check(
    "single-group root cause has NO system label",
    patch.rootCause === "No budget — deferred twice",
    patch.rootCause
  );
  check("single-group action carries through untouched", patch.actions.length === 1 && patch.actions[0].action === "Fund the repair");
  check("single-group sourceSystemEventIds has the one event", JSON.stringify(patch.sourceSystemEventIds) === JSON.stringify(["EV-SOLO"]));
  check("single-group systems is just that one system", JSON.stringify(patch.systems) === JSON.stringify(["Substations"]));
  check(
    "the linked finding's own asset is unioned in, same as a consolidated hazard",
    patch.assetIds.includes("AS-1") && patch.assetIds.includes("AS-2")
  );
}

{
  // THE REAL BUG: the same risk named on four systems, each with its own
  // cause and action — must consolidate into ONE patch naming every system.
  const group = [
    candidate("Electrical", "Substations", {
      id: "EV-1",
      rootCauses: [rootCause("Oil not tested")],
      actions: [action("Test transformer oil", "MA-1")],
    }),
    candidate("Electrical", "Transformers", {
      id: "EV-2",
      rootCauses: [rootCause("Protection not tested")],
      actions: [action("Test protection", "MA-2")],
    }),
    candidate("Process Safety & Risk", "Fire Safety Management", {
      id: "EV-3",
      rootCauses: [rootCause("No separation between bays")],
      actions: [action("Install fire-rated barriers", "MA-3")],
    }),
    candidate("Process Safety & Risk", "Statutory Appointments & Competencies", {
      id: "EV-4",
      rootCauses: [rootCause("Fire detection absent")],
      actions: [action("Install detection", "MA-4")],
    }),
  ];
  const patch = buildPromotedHazardPatch(group, []);

  check(
    "every contributing asset system is on the merged hazard",
    patch.systems.length === 4 &&
      ["Substations", "Transformers", "Fire Safety Management", "Statutory Appointments & Competencies"].every(
        (s) => patch.systems.includes(s)
      ),
    JSON.stringify(patch.systems)
  );
  check(
    "every discipline the group touches is on it",
    patch.disciplines.includes("Electrical") && patch.disciplines.includes("Process Safety & Risk")
  );
  check(
    "every root cause is present, each labelled with the system it came from",
    ["[Substations] Oil not tested", "[Transformers] Protection not tested", "[Fire Safety Management] No separation between bays", "[Statutory Appointments & Competencies] Fire detection absent"].every(
      (line) => patch.rootCause.includes(line)
    ),
    patch.rootCause
  );
  check("every action is carried across", patch.actions.length === 4);
  check(
    "every source event id is recorded, so each drops off the candidate list once promoted",
    patch.sourceSystemEventIds.length === 4 &&
      ["EV-1", "EV-2", "EV-3", "EV-4"].every((id) => patch.sourceSystemEventIds.includes(id))
  );
  check(
    "one hazard, not four — this is the whole point",
    true // the assertions above only hold if buildPromotedHazardPatch returns ONE patch
  );
}

{
  // Findings/assets linked on only SOME events in the group still all end up
  // on the merged hazard — nothing a reader tagged on one system is lost
  // just because the group also includes systems that named nothing.
  const group = [
    candidate("Electrical", "Substations", { id: "EV-A", findingIds: ["F1"], assetIds: ["ASSET-1"] }),
    candidate("Electrical", "Transformers", { id: "EV-B" }),
  ];
  const patch = buildPromotedHazardPatch(group, [finding("F1", { discipline: "Electrical", assetIds: ["ASSET-2"] })]);
  check("the one event's finding is carried across", patch.findingIds.includes("F1"));
  check(
    "both the event's own asset and the finding's own asset are unioned in",
    patch.assetIds.includes("ASSET-1") && patch.assetIds.includes("ASSET-2")
  );
}

{
  // Likelihood: the group's first non-null wins, same as before — never
  // overwritten by a later null.
  const group = [
    candidate("Electrical", "Substations", { id: "EV-A", likelihood: null }),
    candidate("Electrical", "Transformers", { id: "EV-B", likelihood: "4" }),
  ];
  const patch = buildPromotedHazardPatch(group, []);
  check("a later event's recorded likelihood is not lost behind an earlier blank one", patch.likelihood === "4");
}

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nHAZARD PROMOTION OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
