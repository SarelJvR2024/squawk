/** The attendance register — the same job src/lib/toolbox.ts does for toolbox
 *  talks. One place for "does this patch unsign the row", shared by the
 *  store and the /attendance screen.
 *
 *  Replaces src/lib/attendance.ts's AttendanceEntry/SiteDay.entries as the
 *  live sign-in sheet (3 October 2026) — see the note on AttendanceRegister
 *  in types.ts for why. attendance.ts itself is untouched: the daily diary
 *  and closeout still live on SiteDay, and dayText() still has to read
 *  historic entries correctly for any day captured before this change. */

import type { ApologyEntry, AttendanceRegister, AttendanceRow, Signature } from "@/lib/types";

/** What a signature signs for: name, who they were there for, what they do.
 *  Phone and email are deliberately NOT in this list — contact details are
 *  a fact about how to reach somebody, not part of the statement "this is
 *  who I am and why I was here", the same reasoning that keeps the
 *  location/notes fields outside SIGNED_FIELDS in attendance.ts. */
export function signedFieldsChanged(p: Partial<AttendanceRow>): boolean {
  return p.name !== undefined || p.organisation !== undefined || p.role !== undefined;
}

export function isSigned(r: AttendanceRow): boolean {
  return !!r.signature?.blobKey;
}

/** `reg.apologies` is optional — see ApologyEntry's own note — so every
 *  reader goes through here rather than repeating `?? []` at every call
 *  site. */
export function apologiesOf(reg: AttendanceRegister): ApologyEntry[] {
  return reg.apologies ?? [];
}

/** The next signature reference on a register — numbered across the whole
 *  register rather than per person, and never reused, same reasoning as
 *  every other signature reference in this app: a mark cited in the safety
 *  file must still be that person's mark next year. */
export function nextSignatureRef(registerId: string, rows: AttendanceRow[]): string {
  let highest = 0;
  for (const r of rows) {
    const m = /_S(\d+)$/.exec(r.signature?.ref ?? "");
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `${registerId}_S${String(highest + 1).padStart(2, "0")}`;
}

/** Every field a row can be missing — a name is enough to be on the
 *  register; the rest is what the register is still owed before it reads
 *  as complete. */
export function rowGaps(r: AttendanceRow): string[] {
  const gaps: string[] = [];
  if (!r.name.trim()) gaps.push("name");
  if (!isSigned(r)) gaps.push("signature");
  return gaps;
}

/** What the register as a whole is still owed. A BLANK REGISTER IS NOT A
 *  GAP — one created ahead of time for next Tuesday's muster, with nobody
 *  signed yet, is working exactly as intended; "nobody recorded" is only
 *  worth saying once somebody was expected and is not there, which this
 *  module has no way to know. The Forms hub's own "needs attention" filter
 *  is driven by unsigned rows, not by an empty register. */
export function registerGaps(reg: AttendanceRegister): string[] {
  const gaps: string[] = [];
  const unsigned = reg.rows.filter((r) => !isSigned(r)).length;
  if (unsigned) gaps.push(`${unsigned} unsigned`);
  return gaps;
}

export function unbackedSignatures(reg: AttendanceRegister): Signature[] {
  return reg.rows
    .map((r) => r.signature)
    .filter((s): s is Signature => !!s && !s.cloudUrl);
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

export interface RegisterContext {
  siteName: string;
  siteCode: string;
  visitId: string;
}

/** The register as plain text, to paste into the file or send on — same
 *  reasoning as every other register's text composer in this app. */
export function registerText(reg: AttendanceRegister, ctx: RegisterContext): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);

  const lines = [
    `ATTENDANCE REGISTER — ${reg.id}`,
    `${ctx.siteName}`,
    "",
    `Reference       ${ctx.siteCode}-${reg.id}`,
    `Audit           ${ctx.visitId}`,
    `Date            ${L(reg.date)}`,
    `Time            ${L(reg.time)}`,
    `Location        ${L(reg.location)}`,
    `Purpose         ${L(reg.purpose)}`,
    `Opened          ${stamp(reg.openedAt)}`,
    `Opened by       ${L(reg.openedBy)}`,
    "",
    "ATTENDEES",
  ];

  if (reg.rows.length === 0) {
    lines.push(unknown);
  } else {
    for (const r of reg.rows) {
      lines.push("");
      lines.push(`${L(r.name)} — ${L(r.role)}, ${L(r.organisation)}`);
      if (r.phone.trim() || r.email.trim()) {
        lines.push(
          `  Contact       ${[r.phone.trim(), r.email.trim()].filter(Boolean).join(" · ") || unknown}`
        );
      }
      lines.push(
        `  Signature     ${
          r.signature
            ? `${r.signature.ref}, signed ${stamp(r.signature.signedAt)} as "${r.signature.signedName}"`
            : "NOT SIGNED"
        }`
      );
    }
  }

  const apologies = apologiesOf(reg);
  if (apologies.length) {
    lines.push("", "APOLOGIES");
    for (const a of apologies) {
      lines.push("");
      lines.push(`${L(a.name)} — ${L(a.role)}, ${L(a.organisation)}`);
      if (a.reason.trim()) lines.push(`  Reason        ${a.reason.trim()}`);
    }
  }

  const gaps = registerGaps(reg);
  if (gaps.length) {
    lines.push("", `STILL OWED: ${gaps.join(", ")}`);
  }

  lines.push("", "Thabile Pridin JV");

  return lines.join("\n");
}
