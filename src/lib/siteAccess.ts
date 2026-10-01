/** Site access logs — the same job src/lib/attendance.ts and src/lib/ppe.ts
 *  do for their own forms: one place for "does this patch unsign the row",
 *  shared by the store and the /site-access screen. */

import type { SiteAccessLog, SiteAccessVisitor, Signature } from "@/lib/types";

export function signedFieldsChanged(p: Partial<SiteAccessVisitor>): boolean {
  return p.name !== undefined || p.side !== undefined || p.organisation !== undefined;
}

export function isSigned(v: SiteAccessVisitor): boolean {
  return !!v.signature?.blobKey;
}

export function nextSignatureRef(logId: string, people: SiteAccessVisitor[]): string {
  let highest = 0;
  for (const v of people) {
    const m = /_S(\d+)$/.exec(v.signature?.ref ?? "");
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `${logId}_S${String(highest + 1).padStart(2, "0")}`;
}

export function logGaps(log: SiteAccessLog): string[] {
  const gaps: string[] = [];
  if (log.people.length === 0) gaps.push("nobody recorded");
  if (!log.area.trim()) gaps.push("no area recorded");
  if (!log.escortedBy.trim()) gaps.push("no escort recorded");
  return gaps;
}

export function unbackedSignatures(log: SiteAccessLog): Signature[] {
  return log.people
    .map((v) => v.signature)
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

export function logText(
  log: SiteAccessLog,
  ctx: { siteName: string; siteCode: string; visitId: string }
): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);

  const lines = [
    `SITE ACCESS LOG — ${log.id}`,
    `${ctx.siteName}`,
    "",
    `Reference       ${ctx.siteCode}-${log.id}`,
    `Audit           ${ctx.visitId}`,
    `Date            ${log.date}`,
    `Area            ${L(log.area)}`,
    `Purpose         ${L(log.purpose)}`,
    `Escorted by     ${L(log.escortedBy)}`,
    `Opened          ${stamp(log.openedAt)}`,
    `Opened by       ${L(log.openedBy)}`,
    "",
    "WHO WENT IN",
  ];

  if (log.people.length === 0) {
    lines.push(unknown);
  } else {
    for (const v of log.people) {
      lines.push("");
      lines.push(`${L(v.name)} — ${v.side}${v.organisation.trim() ? `, ${v.organisation.trim()}` : ""}`);
      lines.push(
        `  Signature     ${
          v.signature
            ? `${v.signature.ref}, signed ${stamp(v.signature.signedAt)} as "${v.signature.signedName}"`
            : "NOT SIGNED"
        }`
      );
    }
  }

  const gaps = logGaps(log);
  if (gaps.length) lines.push("", `STILL OWED: ${gaps.join(", ")}`);

  lines.push("", "Thabile Pridin JV");
  return lines.join("\n");
}
