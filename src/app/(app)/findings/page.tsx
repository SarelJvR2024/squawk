"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHECKS,
  DISCIPLINES,
  ROOT_CAUSES,
  responsibleFor,
  useEntityCode,
  useStore,
  useVisitFindings,
} from "@/lib/store";
import { assist, findingContext, useAssistAvailable } from "@/lib/assist";
import { BAND_META, LIKELIHOOD_DEF, LIKELIHOODS, SEVERITIES, SEVERITY_DEF, bandFor, cellCode } from "@/lib/risk";
import { Btn, Chip, Dot, Empty, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconInbox, IconLoop, IconSpark } from "@/components/ui/icons";
import type { ActionStatus, Finding } from "@/lib/types";

type Filter = "all" | "unrated" | "open" | "repeat";

export default function FindingsPage() {
  const router = useRouter();
  const findings = useVisitFindings();
  const entityCode = useEntityCode();
  const updateFinding = useStore((s) => s.updateFinding);

  const [filter, setFilter] = useState<Filter>("all");
  const [discipline, setDiscipline] = useState<string>("All");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const aiOn = useAssistAvailable();
  const [opinion, setOpinion] = useState<{ id: string; text: string } | null>(null);
  const [asking, setAsking] = useState(false);

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
      <div className="flex flex-1 items-center justify-center p-8">
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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
              {DISCIPLINES.map((d) => (
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
                    <Dot tone={band === "Red" ? "bad" : band === "Amber" ? "warn" : band === "Green" ? "good" : "pending"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {f.id} · {f.discipline}
                        {f.adHoc ? " · ad-hoc" : ""}
                      </span>
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

              <div className="mb-2 flex items-center justify-between">
                <b className="font-display text-[11px] font-semibold">Severity (rows) × Likelihood (columns)</b>
                <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  ACSA B170 001M · click the cell the group agrees on
                </span>
              </div>
              <div className="overflow-x-auto">
                <table style={{ borderSpacing: 5, borderCollapse: "separate" }}>
                  <thead>
                    <tr>
                      <th className="pr-1.5 text-right font-mono text-[8px] font-medium" style={{ color: "var(--ink-4)" }}>
                        S&nbsp;&darr;
                      </th>
                      {LIKELIHOODS.map((l) => (
                        <th
                          key={l}
                          title={`${l} (${LIKELIHOOD_DEF[l.charAt(0)].gloss || "—"}) — ${LIKELIHOOD_DEF[l.charAt(0)].meaning}`}
                          className="p-[3px] font-mono text-[9px] font-medium"
                          style={{ color: "var(--ink-4)" }}
                        >
                          {l.charAt(0)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SEVERITIES.map((s) => (
                      <tr key={s}>
                        <th
                          title={`${s} — ${SEVERITY_DEF[s.charAt(0)].consequence}. ${SEVERITY_DEF[s.charAt(0)].example}`}
                          className="pr-1.5 text-right font-mono text-[9px] font-medium"
                          style={{ color: "var(--ink-4)" }}
                        >
                          {s.charAt(0)}
                        </th>
                        {LIKELIHOODS.map((l) => {
                          const band = bandFor(s, l)!;
                          const picked = active.severity === s && active.likelihood === l;
                          const tone = BAND_META[band].tone;
                          return (
                            <td key={l}>
                              <button
                                onClick={() => {
                                  updateFinding(active.id, {
                                    severity: s,
                                    likelihood: l,
                                    ratingConfirmed: true,
                                  });
                                  say(`${cellCode(s, l)} → ${BAND_META[band].label}`);
                                }}
                                aria-label={`Severity ${s} by likelihood ${l} — ${band}, ${BAND_META[band].label}`}
                                className="h-[42px] w-[56px] rounded-[8px] border-[1.5px] font-mono text-[10.5px] font-semibold transition-[var(--t)]"
                                style={{
                                  background: `var(--${tone}-bg)`,
                                  color: `var(--${tone})`,
                                  borderColor: picked
                                    ? active.ratingConfirmed
                                      ? "var(--acc)"
                                      : "var(--ink-4)"
                                    : "transparent",
                                  borderStyle: picked && !active.ratingConfirmed ? "dashed" : "solid",
                                  boxShadow:
                                    picked && active.ratingConfirmed ? "0 0 0 2px var(--acc-soft)" : "none",
                                }}
                              >
                                {cellCode(s, l)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(() => {
                const band = bandFor(active.severity, active.likelihood);
                return (
                  <div
                    className="my-3 flex flex-wrap items-center gap-2 rounded-[11px] px-[15px] py-3 font-display text-[13.5px] font-bold"
                    style={
                      band
                        ? { background: `var(--${BAND_META[band].tone}-bg)`, color: `var(--${BAND_META[band].tone})` }
                        : { background: "var(--sunken)", color: "var(--ink-3)", fontWeight: 500, fontSize: 12 }
                    }
                  >
                    {band ? (
                      <>
                        <span>
                          {cellCode(active.severity, active.likelihood)} · {band} — {BAND_META[band].label}
                        </span>
                        <span className="font-sans text-[11px] font-normal opacity-80">
                          {BAND_META[band].strategy}
                        </span>
                        {!active.ratingConfirmed && (
                          <span
                            className="ml-auto rounded-full px-2 py-[3px] font-mono text-[9px] font-semibold tracking-[.04em] uppercase"
                            style={{ background: "var(--panel)", color: "var(--ink-3)" }}
                          >
                            Suggested · click to agree
                          </span>
                        )}
                      </>
                    ) : (
                      "Pick a cell to set severity and likelihood together"
                    )}
                  </div>
                );
              })()}

              {/* ACSA's own definitions, in the room, at the moment the group
                  decides. The one-word label is not enough to rate against —
                  "Remote" and "Occasional" mean specific things here, and an
                  earlier version of this tool proved how easily a paraphrase
                  shifts a whole register by a notch. */}
              <details className="group mb-3.5">
                <summary
                  className="flex cursor-pointer list-none items-center gap-1.5 py-1 font-display text-[11px] font-semibold select-none"
                  style={{ color: "var(--ink-3)" }}
                >
                  <span className="transition-transform group-open:rotate-90">›</span>
                  What the scales mean · B170 001M cl. 4.3.1–4.3.2, verbatim
                </summary>
                <div className="mt-1.5 grid gap-3 md:grid-cols-2">
                  <div
                    className="rounded-[11px] border p-3"
                    style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
                  >
                    <div className="label-xs mb-1.5">Severity</div>
                    {SEVERITIES.map((s) => (
                      <div key={s} className="mb-[7px] text-[11.5px] leading-[1.45]">
                        <b className="font-mono">{s.charAt(0)}</b>{" "}
                        <b>{s.slice(4)}</b>
                        <span style={{ color: "var(--ink-2)" }}>
                          {" "}
                          — {SEVERITY_DEF[s.charAt(0)].consequence}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div
                    className="rounded-[11px] border p-3"
                    style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
                  >
                    <div className="label-xs mb-1.5">Likelihood</div>
                    {LIKELIHOODS.map((l) => {
                      const d = LIKELIHOOD_DEF[l.charAt(0)];
                      return (
                        <div key={l} className="mb-[7px] text-[11.5px] leading-[1.45]">
                          <b className="font-mono">{l.charAt(0)}</b> <b>{l.slice(4)}</b>
                          {d.gloss && (
                            <span style={{ color: "var(--ink-3)" }}> ({d.gloss})</span>
                          )}
                          <span style={{ color: "var(--ink-2)" }}> — {d.meaning}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>

              {aiOn && (
                /* A second opinion for the room, printed as text. It never
                   moves the cell — the group does that, and the group can
                   disagree with it. */
                <div className="mb-3.5">
                  {opinion?.id === active.id ? (
                    <div
                      className="rounded-[11px] border p-3 text-[12px] leading-[1.55] whitespace-pre-line"
                      style={{ borderColor: "var(--line-2)", background: "var(--sunken)" }}
                    >
                      <div className="label-xs mb-1.5">
                        A second opinion · the group still decides
                      </div>
                      {opinion.text}
                      <div className="mt-2.5">
                        <Btn variant="ghost" onClick={() => setOpinion(null)}>
                          Dismiss
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    <button
                      disabled={asking}
                      onClick={async () => {
                        setAsking(true);
                        try {
                          const check = CHECKS.find((c) => c.id === active.checkId);
                          const text = await assist("rating", findingContext(active, check));
                          setOpinion({ id: active.id, text });
                        } catch (err) {
                          say(err instanceof Error ? err.message : "The assistant is unavailable");
                        } finally {
                          setAsking(false);
                        }
                      }}
                      className="flex items-center gap-[6px] rounded-[8px] border px-[11px] py-[6px] text-[11px] transition-[var(--t)] disabled:opacity-55"
                      style={{
                        background: "var(--panel)",
                        borderColor: "var(--line-2)",
                        color: "var(--ink-2)",
                      }}
                    >
                      <IconSpark width={13} height={13} />
                      {asking ? "Thinking…" : "Ask for a second opinion"}
                    </button>
                  )}
                </div>
              )}

              <div className="mb-2 font-display text-[11px] font-semibold">Root cause</div>
              <div className="mb-4 flex flex-wrap gap-[5px]">
                {ROOT_CAUSES.map((rc) => (
                  <Chip key={rc} selected={active.rootCause === rc} onClick={() => updateFinding(active.id, { rootCause: rc })}>
                    {rc}
                  </Chip>
                ))}
              </div>

              <div className="mb-2 font-display text-[11px] font-semibold">Remediation action</div>
              <textarea
                value={active.action}
                onChange={(e) => updateFinding(active.id, { action: e.target.value })}
                placeholder="What must happen…"
                className="min-h-[70px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="label-xs">Owner</span>
                  <select
                    value={active.owner}
                    onChange={(e) => updateFinding(active.id, { owner: e.target.value })}
                    className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[11.5px]"
                    style={{
                      background: "var(--panel)",
                      borderColor: active.owner ? "var(--line-2)" : "var(--warn-line)",
                    }}
                  >
                    <option value="">{active.owner ? "Select…" : "⚠ unassigned"}</option>
                    {responsibleFor(entityCode).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label-xs">Target date</span>
                  <input
                    type="date"
                    value={active.dueDate}
                    onChange={(e) => updateFinding(active.id, { dueDate: e.target.value })}
                    className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[11.5px]"
                    style={{
                      background: "var(--panel)",
                      borderColor: active.dueDate ? "var(--line-2)" : "var(--warn-line)",
                    }}
                  />
                </label>
                <label className="block">
                  <span className="label-xs">Action status</span>
                  <select
                    value={active.actionStatus}
                    onChange={(e) => updateFinding(active.id, { actionStatus: e.target.value as ActionStatus })}
                    className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[11.5px]"
                    style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                  >
                    {(["Open", "In progress", "Closed"] as ActionStatus[]).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5" style={{ borderColor: "var(--line)" }}>
                <span className="font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                  {active.actionStatus === "Closed"
                    ? "closed — no re-check needed"
                    : "carries to the next audit for verification"}
                </span>
                <Btn
                  variant="primary"
                  onClick={() => {
                    const i = list.findIndex((f) => f.id === active.id);
                    setActiveId(list[i + 1]?.id ?? active.id);
                    say(`${active.id} saved`);
                  }}
                >
                  <IconCheck width={14} height={14} />
                  Save &amp; next
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div
          className="fixed bottom-[22px] left-1/2 z-[100] -translate-x-1/2 rounded-[11px] px-[15px] py-2.5 text-[12px] font-medium"
          style={{ background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--e3)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
