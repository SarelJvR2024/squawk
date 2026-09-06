"use client";

/** What an earlier visit left open, for this visit to verify.
 *
 *  Closure used to read one static file — the 23 March 2025 findings in
 *  priorFindings.json — and nothing else. Findings raised *in the app* never
 *  became anything: a Red finding recorded in September 2026 with an owner and
 *  a due date simply sat in the findings list, and the March 2027 visit opened
 *  with no knowledge of it. The three-year cycle was a picture on the shell,
 *  not a mechanism.
 *
 *  An outstanding item is now either of two things, handled identically from
 *  here on:
 *
 *    - **seeded** — a finding from an audit that happened before this system
 *      existed, loaded from priorFindings.json;
 *    - **carried** — a finding raised in this app at this entity, on an
 *      earlier visit, that nobody has closed.
 *
 *  Both get verified the same four ways, and both are the same question to the
 *  person standing in front of the asset: was this fixed?
 *
 *  Chronology is by visit id, which is "YYYY-MM" and therefore sorts
 *  lexicographically. Only visits strictly before the one in view can leave
 *  something outstanding — a finding raised this morning is this visit's work,
 *  not a carry-over. */

import { useMemo } from "react";
import { BAND_AS_RATING, bandFor } from "./risk";
import { PROGRAMME_VISITS } from "./programme";
import { priorFindingsAt, useEntityFindings, useEntityCode, useVisitId } from "./store";
import type { Finding, PriorFinding } from "./types";

/* The seeded set used to be one file of King Shaka's March 2025 findings and
   two constants naming the entity and visit they belonged to, because there was
   only ever one entity. Rev A2's all-sites register carries the portal's 78
   open 2025 findings across three sites — King Shaka 15, O.R. Tambo 33, Cape
   Town 30 — and the other seven sites are baseline audits with none. So the
   entity and the visit come off the record now, and the constants are gone:
   they were the last place a second airport's findings could have been shown
   as King Shaka's. */

/** Which visit a site's 2025 findings were raised on, derived from the date the
 *  portal records rather than written down twice. */
export function seededVisitOf(p: PriorFinding): string {
  return p.dateRaised.slice(0, 7);
}

export type OutstandingSource = "seeded" | "carried";

export interface Outstanding {
  /** Key the verification is stored under. A seeded item keeps its PF number,
   *  so verifications recorded before carry-forward existed still resolve. */
  key: string;
  source: OutstandingSource;
  discipline: string;
  system: string;
  /** What was found, in the words of whoever found it. */
  finding: string;
  /** How it was rated when raised, in the prior-finding vocabulary so seeded
   *  and carried items can be compared and moved against each other. */
  rating: string;
  /** Visit it was raised on, and that visit's label for display. */
  originVisit: string;
  originLabel: string;
  /** Present only for a carried item — the finding this came from, so closing
   *  it here can close it there. */
  findingId?: string;
  owner?: string;
  dueDate?: string;
}

const visitLabel = (id: string) =>
  PROGRAMME_VISITS.find((v) => v.id === id)?.label ?? id;

function fromSeeded(p: PriorFinding): Outstanding {
  const originVisit = seededVisitOf(p);
  return {
    /* The portal's own id. It is the sync key, so a verification recorded here
       resolves to the right item in ACSA's Findings list. */
    key: p.portalId,
    source: "seeded",
    discipline: p.discipline,
    /* 19 of the 78 name a building or an area rather than a register asset
       system — Cargo Building, Parkade Bridges, Medical Surveillance Records.
       They are carried with the words the 2025 report used, and the discipline
       lead allocates them in the field. Dropping them for not joining to a
       check would lose real open findings. */
    system: p.assetSystem ?? p.assetSystemRecorded,
    finding: p.observation,
    rating: p.tolerance,
    originVisit,
    originLabel: visitLabel(originVisit),
  };
}

function fromCarried(f: Finding): Outstanding {
  const band = bandFor(f.severity, f.likelihood);
  return {
    key: f.id,
    source: "carried",
    discipline: f.discipline,
    system: f.system,
    finding: f.description || f.title,
    /* A rating the group never agreed is not a rating. An unconfirmed finding
       carries forward as "Not audited" rather than lending a suggestion the
       authority of a decision by surviving a visit. */
    rating: f.ratingConfirmed && band ? BAND_AS_RATING[band] : "Not audited",
    originVisit: f.originVisit,
    originLabel: visitLabel(f.originVisit),
    findingId: f.id,
    owner: f.owner,
    dueDate: f.dueDate,
  };
}

/** Everything this entity has left open coming into the visit in view.
 *
 *  Seeded items appear only at the entity and after the visit they belong to,
 *  so opening O.R. Tambo does not present King Shaka's 2025 findings as
 *  something ORTIA failed to close. */
export function outstandingFor(
  entityCode: string,
  visitId: string,
  entityFindings: Finding[]
): Outstanding[] {
  /* Seeded items appear only at their own site, and only on a visit after the
     one that raised them — opening O.R. Tambo must not present Cape Town's
     2025 findings, and the March 2025 visit must not present its own. */
  const seeded = priorFindingsAt(entityCode)
    .filter((p) => seededVisitOf(p) < visitId)
    .map(fromSeeded);

  const carried = entityFindings
    .filter((f) => f.originVisit < visitId && f.actionStatus !== "Closed")
    .map(fromCarried);

  /* Oldest first: an item that has survived two visits is the one that most
     needs answering, and it should not be below this visit's newest arrival. */
  return [...seeded, ...carried].sort(
    (a, b) => a.originVisit.localeCompare(b.originVisit) || a.key.localeCompare(b.key)
  );
}

export function useOutstanding(): Outstanding[] {
  const entityCode = useEntityCode();
  const visitId = useVisitId();
  const entityFindings = useEntityFindings();
  return useMemo(
    () => outstandingFor(entityCode, visitId, entityFindings),
    [entityCode, visitId, entityFindings]
  );
}

/** How many visits an item has been open. 0 means it was raised on the visit
 *  immediately before this one. Shown because "open since Mar 2025" and "open
 *  across three visits" land differently in a closeout meeting. */
export function visitsOpen(item: Outstanding, entityCode: string, visitId: string): number {
  const ids = PROGRAMME_VISITS.filter(
    (v) => v.entity === entityCode && v.state !== "skipped"
  )
    .map((v) => v.id)
    .sort();
  const from = ids.indexOf(item.originVisit);
  const to = ids.indexOf(visitId);
  if (from < 0 || to < 0) return 0;
  return Math.max(0, to - from - 1);
}
