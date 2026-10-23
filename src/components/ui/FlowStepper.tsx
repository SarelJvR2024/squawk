"use client";

/** THE COMPACT FLOW STEPPER — "Step N of 7 · Label", with a link to the
 *  adjacent step on either side. Same seven-step sequence Home's "How the
 *  work flows" section documents in full (src/app/(app)/home/page.tsx) —
 *  Checks → Inspection → Review → Asset Assurance → HIRA → Follow-up →
 *  Dashboard — repeated here as a small, separate list rather than imported
 *  from Home, so this component carries no risk to Home's own stepper.
 *
 *  Deliberately one line: an orientation aid for "where am I in the
 *  sequence", not a second navigation. Returns null off the sequence (e.g. a
 *  route not in FLOW_STEPS) rather than render a broken step count. */

import Link from "next/link";

type FlowStep = { href: string; label: string };

export const FLOW_STEPS: FlowStep[] = [
  { href: "/capture", label: "Checks" },
  { href: "/field", label: "Inspection" },
  { href: "/review", label: "Review" },
  { href: "/findings", label: "Asset Assurance" },
  { href: "/hazards", label: "HIRA" },
  { href: "/closure", label: "Follow-up" },
  { href: "/dashboard", label: "Dashboard" },
];

export function FlowStepper({ current, className = "" }: { current: string; className?: string }) {
  const i = FLOW_STEPS.findIndex((s) => s.href === current);
  if (i === -1) return null;
  const step = FLOW_STEPS[i];
  const prev = FLOW_STEPS[i - 1];
  const next = FLOW_STEPS[i + 1];

  return (
    <div
      className={`flex flex-wrap items-center gap-[6px] font-mono text-[10px] ${className}`}
      style={{ color: "var(--ink-3)" }}
      aria-label="Where this screen sits in the audit flow"
    >
      {prev ? (
        <Link
          href={prev.href}
          title={`Back to ${prev.label}`}
          className="shrink-0 -my-[13px] -mx-2 inline-flex items-center px-2 py-[13px] no-underline hover:underline"
          style={{ color: "var(--ink-3)" }}
        >
          ‹ {prev.label}
        </Link>
      ) : (
        <span aria-hidden className="shrink-0 opacity-0">
          ‹
        </span>
      )}
      <span className="shrink-0">
        Step {i + 1} of {FLOW_STEPS.length} ·{" "}
        <b style={{ color: "var(--ink-2)" }}>{step.label}</b>
      </span>
      {next && (
        <Link
          href={next.href}
          title={`Next: ${next.label}`}
          className="shrink-0 -my-[13px] -mx-2 inline-flex items-center px-2 py-[13px] no-underline hover:underline"
          style={{ color: "var(--ink-3)" }}
        >
          {next.label} ›
        </Link>
      )}
    </div>
  );
}
