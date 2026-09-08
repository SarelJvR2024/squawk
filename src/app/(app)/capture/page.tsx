"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  checksAt,
  deskAnswered,
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
import { Dot, Empty, Pill } from "@/components/ui/primitives";
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
  /* The asset systems and the checks under them used to be two columns —
     a 210px rail of systems that FILTERED a 298px list of checks. That is a
     hierarchy expressed by making the auditor hold two panels in their head,
     and it cost 508px of a 1280px tablet to say something a tree says in one
     column. Now the systems ARE the list, with their checks nested under
     them, minimised and maximised. `expanded` is what the auditor has opened;
     everything else is shut. */
  const [expanded, setExpanded] = useState<string[]>([]);
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
    () => checksOf(entityCode, discipline).filter(needsDesk),
    [entityCode, discipline]
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

  /* Save & next walks the WHOLE discipline, not the open group — the tree
     decides what is on the screen, never what is next. So when the walk
     crosses into a system that is shut, the tree opens it, reconciled during
     render like the deep link above rather than in an effect that would paint
     the closed group first and correct it a frame later.

     It fires on the system CHANGING, so an auditor who shuts the group they
     are working in keeps it shut; it opens again when the walk leaves that
     system and comes back. */
  const [autoOpened, setAutoOpened] = useState<string | null>(null);
  if (active && active.system !== autoOpened) {
    setAutoOpened(active.system);
    if (!expanded.includes(active.system)) setExpanded([...expanded, active.system]);
  }

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

  /* The colour is the ANSWER; whether the dot is filled is whether it is
     SAVED. An answered-but-unsaved check used to look exactly like one nobody
     had opened, and an answer that is never saved is an answer that never
     happened. */
  const answerTone = (c: Check) => {
    const r = responses[c.id];
    return r?.compliance === "NC"
      ? ("bad" as const)
      : r?.compliance === "C"
        ? ("good" as const)
        : r?.compliance === "NV"
          ? ("warn" as const)
          : ("neutral" as const);
  };
  const dotTone = (c: Check) => {
    const r = responses[c.id];
    if (!deskDone(r) && !deskAnswered(r)) return "pending" as const;
    return answerTone(c);
  };
  const dotHollow = (c: Check) => deskAnswered(responses[c.id]);
  const unsaved = visible.filter((c) => deskAnswered(responses[c.id])).length;

  /* The tree: the site's systems, in register order, carrying whichever of
     their checks the filter left standing. A system the filter empties is not
     shown at all — an "Electrical Reticulation (0)" that opens onto nothing is
     a row that only wastes a press. */
  const groups = useMemo(() => {
    const by = new Map<string, Check[]>();
    for (const c of visible) {
      const list = by.get(c.system);
      if (list) list.push(c);
      else by.set(c.system, [c]);
    }
    return systemsOf(entityCode, discipline)
      .filter((sys) => by.has(sys))
      .map((sys) => ({ sys, checks: by.get(sys)! }));
  }, [visible, entityCode, discipline]);

  return (
    <>
      {/* navigator — one column: the filter, the discipline, and the asset
          systems with their checks nested under them.

          It replaces two: a 210px rail of systems that filtered a 298px list
          of checks. The hierarchy was real but implicit — you inferred it by
          watching the second column change when you pressed something in the
          first — and it cost 508px of a 1280px tablet. Nested, it is explicit,
          it shuts, and the check itself gets the ~210px back.

          It also starts at md rather than lg, so a 768px tablet can finally
          change discipline: the select lived in the lg-only rail, and below
          that width there was no way to leave the discipline you landed on. */}
      <div
        className="hidden w-[290px] shrink-0 flex-col overflow-y-auto border-r md:flex"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div
          className="sticky top-0 z-[5] border-b px-[9px] pt-[9px] pb-[8px]"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div className="mb-[7px] flex flex-wrap gap-1">
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

          <select
            aria-label="Discipline"
            value={discipline}
            onChange={(e) => {
              setDiscipline(e.target.value);
              /* A new discipline has different systems, so nothing that was
                 open is meaningful any more. The reconcile above opens the
                 group holding whatever check the new discipline lands on. */
              setExpanded([]);
              setAutoOpened(null);
              setActiveId(null);
            }}
            className="w-full rounded-[8px] border px-2 py-[7px] text-[11.5px] outline-none"
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

          <div className="mt-[7px] flex items-start justify-between gap-2">
            <div className="text-[10px]" style={{ color: "var(--ink-3)" }}>
              {visible.filter((c) => deskDone(responses[c.id])).length} desk done ·{" "}
              {visible.filter((c) => !deskDone(responses[c.id])).length} open
              {/* Called out in the warn colour rather than folded into "open":
                  these are answered and one press from done, which is a
                  different piece of work from a check nobody has looked at. */}
              {unsaved > 0 && (
                <>
                  {" · "}
                  <b style={{ color: "var(--warn)" }}>{unsaved} to save</b>
                </>
              )}
            </div>
            <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
              {visible.length}
            </span>
          </div>
        </div>

        {groups.length === 0 ? (
          <Empty>
            <IconInbox width={26} height={26} />
            <div>Nothing matches this filter.</div>
          </Empty>
        ) : (
          groups.map(({ sys, checks }) => {
            /* The system's progress counts every desk check it has, not the
               ones this filter left standing — "3/8" that changes meaning when
               you press NC is not progress, it is arithmetic about a filter. */
            const all = checksOf(entityCode, discipline, sys).filter(needsDesk);
            const done = all.filter((c) => deskDone(responses[c.id])).length;
            const nc = all.filter((c) => responses[c.id]?.compliance === "NC").length;
            const pf = priorFor(entityCode, discipline, sys);
            const open = expanded.includes(sys);
            const holds = active?.system === sys;
            const pct = all.length ? (done / all.length) * 100 : 0;
            return (
              /* Named in the DOM, because a system is a container now rather
                 than a filter: "click the system, then the check under it" is
                 two presses on two different kinds of row, and a test that
                 matches them by their text alone matches the wrong one. */
              <div key={sys} data-system={sys}>
                <button
                  onClick={() =>
                    setExpanded(open ? expanded.filter((x) => x !== sys) : [...expanded, sys])
                  }
                  aria-expanded={open}
                  title={`${sys} — ${done} of ${all.length} done${nc > 0 ? `, ${nc} non-compliant` : ""}${
                    pf ? `, carries ${pf.key} from the last visit` : ""
                  }`}
                  className="relative flex w-full items-center gap-[5px] overflow-hidden border-b px-[9px] py-[7px] text-left transition-[var(--t)]"
                  style={{
                    borderColor: "var(--line)",
                    background: holds ? "var(--acc-soft)" : "transparent",
                    color: holds ? "var(--acc)" : "var(--ink-2)",
                  }}
                >
                  {/* The row says open or shut in words to a screen reader —
                      aria-expanded — so the triangle is decoration. */}
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-mono text-[8px] leading-none"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {open ? "▼" : "▶"}
                  </span>
                  <b className="min-w-0 flex-1 truncate text-[11px] font-semibold">{sys}</b>
                  {pf && <Pill tone={RATING_TONE[pf.rating]}>{pf.key}</Pill>}
                  <span
                    className="shrink-0 font-mono text-[9px]"
                    style={{ color: holds ? "var(--acc)" : "var(--ink-4)" }}
                  >
                    {done}/{all.length}
                    {nc > 0 && ` · ${nc}NC`}
                  </span>
                  {/* The track, as the row's own underline — the same
                      information the stacked card carried, in none of the
                      height. */}
                  <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: "var(--line-2)" }}>
                    <span
                      className="block h-full"
                      style={{ width: `${pct}%`, background: holds ? "var(--acc)" : "var(--good)" }}
                    />
                  </span>
                </button>

                {open &&
                  checks.map((c) => {
                    const on = c.id === active?.id;
                    return (
                      <button
                        key={c.id}
                        data-check={c.id}
                        onClick={() => setActiveId(c.id)}
                        className="relative flex w-full items-start gap-2 border-b py-[8px] pr-[11px] pl-[20px] text-left transition-[background_var(--t)]"
                        style={{
                          borderColor: "var(--line)",
                          background: on ? "var(--acc-soft)" : "transparent",
                        }}
                      >
                        {on && (
                          <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: "var(--acc)" }} />
                        )}
                        <Dot
                          tone={dotTone(c)}
                          hollow={dotHollow(c)}
                          label={
                            dotHollow(c)
                              ? "Answered, not saved"
                              : deskDone(responses[c.id])
                                ? "Saved"
                                : "Not answered"
                          }
                        />
                        <span className="min-w-0 flex-1">
                          {/* The system is the group header now, so the row
                              spends its width on the requirement instead of
                              repeating it. */}
                          <span className="block truncate font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            {portalIdFor(entityCode, c.id)}
                          </span>
                          <span className="mt-[1px] block truncate text-[11.5px]">{c.requirement}</span>
                        </span>
                      </button>
                    );
                  })}
              </div>
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
          className="toast-bottom fixed left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-[11px] px-[15px] py-2.5 text-[12px] font-medium"
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
