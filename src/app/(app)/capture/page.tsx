"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  checksAt,
  disciplinesAt,
  checksOf,
  priorFor,
  systemsOf,
  useEntityCode,
  useResponses,
  deskDone,
} from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import { needsDesk, needsQuestion } from "@/lib/verification";
import CheckDetail from "@/components/CheckDetail";
import { Dot, Empty, Pill, Track } from "@/components/ui/primitives";
import { IconInbox } from "@/components/ui/icons";
import type { Check } from "@/lib/types";

type Filter = "all" | "open" | "q" | "nc" | "pf";

const RATING_TONE = {
  Unacceptable: "bad",
  Tolerable: "warn",
  Acceptable: "good",
  "Not audited": "neutral",
} as const;

function CaptureInner() {
  const params = useSearchParams();
  const responses = useResponses();
  const entityCode = useEntityCode();
  /* This site's disciplines, not the register's. Corporate Office has no Civil
     work at all — offering the tab would be offering an empty audit. */
  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);

  const [picked, setDiscipline] = useState<string>(disciplines[0]);
  /* Derived, not corrected in an effect: switching to a site that does not have
     the discipline in view falls back on the same render rather than painting a
     rail tab with nothing behind it and fixing it a render later. */
  const discipline = disciplines.includes(picked) ? picked : disciplines[0];
  const [system, setSystem] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* Deep link from the command palette.
     
     Reconciled DURING RENDER rather than in an effect. React re-runs the
     component immediately without committing, so the workspace paints once, on
     the linked check — an effect painted the old check first and corrected it a
     frame later, which on a tablet is a visible flash of the wrong row.
     `linkedTo` remembers which link has been honoured, so an auditor who
     navigates away afterwards is not dragged back to it on every render. */
  const linked = params.get("check");
  const [linkedTo, setLinkedTo] = useState<string | null>(null);
  if (linked && linked !== linkedTo) {
    setLinkedTo(linked);
    const c = checksAt(entityCode).find((x) => x.id === linked);
    if (c) {
      setDiscipline(c.discipline);
      setSystem(c.system);
      setFilter("all");
      setActiveId(c.id);
    }
  }

  /* The audit workspace lists what a desk can actually progress — a check to
     ask about or collect a document for. The nine checks whose only mode is
     Site Physical Verification have no question and no evidence to gather, so
     they belong on the tablet and nowhere else; listing them here was handing
     an auditor rows they could not answer without leaving the room. See
     src/lib/verification.ts. */
  const deskChecks = useMemo(
    () => checksOf(entityCode, discipline, system).filter(needsDesk),
    [entityCode, discipline, system]
  );


  const visible = useMemo(() => {
    let list = deskChecks;
    if (filter === "open") list = list.filter((c) => !deskDone(responses[c.id]));
    if (filter === "nc") list = list.filter((c) => responses[c.id]?.compliance === "NC");
    if (filter === "pf")
      list = list.filter((c) => !!priorFor(entityCode, c.discipline, c.system));
    if (filter === "q") list = list.filter(needsQuestion);
    return list;
  }, [deskChecks, filter, responses, entityCode]);

  /* `activeId` is READ in exactly one place — here — and everything downstream
     uses `active`. An effect used to copy the fallback back into `activeId`,
     which was a cascading render doing no work.

     It also had a cost. Filtering a check out of view snapped `activeId` to the
     top of the list permanently, so clearing the filter left you at the top
     instead of back on the check you were working on. Now the id survives the
     filter and the fallback is purely a display choice. */
  const active: Check | undefined =
    visible.find((c) => c.id === activeId) ?? visible[0];

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const move = (delta: number) => {
    if (!active) return;
    const i = visible.findIndex((c) => c.id === active.id);
    const next = visible[i + delta];
    if (next) setActiveId(next.id);
  };

  const dotTone = (c: Check) => {
    const r = responses[c.id];
    if (!deskDone(r)) return "pending" as const;
    return r.compliance === "NC"
      ? ("bad" as const)
      : r.compliance === "C"
        ? ("good" as const)
        : r.compliance === "NV"
          ? ("warn" as const)
          : ("neutral" as const);
  };

  return (
    <>
      {/* rail — disciplines and asset systems */}
      <aside
        className="hidden w-[210px] shrink-0 overflow-y-auto border-r px-[9px] pt-[11px] pb-6 lg:block"
        style={{ background: "var(--rail)", borderColor: "var(--line)" }}
      >
        <div className="mb-2 flex flex-wrap gap-1 px-[2px]">
          {([["all", "All"], ["open", "Open"], ["q", "Ask"], ["nc", "NC"], ["pf", "2025"]] as [Filter, string][]).map(
            ([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className="whitespace-nowrap rounded-full border px-[9px] py-[4px] text-[10.5px] transition-[var(--t)]"
                style={
                  filter === k
                    ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                    : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                }
              >
                {label}
              </button>
            )
          )}
        </div>

        <div className="label-xs px-2 pt-2 pb-1.5">Discipline</div>
        <select
          aria-label="Discipline"
          value={discipline}
          onChange={(e) => {
            setDiscipline(e.target.value);
            setSystem(null);
            setActiveId(null);
          }}
          className="mb-3 w-full rounded-[8px] border px-2 py-[7px] text-[11.5px] outline-none"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        >
          {disciplines.map((d) => {
            const cs = checksOf(entityCode, d).filter(needsDesk);
            const done = cs.filter((c) => deskDone(responses[c.id])).length;
            return (
              <option key={d} value={d}>
                {d} — {done}/{cs.length}
              </option>
            );
          })}
        </select>

        <div className="label-xs flex justify-between px-2 pt-1 pb-1.5">
          <span>Asset systems</span>
          <span>{systemsOf(entityCode, discipline).length}</span>
        </div>
        {systemsOf(entityCode, discipline).map((sys) => {
          const cs = checksOf(entityCode, discipline, sys).filter(needsDesk);
          const done = cs.filter((c) => deskDone(responses[c.id])).length;
          const nc = cs.filter((c) => responses[c.id]?.compliance === "NC").length;
          const pf = priorFor(entityCode, discipline, sys);
          const on = system === sys;
          return (
            <button
              key={sys}
              onClick={() => {
                setSystem(on ? null : sys);
                setActiveId(null);
              }}
              className="relative mb-[1px] w-full rounded-[11px] border px-[9px] py-2 text-left transition-[var(--t)]"
              style={{
                background: on ? "var(--panel)" : "transparent",
                borderColor: on ? "var(--line)" : "transparent",
                boxShadow: on ? "var(--e1)" : "none",
              }}
            >
              {on && (
                <span
                  className="absolute top-[9px] bottom-[9px] left-0 w-[2.5px] rounded-[2px]"
                  style={{ background: "var(--acc)" }}
                />
              )}
              <div className="mb-1.5 flex items-center justify-between gap-1.5">
                <b className="text-[11.5px] font-semibold">{sys}</b>
                {pf && <Pill tone={RATING_TONE[pf.rating]}>{pf.key}</Pill>}
              </div>
              <Track pct={cs.length ? (done / cs.length) * 100 : 0} />
              <div className="mt-[5px] font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                {done}/{cs.length}
                {nc > 0 && ` · ${nc} NC`}
              </div>
            </button>
          );
        })}
      </aside>

      {/* check list */}
      <div
        className="hidden w-[298px] shrink-0 flex-col overflow-y-auto border-r md:flex"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div
          className="sticky top-0 z-[5] border-b px-[11px] py-[9px]"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div className="flex items-center justify-between font-display text-[12px] font-bold">
            <span>{system ?? discipline}</span>
            <span className="font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
              {visible.length}
            </span>
          </div>
          <div className="mt-[2px] text-[10px]" style={{ color: "var(--ink-3)" }}>
            {visible.filter((c) => deskDone(responses[c.id])).length} desk done ·{" "}
            {visible.filter((c) => !deskDone(responses[c.id])).length} open
          </div>
        </div>

        {visible.length === 0 ? (
          <Empty>
            <IconInbox width={26} height={26} />
            <div>Nothing matches this filter.</div>
          </Empty>
        ) : (
          visible.map((c) => {
            const on = c.id === active?.id;
            const pf = priorFor(entityCode, c.discipline, c.system);
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className="relative flex w-full items-start gap-2 border-b px-[11px] py-[9px] text-left transition-[background_var(--t)]"
                style={{
                  borderColor: "var(--line)",
                  background: on ? "var(--acc-soft)" : "transparent",
                }}
              >
                {on && <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: "var(--acc)" }} />}
                <Dot tone={dotTone(c)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {portalIdFor(entityCode, c.id)} · {c.system}
                  </span>
                  <span className="mt-[1px] block truncate text-[11.5px]">{c.requirement}</span>
                </span>
                {pf && <span className="mt-[2px]"><Pill tone={RATING_TONE[pf.rating]}>{pf.key}</Pill></span>}
              </button>
            );
          })
        )}
      </div>

      {/* detail */}
      {active ? (
        <CheckDetail
          key={active.id}
          check={active}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onSaved={setToast}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Empty>
            <IconInbox width={26} height={26} />
            <div>Select a check.</div>
          </Empty>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-[22px] left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-[11px] px-[15px] py-2.5 text-[12px] font-medium"
          style={{ background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--e3)" }}
        >
          {toast}
        </div>
      )}
    </>
  );
}

export default function CapturePage() {
  return (
    <Suspense fallback={<div className="p-6 text-[12px]">Loading…</div>}>
      <CaptureInner />
    </Suspense>
  );
}
