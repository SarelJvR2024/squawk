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

export type AssistTask = "observation" | "finding" | "explain" | "rating" | "narrative";

let availability: boolean | null = null;
let probe: Promise<boolean> | null = null;

export function useAssistAvailable(): boolean {
  const [on, setOn] = useState(availability ?? false);
  useEffect(() => {
    if (availability !== null) return;
    probe ??= fetch("/api/assist")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => (availability = !!j.available))
      .catch(() => (availability = false));
    probe.then(setOn);
  }, []);
  return on;
}

export async function assist(task: AssistTask, context: string): Promise<string> {
  const r = await fetch("/api/assist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task, context }),
  });
  const j = (await r.json()) as { text?: string; error?: string };
  if (!r.ok || !j.text) throw new Error(j.error ?? "The assistant is unavailable.");
  return j.text;
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
