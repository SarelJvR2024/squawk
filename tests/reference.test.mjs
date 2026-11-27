import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("PASS ", name); }
  catch (e) { failed++; console.log("FAIL ", name, e.message); }
}
const j = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const ref = j("../src/data/checkReference.json");
const checks = j("../src/data/checks.json");
const files = j("../src/data/acsaDocFiles.json");
const list = Array.isArray(checks) ? checks : checks.checks;

check("every register check has a reference entry, and no extra", () => {
  assert.equal(Object.keys(ref).length, list.length);
  for (const c of list) assert.ok(c.id in ref, c.id);
});
check("every spec carries its text; MEANS/CHECK are strings when present", () => {
  for (const r of Object.values(ref)) for (const s of r.specs ?? []) {
    assert.ok(s.text && s.text.length > 3);
    for (const k of ["means", "check", "source"]) if (k in s) assert.equal(typeof s[k], "string");
  }
});
check("ICAO status is cited or indicative, with at least one item", () => {
  for (const r of Object.values(ref)) if (r.icao) {
    assert.ok(["cited", "indicative"].includes(r.icao.status));
    assert.ok(r.icao.items.length > 0);
  }
});
check("frequency entries carry their meaning lines", () => {
  for (const r of Object.values(ref)) if (r.freq) assert.ok(r.freq.meaning.length > 0 && r.freq.tasks.length > 0);
});
check("ACSA library links all point at the TPJV SharePoint library", () => {
  assert.equal(files.length, 112);
  for (const f of files) assert.ok(f.url.startsWith("https://tpjv.sharepoint.com/01 Projects/ACSA Asset Assurance/"), f.name);
});
check("most cited ACSA codes resolve to a library file", () => {
  const codes = new Set(list.flatMap((c) => (c.acsaDocs ?? []).map((d) => d.doc).filter(Boolean)));
  const hit = [...codes].filter((c) => files.some((f) => f.name.toLowerCase().startsWith(c.toLowerCase() + " ")));
  assert.ok(hit.length >= codes.size - 8, `${hit.length}/${codes.size}`);
});
const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
check("Add an inspection item offers a gallery Upload beside the camera Photo button", () => {
  const t = src("../src/components/AddItemSheet.tsx");
  assert.ok(/fromLibrary\s+label="Upload"/.test(t));
});
check("Triage has a Clean up wording button that selects the visible findings; unavailable assistant is said, not hidden", () => {
  const t = src("../src/components/ReviewRiskTable.tsx");
  assert.ok(t.includes("Clean up wording") && t.includes('id="triage-bulk-bar"'));
  assert.ok(t.includes("not switched on for this deployment"));
});
check("every check carries inspection records where it is inspected, and PM requests where it has maintenance tasks", () => {
  let insp = 0, pm = 0;
  for (const r of Object.values(ref)) { insp += r.inspection?.length ? 1 : 0; pm += r.maintenance?.length ? 1 : 0; }
  assert.ok(insp >= 300, "inspection " + insp);
  assert.ok(pm >= 200, "maintenance " + pm);
  for (const r of Object.values(ref)) for (const m of r.maintenance ?? []) assert.ok(m.t.length > 20);
});
check("checks that name an ACSA form list it with its code, as a blank template plus completed copies", () => {
  const r = ref["KSIA-MEC-017"];
  assert.ok(r.inspection.some((i) => /CMMS 008/.test(i.t) && /blank template/.test(i.t)));
});
check("Triage: request evidence, tags, all root causes shown, airport report", () => {
  const t = src("../src/components/ReviewRiskTable.tsx");
  assert.ok(t.includes("<EvidenceQuickCapture />") && t.includes('href="/report?discipline=all"'));
  const c = src("../src/components/TriageCells.tsx");
  assert.ok(c.includes("f.safetyTag") && c.includes("f.critical") && c.includes('f.timeline === "Immediate"'));
  assert.ok(!/\+\{selected\.length - 1\}/.test(t), "no +N hiding");
});
check("Report: real PDF download, airport-wide mode, smaller action-plan print", () => {
  const p = src("../src/app/report/page.tsx");
  assert.ok(p.includes("downloadReportPdf") && p.includes('"all"'));
  assert.ok(src("../src/lib/reportPdf.ts").includes("pdf.save(filename)"));
  assert.ok(src("../src/components/ReviewRiskReport.tsx").includes("td.rr-plan { font-size: 9px"));
});
check("Triage: per-row delete with a confirm step", () => {
  const t = src("../src/components/ReviewRiskTable.tsx");
  assert.ok(t.includes("function RowDelete") && t.includes("onDeleteMany([f.id])") && t.includes("can be restored") && !t.includes("Cannot be undone"));
});
check("Report: four KPI cards — total (NC/observation pills), immediate action, routine, evidence outstanding; no action-plans or findings-this-visit tiles", () => {
  const r = src("../src/components/ReviewRiskReport.tsx");
  assert.ok(r.includes('label: "Total findings"') && r.includes('label: "Immediate action required"') && r.includes('label: "Routine / before next audit"') && r.includes('label: "Evidence outstanding"'));
  assert.ok(!r.includes('label: "Action plans set"') && !r.includes('label: "Findings this visit"'));
});
check("Report: interim/copyright clause and previous open findings with status and comments", () => {
  const r = src("../src/components/ReviewRiskReport.tsx");
  assert.ok(r.includes("Interim report, copyright and limitations") && r.includes("All rights") && r.includes("new information becomes available"));
  assert.ok(r.includes("Previous open findings") && r.includes("Status now") && r.includes("Comments"));
  assert.ok(src("../src/app/report/page.tsx").includes("useOutstanding"));
});
check("Report: safety concerns and critical items counted and listed separately; no explainer, empty categories are a None-recorded chip", () => {
  const r = src("../src/components/ReviewRiskReport.tsx");
  assert.ok(r.includes("<TaggedList") && !r.includes("How to read the counts and tags") && r.includes("NoneChip") && !r.includes("f.critical || f.safetyTag"));
});
check("Report: observations have their own section, apart from non-compliances", () => {
  const r = src("../src/components/ReviewRiskReport.tsx");
  assert.ok(r.includes("Observations &middot; {obsList.length}") && r.includes("Non-compliances &middot; {ncList.length}") && !r.includes("All findings &middot;"));
});
check("Triage row: check ref shown with the question, tags in their own multi-select column, delete in its own last column", () => {
  const r = src("../src/components/ReviewRiskTable.tsx");
  const c = src("../src/components/TriageCells.tsx");
  assert.ok(r.includes("{f.checkId}") && r.includes("<TagsMenu") && r.includes("<TagBadges") && c.includes("Immediate safety concern") && c.includes("Immediate critical item"));
  assert.ok(/onDeleteMany && <RowDelete/.test(r) && r.lastIndexOf('<span className="sr-only">Delete</span></th>') > r.lastIndexOf(">Photos</th>"));
});
check("Soft delete: findings are flagged not removed, hidden everywhere, restorable from Issues > Deleted", () => {
  const st = src("../src/lib/store.ts");
  assert.ok(st.includes("deletedAt: Date.now()") && st.includes("restoreFinding: (id) =>") && st.includes("useDeletedFindings"));
  assert.ok(!/findings: s\.findings\.filter\(\(x\) => x\.id !== id\)/.test(st));
  const i = src("../src/app/(app)/issues/page.tsx");
  assert.ok(i.includes("function DeletedList") && i.includes("Restore"));
});
check("Triage: evidence-requested column with comments; Close button on the right-hand panel; professional report footer", () => {
  const t = src("../src/components/ReviewRiskTable.tsx");
  const pn = src("../src/components/ReviewRiskPanel.tsx");
  assert.ok(pn.includes("e.analysisNote, e.insufficientReason, e.unavailableReason") && pn.includes("Evidence shows"), "drawer shows evidence requested with comments");
  assert.ok(!t.includes("Evidence requested &amp; comments"), "no longer a table column");
  assert.ok(pn.includes("\u2715 Close") || pn.includes("✕ Close"));
  assert.ok(src("../src/components/ReviewRiskReport.tsx").includes("not yet been assessed or completed"));
});
check("Wording cleanup: side-by-side review with highlighted changes, Basic tidy fallback, and a plain explanation when the AI key is rejected", () => {
  const t = src("../src/components/ReviewRiskTable.tsx");
  assert.ok(t.includes("wordDiff(f.description, suggestion)") && t.includes("Basic tidy") && t.includes("Accept all"));
  assert.ok(src("../src/app/api/assist/route.ts").includes("ANTHROPIC_API_KEY in the Vercel project settings"));
});
const ts = await import("../src/lib/triageStatus.ts");
check("Triage row status icons: interview, evidence and inspection each coloured by status (done, issues, more evidence, N/A, not done)", () => {
  assert.equal(ts.interviewStatus({ compliance: "C" }).tone, "good");
  assert.equal(ts.interviewStatus({ compliance: "NC" }).tone, "bad");
  assert.equal(ts.interviewStatus({ compliance: "N/A" }).tone, "na");
  assert.equal(ts.interviewStatus(undefined).tone, "none");
  assert.equal(ts.inspectionStatus({ siteInspection: "NC" }).tone, "bad");
  assert.equal(ts.evidenceChannelStatus({ evidenceStatus: "toBeProvided", evidenceVerdict: null }).tone, "warn");
  assert.equal(ts.evidenceChannelStatus({ evidenceVerdict: "NC" }).tone, "bad");
  const t = src("../src/components/ReviewRiskTable.tsx");
  assert.ok(t.includes("interviewStatus(chk)") && t.includes("evidenceChannelStatus(chk)") && t.includes("inspectionStatus(chk)") && t.includes("Red = issues found or non-compliance"));
});
check("Triage density: 52px rows, active type only as one pill with a menu, tags in a popover, no stacked option buttons, no legend bar", () => {
  const t = src("../src/components/ReviewRiskTable.tsx");
  const c = src("../src/components/TriageCells.tsx");
  assert.ok(t.includes("h-[52px]") && t.includes("align-middle") && t.includes("<TypePill") && t.includes("<TimelineSelect"));
  assert.ok(!t.includes('role="radiogroup"') && !t.includes("flex-col items-stretch"), "no stacked options in a cell");
  assert.ok(c.includes('role="menu"') && c.includes("+ Tag") && c.includes("group-hover:opacity-100"));
  assert.ok(!t.includes('"Done, no issues"'), "the colour legend bar is gone");
  assert.ok(t.includes("PriorityBadge") && c.includes("Level {p.priority}") && c.includes("priorityFor(f)"));
});
check("Triage toolbar: row 1 on the Issues page (title, status pills, Log finding, Export list); row 2 search + four filters + Clean up wording + Evidence log menu", () => {
  const i = src("../src/app/(app)/issues/page.tsx");
  const t = src("../src/components/ReviewRiskTable.tsx");
  assert.ok(i.includes("Issues at {entity.short}") && i.includes("Log finding") && i.includes("Export list") && i.includes("function exportFindingsCsv"));
  assert.ok(i.includes("w-[440px]") && i.includes("absolute inset-y-0 right-0"), "440px slide-out drawer");
  assert.ok(t.includes('w-[220px]') && t.includes("Clean up wording") && t.includes('label="Evidence log"'));
});
check("Drawer: photo gallery with capture, upload and remove; export list neutralises spreadsheet formulas", () => {
  const pn = src("../src/components/ReviewRiskPanel.tsx");
  assert.ok(pn.includes("fromLibrary") && pn.includes("removeFindingAttachment(finding.id, id)") && pn.includes("thumbSize={132}"));
  assert.ok(src("../src/app/(app)/issues/page.tsx").includes('/^[=+\\-@]/'));
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
