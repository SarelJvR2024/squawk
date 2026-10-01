/** Immediate Safety Findings — the rules SWP-07 sets, in one place.
 *
 *  Kept out of the screen and out of the store because all three of them need
 *  the same answers: the register colours a row by stage, the store never
 *  writes a stage down, and the export prints the notice. A second copy of
 *  "has this been notified yet?" is how one of them comes to disagree with the
 *  others about a record that matters more than any other in the file. */

import { bandFor, BAND_META } from "@/lib/risk";
import type { NotifyMethod, IsfStage, SafetyFinding, Signature } from "@/lib/types";

/** What the authorised signature signs for — same rule as every other
 *  signature in this app: change what it attests to and the mark is cleared.
 *  The substance of the finding and its risk assessment, not the procedural
 *  fields (who was notified, the written notice, closure) which move after
 *  signing as a matter of course and would otherwise unsign the record every
 *  time somebody ticked a box days later. */
export const ISF_SIGNED_FIELDS = [
  "description",
  "location",
  "locationDescription",
  "discipline",
  "assetSystem",
  "riskToPersons",
  "immediateAction",
  "actualImpact",
  "potentialImpact",
  "rootCause",
  "severity",
  "likelihood",
] as const;

export function isfSignedFieldsChanged(p: Partial<SafetyFinding>): boolean {
  return ISF_SIGNED_FIELDS.some(
    (f) => Object.prototype.hasOwnProperty.call(p, f) && p[f] !== undefined
  );
}

/** What SWP-07 accepts as having notified somebody.
 *
 *  "Notify the ACSA site representative VERBALLY AT ONCE" — so a conversation
 *  or a phone call discharges it and a WhatsApp does not. A message still gets
 *  recorded, because what actually happened is worth knowing, but it does not
 *  move the finding out of `raised`. */
export const VERBAL: readonly NotifyMethod[] = ["in-person", "phone", "radio"];

export const METHOD_LABEL: Record<NotifyMethod, string> = {
  "in-person": "In person",
  phone: "Telephone",
  radio: "Radio",
  message: "Message",
  email: "E-mail",
};

export function isVerbal(m: NotifyMethod | null): boolean {
  return m !== null && VERBAL.includes(m);
}

/** The stage, derived. Never stored — see the note on IsfStage.
 *
 *  Order matters: closed wins over everything, because an ISF can be closed by
 *  the escort making the area safe before anybody has written anything, and a
 *  register that still called that one "raised" would be chasing a risk that no
 *  longer exists. */
export function isfStage(f: SafetyFinding): IsfStage {
  if (f.closedAt) return "closed";
  if (f.writtenIssuedAt) return "issued";
  if (f.notifiedAt && isVerbal(f.notifiedMethod)) return "notified";
  return "raised";
}

/** Milliseconds between the auditor stopping and the site being told, or null
 *  where nobody has been told yet.
 *
 *  This is the number SWP-07's "at once" is measured by, and the reason
 *  notifiedAt is an instant rather than a checkbox. */
export function notifyGapMs(f: SafetyFinding): number | null {
  return f.notifiedAt === null ? null : Math.max(0, f.notifiedAt - f.raisedAt);
}

/** Same calendar day, in the viewer's own timezone.
 *
 *  Deliberately local rather than UTC: "the same day" means the working day the
 *  auditor is standing in, and at an airport in South Africa a UTC comparison
 *  would call an 02:00 notice late. */
export function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/** An ISF whose written notice is late, or about to be.
 *
 *  Late is simple — a day has turned and nothing was issued. `dueToday` is the
 *  one worth surfacing: still inside SWP-07's window, but the day is running
 *  out and nobody has written anything. That is the state where a reminder
 *  changes the outcome; "late" is only ever a report.
 *
 *  `now` of 0 means the device's clock has not been read yet — see
 *  src/lib/clock.ts — and it returns "unknown" rather than computing against
 *  the epoch. Without that, every unissued notice reads "late" on the first
 *  frame and then stops: an overdue badge that appears and vanishes is worse
 *  than one that never appeared, because somebody saw it and watched it go. */
export function writtenStatus(
  f: SafetyFinding,
  now: number
): "issued" | "late" | "dueToday" | "unknown" {
  if (f.writtenIssuedAt) return "issued";
  if (!now) return "unknown";
  if (!sameDay(f.raisedAt, now)) return "late";
  return "dueToday";
}

/** Every field SWP-07 and TK-003 form 1 expect, and whether it is filled.
 *
 *  Returned as a list rather than a boolean because the register shows what is
 *  missing, not merely that something is. An ISF is deliberately saveable with
 *  only a description — see the note on SafetyFinding — so "incomplete" is a
 *  normal, expected state and the screen has to be able to say which parts. */
export function missingFields(f: SafetyFinding): string[] {
  const gaps: string[] = [];
  if (!f.location.trim()) gaps.push("location");
  if (!f.riskToPersons.trim()) gaps.push("risk to persons");
  if (!f.immediateAction.trim()) gaps.push("immediate action");
  if (!f.notifiedAt) gaps.push("verbal notification");
  else if (!f.notifiedTo.trim()) gaps.push("who was notified");
  if (!f.writtenIssuedAt) gaps.push("written notice");
  if (!f.attachments.some((a) => a.kind === "photo")) gaps.push("photograph");
  if (f.severity === null || f.likelihood === null) gaps.push("risk rating");
  if (!f.rootCause.trim()) gaps.push("root cause");
  if (!f.authorisedSignature) gaps.push("authorised signature");
  return gaps;
}

/** An authorised signature the record store has not taken a copy of yet —
 *  same reasoning and same shape as unbackedSignatures() in
 *  src/lib/attendance.ts. */
export function unbackedIsfSignature(f: SafetyFinding): Signature[] {
  return f.authorisedSignature && !f.authorisedSignature.cloudUrl ? [f.authorisedSignature] : [];
}

function stamp(t: number): string {
  return new Date(t).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface NoticeContext {
  /** "O.R. Tambo International Airport (FAOR)" — what a reader recognises. */
  siteName: string;
  /** The portal's abbreviation, for the reference line. */
  siteCode: string;
  visitId: string;
}

/** The written notification SWP-07 requires the same day.
 *
 *  Composed here, as text, so it can be copied into an e-mail on a tablet with
 *  no mail client configured and no signal. That is the whole point: the
 *  procedure says written notice the same day, and the difference between that
 *  happening and not happening is usually whether somebody had to compose it
 *  from scratch at the end of a four-site day.
 *
 *  It states what is unknown rather than omitting it. A notice that quietly
 *  leaves out the immediate action reads as though none was taken. */
export function noticeText(f: SafetyFinding, ctx: NoticeContext): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);

  const lines = [
    `IMMEDIATE SAFETY FINDING — ${f.id}`,
    `${ctx.siteName}`,
    "",
    `Reference       ${ctx.siteCode}-${f.id}`,
    `Audit           ${ctx.visitId}`,
    `Raised          ${stamp(f.raisedAt)}`,
    `Raised by       ${L(f.raisedBy)}`,
    `Recorded by     ${L(f.recordedBy)}`,
    `Discipline      ${f.discipline ?? unknown}`,
    `Asset system    ${f.assetSystem ?? unknown}`,
    `Location        ${L(f.location)}`,
    f.locationDescription.trim() ? `                ${f.locationDescription.trim()}` : "",
    "",
    "FINDING",
    L(f.description),
    "",
    "IMPACT",
    `What happened   ${L(f.actualImpact)}`,
    `Possible impact ${L(f.potentialImpact)}`,
    "",
    "IMMEDIATE RISK TO PERSONS",
    L(f.riskToPersons),
    "",
    "IMMEDIATE ACTION TAKEN",
    L(f.immediateAction),
    "",
    "RISK ASSESSMENT",
    `Severity        ${f.severity ?? unknown}`,
    `Likelihood      ${f.likelihood ?? unknown}`,
    `Rating          ${
      f.ratingConfirmed && bandFor(f.severity, f.likelihood)
        ? BAND_META[bandFor(f.severity, f.likelihood)!].label
        : "not yet agreed"
    }`,
    `Root cause      ${L(f.rootCause)}`,
    `Urgency         ${f.urgency ?? unknown}`,
    ...(f.actions.length
      ? [
          "",
          "MITIGATING ACTIONS",
          ...f.actions.map(
            (a, i) =>
              `${i + 1}. ${a.action.trim() || unknown} — ${a.discipline || unknown}, ${
                a.owner.trim() || unknown
              }, due ${a.dueDate || unknown} (${a.status})`
          ),
        ]
      : []),
    "",
    `ACSA area/dept manager   ${L(f.acsaManagerName)}`,
    "",
    "VERBAL NOTIFICATION",
    f.notifiedAt
      ? `${L(f.notifiedTo)} — ${
          f.notifiedMethod ? METHOD_LABEL[f.notifiedMethod] : unknown
        }, ${stamp(f.notifiedAt)}`
      : "NOT YET NOTIFIED. This notice does not replace the verbal notification required by SWP-07.",
  ];

  const photos = f.attachments.filter((a) => a.kind === "photo" && a.ref);
  if (photos.length) {
    lines.push("", "PHOTOGRAPHS", photos.map((a) => a.ref).join(", "));
  }

  lines.push(
    "",
    "AUTHORISED BY",
    f.authorisedSignature
      ? `${f.authorisedSignature.ref}, signed ${stamp(f.authorisedSignature.signedAt)} as "${
          f.authorisedSignature.signedName
        }"`
      : `${L(f.authorisedBy)} — NOT YET SIGNED`
  );

  lines.push(
    "",
    "This finding is issued under SWP-07 of the Safety Plan (TPJV-ACSA-AA-SF-004)",
    "and is reported immediately as required by the Scope of Work, Part C3.",
    "It is recorded in the Immediate Safety Findings register and tracked to closure.",
    "",
    "Thabile Pridin JV"
  );

  return lines.join("\n");
}
