/** The 2025 → current asset-system crosswalk. Pure lookups, no React, no store.
 *
 *  ACSA's 2025 report words asset systems its own way ("Taxiways, Taxi-lanes &
 *  Service Road Surfaces") and the register words them another ("Taxiways &
 *  Taxilanes"). Comparing the two by name text left four O R Tambo findings
 *  with no asset system at all, so they dropped out of the movement counts and
 *  the coverage guard. The 2025 wording is ACSA's and is never edited; this
 *  maps it instead.
 *
 *  A prior finding that already carries a register `assetSystem` is an exact
 *  match and is returned as such. Only the unallocated ones are looked up. A
 *  name with no entry here comes back as "unmapped" and is SHOWN, never
 *  dropped. */

import type { PriorFinding } from "./types";
import raw from "@/data/assetSystemCrosswalk.json";

export type MappingType = "exact" | "split" | "to-confirm" | "2025-only" | "unmapped";

interface Entry {
  discipline: string;
  recorded: string;
  current: string[];
  type: Exclude<MappingType, "exact" | "unmapped">;
  note: string;
}

export const CROSSWALK = raw as unknown as Entry[];

export interface Mapping {
  /** Register asset systems this 2025 system is compared with. Empty = none. */
  systems: string[];
  type: MappingType;
  note: string;
}

export function mappingFor(
  p: Pick<PriorFinding, "discipline" | "assetSystem" | "assetSystemRecorded">
): Mapping {
  if (p.assetSystem) return { systems: [p.assetSystem], type: "exact", note: "" };
  const e = CROSSWALK.find(
    (x) => x.discipline === p.discipline && x.recorded === p.assetSystemRecorded
  );
  if (!e) return { systems: [], type: "unmapped", note: "No crosswalk entry for this name." };
  return { systems: e.current, type: e.type, note: e.note };
}

/** Worst of several ratings, for a 2025 system that was split into more than
 *  one. Unacceptable beats Tolerable beats Pending beats Acceptable; a system
 *  with no coverage or no assessment yet does not mask the others. */
const SEVERITY_ORDER = ["Unacceptable", "Tolerable", "Pending rating", "Acceptable", "Not assessed"];
export function worstRating(ratings: string[]): string {
  const live = ratings.filter((r) => r !== "No coverage");
  if (live.length === 0) return "No coverage";
  for (const s of SEVERITY_ORDER) if (live.includes(s)) return s;
  return live[0];
}
