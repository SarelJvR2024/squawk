"use client";

/** The asset register, and the fact that this one is not real yet.
 *
 *  A finding says something is wrong. The asset says WHAT it is wrong with, and
 *  that is the half a maintenance planner needs to raise a job card: "corroded
 *  busbar" is a photograph, "corroded busbar, MV Switchboard 3B" is work.
 *
 *  ACSA has not supplied the register. Sarel asked for this to be built against
 *  a stand-in so the linking, the screens and the export are ready and tested
 *  for the day it arrives — which is the right call, and it puts one obligation
 *  on this file: A STAND-IN ASSET TAG MUST NEVER BE MISTAKEN FOR A REAL ONE.
 *
 *  Three things enforce that, and they are deliberately redundant, because the
 *  cost of getting it wrong is an invented asset number sitting in ACSA's
 *  portal against a real finding:
 *
 *    1. Every sample assetId begins with `SAMPLE-`. If a tag ever escapes into
 *       a workbook, an email or a screenshot, it says so in the tag itself.
 *    2. `meta.source` is `"sample"`, and `isSample()` is what the screens read
 *       to decide whether to shout about it.
 *    3. THE SYNC REFUSES TO SEND THEM. Sample links reach the workbook, where a
 *       human is reading, and never the portal, where a machine is filing.
 *
 *  When the real register arrives: overwrite the JSON in the same shape and set
 *  `meta.source` to `"acsa"`. Nothing else in the app changes, and the three
 *  guards above turn themselves off. */

import { useEffect, useState } from "react";

export interface Asset {
  /** The tag an auditor reads off the plate. Unique, and the join key. */
  assetId: string;
  name: string;
  siteCode: string;
  entityCode: string;
  discipline: string;
  disciplineCode: string;
  system: string;
  location?: string;
  criticality?: string;
  condition?: string;
}

export interface AssetRegister {
  meta: {
    /** "sample" while this is a stand-in; "acsa" once it is the real one. */
    source: "sample" | "acsa";
    title: string;
    generated?: string;
    counts?: { assets: number; sites: number };
  };
  assets: Asset[];
}

let cache: AssetRegister | null = null;
let inflight: Promise<AssetRegister> | null = null;

/** 1,506 rows and ~460 kB. Only the screens that link an asset need it, so it
 *  is fetched on first use rather than shipped in the initial bundle — the same
 *  treatment the Answer Library gets, and for the same reason: the tablet on
 *  the apron should not pay for it until it asks. */
export function loadAssets(): Promise<AssetRegister> {
  if (cache) return Promise.resolve(cache);
  inflight ??= import("@/data/assets.sample.json").then((m) => {
    cache = m.default as unknown as AssetRegister;
    return cache;
  });
  return inflight;
}

/** True while the register in use is the stand-in.
 *
 *  Returns TRUE before the file has loaded. That is deliberate: "we do not know
 *  yet" and "it is sample data" must fail the same way, because the alternative
 *  is a screen that quietly drops its warning for the first second and an
 *  auditor who happens to look then. */
export function isSample(): boolean {
  return cache?.meta.source !== "acsa";
}

/** The register, or null while it is still loading. */
export function useAssets(): AssetRegister | null {
  const [reg, setReg] = useState<AssetRegister | null>(cache);
  useEffect(() => {
    let live = true;
    loadAssets().then((r) => {
      if (live) setReg(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return reg;
}

/** The assets an auditor could plausibly mean, given where they are standing.
 *
 *  Scoped to the entity first and then narrowed by discipline and asset system,
 *  because a finding raised against Electrical / AGL at King Shaka has no
 *  business offering a Cape Town chiller. `q` searches the tag and the name.
 *
 *  Capped, and the cap is reported rather than silently applied: a picker that
 *  shows 40 of 1,506 and says "40" is honest; one that shows 40 and implies
 *  that is all there is sends somebody looking for an asset that is on the list
 *  they cannot see. */
export function findAssets(
  reg: AssetRegister | null,
  where: { entityCode: string; discipline?: string; system?: string; q?: string },
  limit = 40
): { rows: Asset[]; total: number } {
  if (!reg) return { rows: [], total: 0 };
  const q = where.q?.trim().toLowerCase();
  const all = reg.assets.filter(
    (a) =>
      a.entityCode === where.entityCode &&
      (!where.discipline || a.discipline === where.discipline) &&
      (!where.system || a.system === where.system) &&
      (!q || a.assetId.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
  );
  return { rows: all.slice(0, limit), total: all.length };
}

/** Resolve ids back to rows, for display and for the export.
 *
 *  An id with no row still comes back — as itself — rather than disappearing.
 *  A link to an asset that has since left the register is a fact worth showing;
 *  dropping it would make a finding look unlinked when somebody linked it. */
export function assetsById(reg: AssetRegister | null, ids: string[] | undefined): Asset[] {
  if (!ids?.length) return [];
  const by = new Map((reg?.assets ?? []).map((a) => [a.assetId, a]));
  return ids.map(
    (id) =>
      by.get(id) ?? {
        assetId: id,
        name: "not in the register",
        siteCode: "",
        entityCode: "",
        discipline: "",
        disciplineCode: "",
        system: "",
      }
  );
}

/** How asset links are printed in the workbook: tag first, because the tag is
 *  what a planner searches on. */
export function assetLabel(a: Asset): string {
  return a.name && a.name !== "not in the register" ? `${a.assetId} — ${a.name}` : a.assetId;
}

/** True where any of these ids came from the stand-in register. The sync uses
 *  this to leave them behind. */
export function anySample(ids: string[] | undefined): boolean {
  return !!ids?.some((id) => id.startsWith("SAMPLE-"));
}
