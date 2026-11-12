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
 *  AI "Suggest rating" (§3's bulk bar) is DELIBERATELY NOT in this pass — see
 *  the PR description's "what's deferred" section. The bulk bar below sets
 *  severity, likelihood, impact areas and root cause categories across every
 *  selected row directly; nothing here calls /api/assist yet. */

import { useMemo, useState } from "react";
import {
  IMPACT_AREAS,
  ROOT_CAUSES,
  applyBulkMulti,
  countByMultiSelect,
  countNotRated,
  countWithNoneSelected,
  hasRootCauseContent,
  matchesReviewRiskFilter,
  priorityFor,
  rollupBy,
  type ReviewRiskFilter,
} from "@/lib/reviewRisk";
import { LIKELIHOODS, SEVERITIES } from "@/lib/risk";
import { Chip, Pill } from "@/components/ui/primitives";
import type { Finding, Likelihood, Severity } from "@/lib/types";

type Column = "severity" | "likelihood" | "rating" | "impact" | "rootCause";

const ALL_COLUMNS: { key: Column; label: string }[] = [
  { key: "severity", label: "Severity" },
  { key: "likelihood", label: "Likelihood" },
  { key: "rating", label: "Rating" },
  { key: "impact", label: "Impact" },
  { key: "rootCause", label: "Root cause" },
];

/** §3: "Keep columns toggleable; default show Rating, Impact, Root cause." */
const DEFAULT_COLUMNS: Column[] = ["rating", "impact", "rootCause"];

type RollupAxis = "discipline" | "system" | "check" | "finding";

export default function ReviewRiskTable({
  findings,
  activeId,
  onActivate,
  onChange,
}: {
  findings: Finding[];
  activeId: string | null;
  onActivate: (id: string) => void;
  /** The caller owns the write (updateFinding), same as everywhere else in
   *  this app a table edits a record in place. */
  onChange: (id: string, patch: Partial<Finding>) => void;
}) {
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [filter, setFilter] = useState<ReviewRiskFilter>({ kind: "all" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rollupAxis, setRollupAxis] = useState<RollupAxis>("discipline");

  const visible = useMemo(
    () => findings.filter((f) => matchesReviewRiskFilter(f, filter)),
    [findings, filter]
  );

  const toggleColumn = (c: Column) =>
    setColumns((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  const toggleRow = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedFindings = visible.filter((f) => selected.has(f.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      {/* Filters — §3: "Rating, Not rated, Impact area, Root cause
          category, Root cause unconfirmed." */}
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
            Priority {p}
          </FilterChip>
        ))}
        <FilterChip active={filter.kind === "notRated"} onClick={() => setFilter({ kind: "notRated" })}>
          Not rated ({countNotRated(findings)})
        </FilterChip>
        <FilterChip active={filter.kind === "unconfirmed"} onClick={() => setFilter({ kind: "unconfirmed" })}>
          Root cause unconfirmed
        </FilterChip>
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

        {/* Column toggles, right-aligned. */}
        <div className="ml-auto flex flex-wrap items-center gap-[4px]">
          <span className="text-[9.5px]" style={{ color: "var(--ink-4)" }}>
            Columns
          </span>
          {ALL_COLUMNS.map((c) => (
            <FilterChip key={c.key} active={columns.includes(c.key)} onClick={() => toggleColumn(c.key)}>
              {c.label}
            </FilterChip>
          ))}
        </div>
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

      {/* The table itself. */}
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
              <th className="p-2 text-left font-display text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
                Finding
              </th>
              {columns.includes("severity") && <Th>Severity</Th>}
              {columns.includes("likelihood") && <Th>Likelihood</Th>}
              {columns.includes("rating") && <Th>Rating</Th>}
              {columns.includes("impact") && <Th>Impact</Th>}
              {columns.includes("rootCause") && <Th>Root cause</Th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => {
              const priority = priorityFor(f);
              const impact = f.impactAreas ?? [];
              const causes = f.rootCauseCategories ?? [];
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
                  <td className="min-w-[160px] max-w-[320px] truncate p-2">
                    <span className="block truncate font-semibold" style={{ color: "var(--ink)" }}>
                      {f.title || f.description || f.id}
                    </span>
                    <span className="block truncate font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                      {f.discipline} · {f.system || "—"}
                    </span>
                  </td>

                  {columns.includes("severity") && (
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
                  )}
                  {columns.includes("likelihood") && (
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
                  )}
                  {columns.includes("rating") && (
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
                  )}
                  {columns.includes("impact") && (
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
                  )}
                  {columns.includes("rootCause") && (
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
                  )}
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

      {/* §4 — Risk & root cause summary / roll-up. */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <b className="font-display text-[11px] font-semibold">Risk &amp; root cause summary</b>
          <select
            aria-label="Roll up by"
            value={rollupAxis}
            onChange={(e) => setRollupAxis(e.target.value as RollupAxis)}
            className="h-[28px] rounded-[8px] border px-2 text-[10.5px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          >
            <option value="discipline">By discipline</option>
            <option value="system">By asset system</option>
            <option value="check">By audit check</option>
            <option value="finding">By finding</option>
          </select>
        </div>
        <RollupTable findings={findings} axis={rollupAxis} />

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <MultiCountCard title="Impact areas" counts={countByMultiSelect(findings, (f) => f.impactAreas)} />
          <MultiCountCard title="Root cause categories" counts={countByMultiSelect(findings, (f) => f.rootCauseCategories)} />
        </div>
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

function RollupTable({ findings, axis }: { findings: Finding[]; axis: RollupAxis }) {
  const keyOf = (f: Finding): string => {
    switch (axis) {
      case "discipline":
        return f.discipline || "—";
      case "system":
        return f.system || "—";
      case "check":
        return f.checkId ?? "No check";
      case "finding":
        return f.title || f.id;
    }
  };
  const rows = rollupBy(findings, keyOf);
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr style={{ background: "var(--sunken)" }}>
          <Th>{{ discipline: "Discipline", system: "Asset system", check: "Audit check", finding: "Finding" }[axis]}</Th>
          <Th>I</Th>
          <Th>II</Th>
          <Th>III</Th>
          <Th>Not rated</Th>
          <Th>Total</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t" style={{ borderColor: "var(--line)" }}>
            <td className="p-2">{r.key}</td>
            <td className="p-2 font-mono">{r.counts.I}</td>
            <td className="p-2 font-mono">{r.counts.II}</td>
            <td className="p-2 font-mono">{r.counts.III}</td>
            <td className="p-2 font-mono">{r.notRated}</td>
            <td className="p-2 font-mono font-semibold">{r.total}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={6} className="p-3 text-center" style={{ color: "var(--ink-3)" }}>
              No findings this visit.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function MultiCountCard({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-[11px] border p-2.5" style={{ borderColor: "var(--line-2)" }}>
      <div className="mb-1.5 font-display text-[10.5px] font-semibold">{title}</div>
      {entries.length === 0 ? (
        <div className="text-[11px]" style={{ color: "var(--ink-4)" }}>
          None selected on any finding yet.
        </div>
      ) : (
        entries.map(([k, n]) => (
          <div key={k} className="flex items-center justify-between py-[2px] text-[11px]">
            <span>{k}</span>
            <span className="font-mono font-semibold">{n}</span>
          </div>
        ))
      )}
    </div>
  );
}

/** Exported for the "none selected" count the summary can show alongside
 *  the per-value breakdown above — not wired into the cards by default (the
 *  addendum's own example only shows "Not rated" as its own bucket), kept
 *  here so a caller that wants it does not have to recompute it. */
export { countWithNoneSelected, hasRootCauseContent };
