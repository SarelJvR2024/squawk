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
  assert.ok(t.includes("f.safetyTag") && t.includes("f.critical") && t.includes('f.timeline === "Immediate"'));
  assert.ok(!/\+\{selected\.length - 1\}/.test(t), "no +N hiding");
  assert.ok(t.includes("min-h-[200px]"));
});
check("Report: real PDF download, airport-wide mode, smaller action-plan print", () => {
  const p = src("../src/app/report/page.tsx");
  assert.ok(p.includes("downloadReportPdf") && p.includes('"all"'));
  assert.ok(src("../src/lib/reportPdf.ts").includes("pdf.save(filename)"));
  assert.ok(src("../src/components/ReviewRiskReport.tsx").includes("td.rr-plan { font-size: 9px"));
});
check("Triage: per-row delete with a confirm step", () => {
  const t = src("../src/components/ReviewRiskTable.tsx");
  assert.ok(t.includes("function RowDelete") && t.includes("onDeleteMany([f.id])") && t.includes("Cannot be undone"));
});
check("Report: KPI tiles — critical/safety, immediate, non-compliances and observations with photos; no action-plans or findings-this-visit tiles", () => {
  const r = src("../src/components/ReviewRiskReport.tsx");
  assert.ok(r.includes("Immediate safety concerns") && r.includes("Critical items to attend to") && r.includes("Immediate items to address") && r.includes("photosOf"));
  assert.ok(!r.includes('label: "Action plans set"') && !r.includes('label: "Findings this visit"'));
});
check("Report: interim/copyright clause and previous open findings with status and comments", () => {
  const r = src("../src/components/ReviewRiskReport.tsx");
  assert.ok(r.includes("Interim report, copyright and limitations") && r.includes("All rights") && r.includes("new information becomes available"));
  assert.ok(r.includes("Previous open findings") && r.includes("Status now") && r.includes("Comments"));
  assert.ok(src("../src/app/report/page.tsx").includes("useOutstanding"));
});
check("Report: safety concerns and critical items counted and listed separately, with an explainer", () => {
  const r = src("../src/components/ReviewRiskReport.tsx");
  assert.ok(r.includes("<TaggedList") && r.includes("How to read the counts and tags") && !r.includes("f.critical || f.safetyTag"));
});
check("Report: observations have their own section, apart from non-compliances", () => {
  const r = src("../src/components/ReviewRiskReport.tsx");
  assert.ok(r.includes("Observations &middot; {obsList.length}") && r.includes("Non-compliances &middot; {ncList.length}") && !r.includes("All findings &middot;"));
});
check("Triage row: check ref shown with the question, tags in their own multi-select column, delete in its own last column", () => {
  const r = src("../src/components/ReviewRiskTable.tsx");
  assert.ok(r.includes("{f.checkId}") && r.includes("<Th>Tags</Th>") && r.includes("Immediate safety concern") && r.includes("Immediate critical item"));
  assert.ok(/far right of the row/.test(r) && /onDeleteMany && <RowDelete/.test(r));
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
  assert.ok(t.includes("Evidence requested &amp; comments") && t.includes("e.checkIds.includes(f.checkId!)") && t.includes("Evidence shows: "));
  assert.ok(src("../src/components/ReviewRiskPanel.tsx").includes("\u2715 Close") || src("../src/components/ReviewRiskPanel.tsx").includes("✕ Close"));
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
  assert.ok(t.includes("interviewStatus(chk)") && t.includes("evidenceChannelStatus(chk)") && t.includes("inspectionStatus(chk)") && t.includes("Issues found / non-compliance"));
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
