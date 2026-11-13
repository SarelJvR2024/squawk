/** The reviewer's own combined reading of a check — worst of its three
 *  compliance axes (Response.compliance, evidenceVerdict, siteInspection),
 *  on Sarel's own explicit instruction (15 Oct 2026): "if any one of the
 *  three is non-compliant, the combined reading is non-compliant."
 *
 *  DERIVED, NEVER STORED — same reasoning as bandFor() in risk.ts: a fourth
 *  field that copies three others is the fourth that goes stale the first
 *  time one of them changes and nobody remembers to recompute it. Every
 *  screen that wants the combined reading calls this, same as every screen
 *  wanting a risk band calls bandFor() rather than reading a stored colour. */

import type { Compliance, EvidenceComplianceRating, EvidenceItem } from "./types";

/** Worst-to-best, for "worst of the three": a non-compliance anywhere beats
 *  everything else, not-verified is next, compliant and not-applicable are
 *  both a clean outcome — N/A only reaches this ranking through `compliance`
 *  itself (evidenceVerdict/siteInspection never offer it), so it is ranked
 *  alongside C rather than given a worse slot of its own. */
const RANK: Record<Compliance, number> = { NC: 0, NV: 1, "N/A": 2, C: 2 };

/** `null` means "not yet answered" and is excluded from the comparison
 *  rather than treated as a value — a check with one axis still unanswered
 *  still has a real worst-of-the-rest reading, not a forced "pending"
 *  that hides a genuine NC sitting on another axis. Only when ALL THREE are
 *  unanswered does this return `null`, which every caller should read as
 *  "nothing to combine yet," not as a fourth compliance value. */
export function reviewCombinedCompliance(
  compliance: Compliance | null,
  evidenceVerdict: Compliance | null,
  siteInspection: Compliance | null
): Compliance | null {
  const answered = [compliance, evidenceVerdict, siteInspection].filter(
    (v): v is Compliance => v !== null
  );
  if (answered.length === 0) return null;
  return answered.reduce((worst, v) => (RANK[v] < RANK[worst] ? v : worst));
}

/** EVIDENCE REVIEW — maps the new, narrow `EvidenceComplianceRating` (an
 *  EvidenceItem's own quality verdict, see types.ts) onto the existing
 *  `Compliance` ranking above, so one Evidence item's rating can be worst-
 *  of'd against everything else this function already knows how to rank.
 *  `partial` reads as `NV` (not-verified) rather than inventing a fifth
 *  `Compliance` value — see docs/capture-review/evidence-review-discovery.md
 *  §4 for why this ranking was chosen over, say, `N/A`. */
const EVIDENCE_RATING_AS_COMPLIANCE: Record<EvidenceComplianceRating, Compliance> = {
  compliant: "C",
  partial: "NV",
  nonCompliant: "NC",
};

/** EVIDENCE REVIEW — the "Evidence" axis that feeds `reviewCombinedCompliance`
 *  above, see docs/capture-review/evidence-review-discovery.md §4. Worst of
 *  two things: the existing `evidenceVerdict` the auditor sets directly on
 *  this check (unchanged, via EVIDENCE_VERDICTS), and the worst
 *  `complianceRating` among any `EvidenceItem`s whose `checkIds` include
 *  this check (a check can have several). THIS IS THE SAME AXIS, not a
 *  second one: callers compute this once and pass the result into
 *  `reviewCombinedCompliance` in place of a raw `evidenceVerdict`, so the
 *  "Evidence" cell on the Review screen's own strip reads one value, worst-
 *  of'd, rather than two side by side.
 *
 *  Unrated evidence (no `complianceRating` set on any linked item) leaves
 *  the result exactly `evidenceVerdict` — the brief's own rule, "if no
 *  evidence is rated, the combined rating is unaffected." */
export function evidenceAxisFor(
  evidenceVerdict: Compliance | null,
  items: EvidenceItem[]
): Compliance | null {
  const rated = items
    .map((e) => e.complianceRating)
    .filter((r): r is EvidenceComplianceRating => r != null)
    .map((r) => EVIDENCE_RATING_AS_COMPLIANCE[r]);
  const answered = [evidenceVerdict, ...rated].filter((v): v is Compliance => v !== null);
  if (answered.length === 0) return null;
  return answered.reduce((worst, v) => (RANK[v] < RANK[worst] ? v : worst));
}
