/** Site attendance and the daily diary — TK-003 form 2, and what it means.
 *
 *  Pure, and out of both the screen and the store, because three callers need
 *  the same answers: the register colours a row by whether it is signed, the
 *  store clears a signature when what it signed for changes, and the day's
 *  record is composed from the same fields. A second copy of "is this row
 *  signed for what it now says?" is how a register comes to show a tick beside
 *  a row somebody never agreed to. */

import type { AttendanceEntry, Signature, SiteDay } from "@/lib/types";
import { diaryGaps, diaryLines } from "@/lib/diary";

/** The calendar date in the viewer's own timezone, `YYYY-MM-DD`.
 *
 *  Built by hand rather than with toISOString(), which converts to UTC first:
 *  in South Africa that turns an 01:30 arrival into the previous day's
 *  attendance, and an attendance register that disagrees with the escort's log
 *  about which day somebody was on site is worse than no register. */
export function localDate(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** WHAT A SIGNATURE SIGNS FOR.
 *
 *  This list is the whole reason a signature here is worth anything. The person
 *  puts their mark on a statement: that this is who they are, who they work
 *  for, what they do, and that their airside induction is confirmed and carries
 *  this reference. Change any of those and the mark is no longer of that
 *  statement, so it is cleared and they sign again.
 *
 *  Arrival and departure times are deliberately NOT in the list, and that is a
 *  judgement rather than an oversight. Departure is recorded hours after the
 *  signature by whoever is closing the day down, and clearing every signature
 *  each evening would mean an attendance register that is unsigned exactly when
 *  it is finished — which is when somebody looks at it. Arrival is the moment
 *  the form is completed, so it is already fixed when they sign. */
export const SIGNED_FIELDS = [
  "name",
  "organisation",
  "role",
  "inductionConfirmed",
  "inductionRef",
] as const;

export type SignedField = (typeof SIGNED_FIELDS)[number];

/** Whether a patch touches anything the signature stands behind. */
export function patchInvalidatesSignature(p: Partial<AttendanceEntry>): boolean {
  return SIGNED_FIELDS.some(
    (f) => Object.prototype.hasOwnProperty.call(p, f) && p[f] !== undefined
  );
}

/** The next signature reference on a day — `ATT-7K2P9_S02`.
 *
 *  Numbered across the whole day rather than per person, and never reused, for
 *  the reason every other reference in this app is not reused: a signature file
 *  cited as S02 in the safety file must still be that person's mark next year.
 *  A person who signs, is edited, and signs again gets a NEW reference — the
 *  first mark was of a different statement and must not be confusable with the
 *  second. */
export function nextSignatureRef(dayId: string, entries: AttendanceEntry[]): string {
  let highest = 0;
  for (const e of entries) {
    const m = /_S(\d+)$/.exec(e.signature?.ref ?? "");
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `${dayId}_S${String(highest + 1).padStart(2, "0")}`;
}

/** Signed means a mark was drawn and stored, not that a name was typed.
 *
 *  `signedName` alone is a list somebody made up. The blobKey is the evidence
 *  that a person put their finger on the glass, and if the bytes could not be
 *  stored the row is not signed — the capture says so rather than leaving a row
 *  that reads as agreed to. */
export function isSigned(e: AttendanceEntry): boolean {
  return !!e.signature?.blobKey;
}

/** Whether an induction had expired on the day the person was on site.
 *
 *  Judged against the DAY, not against now: a register read in December must
 *  still say whether the permit was valid in September, and a permit that has
 *  since lapsed does not make a past attendance improper.
 *
 *  `null` means there is no expiry recorded, which is not the same as valid and
 *  the register says so separately. */
export function inductionLapsed(e: AttendanceEntry, dayDate: string): boolean | null {
  if (e.inductionExpires === null) return null;
  return localDate(e.inductionExpires) < dayDate;
}

/** What is missing from one person's row, as a list rather than a boolean.
 *
 *  A row is deliberately saveable with only a name — somebody walks up at the
 *  gate and the form is completed there, not at a desk — so incomplete is the
 *  normal state on arrival and the register has to be able to say which parts
 *  are still owed. */
export function entryGaps(e: AttendanceEntry): string[] {
  const gaps: string[] = [];
  if (!e.name.trim()) gaps.push("name");
  if (!e.organisation.trim()) gaps.push("organisation");
  if (!e.role.trim()) gaps.push("role");
  if (!e.arrivedAt) gaps.push("arrival time");
  if (!e.inductionConfirmed) gaps.push("induction confirmation");
  if (!isSigned(e)) gaps.push("signature");
  return gaps;
}

/** A departure before the arrival it follows.
 *
 *  Surfaced rather than corrected. Both times were entered by a person and the
 *  app does not know which one is wrong, so it says the pair disagree and lets
 *  somebody who was there decide. */
export function timesDisagree(e: AttendanceEntry): boolean {
  return e.arrivedAt !== null && e.departedAt !== null && e.departedAt < e.arrivedAt;
}

/** Minutes on site, or null while somebody is still there or never arrived. */
export function onSiteMs(e: AttendanceEntry): number | null {
  if (e.arrivedAt === null || e.departedAt === null) return null;
  return Math.max(0, e.departedAt - e.arrivedAt);
}

/** Still on site: arrived, and no departure recorded.
 *
 *  What the closeout at the end of the day is looking at. A register that shows
 *  four people arrived and nobody left is a register nobody closed, and on an
 *  airside job that is the difference between a head count and a guess. */
export function stillOnSite(day: SiteDay): AttendanceEntry[] {
  return day.entries.filter((e) => e.arrivedAt !== null && e.departedAt === null);
}

/** Everything the day is still owed, for the register's one line. */
export function dayGaps(day: SiteDay): string[] {
  const gaps: string[] = [];
  if (day.entries.length === 0) gaps.push("nobody recorded");
  const unsigned = day.entries.filter((e) => !isSigned(e)).length;
  if (unsigned) gaps.push(`${unsigned} unsigned`);
  const open = stillOnSite(day).length;
  if (open) gaps.push(`${open} not signed out`);
  gaps.push(...diaryGaps(day));
  return gaps;
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
  /** "O.R. Tambo International Airport (FAOR)" — what a reader recognises. */
  siteName: string;
  siteCode: string;
  visitId: string;
}

/** The day's register as plain text, to paste into the file or send on.
 *
 *  Composed here, as text, for the same reason the safety notice and the
 *  interview record are: the alternative is somebody retyping a page of names
 *  and times at the end of a site day, and what actually happens then is that
 *  it does not get done.
 *
 *  It states what is unknown rather than omitting it, and it marks every
 *  unsigned row as unsigned. A register that quietly leaves the signature
 *  column off reads as though everybody signed. */
export function dayText(day: SiteDay, ctx: DayContext): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);

  const lines = [
    `SITE ATTENDANCE AND DAILY DIARY — ${day.id}`,
    `${ctx.siteName}`,
    "",
    `Reference       ${ctx.siteCode}-${day.id}`,
    `Audit           ${ctx.visitId}`,
    `Date            ${day.date}`,
    `Opened          ${stamp(day.openedAt)}`,
    `Opened by       ${L(day.openedBy)}`,
    "",
    "ATTENDANCE — TK-003 form 2, Site Attendance & Induction Confirmation",
  ];

  if (day.entries.length === 0) {
    lines.push(unknown);
  } else {
    for (const e of day.entries) {
      const lapsed = inductionLapsed(e, day.date);
      lines.push("");
      lines.push(`${L(e.name)} — ${L(e.role)}, ${L(e.organisation)}`);
      lines.push(
        `  On site       ${e.arrivedAt ? hhmm(e.arrivedAt) : unknown} to ${
          e.departedAt ? hhmm(e.departedAt) : "— no departure recorded —"
        }`
      );
      if (e.location.trim()) lines.push(`  Location      ${e.location.trim()}`);
      if (e.notes.trim()) lines.push(`  Activity      ${e.notes.trim()}`);
      lines.push(
        `  Induction     ${
          e.inductionConfirmed ? "confirmed" : "NOT CONFIRMED"
        }${e.inductionRef.trim() ? `, ${e.inductionRef.trim()}` : ""}${
          e.inductionExpires
            ? `, expires ${localDate(e.inductionExpires)}${lapsed ? " — LAPSED ON THIS DATE" : ""}`
            : ", no expiry recorded"
        }`
      );
      lines.push(
        `  Signature     ${
          e.signature
            ? `${e.signature.ref}, signed ${stamp(e.signature.signedAt)} as "${e.signature.signedName}"`
            : "NOT SIGNED"
        }`
      );
    }
  }

  lines.push(...diaryLines(day));

  const photos = day.attachments.filter((a) => a.kind === "photo" && a.ref);
  if (photos.length) {
    lines.push("", "PHOTOGRAPHS", photos.map((a) => a.ref).join(", "));
  }

  const gaps = dayGaps(day);
  if (gaps.length) {
    lines.push("", `STILL OWED: ${gaps.join(", ")}`);
  }

  lines.push(
    "",
    "Recorded on TK-003 form 2 and held as J14 of the site safety file.",
    "It feeds SF-005 sheet 4, Induction & Access. It records who was present and",
    "entitled to be; it is not an audit record and settles no check-point.",
    "",
    "Thabile Pridin JV"
  );

  return lines.join("\n");
}

/** A signature the record store has not taken a copy of yet.
 *
 *  Exposed so the register can say so. A signature that exists on one tablet is
 *  a signature that can be lost with the tablet, and the person who would have
 *  to sign again is on an apron at another airport by then. */
export function unbackedSignatures(day: SiteDay): Signature[] {
  return day.entries
    .map((e) => e.signature)
    .filter((s): s is Signature => !!s && !s.cloudUrl);
}
