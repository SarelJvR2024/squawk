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
/* PRIORITY 7 — description became an editable <textarea> in this same
 * section once "Suggest wording" needed an ordinary field to improve, so
 * the block itself is no longer conditional on having content (same
 * reasoning the root-cause-note field already applies: an empty editable
 * field still renders, it just starts empty) — only the attachments
 * strip below it stays conditional on content actually existing. */
check(
  "the description is an editable textarea, not a read-only paragraph",
  /<textarea\s*\n\s*value=\{finding\.description\}\s*\n\s*onChange=\{\(e\) => onChange\(\{ description: e\.target\.value \}\)\}/.test(
    panel
  )
);
check(
  "attachments stay conditional on actually having any — no empty strip",
  /\{finding\.attachments\.length > 0 && <AttachmentStrip/.test(panel)
);
check(
  "the full description is editable, not truncated — no .slice() on the value bound to the textarea",
  !/value=\{finding\.description\.slice/.test(panel)
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
  /* End anchor moved 16 Nov 2026: the "Risk" heading this used to stop at
     (RatingPicker/mini-matrix section) is gone — Sarel, "we're not going to
     do severity and likelihood ratings on a finding level... only on an
     asset system level." Impact areas is now the next section after the
     summary card. */
  "it is read-only — no <select>/<input> inside the summary card, only ComplianceChip/Pill",
  (() => {
    const start = panel.indexOf(">From linked audit check<");
    const end = panel.indexOf(">Impact areas</div>", start);
    const card = start !== -1 && end !== -1 ? panel.slice(start, end) : "";
    return card.length > 0 && !/<select/.test(card) && !/<input/.test(card);
  })()
);
check(
  /* build prompt 8 (22 Nov 2026): the button's own text changed from
     "Open in By check" to "Open check" — the "By check" tab it used to
     name is retired, see this file's own next check. */
  "\"Open check\" hands off to the caller's onOpenCheck rather than duplicating ReviewDetail's own editing UI here",
  /onClick=\{\(\) => onOpenCheck\(finding\.checkId!\)\}/.test(panel)
);
check(
  "the Issues screen wires onOpenCheck to the real Checks screen directly — the 'By check' tab/tree it used to switch is retired, folded into Checks itself (build prompt 3), not into Issues",
  (() => {
    const issuesPage = read("src", "app", "(app)", "issues", "page.tsx");
    return /onOpenCheck: \(checkId: string\) => router\.push\(`\/capture\?check=\$\{checkId\}`\),/.test(
      issuesPage,
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
