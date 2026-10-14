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
 *  A finding takes one of each, and that is right for a finding — one defect,
 *  one reason, one fix. A hazardous event is not one defect, any more than
 *  the asset system it belongs to is. Switchgear rated Unacceptable is
 *  regularly failing for two reasons at once (no maintenance budget AND
 *  nobody competent appointed), and closing it out is three jobs owned by
 *  three people on three timelines. Forcing one of each means the second
 *  reason and the other two jobs get written into a comment where nothing
 *  tracks them, nothing carries them to the next audit, and nothing chases
 *  them.
 *
 *  THE CAUSE VOCABULARY IS ACSA'S. `ROOT_CAUSES` is a closed list from their own
 *  framework and this is not the place to extend it, so the chips are the list
 *  and anything genuinely outside it is typed and recorded as written — never
 *  mapped onto the nearest member, which would quietly report a cause nobody
 *  chose.
 *
 *  NO OWNER, DATE OR STATUS CAPTURED HERE. Sarel: "no other fields like
 *  ownership needed" — this panel is the risk session's own working list of
 *  what is wrong and what has to happen about it, not the place that assigns
 *  and tracks the work. `MitigationAction` still carries `owner`/`dueDate`/
 *  `status` (Finding and Hazard, which reuse the type, still need them), so
 *  a seeded or hand-typed action here simply keeps them at their defaults
 *  ("", "", "Open") until the action is carried further — nothing here reads
 *  or shows them. */

import { useState } from "react";
import { ROOT_CAUSES } from "@/lib/store";
import { Btn, Chip } from "@/components/ui/primitives";
import { IconPlus, IconX } from "@/components/ui/icons";
import type { MitigationAction, RootCauseNote } from "@/lib/types";

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
  const [otherCause, setOtherCause] = useState("");
  const [draftAction, setDraftAction] = useState("");
  const chosen = new Set(rootCauses.map((r) => r.cause));

  const addAction = () => {
    if (!draftAction.trim()) return;
    onAddAction(draftAction.trim());
    setDraftAction("");
  };

  return (
    <>
      {/* --------------------------------------------------- root causes */}
      <div className="mt-4 mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <b className="font-display text-[11px] font-semibold">Root causes</b>
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {rootCauses.length === 0
            ? "none recorded"
            : `${rootCauses.length} recorded`}
        </span>
      </div>
      <p className="mb-2 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-4)" }}>
        More than one is normal — an asset system usually fails for two reasons at once. Tap
        ACSA&rsquo;s causes; anything outside their list goes in the box underneath, as written.
      </p>

      <div className="flex flex-wrap gap-[5px]">
        {ROOT_CAUSES.map((rc) => (
          <Chip
            key={rc}
            selected={chosen.has(rc)}
            onClick={() => {
              /* Tapping a chosen cause takes it off. The list is built by
                 tapping, so it has to be un-buildable the same way. */
              const existing = rootCauses.find((r) => r.cause === rc);
              if (existing) onRemoveCause(existing.id);
              else onAddCause(rc);
            }}
          >
            {rc}
          </Chip>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={otherCause}
          onChange={(e) => setOtherCause(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && otherCause.trim()) {
              onAddCause(otherCause.trim());
              setOtherCause("");
            }
          }}
          placeholder="A cause ACSA's list does not carry…"
          aria-label="A root cause outside ACSA's list"
          className="min-w-0 flex-1 rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        />
        <Btn
          disabled={!otherCause.trim()}
          onClick={() => {
            onAddCause(otherCause.trim());
            setOtherCause("");
          }}
        >
          <IconPlus width={14} height={14} />
          Add cause
        </Btn>
      </div>

      {rootCauses.map((r) => (
        <div
          key={r.id}
          className="mt-1.5 rounded-[11px] border px-3 py-2.5"
          style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
        >
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-[12px] font-semibold">{r.cause}</span>
            <button
              type="button"
              onClick={() => onRemoveCause(r.id)}
              aria-label={`Remove ${r.cause}`}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border"
              style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
            >
              <IconX width={13} height={13} />
            </button>
          </div>
          <input
            value={r.note}
            onChange={(e) => onPatchCause(r.id, { note: e.target.value })}
            placeholder="How it shows up here — optional"
            aria-label={`How ${r.cause} shows up here`}
            className="mt-1.5 w-full rounded-[8px] border px-2.5 py-[7px] text-[11.5px] outline-none focus:border-[var(--acc)]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          />
        </div>
      ))}

      {/* ---------------------------------------------- mitigation actions */}
      <div className="mt-4 mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <b className="font-display text-[11px] font-semibold">Mitigation actions</b>
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {actions.length === 0 ? "none recorded" : `${actions.length} recorded`}
        </span>
      </div>

      {actions.map((act) => (
        <div
          key={act.id}
          className="mb-1.5 rounded-[11px] border px-3 py-2.5"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        >
          <div className="flex items-start gap-2">
            <textarea
              value={act.action}
              onChange={(e) => onPatchAction(act.id, { action: e.target.value })}
              aria-label="Mitigation action"
              className="min-h-[46px] min-w-0 flex-1 resize-y rounded-[8px] border px-2.5 py-[7px] text-[12px] outline-none focus:border-[var(--acc)]"
              style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
            />
            <button
              type="button"
              onClick={() => onRemoveAction(act.id)}
              aria-label="Remove this action"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border"
              style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
            >
              <IconX width={13} height={13} />
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <input
          value={draftAction}
          onChange={(e) => setDraftAction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addAction();
          }}
          placeholder="What has to be done…"
          aria-label="Add a mitigation action"
          className="min-w-0 flex-1 rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        />
        <Btn disabled={!draftAction.trim()} onClick={addAction}>
          <IconPlus width={14} height={14} />
          Add action
        </Btn>
      </div>
    </>
  );
}
