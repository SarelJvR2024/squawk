/** How a check-point is actually verified, and therefore where it belongs.
 *
 *  The register has always carried this. `vtype` on every one of the 324 rows
 *  names one or more of three modes:
 *
 *    Evidence                    — a document to collect and read
 *    Question                    — something to ask a person
 *    Site Physical Verification  — something to go and look at
 *
 *  Nothing read it. Capture listed the whole register, including the nine that have
 *  nothing to ask and nothing to collect — an auditor at a desk was handed
 *  rows whose only answer is on an apron. Field mode listed checks that had a
 *  walkabout string, which happens to give the right 299 today but is a proxy:
 *  it is true because someone wrote walkabout text, not because the register
 *  says the asset must be seen. If a walkabout line were ever blank the check
 *  would silently stop appearing on the tablet, and nothing would say so.
 *
 *  So both screens now ask this file, and this file reads the declared field.
 *
 *  Distribution across Rev A2 (06 Sep 2026, 324 check-points):
 *
 *    Evidence + Site Physical Verification              225
 *    Evidence + Site Physical Verification + Question    63
 *    Evidence + Question                                 15
 *    Evidence                                            10
 *    Site Physical Verification                           9
 *    Site Physical Verification + Question                2
 *
 *  which resolves to Evidence 313, Physical 299, Question 80.
 *
 *  Routed:  desk 315 (Evidence or Question) · field 299 (Physical)
 *           overlap 290 · desk-only 25 · field-only 9 · orphaned 0
 *
 *  The 290 overlap is correct rather than duplication: reading the maintenance
 *  record and looking at the pump are two different acts on the same
 *  requirement, done by different people at different times. Note the overlap
 *  includes the two "Site Physical Verification + Question" rows — they carry a
 *  question, so they are desk work as well, which is easy to miss when reading
 *  the distribution above. What is NOT correct is a check appearing in a view
 *  that cannot progress it, or in neither. */

import type { Check } from "./types";

export interface Modes {
  /** A document to collect and read. */
  evidence: boolean;
  /** Something to ask a person — belongs in the audit question set. */
  question: boolean;
  /** Something to go and look at — belongs in field inspection. */
  physical: boolean;
}

export function modesOf(check: Check): Modes {
  const v = check.vtype;
  if (v) {
    return {
      evidence: v.includes("Evidence"),
      question: v.includes("Question"),
      physical: v.includes("Site Physical Verification"),
    };
  }
  /* No vtype. Every row in the register has one today, so this is for a row
     added later without it — fall back to the columns rather than dropping the
     check out of both views, because a check nobody can see is worse than one
     in the wrong place. */
  return {
    evidence: !!check.evidenceExpected || check.acsaEvidence.length > 0,
    question: !!check.question,
    physical: !!check.walkabout || check.woCount > 0,
  };
}

/** Belongs in the audit workspace: there is something to ask or collect at a
 *  desk, in a document review, or across a table from the responsible person. */
export function needsDesk(check: Check): boolean {
  const m = modesOf(check);
  return m.evidence || m.question;
}

/** Belongs in field inspection: the asset itself has to be seen. */
export function needsField(check: Check): boolean {
  return modesOf(check).physical;
}

/** Carries a question for the audit question set. */
export function needsQuestion(check: Check): boolean {
  return modesOf(check).question;
}

/** Every check reaches at least one view. Nothing in the register may be
 *  unreachable — that is the one invariant this split must not break, and
 *  tests/portals.test.mjs asserts it across all 324. */
export function isRouted(check: Check): boolean {
  return needsDesk(check) || needsField(check);
}

export const MODE_LABEL = {
  evidence: "Evidence",
  question: "Question",
  physical: "Physical",
} as const;

/** Short labels for the modes a check carries, in reading order. */
export function modeLabels(check: Check): string[] {
  const m = modesOf(check);
  const out: string[] = [];
  if (m.question) out.push(MODE_LABEL.question);
  if (m.evidence) out.push(MODE_LABEL.evidence);
  if (m.physical) out.push(MODE_LABEL.physical);
  return out;
}

/** Counts for a set of checks — used to label the filters so the numbers on
 *  screen come from the data rather than being written down somewhere. */
export function countModes(checks: Check[]) {
  let evidence = 0,
    question = 0,
    physical = 0,
    desk = 0,
    field = 0,
    both = 0;
  for (const c of checks) {
    const m = modesOf(c);
    if (m.evidence) evidence++;
    if (m.question) question++;
    if (m.physical) physical++;
    const d = m.evidence || m.question;
    if (d) desk++;
    if (m.physical) field++;
    if (d && m.physical) both++;
  }
  return { evidence, question, physical, desk, field, both, total: checks.length };
}
