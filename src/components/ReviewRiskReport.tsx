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

function TaggedList({ title, list, none, responses }: { title: string; list: Finding[]; none: string; responses: Record<string, Response> }) {
  return (
    <div style={{ padding: "24px 36px 0" }}>
      <SectionHeading>{title} &middot; {list.length}</SectionHeading>
      {list.length === 0 ? (
        <p style={{ fontSize: 12, color: INK_SOFT }}>{none}</p>
      ) : (
        <table className="rr-table">
          <thead>
            <tr>
              <th style={{ width: "18%" }}>Asset system</th>
              <th style={{ width: "46%" }}>Finding</th>
              <th style={{ width: "10%" }}>Timeline</th>
              <th style={{ width: "26%" }}>Action &amp; improvement plan</th>
            </tr>
          </thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.id}>
                <td style={{ fontWeight: 600 }}>{f.system || "General"}</td>
                <td>{findingText(f, responses)}</td>
                <td style={{ fontWeight: 600, color: f.timeline ? TIMELINE_COLOR[f.timeline] : INK_SOFT }}>{f.timeline || "Not set"}</td>
                <td className="rr-plan">{f.actionPlan?.trim() || "Not yet planned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 700, color: PURPLE, margin: "0 0 10px" }}>{children}</h2>
  );
}

/** `/report?discipline=all` — the whole airport in one report. */
/** One earlier-audit finding that was open coming into this visit, with its
 *  status now and the comments recorded against it. Built in report/page.tsx
 *  from carryforward + the verifications, so this component stays pure. */
export interface PreviousFindingRow {
  key: string;
  discipline: string;
  system: string;
  raisedAt: string;
  finding: string;
  rating: string;
  status: string;
  comments: string[];
}

export const ALL_DISCIPLINES_LABEL = "All disciplines";

export default function ReviewRiskReport({
  findings: allFindings,
  discipline,
  entityCode,
  responses,
  evidenceItems,
  visitLabel,
  auditor,
  previous = [],
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
  /** Findings left open by earlier audits, with where each stands now. */
  previous?: PreviousFindingRow[];
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
  const observations = findings.filter((f) => findingTypeFor(f) === "observation").length;
  /* Two separate tags, reported separately (Sarel, 26 Nov 2026): an
     immediate safety concern is not the same call as a critical item. */
  const safetyList = findings.filter((f) => f.safetyTag);
  const criticalList = findings.filter((f) => f.critical);
  /** Photos attached to findings of one type. */
  const photosOf = (t: string) =>
    findings
      .filter((f) => findingTypeFor(f) === t)
      .reduce((n, f) => n + f.attachments.filter((a) => a.kind === "photo").length, 0);
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
    () =>
      discipline === ALL_DISCIPLINES_LABEL
        ? evidenceItems
        : evidenceItems.filter((e) => disciplineFor(e, checkDisciplineOf) === discipline),
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

  const ncList = sorted.filter((f) => findingTypeFor(f) === "non-compliance");
  const obsList = sorted.filter((f) => findingTypeFor(f) !== "non-compliance");
  /* Same row layout for both lists — Sarel, 26 Nov 2026: observations get
     their own section instead of sharing one table with non-compliances. */
  const findingsTable = (list: Finding[]) => (
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
                {list.map((f) => {
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
                      <td className="rr-plan" style={{ color: f.actionPlan ? undefined : INK_SOFT }}>{f.actionPlan || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
        /* Action plan: captured in a large box, printed small so the plan does not dominate the row. */
        .rr-table td.rr-plan { font-size: 9px; line-height: 1.3; max-width: 150px; }
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

        {/* KPI STRIP — Sarel, 26 Nov 2026: add critical/safety issues and
            immediate items to address; add observations and
            non-compliances each with their photo count in the box; remove
            "Findings this visit" and "Action plans set" (the action-plan
            table below stays). */}
        <div style={{ display: "flex", gap: 12, padding: "20px 36px 0" }}>
          {(
            [
              { n: safetyList.length, label: "Immediate safety concerns", tone: "bad" },
              { n: criticalList.length, label: "Critical items to attend to", tone: "bad" },
              { n: immediate, label: "Immediate items to address", tone: "imm" },
              { n: nonCompliances, label: "Non-compliances", photos: photosOf("non-compliance") },
              { n: observations, label: "Observations", photos: photosOf("observation") },
              { n: evidenceForDiscipline.length, label: "Evidence requested" },
            ] as { n: number; label: string; photos?: number; tone?: string }[]
          ).map(({ n, label, photos, tone }) => (
            <div
              key={label}
              className="rr-card"
              style={{ flex: 1, background: PURPLE_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px" }}
            >
              <div style={{ fontSize: 9.5, color: INK_SOFT, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {label}
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: tone === "imm" ? TIMELINE_COLOR.Immediate : tone === "bad" ? "#B3261E" : INK,
                  marginTop: 2,
                }}
              >
                {n}
              </div>
              {photos !== undefined && (
                <div style={{ fontSize: 10, color: INK_SOFT, marginTop: 2 }}>
                  {photos} {photos === 1 ? "photo" : "photos"}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* HOW TO READ THIS REPORT, then the two tagged lists, kept apart. */}
        <div style={{ padding: "24px 36px 0" }}>
          <SectionHeading>How to read the counts and tags</SectionHeading>
          <ul style={{ fontSize: 10.5, lineHeight: 1.5, color: INK, margin: 0, paddingLeft: 16 }}>
            <li><strong>Immediate safety concern</strong> &mdash; a finding the auditor tagged as a hazard to people or operations that needs attention now. Counted and listed on its own.</li>
            <li><strong>Critical item to attend to</strong> &mdash; a finding tagged as serious enough to be dealt with as a priority. Counted and listed on its own; a finding can carry both tags and then appears in both lists.</li>
            <li><strong>Immediate items to address</strong> &mdash; findings whose timeline is Immediate (act now), whatever their tags.</li>
            <li><strong>Non-compliance / Observation</strong> &mdash; a departure from a requirement, versus a point noted that is not yet a breach. Photo counts are the photographs attached to those findings.</li>
            <li>A blank tag or field means not yet set, never a decision.</li>
          </ul>
        </div>
        <TaggedList title="Immediate safety concerns" list={safetyList} none={`No immediate safety concerns tagged in ${discipline} this visit.`} responses={responses} />
        <TaggedList title="Critical items to attend to" list={criticalList} none={`No critical items tagged in ${discipline} this visit.`} responses={responses} />

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
                    <td className="rr-plan" style={{ color: f.actionPlan?.trim() ? INK : INK_SOFT, fontStyle: f.actionPlan?.trim() ? "normal" : "italic" }}>
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
          <SectionHeading>Non-compliances &middot; {ncList.length} in {discipline}</SectionHeading>
          {ncList.length === 0 ? (
            <p style={{ fontSize: 12, color: INK_SOFT }}>No non-compliances raised against this discipline this visit.</p>
          ) : (
            findingsTable(ncList)
          )}
        </div>

        <div style={{ padding: "24px 36px 0" }}>
          <SectionHeading>Observations &middot; {obsList.length} in {discipline}</SectionHeading>
          {obsList.length === 0 ? (
            <p style={{ fontSize: 12, color: INK_SOFT }}>No observations raised against this discipline this visit.</p>
          ) : (
            findingsTable(obsList)
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
                    <td className="rr-plan">{f.actionPlan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* PREVIOUS OPEN FINDINGS — Sarel, 26 Nov 2026: "the report should
            also show previous open findings and their new status and
            comments". */}
        <div style={{ padding: "24px 36px 0" }}>
          <SectionHeading>Previous open findings &mdash; status update &middot; {previous.length}</SectionHeading>
          {previous.length === 0 ? (
            <p style={{ fontSize: 12, color: INK_SOFT }}>No findings from earlier audits were open for {discipline}.</p>
          ) : (
            <table className="rr-table">
              <thead>
                <tr>
                  <th style={{ width: "13%" }}>Asset system</th>
                  <th style={{ width: "9%" }}>Raised</th>
                  <th style={{ width: "30%" }}>Original finding</th>
                  <th style={{ width: "9%" }}>Rating</th>
                  <th style={{ width: "13%" }}>Status now</th>
                  <th style={{ width: "26%" }}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {previous.map((r) => (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600 }}>{r.system || "General"}</td>
                    <td>{r.raisedAt}</td>
                    <td>{r.finding}</td>
                    <td>{r.rating}</td>
                    <td style={{ fontWeight: 600, color: r.status === "Closed" ? "#1B7F4B" : r.status === "Not yet verified" ? INK_SOFT : "#B3261E" }}>
                      {r.status}
                    </td>
                    <td>{r.comments.length ? r.comments.join(" \u2022 ") : "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* INTERIM-REPORT NOTICE AND COPYRIGHT — Sarel, 26 Nov 2026: "add a
            detailed clause of copyright and that this is an interim system
            generated report... to cover us". Wording is drafted for him to
            have his legal advisers confirm. */}
        <div
          className="rr-card"
          style={{ margin: "18px 36px 0", padding: "12px 14px", border: `1px solid ${LINE}`, borderRadius: 8, background: PURPLE_SOFT, fontSize: 9.5, lineHeight: 1.5, color: INK }}
        >
          <div style={{ fontWeight: 700, color: PURPLE, marginBottom: 4 }}>Interim report, copyright and limitations</div>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Interim status.</strong> This is an interim, system-generated report. It is based only on the
            information, records, evidence and observations available to the audit team at the time of generation
            ({new Date().toISOString().slice(0, 10)}), and is shared to show project progress. It is not a final audit
            report. Findings, ratings, root causes, impacts, timelines, action plans and statuses may be incomplete and
            may be updated, corrected or withdrawn as new information becomes available. A blank field means not yet
            captured, not a decision.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>No warranty or reliance.</strong> The content is provided in good faith for information only. No
            representation or warranty, express or implied, is given as to its completeness or accuracy, and it must not
            be treated as a certificate of compliance, a safety clearance or professional advice. To the fullest extent
            permitted by law, the authors and their employers accept no liability for loss or damage arising from
            reliance on this interim report. Decisions affecting safety or operations should be confirmed against the
            current records and the final report. Nothing here amends the contract or any contractual notice, rating or
            instruction.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Copyright.</strong> &copy; {new Date().getFullYear()} the audit team and their employers. All rights
            reserved. The report is confidential and is issued solely to the intended recipient for this project. It
            may not be copied, reproduced, published or disclosed to a third party, in whole or in part, without prior
            written consent. Third-party material referred to (including ACSA procedures and ICAO documents) remains
            the property of its owners.
          </p>
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
