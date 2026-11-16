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
import { useFieldSaveStatus, useStore } from "@/lib/store";
import { getBlob, useBlobUrl } from "@/lib/media";
import { assist, polishContext, transcribe, useAssistAvailable, useTranscribeAvailable } from "@/lib/assist";
import { Chip, Pill, SaveStatusPill } from "@/components/ui/primitives";
import { IconCamera, IconMic, IconSpark } from "@/components/ui/icons";
import type { Attachment, Check, Finding, Response } from "@/lib/types";

/** The sort key an empty/absent Asset system sorts under — see `visible`'s
 *  own comment below. Built with fromCharCode rather than a string literal
 *  containing an actual U+FFFF character, so this file has no invisible,
 *  noncharacter byte sitting in its source. */
const GENERAL_SYSTEM_SORT_KEY = String.fromCharCode(0xffff);

export default function ReviewRiskTable({
  findings,
  entityCode,
  responses,
  activeId,
  onActivate,
  onChange: onChangeProp,
}: {
  findings: Finding[];
  /** For the Audit check column's requirement-text lookup and the Asset
   *  system filter's register lookups — this table reads no other check
   *  data. */
  entityCode: string;
  /** Keyed by checkId — read-only here, so the Finding column can show the
   *  linked check's own desk note (`observation`) and evidence verdict
   *  (`evidenceProves`) next to the finding itself, without a second,
   *  duplicate source of the same text (see the Finding column's own
   *  comment below). Never written from this table. */
  responses: Record<string, Response>;
  activeId: string | null;
  onActivate: (id: string) => void;
  /** The caller owns the write (updateFinding), same as everywhere else in
   *  this app a table edits a record in place. */
  onChange: (id: string, patch: Partial<Finding>) => void;
}) {
  const [filter, setFilter] = useState<ReviewRiskFilter>({ kind: "all" });
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
  /* Inline photo thumbnails (below) open here full-size rather than
     navigating away — a lightbox over the table, not a second screen. */
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  /* Audit-check reference codes are presentation we no longer show (see
   *  PR "Review pages: remove audit-check reference codes from the UI") —
   *  the readable requirement text takes their place everywhere a check is
   *  linked. Built once per entity rather than re-scanning checksAt() on
   *  every row's render. */
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
      </div>

      {/* Bulk bar — §3: set severity/likelihood/impact/root cause for every
          selected row at once. */}
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
              <Th>Location / Hierarchy</Th>
              <th className="p-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
                Finding
              </th>
              <Th>Root cause</Th>
              <Th>Impact</Th>
              <Th>Timeline</Th>
              <Th>Evidence</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => {
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

                  {/* Type — read-only here; the panel carries the toggle
                      (see ReviewRiskPanel). */}
                  <td className="p-2">
                    <Pill tone={type === "non-compliance" ? "bad" : "neutral"}>
                      {FINDING_TYPE_LABEL[type]}
                    </Pill>
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
                      longer spelled out on screen too. */}
                  <td className="min-w-[220px] max-w-[400px] p-2 align-top">
                    {(() => {
                      const r = f.checkId ? responses[f.checkId] : undefined;
                      return (
                        <div className="flex flex-col gap-[6px]">
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

                  {/* Evidence — Sarel: "add the photos in the row so that
                      the photos can be viewed inline." Up to 4 small
                      thumbnails (the finding's own photo evidence; EvidenceItem
                      document-custody requests still live in the panel),
                      tapping one opens it full-size in the lightbox below
                      without leaving the table; "+N" for anything beyond
                      that rather than growing the row unboundedly. */}
                  <td className="p-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-[4px]">
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
      </div>

      {lightbox && <EvidenceLightbox attachment={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/** One inline evidence thumbnail — Sarel: "add the photos in the row so that
 *  the photos can be viewed inline," then, after seeing it live: "increase
 *  the size of the photo so that you can see it properly inline." 56px, up
 *  from the original 28 — big enough to actually tell what it's a photo
 *  of without opening the lightbox. `useBlobUrl` is the same resolver
 *  Capture's own PhotoRow uses; the thumbnail/data-URL fallback chain is
 *  the same one too (the thumbnail is what survives when the full blob
 *  doesn't — see Capture.tsx's own note on why). */
function EvidenceThumb({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const { url } = useBlobUrl(attachment.blobKey);
  const src = url ?? attachment.thumbDataUrl ?? attachment.dataUrl ?? null;
  if (!src) return <IconCamera width={11} height={11} />;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={attachment.caption ? `View photo: ${attachment.caption}` : "View photo"}
      className="block overflow-hidden rounded-[6px] border p-0"
      style={{ borderColor: "var(--line-2)", width: 56, height: 56 }}
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
        className="flex min-h-[26px] max-w-[150px] flex-wrap items-center gap-[4px] rounded-[6px] px-[5px] py-[3px] text-left transition-[var(--t)]"
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
            <Pill tone="neutral">{selected[0]}</Pill>
            {selected.length > 1 && (
              <span className="font-mono text-[9.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
                +{selected.length - 1}
              </span>
            )}
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
}) {
  const [impactAdd, setImpactAdd] = useState<string[]>([]);
  const [impactRemove, setImpactRemove] = useState<string[]>([]);
  const [causeAdd, setCauseAdd] = useState<string[]>([]);
  const [causeRemove, setCauseRemove] = useState<string[]>([]);

  const toggleIn = (list: string[], v: string, set: (l: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div
      className="mb-2.5 rounded-[11px] border p-2.5"
      style={{ background: "var(--acc-soft)", borderColor: "var(--acc-line)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <b className="text-[11.5px]">{count} selected</b>
        <button type="button" onClick={onClear} className="text-[10.5px] underline" style={{ color: "var(--ink-3)" }}>
          Clear
        </button>
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
  /* Same synchronous double-fire guard as BulkTranscribeVoiceNotes, same
     reasoning — `running` state lags one render behind a raw click. Every
     result here still sits behind its own Accept/Reject either way, so a
     double-fire could only waste a duplicate "polish" call, never write
     twice — but there is no reason to risk even that. */
  const runningRef = useRef(false);

  const eligible = findings.filter((f) => f.description.trim());
  const pending = eligible.filter((f) => !proposals[f.id] || proposals[f.id].state === "error");
  const proposedCount = Object.values(proposals).filter((p) => p.state === "proposed").length;
  const appliedCount = Object.values(proposals).filter((p) => p.state === "applied").length;

  async function run() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    for (const f of eligible) {
      if (proposals[f.id]?.state === "proposed" || proposals[f.id]?.state === "applied") continue;
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
    if (!prop?.text) return;
    onChangeOne(f.id, { description: prop.text });
    setProposals((p) => ({ ...p, [f.id]: { ...prop, state: "applied" } }));
  }

  function applyAllProposed() {
    for (const f of eligible) if (proposals[f.id]?.state === "proposed") applyOne(f);
  }

  if (!aiOn) return null;

  return (
    <div>
      <div className="mb-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
        AI — rewrite each selected finding&rsquo;s notes, reviewed before anything is applied
      </div>
      <div className="flex flex-wrap items-center gap-[6px]">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running || eligible.length === 0 || pending.length === 0}
          className="flex items-center gap-[5px] rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold disabled:opacity-55"
          style={{ background: "var(--acc)", color: "#fff" }}
        >
          <IconSpark width={12} height={12} />
          {running ? "Suggesting…" : pending.length === 0 ? "All proposed" : `Suggest wording for ${pending.length}`}
        </button>
        {proposedCount > 0 && (
          <button
            type="button"
            onClick={applyAllProposed}
            className="rounded-[8px] border px-[9px] py-[6px] text-[11px] font-semibold"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            Apply {proposedCount} accepted
          </button>
        )}
        {appliedCount > 0 && <Pill tone="good">{appliedCount} applied</Pill>}
      </div>
      {Object.keys(proposals).length > 0 && (
        <div className="mt-1.5 flex max-h-[220px] flex-col gap-[6px] overflow-y-auto">
          {eligible
            .filter((f) => proposals[f.id])
            .map((f) => {
              const prop = proposals[f.id];
              return (
                <div
                  key={f.id}
                  className="rounded-[8px] border px-2 py-1.5 text-[10.5px]"
                  style={{ borderColor: "var(--line-2)", background: "var(--panel)" }}
                >
                  <div className="mb-1 truncate font-semibold" style={{ color: "var(--ink-2)" }}>
                    {f.title || f.id}
                  </div>
                  {prop.state === "loading" && <div style={{ color: "var(--ink-4)" }}>Thinking…</div>}
                  {prop.state === "error" && <div style={{ color: "var(--bad)" }}>{prop.error}</div>}
                  {prop.state === "proposed" && (
                    <>
                      <div
                        className="mb-1 rounded-[6px] border px-1.5 py-1"
                        style={{ borderColor: "var(--acc)", background: "var(--acc-soft)" }}
                      >
                        {prop.text}
                      </div>
                      <div className="flex gap-[6px]">
                        <button
                          type="button"
                          onClick={() => applyOne(f)}
                          className="rounded-[5px] px-[7px] py-[3px] text-[10px] font-semibold"
                          style={{ background: "var(--acc)", color: "#fff" }}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => setProposals((p) => { const next = { ...p }; delete next[f.id]; return next; })}
                          className="rounded-[5px] px-[7px] py-[3px] text-[10px] font-semibold"
                          style={{ color: "var(--bad)" }}
                        >
                          Reject
                        </button>
                      </div>
                    </>
                  )}
                  {prop.state === "applied" && <div style={{ color: "var(--good)" }}>Applied.</div>}
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

