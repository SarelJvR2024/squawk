/** ONE LIST, EVERY FORM — what /forms is built from.
 *
 *  Sarel: "have all forms easy to access, maybe in a calendar or some card
 *  type display." Six form types, four different underlying shapes (a flat
 *  record, a one-per-day register, a one-per-occasion register, a document
 *  log with no single date of its own) — this is where they are normalised
 *  into one row shape so a single screen can list them together, newest
 *  first, grouped by day. It does not replace any form's own screen, which
 *  is still where a record is actually edited; this is the index that gets
 *  you there without already knowing which menu item holds it. */

import { useMemo } from "react";
import { useStore, useEntityCode } from "@/lib/store";
import { missingFields } from "@/lib/isf";
import { dayGaps as interviewDayGaps } from "@/lib/interviews";
import { closeoutGaps, dayGaps as attendanceDayGaps, localDate } from "@/lib/attendance";
import { checkGaps as ppeCheckGaps } from "@/lib/ppe";
import { diaryGaps } from "@/lib/diary";
import { logGaps as siteAccessGaps } from "@/lib/siteAccess";
import { itemGaps as evidenceItemGaps } from "@/lib/evidence";
import { talkGaps as toolboxTalkGaps } from "@/lib/toolbox";
import { missingFields as incidentMissingFields } from "@/lib/incident";

export type FormKind =
  | "isf"
  | "interview"
  | "attendance"
  | "diary"
  | "ppe"
  | "siteAccess"
  | "toolboxTalk"
  | "incident"
  | "closeout"
  | "evidence";

export interface FormsIndexRow {
  kind: FormKind;
  id: string;
  /** `YYYY-MM-DD`, for grouping. */
  date: string;
  /** For ordering within a date — the moment the record itself happened,
   *  not when somebody last edited it. */
  at: number;
  title: string;
  subtitle: string;
  href: string;
  open: boolean;
  gapCount: number;
}

export const FORM_KIND_LABEL: Record<FormKind, string> = {
  isf: "Safety",
  interview: "Interview",
  attendance: "Attendance",
  diary: "Diary",
  ppe: "PPE check",
  siteAccess: "Site access",
  toolboxTalk: "Toolbox talk",
  incident: "Incident",
  closeout: "Closeout",
  evidence: "Evidence",
};

/** Every form record at the entity in view, newest first. */
export function useFormsIndex(): FormsIndexRow[] {
  const entityCode = useEntityCode();
  const safetyFindings = useStore((s) => s.safetyFindings);
  const interviewDays = useStore((s) => s.interviewDays);
  const siteDays = useStore((s) => s.siteDays);
  const ppeChecks = useStore((s) => s.ppeChecks);
  const siteAccessLogs = useStore((s) => s.siteAccessLogs);
  const toolboxTalks = useStore((s) => s.toolboxTalks);
  const incidentReports = useStore((s) => s.incidentReports);
  const evidenceItems = useStore((s) => s.evidenceItems);

  return useMemo(() => {
    const rows: FormsIndexRow[] = [];

    for (const f of safetyFindings.filter((x) => x.entity === entityCode)) {
      rows.push({
        kind: "isf",
        id: f.id,
        date: localDate(f.raisedAt),
        at: f.raisedAt,
        title: f.description.trim() || "Immediate Safety Finding",
        subtitle: f.location.trim() || "No location recorded",
        href: `/isf?open=${f.id}`,
        open: f.closedAt === null,
        gapCount: missingFields(f).length,
      });
    }

    for (const d of interviewDays.filter((x) => x.entity === entityCode)) {
      rows.push({
        kind: "interview",
        id: d.id,
        date: d.date,
        at: d.openedAt,
        title: "Interview records",
        subtitle:
          d.entries.length === 0
            ? "Nobody recorded"
            : d.entries.map((e) => e.name || "—").join(", "),
        href: `/interviews?open=${d.id}`,
        open: d.closedAt === null,
        gapCount: interviewDayGaps(d).length,
      });
    }

    for (const d of siteDays.filter((x) => x.entity === entityCode)) {
      rows.push({
        kind: "attendance",
        id: d.id,
        date: d.date,
        at: d.openedAt,
        title: "Site attendance",
        subtitle:
          d.entries.length === 0
            ? "Nobody recorded"
            : d.entries.map((e) => e.name || "—").join(", "),
        href: `/attendance?open=${d.id}`,
        open: true,
        gapCount: attendanceDayGaps(d).length,
      });
      /* Same record, a second row — the diary is its own form to find, even
         though it shares SiteDay with attendance. See src/app/(app)/diary. */
      rows.push({
        kind: "diary",
        id: `${d.id}-diary`,
        date: d.date,
        at: d.openedAt,
        title: "Daily diary",
        subtitle:
          d.diaryEntries.length === 0
            ? "Nothing recorded"
            : `${d.diaryEntries.length} ${d.diaryEntries.length === 1 ? "entry" : "entries"}`,
        href: `/diary?open=${d.id}`,
        open: true,
        gapCount: diaryGaps(d).length,
      });
      /* Same record again — the closeout reconciliation, found the same way
         the diary is. See src/app/(app)/closeout. */
      rows.push({
        kind: "closeout",
        id: `${d.id}-closeout`,
        date: d.date,
        at: d.openedAt,
        title: "Daily site closeout",
        subtitle:
          d.closeoutFindingsToday === null
            ? "Not yet answered"
            : d.closeoutFindingsToday
              ? "Findings today"
              : "No findings today",
        href: `/closeout?open=${d.id}`,
        open: true,
        gapCount: closeoutGaps(d).length,
      });
    }

    for (const c of ppeChecks.filter((x) => x.entity === entityCode)) {
      rows.push({
        kind: "ppe",
        id: c.id,
        date: c.date,
        at: c.openedAt,
        title: c.location.trim() ? `PPE check — ${c.location.trim()}` : "PPE check",
        subtitle:
          c.people.length === 0
            ? "Nobody recorded"
            : c.people.map((e) => e.name || "—").join(", "),
        href: `/ppe?open=${c.id}`,
        open: true,
        gapCount: ppeCheckGaps(c).length,
      });
    }

    for (const l of siteAccessLogs.filter((x) => x.entity === entityCode)) {
      rows.push({
        kind: "siteAccess",
        id: l.id,
        date: l.date,
        at: l.openedAt,
        title: l.area.trim() ? `Site access — ${l.area.trim()}` : "Site access",
        subtitle:
          l.people.length === 0
            ? "Nobody recorded"
            : l.people.map((v) => v.name || "—").join(", "),
        href: `/site-access?open=${l.id}`,
        open: true,
        gapCount: siteAccessGaps(l).length,
      });
    }

    for (const t of toolboxTalks.filter((x) => x.entity === entityCode)) {
      rows.push({
        kind: "toolboxTalk",
        id: t.id,
        date: t.date,
        at: t.openedAt,
        title: t.topic.trim() ? `Toolbox talk — ${t.topic.trim()}` : "Toolbox talk",
        subtitle:
          t.attendees.length === 0
            ? "Nobody recorded"
            : t.attendees.map((a) => a.name || "—").join(", "),
        href: `/toolbox-talk?open=${t.id}`,
        open: true,
        gapCount: toolboxTalkGaps(t).length,
      });
    }

    for (const r of incidentReports.filter((x) => x.entity === entityCode)) {
      rows.push({
        kind: "incident",
        id: r.id,
        date: r.date,
        at: r.createdAt,
        title: r.isNearMiss ? "Near miss" : r.affectedPersonName.trim() ? `Incident — ${r.affectedPersonName.trim()}` : "Incident",
        subtitle: r.location.trim() || "No location recorded",
        href: `/incident?open=${r.id}`,
        open: true,
        gapCount: incidentMissingFields(r).length,
      });
    }

    for (const e of evidenceItems.filter((x) => x.entity === entityCode)) {
      const at = e.requestedAt ?? e.createdAt;
      rows.push({
        kind: "evidence",
        id: e.id,
        date: localDate(at),
        at,
        title: e.title.trim() || "Evidence item",
        subtitle: e.receivedAt
          ? "Received"
          : e.unavailableAt
            ? "Cannot be produced"
            : "Outstanding",
        href: `/evidence?open=${e.id}`,
        open: !e.receivedAt && !e.unavailableAt,
        gapCount: evidenceItemGaps(e).length,
      });
    }

    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.at - a.at));
  }, [
    entityCode,
    safetyFindings,
    interviewDays,
    siteDays,
    ppeChecks,
    siteAccessLogs,
    toolboxTalks,
    incidentReports,
    evidenceItems,
  ]);
}

/** Rows grouped by date, dates newest first — what the hub screen renders. */
export function groupByDate(rows: FormsIndexRow[]): Array<[string, FormsIndexRow[]]> {
  const map = new Map<string, FormsIndexRow[]>();
  for (const r of rows) {
    const list = map.get(r.date);
    if (list) list.push(r);
    else map.set(r.date, [r]);
  }
  return Array.from(map.entries());
}
