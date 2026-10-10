"use client";

/** The activity log — what was captured and synced, by whom, each day.
 *
 *  Sarel's own request, after a sync bug let held-back data through: "Build
 *  an audit log for me to keep track of all sync and captures to see what
 *  was done everyday by whom." This screen is the answer — app-only, reading
 *  local data, nothing added to the SharePoint sync (no new list, no new
 *  columns).
 *
 *  Mirrors the overlay shell ExportPanel.tsx and SyncPanel.tsx already use —
 *  fixed backdrop, a centred panel, the same header-and-IconX pattern — so
 *  this reads as one more screen in that family rather than a new one. */

import { useMemo, useState } from "react";
import {
  useAdhoc,
  useAttendanceRegisters,
  useCaptures,
  useChecks,
  useEntityCode,
  useEntitySyncRuns,
  useEvidenceItems,
  useIncidentReports,
  useInterviewDays,
  usePpeChecks,
  useResponses,
  useSafetyFindings,
  useSiteAccessLogs,
  useSiteDays,
  useToolboxTalks,
  useVisitFindings,
  useVisitHazards,
} from "@/lib/store";
import type { SyncRun } from "@/lib/types";
import { activityEvents, type ActivityEvent } from "@/lib/activity";
import { localDate } from "@/lib/attendance";
import { IconX } from "@/components/ui/icons";

/** Singular/plural for the per-kind counts — see activity.ts for what each
 *  kind means. Falls back to the raw kind name (with a bare "s") for
 *  anything not listed here, so a new kind added later degrades rather than
 *  crashing. */
const KIND_LABEL: Record<string, [string, string]> = {
  finding: ["finding", "findings"],
  hazard: ["hazard", "hazards"],
  "response-desk": ["desk review", "desk reviews"],
  "response-field": ["field verification", "field verifications"],
  adhoc: ["ad-hoc observation", "ad-hoc observations"],
  capture: ["unfiled capture", "unfiled captures"],
  "safety-finding": ["Immediate Safety Finding", "Immediate Safety Findings"],
  "incident-report": ["incident report", "incident reports"],
  "interview-day-open": ["interview day opened", "interview days opened"],
  "interview-entry": ["interview", "interviews"],
  "interview-apology": ["interview apology", "interview apologies"],
  "site-day-open": ["site day opened", "site days opened"],
  "diary-entry": ["diary entry", "diary entries"],
  "ppe-check-open": ["PPE check opened", "PPE checks opened"],
  "ppe-entry": ["PPE check row", "PPE check rows"],
  "toolbox-talk-open": ["toolbox talk opened", "toolbox talks opened"],
  "toolbox-attendee": ["toolbox talk attendee", "toolbox talk attendees"],
  "attendance-register-open": ["attendance register opened", "attendance registers opened"],
  "attendance-row": ["attendance row", "attendance rows"],
  "attendance-apology": ["attendance apology", "attendance apologies"],
  "site-access-log-open": ["site access log", "site access logs"],
  "site-access-visitor": ["site access visitor", "site access visitors"],
  "evidence-item": ["evidence item", "evidence items"],
};

const kindLabel = (kind: string, n: number) => {
  const pair = KIND_LABEL[kind] ?? [kind, `${kind}s`];
  return n === 1 ? pair[0] : pair[1];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-09-15` → `15 Sep 2026`. Built by hand off the string, not a `Date`,
 *  for the same reason localDate() itself is — no UTC round trip to put a
 *  day on the wrong side of midnight. */
function dayHeading(d: string): string {
  const [y, m, day] = d.split("-");
  const mi = Number(m) - 1;
  return `${Number(day)} ${MONTHS[mi] ?? m} ${y}`;
}

/** Groups already-sorted (newest-first) events by a key, preserving the
 *  order each key was first seen — which, because the input is newest-first,
 *  is also "most recently active first". Used for both the by-person and
 *  the by-kind grouping below; neither needs its own sort. */
function groupPreservingOrder<T>(items: T[], keyOf: (t: T) => string): { key: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyOf(item);
    if (!map.has(k)) {
      map.set(k, []);
      order.push(k);
    }
    map.get(k)!.push(item);
  }
  return order.map((key) => ({ key, items: map.get(key)! }));
}

export default function ActivityPanel({ onClose }: { onClose: () => void }) {
  const entityCode = useEntityCode();
  const checks = useChecks();
  const findings = useVisitFindings();
  const hazards = useVisitHazards();
  const responses = useResponses();
  const adhoc = useAdhoc();
  const captures = useCaptures();
  const safetyFindings = useSafetyFindings();
  const incidentReports = useIncidentReports();
  const interviewDays = useInterviewDays();
  const siteDays = useSiteDays();
  const ppeChecks = usePpeChecks();
  const toolboxTalks = useToolboxTalks();
  const attendanceRegisters = useAttendanceRegisters();
  const siteAccessLogs = useSiteAccessLogs();
  const evidenceItems = useEvidenceItems();
  const syncRuns = useEntitySyncRuns();

  const events = useMemo(
    () =>
      activityEvents({
        findings,
        hazards,
        responses,
        checks,
        adhoc,
        captures,
        safetyFindings,
        incidentReports,
        interviewDays,
        siteDays,
        ppeChecks,
        toolboxTalks,
        attendanceRegisters,
        siteAccessLogs,
        evidenceItems,
      }),
    [
      findings, hazards, responses, checks, adhoc, captures, safetyFindings,
      incidentReports, interviewDays, siteDays, ppeChecks, toolboxTalks,
      attendanceRegisters, siteAccessLogs, evidenceItems,
    ]
  );

  const eventsByDay = useMemo(
    () => groupPreservingOrder<ActivityEvent>(events, (e) => localDate(e.at)),
    [events]
  );
  const syncByDay = useMemo(
    () => groupPreservingOrder<SyncRun>(syncRuns, (r) => localDate(r.at)),
    [syncRuns]
  );

  /* The two groupings above are each internally newest-day-first, because
     each one's own input already was — but a day with a sync run and no
     capture (or the reverse) only shows up in one of them, so the two lists
     have to be merged and re-sorted as strings rather than zipped. */
  const days = useMemo(() => {
    const set = new Set<string>([
      ...eventsByDay.map((g) => g.key),
      ...syncByDay.map((g) => g.key),
    ]);
    return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [eventsByDay, syncByDay]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const eventsFor = (day: string) => eventsByDay.find((g) => g.key === day)?.items ?? [];
  const syncFor = (day: string) => syncByDay.find((g) => g.key === day)?.items ?? [];

  const empty = events.length === 0 && syncRuns.length === 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-center overflow-y-auto py-[8vh]"
      style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="h-fit w-[min(720px,92vw)] rounded-[20px] border p-[22px]"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-bold">Activity</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--ink-4)" }}>
            <IconX width={15} height={15} />
          </button>
        </div>
        <p className="mb-3 text-[12px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
          What was captured and synced at {entityCode}, by whom, each day — so a problem
          shows up here before it shows up as a missing record.
        </p>

        {/* THE PERMANENT CAVEAT, not a tooltip nobody opens. "By" is whoever
            the auditor picker said at the moment each row was written —
            self-reported, never verified, and anybody can switch it at any
            time. This log inherits that weakness from the rest of the app
            rather than hiding it; see AUDITORS/setAuditor in store.ts. */}
        <div
          className="mb-4 rounded-[10px] border px-[10px] py-[8px] text-[11px] leading-[1.5]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-3)" }}
        >
          Every &ldquo;by&rdquo; below is whoever the auditor picker said at that moment — self-reported,
          never verified, and switchable by anybody at any time. This log shows who the device
          said was working, not who it was.
        </div>

        {empty && (
          <p className="rounded-[10px] border px-[12px] py-[18px] text-center text-[12px]" style={{ background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-3)" }}>
            No activity yet — nothing captured, and no sync has run.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {days.map((day) => {
            const dayEvents = eventsFor(day);
            const dayRuns = syncFor(day);
            const byPerson = groupPreservingOrder(dayEvents, (e) => e.by || "(nobody set)");
            return (
              <div key={day}>
                <h4 className="mb-1.5 font-mono text-[11px] font-semibold tracking-wide" style={{ color: "var(--ink-3)" }}>
                  {dayHeading(day)}
                </h4>

                {/* THE SYNC SUB-SECTION, DELIBERATELY FIRST AND DELIBERATELY
                    LOUD — this is why the screen exists. A clean sync is
                    quiet; a failed or partial one is not allowed to be. */}
                {dayRuns.map((run) => (
                  <SyncRunCard key={run.id} run={run} />
                ))}

                {byPerson.length === 0 && dayRuns.length > 0 && (
                  <p className="mb-2 text-[11px]" style={{ color: "var(--ink-4)" }}>
                    No captures logged this day.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {byPerson.map(({ key: person, items: personEvents }) => {
                    const byKind = groupPreservingOrder(personEvents, (e) => e.kind);
                    return (
                      <div
                        key={person}
                        className="rounded-[10px] border px-[10px] py-[8px]"
                        style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                      >
                        <div className="mb-1 text-[12px] font-semibold">{person}</div>
                        <div className="flex flex-col gap-1">
                          {byKind.map(({ key: kind, items: kindEvents }) => {
                            const groupKey = `${day}|${person}|${kind}`;
                            const isOpen = expanded.has(groupKey);
                            const container = kindEvents[0]?.byConfidence === "container";
                            return (
                              <div key={kind}>
                                <button
                                  onClick={() => toggle(groupKey)}
                                  className="flex w-full items-center justify-between gap-2 text-left text-[11.5px]"
                                  style={{ color: "var(--ink-2)" }}
                                >
                                  <span>
                                    {kindEvents.length} {kindLabel(kind, kindEvents.length)}
                                    {container && (
                                      <span className="ml-[6px] text-[10px] italic" style={{ color: "var(--ink-4)" }}>
                                        via {person} — not this row&apos;s own signature
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                                    {isOpen ? "hide" : "show"}
                                  </span>
                                </button>
                                {isOpen && (
                                  <ul className="mt-1 ml-[2px] list-disc pl-[14px] text-[11px] leading-[1.6]" style={{ color: "var(--ink-3)" }}>
                                    {kindEvents.map((e, i) => (
                                      <li key={i}>{e.summary}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SyncRunCard({ run }: { run: SyncRun }) {
  const bad = !!run.error;
  const warn = !bad && (run.failed > 0 || run.unlabelled > 0 || run.skipped.length > 0);
  const tone = bad ? "bad" : warn ? "warn" : "good";
  return (
    <div
      className="mb-2 rounded-[10px] border px-[10px] py-[8px] text-[11.5px]"
      style={{
        background: `var(--${tone}-bg)`,
        borderColor: tone === "good" ? "var(--line-2)" : `var(--${tone}-line)`,
        color: `var(--${tone})`,
      }}
    >
      <div className="mb-0.5 font-semibold">
        Sync — {run.by ?? "nobody signed in"}: {run.written} written
        {run.failed > 0 ? `, ${run.failed} failed` : ""}
        {run.unlabelled > 0 ? `, ${run.unlabelled} unlabelled` : ""}
      </div>
      {run.error && <div className="mb-0.5">Stopped: {run.error}</div>}
      {run.skipped.length > 0 && (
        <div>
          Held back: {run.skipped.map((s) => `${s.count} ${s.what}`).join(", ")} — the reason
          each was skipped was shown on the plan at the time and is not kept here.
        </div>
      )}
    </div>
  );
}
