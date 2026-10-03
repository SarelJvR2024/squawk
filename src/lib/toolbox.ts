/** Toolbox talks — the same job src/lib/attendance.ts, src/lib/ppe.ts and
 *  src/lib/siteAccess.ts do for their own forms: one place for "does this
 *  patch unsign the row", shared by the store and the /toolbox-talk screen. */

import type { ToolboxTalk, ToolboxAttendee, Signature } from "@/lib/types";

export function signedFieldsChanged(p: Partial<ToolboxAttendee>): boolean {
  return p.name !== undefined || p.organisation !== undefined || p.role !== undefined;
}

export function isSigned(a: ToolboxAttendee): boolean {
  return !!a.signature?.blobKey;
}

export function nextSignatureRef(talkId: string, attendees: ToolboxAttendee[]): string {
  let highest = 0;
  for (const a of attendees) {
    const m = /_S(\d+)$/.exec(a.signature?.ref ?? "");
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `${talkId}_S${String(highest + 1).padStart(2, "0")}`;
}

export function talkGaps(talk: ToolboxTalk): string[] {
  const gaps: string[] = [];
  if (!talk.topic.trim()) gaps.push("no topic recorded");
  if (talk.attendees.length === 0) gaps.push("nobody recorded");
  const unsigned = talk.attendees.filter((a) => !isSigned(a)).length;
  if (unsigned) gaps.push(`${unsigned} unsigned`);
  return gaps;
}

export function unbackedSignatures(talk: ToolboxTalk): Signature[] {
  return talk.attendees
    .map((a) => a.signature)
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

export function talkText(
  talk: ToolboxTalk,
  ctx: { siteName: string; siteCode: string; visitId: string }
): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);

  const lines = [
    `TOOLBOX TALK — ${talk.id}`,
    `${ctx.siteName}`,
    "",
    `Reference       ${ctx.siteCode}-${talk.id}`,
    `Audit           ${ctx.visitId}`,
    `Date            ${talk.date}`,
    `Topic           ${L(talk.topic)}`,
    `Facilitator     ${L(talk.facilitator)}`,
    `Location        ${L(talk.location)}`,
    `Opened          ${stamp(talk.openedAt)}`,
    `Opened by       ${L(talk.openedBy)}`,
    "",
    "ATTENDEES",
  ];

  if (talk.attendees.length === 0) {
    lines.push(unknown);
  } else {
    for (const a of talk.attendees) {
      lines.push("");
      lines.push(`${L(a.name)} — ${L(a.role)}${a.organisation.trim() ? `, ${a.organisation.trim()}` : ""}`);
      lines.push(
        `  Signature     ${
          a.signature
            ? `${a.signature.ref}, signed ${stamp(a.signature.signedAt)} as "${a.signature.signedName}"`
            : "NOT SIGNED"
        }`
      );
    }
  }

  const gaps = talkGaps(talk);
  if (gaps.length) lines.push("", `STILL OWED: ${gaps.join(", ")}`);

  lines.push("", "Thabile Pridin JV");
  return lines.join("\n");
}
