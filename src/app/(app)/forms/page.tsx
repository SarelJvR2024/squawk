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
import { Btn, Empty, Pill } from "@/components/ui/primitives";
import { IconCheck, IconClipboard, IconInbox, IconMic, IconPin, IconTeam } from "@/components/ui/icons";

const TILES: Array<{ kind: FormKind | "evidence2"; label: string; hint: string; href: string; icon: ReactNode }> = [
  { kind: "isf", label: "Safety", hint: "Raise an Immediate Safety Finding", href: "/isf", icon: <IconClipboard width={16} height={16} /> },
  { kind: "interview", label: "Interview", hint: "Who you're talking to", href: "/interviews", icon: <IconMic width={16} height={16} /> },
  { kind: "attendance", label: "Attendance", hint: "Who's arriving on site", href: "/attendance", icon: <IconTeam width={16} height={16} /> },
  { kind: "diary", label: "Daily diary", hint: "What the day consisted of", href: "/diary", icon: <IconClipboard width={16} height={16} /> },
  { kind: "ppe", label: "PPE check", hint: "Hi-vis, footwear, hearing", href: "/ppe", icon: <IconCheck width={16} height={16} /> },
  { kind: "siteAccess", label: "Site access", hint: "Where the team went", href: "/site-access", icon: <IconPin width={16} height={16} /> },
  { kind: "evidence2", label: "Evidence", hint: "Log what ACSA handed over", href: "/evidence", icon: <IconInbox width={16} height={16} /> },
];

const KIND_TONE: Record<FormKind, "accent" | "warn" | undefined> = {
  isf: "warn",
  interview: "accent",
  attendance: "accent",
  diary: undefined,
  ppe: "accent",
  siteAccess: "accent",
  evidence: "warn",
};

function dayLabel(date: string, today: string): string {
  if (date === today) return "TODAY";
  if (!date) return "UNDATED";
  return date;
}

type StatusFilter = "all" | "completed" | "needsAttention";

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
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">All forms</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Every form and register, in one place. Tap a tile to start one, or find an existing
          record below.
        </p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-[9px] sm:grid-cols-4">
        {visibleTiles.map((t) => (
          <button
            key={t.label}
            onClick={() => router.push(t.href)}
            className="flex min-h-[72px] flex-col items-start gap-1 rounded-[13px] border px-[13px] py-[11px] text-left transition-[var(--t)] hover:bg-[var(--sunken)]"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <span style={{ color: "var(--acc)" }}>{t.icon}</span>
            <b className="text-[12.5px]">{t.label}</b>
            <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
              {t.hint}
            </span>
          </button>
        ))}
      </div>

      {role !== "acsa" && (
        <div className="mb-3 flex flex-wrap gap-[6px]">
          <Btn variant={filter === "all" ? "primary" : "default"} onClick={() => setFilter("all")}>
            All
          </Btn>
          {(Object.keys(FORM_KIND_LABEL) as FormKind[]).map((k) => (
            <Btn key={k} variant={filter === k ? "primary" : "default"} onClick={() => setFilter(k)}>
              {FORM_KIND_LABEL[k]}
            </Btn>
          ))}
        </div>
      )}

      {role !== "acsa" && (
        <div className="mb-3 flex flex-wrap gap-[6px]">
          <Btn variant={status === "all" ? "primary" : "default"} onClick={() => setStatus("all")}>
            All
          </Btn>
          <Btn
            variant={status === "completed" ? "primary" : "default"}
            onClick={() => setStatus("completed")}
          >
            Completed
          </Btn>
          <Btn
            variant={status === "needsAttention" ? "primary" : "default"}
            onClick={() => setStatus("needsAttention")}
          >
            Needs attention
          </Btn>
        </div>
      )}

      {groups.length === 0 ? (
        <Empty>
          <b>No forms recorded yet.</b>
          <span>Start one from the tiles above.</span>
        </Empty>
      ) : null}

      {groups.map(([date, dayRows]) => (
        <div key={date || "undated"} className="mb-4">
          <p className="mb-1.5 font-mono text-[10px] font-semibold tracking-wide" style={{ color: "var(--ink-3)" }}>
            {dayLabel(date, today)}
          </p>
          {dayRows.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => router.push(r.href)}
              className="mb-2 flex w-full items-start justify-between gap-3 rounded-[12px] border px-[13px] py-[11px] text-left transition-[var(--t)] hover:bg-[var(--sunken)]"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-[6px]">
                  <Pill tone={KIND_TONE[r.kind]}>{FORM_KIND_LABEL[r.kind]}</Pill>
                  {r.open ? <Pill tone="warn">OPEN</Pill> : null}
                </div>
                <p className="truncate text-[13px] font-semibold">{r.title}</p>
                <p className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
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
    </div>
  );
}
