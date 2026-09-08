"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checksAt,
  disciplinesAt,
  useEntityCode,
  useResponses,
  useStore,
  useVisitFindings,
} from "@/lib/store";
import { assist, findingContext } from "@/lib/assist";
import { BAND_META, bandFor, cellCode } from "@/lib/risk";
import { duplicateFindings } from "@/lib/merge";
import { Btn, Dot, Empty, Panel, Pill } from "@/components/ui/primitives";
import RecordActions from "@/components/RecordActions";
import StickyActions from "@/components/StickyActions";
import RootCauseAdvice from "@/components/RootCauseAdvice";
import { IconCheck, IconInbox, IconLeft, IconLoop } from "@/components/ui/icons";
import type { Finding } from "@/lib/types";

type Filter = "all" | "unrated" | "open" | "repeat";

export default function FindingsPage() {
  const router = useRouter();
  const findings = useVisitFindings();
  const entityCode = useEntityCode();
  const responses = useResponses();
  const updateFinding = useStore((s) => s.updateFinding);
  const addFindingProgress = useStore((s) => s.addFindingProgress);

  const [filter, setFilter] = useState<Filter>("all");
  const [discipline, setDiscipline] = useState<string>("All");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const list = useMemo(() => {
    let l = findings;
    if (discipline !== "All") l = l.filter((f) => f.discipline === discipline);
    if (filter === "unrated") l = l.filter((f) => !f.ratingConfirmed);
    if (filter === "open") l = l.filter((f) => f.actionStatus !== "Closed");
    if (filter === "repeat") l = l.filter((f) => f.priorRating);
    return l;
  }, [findings, filter, discipline]);

  /* ONE DEFECT COUNTED TWICE reaches ACSA as two.

     Two auditors who both tap the same issue button on the same check each
     mint a finding with its own random id, and the merge — which keys on id —
     keeps both. Over the shared record that happens silently: the merge report
     is only shown for a file merge, so nothing would ever say it out loud.

     Flagged, never folded together. The same button is legitimately raised
     twice — one per switch room — and the asset tags are how they are told
     apart. */
  const duplicateOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of duplicateFindings(findings)) {
      for (const id of d.ids) m.set(id, d.ids.filter((x) => x !== id));
    }
    return m;
  }, [findings]);

  const active: Finding | undefined = list.find((f) => f.id === activeId) ?? list[0];

  /* A rating seeded by an issue button is a suggestion. It counts only
     once the group has clicked the cell they agree on. */
  const rated = findings.filter((f) => f.ratingConfirmed).length;
  const red = findings.filter(
    (f) => f.ratingConfirmed && bandFor(f.severity, f.likelihood) === "Red"
  ).length;
  const missing = findings.filter((f) => !f.owner || !f.dueDate).length;

  if (findings.length === 0) {
    return (
      /* The empty state is an early return, so it does not get the scroller's
         padding — and its "Go to capture" button is the only thing on the
         screen. It has to clear the bottom bar like everything else. */
      <div className="app-scroll flex flex-1 items-center justify-center p-8">
        <Empty>
          <IconInbox width={28} height={28} />
          <div className="max-w-[46ch]">
            <b className="mb-1 block font-display text-[14px]" style={{ color: "var(--ink)" }}>
              No findings raised yet
            </b>
            Findings appear here the moment an issue button is tapped in capture, or a new
            finding is created in the field.
          </div>
          <Btn className="mt-2" onClick={() => router.push("/capture")}>
            Go to capture
          </Btn>
        </Empty>
      </div>
    );
  }

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 pb-16">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold">Findings register</h2>
            <p className="mt-1 max-w-[78ch] text-[12.5px]" style={{ color: "var(--ink-2)" }}>
              Rated together as a group against ACSA&apos;s own B170 001M matrix. Anything still open at
              the out-brief becomes a prior finding for the next visit.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              className="rounded-[9px] border px-2.5 py-[7px] text-[12px]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            >
              <option>All</option>
              {disciplinesAt(entityCode).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <div className="flex gap-[2px] rounded-[11px] p-[3px]" style={{ background: "var(--sunken)" }}>
              {(["all", "unrated", "open", "repeat"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="rounded-[8px] px-3 py-[6px] font-display text-[11.5px] font-semibold capitalize transition-[var(--t)]"
                  style={{
                    background: filter === f ? "var(--panel)" : "transparent",
                    color: filter === f ? "var(--acc)" : "var(--ink-2)",
                    boxShadow: filter === f ? "var(--e1)" : "none",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-[9px] md:grid-cols-4">
          {[
            ["Findings raised", findings.length, "bad"],
            ["Rated", `${rated}/${findings.length}`, "acc"],
            ["Red band", red, "bad"],
            ["Missing owner or date", missing, missing ? "warn" : "good"],
          ].map(([label, value, tone]) => (
            <div
              key={label as string}
              className="relative overflow-hidden rounded-[15px] border px-[15px] py-[13px]"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <span className="absolute inset-x-0 top-0 h-[2.5px]" style={{ background: `var(--${tone})` }} />
              <b className="block font-mono text-[23px] leading-[1.15] font-semibold tnum" style={{ color: `var(--${tone})` }}>
                {value as string}
              </b>
              <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                {label as string}
              </span>
            </div>
          ))}
        </div>

        <Panel tone="accent" className="mb-3.5">
          <div className="flex items-start gap-2.5 text-[11.5px]" style={{ color: "var(--acc)" }}>
            <IconLoop width={14} height={14} style={{ marginTop: 1 }} />
            <span>
              Every action left open at the out-brief carries to <b>March 2027</b> with its owner, due
              date and evidence trail intact.
            </span>
          </div>
        </Panel>

        <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-[15px] border" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
            {list.length === 0 ? (
              <Empty>Nothing matches this filter.</Empty>
            ) : (
              list.map((f) => {
                const band = bandFor(f.severity, f.likelihood);
                const on = f.id === active?.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setActiveId(f.id)}
                    className="relative flex w-full items-start gap-2 border-b px-[11px] py-[9px] text-left transition-[var(--t)]"
                    style={{ borderColor: "var(--line)", background: on ? "var(--acc-soft)" : "transparent" }}
                  >
                    {on && <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: "var(--acc)" }} />}
                    <Dot
                      tone={band === "Red" ? "bad" : band === "Amber" ? "warn" : band === "Green" ? "good" : "pending"}
                      label={band ?? "Not rated"}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {f.id} · {f.discipline}
                        {f.adHoc ? " · ad-hoc" : ""}
                      </span>
                      {/* In the row, not behind a panel: this is the moment the
                          two are side by side in a list, which is where a
                          person can actually settle it. */}
                      {duplicateOf.has(f.id) && (
                        <span
                          className="mt-[2px] block truncate font-mono text-[9px] font-semibold"
                          style={{ color: "var(--warn)" }}
                        >
                          also raised as {duplicateOf.get(f.id)!.join(", ")} — same issue, same check
                        </span>
                      )}
                      <span className="mt-[1px] block truncate text-[11.5px]">{f.description}</span>
                    </span>
                    {band && (
                      <span className="mt-[2px]">
                        <Pill tone={BAND_META[band].tone}>{cellCode(f.severity, f.likelihood)}</Pill>
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {active && (
            <div className="rounded-[15px] border p-[18px]" style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "var(--e2)" }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-[7px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                <span>{active.id}</span>
                <span>·</span>
                <span>{active.discipline}</span>
                <span>·</span>
                <span>{active.system}</span>
                {active.priorRating && <Pill tone="bad">REPEAT — MAR 2025 {active.priorRating.toUpperCase()}</Pill>}
                {active.adHoc && <Pill tone="accent">AD-HOC</Pill>}
                {active.checkId && (
                  <button
                    onClick={() => router.push(`/capture?check=${active.checkId}`)}
                    className="underline"
                    style={{ color: "var(--acc)" }}
                  >
                    {active.checkId}
                  </button>
                )}
              </div>
              <h3 className="mb-3 text-[14.5px] leading-[1.35] font-bold">{active.description}</h3>

              {/* One rating and treatment block, shared with the hazard
                  register. See src/components/RecordActions.tsx — a second copy
                  of a risk matrix is how two screens end up carrying two
                  vocabularies for one instrument. */}
              <RecordActions
                record={active}
                entityCode={entityCode}
                onChange={(patch) => updateFinding(active.id, patch)}
                onToast={say}
                progress={active.progress}
                onProgress={(n) => addFindingProgress(active.id, n)}
                secondOpinion={async () => {
                  const check = checksAt(entityCode).find((c) => c.id === active.checkId);
                  return assist("rating", findingContext(active, check));
                }}
                advice={
                  /* Same component as the check screen. Some findings are
                     worked here rather than at the check, and the advice must
                     not differ depending on which screen the auditor opened. */
                  <RootCauseAdvice
                    finding={active}
                    check={active.checkId ? checksAt(entityCode).find((c) => c.id === active.checkId) : undefined}
                    attachments={active.checkId ? (responses[active.checkId]?.attachments ?? []) : []}
                    onPick={(rc) => updateFinding(active.id, { rootCause: rc })}
                  />
                }
              />


              {/* Pinned, not parked at the end of a two-screen form. See
                  StickyActions — this button used to sit below the fold before
                  the auditor had scrolled at all. */}
              <StickyActions
                state={
                  <>
                    {active.ratingConfirmed ? "rated" : "unrated — counts nowhere yet"}
                    {" · "}
                    {active.actionStatus === "Closed"
                      ? "closed, no re-check needed"
                      : "carries to the next audit"}
                    {!active.owner && " · ⚠ no owner"}
                    {!active.dueDate && " · ⚠ no target date"}
                  </>
                }
              >
                <Btn
                  onClick={() => {
                    const i = list.findIndex((f) => f.id === active.id);
                    const prev = list[i - 1];
                    if (prev) setActiveId(prev.id);
                  }}
                  disabled={list.findIndex((f) => f.id === active.id) === 0}
                >
                  <IconLeft width={14} height={14} />
                  Previous
                </Btn>
                <Btn
                  variant="primary"
                  onClick={() => {
                    const i = list.findIndex((f) => f.id === active.id);
                    const next = list[i + 1];
                    setActiveId(next?.id ?? active.id);
                    say(next ? `${active.id} saved · ${next.id}` : `${active.id} saved · last one`);
                  }}
                >
                  <IconCheck width={14} height={14} />
                  Save &amp; next
                </Btn>
              </StickyActions>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div
          className="toast-bottom fixed left-1/2 z-[100] -translate-x-1/2 rounded-[11px] px-[15px] py-2.5 text-[12px] font-medium"
          style={{ background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--e3)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
