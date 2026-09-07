"use client";

import { useMemo, useState } from "react";
import {
  checksAt,
  disciplinesAt,
  priorFindingsAt,
  usePortfolio,
  checksOf,
  priorFor,
  useResponses,
  useStore,
  useVerifications,
  useEntity,
  useEntityCode,
  useVisitFindings,
  useVisitId,
} from "@/lib/store";
import { ENTITIES, PROGRAMME_VISITS } from "@/lib/programme";
import { LIKELIHOODS, SEVERITIES, bandFor, movement } from "@/lib/risk";
import { currentRatingOf } from "@/lib/carryforward";
import { Panel, Pill, Track } from "@/components/ui/primitives";

/** "15–18 Sep 2026". The audit window comes off the register's own calendar. */
function auditWindow(from: string, to: string): string {
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [fy, fm, fd] = from.split("-");
  const [, tm, td] = to.split("-");
  const day = (d: string) => String(Number(d));
  return fm === tm
    ? `${day(fd)}–${day(td)} ${M[Number(tm) - 1]} ${fy}`
    : `${day(fd)} ${M[Number(fm) - 1]} – ${day(td)} ${M[Number(tm) - 1]} ${fy}`;
}
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
  const responses = useResponses();
  const findings = useVisitFindings();
  const entityCode = useEntityCode();
  const entity = useEntity();
  const visitId = useVisitId();
  const visitLabel =
    PROGRAMME_VISITS.find((v) => v.id === visitId)?.label ?? visitId;
  const cycleVisits = useMemo(
    () => PROGRAMME_VISITS.filter((v) => v.entity === entityCode),
    [entityCode]
  );
  const verifications = useVerifications();
  const role = useStore((s) => s.role);
  const portfolio = usePortfolio();

  const [level, setLevel] = useState<Level>("airport");
  /* Every number on this page is for the entity in view. The register is 324
     check-points; this airport's checklist may be 319 or 200, and a percentage
     against the wrong denominator is a number that lies on a page ACSA reads. */
  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const checks = useMemo(() => checksAt(entityCode), [entityCode]);
  const prior = useMemo(() => priorFindingsAt(entityCode), [entityCode]);
  const [discipline, setDiscipline] = useState(disciplines[0]);

  const scope = level === "discipline" ? checksOf(entityCode, discipline) : checks;

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
  const priorScope =
    level === "discipline" ? prior.filter((p) => p.discipline === discipline) : prior;
  const verified = priorScope.filter((p) => verifications[p.portalId]?.outcome).length;
  const closed = priorScope.filter((p) => verifications[p.portalId]?.outcome === "Closed").length;
  const repeat = priorScope.filter(
    (p) => verifications[p.portalId]?.outcome === "Open - repeat"
  ).length;

  /* Shared with the closure screen — see currentRatingOf in carryforward.ts.
     It was written twice and neither copy gated on ratingConfirmed, so an
     untapped issue button could move the movement counts below. */
  const currentRating = (disc: string, sys: string) =>
    currentRatingOf(
      checksOf(entityCode, disc, sys),
      findings.filter((f) => f.discipline === disc && f.system === sys),
      responses
    );

  /* An unallocated finding names a building, not an asset system, so there is
     nothing to compare it against and it is left out of the movement counts
     rather than counted as unchanged. */
  const moves = priorScope
    .filter((p) => p.assetSystem)
    .map((p) => movement(p.tolerance, currentRating(p.discipline, p.assetSystem!)))
    .filter(Boolean);
  const improved = moves.filter((m) => m === "Improved").length;
  const unchanged = moves.filter((m) => m === "Unchanged").length;
  const worsened = moves.filter((m) => m === "Worsened").length;

  /* coverage guard: prior findings whose asset system has no check in scope */
  const noCoverage = priorScope.filter(
    (p) => p.assetSystem && checksOf(entityCode, p.discipline, p.assetSystem).length === 0
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
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-5 pt-5 pb-16">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold">
              {level === "portfolio"
                ? "ACSA network — cycle 2025–2027"
                : level === "discipline"
                  ? `${discipline} — ${entity.name}`
                  : `${entity.name} — ${visitLabel}`}
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
                {disciplines.map((d) => (
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
                  Ten sites on a three-year cycle, two visits a year. Round 1 (2026-27) runs
                  15 Sep to 03 Dec 2026. The checklist is 324 check-points at the three
                  international airports, 319 at the six regionals (no passenger boarding
                  bridges) and 200 at Corporate Office (no airfield) — 3,086 in all. Captured
                  counts are real: a site with nothing captured shows a dash rather than a
                  placeholder figure.
                </span>
              </div>
            </Panel>
            <div className="mb-3.5 grid grid-cols-2 gap-[9px] md:grid-cols-4">
              {kpi("Sites in Round 1", portfolio.length, "acc")}
              {kpi("Check-points, all sites", portfolio.reduce((n, r) => n + r.checks, 0), "acc")}
              {kpi("Open findings, network", portfolio.reduce((n, r) => n + r.findings, 0), "bad")}
              {kpi("2025 findings carried in", portfolio.reduce((n, r) => n + r.prior, 0), "warn")}
            </div>
            <div className="overflow-x-auto rounded-[15px] border" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {["Site", "Code", "Audit window", "Checklist", "Captured", "NC", "2025 findings"].map((h) => (
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
                  {ENTITIES.map((n) => {
                    const row = portfolio.find((r) => r.code === n.code);
                    const live = !!row && row.captured > 0;
                    const cell = "border-b px-3 py-2.5";
                    const num = `${cell} text-right font-mono tnum`;
                    return (
                      <tr key={n.code}>
                        <td className={`${cell} font-medium`} style={{ borderColor: "var(--line)" }}>
                          {n.name}
                        </td>
                        <td className={`${cell} font-mono text-[11px]`} style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                          {n.short}
                        </td>
                        <td className={cell} style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                          {n.auditFrom && n.auditTo ? auditWindow(n.auditFrom, n.auditTo) : "—"}
                        </td>
                        <td className={num} style={{ borderColor: "var(--line)" }}>
                          {row?.checks ?? "—"}
                        </td>
                        <td className={num} style={{ borderColor: "var(--line)" }}>
                          {live ? `${row!.captured}/${row!.checks}` : <span style={{ color: "var(--ink-4)" }}>—</span>}
                        </td>
                        <td className={num} style={{ borderColor: "var(--line)", color: row?.nc ? "var(--bad)" : "var(--ink-4)" }}>
                          {row?.nc || "—"}
                        </td>
                        <td className={num} style={{ borderColor: "var(--line)", color: row?.prior ? "var(--warn)" : "var(--ink-4)" }}>
                          {row?.prior || "—"}
                        </td>
                      </tr>
                    );
                  })}
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
                        ? Array.from(
                            new Set(checksOf(entityCode, discipline).map((c) => c.system))
                          ).map((sys) => ({
                            key: sys,
                            cs: checksOf(entityCode, discipline, sys),
                            pf: priorFor(entityCode, discipline, sys),
                          }))
                        : disciplines.map((d) => ({
                            key: d,
                            cs: checksOf(entityCode, d),
                            pf: null,
                          }))
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
                                  {pf.key}
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
                {cycleVisits.map((v) => (
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
