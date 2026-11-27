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
const panel = src("components", "ReviewRiskPanel.tsx");
const riskVocab = src("lib", "riskVocab.ts");
const globals = src("app", "globals.css");
const typesSrc = src("lib", "types.ts");
const storeSrc = src("lib", "store.ts");
const sharepointSrc = src("lib", "sharepoint.ts");
const exportsSrc = src("lib", "exports.ts");

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
      fn.indexOf("r?.observation") < fn.indexOf("reportFindingText(f") &&
      fn.indexOf("reportFindingText(f") < fn.indexOf("r?.evidenceProves")
    );
  })()
);
check(
  "root cause / impact distributions use the SAME countByMultiSelect every other roll-up in this app uses — not a second counting function",
  /import \{ countByMultiSelect, findingTypeFor \} from "@\/lib\/reviewRisk"/.test(report) &&
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
  "the non-compliance/observation split reads findingTypeFor — the same classification the table uses — and the Type column is gone (the section heading already says which it is)",
  /findingTypeFor\(f\) === "non-compliance"/.test(report) && !/<th[^>]*>Type<\/th>/.test(report)
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
  /tr, \.report-card, \.metric-box, \.rr-card, figure \{ break-inside: avoid; page-break-inside: avoid; \}/.test(report) &&
    /tbody\.rr-unit \{ break-inside: avoid/.test(report) &&
    /rr-table tbody tr:last-child \{ break-before: avoid; \}/.test(report)
);
check(
  "the on-screen toolbar (Download PDF button) is hidden in print, so it never shows up on the PDF itself",
  /\.rr-report-toolbar, \.rr-noprint \{ display: none !important; \}/.test(report)
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
  /fx\.discipline \? \(/.test(table) &&
    /href=\{`\/report\?discipline=\$\{encodeURIComponent\(fx\.discipline\)\}`\}/.test(table)
);
check(
  "it opens in a new tab, not router.push — the report is meant to be printed/saved and come back to, not navigated away to",
  (() => {
    const start = table.indexOf("Report for {fx.discipline}");
    const near = start === -1 ? "" : table.slice(Math.max(0, start - 400), start);
    return /target="_blank"/.test(near) && /rel="noopener noreferrer"/.test(near);
  })()
);
check(
  "with no discipline picked, the button is disabled with a tooltip explaining why — same convention EvidenceReviewView's own discipline-gated button uses",
  /title="Pick one discipline in the filter first"/.test(table)
);

/* ---- 7 · Finding.actionPlan — Sarel: "Add an option to add action and
   improvement plan for any row in the root cause table. This will be the
   action plan for the airports to improve the asset assurance." -------- */

check(
  "Finding.actionPlan exists, optional and free text, same shape as rootCauseNote",
  /actionPlan\?: string;/.test(typesSrc)
);
check(
  "the persist version bumped for it, with a no-op migration (purely additive, same reasoning as Finding.timeline's own v43 entry)",
  /version: 45,/.test(storeSrc) && /if \(from < 44\)/.test(storeSrc)
);
check(
  "the Action plan is edited in the drawer (Sarel, 27 Nov 2026: the table row is one line), no longer as a table column with its own popover cell",
  !/function ActionPlanCell/.test(table) && !/<Th>Action plan<\/Th>/.test(table) && /Action &amp; improvement plan/.test(panel)
);
check(
  "the drawer (ReviewRiskPanel) ALSO carries the field — RiskPatch includes actionPlan, and its own textarea binds directly",
  /\| "actionPlan"/.test(panel) &&
    /value={finding\.actionPlan \?\? ""}/.test(panel) &&
    /onChange={\(e\) => onChange\({ actionPlan: e\.target\.value }\)}/.test(panel)
);
check(
  "the action plan is kept distinct from the root-cause note everywhere — different labels, different fields, never aliased",
  /Action \&amp;? ?improvement plan|Action & improvement plan/.test(panel) &&
    !/rootCauseNote.*actionPlan|actionPlan.*rootCauseNote/.test(panel)
);

/* ---- 8 · the sync — Sarel: "add to the sync to SharePoint." Same
   findingRiskFieldsFor() aggregation shape as the other four Review
   risk-fields, on both the portal and the workbook, never just one. ---- */

check(
  "findingRiskFieldsFor returns actionPlan, aggregated the same join-distinct-non-empty way as rootCauseNote",
  (() => {
    const start = sharepointSrc.indexOf("export function findingRiskFieldsFor");
    const fn = start === -1 ? "" : sharepointSrc.slice(start, sharepointSrc.indexOf("\n}\n", start) + 2);
    return (
      fn.length > 0 &&
      /actionPlan: string \| null;/.test(fn) &&
      /actionPlans\.add\(plan\)/.test(fn) &&
      /actionPlan: actionPlans\.size \? \[\.\.\.actionPlans\]\.join\(" \| "\) : null/.test(fn)
    );
  })()
);
check(
  "findingActionPlan has real SharePoint column candidates and is in the FINDINGS contract, so the column actually gets asked for",
  /findingActionPlan: \[/.test(sharepointSrc) && /"findingActionPlan"/.test(sharepointSrc)
);
check(
  "the portal sync call site actually sends it, not just the aggregation function returning it unused",
  /findingActionPlan: riskFields\.actionPlan,/.test(sharepointSrc)
);
check(
  "the Excel workbook carries it on BOTH sheets (Findings sheet directly, Hazards sheet aggregated) — the sync-integrity review's own standing rule: never just the portal",
  /f\.actionPlan \?\? ""/.test(exportsSrc) &&
    /riskFields\.actionPlan \?\? ""/.test(exportsSrc) &&
    /header: "Action plan"/.test(exportsSrc) &&
    /header: "Action plan \(findings\)"/.test(exportsSrc)
);

/* ---- 9 · the report's second pass — Sarel, after seeing the first
   version: "have a section that lists the evidence that's requested,
   then list of specifically the quick wins or immediate action items,
   and then full list of all findings, information, photos... Add this
   to the report in a new category." ------------------------------------ */

check(
  "an Evidence requested section exists, scoped to this discipline via the SAME disciplineFor() the real Evidence tab uses — not a second scoping rule",
  /Evidence requested/.test(report) &&
    /import { EVIDENCE_COMPLIANCE_LABEL, TRACKING_LABEL, disciplineFor, trackingStage } from "@\/lib\/evidence"/.test(report) &&
    /disciplineFor\(e, checkDisciplineOf\) === discipline/.test(report)
);
check(
  "its status column reads the SAME trackingStage\\(\\)\\/TRACKING_LABEL the real Evidence tab reads, never a second status vocabulary",
  /TRACKING_LABEL\[trackingStage\(e\)\]/.test(report)
);
check(
  "the evidence table shows an Evidence feedback column (rating, analysis note, insufficient/unavailable reason, or 'Awaiting feedback') in place of Requested from",
  /<th[^>]*>Evidence feedback<\/th>/.test(report) &&
    !/<th[^>]*>Requested from<\/th>/.test(report) &&
    /function evidenceFeedback/.test(report) &&
    /EVIDENCE_COMPLIANCE_LABEL\[e\.complianceRating\]/.test(report) &&
    /Awaiting feedback/.test(report)
);
check(
  "a Quick wins / immediate action items section exists, pulling out Timeline === Immediate on its own rather than leaving it as one row of the distribution table",
  /Quick wins/.test(report) && /f\.timeline === "Immediate"/.test(report)
);
check(
  "it is visually distinguished (its own amber table variant), not styled identically to every other table on the page",
  /rr-amber/.test(report) && /\.rr-table\.rr-amber th/.test(report)
);
check(
  "the full findings list shows actual photographs as numbered figures — thumbDataUrl, never a live blob/object-URL hook, so the report never waits on async IndexedDB reads",
  (() => {
    const start = report.indexOf("function ReportFigure");
    const fn = start === -1 ? "" : report.slice(start, report.indexOf("\n}\n", start) + 2);
    return fn.length > 0 && /attachment\.thumbDataUrl \|\| attachment\.dataUrl/.test(fn) && !/useBlobUrl/.test(fn);
  })()
);
check(
  "a new Action & improvement plan category exists as its own section, separate from the findings list above it",
  /Action &amp;? ?improvement plan/.test(report) && /withActionPlan/.test(report)
);
check(
  "that category only lists findings that actually carry a plan, and says so plainly when none do yet — never an empty table with no explanation",
  /sorted\.filter\(\(f\) => f\.actionPlan\?\.trim\(\)\)/.test(report) &&
    /No action or improvement plans captured/.test(report)
);
check(
  "the report takes evidenceItems as its own prop, scoped by the caller — not a second useEvidenceItems() call hidden inside the printable component",
  /evidenceItems: EvidenceItem\[\];/.test(report) && !/useEvidenceItems/.test(report)
);
check(
  "the report route passes it through from the real hook, same as every other store-backed prop it already forwards",
  /useEvidenceItems\(\)/.test(reportPage) && /evidenceItems={evidenceItems}/.test(reportPage)
);

/* ---- 10 · landscape + bigger photos — Sarel, looking at the first
   printed report: "include photos of decent size to see the image,
   maybe so landscape report." ------------------------------------------ */

check(
  "the page is A4 portrait (Sarel asked for the report back in portrait)",
  /size: A4 portrait;/.test(report) && !/size: A4 landscape;/.test(report)
);
check(
  "figures are 240x160 with a 180x120 floor, rounded and bordered, captioned 'Figure N: system — description', laid out two-up",
  (() => {
    const start = report.indexOf("function ReportFigure");
    const fn = start === -1 ? "" : report.slice(start, report.indexOf("\n}\n", start) + 2);
    return fn.length > 0 && /width: 240, height: 160, minWidth: 180, minHeight: 120/.test(fn) && /borderRadius: 6/.test(fn) &&
      /Figure \{n\}: \{system \|\| "General"\} &mdash; \{caption\}/.test(fn);
  })()
);
check(
  "the KPI row is exactly four cards, the 'How to read the counts and tags' explainer is gone, and an empty category is a 'None recorded' chip, not an empty table",
  ["Total findings", "Immediate action required", "Routine / before next audit", "Evidence outstanding"].every((l) => report.includes(`label: "${l}"`)) &&
    !report.includes("How to read the counts and tags") && /function NoneChip/.test(report) && /None recorded/.test(report)
);
check(
  "the Action plan column is dropped when no row in the table has one",
  /const hasPlan = list\.some\(\(f\) => f\.actionPlan\?\.trim\(\)\)/.test(report) && /\{hasPlan && <th/.test(report)
);
check(
  "running header on pages 2+ and Page X of Y + timestamp + disclaimer footer in the @page margin boxes; margins 15mm 12mm",
  /size: A4 portrait;\s*margin: 15mm 12mm 15mm 12mm/.test(report) && /@page :first \{ @top-left \{ content: none; \} \}/.test(report) && /@top-left \{ content: "\$\{runningHead\}"/.test(report) &&
    /Interim, system-generated report: subject to update/.test(report) && /Squawk Assurance/.test(report)
);
check(
  "the downloaded PDF engine repeats the table header on continuation pages, draws a running header from the page's meta, and avoids orphan rows",
  (() => {
    const pdf = src("lib", "reportPdf.ts");
    return /header\?: string/.test(pdf) && /Page \$\{|Page " ?\+|of \$\{/.test(pdf) && /thead/.test(pdf) && /orphan|second-to-last|keepnext|data-keepnext/i.test(pdf) &&
      /header:/.test(reportPage);
  })()
);
check(
  "the screen preview's max-width is narrowed to match the portrait page, not left at the landscape 1200px",
  /max-width: 860px/.test(report) && !/max-width: 1200px/.test(report)
);

console.log(failures === 0 ? "\nREVIEW REPORT OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
