"use client";

/** THE ASSET SYSTEM ASSESSMENT — the rating ACSA actually publishes.
 *
 *  Sarel: "on this page we are going to do the rating of the asset systems. We
 *  can again use the same hierarchy which is in the checks page; in the
 *  hierarchy we only have discipline and asset system. Per asset system we add
 *  icons in the hierarchy for severity, likelihood and rating. In the right hand
 *  panel we include a list of all open findings from previous audit, and the
 *  current audit checks compliant and non compliant ones and the inspections to
 *  give us the full view of the asset system. At the top of the panel we need to
 *  be able to record the likelihood and severity and the system must calculate
 *  the rating and strategy. We also need to be able to capture multiple root
 *  causes, multiple mitigation actions."
 *
 *  This screen was the findings register: a flat list of findings, each rated on
 *  its own. That work still exists — a finding still carries its own band, its
 *  own root cause and its own owner — and it opens from the evidence list here,
 *  in a sheet (see FindingDetail). What changed is what the screen is ABOUT.
 *
 *  WHY THE ASSET SYSTEM AND NOT THE FINDING. ACSA rates, reports and compares
 *  asset systems year on year: that is the row in their register, the unit a
 *  Cluster report is written about, and the number a station manager is asked to
 *  explain. Squawk rated findings and hazards and had no rating at all on the
 *  thing ACSA publishes, so an asset system's band was something a reader
 *  inferred from the worst finding under it. Inferring it is wrong twice:
 *  three Amber findings on one system is not an Amber system, and a system with
 *  no findings is not automatically Green — it may simply not have been looked
 *  at, which is a different and worse fact.
 *
 *  SO NOTHING HERE IS COMPUTED FROM THE FINDINGS. The band comes from a cell the
 *  group taps on B170 001M, and `ratingConfirmed` gates it like every other
 *  rating in this product. The findings, the checks and the walk items are
 *  EVIDENCE the group reads before agreeing that cell, which is why the panel
 *  shows all of them, compliant ones included — a system whose checks all passed
 *  and whose 2025 finding is still open is a real and common shape, and only
 *  seeing both halves makes it visible.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  checksAt,
  priorFor,
  useAdhoc,
  useEntity,
  useEntityCode,
  useResponses,
  useStore,
  useSystems,
  useVisitFindings,
  fieldDone,
} from "@/lib/store";
import { useOutstanding, carriesWork } from "@/lib/carryforward";
import { portalIdFor } from "@/lib/sites";
import { BAND_META, bandFor, cellCode } from "@/lib/risk";
import { Btn, Empty, Pill } from "@/components/ui/primitives";
import type { Tone } from "@/components/ui/primitives";
import GroupRow from "@/components/ui/GroupRow";
import Sheet from "@/components/ui/Sheet";
import RecordActions from "@/components/RecordActions";
import FindingDetail from "@/components/FindingDetail";
import SystemTreatment from "@/components/SystemTreatment";
import { IconInbox, IconSearch } from "@/components/ui/icons";
import type { Check, Finding } from "@/lib/types";

const NO_SYSTEM = "No asset system recorded";

export default function FindingsPage() {
  const entityCode = useEntityCode();
  const entity = useEntity();
  const findings = useVisitFindings();
  const responses = useResponses();
  const adhocItems = useAdhoc();
  const systems = useSystems();
  const outstanding = useOutstanding();
  const patchSystem = useStore((s) => s.patchSystem);
  const systemAssessment = useStore((s) => s.systemAssessment);

  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  /* WHERE A STICKY GROUP HEADER HAS TO STOP. Same measurement the Inspection
     screen makes and for the same reason: a header sticky at top 0 under a bar
     that is also sticky at top 0 slides underneath it and is invisible for
     exactly as long as it is meant to be useful. */
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setBarH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* EVERY ASSET SYSTEM AT THIS SITE, from the register rather than from what
     happens to carry a finding. A system with nothing against it still has to
     be rateable — "we looked and it was sound" is a finding of the audit, and a
     system that never appears cannot be given one. */
  const tree = useMemo(() => {
    const checks = checksAt(entityCode);
    const byDiscipline = new Map<string, Map<string, Check[]>>();
    for (const c of checks) {
      const sys = c.system?.trim() || NO_SYSTEM;
      let m = byDiscipline.get(c.discipline);
      if (!m) byDiscipline.set(c.discipline, (m = new Map()));
      const list = m.get(sys);
      if (list) list.push(c);
      else m.set(sys, [c]);
    }
    const s = q.trim().toLowerCase();
    return [...byDiscipline.entries()]
      .map(([discipline, m]) => ({
        discipline,
        systems: [...m.entries()]
          .map(([system, checks]) => ({ system, checks }))
          .filter(
            (x) =>
              !s ||
              `${x.system} ${discipline}`.toLowerCase().includes(s) ||
              x.checks.some((c) => c.requirement?.toLowerCase().includes(s))
          )
          .sort((a, b) =>
            a.system === NO_SYSTEM ? 1 : b.system === NO_SYSTEM ? -1 : a.system.localeCompare(b.system)
          ),
      }))
      .filter((d) => d.systems.length > 0)
      .sort((a, b) => a.discipline.localeCompare(b.discipline));
  }, [entityCode, q]);

  /* A search opens everything it matched. Shut groups showing nothing reads as
     "no results" and is the worst possible answer, because it is wrong. */
  const searching = q.trim().length > 0;
  const isOpen = (key: string) => searching || expanded.includes(key);
  const toggle = (key: string) =>
    setExpanded((e) => (e.includes(key) ? e.filter((x) => x !== key) : [...e, key]));

  /* Findings raised THIS visit, per asset system. */
  const findingsBySystem = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of findings) {
      const k = `${f.discipline}|${f.system?.trim() || NO_SYSTEM}`;
      const l = m.get(k);
      if (l) l.push(f);
      else m.set(k, [f]);
    }
    return m;
  }, [findings]);

  /* Still open from an earlier audit, per asset system. Scoped with carriesWork
     so an item rated Acceptable in 2025 — which required no mitigation, so
     there is nothing to verify — is not counted as work the system carries. */
  const priorBySystem = useMemo(() => {
    const m = new Map<string, typeof outstanding>();
    for (const p of outstanding.filter(carriesWork)) {
      const k = `${p.discipline}|${p.system?.trim() || NO_SYSTEM}`;
      const l = m.get(k);
      if (l) l.push(p);
      else m.set(k, [p]);
    }
    return m;
  }, [outstanding]);

  const walkBySystem = useMemo(() => {
    const m = new Map<string, typeof adhocItems>();
    for (const it of adhocItems) {
      const k = `${it.discipline ?? ""}|${it.system?.trim() || NO_SYSTEM}`;
      const l = m.get(k);
      if (l) l.push(it);
      else m.set(k, [it]);
    }
    return m;
  }, [adhocItems]);

  /* A plain lookup, not a memo. It is two array scans over a tree the search
     already narrowed, and wrapping it cost more than it saved — the React
     compiler refuses to optimise the surrounding component when a memo's body
     returns early from inside a loop, which is a worse trade than doing the
     scan. */
  const active = (() => {
    if (!activeKey) return null;
    const [discipline, system] = activeKey.split("|");
    const d = tree.find((x) => x.discipline === discipline);
    const s = d?.systems.find((x) => x.system === system);
    return s ? { discipline, system, checks: s.checks } : null;
  })();

  const a = active ? systemAssessment(active.discipline, active.system) : null;
  const band = a ? bandFor(a.severity, a.likelihood) : null;

  const rated = Object.values(systems).filter((x) => x.ratingConfirmed).length;
  const totalSystems = tree.reduce((n, d) => n + d.systems.length, 0);

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 pb-16 sm:px-6">
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {/* The site by the name the audit uses, not its ICAO code. `entityCode`
              is FALE; the masthead, the nav and every other heading say KSIA,
              and a screen that says FALE reads as a different airport. */}
          <h2 className="text-[17px] font-bold">Asset systems at {entity.short}</h2>
          <p className="text-[12px]" style={{ color: "var(--ink-2)" }}>
            Rate each one as a group on ACSA&rsquo;s B170 001M matrix. The band and the treatment
            strategy are calculated from the cell, never typed.
          </p>
        </div>

        <div
          ref={barRef}
          className="sticky top-0 z-10 -mx-4 mb-2 border-b px-4 py-[7px] sm:-mx-6 sm:px-6 sm:py-2.5"
          style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex min-w-0 flex-1 items-center gap-2 rounded-[11px] border px-3 py-1 sm:py-2"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            >
              <IconSearch width={14} height={14} className="shrink-0" style={{ color: "var(--ink-3)" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search an asset system…"
                aria-label="Search an asset system"
                className="min-h-[40px] w-full min-w-0 border-none bg-transparent text-[13px] outline-none"
              />
            </div>
            {/* TWO NUMBERS, AND THE DENOMINATOR IS EVERY ASSET SYSTEM AT THE
                SITE — not the ones that happen to carry a finding. A system
                nobody rated is the gap this screen exists to close. */}
            <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
              {rated}/{totalSystems} rated
            </span>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ------------------------------------------------ the hierarchy */}
          <div
            /* No `overflow-hidden`: it would make this its own scroll container
               and a sticky group header inside would never stick. Same trap the
               Inspection screen documents. */
            className="rounded-[13px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            {tree.length === 0 ? (
              <Empty>
                <IconInbox width={24} height={24} />
                <div>Nothing matches that search.</div>
              </Empty>
            ) : (
              tree.map((d) => {
                const open = isOpen(d.discipline);
                const done = d.systems.filter(
                  (x) => systems[`${d.discipline}|${x.system}`]?.ratingConfirmed
                ).length;
                return (
                  <div key={d.discipline} data-group={d.discipline}>
                    <GroupRow
                      label={d.discipline}
                      done={done}
                      total={d.systems.length}
                      open={open}
                      onToggle={() => toggle(d.discipline)}
                      sticky
                      stickyTop={barH}
                      title={`${d.discipline} — ${done} of ${d.systems.length} asset systems rated`}
                    />
                    {open &&
                      d.systems.map((x) => {
                        const key = `${d.discipline}|${x.system}`;
                        const rec = systems[key];
                        const b = bandFor(rec?.severity ?? null, rec?.likelihood ?? null);
                        const confirmed = rec?.ratingConfirmed === true;
                        const on = key === activeKey;
                        const pf = priorFor(entityCode, d.discipline, x.system);
                        const open2025 = priorBySystem.get(key)?.length ?? 0;
                        const raised = findingsBySystem.get(key)?.length ?? 0;
                        return (
                          <button
                            key={key}
                            data-system={x.system}
                            onClick={() => setActiveKey(key)}
                            className="relative flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-[var(--t)]"
                            style={{
                              borderColor: "var(--line)",
                              background: on ? "var(--acc-soft)" : "transparent",
                              minHeight: 56,
                            }}
                          >
                            {on && (
                              <span
                                className="absolute inset-y-0 left-0 w-[2.5px]"
                                style={{ background: "var(--acc)" }}
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12.5px] leading-[1.4] font-semibold">
                                {x.system}
                              </span>
                              {/* SEVERITY, LIKELIHOOD AND RATING, on the row.
                                  Sarel asked for icons; these are the marks the
                                  rest of the app already uses for exactly these
                                  three things — the B170 cell code (severity
                                  first, likelihood second, as cellCode prints
                                  it) and the band's own pill. A cell that has
                                  not been AGREED renders dashed and says
                                  "suggested", because a rating nobody tapped
                                  counts nowhere and must not look like one that
                                  does. */}
                              <span className="mt-[4px] flex flex-wrap items-center gap-1.5">
                                {b && confirmed ? (
                                  <>
                                    <Pill tone={BAND_META[b].tone}>
                                      {cellCode(rec!.severity, rec!.likelihood)}
                                    </Pill>
                                    <Pill tone={BAND_META[b].tone}>{BAND_META[b].label.toUpperCase()}</Pill>
                                  </>
                                ) : b ? (
                                  <span
                                    className="rounded-full border border-dashed px-2 py-[1px] font-mono text-[9px] font-semibold"
                                    style={{ borderColor: "var(--line-3)", color: "var(--ink-4)" }}
                                  >
                                    {cellCode(rec!.severity, rec!.likelihood)} · SUGGESTED
                                  </span>
                                ) : (
                                  <span
                                    className="rounded-full border border-dashed px-2 py-[1px] font-mono text-[9px]"
                                    style={{ borderColor: "var(--line-3)", color: "var(--ink-4)" }}
                                  >
                                    NOT RATED
                                  </span>
                                )}
                                {pf && <Pill tone="warn">2025 {pf.rating.toUpperCase()}</Pill>}
                              </span>
                              <span
                                className="mt-[4px] flex flex-wrap items-center gap-2 font-mono text-[9px]"
                                style={{ color: "var(--ink-4)" }}
                              >
                                <span>{x.checks.length} checks</span>
                                {open2025 > 0 && (
                                  <span style={{ color: "var(--warn)" }}>{open2025} still open</span>
                                )}
                                {raised > 0 && <span>{raised} raised here</span>}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                );
              })
            )}
          </div>

          {/* ------------------------------------------------- the assessment */}
          {!active || !a ? (
            <div
              className="flex items-center justify-center rounded-[15px] border p-8 text-center text-[12.5px]"
              style={{ background: "var(--panel)", borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              Pick an asset system to rate it and read everything this audit knows about it.
            </div>
          ) : (
            <div
              className="rounded-[15px] border p-[18px]"
              style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "var(--e2)" }}
            >
              <div
                className="mb-1.5 flex flex-wrap items-center gap-[7px] font-mono text-[10px]"
                style={{ color: "var(--ink-3)" }}
              >
                <span>{active.discipline}</span>
                <span>·</span>
                <span>{active.checks.length} check-points</span>
                {a.assessedAt && (
                  <span>
                    rated by {a.assessedBy} on{" "}
                    {new Date(a.assessedAt).toLocaleDateString("en-ZA")}
                  </span>
                )}
              </div>
              <h3 className="mb-1 text-[15px] leading-[1.3] font-bold">{active.system}</h3>

              {/* THE BAND AND THE STRATEGY, CALCULATED. Both are read off the
                  cell — clause 4.6 pairs one treatment strategy with each band,
                  and typing either by hand is how a register ends up with a Red
                  system whose strategy says "monitor". */}
              <div
                className="mb-3.5 rounded-[12px] border px-3 py-2.5"
                style={{
                  /* The band's surface, off the tone tokens the whole app
                     shares. BAND_META carries a tone, not colours — the colours
                     live in one place in globals.css and a second set here is
                     how two screens come to render different Reds. */
                  background:
                    band && a.ratingConfirmed
                      ? `var(--${BAND_META[band].tone}-bg)`
                      : "var(--sunken)",
                  borderColor:
                    band && a.ratingConfirmed
                      ? `var(--${BAND_META[band].tone}-line)`
                      : "var(--line)",
                }}
              >
                {band ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <b
                        className="font-display text-[13px] font-semibold"
                        style={{
                          color: a.ratingConfirmed
                            ? `var(--${BAND_META[band].tone})`
                            : "var(--ink-3)",
                        }}
                      >
                        {cellCode(a.severity, a.likelihood)} · {BAND_META[band].label}
                      </b>
                      {!a.ratingConfirmed && (
                        <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                          suggested — counts nowhere until the group agrees it
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-[3px] text-[11.5px] leading-[1.5]"
                      style={{
                        color: a.ratingConfirmed
                          ? `var(--${BAND_META[band].tone})`
                          : "var(--ink-3)",
                      }}
                    >
                      Strategy · {BAND_META[band].strategy}
                    </div>
                  </>
                ) : (
                  <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    Not rated. Pick a severity and a likelihood below — the band and the treatment
                    strategy follow from the cell.
                  </div>
                )}
              </div>

              {/* THE MATRIX, FROM THE ONE COMPONENT THAT DRAWS IT. Rendered
                  without its single-string treatment fields: an asset system
                  takes SEVERAL root causes and SEVERAL mitigation actions, and
                  those are below. A second copy of B170 001M in this file is
                  precisely what RecordActions was extracted to prevent. */}
              <RecordActions
                showTreatment={false}
                record={{
                  id: a.key,
                  severity: a.severity,
                  likelihood: a.likelihood,
                  ratingConfirmed: a.ratingConfirmed,
                  rootCause: "",
                  action: "",
                  owner: "",
                  dueDate: "",
                  actionStatus: "Open",
                  discipline: active.discipline,
                  system: active.system,
                }}
                entityCode={entityCode}
                onChange={(patch) =>
                  patchSystem(active.discipline, active.system, {
                    severity: patch.severity,
                    likelihood: patch.likelihood,
                    ratingConfirmed: patch.ratingConfirmed,
                  })
                }
                onToast={say}
              />

              <label className="mt-1 block">
                <span className="label-xs" style={{ color: "var(--ink-4)" }}>
                  Why the group agreed that cell
                </span>
                <textarea
                  value={a.ratingRationale}
                  onChange={(e) =>
                    patchSystem(active.discipline, active.system, { ratingRationale: e.target.value })
                  }
                  placeholder="What the band rests on — the evidence below, in a sentence…"
                  aria-label="Why the group agreed that cell"
                  className="mt-1 min-h-[54px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                />
              </label>

              {/* Several root causes and several mitigation actions. */}
              <SystemTreatment
                assessment={a}
                onAddCause={(c) => {
                  useStore.getState().addRootCause(active.discipline, active.system, c);
                  say("Root cause recorded");
                }}
                onPatchCause={(id, p) =>
                  useStore.getState().patchRootCause(active.discipline, active.system, id, p)
                }
                onRemoveCause={(id) =>
                  useStore.getState().removeRootCause(active.discipline, active.system, id)
                }
                onAddAction={(t) => {
                  useStore.getState().addMitigation(active.discipline, active.system, t);
                  say("Action recorded — it needs an owner and a date");
                }}
                onPatchAction={(id, p) =>
                  useStore.getState().patchMitigation(active.discipline, active.system, id, p)
                }
                onRemoveAction={(id) =>
                  useStore.getState().removeMitigation(active.discipline, active.system, id)
                }
              />

              {/* ---------------------------------- the full view of the system */}
              <SystemEvidence
                entityCode={entityCode}
                discipline={active.discipline}
                system={active.system}
                checks={active.checks}
                responses={responses}
                prior={priorBySystem.get(`${active.discipline}|${active.system}`) ?? []}
                raised={findingsBySystem.get(`${active.discipline}|${active.system}`) ?? []}
                walk={walkBySystem.get(`${active.discipline}|${active.system}`) ?? []}
                onOpenFinding={setOpenFinding}
              />
            </div>
          )}
        </div>
      </div>

      {/* One finding, in full, in a sheet. The pane the register used to be
          built around — see FindingDetail. */}
      {(() => {
        const f = openFinding ? findings.find((x) => x.id === openFinding) : null;
        if (!f) return null;
        return (
          <Sheet
            open
            wide
            onClose={() => setOpenFinding(null)}
            badges={
              <>
                <span>{f.id}</span>
                <span>·</span>
                <span>{f.system}</span>
                {f.priorRating && <Pill tone="bad">REPEAT</Pill>}
              </>
            }
            title={f.description || f.title}
            subtitle="One finding · rated on its own, and evidence for the asset system's band"
            footer={
              <Btn variant="primary" onClick={() => setOpenFinding(null)}>
                Done
              </Btn>
            }
          >
            <FindingDetail f={f} onToast={say} />
          </Sheet>
        );
      })()}

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

/** THE FULL VIEW OF ONE ASSET SYSTEM — everything this audit and the last one
 *  know about it, in the order a group reads it before agreeing a band.
 *
 *  Four lists, and the third is the one that is easy to leave out:
 *
 *    1. Still open from an earlier audit. The system's history.
 *    2. Findings raised at this audit.
 *    3. THIS AUDIT'S CHECK-POINTS — compliant ones included. A system whose
 *       checks all passed and whose 2025 finding is still open is a real and
 *       common shape, and a panel that showed only the failures would hide it.
 *       A blank status is shown as NOT CAPTURED and never as compliant.
 *    4. What the walk found that the register does not cover.
 */
function SystemEvidence({
  entityCode,
  discipline,
  system,
  checks,
  responses,
  prior,
  raised,
  walk,
  onOpenFinding,
}: {
  entityCode: string;
  discipline: string;
  system: string;
  checks: Check[];
  responses: Record<string, { compliance?: string | null; observation?: string } | undefined>;
  prior: { key: string; finding: string; originLabel: string; rating: string }[];
  raised: Finding[];
  walk: { id: string; description: string; outcome: string | null }[];
  onOpenFinding: (id: string) => void;
}) {
  const seen = checks.filter((c) => fieldDone(responses[c.id] as never)).length;
  const nc = checks.filter((c) => responses[c.id]?.compliance === "NC").length;
  const ok = checks.filter((c) => responses[c.id]?.compliance === "C").length;
  const blank = checks.filter((c) => !responses[c.id]?.compliance).length;

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <b className="font-display text-[11px] font-semibold">
          Everything this audit knows about {system}
        </b>
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {ok} compliant · {nc} non-compliant · {blank} not captured · {seen} seen on site
        </span>
      </div>

      <Section
        label={`Still open from an earlier audit (${prior.length})`}
        empty="Nothing carried into this visit for this asset system."
      >
        {prior.map((p) => (
          <Row key={p.key} id={p.key} tone="warn" right={p.rating.toUpperCase()}>
            <span style={{ color: "var(--ink-4)" }}>{p.originLabel} · </span>
            {p.finding}
          </Row>
        ))}
      </Section>

      <Section
        label={`Raised at this audit (${raised.length})`}
        empty="No finding has been raised against this asset system at this audit."
      >
        {raised.map((f) => {
          const b = bandFor(f.severity, f.likelihood);
          return (
            <Row
              key={f.id}
              id={f.id}
              tone={b && f.ratingConfirmed ? BAND_META[b].tone : "neutral"}
              right={
                b
                  ? f.ratingConfirmed
                    ? /* cellCode prints severity-first (C4) while looking up
                         likelihood-first. Deliberate and documented in
                         src/lib/risk.ts — do not "tidy" it. Never null here,
                         because a band exists only when both halves do. */
                      (cellCode(f.severity, f.likelihood) ?? "RATED")
                    : "SUGGESTED"
                  : "NOT RATED"
              }
              onClick={() => onOpenFinding(f.id)}
            >
              {f.description || f.title}
            </Row>
          );
        })}
      </Section>

      <Section
        label={`This audit's check-points (${checks.length})`}
        empty="No check-point at this site covers this asset system."
      >
        {checks.map((c) => {
          const r = responses[c.id];
          /* A BLANK STATUS IS NOT CAPTURED, and never compliant. It is the one
             thing this panel must not soften: a system read as compliant on
             checks nobody answered is a band agreed on evidence that does not
             exist. */
          const word =
            r?.compliance === "C"
              ? "COMPLIANT"
              : r?.compliance === "NC"
                ? "NON-COMPLIANT"
                : r?.compliance === "NA"
                  ? "NOT APPLICABLE"
                  : "NOT CAPTURED";
          const tone: Tone =
            r?.compliance === "C"
              ? "good"
              : r?.compliance === "NC"
                ? "bad"
                : r?.compliance === "NA"
                  ? "neutral"
                  : "warn";
          return (
            <Row key={c.id} id={portalIdFor(entityCode, c.id)} tone={tone} right={word}>
              {c.requirement}
            </Row>
          );
        })}
      </Section>

      <Section
        label={`Seen on the walk, not on the register (${walk.length})`}
        empty="The walk found nothing here that the register does not cover."
      >
        {walk.map((w) => (
          <Row key={w.id} id={w.id} tone="accent" right={(w.outcome ?? "no outcome").toUpperCase()}>
            {w.description}
          </Row>
        ))}
      </Section>

      <div className="mt-2 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-4)" }}>
        None of this computes the band. It is what the group reads before agreeing the cell —
        three Amber findings on one asset system is not an Amber system, and a system with no
        findings is not automatically Green.
      </div>
      <div className="sr-only">
        {discipline} · {system}
      </div>
    </div>
  );
}

function Section({
  label,
  empty,
  children,
}: {
  label: string;
  empty: string;
  children: React.ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="mb-3">
      <div className="label-xs mb-1" style={{ color: "var(--ink-4)" }}>
        {label}
      </div>
      {has ? (
        <div
          className="overflow-hidden rounded-[11px] border"
          style={{ borderColor: "var(--line)" }}
        >
          {children}
        </div>
      ) : (
        /* SAID, NOT LEFT BLANK. "No finding was raised here" and "this list did
           not render" look identical when a section simply disappears, and only
           one of them is information. */
        <div
          className="rounded-[11px] border px-3 py-2 text-[11.5px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line)", color: "var(--ink-4)" }}
        >
          {empty}
        </div>
      )}
    </div>
  );
}

function Row({
  id,
  tone,
  right,
  children,
  onClick,
}: {
  id: string;
  tone: Tone;
  right: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {id}
        </span>
        <span className="mt-[1px] block text-[11.5px] leading-[1.4]">{children}</span>
      </span>
      <span className="mt-[2px] shrink-0">
        <Pill tone={tone}>{right}</Pill>
      </span>
    </>
  );
  return onClick ? (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-2 border-b px-3 py-2 text-left last:border-b-0"
      style={{ borderColor: "var(--line)", minHeight: 44 }}
    >
      {inner}
    </button>
  ) : (
    <div
      className="flex items-start gap-2 border-b px-3 py-2 last:border-b-0"
      style={{ borderColor: "var(--line)" }}
    >
      {inner}
    </div>
  );
}
