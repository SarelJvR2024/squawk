import {
  LIKELIHOODS,
  LIKELIHOOD_DEF,
  SEVERITIES,
  SEVERITY_DEF,
} from "@/lib/risk";

/** THE ONE PLACE THE AI-ASSIST FEATURE'S WORDING LIVES — Sarel: "add a
 *  config where the prompts live that informs the AI updates so that
 *  there is easy ways to improve the prompts for more accurate updates."
 *
 *  Everything a model is ever told — the house rules every task shares,
 *  and each task's own instruction — is in this one file. `src/app/api/
 *  assist/route.ts` imports it and does the request handling (auth, the
 *  image cap, the vision gate, talking to the provider); it does not say
 *  anything to the model itself. To make the assistant's answers more
 *  accurate, this is the only file that should need editing — a changed
 *  sentence here reaches every screen that calls that task with no other
 *  code to touch.
 *
 *  KEEP WHEN YOU EDIT A PROMPT:
 *  - Every task still answers in the shape its parser expects
 *    (src/lib/assist.ts's parseCaption/parseHazards/parseGroups/
 *    parseReassessment/parseRootCauses) — a JSON task that stops
 *    returning the fields those functions read breaks silently, as a
 *    refusal the auditor sees, not a crash.
 *  - House rule 1 (SYSTEM, below): a model that cites a clause or a
 *    figure it was not given is the one failure mode this whole feature
 *    cannot absorb — an invented fact in an audit record. Loosening that
 *    rule for one task loosens it for all of them, since SYSTEM is
 *    shared.
 *  - The B170 001M severity/likelihood wording is GENERATED from
 *    src/lib/risk.ts below, never typed by hand — see B170_SCALES's own
 *    comment for the real incident that rule exists to stop repeating,
 *    and tests/risk-matrix.test.mjs for the suite that proves it still
 *    does.
 *
 *  Run `node tests/risk-matrix.test.mjs`, `node tests/hazards.test.mjs`,
 *  `node tests/photos.test.mjs` and `node --import ./tests/alias.mjs
 *  tests/voice.test.mjs` after any edit here — between them they pin
 *  down specific wording in several of these prompts, by design, so a
 *  prompt drifting away from what this file's own header asks for is
 *  caught rather than merely noticed later in a worse answer. */

export type Task =
  | "observation"      // turn tapped chips into one clean observation
  | "combine"          // merge observation + evidence + findings into one comment
  | "finding"          // tidy a finding into one audit-grade sentence
  | "explain"          // plain-English reading of what this check requires
  | "rating"           // an opinion on severity and likelihood, with reasons
  | "narrative"        // draft the discipline section of the report
  | "transcript"       // turn a spoken note into the written answer
  | "caption"          // describe one photograph, factually
  | "rootcause"        // candidate root causes, and the question to ask instead
  | "hazard"           // what event does this finding expose
  | "consolidate"      // group findings that describe one physical thing
  | "reassess"         // re-read a hazard after the walkthrough
  | "polish";          // rewrite an existing note/caption, technical and grammatical

/** How hard the model is asked to think, per task.
 *
 *  Opus 5 thinks by default — omitting `thinking` runs it adaptively — and
 *  effort is the lever that decides how much. The split is by what the task
 *  actually is: turning tapped chips into a sentence is wording, and wording
 *  does not repay deliberation. Naming the hazard a finding exposes, or the
 *  root cause behind it, is judgement, and that is the whole reason a model is
 *  in this app at all.
 *
 *  Nothing here is agreed by the model either way. Every one of these is a
 *  proposal an auditor accepts, edits or ignores. */
export const JUDGEMENT: Task[] = ["rating", "rootcause", "hazard", "consolidate", "reassess"];

/** The B170 001M scales, BUILT FROM src/lib/risk.ts rather than restated here.
 *
 *  This exists because restating them was a live defect. The prompt used to
 *  read "severity A (Catastrophic) to E (Minor), likelihood 1 (Not likely) to
 *  5 (Expected)", and both halves were wrong:
 *
 *    · E is NEGLIGIBLE. Minor is D. The bottom of the scale was named one
 *      notch too high.
 *    · "Not likely to Expected" is a GENERIC probability scale. B170 001M's
 *      likelihood is occurrence history — Extremely Improbable, Improbable,
 *      Remote, Occasional, Frequent — and its level 3 means "unlikely but
 *      could possibly occur", where the generic reading of level 3 is
 *      "Likely". The opposite.
 *
 *  Every rating opinion the assistant has ever given was formed against that.
 *  The same inversion had already been caught once inside risk.ts, and
 *  tests/risk-matrix.test.mjs was written to stop it returning — but the wrong
 *  words were in a DIFFERENT FILE from the matrix, so the suite guarding the
 *  matrix could not see them.
 *
 *  Restating a scale is the bug. So this is generated: there is now one source
 *  of these words, and a prompt that disagrees with the matrix is not
 *  expressible. tests/risk-matrix.test.mjs asserts this file derives rather
 *  than restates. */
export const B170_SCALES = [
  "Severity, verbatim from cl. 4.3.1 — use these letters and these meanings, not a generic scale:",
  ...SEVERITIES.map(
    (s) => `  ${s} — ${SEVERITY_DEF[s.charAt(0)].consequence}`
  ),
  "",
  "Likelihood, verbatim from cl. 4.3.2. NOTE: this axis is OCCURRENCE HISTORY, not probability. Level 3 means \"unlikely but could possibly occur\", NOT \"likely\":",
  ...LIKELIHOODS.map((l) => {
    const d = LIKELIHOOD_DEF[l.charAt(0)];
    return `  ${l}${d.gloss ? ` (${d.gloss})` : ""} — ${d.meaning}`;
  }),
  "",
  "Cells are written likelihood-first: 3A is likelihood 3, severity A.",
].join("\n");

/** The system prompt every task shares. House rule 1 is the whole feature's
 *  safety property — see this file's own header. */
export const SYSTEM = `You are assisting a Thabile-Pridin JV auditor during an Airports Company South Africa asset assurance audit at a South African airport.

House rules, in order of importance:
1. Never invent a fact, a figure, a date, an interval, a clause number or an ACSA document number. Work only from the text you are given. If the text does not settle something, say plainly that it does not.
2. Where ACSA states no threshold, that absence is itself the audit point. Say so; do not fill the gap with an industry norm.
3. Write as an auditor writes: third person, past tense, factual, specific, no adjectives of praise or blame. "The register was produced but three of eleven entries were unsigned" — not "poor record keeping was evident".
4. South African context: the OHS Act 85 of 1993 and its regulations, SANS standards, SACAA Part 139, ICAO Annex 14 and Doc 9137, DoEL and ECSA registration. British spelling.
5. You advise. The auditor decides. Never state a rating as settled, and never imply an action has been agreed.
6. Be brief. An observation is one to three sentences. A finding is one sentence.
7. Photographs are evidence, not proof of the auditor's conclusion. Describe only what is visible. Do not infer a maintenance history, a date, a rating or a cause from an image. Where the image is unclear, say so rather than guessing — "the plate is not legible in this photograph" is a useful answer.`;

/** Every task's own instruction, keyed by Task — see this file's own header
 *  for what to keep in mind when editing one. */
export const TASK_PROMPT: Record<Task, string> = {
  observation:
    "Compose the observation for this check from the material below. One to three sentences, ready to paste into the audit record. Return the observation text alone, with no preamble, heading or quotation marks.",
  combine:
    "Below is up to three sources captured against one check: the audit observation, what the evidence itself proves, and any findings raised. They are labelled. Merge whichever of the three are present into one comment for the register's combined-comment column.\n\nRules:\n- Work only from the sources supplied. A source labelled as not captured is not captured — do not guess at it, do not mention that it is missing, and do not pad the comment to make up for it. A check with one source gets a comment built from that one source.\n- Do not repeat the same fact twice because two sources both said it. Say it once.\n- Where two sources disagree (the observation says compliant, a finding says otherwise), keep both positions rather than silently picking one — an auditor reading the merged comment has to be able to see the disagreement, not have it resolved for them.\n- Findings are stated as what was found, not as instructions to fix it.\n- Three to six sentences, factual, third person, past tense. No heading, no bullet points, no preamble.\nReturn the comment text alone.",
  finding:
    "Rewrite the finding below as a single audit-grade sentence stating what was found — not what should happen next. Return the sentence alone.",
  explain:
    "Explain what this check requires, in plain English, for an auditor who has not read the underlying procedure. Cover: what ACSA's own documents demand, what the acceptance threshold is (or say clearly that ACSA states none), and what 'good' looks like on the day. Four sentences at most.",
  rating:
    `Give your opinion on how this finding rates on ACSA's B170 001M matrix.\n\n${B170_SCALES}\n\nAnswer in this shape and nothing else:\nSeverity: <letter> — <five words>\nLikelihood: <number> — <five words>\nWhy: <one sentence>\nThe audit team rates as a group and may well disagree with you; frame it as a view, not a verdict.`,
  transcript:
    "Below is a verbatim transcript of a voice note an auditor dictated at the asset, followed by the check it was recorded against. Spoken notes ramble, restart, switch between English and Afrikaans mid-sentence, and carry filler. Rewrite it as the written observation for this check.\n\nRules for this task specifically:\n- Carry across every fact, number, unit, quantity, location and item the auditor said, exactly as said. A number is the whole value of this record; changing 40mm to 40cm, or dropping one of three items, is the worst thing you can do here.\n- Where the auditor spoke Afrikaans, write the observation in English, but keep any proper noun, plant name, equipment tag or ACSA document reference in the form they said it.\n- Drop the filler, the false starts, the asides to other people and anything said about the recording itself.\n- Do not add a fact the auditor did not say, do not resolve something they left uncertain, and do not soften or sharpen their judgement. If they said they were unsure, the observation says so.\n- If the note is too garbled or too sparse to make an observation from, say exactly that in one sentence instead of inventing one.\nReturn the observation text alone, with no preamble, heading or quotation marks.",
  caption:
    'Describe the photograph supplied, for an audit record. One line, under 25 words, factual, naming what is shown and its visible condition. No judgement, no cause, no rating, no date. If something an auditor would want — a serial plate, a gauge reading, a label — is present but cannot be made out, say so in `note` rather than guessing at it.\nReturn JSON and nothing else:\n{"caption":"<the line>","legible":<true if the subject is clear enough to describe usefully, else false>,"note":"<what could not be made out, or an empty string>"}',
  rootcause:
    'Propose the root causes that could explain the finding below.\n\nA root cause is something the responsible person knows and the auditor does not. Your real job here is to sharpen the QUESTION, not to answer it — `askInstead` is the most valuable field you will write, and a candidate with a good question and low confidence is worth more than a confident guess.\n\nRules:\n- Two to four candidates, ranked most likely first.\n- `cause` MUST be exactly one of the categories listed in the context under "Root-cause categories". Do not invent one, do not reword one.\n- `reasoning` is one sentence and must tie to something actually in the evidence. If the evidence does not support a cause, do not offer it.\n- `confidence` is high only where the evidence itself settles it, which is rare at this stage.\n- `askInstead` is the question to put to the responsible person that would confirm or kill this cause. Leave it empty only when the evidence already settles the matter.\nReturn JSON and nothing else:\n{"candidates":[{"cause":"<category>","reasoning":"<one sentence>","confidence":"<high|medium|low>","askInstead":"<question, or empty>"}]}',
  hazard:
    'Name the hazard the finding below exposes.\n\nRate the hazard, not the document. A missing maintenance record is not itself the risk — the risk is the event the maintenance was preventing, and that is what an audit rates. "Register not signed" is a finding; "loss of traceability on a fuel hydrant nobody can prove was serviced" is a hazard.\n\nRules:\n- One to three hazards, most significant first. Most findings expose one.\n- `event` is under 15 words and names an EVENT, not a document, a process or a state of paperwork.\n- `why` names the control that failed and what it was protecting against.\n- Do not rate it. Severity and likelihood are the audit team\'s to agree.\n- Where the finding does not support naming an event, say so in `why` and give `confidence` low rather than reaching.\nReturn JSON and nothing else:\n{"hazards":[{"event":"<under 15 words>","description":"<one or two sentences>","why":"<what control failed and what it was protecting against>","confidence":"<high|medium|low>"}]}',
  consolidate:
    'Below are findings from one audit. Group the ones that describe the SAME physical thing or the same exposure into hazards.\n\nDifferent disciplines write the same defect up in their own language: Electrical records a substation with no gaseous suppression, Process Safety records a fire-detection gap in the same room, and it is one hazard with two findings behind it. That is what this is for.\n\nWhere photographs are supplied, use them to test whether two findings describe the same physical item. Two write-ups in different disciplines\' language frequently show the same defect. Say in the note when a photograph is what made you group them, and name which photographs.\n\nRules:\n- A finding may appear in at most one group. Leave a finding out entirely rather than forcing it.\n- Do not group by discipline, by asset system or by severity. Group by the physical thing or the exposure.\n- A group of one is legitimate where a finding is its own hazard.\n- `event` is under 15 words and names the event, not the paperwork.\n- Do not rate anything.\nReturn JSON and nothing else:\n{"groups":[{"event":"<under 15 words>","description":"<one or two sentences>","why":"<what control failed and what it was protecting against>","findingIds":["F-XXXXX"],"note":"<why these belong together; name the photographs if a photograph is what showed it>","confidence":"<high|medium|low>"}]}',
  reassess:
    'Re-read the hazard below after the site walkthrough. Photographs from the walkthrough are supplied where the deployment sends them.\n\nDescribe only what is visible. A photograph may reveal a condition nobody wrote up — raise that as a separate hazard. It may not be used to raise a likelihood on its own: likelihood on this scale is occurrence history, which a photograph cannot show.\n\nThat last rule matters. A rusty panel in a photograph tells you about condition, not about how often the event has occurred, and moving likelihood on the strength of an image is the wrong reasoning applied to the right evidence.\n\nRules:\n- Say what the walkthrough changed, if anything. "Nothing seen on site changes this" is a good answer and often the right one.\n- `newHazards` is for conditions visible in the photographs that no finding covers. Empty is normal.\n- Do not agree a rating. Where you think the rating should move, say so in `ratingComment` as a view, with the reason, and leave it to the team.\n- Name which photographs you are describing.\nReturn JSON and nothing else:\n{"note":"<what the walkthrough did or did not change>","photographsSeen":["<file or reference>"],"ratingComment":"<a view on the rating and why, or empty>","newHazards":[{"event":"<under 15 words>","why":"<what it exposes>"}]}',
  narrative:
    "Draft the narrative for this discipline's section of the audit report from the captured material below. Lead with the overall position, then what was found, then what remains open. Do not list every check. No headings, no bullet points, three paragraphs at most.",
  polish:
    "Rewrite the note below for the formal audit record. It was typed quickly on site and needs to read as a finished, technical entry in a compliance audit — not a redraft of what happened, a cleaner statement of the same thing.\n\nRules for this task specifically:\n- Carry across every fact, measurement, location, quantity and item named below, exactly as given. Changing or dropping one is the worst thing you can do here.\n- Fix grammar, spelling and sentence structure only. Do not add a finding, a cause, a severity or an opinion the original text does not contain.\n- Name the asset system given below explicitly in the rewrite, where it reads naturally — a reader of this one entry, outside of its original context, should be able to tell what it is about.\n- Where the material below names a specific ACSA document, drawing, procedure or clause number, keep it verbatim. Do NOT invent, guess at or supply a clause, standard or document reference that is not already given to you — see house rule 1.\n- If the material plainly describes a defect, non-conformance or deficiency, the rewrite may use the word 'non-compliant' or 'non-conforming' once, factually, if it is not already implied by the register's own compliance marking — never invent the underlying fact to justify using it.\n- If the text given is already a short fragment (a caption rather than a full observation), keep the rewrite to one line of the same kind — do not expand a caption into paragraphs.\n- If the text is too sparse or unclear to rewrite without guessing, return it unchanged rather than inventing detail.\nReturn the rewritten text alone, with no preamble, heading or quotation marks.",
};
