import type { ErmConsequence, ErmLikelihood, ErmPriority, Severity, Likelihood } from "./types";

/** ACSA's SECOND rating instrument — the ERM matrix.
 *
 *  Source: J050 001FW *Combined Assurance Framework*, Version 1, 19 October
 *  2017, clause 9.2.2, reproduced verbatim. The same matrix appears in ACSA's
 *  Asset Management Compliance Check-list Template (re-lettered A–E) and in all
 *  three previous audit reports.
 *
 *  ──────────────────────────────────────────────────────────────────────────
 *  THIS IS NOT B170 001M, AND IT IS NOT A COMPETING VERSION OF IT.
 *
 *  B170 001M (src/lib/risk.ts) rates a HAZARD — a safety event — in the format
 *  the SACAA Director of Civil Aviation accepts. This matrix rates BUSINESS
 *  RISK and decides what enters ACSA's Combined Assurance Coverage Plan.
 *  Clause 9.1.2: "Risks rated as I and II as a minimum shall be included in the
 *  Combined Assurance Coverage Plan."
 *
 *  Laid on top of each other the two disagree on five cells — 1B, 2A, 3B, 4C
 *  and 5D. That is not a defect to reconcile: they were never measuring the
 *  same thing. It is also the answer to a question this repo escalated. The
 *  Rev A2 register's matrix disagreed with B170 001M on those exact five cells,
 *  which looked like a transcription error in the register. It was not. The
 *  register carries THIS matrix, and the real error is that the Compliance
 *  Check-list Template cites B170 001M in its header while printing the ERM
 *  grid underneath. tests/erm-matrix.test.mjs asserts the five, so the day
 *  either instrument is edited the claim is re-checked rather than remembered.
 *
 *  The likelihood axes in particular are defined differently and must not be
 *  mechanically converted:
 *    · B170 likelihood is OCCURRENCE-based  ("has occurred rarely")
 *    · ERM likelihood is PROBABILITY-based  ("Likely, 25–54%")
 *  A hazard can sit at B170 level 3 and ERM level 2 without either being wrong.
 *  So this module SUGGESTS a mapping and the session confirms it. It never
 *  derives one rating from the other silently.
 *  ────────────────────────────────────────────────────────────────────────── */

/** Consequence, cl. 9.2.2. Note the axis runs 5 → 1 with Catastrophic HIGH, the
 *  opposite direction to B170's A → E. Getting this backwards inverts the whole
 *  matrix, so the numbers are carried in the labels themselves. */
export const ERM_CONSEQUENCES: ErmConsequence[] = [
  "5 - Catastrophic",
  "4 - Critical",
  "3 - Significant",
  "2 - Moderate",
  "1 - Minor",
];

/** Likelihood, cl. 9.2.2, with the percentage bands ACSA's own template carries. */
export const ERM_LIKELIHOODS: ErmLikelihood[] = [
  "1 - Not Likely",
  "2 - Slight",
  "3 - Likely",
  "4 - Highly Likely",
  "5 - Expected",
];

export const ERM_LIKELIHOOD_DEF: Record<string, string> = {
  "1": "Less than 5%",
  "2": "5% to 24%",
  "3": "25% to 54%",
  "4": "55% to 85%",
  "5": "Greater than 85%",
};

export const ERM_CONSEQUENCE_DEF: Record<string, string> = {
  "5": "Catastrophic consequence for the organisation",
  "4": "Critical consequence",
  "3": "Significant consequence",
  "2": "Moderate consequence",
  "1": "Minor consequence",
};

export const ERM_PRIORITY_META: Record<
  ErmPriority,
  { tolerance: string; action: string; tone: "bad" | "warn" | "good" }
> = {
  I: {
    tolerance: "Unacceptable",
    action: "Improve control environment — immediate action",
    tone: "bad",
  },
  II: {
    tolerance: "Tolerable",
    action: "Cautiously operate — monitor and reduce",
    tone: "warn",
  },
  III: {
    tolerance: "Acceptable",
    action: "Monitor",
    tone: "good",
  },
};

export const ermConsequenceNumber = (c: ErmConsequence | null): string =>
  c ? c.charAt(0) : "";
export const ermLikelihoodNumber = (l: ErmLikelihood | null): string =>
  l ? l.charAt(0) : "";

/* The grid, cl. 9.2.2, written consequence-row by likelihood-column exactly as
   the framework prints it. Read as PRIORITY[consequence][likelihood]. */
const PRIORITY: Record<string, Record<string, ErmPriority>> = {
  "5": { "1": "II", "2": "I", "3": "I", "4": "I", "5": "I" },
  "4": { "1": "II", "2": "II", "3": "I", "4": "I", "5": "I" },
  "3": { "1": "III", "2": "II", "3": "II", "4": "I", "5": "I" },
  "2": { "1": "III", "2": "III", "3": "II", "4": "II", "5": "I" },
  "1": { "1": "III", "2": "III", "3": "III", "4": "II", "5": "II" },
};

export function ermPriority(
  c: ErmConsequence | null,
  l: ErmLikelihood | null
): ErmPriority | null {
  if (!c || !l) return null;
  return PRIORITY[ermConsequenceNumber(c)]?.[ermLikelihoodNumber(l)] ?? null;
}

/** The cell as it is written and read — consequence then likelihood, e.g. `5.2`.
 *  Deliberately NOT the B170 form: `3A` is a B170 cell and nothing else, and one
 *  notation for two instruments is how a rating ends up on the wrong matrix. */
export function ermCell(c: ErmConsequence | null, l: ErmLikelihood | null): string | null {
  if (!c || !l) return null;
  return `${ermConsequenceNumber(c)}.${ermLikelihoodNumber(l)}`;
}

/** Clause 9.1.2 — what has to enter the Combined Assurance Coverage Plan. */
export function entersAssurancePlan(p: ErmPriority | null): boolean {
  return p === "I" || p === "II";
}

/** The matrix is supplied now. Kept as a function because every screen and
 *  export asks it rather than assuming, which is what let the instrument exist
 *  as a declared blank for as long as ACSA had not sent the scale. */
export function available(): boolean {
  return ERM_CONSEQUENCES.length > 0 && ERM_LIKELIHOODS.length > 0;
}

/** A STARTING POINT for the ERM rating, derived by position from the agreed
 *  B170 cell. It is a suggestion and nothing more: the consequence scales are
 *  close enough to map by position, but the likelihood scales are defined
 *  differently (occurrence vs probability), so the session must look at the
 *  likelihood again rather than accept the carried number.
 *
 *  Returned with `likelihoodIsAssumed` so the UI can say so out loud. */
export function suggestErm(
  severity: Severity | null,
  likelihood: Likelihood | null
): {
  consequence: ErmConsequence | null;
  likelihood: ErmLikelihood | null;
  likelihoodIsAssumed: boolean;
} {
  const sevToCons: Record<string, ErmConsequence> = {
    A: "5 - Catastrophic",
    B: "4 - Critical",
    C: "3 - Significant",
    D: "2 - Moderate",
    E: "1 - Minor",
  };
  const likToLik: Record<string, ErmLikelihood> = {
    "1": "1 - Not Likely",
    "2": "2 - Slight",
    "3": "3 - Likely",
    "4": "4 - Highly Likely",
    "5": "5 - Expected",
  };
  return {
    consequence: severity ? (sevToCons[severity.charAt(0)] ?? null) : null,
    likelihood: likelihood ? (likToLik[likelihood.charAt(0)] ?? null) : null,
    likelihoodIsAssumed: true,
  };
}
