import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* REVIEW PANEL CONTENT COMPLETENESS (PRIORITY 4 of the Review redesign) —
 * Risk & root cause tab only. "Show all relevant notes, photos, recordings
 * and compliance assessments, clearly identifying their source."
 *
 * The finding's own description/attachments are rendered via the existing
 * AttachmentStrip (src/components/Capture.tsx), not a reimplementation.
 * The linked-check compliance summary is computed via the EXACT same
 * functions ReviewDetail.tsx's own sticky strip uses
 * (reviewCombinedCompliance/evidenceAxisFor, src/lib/review.ts) — never
 * re-derived — and is omitted entirely when the finding carries no
 * checkId, rather than rendered empty.
 *
 * Source-text regex convention, same as every other review suite, plus a
 * behavioral check against the real review.ts functions. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

const panel = read("src", "components", "ReviewRiskPanel.tsx");
const review = await import("../src/lib/review.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · the finding's own notes/photos/recordings, via the shared
   component, not a second gallery implementation ------------------------ */

check(
  "AttachmentStrip is imported from Capture.tsx, not reimplemented",
  /import \{ AttachmentStrip \} from "@\/components\/Capture"/.test(panel)
);
check(
  "the finding's own attachments render through it, read-only (no onRemove/onUpdate wired here)",
  /<AttachmentStrip attachments=\{finding\.attachments\}/.test(panel) &&
    !/<AttachmentStrip attachments=\{finding\.attachments\}[^>]*onRemove/.test(panel) &&
    !/<AttachmentStrip attachments=\{finding\.attachments\}[^>]*onUpdate/.test(panel)
);
check(
  "the notes/attachments block is clearly labelled as THIS finding's own capture, not the linked check's",
  /Notes, photos &amp; recordings — this finding/.test(panel)
);
check(
  "nothing is rendered when the finding has neither a description nor attachments — no empty card",
  /\{\(finding\.description \|\| finding\.attachments\.length > 0\) && \(/.test(panel)
);
check(
  "the full description renders, not a truncated preview — whitespace-pre-wrap, no .slice() on it",
  /\{finding\.description\}/.test(panel) && !/finding\.description\.slice/.test(panel)
);

/* ---- 2 · the linked-check compliance summary — derived, never re-derived,
   omitted (not emptied) with no checkId ---------------------------------- */

check(
  "the summary reuses reviewCombinedCompliance/evidenceAxisFor from review.ts, the same functions ReviewDetail.tsx's own strip uses",
  /import \{ evidenceAxisFor, reviewCombinedCompliance \} from "@\/lib\/review"/.test(panel) &&
    /reviewCombinedCompliance\(linkedResponse\.compliance, linkedEvidenceAxis, linkedResponse\.siteInspection\)/.test(
      panel
    )
);
check(
  "the evidence axis is scoped to EvidenceItems linked to THIS check, same e.checkIds.includes(...) filter ReviewDetail.tsx uses",
  /evidenceItems\.filter\(\(e\) => e\.checkIds\.includes\(finding\.checkId!\)\)/.test(panel)
);
check(
  "the summary section is gated on finding.checkId AND a real response existing — never rendered empty",
  /\{finding\.checkId && linkedResponse && \(/.test(panel)
);
check(
  "it is read-only — no <select>/<input> inside the summary card, only ComplianceChip/Pill",
  (() => {
    const start = panel.indexOf(">From linked audit check<");
    const end = panel.indexOf(">Risk</div>", start);
    const card = start !== -1 && end !== -1 ? panel.slice(start, end) : "";
    return card.length > 0 && !/<select/.test(card) && !/<input/.test(card);
  })()
);
check(
  "\"Open in By check\" hands off to the caller's onOpenCheck rather than duplicating ReviewDetail's own editing UI here",
  /onClick=\{\(\) => onOpenCheck\(finding\.checkId!\)\}/.test(panel)
);
check(
  "the page wires onOpenCheck to switch BOTH the discipline filter and the active check, not just the tab",
  (() => {
    const reviewPage = read("src", "app", "(app)", "review", "page.tsx");
    return (
      /const openCheckInByCheckTab = \(checkId: string\) => \{/.test(reviewPage) &&
      /setDiscipline\(c\.discipline\)/.test(reviewPage) &&
      /setActiveId\(checkId\)/.test(reviewPage) &&
      /setTab\("checks"\)/.test(reviewPage)
    );
  })()
);

/* ---- 3 · behavioral: the summary's numbers are exactly what
   reviewCombinedCompliance/evidenceAxisFor compute, not a hand-typed copy ---- */

check(
  "a document rated non-compliant pulls the evidence axis down, and the combined reading reflects it — same rule the panel's import computes with",
  (() => {
    const evidenceAxis = review.evidenceAxisFor("C", [{ complianceRating: "nonCompliant" }]);
    const combined = review.reviewCombinedCompliance("C", evidenceAxis, "C");
    return evidenceAxis === "NC" && combined === "NC";
  })()
);
check(
  "all three axes compliant and no rated evidence reads as compliant combined, not a stale 'not verified'",
  (() => {
    const evidenceAxis = review.evidenceAxisFor("C", []);
    const combined = review.reviewCombinedCompliance("C", evidenceAxis, "C");
    return evidenceAxis === "C" && combined === "C";
  })()
);

console.log(failures === 0 ? "\nREVIEW PANEL CONTENT OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
