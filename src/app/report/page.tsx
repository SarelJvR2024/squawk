"use client";

/** THE PRINTABLE ROOT-CAUSE REPORT — a standalone route, deliberately OUTSIDE
 *  the `(app)` route group so it does NOT get AppShell's nav bars. A report
 *  meant to be printed or saved as a PDF should look like a report on screen
 *  too, not like the app with a table in it, and nothing here needs the
 *  nav's search, role switcher or sync status.
 *
 *  Reads only `?discipline=` from the URL — everything else (entity, visit,
 *  the findings themselves, the auditor's name) comes off the SAME persisted
 *  store a new tab opened from the Review page already shares, via
 *  IndexedDB. No entity/visit param to keep in sync, no risk of it reading a
 *  stale query string: see ReviewRiskReport.tsx for the report itself. */

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useVerifications, useEntityCode, useEvidenceItems, useResponses, useStore, useVisitFindings, useVisits } from "@/lib/store";
import { useOutstanding } from "@/lib/carryforward";
import ReviewRiskReport, { ALL_DISCIPLINES_LABEL, type PreviousFindingRow } from "@/components/ReviewRiskReport";
import { downloadReportPdf } from "@/lib/reportPdf";

function ReportInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("discipline") ?? "";
  /* `all` = the airport-wide report: every discipline at this airport. */
  const wholeAirport = raw.toLowerCase() === "all";
  const discipline = wholeAirport ? ALL_DISCIPLINES_LABEL : raw;
  const [busy, setBusy] = useState(false);
  const [annexure, setAnnexure] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* Same hydration gate AppShell gives every other screen — see that
     component's own note on the hydration race. This page has no shell to
     borrow it from. */
  const hydrated = useStore((s) => s.hydrated);
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const findings = useVisitFindings();
  const responses = useResponses();
  const evidenceItems = useEvidenceItems();
  const visits = useVisits(entityCode);
  const visitLabel = visits.find((v) => v.id === visitId)?.label ?? visitId;

  const scoped = useMemo(
    () => (wholeAirport ? findings : findings.filter((f) => f.discipline === discipline)),
    [findings, discipline, wholeAirport]
  );

  const outstanding = useOutstanding();
  const verifications = useVerifications();
  const previous = useMemo<PreviousFindingRow[]>(
    () =>
      outstanding
        .filter((o) => wholeAirport || o.discipline === discipline)
        .map((o) => {
          const v = verifications[o.key];
          const notes = [
            ...(v?.progress ?? []).map((n) => n.note),
            v?.action ? `Action: ${v.action}` : "",
            v?.evidence ? `Evidence: ${v.evidence}` : "",
          ].filter((t) => t && t.trim());
          return {
            key: o.key,
            discipline: o.discipline,
            system: o.system,
            raisedAt: o.originLabel,
            finding: o.finding,
            rating: o.rating,
            status: v?.outcome ?? "Not yet verified",
            comments: notes,
          };
        }),
    [outstanding, verifications, discipline, wholeAirport]
  );

  if (!hydrated) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <p className="text-[12px]" style={{ color: "#5B5570" }}>Loading your audit…</p>
      </div>
    );
  }

  if (!discipline) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-8 text-center">
        <p className="text-[13px]" style={{ color: "#5B5570" }}>
          No discipline given — open this report from the &ldquo;Generate report&rdquo; button on the Review
          page&rsquo;s Risk &amp; root cause tab, with a discipline picked in its filters.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Screen-only toolbar — hidden in print via .rr-report-toolbar's own
          @media print rule in ReviewRiskReport.tsx, so it never shows up on
          the PDF itself. */}
      <div
        className="rr-report-toolbar sticky top-0 z-10 flex items-center justify-between border-b px-5 py-3"
        style={{ background: "#FFFFFF", borderColor: "#DEDAEA" }}
      >
        <span className="text-[12px]" style={{ color: "#5B5570" }}>
          Report preview &mdash; {discipline}
        </span>
        <div className="flex items-center gap-3">
          {err && (
            <span className="text-[11px]" style={{ color: "#B3261E" }}>
              {err}
            </span>
          )}
          <label className="flex items-center gap-2 text-[12px]" style={{ color: "#2D1956" }}>
            <input type="checkbox" checked={annexure} onChange={(e) => setAnnexure(e.target.checked)} />
            Include Photographic Annexure
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-[8px] border px-3 py-2 text-[12px] font-semibold"
            style={{ borderColor: "#DEDAEA", color: "#2D1956", background: "#FFFFFF" }}
          >
            Print
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const root = document.querySelector<HTMLElement>(".rr-report-page");
                if (!root) throw new Error("Report not on screen yet");
                const day = new Date().toISOString().slice(0, 10);
                await downloadReportPdf(
                  root,
                  `Root-cause-report-${entityCode}-${discipline.replace(/\s+/g, "-")}-${day}.pdf`,
                  { header: `Squawk Assurance \u00b7 ${discipline} \u00b7 ${entityCode} \u00b7 ${visitLabel}` }
                );
              } catch (e) {
                setErr(`Could not create the PDF (${e instanceof Error ? e.message : "unknown error"}). Use Print and choose Save as PDF.`);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-[8px] px-4 py-2 text-[12px] font-semibold disabled:opacity-60"
            style={{ background: "#2D1956", color: "#FFFFFF" }}
          >
            {busy ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>
      </div>
      <ReviewRiskReport
        findings={scoped}
        discipline={discipline}
        entityCode={entityCode}
        responses={responses}
        evidenceItems={evidenceItems}
        visitLabel={visitLabel}
        auditor={auditor}
        previous={previous}
        photoAnnexure={annexure}
      />
    </>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-[13px]">Loading…</div>}>
      <ReportInner />
    </Suspense>
  );
}
