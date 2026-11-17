/* THE PRINTABLE ROOT-CAUSE REPORT — Sarel: "Scope out and build for me
 * reports for all the information that we captured. Similar type of
 * information as what we have in the review root cause page that would
 * make it look professional. Take some guidance from the PDF reports I've
 * shared with you... generate a report based on the discipline that's
 * selected in the filters."
 *
 * Two new files: src/app/report/page.tsx (the route, outside the (app)
 * route group — no AppShell nav) and src/components/ReviewRiskReport.tsx
 * (the printable content), plus a "Generate report" trigger wired into
 * ReviewRiskTable.tsx's own discipline filter.
 *
 * Source-read, same bespoke-runner convention every other suite here uses —
 * see tests/review-table-v2.test.mjs's own header for why this is more
 * reliable than mounting React to print a page. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const report = src("components", "ReviewRiskReport.tsx");
const reportPage = src("app", "report", "page.tsx");
const table = src("components", "ReviewRiskTable.tsx");
const riskVocab = src("lib", "riskVocab.ts");
const globals = src("app", "globals.css");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · the route lives outside (app) on purpose ---------------------- */

check(
  "the report route is outside the (app) route group — no AppShell nav on a page meant to be printed",
  fs.existsSync(path.join(here, "..", "src", "app", "report", "page.tsx")) &&
    !fs.existsSync(path.join(here, "..", "src", "app", "(app)", "report"))
);
check(
  "it reads only ?discipline= from the URL — everything else comes off the same persisted store a new tab already shares",
  /searchParams\.get\("discipline"\)/.test(reportPage) &&
    !/searchParams\.get\("entity"\)/.test(reportPage) &&
    !/searchParams\.get\("visit"\)/.test(reportPage)
);
check(
  "useSearchParams is wrapped in Suspense, same pattern review/page.tsx and findings/page.tsx already use",
  /<Suspense/.test(reportPage) && /useSearchParams/.test(reportPage)
);
check(
  "it carries the same hydration gate AppShell gives every other screen — this page has no shell to borrow it from",
  /useStore\(\(s\) => s\.hydrated\)/.test(reportPage) && /if \(!hydrated\)/.test(reportPage)
);
check(
  "with no discipline in the URL it says so rather than rendering an empty report",
  /if \(!discipline\)/.test(reportPage)
);

/* ---- 2 · findings scoped by discipline, off the real hooks ------------- */

check(
  "findings come from useVisitFindings — the same scoped-by-entity-and-visit hook every other Review surface uses, not a second query",
  /useVisitFindings\(\)/.test(reportPage)
);
check(
  "the report further narrows to exactly the one discipline in the URL",
  /findings\.filter\(\(f\) => f\.discipline === discipline\)/.test(reportPage)
);

/* ---- 3 · the report content reuses real vocab/functions, no new copies - */

check(
  "the three-source Finding text (desk note, finding, evidence review) is in the SAME order the table's own Finding column uses",
  (() => {
    const start = report.indexOf("function findingText(");
    const fn = start === -1 ? "" : report.slice(start, report.indexOf("\n}\n", start) + 2);
    return (
      fn.length > 0 &&
      fn.indexOf("r?.observation") < fn.indexOf("f.title || f.description || f.id") &&
      fn.indexOf("f.title || f.description || f.id") < fn.indexOf("r?.evidenceProves")
    );
  })()
);
check(
  "root cause / impact distributions use the SAME countByMultiSelect every other roll-up in this app uses — not a second counting function",
  /import \{ countByMultiSelect, findingTypeFor, FINDING_TYPE_LABEL \} from "@\/lib\/reviewRisk"/.test(report) &&
    /countByMultiSelect\(findings, \(f\) => f\.rootCauseCategories\)/.test(report) &&
    /countByMultiSelect\(findings, \(f\) => f\.impactAreas\)/.test(report)
);
check(
  "the timeline distribution reads TIMELINES from riskVocab.ts, not a hand-typed list that could drift from the table's own",
  /import \{ ROOT_CAUSES, IMPACT_AREAS, TIMELINES \} from "@\/lib\/riskVocab"/.test(report)
);
check(
  "TIMELINES is still exactly the three categories this report's distribution table assumes",
  /export const TIMELINES = \["Immediate", "Before next audit", "Long term"\];/.test(riskVocab)
);
check(
  "Type reads findingTypeFor/FINDING_TYPE_LABEL — the same non-compliance/observation classification the table uses, not a re-derived one",
  /findingTypeFor\(f\)/.test(report) && /FINDING_TYPE_LABEL\[type\]/.test(report)
);

/* ---- 4 · print output is deterministic, not theme- or viewport-dependent */

check(
  "colours are fixed hex, never this app's var(--acc)/var(--ink) theme variables — a report printed from a dark-mode session must not print dark",
  !/var\(--/.test(report)
);
check(
  "a page.pdf()/print run gets A4 pages with a repeating page-number footer via CSS Paged Media, not a hand-rolled page-break scheme",
  /@page \{/.test(report) &&
    /size: A4/.test(report) &&
    /counter\(page\)/.test(report) &&
    /counter\(pages\)/.test(report)
);
check(
  "the findings list is a plain HTML <table>, specifically so the browser repeats <thead> on every printed page with no custom pagination code",
  /thead \{ display: table-header-group; \}/.test(report)
);
check(
  "table rows and KPI cards are guarded against being split across a page break",
  /tr, \.rr-card \{ break-inside: avoid; \}/.test(report)
);
check(
  "the on-screen toolbar (Download PDF button) is hidden in print, so it never shows up on the PDF itself",
  /\.rr-report-toolbar \{ display: none !important; \}/.test(report)
);

/* ---- 5 · the app's fixed-shell html/body rule is overridden for this
   route specifically, not edited globally — see globals.css's own note on
   why that rule exists app-wide. */

check(
  "globals.css still sets the app-wide fixed-shell html/body rule — untouched by this feature",
  /html,\s*\nbody \{\s*\n\s*height: 100%;\s*\n\s*overflow: hidden;/.test(globals)
);
check(
  "the report overrides that rule for its own route only (inside its own <style>, not in globals.css) — print pagination needs real overflow, which a 100%-height hidden body never gives it",
  /html, body \{ height: auto !important; overflow: visible !important; background: #FFFFFF !important; \}/.test(report)
);

/* ---- 6 · the trigger on the Review table ------------------------------- */

check(
  "ReviewRiskTable.tsx has a Generate report link, enabled only once a discipline is picked — not system/impact/root-cause, which narrow WITHIN a discipline rather than naming one",
  /filter\.kind === "discipline" \? \(/.test(table) &&
    /href=\{`\/report\?discipline=\$\{encodeURIComponent\(filter\.discipline\)\}`\}/.test(table)
);
check(
  "it opens in a new tab, not router.push — the report is meant to be printed/saved and come back to, not navigated away to",
  (() => {
    const start = table.indexOf("Generate report");
    const near = start === -1 ? "" : table.slice(Math.max(0, start - 400), start);
    return /target="_blank"/.test(near) && /rel="noopener noreferrer"/.test(near);
  })()
);
check(
  "with no discipline picked, the button is disabled with a tooltip explaining why — same convention EvidenceReviewView's own discipline-gated button uses",
  /disabled\s*\n\s*title="Pick one discipline above first/.test(table)
);

console.log(failures === 0 ? "\nREVIEW REPORT OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
