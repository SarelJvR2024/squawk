"use client";

/** AUDIT — one reusable capture for every "is there a current, valid
 *  document" check, instead of the full Checks screen rebuilt once per
 *  certificate, appointment, permit or record.
 *
 *  Sarel: "I want to look at a different way of grouping the audit check
 *  questions to have less repetition by per discipline... we always need to
 *  maintain the relationship between the way we ask the questions and the
 *  original 324 audit checks, so that we can always report back on those
 *  324 original questions." Two investigation passes (this session) found:
 *  text-similarity grouping collapses only 6.5% of the 324, and merging by
 *  evidence category (certificates, appointments, training, permits)
 *  mostly does NOT find mergeable duplicates — 207 of the 324 share a
 *  question SHAPE but are almost all genuinely distinct facts (a different
 *  certificate, a different appointee), so merging them would silently
 *  lose one's answer behind another's, exactly what the quote above rules
 *  out. The real win is reuse, not merging: one compact template, answered
 *  207 times, never 207 bespoke screens.
 *
 *  `Check.confirmedBy === "Document"` IS that 207-ish set, already a first
 *  -class field (180 of the 324 — see its own doc comment in types.ts: "a
 *  certificate, report, register, drawing or lab result. The number or the
 *  signature IS the compliance"). Using it, not a freshly-invented
 *  classifier, means this screen can never drift from what the rest of the
 *  app already agrees a document check is.
 *
 *  TRACEABILITY BY CONSTRUCTION, NOT BY PROMISE — every answer here calls
 *  the exact same store actions the Checks screen's own buttons call
 *  (setCompliance, commit, patch, addAttachment) against the SAME
 *  Response, keyed by the SAME checkId. There is no new record kind, no
 *  mapping table that could fall out of sync, and nothing synced,
 *  exported or reported differently because it was answered here instead
 *  of on Checks — this screen is a faster door into the same 324 rows,
 *  never a second copy of them. */

import { useMemo, useState } from "react";
import {
  checksAt,
  disciplinesAt,
  useDisciplineFilter,
  useEntityCode,
  useResponses,
  useStore,
} from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import OutcomeControl from "@/components/OutcomeControl";
import { AttachmentStrip, PhotoButton, VoiceNoteButton, forgetMedia } from "@/components/Capture";
import { Btn, Empty } from "@/components/ui/primitives";
import { DisciplineSelect } from "@/components/ui/DisciplineSelect";
import { IconCheck, IconClock, IconDash, IconX } from "@/components/ui/icons";

const VERDICT_ICON = { C: IconCheck, NC: IconX, "N/A": IconDash, NV: IconClock } as const;
const VERDICT_COLOR = { C: "var(--good)", NC: "var(--bad)", "N/A": "var(--ink-3)", NV: "var(--warn)" } as const;

/** THE SHORT NOTE. Sarel: "a short note next to the asset type to know what
 *  the question and check is so that all dont look the same" — collapsed
 *  under one system heading, several checks about the same AGL circuit or
 *  the same switchgear used to read as identical rows with nothing but a
 *  portal id telling them apart. The first line of the check's own
 *  `requirement` (the same text the Checks screen headlines) is what
 *  distinguishes them, so this reads it rather than inventing a second
 *  summary that could drift from what the check actually asks. */
const shortNote = (requirement: string, max = 54) => {
  const line = requirement.split("\n")[0].trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

export default function AuditPage() {
  const entityCode = useEntityCode();
  const auditor = useStore((s) => s.auditor);
  const responses = useResponses();

  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const pickedDiscipline = useDisciplineFilter();
  const setDiscipline = useStore((s) => s.setDisciplineFilter);
  /* Same fallback Checks itself uses: nothing picked, or a discipline this
     site does not have, lands on the first one rather than an empty
     screen. */
  const discipline = disciplines.includes(pickedDiscipline) ? pickedDiscipline : disciplines[0];

  const setCompliance = useStore((s) => s.setCompliance);
  const commit = useStore((s) => s.commit);
  const patch = useStore((s) => s.patch);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const updateAttachment = useStore((s) => s.updateAttachment);

  /* `explicitlyClosed` is tracked separately from `openId` because `openId:
     null` already means something — "nothing tapped yet, show the next
     unanswered check" — and reusing it for "the auditor just collapsed the
     open card" would make the card reopen itself on the very next render
     whenever the closed check was still the first pending one. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [explicitlyClosed, setExplicitlyClosed] = useState(false);

  const allDocChecks = useMemo(
    () => checksAt(entityCode).filter((c) => c.confirmedBy === "Document"),
    [entityCode]
  );
  const scoped = useMemo(
    () => allDocChecks.filter((c) => c.discipline === discipline),
    [allDocChecks, discipline]
  );

  /* THE HIGHER-LEVEL HEADING. Sarel: "add a higher level heading grouping
     similar questions." `Check.system` — the asset system every check
     already carries, not a freshly invented category — is exactly that:
     checks about the same AGL circuit or the same switchgear ARE the
     "similar questions" grouping is for, and the register is already
     ordered by system within a discipline, so this costs nothing to derive
     and nothing to keep in sync. A text-matched evidence category (tried
     earlier this session) risks miscategorising a check nobody can then
     find; grouping by the field the register itself already states cannot
     drift or mislabel. */
  const groups = useMemo(() => {
    const bySystem = new Map<string, typeof scoped>();
    for (const c of scoped) {
      const list = bySystem.get(c.system);
      if (list) list.push(c);
      else bySystem.set(c.system, [c]);
    }
    return [...bySystem.entries()];
  }, [scoped]);

  const pending = scoped.filter((c) => responses[c.id]?.compliance == null);
  const done = scoped.filter((c) => responses[c.id]?.compliance != null);
  /* The open item — whichever row the auditor tapped, or the next
     unanswered one. Exactly one at a time, same reasoning the Inspection
     screen's own accordion gives: everything expanded is nothing read. */
  const activeId = explicitlyClosed
    ? null
    : openId && scoped.some((c) => c.id === openId)
      ? openId
      : (pending[0]?.id ?? null);

  const changeDiscipline = (v: string) => {
    setDiscipline(v);
    setOpenId(null);
    setExplicitlyClosed(false);
  };

  const openCheck = (id: string) => {
    setOpenId(id);
    setExplicitlyClosed(false);
  };

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[640px] px-4 pb-24 pt-3">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-[15px] font-semibold">Audit</h2>
          <span className="font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
            {done.length}/{scoped.length}
          </span>
        </header>

        <DisciplineSelect
          ariaLabel="Discipline"
          value={discipline ?? ""}
          onChange={changeDiscipline}
          options={disciplines.map((d) => {
            const cs = allDocChecks.filter((c) => c.discipline === d);
            const n = cs.filter((c) => responses[c.id]?.compliance != null).length;
            return { value: d, label: `${d} — ${n}/${cs.length}` };
          })}
          className="mb-3 w-full"
        />

        {scoped.length === 0 ? (
          <Empty>No document checks in this discipline.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(([system, group]) => {
              const groupDone = group.filter((c) => responses[c.id]?.compliance != null).length;
              return (
                <div key={system} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between px-[2px]">
                    <h3
                      className="font-display text-[11.5px] font-bold uppercase tracking-[.03em]"
                      style={{ color: "var(--ink-3)" }}
                    >
                      {system}
                    </h3>
                    <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                      {groupDone}/{group.length}
                    </span>
                  </div>

                  {group.map((c) => {
                    const r = responses[c.id];
                    const open = c.id === activeId;
                    const verdict = r?.compliance ?? null;

                    if (!open) {
                      const Icon = verdict ? VERDICT_ICON[verdict] : null;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => openCheck(c.id)}
                          className="flex min-h-[48px] w-full items-center gap-[10px] rounded-[12px] border px-[13px] py-[9px] text-left"
                          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                        >
                          {Icon ? (
                            <Icon width={14} height={14} style={{ color: VERDICT_COLOR[verdict!], flexShrink: 0 }} />
                          ) : (
                            <span
                              aria-hidden
                              className="h-[14px] w-[14px] shrink-0 rounded-full border"
                              style={{ borderColor: "var(--line-2)" }}
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                            {shortNote(c.requirement)}
                          </span>
                          <span className="shrink-0 font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                            {portalIdFor(entityCode, c.id)}
                          </span>
                        </button>
                      );
                    }

                    const attachments = r?.attachments ?? [];

                    return (
                      <div
                        key={c.id}
                        className="flex flex-col gap-[11px] rounded-[14px] border px-[16px] py-[14px]"
                        style={{
                          background: "var(--panel)",
                          borderColor: "var(--acc)",
                          boxShadow: "0 0 0 3px var(--acc-soft)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setExplicitlyClosed(true)}
                          aria-label="Collapse this check"
                          className="flex items-start justify-between gap-2 text-left"
                        >
                          <div className="min-w-0">
                            <div className="text-[14px] font-bold">{c.system}</div>
                            <div
                              className="mt-[3px] text-[12px] font-medium leading-snug"
                              style={{ color: "var(--ink-2)" }}
                            >
                              {c.requirement}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                            {portalIdFor(entityCode, c.id)}
                          </span>
                        </button>

                        <OutcomeControl
                          value={verdict}
                          idPrefix={c.id}
                          size={44}
                          onChange={(next) => {
                            setCompliance(c.id, next);
                            commit(c.id, "desk");
                            if (next !== null) {
                              const nextPending = scoped.find(
                                (x) => x.id !== c.id && responses[x.id]?.compliance == null
                              );
                              setOpenId(nextPending?.id ?? null);
                              setExplicitlyClosed(false);
                            }
                          }}
                        />

                        <textarea
                          value={r?.observation ?? ""}
                          onChange={(e) => patch(c.id, { observation: e.target.value })}
                          placeholder="Number, issuer, dates…"
                          className="min-h-[40px] w-full resize-y rounded-[10px] border px-[10px] py-[7px] text-[11.5px] outline-none"
                          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                        />

                        <div className="flex gap-[8px]">
                          <PhotoButton
                            compact
                            onCaptured={(m) => addAttachment(c.id, { ...m, createdBy: auditor })}
                          />
                          <VoiceNoteButton
                            compact
                            onCaptured={(m) => addAttachment(c.id, { ...m, createdBy: auditor })}
                          />
                        </div>

                        {attachments.length > 0 && (
                          <AttachmentStrip
                            attachments={attachments}
                            thumbSize={40}
                            hideDescribe
                            onRemove={(id) => {
                              const a = attachments.find((x) => x.id === id);
                              if (a) void forgetMedia(a.blobKey);
                              removeAttachment(c.id, id);
                            }}
                            onUpdate={(id, p) => updateAttachment(c.id, id, p)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {pending.length === 0 && done.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              All document checks answered in {discipline}.
            </span>
            <Btn
              variant="ghost"
              onClick={() => {
                const i = disciplines.indexOf(discipline);
                changeDiscipline(disciplines[(i + 1) % disciplines.length]);
              }}
            >
              Next discipline
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}
