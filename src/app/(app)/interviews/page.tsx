"use client";

/** INTERVIEW RECORDS — one register per site per day, on the tablet.
 *
 *  ACSA asked for this by name. Scope 4.2, the on-site audit phase: "Interview
 *  key personnel and stakeholders (e.g. Airport Operations Departments,
 *  Contractors, etc.) to gather information and insights." Pricing schedule
 *  1.2.6(b), "Interviews with key personnel and stakeholders", priced at
 *  every one of the ten airports. An interview nobody wrote down is work
 *  TPJV did, invoiced for, and cannot show.
 *
 *  REBUILT 28 September 2026, on Sarel's word, watching the earlier version
 *  live: "this is too formal, we just need a record of who we interview on
 *  which day, what the location was, from and to. and space for their
 *  signature and an approval at the end to close of the record of the days
 *  interviews." The earlier build carried statements linked to check-points,
 *  a quote/summary distinction and a citability verdict — all of that judged
 *  what was SAID, which is the auditor's own job on the check screen. What
 *  this register does is narrower and it is the whole point: prove the
 *  conversation happened, at this time, in this place, with this person.
 *
 *  Shaped exactly like site attendance, because it answers the same kind of
 *  question. One field starts an entry — a name. Ending it and signing it can
 *  wait until there is somewhere safer to do it. And the day itself is closed
 *  by one approval at the end, which is the attestation that the list is
 *  complete — separate from any one person's own signature, and refused while
 *  somebody is still mid-interview. */

import { useMemo, useState } from "react";
import { useEntityCode, useInterviewDays, useStore } from "@/lib/store";
import {
  apologiesOf,
  dayCanClose,
  dayGaps,
  dayText,
  durationMs,
  entryGaps,
  interviewDayStage,
  isSigned,
  stillRunning,
  unbackedSignatures,
} from "@/lib/interviews";
import { localDate } from "@/lib/attendance";
import { siteCodeFor, siteFor } from "@/lib/sites";
import { useNow } from "@/lib/clock";
import { useFormsHubDeepLink } from "@/lib/deepLink";
import { SignaturePad } from "@/components/SignaturePad";
import ContactPicker from "@/components/ContactPicker";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconLeft, IconX } from "@/components/ui/icons";
import type { InterviewDay, InterviewDayStage } from "@/lib/types";

const STAGE: Record<InterviewDayStage, { label: string; tone: "accent" | undefined }> = {
  open: { label: "OPEN", tone: "accent" },
  closed: { label: "CLOSED AND APPROVED", tone: undefined },
};

function mins(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const inputCls = "min-h-[38px] w-full rounded-[8px] border px-2.5 py-1.5 text-[12.5px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

/* A FIELD WITHOUT Field's OVERHEAD — same reasoning and same shape as the
   attendance register's own mini(), kept local to this screen for the same
   reason that one is: the dense header row this saves space on is not a
   shape every other form in the app wants from the shared primitive. */
function mini(label: string, input: React.ReactNode, hint?: string) {
  return (
    <label className="block">
      <span
        className="mb-[3px] flex items-baseline justify-between font-mono text-[9px] font-semibold tracking-wide"
        style={{ color: "var(--ink-4)" }}
      >
        {label}
        {hint ? <span className="font-normal normal-case tracking-normal">{hint}</span> : null}
      </span>
      {input}
    </label>
  );
}

export default function InterviewsPage() {
  const days = useInterviewDays();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const openDay = useStore((s) => s.openInterviewDay);
  const patchEntry = useStore((s) => s.updateInterviewEntry);
  const addEntry = useStore((s) => s.addInterviewEntry);
  const removeEntry = useStore((s) => s.removeInterviewEntry);
  const sign = useStore((s) => s.signInterviewEntry);
  const closeDay = useStore((s) => s.closeInterviewDay);
  const reopenDay = useStore((s) => s.reopenInterviewDay);
  const addApology = useStore((s) => s.addInterviewApology);
  const patchApology = useStore((s) => s.updateInterviewApology);
  const removeApology = useStore((s) => s.removeInterviewApology);

  const patchDay = useStore((s) => s.updateInterviewDay);

  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [closerName, setCloserName] = useState(auditor);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  /* ONE ENTRY EXPANDED AT A TIME, same reasoning as the attendance register:
     a person's full detail (role, location, the interview clock, the
     signature) only matters while they are actually being talked to or
     signing; once recorded it folds to a single line. */
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  /* Same reasoning, kept separate — opening an apology must not fold an
     entry being signed, and vice versa. */
  const [expandedApologyId, setExpandedApologyId] = useState<string | null>(null);
  useFormsHubDeepLink(setOpenId);

  const site = siteFor(entityCode);
  const now = useNow();
  const today = now ? localDate(now) : "";
  const todaysDay = useMemo(
    () => (today ? days.find((d) => d.date === today) : undefined),
    [days, today]
  );

  function talkTo(p: { contactId?: string; name: string; role?: string }) {
    if (todaysDay?.closedAt != null) return;
    const id = todaysDay ? todaysDay.id : now ? openDay(localDate(now)) : null;
    if (!id) return;
    setOpenId(id);
    const rowId = addEntry(id, p.name, { contactId: p.contactId, role: p.role ?? "" });
    setExpandedRowId(rowId);
  }

  async function copyDay(day: InterviewDay) {
    const text = dayText(day, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(day.id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this record", text);
    }
  }

  /* ONE DAY AT A TIME, FULL FOCUS — the same change attendance went through:
     Sarel, on that register, "don't show the top section to create a new
     register... it should represent only that specific register." An open
     day here is handed from person to person the same way, so the "who are
     you talking to" quick-add box and every other day on the list are noise
     on a screen somebody else is about to sign. */
  const activeDay = days.find((d) => d.id === openId) ?? null;

  if (activeDay) {
    const day = activeDay;
    const stage = interviewDayStage(day);
    const unbacked = unbackedSignatures(day);
    const canClose = dayCanClose(day);
    return (
      <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
          <button
            type="button"
            onClick={() => {
              setOpenId(null);
              setSavedId(day.id);
              window.setTimeout(() => setSavedId(null), 2500);
            }}
            className="mb-2.5 flex items-center gap-1 text-[12px] font-semibold"
            style={{ color: "var(--acc)" }}
          >
            <IconLeft width={12} height={12} />
            All interview records
          </button>

          <Panel tone={STAGE[stage].tone}>
            <div data-record-id={day.id} className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px]">{day.id}</span>
              <span className="font-mono text-[10px]">{day.date}</span>
              <Pill tone={STAGE[stage].tone}>{STAGE[stage].label}</Pill>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-[6px] sm:grid-cols-2">
              {mini(
                "LOCATION",
                <input
                  value={day.location}
                  onChange={(e) => patchDay(day.id, { location: e.target.value })}
                  aria-label={`Location for interviews on ${day.date}`}
                  className={inputCls}
                  style={inputStyle}
                  disabled={!!day.closedAt}
                />,
                "optional"
              )}
              {mini(
                "PURPOSE",
                <input
                  value={day.purpose}
                  onChange={(e) => patchDay(day.id, { purpose: e.target.value })}
                  aria-label={`Purpose of interviews on ${day.date}`}
                  className={inputCls}
                  style={inputStyle}
                  disabled={!!day.closedAt}
                />,
                "optional"
              )}
            </div>

            <div className="mt-3">
              {mini(
                "WHO WAS INTERVIEWED",
                !day.closedAt ? (
                  <ContactPicker
                    entityCode={entityCode}
                    placeholder="Search the directory, or type a new name"
                    onAdd={(p) => {
                      const rowId = addEntry(day.id, p.name, {
                        contactId: p.contactId,
                        role: p.role ?? "",
                      });
                      setExpandedRowId(rowId);
                    }}
                  />
                ) : undefined,
                `${day.entries.length} ${day.entries.length === 1 ? "person" : "people"}`
              )}
              {day.entries.map((e) => {
                const rowOpen = expandedRowId === e.id;
                const rowSigning = signing === e.id;
                const signed = isSigned(e);
                const ran = durationMs(e, now);
                const missing = entryGaps(e);
                /* THE FOLDED LINE CARRIES THE WHOLE PERSON, same reasoning as
                   the attendance register's rowSummary: role and where, plus
                   the interview clock — "still running" is the one fact that
                   matters even collapsed, since it is the thing an auditor
                   comes back to this screen to check. */
                const rowSummary = [e.role, e.location].filter((v) => v.trim()).join(" · ");
                const timeLine = `FROM ${hhmm(e.startedAt)}${
                  e.endedAt ? ` TO ${hhmm(e.endedAt)}` : " · STILL RUNNING"
                }${ran !== null ? ` · ${mins(ran).toUpperCase()}` : ""}`;
                return (
                  <div
                    key={e.id}
                    className="mb-2 mt-2 rounded-[9px] border p-2"
                    style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                  >
                    <div className="flex items-center gap-[6px]">
                      <button
                        type="button"
                        onClick={() => setExpandedRowId(rowOpen ? null : e.id)}
                        className="flex min-h-[30px] min-w-0 flex-1 items-center gap-[6px] text-left"
                      >
                        {signed ? <Pill tone="accent">SIGNED</Pill> : <Pill tone="warn">NOT SIGNED</Pill>}
                        <span className="truncate text-[12.5px] font-semibold">
                          {e.name.trim() || "Unnamed"}
                        </span>
                      </button>

                      {/* THE QUICK SIGN — same control as attendance: color-coded,
                          opens only the pad, hidden once the pad is actually open.
                          Tapping the row's name still opens the full detail. */}
                      {!rowSigning && !day.closedAt && (
                        <button
                          type="button"
                          onClick={() => setSigning(e.id)}
                          className="flex shrink-0 items-center gap-[4px] rounded-[8px] border px-[10px] py-[6px] font-display text-[11px] font-semibold"
                          style={
                            signed
                              ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }
                              : { background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }
                          }
                        >
                          {signed ? "Sign again" : "Sign"}
                        </button>
                      )}
                    </div>

                    {!rowOpen && !rowSigning ? (
                      <p className="mt-[3px] truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                        {rowSummary ? `${rowSummary} · ` : ""}
                        {timeLine}
                      </p>
                    ) : null}

                    {rowSigning ? (
                      <div className="mt-[6px]">
                        <SignaturePad
                          name={e.name}
                          onCancel={() => setSigning(null)}
                          onSigned={(s) => {
                            sign(day.id, e.id, s);
                            setSigning(null);
                            setExpandedRowId(null);
                          }}
                        />
                      </div>
                    ) : rowOpen ? (
                      <div className="mt-[6px]">
                        <div className="mb-[5px] flex items-center justify-between gap-2">
                          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            {timeLine}
                          </span>
                          {!day.closedAt ? (
                            <Btn
                              onClick={() => {
                                removeEntry(day.id, e.id);
                                setExpandedRowId((cur) => (cur === e.id ? null : cur));
                              }}
                            >
                              <IconX /> Remove
                            </Btn>
                          ) : null}
                        </div>

                        <input
                          value={e.name}
                          onChange={(ev) => patchEntry(day.id, e.id, { name: ev.target.value })}
                          aria-label={`Name of person ${e.id}`}
                          placeholder="Full name"
                          className={`mb-2 ${inputCls}`}
                          style={inputStyle}
                          disabled={!!day.closedAt}
                        />
                        <input
                          value={e.role}
                          onChange={(ev) => patchEntry(day.id, e.id, { role: ev.target.value })}
                          aria-label={`Role of person ${e.id}`}
                          placeholder="Role — optional"
                          className={`mb-2 ${inputCls}`}
                          style={inputStyle}
                          disabled={!!day.closedAt}
                        />
                        <input
                          value={e.location}
                          onChange={(ev) =>
                            patchEntry(day.id, e.id, { location: ev.target.value })
                          }
                          aria-label={`Location of interview with ${e.id}`}
                          placeholder="Where — maintenance office, Pier B"
                          className={`mb-2 ${inputCls}`}
                          style={inputStyle}
                          disabled={!!day.closedAt}
                        />

                        {!e.endedAt ? (
                          <Btn
                            className="mb-2"
                            onClick={() => patchEntry(day.id, e.id, { endedAt: Date.now() })}
                          >
                            End
                          </Btn>
                        ) : !day.closedAt ? (
                          <Btn
                            className="mb-2"
                            onClick={() => patchEntry(day.id, e.id, { endedAt: null })}
                          >
                            <IconX /> Undo end
                          </Btn>
                        ) : null}

                        {e.signature ? (
                          <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            {e.signature.ref} · {hhmm(e.signature.signedAt)}
                          </div>
                        ) : day.closedAt ? (
                          <p className="font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                            NOT SIGNED
                          </p>
                        ) : null}

                        {missing.length ? (
                          <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            STILL MISSING: {missing.join(", ").toUpperCase()}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {day.entries.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  Nobody recorded yet. Use the box above.
                </p>
              ) : null}
            </div>

            {/* COULD NOT BE INTERVIEWED — same reasoning as the attendance
                register's own apologies: somebody meant to be talked to who
                was not available is the opposite fact about the same "who
                we meant to talk to" list, never one of the entries above,
                because nothing here is a conversation that happened. No
                signature, because there is nothing to sign. */}
            <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
              {mini(
                "COULD NOT BE INTERVIEWED",
                !day.closedAt ? (
                  <ContactPicker
                    entityCode={entityCode}
                    placeholder="Expected but not available — search the directory, or type a name"
                    onAdd={(p) => {
                      const apologyId = addApology(day.id, p.name, {
                        contactId: p.contactId,
                        organisation: p.organisation ?? "",
                        role: p.role ?? "",
                      });
                      setExpandedApologyId(apologyId);
                    }}
                  />
                ) : undefined,
                `${apologiesOf(day).length} recorded`
              )}

              {apologiesOf(day).map((a) => {
                const rowOpen = expandedApologyId === a.id;
                const summary = [a.role, a.organisation].filter((v) => v.trim()).join(" · ");
                return (
                  <div
                    key={a.id}
                    className="mb-2 mt-2 rounded-[9px] border p-2"
                    style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedApologyId(rowOpen ? null : a.id)}
                      className="flex min-h-[30px] w-full items-center gap-[6px] text-left"
                    >
                      <Pill>NOT AVAILABLE</Pill>
                      <span className="truncate text-[12.5px] font-semibold">
                        {a.name.trim() || "Unnamed"}
                      </span>
                    </button>

                    {!rowOpen && (summary || a.reason.trim()) ? (
                      <p className="mt-[3px] truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                        {[summary, a.reason.trim()].filter(Boolean).join(" — ")}
                      </p>
                    ) : null}

                    {rowOpen ? (
                      <div className="mt-[6px]">
                        {!day.closedAt ? (
                          <div className="mb-[5px] flex items-center justify-end">
                            <Btn
                              onClick={() => {
                                removeApology(day.id, a.id);
                                setExpandedApologyId((cur) => (cur === a.id ? null : cur));
                              }}
                            >
                              <IconX /> Remove
                            </Btn>
                          </div>
                        ) : null}

                        <input
                          value={a.name}
                          onChange={(ev) => patchApology(day.id, a.id, { name: ev.target.value })}
                          aria-label={`Name of apology ${a.id}`}
                          placeholder="Full name"
                          className={`mb-[5px] ${inputCls}`}
                          style={inputStyle}
                          disabled={!!day.closedAt}
                        />

                        <div className="grid grid-cols-2 gap-[5px]">
                          <input
                            value={a.role}
                            onChange={(ev) => patchApology(day.id, a.id, { role: ev.target.value })}
                            aria-label={`Role of apology ${a.id}`}
                            placeholder="Role (optional)"
                            className={inputCls}
                            style={inputStyle}
                            disabled={!!day.closedAt}
                          />
                          <input
                            value={a.organisation}
                            onChange={(ev) =>
                              patchApology(day.id, a.id, { organisation: ev.target.value })
                            }
                            aria-label={`Organisation of apology ${a.id}`}
                            placeholder="Organisation (optional)"
                            className={inputCls}
                            style={inputStyle}
                            disabled={!!day.closedAt}
                          />
                        </div>

                        <input
                          value={a.reason}
                          onChange={(ev) => patchApology(day.id, a.id, { reason: ev.target.value })}
                          aria-label={`Reason for apology ${a.id}`}
                          placeholder="Reason (optional)"
                          className={`mt-[5px] ${inputCls}`}
                          style={inputStyle}
                          disabled={!!day.closedAt}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {apologiesOf(day).length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  Nobody marked unavailable. Use the box above.
                </p>
              ) : null}
            </div>

            {/* THE CLOSING APPROVAL. */}
            <Field
              label={day.closedAt ? "CLOSED AND APPROVED" : "CLOSE THE DAY"}
              hint={
                day.closedAt
                  ? undefined
                  : canClose
                    ? "one approval for the whole day's list"
                    : dayGaps(day).includes("nobody recorded")
                      ? "nothing to approve yet"
                      : "end every interview first"
              }
            >
              {day.closedAt ? (
                <div>
                  <p className="text-[12px]">
                    {hhmm(day.closedAt)} by {day.closedBy || "—"}
                    {day.closeSignature ? ` · ${day.closeSignature.ref}` : ""}
                  </p>
                  <Btn className="mt-2" onClick={() => reopenDay(day.id)}>
                    <IconX /> Reopen to add another interview
                  </Btn>
                </div>
              ) : closing === day.id ? (
                <div>
                  <input
                    value={closerName}
                    onChange={(ev) => setCloserName(ev.target.value)}
                    aria-label="Name of whoever is approving and closing the day"
                    placeholder="Who is approving this record"
                    className={`mb-2 ${inputCls}`}
                    style={inputStyle}
                  />
                  <SignaturePad
                    name={closerName}
                    onCancel={() => setClosing(null)}
                    onSigned={(s) => {
                      closeDay(day.id, closerName.trim() || auditor, s);
                      setClosing(null);
                    }}
                  />
                  <Btn
                    className="mt-2"
                    onClick={() => {
                      closeDay(day.id, closerName.trim() || auditor);
                      setClosing(null);
                    }}
                    disabled={!closerName.trim()}
                  >
                    Close without drawing a signature
                  </Btn>
                </div>
              ) : (
                <Btn variant="primary" onClick={() => setClosing(day.id)} disabled={!canClose}>
                  <IconCheck /> Approve and close the day
                </Btn>
              )}
            </Field>

            <Field label="THE DAY'S RECORD">
              <Btn onClick={() => void copyDay(day)}>
                {copied === day.id ? "Copied" : "Copy the record"}
              </Btn>
              {unbacked.length ? (
                <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                  {unbacked.length} SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS
                  DEVICE ONLY. THE RECORD COPY IS NOT WIRED YET — COPY THE RECORD OUT
                  BEFORE THE TABLET LEAVES SITE.
                </p>
              ) : null}
            </Field>
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">Interview records</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Who was interviewed, when and where — one register per day, closed by an
          approval once the day&rsquo;s list is complete.
        </p>
      </header>

      {/* START ONE. Pinned, picking from the people directory or typing a new
          name. */}
      <Panel tone={todaysDay ? "accent" : undefined} className="mb-4">
        <Field
          label="WHO ARE YOU TALKING TO?"
          hint={todaysDay ? `TODAY — ${todaysDay.entries.length} so far, ${stillRunning(todaysDay).length} still running` : "opens today's register"}
        >
          <ContactPicker
            entityCode={entityCode}
            placeholder="Search the directory, or type a new name"
            onAdd={talkTo}
            /* A day that is closed, or a clock not yet read, used to let
               talkTo() silently drop the add after the picker had already
               cleared its own input — disabling the control here is what
               actually blocks it, rather than a handler nobody can see
               refusing quietly. */
            disabled={todaysDay?.closedAt != null || !now}
          />
        </Field>
        {todaysDay?.closedAt ? (
          <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            TODAY&rsquo;S RECORD IS CLOSED — REOPEN IT BELOW TO ADD ANOTHER INTERVIEW
          </p>
        ) : !now ? (
          <p className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            WAITING FOR THE DEVICE CLOCK…
          </p>
        ) : null}
      </Panel>

      {days.length === 0 ? (
        <Empty>
          <b>No interviews recorded.</b>
          <span>
            Who TPJV spoke to, when and where — evidence the conversation happened,
            not an account of what was said.
          </span>
        </Empty>
      ) : null}

      {days.map((day) => {
        const stage = interviewDayStage(day);
        const gaps = dayGaps(day);
        return (
          <div key={day.id} data-record-id={day.id} className="mb-2">
            <Panel>
              <button
                type="button"
                onClick={() => setOpenId(day.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">{day.id}</span>
                    <span className="font-mono text-[10px]">{day.date}</span>
                    <Pill tone={STAGE[stage].tone}>{STAGE[stage].label}</Pill>
                    {savedId === day.id ? <Pill tone="accent">✓ SAVED</Pill> : null}
                  </div>
                  <p className="mt-1 text-[13px]">
                    {day.entries.length === 0
                      ? "Nobody recorded"
                      : day.entries.map((e) => e.name || "—").join(", ")}
                  </p>
                  <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {day.openedBy ? `OPENED BY ${day.openedBy.toUpperCase()}` : "—"}
                    {gaps.length ? ` · ${gaps.join(", ").toUpperCase()}` : " · COMPLETE"}
                  </div>
                </div>
              </button>
            </Panel>
          </div>
        );
      })}
      </div>
    </div>
  );
}
