/** ONE SHARED FUNCTION for everything the Review risk-fields addendum calls
 *  "derived" or "computed" — the addendum's own words are "generated column
 *  or computed in one shared function... one source of truth used by UI,
 *  exports and summary." Nothing in this file recomputes a band: `priorityFor`
 *  is a thin read of `bandFor`/`BAND_AS_PRIORITY` (src/lib/risk.ts), which is
 *  the one place the B170 001M matrix itself lives. This file is the layer
 *  above it — the table, the panel, the bulk bar and the roll-up all call
 *  into here rather than each writing their own "is it rated / which bucket /
 *  what's in this array" logic and drifting apart the way the Red/Amber/
 *  Green-vs-I/II/III wording already has (see risk.ts's own comments).
 *
 *  Deliberately pure and import-light (types.ts, risk.ts, riskVocab.ts only —
 *  no Dexie, no React) so tests/review-risk-fields.test.mjs can import it
 *  directly under plain node, the same way tests/risk-matrix.test.mjs imports
 *  risk.ts: these are the rules an auditor relies on, and they are worth
 *  proving against the real function rather than reading the source. */

import type { Finding } from "./types";
import { bandFor, BAND_AS_PRIORITY, BAND_META } from "./risk";
import { IMPACT_AREAS, ROOT_CAUSES } from "./riskVocab";

export { IMPACT_AREAS, ROOT_CAUSES };

export interface Priority {
  priority: "I" | "II" | "III";
  /** "I · Unacceptable", built from the SAME BAND_META label every other
   *  screen shows — never typed out a second time here. */
  label: string;
  /** BAND_META's own tone, so a priority pill and a band pill never pick
   *  different colours for the same cell. */
  tone: "bad" | "warn" | "good";
}

/** THE RATING, NEVER TYPED. Null exactly when severity or likelihood is
 *  missing — "Not rated" is the caller's job to render, not this function's,
 *  so every caller renders the exact same empty state rather than three
 *  slightly different ones. */
export function priorityFor(f: Pick<Finding, "severity" | "likelihood">): Priority | null {
  const band = bandFor(f.severity, f.likelihood);
  if (!band) return null;
  const priority = BAND_AS_PRIORITY[band];
  return { priority, label: `${priority} · ${BAND_META[band].label}`, tone: BAND_META[band].tone };
}

/** Add/remove one value in a multi-select array, no duplicates. The ONE place
 *  "toggle a chip" is defined — the panel's single-row chip tap and the bulk
 *  bar's per-row apply (via applyBulkMulti below) both end up here, so they
 *  cannot disagree about what toggling means. Absent reads as empty, same
 *  convention as every other optional array on Finding. */
export function toggleMulti(current: string[] | undefined, value: string): string[] {
  const list = current ?? [];
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** The bulk bar's add/remove for ONE axis (impact areas, or root cause
 *  categories), applied to one finding's existing list for that axis only.
 *  Returns just the new array — the caller's own patch (e.g.
 *  `{ impactAreas: applyBulkMulti(f.impactAreas, add, remove) }`) is what
 *  keeps every other field on the finding (severity, rootCauseNote,
 *  attachments, …) out of the write, so a bulk edit of impact areas can
 *  never carry away a value on a different axis. Add wins where the same
 *  value is in both lists — the UI should never produce that, but a defined
 *  order beats an undefined one. */
export function applyBulkMulti(current: string[] | undefined, add: string[], remove: string[]): string[] {
  const next = new Set(current ?? []);
  for (const v of remove) next.delete(v);
  for (const v of add) next.add(v);
  return [...next];
}

/** Whether this finding carries ANY root cause content to confirm —
 *  categories, the free-text note, or both. Used by the "Root cause
 *  unconfirmed" filter: a finding nobody has touched yet is not
 *  "unconfirmed", it is simply blank. */
export function hasRootCauseContent(f: Pick<Finding, "rootCauseCategories" | "rootCauseNote">): boolean {
  return (f.rootCauseCategories?.length ?? 0) > 0 || !!f.rootCauseNote?.trim();
}

export type ReviewRiskFilter =
  | { kind: "all" }
  | { kind: "priority"; priority: "I" | "II" | "III" }
  | { kind: "notRated" }
  | { kind: "impact"; area: string }
  | { kind: "rootCause"; category: string }
  | { kind: "unconfirmed" };

export function matchesReviewRiskFilter(f: Finding, filter: ReviewRiskFilter): boolean {
  switch (filter.kind) {
    case "all":
      return true;
    case "priority":
      return priorityFor(f)?.priority === filter.priority;
    case "notRated":
      return !priorityFor(f);
    case "impact":
      return (f.impactAreas ?? []).includes(filter.area);
    case "rootCause":
      return (f.rootCauseCategories ?? []).includes(filter.category);
    case "unconfirmed":
      return hasRootCauseContent(f) && !f.rootCauseConfirmed;
  }
}

/** Counts findings against one multi-select axis, ONE COUNT PER SELECTED
 *  VALUE PER FINDING — §4 of the addendum: "one finding with 2 impact areas
 *  counts once in each." A finding with an empty/absent list simply
 *  contributes to none of these counts; callers that want "none selected" as
 *  its own bucket use countWithNoneSelected below instead of reading it off
 *  this map's total. */
export function countByMultiSelect(
  findings: Finding[],
  pick: (f: Finding) => string[] | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) {
    for (const v of pick(f) ?? []) out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

export function countWithNoneSelected(findings: Finding[], pick: (f: Finding) => string[] | undefined): number {
  return findings.filter((f) => (pick(f) ?? []).length === 0).length;
}

export function countNotRated(findings: Finding[]): number {
  return findings.filter((f) => !priorityFor(f)).length;
}

export interface RollupRow {
  /** The group's identity — a discipline name, an asset system, a check id,
   *  or a finding id, per whichever axis the caller rolled up by. */
  key: string;
  counts: { I: number; II: number; III: number };
  notRated: number;
  total: number;
}

/** Roll up findings by an arbitrary grouping key — §4: "Roll up by
 *  Discipline, Asset system, Audit check, Finding." One shared function so
 *  the on-screen summary and any future export read the same counts; the
 *  caller supplies only how to group, never how to count. */
export function rollupBy(findings: Finding[], keyOf: (f: Finding) => string): RollupRow[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = keyOf(f);
    const list = groups.get(k);
    if (list) list.push(f);
    else groups.set(k, [f]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const counts = { I: 0, II: 0, III: 0 };
    let notRated = 0;
    for (const f of list) {
      const p = priorityFor(f);
      if (p) counts[p.priority]++;
      else notRated++;
    }
    return { key, counts, notRated, total: list.length };
  });
}
