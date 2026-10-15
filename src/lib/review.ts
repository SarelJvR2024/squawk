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

import type { Compliance } from "./types";

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
