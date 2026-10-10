/** The activity log — every capture and sync event at an entity, normalised
 *  into one flat, sortable list.
 *
 *  Sarel, after a sync bug let held-back data through: "Build an audit log
 *  for me to keep track of all sync and captures to see what was done
 *  everyday by whom." This is the "what was captured" half of that; SyncRun
 *  (see types.ts) is the "what was synced" half, read separately by
 *  ActivityPanel.tsx.
 *
 *  PURE, like exports.ts and buildPlan() in sharepoint.ts — no React, no
 *  store read inside it. Every record this needs comes in on `input`, so it
 *  can be unit-tested with hand-built fixtures and so a screen cannot forget
 *  which slice of the store it meant to read.
 *
 *  TWO KINDS OF "WHO", AND THIS FILE NEVER BLURS THEM.
 *
 *    direct      the record carries its own who-field — createdBy,
 *                capturedBy, openedBy, raisedBy, whatever this type calls
 *                it. The record itself is the evidence of who did it.
 *    container   the row has no who-field of its own (an AttendanceRow, a
 *                PpeEntry, a DiaryEntry — about ten shapes across this
 *                app) and is attributed to whoever opened the container it
 *                lives in. That is the best attribution available, and it
 *                is also not the same claim as "this person wrote this
 *                row" — somebody else at the table could have signed it.
 *                `byConfidence: "container"` exists so a screen can show
 *                that difference rather than hide it.
 *
 *  Import types only, by relative path rather than the `@/lib/...` alias
 *  every client file in this app uses — the one deliberate deviation from
 *  that convention, and it is what lets this file run under plain `node`
 *  in tests/activity.test.mjs with no alias loader: a type-only import is
 *  erased before anything tries to resolve the specifier, so there is
 *  nothing here for Node to resolve at all. See src/lib/risk.ts, which
 *  already does the same thing for the same reason. */

import type {
  AdHocItem,
  AttendanceRegister,
  Capture,
  Check,
  EvidenceItem,
  Finding,
  Hazard,
  IncidentReport,
  InterviewDay,
  PpeCheck,
  Response,
  SafetyFinding,
  SiteAccessLog,
  SiteDay,
  ToolboxTalk,
} from "./types";

export interface ActivityEvent {
  at: number;
  by: string;
  byConfidence: "direct" | "container";
  kind: string;
  summary: string;
}

export interface ActivityInput {
  findings: Finding[];
  hazards: Hazard[];
  /** Keyed by checkId, same shape the store holds it in — see VisitData in
   *  store.ts. */
  responses: Record<string, Response>;
  /** So a response can be read back as a point id and, one day, a
   *  discipline — see pointLabel() below. */
  checks: Check[];
  adhoc: AdHocItem[];
  captures: Capture[];
  safetyFindings: SafetyFinding[];
  incidentReports: IncidentReport[];
  interviewDays: InterviewDay[];
  siteDays: SiteDay[];
  ppeChecks: PpeCheck[];
  toolboxTalks: ToolboxTalk[];
  attendanceRegisters: AttendanceRegister[];
  siteAccessLogs: SiteAccessLog[];
  evidenceItems: EvidenceItem[];
}

const COMPLIANCE_LABEL: Record<string, string> = {
  C: "Compliant",
  NC: "Non-compliant",
  "N/A": "Not applicable",
  NV: "Not available",
};

const complianceLabel = (c: string | null) =>
  c ? COMPLIANCE_LABEL[c] ?? c : "not yet rated";

/** The point id a reader recognises — "KSIA-ELE-001" — falling back to the
 *  raw checkId if the register this response belongs to is not in `checks`.
 *  A response must never go missing from the log just because the check it
 *  answers could not be looked up. */
const pointLabel = (checkId: string, checks: Check[]): string =>
  checks.find((c) => c.id === checkId)?.id ?? checkId;

/** Every capture and sync-adjacent event in `input`, newest first.
 *
 *  Deliberately does NOT walk Attachment arrays nested inside Response,
 *  AdHocItem, SafetyFinding or IncidentReport as a separate event kind. The
 *  capture those photographs and voice notes are evidence FOR is already one
 *  of the events below — the response that was answered, the ad-hoc item
 *  that was raised, the ISF that was recorded — and counting the attachment
 *  a second time would be the exact double-count assignCapture's own
 *  mutually-exclusive storage (see store.ts) is careful to avoid for
 *  Captures. A Capture still sitting unfiled in the tray is its own event
 *  because, unlike an Attachment, nothing else in this list speaks for it. */
export function activityEvents(input: ActivityInput): ActivityEvent[] {
  const out: ActivityEvent[] = [];

  for (const f of input.findings) {
    out.push({
      at: f.createdAt,
      by: f.createdBy,
      byConfidence: "direct",
      kind: "finding",
      summary: `Finding raised: ${f.title || f.description || "untitled"}`,
    });
  }

  for (const h of input.hazards) {
    out.push({
      at: h.createdAt,
      by: h.createdBy,
      byConfidence: "direct",
      kind: "hazard",
      summary: `Hazard raised: ${h.event}`,
    });
  }

  for (const r of Object.values(input.responses)) {
    const point = pointLabel(r.checkId, input.checks);
    const label = complianceLabel(r.compliance);
    if (r.deskDoneAt != null) {
      out.push({
        at: r.deskDoneAt,
        by: r.deskDoneBy,
        byConfidence: "direct",
        kind: "response-desk",
        summary: `Answered ${point} (desk) — ${label}`,
      });
    }
    if (r.fieldDoneAt != null) {
      out.push({
        at: r.fieldDoneAt,
        by: r.fieldDoneBy,
        byConfidence: "direct",
        kind: "response-field",
        summary: `Answered ${point} (field) — ${label}`,
      });
    }
  }

  for (const a of input.adhoc) {
    out.push({
      at: a.createdAt,
      by: a.createdBy,
      byConfidence: "direct",
      kind: "adhoc",
      summary: `Ad-hoc observation: ${a.description}`,
    });
  }

  for (const c of input.captures) {
    out.push({
      at: c.createdAt,
      by: c.createdBy,
      byConfidence: "direct",
      kind: "capture",
      summary: `${c.kind === "photo" ? "Photo" : "Voice note"} captured, not yet filed`,
    });
  }

  for (const s of input.safetyFindings) {
    const who =
      s.raisedBy && s.raisedBy !== s.recordedBy
        ? `${s.recordedBy} (raised by ${s.raisedBy})`
        : s.recordedBy;
    out.push({
      at: s.raisedAt,
      by: s.recordedBy,
      byConfidence: "direct",
      kind: "safety-finding",
      summary: `Immediate Safety Finding — ${who}: ${s.description || "no description yet"}`,
    });
  }

  for (const i of input.incidentReports) {
    out.push({
      at: i.createdAt,
      by: i.completedBy,
      byConfidence: "direct",
      kind: "incident-report",
      summary: `${i.isNearMiss ? "Near miss" : "Incident"} report completed: ${i.description || "no description yet"}`,
    });
  }

  for (const d of input.interviewDays) {
    out.push({
      at: d.openedAt,
      by: d.openedBy,
      byConfidence: "direct",
      kind: "interview-day-open",
      summary: `Interview day opened — ${d.date}${d.location ? `, ${d.location}` : ""}`,
    });
    for (const e of d.entries) {
      out.push({
        at: e.createdAt,
        by: d.openedBy,
        byConfidence: "container",
        kind: "interview-entry",
        summary: `Interview: ${e.name}${e.role ? ` (${e.role})` : ""}`,
      });
    }
    for (const ap of d.apologies ?? []) {
      out.push({
        at: ap.createdAt,
        by: d.openedBy,
        byConfidence: "container",
        kind: "interview-apology",
        summary: `Apology (interview): ${ap.name}${ap.reason ? ` — ${ap.reason}` : ""}`,
      });
    }
  }

  for (const d of input.siteDays) {
    out.push({
      at: d.openedAt,
      by: d.openedBy,
      byConfidence: "direct",
      kind: "site-day-open",
      summary: `Site day opened — ${d.date}${d.location ? `, ${d.location}` : ""}`,
    });
    /* d.entries (AttendanceEntry[]) — the legacy TK-003 form 2 register
       SiteDay still carries alongside the diary — is deliberately left out
       here. AttendanceRegister/AttendanceRow below is the current sign-in
       model this log otherwise covers end to end, and SiteDay's own
       comment in types.ts already says AttendanceRegister replaced it as
       of 3 October 2026. Covering a superseded second attendance shape
       was judged not worth the duplication; see the write-up for this
       decision. */
    for (const e of d.diaryEntries) {
      out.push({
        at: e.createdAt,
        by: d.openedBy,
        byConfidence: "container",
        kind: "diary-entry",
        summary: `Diary (${e.category}): ${e.text}`,
      });
    }
  }

  for (const c of input.ppeChecks) {
    out.push({
      at: c.openedAt,
      by: c.openedBy,
      byConfidence: "direct",
      kind: "ppe-check-open",
      summary: `PPE check opened — ${c.location || c.date}`,
    });
    for (const p of c.people) {
      out.push({
        at: p.createdAt,
        by: c.openedBy,
        byConfidence: "container",
        kind: "ppe-entry",
        summary: `PPE check row for ${p.name}`,
      });
    }
  }

  for (const t of input.toolboxTalks) {
    out.push({
      at: t.openedAt,
      by: t.openedBy,
      byConfidence: "direct",
      kind: "toolbox-talk-open",
      summary: `Toolbox talk opened — ${t.topic}`,
    });
    for (const a of t.attendees) {
      out.push({
        at: a.createdAt,
        by: t.openedBy,
        byConfidence: "container",
        kind: "toolbox-attendee",
        summary: `Toolbox talk attendee: ${a.name}`,
      });
    }
  }

  for (const r of input.attendanceRegisters) {
    out.push({
      at: r.openedAt,
      by: r.openedBy,
      byConfidence: "direct",
      kind: "attendance-register-open",
      summary: `Attendance register opened — ${r.date}${r.purpose ? ` ${r.purpose}` : ""}`,
    });
    for (const row of r.rows) {
      out.push({
        at: row.createdAt,
        by: r.openedBy,
        byConfidence: "container",
        kind: "attendance-row",
        summary: `Attendance row for ${row.name}`,
      });
    }
    for (const ap of r.apologies ?? []) {
      out.push({
        at: ap.createdAt,
        by: r.openedBy,
        byConfidence: "container",
        kind: "attendance-apology",
        summary: `Apology (attendance): ${ap.name}${ap.reason ? ` — ${ap.reason}` : ""}`,
      });
    }
  }

  for (const l of input.siteAccessLogs) {
    out.push({
      at: l.openedAt,
      by: l.openedBy,
      byConfidence: "direct",
      kind: "site-access-log-open",
      summary: `Site access logged — ${l.area}${l.escortedBy ? `, escorted by ${l.escortedBy}` : ""}`,
    });
    for (const v of l.people) {
      out.push({
        at: v.createdAt,
        by: l.openedBy,
        byConfidence: "container",
        kind: "site-access-visitor",
        summary: `Site access visitor: ${v.name} (${v.side})`,
      });
    }
  }

  for (const e of input.evidenceItems) {
    out.push({
      at: e.createdAt,
      by: e.receivedBy,
      byConfidence: "direct",
      kind: "evidence-item",
      summary: `Evidence logged: ${e.title || "untitled document"}`,
    });
  }

  return out.sort((a, b) => b.at - a.at);
}
