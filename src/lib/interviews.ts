/** Interview records — the rules that keep testimony honest, in one place.
 *
 *  Kept out of the screen and the store because all three need the same
 *  answers: the register colours a row by whether it can be cited, the store
 *  clears a confirmation when a statement changes, and the text the auditor
 *  reads back is composed from the same fields. A second copy of "is this
 *  citable?" is how the register comes to say yes while the report says no. */

import type {
  Interview,
  InterviewNote,
  InterviewParty,
  InterviewStage,
  StatementKind,
} from "@/lib/types";

export const PARTY_LABEL: Record<InterviewParty, string> = {
  ACSA: "ACSA",
  tenant: "Tenant",
  contractor: "Contractor",
  other: "Other",
};

export const KIND_LABEL: Record<StatementKind, string> = {
  quote: "Verbatim",
  summary: "Summary",
};

/** The default for a new statement, and it is `summary` on purpose.
 *
 *  Both directions of error are possible and they are not equally bad. A
 *  verbatim answer filed as a summary loses a little force in the report. A
 *  paraphrase filed as a verbatim quote puts words in a named person's mouth,
 *  and the first time that person reads it, every other statement in the file
 *  becomes arguable. So the unmarked case is the cautious one and promoting a
 *  statement to a quote is a deliberate act. */
export const DEFAULT_KIND: StatementKind = "summary";

/** The reference a statement is known by — INT-7K2P9_S01.
 *
 *  Sequence numbers are never reused, exactly as photograph references are not:
 *  a finding citing S02 must mean the same sentence next year, and a reference
 *  that silently comes to mean a different statement is worse than a gap in the
 *  numbering. */
export function nextStatementRef(interviewId: string, existing: InterviewNote[]): string {
  let highest = 0;
  for (const n of existing) {
    const m = /_S(\d+)$/.exec(n.ref ?? "");
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `${interviewId}_S${String(highest + 1).padStart(2, "0")}`;
}

/** Whether a statement can be attributed to somebody a reader could go back to.
 *
 *  Both halves are required and neither substitutes for the other. A name
 *  without a role ("Thabo said the pumps are tested weekly") does not tell a
 *  reader whether the speaker would know. A role without a name ("the
 *  electrician said…") cannot be checked by anybody at all. An audit report
 *  quoting either one is quoting nobody. */
export function isAttributable(iv: Interview): boolean {
  return iv.name.trim().length > 0 && iv.role.trim().length > 0;
}

/** The stage, derived. Never stored — see the note on InterviewStage.
 *
 *  `confirmed` outranks `ended` because confirmation can only happen after the
 *  conversation is over, and because it is the stage that changes what the
 *  record is worth: an interview the subject has agreed is accurate is evidence
 *  of what they said, and one they have not seen is the auditor's account of
 *  it. */
export function interviewStage(iv: Interview): InterviewStage {
  if (iv.confirmedAt) return "confirmed";
  if (iv.endedAt) return "ended";
  return "open";
}

/** How long it ran, or has been running.
 *
 *  `now` of 0 means the device's clock has not been read yet — see
 *  src/lib/clock.ts — and it returns null rather than computing against the
 *  epoch, which would report a fifty-six year interview. */
export function durationMs(iv: Interview, now: number): number | null {
  const end = iv.endedAt ?? (now || 0);
  if (!end) return null;
  return Math.max(0, end - iv.startedAt);
}

/** Every check-point any statement in this interview bears on, deduplicated
 *  and in the order they were first cited. What the register shows, and what an
 *  auditor working the thirty Practice check-points scans for. */
export function checkIdsCited(iv: Interview): string[] {
  const seen: string[] = [];
  for (const n of iv.notes) {
    for (const id of n.checkIds) if (!seen.includes(id)) seen.push(id);
  }
  return seen;
}

/** What is missing, as a list rather than a boolean, for the same reason an
 *  ISF's is: the register shows WHICH parts are absent. An interview is
 *  deliberately saveable with only a name, so incomplete is a normal state and
 *  the screen has to be able to say what is still owed.
 *
 *  `role` is in this list and `contact` is not. A role is what makes the
 *  statement weighable; a contact number is a convenience. */
export function missingFields(iv: Interview): string[] {
  const gaps: string[] = [];
  if (!iv.name.trim()) gaps.push("name");
  if (!iv.role.trim()) gaps.push("role");
  if (!iv.party) gaps.push("who they answer to");
  if (!iv.location.trim()) gaps.push("where");
  if (iv.notes.length === 0) gaps.push("what was said");
  if (!iv.endedAt) gaps.push("end time");
  if (!iv.noticeGiven) gaps.push("told a record was being kept");
  return gaps;
}

/** Whether this record could be quoted in the audit report as it stands.
 *
 *  Three things, and all three are about the reader rather than the auditor:
 *  somebody to attribute it to, something they actually said, and the person
 *  having known that what they said was being written down. The last one is not
 *  a legal test — it is the difference between a record that survives being
 *  shown to its own subject and one that does not. */
export function isCitable(iv: Interview): boolean {
  return isAttributable(iv) && iv.notes.length > 0 && iv.noticeGiven;
}

/** Why it is not citable, in words for the register. Empty when it is. */
export function citationBlockers(iv: Interview): string[] {
  const out: string[] = [];
  if (!iv.name.trim()) out.push("nobody named");
  if (!iv.role.trim()) out.push("no role recorded");
  if (iv.notes.length === 0) out.push("nothing recorded");
  if (!iv.noticeGiven) out.push("not told a record was being kept");
  return out;
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

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface InterviewContext {
  /** "O.R. Tambo International Airport (FAOR)" — what a reader recognises. */
  siteName: string;
  /** The portal's abbreviation, for the reference line. */
  siteCode: string;
  visitId: string;
  /** Turns a canonical check id into the one printed at this site, so a reader
   *  holding the workbook can find the row. Passed in rather than imported so
   *  this module stays free of the register. */
  portalId?: (checkId: string) => string;
}

/** The record as plain text, to read back to the person or paste into the file.
 *
 *  Composed here for the same reason the ISF notice is: the moment that decides
 *  whether this gets confirmed is the ninety seconds at the end of the
 *  conversation while the person is still standing there, and nobody retypes a
 *  page of notes in that window.
 *
 *  It states what is unknown rather than omitting it, and it marks every
 *  statement as verbatim or summary. Reading back a paraphrase without saying
 *  it is one invites a "yes, that's right" about words the person never used —
 *  which is worse than not reading it back at all, because now it carries a
 *  confirmation. */
export function interviewText(iv: Interview, ctx: InterviewContext): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);
  const pid = ctx.portalId ?? ((id: string) => id);

  const lines = [
    `INTERVIEW RECORD — ${iv.id}`,
    `${ctx.siteName}`,
    "",
    `Reference       ${ctx.siteCode}-${iv.id}`,
    `Audit           ${ctx.visitId}`,
    `Interviewee     ${L(iv.name)}`,
    `Role            ${L(iv.role)}`,
    `Organisation    ${L(iv.organisation)}${iv.party ? ` (${PARTY_LABEL[iv.party]})` : ""}`,
    `Location        ${L(iv.location)}`,
    `Discipline      ${iv.discipline ?? unknown}`,
    `Started         ${stamp(iv.startedAt)}`,
    `Ended           ${iv.endedAt ? hhmm(iv.endedAt) : "— still open —"}`,
    `Conducted by    ${L(iv.conductedBy)}`,
    "",
    iv.noticeGiven
      ? "The interviewee was told that a record was being kept of what was said."
      : "NOT RECORDED as having been told that a record was being kept of what was said.",
    "",
    "WHAT WAS SAID",
  ];

  if (iv.notes.length === 0) {
    lines.push(unknown);
  } else {
    for (const n of iv.notes) {
      lines.push("");
      lines.push(`${n.ref}  [${KIND_LABEL[n.kind].toUpperCase()}]`);
      if (n.question.trim()) lines.push(`Q  ${n.question.trim()}`);
      lines.push(`A  ${L(n.answer)}`);
      if (n.checkIds.length) {
        lines.push(`Bears on  ${n.checkIds.map(pid).join(", ")}`);
      }
    }
  }

  const photos = iv.attachments.filter((a) => a.kind === "photo" && a.ref);
  if (photos.length) {
    lines.push("", "PHOTOGRAPHS", photos.map((a) => a.ref).join(", "));
  }

  lines.push(
    "",
    iv.confirmedAt
      ? `Read back and confirmed correct by the interviewee at ${stamp(iv.confirmedAt)}.`
      : "NOT YET CONFIRMED by the interviewee.",
    "",
    "Recorded under the Scope of Work, Part C3, on-site audit phase:",
    '"Interview key personnel and stakeholders … to gather information and insights."',
    "A statement records what was said. It is not a finding and does not settle",
    "compliance on any check-point it refers to.",
    "",
    "Thabile Pridin JV"
  );

  return lines.join("\n");
}
