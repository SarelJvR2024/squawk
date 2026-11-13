/** Closed vocabularies a risk-related picker chooses from — pulled out of
 *  store.ts so a pure module (reviewRisk.ts) can read them without dragging
 *  in Dexie/zustand, and so there is exactly one place either list is
 *  spelled out.
 *
 *  `ROOT_CAUSES` moved here unchanged (store.ts re-exports it, so every
 *  existing `import { ROOT_CAUSES } from "@/lib/store"` — RecordActions.tsx
 *  chief among them — keeps working with no call site touched).
 *
 *  `IMPACT_AREAS` is new, added for the Review risk-fields addendum (see
 *  docs/capture-review/review-risk-fields-discovery.md) — the brief's own
 *  fixed six-item list, not provisional the way its root-cause-category list
 *  is marked. */

/** ACSA's own list for a finding or hazard's root cause — a closed
 *  vocabulary. See the picker (RecordActions.tsx) for why one selection is
 *  not always enough and the addendum's own multi-select categories
 *  (`Finding.rootCauseCategories`) reuse this same list rather than the
 *  addendum's own provisional one — see the discovery note. */
export const ROOT_CAUSES = [
  "Maintenance backlog",
  "Documentation gap",
  "Design / original installation",
  "Resourcing / staffing",
  "Other",
];

/** The addendum's "Impact areas" — §2 of the review-risk-fields addendum,
 *  verbatim. Multi-select, zero or more per finding. */
export const IMPACT_AREAS = [
  "Operations",
  "Process safety",
  "Occupational safety",
  "Licenses",
  "Reputation",
  "Regulatory standing",
];
