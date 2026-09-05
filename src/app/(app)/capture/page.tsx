"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CHECKS,
  DISCIPLINES,
  checksOf,
  priorFor,
  systemsOf,
  useStore,
} from "@/lib/store";
import CheckDetail from "@/components/CheckDetail";
import { Dot, Empty, Pill, Track } from "@/components/ui/primitives";
import { IconInbox } from "@/components/ui/icons";
import type { Check } from "@/lib/types";

type Filter = "all" | "open" | "nc" | "pf";

const RATING_TONE = {
  Unacceptable: "bad",
  Tolerable: "warn",
  Acceptable: "good",
  "Not audited": "neutral",
} as const;

function CaptureInner() {
  const params = useSearchParams();
  const responses = useStore((s) => s.responses);

  const [discipline, setDiscipline] = useState<string>(DISCIPLINES[0]);
  const [system, setSystem] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* deep link from the command palette */
  useEffect(() => {
    const id = params.get("check");
    if (!id) return;
    const c = CHECKS.find((x) => x.id === id);
    if (!c) return;
    setDiscipline(c.discipline);
    setSystem(c.system);
    setFilter("all");
    setActiveId(c.id);
  }, [params]);

  const visible = useMemo(() => {
    let list = checksOf(discipline, system);
    if (filter === "open") list = list.filter((c) => !responses[c.id]?.captured);
    if (filter === "nc") list = list.filter((c) => responses[c.id]?.compliance === "NC");
    if (filter === "pf") list = list.filter((c) => c.pf);
    return list;
  }, [discipline, system, filter, responses]);

  const active: Check | undefined =
    visible.find((c) => c.id === activeId) ?? visible[0];

  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
  }, [active, activeId]);

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
    if (!r?.captured) return "pending" as const;
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
          {([["all", "All"], ["open", "Open"], ["nc", "NC"], ["pf", "2025"]] as [Filter, string][]).map(
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
          value={discipline}
          onChange={(e) => {
            setDiscipline(e.target.value);
            setSystem(null);
            setActiveId(null);
          }}
          className="mb-3 w-full rounded-[8px] border px-2 py-[7px] text-[11.5px] outline-none"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        >
          {DISCIPLINES.map((d) => {
            const cs = checksOf(d);
            const done = cs.filter((c) => responses[c.id]?.captured).length;
            return (
              <option key={d} value={d}>
                {d} — {done}/{cs.length}
              </option>
            );
          })}
        </select>

        <div className="label-xs flex justify-between px-2 pt-1 pb-1.5">
          <span>Asset systems</span>
          <span>{systemsOf(discipline).length}</span>
        </div>
        {systemsOf(discipline).map((sys) => {
          const cs = checksOf(discipline, sys);
          const done = cs.filter((c) => responses[c.id]?.captured).length;
          const nc = cs.filter((c) => responses[c.id]?.compliance === "NC").length;
          const pf = priorFor(discipline, sys);
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
                {pf && <Pill tone={RATING_TONE[pf.rating]}>{pf.pf}</Pill>}
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
            {visible.filter((c) => responses[c.id]?.captured).length} captured ·{" "}
            {visible.filter((c) => !responses[c.id]?.captured).length} open
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
            const pf = c.pf ? priorFor(c.discipline, c.system) : null;
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
                    {c.id} · {c.system}
                  </span>
                  <span className="mt-[1px] block truncate text-[11.5px]">{c.requirement}</span>
                </span>
                {pf && <span className="mt-[2px]"><Pill tone={RATING_TONE[pf.rating]}>{c.pf}</Pill></span>}
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
