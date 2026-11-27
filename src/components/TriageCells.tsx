"use client";

/** COMPACT CELLS FOR THE TRIAGE TABLE — Sarel, 27 Nov 2026: row height had
 *  inflated (three stacked type buttons, four stacked tag buttons, chip
 *  rows for root cause and impact), so one finding took ~250px and a
 *  13-inch laptop showed two. Every control here is one line tall:
 *
 *    TypePill        the ACTIVE type only, click for a menu of the three
 *    TagsMenu        a "+ Tag" ghost (row hover) opening four checkboxes
 *    TagBadges       the active tags, as small muted badges beside the title
 *    TimelineSelect  one compact select
 *    RiskSelect      Severity A-E / Likelihood 1-5, inline
 *    PriorityBadge   Level I / II / III, calculated by priorityFor(), never typed
 *
 *  Nothing here owns data: each control calls back with a patch and the table
 *  writes it through updateFinding, so every change saves immediately, the
 *  same as every other inline edit in this app.
 *
 *  Menus are position:fixed, measured from their trigger, because the table
 *  sits in an overflow container that would otherwise clip a menu opened on
 *  the last visible row. */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FINDING_TYPE_LABEL, TIMELINES, priorityFor } from "@/lib/reviewRisk";
import { LIKELIHOODS, SEVERITIES, sevLetter, likeNumber } from "@/lib/risk";
import type { Finding, Likelihood, Severity } from "@/lib/types";

type FindingType = "non-compliance" | "observation" | "needs-evidence";

/** A menu anchored under its trigger. Closes on Escape or an outside click. */
export function Menu({
  trigger,
  label,
  width = 190,
  children,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null> }) => ReactNode;
  label: string;
  width?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const flip = window.innerHeight - r.bottom < 200;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      top: flip ? Math.max(8, r.top - 4 - 160) : r.bottom + 4,
    });
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: triggerRef })}
      {open && pos && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            aria-label={label}
            className="fixed z-[75] rounded-[10px] border p-[4px]"
            style={{ left: pos.left, top: pos.top, width, background: "var(--menu-bg)", borderColor: "var(--menu-line)", boxShadow: "var(--e3)" }}
          >
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </>
  );
}

const TYPE_STYLE: Record<FindingType, { cls: string; icon: string; short: string }> = {
  "non-compliance": { cls: "bg-red-50 text-red-700 border-red-200", icon: "\u{1F534}", short: "Non-compliance" },
  observation: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: "\u{1F7E1}", short: "Observation" },
  "needs-evidence": { cls: "bg-blue-50 text-blue-700 border-blue-200", icon: "\u{1F535}", short: "Evidence" },
};

/** The active type as one pill; click for a menu to change it. */
export function TypePill({ type, label, onChange }: { type: FindingType; label: string; onChange: (t: FindingType) => void }) {
  const s = TYPE_STYLE[type];
  return (
    <Menu
      label={label}
      width={170}
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${label}: ${s.short}. Change type`}
          className={`inline-flex h-[24px] items-center gap-[4px] whitespace-nowrap rounded-full border px-[8px] text-[11px] font-semibold ${s.cls}`}
        >
          <span aria-hidden="true">{s.icon}</span>
          {s.short}
          <span aria-hidden="true" className="text-[9px] opacity-60">
            &#9662;
          </span>
        </button>
      )}
    >
      {(close) =>
        (["non-compliance", "observation", "needs-evidence"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="menuitemradio"
            aria-checked={t === type}
            onClick={() => {
              onChange(t);
              close();
            }}
            className="flex w-full items-center gap-[6px] rounded-[7px] px-[8px] py-[6px] text-left text-[11.5px]"
            style={{ background: t === type ? "var(--acc-soft)" : "transparent", color: "var(--ink)" }}
          >
            <span aria-hidden="true">{TYPE_STYLE[t].icon}</span>
            {FINDING_TYPE_LABEL[t]}
            {t === type && <span className="ml-auto" aria-hidden="true">&#10003;</span>}
          </button>
        ))
      }
    </Menu>
  );
}

/** The four tags, in the order and wording Sarel gave. */
export const TRIAGE_TAGS = [
  { key: "safety", label: "Immediate Safety Concern", title: "A hazard to people or operations. Counted under the Safety filter." },
  { key: "critical", label: "Immediate Critical Item", title: "A serious finding that must be dealt with. Counted under the Critical filter." },
] as const;

export function activeTags(f: Pick<Finding, "timeline" | "safetyTag" | "critical" | "internalOnly">): string[] {
  const out: string[] = [];
  if (f.timeline === "Immediate") out.push("Immediate");
  if (f.safetyTag) out.push("Immediate safety concern");
  if (f.critical) out.push("Immediate critical item");
  if (f.internalOnly) out.push("Internal");
  return out;
}

const TAG_BADGE = "inline-flex h-[20px] items-center whitespace-nowrap rounded-[6px] border px-[6px] text-[10.5px] font-semibold";

/** The two tags that matter, as badges: red "Immediate Safety", amber
 *  "Critical Item". Internal shows as a quiet grey badge. */
export function TagBadges({ f }: { f: Pick<Finding, "safetyTag" | "critical" | "internalOnly"> }) {
  return (
    <>
      {f.safetyTag && <span className={`${TAG_BADGE} border-red-200 bg-red-50 text-red-700`}>{"\u{1F6A8}"} Immediate Safety</span>}
      {f.critical && <span className={`${TAG_BADGE} border-amber-200 bg-amber-50 text-amber-700`}>{"\u26A1"} Critical Item</span>}
      {f.internalOnly && (
        <span className={TAG_BADGE} style={{ background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-3)" }}>
          Internal
        </span>
      )}
    </>
  );
}

/** "+ Tag" (always visible, quiet) when untagged; once tagged, the badges
 *  themselves are the button. Opens the two toggles, plus a separate
 *  "Internal only" switch below them. */
export function TagsMenu({ f, onChange }: { f: Finding; onChange: (patch: Partial<Finding>) => void }) {
  const on: Record<string, boolean> = { safety: !!f.safetyTag, critical: !!f.critical };
  const any = on.safety || on.critical || !!f.internalOnly;
  return (
    <Menu
      label={`Tags for ${f.title || f.id}`}
      width={240}
      trigger={({ open, toggle: t, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={t}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Tags for ${f.title || f.id}`}
          className={
            any
              ? "flex flex-col items-end gap-[3px] rounded-[6px]"
              : "inline-flex h-[20px] items-center whitespace-nowrap rounded-[6px] border border-dashed px-[6px] text-[10.5px]"
          }
          style={any ? undefined : { borderColor: "var(--line-2)", color: "var(--ink-3)" }}
        >
          {any ? <TagBadges f={f} /> : "+ Tag"}
        </button>
      )}
    >
      {() => (
        <>
          {TRIAGE_TAGS.map((t) => (
            <label key={t.key} title={t.title} className="flex cursor-pointer items-center gap-[7px] rounded-[7px] px-[8px] py-[6px] text-[12px]" style={{ background: on[t.key] ? "var(--acc-soft)" : "transparent" }}>
              <input
                type="checkbox"
                checked={on[t.key]}
                onChange={() => onChange(t.key === "safety" ? { safetyTag: !f.safetyTag } : { critical: !f.critical })}
              />
              {t.label}
            </label>
          ))}
          <div className="my-[3px] border-t" style={{ borderColor: "var(--menu-line)" }} />
          <label title="Keep this finding out of reports" className="flex cursor-pointer items-center gap-[7px] rounded-[7px] px-[8px] py-[5px] text-[11px]" style={{ color: "var(--ink-3)" }}>
            <input type="checkbox" checked={!!f.internalOnly} onChange={() => onChange({ internalOnly: !f.internalOnly })} />
            Internal only (kept out of reports)
          </label>
        </>
      )}
    </Menu>
  );
}

/** Root cause / Impact cell: a pill with the first choice (+N for the rest) or a
 *  quiet "+ Add" button; click for a checklist popover. Saves on each tick.
 *  Values already stored but no longer offered (`legacy`) stay listed so they
 *  can be seen and unticked. */
export function MultiPill({
  values,
  options,
  legacy = [],
  filled,
  addLabel,
  label,
  onChange,
}: {
  values: string[] | undefined;
  options: readonly string[];
  legacy?: readonly string[];
  filled: boolean;
  addLabel: string;
  label: string;
  onChange: (next: string[]) => void;
}) {
  const cur = values ?? [];
  const rows = [...options, ...legacy.filter((l) => cur.includes(l))];
  const [first, ...rest] = cur;
  return (
    <Menu
      label={label}
      width={230}
      trigger={({ open, toggle: t, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={t}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          title={cur.length ? cur.join(", ") : undefined}
          className={
            first
              ? "inline-flex max-w-full items-center gap-[4px] rounded-[8px] border px-[7px] py-[2px] text-left text-[11px] font-medium leading-[13px]"
              : "inline-flex h-[20px] items-center whitespace-nowrap rounded-[6px] border border-dashed px-[6px] text-[10.5px]"
          }
          style={
            first
              ? filled
                ? { background: "var(--acc-soft)", borderColor: "transparent", color: "var(--acc)" }
                : { background: "transparent", borderColor: "var(--line-2)", color: "var(--ink-2)" }
              : { borderColor: "var(--line-2)", color: "var(--ink-3)", opacity: open ? 1 : undefined }
          }
        >
          {first ? (
            <>
              <span className="min-w-0 break-words">{first}</span>
              {rest.length > 0 && <span className="shrink-0 font-semibold">+{rest.length}</span>}
            </>
          ) : (
            addLabel
          )}
        </button>
      )}
    >
      {() =>
        rows.map((o) => {
          const on = cur.includes(o);
          return (
            <label key={o} className="flex cursor-pointer items-center gap-[7px] rounded-[7px] px-[8px] py-[6px] text-[12px]" style={{ background: on ? "var(--acc-soft)" : "transparent" }}>
              <input type="checkbox" checked={on} onChange={() => onChange(on ? cur.filter((x) => x !== o) : [...cur, o])} />
              {o}
            </label>
          );
        })
      }
    </Menu>
  );
}

/** One compact select, styled as a pill. */
export function TimelineSelect({ value, label, onChange }: { value: string | undefined; label: string; onChange: (v: string | undefined) => void }) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-[24px] max-w-[132px] rounded-full border px-[8px] text-[11px] font-medium"
      style={{ background: value ? "var(--panel)" : "transparent", borderColor: "var(--line-2)", color: value ? "var(--ink-2)" : "var(--ink-4)" }}
    >
      <option value="">Timeline</option>
      {TIMELINES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Severity (A-E) or Likelihood (1-5). The option text is the short code (so the
 *  closed select reads "D", not a truncated "D - M"); the full ACSA word is the
 *  tooltip, and the column headers spell the scale out. */
export function RiskSelect({
  kind,
  finding,
  onChange,
  full = false,
}: {
  full?: boolean;
  kind: "severity" | "likelihood";
  finding: Pick<Finding, "severity" | "likelihood" | "title" | "id">;
  onChange: (patch: Partial<Finding>) => void;
}) {
  const isSev = kind === "severity";
  const value = isSev ? finding.severity : finding.likelihood;
  const options: readonly string[] = isSev ? SEVERITIES : LIKELIHOODS;
  const name = `${isSev ? "Severity" : "Likelihood"} for ${finding.title || finding.id}`;
  return (
    <select
      aria-label={name}
      title={value ?? (isSev ? "Severity A-E" : "Likelihood 1-5")}
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value || null;
        onChange(isSev ? { severity: v as Severity | null } : { likelihood: v as Likelihood | null });
      }}
      className={full ? "h-[32px] w-full rounded-[8px] border px-[8px] text-[12px]" : "h-[24px] w-[46px] rounded-[6px] border px-[3px] text-center text-[11px] font-semibold"}
      style={{ background: value ? "var(--panel)" : "transparent", borderColor: "var(--line-2)", color: value ? "var(--ink)" : "var(--ink-4)" }}
    >
      <option value="">{full ? "Not rated" : isSev ? "Sev" : "Lik"}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {full ? o : o.charAt(0)}
        </option>
      ))}
    </select>
  );
}

/** Short display of a chosen rating, for places that are not a select. */
export function ratingCode(f: Pick<Finding, "severity" | "likelihood">): string {
  return `${sevLetter(f.severity)}${likeNumber(f.likelihood)}`;
}

const PRIORITY_STYLE: Record<"bad" | "warn" | "good", string> = {
  bad: "bg-red-50 text-red-700 border-red-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  good: "bg-green-50 text-green-700 border-green-200",
};

/** Level I (red) / II (amber) / III (green), from the 5x5 matrix via
 *  priorityFor() — the one place a band is ever derived. */
export function PriorityBadge({ f }: { f: Pick<Finding, "severity" | "likelihood"> }) {
  const p = priorityFor(f);
  if (!p) return <span className="text-[11px]" style={{ color: "var(--ink-4)" }} title="Pick a severity and a likelihood">&mdash;</span>;
  return (
    <span title={p.label} className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-[8px] text-[10.5px] font-semibold ${PRIORITY_STYLE[p.tone]}`}>
      Level {p.priority}
    </span>
  );
}
