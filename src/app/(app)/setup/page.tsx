"use client";

/** SETUP — what each audit check needs.
 *
 *  Sarel, 21 Nov 2026: "some audit checks won't need a question or evidence or
 *  an inspection — all 3 isn't always needed and should be set in the config."
 *
 *  Every check needs all three (interview, evidence, walk) until it is switched
 *  off here. The Checks screen then shows only the channels a check needs.
 *  Switch a whole asset system at once, or open it and set single checks.
 *  Stored as exceptions only — see lib/channels.ts. */

import { useMemo, useState } from "react";
import { CHECKS, ALL_DISCIPLINES } from "@/lib/register";
import { CHANNEL_KEYS, CHANNEL_LABEL, channelCounts, channelsOf } from "@/lib/channels";
import { useStore } from "@/lib/store";
import type { CheckChannelKey } from "@/lib/types";

function Toggle({
  on,
  mixed,
  label,
  text,
  onClick,
}: {
  on: boolean;
  mixed?: boolean;
  label: string;
  /** What the chip says: the channel's name. Filled = needed, outline = off. */
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mixed ? "mixed" : on}
      aria-label={label}
      onClick={onClick}
      className="rounded-full border px-3 py-[6px] text-[12px] font-semibold"
      style={{
        borderColor: on || mixed ? "var(--acc)" : "var(--line)",
        background: on ? "var(--acc)" : "transparent",
        color: on ? "#fff" : mixed ? "var(--acc)" : "var(--ink-4)",
      }}
    >
      {text}{mixed ? " (some)" : ""}
    </button>
  );
}

export default function SetupPage() {
  const config = useStore((s) => s.checkChannels);
  const setCheckChannels = useStore((s) => s.setCheckChannels);
  const [discipline, setDiscipline] = useState<string>("");
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = CHECKS.filter(
      (c) =>
        (!discipline || c.discipline === discipline) &&
        (!needle || `${c.id} ${c.requirement} ${c.system}`.toLowerCase().includes(needle)),
    );
    const map = new Map<string, typeof rows>();
    for (const c of rows) {
      const k = `${c.discipline} · ${c.system}`;
      map.set(k, [...(map.get(k) ?? []), c]);
    }
    return [...map.entries()];
  }, [discipline, q]);

  const totals = channelCounts(config, CHECKS.map((c) => c.id));

  return (
    <div className="app-scroll mx-auto min-h-0 w-full max-w-[900px] flex-1 overflow-y-auto px-4 py-4">
      <h1 className="mb-1 text-[18px] font-bold">Setup</h1>
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
        Choose what each audit check needs. A check that needs no interview, evidence or walk
        will not show it on the Checks screen.
      </p>
      <div className="mb-3 flex flex-wrap gap-2 text-[12px]" aria-label="Totals">
        {CHANNEL_KEYS.map((k) => (
          <span key={k} className="rounded-full border px-3 py-1" style={{ borderColor: "var(--line)" }}>
            {CHANNEL_LABEL[k]} needed on {totals[k]} of {CHECKS.length}
          </span>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search checks…"
          aria-label="Search checks"
          className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-[14px]"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        />
        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          aria-label="Discipline"
          className="rounded-md border px-3 py-2 text-[14px]"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        >
          <option value="">All disciplines</option>
          {ALL_DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {groups.length === 0 && <p className="text-[13px]">No checks match.</p>}

      {groups.map(([name, checks]) => {
        const ids = checks.map((c) => c.id);
        const n = channelCounts(config, ids);
        return (
          <details key={name} className="mb-2 rounded-lg border" style={{ borderColor: "var(--line)" }}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-[180px] flex-1 text-[14px] font-semibold">
                {name} <span style={{ color: "var(--ink-4)" }}>({checks.length})</span>
              </span>
              {CHANNEL_KEYS.map((k: CheckChannelKey) => (
                <span key={k} onClick={(e) => e.stopPropagation()}>
                  <Toggle
                    text={CHANNEL_LABEL[k]}
                    label={`${CHANNEL_LABEL[k]} for every check in ${name}`}
                    on={n[k] === ids.length}
                    mixed={n[k] > 0 && n[k] < ids.length}
                    onClick={() => setCheckChannels(ids, { [k]: n[k] !== ids.length })}
                  />
                </span>
              ))}
            </summary>
            <div className="border-t px-3 py-2" style={{ borderColor: "var(--line)" }}>
              <div className="mb-1 text-[11px]" style={{ color: "var(--ink-4)" }}>
                Filled = the check needs it. Outline = off.
              </div>
              {checks.map((c) => {
                const ch = channelsOf(config, c.id);
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t py-2" style={{ borderColor: "var(--line)" }}>
                    <span className="min-w-[240px] flex-1 text-[12.5px] leading-[1.3]">
                      <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                        {c.id}
                      </span>{" "}
                      {c.requirement}
                    </span>
                    {CHANNEL_KEYS.map((k) => (
                      <Toggle
                        key={k}
                        text={CHANNEL_LABEL[k]}
                        label={`${CHANNEL_LABEL[k]} for ${c.id}`}
                        on={ch[k]}
                        onClick={() => setCheckChannels([c.id], { [k]: !ch[k] })}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
