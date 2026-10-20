"use client";

import { useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Btn, Pill } from "@/components/ui/primitives";
import { IconSearch, IconX } from "@/components/ui/icons";
import { checksAt, disciplinesAt, systemsOf, useEntityCode, useStore } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";

/** RAISE A FINDING THAT IS NOT TIED TO ANY SPECIFIC CHECK.
 *
 *  Sarel: "there might be findings that we pick up which is not relating to a
 *  specific audit check... the findings will definitely fit into a discipline
 *  and potentially also to an asset type... make sure there's an easy way to
 *  capture findings, to link it to a discipline and or asset type and or a
 *  question or a check."
 *
 *  The Findings screen (src/app/(app)/findings/page.tsx) was built to RATE
 *  findings that already exist — nothing on it let an auditor RAISE one. The
 *  only way to raise a finding with no check behind it was the walk screen's
 *  ad-hoc-item-then-promote flow (AddItemSheet.tsx's raiseFinding), which
 *  needs a system/area context on that screen. This sheet is the second,
 *  general entry point this screen itself needed — same `addFinding` action,
 *  same default shape, copied straight from AddItemSheet.tsx's own call
 *  (checkId null unless a check is picked, severity/likelihood/rootCause
 *  empty, actionStatus "Open", ratingConfirmed false) so the two capture
 *  paths cannot drift into two different shapes of finding.
 *
 *  Every Finding IS a non-compliance in this schema — see Finding in
 *  src/lib/types.ts, `checkId: string | null`. Raising one here, with or
 *  without a check attached, is what makes `outstandingFor()`
 *  (src/lib/carryforward.ts) carry it into the next visit's Follow-up screen;
 *  that function filters on `originVisit`/`actionStatus` only, never on
 *  `checkId`, so nothing further is needed here for that to work.
 *
 *  ONLY DISCIPLINE AND A DESCRIPTION OF WHAT WAS FOUND ARE REQUIRED — Sarel's
 *  own wording was "and or asset type and or a question or a check", i.e.
 *  asset system and check-point are both optional. Forcing either would put
 *  a guess into a finding that may genuinely be about neither. */

export default function RaiseFindingSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string, message: string) => void;
}) {
  const entityCode = useEntityCode();
  const auditor = useStore((s) => s.auditor);
  const visitId = useStore((s) => s.visit);
  const addFinding = useStore((s) => s.addFinding);

  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const checks = useMemo(() => checksAt(entityCode), [entityCode]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discipline, setDiscipline] = useState<string>("");
  const [system, setSystem] = useState<string | null>(null);
  const [systemQuery, setSystemQuery] = useState("");
  const [checkId, setCheckId] = useState<string | null>(null);
  const [checkQuery, setCheckQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  /* Scoped to the discipline once one is chosen — same rule AddItemSheet's
     own asset-system picker uses — and searched otherwise. */
  const systems = useMemo(() => {
    const all = discipline
      ? systemsOf(entityCode, discipline)
      : Array.from(new Set(checks.map((c) => c.system)));
    const q = systemQuery.trim().toLowerCase();
    const list = q ? all.filter((s) => s.toLowerCase().includes(q)) : all;
    return list.slice(0, 40);
  }, [entityCode, discipline, systemQuery, checks]);

  /* The SAME search the ⌘K jump-to-check palette (AppShell.tsx) runs — ID,
     wording, system, discipline or ACSA figure — so there is one fuzzy-search
     rule in this app, not two that can drift apart. */
  const checkResults = useMemo(() => {
    const q = checkQuery.trim().toLowerCase();
    const scoped = discipline ? checks.filter((c) => c.discipline === discipline) : checks;
    return scoped
      .filter(
        (c) =>
          !q ||
          `${portalIdFor(entityCode, c.id)} ${c.requirement} ${c.system} ${c.discipline} ${c.acsaThreshold}`
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 30);
  }, [checks, checkQuery, discipline, entityCode]);

  const pickedCheck = checkId ? checks.find((c) => c.id === checkId) ?? null : null;

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setDescription("");
    setDiscipline("");
    setSystem(null);
    setSystemQuery("");
    setCheckId(null);
    setCheckQuery("");
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = () => {
    const t = title.trim();
    if (!t) {
      setError("Say what you found. It is the one thing this cannot default.");
      return;
    }
    if (!discipline) {
      setError("Pick a discipline. Asset system and check-point are both optional, this is not.");
      return;
    }
    /* SAME DEFAULT SHAPE AS AddItemSheet.tsx'S raiseFinding — copied field for
       field so the two capture paths produce a consistently-shaped finding.
       checkId is null unless a check was picked here, which is exactly the
       case outstandingFor() already carries forward with no filtering on it. */
    const id = addFinding({
      checkId,
      discipline,
      system: system ?? "",
      area: "",
      title: t,
      description: description.trim() || t,
      issueIndex: null,
      severity: null,
      likelihood: null,
      ratingConfirmed: false,
      rootCause: "",
      actions: [],
      actionStatus: "Open",
      originVisit: visitId,
      priorRating: null,
      suggestedEvent: "",
      progress: [],
      adHoc: true,
      createdBy: auditor,
    });
    onSaved?.(id, `${id} raised${checkId ? "" : " — not tied to a check-point"}`);
    reset();
    onClose();
  };

  const label = "font-display text-[11px] font-semibold";
  const box = "mt-1 w-full rounded-[11px] border px-3 py-2.5 text-[13px] outline-none";
  const boxStyle = { background: "var(--panel)", borderColor: "var(--line-2)" };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Raise a finding"
      subtitle="A non-compliance picked up that may or may not tie to a specific check-point. It carries into every later visit's Follow-up screen until it is closed, same as any other finding."
      footer={
        <>
          <Btn variant="ghost" onClick={close}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={save} style={{ minHeight: 44 }}>
            Raise it
          </Btn>
        </>
      }
    >
      <label className="block">
        <span className={label}>What you found</span>
        <textarea
          autoFocus
          value={title}
          onChange={(e) => {
            setError(null);
            setTitle(e.target.value);
          }}
          placeholder="A short headline — e.g. Fire extinguisher past its service date"
          className={`${box} min-h-[52px] resize-y`}
          style={boxStyle}
        />
      </label>

      <label className="mt-3 block">
        <span className={label}>Description · optional</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Anything else worth recording — defaults to the headline above if left blank"
          className={`${box} min-h-[72px] resize-y`}
          style={boxStyle}
        />
      </label>

      {error && (
        <div className="mt-2 text-[11.5px]" style={{ color: "var(--warn)" }}>
          {error}
        </div>
      )}

      <label className="mt-4 block">
        <span className={label}>Discipline</span>
        <select
          value={discipline}
          onChange={(e) => {
            setError(null);
            setDiscipline(e.target.value);
            setSystem(null);
            setCheckId(null);
          }}
          className={box}
          style={boxStyle}
        >
          <option value="">Pick one…</option>
          {disciplines.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>

      <div className="mt-4">
        <span className={label}>Asset system · optional</span>
        {system ? (
          <div
            className="mt-1 flex items-center justify-between gap-2 rounded-[11px] border px-3 py-2.5"
            style={boxStyle}
          >
            <span className="text-[13px] font-semibold">{system}</span>
            <button
              onClick={() => setSystem(null)}
              aria-label="Clear asset system"
              className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px]"
              style={{ color: "var(--ink-3)" }}
            >
              <IconX width={14} height={14} />
            </button>
          </div>
        ) : (
          <>
            <div className="mt-1 flex items-center gap-2 rounded-[11px] border px-3" style={boxStyle}>
              <IconSearch width={14} height={14} style={{ color: "var(--ink-3)" }} />
              <input
                value={systemQuery}
                onChange={(e) => setSystemQuery(e.target.value)}
                placeholder="Search the register's asset systems…"
                aria-label="Search asset systems"
                className="min-h-[44px] w-full border-none bg-transparent text-[13px] outline-none"
              />
            </div>
            <div className="no-scrollbar mt-1.5 flex max-h-[132px] flex-wrap gap-[5px] overflow-y-auto">
              {systems.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSystem(s);
                    setSystemQuery("");
                  }}
                  className="rounded-full border px-[11px] py-[7px] text-[11px]"
                  style={{ background: "var(--panel)", borderColor: "var(--line)", color: "var(--ink-2)" }}
                >
                  {s}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-[10.5px]" style={{ color: "var(--ink-4)" }}>
              Leave it blank if this is not about a specific asset system.
            </span>
          </>
        )}
      </div>

      <div className="mt-4">
        <span className={label}>Check-point · optional</span>
        {pickedCheck ? (
          <div
            className="mt-1 flex items-center justify-between gap-2 rounded-[11px] border px-3 py-2.5"
            style={boxStyle}
          >
            <div className="min-w-0">
              <span className="block font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                {portalIdFor(entityCode, pickedCheck.id)}
              </span>
              <span className="block truncate text-[12.5px] font-semibold">{pickedCheck.requirement}</span>
            </div>
            <button
              onClick={() => setCheckId(null)}
              aria-label="Clear check-point"
              className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px]"
              style={{ color: "var(--ink-3)" }}
            >
              <IconX width={14} height={14} />
            </button>
          </div>
        ) : (
          <>
            <div className="mt-1 flex items-center gap-2 rounded-[11px] border px-3" style={boxStyle}>
              <IconSearch width={14} height={14} style={{ color: "var(--ink-3)" }} />
              <input
                value={checkQuery}
                onChange={(e) => setCheckQuery(e.target.value)}
                placeholder="Search by ID, wording, system or ACSA figure…"
                aria-label="Search check-points"
                className="min-h-[44px] w-full border-none bg-transparent text-[13px] outline-none"
              />
            </div>
            {checkQuery.trim() && (
              <div className="no-scrollbar mt-1.5 max-h-[160px] overflow-y-auto rounded-[11px] border" style={{ borderColor: "var(--line)" }}>
                {checkResults.length === 0 ? (
                  <div className="px-3 py-3 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    Nothing matches.
                  </div>
                ) : (
                  checkResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCheckId(c.id);
                        setCheckQuery("");
                        /* A check narrows the discipline/system a finding is
                           about — fill them in if nothing was picked yet,
                           same convenience AddItemSheet's area pre-fill gives,
                           never overwriting a deliberate choice already made. */
                        if (!discipline) setDiscipline(c.discipline);
                        if (!system) setSystem(c.system);
                      }}
                      className="flex w-full items-center gap-[9px] px-3 py-2 text-left hover:bg-[var(--acc-soft)]"
                    >
                      <span className="w-[86px] shrink-0 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {portalIdFor(entityCode, c.id)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px]">{c.requirement}</span>
                      <Pill>{c.discipline}</Pill>
                    </button>
                  ))
                )}
              </div>
            )}
            <span className="mt-1 block text-[10.5px]" style={{ color: "var(--ink-4)" }}>
              Leave it blank if this is not about one specific question — it will still carry
              into the next visit&rsquo;s Follow-up screen.
            </span>
          </>
        )}
      </div>
    </Sheet>
  );
}
