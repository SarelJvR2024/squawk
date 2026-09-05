import type { Severity, Likelihood, Band } from "./types";

/** ACSA B170 001M risk matrix.
 *
 *  Severity A–E × Likelihood 1–5, written likelihood-first in ACSA's own
 *  documents (e.g. "3A"). Clause 4.6 states only these matrices may be used
 *  and that the SACAA Director of Civil Aviation will accept no other format.
 *
 *  Red   (Unacceptable) = 5A 5B 5C 4A 4B 3A          → Avoidance
 *  Amber (mitigate)     = 5D 5E 4C 4D 4E 3B 3C 3D 2A 2B 2C 1A → Reduction
 *  Green (Acceptable)   = 3E 2D 2E 1B 1C 1D 1E       → Segregation of Exposure
 */

/* The severity and likelihood wording is VERBATIM from B170 001M clauses 4.3.1
   and 4.3.2. It is not a house scale and must not be paraphrased.

   This was got wrong once. An earlier version used a generic scale — "Critical,
   Significant, Moderate, Minor" for severity and "Not likely, Slight, Likely,
   Highly likely, Expected" for likelihood — which banded correctly but meant
   something else. Level 3 was the dangerous one: ACSA defines 3 as "unlikely but
   could possibly occur", and it was labelled "Likely", the opposite. Anyone
   rating against the label rather than the definition scored a notch low. */

export const SEVERITIES: Severity[] = [
  "A - Catastrophic",
  "B - Hazardous",
  "C - Major",
  "D - Minor",
  "E - Negligible",
];

export const LIKELIHOODS: Likelihood[] = [
  "1 - Extremely Improbable",
  "2 - Improbable",
  "3 - Remote",
  "4 - Occasional",
  "5 - Frequent",
];

/** ACSA's own definitions, verbatim from 4.3.1. Shown wherever someone picks a
 *  severity, because the one-word label is not enough to rate against. */
export const SEVERITY_DEF: Record<string, { consequence: string; example: string }> = {
  A: {
    consequence: "One or more multiple deaths and complete loss or destruction of equipment",
    example: "A major accident",
  },
  B: {
    consequence: "Serious injuries or major damage to equipment",
    example:
      "Large reduction in safety margins, physical distress or workload such that the operators cannot be relied upon to perform their tasks accurately or completely",
  },
  C: {
    consequence: "Minor injuries or minor equipment damage",
    example:
      "A significant reduction in safety margins, a reduction in the ability of the operators to cope with adverse operating conditions as a result of conditions impairing their efficiency",
  },
  D: {
    consequence: "Incidents",
    example: "Operating limitations are breached. Procedures are not used correctly",
  },
  E: { consequence: "Negligible or Inconvenience", example: "Few consequences. No safety consequences. Nuisance" },
};

/** And from 4.3.2. The bracketed word is ACSA's own gloss on the category. */
export const LIKELIHOOD_DEF: Record<string, { gloss: string; meaning: string }> = {
  "1": { gloss: "Rare", meaning: "Almost inconceivable that the event shall occur" },
  "2": {
    gloss: "Seldom",
    meaning: "Very unlikely that the event shall occur. It is not known that it has ever occurred before",
  },
  "3": { gloss: "Unlikely", meaning: "Unlikely but could possibly occur. Has occurred rarely" },
  "4": { gloss: "", meaning: "Likely to occur sometimes. Has occurred infrequently" },
  "5": { gloss: "", meaning: "Likely to occur many times or regularly. Has occurred frequently or regularly" },
};

const RED = new Set(["5A", "5B", "5C", "4A", "4B", "3A"]);
const AMBER = new Set([
  "5D", "5E", "4C", "4D", "4E", "3B", "3C", "3D", "2A", "2B", "2C", "1A",
]);

export function sevLetter(s: Severity | null): string {
  return s ? s.charAt(0) : "";
}
export function likeNumber(l: Likelihood | null): string {
  return l ? l.charAt(0) : "";
}

/** ACSA writes the cell likelihood-first: likelihood number then severity letter. */
export function cellCode(s: Severity | null, l: Likelihood | null): string | null {
  if (!s || !l) return null;
  return `${likeNumber(l)}${sevLetter(s)}`;
}

export function bandFor(s: Severity | null, l: Likelihood | null): Band | null {
  const code = cellCode(s, l);
  if (!code) return null;
  if (RED.has(code)) return "Red";
  if (AMBER.has(code)) return "Amber";
  return "Green";
}

export const BAND_META: Record<
  Band,
  { label: string; strategy: string; tone: "bad" | "warn" | "good" }
> = {
  Red: {
    label: "Unacceptable",
    strategy: "Avoidance — management to act immediately",
    tone: "bad",
  },
  Amber: {
    label: "Risk mitigation required",
    strategy: "Reduction — may require a management decision",
    tone: "warn",
  },
  Green: {
    label: "Acceptable",
    strategy: "Segregation of exposure — monitor",
    tone: "good",
  },
};

/** Worst band across a set, used for asset-system and site roll-ups. */
export function worstBand(bands: (Band | null)[]): Band | null {
  if (bands.includes("Red")) return "Red";
  if (bands.includes("Amber")) return "Amber";
  if (bands.includes("Green")) return "Green";
  return null;
}

/** The March 2025 audit rated on ACSA's three-level vocabulary; B170 001M bands
 *  are the same three levels under different names, and treating them as
 *  equivalent is what makes movement between visits comparable at all.
 *
 *  This is an assumption, not something ACSA has stated, so it is written down
 *  here in one place and declared on the export's cover sheet rather than being
 *  buried in a comparison. If ACSA says Amber is not Tolerable, change it here.
 *
 *  Worth knowing: "Tolerable" is not B170 001M's word either. The procedure's
 *  three bands are Unacceptable / Risk mitigation required / Acceptable. The
 *  March 2025 audit used Unacceptable / Tolerable / Acceptable — two of three
 *  match the procedure, the middle one does not. So this map bridges the
 *  procedure's vocabulary to the one the previous audit actually used, which is
 *  a question worth putting to ACSA rather than settling here. */
export const BAND_AS_RATING: Record<Band, "Unacceptable" | "Tolerable" | "Acceptable"> = {
  Red: "Unacceptable",
  Amber: "Tolerable",
  Green: "Acceptable",
};

const RANK: Record<string, number> = {
  Unacceptable: 0,
  Tolerable: 1,
  Acceptable: 2,
};

/** Movement of a prior finding's asset system against its previous rating. */
export function movement(
  priorRating: string,
  currentRating: string
): "Improved" | "Unchanged" | "Worsened" | null {
  if (!(priorRating in RANK) || !(currentRating in RANK)) return null;
  const d = RANK[currentRating] - RANK[priorRating];
  return d > 0 ? "Improved" : d < 0 ? "Worsened" : "Unchanged";
}
