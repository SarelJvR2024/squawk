/** PPE checks — the logic shared between the store and the /ppe screen, kept
 *  out of both for the same reason src/lib/attendance.ts is: the store needs
 *  to know when a patch unsigns a row, and the screen needs the same answer
 *  to show the same thing, and a second copy of that rule is how the two
 *  disagree. */

import type { PpeCheck, PpeEntry, PpeItemKey, PpeStatus, Signature } from "@/lib/types";

/** The three items Sarel asked this register to check. See the note on
 *  PpeItemKey in src/lib/types.ts for why the array lives here rather than
 *  with the type. */
export const PPE_ITEMS: readonly PpeItemKey[] = ["hiVisJacket", "safetyShoes", "hearingProtection"];

export const PPE_ITEM_LABEL: Record<PpeItemKey, string> = {
  hiVisJacket: "High-visibility retro-reflective jacket",
  safetyShoes: "Safety shoes",
  hearingProtection: "Hearing protection",
};

/** What a signature here signs for: who they are, who they work for, their
 *  role, and the ticks themselves. Change any of it and the mark is of a
 *  different statement. */
export function signedFieldsChanged(p: Partial<PpeEntry>): boolean {
  if (p.name !== undefined || p.organisation !== undefined || p.role !== undefined) {
    return true;
  }
  return p.items !== undefined;
}

/* DECISION REVERSED. Hi-vis and safety shoes used to default to "missing" so
   they read as an outstanding gap until ticked, and only hearing protection
   started at "notApplicable" outside a declared noise zone. Sarel: "default
   for all PPE should be NA, first click should make it Compliant" — every
   item now starts neutral, and the auditor's first tap is the one that marks
   it rather than clears a false "missing" nobody has looked at yet. */
export function blankItems(): Record<PpeItemKey, PpeStatus> {
  return PPE_ITEMS.reduce(
    (acc, k) => {
      acc[k] = "notApplicable";
      return acc;
    },
    {} as Record<PpeItemKey, PpeStatus>
  );
}

export function isSigned(e: PpeEntry): boolean {
  return !!e.signature?.blobKey;
}

/** Every item that is actually missing — "not applicable" is not a gap. */
export function missingItems(e: PpeEntry): PpeItemKey[] {
  return PPE_ITEMS.filter((k) => e.items[k] === "missing");
}

export function nextSignatureRef(checkId: string, people: PpeEntry[]): string {
  let highest = 0;
  for (const e of people) {
    const m = /_S(\d+)$/.exec(e.signature?.ref ?? "");
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `${checkId}_S${String(highest + 1).padStart(2, "0")}`;
}

export function checkGaps(check: PpeCheck): string[] {
  const gaps: string[] = [];
  if (check.people.length === 0) gaps.push("nobody recorded");
  const unsigned = check.people.filter((e) => !isSigned(e)).length;
  if (unsigned) gaps.push(`${unsigned} unsigned`);
  const short = check.people.filter((e) => missingItems(e).length > 0).length;
  if (short) gaps.push(`${short} with missing PPE`);
  return gaps;
}

export function unbackedSignatures(check: PpeCheck): Signature[] {
  return check.people
    .map((e) => e.signature)
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

const STATUS_LABEL: Record<PpeStatus, string> = {
  compliant: "OK",
  missing: "MISSING",
  notApplicable: "N/A",
};

export function checkText(
  check: PpeCheck,
  ctx: { siteName: string; siteCode: string; visitId: string }
): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);

  const lines = [
    `PPE CHECK — ${check.id}`,
    `${ctx.siteName}`,
    "",
    `Reference       ${ctx.siteCode}-${check.id}`,
    `Audit           ${ctx.visitId}`,
    `Date            ${check.date}`,
    `Location        ${L(check.location)}`,
    `Purpose         ${L(check.purpose)}`,
    `Noise zone      ${check.noiseZone ? "yes" : "no"}`,
    `Opened          ${stamp(check.openedAt)}`,
    `Opened by       ${L(check.openedBy)}`,
    "",
  ];

  if (check.people.length === 0) {
    lines.push(unknown);
  } else {
    for (const e of check.people) {
      lines.push(`${L(e.name)} — ${L(e.role)}, ${L(e.organisation)}`);
      for (const k of PPE_ITEMS) {
        lines.push(`  ${k.padEnd(20)}${STATUS_LABEL[e.items[k]]}`);
      }
      if (e.notes.trim()) lines.push(`  Notes               ${e.notes.trim()}`);
      lines.push(
        `  Signature           ${
          e.signature
            ? `${e.signature.ref}, signed ${stamp(e.signature.signedAt)} as "${e.signature.signedName}"`
            : "NOT SIGNED"
        }`
      );
      lines.push("");
    }
  }

  const gaps = checkGaps(check);
  if (gaps.length) lines.push(`STILL OWED: ${gaps.join(", ")}`, "");

  lines.push("Thabile Pridin JV");
  return lines.join("\n");
}
