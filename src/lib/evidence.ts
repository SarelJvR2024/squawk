/** The document and evidence collection log — TK-003 form 7, and its rules.
 *
 *  Pure, and out of both screen and store, because the register, the store and
 *  the composed log all need the same answers. A second copy of "is this one
 *  still outstanding?" is how a register comes to show nothing owed while an
 *  auditor is still waiting for four documents. */

import type {
  EvidenceItem,
  EvidenceMedium,
  EvidenceStage,
  Signature,
} from "@/lib/types";

export const MEDIUM_LABEL: Record<EvidenceMedium, string> = {
  paper: "Paper",
  digital: "Digital file",
  photographed: "Photographed",
  portal: "From the portal",
  verbal: "Verbal only",
};

/** Media that leave TPJV holding something of ACSA's.
 *
 *  A photograph of a certificate on a desk is a picture TPJV owns; the paper
 *  never moved and there is nothing to give back. A file handed over is a file
 *  that has to go back, and only paper and digital originals can be. */
export const RETURNABLE: readonly EvidenceMedium[] = ["paper", "digital"];

/** Where an item has got to.
 *
 *  `returned` outranks `received` because it is the later fact about the same
 *  document, and `unavailable` sits below both because producing a document
 *  contradicts having declared it unproducible — the store clears the
 *  declaration on receipt, and this ordering means a stale one cannot make a
 *  received document read as missing. */
export function evidenceStage(e: EvidenceItem): EvidenceStage {
  if (e.returnedAt) return "returned";
  if (e.receivedAt) return "received";
  if (e.unavailableAt) return "unavailable";
  return "requested";
}

/** Still owed: asked for, nothing handed over, and nobody has said it cannot
 *  be produced.
 *
 *  This is the RFI list, and it is the reason the log records a request at all.
 *  A register of what arrived cannot answer the only question anybody asks it
 *  between site visits. */
export function isOutstanding(e: EvidenceItem): boolean {
  return !e.receivedAt && !e.unavailableAt;
}

export function outstanding(items: EvidenceItem[]): EvidenceItem[] {
  return items.filter(isOutstanding);
}

/** ACSA's own paper, still in TPJV's bag.
 *
 *  An obligation with a clock on it. `isOriginal` and a medium that can
 *  actually be held: a photographed document is never an original held, however
 *  the box is ticked, because nothing left ACSA's premises. */
export function isHeldOriginal(e: EvidenceItem): boolean {
  return (
    e.isOriginal &&
    !!e.receivedAt &&
    !e.returnedAt &&
    e.medium !== null &&
    RETURNABLE.includes(e.medium)
  );
}

export function heldOriginals(items: EvidenceItem[]): EvidenceItem[] {
  return items.filter(isHeldOriginal);
}

/** How long an original has been held, or was held. `now` of 0 means the
 *  device's clock has not been read — see src/lib/clock.ts — and it returns
 *  null rather than reporting fifty-six years. */
export function heldMs(e: EvidenceItem, now: number): number | null {
  if (!e.receivedAt) return null;
  const end = e.returnedAt ?? (now || 0);
  if (!end) return null;
  return Math.max(0, end - e.receivedAt);
}

/** Every check-point this log bears on, deduplicated, first-cited order. */
export function checkIdsCovered(items: EvidenceItem[]): string[] {
  const seen: string[] = [];
  for (const e of items) {
    for (const id of e.checkIds) if (!seen.includes(id)) seen.push(id);
  }
  return seen;
}

/** Check-points marked "compliant, evidence pending" with nothing logged here.
 *
 *  THE BRIDGE BETWEEN THE TWO RECORDS, and the reason this form pays for
 *  itself. `Response.evidencePending` means ACSA said they are compliant and the
 *  proof is still to come — which is a debt somebody owes TPJV, recorded on the
 *  check screen by whoever was at the desk. If nothing in this log names that
 *  check, then nobody is chasing it and nobody will notice until the report is
 *  being written.
 *
 *  Takes ids rather than responses so the register can call it without this
 *  module knowing what a Response is. */
export function pendingWithoutEntry(
  pendingCheckIds: string[],
  items: EvidenceItem[]
): string[] {
  const covered = new Set(checkIdsCovered(items));
  return pendingCheckIds.filter((id) => !covered.has(id));
}

/** What an item is still missing, as a list. An entry is deliberately saveable
 *  with only a title — somebody is handing you a folder and walking off — so
 *  incomplete is the normal state and the register says which parts are owed. */
export function itemGaps(e: EvidenceItem): string[] {
  const gaps: string[] = [];
  if (!e.title.trim()) gaps.push("what it is");
  if (!e.checkIds.length) gaps.push("which check-points it bears on");
  if (e.receivedAt) {
    if (!e.receivedFrom.trim()) gaps.push("who handed it over");
    if (!e.medium) gaps.push("how it was received");
    if (!e.signature?.blobKey) gaps.push("the collector's signature");
  } else if (!e.unavailableAt) {
    if (!e.requestedFrom.trim()) gaps.push("who it was asked of");
  } else if (!e.unavailableReason.trim()) {
    gaps.push("why it cannot be produced");
  }
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

function dayOnly(t: number): string {
  return new Date(t).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export interface LogContext {
  siteName: string;
  siteCode: string;
  visitId: string;
  /** Turns a canonical check id into the one printed at this site. Passed in so
   *  this module stays free of the register. */
  portalId?: (checkId: string) => string;
}

/** The log as plain text, to send with an RFI or paste into the file.
 *
 *  Composed here for the reason every other record in this app is: the thing
 *  that decides whether a request is actually chased is whether somebody had to
 *  retype eleven document titles at the end of a site day.
 *
 *  Outstanding items come FIRST and are marked, because they are the only part
 *  of this that anybody acts on. A log ordered by when things happened buries
 *  the four documents nobody has sent under thirty that arrived. */
export function logText(items: EvidenceItem[], ctx: LogContext): string {
  const unknown = "— not recorded —";
  const L = (s: string) => (s.trim() ? s.trim() : unknown);
  const pid = ctx.portalId ?? ((id: string) => id);

  const still = outstanding(items);
  const held = heldOriginals(items);
  const done = items.filter((e) => !isOutstanding(e));

  const lines = [
    `DOCUMENT AND EVIDENCE COLLECTION LOG`,
    `${ctx.siteName}`,
    "",
    `Reference       ${ctx.siteCode}-DOC`,
    `Audit           ${ctx.visitId}`,
    `Entries         ${items.length}`,
    `Outstanding     ${still.length}`,
    `Originals held  ${held.length}`,
  ];

  const describe = (e: EvidenceItem) => {
    const out: string[] = [];
    out.push(
      `${e.id}  ${L(e.title)}${e.documentNo.trim() ? ` (${e.documentNo.trim()}${
        e.revision.trim() ? ` rev ${e.revision.trim()}` : ""
      })` : ""}`
    );
    if (e.documentDate) out.push(`  Dated         ${dayOnly(e.documentDate)}`);
    if (e.requestedAt) {
      out.push(`  Requested     ${stamp(e.requestedAt)} from ${L(e.requestedFrom)}`);
    }
    if (e.receivedAt) {
      out.push(
        `  Received      ${stamp(e.receivedAt)} from ${L(e.receivedFrom)}, ${
          e.medium ? MEDIUM_LABEL[e.medium] : unknown
        }`
      );
      out.push(`  Collected by  ${L(e.receivedBy)}`);
      out.push(
        `  Signature     ${
          e.signature
            ? `${e.signature.ref}, ${stamp(e.signature.signedAt)}`
            : "NOT SIGNED"
        }`
      );
    }
    if (e.isOriginal) {
      out.push(
        `  Original      ${
          e.returnedAt
            ? `returned ${stamp(e.returnedAt)} to ${L(e.returnedTo)}`
            : isHeldOriginal(e)
              ? "STILL HELD BY TPJV"
              : "marked original"
        }`
      );
    }
    if (e.unavailableAt && !e.receivedAt) {
      out.push(`  NOT PRODUCED  ${stamp(e.unavailableAt)} — ${L(e.unavailableReason)}`);
    }
    if (e.checkIds.length) {
      out.push(`  Bears on      ${e.checkIds.map(pid).join(", ")}`);
    }
    if (e.notes.trim()) out.push(`  Note          ${e.notes.trim()}`);
    return out;
  };

  /* OUTSTANDING FIRST. It is the only section anybody acts on, and burying it
     under what already arrived is how a request goes unchased for a month. */
  lines.push("", "STILL OUTSTANDING");
  if (still.length === 0) {
    lines.push("Nothing outstanding.");
  } else {
    for (const e of still) {
      lines.push("");
      lines.push(...describe(e));
    }
  }

  if (held.length) {
    lines.push(
      "",
      "ACSA ORIGINALS HELD BY TPJV — to be returned",
    );
    for (const e of held) {
      lines.push("");
      lines.push(...describe(e));
    }
  }

  lines.push("", "RECEIVED AND CLOSED");
  if (done.length === 0) {
    lines.push("Nothing received yet.");
  } else {
    for (const e of done) {
      lines.push("");
      lines.push(...describe(e));
    }
  }

  lines.push(
    "",
    "Recorded on TK-003 form 7. It is a chain-of-custody record of ACSA's own",
    "documents, not an audit observation: what a document proves is decided on",
    "the check-point it bears on, and nothing here settles one.",
    "",
    "Thabile Pridin JV"
  );

  return lines.join("\n");
}

/** Signatures on this log that the record store has no copy of. Same warning as
 *  the attendance register's, and the same gap behind it. */
export function unbackedSignatures(items: EvidenceItem[]): Signature[] {
  return items
    .map((e) => e.signature)
    .filter((s): s is Signature => !!s && !s.cloudUrl);
}
