import programme from "@/data/programme.json";
import { CHECKS } from "./store";

/* Everything that changes when the programme moves to another airport, another
   visit, or when ACSA finally gives us real zone names, lives in
   src/data/programme.json. Nothing here should need a code change to add the
   ninth airport or the second visit of 2027 — see the design document, Q13.

   Zones are deliberately empty today. The register's `area` column holds
   categories ("All Assets", "Appointments", "Authority"), not places, so field
   mode falls back to those and says so rather than pretending to be
   location-aware. Fill `entities[].zones` and `zoneMap` and it becomes
   location-aware with no other change. */

export type EntityKind = "airport" | "head-office";

export interface Entity {
  code: string;
  name: string;
  short: string;
  kind: EntityKind;
  /** Has this entity been audited under the current programme yet?
   *  Kept for the programme file's own bookkeeping — the dashboard no longer
   *  trusts it, because "live" was a flag somebody had to remember to set. It
   *  reads whether the entity actually has captured data instead. */
  live: boolean;
  /** international | regional | corporate — decides the checklist size. */
  class: "international" | "regional" | "corporate";
  /** This site's Round 1 audit window, from the register's calendar. */
  auditFrom: string;
  auditTo: string;
  /** Physical zones on the site. Empty until ACSA supplies real names. */
  zones: string[];
}

export interface Visit {
  id: string;
  label: string;
  entity: string;
  state: "done" | "skipped" | "current" | "scheduled";
  note: string;
}

export const CYCLE = programme.cycle;
export const ENTITIES = programme.entities as Entity[];
export const PROGRAMME_VISITS = programme.visits as Visit[];
export const CURRENT_ENTITY_CODE = programme.currentEntity;
export const CURRENT_VISIT_ID = programme.currentVisit;

/** checkId → zone name. Empty until the site walk-down is done. */
const ZONE_MAP = programme.zoneMap as Record<string, string>;

export function entity(code: string = CURRENT_ENTITY_CODE): Entity {
  return ENTITIES.find((e) => e.code === code) ?? ENTITIES[0];
}

/* There is deliberately no CURRENT_ENTITY constant. One existed, and three
   screens read it after the store was keyed by entity — so the dashboard
   titled itself "King Shaka International" while showing another airport's
   numbers, and a voice note recorded at Cape Town was filenamed FALE-voice-…
   The current entity is state, not a module constant; read it with
   useEntity() / useEntityCode(). CURRENT_ENTITY_CODE below is the programme's
   STARTING entity and is only for the store's initial state and its
   migration. */

export function visitsFor(code: string = CURRENT_ENTITY_CODE): Visit[] {
  return PROGRAMME_VISITS.filter((v) => v.entity === code);
}

/** True once this entity has real zones AND checks mapped into them. */
export function hasZones(code: string = CURRENT_ENTITY_CODE): boolean {
  return entity(code).zones.length > 0 && Object.keys(ZONE_MAP).length > 0;
}

export function zonesFor(code: string = CURRENT_ENTITY_CODE): string[] {
  return entity(code).zones;
}

export function zoneOf(checkId: string): string | null {
  return ZONE_MAP[checkId] ?? null;
}

/** What field mode should group by, and whether it is a real place.
 *  `kind: "area"` means these are the register's categories, not locations —
 *  the UI says so, because an auditor standing on the apron should not be told
 *  that "Appointments" is somewhere they can walk to. */
export function locationAxis(code: string = CURRENT_ENTITY_CODE): {
  kind: "zone" | "area";
  options: string[];
  of: (checkId: string, fallbackArea: string) => string;
} {
  if (hasZones(code)) {
    return {
      kind: "zone",
      options: zonesFor(code),
      of: (id, fallback) => zoneOf(id) ?? fallback,
    };
  }
  return {
    kind: "area",
    options: Array.from(new Set(CHECKS.map((c) => c.area))).sort(),
    of: (_id, fallback) => fallback,
  };
}

/** The site variant that applies at this entity, if the check carries one for it. */
export function variantApplies(
  variantSite: string | null | undefined,
  code: string = CURRENT_ENTITY_CODE
): boolean {
  return !!variantSite && variantSite === code;
}
