"use client";

/** INTERVIEW RECORDS — the contract's on-site audit phase, on the tablet.
 *
 *  ACSA asked for this by name and is paying for it as a line item. Scope 4.2:
 *  "Interview key personnel and stakeholders (e.g. Airport Operations
 *  Departments, Contractors, etc.) to gather information and insights." Pricing
 *  schedule 1.2.6(b), "Interviews with key personnel and stakeholders", priced
 *  at every one of the ten airports. An interview nobody wrote down is work
 *  TPJV did, invoiced for, and cannot show.
 *
 *  It also does something the other screens cannot. Thirty of the 324
 *  check-points are `confirmedBy: "Practice"` — compliance turns on whether the
 *  round actually happens and whether a bad reading actually produces an
 *  action, not on what the file says. Those are the ones that read clean on
 *  paper and fail in the corridor, and the only person who knows is the one who
 *  does the work.
 *
 *  Three things shape the screen.
 *
 *  ONE FIELD STARTS IT. A name. The auditor has somebody's attention and two
 *  minutes of it; a form that wants an organisation and a discipline before it
 *  will record a word is a form filled in afterwards from memory, and the
 *  sentence that mattered is the one that gets lost.
 *
 *  TESTIMONY IS NOT EVIDENCE. A statement links to the check-points it bears
 *  on. It does not answer them, and there is no control on this screen that
 *  sets a check's status — deliberately, and the suite holds it shut. What
 *  somebody said is one input to a judgement the auditor makes with the
 *  document and the asset in front of them.
 *
 *  THE READ-BACK IS THE POINT. The ninety seconds at the end, while the person
 *  is still standing there, is the only moment this record can be confirmed. So
 *  the app composes the text and the auditor reads it out — and if anything is
 *  edited afterwards, the confirmation goes, because what they agreed to was
 *  what they heard. */

import { useMemo, useState } from "react";
import {
  checksAt,
  disciplinesAt,
  useEntityCode,
  useInterviews,
  useStore,
} from "@/lib/store";
import {
  KIND_LABEL,
  PARTY_LABEL,
  citationBlockers,
  durationMs,
  interviewStage,
  interviewText,
  isCitable,
  missingFields,
} from "@/lib/interviews";
import { portalIdFor, siteCodeFor, siteFor } from "@/lib/sites";
import { useNow } from "@/lib/clock";
import { AttachmentStrip, PhotoButton, VoiceNoteButton } from "@/components/Capture";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";
import type { Interview, InterviewParty, InterviewStage, StatementKind } from "@/lib/types";

const PARTIES: InterviewParty[] = ["ACSA", "tenant", "contractor", "other"];
const KINDS: StatementKind[] = ["summary", "quote"];

/** The stage carries how far the conversation got; the CITABLE pill beside it
 *  carries whether the record is worth anything, and they are different
 *  questions. An interview can be finished and unusable. */
const STAGE: Record<InterviewStage, { label: string; tone: "accent" | undefined }> = {
  open: { label: "IN PROGRESS", tone: "accent" },
  ended: { label: "ENDED", tone: undefined },
  confirmed: { label: "CONFIRMED BY INTERVIEWEE", tone: "accent" },
};

function mins(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function clock(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const inputCls = "w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

export default function InterviewsPage() {
  const interviews = useInterviews();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const add = useStore((s) => s.addInterview);
  const patch = useStore((s) => s.updateInterview);
  const addNote = useStore((s) => s.addInterviewNote);
  const patchNote = useStore((s) => s.updateInterviewNote);
  const removeNote = useStore((s) => s.removeInterviewNote);
  const addPhoto = useStore((s) => s.addInterviewAttachment);
  const removePhoto = useStore((s) => s.removeInterviewAttachment);
  const updatePhoto = useStore((s) => s.updateInterviewAttachment);

  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const site = siteFor(entityCode);
  const now = useNow();

  /* The check-points a statement can be attached to, with the thirty that an
     interview is the ONLY way to settle offered first. They are not a separate
     list — an interview often speaks to a Document check too, and hiding those
     would force the auditor to file the sentence somewhere it does not
     belong. */
  const { practice, rest } = useMemo(() => {
    const all = checksAt(entityCode);
    return {
      practice: all.filter((c) => c.confirmedBy === "Practice"),
      rest: all.filter((c) => c.confirmedBy !== "Practice"),
    };
  }, [entityCode]);

  function start() {
    const name = draft.trim();
    if (!name) return;
    const id = add(name);
    setDraft("");
    /* Open it straight away: the next thing to do is tell them a record is
       being kept, and that control is the first thing in the panel. */
    setOpenId(id);
  }

  async function copyRecord(iv: Interview) {
    const text = interviewText(iv, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
      portalId: (id) => portalIdFor(entityCode, id),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(iv.id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      /* Same fallback as the safety notice: a locked-down tablet refuses the
         clipboard often enough that failing silently here would be a read-back
         nobody did. */
      window.prompt("Copy this record", text);
    }
  }

  const running = interviews.filter((iv) => !iv.endedAt);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">Interview records</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Scope of work, Part C3 — interview key personnel and stakeholders. Thirty
          check-points are confirmed by practice, and the person who does the work is
          the only one who knows.
        </p>
      </header>

      {/* START. Pinned, one field, because the auditor is standing in front of
          somebody who is about to walk away. */}
      <Panel tone="accent" className="mb-4">
        <Field label="WHO ARE YOU TALKING TO?" hint="the only field needed to start">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            /* A placeholder is not a name — it vanishes on the first keystroke
               and no screen reader ever announced it. Field renders its label
               as a <b> beside the control rather than a <label> bound to it, so
               every control here carries its own aria-label. */
            aria-label="Who are you talking to?"
            placeholder="T. Nkosi"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {running.length
              ? `${running.length} STILL OPEN`
              : "THE CLOCK STARTS WHEN YOU DO"}
          </span>
          <Btn variant="primary" onClick={start} disabled={!draft.trim()}>
            Start
          </Btn>
        </div>
      </Panel>

      {interviews.length === 0 ? (
        <Empty>
          <b>No interviews recorded.</b>
          <span>
            What somebody says is not a finding and does not settle a check — it is
            evidence of what was said, and for thirty check-points it is the only
            evidence there is.
          </span>
        </Empty>
      ) : null}

      {interviews.map((iv) => {
        const stage = interviewStage(iv);
        const ran = durationMs(iv, now);
        const gaps = missingFields(iv);
        const blockers = citationBlockers(iv);
        const isOpen = openId === iv.id;
        return (
          <div key={iv.id} className="mb-3">
            <Panel tone={STAGE[stage].tone}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : iv.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">{iv.id}</span>
                    <Pill>{STAGE[stage].label}</Pill>
                    {iv.party ? <Pill>{PARTY_LABEL[iv.party].toUpperCase()}</Pill> : null}
                    {!isCitable(iv) ? <Pill tone="warn">NOT CITABLE</Pill> : null}
                  </div>
                  <p className="mt-1 text-[13px]">
                    {iv.name || "—"}
                    {iv.role ? ` — ${iv.role}` : ""}
                  </p>
                  <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {clock(iv.startedAt)}
                    {ran !== null ? ` · ${mins(ran).toUpperCase()}` : ""}
                    {` · ${iv.notes.length} STATEMENT${iv.notes.length === 1 ? "" : "S"}`}
                    {iv.conductedBy ? ` · ${iv.conductedBy}` : ""}
                  </div>
                </div>
              </button>

              {isOpen ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  {/* TELL THEM FIRST. It is at the top of the panel because it
                      belongs at the start of the conversation, not at the end
                      of the form — and because an interview where nobody was
                      told is the one this record cannot use. */}
                  <Field
                    label="TELL THEM A RECORD IS BEING KEPT"
                    hint={iv.noticeGiven ? "RECORDED" : "before you write anything down"}
                  >
                    {iv.noticeGiven ? (
                      <div className="flex items-center gap-2">
                        <p className="text-[12px]">
                          Told that what they say is being written down.
                        </p>
                        <Btn onClick={() => patch(iv.id, { noticeGiven: false })}>
                          <IconX /> Undo
                        </Btn>
                      </div>
                    ) : (
                      <Btn variant="primary" onClick={() => patch(iv.id, { noticeGiven: true })}>
                        <IconCheck /> I have told them
                      </Btn>
                    )}
                  </Field>

                  <Field label="WHO THEY ARE" hint="a name without a role cannot be quoted">
                    <input
                      value={iv.name}
                      onChange={(e) => patch(iv.id, { name: e.target.value })}
                      aria-label={`Name of the person in ${iv.id}`}
                      placeholder="Full name"
                      className={`mb-2 ${inputCls}`}
                      style={inputStyle}
                    />
                    <input
                      value={iv.role}
                      onChange={(e) => patch(iv.id, { role: e.target.value })}
                      aria-label={`Role of the person in ${iv.id}`}
                      placeholder="Role — Facilities Manager, Millwright, Duty Electrician"
                      className={`mb-2 ${inputCls}`}
                      style={inputStyle}
                    />
                    <input
                      value={iv.organisation}
                      onChange={(e) => patch(iv.id, { organisation: e.target.value })}
                      aria-label={`Employer or department for ${iv.id}`}
                      placeholder="Employer or department"
                      className={`mb-2 ${inputCls}`}
                      style={inputStyle}
                    />
                    <div className="flex flex-wrap gap-2">
                      {PARTIES.map((p) => (
                        <Btn
                          key={p}
                          variant={iv.party === p ? "primary" : "default"}
                          onClick={() => patch(iv.id, { party: p })}
                        >
                          {PARTY_LABEL[p]}
                        </Btn>
                      ))}
                    </div>
                  </Field>

                  <Field label="CONTACT" hint="so a loose end is a phone call">
                    <input
                      value={iv.contact}
                      onChange={(e) => patch(iv.id, { contact: e.target.value })}
                      aria-label={`Contact details for ${iv.id}`}
                      placeholder="Extension, mobile or e-mail"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="WHERE">
                    <input
                      value={iv.location}
                      onChange={(e) => patch(iv.id, { location: e.target.value })}
                      aria-label={`Where ${iv.id} took place`}
                      placeholder="Maintenance office, Pier B"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="DISCIPLINE">
                    <select
                      value={iv.discipline ?? ""}
                      onChange={(e) => patch(iv.id, { discipline: e.target.value || null })}
                      aria-label={`Discipline for ${iv.id}`}
                      className={inputCls}
                      style={inputStyle}
                    >
                      <option value="">Not attributed</option>
                      {disciplines.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {/* WHAT WAS SAID. */}
                  <Field
                    label="WHAT WAS SAID"
                    hint={iv.notes.length ? `${iv.notes.length} recorded` : "nothing yet"}
                  >
                    {iv.notes.map((n) => (
                      <div
                        key={n.id}
                        className="mb-3 rounded-[9px] border p-2.5"
                        style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            {n.ref}
                          </span>
                          <div className="flex gap-2">
                            {/* SUMMARY IS THE DEFAULT AND VERBATIM IS THE
                                DELIBERATE ACT. Putting a paraphrase in
                                quotation marks under somebody's name is the
                                one way this record hurts TPJV instead of
                                defending it. */}
                            {KINDS.map((k) => (
                              <Btn
                                key={k}
                                variant={n.kind === k ? "primary" : "default"}
                                onClick={() => patchNote(iv.id, n.id, { kind: k })}
                              >
                                {KIND_LABEL[k]}
                              </Btn>
                            ))}
                          </div>
                        </div>
                        <input
                          value={n.question}
                          onChange={(e) => patchNote(iv.id, n.id, { question: e.target.value })}
                          aria-label={`What was asked, ${n.ref}`}
                          placeholder="What did you ask? (optional — people volunteer things)"
                          className={`mb-2 ${inputCls}`}
                          style={inputStyle}
                        />
                        <textarea
                          value={n.answer}
                          onChange={(e) => patchNote(iv.id, n.id, { answer: e.target.value })}
                          rows={2}
                          aria-label={`What was said, ${n.ref}`}
                          placeholder={
                            n.kind === "quote"
                              ? "Their words, as they said them"
                              : "What they told you, in your words"
                          }
                          className={`mb-2 ${inputCls}`}
                          style={inputStyle}
                        />

                        {/* BEARS ON, never "answers". */}
                        <div className="mb-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                          BEARS ON — DOES NOT SETTLE — THESE CHECK-POINTS
                        </div>
                        {n.checkIds.length ? (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {n.checkIds.map((cid) => (
                              <button
                                key={cid}
                                type="button"
                                onClick={() =>
                                  patchNote(iv.id, n.id, {
                                    checkIds: n.checkIds.filter((x) => x !== cid),
                                  })
                                }
                                className="rounded-[6px] border px-2 py-1 font-mono text-[9px]"
                                style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                                aria-label={`Remove ${portalIdFor(entityCode, cid)}`}
                              >
                                {portalIdFor(entityCode, cid)} ×
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <select
                          value=""
                          onChange={(e) => {
                            const cid = e.target.value;
                            if (!cid || n.checkIds.includes(cid)) return;
                            patchNote(iv.id, n.id, { checkIds: [...n.checkIds, cid] });
                          }}
                          aria-label={`Link a check-point to ${n.ref}`}
                          className={`mb-2 ${inputCls}`}
                          style={inputStyle}
                        >
                          <option value="">Link a check-point…</option>
                          <optgroup label="Confirmed by practice — an interview is the evidence">
                            {practice.map((c) => (
                              <option key={c.id} value={c.id}>
                                {portalIdFor(entityCode, c.id)} — {c.requirement.slice(0, 70)}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Every other check-point">
                            {rest.map((c) => (
                              <option key={c.id} value={c.id}>
                                {portalIdFor(entityCode, c.id)} — {c.requirement.slice(0, 70)}
                              </option>
                            ))}
                          </optgroup>
                        </select>

                        <div className="flex justify-end">
                          <Btn onClick={() => removeNote(iv.id, n.id)}>
                            <IconX /> Remove
                          </Btn>
                        </div>
                      </div>
                    ))}
                    <Btn variant="primary" onClick={() => addNote(iv.id)}>
                      Add a statement
                    </Btn>
                  </Field>

                  <Field label="PHOTOGRAPHS AND VOICE NOTES">
                    <div className="flex justify-end gap-2">
                      <PhotoButton
                        compact
                        onCaptured={(m) =>
                          addPhoto(iv.id, {
                            ...m,
                            location: iv.location.trim(),
                            createdBy: auditor,
                          })
                        }
                      />
                      <VoiceNoteButton
                        compact
                        onCaptured={(m) => addPhoto(iv.id, { ...m, createdBy: auditor })}
                      />
                    </div>
                    {iv.attachments.length > 0 ? (
                      <div className="mt-2">
                        <AttachmentStrip
                          attachments={iv.attachments}
                          thumbSize={40}
                          onRemove={(aid) => removePhoto(iv.id, aid)}
                          onUpdate={(aid, p) => updatePhoto(iv.id, aid, p)}
                        />
                      </div>
                    ) : null}
                  </Field>

                  {!iv.endedAt ? (
                    <Field label="END" hint="when they walk away">
                      <Btn onClick={() => patch(iv.id, { endedAt: Date.now() })}>
                        End the interview
                      </Btn>
                    </Field>
                  ) : (
                    <Field label="ENDED">
                      <p className="text-[12px]">
                        {clock(iv.endedAt)}
                        {ran !== null ? ` · ran ${mins(ran)}` : ""}
                      </p>
                    </Field>
                  )}

                  {/* THE READ-BACK. */}
                  <Field
                    label="READ IT BACK"
                    hint={
                      iv.confirmedAt
                        ? `CONFIRMED ${clock(iv.confirmedAt)}`
                        : "while they are still standing there"
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      <Btn onClick={() => void copyRecord(iv)}>
                        {copied === iv.id ? "Copied" : "Copy the record"}
                      </Btn>
                      {!iv.confirmedAt ? (
                        <Btn
                          onClick={() => patch(iv.id, { confirmedAt: Date.now() })}
                          disabled={iv.notes.length === 0}
                        >
                          <IconCheck /> They confirmed it
                        </Btn>
                      ) : (
                        <Btn onClick={() => patch(iv.id, { confirmedAt: null })}>
                          <IconX /> Withdraw the confirmation
                        </Btn>
                      )}
                    </div>
                    {iv.confirmedAt ? (
                      <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        EDITING ANY STATEMENT CLEARS THIS — THEY CONFIRMED WHAT THEY HEARD
                      </p>
                    ) : null}
                  </Field>

                  {blockers.length ? (
                    <p className="font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                      NOT CITABLE IN THE REPORT: {blockers.join(", ").toUpperCase()}
                    </p>
                  ) : null}
                  {gaps.length ? (
                    <p className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                      STILL MISSING: {gaps.join(", ").toUpperCase()}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </Panel>
          </div>
        );
      })}
    </div>
  );
}
