"use client";

import { useEffect, useState } from "react";
import type { AnswerLibrary, Check, Finding, Response } from "./types";

/* Two layers, and the order matters.

   The composer below needs no model at all: it turns what the auditor has
   already tapped into a readable observation, deterministically, offline, on
   the tablet. That is the everyday path and it must never depend on a network.

   The assist layer on top of it asks a model to do the things a rule cannot —
   read a procedure back in plain English, offer a view on a rating, draft a
   report narrative. It is optional. If no model is configured the affordances
   simply do not appear, and nothing about the audit changes. */

/* ---------------------------------------------------------------- composer */

const STATUS_OPENER: Record<string, string> = {
  C: "The requirement was met.",
  NC: "The requirement was not met.",
  NA: "The requirement does not apply at this site.",
  NV: "The position could not be verified during the audit.",
};

/** Build an observation from what has been tapped. No model, no network. */
export function composeObservation(
  check: Check,
  r: Response,
  lib: AnswerLibrary | null
): string {
  const parts: string[] = [];
  if (r.compliance && STATUS_OPENER[r.compliance]) parts.push(STATUS_OPENER[r.compliance]);

  if (lib && r.evidencePicked.length) {
    const names = r.evidencePicked.map((i) => lib.EO[i]?.label).filter(Boolean);
    if (names.length) parts.push(`Evidence requested: ${list(names)}.`);
  }
  if (lib && r.issuesPicked.length) {
    const found = r.issuesPicked.map((i) => lib.IO[i]?.finding).filter(Boolean) as string[];
    parts.push(...found);
  }
  if (lib && r.walkaboutPicked !== null && lib.WO[r.walkaboutPicked]) {
    parts.push(`On the walkabout: ${lower(lib.WO[r.walkaboutPicked].label)}.`);
  }
  if (check.siteVariant?.conflict) {
    /* The composed observation is a sentence that goes into a client
       deliverable, so it names the standard actually applied. "Assessed
       against the site-specific threshold" is true and useless in a report
       somebody reads a year later. */
    parts.push(
      `Assessed against ${check.siteVariant.site}'s requirement (${check.siteVariant.conflict.siteRequires}, ${check.siteVariant.conflict.source}), which differs from the register's own wording.`
    );
  } else if (check.siteVariant) {
    parts.push(`Assessed against the ${check.siteVariant.site} site-specific threshold.`);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function list(xs: string[]): string {
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/* ------------------------------------------------------------------ assist */

export type AssistTask =
  | "observation"
  | "finding"
  | "explain"
  | "rating"
  | "narrative"
  | "transcript"
  | "caption"
  | "rootcause"
  | "hazard"
  | "consolidate"
  | "reassess";

/* One probe per endpoint per page load, shared by every component that asks.
   Each of these is a separate deployment decision — a site may have a model and
   no transcription, or the other way round — so they are asked separately and
   neither implies the other. */
const availability: Record<string, boolean | null> = {};
const probes: Record<string, Promise<boolean> | undefined> = {};

function useServiceAvailable(path: string): boolean {
  /* The cached answer is read in the initialiser, not written back from the
     effect, so a component mounting after the probe has already resolved
     renders the right thing on its first pass rather than flickering. */
  const [on, setOn] = useState(availability[path] ?? false);
  useEffect(() => {
    if (availability[path] != null) return;
    probes[path] ??= fetch(path)
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => (availability[path] = !!j.available))
      .catch(() => (availability[path] = false));
    probes[path]!.then(setOn);
  }, [path]);
  return on;
}

export function useAssistAvailable(): boolean {
  return useServiceAvailable("/api/assist");
}

/* Whether photographs are actually sent. Read only to WORD the on-screen line
   correctly — the route drops images when the flag is off whatever the client
   sends, because the server is the enforcement point. */
const visionState: { on: boolean | null } = { on: null };
let visionProbe: Promise<boolean> | null = null;

export function useVisionOn(): boolean {
  const [on, setOn] = useState(visionState.on ?? false);
  useEffect(() => {
    if (visionState.on !== null) return;
    visionProbe ??= fetch("/api/assist")
      .then((r) => (r.ok ? r.json() : { vision: false }))
      .then((j: { vision?: boolean }) => (visionState.on = !!j.vision))
      .catch(() => (visionState.on = false));
    visionProbe.then(setOn);
  }, []);
  return on;
}

/** True when the deployment has a transcription service configured, which is
 *  what puts Transcribe on a voice note. Independent of the model above. */
export function useTranscribeAvailable(): boolean {
  return useServiceAvailable("/api/transcribe");
}

/** base64 without the data-URL prefix, which is what the API wants. */
async function toBase64(blob: Blob): Promise<{ mediaType: string; data: string }> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  /* Chunked: String.fromCharCode(...) on a whole megabyte blows the argument
     limit and throws, which would look like a model failure. */
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return { mediaType: blob.type || "image/jpeg", data: btoa(bin) };
}

/** An image to send. A bare Blob where the picture speaks for itself; a
 *  labelled one where the model has to say WHICH photograph it is talking
 *  about — consolidation, above all. */
export type AssistImage = Blob | { blob: Blob; label: string };

export async function assist(
  task: AssistTask,
  context: string,
  images: AssistImage[] = []
): Promise<string> {
  const encoded = images.length
    ? await Promise.all(
        images.map(async (i) =>
          i instanceof Blob
            ? await toBase64(i)
            : { ...(await toBase64(i.blob)), label: i.label }
        )
      )
    : undefined;
  const r = await fetch("/api/assist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task, context, ...(encoded ? { images: encoded } : {}) }),
  });
  const j = (await r.json()) as { text?: string; error?: string };
  if (!r.ok || !j.text) throw new Error(j.error ?? "The assistant is unavailable.");
  return j.text;
}

/* ---- strict parsers -------------------------------------------------------

   Every JSON task is parsed and validated here rather than trusted. A model
   that answers in prose, invents a root-cause category or returns one field of
   four must produce a refusal the auditor can see, not a half-applied
   proposal. */

export interface CaptionResult {
  caption: string;
  legible: boolean;
  note: string;
}

function jsonFrom(raw: string): unknown {
  /* Models occasionally wrap JSON in a fenced block despite being told not to. */
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function parseCaption(raw: string): CaptionResult | null {
  const j = jsonFrom(raw) as Partial<CaptionResult> | null;
  if (!j || typeof j.caption !== "string" || !j.caption.trim()) return null;
  return {
    caption: j.caption.trim(),
    legible: j.legible !== false,
    note: typeof j.note === "string" ? j.note : "",
  };
}

export interface HazardProposal {
  event: string;
  description: string;
  why: string;
  confidence: "high" | "medium" | "low";
  /** Present on a consolidation proposal: the findings behind this group. */
  findingIds?: string[];
  note?: string;
}

const conf = (v: unknown): "high" | "medium" | "low" =>
  v === "high" || v === "medium" || v === "low" ? v : "low";

function toProposal(c: Partial<HazardProposal> | null): HazardProposal | null {
  if (!c || typeof c.event !== "string" || !c.event.trim()) return null;
  return {
    event: c.event.trim(),
    description: typeof c.description === "string" ? c.description : "",
    why: typeof c.why === "string" ? c.why : "",
    confidence: conf(c.confidence),
    ...(Array.isArray(c.findingIds)
      ? { findingIds: c.findingIds.filter((x): x is string => typeof x === "string") }
      : {}),
    ...(typeof c.note === "string" ? { note: c.note } : {}),
  };
}

/** "What hazard is this?" — one finding in, the events it exposes out. */
export function parseHazards(raw: string): HazardProposal[] {
  const j = jsonFrom(raw) as { hazards?: unknown } | null;
  const list = Array.isArray(j?.hazards) ? j!.hazards : [];
  return (list as Partial<HazardProposal>[])
    .map(toProposal)
    .filter((h): h is HazardProposal => h !== null)
    .slice(0, 3);
}

/** Consolidation. `known` is the set of finding ids actually in scope: a group
 *  naming a finding that does not exist would create a hazard pointing at
 *  nothing, so unknown ids are dropped and a group left with none is refused.
 *
 *  AND NOTHING MAY BE LOST. A finding the model simply did not mention comes
 *  back as its own single-finding group, marked so a reviewer can see it was
 *  not grouped rather than not considered. Consolidation is allowed to be
 *  wrong about how things group; it is not allowed to make a finding
 *  disappear. A wrongly merged pair HIDES a finding, so an over-long register
 *  is the safer error every time. */
export function parseGroups(raw: string, known: string[]): HazardProposal[] {
  const j = jsonFrom(raw) as { groups?: unknown } | null;
  const list = Array.isArray(j?.groups) ? j!.groups : [];
  const seen = new Set<string>();
  const out: HazardProposal[] = [];
  for (const g of list as Partial<HazardProposal>[]) {
    const p = toProposal(g);
    if (!p) continue;
    /* A finding may appear in at most one group. The prompt says so; this
       enforces it, because a finding in two hazards is double-counted in every
       total downstream. */
    const ids = (p.findingIds ?? []).filter((id) => known.includes(id) && !seen.has(id));
    if (!ids.length) continue;
    ids.forEach((id) => seen.add(id));
    out.push({ ...p, findingIds: ids });
  }
  /* Whatever the model did not place. */
  for (const id of known) {
    if (seen.has(id)) continue;
    out.push({
      event: "",
      description: "",
      why: "",
      confidence: "low",
      findingIds: [id],
      note: "Not grouped with anything — name the event this finding exposes, or leave it as a hazard of its own.",
    });
  }
  return out;
}

export interface Reassessment {
  note: string;
  photographsSeen: string[];
  ratingComment: string;
  newHazards: { event: string; why: string }[];
}

export function parseReassessment(raw: string): Reassessment | null {
  const j = jsonFrom(raw) as Partial<Reassessment> | null;
  if (!j || typeof j.note !== "string") return null;
  return {
    note: j.note,
    photographsSeen: Array.isArray(j.photographsSeen)
      ? j.photographsSeen.filter((x): x is string => typeof x === "string")
      : [],
    ratingComment: typeof j.ratingComment === "string" ? j.ratingComment : "",
    newHazards: Array.isArray(j.newHazards)
      ? (j.newHazards as { event?: string; why?: string }[])
          .filter((h) => typeof h?.event === "string" && h.event.trim())
          .map((h) => ({ event: h.event!.trim(), why: typeof h.why === "string" ? h.why : "" }))
      : [],
  };
}

export interface RootCauseCandidate {
  cause: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  /** The question to put to the responsible person. See parseRootCauses. */
  askInstead: string;
}

/** `allowed` is the register's own root-cause vocabulary. A candidate outside
 *  it is dropped rather than shown: a chip an auditor cannot actually set is
 *  worse than one fewer suggestion. */
export function parseRootCauses(raw: string, allowed: string[]): RootCauseCandidate[] {
  const j = jsonFrom(raw) as { candidates?: unknown } | null;
  const list = Array.isArray(j?.candidates) ? j!.candidates : [];
  const out: RootCauseCandidate[] = [];
  for (const c of list as Partial<RootCauseCandidate>[]) {
    if (!c || typeof c.cause !== "string") continue;
    if (!allowed.includes(c.cause)) continue;
    const conf = c.confidence;
    out.push({
      cause: c.cause,
      reasoning: typeof c.reasoning === "string" ? c.reasoning : "",
      confidence: conf === "high" || conf === "medium" || conf === "low" ? conf : "low",
      askInstead: typeof c.askInstead === "string" ? c.askInstead : "",
    });
  }
  return out.slice(0, 4);
}

/** Send one recorded note to be transcribed. Returns what was actually heard,
 *  verbatim. The caller stores that as the transcript and decides separately
 *  whether to ask the model to write it up — the two steps are kept apart so a
 *  tidy-up can never be mistaken for the recording itself. */
export async function transcribe(
  blob: Blob,
  filename: string
): Promise<{ text: string; language: string | null }> {
  const form = new FormData();
  form.append("audio", blob, filename);
  const r = await fetch("/api/transcribe", { method: "POST", body: form });
  const j = (await r.json()) as { text?: string; language?: string | null; error?: string };
  if (!r.ok || !j.text) throw new Error(j.error ?? "Transcription is unavailable.");
  return { text: j.text, language: j.language ?? null };
}

/* ------------------------------------------------- context builders

   Each builder decides exactly what leaves the device for that task. Keep them
   narrow and keep them here, so the answer to "what does this send?" is one
   function, not a search through the components. Attachments, photographs and
   voice notes are never included. */

export function checkContext(check: Check, r?: Response, lib?: AnswerLibrary | null): string {
  const l = [
    `Check: ${check.id} — ${check.requirement}`,
    `Discipline: ${check.discipline} · Asset system: ${check.system}`,
    check.target && `Threshold / target stated: ${check.target}`,
    !check.target && "Threshold: none stated.",
    check.acsaRequirement && `What ACSA's own procedure requires: ${check.acsaRequirement}`,
    check.acsaThreshold && `ACSA's stated threshold: ${check.acsaThreshold}`,
    !check.acsaThreshold && "ACSA states no threshold for this check.",
    check.acsaDocs?.length &&
      `ACSA documents: ${check.acsaDocs.map((d) => `${d.doc} cl. ${d.clause}`).join("; ")}`,
    check.acsaConflict && `Contradiction already identified: ${check.acsaConflict}`,
    /* THE CONFLICT GOES IN BEFORE THE VARIANT, and it is spelled out both ways.
       A model given only "site-specific variant: yearly" beside a requirement
       headed "3 yearly" will reconcile them into something plausible and
       wrong. Given both quoted statements and which one governs, it has
       nothing to reconcile. */
    check.siteVariant?.conflict &&
      `CONFLICT at ${check.siteVariant.site}: the check as written says "${check.siteVariant.conflict.checkSays}", but ACSA requires "${check.siteVariant.conflict.siteRequires}" (${check.siteVariant.conflict.source}). The site requirement is ${check.siteVariant.conflict.direction}. Assess against ACSA's, cite both, and do not restate the check's own interval as the standard.`,
    check.siteVariant && !check.siteVariant.conflict &&
      `Site-specific variant (${check.siteVariant.site}): ${check.siteVariant.note}`,
    /* What settles this check, from the register review. */
    check.confirmedBy &&
      `Compliance is confirmed by: ${check.confirmedBy}${
        check.inspect === "reconcile"
          ? ", reconciled against the asset on the walk"
          : check.inspect === "examine"
            ? ", seen on the walk"
            : ", with nothing to inspect on site"
      }.`,
    check.complianceTest && `Compliant when: ${check.complianceTest}`,
    check.question && `Question put to ACSA: ${check.question}`,
    check.walkabout && `Walkabout instruction: ${check.walkabout}`,
  ].filter(Boolean) as string[];

  if (r) {
    l.push(`Status recorded: ${r.compliance ?? "not yet set"}`);
    if (lib && r.evidencePicked.length)
      l.push(`Evidence requested: ${r.evidencePicked.map((i) => lib.EO[i]?.label).filter(Boolean).join("; ")}`);
    if (lib && r.issuesPicked.length)
      l.push(`Issues tapped: ${r.issuesPicked.map((i) => lib.IO[i]?.finding).filter(Boolean).join(" ")}`);
    if (lib && r.walkaboutPicked !== null && lib.WO[r.walkaboutPicked])
      l.push(`Walkabout observation: ${lib.WO[r.walkaboutPicked].label}`);
    if (r.observation) l.push(`Auditor's note so far: ${r.observation}`);
  }
  return l.join("\n");
}

/** What goes with a transcript when it is written up: the words that were
 *  spoken, and enough of the check for the model to know what the note is
 *  about. Nothing else — and the audio itself has already been and gone
 *  through /api/transcribe, which is a separate decision the auditor made. */
export function transcriptContext(transcript: string, check: Check, r?: Response): string {
  return [
    "VERBATIM TRANSCRIPT OF THE VOICE NOTE:",
    transcript,
    "",
    "THE CHECK IT WAS RECORDED AGAINST:",
    checkContext(check, r),
  ].join("\n");
}

/** What goes with a photograph when a caption is proposed.
 *
 *  Note what is NOT here: the auditor's observation, the finding, the status.
 *  A caption must describe what is in the picture, and handing the model the
 *  conclusion first is how you get a caption that agrees with the conclusion
 *  instead of one that records the evidence. */
export function captionContext(a: { name: string; takenAt?: number }): string {
  return [
    "Photograph taken during an ACSA asset assurance audit.",
    a.takenAt && `Taken: ${new Date(a.takenAt).toISOString()}`,
    "If no image is supplied with this request, say so in `note`, set `legible` false, and leave `caption` empty rather than describing a photograph you cannot see.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** What goes with a finding when root causes are proposed. The allowed
 *  vocabulary is sent so the model picks from it rather than inventing one, and
 *  parseRootCauses drops anything outside it anyway. */
export function rootCauseContext(
  f: AdviceSubject,
  allowed: string[],
  check?: Check,
  captions: string[] = []
): string {
  return [
    findingContext(f, check),
    captions.length && `Photographs attached: ${captions.map((c) => `"${c}"`).join("; ")}`,
    "",
    `Root-cause categories (choose only from these): ${allowed.join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** What findingContext actually reads. A hazard satisfies it too — its event
 *  and what it exposes stand in for the description — so the root-cause advice
 *  is one component across three screens rather than three near-copies. */
export interface AdviceSubject {
  description: string;
  discipline: string;
  system: string;
  rootCause: string;
  priorRating?: string | null;
}

export function findingContext(f: AdviceSubject, check?: Check): string {
  return [
    `Finding: ${f.description}`,
    `Discipline: ${f.discipline} · Asset system: ${f.system}`,
    f.rootCause && `Root cause selected: ${f.rootCause}`,
    f.priorRating && `This asset system was rated ${f.priorRating} in March 2025.`,
    check?.target && `Threshold: ${check.target}`,
    check?.acsaRequirement && `ACSA requires: ${check.acsaRequirement}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** What goes with a finding when the hazard it exposes is proposed. The same
 *  material the rating sees — a hazard named from less than the rating was
 *  given would be a different judgement about the same evidence. */
export function hazardContext(f: Finding, check?: Check, captions: string[] = []): string {
  return [
    findingContext(f, check),
    f.suggestedEvent && `An event has already been proposed for this finding: ${f.suggestedEvent}`,
    captions.length && `Photographs attached: ${captions.map((c) => `"${c}"`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** What goes with a consolidation run.
 *
 *  Every finding in scope, each with its id, because the model must answer in
 *  ids and a group naming a finding that was never sent is a group pointing at
 *  nothing. Photograph captions go per finding and are labelled with the
 *  finding they belong to, so an image the model is shown can be attributed —
 *  that attribution is the whole reason the images help here. */
export function consolidateContext(
  items: { finding: Finding; check?: Check; captions: string[] }[]
): string {
  const blocks = items.map(({ finding: f, check, captions }) =>
    [
      `--- ${f.id} ---`,
      findingContext(f, check),
      f.area && `Area: ${f.area}`,
      captions.length &&
        `Photographs on ${f.id}: ${captions.map((c) => `"${c}"`).join("; ")}`,
    ]
      .filter(Boolean)
      .join("\n")
  );
  return [
    `Findings in scope (${items.length}). Answer in these ids and no others:`,
    "",
    ...blocks,
  ].join("\n");
}

/** What goes with a post-walk re-read: the hazard as it stands, the findings
 *  behind it, and the captions of the photographs. The rating goes too — the
 *  model is asked for a view on it, and it cannot have one without seeing it. */
export function reassessContext(
  h: {
    event: string;
    description: string;
    why: string;
    severity: string | null;
    likelihood: string | null;
    ratingConfirmed: boolean;
    discipline: string;
    system: string;
    rootCause: string;
  },
  findings: Finding[],
  captions: string[] = []
): string {
  return [
    `Hazard: ${h.event}`,
    h.description && `Description: ${h.description}`,
    h.why && `What it exposes: ${h.why}`,
    `Discipline: ${h.discipline} · Asset system: ${h.system}`,
    h.rootCause && `Root cause selected: ${h.rootCause}`,
    h.severity && h.likelihood
      ? `Current rating: ${h.severity} / ${h.likelihood} — ${
          h.ratingConfirmed ? "agreed by the audit team" : "suggested, not yet agreed"
        }`
      : "Current rating: none set.",
    "",
    findings.length
      ? `Findings behind it:\n${findings.map((f) => `- ${f.id}: ${f.description}`).join("\n")}`
      : "No findings behind it — raised directly at the register.",
    captions.length && `\nPhotographs: ${captions.map((c) => `"${c}"`).join("; ")}`,
    "If no image is supplied with this request, say so in `note` and leave `photographsSeen` empty rather than describing photographs you cannot see.",
  ]
    .filter(Boolean)
    .join("\n");
}
