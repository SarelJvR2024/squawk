/** Which checks apply at which site, and what each one is called there.
 *
 *  Rev A2 covers ten sites and 3,086 check-points, but it is NOT ten different
 *  registers. Every site uses the same 324-item register and the same
 *  check-point numbers: KSIA-ELE-005, ORTIA-ELE-005 and CO-ELE-005 are the same
 *  requirement at three sites, which is the whole point — results compare
 *  across the group. Where a check-point does not apply its number is simply
 *  not used at that site. Gaps, no renumbering.
 *
 *  So Squawk holds the register ONCE and derives the rest:
 *
 *    portalIdFor()  the site-prefixed id, which is the portal's sync key and
 *                   the number an auditor reads out on site;
 *    checksFor()    the applicable subset for that site.
 *
 *  Storing 3,086 rows instead would mean ten copies of every requirement,
 *  threshold and walkabout instruction, which drift apart the first time one of
 *  them is corrected and nobody remembers there are nine others.
 *
 *  Applicability is a TPJV assumption for the register, confirmed by the
 *  discipline leads before each site audit; nothing is removed from the
 *  contract scope. Where a system exists in the register but not at a site — a
 *  hydrant fuel system, a water treatment plant at a small regional — the check
 *  stays and the auditor records N/A. Only whole asset systems that cannot
 *  exist at that class of site are removed:
 *
 *    international  full register, 324 (King Shaka, O.R. Tambo, Cape Town)
 *    regional       319 — no passenger boarding bridges
 *    corporate      200 — a Head Office building with no airfield
 *
 *  tests/sites.test.mjs recomputes 324 / 319 / 200 from the register itself
 *  rather than trusting the numbers written here. */

import sitesRaw from "@/data/source/sites_RevA2.json";
import type { Check } from "./types";

export type SiteClass = "international" | "regional" | "corporate";

export interface Site {
  /** The portal's site abbreviation, and the prefix on every check-point id. */
  siteCode: string;
  /** The entity code Squawk scopes captured data by (the ICAO code, or HO). */
  entityCode: string;
  icao: string;
  name: string;
  class: SiteClass;
  audit: { from: string; to: string; visit: string };
  /** What Rev A2 says this site's count is. Asserted against the derived set. */
  checks: number;
  /** False for the five site codes ACSA will add to the portal next release. */
  inPortal: boolean;
}

interface RemovedSystem {
  discipline: string;
  /** "*" removes every asset system in the discipline. */
  system: string;
}

export const SITES = sitesRaw.sites as Site[];
export const SITE_META = sitesRaw.meta;

const APPLICABILITY = sitesRaw.applicability as unknown as Record<
  SiteClass,
  { reason?: string; removed: RemovedSystem[]; expectRemoved: number }
>;

export function siteFor(entityCode: string): Site | null {
  return SITES.find((s) => s.entityCode === entityCode) ?? null;
}

/** The portal's abbreviation for this entity — KSIA, ORTIA, CO. Falls back to
 *  the entity code so an entity added to programme.json before the register
 *  knows about it still renders something truthful rather than another site's
 *  prefix. */
export function siteCodeFor(entityCode: string): string {
  return siteFor(entityCode)?.siteCode ?? entityCode;
}

export function siteClassFor(entityCode: string): SiteClass {
  return siteFor(entityCode)?.class ?? "international";
}

/** The check-point id as the portal knows it at this site.
 *
 *  The register Squawk carries is numbered with the KSIA prefix, because that
 *  is the set TPJV issued first. The canonical part is everything after it —
 *  ELE-001 — and the site supplies the rest. An auditor at O.R. Tambo must see
 *  ORTIA-ELE-001, and an export from Cape Town must carry CTIA-ELE-001, or the
 *  results cannot be synced back to the right check-point. */
const SUFFIX = /^[A-Z]+-(.+)$/;

export function suffixOf(checkId: string): string {
  return SUFFIX.exec(checkId)?.[1] ?? checkId;
}

export function portalIdFor(entityCode: string, checkId: string): string {
  return `${siteCodeFor(entityCode)}-${suffixOf(checkId)}`;
}

/** True when this check-point is on this site's checklist. */
export function appliesAt(entityCode: string, check: Check): boolean {
  const removed = APPLICABILITY[siteClassFor(entityCode)]?.removed ?? [];
  return !removed.some(
    (r) => r.discipline === check.discipline && (r.system === "*" || r.system === check.system)
  );
}

/** Why a check-point is not on this site's checklist, for the screen that has
 *  to explain a count that is not 324. */
export function removedAt(entityCode: string): { reason: string; systems: RemovedSystem[] } {
  const a = APPLICABILITY[siteClassFor(entityCode)];
  return { reason: a?.reason ?? "", systems: a?.removed ?? [] };
}

/** This site's checklist. Order is the register's own. */
export function checksFor(entityCode: string, all: Check[]): Check[] {
  return all.filter((c) => appliesAt(entityCode, c));
}
