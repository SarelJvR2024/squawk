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

import { Fragment, useMemo } from "react";
import { fullPhotoBlob, useRecordImage } from "@/lib/recordimage";
import { useStore } from "@/lib/store";
import { entity as entityOf } from "@/lib/programme";
import { checksAt } from "@/lib/register";
import { countByMultiSelect, findingTypeFor } from "@/lib/reviewRisk";
import { ROOT_CAUSES, LEGACY_ROOT_CAUSES, IMPACT_AREAS, TIMELINES } from "@/lib/riskVocab";
import { EVIDENCE_COMPLIANCE_LABEL, TRACKING_LABEL, disciplineFor, trackingStage } from "@/lib/evidence";
import { PENDING_PLACEHOLDER, briefOf, checkRefOf, cleanSpeech, reportFindingText, scrubCodes, stripPlaceholders } from "@/lib/reportText";
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
/** Evidence feedback for the report: the auditor's compliance rating of the
 *  document plus whatever was recorded about it (analysis note, why it was
 *  insufficient, or why it could not be produced). "Awaiting feedback" when
 *  nothing has been recorded yet, so a blank is never read as "no issues". */
function evidenceFeedback(e: EvidenceItem): string {
  const parts: string[] = [];
  if (e.complianceRating) parts.push(EVIDENCE_COMPLIANCE_LABEL[e.complianceRating]);
  if (e.analysisNote?.trim()) parts.push(e.analysisNote.trim());
  if (e.insufficientAt && e.insufficientReason?.trim()) parts.push(`Insufficient: ${e.insufficientReason.trim()}`);
  if (e.unavailableAt && e.unavailableReason?.trim()) parts.push(`Not available: ${e.unavailableReason.trim()}`);
  return parts.length ? parts.join(" — ") : "Awaiting feedback";
}

/** What a finding's text reads in the report: the audit check's desk note, the
 *  finding itself (speech fillers and glitches cleaned, a bare audit-check
 *  question replaced by a "to be confirmed" line), then what the evidence
 *  review found. See src/lib/reportText.ts for the rules. */
type RequirementOf = (checkId: string | null | undefined) => string | undefined;
type CheckOf = (checkId: string) => { question: string | null; requirement: string } | undefined;

function findingText(f: Finding, responses: Record<string, Response>, requirementOf: RequirementOf): string {
  const r = f.checkId ? responses[f.checkId] : undefined;
  const parts: string[] = [];
  if (r?.observation) parts.push(cleanSpeech(r.observation));
  const main = reportFindingText(f, requirementOf(f.checkId));
  parts.push(main.text);
  if (f.description && f.title && f.description !== f.title && !main.flags.includes("question-only")) parts.push(cleanSpeech(f.description));
  if (r?.evidenceProves) parts.push(cleanSpeech(r.evidenceProves));
  const joined = stripPlaceholders(scrubCodes(parts.filter(Boolean).join(" \u2014 ")));
  return joined || PENDING_PLACEHOLDER;
}

/** The Finding cell. Linked to an audit check: the requirement (muted, upper)
 *  then the defect observed (standard, lower). Not linked (captured at
 *  discipline / asset-system level): the finding text alone, no empty
 *  requirement block. Never a check reference code, only readable words. */
function FindingCell({ f, responses, requirementOf, checkOf }: { f: Finding; responses: Record<string, Response>; requirementOf: RequirementOf; checkOf?: CheckOf }) {
  const req = f.checkId ? requirementOf(f.checkId)?.trim() : undefined;
  const body = findingText(f, responses, requirementOf);
  if (!req) return <>{body}</>;
  const label = { fontWeight: 700, letterSpacing: "0.04em" } as const;
  const chk = f.checkId ? checkOf?.(f.checkId) : undefined;
  const ref = checkRefOf(f.checkId);
  const question = chk?.question?.trim();
  return (
    <>
      <div style={{ fontSize: 9, lineHeight: 1.35, color: INK_SOFT, marginBottom: 4 }}>
        <span style={label}>AUDIT CHECK{ref ? ` ${ref}` : ""} &mdash; REQUIREMENT:</span> {req}
        {question && question !== req && (
          <div style={{ marginTop: 2 }}>
            <span style={label}>AUDIT QUESTION:</span> {question}
          </div>
        )}
      </div>
      <div>
        <span style={{ ...label, fontSize: 9, color: INK_SOFT }}>DEFECT OBSERVED:</span> {body}
      </div>
    </>
  );
}

/** Opens the high-resolution photograph in a new tab. The window is opened
 *  synchronously (a window opened after an await is blocked as a pop-up), then
 *  pointed at the full-size copy: the local blob, else the record copy, else
 *  the best inline image there is. Never navigates a data: URL directly, which
 *  browsers refuse for top-level navigation. */
async function openHiRes(a: Attachment, entityCode: string, visitId: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  try {
    let blob: Blob;
    try {
      blob = await fullPhotoBlob(a, entityCode, visitId);
    } catch {
      const inline = a.dataUrl || a.thumbDataUrl;
      if (!inline) throw new Error("no image");
      blob = await (await fetch(inline)).blob();
    }
    w.location.href = URL.createObjectURL(blob);
  } catch {
    w.close();
  }
}

/** The Photo column cell: ONE crisp 120x80 thumbnail, "Photo N" under it, the
 *  thumbnail a link to the full-size image. Never a photo block inside the
 *  row (Sarel, 28 Nov 2026). More than one photograph: the first is shown and
 *  the caption says how many more there are. */
function PhotoCell({
  photos,
  figureNo,
  entityCode,
  visitId,
  annexure,
}: {
  photos: Attachment[];
  figureNo: Map<string, number>;
  entityCode: string;
  visitId: string;
  annexure: boolean;
}) {
  if (photos.length === 0) return <span style={{ color: INK_SOFT }}>{"\u2014"}</span>;
  const first = photos[0];
  const n = figureNo.get(first.id) ?? 0;
  const more = photos.length - 1;
  return (
    <a
      href={annexure ? `#fig-${n}` : "#"}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.preventDefault();
        void openHiRes(first, entityCode, visitId);
      }}
      style={{ display: "block", color: PURPLE, textDecoration: "none", fontSize: 9, fontWeight: 600 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
      <img
        src={first.thumbDataUrl || first.dataUrl}
        alt={`Photo ${n}`}
        style={{ display: "block", width: 120, height: 80, objectFit: "cover", borderRadius: 4, border: `1px solid ${LINE}`, marginBottom: 3 }}
      />
      Photo {n}
      {more > 0 && <span style={{ color: INK_SOFT, fontWeight: 400 }}>{` (+${more} more${annexure ? ", see annexure" : ""})`}</span>}
    </a>
  );
}

/** One annexure figure: the full-size photograph (local blob, else record
 *  copy, else the best inline image) with "Figure N: Asset system - summary". */
function AnnexureFigure({ attachment, n, system, brief, entityCode, visitId }: { attachment: Attachment; n: number; system: string; brief: string; entityCode: string; visitId: string }) {
  const { url } = useRecordImage(attachment, entityCode, visitId);
  if (!url) return null;
  const caption = attachment.caption?.trim() ? briefOf(attachment.caption.trim(), 70) : brief;
  return (
    <figure id={`fig-${n}`} className="report-card" style={{ margin: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob/data URL */}
      <img
        src={url}
        alt={attachment.caption?.trim() || `Figure ${n}`}
        style={{ display: "block", width: "100%", aspectRatio: "3 / 2", objectFit: "cover", borderRadius: 6, border: `1px solid ${LINE}` }}
      />
      <figcaption style={{ fontSize: 10, lineHeight: 1.35, color: INK_SOFT, marginTop: 5 }}>
        Figure {n}: {system || "General"} &mdash; {caption}
      </figcaption>
    </figure>
  );
}

function Tag({ children, kind }: { children: React.ReactNode; kind: "cause" | "impact" }) {
  return (
    <span
      style={{
        display: "inline-block",
        margin: "0 4px 4px 0",
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 9.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...(kind === "cause"
          ? { background: PURPLE_SOFT, color: PURPLE, border: `1px solid ${PURPLE_SOFT}` }
          : { background: "#FFFFFF", color: INK_SOFT, border: `1px solid ${LINE}` }),
      }}
    >
      {children}
    </span>
  );
}

/** Red for Immediate, amber for Before next audit, green for Long term. */
function TimelineBadge({ timeline }: { timeline?: string }) {
  const bg: Record<string, string> = { Immediate: "#FBE4DE", "Before next audit": "#FDF0D5", "Long term": "#E1F1E8" };
  if (!timeline) return <span style={{ fontSize: 10, color: INK_SOFT }}>Not set</span>;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 9.5,
        fontWeight: 700,
        whiteSpace: "normal",
        overflowWrap: "normal",
        wordBreak: "keep-all",
        textAlign: "center",
        lineHeight: 1.25,
        background: bg[timeline] ?? PURPLE_SOFT,
        color: TIMELINE_COLOR[timeline] ?? INK,
      }}
    >
      {timeline}
    </span>
  );
}

function TaggedList({ title, list, responses, requirementOf, checkOf }: { title: string; list: Finding[]; responses: Record<string, Response>; requirementOf: RequirementOf; checkOf?: CheckOf }) {
  /* No row has an action plan: the column is dropped and its width goes to
     Finding. Some do: it is capped at 15% and wraps. */
  const hasPlan = list.some((f) => f.actionPlan?.trim());
  return (
    <div style={{ padding: "20px 36px 0" }}>
      <SectionHeading>{title} &middot; {list.length}</SectionHeading>
      <table className="rr-table">
        <thead>
          <tr>
            <th style={{ width: "18%" }}>Asset system</th>
            <th style={{ width: hasPlan ? "52%" : "64%" }}>Finding</th>
            <th style={{ width: hasPlan ? "15%" : "18%" }}>Timeline</th>
            {hasPlan && <th style={{ width: "15%" }}>Action plan</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((f) => (
            <tr key={f.id}>
              <td style={{ fontWeight: 600 }}>{f.system || "General"}</td>
              <td><FindingCell f={f} responses={responses} requirementOf={requirementOf} checkOf={checkOf} /></td>
              <td><TimelineBadge timeline={f.timeline} /></td>
              {hasPlan && <td className="rr-plan" style={{ color: f.actionPlan?.trim() ? INK : INK_SOFT }}>{f.actionPlan?.trim() || "\u2014"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pill2({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return (
    <span style={{ display: "inline-block", margin: "0 4px 3px 0", padding: "1px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, background: bg, color: fg }}>
      {children}
    </span>
  );
}

/** A category with nothing in it is one quiet line, not an empty table. */
function NoneChip({ label, count }: { label: string; count: number }) {
  const zero = count === 0;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        background: zero ? "#F3F1F8" : "#FBE4DE",
        color: zero ? INK_SOFT : "#B3261E",
        border: `1px solid ${zero ? LINE : "#F0B9AC"}`,
      }}
    >
      {label}: {zero ? "None recorded" : count}
    </span>
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
  photoAnnexure = false,
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
  /** "Include Photographic Annexure": a 2-up grid of full-size photographs
   *  at the very end of the report. Off by default. */
  photoAnnexure?: boolean;
}) {
  const airport = entityOf(entityCode);
  const visitId = useStore((st) => st.visit);

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

  /* PAGE 1: when nothing has a root cause or impact yet, two tables of zeroes
     say nothing. Count the findings that carry at least one of either. */
  const categorised = findings.filter((f) => (f.rootCauseCategories ?? []).length > 0 || (f.impactAreas ?? []).length > 0).length;

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

  /* The linked audit check's own wording, so a finding whose text is only that
     question can be caught (see reportText.ts). */
  const requirementOf = useMemo<RequirementOf>(() => {
    const m = new Map<string, string>();
    for (const c of checksAt(entityCode)) m.set(c.id, c.requirement);
    return (id) => (id ? m.get(id) : undefined);
  }, [entityCode]);
  const checkOf = useMemo<CheckOf>(() => {
    const m = new Map<string, { question: string | null; requirement: string }>();
    for (const c of checksAt(entityCode)) m.set(c.id, c);
    return (id) => m.get(id);
  }, [entityCode]);

  /* Figure numbers run through the report in print order: non-compliances,
     then observations. One number per photograph, never reused. */
  const figureNo = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const f of [...ncList, ...obsList])
      for (const a of f.attachments) if (a.kind === "photo" && (a.thumbDataUrl || a.dataUrl)) m.set(a.id, ++n);
    return m;
  }, [ncList, obsList]);

  /* The annexure: every photograph, in figure order, with the one-line summary
     of the finding it belongs to. */
  const annexureItems = useMemo(
    () =>
      [...ncList, ...obsList].flatMap((f) => {
        const brief = briefOf(reportFindingText(f, requirementOf(f.checkId)).text);
        return f.attachments
          .filter((a) => a.kind === "photo" && (a.thumbDataUrl || a.dataUrl))
          .map((a) => ({ a, f, brief }));
      }),
    [ncList, obsList, requirementOf]
  );

  /* BEFORE YOU PUBLISH — findings whose wording needs the auditor: too short to
     stand as a finding, or only the audit question. Screen only. Raw text with
     fillers is cleaned automatically and is not listed. */
  const wordingWarnings = useMemo(
    () =>
      [...ncList, ...obsList]
        .map((f) => ({ f, t: reportFindingText(f, requirementOf(f.checkId)) }))
        .filter((x) => x.t.flags.length > 0),
    [ncList, obsList, requirementOf]
  );

  /* HEADLINE NUMBERS. "Immediate action required" is ONE figure: a finding
     counts once whether it is tagged a safety concern, critical, on an
     Immediate timeline, or any mix. */
  const immediateAction = findings.filter((f) => f.safetyTag || f.critical || f.timeline === "Immediate");
  const routine = findings.filter((f) => f.timeline === "Before next audit" || f.timeline === "Long term");
  const evidenceOutstanding = evidenceForDiscipline.filter((e) =>
    ["notStarted", "requested", "uploaded", "insufficient", "unavailable"].includes(trackingStage(e))
  );
  /* Same row layout for both lists — Sarel, 26 Nov 2026: observations get
     their own section instead of sharing one table with non-compliances. */
  const findingsTable = (list: Finding[]) => {
    /* The Action plan column is only there when at least one row has a plan;
       otherwise its width goes to Finding and Root cause. */
    const hasPlan = list.some((f) => f.actionPlan?.trim());
    /* The Photo column is a fixed 130px; the rest share what is left. */
    const w = hasPlan
      ? { asset: "13%", finding: "30%", cause: "15%", time: "11%", plan: "13%", photo: 130 }
      : { asset: "15%", finding: "38%", cause: "17%", time: "12%", plan: "0", photo: 130 };
    return (
      <table className="rr-table rr-findings">
        <thead>
          <tr>
            <th style={{ width: w.asset }}>Asset system</th>
            <th style={{ width: w.finding }}>Finding &amp; technical observation</th>
            <th style={{ width: w.cause }}>Root cause &amp; impact</th>
            <th style={{ width: w.time }}>Urgency</th>
            {hasPlan && <th style={{ width: w.plan }}>Action plan</th>}
            <th style={{ width: w.photo }}>Photo</th>
          </tr>
        </thead>
        {list.map((f) => {
          const photos = f.attachments.filter((a) => a.kind === "photo" && (a.thumbDataUrl || a.dataUrl));
          return (
            <tbody key={f.id} className="rr-unit">
              <tr>
                <td>
                  <div style={{ fontWeight: 700 }}>{f.system || "General"}</div>
                </td>
                <td>
                  <FindingCell f={f} responses={responses} requirementOf={requirementOf} checkOf={checkOf} />
                </td>
                <td>
                  {(f.rootCauseCategories ?? []).length === 0 && (f.impactAreas ?? []).length === 0 ? (
                    <span style={{ color: INK_SOFT }}>Not yet assessed</span>
                  ) : (
                    <>
                      {(f.rootCauseCategories ?? []).length > 0 && (
                        <div className="rr-tagblock">
                          <div className="rr-taglabel">Root cause</div>
                          {(f.rootCauseCategories ?? []).map((c) => <Tag key={c} kind="cause">{c}</Tag>)}
                        </div>
                      )}
                      {(f.impactAreas ?? []).length > 0 && (
                        <div className="rr-tagblock">
                          <div className="rr-taglabel">Impact</div>
                          {(f.impactAreas ?? []).map((a) => <Tag key={a} kind="impact">{a}</Tag>)}
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td><TimelineBadge timeline={f.timeline} /></td>
                {hasPlan && <td className="rr-plan" style={{ color: f.actionPlan ? undefined : INK_SOFT }}>{f.actionPlan || "\u2014"}</td>}
                <td>
                  <PhotoCell photos={photos} figureNo={figureNo} entityCode={entityCode} visitId={visitId} annexure={photoAnnexure} />
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>
    );
  };

  const generated = new Date();
  /* Strings that go into CSS `content:`; quotes and backslashes removed so a name
     can never break out of the declaration. */
  const cssSafe = (t: string) => t.replace(/["\\\n]/g, " ");
  const runningHead = cssSafe(`Squawk Assurance \u00b7 ${discipline} \u00b7 ${entityCode} \u00b7 ${visitLabel}`);
  const stamp = cssSafe(
    `${generated.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })} ${generated.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`
  );

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
        /* PRINT ARCHITECTURE — Sarel, 27 Nov 2026. A4 portrait, 15/12mm margins.
           Running header (pages 2+) and footer (timestamp, disclaimer, "Page X of
           Y") sit in the page margin boxes, so they print on every page and never
           collide with content. Table headers repeat on each page a table
           continues onto; rows, cards, KPI boxes and a finding's photographs are
           never split; a table's first row is kept with its header and its last
           row with the one before, so no single row is stranded. The "Download
           PDF" button draws the same header, footer, repeated table headers and
           break rules itself (src/lib/reportPdf.ts), because it builds the file
           from an image of this page rather than the browser's print engine. */
        @page {
          size: A4 portrait;
          margin: 15mm 12mm 15mm 12mm;
          @top-left { content: "${runningHead}"; font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: ${INK_SOFT}; }
          @bottom-left { content: "Generated ${stamp} \\00B7 Interim, system-generated report: subject to update"; font-family: Arial, Helvetica, sans-serif; font-size: 7.5px; color: ${INK_SOFT}; }
          @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: ${INK_SOFT}; }
        }
        @page :first { @top-left { content: none; } }
        @media screen {
          .rr-report-page { max-width: 860px; margin: 24px auto 64px; box-shadow: 0 1px 10px rgba(0,0,0,0.12); }
        }
        @media print {
          .rr-report-toolbar, .rr-noprint { display: none !important; }
          .rr-report-page { box-shadow: none; }
          thead { display: table-header-group !important; }
          tr, .report-card, .metric-box, .rr-card, figure { break-inside: avoid !important; page-break-inside: avoid !important; }
          tbody.rr-unit { break-inside: avoid; page-break-inside: avoid; }
          h2 { break-after: avoid; page-break-after: avoid; }
          .rr-table tbody tr:first-child { break-after: avoid; }
          .rr-table tbody tr:last-child { break-before: avoid; }
          .rr-annexure { break-before: page; page-break-before: always; }
        }
        .rr-tagblock { margin-bottom: 6px; }
        .rr-taglabel { font-size: 8.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #6B6880; margin-bottom: 3px; }
        .rr-table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
        .rr-table th { background: ${PURPLE}; color: #FFFFFF; text-align: left; padding: 8px 10px; font-weight: 600; font-size: 10.5px; }
        .rr-table td { padding: 8px 10px; border-bottom: 1px solid ${LINE}; vertical-align: top; color: ${INK}; overflow-wrap: anywhere; }
        .rr-table tbody:nth-of-type(even) td, .rr-table tbody tr:nth-child(even) td { background: #FAF9FC; }
        /* Action plan: captured in a large box, printed small so the plan does not dominate the row. */
        .rr-table td.rr-plan { font-size: 9px; line-height: 1.3; }
        .rr-table.rr-amber th { background: ${TIMELINE_COLOR.Immediate}; }
        .rr-table.rr-amber tr:nth-child(even) td { background: ${AMBER_SOFT}; }
      `}</style>

      {wordingWarnings.length > 0 && (
        <div
          className="rr-noprint"
          data-html2canvas-ignore="true"
          role="alert"
          style={{ maxWidth: 860, margin: "16px auto 0", padding: "10px 14px", border: "1px solid #F0C36D", background: "#FFF8E6", borderRadius: 8, fontSize: 12, color: INK }}
        >
          <strong>Before you publish: {wordingWarnings.length} finding{wordingWarnings.length === 1 ? "" : "s"} need{wordingWarnings.length === 1 ? "s" : ""} wording.</strong>{" "}
          Open Triage and use <em>Clean up wording</em> (AI or Basic tidy), then approve the result. Nothing is rewritten here without you.
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {wordingWarnings.map(({ f, t }) => (
              <li key={f.id}>
                <strong>{f.system || "General"}</strong>:{" "}
                {t.flags.includes("question-only")
                  ? `"${briefOf(t.raw, 60)}" is only the audit-check question; say what was actually found`
                  : `"${t.raw}" is too short to stand as a finding`}
              </li>
            ))}
          </ul>
        </div>
      )}
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

        {/* KPI STRIP — four cards (Sarel, 27 Nov 2026): the old six tiles and
            the "how to read the counts" explainer are gone; each card says what
            it counts. A finding counts once in "Immediate action required"
            however many of its tags apply. */}
        <div style={{ display: "flex", gap: 12, padding: "20px 36px 0" }}>
          {(
            [
              {
                label: "Total findings",
                n: findings.length,
                tone: "",
                sub: (
                  <>
                    <Pill2 bg="#FBE4DE" fg="#B3261E">{nonCompliances} non-compliance{nonCompliances === 1 ? "" : "s"}</Pill2>
                    <Pill2 bg={PURPLE_SOFT} fg={PURPLE}>{observations} observation{observations === 1 ? "" : "s"}</Pill2>
                  </>
                ),
              },
              {
                label: "Immediate action required",
                n: immediateAction.length,
                tone: "imm",
                sub: (
                  <span>
                    {[
                      safetyList.length ? `${safetyList.length} safety` : "",
                      criticalList.length ? `${criticalList.length} critical` : "",
                      immediate ? `${immediate} immediate timeline` : "",
                    ]
                      .filter(Boolean)
                      .join(" \u00b7 ") || "Nothing urgent recorded"}
                  </span>
                ),
              },
              {
                label: "Routine / before next audit",
                n: routine.length,
                tone: "",
                sub: (
                  <span>
                    {byTimeline.counts["Before next audit"]} before next audit &middot; {byTimeline.counts["Long term"]} long term
                    {byTimeline.notSet ? ` \u00b7 ${byTimeline.notSet} not yet timed` : ""}
                  </span>
                ),
              },
              {
                label: "Evidence outstanding",
                n: evidenceOutstanding.length,
                tone: "",
                sub: <span>of {evidenceForDiscipline.length} requested</span>,
              },
            ] as { label: string; n: number; tone: string; sub: React.ReactNode }[]
          ).map(({ n, label, tone, sub }) => (
            <div
              key={label}
              className="report-card metric-box rr-card"
              style={{ flex: 1, background: PURPLE_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px" }}
            >
              <div style={{ fontSize: 9.5, color: INK_SOFT, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: tone === "imm" ? TIMELINE_COLOR.Immediate : INK, marginTop: 2 }}>{n}</div>
              <div style={{ fontSize: 9.5, color: INK_SOFT, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* A category with nothing in it is a quiet chip; a category with items
            gets its table. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "16px 36px 0" }}>
          <NoneChip label="Immediate safety concerns" count={safetyList.length} />
          <NoneChip label="Critical items" count={criticalList.length} />
        </div>
        {safetyList.length > 0 && (
          <TaggedList title="Immediate safety concerns" list={safetyList} responses={responses} requirementOf={requirementOf} checkOf={checkOf} />
        )}
        {criticalList.length > 0 && (
          <TaggedList title="Critical items to attend to" list={criticalList} responses={responses} requirementOf={requirementOf} checkOf={checkOf} />
        )}

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
        {categorised === 0 ? (
          <div style={{ padding: "16px 36px 0" }}>
            <div
              className="rr-card"
              style={{ display: "inline-block", padding: "6px 14px", borderRadius: 999, background: PURPLE_SOFT, color: INK_SOFT, fontSize: 11 }}
            >
              <strong style={{ color: PURPLE }}>Root Cause &amp; Impact Analysis:</strong> Pending post-audit triage (0 of {findings.length} evaluated)
            </div>
          </div>
        ) : (
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
                {[...ROOT_CAUSES, ...LEGACY_ROOT_CAUSES.filter((c) => (rootCauseCounts[c] ?? 0) > 0)].map((c) => (
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
        )}

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
                  <th style={{ width: "30%" }}>What&rsquo;s needed</th>
                  <th style={{ width: "15%" }}>Asset system</th>
                  <th style={{ width: "15%" }}>Status</th>
                  <th style={{ width: "40%" }}>Evidence feedback</th>
                </tr>
              </thead>
              <tbody>
                {evidenceForDiscipline.map((e) => (
                  <tr key={e.id}>
                    <td>{scrubCodes(e.title || "") || "Evidence item"}</td>
                    <td>{e.system || "General"}</td>
                    <td style={{ fontWeight: 600 }}>{TRACKING_LABEL[trackingStage(e)]}</td>
                    <td>{evidenceFeedback(e)}</td>
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
                  <th style={{ width: quickWins.some((f) => f.actionPlan?.trim()) ? "18%" : "35%" }}>Asset system</th>
                  <th style={{ width: quickWins.some((f) => f.actionPlan?.trim()) ? "67%" : "65%" }}>Finding</th>
                  {quickWins.some((f) => f.actionPlan?.trim()) && <th style={{ width: "15%" }}>Action plan</th>}
                </tr>
              </thead>
              <tbody>
                {quickWins.map((f) => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.system || "General"}</td>
                    <td><FindingCell f={f} responses={responses} requirementOf={requirementOf} checkOf={checkOf} /></td>
                    {quickWins.some((x) => x.actionPlan?.trim()) && (
                      <td className="rr-plan" style={{ color: f.actionPlan?.trim() ? INK : INK_SOFT }}>
                        {f.actionPlan?.trim() || "\u2014"}
                      </td>
                    )}
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
          {withActionPlan.length === 0 ? (
            <p style={{ fontSize: 10.5, color: INK_SOFT, margin: 0 }}>
              <strong>Action &amp; improvement plan:</strong> none captured for {discipline} yet.
            </p>
          ) : (
            <>
            <SectionHeading>Action &amp; improvement plan &middot; {withActionPlan.length} of {findings.length} findings</SectionHeading>
            <table className="rr-table">
              <thead>
                <tr>
                  <th style={{ width: "16%" }}>Asset system</th>
                  <th style={{ width: "32%" }}>Finding</th>
                  <th style={{ width: "14%" }}>Timeline</th>
                  <th style={{ width: "38%" }}>Action &amp; improvement plan</th>
                </tr>
              </thead>
              <tbody>
                {withActionPlan.map((f) => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.system || "General"}</td>
                    <td><FindingCell f={f} responses={responses} requirementOf={requirementOf} checkOf={checkOf} /></td>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap", color: f.timeline ? TIMELINE_COLOR[f.timeline] : INK_SOFT }}>
                      {f.timeline || "Not set"}
                    </td>
                    <td className="rr-plan">{f.actionPlan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>

        {/* PREVIOUS OPEN FINDINGS — Sarel, 26 Nov 2026: "the report should
            also show previous open findings and their new status and
            comments". */}
        <div style={{ padding: "24px 36px 0" }}>
          {previous.length === 0 ? (
            <p style={{ fontSize: 10.5, color: INK_SOFT, margin: 0 }}>
              <strong>Previous open findings:</strong> none from earlier audits were open for {discipline}.
            </p>
          ) : (
            <>
            <SectionHeading>Previous open findings &mdash; status update &middot; {previous.length}</SectionHeading>
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
                    <td>{scrubCodes(r.finding)}</td>
                    <td>{r.rating}</td>
                    <td style={{ fontWeight: 600, color: r.status === "Closed" ? "#1B7F4B" : r.status === "Not yet verified" ? INK_SOFT : "#B3261E" }}>
                      {r.status}
                    </td>
                    <td>{r.comments.length ? scrubCodes(r.comments.join(" \u2022 ")) : "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
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
          This report was generated by Squawk from the Risk &amp; Root Cause register and is scoped to {discipline}. Where the
          Timeline, Root Cause, Impact or Action Plan is blank, that item has not yet been assessed or completed and should
          not be read as a determination. The live, editable record from which this report was produced is maintained on the
          Review page.
        </p>

        {/* PHOTOGRAPHIC ANNEXURE — only when the user ticks "Include
            Photographic Annexure". A 2-up grid at the very end, full-size
            images, "Figure N: Asset system - summary". */}
        {photoAnnexure && annexureItems.length > 0 && (
          <div className="rr-annexure" style={{ padding: "24px 36px 24px" }}>
            <SectionHeading>Photographic annexure &middot; {annexureItems.length}</SectionHeading>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {annexureItems.map((x) => (
                <AnnexureFigure key={x.a.id} attachment={x.a} n={figureNo.get(x.a.id) ?? 0} system={x.f.system} brief={x.brief} entityCode={entityCode} visitId={visitId} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
