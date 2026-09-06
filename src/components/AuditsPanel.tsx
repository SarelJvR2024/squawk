"use client";

/** Every audit, and how to start another one.
 *
 *  The cycle strip has been clickable since the scope re-key, but it reads as
 *  a progress indicator, so nobody clicked it — and it only ever showed one
 *  entity's six visits. programme.json seeds six, all at King Shaka; the other
 *  nine entities had none at all, so the entity picker could reach O.R. Tambo
 *  and there was nowhere to put anything captured there.
 *
 *  This is the one place that answers "which audits exist, which am I in, and
 *  how do I start the next one" — across all ten entities and the whole cycle,
 *  past and future. */

import { useMemo, useState } from "react";
import {
  scopeKey,
  useAllAudits,
  useEntityCode,
  useStore,
  useVisitId,
  visitLabelFor,
  VISIT_ID,
} from "@/lib/store";
import { ENTITIES, entity as entityOf, PROGRAMME_VISITS } from "@/lib/programme";
import { Btn, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconPin, IconX } from "@/components/ui/icons";

export default function AuditsPanel({ onClose }: { onClose: () => void }) {
  const audits = useAllAudits();
  const byVisit = useStore((s) => s.byVisit);
  const findings = useStore((s) => s.findings);
  const openAudit = useStore((s) => s.openAudit);
  const addVisit = useStore((s) => s.addVisit);
  const removeVisit = useStore((s) => s.removeVisit);
  const currentEntity = useEntityCode();
  const currentVisit = useVisitId();

  const now = new Date();
  const [newEntity, setNewEntity] = useState(currentEntity);
  const [newYear, setNewYear] = useState(String(now.getFullYear()));
  const [newMonth, setNewMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [newNote, setNewNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const newId = `${newYear}-${newMonth}`;

  /* What each audit actually holds, so the list distinguishes "scheduled" from
     "there is work in here" without anyone having to open it. */
  const stats = useMemo(() => {
    const m = new Map<string, { captured: number; media: number; findings: number }>();
    for (const [key, d] of Object.entries(byVisit)) {
      m.set(key, {
        captured: Object.values(d.responses).filter((r) => r.captured).length,
        media: Object.values(d.responses).reduce((n, r) => n + r.attachments.length, 0),
        findings: 0,
      });
    }
    for (const f of findings) {
      const k = scopeKey(f.entity, f.originVisit);
      const s = m.get(k) ?? { captured: 0, media: 0, findings: 0 };
      s.findings++;
      m.set(k, s);
    }
    return m;
  }, [byVisit, findings]);

  const grouped = useMemo(() => {
    const g = new Map<string, typeof audits>();
    for (const a of audits) {
      const list = g.get(a.entity) ?? [];
      list.push(a);
      g.set(a.entity, list);
    }
    return g;
  }, [audits]);

  const create = () => {
    setError(null);
    if (!VISIT_ID.test(newId)) {
      setError("Pick a valid month and a four-digit year.");
      return;
    }
    const err = addVisit(newEntity, newId, newNote);
    if (err) {
      setError(err);
      return;
    }
    openAudit(newEntity, newId);
    setToast(`${entityOf(newEntity).short} · ${visitLabelFor(newId)} created and opened.`);
    setNewNote("");
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex justify-center overflow-y-auto px-4 py-[6vh]"
      style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="h-fit w-[min(820px,100%)] rounded-[20px] border p-[22px]"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3.5 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[15px] font-bold">Audits</h3>
            <p className="mt-[3px] text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              Every audit across all {ENTITIES.length} entities. Open any of them — past,
              current or scheduled — or start a new one.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-[8px] border p-[9px]"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
          >
            <IconX width={13} height={13} />
          </button>
        </div>

        {toast && (
          <Panel tone="accent" className="mb-3">
            <div className="text-[12px]" style={{ color: "var(--acc)" }}>
              {toast}
            </div>
          </Panel>
        )}

        {/* ---- create ---- */}
        <Panel className="mb-4">
          <div className="mb-2 font-display text-[11.5px] font-semibold">New audit</div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="label-xs">Entity</span>
              <select
                value={newEntity}
                onChange={(e) => setNewEntity(e.target.value)}
                className="rounded-[8px] border px-2 py-[7px] text-[11.5px]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              >
                {ENTITIES.map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.short} — {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-xs">Month</span>
              <select
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                className="rounded-[8px] border px-2 py-[7px] text-[11.5px]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              >
                {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => (
                  <option key={m} value={m}>
                    {visitLabelFor(`2000-${m}`).split(" ")[0]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-xs">Year</span>
              <input
                value={newYear}
                onChange={(e) => setNewYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                className="w-[76px] rounded-[8px] border px-2 py-[7px] text-[11.5px]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />
            </label>
            <label className="flex min-w-[160px] flex-1 flex-col gap-1">
              <span className="label-xs">Note (optional)</span>
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="e.g. interim visit"
                className="rounded-[8px] border px-2 py-[7px] text-[11.5px]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />
            </label>
            <Btn variant="primary" onClick={create}>
              <IconCheck width={14} height={14} />
              Create &amp; open
            </Btn>
          </div>
          <div className="mt-2 font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
            {scopeKey(newEntity, newId)}
          </div>
          {error && (
            <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--bad)" }}>
              {error}
            </div>
          )}
        </Panel>

        {/* ---- the programme ---- */}
        {ENTITIES.map((e) => {
          const list = grouped.get(e.code) ?? [];
          return (
            <div key={e.code} className="mb-3">
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <b className="font-display text-[12px] font-semibold">{e.short}</b>
                <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  {e.name}
                </span>
                {list.length === 0 && (
                  <span className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                    — no audits yet
                  </span>
                )}
              </div>
              {list.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {list.map(({ visit: v }) => {
                    const key = scopeKey(e.code, v.id);
                    const st = stats.get(key);
                    const on = e.code === currentEntity && v.id === currentVisit;
                    const seeded = PROGRAMME_VISITS.some(
                      (p) => p.entity === e.code && p.id === v.id
                    );
                    const has = !!st && (st.captured > 0 || st.media > 0 || st.findings > 0);
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center gap-2 rounded-[11px] border px-[12px] py-[9px]"
                        style={
                          on
                            ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)" }
                            : { background: "var(--panel)", borderColor: "var(--line-2)" }
                        }
                      >
                        <span
                          className="h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{
                            background: on
                              ? "var(--acc)"
                              : has
                                ? "var(--good)"
                                : "var(--line-3)",
                          }}
                        />
                        <b className="font-display text-[12px] font-semibold">{v.label}</b>
                        <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                          {v.id}
                        </span>
                        {on && <Pill tone="accent">OPEN NOW</Pill>}
                        {!seeded && <Pill>ADDED HERE</Pill>}
                        <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                          {has
                            ? `${st!.captured} complete · ${st!.media} media · ${st!.findings} findings`
                            : v.note}
                        </span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {!on && (
                            <Btn onClick={() => {
                              openAudit(e.code, v.id);
                              setToast(`Opened ${e.short} · ${v.label}.`);
                            }}>
                              <IconPin width={12} height={12} />
                              Open
                            </Btn>
                          )}
                          {!seeded && !has && (
                            <button
                              onClick={() => {
                                const err = removeVisit(e.code, v.id);
                                setError(err);
                                if (!err) setToast(`${e.short} · ${v.label} removed.`);
                              }}
                              aria-label={`Remove ${e.short} ${v.label}`}
                              title="Remove this empty audit"
                              className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border"
                              style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                            >
                              <IconX width={11} height={11} />
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <p className="mt-3 text-[11px]" style={{ color: "var(--ink-4)" }}>
          An audit id is <code>YYYY-MM</code> because carry-forward decides which visits came
          before this one by sorting it. Audits from the programme file cannot be removed; ones
          added here can, but only while they are still empty.
        </p>
      </div>
    </div>
  );
}
