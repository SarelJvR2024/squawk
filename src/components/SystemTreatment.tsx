"use client";

/** SEVERAL ROOT CAUSES AND SEVERAL MITIGATION ACTIONS, for one hazardous event.
 *
 *  Sarel: "we also need to be able to capture multiple root causes, multiple
 *  mitigation actions" — and, later: "the process is to capture a hazard and
 *  multiple root causes for the hazard... dont rate the hazard, rate the
 *  asset system severity and likelihood." So this renders inside one
 *  PossibleEvent (see PossibleEvents.tsx), not the asset system as a whole —
 *  a system's rating is one cell, agreed once, but it is rarely failing for
 *  only one reason, and each of its several hazardous events usually has its
 *  own distinct causes and its own distinct remediation, not a pool shared
 *  with every other event the system carries.
 *
 *  AS CONDENSED AS THIS GETS, 14 October 2026. Sarel: "this is still too big,
 *  must be much more condense, less notes, no suggested root causes, only
 *  when clicking the + should a text box be added to capture in." So: no
 *  ACSA chip list (still a free-text `cause`, exactly as `RootCauseNote`
 *  always allowed — "from ROOT_CAUSES where it fits, free text where it does
 *  not" never required the chips, just offered them), no explanatory
 *  paragraph, no per-cause note field, and no input box sits on screen
 *  un-asked-for — tapping "+" is what reveals one, for exactly as long as it
 *  takes to type one line.
 *
 *  NO OWNER, DATE OR STATUS CAPTURED HERE either — Sarel, earlier the same
 *  day: "no other fields like ownership needed." `MitigationAction` still
 *  carries `owner`/`dueDate`/`status` (Finding and Hazard, which reuse the
 *  type, still need them), so a seeded or hand-typed action here simply
 *  keeps them at their defaults ("", "", "Open") until carried further. */

import { useRef, useState } from "react";
import { IconPlus, IconX } from "@/components/ui/icons";
import type { MitigationAction, RootCauseNote } from "@/lib/types";

function AddRow({
  label,
  onAdd,
}: {
  label: string;
  onAdd: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (draft.trim()) onAdd(draft.trim());
    setDraft("");
    setOpen(false);
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => ref.current?.focus());
        }}
        aria-label={label}
        className="mt-1 flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border"
        style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
      >
        <IconPlus width={14} height={14} />
      </button>
    );

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          setDraft("");
          setOpen(false);
        }
      }}
      onBlur={submit}
      aria-label={label}
      className="mt-1 w-full rounded-[8px] border px-2.5 py-[6px] text-[12px] outline-none focus:border-[var(--acc)]"
      style={{ background: "var(--panel)", borderColor: "var(--acc)" }}
    />
  );
}

export default function SystemTreatment({
  rootCauses,
  actions,
  onAddCause,
  onPatchCause,
  onRemoveCause,
  onAddAction,
  onPatchAction,
  onRemoveAction,
}: {
  rootCauses: RootCauseNote[];
  actions: MitigationAction[];
  onAddCause: (cause: string) => void;
  onPatchCause: (id: string, p: Partial<RootCauseNote>) => void;
  onRemoveCause: (id: string) => void;
  onAddAction: (action: string) => void;
  onPatchAction: (id: string, p: Partial<MitigationAction>) => void;
  onRemoveAction: (id: string) => void;
}) {
  return (
    <>
      {/* --------------------------------------------------- root causes */}
      <div className="mt-2.5 mb-1 flex items-center justify-between gap-2">
        <b className="font-display text-[10.5px] font-semibold">Root causes</b>
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {rootCauses.length || ""}
        </span>
      </div>

      {rootCauses.map((r) => (
        <div key={r.id} className="mb-1 flex items-center gap-2">
          <input
            value={r.cause}
            onChange={(e) => onPatchCause(r.id, { cause: e.target.value })}
            aria-label="Root cause"
            className="min-w-0 flex-1 rounded-[8px] border px-2.5 py-[6px] text-[12px] outline-none focus:border-[var(--acc)]"
            style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
          />
          <button
            type="button"
            onClick={() => onRemoveCause(r.id)}
            aria-label={`Remove ${r.cause}`}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
          >
            <IconX width={12} height={12} />
          </button>
        </div>
      ))}

      <AddRow label="Add a root cause" onAdd={onAddCause} />

      {/* ---------------------------------------------- mitigation actions */}
      <div className="mt-3 mb-1 flex items-center justify-between gap-2">
        <b className="font-display text-[10.5px] font-semibold">Mitigation actions</b>
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {actions.length || ""}
        </span>
      </div>

      {actions.map((act) => (
        <div key={act.id} className="mb-1 flex items-center gap-2">
          <input
            value={act.action}
            onChange={(e) => onPatchAction(act.id, { action: e.target.value })}
            aria-label="Mitigation action"
            className="min-w-0 flex-1 rounded-[8px] border px-2.5 py-[6px] text-[12px] outline-none focus:border-[var(--acc)]"
            style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
          />
          <button
            type="button"
            onClick={() => onRemoveAction(act.id)}
            aria-label="Remove this action"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
          >
            <IconX width={12} height={12} />
          </button>
        </div>
      ))}

      <AddRow label="Add a mitigation action" onAdd={onAddAction} />
    </>
  );
}
