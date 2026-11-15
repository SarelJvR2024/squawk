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
 *  · Likelihood · Rating · Root cause · Impact · Evidence — a FIXED set, no
 *  column-toggle any more, because that mockup is one specific wide table, not
 *  a customisable one. Also added: Discipline/Asset system filters, reusing
 *  `ALL_DISCIPLINES`/`systemsOf`/`systemsAt` (src/lib/register.ts) rather than
 *  a second vocabulary.
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
  applyBulkMulti,
  countNotRated,
  findingTypeFor,
  matchesReviewRiskFilter,
  priorityFor,
  type ReviewRiskFilter,
} from "@/lib/reviewRisk";
import { LIKELIHOODS, SEVERITIES } from "@/lib/risk";
import { ALL_DISCIPLINES, checksAt, systemsAt, systemsOf } from "@/lib/register";
import { Chip, Pill } from "@/components/ui/primitives";
import { IconCamera, IconMic } from "@/components/ui/icons";
import type { Check, Finding, Likelihood, Severity } from "@/lib/types";

/** The sort key an empty/absent Asset system sorts under — see `visible`'s
 *  own comment below. Built with fromCharCode, not a `"￿"` string
 *  literal, so this stays an ordinary, visible character in this file. */
const GENERAL_SYSTEM_SORT_KEY = String.fromCharCode(0xffff);

export default function ReviewRiskTable({
  findings,
  entityCode,
  activeId,
  onActivate,
  onChange,
}: {
  findings: Finding[];
  /** For the Audit check column's requirement-text lookup and the Asset
   *  system filter's register lookups — this table reads no other check
   *  data. */
  entityCode: string;
  activeId: string | null;
  onActivate: (id: string) => void;
  /** The caller owns the write (updateFinding), same as everywhere else in
   *  this app a table edits a record in place. */
  onChange: (id: string, patch: Partial<Finding>) => void;
}) {
  const [filter, setFilter] = useState<ReviewRiskFilter>({ kind: "all" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      {/* Filters — §3: "Rating, Not rated, Impact area, Root cause
          category, Root cause unconfirmed", widened with Discipline and
          Asset system. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-[6px]">
        <FilterChip active={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>
          All ({findings.length})
        </FilterChip>
        {(["I", "II", "III"] as const).map((p) => (
          <FilterChip
            key={p}
            active={filter.kind === "priority" && filter.priority === p}
            onClick={() => setFilter({ kind: "priority", priority: p })}
          >
            Priority {p} ({findings.filter((f) => matchesReviewRiskFilter(f, { kind: "priority", priority: p })).length})
          </FilterChip>
        ))}
        <FilterChip active={filter.kind === "notRated"} onClick={() => setFilter({ kind: "notRated" })}>
          Not rated ({countNotRated(findings)})
        </FilterChip>
        <FilterChip active={filter.kind === "unconfirmed"} onClick={() => setFilter({ kind: "unconfirmed" })}>
          Root cause unconfirmed ({findings.filter((f) => matchesReviewRiskFilter(f, { kind: "unconfirmed" })).length})
        </FilterChip>
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
      <div className="mb-1.5 text-[10.5px]" style={{ color: "var(--ink-3)" }}>
        {visible.length} finding{visible.length === 1 ? "" : "s"}
        {filter.kind !== "all" ? ` matching this filter (of ${findings.length} total)` : ""}
      </div>

      {/* The table itself — the full column set Sarel approved from the
          mockup, fixed (no toggle): select · Type · Discipline · Asset
          system · Audit check · Finding/comment · Severity · Likelihood ·
          Rating · Root cause · Impact · Evidence. */}
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
              <Th>Asset system</Th>
              <Th>Audit check</Th>
              <th className="p-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
                Finding
              </th>
              <Th>Severity</Th>
              <Th>Likelihood</Th>
              <Th>Rating</Th>
              <Th>Root cause</Th>
              <Th>Impact</Th>
              <Th>Evidence</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => {
              const priority = priorityFor(f);
              const impact = f.impactAreas ?? [];
              const causes = f.rootCauseCategories ?? [];
              const type = findingTypeFor(f);
              const photos = f.attachments.filter((a) => a.kind === "photo").length;
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

                  <td className="p-2 whitespace-nowrap">{f.discipline || "—"}</td>

                  <td className="p-2 whitespace-nowrap">
                    {f.system ? (
                      f.system
                    ) : (
                      <span className="italic" style={{ color: "var(--ink-4)" }}>
                        General
                      </span>
                    )}
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

                  {/* Finding/comment — wraps, never truncated to nothing. */}
                  <td className="min-w-[220px] max-w-[400px] p-2 align-top">
                    <span className="block whitespace-normal break-words font-semibold" style={{ color: "var(--ink)" }}>
                      {f.title || f.description || f.id}
                    </span>
                    {f.description && f.title && (
                      <span className="mt-[2px] block whitespace-normal break-words text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                        {f.description}
                      </span>
                    )}
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
                  <td className="p-2">
                    {causes.length === 0 ? (
                      <span style={{ color: "var(--ink-4)" }}>—</span>
                    ) : (
                      <span>
                        <Pill>{causes[0]}</Pill>
                        {causes.length > 1 && (
                          <span className="ml-1 font-mono text-[9.5px]" style={{ color: "var(--ink-3)" }}>
                            +{causes.length - 1}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {impact.length === 0 ? (
                      <span style={{ color: "var(--ink-4)" }}>—</span>
                    ) : (
                      <span>
                        <Pill>{impact[0]}</Pill>
                        {impact.length > 1 && (
                          <span className="ml-1 font-mono text-[9.5px]" style={{ color: "var(--ink-3)" }}>
                            +{impact.length - 1}
                          </span>
                        )}
                      </span>
                    )}
                  </td>

                  {/* Evidence — small counts, reading `attachments`. The
                      finding's own photo/voice evidence; EvidenceItem
                      (document custody) requests live in the panel. */}
                  <td className="p-2">
                    <span className="inline-flex items-center gap-[8px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                      <span className="inline-flex items-center gap-[2px]" title={`${photos} photograph${photos === 1 ? "" : "s"}`}>
                        <IconCamera width={11} height={11} /> {photos}
                      </span>
                      <span className="inline-flex items-center gap-[2px]" title={`${voices} voice note${voices === 1 ? "" : "s"}`}>
                        <IconMic width={11} height={11} /> {voices}
                      </span>
                    </span>
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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-[9px] py-[4px] text-[10.5px] font-semibold whitespace-nowrap"
      style={
        active
          ? { background: "var(--acc)", borderColor: "var(--acc)", color: "#fff" }
          : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
      }
    >
      {children}
    </button>
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

