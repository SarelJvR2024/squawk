"use client";

/** ALL FORMS, ONE LIST — Sarel: "have all forms easy to access, maybe in a
 *  calendar or some card type display."
 *
 *  Six forms, four different underlying shapes, and before this the only way
 *  to find one of them was already knowing which menu item it lived under.
 *  This screen does not replace any of the six — each still has its own page
 *  where a record is actually filled in and signed — it is the index: a row
 *  of "start one" tiles, then every record that exists, newest day first,
 *  so whoever has the tablet can find or edit anything without already
 *  knowing where it lives. */

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { FORM_KIND_LABEL, groupByDate, useFormsIndex, type FormKind } from "@/lib/formsIndex";
import { Empty, Pill } from "@/components/ui/primitives";
import { FilterBar } from "@/components/ui/FilterBar";
import { IconCheck, IconClipboard, IconFlag, IconInbox, IconLock, IconMic, IconPin, IconTeam } from "@/components/ui/icons";

const TILES: Array<{ kind: FormKind | "evidence2"; label: string; hint: string; href: string; icon: ReactNode }> = [
  { kind: "isf", label: "Safety", hint: "Raise an Immediate Safety Finding", href: "/isf", icon: <IconClipboard width={15} height={15} /> },
  { kind: "interview", label: "Interview", hint: "Who you're talking to", href: "/interviews", icon: <IconMic width={15} height={15} /> },
  { kind: "attendance", label: "Attendance", hint: "Create a signed register for a meeting", href: "/attendance", icon: <IconTeam width={15} height={15} /> },
  { kind: "diary", label: "Daily diary", hint: "What the day consisted of", href: "/diary", icon: <IconClipboard width={15} height={15} /> },
  { kind: "ppe", label: "PPE check", hint: "Hi-vis, footwear, hearing", href: "/ppe", icon: <IconCheck width={15} height={15} /> },
  { kind: "siteAccess", label: "Site access", hint: "Where the team went", href: "/site-access", icon: <IconPin width={15} height={15} /> },
  { kind: "toolboxTalk", label: "Toolbox talk", hint: "What was covered, who signed", href: "/toolbox-talk", icon: <IconMic width={15} height={15} /> },
  { kind: "incident", label: "Incident", hint: "Annexure 1 — report one", href: "/incident", icon: <IconFlag width={15} height={15} /> },
  { kind: "closeout", label: "Closeout", hint: "Reconcile the day", href: "/closeout", icon: <IconLock width={15} height={15} /> },
  { kind: "evidence2", label: "Evidence", hint: "Log what ACSA handed over", href: "/evidence", icon: <IconInbox width={15} height={15} /> },
];

const KIND_TONE: Record<FormKind, "accent" | "warn" | undefined> = {
  isf: "warn",
  interview: "accent",
  attendance: "accent",
  diary: undefined,
  ppe: "accent",
  siteAccess: "accent",
  toolboxTalk: "accent",
  incident: "warn",
  closeout: undefined,
  evidence: "warn",
};

function dayLabel(date: string, today: string): string {
  if (date === today) return "TODAY";
  if (!date) return "UNDATED";
  return date;
}

type StatusFilter = "all" | "completed" | "needsAttention";

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All",
  completed: "Completed",
  needsAttention: "Needs attention",
};

export default function FormsHubPage() {
  const router = useRouter();
  const role = useStore((s) => s.role);
  const rows = useFormsIndex();
  const [filter, setFilter] = useState<FormKind | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const filtered = useMemo(
    () =>
      rows
        .filter((r) => filter === "all" || r.kind === filter)
        .filter((r) =>
          status === "all" ? true : status === "completed" ? r.gapCount === 0 : r.gapCount > 0
        ),
    [rows, filter, status]
  );
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const visibleTiles = role === "acsa" ? TILES.filter((t) => t.kind === "isf") : TILES;

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-2.5">
        <h2 className="font-display text-[15px] font-semibold">All forms</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Every form and register, in one place. Tap a tile to start one, or find an existing
          record on the timeline below.
        </p>
      </header>

      {/* COMPACT TILES — icon and label only; the hint moves to the title
          attribute. Sarel, 2 October 2026: "reduce the space the buttons
          and filters take up". Ten forms at the old three-line, 72px tile
          cost more vertical space than the record list beneath it; five
          columns of icon+label keeps every form one tap away in roughly a
          third of the height. */}
      <div className="mb-2.5 grid grid-cols-5 gap-[6px]">
        {visibleTiles.map((t) => (
          <button
            key={t.label}
            title={t.hint}
            onClick={() => router.push(t.href)}
            className="flex min-h-[52px] flex-col items-center justify-center gap-[3px] rounded-[11px] border px-1 py-[7px] text-center transition-[var(--t)] hover:bg-[var(--sunken)]"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <span style={{ color: "var(--acc)" }}>{t.icon}</span>
            <b className="text-[9.5px] leading-[1.15]">{t.label}</b>
          </button>
        ))}
      </div>

      {/* FILTERS, FOLDED — same shared disclosure Capture/Review/Closure use
          (src/components/ui/FilterBar.tsx). These two Chip rows were the one
          place in the app that already reached for the shared `Chip`
          primitive instead of reinventing it, but stacked they still cost
          ~230px before any record list, more once the kind row wraps on a
          narrow phone — the same "too many filters visible at once,
          scattered all over" complaint the Closure rebuild answered. */}
      {role !== "acsa" && (
        <FilterBar
          className="mb-3"
          summary={
            filter === "all" && status === "all" ? (
              "All forms"
            ) : (
              <>
                Showing: <b>{[filter !== "all" ? FORM_KIND_LABEL[filter] : null, STATUS_FILTER_LABEL[status]].filter(Boolean).join(" · ")}</b>
              </>
            )
          }
          active={filter !== "all" || status !== "all"}
          groups={[
            {
              label: "Form",
              options: [
                { key: "all", label: "All" },
                ...(Object.keys(FORM_KIND_LABEL) as FormKind[]).map((k) => ({
                  key: k,
                  label: FORM_KIND_LABEL[k],
                })),
              ],
              value: filter,
              onChange: (k) => setFilter(k as FormKind | "all"),
            },
            {
              label: "Status",
              options: [
                { key: "all", label: "All" },
                { key: "completed", label: "Completed" },
                { key: "needsAttention", label: "Needs attention" },
              ],
              value: status,
              onChange: (k) => setStatus(k as StatusFilter),
            },
          ]}
        />
      )}

      {/* TWO DIFFERENT EMPTY STATES, not one message doing both jobs.
          "No forms recorded yet" and "nothing matches what you've filtered
          to" are different facts — the first means there is nothing to find
          here at all, the second means there is, just not under the current
          Form/Status pick, and the fix is one tap on "All" above rather than
          going and creating a record. Telling them apart is `rows.length`
          (every record this entity holds, before either filter) against
          `filtered.length`/`groups.length` (what's left after both) — the
          same two numbers FilterBar's own `active` flag above already reads
          off `filter`/`status`, just asked a second way. */}
      {groups.length === 0 ? (
        rows.length === 0 ? (
          <Empty>
            <b>No forms recorded yet.</b>
            <span>Start one from the tiles above.</span>
          </Empty>
        ) : (
          <Empty>
            <b>Nothing matches this filter.</b>
            <span>
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setStatus("all");
                }}
                className="underline decoration-dotted underline-offset-2"
                style={{ color: "var(--acc)" }}
              >
                Clear it to see every record
              </button>
            </span>
          </Empty>
        )
      ) : null}

      {/* THE TIMELINE — Sarel: "create a more intuitive timeline or calendar
          view of all captured forms." A calendar grid earns its keep on a
          desktop month view; on a phone-width tablet screen a chronological
          rail reads better, and it is what the flat date-grouped list
          already was in substance — this just draws the axis a list leaves
          implicit, one dot per day on a line running down the page, so the
          shape of the audit (which days were busy, which were quiet) is
          visible before reading a single record. */}
      {groups.length > 0 ? (
        <div className="relative">
          <div
            className="absolute top-[6px] bottom-[6px] w-px"
            style={{ left: "3px", background: "var(--line-2)" }}
          />
          {groups.map(([date, dayRows]) => (
            <div key={date || "undated"} className="relative mb-3.5 pl-[18px]">
              <span
                className="absolute top-[4px] h-[7px] w-[7px] rounded-full"
                style={{ left: "0px", background: date === today ? "var(--acc)" : "var(--line-3)" }}
              />
              <div className="mb-1 flex items-baseline gap-[7px]">
                <p className="font-mono text-[10px] font-semibold tracking-wide" style={{ color: "var(--ink-3)" }}>
                  {dayLabel(date, today)}
                </p>
                <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  {dayRows.length} record{dayRows.length === 1 ? "" : "s"}
                </span>
              </div>
              {dayRows.map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  onClick={() => router.push(r.href)}
                  className="mb-[6px] flex w-full items-start justify-between gap-3 rounded-[11px] border px-[11px] py-[8px] text-left transition-[var(--t)] hover:bg-[var(--sunken)]"
                  style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                >
                  <div className="min-w-0">
                    <div className="mb-[3px] flex flex-wrap items-center gap-[6px]">
                      <Pill tone={KIND_TONE[r.kind]}>{FORM_KIND_LABEL[r.kind]}</Pill>
                      {r.open ? <Pill tone="warn">OPEN</Pill> : null}
                    </div>
                    <p className="truncate text-[12.5px] font-semibold">{r.title}</p>
                    <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                      {r.subtitle}
                    </p>
                  </div>
                  {r.gapCount > 0 ? (
                    <span className="shrink-0 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                      {r.gapCount} TO DO
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      </div>
    </div>
  );
}
