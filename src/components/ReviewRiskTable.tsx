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

import { useMemo, useRef, useState } from "react";
import {
  IMPACT_AREAS,
  LEGACY_ROOT_CAUSES,
  ROOT_CAUSES,
  TIMELINES,
  findingTypeFor,
  priorityFor,
} from "@/lib/reviewRisk";
import { ALL_DISCIPLINES, checksAt, systemsAt, systemsOf } from "@/lib/register";
import { useFieldSaveStatus, useStore, useVisitId } from "@/lib/store";
import { getBlob, useBlobUrl } from "@/lib/media";
import { transcribe, useTranscribeAvailable } from "@/lib/assist";
import { Pill, SaveStatusPill } from "@/components/ui/primitives";
import { IconCamera, IconClipboard, IconEye, IconMic, IconSpark, IconTeam, IconTrash } from "@/components/ui/icons";
import { checkRefOf } from "@/lib/reportText";
import BulkTriageSuggest from "@/components/TriageSuggestions";
import { evidenceChannelStatus, inspectionStatus, interviewStatus, TONE_COLOUR, type ChannelStatus } from "@/lib/triageStatus";
import EvidenceQuickCapture from "@/components/EvidenceQuickCapture";
import { PhotoHoverPreview, PhotoLightbox, useHoverPreview, type LightboxPhoto } from "@/components/PhotoLightbox";
import { Menu, MultiPill, TagsMenu, TimelineSelect, TypePill } from "@/components/TriageCells";
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
/** Voice-note transcripts carry "uh", "um" and "erm"; a finding with any of them
 *  gets a sparkle button that opens the wording review for it. */
const FILLER_WORDS = /\b(uh+|um+|uhm+|erm+)\b/i;

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
  /* TOOLBAR FILTERS — Sarel, 27 Nov 2026. Search plus Discipline, Asset
     system, Priority and Timeline, and they COMBINE (the old single-filter
     union replaced one choice with the next). `priority` is the Level the
     5x5 matrix gives (priorityFor), "none" meaning not yet rated. */
  const [fx, setFx] = useState<{ q: string; discipline: string; system: string; priority: string; timeline: string }>({
    q: "",
    discipline: "",
    system: "",
    priority: "",
    timeline: "",
  });
  const setFilterPart = (patch: Partial<typeof fx>) => setFx((s) => ({ ...s, ...patch }));
  const filtersOn = Object.values(fx).some(Boolean);
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
  /* The photo viewer: which finding's photographs are open, and which one. */
  const [lightbox, setLightbox] = useState<{ id: string; index: number } | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  /* Audit-check reference codes are presentation we no longer show (see
   *  PR "Review pages: remove audit-check reference codes from the UI") —
   *  the readable requirement text takes their place everywhere a check is
   *  linked. Built once per entity rather than re-scanning checksAt() on
   *  every row's render. */
  const allChecks = useMemo(() => checksAt(entityCode), [entityCode]);
  const checksById = useMemo(() => {
    const m = new Map<string, Check>();
    for (const c of allChecks) m.set(c.id, c);
    return m;
  }, [allChecks]);
  /* Sorted Discipline, then Asset system (a no-system row last in its
     discipline), as before; now filtered by every toolbar part at once. */
  const visible = useMemo(() => {
    const q = fx.q.trim().toLowerCase();
    const filtered = findings.filter((f) => {
      if (fx.discipline && f.discipline !== fx.discipline) return false;
      if (fx.system && f.system !== fx.system) return false;
      if (fx.timeline && f.timeline !== fx.timeline) return false;
      if (fx.priority) {
        const p = priorityFor(f)?.priority ?? "none";
        if (p !== fx.priority) return false;
      }
      if (q) {
        const hay = `${f.title} ${f.description} ${f.discipline} ${f.system} ${f.actionPlan ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const byDiscipline = (a.discipline || "").localeCompare(b.discipline || "");
      if (byDiscipline !== 0) return byDiscipline;
      return (a.system || GENERAL_SYSTEM_SORT_KEY).localeCompare(b.system || GENERAL_SYSTEM_SORT_KEY);
    });
  }, [findings, fx]);

  /* Rows mounted: reset to the first page whenever a filter changes (React's
     "adjust state while rendering" pattern, not an effect). */
  const [shown, setShown] = useState(PAGE_SIZE_INITIAL);
  const [prevFx, setPrevFx] = useState(fx);
  if (fx !== prevFx) {
    setPrevFx(fx);
    setShown(PAGE_SIZE_INITIAL);
  }

  /* Asset system options narrow to the chosen Discipline. */
  const systemOptions = useMemo(
    () => (fx.discipline ? systemsOf(entityCode, fx.discipline) : systemsAt(entityCode)),
    [entityCode, fx.discipline]
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
      {/* ROW 2 OF THE SCREEN'S TOOLBAR (row 1 — title, status pills, Log
          finding and Export list — is the Issues page's own header).
          Sarel, 27 Nov 2026: search (220px) and four compact filters on the
          left, the utility actions on the right, fitting 1280px without a
          button clipping or wrapping on its own. The filters COMBINE. The
          eight-item colour legend that used to sit above the table is gone;
          the status icons keep their words as hover text, and the
          "Statuses" info button below explains them on demand. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-[6px]">
          <input
            type="search"
            aria-label="Search findings"
            placeholder="Search findings"
            value={fx.q}
            onChange={(e) => setFilterPart({ q: e.target.value })}
            className="h-[30px] w-[220px] rounded-[8px] border px-2.5 text-[12px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink)" }}
          />
          <select
            aria-label="Filter by discipline"
            value={fx.discipline}
            onChange={(e) => setFilterPart({ discipline: e.target.value, system: "" })}
            className="h-[30px] w-[108px] rounded-[8px] border px-2 text-[11.5px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            <option value="">Discipline</option>
            {ALL_DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by asset system"
            value={fx.system}
            onChange={(e) => setFilterPart({ system: e.target.value })}
            className="h-[30px] w-[108px] rounded-[8px] border px-2 text-[11.5px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            <option value="">Asset system</option>
            {systemOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by priority"
            value={fx.priority}
            onChange={(e) => setFilterPart({ priority: e.target.value })}
            className="h-[30px] w-[96px] rounded-[8px] border px-2 text-[11.5px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            <option value="">Priority</option>
            <option value="I">Level I</option>
            <option value="II">Level II</option>
            <option value="III">Level III</option>
            <option value="none">Not rated</option>
          </select>
          <select
            aria-label="Filter by timeline"
            value={fx.timeline}
            onChange={(e) => setFilterPart({ timeline: e.target.value })}
            className="h-[30px] w-[104px] rounded-[8px] border px-2 text-[11.5px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            <option value="">Timeline</option>
            {TIMELINES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-[6px]">
          {/* CLEAN UP WORDING — ticks every finding in view and opens the
              existing review (AI or Basic tidy, side by side, accept or
              reject each). Nothing is written until a proposal is accepted. */}
          <button
            type="button"
            disabled={visible.length === 0}
            onClick={() => {
              setSelected(new Set(visible.map((f) => f.id)));
              requestAnimationFrame(() =>
                document.getElementById("triage-bulk-bar")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
              );
            }}
            title="Propose cleaner technical wording for every finding shown (AI, or Basic tidy), then accept or reject each one"
            className="flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-[8px] border px-3 text-[11.5px] font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--acc-line)", color: "var(--acc)", background: "var(--acc-soft)" }}
          >
            <IconSpark width={12} height={12} />
            Clean up wording
          </button>
          <Menu
            label="Evidence log"
            width={190}
            trigger={({ open, toggle, ref }) => (
              <button
                ref={ref}
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex h-[30px] items-center gap-[4px] whitespace-nowrap rounded-[8px] border px-3 text-[11.5px] font-semibold"
                style={{ borderColor: "var(--line-2)", color: "var(--ink-2)", background: "var(--panel)" }}
              >
                Evidence log <span aria-hidden="true" className="text-[9px] opacity-60">&#9662;</span>
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setEvidenceOpen((o) => !o);
                    close();
                  }}
                  className="flex w-full rounded-[7px] px-[8px] py-[6px] text-left text-[11.5px]"
                  style={{ color: "var(--ink)" }}
                >
                  {evidenceOpen ? "Close request form" : "Request evidence"}
                </button>
                <a href="/evidence" role="menuitem" className="flex w-full rounded-[7px] px-[8px] py-[6px] text-[11.5px]" style={{ color: "var(--ink)" }}>
                  Open the evidence log
                </a>
              </>
            )}
          </Menu>
          <Menu
            label="Reports"
            width={210}
            trigger={({ open, toggle, ref }) => (
              <button
                ref={ref}
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex h-[30px] items-center gap-[4px] whitespace-nowrap rounded-[8px] border px-3 text-[11.5px] font-semibold"
                style={{ borderColor: "var(--acc)", color: "var(--acc)", background: "var(--panel)" }}
              >
                Report <span aria-hidden="true" className="text-[9px] opacity-60">&#9662;</span>
              </button>
            )}
          >
            {() => (
              <>
                <a
                  href="/report?discipline=all"
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  title="One report for every discipline at this airport"
                  className="flex w-full rounded-[7px] px-[8px] py-[6px] text-[11.5px]"
                  style={{ color: "var(--ink)" }}
                >
                  Airport report
                </a>
                {fx.discipline ? (
                  <a
                    href={`/report?discipline=${encodeURIComponent(fx.discipline)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    className="flex w-full rounded-[7px] px-[8px] py-[6px] text-[11.5px]"
                    style={{ color: "var(--ink)" }}
                  >
                    Report for {fx.discipline}
                  </a>
                ) : (
                  <span className="flex w-full rounded-[7px] px-[8px] py-[6px] text-[11.5px] opacity-50" style={{ color: "var(--ink)" }} title="Pick one discipline in the filter first">
                    Report for one discipline (pick one first)
                  </span>
                )}
              </>
            )}
          </Menu>
        </div>
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
          allChecks={allChecks}
          visitId={visitId}
          responses={responses}
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
          {filtersOn ? ` matching these filters (of ${findings.length} total)` : ""}
        </span>
        {filtersOn && (
          <button
            type="button"
            onClick={() => setFx({ q: "", discipline: "", system: "", priority: "", timeline: "" })}
            className="font-semibold underline"
            style={{ color: "var(--acc)" }}
          >
            Clear filters
          </button>
        )}
        <span
          className="inline-flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border text-[9px] font-bold"
          style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
          title={"Icons under Location: interview, evidence and inspection status. Green = done, no issues. Red = issues found or non-compliance. Amber = more evidence needed or not verified. Grey = not applicable. Pale = not done yet."}
        >
          i
        </span>
        <SaveStatusPill status={saveStatus} />
      </div>

      {/* THE TABLE — one row per finding, 52px, everything centred.
          Sarel, 27 Nov 2026: "collapse row height", no stacked buttons in
          cells, 8-12 findings visible on a 13-inch laptop. Root cause,
          Impact, Action plan, the evidence-requested comments and the photo
          gallery are all in the detail drawer (click a row) rather than as
          columns; the table keeps what a reviewer scans: Type, Location,
          Finding, the 5x5 rating and its Priority, Timeline, Photos. */}
      <div className="overflow-x-auto rounded-[11px] border" style={{ borderColor: "var(--line)" }}>
        <table className="w-full min-w-[1100px] table-fixed text-[12px]">
          <thead>
            <tr style={{ background: "var(--sunken)" }}>
              <th className="w-[34px] px-2 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={visible.length > 0 && visible.every((f) => selected.has(f.id))}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(visible.map((f) => f.id)) : new Set())
                  }
                />
              </th>
              <th className="w-[138px] px-2 py-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>Type</th>
              <th className="w-[210px] px-2 py-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>Location</th>
              <th className="w-[230px] px-2 py-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>Audit check</th>
              <th className="px-2 py-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>Finding</th>
              <th className="w-[160px] px-2 py-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>Root cause</th>
              <th className="w-[150px] px-2 py-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>Impact</th>
              <th className="w-[132px] px-2 py-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>Timeline</th>
              <th className="w-[56px] px-2 py-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>Photos</th>
              <th className="w-[48px] px-2 py-2"><span className="sr-only">Delete</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, shown).map((f) => {
              const type = findingTypeFor(f);
              const photoAttachments = f.attachments.filter((a) => a.kind === "photo");
              const on = f.id === activeId;
              const chk = f.checkId && f.originVisit === visitId ? responses[f.checkId] : undefined;
              const statusItems: { key: string; Icon: typeof IconEye; name: string; st: ChannelStatus }[] = [
                { key: "i", Icon: IconTeam, name: "Interview", st: interviewStatus(chk) },
                { key: "e", Icon: IconClipboard, name: "Evidence", st: evidenceChannelStatus(chk) },
                { key: "s", Icon: IconEye, name: "Inspection", st: inspectionStatus(chk) },
              ];
              const text = f.title || f.description || f.id;
              const needsTidy = FILLER_WORDS.test(`${f.title} ${f.description}`);
              return (
                <tr
                  key={f.id}
                  onClick={() => onActivate(f.id)}
                  className="group h-[52px] cursor-pointer border-t"
                  style={{ borderColor: "var(--line)", background: on ? "var(--acc-soft)" : "transparent" }}
                >
                  <td className="px-2 py-1 align-middle" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${f.title || f.id}`}
                      checked={selected.has(f.id)}
                      onChange={() => toggleRow(f.id)}
                    />
                  </td>

                  {/* Type: the active one only; click for the menu. */}
                  <td className="px-2 py-1 align-middle" onClick={(e) => e.stopPropagation()}>
                    <TypePill
                      type={type}
                      label={`Type for ${f.title || f.id}`}
                      onChange={(t) => onChange(f.id, { findingType: t })}
                    />
                  </td>

                  {/* Location: discipline (13px medium), asset system (12px
                      muted) or a grey "General" badge, and the three
                      assessment-status icons (hover for the words). */}
                  <td className="px-2 py-1 align-middle">
                    <div className="break-words text-[13px] font-medium leading-[16px]" style={{ color: "var(--ink)" }}>
                      {f.discipline || "—"}
                    </div>
                    <div className="flex items-start gap-[6px]">
                      {f.system ? (
                        <span className="min-w-0 flex-1 break-words text-xs leading-[15px]" style={{ color: "var(--ink-3)" }}>
                          {f.system || "General"}
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1">
                          <Pill tone="neutral">General</Pill>
                        </span>
                      )}
                      <span className="inline-flex shrink-0 items-center gap-[3px] pt-[1px]">
                        {statusItems.map(({ key, Icon, name, st }) => (
                          <span key={key} title={st.label} aria-label={st.label} role="img" className="inline-flex" style={{ color: TONE_COLOUR[st.tone] }}>
                            <Icon width={14} height={14} />
                            <span className="sr-only">{name}</span>
                          </span>
                        ))}
                      </span>
                    </div>
                  </td>

                  {/* AUDIT CHECK — Sarel, 28 Nov 2026: "i dont see the audit
                      check question and reference in the list". The check's
                      reference (discipline + number, no airport prefix: the
                      ids are one template shared by every airport) and its
                      question, or its requirement where it has no question.
                      A finding raised outside a check says so. */}
                  <td className="px-2 py-1 align-middle">
                    {(() => {
                      const chkDef = f.checkId ? checksById.get(f.checkId) : undefined;
                      if (!chkDef) return <span className="text-[11px] italic" style={{ color: "var(--ink-4)" }}>Not linked to an audit check</span>;
                      const q = (chkDef.question || chkDef.requirement || "").trim();
                      return (
                        <div title={`${chkDef.requirement}${chkDef.question ? `\n\nQuestion: ${chkDef.question}` : ""}`}>
                          <div className="font-mono text-[10.5px] font-semibold" style={{ color: "var(--acc)" }}>{checkRefOf(chkDef.id)}</div>
                          <div className="line-clamp-3 break-words text-[11px] leading-[14px]" style={{ color: "var(--ink-3)" }}>{q}</div>
                        </div>
                      );
                    })()}
                  </td>

                  {/* Finding: at most two lines, the rest in the drawer. */}
                  <td className="px-2 py-1 align-middle">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="line-clamp-2 break-words text-[12.5px] leading-[16px]" style={{ color: "var(--ink)" }} title={text}>
                          {text}
                        </span>
                      </div>
                      {needsTidy && (
                        <button
                          type="button"
                          title="Filler words in this note. Click to review a cleaned-up version."
                          aria-label={`Clean up wording for ${f.title || f.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(new Set([f.id]));
                            requestAnimationFrame(() =>
                              document.getElementById("triage-bulk-bar")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
                            );
                          }}
                          className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px]"
                          style={{ color: "var(--acc)", background: "var(--acc-soft)" }}
                        >
                          <IconSpark width={12} height={12} />
                        </button>
                      )}
                      <div className="flex max-w-[150px] shrink-0 flex-col items-end gap-[3px]" onClick={(e) => e.stopPropagation()}>
                        <TagsMenu f={f} onChange={(patch) => onChange(f.id, patch)} />
                      </div>
                    </div>
                  </td>

                  <td className="px-2 py-1 align-middle" onClick={(e) => e.stopPropagation()}>
                    <MultiPill
                      values={f.rootCauseCategories}
                      options={ROOT_CAUSES}
                      legacy={LEGACY_ROOT_CAUSES}
                      filled
                      addLabel="+ Root cause"
                      label={`Root cause for ${f.title || f.id}`}
                      onChange={(next) => onChange(f.id, { rootCauseCategories: next })}
                    />
                  </td>
                  <td className="px-2 py-1 align-middle" onClick={(e) => e.stopPropagation()}>
                    <MultiPill
                      values={f.impactAreas}
                      options={IMPACT_AREAS}
                      filled={false}
                      addLabel="+ Impact"
                      label={`Impact for ${f.title || f.id}`}
                      onChange={(next) => onChange(f.id, { impactAreas: next })}
                    />
                  </td>

                  <td className="px-2 py-1 align-middle" onClick={(e) => e.stopPropagation()}>
                    <TimelineSelect
                      value={f.timeline}
                      label={`Timeline for ${f.title || f.id}`}
                      onChange={(v) => onChange(f.id, { timeline: v })}
                    />
                  </td>

                  {/* Photos: a 36px square with the count; opens the gallery
                      in the drawer. */}
                  <td className="px-2 py-1 align-middle" onClick={(e) => e.stopPropagation()}>
                    {photoAttachments.length > 0 ? (
                      <EvidenceThumb attachment={photoAttachments[0]} count={photoAttachments.length} size={36} preview={{ entityCode, visitId }} onOpen={() => setLightbox({ id: f.id, index: 0 })} />
                    ) : (
                      <span className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-[6px] border border-dashed" style={{ borderColor: "var(--line-2)", color: "var(--ink-4)" }} title="No photos">
                        <IconCamera width={13} height={13} />
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-1 align-middle" onClick={(e) => e.stopPropagation()}>
                    {onDeleteMany && <RowDelete title={f.title || f.id} onConfirm={() => onDeleteMany([f.id])} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {lightbox &&
          (() => {
            const lf = findings.find((x) => x.id === lightbox.id);
            const items: LightboxPhoto[] = (lf?.attachments ?? [])
              .filter((a) => a.kind === "photo")
              .map((a) => ({ attachment: a, system: lf?.system || "General", summary: lf?.title || lf?.description || "", fallbackAt: lf?.createdAt }));
            if (!lf || items.length === 0) return null;
            return (
              <PhotoLightbox
                photos={items}
                index={Math.min(lightbox.index, items.length - 1)}
                onIndex={(i) => setLightbox({ id: lightbox.id, index: i })}
                onClose={() => setLightbox(null)}
                entityCode={entityCode}
                visitId={visitId}
              />
            );
          })()}

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
function EvidenceThumb({ attachment, onOpen, size = 120, count, preview }: { attachment: Attachment; onOpen: () => void; size?: number; count?: number; preview?: { entityCode: string; visitId: string } }) {
  const hover = useHoverPreview();
  const thumb = attachment.thumbDataUrl || attachment.dataUrl || null;
  const { url } = useBlobUrl(thumb ? null : attachment.blobKey);
  const src = thumb ?? url ?? null;
  if (!src) return <IconCamera width={11} height={11} />;
  return (
    <button
      type="button"
      onClick={() => {
        hover.off();
        onOpen();
      }}
      onMouseEnter={preview ? (e) => hover.on(e.currentTarget) : undefined}
      onMouseLeave={preview ? hover.off : undefined}
      onFocus={preview ? (e) => hover.on(e.currentTarget) : undefined}
      onBlur={preview ? hover.off : undefined}
      aria-label={attachment.caption ? `View photo: ${attachment.caption}` : "View photo"}
      className="relative block overflow-hidden rounded-[6px] border p-0"
      style={{ borderColor: "var(--line-2)", width: size, height: size }}
    >
      {preview && hover.rect && <PhotoHoverPreview attachment={attachment} anchor={hover.rect} entityCode={preview.entityCode} visitId={preview.visitId} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- a local blob/data URL, not a remote asset next/image can optimise */}
      <img src={src} alt="" className="h-full w-full object-cover" />
      {count !== undefined && (
        <span
          className="absolute bottom-0 right-0 rounded-tl-[5px] px-[4px] font-mono text-[10px] font-semibold leading-[14px]"
          style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Row delete: one small trash icon; the confirmation opens as a menu so it never
 *  widens the row. Deleting only FLAGS the finding (Sarel: never permanently
 *  delete); it is kept under Issues > Deleted and can be restored. */
function RowDelete({ title, onConfirm }: { title: string; onConfirm: () => void }) {
  return (
    <Menu
      label={`Delete ${title}`}
      width={250}
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Delete ${title}`}
          title="Delete"
          className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[7px] border"
          style={{ borderColor: "var(--bad-line)", color: "var(--bad)", background: "var(--panel)" }}
        >
          <IconTrash width={14} height={14} />
        </button>
      )}
    >
      {(close) => (
        <div className="p-[6px] text-[11.5px]" style={{ color: "var(--ink)" }}>
          <div className="mb-2">Delete this finding? It is kept under Deleted and can be restored.</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                close();
                onConfirm();
              }}
              className="rounded-[6px] px-2 py-[4px] font-semibold"
              style={{ background: "var(--bad)", color: "#fff" }}
            >
              Yes, delete
            </button>
            <button type="button" onClick={close} className="underline" style={{ color: "var(--ink-3)" }}>
              Keep
            </button>
          </div>
        </div>
      )}
    </Menu>
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
  allChecks,
  visitId,
  responses,
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
  /** Every check at this airport, for the AI's shortlist when a finding is not linked. */
  allChecks: Check[];
  visitId: string;
  responses: Record<string, Response>;
  /** A single row's own apply, same function the table's per-row edits
   *  already use — for an individual AI proposal's own Accept (one
   *  finding, not every selected one), for one finding only. */
  onChangeOne: (id: string, patch: Partial<Finding>) => void;
  onClear: () => void;
  /** Present only when the screen allows deleting. */
  onDelete?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
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

      <div className="mt-2.5 grid gap-2 border-t pt-2.5 sm:grid-cols-2" style={{ borderColor: "var(--acc-line)" }}>
        <BulkTriageSuggest findings={findings} entityCode={entityCode} visitId={visitId} checksById={checksById} allChecks={allChecks} responses={responses} onChangeOne={onChangeOne} />
        <BulkTranscribeVoiceNotes findings={findings} onChangeOne={onChangeOne} />
      </div>
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

