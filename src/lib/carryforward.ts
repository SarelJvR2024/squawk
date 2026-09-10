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
import type { VisitData } from "./store";
import {
  priorFindingsAt,
  scopeKey,
  useEntityFindings,
  useEntityCode,
  useStore,
  useVisitId,
} from "./store";
import type {
  Finding,
  PriorFinding,
  ProgressNote,
  VerificationOutcome,
} from "./types";

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

/** Does this item carry work into the visit, or is it only context?
 *
 *  The brief put it exactly right: an item rated Acceptable required no
 *  mitigation, so there is nothing to verify was implemented. It is still
 *  useful CONTEXT on its own check-point — the asset was looked at and found
 *  sound — but it is not work, and a closure list that mixes the two makes the
 *  real number look bigger than it is. ACSA's own Cluster 3 report counts on
 *  the same basis.
 *
 *  ONE STRING, TWO MEANINGS, and they must not be conflated:
 *
 *    "Not audited" on a PRIOR RATING means ACSA did not audit that asset
 *    system in March 2025 — E&DM at King Shaka, for one. There is no baseline,
 *    so there is nothing to verify. Context.
 *
 *    "Not audited" on a CARRIED FINDING means WE raised it on an earlier visit
 *    and nobody ever agreed a rating for it. That is an open question, not a
 *    settled one, and it carries. Treating it as context would let an unrated
 *    finding quietly leave the closure list by never being rated — which is the
 *    opposite of what an audit tool should do.
 *
 *  Hence the check is on Acceptable alone, and the second case is deliberately
 *  NOT included. */
export function carriesWork(item: Outstanding): boolean {
  return item.rating !== "Acceptable";
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

/** What this visit's own work says an asset system is rated, in the same
 *  vocabulary the 2025 register uses — so `movement()` compares like with like.
 *
 *  THIS WAS WRITTEN TWICE and neither copy gated on `ratingConfirmed`.
 *
 *  The dashboard and the closure screen each had their own `currentRating`, and
 *  both banded every finding on the asset system whether the group had agreed
 *  the rating or not. A finding raised by tapping an issue button arrives
 *  carrying the button's suggested severity and likelihood with
 *  `ratingConfirmed: false` — so `bandFor()` returned a band immediately, and
 *  one tap could turn an asset system Unacceptable and move the
 *  Improved / Unchanged / Worsened counts against March 2025. Those counts are
 *  the headline comparison in the out-brief.
 *
 *  That is the invariant this whole application is built around — a suggested
 *  rating reaches no KPI, no dashboard and no export — broken on the two
 *  screens where it shows up largest. It survived because the rule was applied
 *  correctly in `fromCarried` above, in `exports.ts` and in the dashboard's own
 *  `rated` list, all of which are within a few lines of a comment saying so;
 *  these two functions were somewhere else.
 *
 *  So there is now one of it, and it gates. `No coverage` is returned where the
 *  current checklist has nothing covering the system: `movement()` does not
 *  recognise it and returns null, which is what leaves it out of the counts
 *  rather than scoring it as unchanged. */
export function currentRatingOf(
  checksForSystem: { id: string }[],
  findingsForSystem: Finding[],
  responses: Record<string, { compliance?: string | null; captured?: boolean }>
): "No coverage" | "Unacceptable" | "Tolerable" | "Pending rating" | "Acceptable" | "Not assessed" {
  if (checksForSystem.length === 0) return "No coverage";
  /* Agreed ratings only. A suggestion is not a rating anywhere else in this
     codebase and it is not one here. */
  const bands = findingsForSystem
    .filter((f) => f.ratingConfirmed)
    .map((f) => bandFor(f.severity, f.likelihood));
  if (bands.includes("Red")) return "Unacceptable";
  if (bands.includes("Amber")) return "Tolerable";
  /* A non-compliance with nothing agreed yet is explicitly NOT "Acceptable".
     It is work in progress, and saying so is the difference between "we looked
     and it was fine" and "we looked and have not finished". */
  if (checksForSystem.some((c) => responses[c.id]?.compliance === "NC")) return "Pending rating";
  if (checksForSystem.some((c) => responses[c.id]?.captured)) return "Acceptable";
  return "Not assessed";
}

/* ------------------------------------------------------------ the timeline */

/** One audit's worth of what happened to a carried item. */
export interface HistoryEntry {
  visit: string;
  label: string;
  /** Where the visit sits relative to the one in view. */
  when: "earlier" | "current" | "later";
  outcome: VerificationOutcome | null;
  evidence: string;
  action: string;
  verifiedBy: string;
  verifiedAt: number | null;
  attachments: number;
  progress: ProgressNote[];
}

/** Everything recorded against one carried item, across every audit.
 *
 *  A verification has always been stored per visit — byVisit[entity|visit]
 *  .verifications[portalId] — so March 2025's finding gets its own record at
 *  September 2026 and another at March 2027. The data was there from the start.
 *  What did not exist was any way to SEE it: the closure screen read the
 *  current visit's record and nothing else, so an item that had been "Open -
 *  repeat" twice and then closed looked exactly like one closed first time.
 *
 *  The whole point of a three-year cycle is the comparison. This is it. */
export function historyFor(
  byVisit: Record<string, VisitData>,
  entityCode: string,
  currentVisit: string,
  portalId: string,
  visits: { id: string; label: string }[]
): HistoryEntry[] {
  const order = visits.map((v) => v.id);
  const nowAt = order.indexOf(currentVisit);
  return visits
    .map((v, i) => {
      const d = byVisit[scopeKey(entityCode, v.id)];
      const rec = d?.verifications?.[portalId];
      /* A visit with nothing recorded is left out entirely rather than shown
         as an empty row. "Nothing was recorded" and "nobody audited this yet"
         are the same thing here, and a row of blanks reads like the first. */
      if (!rec || (!rec.outcome && !rec.evidence && !(rec.progress?.length) && !rec.action)) {
        return null;
      }
      return {
        visit: v.id,
        label: v.label,
        when: i < nowAt ? "earlier" : i === nowAt ? "current" : "later",
        outcome: rec.outcome,
        evidence: rec.evidence ?? "",
        action: rec.action ?? "",
        verifiedBy: rec.verifiedBy ?? "",
        verifiedAt: rec.verifiedAt ?? null,
        attachments: rec.attachments?.length ?? 0,
        progress: rec.progress ?? [],
      } as HistoryEntry;
    })
    .filter((e): e is HistoryEntry => e !== null);
}

/** The same history for the entity and visit in view. */
export function useHistory(portalId: string): HistoryEntry[] {
  const byVisit = useStore((s) => s.byVisit);
  const entityCode = useEntityCode();
  const visitId = useVisitId();
  const visits = useMemo(
    () => PROGRAMME_VISITS.filter((v) => v.entity === entityCode),
    [entityCode]
  );
  return useMemo(
    () => historyFor(byVisit, entityCode, visitId, portalId, visits),
    [byVisit, entityCode, visitId, portalId, visits]
  );
}

/* ------------------------------------------------- one item, every audit */

/** What one carried item looked like at one audit.
 *
 *  `notAudited` is the state this exists for. A visit at which this entity was
 *  not audited must never render as a blank cell: a blank reads as *nothing
 *  was wrong* and it means the opposite — we do not know. The programme file
 *  already records those visits as `skipped`, so the honest answer is in the
 *  data and only the rendering was throwing it away.
 *
 *  `carried` is the other one worth naming. A visit that happened, at which
 *  nobody recorded anything against this item, is not the same as a visit that
 *  did not happen — it means the item was open and went unanswered, which is a
 *  worse fact than either and the one an ageing figure is counting. */
export type TimelineState =
  | "before"
  | "raised"
  | "carried"
  | "partial"
  | "closed"
  | "repeat"
  | "notVerified"
  | "notAudited"
  | "scheduled";

export interface TimelineCell {
  visit: string;
  label: string;
  state: TimelineState;
  /** Who recorded the outcome at that visit, where one was recorded. */
  by: string;
  at: number | null;
  evidence: string;
}

const STATE_OF: Record<VerificationOutcome, TimelineState> = {
  Closed: "closed",
  "Partially closed": "partial",
  "Open - repeat": "repeat",
  "Not verified": "notVerified",
};

/** The whole life of one carried item, one cell per visit, oldest first.
 *
 *  Every visit gets a cell — including the ones with nothing recorded and the
 *  ones that never happened. `historyFor` above deliberately drops empty
 *  visits, because it renders a narrative of what was said and an empty entry
 *  says nothing; this renders a SHAPE, and in a shape the gaps are the
 *  information. Both are right for what they do; they must not be merged. */
export function timelineFor(
  byVisit: Record<string, VisitData>,
  entityCode: string,
  currentVisit: string,
  item: Outstanding,
  visits: { id: string; label: string; state?: string }[]
): TimelineCell[] {
  return visits.map((v) => {
    const rec = byVisit[scopeKey(entityCode, v.id)]?.verifications?.[item.key];
    const base = {
      visit: v.id,
      label: v.label,
      by: rec?.verifiedBy ?? "",
      at: rec?.verifiedAt ?? null,
      evidence: rec?.evidence ?? "",
    };
    /* Order matters. A skipped visit is "not audited" even where it sits after
       the item was raised — nobody looked, so nothing about the item can be
       claimed for it. */
    if (v.state === "skipped") return { ...base, state: "notAudited" as const };
    if (v.id < item.originVisit) return { ...base, state: "before" as const };
    if (v.id === item.originVisit) return { ...base, state: "raised" as const };
    if (rec?.outcome) return { ...base, state: STATE_OF[rec.outcome] };
    if (v.id > currentVisit) return { ...base, state: "scheduled" as const };
    return { ...base, state: "carried" as const };
  });
}

/** How many visits this item has SURVIVED — visits that actually happened,
 *  after the one that raised it, at which it was not closed.
 *
 *  Measured in visits rather than days because the cycle is two visits a year:
 *  "survived three visits" says what "412 days" cannot.
 *
 *  TWO EXCLUSIONS, and both matter because this figure has to agree with
 *  visitsOpen() above — two numbers on one screen counting the same thing
 *  differently is how a screen stops being believed:
 *
 *  · A SKIPPED visit does not count. Nobody was there, so the item did not
 *    survive anything; it was simply not looked at. King Shaka's Sep 2025 and
 *    Mar 2026 are both skipped, so a finding raised in Mar 2025 has survived
 *    nothing yet however long it has been open.
 *  · THE CURRENT VISIT does not count. It is being decided now — an item is
 *    not shown as having survived the meeting it is sitting in. It starts
 *    counting once this visit is behind it. */
export function visitsSurvived(cells: TimelineCell[], currentVisit: string): number {
  let n = 0;
  for (const c of cells) {
    if (c.visit >= currentVisit) return n;
    if (c.state === "closed") return n;
    if (c.state === "carried" || c.state === "partial" || c.state === "repeat" || c.state === "notVerified") n++;
  }
  return n;
}

/* ------------------------------------------- one item, everything that happened */

/** One thing that happened to a carried item, at a moment in time.
 *
 *  The kinds are separate rather than one "note" kind because a reader
 *  scanning a column of twenty entries is looking for a shape, not reading
 *  prose: when did evidence arrive, when did somebody actually go and look,
 *  when did an audit say it was closed. Colour is never the only carrier —
 *  every entry states its kind in words. */
export type StreamKind =
  | "raised"
  | "outcome"
  | "evidence"
  | "action"
  | "next"
  | "photo"
  | "voice"
  | "note"
  | "event"
  | "check";

export interface StreamEntry {
  /** Milliseconds. Entries the record dates only to a MONTH (the 2025 register
   *  carries "2025-03-23", a verification that was never stamped carries
   *  nothing) get the visit's own start, and `dated` says which it was — a
   *  timeline that shows an invented time to the minute is lying about
   *  precision it does not have. */
  at: number;
  dated: "exact" | "visit";
  kind: StreamKind;
  /** The visit this belongs to, so the stream can be read audit by audit. */
  visit: string;
  visitLabel: string;
  /** What happened, in words, always. */
  label: string;
  /** The content, where there is any — the note, the caption, the evidence. */
  detail: string;
  by: string;
}

/** EVERYTHING RECORDED AGAINST ONE CARRIED ITEM, IN ONE ORDER.
 *
 *  Sarel, on the Follow-up screen: "we show the details of the finding and the
 *  timeline of all the comments and updates — when it was logged, when evidence
 *  was uploaded, when comments was added, when visual inspections was added,
 *  when next audits reviewed it and confirmed the compliance or non compliance.
 *  In some cases it might be opened then next audit closed and then opened
 *  again the next audit, we want to see that history."
 *
 *  Every one of those facts was already in the record and none of them were
 *  shown together. A verification per visit carries the outcome, the evidence,
 *  the action, the progress log and the attachments; the item itself carries
 *  when it was raised and at what band. The screen read the current visit's
 *  copy and one flat history list, so an item that was closed in 2026 and found
 *  open again in 2027 looked like an item somebody had simply not finished.
 *
 *  This assembles the lot, oldest first, in the ONE order that makes the
 *  open→closed→open sequence readable. It reads; it never writes, and it never
 *  invents an entry for a visit that recorded nothing — a blank is a visit at
 *  which nobody wrote anything down, and saying so would be putting words in
 *  their mouth. */
export function streamFor(
  byVisit: Record<string, VisitData>,
  entityCode: string,
  portalId: string,
  visits: { id: string; label: string }[],
  raised?: { at: number; dated: "exact" | "visit"; visit: string; rating: string | null }
): StreamEntry[] {
  const out: StreamEntry[] = [];
  const labelOf = (id: string) => visits.find((v) => v.id === id)?.label ?? id;

  if (raised) {
    out.push({
      at: raised.at,
      dated: raised.dated,
      kind: "raised",
      visit: raised.visit,
      visitLabel: labelOf(raised.visit),
      label: raised.rating ? `Raised · ${raised.rating}` : "Raised",
      detail: "",
      by: "",
    });
  }

  for (const v of visits) {
    const rec = byVisit[scopeKey(entityCode, v.id)]?.verifications?.[portalId];
    if (!rec) continue;
    /* The visit's own start, for anything the record dates no more precisely
       than "this audit". Visit ids are "YYYY-MM", which Date parses as UTC
       midnight on the first — a stable, honest floor rather than a guess. */
    const visitAt = Date.parse(`${v.id}-01T00:00:00Z`);
    const at = (exact: number | null | undefined): [number, "exact" | "visit"] =>
      exact ? [exact, "exact"] : [visitAt, "visit"];

    if (rec.outcome) {
      const [t, d] = at(rec.verifiedAt);
      out.push({
        at: t,
        dated: d,
        kind: "outcome",
        visit: v.id,
        visitLabel: v.label,
        /* The words the screen's own buttons use, so the timeline and the
           control that wrote it cannot come to say different things. */
        label: `Audit found it ${OUTCOME_WORD[rec.outcome]}`,
        detail: "",
        by: rec.verifiedBy ?? "",
      });
    }
    if (rec.evidence?.trim()) {
      const [t, d] = at(rec.verifiedAt);
      out.push({
        at: t,
        dated: d,
        kind: "evidence",
        visit: v.id,
        visitLabel: v.label,
        label: "Evidence of closure recorded",
        detail: rec.evidence.trim(),
        by: rec.verifiedBy ?? "",
      });
    }
    if (rec.action?.trim()) {
      const [t, d] = at(rec.verifiedAt);
      out.push({
        at: t,
        dated: d,
        kind: "action",
        visit: v.id,
        visitLabel: v.label,
        label: "Remediation action",
        detail: rec.action.trim(),
        by: rec.verifiedBy ?? "",
      });
    }
    if (rec.nextStep?.trim()) {
      const [t, d] = at(rec.verifiedAt);
      out.push({
        at: t,
        dated: d,
        kind: "next",
        visit: v.id,
        visitLabel: v.label,
        label: "Next step",
        detail: rec.nextStep.trim(),
        by: rec.verifiedBy ?? "",
      });
    }
    for (const a of rec.attachments ?? []) {
      const [t, d] = at(a.createdAt);
      out.push({
        at: t,
        dated: d,
        kind: a.kind === "voice" ? "voice" : "photo",
        visit: v.id,
        visitLabel: v.label,
        label:
          a.kind === "voice"
            ? "Voice note attached"
            : /* A photograph on a follow-up IS the visual inspection — somebody
                 went and looked. Named for what it means rather than for the
                 file type. */
              "Photograph — went and looked",
        detail:
          a.kind === "voice"
            ? a.transcript?.trim() || ""
            : [a.caption?.trim(), a.location?.trim()].filter(Boolean).join(" · "),
        by: a.createdBy ?? "",
      });
    }
    for (const n of rec.progress ?? []) {
      out.push({
        at: n.at,
        dated: "exact",
        kind: "note",
        visit: n.visit || v.id,
        visitLabel: labelOf(n.visit || v.id),
        label: "Update logged",
        detail: n.note,
        by: n.by,
      });
    }
    for (const e of rec.possibleEvents ?? []) {
      out.push({
        at: e.createdAt,
        dated: "exact",
        kind: "event",
        visit: v.id,
        visitLabel: v.label,
        label: e.likelihood
          ? `Possible event · likelihood ${e.likelihood}`
          : "Possible event · unrated",
        detail: [e.event, e.note].filter(Boolean).join(" — "),
        by: e.createdBy ?? "",
      });
    }
  }

  /* Oldest first. A stable secondary sort on kind keeps two entries stamped in
     the same millisecond — which happens whenever a visit dated nothing and
     several fall back to the visit's start — in the same order on every
     render, so the list does not shuffle under the reader. */
  return out.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
}

/** The verification outcomes in the words the screen's own buttons use. */
const OUTCOME_WORD: Record<VerificationOutcome, string> = {
  Closed: "closed",
  "Partially closed": "partially closed",
  "Open - repeat": "still open — a repeat",
  "Not verified": "not verified",
};

/** The same stream, for the entity in view. */
export function useStream(
  portalId: string,
  raised?: { at: number; dated: "exact" | "visit"; visit: string; rating: string | null }
): StreamEntry[] {
  const byVisit = useStore((s) => s.byVisit);
  const entityCode = useEntityCode();
  const visits = useMemo(
    () => PROGRAMME_VISITS.filter((v) => v.entity === entityCode),
    [entityCode]
  );
  return useMemo(
    () => streamFor(byVisit, entityCode, portalId, visits, raised),
    [byVisit, entityCode, portalId, visits, raised]
  );
}
