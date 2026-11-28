/** TRIAGE SUGGESTIONS — the AI "Clean up wording" engine, in full context.
 *
 *  Sarel, 28 Nov 2026: "the AI cleanup is not smart enough... the findings are
 *  what we observed as an issue in the context of an airport, discipline, asset
 *  system and audit check with a photo... also let it do cleanup of root cause,
 *  impact, timeline, and linking it to audit checks if not linked."
 *
 *  Three jobs live here, all pure so tests can run them without a browser or a
 *  model:
 *
 *    buildTriageContext()  everything known about one finding, as the text the
 *                          model reads (airport, discipline, asset system, the
 *                          linked check or a shortlist, the notes, the photo
 *                          captions, what is already set);
 *    shortlistChecks()     for a finding with no check, the few checks it might
 *                          belong to, so the model chooses from a short list
 *                          rather than from 324;
 *    parseTriage()         the model's JSON, validated against the app's own
 *                          vocabularies. A category the app does not have, a
 *                          check id that was not on the shortlist or a
 *                          timeline nobody defined is dropped, never applied.
 *
 *  The prompt itself is in assistPrompts.ts (the `triage` task). */

import { IMPACT_AREAS, ROOT_CAUSES, TIMELINES } from "./riskVocab";
import { checkRefOf, cleanSpeech } from "./reportText";
import type { Check, Finding } from "./types";

export type Confidence = "high" | "medium" | "low";

export interface TriageSuggestion {
  finding: {
    text: string;
    changed: boolean;
    kind: "observed" | "restates-check" | "too-sparse";
    basis: string;
    extracted: { cause: string; recommendation: string };
    needsAuditor: string[];
  };
  rootCauses: { category: string; reason: string; confidence: Confidence }[];
  rootCauseQuestion: string;
  impactAreas: { area: string; reason: string; confidence: Confidence }[];
  timeline: { value: string; reason: string; confidence: Confidence } | null;
  checkLink: { id: string; reason: string; confidence: Confidence } | null;
  photoNotes: string;
}

/* ------------------------------------------------------- shortlist */

const STOP = new Set(
  "the a an and or of to in on at is are was were be been it its this that with for from by as not no has have had there their near next into over under than then also very quite some many few".split(" ")
);
const tokens = (s: string) =>
  (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w));

/** The checks a finding might belong to, best first. Same discipline and asset
 *  system are searched first; the discipline alone is the fallback when the
 *  system has none. Ranked by shared meaningful words between the finding's
 *  text and the check's requirement, question and area. Capped so the prompt
 *  stays small. */
export function shortlistChecks(
  f: Pick<Finding, "title" | "description" | "discipline" | "system">,
  checks: Check[],
  max = 12
): Check[] {
  const inDiscipline = checks.filter((c) => c.discipline === f.discipline);
  const inSystem = inDiscipline.filter((c) => f.system && c.system === f.system);
  const pool = inSystem.length >= 3 ? inSystem : inDiscipline.length ? inDiscipline : checks;
  const want = new Set(tokens(`${f.title} ${f.description} ${f.system}`));
  return pool
    .map((c) => {
      const have = tokens(`${c.requirement} ${c.question ?? ""} ${c.area} ${c.system} ${c.assetClass ?? ""}`);
      let score = 0;
      for (const w of new Set(have)) if (want.has(w)) score++;
      if (f.system && c.system === f.system) score += 2;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))
    .slice(0, max)
    .map((x) => x.c);
}

/* --------------------------------------------------------- context */

export interface TriageInput {
  airport: string;
  finding: Finding;
  /** The linked check, when there is one. */
  check?: Check;
  /** For an unlinked finding: where to look for a match. */
  allChecks?: Check[];
  /** What the check's own desk observation says, when this visit recorded one. */
  deskNote?: string;
  /** Photograph captions and voice-note transcripts, already gathered. */
  photoCaptions: string[];
  transcripts: string[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildTriageContext(i: TriageInput): { context: string; shortlist: Check[] } {
  const f = i.finding;
  const raw = [f.title, f.description].map((x) => (x ?? "").trim()).filter(Boolean);
  // title and description are often the same words; say them once.
  const text = raw.length === 2 && (raw[0] === raw[1] || raw[1].startsWith(raw[0])) ? [raw[1]] : raw;
  const cleaned = cleanSpeech(text.join(". "));
  const lines: string[] = [
    `Airport: ${i.airport}`,
    `Discipline: ${f.discipline || "not set"}`,
    `Asset system: ${f.system || "not set (a general finding)"}${f.area ? ` · Area: ${f.area}` : ""}`,
    `Recorded as: ${f.findingType === "observation" ? "an observation" : "a non-compliance"}`,
    "",
  ];

  let shortlist: Check[] = [];
  if (i.check) {
    const c = i.check;
    lines.push(`LINKED AUDIT CHECK ${checkRefOf(c.id)}`);
    lines.push(`  Requirement: ${clip(c.requirement, 600)}`);
    if (c.question) lines.push(`  Audit question: ${clip(c.question, 500)}`);
    if (c.target) lines.push(`  Target / threshold: ${clip(c.target, 300)}`);
    if (c.evidenceExpected) lines.push(`  Evidence expected: ${clip(c.evidenceExpected, 300)}`);
    if (i.deskNote?.trim()) lines.push(`  Desk note recorded for this check: ${clip(i.deskNote.trim(), 500)}`);
    lines.push("");
  } else if (i.allChecks?.length) {
    shortlist = shortlistChecks(f, i.allChecks);
    lines.push("NOT LINKED TO AN AUDIT CHECK. Shortlist of checks it might belong to (choose one id, or null):");
    for (const c of shortlist) {
      lines.push(`  - id ${c.id} · ${c.system || "no system"} · ${clip(c.question || c.requirement, 220)}`);
    }
    lines.push("");
  } else {
    lines.push("NOT LINKED TO AN AUDIT CHECK, and no shortlist is available. Leave checkLink null.", "");
  }

  lines.push("WHAT THE AUDITOR RECORDED (verbatim):");
  lines.push(text.length ? text.map((t) => `  ${t}`).join("\n") : "  (nothing)");
  if (cleaned && cleaned !== text.join(". ")) lines.push(`Same text with speech fillers and known typos removed automatically: ${cleaned}`);
  if (i.transcripts.length) {
    lines.push("Voice-note transcripts:");
    for (const t of i.transcripts) lines.push(`  "${clip(t, 500)}"`);
  }
  lines.push(i.photoCaptions.length ? `Photograph captions: ${i.photoCaptions.map((c) => `"${clip(c, 160)}"`).join("; ")}` : "Photograph captions: none.");
  lines.push(`Photographs attached: ${f.attachments.filter((a) => a.kind === "photo").length}`);
  lines.push("");
  lines.push("ALREADY SET (change only where the text clearly contradicts it):");
  lines.push(`  Root cause: ${(f.rootCauseCategories ?? []).join(", ") || "not set"}`);
  lines.push(`  Impact: ${(f.impactAreas ?? []).join(", ") || "not set"}`);
  lines.push(`  Timeline: ${f.timeline || "not set"}`);
  if (f.safetyTag) lines.push("  Tagged by the auditor: Immediate Safety Concern");
  if (f.critical) lines.push("  Tagged by the auditor: Immediate Critical Item");
  return { context: lines.join("\n"), shortlist };
}

/* ---------------------------------------------------------- parser */

function json(raw: string): unknown {
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(body);
  } catch {
    const a = body.indexOf("{");
    const b = body.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(body.slice(a, b + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const conf = (v: unknown): Confidence => (v === "high" || v === "medium" || v === "low" ? v : "low");

/** Validates the model's answer. Throws a sentence a person can read when the
 *  answer is unusable; drops (never applies) any individual suggestion that
 *  falls outside the app's vocabularies. */
export function parseTriage(raw: string, shortlist: Check[], original: string): TriageSuggestion {
  const j = json(raw) as Record<string, unknown> | null;
  if (!j || typeof j !== "object" || !j.finding || typeof j.finding !== "object") {
    throw new Error("The assistant did not answer in the expected shape.");
  }
  const fd = j.finding as Record<string, unknown>;
  const text = str(fd.text) || original;
  const kind = fd.kind === "restates-check" || fd.kind === "too-sparse" ? fd.kind : "observed";
  const ex = (fd.extracted ?? {}) as Record<string, unknown>;

  const rootCauses = (Array.isArray(j.rootCauses) ? j.rootCauses : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => ROOT_CAUSES.includes(str(x.category)))
    .slice(0, 2)
    .map((x) => ({ category: str(x.category), reason: str(x.reason), confidence: conf(x.confidence) }));
  const impactAreas = (Array.isArray(j.impactAreas) ? j.impactAreas : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => IMPACT_AREAS.includes(str(x.area)))
    .slice(0, 3)
    .map((x) => ({ area: str(x.area), reason: str(x.reason), confidence: conf(x.confidence) }));
  const tl = (j.timeline ?? null) as Record<string, unknown> | null;
  const timeline = tl && TIMELINES.includes(str(tl.value)) ? { value: str(tl.value), reason: str(tl.reason), confidence: conf(tl.confidence) } : null;
  const cl = (j.checkLink ?? null) as Record<string, unknown> | null;
  const linkId = cl ? str(cl.id) : "";
  const checkLink = linkId && shortlist.some((c) => c.id === linkId) ? { id: linkId, reason: str(cl?.reason), confidence: conf(cl?.confidence) } : null;

  return {
    finding: {
      text,
      // "changed" is decided here, from the text, not taken on the model's word.
      changed: text.replace(/\s+/g, " ").trim() !== original.replace(/\s+/g, " ").trim(),
      kind,
      basis: str(fd.basis),
      extracted: { cause: str(ex.cause), recommendation: str(ex.recommendation) },
      needsAuditor: (Array.isArray(fd.needsAuditor) ? fd.needsAuditor : []).map(str).filter(Boolean).slice(0, 4),
    },
    rootCauses,
    rootCauseQuestion: str(j.rootCauseQuestion),
    impactAreas,
    timeline,
    checkLink,
    photoNotes: str(j.photoNotes),
  };
}

/** What Accept applies without a second look: the wording, and every other
 *  suggestion at medium or high confidence. Low-confidence suggestions are
 *  shown and left for the reviewer to accept one by one. */
export function patchFor(s: TriageSuggestion, f: Finding, opts: { onlyConfident: boolean }): Partial<Finding> {
  const ok = (c: Confidence) => !opts.onlyConfident || c !== "low";
  const patch: Partial<Finding> = {};
  if (s.finding.changed && s.finding.kind === "observed") {
    patch.description = s.finding.text;
    const t = (f.title ?? "").trim();
    if (!t || t === (f.description ?? "").trim()) patch.title = s.finding.text;
  }
  const rc = s.rootCauses.filter((x) => ok(x.confidence)).map((x) => x.category);
  if (rc.length) patch.rootCauseCategories = Array.from(new Set([...(f.rootCauseCategories ?? []), ...rc]));
  const im = s.impactAreas.filter((x) => ok(x.confidence)).map((x) => x.area);
  if (im.length) patch.impactAreas = Array.from(new Set([...(f.impactAreas ?? []), ...im]));
  if (s.timeline && ok(s.timeline.confidence) && !f.timeline) patch.timeline = s.timeline.value;
  if (s.checkLink && ok(s.checkLink.confidence) && !f.checkId) patch.checkId = s.checkLink.id;
  return patch;
}
