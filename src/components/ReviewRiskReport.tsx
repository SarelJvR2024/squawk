"use client";

/** THE ROOT-CAUSE REPORT — a printable, one-discipline PDF generated from
 *  the Review page's "Risk & root cause" (Triage) tab. Sarel: "Scope out and
 *  build for me reports for all the information that we captured. Similar
 *  type of information as what we have in the review root cause page that
 *  would make it look professional. Take some guidance from the PDF reports
 *  I've shared with you... generate a report based on the discipline
 *  that's selected in the filters."
 *
 *  THE PDFS HE SHARED are ACSA's own "Asset Assurance and Compliance Audit"
 *  reports — a dark purple header band, a KPI strip, and clean tables with a
 *  repeating header row. Those reports are built from the asset-system-level
 *  hazard/rating data (HIRA/Asset Assurance), a different data model this
 *  report deliberately does NOT reach into — "similar type of information as
 *  what we have in the review root cause page" scopes this to exactly what
 *  that page already shows: Finding records, their root cause, impact,
 *  timeline and evidence. The visual language (the purple band, the KPI
 *  cards, the clean repeating-header tables) is borrowed; the data is this
 *  page's own.
 *
 *  NO PDF LIBRARY. This app has no server-side rendering pipeline and no
 *  headless-browser infrastructure (see src/lib/exports.ts for the same
 *  reasoning applied to the Excel exports — everything here is local-first,
 *  generated in the browser). The browser's own Print to PDF does the actual
 *  PDF generation; this component only has to look right on paper. A plain
 *  HTML <table> is used for the findings list specifically because browsers
 *  repeat a <thead> on every printed page automatically — the same
 *  "continued" header behaviour the sample PDFs have, with no custom paged-
 *  media code to get it.
 *
 *  PRINT COLOURS ARE FIXED HEX, not this app's own CSS theme variables — a
 *  report printed from a dark-mode session must not print dark-mode, so it
 *  does not read the app's theme tokens at all. */

import { useMemo } from "react";
import { entity as entityOf } from "@/lib/programme";
import { countByMultiSelect, findingTypeFor, FINDING_TYPE_LABEL } from "@/lib/reviewRisk";
import { ROOT_CAUSES, IMPACT_AREAS, TIMELINES } from "@/lib/riskVocab";
import type { Finding, Response } from "@/lib/types";

const PURPLE = "#2D1956";
const PURPLE_SOFT = "#EFEAF8";
const INK = "#1F1B2E";
const INK_SOFT = "#5B5570";
const LINE = "#DEDAEA";
const TIMELINE_COLOR: Record<string, string> = {
  Immediate: "#B23A1C",
  "Before next audit": "#92650E",
  "Long term": "#2F6F4E",
};

/** Same three-source consolidation ReviewRiskTable's own Finding column
 *  uses — the audit check's own desk note, the finding itself, and what the
 *  evidence review found — so the report never says something different
 *  from the screen it was generated off. */
function findingText(f: Finding, responses: Record<string, Response>): string {
  const r = f.checkId ? responses[f.checkId] : undefined;
  const parts: string[] = [];
  if (r?.observation) parts.push(r.observation);
  parts.push(f.title || f.description || f.id);
  if (f.description && f.title && f.description !== f.title) parts.push(f.description);
  if (r?.evidenceProves) parts.push(r.evidenceProves);
  return parts.join(" — ");
}

export default function ReviewRiskReport({
  findings,
  discipline,
  entityCode,
  responses,
  visitLabel,
  auditor,
}: {
  findings: Finding[];
  discipline: string;
  entityCode: string;
  responses: Record<string, Response>;
  visitLabel: string;
  auditor: string;
}) {
  const airport = entityOf(entityCode);

  const sorted = useMemo(
    () =>
      [...findings].sort((a, b) =>
        (a.system || "").localeCompare(b.system || "") || a.id.localeCompare(b.id)
      ),
    [findings]
  );

  const nonCompliances = findings.filter((f) => findingTypeFor(f) === "non-compliance").length;
  const observations = findings.length - nonCompliances;
  const byTimeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of TIMELINES) counts[t] = 0;
    let notSet = 0;
    for (const f of findings) {
      if (f.timeline && TIMELINES.includes(f.timeline)) counts[f.timeline]++;
      else notSet++;
    }
    return { counts, notSet };
  }, [findings]);
  const immediate = byTimeline.counts["Immediate"] ?? 0;

  const rootCauseCounts = useMemo(
    () => countByMultiSelect(findings, (f) => f.rootCauseCategories),
    [findings]
  );
  const impactCounts = useMemo(
    () => countByMultiSelect(findings, (f) => f.impactAreas),
    [findings]
  );

  const generated = new Date();

  return (
    <div style={{ background: "#FFFFFF", color: INK, fontFamily: "Arial, Helvetica, sans-serif" }}>
      <style>{`
        /* The app-wide shell rule (globals.css: "html, body { height: 100%;
           overflow: hidden }") clips THIS page to one viewport-tall "page"
           with no second page ever generated — print pagination needs
           overflow content to actually overflow somewhere, and a hidden,
           100%-height body never does. /report has no shell to protect
           (it's outside the (app) route group), so it opts back into
           ordinary document scrolling, on screen and in print alike. */
        html, body { height: auto !important; overflow: visible !important; background: #FFFFFF !important; }
        @page {
          size: A4;
          margin: 16mm 14mm 20mm 14mm;
          @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: ${INK_SOFT}; }
          @bottom-left { content: "Squawk \\2014 TPJV for Airports Company South Africa"; font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: ${INK_SOFT}; }
        }
        @media screen {
          .rr-report-page { max-width: 900px; margin: 24px auto 64px; box-shadow: 0 1px 10px rgba(0,0,0,0.12); }
        }
        @media print {
          .rr-report-toolbar { display: none !important; }
          .rr-report-page { box-shadow: none; }
          thead { display: table-header-group; }
          tr, .rr-card { break-inside: avoid; }
        }
        .rr-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .rr-table th { background: ${PURPLE}; color: #FFFFFF; text-align: left; padding: 8px 10px; font-weight: 600; font-size: 10.5px; }
        .rr-table td { padding: 8px 10px; border-bottom: 1px solid ${LINE}; vertical-align: top; color: ${INK}; }
        .rr-table tr:nth-child(even) td { background: #FAF9FC; }
      `}</style>

      <div className="rr-report-page" style={{ padding: "0 0 24px" }}>
        {/* HEADER BAND — same shape as ACSA's own report cover: eyebrow,
            discipline + airport, then the audit-identity line. */}
        <div style={{ background: PURPLE, color: "#FFFFFF", padding: "28px 36px" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.85 }}>
            Asset Assurance &middot; Root Cause Report
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0" }}>
            {discipline}: {airport.name}
          </h1>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>
            {visitLabel} &middot; Generated {generated.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })} by {auditor || "—"}
          </div>
        </div>

        {/* KPI STRIP */}
        <div style={{ display: "flex", gap: 12, padding: "20px 36px 0" }}>
          {(
            [
              [findings.length, "Findings this visit"],
              [nonCompliances, "Non-compliances"],
              [observations, "Observations"],
              [immediate, "Immediate — attend to first"],
            ] as [number, string][]
          ).map(([n, label]) => (
            <div
              key={label}
              className="rr-card"
              style={{ flex: 1, background: PURPLE_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px" }}
            >
              <div style={{ fontSize: 10, color: INK_SOFT, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: label.startsWith("Immediate") ? TIMELINE_COLOR.Immediate : INK, marginTop: 2 }}>
                {n}
              </div>
            </div>
          ))}
        </div>

        {/* FINDINGS BY TIMELINE — the "what to attend to first" list this
            report exists to surface, same TIMELINES vocabulary as the
            table/drawer. */}
        <div style={{ padding: "24px 36px 0" }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: PURPLE, margin: "0 0 10px" }}>
            Findings by timeline
          </h2>
          <table className="rr-table">
            <thead>
              <tr>
                <th>Timeline</th>
                <th style={{ textAlign: "right" }}>Findings</th>
                <th style={{ textAlign: "right" }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {TIMELINES.map((t) => (
                <tr key={t}>
                  <td style={{ fontWeight: 600, color: TIMELINE_COLOR[t] }}>{t}</td>
                  <td style={{ textAlign: "right" }}>{byTimeline.counts[t]}</td>
                  <td style={{ textAlign: "right" }}>
                    {findings.length ? Math.round((byTimeline.counts[t] / findings.length) * 100) : 0}%
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ fontStyle: "italic", color: INK_SOFT }}>Not yet set</td>
                <td style={{ textAlign: "right" }}>{byTimeline.notSet}</td>
                <td style={{ textAlign: "right" }}>
                  {findings.length ? Math.round((byTimeline.notSet / findings.length) * 100) : 0}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ROOT CAUSE / IMPACT DISTRIBUTION — side by side, counted with the
            SAME countByMultiSelect every other roll-up in this app uses
            ("one finding with 2 categories counts once in each"). */}
        <div style={{ display: "flex", gap: 24, padding: "20px 36px 0" }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: PURPLE, margin: "0 0 10px" }}>
              By root cause
            </h2>
            <table className="rr-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th style={{ textAlign: "right" }}>Findings</th>
                </tr>
              </thead>
              <tbody>
                {ROOT_CAUSES.map((c) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td style={{ textAlign: "right" }}>{rootCauseCounts[c] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: PURPLE, margin: "0 0 10px" }}>
              By impact area
            </h2>
            <table className="rr-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th style={{ textAlign: "right" }}>Findings</th>
                </tr>
              </thead>
              <tbody>
                {IMPACT_AREAS.map((a) => (
                  <tr key={a}>
                    <td>{a}</td>
                    <td style={{ textAlign: "right" }}>{impactCounts[a] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* THE FINDINGS THEMSELVES — one row per finding, sorted by asset
            system then id, same order the table's own default view uses.
            A plain <table>, not a styled div grid, specifically so the
            browser repeats <thead> on every printed page without any
            custom paged-media code. */}
        <div style={{ padding: "24px 36px 0" }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: PURPLE, margin: "0 0 10px" }}>
            Findings &middot; {findings.length} in {discipline}
          </h2>
          {sorted.length === 0 ? (
            <p style={{ fontSize: 12, color: INK_SOFT }}>No findings raised against this discipline this visit.</p>
          ) : (
            <table className="rr-table">
              <thead>
                <tr>
                  <th style={{ width: "10%" }}>Type</th>
                  <th style={{ width: "14%" }}>Asset system</th>
                  <th style={{ width: "34%" }}>Finding</th>
                  <th style={{ width: "18%" }}>Root cause / Impact</th>
                  <th style={{ width: "12%" }}>Timeline</th>
                  <th style={{ width: "12%" }}>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f) => {
                  const type = findingTypeFor(f);
                  const photos = f.attachments.filter((a) => a.kind === "photo").length;
                  const voices = f.attachments.filter((a) => a.kind === "voice").length;
                  return (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600, color: type === "non-compliance" ? "#A32626" : INK_SOFT }}>
                        {FINDING_TYPE_LABEL[type]}
                      </td>
                      <td>{f.system || "General"}</td>
                      <td>{findingText(f, responses)}</td>
                      <td>
                        {(f.rootCauseCategories ?? []).join(", ") || "—"}
                        {f.impactAreas && f.impactAreas.length > 0 ? (
                          <div style={{ color: INK_SOFT, marginTop: 2 }}>{f.impactAreas.join(", ")}</div>
                        ) : null}
                      </td>
                      <td style={{ fontWeight: 600, color: f.timeline ? TIMELINE_COLOR[f.timeline] : INK_SOFT }}>
                        {f.timeline || "Not set"}
                      </td>
                      <td>
                        {photos} photo{photos === 1 ? "" : "s"}
                        {voices > 0 ? `, ${voices} voice note${voices === 1 ? "" : "s"}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ padding: "24px 36px 0", fontSize: 10, color: INK_SOFT, borderTop: `1px solid ${LINE}`, marginTop: 20, paddingTop: 14 }}>
          Generated by Squawk from the Risk &amp; root cause (Triage) tab, scoped to {discipline}. A blank Timeline, Root
          cause or Impact means not yet set, never a decision — see the Review page for the live, editable record this
          report was generated from.
        </p>
      </div>
    </div>
  );
}
