/** ACSA's enterprise risk matrix — declared, and deliberately empty.
 *
 *  THIS FILE HAS NO SCALE, AND THAT IS THE POINT.
 *
 *  The brief this was built from describes an ERM matrix as a second rating
 *  instrument alongside B170 001M, carried on every hazard. B170 001M is in this
 *  repo, verbatim from clauses 4.3.1 and 4.3.2, and tests/risk-matrix.test.mjs
 *  bands all twenty-five of its cells against an independently written table.
 *  The ERM matrix is not: its severity and likelihood wording, its band labels
 *  and its cell mapping are ACSA document content nobody has supplied.
 *
 *  Writing a plausible one would be the worst available option. A risk scale
 *  that looks official and is invented reaches an ACSA report as a number
 *  somebody acts on, and the failure is silent — exactly the class of defect
 *  this application was built to stop. It has happened here once already, in a
 *  different form: an earlier severity/likelihood scale banded correctly but
 *  meant something else, and level 3 read "Likely" where ACSA defines it as
 *  "unlikely but could possibly occur". Anyone rating against the label scored
 *  a notch low and nothing said so.
 *
 *  So the instrument exists, the field exists, the export column exists, and
 *  `available()` returns false. Nothing can be rated on it. When ACSA supply the
 *  matrix, fill SEVERITIES, LIKELIHOODS and BANDS below and write
 *  tests/erm-matrix.test.mjs against their own table the way the B170 001M suite
 *  does — a data change, not a rebuild.
 *
 *  Do NOT derive this from B170 001M. They are separate instruments measuring
 *  different things: B170 001M is aviation safety risk against the SACAA
 *  Director of Civil Aviation's accepted format; ERM is enterprise risk. A
 *  mapping between them is a decision ACSA makes, not one this file infers. */

/** ACSA's ERM severity scale, verbatim, when supplied. */
export const ERM_SEVERITIES: string[] = [];

/** ACSA's ERM likelihood scale, verbatim, when supplied. */
export const ERM_LIKELIHOODS: string[] = [];

/** cell code -> band label, when supplied. */
export const ERM_BANDS: Record<string, string> = {};

/** False until the matrix above is filled in. Every screen and every export
 *  asks this rather than assuming, so an unsupplied scale is visible as
 *  "not supplied" and never as a blank that reads like "not a risk". */
export function available(): boolean {
  return ERM_SEVERITIES.length > 0 && ERM_LIKELIHOODS.length > 0;
}

/** Why it is unavailable, in words an auditor can act on. */
export const UNAVAILABLE_REASON =
  "ACSA's ERM matrix has not been supplied. Hazards are rated on B170 001M only.";

export function ermCell(severity: string | null, likelihood: string | null): string | null {
  if (!available() || !severity || !likelihood) return null;
  return `${likelihood.charAt(0)}${severity.charAt(0)}`;
}

export function ermBand(severity: string | null, likelihood: string | null): string | null {
  const cell = ermCell(severity, likelihood);
  return cell ? (ERM_BANDS[cell] ?? null) : null;
}
