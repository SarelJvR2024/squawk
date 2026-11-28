/* AI TRIAGE (src/lib/triageSuggest.ts + the `triage` prompt) — behavioural.
 * The model is not called here: this proves what we SEND (context), what we
 * ACCEPT back (the parser rejects anything outside the app's vocabularies) and
 * what Accept all APPLIES. The live model is exercised by the eval in
 * docs/ai-triage-eval.md. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTriageContext, parseTriage, patchFor, shortlistChecks } from "../src/lib/triageSuggest.ts";

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};
const here = path.dirname(fileURLToPath(import.meta.url));
const prompts = fs.readFileSync(path.join(here, "..", "src", "lib", "assistPrompts.ts"), "utf8");
const table = fs.readFileSync(path.join(here, "..", "src", "components", "ReviewRiskTable.tsx"), "utf8");
const ui = fs.readFileSync(path.join(here, "..", "src", "components", "TriageSuggestions.tsx"), "utf8");
const panel = fs.readFileSync(path.join(here, "..", "src", "components", "ReviewRiskPanel.tsx"), "utf8");

const mkCheck = (id, discipline, system, requirement, question = null) => ({ id, discipline, system, area: system, assetClass: null, requirement, question, target: null, evidenceExpected: null });
const CHECKS = [
  mkCheck("KSIA-CIV-055", "Civil", "Concrete Structures", "Concrete surfaces shall be free of spalling, cracking and exposed reinforcement", "Assess surface condition of concrete"),
  mkCheck("KSIA-CIV-013", "Civil", "Fencing", "Perimeter and security fencing shall be intact and free of corrosion", "Is the fence intact?"),
  mkCheck("KSIA-CIV-019", "Civil", "Roofing", "Roof drainage shall be clear and roofs free of ponding water", "Is the roof draining?"),
  mkCheck("KSIA-CIV-021", "Civil", "Roofing", "Roof edge protection shall be in place", null),
  mkCheck("KSIA-ELE-001", "Electrical", "AGL", "All electricians shall be trained", null),
];
const F = (o = {}) => ({
  id: "F-X1", title: "", description: "", discipline: "Civil", system: "Roofing", area: "", checkId: null, findingType: "non-compliance",
  attachments: [], rootCauseCategories: [], impactAreas: [], originVisit: "v", ...o,
});

/* ---- shortlist ---- */
const sl = shortlistChecks(F({ description: "Water ponding on roof" }), CHECKS);
check("the shortlist is limited to the finding's discipline and ranks the roof-drainage check first", sl.every((c) => c.discipline === "Civil") && sl[0].id === "KSIA-CIV-019");
check("a finding in a system with few checks still gets the discipline's checks to choose from", shortlistChecks(F({ system: "Drainage", description: "blocked channel" }), CHECKS).length >= 3);
check("the shortlist is capped", shortlistChecks(F(), Array.from({ length: 40 }, (_, i) => mkCheck(`KSIA-CIV-${100 + i}`, "Civil", "Roofing", "x")), 12).length === 12);

/* ---- context ---- */
const linked = buildTriageContext({ airport: "Chief Dawid Stuurman International Airport", finding: F({ description: "Fence leaning", system: "Fencing", checkId: "KSIA-CIV-013" }), check: CHECKS[1], photoCaptions: ["Fence leaning towards the walkway"], transcripts: [] });
check("the context names the airport, discipline, asset system and the linked check's requirement and question", /Chief Dawid Stuurman/.test(linked.context) && /Discipline: Civil/.test(linked.context) && /Asset system: Fencing/.test(linked.context) && /Is the fence intact\?/.test(linked.context) && /CIV-013/.test(linked.context));
check("the airport prefix of a check id never reaches the model", !/KSIA/.test(linked.context));
check("photo captions and the photo count go in", /Fence leaning towards the walkway/.test(linked.context) && /Photographs attached: 0/.test(linked.context));
const unlinked = buildTriageContext({ airport: "X", finding: F({ description: "Water ponding on roof" }), allChecks: CHECKS, photoCaptions: [], transcripts: [] });
check("an unlinked finding gets a shortlist with exact ids, and says it is not linked", /NOT LINKED TO AN AUDIT CHECK/.test(unlinked.context) && /id KSIA-CIV-019/.test(unlinked.context) && unlinked.shortlist.length > 0);
check("speech fillers are also removed automatically and shown beside the verbatim text", /Uh, it, uh/.test(buildTriageContext({ airport: "X", finding: F({ description: "Uh, it, uh, is not working" }), photoCaptions: [], transcripts: [] }).context) && /removed automatically/.test(buildTriageContext({ airport: "X", finding: F({ description: "Uh, it, uh, is not working" }), photoCaptions: [], transcripts: [] }).context));
check("what is already set is passed so the model changes it only when the text contradicts it", /Timeline: Immediate/.test(buildTriageContext({ airport: "X", finding: F({ description: "x", timeline: "Immediate" }), photoCaptions: [], transcripts: [] }).context));

/* ---- parser ---- */
const good = JSON.stringify({
  finding: { text: "Water was ponding on the roof.", changed: true, kind: "observed", basis: "the note", extracted: { cause: "", recommendation: "" }, needsAuditor: [] },
  rootCauses: [{ category: "Maintenance backlog", reason: "drain not cleared", confidence: "medium" }, { category: "Invented cause", reason: "x", confidence: "high" }],
  rootCauseQuestion: "",
  impactAreas: [{ area: "Operations", reason: "r", confidence: "low" }, { area: "Made up", reason: "r", confidence: "high" }],
  timeline: { value: "Long term", reason: "r", confidence: "medium" },
  checkLink: { id: "KSIA-CIV-019", reason: "ponding", confidence: "high" },
  photoNotes: "",
});
const t = parseTriage(good, sl, "Water ponding on roof");
check("a root cause or impact outside the app's lists is dropped, never applied", t.rootCauses.length === 1 && t.rootCauses[0].category === "Maintenance backlog" && t.impactAreas.length === 1 && t.impactAreas[0].area === "Operations");
check("a check id that was not on the shortlist is dropped", parseTriage(good.replace("KSIA-CIV-019", "KSIA-CIV-999"), sl, "x").checkLink === null && t.checkLink?.id === "KSIA-CIV-019");
check("a timeline outside the three values is dropped", parseTriage(good.replace("Long term", "Soonish"), sl, "x").timeline === null);
check("'changed' is decided from the text, not taken on the model's word", parseTriage(good.replace("Water was ponding on the roof.", "Water ponding on roof"), sl, "Water ponding on roof").finding.changed === false);
check("JSON wrapped in a code fence or prose is still read", parseTriage("Here you go:\n```json\n" + good + "\n```", sl, "x").timeline?.value === "Long term");
check("an answer that is not the expected shape is refused with a readable sentence", (() => { try { parseTriage("I think this is fine.", sl, "x"); return false; } catch (e) { return /expected shape/.test(e.message); } })());

/* ---- patch (what Accept applies) ---- */
const f = F({ description: "Water ponding on roof", title: "Water ponding on roof" });
const all = patchFor(t, f, { onlyConfident: true });
check("Accept all applies the wording (also to an identical title), medium+ suggestions and a confident check link; it skips the low-confidence impact", all.description === "Water was ponding on the roof." && all.title === all.description && all.rootCauseCategories?.[0] === "Maintenance backlog" && !all.impactAreas && all.timeline === "Long term" && all.checkId === "KSIA-CIV-019");
check("a timeline already set is not overwritten by Accept all", patchFor(t, F({ description: "x", timeline: "Immediate" }), { onlyConfident: true }).timeline === undefined);
check("a restates-check finding never has its wording replaced", patchFor({ ...t, finding: { ...t.finding, kind: "restates-check" } }, f, { onlyConfident: true }).description === undefined);
check("existing root causes are kept when one is added", patchFor(t, F({ description: "x", rootCauseCategories: ["Other"] }), { onlyConfident: true }).rootCauseCategories.join() === "Other,Maintenance backlog");

/* ---- the prompt ---- */
check("the triage prompt is built from the app's own vocabularies, not typed twice", /ROOT_CAUSES/.test(prompts) && /IMPACT_AREAS/.test(prompts) && /TIMELINES/.test(prompts) && /triage: TRIAGE_PROMPT/.test(prompts));
check("the prompt tells the model what a finding is, to leave a check-question alone, to prefer null to a weak check match, and not to invent facts", /restates-check/.test(prompts) && /Prefer null with a reason to a weak match/.test(prompts) && /Never invent a fact|never invent a fact/.test(prompts) && /Making a good finding longer or more formal is a failure/.test(prompts));
check("the triage task thinks at 'medium' effort like the other judgement tasks", /export const JUDGEMENT: Task\[\] = \[\s*"triage"/.test(prompts));

/* ---- wiring ---- */
check("the bulk bar uses the triage engine with the airport's check list, and the old wording-only component is gone", /<BulkTriageSuggest/.test(table) && /allChecks=\{allChecks\}/.test(table) && !/function BulkSuggestWording/.test(table));
check("the review card has per-field Apply for root cause, impact, timeline and check link, and Accept all applies only confident suggestions", /label="Root cause"/.test(ui) && /label="Impact"/.test(ui) && /label="Timeline"/.test(ui) && /label="Audit check"/.test(ui) && /onlyConfident: true/.test(ui));
check("photographs go to the model only when the deployment sends them (vision on); otherwise the captions carry", /vision \? await photoImages/.test(ui));
check("the single-finding panel button uses the same engine", /assist\("triage"/.test(panel) && !/assist\(\s*"polish"/.test(panel));

console.log(failures === 0 ? "\nAI TRIAGE OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
