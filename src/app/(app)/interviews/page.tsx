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
import { SignaturePad } from "@/components/SignaturePad";
import ContactPicker from "@/components/ContactPicker";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";
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

const inputCls = "w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

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

  const patchDay = useStore((s) => s.updateInterviewDay);

  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [closerName, setCloserName] = useState(auditor);
  const [copied, setCopied] = useState<string | null>(null);

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
    addEntry(id, p.name, { contactId: p.contactId, role: p.role ?? "" });
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

  return (
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
        const isOpen = openId === day.id;
        const gaps = dayGaps(day);
        const unbacked = unbackedSignatures(day);
        const canClose = dayCanClose(day);
        return (
          <div key={day.id} className="mb-3">
            <Panel tone={STAGE[stage].tone}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : day.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">{day.id}</span>
                    <span className="font-mono text-[10px]">{day.date}</span>
                    <Pill tone={STAGE[stage].tone}>{STAGE[stage].label}</Pill>
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

              {isOpen ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="LOCATION" hint="optional — where the day's interviews were held">
                      <input
                        value={day.location}
                        onChange={(e) => patchDay(day.id, { location: e.target.value })}
                        aria-label={`Location for interviews on ${day.date}`}
                        className={inputCls}
                        style={inputStyle}
                        disabled={!!day.closedAt}
                      />
                    </Field>
                    <Field label="PURPOSE" hint="optional">
                      <input
                        value={day.purpose}
                        onChange={(e) => patchDay(day.id, { purpose: e.target.value })}
                        aria-label={`Purpose of interviews on ${day.date}`}
                        className={inputCls}
                        style={inputStyle}
                        disabled={!!day.closedAt}
                      />
                    </Field>
                  </div>

                  <Field
                    label="WHO WAS INTERVIEWED"
                    hint={`${day.entries.length} ${day.entries.length === 1 ? "person" : "people"}`}
                  >
                    {!day.closedAt ? (
                      <div className="mb-3">
                        <ContactPicker
                          entityCode={entityCode}
                          placeholder="Search the directory, or type a new name"
                          onAdd={(p) => addEntry(day.id, p.name, { contactId: p.contactId, role: p.role ?? "" })}
                        />
                      </div>
                    ) : null}
                    {day.entries.map((e) => {
                      const ran = durationMs(e, now);
                      const missing = entryGaps(e);
                      return (
                        <div
                          key={e.id}
                          className="mb-3 rounded-[9px] border p-2.5"
                          style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            {isSigned(e) ? (
                              <Pill tone="accent">SIGNED {e.signature?.ref}</Pill>
                            ) : (
                              <Pill tone="warn">NOT SIGNED</Pill>
                            )}
                            {!day.closedAt ? (
                              <Btn onClick={() => removeEntry(day.id, e.id)}>
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

                          <div
                            className="mb-2 font-mono text-[9px]"
                            style={{ color: "var(--ink-4)" }}
                          >
                            FROM {hhmm(e.startedAt)}
                            {e.endedAt ? ` TO ${hhmm(e.endedAt)}` : " · STILL RUNNING"}
                            {ran !== null ? ` · ${mins(ran).toUpperCase()}` : ""}
                          </div>
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

                          {signing === e.id ? (
                            <SignaturePad
                              name={e.name}
                              onCancel={() => setSigning(null)}
                              onSigned={(s) => {
                                sign(day.id, e.id, s);
                                setSigning(null);
                              }}
                            />
                          ) : e.signature ? (
                            <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                              {e.signature.ref} · {hhmm(e.signature.signedAt)}
                              {!day.closedAt ? (
                                <Btn className="ml-2" onClick={() => setSigning(e.id)}>
                                  Sign again
                                </Btn>
                              ) : null}
                            </div>
                          ) : !day.closedAt ? (
                            <Btn variant="primary" onClick={() => setSigning(e.id)}>
                              Sign
                            </Btn>
                          ) : (
                            <p className="font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                              NOT SIGNED
                            </p>
                          )}

                          {missing.length ? (
                            <p
                              className="mt-2 font-mono text-[9px]"
                              style={{ color: "var(--ink-4)" }}
                            >
                              STILL MISSING: {missing.join(", ").toUpperCase()}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                    {day.entries.length === 0 ? (
                      <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                        Nobody recorded yet. Use the box at the top of the screen.
                      </p>
                    ) : null}
                  </Field>

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
                      <Btn
                        variant="primary"
                        onClick={() => setClosing(day.id)}
                        disabled={!canClose}
                      >
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
                </div>
              ) : null}
            </Panel>
          </div>
        );
      })}
    </div>
  );
}
