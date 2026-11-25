/** Pure helpers for the check screen's "ICAO & standards" and "Evidence list"
 *  sheets. They only RESHAPE text the register already carries (`basis`,
 *  `evidenceExpected`); nothing here writes or invents a standard. */

export interface BasisItem {
  text: string;
  icao: boolean;
}

/** `basis` is one string: "1. ICAO Airport Services Part 9-137 … 2. ICAO design
 *  practices … 3. Maintenance of … 4. SANS 10142". Split on the numbering. A
 *  string with no numbering is a single item. */
export function splitNumbered(s: string | null | undefined): string[] {
  const t = (s ?? "").trim();
  if (!t) return [];
  const parts = t
    .split(/(?:^|\s|\n)\d{1,2}\.\s+(?=\S)/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [t];
}

export function isIcao(text: string): boolean {
  return /\bICAO\b|\bAnnex\s*14\b|\bDoc\s*9137\b|\bDoc\s*9157\b/i.test(text);
}

export function basisItems(basis: string | null | undefined): BasisItem[] {
  return splitNumbered(basis).map((text) => ({ text, icao: isIcao(text) }));
}

/** Same numbering split for the register's standard evidence request. */
export function standardEvidence(evidenceExpected: string | null | undefined): string[] {
  return splitNumbered(evidenceExpected);
}
