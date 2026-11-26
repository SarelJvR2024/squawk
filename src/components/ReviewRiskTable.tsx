"use client";

/** THE REVIEW TABLE — §1's "biggest gap" and §3's table + bulk bar + filters,
 *  from the Review risk-fields addendum. One row per finding (observation or
 *  non-compliance) raised this visit, with the addendum's new risk fields
 *  inline-editable in the table itself and in full in ReviewRiskPanel
 *  (rendered by the caller — see /review's own page for how the two sit side
 *  by side).
 *
 *  Impact and root cause categories are never computed twice: every filter
 *  here calls into src/lib/reviewRisk.ts, the one shared function the
 *  addendum itself asks for.
 *
 *  REVIEW TABLE V2 (see docs/capture-review/review-table-v2-discovery.md)
 *  widened this to the full column set Sarel approved from a mockup: select ·
 *  Type · Discipline · Asset system · Audit check · Finding/comment · Severity
 *  · Likelihood · Rating · Root cause · Impact · Timeline · Evidence — a FIXED
 *  set, no column-toggle any more, because that mockup is one specific wide
 *  table, not a customisable one. Also added: Discipline/Asset system filters,
 *  reusing `ALL_DISCIPLINES`/`systemsOf`/`systemsAt` (src/lib/register.ts)
 *  rather than a second vocabulary.
 *
 *  Timeline (Finding.timeline, TIMELINES in riskVocab.ts) — Sarel: "make sure
 *  that column is... in the table, and that we can do inline editing of that
 *  field." Single-select, so a plain `<select>`, not the always-visible
 *  chip row Root cause/Impact use (see MultiSelectCell's own header for why
 *  those two are chips, not a select).
 *
 *  16 Nov 2026 — SEVERITY, LIKELIHOOD AND RATING ARE GONE FROM THIS TABLE.
 *  Sarel: "we're not going to do severity and likelihood ratings on a
 *  finding level, for now... only on an asset system level." The Severity/
 *  Likelihood `<select>` columns, the derived Rating column, and the bulk
 *  bar's own "Set severity"/"Set likelihood" controls are all removed — see
 *  FindingDetail.tsx and findings/page.tsx for the same removal on the
 *  other two screens that used to let an auditor rate a Finding directly.
 *  `priorityFor`/`bandFor` themselves are untouched in reviewRisk.ts/risk.ts
 *  — still the one place the asset-system level rating is derived from —
 *  this table simply no longer calls them. AI "Suggest rating" was never
 *  built for severity/likelihood here and is moot now that there is
 *  nothing on a finding to rate.
 *
 *  16 Nov 2026 — BULK "SUGGEST WORDING", on the SAME selection checkboxes
 *  every other bulk action here already uses. Sarel: "I want us to be
 *  able to do bulk transcribing of the voice notes... [and] AI to correct,
 *  to review the context of the finding... have the option to toggle
 *  between original notes and AI cleaned notes." Reuses the exact "polish"
 *  task and polishContext ReviewRiskPanel's own single-finding "Suggest
 *  wording" button already calls — see BulkBar's own doc comment below for
 *  the propose/review/apply shape, which mirrors /cleanup's PolishSection
 *  (the bulk tool this consolidates into the Review page, per Sarel's own
 *  "make sure all AI cleanup is available and accessible from root cause
 *  page"). */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FINDING_TYPE_LABEL,
  IMPACT_AREAS,
  ROOT_CAUSES,
  TIMELINES,
  applyBulkMulti,
  findingTypeFor,
  matchesReviewRiskFilter,
  toggleMulti,
  type ReviewRiskFilter,
} from "@/lib/reviewRisk";
import { ALL_DISCIPLINES, checksAt, systemsAt, systemsOf } from "@/lib/register";
import { entity as entityOf } from "@/lib/programme";
import { useEvidenceItems, useFieldSaveStatus, useStore, useVisitId } from "@/lib/store";
import { getBlob, useBlobUrl } from "@/lib/media";
import { assist, polishContext, transcribe, useAssistAvailable, useTranscribeAvailable } from "@/lib/assist";
import { Chip, Pill, SaveStatusPill } from "@/components/ui/primitives";
import { IconCamera, IconMic, IconSpark } from "@/components/ui/icons";
import { basicTidy, wordDiff } from "@/lib/wordDiff";
import EvidenceQuickCapture from "@/components/EvidenceQuickCapture";
import type { Attachment, Check, Finding, Response } from "@/lib/types";

/** The sort key an empty/absent Asset system sorts under — see `visible`'s
 *  own comment below. Built with fromCharCode rather than a string literal
 *  containing an actual U+FFFF character, so this file has no invisible,
 *  noncharacter byte sitting in its source. */
const GENERAL_SYSTEM_SORT_KEY = String.fromCharCode(0xffff);

/** How many rows this table mounts at once, and how many more a "Show
 *  more" click reveals — Sarel: "oria root cause not loading on my
 *  device," reported again AFTER the photo-thumbnail fix (#282) didn't
 *  resolve it, on a desktop laptop, with the crash isolated to this tab
 *  alone (By check and Evidence, over the same findings, were fine).
 *  That ruled photos back out as the sole cause: the table itself has no
 *  virtualization, and a completed audit's full, unfiltered finding count
 *  — every row its own <tr> with several editable cells — is enough on
 *  its own. The fix in EvidenceThumb was real and stays (a photo-heavy
 *  row is still far more expensive than a text-only one), but it was
 *  never sufficient by itself: this bounds the table's first paint to a
 *  fixed number of rows regardless of how many findings exist, which is
 *  the actual guarantee the crash needed. `visible` below — the full
 *  filtered, sorted array — is untouched and still what the row count,
 *  Select all and bulk actions operate on; only the .map() that mounts
 *  <tr>s is capped, via `shown`. */
const PAGE_SIZE_INITIAL = 50;
const PAGE_SIZE_STEP = 100;
/** "Show more" stops growing the page past this — otherwise enough clicks
 *  mount the whole unfiltered list again and recreate the exact crash
 *  this file exists to prevent, just more slowly. An audit this large
 *  needs the Discipline/Asset system filters above, not more paging. */
const MAX_MOUNTED_ROWS = 500;

export default function ReviewRiskTable({
  findings,
  entityCode,
  responses,
  activeId,
  onActivate,
  onChange: onChangeProp,
  onDeleteMany,
}: {
  findings: Finding[];
  /** Deletes the findings with these ids. Optional: a screen that does not
   *  pass it shows no Delete in the bulk bar. The bar asks to confirm
   *  first, and says how many go. */
  onDeleteMany?: (ids: string[]) => void;
  /** For the Audit check column's requirement-text lookup and the Asset
   *  system filter's register lookups — this table reads no other check
   *  data. */
  entityCode: string;
  /** Keyed by checkId — read-only here, so the Finding column can show the
   *  linked check's own desk note (`observation`) and evidence verdict
   *  (`evidenceProves`) next to the finding itself, without a second,
   *  duplicate source of the same text (see the Finding column's own
   *  comment below). Never written from this table.
   *
   *  ALWAYS THE CALLER'S CURRENT-VISIT DATA (useResponses()), whatever
   *  findings this table is showing — this table does not, and cannot,
   *  read another visit's responses. The Finding column only actually
   *  uses it for a finding raised on the current visit; see the
   *  originVisit guard where `r` is read, below. */
  responses: Record<string, Response>;
  activeId: string | null;
  onActivate: (id: string) => void;
  /** The caller owns the write (updateFinding), same as everywhere else in
   *  this app a table edits a record in place. */
  onChange: (id: string, patch: Partial<Finding>) => void;
}) {
  const [filter, setFilter] = useState<ReviewRiskFilter>({ kind: "all" });
  /* CODE REVIEW ON BUILD PROMPT 8's OWN BRANCH — see the identical guard
     and comment in ReviewRiskPanel.tsx. `responses` is always the
     CALLER's current-visit data; reading it unconditionally per row was
     safe while every caller only ever passed current-visit findings. The
     Issues screen's entity-wide filters are the first to pass older
     findings through this same table, so the Finding column's own
     linked-check context (below) is gated on originVisit too. */
  const visitId = useVisitId();
  /* PRIORITY 2 (review redesign) — one shared saving/saved/failed
     indicator for the whole table (not one per row/cell — with many rows
     editable at once, N independent indicators would be noise, and every
     write here goes through the SAME lastSavedAt/persistError signals
     anyway). Tracks WHICH row was last touched, not a fresh Date.now()
     read — calling Date.now() inside a component body is exactly what the
     React Compiler's `react-hooks/purity` lint rule refuses, so the
     timestamp useFieldSaveStatus compares against is that row's own
     `updatedAt`, already stamped by updateFinding (store.ts) the moment
     the edit actually lands. Every call site below goes through this
     wrapper instead of the prop directly, same convention as
     ReviewRiskPanel's own. */
  const [lastEditedId, setLastEditedId] = useState<string | null>(null);
  const onChange = (id: string, patch: Partial<Finding>) => {
    setLastEditedId(id);
    onChangeProp(id, patch);
  };
  const saveStatus = useFieldSaveStatus(
    lastEditedId ? (findings.find((f) => f.id === lastEditedId)?.updatedAt ?? null) : null
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  /* Inline photo thumbnails (below) open here full-size rather than
     navigating away — a lightbox over the table, not a second screen. */
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  /* Audit-check reference codes are presentation we no longer show (see
   *  PR "Review pages: remove audit-check reference codes from the UI") —
   *  the readable requirement text takes their place everywhere a check is
   *  linked. Built once per entity rather than re-scanning checksAt() on
   *  every row's render. */
  const evidenceItems = useEvidenceItems();
  const checksById = useMemo(() => {
    const m = new Map<string, Check>();
    for (const c of checksAt(entityCode)) m.set(c.id, c);
    return m;
  }, [entityCode]);

  /* PRIORITY 2 — sorted Discipline, then Asset system, so a reviewer going
     down the table moves through one discipline's systems together rather
     than in raise-order. "General" (no system) sorts after every named
     system within its discipline, never before — GENERAL_SYSTEM_SORT_KEY
     (module scope, below) is the highest BMP code point, which sorts after
     any real system name under localeCompare, so an empty/absent system is
     pushed to the end of its discipline's own group without needing a
     second pass. */
  const visible = useMemo(() => {
    const filtered = findings.filter((f) => matchesReviewRiskFilter(f, filter));
    return [...filtered].sort((a, b) => {
      const byDiscipline = (a.discipline || "").localeCompare(b.discipline || "");
      if (byDiscipline !== 0) return byDiscipline;
      return (a.system || GENERAL_SYSTEM_SORT_KEY).localeCompare(b.system || GENERAL_SYSTEM_SORT_KEY);
    });
  }, [findings, filter]);

  /* How many of `visible` are actually mounted as <tr>s — see
     PAGE_SIZE_INITIAL's own comment. Reset to the initial page whenever
     the filter narrows or widens the set, so switching filters always
     starts cheap rather than carrying over a large page size from a
     previous, bigger view. Adjusted during render against the previous
     filter, React's own documented pattern for this ("Adjusting state
     when a prop changes") — not an effect, which would cost an extra,
     visible render of the stale page before snapping back. */
  const [shown, setShown] = useState(PAGE_SIZE_INITIAL);
  const [prevFilter, setPrevFilter] = useState(filter);
  if (filter !== prevFilter) {
    setPrevFilter(filter);
    setShown(PAGE_SIZE_INITIAL);
  }

  /* Asset system options narrow to the active Discipline filter's own
     systems — systemsOf — and fall back to every system at this entity —
     systemsAt — the rest of the time. Neither list is invented here. */
  const systemOptions = useMemo(
    () =>
      filter.kind === "discipline" ? systemsOf(entityCode, filter.discipline) : systemsAt(entityCode),
    [entityCode, filter]
  );

  const toggleRow = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedFindings = visible.filter((f) => selected.has(f.id));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3">
      {/* Filters — the Rating/Not-rated/Root-cause-unconfirmed CHIP ROW Sarel
          asked removed ("remove these filters", screenshot of the All/
          Priority I/II/III/Not rated row) is gone. The four dropdowns below
          stay — his screenshot didn't mark those, and they're how a reviewer
          narrows a 36+-row table down rather than scanning it. A finding can
          still be reached by any of the filter KINDS `ReviewRiskFilter`
          supports (nothing was removed from reviewRisk.ts) — there is simply
          no chip bound to "priority"/"notRated"/"unconfirmed" any more. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-[6px]">
        <select
          aria-label="Filter by discipline"
          value={filter.kind === "discipline" ? filter.discipline : ""}
          onChange={(e) =>
            e.target.value
              ? setFilter({ kind: "discipline", discipline: e.target.value })
              : setFilter({ kind: "all" })
          }
          className="h-[30px] rounded-[8px] border px-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
        >
          <option value="">Discipline…</option>
          {ALL_DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by asset system"
          value={filter.kind === "system" ? filter.system : ""}
          onChange={(e) =>
            e.target.value
              ? setFilter({ kind: "system", system: e.target.value })
              : setFilter({ kind: "all" })
          }
          className="h-[30px] rounded-[8px] border px-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
        >
          <option value="">Asset system…</option>
          {systemOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by impact area"
          value={filter.kind === "impact" ? filter.area : ""}
          onChange={(e) =>
            e.target.value
              ? setFilter({ kind: "impact", area: e.target.value })
              : setFilter({ kind: "all" })
          }
          className="h-[30px] rounded-[8px] border px-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
        >
          <option value="">Impact area…</option>
          {IMPACT_AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by root cause category"
          value={filter.kind === "rootCause" ? filter.category : ""}
          onChange={(e) =>
            e.target.value
              ? setFilter({ kind: "rootCause", category: e.target.value })
              : setFilter({ kind: "all" })
          }
          className="h-[30px] rounded-[8px] border px-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
        >
          <option value="">Root cause category…</option>
          {ROOT_CAUSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {/* Type filter — Sarel, same request as the inline edit above:
            "add this as an additional filter on the table." Reads the
            SAME FINDING_TYPE_LABEL/findingTypeFor the cell and the
            panel's own chips already use, not a second vocabulary. */}
        <select
          aria-label="Filter by type"
          value={filter.kind === "type" ? filter.type : ""}
          onChange={(e) =>
            e.target.value
              ? setFilter({
                  kind: "type",
                  type: e.target.value as "non-compliance" | "observation" | "needs-evidence",
                })
              : setFilter({ kind: "all" })
          }
          className="h-[30px] rounded-[8px] border px-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
        >
          <option value="">Type…</option>
          {(["non-compliance", "observation", "needs-evidence"] as const).map((t) => (
            <option key={t} value={t}>
              {FINDING_TYPE_LABEL[t]}
            </option>
          ))}
        </select>

        {/* GENERATE REPORT — Sarel: "make the report available to generate
            a PDF from the review root cause page to generate a report
            based on the discipline that's selected in the filters." Needs
            one discipline picked (the Discipline select above, not
            system/impact/root-cause, which narrow within a discipline
            rather than naming one) — disabled with a tooltip otherwise,
            same convention EvidenceReviewView's own "Share list with
            discipline" button already uses. Opens /report in a new tab: a
            plain, unrouted <a>, not router.push, because the report is
            meant to be printed/saved and come back to, not navigated away
            to. It reads no data from here — the new tab shares this same
            browser's IndexedDB, so it sees the same findings without a
            second copy passed through the URL. */}
        {/* REQUEST EVIDENCE — Sarel, 26 Nov 2026: "add a link to capture
            evidence request from the triage page". Opens the existing quick
            capture (same addEvidenceItem write as the Evidence tab and
            /evidence) so a gap noticed while triaging is logged on the spot. */}
        <button
          type="button"
          aria-expanded={evidenceOpen}
          onClick={() => setEvidenceOpen((o) => !o)}
          className="ml-auto flex h-[30px] items-center rounded-[8px] border px-3 text-[11px] font-semibold"
          style={{ borderColor: "var(--line-2)", color: "var(--ink-2)", background: "var(--panel)" }}
        >
          Request evidence
        </button>
        <a
          href="/evidence"
          className="flex h-[30px] items-center text-[11px] underline"
          style={{ color: "var(--ink-3)" }}
        >
          Evidence log
        </a>
        {/* CLEAN UP WORDING — Sarel, 26 Nov 2026: "On triage, add a button to
            allow cleanup of findings where it will give proper cleanup
            technical wording, and allow user to approve changes or reject
            changes." The machinery already exists (BulkSuggestWording: the
            "polish" task, one proposal per finding, Accept/Reject each) but
            sat inside the bulk bar, which only appears once rows are
            ticked — nobody found it. This button ticks every finding in the
            current view and scrolls the bulk bar into sight; nothing is
            written until a proposal is accepted. */}
        <button
          type="button"
          disabled={visible.length === 0}
          onClick={() => {
            setSelected(new Set(visible.map((f) => f.id)));
            requestAnimationFrame(() =>
              document.getElementById("triage-bulk-bar")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
            );
          }}
          title={
            "Propose cleaner technical wording for every finding shown (AI, or Basic tidy), then accept or reject each one"
          }
          className="flex h-[30px] items-center gap-[5px] rounded-[8px] border px-3 text-[11px] font-semibold disabled:opacity-50"
          style={{ borderColor: "var(--acc-line)", color: "var(--acc)", background: "var(--acc-soft)" }}
        >
          <IconSpark width={12} height={12} />
          Clean up wording
        </button>
        <a
          href="/report?discipline=all"
          target="_blank"
          rel="noopener noreferrer"
          title="One report for every discipline at this airport"
          className="flex h-[30px] items-center rounded-[8px] border px-3 text-[11px] font-semibold"
          style={{ borderColor: "var(--acc)", color: "var(--acc)", background: "var(--panel)" }}
        >
          Airport report
        </a>
        {filter.kind === "discipline" ? (
          <a
            href={`/report?discipline=${encodeURIComponent(filter.discipline)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[30px] items-center rounded-[8px] px-3 text-[11px] font-semibold"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            Generate report
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Pick one discipline above first — a report is generated for one discipline at a time."
            className="flex h-[30px] items-center rounded-[8px] px-3 text-[11px] font-semibold opacity-50"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            Generate report
          </button>
        )}
      </div>

      {/* Bulk bar — §3: set severity/likelihood/impact/root cause for every
          selected row at once. */}
      {evidenceOpen && <EvidenceQuickCapture />}
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          findings={selectedFindings}
          entityCode={entityCode}
          checksById={checksById}
          onApply={(patchFor) => {
            for (const f of selectedFindings) onChange(f.id, patchFor(f));
          }}
          onChangeOne={onChange}
          onClear={() => setSelected(new Set())}
          onDelete={
            onDeleteMany
              ? () => {
                  onDeleteMany(selectedFindings.map((f) => f.id));
                  setSelected(new Set());
                }
              : undefined
          }
        />
      )}

      {/* PRIORITY 2 — one line, computed from the SAME `visible` array the
          rows below are rendered from, so this count can never drift from
          what is actually on screen (unlike a chip's own count, which
          deliberately shows what clicking it WOULD yield, not what is
          currently shown). */}
      <div className="mb-1.5 flex items-center gap-[8px] text-[10.5px]" style={{ color: "var(--ink-3)" }}>
        <span>
          {visible.length} finding{visible.length === 1 ? "" : "s"}
          {filter.kind !== "all" ? ` matching this filter (of ${findings.length} total)` : ""}
        </span>
        <SaveStatusPill status={saveStatus} />
      </div>

      {/* The table itself — Sarel's mockup column set, narrowed per his own
          follow-up requests since: Severity/Likelihood/Rating removed (not
          rated at finding level — see this file's own header); Discipline
          and Audit check merged into one "Location / Hierarchy" column
          (see that column's own comment below for why); Evidence shows
          actual photo thumbnails, not only a count. Current set — select ·
          Type · Location/Hierarchy · Finding/comment · Root cause · Impact
          · Timeline · Evidence. */}
      <div className="overflow-x-auto rounded-[11px] border" style={{ borderColor: "var(--line)" }}>
        <table className="w-full text-[11.5px]">
          <thead>
            <tr style={{ background: "var(--sunken)" }}>
              <th className="w-[32px] p-2">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={visible.length > 0 && visible.every((f) => selected.has(f.id))}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(visible.map((f) => f.id)) : new Set())
                  }
                />
              </th>
              <Th>Type</Th>
              <Th>Tags</Th>
              <Th>Location / Hierarchy</Th>
              <th className="p-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
                Finding
              </th>
              <Th>Root cause</Th>
              <Th>Impact</Th>
              <Th>Timeline</Th>
              <Th>Action plan</Th>
              <Th>Evidence requested &amp; comments</Th>
              <Th>Photos</Th>
              <Th>{""}</Th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, shown).map((f) => {
              const impact = f.impactAreas ?? [];
              const causes = f.rootCauseCategories ?? [];
              const type = findingTypeFor(f);
              const photoAttachments = f.attachments.filter((a) => a.kind === "photo");
              const voices = f.attachments.filter((a) => a.kind === "voice").length;
              const on = f.id === activeId;
              return (
                <tr
                  key={f.id}
                  onClick={() => onActivate(f.id)}
                  className="cursor-pointer border-t"
                  style={{ borderColor: "var(--line)", background: on ? "var(--acc-soft)" : "transparent" }}
                >
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${f.title || f.id}`}
                      checked={selected.has(f.id)}
                      onChange={() => toggleRow(f.id)}
                    />
                  </td>

                  {/* Type — inline-editable now, same plain-<select>
                      pattern as Timeline below, rather than the panel
                      being the only place to set it — Sarel: "the type
                      need to allow for inline editing to select between
                      observation and non-compliance and require evidence
                      to verify." The panel keeps its own Type chips too;
                      both write through the same onChange. Internal is
                      editable right here too, same column, since both
                      are classification — Sarel, separately: "add an
                      option in root cause to tag rows 'internal' to keep
                      as our internal info and not make it into any
                      reports." See ReviewRiskReport.tsx for the one
                      place that flag is actually read. */}
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    {/* One click picks the type — all three shown, single
                        select (Sarel, 26 Nov 2026). */}
                    <div role="radiogroup" aria-label={`Type for ${f.title || f.id}`} className="flex flex-col items-stretch gap-[4px]">
                      {(["observation", "non-compliance", "needs-evidence"] as const).map((t) => {
                        const on = type === t;
                        const bad = t === "non-compliance";
                        return (
                          <button
                            key={t}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => onChange(f.id, { findingType: t })}
                            className="rounded-[6px] border px-2 py-1 text-left text-[10.5px] font-semibold"
                            style={{
                              background: on ? (bad ? "var(--bad-bg)" : "var(--acc-soft)") : "var(--panel)",
                              borderColor: on ? (bad ? "var(--bad-line)" : "var(--acc)") : "var(--line-2)",
                              color: on ? (bad ? "var(--bad)" : "var(--acc)") : "var(--ink-3)",
                            }}
                          >
                            {on ? "\u25CF " : "\u25CB "}
                            {FINDING_TYPE_LABEL[t]}
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  {/* Tags — multi-select: any combination. Immediate sets the
                      Timeline to Immediate; Internal keeps the row out of
                      reports. */}
                  <td className="p-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-start gap-[4px]">
                      <Chip
                        selected={f.timeline === "Immediate"}
                        onClick={() => onChange(f.id, { timeline: f.timeline === "Immediate" ? undefined : "Immediate" })}
                        title="Immediate: act on this now (sets the Timeline to Immediate)"
                      >
                        Immediate
                      </Chip>
                      <Chip
                        selected={!!f.safetyTag}
                        onClick={() => onChange(f.id, { safetyTag: !f.safetyTag })}
                        title="Immediate safety concern: a hazard to people or operations that needs attention now. Reported separately from Critical."
                      >
                        Immediate safety concern
                      </Chip>
                      <Chip
                        selected={!!f.critical}
                        onClick={() => onChange(f.id, { critical: !f.critical })}
                        title="Immediate critical item: a serious finding that must be dealt with. Reported separately from Safety concern."
                      >
                        Immediate critical item
                      </Chip>
                      <Chip
                        selected={!!f.internalOnly}
                        onClick={() => onChange(f.id, { internalOnly: !f.internalOnly })}
                        title={`Keep "${f.title || f.id}" internal — leave it out of reports`}
                      >
                        Internal
                      </Chip>
                    </div>
                  </td>

                  {/* LOCATION / HIERARCHY — Discipline and Audit check used
                      to be two separate columns, each capable of printing
                      its own "General" when nothing more specific was
                      linked — Sarel: "remove redundant repetition of
                      'General' across two columns... combine Discipline and
                      Audit Check into a single clean 'Location / Hierarchy'
                      column." The audit check's own requirement TEXT isn't
                      shown here any more either (it was the widest thing in
                      the row and directly fought the density goal above);
                      it's still one click away in the detail panel's own
                      "linked audit check" section, which is where editing
                      the link happens too. Discipline is always shown (it's
                      a required field, never empty); the asset system below
                      it in muted text, or one subtle badge when nothing
                      more specific — system or check — is linked, instead
                      of the plain italic "General" used before. */}
                  <td className="min-w-[90px] max-w-[150px] p-2 align-top whitespace-nowrap">
                    <div className="truncate font-semibold" style={{ color: "var(--ink)" }}>
                      {f.discipline || "—"}
                    </div>
                    {f.system || f.checkId ? (
                      <div className="mt-[1px] truncate text-[10px]" style={{ color: "var(--ink-3)" }}>
                        {f.system || "General"}
                      </div>
                    ) : (
                      <Pill tone="neutral">General</Pill>
                    )}
                  </td>

                  {/* Finding — Sarel: "remove duplication of the same
                      infomation in the findings column, this should be the
                      notes from the audit check, the finding and the
                      evidence review." Three distinct sources, each only
                      rendered when it actually has something to say, never
                      the same text repeated under two labels:
                        - the linked check's own desk note (Response.observation)
                        - the finding itself (title, then description if it
                          says something the title didn't already)
                        - what the evidence review found (Response.evidenceProves)
                      A finding with no checkId has no audit-check note or
                      evidence-review verdict to show — those two lines are
                      simply absent, not "General".
                      16 Nov 2026 — Sarel, on the live table: "remove the
                      heading findings, audit check notes from the findings
                      column, no need for headings in the column." The
                      "AUDIT CHECK NOTE"/"FINDING"/"EVIDENCE REVIEW" eyebrow
                      labels are gone; the three sources still read in the
                      same order and stay visually distinct by weight alone
                      (the finding itself bold, the other two not) — the
                      same distinction `about`/`checkRequirement` in the AI
                      prompts below reads programmatically, this is just no
                      longer spelled out on screen too.

                      18 Nov 2026 — Sarel: "the audit check questions must
                      be in the table in root cause, make sure it is
                      there." The check's own requirement wording came out
                      of this table entirely in the Location/Hierarchy pass
                      above (it was the widest thing in the row); asked
                      back, it goes here — in the findings/observation
                      column, not a column of its own, per Sarel's own
                      answer on where. ACSA's words, muted and above the
                      desk note, the same attribution the Checks screen
                      itself gives this exact text (CheckDetail.tsx's own
                      "the register's wording" note) — this table is not
                      inventing a fourth source, it is showing one that was
                      always available via checksById, just not rendered
                      here before. */}
                  <td className="min-w-[220px] max-w-[400px] p-2 align-top">
                    {(() => {
                      const r = f.checkId && f.originVisit === visitId ? responses[f.checkId] : undefined;
                      const question = f.checkId ? checksById.get(f.checkId)?.requirement : undefined;
                      return (
                        <div className="flex flex-col gap-[6px]">
                          {question && (
                            <div className="whitespace-normal break-words text-[10.5px] italic" style={{ color: "var(--ink-3)" }}>
                              <span className="mr-1.5 rounded-[4px] border px-1 font-mono text-[9.5px] not-italic font-semibold" style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}>
                                {f.checkId}
                              </span>
                              {question}
                            </div>
                          )}
                          {r?.observation && (
                            <div className="whitespace-normal break-words text-[10.5px]" style={{ color: "var(--ink-2)" }}>
                              {r.observation}
                            </div>
                          )}
                          <div>
                            <div className="whitespace-normal break-words font-semibold" style={{ color: "var(--ink)" }}>
                              {f.title || f.description || f.id}
                            </div>
                            {f.description && f.title && f.description !== f.title && (
                              <div className="mt-[2px] whitespace-normal break-words text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                                {f.description}
                              </div>
                            )}
                          </div>
                          {r?.evidenceProves && (
                            <div className="whitespace-normal break-words text-[10.5px]" style={{ color: "var(--ink-2)" }}>
                              {r.evidenceProves}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* PRIORITY 2 (review redesign) — Root cause and Impact
                      are now editable right here, not panel-only. Every
                      option renders directly inside a stopPropagation'd
                      <td> (see MultiSelectCell's own header, 16 Nov 2026,
                      for why nothing is hidden behind a disclosure any
                      more), so tapping a chip never selects the row.
                      toggleMulti/IMPACT_AREAS/ROOT_CAUSES are the exact
                      same values and toggle function the panel's own chip
                      rows already use — one vocabulary, one toggle, two
                      surfaces. */}
                  <td className="p-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <MultiSelectCell
                      label={`Root cause categories for ${f.title || f.id}`}
                      options={ROOT_CAUSES}
                      selected={causes}
                      onToggle={(v) => onChange(f.id, { rootCauseCategories: toggleMulti(f.rootCauseCategories, v) })}
                    />
                  </td>
                  <td className="p-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <MultiSelectCell
                      label={`Impact areas for ${f.title || f.id}`}
                      options={IMPACT_AREAS}
                      selected={impact}
                      onToggle={(v) => onChange(f.id, { impactAreas: toggleMulti(f.impactAreas, v) })}
                    />
                  </td>

                  {/* Timeline — single-select, same pattern as Severity/
                      Likelihood above (a plain <select>, not the multi-
                      select popover), since a finding is remedied on ONE
                      of these, not several. */}
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      aria-label={`Timeline for ${f.title || f.id}`}
                      value={f.timeline ?? ""}
                      onChange={(e) => onChange(f.id, { timeline: e.target.value || undefined })}
                      className="rounded-[6px] border px-1.5 py-1 text-[10.5px]"
                      style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                    >
                      <option value="">—</option>
                      {TIMELINES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* ACTION & IMPROVEMENT PLAN — Sarel: "Add an option to
                      add action and improvement plan for any row in the
                      root cause table. This will be the action plan for
                      the airports to improve the asset assurance." Same
                      compact trigger-plus-popover shape as MultiSelectCell
                      just above, swapped for a textarea instead of
                      checkboxes — a preview (or a ghost "+ Add") until
                      opened, nothing hidden about WHETHER a plan exists,
                      only the full text until the row is asked to show it.
                      Bound directly, same as every other free-text field
                      in this app (no separate Save button) — the shared
                      SaveStatusPill above the table is the feedback. */}
                  <td className="p-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <ActionPlanCell
                      label={`Action and improvement plan for ${f.title || f.id}`}
                      value={f.actionPlan ?? ""}
                      onChange={(v) => onChange(f.id, { actionPlan: v || undefined })}
                    />
                  </td>

                  {/* EVIDENCE REQUESTED AND COMMENTS ON IT — Sarel, 26 Nov 2026:
                      "add a column for evidence requested and comments on the
                      evidence." The evidence requests logged against this
                      finding's audit check (EvidenceItem.checkIds), each with
                      where it stands, plus what was said about it: the
                      analysis note, why it was insufficient or unavailable,
                      and the check's own "what the evidence proves". */}
                  <td className="min-w-[200px] max-w-[280px] p-2 align-top" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const items = f.checkId ? evidenceItems.filter((e) => e.checkIds.includes(f.checkId!)) : [];
                      const proves = f.checkId ? responses[f.checkId]?.evidenceProves?.trim() : "";
                      if (items.length === 0 && !proves)
                        return <span className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>None requested</span>;
                      return (
                        <div className="flex flex-col gap-[6px]">
                          {items.map((e) => {
                            const status = e.unavailableAt
                              ? "Not available"
                              : e.insufficientAt
                                ? "Insufficient"
                                : e.receivedAt
                                  ? "Received"
                                  : e.requestedAt
                                    ? "Requested"
                                    : "Not yet requested";
                            const comment = [e.analysisNote, e.insufficientReason, e.unavailableReason].filter((t) => t && t.trim()).join(" · ");
                            return (
                              <div key={e.id} className="text-[10.5px]">
                                <div className="font-semibold" style={{ color: "var(--ink-2)" }}>{e.title || e.id}</div>
                                <div style={{ color: e.unavailableAt || e.insufficientAt ? "var(--bad)" : e.receivedAt ? "var(--good)" : "var(--ink-3)" }}>
                                  {status}
                                </div>
                                {comment && <div className="whitespace-normal break-words" style={{ color: "var(--ink-3)" }}>{comment}</div>}
                              </div>
                            );
                          })}
                          {proves && (
                            <div className="whitespace-normal break-words text-[10.5px]" style={{ color: "var(--ink-2)" }}>
                              <span className="font-semibold">Evidence shows: </span>
                              {proves}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Evidence — Sarel: "add the photos in the row so that
                      the photos can be viewed inline." Up to 4 small
                      thumbnails (the finding's own photo evidence; EvidenceItem
                      document-custody requests still live in the panel),
                      tapping one opens it full-size in the lightbox below
                      without leaving the table; "+N" for anything beyond
                      that rather than growing the row unboundedly. */}
                  <td className="min-w-[250px] p-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-[6px]">
                      {photoAttachments.slice(0, 4).map((a) => (
                        <EvidenceThumb key={a.id} attachment={a} onOpen={() => setLightbox(a)} />
                      ))}
                      {photoAttachments.length > 4 && (
                        <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-3)" }}>
                          +{photoAttachments.length - 4}
                        </span>
                      )}
                      {photoAttachments.length === 0 && (
                        <span className="inline-flex items-center gap-[2px] font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                          <IconCamera width={11} height={11} /> 0
                        </span>
                      )}
                      <span className="inline-flex items-center gap-[2px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }} title={`${voices} voice note${voices === 1 ? "" : "s"}`}>
                        <IconMic width={11} height={11} /> {voices}
                      </span>
                    </div>
                  </td>

                  {/* Delete — far right of the row, away from the tags, with a
                      confirm step (Sarel, 26 Nov 2026: "move the delete
                      button somewhere more user friendly"). */}
                  <td className="p-2 align-top" onClick={(e) => e.stopPropagation()}>
                    {onDeleteMany && <RowDelete title={f.title || f.id} onConfirm={() => onDeleteMany([f.id])} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="p-6 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            Nothing matches this filter.
          </div>
        )}
        {/* Everything above this — the count, Select all, bulk actions,
            Generate report — already operates on the full `visible` array;
            only the rows mounted into the table are capped. Narrowing the
            filter further is the fast way to find a specific finding in a
            very large audit; this button is for "no, I actually want to
            scroll the rest."
            "{shown} of {visible.length} shown" names the state directly,
            rather than folding it into the button's own label — an
            earlier draft said "(N left)" counting what was hidden BEFORE
            the click, which read as a promise about what would be left
            AFTER it; two different numbers sharing one word.
            MAX_MOUNTED_ROWS stops this from quietly becoming the same
            crash one click at a time: past it, the button hands the
            reins to the filters above instead of growing further — a
            genuinely enormous audit needs narrowing, not more paging. */}
        {shown < visible.length && (
          <div
            className="flex flex-col items-center gap-1 border-t p-3 text-[11px]"
            style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
          >
            <span>
              {Math.min(shown, visible.length)} of {visible.length} shown
            </span>
            {shown < MAX_MOUNTED_ROWS ? (
              <button
                type="button"
                onClick={() => setShown((s) => Math.min(s + PAGE_SIZE_STEP, MAX_MOUNTED_ROWS))}
                className="rounded-[8px] border px-3 py-1.5 text-[11.5px] font-semibold"
                style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}
              >
                Show {Math.min(PAGE_SIZE_STEP, visible.length - shown, MAX_MOUNTED_ROWS - shown)} more
              </button>
            ) : (
              <span>Use the filters above to narrow a list this large.</span>
            )}
          </div>
        )}
      </div>

      {lightbox && <EvidenceLightbox attachment={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/** One inline evidence thumbnail — Sarel: "add the photos in the row so that
 *  the photos can be viewed inline," then, after seeing it live: "increase
 *  the size of the photo so that you can see it properly inline." 56px, up
 *  from the original 28 — big enough to actually tell what it's a photo
 *  of without opening the lightbox.
 *
 *  ONLY the 240px thumbDataUrl, never the full blob, unless no thumbnail
 *  was ever generated. This table renders every finding's row with no
 *  virtualization — on a complete audit (hundreds of findings, several
 *  photos each) that is dozens to hundreds of EvidenceThumbs mounted at
 *  once. The full blob `useBlobUrl` resolves is a decoded ~1600px bitmap,
 *  multiple MB each once the browser decodes it; load that many of them
 *  into a 56px box at the same time and the tab's renderer runs out of
 *  memory and crashes outright — "This page couldn't load", not a React
 *  error, because there was never an exception to catch. The lightbox
 *  below still wants the full blob (`EvidenceLightbox`, one open at a
 *  time) — only this inline tile must stay on the cheap thumbnail. */
function EvidenceThumb({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const thumb = attachment.thumbDataUrl || attachment.dataUrl || null;
  const { url } = useBlobUrl(thumb ? null : attachment.blobKey);
  const src = thumb ?? url ?? null;
  if (!src) return <IconCamera width={11} height={11} />;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={attachment.caption ? `View photo: ${attachment.caption}` : "View photo"}
      className="block overflow-hidden rounded-[6px] border p-0"
      style={{ borderColor: "var(--line-2)", width: 120, height: 120 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a local blob/data URL, not a remote asset next/image can optimise */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </button>
  );
}

/** Full-size view for a thumbnail tapped in the table — Esc/backdrop/✕ all
 *  close it; nothing here is editable (full editing stays in the panel's own
 *  AttachmentStrip, which also takes onRemove/onUpdate). */
function EvidenceLightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const { url } = useBlobUrl(attachment.blobKey);
  const src = url ?? attachment.thumbDataUrl ?? attachment.dataUrl ?? null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute top-4 right-4 rounded-[6px] px-3 py-1.5 text-[13px] font-semibold"
        style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
      >
        ✕
      </button>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob/data URL
        <img
          src={src}
          alt={attachment.caption ?? ""}
          className="max-h-full max-w-full rounded-[8px] object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="text-[13px]" style={{ color: "#fff" }}>
          This photo isn&apos;t available on this device.
        </div>
      )}
      {attachment.caption && (
        <div
          className="absolute bottom-6 left-1/2 max-w-[80%] -translate-x-1/2 rounded-[8px] px-3 py-2 text-center text-[12px]"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
        >
          {attachment.caption}
        </div>
      )}
    </div>
  );
}

/** THE TABLE'S OWN INLINE EDITOR for a multi-select axis (Root cause
 *  categories, Impact areas), so neither has to leave the row for the
 *  panel just to toggle one value.
 *
 *  16 Nov 2026, Sarel, on the live table: "root cause and impact inline
 *  editing is not user friendly." THAT version hid every option behind a
 *  `<details>` disclosure — nothing to toggle was visible until you tapped
 *  a small "—" or a Pill first. The fix at the time was to show every
 *  option directly, always, as a row of Chips.
 *
 *  16 Nov 2026, LATER THE SAME DAY — Sarel again, this time on row height:
 *  "every single Root Cause and Impact pill is rendered vertically inside
 *  every row, making rows 250px tall and showing only 1.5 findings per
 *  screen... display ONLY selected tags... if 1-2 tags are selected, show
 *  small compact pills... clicking the cell or button opens a compact
 *  popover with checkboxes." So the "always visible" fix from the morning
 *  was itself the problem once ROOT_CAUSES/IMPACT_AREAS (6-8 options each)
 *  rendered in full on every one of 29 rows — this is the second iteration,
 *  not a reversal of the complaint that prompted the first: what stays
 *  constant is "don't make me open something to find out a value is
 *  selected", and that is still true here (the selected tag IS the
 *  trigger, visible with the row closed); what's gone is showing every
 *  UNselected option too. The caller's own `<td onClick={stopPropagation}>`
 *  is what keeps a tap here from also selecting the row. */
function MultiSelectCell({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className="flex min-h-[26px] max-w-[220px] flex-wrap items-center gap-[4px] rounded-[6px] px-[5px] py-[3px] text-left transition-[var(--t)]"
        style={{ background: open ? "var(--acc-soft)" : "transparent" }}
      >
        {selected.length === 0 ? (
          <span
            className="rounded-full border border-dashed px-[7px] py-[2px] text-[10px]"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-4)" }}
          >
            + Add
          </span>
        ) : (
          <>
            {/* Every selected value is shown — Sarel, 26 Nov 2026: "don't
                hide multiple root cause and impact, I need to see all
                selected ones". The old "first + N more" hid them. */}
            {selected.map((v) => (
              <Pill key={v} tone="neutral">
                {v}
              </Pill>
            ))}
          </>
        )}
      </button>

      {open && (
        <>
          {/* Invisible, full-screen — tapping anywhere outside the panel
              closes it, same convention FilterPopover's own backdrop uses. */}
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={label}
            className="absolute left-0 top-[calc(100%+4px)] z-[75] w-[230px] rounded-[10px] border p-[6px]"
            style={{ background: "var(--menu-bg)", borderColor: "var(--menu-line)", boxShadow: "var(--e3)" }}
          >
            <div className="flex max-h-[260px] flex-col gap-[2px] overflow-y-auto">
              {options.map((o) => {
                const checked = selected.includes(o);
                return (
                  <label
                    key={o}
                    className="flex cursor-pointer items-center gap-[7px] rounded-[6px] px-[7px] py-[5px] text-[11px]"
                    style={{ background: checked ? "var(--acc-soft)" : "transparent" }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => onToggle(o)} />
                    {o}
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** THE ACTION & IMPROVEMENT PLAN CELL — Sarel: "Add an option to add
 *  action and improvement plan for any row in the root cause table. This
 *  will be the action plan for the airports to improve the asset
 *  assurance." Free text, so it cannot be a chip row like Root cause/
 *  Impact above — a compact trigger (a truncated preview, or a ghost
 *  "+ Add" with nothing written yet) opens a small popover holding the
 *  actual textarea, so a long plan does not grow the row the way showing
 *  it inline would. Bound directly on every keystroke, same as every
 *  other free-text field in this app (Root cause note in the panel,
 *  Finding.description) — no separate Save button, the shared
 *  SaveStatusPill above the table is the feedback, and Escape/an outside
 *  click just closes the popover rather than discarding anything. */
function ActionPlanCell({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className="block max-w-[160px] rounded-[6px] px-[5px] py-[3px] text-left text-[10.5px] transition-[var(--t)]"
        style={{ background: open ? "var(--acc-soft)" : "transparent" }}
      >
        {value.trim() ? (
          <span className="line-clamp-2 break-words" style={{ color: "var(--ink-2)" }}>
            {value}
          </span>
        ) : (
          <span
            className="rounded-full border border-dashed px-[7px] py-[2px] text-[10px]"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-4)" }}
          >
            + Add
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={label}
            className="absolute right-0 top-[calc(100%+4px)] z-[75] w-[min(440px,90vw)] rounded-[10px] border p-[8px]"
            style={{ background: "var(--menu-bg)", borderColor: "var(--menu-line)", boxShadow: "var(--e3)" }}
          >
            <textarea
              autoFocus
              aria-label={label}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="What the airport will do to close this out…"
              className="min-h-[200px] w-full resize-y rounded-[6px] border px-2 py-1.5 text-[12.5px] leading-[1.5]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function RowDelete({ title, onConfirm }: { title: string; onConfirm: () => void }) {
  const [ask, setAsk] = useState(false);
  if (!ask)
    return (
      <button
        type="button"
        onClick={() => setAsk(true)}
        aria-label={`Delete ${title}`}
        className="rounded-[6px] border px-1.5 py-1 text-[10.5px] font-semibold"
        style={{ borderColor: "var(--bad-line)", color: "var(--bad)", background: "var(--panel)" }}
      >
        Delete
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[10.5px]" style={{ color: "var(--bad)" }}>
      Delete this finding? Cannot be undone.
      <button
        type="button"
        onClick={() => {
          setAsk(false);
          onConfirm();
        }}
        className="rounded-[6px] px-2 py-[3px] font-semibold"
        style={{ background: "var(--bad)", color: "#fff" }}
      >
        Yes, delete
      </button>
      <button type="button" onClick={() => setAsk(false)} className="underline" style={{ color: "var(--ink-3)" }}>
        Keep
      </button>
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="p-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
      {children}
    </th>
  );
}

/** The bulk bar — §3: "set impact areas (add/remove), root cause categories
 *  (add/remove) for selected rows." Every apply goes through
 *  `applyBulkMulti`/a direct patch, same functions a single row's own edit
 *  uses, so a bulk edit can never disagree with what a per-row edit of the
 *  same field would have done.
 *
 *  16 Nov 2026 — the "Set severity"/"Set likelihood" selects this bar used
 *  to carry are gone, same removal as the table's own Severity/Likelihood
 *  columns — see this file's own header.
 *
 *  Also 16 Nov 2026 — TWO AI BULK TOOLS ADDED, same selection checkboxes,
 *  same "propose for every selected row, review, apply" shape this bar's
 *  own impact/root-cause tools already use: BulkSuggestWording (reuses
 *  ReviewRiskPanel's own "polish" call, per finding) and
 *  BulkTranscribeVoiceNotes (reuses the app's one transcription service).
 *  Pulled into their own functions below rather than grown inline here —
 *  this function was already doing one job (the non-AI bulk edits); two
 *  more would have made it three. */
function BulkBar({
  count,
  findings,
  entityCode,
  checksById,
  onApply,
  onChangeOne,
  onClear,
  onDelete,
}: {
  count: number;
  /** The actual selected records, not just how many — the AI tools below
   *  need each one's own text/attachments to propose against. */
  findings: Finding[];
  entityCode: string;
  /** For the linked audit check's own requirement text — same map the
   *  table's own Audit check column already built once per entity. */
  checksById: Map<string, Check>;
  onApply: (patchFor: (f: Finding) => Partial<Finding>) => void;
  /** A single row's own apply, same function the table's per-row edits
   *  already use — for an individual AI proposal's own Accept (one
   *  finding, not every selected one), rather than looping `onApply`
   *  across every selected row with an empty patch on all but one. */
  onChangeOne: (id: string, patch: Partial<Finding>) => void;
  onClear: () => void;
  /** Present only when the screen allows deleting. */
  onDelete?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [impactAdd, setImpactAdd] = useState<string[]>([]);
  const [impactRemove, setImpactRemove] = useState<string[]>([]);
  const [causeAdd, setCauseAdd] = useState<string[]>([]);
  const [causeRemove, setCauseRemove] = useState<string[]>([]);

  const toggleIn = (list: string[], v: string, set: (l: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div
      id="triage-bulk-bar"
      className="mb-2.5 rounded-[11px] border p-2.5"
      style={{ background: "var(--acc-soft)", borderColor: "var(--acc-line)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <b className="text-[11.5px]">{count} selected</b>
        <div className="flex items-center gap-3">
          {onDelete &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-[10.5px]" style={{ color: "var(--bad)" }}>
                Delete {count} finding{count === 1 ? "" : "s"}? This cannot be undone.
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(false);
                    onDelete();
                  }}
                  className="rounded-[6px] px-2 py-[3px] font-semibold"
                  style={{ background: "var(--bad)", color: "#fff" }}
                >
                  Yes, delete
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="underline" style={{ color: "var(--ink-3)" }}>
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-[10.5px] font-semibold underline"
                style={{ color: "var(--bad)" }}
              >
                Delete selected
              </button>
            ))}
          <button type="button" onClick={onClear} className="text-[10.5px] underline" style={{ color: "var(--ink-3)" }}>
            Clear
          </button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
            Impact areas — tap to add, tap again to remove on apply
          </div>
          <div className="flex flex-wrap gap-[4px]">
            {IMPACT_AREAS.map((a) => (
              <Chip
                key={a}
                selected={impactAdd.includes(a) || impactRemove.includes(a)}
                title={impactRemove.includes(a) ? "Will be removed" : impactAdd.includes(a) ? "Will be added" : undefined}
                onClick={() => {
                  if (impactAdd.includes(a)) {
                    toggleIn(impactAdd, a, setImpactAdd);
                    toggleIn(impactRemove, a, setImpactRemove);
                  } else if (impactRemove.includes(a)) {
                    toggleIn(impactRemove, a, setImpactRemove);
                  } else {
                    toggleIn(impactAdd, a, setImpactAdd);
                  }
                }}
              >
                {impactRemove.includes(a) ? `− ${a}` : impactAdd.includes(a) ? `+ ${a}` : a}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
            Root cause categories — tap to add, tap again to remove on apply
          </div>
          <div className="flex flex-wrap gap-[4px]">
            {ROOT_CAUSES.map((c) => (
              <Chip
                key={c}
                selected={causeAdd.includes(c) || causeRemove.includes(c)}
                title={causeRemove.includes(c) ? "Will be removed" : causeAdd.includes(c) ? "Will be added" : undefined}
                onClick={() => {
                  if (causeAdd.includes(c)) {
                    toggleIn(causeAdd, c, setCauseAdd);
                    toggleIn(causeRemove, c, setCauseRemove);
                  } else if (causeRemove.includes(c)) {
                    toggleIn(causeRemove, c, setCauseRemove);
                  } else {
                    toggleIn(causeAdd, c, setCauseAdd);
                  }
                }}
              >
                {causeRemove.includes(c) ? `− ${c}` : causeAdd.includes(c) ? `+ ${c}` : c}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {(impactAdd.length > 0 || impactRemove.length > 0 || causeAdd.length > 0 || causeRemove.length > 0) && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => {
              onApply((f) => ({
                ...(impactAdd.length || impactRemove.length
                  ? { impactAreas: applyBulkMulti(f.impactAreas, impactAdd, impactRemove) }
                  : {}),
                ...(causeAdd.length || causeRemove.length
                  ? { rootCauseCategories: applyBulkMulti(f.rootCauseCategories, causeAdd, causeRemove) }
                  : {}),
              }));
              setImpactAdd([]);
              setImpactRemove([]);
              setCauseAdd([]);
              setCauseRemove([]);
            }}
            className="rounded-[8px] px-3 py-[7px] text-[11px] font-semibold"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            Apply to {count} selected
          </button>
        </div>
      )}

      <div className="mt-2.5 grid gap-2 border-t pt-2.5 sm:grid-cols-2" style={{ borderColor: "var(--acc-line)" }}>
        <BulkSuggestWording findings={findings} entityCode={entityCode} checksById={checksById} onChangeOne={onChangeOne} />
        <BulkTranscribeVoiceNotes findings={findings} onChangeOne={onChangeOne} />
      </div>
    </div>
  );
}

type AiProposalState = "loading" | "proposed" | "applied" | "error";
interface AiProposal {
  state: AiProposalState;
  /** Produced by the offline Basic tidy, not the AI. */
  basic?: boolean;
  text?: string;
  error?: string;
}

/** BULK "SUGGEST WORDING" — Sarel: "AI to correct, to review the context
 *  of the finding... have a look at the discipline, asset system, and the
 *  audit check that is linked to the finding... to reword and describe
 *  the audit finding in that context... a review from a technical and
 *  grammar perspective... make sure all facts are double checked for the
 *  correct airport."
 *
 *  Reuses the SAME "polish" task and polishContext ReviewRiskPanel's own
 *  single-finding button already calls (see that file's own runPolish) —
 *  not a second prompt. Sequential, not parallel, same reasoning
 *  /cleanup's own PolishSection documents: there is no bulk endpoint, and
 *  N requests in flight at once is N ways to hit a provider rate limit
 *  for one tap. No revert-after-apply here, unlike the single-finding
 *  panel: reviewing each proposal individually before Accept (below) IS
 *  the review step for this bulk path, same as /cleanup's own bulk apply
 *  has never offered an undo either. */
function BulkSuggestWording({
  findings,
  entityCode,
  checksById,
  onChangeOne,
}: {
  findings: Finding[];
  entityCode: string;
  checksById: Map<string, Check>;
  onChangeOne: (id: string, patch: Partial<Finding>) => void;
}) {
  const aiOn = useAssistAvailable();
  const [proposals, setProposals] = useState<Record<string, AiProposal>>({});
  const [running, setRunning] = useState(false);
  /* Edited suggestion text, per finding, so the reviewer can tweak a
     suggestion before accepting it. */
  const [edits, setEdits] = useState<Record<string, string>>({});
  /* Same synchronous double-fire guard as before. */
  const runningRef = useRef(false);

  const eligible = findings.filter((f) => f.description.trim());
  const pending = eligible.filter((f) => !proposals[f.id] || proposals[f.id].state === "error");
  const proposedList = eligible.filter((f) => proposals[f.id]?.state === "proposed");
  const appliedCount = Object.values(proposals).filter((p) => p.state === "applied").length;
  const failed = eligible.filter((f) => proposals[f.id]?.state === "error");

  async function run(offline = false) {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    for (const f of eligible) {
      if (proposals[f.id]?.state === "proposed" || proposals[f.id]?.state === "applied") continue;
      if (offline) {
        setProposals((p) => ({ ...p, [f.id]: { state: "proposed", text: basicTidy(f.description), basic: true } }));
        continue;
      }
      setProposals((p) => ({ ...p, [f.id]: { state: "loading" } }));
      try {
        const text = await assist(
          "polish",
          polishContext(
            f.description,
            f.discipline,
            f.system,
            "note",
            f.title || undefined,
            f.checkId ? checksById.get(f.checkId)?.requirement : undefined,
            entityOf(entityCode).name
          )
        );
        setProposals((p) => ({ ...p, [f.id]: { state: "proposed", text: text.trim() } }));
      } catch (e) {
        setProposals((p) => ({
          ...p,
          [f.id]: { state: "error", error: e instanceof Error ? e.message : "The assistant is unavailable." },
        }));
      }
    }
    setRunning(false);
    runningRef.current = false;
  }

  function applyOne(f: Finding) {
    const prop = proposals[f.id];
    const text = (edits[f.id] ?? prop?.text ?? "").trim();
    if (!text) return;
    onChangeOne(f.id, { description: text });
    setProposals((p) => ({ ...p, [f.id]: { ...prop, state: "applied" } }));
  }

  function rejectOne(id: string) {
    setProposals((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }

  const reviewing = Object.keys(proposals).length > 0;

  return (
    <div>
      <div className="mb-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
        Wording cleanup — rewrite each selected finding&rsquo;s notes; nothing changes until you accept it
      </div>
      <div className="flex flex-wrap items-center gap-[6px]">
        {aiOn && (
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={running || eligible.length === 0 || pending.length === 0}
            className="flex items-center gap-[5px] rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold disabled:opacity-55"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            <IconSpark width={12} height={12} />
            {running ? "Suggesting…" : pending.length === 0 ? "All proposed" : `AI cleanup for ${pending.length}`}
          </button>
        )}
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={running || eligible.length === 0 || pending.length === 0}
          className="rounded-[8px] border px-[9px] py-[6px] text-[11px] font-semibold disabled:opacity-55"
          style={{ borderColor: "var(--line-2)", color: "var(--ink-2)", background: "var(--panel)" }}
          title="Spelling, capital letters, full stops and plain wording. Works without the AI and adds no facts."
        >
          Basic tidy{aiOn ? "" : ` for ${pending.length}`}
        </button>
        {proposedList.length > 0 && (
          <button
            type="button"
            onClick={() => proposedList.forEach(applyOne)}
            className="rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold"
            style={{ background: "var(--good)", color: "#fff" }}
          >
            Accept all {proposedList.length}
          </button>
        )}
        {appliedCount > 0 && <Pill tone="good">{appliedCount} applied</Pill>}
      </div>
      {!aiOn && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
          The AI assistant is not switched on for this deployment, so Basic tidy is offered instead.
        </div>
      )}
      {failed.length > 0 && (
        <div role="alert" className="mt-1.5 rounded-[8px] border px-2 py-1.5 text-[10.5px]" style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad)" }}>
          {failed[0].id && proposals[failed[0].id]?.error}{" "}
          {failed.length > 1 ? `(${failed.length} findings affected.) ` : ""}
          <button type="button" onClick={() => void run(true)} className="font-semibold underline">
            Use Basic tidy for these instead
          </button>
        </div>
      )}
      {reviewing && (
        <div className="mt-2 flex flex-col gap-2">
          {eligible
            .filter((f) => proposals[f.id] && proposals[f.id].state !== "error")
            .map((f) => {
              const prop = proposals[f.id];
              const suggestion = edits[f.id] ?? prop.text ?? "";
              const parts = prop.state === "proposed" ? wordDiff(f.description, suggestion) : [];
              const changes = parts.filter((x) => x.kind !== "same").length;
              return (
                <div key={f.id} className="rounded-[10px] border p-2.5 text-[11.5px]" style={{ borderColor: "var(--line-2)", background: "var(--panel)" }}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>{f.title || f.id}</span>
                    <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                      {f.discipline}{f.system ? ` · ${f.system}` : ""}
                    </span>
                    {prop.state === "proposed" && (
                      <Pill tone={changes === 0 ? "neutral" : "warn"}>
                        {changes === 0 ? "No change needed" : `${changes} change${changes === 1 ? "" : "s"}`}
                      </Pill>
                    )}
                    {prop.basic && <Pill tone="neutral">Basic tidy</Pill>}
                  </div>
                  {prop.state === "loading" && <div style={{ color: "var(--ink-4)" }}>Working on it…</div>}
                  {prop.state === "applied" && <div style={{ color: "var(--good)" }}>Applied.</div>}
                  {prop.state === "proposed" && (
                    <>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <div className="mb-0.5 text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                            Now (removed words struck through)
                          </div>
                          <div className="whitespace-pre-wrap rounded-[6px] border px-2 py-1.5 leading-[1.5]" style={{ borderColor: "var(--line-2)" }}>
                            {parts.filter((x) => x.kind !== "add").map((x, i) =>
                              x.kind === "del" ? (
                                <span key={i} style={{ background: "var(--bad-bg)", color: "var(--bad)", textDecoration: "line-through" }}>{x.text}</span>
                              ) : (
                                <span key={i}>{x.text}</span>
                              )
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5 text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                            Suggested (added words highlighted)
                          </div>
                          <div className="whitespace-pre-wrap rounded-[6px] border px-2 py-1.5 leading-[1.5]" style={{ borderColor: "var(--acc)", background: "var(--acc-soft)" }}>
                            {parts.filter((x) => x.kind !== "del").map((x, i) =>
                              x.kind === "add" ? (
                                <span key={i} style={{ background: "var(--good-bg, #d9f2e3)", color: "var(--good)", fontWeight: 600 }}>{x.text}</span>
                              ) : (
                                <span key={i}>{x.text}</span>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[10.5px]" style={{ color: "var(--ink-3)" }}>Edit the suggestion before accepting</summary>
                        <textarea
                          value={suggestion}
                          onChange={(e) => setEdits((c) => ({ ...c, [f.id]: e.target.value }))}
                          className="mt-1 min-h-[90px] w-full rounded-[6px] border p-2 text-[11.5px]"
                          style={{ borderColor: "var(--line-2)", background: "var(--panel)", color: "var(--ink)" }}
                        />
                      </details>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => applyOne(f)} className="rounded-[7px] px-3 py-1.5 text-[11px] font-semibold" style={{ background: "var(--good)", color: "#fff" }}>
                          Accept
                        </button>
                        <button type="button" onClick={() => rejectOne(f.id)} className="rounded-[7px] border px-3 py-1.5 text-[11px] font-semibold" style={{ borderColor: "var(--bad-line)", color: "var(--bad)" }}>
                          Reject (keep as is)
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/** BULK VOICE-NOTE TRANSCRIPTION — Sarel: "I want us to be able to do bulk
 *  transcribing of the voice notes when the user is capturing findings.
 *  They might capture the root cause, but they might not do the
 *  transcribing of it... those transcribed notes must automatically go
 *  into the notes field to be automatically captured in the notes field."
 *
 *  VERBATIM ONLY, deliberately — this calls the SAME transcribe() every
 *  per-note "Transcribe" button already calls (Capture.tsx), stores the
 *  result on the attachment exactly as that button does, then appends it
 *  to the finding's own description — the SAME auto-apply raise/page.tsx's
 *  own applyVoiceNote already does for a brand-new finding, just run here
 *  in bulk, at review time, for findings that already exist. It does NOT
 *  also run the AI "write it up" rewrite step: a verbatim transcript is
 *  what was actually said, carried across exactly, which is why raise's
 *  own auto-apply treats it as safe to apply without a review gate — an
 *  AI REWRITE of it is a different kind of change, and "every AI change
 *  must be a proposal requiring review" (PR #252) is exactly why that
 *  part stays manual: BulkSuggestWording, right beside this, is the
 *  reviewed next step once the verbatim words are in the notes field. */
function BulkTranscribeVoiceNotes({
  findings,
  onChangeOne,
}: {
  findings: Finding[];
  onChangeOne: (id: string, patch: Partial<Finding>) => void;
}) {
  const canTranscribe = useTranscribeAvailable();
  const updateFindingAttachment = useStore((s) => s.updateFindingAttachment);
  const [state, setState] = useState<Record<string, "loading" | "done" | "error">>({});
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  /* A SYNCHRONOUS double-fire guard — `running` state lags one render
     behind a raw click, which a plain `disabled={running}` on its own
     does not stop (same gap raise/page.tsx's own pushedNoteIds ref
     exists to close for its single-note auto-apply). This path has no
     human review gate at all, so a double-click here is worth guarding
     properly rather than only reactively. */
  const runningRef = useRef(false);

  /* One row per UNTRANSCRIBED voice note, not per finding — a finding can
     carry more than one voice note, and each needs its own transcribe()
     call and its own append to the same description. */
  const untranscribed = findings.flatMap((f) =>
    f.attachments.filter((a) => a.kind === "voice" && a.blobKey && !a.transcript).map((a) => ({ finding: f, attachment: a }))
  );
  const pending = untranscribed.filter((u) => state[u.attachment.id] !== "done");

  async function run() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setErrors([]);
    /* TWO OR MORE untranscribed voice notes can belong to the SAME
       finding. Each append has to follow the one before it, but
       `onChangeOne` writes to the store, not back onto this closed-over
       `f` — re-reading `f.description` on the second note would read
       the STALE pre-run value and overwrite the first note's append
       instead of following it. This tracks each finding's own running
       description locally for the length of this one run, seeded from
       its real value the first time that finding is touched. */
    const liveDescription = new Map<string, string>();
    for (const { finding: f, attachment: a } of untranscribed) {
      if (state[a.id] === "done") continue;
      setState((s) => ({ ...s, [a.id]: "loading" }));
      try {
        const blob = await getBlob(a.blobKey!);
        if (!blob) throw new Error(`${f.title || f.id}: that recording is no longer stored on this device.`);
        const { text } = await transcribe(blob, a.name || "note.webm");
        updateFindingAttachment(f.id, a.id, { transcript: text, transcriptSource: "service", transcribedAt: Date.now() });
        const current = liveDescription.get(f.id) ?? f.description;
        const next = current.trim() ? `${current}\n${text}` : text;
        liveDescription.set(f.id, next);
        onChangeOne(f.id, { description: next });
        setState((s) => ({ ...s, [a.id]: "done" }));
      } catch (e) {
        setState((s) => ({ ...s, [a.id]: "error" }));
        setErrors((cur) => [...cur, e instanceof Error ? e.message : "The transcription service is unavailable."]);
      }
    }
    setRunning(false);
    runningRef.current = false;
  }

  if (!canTranscribe) return null;
  const doneCount = Object.values(state).filter((s) => s === "done").length;

  return (
    <div>
      <div className="mb-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
        AI — transcribe voice notes that were captured but never written up, straight into each finding&rsquo;s own notes
      </div>
      <div className="flex flex-wrap items-center gap-[6px]">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running || pending.length === 0}
          className="flex items-center gap-[5px] rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold disabled:opacity-55"
          style={{ background: "var(--acc)", color: "#fff" }}
        >
          <IconMic width={12} height={12} />
          {running
            ? "Transcribing…"
            : pending.length === 0
              ? untranscribed.length === 0
                ? "Nothing to transcribe"
                : "All transcribed"
              : `Transcribe ${pending.length} voice note${pending.length === 1 ? "" : "s"}`}
        </button>
        {doneCount > 0 && <Pill tone="good">{doneCount} added to notes</Pill>}
      </div>
      {errors.length > 0 && (
        <div className="mt-1 flex flex-col gap-[2px]">
          {errors.map((e, i) => (
            <div key={i} role="alert" className="text-[10px]" style={{ color: "var(--bad)" }}>
              {e}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

