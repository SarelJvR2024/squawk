"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checksAt,
  disciplinesAt,
  priorFindingsAt,
  usePortfolio,
  checksOf,
  useAdhoc,
  useAttendanceRegisters,
  useContacts,
  useEvidenceItems,
  useIncidentReports,
  useInterviewDays,
  usePpeChecks,
  useSiteAccessLogs,
  useSystems,
  useToolboxTalks,
  useResponses,
  useSafetyFindings,
  useSiteDays,
  useStore,
  useVerifications,
  useEntity,
  useEntityCode,
  useVisitFindings,
  useVisitId,
} from "@/lib/store";
import { isOutstanding } from "@/lib/evidence";
import { portalIdFor } from "@/lib/sites";
import { auditWindow, ENTITIES, PROGRAMME_VISITS } from "@/lib/programme";
import { BAND_AS_RATING, BAND_META, LIKELIHOODS, SEVERITIES, bandFor, movement, worstBand } from "@/lib/risk";
import { currentRatingOf } from "@/lib/carryforward";
import { mappingFor, worstRating } from "@/lib/crosswalk";
import { AttachmentStrip } from "@/components/Capture";
import { Panel, Pill, type Tone } from "@/components/ui/primitives";
import { DisciplineSelect } from "@/components/ui/DisciplineSelect";
import {
  IconCamera,
  IconCheck,
  IconClipboard,
  IconClock,
  IconFlag,
  IconInbox,
  IconInfo,
  IconLock,
  IconLoop,
  IconMic,
  IconPin,
  IconTeam,
} from "@/components/ui/icons";

/* The entity list, the visit cycle and the (still empty) zone names live in
   src/data/programme.json — adding an airport or a visit is a data change, not
   a code change. Only the live entity carries captured data; the rest are shown
   honestly as not yet audited rather than padded with invented figures. */

type Level = "airport" | "portfolio";

/* 1 of 324 must not read as 0% — an auditor reads that as "nothing started". */
function pct(n: number, total: number) {
  if (!total) return "0%";
  const p = (n / total) * 100;
  if (n > 0 && p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

function complianceTone(v: string | null | undefined): Tone {
  return v === "C" ? "good" : v === "NC" ? "bad" : v === "NV" ? "warn" : "neutral";
}

export default function DashboardPage() {
  const router = useRouter();
  const responses = useResponses();
  const findings = useVisitFindings();
  const entityCode = useEntityCode();
  const entity = useEntity();
  /* THE FORMS AND REGISTERS, on the one screen that is supposed to say where
   *  the whole audit stands. Findings and hazards always had their own tiles
   *  here; ISF, interviews, attendance, evidence and the people directory
   *  never did, so the dashboard under-reported everything that was not the
   *  324 check-points. All five are scoped by entity, same as their own
   *  screens — see each hook's own note on why. */
  const safetyFindings = useSafetyFindings();
  const openIsf = safetyFindings.filter((f) => !f.writtenIssuedAt).length;
  const interviewDays = useInterviewDays();
  const siteDays = useSiteDays();
  const evidenceItems = useEvidenceItems();
  const ppeChecks = usePpeChecks();
  const siteAccessLogs = useSiteAccessLogs();
  const toolboxTalks = useToolboxTalks();
  const incidentReports = useIncidentReports();
  const attendanceRegisters = useAttendanceRegisters();
  const evidenceOutstanding = evidenceItems.filter(isOutstanding).length;
  const contacts = useContacts();
  const contactsHere = contacts.filter((c) => c.site === entityCode).length;
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
  /* The Asset Assurance rating per (discipline, system) pair — the same
     source src/lib/sharepoint.ts's Asset Risk sync and src/lib/exports.ts's
     systemsSheet() already read, not the finding-level heat map this screen
     used to build its risk profile from. Keeping one source means this
     screen, the SharePoint Asset Risk list and the workbook export can never
     disagree about what a system's rating is. */
  const systems = useSystems();
  const adhoc = useAdhoc();

  const [level, setLevel] = useState<Level>("airport");
  /* Every number on this page is for the entity in view. The register is 324
     check-points; this airport's checklist may be 319 or 200, and a percentage
     against the wrong denominator is a number that lies on a page ACSA reads. */
  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const checks = useMemo(() => checksAt(entityCode), [entityCode]);
  const prior = useMemo(() => priorFindingsAt(entityCode), [entityCode]);
  /* "all disciplines allow filter per discipline or all" — Sarel, replacing
     the ACSA SharePoint check-points register this screen now mirrors. "all"
     is the default so the screen opens showing the whole visit, same as the
     register itself before anyone narrows it.

     DELIBERATELY LOCAL, NOT THE SHARED useDisciplineFilter() (src/lib/
     store.ts) Capture/Review/Field/HIRA now read and write. Those four are
     "which discipline am I working in" — the same discipline follows the
     auditor from one to the next. This one is "which discipline's STATS am
     I looking at" on a report the whole team opens, including ACSA's own
     read-only role: it has to open to "all" every time regardless of
     whatever an auditor's phone last had Capture set to, and picking
     "Electrical" to read one discipline's numbers must not reset the
     discipline every other screen is actively working in. */
  const [disciplineFilter, setDisciplineFilter] = useState<string>("all");
  const disciplinesInScope = disciplineFilter === "all" ? disciplines : [disciplineFilter];

  const scope = disciplineFilter === "all" ? checks : checksOf(entityCode, disciplineFilter);

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
    () =>
      disciplineFilter === "all"
        ? findings
        : findings.filter((f) => f.discipline === disciplineFilter),
    [findings, disciplineFilter]
  );

  /* Only ratings the group has agreed on. A severity seeded by an issue button
     is a suggestion and must not appear on ACSA's risk profile as a decision. */
  const rated = scopedFindings.filter((f) => f.ratingConfirmed && f.severity && f.likelihood);
  const bandCount = (b: string) => rated.filter((f) => bandFor(f.severity, f.likelihood) === b).length;

  /* Every (discipline, system) pair in scope, in the same order and from the
     same grouping systemsSheet()'s workbook export and sharepoint.ts's Asset
     Risk sync already use — see the note on `systems` above. */
  const systemPairs = useMemo(() => {
    const seen = new Set<string>();
    const pairs: { discipline: string; system: string; key: string }[] = [];
    for (const c of scope) {
      const system = c.system?.trim() || "No asset system recorded";
      const key = `${c.discipline}|${system}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ discipline: c.discipline, system, key });
    }
    return pairs.sort(
      (a, b) => a.discipline.localeCompare(b.discipline) || a.system.localeCompare(b.system)
    );
  }, [scope]);

  /* The one overall rating this round has produced so far — the worst of every
     AGREED system rating in scope. "Not yet rated" until at least one is, same
     as the register's own column: a dash here must never read as "Acceptable". */
  const overallBand = worstBand(
    systemPairs
      .map((p) => systems[p.key])
      .filter((a) => a?.ratingConfirmed)
      .map((a) => bandFor(a!.severity, a!.likelihood))
  );

  /* "DISTRIBUTION OF RATINGS" — asset systems by discipline, by the tolerance
     the group has agreed for them this round. One row per discipline in
     scope, same shape as the register's own table of that name. */
  const distribution = disciplinesInScope.map((d) => {
    const pairs = systemPairs.filter((p) => p.discipline === d);
    let acceptable = 0;
    let tolerable = 0;
    let unacceptable = 0;
    let notYetRated = 0;
    for (const p of pairs) {
      const a = systems[p.key];
      const band = a?.ratingConfirmed ? bandFor(a.severity, a.likelihood) : null;
      if (!band) {
        notYetRated++;
        continue;
      }
      const rating = BAND_AS_RATING[band];
      if (rating === "Acceptable") acceptable++;
      else if (rating === "Tolerable") tolerable++;
      else unacceptable++;
    }
    const priorD = prior.filter((p) => p.discipline === d);
    const closedD = priorD.filter((p) => verifications[p.portalId]?.outcome === "Closed").length;
    return { discipline: d, acceptable, tolerable, unacceptable, notYetRated, closed: closedD };
  });

  /* prior-finding closure and movement */
  const priorScope =
    disciplineFilter === "all" ? prior : prior.filter((p) => p.discipline === disciplineFilter);
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
    .map((p) => {
      const sys = mappingFor(p).systems;
      if (sys.length === 0) return null;
      return movement(p.tolerance, worstRating(sys.map((s) => currentRating(p.discipline, s))));
    })
    .filter(Boolean);
  const improved = moves.filter((m) => m === "Improved").length;
  const unchanged = moves.filter((m) => m === "Unchanged").length;
  const worsened = moves.filter((m) => m === "Worsened").length;

  /* coverage guard: prior findings whose asset system has no check in scope */
  const noCoverage = priorScope.filter((p) => {
    const m = mappingFor(p);
    if (m.type === "unmapped") return false;
    return m.systems.flatMap((s) => checksOf(entityCode, p.discipline, s)).length === 0;
  }).length;

  const kpi = (label: string, value: string | number, tone?: "good" | "bad" | "warn") => (
    <div
      key={label}
      className="relative overflow-hidden rounded-[16px] border px-[15px] py-[13px]"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <span
        className="absolute inset-x-0 top-0 h-[2.5px]"
        style={{ background: tone ? `var(--${tone})` : "var(--line-3)" }}
      />
      <b
        className="block font-mono text-[23px] leading-[1.15] font-semibold tnum"
        style={{ color: tone ? `var(--${tone})` : "var(--ink)" }}
      >
        {value}
      </b>
      <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </span>
    </div>
  );

  /** A SUBORDINATE READING OF THE SAME WORK, NOT A SIXTH THROUGH NINTH
   *  EQUALLY-WEIGHTED TILE — overnight refinement, task 7: "replace the
   *  nine equally-weighted tile treatments with a clear primary summary
   *  row plus a subordinate status breakdown." The five `kpi()` tiles
   *  above (rating, assessed, compliance%, open findings, prior closed)
   *  ARE the dashboard's headline — the register's own numbers, read
   *  straight off the record. Compliant/Non-compliant/Awaiting evidence/
   *  Not applicable is a breakdown of ONE of those five
   *  ("Check-points assessed"), not four more facts of the same weight,
   *  so it drops the card border, the accent stripe and the 23px number
   *  for a quiet labelled row — a dot, a label, a smaller number — the
   *  same "name it, don't just colour it" rule `kpi`'s own tone already
   *  follows. No number here changes; only how loudly it is drawn. */
  const breakdown = (label: string, value: number, tone?: "good" | "bad" | "warn") => (
    <div key={label} className="flex items-center gap-[7px]">
      <span
        aria-hidden
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: tone ? `var(--${tone})` : "var(--ink-4)" }}
      />
      <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "var(--ink-2)" }}>
        {label}
      </span>
      <b
        className="tnum shrink-0 font-mono text-[13px] font-semibold"
        style={{ color: tone ? `var(--${tone})` : "var(--ink)" }}
      >
        {value}
      </b>
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
                : disciplineFilter === "all"
                  ? `${entity.name} — ${visitLabel}`
                  : `${disciplineFilter} — ${entity.name}`}
            </h2>
            <p className="mt-1 max-w-[78ch] text-[12.5px]" style={{ color: "var(--ink-2)" }}>
              {role === "acsa"
                ? "ACSA view — read-only. Every figure traces to a captured response and its ACSA clause."
                : "Live from capture, field inspection and closure verification."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-[2px] rounded-[11px] p-[3px]" style={{ background: "var(--sunken)" }}>
              {(["airport", "portfolio"] as Level[]).map((l) => (
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
            {level === "airport" && (
              <DisciplineSelect
                value={disciplineFilter}
                onChange={setDisciplineFilter}
                className="w-auto"
                options={[
                  { value: "all", label: "All disciplines" },
                  ...disciplines.map((d) => ({ value: d, label: d })),
                ]}
              />
            )}
            {/* Which role you're viewing as is state, not a selection or a
                primary action — item 4 of Sarel's second visual-hierarchy
                pass takes the brand accent off TPJV so it reads the same
                neutral the ACSA case beside it already does. */}
            <Pill tone="neutral">{role === "acsa" ? "READ-ONLY" : "TPJV"}</Pill>
          </div>
        </div>

        {level === "portfolio" ? (
          <>
            {/* Reference information, not a status — item 4 of Sarel's
                second visual-hierarchy pass takes the brand accent off
                this callout. */}
            <Panel className="mb-3.5">
              <div className="flex items-start gap-2.5 text-[11.5px]" style={{ color: "var(--ink-2)" }}>
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
            {/* Plain counts, not statuses — item 4 of Sarel's second
                visual-hierarchy pass takes the brand accent off both. */}
            <div className="mb-3.5 grid grid-cols-2 gap-[9px] md:grid-cols-4">
              {kpi("Sites in Round 1", portfolio.length)}
              {kpi("Check-points, all sites", portfolio.reduce((n, r) => n + r.checks, 0))}
              {kpi("Open findings, network", portfolio.reduce((n, r) => n + r.findings, 0), "bad")}
              {kpi("2025 findings carried in", portfolio.reduce((n, r) => n + r.prior, 0), "warn")}
            </div>
            <div className="overflow-x-auto rounded-[16px] border" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
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
                          {n.auditFrom && n.auditTo ? auditWindow(n.auditFrom, n.auditTo, n.auditTbc) : "—"}
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
            {/* The five tiles the ACSA check-points register itself opens with —
                Oct 2026 rating, check-points assessed, demonstrated compliance,
                open findings, prior findings closed. Same numbers the register
                prints, read straight off the record rather than retyped. */}
            <div className="mb-[9px] grid grid-cols-2 gap-[9px] md:grid-cols-5">
              {kpi(`${visitLabel} rating`, overallBand ? BAND_AS_RATING[overallBand] : "Not yet rated", overallBand ? BAND_META[overallBand].tone : undefined)}
              {/* A plain count, not a status. */}
              {kpi("Check-points assessed", `${stats.captured}/${stats.total}`)}
              {kpi("Demonstrated compliance", pct(stats.C, stats.C + stats.NC + stats.NV), stats.NC ? "warn" : "good")}
              {kpi("Open findings", scopedFindings.length, scopedFindings.length ? "bad" : "good")}
              {/* Not fully closed yet is outstanding work, the same warn
                  every other not-yet-done status already uses — item 4 of
                  Sarel's second visual-hierarchy pass takes the brand
                  accent off it. */}
              {kpi(
                "Prior findings closed",
                `${closed}/${priorScope.length}`,
                priorScope.length && closed === priorScope.length ? "good" : "warn"
              )}
            </div>
            <div className="mb-3.5 border-t pt-2.5" style={{ borderColor: "var(--line)" }}>
              <span className="label-xs" style={{ color: "var(--ink-4)" }}>
                Check-points assessed, by outcome
              </span>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                {breakdown("Compliant", stats.C, "good")}
                {breakdown("Non-compliant", stats.NC, "bad")}
                {breakdown("Awaiting evidence", stats.NV, "warn")}
                {breakdown("Not applicable", stats.NA)}
              </div>
            </div>

            {/* `items-start` — overnight refinement, task 7: "do not stretch
                the risk panel to match the full height of the asset table."
                A CSS grid row stretches every item to the tallest one by
                default; the asset table runs to as many rows as this site
                has asset systems (dozens, easily), and the risk profile
                below is a fixed 5×4 heat map plus a three-line legend —
                stretched to match, its card grew a few hundred px of empty
                space under a tiny table. `items-start` lets each card be
                exactly as tall as its own content, side by side. */}
            <div className="mb-3.5 grid items-start gap-3.5 lg:grid-cols-[1.4fr_1fr]">
              {/* "ASSET SYSTEMS: RISK TO OPERATIONS" — the register's own table,
                  same name, same source (SystemAssessment) as the Asset Risk
                  SharePoint list and the workbook export's "Asset systems"
                  sheet. Severity/likelihood/tolerance are blank, not guessed,
                  until the group has agreed them — see `agreed` below, same
                  gate systemsSheet() and sharepoint.ts's assetRisk push use. */}
              <div className="rounded-[16px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="text-[12.5px] font-bold">Asset systems: risk to operations</h3>
                  {/* A DELIBERATE, NAMED OVERFLOW — overnight refinement, task
                      7: "if mobile width forces overflow, make that overflow
                      deliberate and accessible... not illegible compressed
                      columns." Six columns of real words (Discipline, Asset
                      system, Severity, Likelihood, Tolerance) do not fit a
                      390px phone without either this table scrolling
                      sideways or every column's text being squeezed to the
                      point of guessing. `whitespace-nowrap` on every cell
                      below picks the first: nothing compresses, the table
                      runs past the card's width instead, and the
                      `overflow-x-auto` wrapper turns that into a real
                      horizontal scroll rather than a clipped, unreadable
                      edge. This caption is the "deliberate" half — plain
                      visible text, not a decorative-only cue a screen
                      reader would miss — shown only where the overflow can
                      actually happen. */}
                  <span className="shrink-0 font-mono text-[9px] sm:hidden" style={{ color: "var(--ink-4)" }}>
                    ↔ scroll for every column
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr>
                        {[
                          ...(disciplineFilter === "all" ? ["Discipline"] : []),
                          "Asset system",
                          "Assessed",
                          "Severity",
                          "Likelihood",
                          "Tolerance",
                        ].map((h) => (
                          <th
                            key={h}
                            className="border-b px-2.5 py-2 text-left font-mono text-[8.5px] tracking-[0.09em] whitespace-nowrap uppercase"
                            style={{ borderColor: "var(--line)", color: "var(--ink-4)" }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {systemPairs.map((p) => {
                        const cs = checksOf(entityCode, p.discipline, p.system);
                        const done = cs.filter((c) => responses[c.id]?.captured).length;
                        const a = systems[p.key];
                        const agreed = a?.ratingConfirmed === true;
                        const band = agreed ? bandFor(a!.severity, a!.likelihood) : null;
                        return (
                          <tr key={p.key}>
                            {disciplineFilter === "all" && (
                              <td
                                className="border-b px-2.5 py-2.5 whitespace-nowrap"
                                style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
                              >
                                {p.discipline}
                              </td>
                            )}
                            <td className="border-b px-2.5 py-2.5 font-medium whitespace-nowrap" style={{ borderColor: "var(--line)" }}>
                              {p.system}
                            </td>
                            <td className="border-b px-2.5 py-2.5 text-right font-mono tnum whitespace-nowrap" style={{ borderColor: "var(--line)" }}>
                              {done}/{cs.length}
                            </td>
                            <td className="border-b px-2.5 py-2.5 whitespace-nowrap" style={{ borderColor: "var(--line)" }}>
                              {agreed ? a!.severity : <span style={{ color: "var(--ink-4)" }}>—</span>}
                            </td>
                            <td className="border-b px-2.5 py-2.5 whitespace-nowrap" style={{ borderColor: "var(--line)" }}>
                              {agreed ? a!.likelihood : <span style={{ color: "var(--ink-4)" }}>—</span>}
                            </td>
                            <td className="border-b px-2.5 py-2.5 whitespace-nowrap" style={{ borderColor: "var(--line)" }}>
                              {/* NOT YET RATED IS NOT A ZERO — already true before this
                                  pass (a neutral pill, never a colour implying a band),
                                  kept exactly as it was; task 7 only asked for the
                                  overflow fix above, this cell's own logic is untouched. */}
                              {agreed && band ? (
                                <Pill tone={BAND_META[band].tone}>{BAND_AS_RATING[band]}</Pill>
                              ) : (
                                <Pill tone="neutral">Not yet rated</Pill>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {systemPairs.length === 0 && (
                        <tr>
                          <td
                            colSpan={disciplineFilter === "all" ? 6 : 5}
                            className="px-2.5 py-3 text-center"
                            style={{ color: "var(--ink-4)" }}
                          >
                            No asset systems in scope.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ACSA B170 001M heat map */}
              <div className="rounded-[16px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
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
                              className="h-[38px] rounded-[8px] text-center font-mono text-[12.5px] font-semibold"
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
                      <i className="h-[9px] w-[9px] rounded-[8px]" style={{ background: `var(--${t})` }} />
                      {label}
                    </span>
                  ))}
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                  {(["Red", "Amber", "Green"] as const).map((b) => (
                    <div key={b} className="rounded-[8px] py-1.5" style={{ background: "var(--sunken)" }}>
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

            {/* "DISTRIBUTION OF RATINGS" — asset systems by discipline, by the
                tolerance the group has agreed for them this round, same
                table the register itself prints under this name. */}
            <div className="mb-3.5 rounded-[16px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
              <h3 className="mb-3 text-[12.5px] font-bold">Distribution of ratings</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr>
                      {["Audit area", "Acceptable", "Tolerable", "Unacceptable", "Not yet rated", "Closed"].map(
                        (h) => (
                          <th
                            key={h}
                            className="border-b px-2.5 py-2 text-left font-mono text-[8.5px] tracking-[0.09em] uppercase"
                            style={{ borderColor: "var(--line)", color: "var(--ink-4)" }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {distribution.map((row) => (
                      <tr key={row.discipline}>
                        <td className="border-b px-2.5 py-2.5 font-medium" style={{ borderColor: "var(--line)" }}>
                          {row.discipline}
                        </td>
                        <td
                          className="border-b px-2.5 py-2.5 text-right font-mono tnum"
                          style={{ borderColor: "var(--line)", color: row.acceptable ? "var(--good)" : "var(--ink-4)" }}
                        >
                          {row.acceptable || "0"}
                        </td>
                        <td
                          className="border-b px-2.5 py-2.5 text-right font-mono tnum"
                          style={{ borderColor: "var(--line)", color: row.tolerable ? "var(--warn)" : "var(--ink-4)" }}
                        >
                          {row.tolerable || "0"}
                        </td>
                        <td
                          className="border-b px-2.5 py-2.5 text-right font-mono tnum"
                          style={{ borderColor: "var(--line)", color: row.unacceptable ? "var(--bad)" : "var(--ink-4)" }}
                        >
                          {row.unacceptable || "0"}
                        </td>
                        <td className="border-b px-2.5 py-2.5 text-right font-mono tnum" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                          {row.notYetRated || "0"}
                        </td>
                        <td className="border-b px-2.5 py-2.5 text-right font-mono tnum" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                          {row.closed || "0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* cycle movement */}
            <div className="rounded-[16px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
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
                {/* Outstanding verification work is exactly the same warn
                    "not yet done" already means everywhere else — item 4
                    of Sarel's second visual-hierarchy pass takes the
                    brand accent off it. */}
                {kpi("Still to verify", priorScope.length - verified, "warn")}
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

            {/* The five registers that live outside the 324 check-points —
                Sarel: "make sure the dashboard is updated, all forms and
                registers is done." Each tile is a shortcut to its own
                screen, same reason the whole dashboard exists: a number
                nobody can act on from here is a number that gets ignored. */}
            <div className="mt-3.5 rounded-[16px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
              <h3 className="mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12.5px] font-bold">
                  <IconInbox width={14} height={14} style={{ color: "var(--acc)" }} />
                  Forms and registers
                </span>
                {role !== "acsa" && (
                  <button
                    onClick={() => router.push("/forms")}
                    className="text-[11px] font-semibold underline"
                    style={{ color: "var(--acc)" }}
                  >
                    All forms, one list →
                  </button>
                )}
              </h3>
              <div className="grid grid-cols-2 gap-[9px] md:grid-cols-4">
                {[
                  {
                    label: "Open ISF",
                    value: openIsf,
                    tone: openIsf ? "bad" : "good",
                    icon: <IconClock width={13} height={13} />,
                    href: "/isf",
                  },
                  /* Interviews, attendance, evidence and people are hidden
                     from ACSA here for the same reason they are hidden from
                     ACSA's More menu — ACSA is read-only on the audit itself,
                     not on the project-evidence forms. Safety has no such
                     gate in the menu either, so it stays visible above. */
                  ...(role !== "acsa"
                    ? [
                        /* Plain record counts, not statuses — item 4 of
                           Sarel's second visual-hierarchy pass takes the
                           brand accent off every one of these (tone
                           undefined falls back to the same neutral the
                           tile renderer below gives any tile with
                           nothing to flag). */
                        {
                          label: "Interview days",
                          value: interviewDays.length,
                          tone: undefined,
                          icon: <IconMic width={13} height={13} />,
                          href: "/interviews",
                        },
                        {
                          label: "Attendance registers",
                          value: attendanceRegisters.length,
                          tone: undefined,
                          icon: <IconTeam width={13} height={13} />,
                          href: "/attendance",
                        },
                        {
                          label: "Daily diary",
                          value: siteDays.filter((d) => d.diaryEntries.length > 0).length,
                          tone: undefined,
                          icon: <IconClipboard width={13} height={13} />,
                          href: "/diary",
                        },
                        {
                          label: "PPE checks",
                          value: ppeChecks.length,
                          tone: undefined,
                          icon: <IconCheck width={13} height={13} />,
                          href: "/ppe",
                        },
                        {
                          label: "Site access logs",
                          value: siteAccessLogs.length,
                          tone: undefined,
                          icon: <IconPin width={13} height={13} />,
                          href: "/site-access",
                        },
                        {
                          label: "Toolbox talks",
                          value: toolboxTalks.length,
                          tone: undefined,
                          icon: <IconMic width={13} height={13} />,
                          href: "/toolbox-talk",
                        },
                        {
                          label: "Incidents / near misses",
                          value: incidentReports.length,
                          tone: incidentReports.length ? "warn" : "good",
                          icon: <IconFlag width={13} height={13} />,
                          href: "/incident",
                        },
                        {
                          label: "Days not closed out",
                          value: siteDays.filter((d) => !d.closeoutLeadSignature).length,
                          tone: siteDays.filter((d) => !d.closeoutLeadSignature).length ? "warn" : "good",
                          icon: <IconLock width={13} height={13} />,
                          href: "/closeout",
                        },
                        {
                          label: "Evidence outstanding",
                          value: evidenceOutstanding,
                          tone: evidenceOutstanding ? "warn" : "good",
                          icon: <IconInbox width={13} height={13} />,
                          href: "/evidence",
                        },
                        {
                          label: "People on file",
                          value: contactsHere,
                          tone: undefined,
                          icon: <IconTeam width={13} height={13} />,
                          href: "/people",
                        },
                      ]
                    : []),
                ].map((t) => (
                  <button
                    key={t.label}
                    onClick={() => router.push(t.href)}
                    className="relative overflow-hidden rounded-[16px] border px-[15px] py-[13px] text-left transition-[var(--t)] hover:bg-[var(--sunken)]"
                    style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                  >
                    <span
                      className="absolute inset-x-0 top-0 h-[2.5px]"
                      style={{ background: t.tone ? `var(--${t.tone})` : "var(--line-3)" }}
                    />
                    <span
                      className="flex items-center gap-1.5"
                      style={{ color: t.tone ? `var(--${t.tone})` : "var(--ink)" }}
                    >
                      {t.icon}
                      <b className="font-mono text-[20px] leading-[1.15] font-semibold tnum">{t.value}</b>
                    </span>
                    <span className="mt-[2px] block text-[10px]" style={{ color: "var(--ink-3)" }}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* "CHECK-POINTS" — every check in scope, grouped by asset system,
                same grouping the register prints under this name. Collapsed
                by default (native <details>, no extra state) — the register
                runs to hundreds of rows and nobody reads all of them at once. */}
            <div className="mt-3.5 rounded-[16px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
              <h3 className="mb-3 text-[12.5px] font-bold">Check-points</h3>
              <div className="flex flex-col gap-2">
                {systemPairs.map((p) => {
                  const cs = checksOf(entityCode, p.discipline, p.system);
                  const done = cs.filter((c) => responses[c.id]?.captured).length;
                  return (
                    <details
                      key={p.key}
                      className="rounded-[11px] border px-3 py-2"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <summary className="cursor-pointer text-[12px] font-semibold">
                        {disciplineFilter === "all" ? `${p.discipline} · ` : ""}
                        {p.system}{" "}
                        <span className="font-mono text-[10.5px] font-normal" style={{ color: "var(--ink-3)" }}>
                          {done}/{cs.length} assessed
                        </span>
                      </summary>
                      <div className="mt-2 flex flex-col gap-2.5 border-t pt-2.5" style={{ borderColor: "var(--line)" }}>
                        {cs.map((c) => {
                          const r = responses[c.id];
                          const photos = (r?.attachments ?? []).filter((a) => a.kind === "photo");
                          return (
                            <div key={c.id} className="rounded-[8px] px-2.5 py-2" style={{ background: "var(--sunken)" }}>
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <span className="font-mono text-[10.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
                                  {portalIdFor(entityCode, c.id)}
                                </span>
                                <Pill tone={complianceTone(r?.compliance)}>{r?.compliance ?? "Not captured"}</Pill>
                              </div>
                              <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink)" }}>
                                {c.requirement}
                              </p>
                              {r?.observation && (
                                <p className="mt-1 text-[11px]" style={{ color: "var(--ink-2)" }}>
                                  {r.observation}
                                </p>
                              )}
                              {photos.length > 0 && (
                                <div className="mt-1.5">
                                  <AttachmentStrip attachments={photos} thumbSize={40} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
                {systemPairs.length === 0 && (
                  <p className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                    No check-points in scope.
                  </p>
                )}
              </div>
            </div>

            {/* The register's own end-of-report photograph gallery, for this
                screen the walkabout's own observations — not tied to a
                check-point, so they do not appear in "Check-points" above. */}
            {(() => {
              const walkItems = adhoc.filter(
                (w) => disciplineFilter === "all" || w.discipline === disciplineFilter
              );
              const withPhotos = walkItems.filter((w) => w.attachments.some((a) => a.kind === "photo"));
              if (withPhotos.length === 0) return null;
              return (
                <div className="mt-3.5 rounded-[16px] border p-[17px]" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
                  <h3 className="mb-3 flex items-center gap-2 text-[12.5px] font-bold">
                    <IconCamera width={14} height={14} style={{ color: "var(--acc)" }} />
                    Site walkabout photographs
                  </h3>
                  <div className="flex flex-col gap-3">
                    {withPhotos.map((w) => (
                      <div key={w.id} className="rounded-[8px] px-2.5 py-2" style={{ background: "var(--sunken)" }}>
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
                          {w.id}
                          {w.discipline && <Pill tone="neutral">{w.discipline}</Pill>}
                        </div>
                        <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink)" }}>
                          {w.description} — {w.area}
                        </p>
                        <div className="mt-1.5">
                          <AttachmentStrip
                            attachments={w.attachments.filter((a) => a.kind === "photo")}
                            thumbSize={40}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
