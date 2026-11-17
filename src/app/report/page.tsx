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

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useEntityCode, useResponses, useStore, useVisitFindings, useVisits } from "@/lib/store";
import ReviewRiskReport from "@/components/ReviewRiskReport";

function ReportInner() {
  const searchParams = useSearchParams();
  const discipline = searchParams.get("discipline") ?? "";

  /* Same hydration gate AppShell gives every other screen — see that
     component's own note on the hydration race. This page has no shell to
     borrow it from. */
  const hydrated = useStore((s) => s.hydrated);
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const findings = useVisitFindings();
  const responses = useResponses();
  const visits = useVisits(entityCode);
  const visitLabel = visits.find((v) => v.id === visitId)?.label ?? visitId;

  const scoped = useMemo(
    () => findings.filter((f) => f.discipline === discipline),
    [findings, discipline]
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
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-[8px] px-4 py-2 text-[12px] font-semibold"
          style={{ background: "#2D1956", color: "#FFFFFF" }}
        >
          Download PDF
        </button>
      </div>
      <ReviewRiskReport
        findings={scoped}
        discipline={discipline}
        entityCode={entityCode}
        responses={responses}
        visitLabel={visitLabel}
        auditor={auditor}
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
