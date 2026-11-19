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
 *  SECOND PASS — Sarel, after seeing the first version: "have a section
 *  that lists the evidence that's requested, then list of specifically the
 *  quick wins or immediate action items, and then full list of all
 *  findings, information, photos. Add an option to add action and
 *  improvement plan for any row in the root cause table... Add this to the
 *  report in a new category." Four changes from the first pass:
 *    1. An "Evidence requested" section, scoped to this discipline the same
 *       way EvidenceReviewView.tsx's own disciplineFor() scopes the real
 *       Evidence tab.
 *    2. A "Quick wins — immediate action items" section: Timeline ===
 *       "Immediate" pulled out on its own, not left as one row of a
 *       distribution table — the "send this as a separate list" item from
 *       the workflow deck this session also built.
 *    3. The findings table now shows actual photographs (thumbDataUrl —
 *       already a small, pre-rendered preview, see Attachment's own doc
 *       comment in types.ts — not a live blob read, so no per-photo hook or
 *       object-URL lifecycle is needed here), not just a count.
 *    4. A new "Action & improvement plan" category: every finding that
 *       carries one (Finding.actionPlan, src/components/ReviewRiskTable.tsx's
 *       own ActionPlanCell / ReviewRiskPanel's own textarea), separately
 *       from the findings list above it — the airport's own forward plan,
 *       not mixed into the audit's record of what was found.
 *
 *  NO PDF LIBRARY. This app has no server-side rendering pipeline and no
 *  headless-browser infrastructure (see src/lib/exports.ts for the same
 *  reasoning applied to the Excel exports — everything here is local-first,
 *  generated in the browser). The browser's own Print to PDF does the actual
 *  PDF generation; this component only has to look right on paper. Every
 *  list here is a plain HTML <table> specifically because browsers repeat a
 *  <thead> on every printed page automatically — the same "continued"
 *  header behaviour the sample PDFs have, with no custom paged-media code
 *  to get it.
 *
 *  PRINT COLOURS ARE FIXED HEX, not this app's own CSS theme variables — a
 *  report printed from a dark-mode session must not print dark-mode, so it
 *  does not read the app's theme tokens at all. */

import { useMemo } from "react";
import { entity as entityOf } from "@/lib/programme";
import { checksAt } from "@/lib/register";
import { countByMultiSelect, findingTypeFor, FINDING_TYPE_LABEL } from "@/lib/reviewRisk";
import { ROOT_CAUSES, IMPACT_AREAS, TIMELINES } from "@/lib/riskVocab";
import { TRACKING_LABEL, disciplineFor, trackingStage } from "@/lib/evidence";
import type { Attachment, EvidenceItem, Finding, Response } from "@/lib/types";

const PURPLE = "#2D1956";
const PURPLE_SOFT = "#EFEAF8";
const AMBER_SOFT = "#FFF4E8";
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

/** One photograph, inline. `thumbDataUrl` is already a small, persisted
 *  preview (see Attachment's own doc comment in types.ts: "so a strip of
 *  photographs paints without an async read per tile") — exactly what a
 *  printed report wants, and the reason this is a synchronous <img>, never
 *  a useBlobUrl()/object-URL component: a report with 30 findings cannot
 *  wait on 30 async IndexedDB reads before Print to PDF has anything to
 *  print. Falls back to the legacy inline `dataUrl` for an attachment that
 *  predates thumbDataUrl; shows nothing rather than a broken-image icon
 *  when neither is there.
 *
 *  144px, not the first pass's 64px — Sarel, looking at the first report:
 *  "include photos of decent size to see the image." thumbDataUrl is
 *  encoded at 240px on its longest side (src/lib/media.ts's own
 *  `drawTo(img, 240)`), so 144px is still a downscale, not an upscale past
 *  what the source actually holds — bigger than this would start looking
 *  soft. The report went landscape in the same pass, specifically to give
 *  this the room it needs without starving the columns beside it. */
function ReportPhoto({ attachment }: { attachment: Attachment }) {
  const src = attachment.thumbDataUrl || attachment.dataUrl;
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local data URL, not a remote asset next/image can optimise
    <img
      src={src}
      alt={attachment.caption?.trim() || "Finding photograph"}
      style={{ width: 144, height: 144, objectFit: "cover", borderRadius: 8, border: `1px solid ${LINE}` }}
    />
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 700, color: PURPLE, margin: "0 0 10px" }}>{children}</h2>
  );
}

export default function ReviewRiskReport({
  findings: allFindings,
  discipline,
  entityCode,
  responses,
  evidenceItems,
  visitLabel,
  auditor,
}: {
  findings: Finding[];
  discipline: string;
  entityCode: string;
  responses: Record<string, Response>;
  /** Every evidence request at this entity, NOT pre-scoped — scoped to
   *  `discipline` below the same way EvidenceReviewView.tsx's own tab
   *  scopes it, via disciplineFor() against this entity's register, so
   *  this report never disagrees with the real Evidence tab about which
   *  discipline a request belongs to. */
  evidenceItems: EvidenceItem[];
  visitLabel: string;
  auditor: string;
}) {
  const airport = entityOf(entityCode);

  /* INTERNAL FINDINGS NEVER REACH THIS REPORT — Sarel: "add an option in
   *  root cause to tag rows 'internal' to keep as our internal info and
   *  not make it into any reports." Filtered once, here, before every
   *  count/section below reads `findings` — the one place this report
   *  is built, so there is no second spot that could forget this and
   *  let one slip into the "All findings" table, a count, or a percent. */
  const findings = useMemo(() => allFindings.filter((f) => !f.internalOnly), [allFindings]);

  const sorted = useMemo(
    () =>
      [...findings].sort((a, b) =>
        (a.system || "").localeCompare(b.system || "") || a.id.localeCompare(b.id)
      ),
    [findings]
  );

  const nonCompliances = findings.filter((f) => findingTypeFor(f) === "non-compliance").length;
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

  /* EVIDENCE REQUESTED, scoped to this discipline — same checkDisciplineOf
     map EvidenceReviewView.tsx builds for its own "By discipline" tab, not
     a second lookup invented here. */
  const checkDisciplineOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of checksAt(entityCode)) m.set(c.id, c.discipline);
    return (id: string) => m.get(id);
  }, [entityCode]);
  const evidenceForDiscipline = useMemo(
    () => evidenceItems.filter((e) => disciplineFor(e, checkDisciplineOf) === discipline),
    [evidenceItems, checkDisciplineOf, discipline]
  );

  /* QUICK WINS — the one list Sarel's own workflow notes this session
     asked for by name: every Immediate-timeline finding, pulled out on its
     own rather than left as a single row of the distribution table below. */
  const quickWins = useMemo(
    () => sorted.filter((f) => f.timeline === "Immediate"),
    [sorted]
  );

  /* ACTION & IMPROVEMENT PLAN — only findings that actually carry one; an
     empty report here is itself information (nothing has been planned
     yet), not an error, so it is shown as a sentence, not an empty table. */
  const withActionPlan = useMemo(
    () => sorted.filter((f) => f.actionPlan?.trim()),
    [sorted]
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
        /* LANDSCAPE — Sarel: "maybe so landscape report," in the same
           breath as asking for bigger photos. The two asks are really
           one: a photo big enough to actually see needs width, and a
           portrait A4 page doesn't have it to spare once six columns
           share it. */
        @page {
          size: A4 landscape;
          margin: 14mm 16mm 18mm 16mm;
          @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: ${INK_SOFT}; }
          @bottom-left { content: "Squawk \\2014 TPJV for Airports Company South Africa"; font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: ${INK_SOFT}; }
        }
        @media screen {
          .rr-report-page { max-width: 1200px; margin: 24px auto 64px; box-shadow: 0 1px 10px rgba(0,0,0,0.12); }
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
        .rr-table.rr-amber th { background: ${TIMELINE_COLOR.Immediate}; }
        .rr-table.rr-amber tr:nth-child(even) td { background: ${AMBER_SOFT}; }
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
              [immediate, "Immediate — attend to first"],
              [evidenceForDiscipline.length, "Evidence requested"],
              [withActionPlan.length, "Action plans set"],
            ] as [number, string][]
          ).map(([n, label]) => (
            <div
              key={label}
              className="rr-card"
              style={{ flex: 1, background: PURPLE_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px" }}
            >
              <div style={{ fontSize: 9.5, color: INK_SOFT, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: label.startsWith("Immediate") ? TIMELINE_COLOR.Immediate : INK, marginTop: 2 }}>
                {n}
              </div>
            </div>
          ))}
        </div>

        {/* FINDINGS BY TIMELINE */}
        <div style={{ padding: "24px 36px 0" }}>
          <SectionHeading>Findings by timeline</SectionHeading>
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
            <SectionHeading>By root cause</SectionHeading>
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
            <SectionHeading>By impact area</SectionHeading>
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

        {/* EVIDENCE REQUESTED — Sarel: "have a section that lists the
            evidence that's requested." Status reads TRACKING_LABEL off the
            SAME trackingStage() the real Evidence tab uses, never a second
            status vocabulary invented for this report. */}
        <div style={{ padding: "24px 36px 0" }}>
          <SectionHeading>Evidence requested &middot; {evidenceForDiscipline.length} in {discipline}</SectionHeading>
          {evidenceForDiscipline.length === 0 ? (
            <p style={{ fontSize: 12, color: INK_SOFT }}>Nothing requested from the airport against this discipline yet.</p>
          ) : (
            <table className="rr-table">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>What&rsquo;s needed</th>
                  <th style={{ width: "20%" }}>Asset system</th>
                  <th style={{ width: "20%" }}>Status</th>
                  <th style={{ width: "20%" }}>Requested from</th>
                </tr>
              </thead>
              <tbody>
                {evidenceForDiscipline.map((e) => (
                  <tr key={e.id}>
                    <td>{e.title || e.id}</td>
                    <td>{e.system || "General"}</td>
                    <td style={{ fontWeight: 600 }}>{TRACKING_LABEL[trackingStage(e)]}</td>
                    <td>{e.requestedFrom || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* QUICK WINS — IMMEDIATE ACTION ITEMS. Sarel: "list of specifically
            the quick wins or immediate action items" — its own highlighted
            table (the amber header/row tint, rr-amber), not merely a filter
            of the full list below, so it can be handed to someone on its
            own without the rest of the report. */}
        <div style={{ padding: "24px 36px 0" }}>
          <SectionHeading>Quick wins &mdash; immediate action items &middot; {quickWins.length}</SectionHeading>
          {quickWins.length === 0 ? (
            <p style={{ fontSize: 12, color: INK_SOFT }}>Nothing marked Immediate in {discipline} this visit.</p>
          ) : (
            <table className="rr-table rr-amber">
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Asset system</th>
                  <th style={{ width: "52%" }}>Finding</th>
                  <th style={{ width: "30%" }}>Action &amp; improvement plan</th>
                </tr>
              </thead>
              <tbody>
                {quickWins.map((f) => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.system || "General"}</td>
                    <td>{findingText(f, responses)}</td>
                    <td style={{ color: f.actionPlan?.trim() ? INK : INK_SOFT, fontStyle: f.actionPlan?.trim() ? "normal" : "italic" }}>
                      {f.actionPlan?.trim() || "Not yet planned"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* FULL FINDINGS LIST — Sarel: "full list of all findings,
            information, photos." Every finding, sorted by asset system then
            id (the table's own default order), now with the finding's own
            photographs shown inline rather than only counted. */}
        <div style={{ padding: "24px 36px 0" }}>
          <SectionHeading>All findings &middot; {findings.length} in {discipline}</SectionHeading>
          {sorted.length === 0 ? (
            <p style={{ fontSize: 12, color: INK_SOFT }}>No findings raised against this discipline this visit.</p>
          ) : (
            <table className="rr-table">
              <thead>
                <tr>
                  <th style={{ width: "6%" }}>Type</th>
                  <th style={{ width: "9%" }}>Asset system</th>
                  <th style={{ width: "21%" }}>Finding</th>
                  <th style={{ width: "11%" }}>Root cause / Impact</th>
                  <th style={{ width: "7%" }}>Timeline</th>
                  {/* NARROWED FROM 38% — Sarel, on a live report screenshot:
                      "a lot of wasted open space, use it more effectively."
                      A 144px photo plus its caption never used anywhere
                      near 38% of a landscape page; the space it gave up
                      goes to the new Action plan column right beside it,
                      not back into Finding/Root cause, which already had
                      enough room for their own text. */}
                  <th style={{ width: "21%" }}>Evidence</th>
                  {/* ACTION PLAN, NEXT TO THE PHOTO — Sarel: "add the
                      action plan column to the right of the photo."
                      Alongside the dedicated Action & improvement plan
                      section below, not instead of it: that section is
                      the scannable, findings-with-a-plan-only list; this
                      is the full findings list showing the same text
                      inline, so a reader going straight down this table
                      never has to cross-reference the other one to see
                      what's already planned for a given row. */}
                  <th style={{ width: "25%" }}>Action plan</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f) => {
                  const type = findingTypeFor(f);
                  const photos = f.attachments.filter((a) => a.kind === "photo");
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
                        {photos.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                            {photos.slice(0, 2).map((a) => (
                              <ReportPhoto key={a.id} attachment={a} />
                            ))}
                            {photos.length > 2 && (
                              <span style={{ alignSelf: "center", fontSize: 10, color: INK_SOFT }}>
                                +{photos.length - 2} more
                              </span>
                            )}
                          </div>
                        )}
                        <span style={{ fontSize: 10, color: INK_SOFT }}>
                          {photos.length} photo{photos.length === 1 ? "" : "s"}
                          {voices > 0 ? `, ${voices} voice note${voices === 1 ? "" : "s"}` : ""}
                        </span>
                      </td>
                      <td style={{ color: f.actionPlan ? undefined : INK_SOFT }}>{f.actionPlan || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ACTION & IMPROVEMENT PLAN — Sarel: "Add an option to add action
            and improvement plan for any row in the root cause table...
            Add this to the report in a new category." The airport's own
            forward plan, kept as its own section rather than folded into
            the findings list above — a document handed to the airport to
            act on should not require reading the whole findings table to
            find the ask. */}
        <div style={{ padding: "24px 36px 0" }}>
          <SectionHeading>Action &amp; improvement plan &middot; {withActionPlan.length} of {findings.length} findings</SectionHeading>
          {withActionPlan.length === 0 ? (
            <p style={{ fontSize: 12, color: INK_SOFT }}>No action or improvement plans captured for {discipline} yet.</p>
          ) : (
            <table className="rr-table">
              <thead>
                <tr>
                  <th style={{ width: "16%" }}>Asset system</th>
                  <th style={{ width: "34%" }}>Finding</th>
                  <th style={{ width: "10%" }}>Timeline</th>
                  <th style={{ width: "40%" }}>Action &amp; improvement plan</th>
                </tr>
              </thead>
              <tbody>
                {withActionPlan.map((f) => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.system || "General"}</td>
                    <td>{findingText(f, responses)}</td>
                    <td style={{ fontWeight: 600, color: f.timeline ? TIMELINE_COLOR[f.timeline] : INK_SOFT }}>
                      {f.timeline || "Not set"}
                    </td>
                    <td>{f.actionPlan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ padding: "24px 36px 0", fontSize: 10, color: INK_SOFT, borderTop: `1px solid ${LINE}`, marginTop: 20, paddingTop: 14 }}>
          Generated by Squawk from the Risk &amp; root cause (Triage) tab, scoped to {discipline}. A blank Timeline, Root
          cause, Impact or Action plan means not yet set, never a decision — see the Review page for the live, editable
          record this report was generated from.
        </p>
      </div>
    </div>
  );
}
