/** The register and the 2025 data behind it — pure lookups, no React, no store.
 *
 *  These were exports of src/lib/store.ts, which is a "use client" module that
 *  builds a zustand store at import time. src/lib/exports.ts needs them to write
 *  a workbook and has no business dragging a client store in to do it, so the
 *  data layer lives here and the store re-exports it for the screens.
 *
 *  Almost everything here takes an entity code, because Rev A2 is ONE register
 *  shared by ten sites and very little about it is the same at all of them. */

import type { Check, PriorFinding, PriorRating } from "./types";
import checksRaw from "@/data/checks.json";
import priorFindingsRaw from "@/data/priorFindings.json";
import priorRatingsRaw from "@/data/priorRatings.json";
import { checksFor } from "./sites";

/** The register, once. Ten sites share it — see src/lib/sites.ts. Almost
 *  nothing should read this directly: a screen wants the checklist of the
 *  entity in view, which is CHECKS_AT / useChecks(). */
export const CHECKS = checksRaw as unknown as Check[];

/** Every site's 2025 asset-system ratings and open portal findings, flat. Read
 *  them through the entity-scoped helpers below — read flat, King Shaka's
 *  March 2025 findings appear at Cape Town, which is exactly the class of bug
 *  the entity scope exists to prevent. */
export const PRIOR_RATINGS = priorRatingsRaw as unknown as PriorRating[];
export const PRIOR_FINDINGS = priorFindingsRaw as unknown as PriorFinding[];

/** This entity's checklist: 324 at an international, 319 at a regional, 200 at
 *  Corporate Office. Memoised per entity because it is read on every render of
 *  every list screen. */
const checksAtCache = new Map<string, Check[]>();
export function checksAt(entityCode: string): Check[] {
  let v = checksAtCache.get(entityCode);
  if (!v) {
    v = checksFor(entityCode, CHECKS);
    checksAtCache.set(entityCode, v);
  }
  return v;
}

export function priorRatingsAt(entityCode: string): PriorRating[] {
  return PRIOR_RATINGS.filter((p) => p.entityCode === entityCode);
}

export function priorFindingsAt(entityCode: string): PriorFinding[] {
  return PRIOR_FINDINGS.filter((p) => p.entityCode === entityCode);
}

/* All of these take the entity, because none of them is the same at every site.
   Corporate Office has no Civil discipline at all — all 56 of its check-points
   are airfield — so a discipline rail built from the whole register would offer
   an auditor there a tab with nothing behind it and a count that can never be
   worked down. Same for the systems inside a discipline, and for the areas
   field mode groups by. */

export function disciplinesAt(entityCode: string): string[] {
  return Array.from(new Set(checksAt(entityCode).map((c) => c.discipline)));
}

export function checksOf(
  entityCode: string,
  discipline?: string | null,
  system?: string | null
): Check[] {
  return checksAt(entityCode).filter(
    (c) =>
      (!discipline || c.discipline === discipline) && (!system || c.system === system)
  );
}

export function systemsOf(entityCode: string, discipline: string): string[] {
  return Array.from(new Set(checksOf(entityCode, discipline).map((c) => c.system)));
}

export function areasAt(entityCode: string): string[] {
  return Array.from(new Set(checksAt(entityCode).map((c) => c.area))).sort();
}

/** The whole register's disciplines, in register order — for the one place
 *  that legitimately needs them all: the portfolio view across ten sites. */
export const ALL_DISCIPLINES = Array.from(new Set(CHECKS.map((c) => c.discipline)));

/** The 2025 rating for an asset system AT THIS ENTITY, or null.
 *
 *  This took an entity argument the day the store was scoped and did not get
 *  one: every check carried King Shaka's `pf` and `pfq` as static columns, so
 *  an auditor opening Cape Town saw "PF-01 · MAR 2025 UNACCEPTABLE" against a
 *  Cape Town check on the strength of a King Shaka finding. The seven baseline
 *  sites correctly have none and now show none. */
export function priorFor(entityCode: string, discipline: string, system: string) {
  return (
    PRIOR_RATINGS.find(
      (p) => p.entityCode === entityCode && p.discipline === discipline && p.system === system
    ) ?? null
  );
}
