/** Interview records — the rules, in one place.
 *
 *  Kept out of the screen and the store because all three need the same
 *  answers: the register colours a row by whether it is signed, the store
 *  clears a signature when what it signed for changes, and the text read back
 *  is composed from the same fields. A second copy of "is this entry signed
 *  for what it now says?" is how a register comes to show a tick beside a row
 *  nobody actually confirmed.
 *
 *  REBUILT 28 September 2026, on Sarel's word, looking at the shipped screen
 *  live: "this is too formal, we just need a record of who we interview on
 *  which day, what the location was, from and to. and space for their
 *  signature and an approval at the end to close of the record of the days
 *  interviews." The earlier version carried statements linked to
 *  check-points, a quote/summary distinction, a notice-given toggle and a
 *  "citable" verdict — all removed. What was said belongs to the auditor's
 *  own judgement on the check screen; this register is evidence the
 *  conversation happened, at this time, in this place, with this person. */

import type { ApologyEntry, InterviewDay, InterviewDayStage, InterviewEntry, Signature } from "@/lib/types";

/** What an entry's signature stands behind. Change any of these afterwards and
 *  the mark is cleared — it was a signature on a different statement of who
 *  and where. Times are deliberately outside this list, for the same reason
 *  attendance's are: correcting an end time hours later must not wipe a
 *  signature given at the time. */
export const SIGNED_FIELDS = ["name", "role", "location"] as const;

export type SignedField = (typeof SIGNED_FIELDS)[number];

export function patchInvalidatesSignature(p: Partial<InterviewEntry>): boolean {
  return SIGNED_FIELDS.some(
    (f) => Object.prototype.hasOwnProperty.call(p, f) && p[f] !== undefined
  );
}

/** The next signature reference on a day — `INT-7K2P9_S02`. Numbered across the
 *  whole day and never reused, exactly as an attendance day's are: a report
 *  citing S01 must still mean that person's mark next year. */
export function nextSignatureRef(dayId: string, entries: InterviewEntry[]): string {
  let highest = 0;
  for (const e of entries) {
    const m = /_S(\d+)$/.exec(e.signature?.ref ?? "");
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `${dayId}_S${String(highest + 1).padStart(2, "0")}`;
}

/** Signed means a mark was drawn and stored, not that a name was typed. */
export function isSigned(e: InterviewEntry): boolean {
  return !!e.signature?.blobKey;
}

/** `d.apologies` is optional — see InterviewDay's own note — so every
 *  reader goes through here rather than repeating `?? []`. */
export function apologiesOf(d: InterviewDay): ApologyEntry[] {
  return d.apologies ?? [];
}

/** The stage, derived. Never stored. */
export function interviewDayStage(d: InterviewDay): InterviewDayStage {
  return d.closedAt ? "closed" : "open";
}

/** How long an interview ran, or has been running. `now` of 0 means the
 *  device's clock has not been read yet — see src/lib/clock.ts — and it
 *  returns null rather than computing against the epoch. */
export function durationMs(e: InterviewEntry, now: number): number | null {
  const end = e.endedAt ?? (now || 0);
  if (!end) return null;
  return Math.max(0, end - e.startedAt);
}

/** Interviews still running: started, nobody has ended them. What the closing
 *  approval is looking at — a day cannot honestly be closed with somebody
 *  still mid-conversation on it. */
export function stillRunning(d: InterviewDay): InterviewEntry[] {
  return d.entries.filter((e) => !e.endedAt);
}

/** What an entry is still missing, as a list rather than a boolean. A row is
 *  deliberately saveable with only a name — the interview is starting, not
 *  finished — so incomplete is the normal state and the register says which
 *  parts are still owed. */
export function entryGaps(e: InterviewEntry): string[] {
  const gaps: string[] = [];
  if (!e.name.trim()) gaps.push("name");
  if (!e.location.trim()) gaps.push("location");
  if (!e.endedAt) gaps.push("end time");
  if (!isSigned(e)) gaps.push("signature");
  return gaps;
}

/** What the day is still owed, for the register's one line and for the close
 *  button's own gate — see dayCanClose. */
export function dayGaps(d: InterviewDay): string[] {
  const gaps: string[] = [];
  if (d.entries.length === 0) gaps.push("nobody recorded");
  const unsigned = d.entries.filter((e) => !isSigned(e)).length;
  if (unsigned) gaps.push(`${unsigned} unsigned`);
  const running = stillRunning(d).length;
  if (running) gaps.push(`${running} still running`);
  return gaps;
}

/** Whether the day can be closed. Requires at least one entry and nothing
 *  still running — the approval is a statement that the list is complete, and
 *  a day with somebody mid-interview is not complete yet. Signing every entry
 *  is NOT required to close: a person who declined to sign is still an
 *  honest record of the day, and refusing to let the auditor close over that
 *  would make the approval lie about what happened rather than attest to it. */
export function dayCanClose(d: InterviewDay): boolean {
  return d.entries.length > 0 && stillRunning(d).length === 0;
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

export interface DayContext {
  siteName: string;
  siteCode: string;
  visitId: string;
}

/** The day's record as plain text, to read back or paste into the file.
 *
 *  It states what is unknown rather than omitting it, and it says plainly
 *  when the day is not yet closed — a record somebody could mistake for
 *  finished is worse than one that says it is not. */
export function dayText(d: InterviewDay, ctx: DayContext): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);

  const lines = [
    `INTERVIEW RECORD — ${d.id}`,
    `${ctx.siteName}`,
    "",
    `Reference       ${ctx.siteCode}-${d.id}`,
    `Audit           ${ctx.visitId}`,
    `Date            ${d.date}`,
    `Opened          ${stamp(d.openedAt)}`,
    `Opened by       ${L(d.openedBy)}`,
    "",
    "INTERVIEWS",
  ];

  if (d.entries.length === 0) {
    lines.push(unknown);
  } else {
    for (const e of d.entries) {
      lines.push("");
      lines.push(`${e.id}  ${L(e.name)}${e.role.trim() ? ` — ${e.role.trim()}` : ""}`);
      lines.push(`  Location      ${L(e.location)}`);
      lines.push(
        `  From / to     ${hhmm(e.startedAt)} to ${e.endedAt ? hhmm(e.endedAt) : "— still running —"}`
      );
      lines.push(
        `  Signature     ${
          e.signature ? `${e.signature.ref}, signed ${stamp(e.signature.signedAt)}` : "NOT SIGNED"
        }`
      );
    }
  }

  const apologies = apologiesOf(d);
  if (apologies.length) {
    lines.push("", "COULD NOT BE INTERVIEWED");
    for (const a of apologies) {
      lines.push("");
      lines.push(`${L(a.name)}${a.role.trim() ? ` — ${a.role.trim()}` : ""}`);
      if (a.organisation.trim()) lines.push(`  Organisation  ${a.organisation.trim()}`);
      if (a.reason.trim()) lines.push(`  Reason        ${a.reason.trim()}`);
    }
  }

  lines.push(
    "",
    d.closedAt
      ? `Closed and approved ${stamp(d.closedAt)} by ${L(d.closedBy)}${
          d.closeSignature ? ` (${d.closeSignature.ref})` : ""
        }.`
      : "NOT YET CLOSED — this record is not approved."
  );

  const gaps = dayGaps(d);
  if (gaps.length) lines.push("", `STILL OWED: ${gaps.join(", ")}`);

  lines.push(
    "",
    "Recorded under the Scope of Work, Part C3, on-site audit phase:",
    '"Interview key personnel and stakeholders … to gather information and insights."',
    "",
    "Thabile Pridin JV"
  );

  return lines.join("\n");
}

/** Signatures on this day the record store has no copy of. Same warning as
 *  the attendance register's, and the same gap behind it — see task #84. */
export function unbackedSignatures(d: InterviewDay): Signature[] {
  const out: Signature[] = [];
  for (const e of d.entries) if (e.signature && !e.signature.cloudUrl) out.push(e.signature);
  if (d.closeSignature && !d.closeSignature.cloudUrl) out.push(d.closeSignature);
  return out;
}
