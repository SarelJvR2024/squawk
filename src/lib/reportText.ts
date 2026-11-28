/** REPORT TEXT SANITISER — runs on every piece of finding text before it is
 *  printed (Sarel, 27 Nov 2026: "AI wording pre-processor & speech cleanup
 *  before export").
 *
 *  WHAT IT DOES, DETERMINISTICALLY (no model, no network, same input always
 *  gives the same output, so a report can be regenerated and match):
 *    - strips spoken fillers: uh, um, erm, "you know", and "like" where it is
 *      a filler (set off by commas, or opening a sentence), never the verb or
 *      the preposition ("like for like", "looks like a crack" are kept);
 *    - repairs speech-to-text glitches seen in the field notes
 *      ("bramches", "acess", "tar mac", "to short" meaning "too short");
 *    - writes runway designators as numerals ("zero eight" -> "08");
 *    - then applies the same basicTidy the Triage wording review offers
 *      (spacing, contractions, capitals, full stop).
 *
 *  WHAT IT DELIBERATELY DOES NOT DO: invent defect detail. "Road bumpy" is
 *  tidied to "Road bumpy." and FLAGGED as too short; turning it into an
 *  engineering description needs the auditor's facts (location, extent,
 *  cause), which only the AI "Clean up wording" step, with the auditor
 *  approving the result, may propose. A report that quietly rewrote an
 *  audit finding with unverified detail would be worse than a short one.
 *
 *  It also catches a finding whose text is only the audit-check QUESTION
 *  ("The surface is maintained in such a condition..."): that states the
 *  requirement, not what was found, so it is replaced in the report by a
 *  plain "defect detail to be confirmed" line and flagged. */

import { basicTidy } from "./wordDiff";

/** A finding shorter than this many characters is flagged for wording review. */
export const MIN_FINDING_CHARS = 15;

const DIGIT_WORD: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const DIGITS = Object.keys(DIGIT_WORD).join("|");

const GLITCHES: [RegExp, string][] = [
  [/\bbramches\b/gi, "branches"],
  [/\bextens\b/gi, "extend"],
  [/\bacess\b/gi, "access"],
  [/\baccess\s+road\s+way\b/gi, "access roadway"],
  [/\bpot\s+holes\b/gi, "potholes"],
  [/\bpot\s+hole\b/gi, "pothole"],
  [/\btar\s+mac\b/gi, "tarmac"],
  [/\brun\s+way\b/gi, "runway"],
  [/\btaxi\s+way\b/gi, "taxiway"],
  // "to short" meaning "too short", but not "to short-circuit" / "to short list".
  [/\bto short\b(?![-\s]*(?:circuit|list|term|notice))/gi, "too short"],
  [/\bto long\b(?![-\s]*(?:term))/gi, "too long"],
];

function stripFillers(text: string): string {
  let t = text;
  // Whole-word hesitations, with the comma/space they sat in.
  t = t.replace(/(?:^|(?<=[\s,.;]))(?:u+h+m*|u+m+|e+r+m+|e+h+|a+h+m+)(?=[\s,.;]|$)[,\s]*/gi, " ");
  t = t.replace(/[,\s]*\byou know\b[,\s]*/gi, " ");
  // "like" only as a filler: comma-delimited, or opening the text/sentence.
  t = t.replace(/,\s*like\s*,\s*/gi, " ");
  t = t.replace(/(^|[.!?]\s+)like,\s*/gi, "$1");
  t = t.replace(/\s*,\s*like\s+(?=\w)/gi, " ");
  // A stammered opening ("uh, it, uh, the ...") leaves a stray "it," behind.
  t = t.replace(/^\s*it,\s+(?=\w)/i, "");
  return t;
}

function repairGlitches(text: string): string {
  let t = text;
  for (const [re, to] of GLITCHES) t = t.replace(re, to as string);
  // "zero eight" -> "08". Also "runway two seven" -> "runway 27" (digits only
  // after runway/rwy, so "two seven fixings" is left alone).
  t = t.replace(new RegExp(`\\bzero\\s+(${DIGITS})\\b`, "gi"), (_m, d: string) => `0${DIGIT_WORD[d.toLowerCase()]}`);
  t = t.replace(
    new RegExp(`\\b(runway|rwy)\\s+(${DIGITS})\\s+(${DIGITS})\\b`, "gi"),
    (_m, w: string, a: string, b: string) => `${w} ${DIGIT_WORD[a.toLowerCase()]}${DIGIT_WORD[b.toLowerCase()]}`
  );
  return t;
}

/** What a finding prints when the auditor has not yet written what was found. */
export const PENDING_PLACEHOLDER = "[Defect assessment pending]";

/** Internal database ids ("F-0TBDV") and audit check reference codes
 *  ("KSIA-CIV-055") never belong in a report: they mean nothing to the reader
 *  and a check code names the wrong airport on another airport's report. */
const CODE_RES: RegExp[] = [
  /\bF-[A-Z0-9]{5}\b/g,
  /\b[A-Z]{3,5}-[A-Z]{2,5}-\d{2,4}\b/g,
];
export function scrubCodes(text: string): string {
  let t = text;
  for (const re of CODE_RES) t = t.replace(re, "");
  return t.replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}

/** The draft placeholder, audio-metadata tokens and the dash that joined them. */
export function stripPlaceholders(text: string): string {
  return text
    .replace(/\s*[\u2014\u2013-]*\s*Defect detail to be confirmed by the auditor\.?/gi, "")
    .replace(/\s*[\u2014\u2013-]*\s*\b\d+\s+voice\s+notes?\s+on\s+file\b\.?/gi, "")
    .replace(/\s*[\u2014\u2013-]*\s*\[N\]\s+voice\s+notes?\s+on\s+file\b\.?/gi, "")
    .replace(/(?:\s*[\u2014\u2013-])+\s*$/g, "")
    .replace(/^\s*[\u2014\u2013-]+\s*/g, "")
    .trim();
}

/** A stammer: the same 1-4 words said twice in a row ("higher than the, higher
 *  than the"). One word is only collapsed when a comma shows it was a stammer
 *  ("the, the"), so legitimate "had had" and "that that" are left alone. */
function collapseStammers(text: string): string {
  let t = text;
  for (let n = 4; n >= 2; n--) {
    const phrase = `\\b((?:[A-Za-z']+\\s+){${n - 1}}[A-Za-z']+)`;
    t = t.replace(new RegExp(`${phrase}(?:\\s*,\\s*|\\s+)\\1\\b`, "gi"), "$1");
  }
  return t.replace(/\b([A-Za-z']+)\s*,\s*\1\b/gi, "$1");
}

/** Fillers out, glitches repaired, stammers collapsed, codes and draft
 *  placeholders removed, then the standard tidy. */
export function cleanSpeech(raw: string): string {
  if (!raw || !raw.trim()) return "";
  const stripped = stripPlaceholders(scrubCodes(raw));
  const t = collapseStammers(repairGlitches(stripFillers(stripped))).replace(/\s{2,}/g, " ").replace(/^[\s,;.]+/, "").trim();
  return t ? basicTidy(t) : "";
}

const WORD = /[a-z0-9]+/g;
const words = (s: string) => (s.toLowerCase().match(WORD) ?? []);

/** True when `text` is essentially the audit-check question itself. */
export function isQuestionOnly(text: string, requirement: string | undefined): boolean {
  if (!requirement || !text.trim()) return false;
  const a = words(text);
  const b = words(requirement);
  if (a.length < 4 || b.length < 4) return false;
  const setB = new Set(b);
  const overlap = a.filter((w) => setB.has(w)).length / Math.min(a.length, b.length);
  return overlap >= 0.8;
}

export type TextFlag = "short" | "question-only";

export interface ReportText {
  /** What the report prints for the finding. */
  text: string;
  /** What was printed before cleaning, trimmed, for the before/after view. */
  raw: string;
  /** True when cleaning changed the wording. */
  cleaned: boolean;
  flags: TextFlag[];
}

export const QUESTION_ONLY_PLACEHOLDER = PENDING_PLACEHOLDER;

/** One finding's text as the report prints it. `requirement` is the linked
 *  audit check's own wording, when there is one. */
export function reportFindingText(
  f: { title: string; description: string; id: string },
  requirement?: string
): ReportText {
  const raw = (f.title || f.description || "").trim();
  const flags: TextFlag[] = [];
  if (isQuestionOnly(raw, requirement)) {
    flags.push("question-only");
    return { text: QUESTION_ONLY_PLACEHOLDER, raw, cleaned: false, flags };
  }
  const text = cleanSpeech(raw);
  if (text.replace(/[.\s]/g, "").length < MIN_FINDING_CHARS) flags.push("short");
  if (!text) return { text: PENDING_PLACEHOLDER, raw, cleaned: false, flags: [...flags, "short"] };
  return { text, raw, cleaned: text !== raw, flags };
}

/** First sentence-ish chunk, cut at a word boundary, for a figure caption. */
export function briefOf(text: string, max = 70): string {
  const t = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).replace(/[,;:\-\s]+$/, "") + "…";
}
