/** Turning an asset system's own hazardous events into Hazard records.
 *
 *  Pulled out of hazards/page.tsx so the grouping/merge decision is pure,
 *  testable state-in-state-out — the same reasoning merge.ts is tested for
 *  (see tests/hazardpromotion.test.mjs) rather than read as source text.
 *
 *  THE PROBLEM THIS FIXES: an asset-system panel names its hazardous events
 *  one system at a time (SystemAssessment.events), so the SAME risk regularly
 *  gets named more than once — "Substation or transformer fire or explosion"
 *  independently against Substations, Transformers, Fire Safety Management
 *  and Statutory Appointments & Competencies on the FAOR hazard-mapping
 *  import, each with its own root cause and mitigating action. Promoting each
 *  occurrence on its own (the only thing this screen could do before) raised
 *  the same risk as several lookalike hazards instead of Sarel's explicit
 *  ask: "multiple assets and findings can contribute to the same hazardous
 *  event" — one hazard, every contributing asset system named on it.
 *
 *  GROUPING IS BY EXACT WORDING, DELIBERATELY NOT AN AI CALL: the asset-
 *  system panel's events are typed by an engineer looking at one system at a
 *  time, and the same wording recurring on a second or third system is that
 *  engineer already telling you it is one risk with several contributors —
 *  trimmed and case-folded, nothing fuzzier. An event with no name of its own
 *  is never grouped with another blank one; two different auditors' blank
 *  placeholders are not the same risk just because neither has been named
 *  yet. */

import type { Finding, Hazard, PossibleEvent } from "./types";

export interface SystemEventCandidate {
  discipline: string;
  system: string;
  event: PossibleEvent;
}

/** Trimmed, case-folded, whitespace-collapsed — see the header above for why
 *  this is the whole rule. */
export const eventKey = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/** Candidates not yet pulled through, grouped so the same hazardous event
 *  named on several asset systems reads as one group. Largest groups first —
 *  the risk with the most contributing systems is the one most worth the
 *  auditor's attention — then alphabetically, so the order is stable across
 *  renders instead of depending on object/Map iteration happenstance. */
export function groupSystemEventCandidates(
  candidates: SystemEventCandidate[]
): SystemEventCandidate[][] {
  const map = new Map<string, SystemEventCandidate[]>();
  for (const c of candidates) {
    const key = c.event.event.trim() ? eventKey(c.event.event) : `__unnamed-${c.event.id}`;
    const arr = map.get(key);
    if (arr) arr.push(c);
    else map.set(key, [c]);
  }
  return [...map.values()].sort(
    (a, b) => b.length - a.length || a[0].event.event.localeCompare(b[0].event.event)
  );
}

export type PromotedHazardPatch = Pick<
  Hazard,
  | "event"
  | "likelihood"
  | "note"
  | "rootCause"
  | "actions"
  | "findingIds"
  | "assetIds"
  | "disciplines"
  | "systems"
  | "sourceSystemEventIds"
>;

/** The patch a group of one-or-more same-named system events becomes when
 *  promoted. A group of exactly one behaves exactly as a single promote
 *  always did (no system label on its root cause); a group of several merges
 *  every event's own evidence chain — findings, assets, disciplines, root
 *  causes and actions — into the one consolidated hazard, same reasoning
 *  accept() already uses for a consolidated-from-findings hazard. */
export function buildPromotedHazardPatch(
  group: SystemEventCandidate[],
  findings: Finding[]
): PromotedHazardPatch {
  const multi = group.length > 1;

  /* THE EVIDENCE CHAIN, CARRIED ACROSS — Sarel: "a hierarchy or linked
     evidence of non-compliance and findings all contributing to the risk,
     giving the full picture." Each event's own findingIds is what the
     auditor already tagged on the asset-system panel as contributing to it;
     those findings' own assetIds are unioned in too, the same way accept()
     does it for a consolidated hazard, so an asset tagged only on the
     finding is not lost just because no event in the group named it
     directly. */
  const linkedFindingIds = [...new Set(group.flatMap(({ event }) => event.findingIds ?? []))];
  const linkedFindings = findings.filter((f) => linkedFindingIds.includes(f.id));

  /* THE EVENTS' OWN ROOT CAUSES AND ACTIONS, CARRIED ACROSS TOO — Sarel: "the
     process is to capture a hazard and multiple root causes for the hazard."
     Hazard.rootCause is ACSA's single free-text field, not a list, so every
     cause from every event in the group joins into one — same flattening
     sharepoint.ts's asset-risk sync already uses for the same shape. A group
     of more than one asset system gets each cause labelled with the system
     it came from, because "no budget" reads very differently on a substation
     than on a fire panel and a merged hazard must not blur which system each
     cause belongs to. Hazard.actions is already MitigationAction[], the same
     type the events' own actions are, so those concatenate as-is. */
  const rootCause = group
    .flatMap(({ system, event }) =>
      (event.rootCauses ?? []).map((r) => {
        const text = r.note ? `${r.cause} — ${r.note}` : r.cause;
        return multi ? `[${system}] ${text}` : text;
      })
    )
    .join("\n");

  return {
    event: group[0].event.event,
    likelihood: group.find(({ event }) => event.likelihood)?.event.likelihood ?? null,
    note: [...new Set(group.map(({ event }) => event.note).filter(Boolean))].join("\n"),
    rootCause,
    actions: group.flatMap(({ event }) => event.actions ?? []),
    findingIds: linkedFindingIds,
    assetIds: [
      ...new Set([
        ...group.flatMap(({ event }) => event.assetIds ?? []),
        ...linkedFindings.flatMap((f) => f.assetIds ?? []),
      ]),
    ],
    disciplines: [
      ...new Set([
        ...group.map(({ discipline }) => discipline),
        ...linkedFindings.map((f) => f.discipline),
      ]),
    ],
    systems: [...new Set(group.map(({ system }) => system))],
    sourceSystemEventIds: group.map(({ event }) => event.id),
  };
}
