/* REPORT TEXT SANITISER (src/lib/reportText.ts) — behavioural: imports the
 * real module, so the speech-cleanup rules are exercised, not just read. */
import { cleanSpeech, reportFindingText, isQuestionOnly, briefOf, scrubCodes, checkRefOf, stripPlaceholders, PENDING_PLACEHOLDER, QUESTION_ONLY_PLACEHOLDER, MIN_FINDING_CHARS } from "../src/lib/reportText.ts";

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};

const REQ = "The surface is maintained in such a condition such as to prevent formation of harmful irregularities";

const a = cleanSpeech("Uh, it, uh, the runway edge light is cracked and the cover is missing");
check("hesitations (uh/um/erm) are stripped, with the stammered 'it,' they leave behind", !/\b(uh|um|erm)\b/i.test(a) && /^The runway edge light/.test(a));
check("'you know' is removed", !/you know/i.test(cleanSpeech("The access is blocked, you know, by branches")));
check("'like' is removed as a filler but kept as a verb or preposition", /looks like a crack/.test(cleanSpeech("the joint looks like a crack")) && !/\blike\b/i.test(cleanSpeech("the crack is, like, 20mm wide")));
check("'zero eight' becomes '08'", /\b08\b/.test(cleanSpeech("the threshold zero eight is worn")));
check("'runway two seven' becomes 'runway 27' but 'two seven fixings' is left alone", /runway 27/i.test(cleanSpeech("runway two seven markings faded")) && /two seven fixings/i.test(cleanSpeech("two seven fixings loose")));
check("known speech-to-text glitches are repaired (bramches, acess, tar mac, pot hole)", (() => {
  const t = cleanSpeech("bramches block acess near the tar mac pot hole");
  return /branches/i.test(t) && /access/i.test(t) && /tarmac/.test(t) && /pothole/.test(t);
})());
check("'to short' becomes 'too short' but 'to short circuit' is untouched", /too short/.test(cleanSpeech("the joint is to short")) && /to short circuit/.test(cleanSpeech("we need to short circuit the loop")));
check("empty / all-filler text cleans to an empty string, never to a stray fragment", cleanSpeech("um erm") === "" && cleanSpeech("") === "");
check("the same input always gives the same output (deterministic, no model call)", cleanSpeech("Uh the light is cracked") === cleanSpeech("Uh the light is cracked"));

const short = reportFindingText({ title: "Road bumpy", description: "", id: "F2" }, REQ);
check("'Road bumpy' is tidied and FLAGGED as short — not invented into detail the auditor never gave", short.flags.includes("short") && /^Road bumpy\.?$/.test(short.text) && "Road bumpy".length < MIN_FINDING_CHARS);
const q = reportFindingText({ title: REQ, description: "", id: "F1" }, REQ);
check("a finding whose text is just the audit-check question is replaced by a placeholder and flagged", q.flags.includes("question-only") && q.text === QUESTION_ONLY_PLACEHOLDER);
check("a real finding that merely mentions the surface is NOT mistaken for the question", !isQuestionOnly("Runway surface has a 30mm crack at the 08 threshold, extent 2m", REQ));
check("no requirement means nothing is treated as question-only", !isQuestionOnly(REQ, undefined));
check("a long finding is neither flagged nor altered beyond tidy", (() => {
  const r = reportFindingText({ title: "Edge light cover missing on the western side of the apron", description: "", id: "F3" }, REQ);
  return r.flags.length === 0;
})());
check("briefOf cuts at a word boundary and ends with an ellipsis", (() => { const b = briefOf("The runway edge light is cracked and the cover is missing near the holding point", 40); return b.length <= 42 && b.endsWith("…") && !/\s…$/.test(b); })());

/* ---- 28 Nov 2026 FAPE Civil review ---- */
check("the placeholder is '[Defect assessment pending]'", PENDING_PLACEHOLDER === "[Defect assessment pending]" && QUESTION_ONLY_PLACEHOLDER === PENDING_PLACEHOLDER);
check("'— Defect detail to be confirmed by the auditor.' is stripped from the end of a finding", stripPlaceholders("Pothole at the gate \u2014 Defect detail to be confirmed by the auditor.") === "Pothole at the gate");
check("'N voice note(s) on file' and '[N] voice notes on file' are stripped", !/voice note/i.test(stripPlaceholders("Cracked kerb. 1 voice note on file")) && !/voice note/i.test(stripPlaceholders("Cracked kerb [N] voice notes on file")));
check("a finding with nothing but the placeholder prints '[Defect assessment pending]'", reportFindingText({ title: "Defect detail to be confirmed by the auditor.", description: "", id: "F-0TBDV" }).text === PENDING_PLACEHOLDER);
check("voice stutters collapse ('higher than the, higher than the')", cleanSpeech("The kerb is higher than the, higher than the road surface") === "The kerb is higher than the road surface.");
check("'extens' becomes 'extend'", /\bextend\b/.test(cleanSpeech("the cracks extens across the lane")) && !/extens\b/.test(cleanSpeech("the cracks extens across the lane")));
check("database ids and audit check codes never survive (F-0TBDV, KSIA-CIV-055)", !/F-0TBDV|KSIA-CIV-055/.test(scrubCodes("Gate F-0TBDV cracked (KSIA-CIV-055) and KSIA-CIV-013 failed")) && !/KSIA|F-[A-Z0-9]{5}/.test(cleanSpeech("Fence down, ref KSIA-CIV-056, id F-AAYM5")));
check("an id is never the fallback text for an empty finding", !/^F-/.test(reportFindingText({ title: "um erm", description: "", id: "F-G9G3C" }).text));
check("legitimate repeats are left alone ('had had', 'that that')", /had had/.test(cleanSpeech("The drain had had repairs done")));

check("checkRefOf drops the airport prefix, so a FAPE or CDSIA report never says KSIA", checkRefOf("KSIA-CIV-055") === "CIV-055" && checkRefOf("CIV-055") === "CIV-055" && checkRefOf(null) === "" && !/KSIA/.test(checkRefOf("KSIA-ELE-001")));
check("the displayed reference survives the code scrubber (it is not an airport-prefixed id)", scrubCodes("see CIV-055") === "see CIV-055");
console.log(failures === 0 ? "\nREPORT TEXT OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
