import type { Compliance, EvidenceStatus, Response } from "./types";

/** Status of one channel (interview, evidence, inspection) for a check, as a
 *  colour tone and a plain label. Shown as coloured icons on each Triage row
 *  (Sarel, 26 Nov 2026). Read-only: derived from the response, never stored. */
export type Tone = "good" | "bad" | "warn" | "na" | "none";
export interface ChannelStatus {
  tone: Tone;
  label: string;
}

const NONE: ChannelStatus = { tone: "none", label: "not done yet" };

function fromCompliance(c: Compliance | null | undefined, what: string): ChannelStatus {
  switch (c) {
    case "C":
      return { tone: "good", label: `${what}: done, no issues found` };
    case "NC":
      return { tone: "bad", label: `${what}: issues found, non-compliance` };
    case "N/A":
      return { tone: "na", label: `${what}: not applicable` };
    case "NV":
      return { tone: "warn", label: `${what}: could not be verified` };
    default:
      return { tone: "none", label: `${what}: not done yet` };
  }
}

export function interviewStatus(r?: Response): ChannelStatus {
  return fromCompliance(r?.compliance, "Interview");
}

export function inspectionStatus(r?: Response): ChannelStatus {
  return fromCompliance(r?.siteInspection ?? r?.fieldCompliance, "Inspection");
}

const EVIDENCE_REQUEST: Record<EvidenceStatus, ChannelStatus> = {
  noneAvailable: { tone: "bad", label: "Evidence: none available" },
  specificNotAvailable: { tone: "warn", label: "Evidence: some not available, more evidence needed" },
  toBeProvided: { tone: "warn", label: "Evidence: still to be provided, more evidence needed" },
  providedForReview: { tone: "good", label: "Evidence: provided for review" },
};

export function evidenceChannelStatus(r?: Response): ChannelStatus {
  if (!r) return { tone: "none", label: "Evidence: not done yet" };
  if (r.evidenceVerdict) {
    const v = fromCompliance(r.evidenceVerdict, "Evidence");
    if (v.tone !== "none") return v;
  }
  if (r.evidenceStatus) return EVIDENCE_REQUEST[r.evidenceStatus];
  if (r.evidencePending) return { tone: "warn", label: "Evidence: requested, more evidence needed" };
  return { tone: "none", label: "Evidence: not done yet" };
}

export const TONE_COLOUR: Record<Tone, string> = {
  good: "#1B7F4B",
  bad: "#B3261E",
  warn: "#B7791F",
  na: "#6B7280",
  none: "#B8B4C6",
};

export { NONE as NO_STATUS };
