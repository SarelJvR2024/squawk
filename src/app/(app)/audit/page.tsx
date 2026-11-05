"use client";

/** AUDIT — all 324 check-points, grouped by asset system instead of the
 *  Checks screen's one-full-workspace-per-check flow, for an auditor who
 *  wants to move fast through a discipline without losing track of which
 *  question they are answering.
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
 *  out. Later, Sarel: "Keep all 324 checks in the audit tab" — so this
 *  screen does not scope down to a subset at all; the win is reuse and
 *  organisation, never merging two checks' answers into one.
 *
 *  THE GROUPING: `Check.system` — a field every check already carries, not
 *  a freshly invented category — groups "similar questions" exactly as
 *  asked, because checks about the same AGL circuit or the same switchgear
 *  genuinely are related, and the register is already ordered by system
 *  within a discipline. Each group's heading previews the first check's own
 *  requirement text so the question is readable before opening anything,
 *  and each row below carries a short note of its OWN requirement — a real
 *  check's real wording, never a synthesised "shared question" standing in
 *  for several different ones.
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
import { useShared } from "@/lib/shared";
import OutcomeControl from "@/components/OutcomeControl";
import { AttachmentStrip, PhotoButton, VoiceNoteButton, forgetMedia } from "@/components/Capture";
import { Btn, Empty } from "@/components/ui/primitives";
import { DisciplineSelect } from "@/components/ui/DisciplineSelect";
import { IconCheck, IconClock, IconDash, IconLoop, IconX } from "@/components/ui/icons";
import auditTopicsData from "@/data/auditTopics.json";

const VERDICT_ICON = { C: IconCheck, NC: IconX, "N/A": IconDash, NV: IconClock } as const;
const VERDICT_COLOR = { C: "var(--good)", NC: "var(--bad)", "N/A": "var(--ink-3)", NV: "var(--warn)" } as const;

/** THE INTERVIEW GROUPING. Sarel: "Find ways how to group the audit checks
 *  ie by documentation, by compliance certification, by maintenance tasks,
 *  Planned maintenance, inspections, measurements, training and personel.
 *  This will help with the interview questions to ask the question and
 *  cover multiple sequential topics in the same questions manner without
 *  repeating ie do you perform planned maintenance for grass cutting,
 *  painting, FoD etc."
 *
 *  A REGEX CLASSIFIER WAS TRIED AND REJECTED. Keyword-matching the register's
 *  free text put "ILS" under Training (a loose "train" match elsewhere in
 *  its evidence text) and an HVAC "Fresh air induction Fans" check under
 *  Training too ("induction" means something different in ventilation than
 *  in a safety onboarding sense, and no regex can tell them apart). Tightening
 *  the patterns to kill those false positives dropped over 200 of the 324
 *  into an unhelpful "Other" bucket. Exactly the failure this session's
 *  earlier evidence-category investigation already found — text-matching
 *  this register is not reliable enough to show an auditor as fact.
 *
 *  So the topic for each check is a HAND-JUDGED, STATIC lookup —
 *  `src/data/auditTopics.json`, one topic per checkId — the same pattern
 *  this app already uses for `priorFindings.json`/`priorRatings.json`: data
 *  that needs real judgment is curated once and stored, not derived at
 *  runtime from a pattern that can quietly misfire on the next odd phrasing
 *  the register adds. It is reviewable and correctable exactly like those
 *  files, by anyone reading plain JSON, which a regex is not. */
const TOPIC_ORDER = [
  "Documentation",
  "Compliance certification",
  "Maintenance tasks",
  "Planned maintenance",
  "Inspections",
  "Measurements",
  "Training",
  "Personnel",
  "Other",
] as const;
const auditTopics = auditTopicsData as Record<string, string>;
/** "Other" rather than silently dropping a check some future register edit
 *  left unmapped — the alternative is a check that vanishes from Topic mode
 *  entirely, which is worse than one sitting in an honestly-labelled bucket. */
const topicFor = (checkId: string) => auditTopics[checkId] ?? "Other";

/** THE SHORT NOTE. Sarel: "a short note next to the asset type to know what
 *  the question and check is so that all dont look the same" — collapsed
 *  under one system heading, several checks about the same AGL circuit or
 *  the same switchgear used to read as identical rows with nothing but a
 *  portal id telling them apart. The first line of the check's own
 *  `requirement` (the same text the Checks screen headlines, and the same
 *  text the group heading below previews for its first check) is what
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
  const shared = useShared();

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
  /* "System" is the capture-friendly default — one physical thing, the
     checks about it right there together. "Topic" is the interview-friendly
     view: Sarel's own example is asking every planned-maintenance question
     (grass cutting, painting, FOD) in one run rather than jumping back to
     it once per asset system. Neither reorders or merges anything that gets
     written — both are the same 324 rows, same store actions, just grouped
     by a different one of the check's own fields. */
  const [groupMode, setGroupMode] = useState<"system" | "topic">("system");

  const allChecks = useMemo(() => checksAt(entityCode), [entityCode]);
  const scoped = useMemo(
    () => allChecks.filter((c) => c.discipline === discipline),
    [allChecks, discipline]
  );

  /* THE HIGHER-LEVEL HEADING. Sarel: "add a higher level heading grouping
     similar questions." In System mode, `Check.system` — a field every
     check already carries, not a freshly invented category — is exactly
     that: checks about the same AGL circuit or the same switchgear ARE the
     "similar questions" grouping is for, and the register is already
     ordered by system within a discipline, so this costs nothing to derive
     and nothing to keep in sync. In Topic mode the grouping key comes from
     `topicFor()` — the hand-judged static lookup documented above — instead
     of `Check.system`; everything else about how a group renders is
     identical. */
  const groups = useMemo(() => {
    const byKey = new Map<string, typeof scoped>();
    const keyOf = groupMode === "topic" ? (c: (typeof scoped)[number]) => topicFor(c.id) : (c: (typeof scoped)[number]) => c.system;
    for (const c of scoped) {
      const key = keyOf(c);
      const list = byKey.get(key);
      if (list) list.push(c);
      else byKey.set(key, [c]);
    }
    if (groupMode === "topic") {
      return [...byKey.entries()].sort(
        ([a], [b]) => TOPIC_ORDER.indexOf(a as (typeof TOPIC_ORDER)[number]) - TOPIC_ORDER.indexOf(b as (typeof TOPIC_ORDER)[number])
      );
    }
    return [...byKey.entries()];
  }, [scoped, groupMode]);

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

  const changeGroupMode = (mode: "system" | "topic") => {
    setGroupMode(mode);
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
          <div className="flex items-center gap-[8px]">
            <span className="font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
              {done.length}/{scoped.length}
            </span>
            {/* SAVE, RIGHT WHERE THE WORK IS. Sarel: "Add a save button on
                audit page so that info can be saved and synced." Every
                verdict here already commits to this device the moment it is
                tapped — setCompliance/commit above are called immediately,
                same as everywhere else in this app, so there is never an
                unsaved draft sitting in memory. What this button adds is the
                network half: the SAME shared.syncNow() the top-bar Refresh
                button and the Shared record sheet's own "Sync now" call —
                not a third copy — reachable without leaving this screen, so
                an auditor can push a batch of answers to the team record on
                demand instead of waiting for the 30-second poll. Gated
                identically to the top-bar button: hidden with nothing to
                sync to (state "off") or on a locked device, since syncNow()
                has no passphrase to sync with yet and would otherwise no-op
                silently. */}
            {shared && shared.state !== "off" && shared.unlocked && (
              <button
                type="button"
                onClick={() => shared.syncNow()}
                disabled={shared.state === "syncing"}
                title={
                  shared.state === "syncing"
                    ? "Saving to the team record…"
                    : shared.lastSyncAt
                      ? `Save — last saved ${new Date(shared.lastSyncAt).toLocaleTimeString("en-ZA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : "Save to the team record"
                }
                className="flex min-h-[32px] items-center gap-[5px] rounded-[8px] border px-[10px] font-display text-[11px] font-semibold"
                style={{
                  background: shared.state === "error" ? "var(--warn-bg)" : "var(--panel)",
                  borderColor: shared.state === "error" ? "var(--warn-line)" : "var(--line-2)",
                  color: shared.state === "error" ? "var(--warn)" : "var(--ink-2)",
                  opacity: shared.state === "syncing" ? 0.6 : 1,
                }}
              >
                <IconLoop width={13} height={13} />
                {shared.state === "syncing" ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </header>

        <DisciplineSelect
          ariaLabel="Discipline"
          value={discipline ?? ""}
          onChange={changeDiscipline}
          options={disciplines.map((d) => {
            const cs = allChecks.filter((c) => c.discipline === d);
            const n = cs.filter((c) => responses[c.id]?.compliance != null).length;
            return { value: d, label: `${d} — ${n}/${cs.length}` };
          })}
          className="mb-2 w-full"
        />

        {/* GROUP BY. Sarel: group by asset system for capture, or by topic
            (documentation, planned maintenance, training, ...) to run an
            interview through one theme at a time across several systems
            without repeating the question shape per asset. */}
        <div
          role="radiogroup"
          aria-label="Group by"
          className="mb-3 grid w-full grid-cols-2 gap-[3px] rounded-[10px] border p-[3px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
        >
          {(
            [
              ["system", "By system"],
              ["topic", "By topic"],
            ] as const
          ).map(([mode, label]) => {
            const on = groupMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => changeGroupMode(mode)}
                className="min-h-[36px] rounded-[7px] font-display text-[11.5px] font-semibold"
                style={{
                  background: on ? "var(--acc)" : "transparent",
                  color: on ? "var(--on-acc)" : "var(--ink-2)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {scoped.length === 0 ? (
          <Empty>No checks in this discipline.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(([groupKey, group]) => {
              const groupDone = group.filter((c) => responses[c.id]?.compliance != null).length;
              return (
                <div key={groupKey} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2 px-[2px]">
                    <div className="min-w-0">
                      <h3
                        className="font-display text-[11.5px] font-bold uppercase tracking-[.03em]"
                        style={{ color: "var(--ink-3)" }}
                      >
                        {groupKey}
                      </h3>
                      {/* The heading previews the FIRST check's own requirement —
                          a real question, not a synthesised one standing in for
                          several different checks — so a system with more than
                          one check still reads honestly: this is an example of
                          what this group asks, not a claim every row asks it. */}
                      <div className="mt-[2px] text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>
                        {shortNote(group[0].requirement, 72)}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
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
                            {groupMode === "topic" ? `${c.system} — ${shortNote(c.requirement, 42)}` : shortNote(c.requirement)}
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
                          placeholder="Observation, number, issuer, dates…"
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
              All checks answered in {discipline}.
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
