"use client";

/** THE REVIEW TABLE — §1's "biggest gap" and §3's table + bulk bar + filters,
 *  from the Review risk-fields addendum. One row per finding (observation or
 *  non-compliance) raised this visit, with the addendum's new risk fields
 *  inline-editable in the table itself and in full in ReviewRiskPanel
 *  (rendered by the caller — see /review's own page for how the two sit side
 *  by side).
 *
 *  Severity, likelihood, impact and root cause categories are never computed
 *  twice: every rating pill and filter here calls into src/lib/reviewRisk.ts,
 *  the one shared function the addendum itself asks for.
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
 *  field." Single-select, so a plain `<select>` same as Severity/Likelihood,
 *  not the multi-select `<details>` popover Root cause/Impact use.
 *
 *  AI "Suggest rating" (§3's bulk bar) is DELIBERATELY NOT in this pass — see
 *  the PR description's "what's deferred" section. The bulk bar below sets
 *  severity, likelihood, impact areas and root cause categories across every
 *  selected row directly; nothing here calls /api/assist yet. */

import { useMemo, useState } from "react";
import {
  FINDING_TYPE_LABEL,
  IMPACT_AREAS,
  ROOT_CAUSES,
  TIMELINES,
  applyBulkMulti,
  findingTypeFor,
  matchesReviewRiskFilter,
  priorityFor,
  toggleMulti,
  type ReviewRiskFilter,
} from "@/lib/reviewRisk";
import { LIKELIHOODS, SEVERITIES } from "@/lib/risk";
import { ALL_DISCIPLINES, checksAt, systemsAt, systemsOf } from "@/lib/register";
import { useFieldSaveStatus } from "@/lib/store";
import { useBlobUrl } from "@/lib/media";
import { Chip, Pill, SaveStatusPill } from "@/components/ui/primitives";
import { IconCamera, IconMic } from "@/components/ui/icons";
import type { Attachment, Check, Finding, Likelihood, Response, Severity } from "@/lib/types";

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
          onApply={(patchFor) => {
            for (const f of selectedFindings) onChange(f.id, patchFor(f));
          }}
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
          follow-up requests: Discipline and Asset system now share one
          column (asset system stacked under discipline, since a system only
          ever means something within its discipline), and Evidence now
          shows actual photo thumbnails, not only a count — select · Type ·
          Discipline/Asset system · Audit check · Finding/comment ·
          Severity · Likelihood · Rating · Root cause · Impact · Evidence. */}
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
              <Th>Discipline</Th>
              <Th>Audit check</Th>
              <th className="p-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
                Finding
              </th>
              <Th>Severity</Th>
              <Th>Likelihood</Th>
              <Th>Rating</Th>
              <Th>Root cause</Th>
              <Th>Impact</Th>
              <Th>Timeline</Th>
              <Th>Evidence</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => {
              const priority = priorityFor(f);
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

                  {/* Discipline / Asset system — one column, asset system
                      stacked below its discipline (Sarel: "put asset system
                      below the discipline in the same column"), since a
                      system is only ever meaningful within the discipline
                      it belongs to. */}
                  <td className="p-2 whitespace-nowrap">
                    <div>{f.discipline || "—"}</div>
                    <div className="mt-[1px] text-[10px]" style={{ color: "var(--ink-3)" }}>
                      {f.system || <span className="italic" style={{ color: "var(--ink-4)" }}>General</span>}
                    </div>
                  </td>

                  {/* Audit check — the readable requirement text, never the
                      reference code (presentation only; f.checkId itself is
                      untouched and still drives linking/filtering/grouping
                      and compliance calculations elsewhere). */}
                  <td className="min-w-[160px] max-w-[320px] p-2 align-top">
                    {f.checkId ? (
                      <span className="block whitespace-normal break-words" style={{ color: "var(--ink-2)" }}>
                        {checksById.get(f.checkId)?.requirement.slice(0, 90) ?? f.checkId}
                      </span>
                    ) : (
                      <span className="not-italic" style={{ color: "var(--ink-4)" }}>
                        General
                      </span>
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
                      simply absent, not "General". */}
                  <td className="min-w-[220px] max-w-[400px] p-2 align-top">
                    {(() => {
                      const r = f.checkId ? responses[f.checkId] : undefined;
                      return (
                        <div className="flex flex-col gap-[6px]">
                          {r?.observation && (
                            <div>
                              <div className="text-[9.5px] font-semibold uppercase" style={{ color: "var(--ink-4)" }}>
                                Audit check note
                              </div>
                              <div className="whitespace-normal break-words text-[10.5px]" style={{ color: "var(--ink-2)" }}>
                                {r.observation}
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="text-[9.5px] font-semibold uppercase" style={{ color: "var(--ink-4)" }}>
                              Finding
                            </div>
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
                            <div>
                              <div className="text-[9.5px] font-semibold uppercase" style={{ color: "var(--ink-4)" }}>
                                Evidence review
                              </div>
                              <div className="whitespace-normal break-words text-[10.5px]" style={{ color: "var(--ink-2)" }}>
                                {r.evidenceProves}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      aria-label={`Severity for ${f.title || f.id}`}
                      value={f.severity ?? ""}
                      onChange={(e) =>
                        onChange(f.id, {
                          severity: (e.target.value || null) as Severity | null,
                          ratingConfirmed: !!e.target.value && !!f.likelihood,
                        })
                      }
                      className="rounded-[6px] border px-1.5 py-1 font-mono text-[10.5px]"
                      style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                    >
                      <option value="">—</option>
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      aria-label={`Likelihood for ${f.title || f.id}`}
                      value={f.likelihood ?? ""}
                      onChange={(e) =>
                        onChange(f.id, {
                          likelihood: (e.target.value || null) as Likelihood | null,
                          ratingConfirmed: !!f.severity && !!e.target.value,
                        })
                      }
                      className="rounded-[6px] border px-1.5 py-1 font-mono text-[10.5px]"
                      style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                    >
                      <option value="">—</option>
                      {LIKELIHOODS.map((l) => (
                        <option key={l} value={l}>
                          {l.charAt(0)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    {/* READ-ONLY — no input anywhere in this cell. The
                        rating is derived from severity+likelihood, never
                        typed; see priorityFor's own doc comment. */}
                    {priority ? (
                      <Pill tone={priority.tone}>{priority.label}</Pill>
                    ) : (
                      <Pill tone="neutral">Not rated</Pill>
                    )}
                  </td>
                  {/* PRIORITY 2 (review redesign) — Root cause and Impact
                      are now editable right here, not panel-only, same as
                      Severity/Likelihood above: a <details> popover inside
                      a stopPropagation'd <td>, so opening it never selects
                      the row. toggleMulti/IMPACT_AREAS/ROOT_CAUSES are the
                      exact same values and toggle function the panel's own
                      chip rows already use — one vocabulary, one toggle,
                      two surfaces. */}
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
 *  the photos can be viewed inline." `useBlobUrl` is the same resolver
 *  Capture's own PhotoRow uses; the thumbnail/data-URL fallback chain is the
 *  same one too (full resolution isn't needed for a 28px thumbnail, and the
 *  thumbnail is what survives when the full blob doesn't — see
 *  Capture.tsx's own note on why). */
function EvidenceThumb({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const { url } = useBlobUrl(attachment.blobKey);
  const src = url ?? attachment.thumbDataUrl ?? attachment.dataUrl ?? null;
  if (!src) return <IconCamera width={11} height={11} />;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={attachment.caption ? `View photo: ${attachment.caption}` : "View photo"}
      className="block overflow-hidden rounded-[4px] border p-0"
      style={{ borderColor: "var(--line-2)", width: 28, height: 28 }}
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

/** PRIORITY 2 (review redesign) — the table's own inline editor for a
 *  multi-select axis (Root cause categories, Impact areas), so neither has
 *  to leave the row for the panel just to toggle one value. A native
 *  `<details>` disclosure, not a hand-rolled popover: toggling an option
 *  inside it never closes it (only the summary toggles), it is natively
 *  keyboard-operable (Enter/Space on the summary, Tab through the chips),
 *  and it needs no outside-click listener to manage. The caller's own
 *  `<td onClick={stopPropagation}>` is what keeps opening this from
 *  selecting the row — this component does not duplicate that guard. */
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
  return (
    <details className="group relative inline-block">
      <summary
        aria-label={label}
        className="block cursor-pointer list-none [&::-webkit-details-marker]:hidden"
      >
        {selected.length === 0 ? (
          <span style={{ color: "var(--ink-4)" }}>—</span>
        ) : (
          <span>
            <Pill>{selected[0]}</Pill>
            {selected.length > 1 && (
              <span className="ml-1 font-mono text-[9.5px]" style={{ color: "var(--ink-3)" }}>
                +{selected.length - 1}
              </span>
            )}
          </span>
        )}
      </summary>
      <div
        className="absolute z-10 mt-1 flex w-[220px] flex-wrap gap-[4px] rounded-[8px] border p-2 shadow-lg"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
      >
        {options.map((o) => (
          <Chip key={o} selected={selected.includes(o)} onClick={() => onToggle(o)}>
            {o}
          </Chip>
        ))}
      </div>
    </details>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="p-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
      {children}
    </th>
  );
}

/** The bulk bar — §3: "set severity, likelihood, impact areas (add/remove),
 *  root cause categories (add/remove) for selected rows." Every apply goes
 *  through `applyBulkMulti`/a direct patch, same functions a single row's
 *  own edit uses, so a bulk edit can never disagree with what a per-row edit
 *  of the same field would have done. */
function BulkBar({
  count,
  onApply,
  onClear,
}: {
  count: number;
  onApply: (patchFor: (f: Finding) => Partial<Finding>) => void;
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
      <div className="flex flex-wrap items-center gap-[8px]">
        <select
          aria-label="Set severity for selected"
          defaultValue=""
          onChange={(e) => {
            const v = (e.target.value || null) as Severity | null;
            onApply((f) => ({ severity: v, ratingConfirmed: !!v && !!f.likelihood }));
            e.target.value = "";
          }}
          className="h-[30px] rounded-[8px] border px-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        >
          <option value="">Set severity…</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Set likelihood for selected"
          defaultValue=""
          onChange={(e) => {
            const v = (e.target.value || null) as Likelihood | null;
            onApply((f) => ({ likelihood: v, ratingConfirmed: !!f.severity && !!v }));
            e.target.value = "";
          }}
          className="h-[30px] rounded-[8px] border px-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        >
          <option value="">Set likelihood…</option>
          {LIKELIHOODS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
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
    </div>
  );
}

