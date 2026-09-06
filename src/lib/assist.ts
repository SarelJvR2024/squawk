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
  if (check.siteVariant) {
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
  | "rootcause";

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

export async function assist(
  task: AssistTask,
  context: string,
  images: Blob[] = []
): Promise<string> {
  const encoded = images.length ? await Promise.all(images.map(toBase64)) : undefined;
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
    check.siteVariant && `Site-specific variant (${check.siteVariant.site}): ${check.siteVariant.note}`,
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
  f: Finding,
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

export function findingContext(f: Finding, check?: Check): string {
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
