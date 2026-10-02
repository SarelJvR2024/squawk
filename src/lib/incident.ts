/** Incident / near-miss reports — TK-003 form 5, built field-by-field
 *  against Annexure 1 of the OHS Act (Act 85 of 1993), Regulation 9's
 *  General Administrative Regulations for Recording and Investigation of
 *  Incidents. See the note at the top of IncidentReport in types.ts for why
 *  the shape is not TPJV's own invention. */

import type { IncidentBodyPart, IncidentEffect, IncidentReport, Signature } from "@/lib/types";

export const BODY_PARTS: readonly IncidentBodyPart[] = [
  "Head",
  "Neck",
  "Eye",
  "Trunk",
  "Finger",
  "Hand",
  "Arm",
  "Foot",
  "Leg",
  "Internal",
  "Multiple",
];

export const EFFECTS: readonly IncidentEffect[] = [
  "Sprain or strain",
  "Contusion or wound",
  "Fracture",
  "Burn",
  "Amputation",
];

/** What the two sign-offs attest to — the facts of the incident and the
 *  investigation's own findings, not the DoL/Compensation Commissioner
 *  notification fields or the HS Committee's remarks, which move after
 *  signing as a matter of course (a notification sent the next morning, a
 *  committee note added weeks later) and would otherwise unsign a record
 *  every time one of those moved. Same reasoning as ISF_SIGNED_FIELDS in
 *  src/lib/isf.ts. */
export const INCIDENT_SIGNED_FIELDS = [
  "isNearMiss",
  "date",
  "time",
  "location",
  "affectedPersonName",
  "affectedPersonIdNumber",
  "bodyPartAffected",
  "effect",
  "exposure",
  "investigatorName",
  "investigatorDesignation",
  "investigationDate",
  "description",
  "suspectedCause",
  "recommendedSteps",
] as const;

export function incidentSignedFieldsChanged(p: Partial<IncidentReport>): boolean {
  return INCIDENT_SIGNED_FIELDS.some(
    (f) => Object.prototype.hasOwnProperty.call(p, f) && p[f] !== undefined
  );
}

/** Every field Annexure 1 and the contract's own addition (the DoL field)
 *  expect, and whether it is filled. A list, not a boolean, for the same
 *  reason missingFields() in src/lib/isf.ts is: an incident report is
 *  deliberately saveable while incomplete, so the register has to say what
 *  is still owed rather than only that something is. */
export function missingFields(r: IncidentReport): string[] {
  const gaps: string[] = [];
  if (!r.location.trim()) gaps.push("location");
  if (!r.isNearMiss && !r.affectedPersonName.trim()) gaps.push("affected person");
  if (!r.isNearMiss && r.bodyPartAffected === null) gaps.push("part of body affected");
  if (!r.exposure.trim()) gaps.push("machine/process/exposure");
  if (!r.description.trim()) gaps.push("description");
  if (!r.suspectedCause.trim()) gaps.push("suspected cause");
  if (!r.recommendedSteps.trim()) gaps.push("recommended steps");
  if (!r.completedSignature) gaps.push("completer's signature");
  if (!r.competentPersonSignature) gaps.push("competent person's signature");
  return gaps;
}

/** Signatures the record store has not taken a copy of yet — same reasoning
 *  as unbackedIsfSignature() in src/lib/isf.ts. */
export function unbackedSignatures(r: IncidentReport): Signature[] {
  return [r.completedSignature, r.competentPersonSignature].filter(
    (s): s is Signature => !!s && !s.cloudUrl
  );
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

export function incidentText(
  r: IncidentReport,
  ctx: { siteName: string; siteCode: string; visitId: string }
): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);

  const lines = [
    `${r.isNearMiss ? "NEAR MISS" : "INCIDENT"} REPORT — ${r.id}`,
    `${ctx.siteName}`,
    "(Annexure 1, OHS Act 85 of 1993, Regulation 9)",
    "",
    `Reference       ${ctx.siteCode}-${r.id}`,
    `Audit           ${ctx.visitId}`,
    `Date            ${r.date}  ${r.time}`,
    `Location        ${L(r.location)}`,
    "",
    "SECTION A — RECORDING",
    `Affected person ${L(r.affectedPersonName)}`,
    `ID number       ${L(r.affectedPersonIdNumber)}`,
    `Part of body    ${r.bodyPartAffected ?? unknown}`,
    `Effect          ${r.effect ?? unknown}`,
    `Exposure        ${L(r.exposure)}`,
    `Compensation Commissioner notified   ${r.reportedToCompensationCommissioner ? "yes" : "no"}`,
    `Dept of Labour (Provincial Director) notified   ${r.reportedToDoL ? "yes" : "no"}${
      r.reportedToDoL && r.doLReference.trim() ? `, ref ${r.doLReference.trim()}` : ""
    }${r.reportedToDoL && r.doLNotifiedAt ? `, ${stamp(r.doLNotifiedAt)}` : ""}`,
    "",
    "SECTION B — INVESTIGATION",
    `Investigator    ${L(r.investigatorName)}, ${L(r.investigatorDesignation)}`,
    `Investigated    ${r.investigationDate || unknown}`,
    "Description",
    L(r.description),
    "Suspected cause",
    L(r.suspectedCause),
    "Recommended steps",
    L(r.recommendedSteps),
  ];

  if (r.actions.length) {
    lines.push(
      "",
      "SECTION C — ACTION TAKEN",
      ...r.actions.map(
        (a, i) =>
          `${i + 1}. ${a.action.trim() || unknown} — ${a.discipline || unknown}, ${
            a.owner.trim() || unknown
          }, due ${a.dueDate || unknown} (${a.status})`
      )
    );
  }

  if (r.hsCommitteeRemarks.trim()) {
    lines.push("", "SECTION D — HEALTH AND SAFETY COMMITTEE REMARKS", r.hsCommitteeRemarks.trim());
  }

  lines.push(
    "",
    "COMPLETED BY",
    r.completedSignature
      ? `${r.completedSignature.ref}, signed ${stamp(r.completedSignature.signedAt)} as "${
          r.completedSignature.signedName
        }"`
      : `${L(r.completedBy)} — NOT YET SIGNED`,
    "",
    "COMPETENT PERSON",
    r.competentPersonSignature
      ? `${r.competentPersonSignature.ref}, signed ${stamp(r.competentPersonSignature.signedAt)} as "${
          r.competentPersonSignature.signedName
        }"`
      : `${L(r.competentPersonName)} — NOT YET SIGNED`
  );

  const gaps = missingFields(r);
  if (gaps.length) lines.push("", `STILL OWED: ${gaps.join(", ")}`);

  lines.push("", "Thabile Pridin JV");
  return lines.join("\n");
}
