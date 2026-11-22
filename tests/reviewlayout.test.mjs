import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* REVIEW LAYOUT CLEANUP (PRIORITY 1 of the Review redesign) — "Risk & root
 * cause" tab only. §1: remove the bottom summary table/cards with no
 * replacement dashboard (covered in review-table-v2.test.mjs, alongside the
 * reference-code checks it already owns); open the right-hand panel ONLY
 * when a row is selected, with a clear close button, independent scroll,
 * no clipping on desktop or tablet. This file owns the open/close/scroll
 * assertions; it does not re-test the roll-up removal.
 *
 * Source-text regex convention, same as every other review/evidence suite
 * in this repo — no DOM renderer available. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

/* build prompt 8 (22 Nov 2026): /review is now a redirect; the Risk &
   root cause table/panel mounting this suite reads moved to
   issues/page.tsx's own IssuesRiskView, reusing the exact same
   ReviewRiskTable/ReviewRiskPanel components and the same
   onChange-through-updateFinding division of labour. */
const reviewPage = read("src", "app", "(app)", "issues", "page.tsx");
const panel = read("src", "components", "ReviewRiskPanel.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · the panel defaults closed, not pinned to the first finding ---- */

/* build prompt 8 (22 Nov 2026): IssuesRiskView names the selected finding
   `active`/`activeId`, not `riskActive`/`riskActiveId` — a reusable
   component, not review/page.tsx's own inline code. Same invariants,
   different names throughout this file's remaining checks. */
check(
  "active has no findings[0] fallback — nothing selected means nothing active",
  (() => {
    const m = reviewPage.match(/const active = [^\n]+;/);
    return !!m && !m[0].includes("findings[0]") && /\?\? null/.test(m[0]);
  })()
);

/* ---- 2 · the panel column only renders once a row is active ----------- */

check(
  "the risk view's right column is conditional on active — not an always-mounted hidden/empty placeholder",
  /isWide && panelProps && \(/.test(reviewPage)
);
check(
  "the old always-open 'no findings raised' filler for the risk tab is gone — the column itself is absent, not an empty state inside it",
  !/No findings raised this visit\./.test(reviewPage)
);

/* ---- 3 · a clear close control, wired to clear the selection ----------- */

check(
  "ReviewRiskPanel takes an onClose prop",
  /onClose: \(\) => void/.test(panel)
);
check(
  "the panel renders a close button that calls onClose",
  /aria-label="Close finding panel"[\s\S]{0,40}onClick=\{onClose\}|onClick=\{onClose\}[\s\S]{0,120}aria-label="Close finding panel"/.test(
    panel
  ) || (/onClick=\{onClose\}/.test(panel) && /aria-label="Close finding panel"/.test(panel))
);
check(
  "the page wires that close handler to clear activeId, not some other state",
  /onClose: \(\) => setActiveId\(null\),/.test(reviewPage)
);

/* ---- 4 · independent scroll, sticky header, no clipping ---------------- */

check(
  "the panel owns its own scroll container, separate from a sticky header — not one undifferentiated overflow box",
  /sticky top-0[\s\S]{0,200}shrink-0/.test(panel) && /flex-1 overflow-y-auto/.test(panel)
);
check(
  /* `isWide` (a JS media-query hook, not a CSS `hidden md:flex` class) gates
     which of the inline column or a Sheet mounts, same reasoning the Walk
     screen's own WideCheckPane/Sheet split already documents at length —
     never both at once, so the column itself carries no `hidden` class; the
     condition above already keeps it from mounting at all below `md`. */
  "the outer panel column is a bounded flex column (min-h-0), so the inner flex-1 scroll area actually clips to the viewport instead of growing past it",
  /flex min-h-0 w-\[320px\] shrink-0 flex-col border-l/.test(reviewPage)
);

console.log(failures === 0 ? "\nREVIEW LAYOUT OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
