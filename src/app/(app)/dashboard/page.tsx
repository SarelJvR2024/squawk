"use client";

import { useMemo, useState } from "react";
import {
  CHECKS,
  DISCIPLINES,
  PRIOR,
  VISITS,
  checksOf,
  priorFor,
  useStore,
} from "@/lib/store";
import { CURRENT_ENTITY, CURRENT_VISIT_ID, ENTITIES, PROGRAMME_VISITS } from "@/lib/programme";

const CURRENT_VISIT_LABEL =
  PROGRAMME_VISITS.find((v) => v.id === CURRENT_VISIT_ID)?.label ?? CURRENT_VISIT_ID;
import { LIKELIHOODS, SEVERITIES, bandFor, movement } from "@/lib/risk";
import { Panel, Pill, Track } from "@/components/ui/primitives";
import { IconInfo, IconLoop } from "@/components/ui/icons";

/* The entity list, the visit cycle and the (still empty) zone names live in
   src/data/programme.json — adding an airport or a visit is a data change, not
   a code change. Only the live entity carries captured data; the rest are shown
   honestly as not yet audited rather than padded with invented figures. */

type Level = "airport" | "discipline" | "portfolio";

/* 1 of 374 must not read as 0% — an auditor reads that as "nothing started". */
function pct(n: number, total: number) {
  if (!total) return "0%";
  const p = (n / total) * 100;
  if (n > 0 && p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

export default function DashboardPage() {
  const responses = useStore((s) => s.responses);
  const findings = useStore((s) => s.findings);
  const verifications = useStore((s) => s.verifications);
  const role = useStore((s) => s.role);

  const [level, setLevel] = useState<Level>("airport");
  const [discipline, setDiscipline] = useState(DISCIPLINES[0]);

  const scope = level === "discipline" ? checksOf(discipline) : CHECKS;

  const stats = useMemo(() => {
    const captured = scope.filter((c) => responses[c.id]?.captured);
    const by = (v: string) => scope.filter((c) => responses[c.id]?.compliance === v).length;
    return {
      total: scope.length,
      captured: captured.length,
      C: by("C"),
      NC: by("NC"),
      NV: by("NV"),
      NA: by("N/A"),
      open: scope.length - captured.length,
    };
  }, [scope, responses]);

  const scopedFindings = useMemo(
    () => (level === "discipline" ? findings.filter((f) => f.discipline === discipline) : findings),
    [findings, level, discipline]
  );

  /* Only ratings the group has agreed on. A severity seeded by an issue button
     is a suggestion and must not appear on ACSA's risk profile as a decision. */
  const rated = scopedFindings.filter((f) => f.ratingConfirmed && f.severity && f.likelihood);
  const bandCount = (b: string) => rated.filter((f) => bandFor(f.severity, f.likelihood) === b).length;

  /* prior-finding closure and movement */
  const priorScope = level === "discipline" ? PRIOR.filter((p) => p.discipline === discipline) : PRIOR;
  const verified = priorScope.filter((p) => verifications[p.pf]?.outcome).length;
  const closed = priorScope.filter((p) => verifications[p.pf]?.outcome === "Closed").length;
  const repeat = priorScope.filter((p) => verifications[p.pf]?.outcome === "Open - repeat").length;

  const currentRating = (disc: string, sys: string) => {
    const cs = checksOf(disc, sys);
    const ncFindings = findings.filter((f) => f.discipline === disc && f.system === sys);
    const bands = ncFindings.map((f) => bandFor(f.severity, f.likelihood));
    if (bands.includes("Red")) return "Unacceptable";
    if (bands.includes("Amber")) return "Tolerable";
    if (cs.some((c) => responses[c.id]?.compliance === "NC")) return "Pending rating";
    if (cs.some((c) => responses[c.id]?.captured)) return "Acceptable";
    return "Not assessed";
  };

  const moves = priorScope
    .map((p) => movement(p.rating, currentRating(p.discipline, p.system)))
    .filter(Boolean);
  const improved = moves.filter((m) => m === "Improved").length;
  const unchanged = moves.filter((m) => m === "Unchanged").length;
  const worsened = moves.filter((m) => m === "Worsened").length;

  /* coverage guard: prior findings whose asset system has no check in scope */
  const noCoverage = priorScope.filter(
    (p) => checksOf(p.discipline, p.system).length === 0
  ).length;

  const kpi = (label: string, value: string | number, tone?: "good" | "bad" | "warn" | "acc") => (
    <div
      key={label}
      className="relative overflow-hidden rounded-[15px] border px-[15px] py-[13px]"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <span
        className="absolute inset-x-0 top-0 h-[2.5px]"
        style={{ background: tone ? `var(--${tone === "acc" ? "acc" : tone})` : "var(--line-3)" }}
      />
      <b
        className="block font-mono text-[23px] leading-[1.15] font-semibold tnum"
        style={{ color: tone ? `var(--${tone === "acc" ? "acc" : tone})` : "var(--ink)" }}
      >
        {value}
      </b>
      <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-5 pt-5 pb-16">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold">
              {level === "portfolio"
                ? "ACSA network — cycle 2025–2027"
                : level === "discipline"
                  ? `${discipline} — ${CURRENT_ENTITY.name}`
                  : `${CURRENT_ENTITY.name} — ${CURRENT_VISIT_LABEL}`}
            </h2>
            <p className="mt-1 max-w-[78ch] text-[12.5px]" style={{ color: "var(--ink-2)" }}>
              {role === "acsa"
                ? "ACSA view — read-only. Every figure traces to a captured response and its ACSA clause."
                : "Live from capture, field inspection and closure verification."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-[2px] rounded-[11px] p-[3px]" style={{ background: "var(--sunken)" }}>
              {(["airport", "discipline", "portfolio"] as Level[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className="rounded-[8px] px-3 py-[6px] font-display text-[11.5px] font-semibold capitalize transition-[var(--t)]"
                  style={{
                    background: level === l ? "var(--panel)" : "transparent",
                    color: level === l ? "var(--acc)" : "var(--ink-2)",
                    boxShadow: level === l ? "var(--e1)" : "none",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            {level === "discipline" && (
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="rounded-[9px] border px-2.5 py-[7px] text-[12px]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              >
                {DISCIPLINES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            )}
            <Pill tone={role === "acsa" ? "neutral" : "accent"}>{role === "acsa" ? "READ-ONLY" : "TPJV"}</Pill>
          </div>
        </div>

        {level === "portfolio" ? (
          <>
            <Panel tone="accent" className="mb-3.5">
              <div className="flex items-start gap-2.5 text-[11.5px]" style={{ color: "var(--acc)" }}>
                <IconInfo width={14} height={14} style={{ marginTop: 1 }} />
                <span>
                  Nine airports and head office on a three-year cycle, two visits a year — 60 audits
                  per cycle. Only {CURRENT_ENTITY.short} carries captured data at this point; the rest are shown
                  as not yet audited rather than filled with placeholder figures.
                </span>
              </div>
            </Panel>
            <div className="mb-3.5 grid grid-cols-2 gap-[9px] md:grid-cols-4">
              {kpi("Entities in the cycle", ENTITIES.length, "acc")}
              {kpi("Audited this cycle", ENTITIES.filter((n) => n.live).length, "good")}
              {kpi("Open findings, network", findings.length, "bad")}
              {kpi("Prior findings to verify", PRIOR.length - verified, "warn")}
            </div>
            <div className="overflow-x-auto rounded-[15px] border" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {["Entity", "Code", "This cycle", "Captured", "NC", "Prior findings", "Status"].map((h) => (
                      <th
                        key={h}
                        className="border-b px-3 py-2.5 text-left font-mono text-[8.5px] tracking-[0.09em] uppercase"
                        style={{ borderColor: "var(--line)", background: "var(--sunken)", color: "var(--ink-4)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ENTITIES.map((n) => (
                    <tr key={n.code}>
                      <td className="border-b px-3 py-2.5 font-medium" style={{ borderColor: "var(--line)" }}>
                        {n.name}
                      </td>
                      <td className="border-b px-3 py-2.5 font-mono text-[11px]" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                        {n.code}
                      </td>
                      <td className="border-b px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
                        {n.live ? <Pill tone="accent">Sep 2026 · visit 4 of 6</Pill> : <span style={{ color: "var(--ink-4)" }}>—</span>}
                      </td>
                      <td className="border-b px-3 py-2.5 text-right font-mono tnum" style={{ borderColor: "var(--line)" }}>
                        {n.live ? `${stats.captured}/${CHECKS.length}` : "—"}
                      </td>
                      <td className="border-b px-3 py-2.5 text-right font-mono tnum" style={{ borderColor: "var(--line)", color: n.live && stats.NC ? "var(--bad)" : "var(--ink-4)" }}>
                        {n.live ? stats.NC || "—" : "—"}
                      </td>
                      <td className="border-b px-3 py-2.5 text-right font-mono tnum" style={{ borderColor: "var(--line)" }}>
                        {n.code === "FALE" ? PRIOR.length : "—"}
                      </td>
                      <td className="border-b px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
                        {n.live ? <Pill tone="good">In progress</Pill> : <Pill>Not yet audited</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3.5 grid grid-cols-2 gap-[9px] md:grid-cols-5">
              {kpi(`Captured · ${stats.captured}/${stats.total}`, pct(stats.captured, stats.total), "acc")}
              {kpi("Compliant", stats.C, "good")}
              {kpi("Non-compliant", stats.NC, "bad")}
              {kpi("Awaiting evidence", stats.NV, "warn")}
              {kpi("Findings raised", scopedFindings.length, "bad")}
            </div>

            <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
              {/* discipline / asset-system table */}
              <div className="rounded-[15px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
                <h3 className="mb-3 text-[12.5px] font-bold">
                  {level === "discipline" ? "By asset system" : "By discipline"}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr>
                        {[level === "discipline" ? "Asset system" : "Discipline", "Progress", "Captured", "NC", "Mar 2025"].map((h) => (
                          <th
                            key={h}
                            className="border-b px-2.5 py-2 text-left font-mono text-[8.5px] tracking-[0.09em] uppercase"
                            style={{ borderColor: "var(--line)", color: "var(--ink-4)" }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(level === "discipline"
                        ? Array.from(new Set(checksOf(discipline).map((c) => c.system))).map((sys) => ({
                            key: sys,
                            cs: checksOf(discipline, sys),
                            pf: priorFor(discipline, sys),
                          }))
                        : DISCIPLINES.map((d) => ({ key: d, cs: checksOf(d), pf: null }))
                      ).map(({ key, cs, pf }) => {
                        const done = cs.filter((c) => responses[c.id]?.captured).length;
                        const nc = cs.filter((c) => responses[c.id]?.compliance === "NC").length;
                        return (
                          <tr key={key}>
                            <td className="border-b px-2.5 py-2.5 font-medium" style={{ borderColor: "var(--line)" }}>
                              {key}
                            </td>
                            <td className="w-[110px] border-b px-2.5 py-2.5" style={{ borderColor: "var(--line)" }}>
                              <Track pct={cs.length ? (done / cs.length) * 100 : 0} />
                            </td>
                            <td className="border-b px-2.5 py-2.5 text-right font-mono tnum" style={{ borderColor: "var(--line)" }}>
                              {done}/{cs.length}
                            </td>
                            <td
                              className="border-b px-2.5 py-2.5 text-right font-mono tnum"
                              style={{ borderColor: "var(--line)", color: nc ? "var(--bad)" : "var(--ink-4)" }}
                            >
                              {nc || "—"}
                            </td>
                            <td className="border-b px-2.5 py-2.5" style={{ borderColor: "var(--line)" }}>
                              {pf ? (
                                <Pill tone={pf.rating === "Unacceptable" ? "bad" : pf.rating === "Tolerable" ? "warn" : "good"}>
                                  {pf.pf}
                                </Pill>
                              ) : (
                                <span style={{ color: "var(--ink-4)" }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ACSA B170 001M heat map */}
              <div className="rounded-[15px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[12.5px] font-bold">Risk profile</h3>
                  <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    B170 001M · severity ↓ × likelihood → · {rated.length} rated
                  </span>
                </div>
                <table className="w-full" style={{ borderSpacing: 4, borderCollapse: "separate" }}>
                  <thead>
                    <tr>
                      <th />
                      {LIKELIHOODS.map((l) => (
                        <th
                          key={l}
                          title={l}
                          className="p-0.5 font-mono text-[9px] font-medium"
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
                        <td
                          title={s}
                          className="pr-1.5 text-right font-mono text-[9px] whitespace-nowrap"
                          style={{ color: "var(--ink-4)" }}
                        >
                          {s.charAt(0)}
                        </td>
                        {LIKELIHOODS.map((l) => {
                          const n = rated.filter((f) => f.severity === s && f.likelihood === l).length;
                          const band = bandFor(s, l);
                          const tone = band === "Red" ? "bad" : band === "Amber" ? "warn" : "good";
                          return (
                            <td
                              key={l}
                              className="h-[38px] rounded-[7px] text-center font-mono text-[12.5px] font-semibold"
                              style={{
                                /* Empty cells keep a faint band wash so the shape of
                                   the matrix — where the dangerous corner is — reads
                                   at a glance in both themes, not only where findings sit. */
                                background: n
                                  ? `var(--${tone}-bg)`
                                  : `color-mix(in oklab, var(--${tone}) 10%, var(--sunken))`,
                                color: n ? `var(--${tone})` : "var(--line-3)",
                              }}
                            >
                              {n || "·"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap gap-3.5 text-[10.5px]" style={{ color: "var(--ink-2)" }}>
                  {[
                    ["bad", "Red — Unacceptable"],
                    ["warn", "Amber — mitigate"],
                    ["good", "Green — Acceptable"],
                  ].map(([t, label]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <i className="h-[9px] w-[9px] rounded-[3px]" style={{ background: `var(--${t})` }} />
                      {label}
                    </span>
                  ))}
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                  {(["Red", "Amber", "Green"] as const).map((b) => (
                    <div key={b} className="rounded-[9px] py-1.5" style={{ background: "var(--sunken)" }}>
                      <b className="block font-mono text-[15px] font-semibold" style={{ color: b === "Red" ? "var(--bad)" : b === "Amber" ? "var(--warn)" : "var(--good)" }}>
                        {bandCount(b)}
                      </b>
                      <span className="text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {b}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* cycle movement */}
            <div className="rounded-[15px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
              <h3 className="mb-3 flex items-center gap-2 text-[12.5px] font-bold">
                <IconLoop width={14} height={14} style={{ color: "var(--acc)" }} />
                Movement against March 2025
              </h3>
              <div className="grid grid-cols-2 gap-[9px] md:grid-cols-6">
                {kpi("Improved", improved, "good")}
                {kpi("Unchanged", unchanged, "warn")}
                {kpi("Worsened", worsened, "bad")}
                {kpi("Verified closed", closed, "good")}
                {kpi("Repeat", repeat, "bad")}
                {kpi("Still to verify", priorScope.length - verified, "acc")}
              </div>
              {noCoverage > 0 && (
                <Panel tone="warn" className="mt-3">
                  <div className="text-[11.5px]" style={{ color: "var(--warn)" }}>
                    <b>Coverage guard:</b> {noCoverage} prior finding{noCoverage > 1 ? "s have" : " has"} no
                    check-point in this visit&apos;s scope. Closure cannot be evidenced against a check that is
                    not being done.
                  </div>
                </Panel>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {VISITS.map((v) => (
                  <span
                    key={v.id}
                    className="rounded-full px-2.5 py-1 font-mono text-[10px]"
                    style={{
                      background: v.state === "current" ? "var(--acc-soft)" : "var(--sunken)",
                      color: v.state === "current" ? "var(--acc)" : "var(--ink-3)",
                    }}
                  >
                    {v.label} · {v.note}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
