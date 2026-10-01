"use client";

/** SITE ATTENDANCE — TK-003 form 2, on the tablet.
 *
 *  "Site Attendance & Induction Confirmation", completed on arrival each day,
 *  signed by each person, per day. It feeds SF-005 sheet 4, Induction & Access,
 *  and it is held as J14 of the site safety file — SF-005 has no sheet for it,
 *  because the question it answers turned out to be one nobody had written a
 *  sheet for: WHO WAS ON SITE THE DAY THAT FINDING WAS RAISED. That is the
 *  question TPJV is most likely to be asked a year from now and the hardest to
 *  reconstruct from anything else.
 *
 *  The day's diary moved to its own screen, /diary — same record, different
 *  screen, so updating it is not nine fields' worth of scrolling away.
 *
 *  Five things shape the screen.
 *
 *  ONE DAY, ONE RECORD. The store opens or returns; there is no control here
 *  that can make a second register for the same date. Two half-registers is the
 *  silent failure this form has — both look complete, and the one that gets
 *  exported is the one that is wrong.
 *
 *  ARRIVAL IS STAMPED, NOT TYPED. Adding somebody records the time they walked
 *  in, because that is when this form is completed. A blank time field gets a
 *  round number put in it at five o'clock.
 *
 *  A SIGNATURE SIGNS A STATEMENT. Name, employer, role, and that the airside
 *  induction is confirmed with this reference. Change any of those afterwards
 *  and the mark is cleared — it was of something else. The times are outside
 *  that, deliberately: departure is recorded hours later by whoever closes the
 *  day, and clearing every signature each evening would leave the register
 *  unsigned exactly when somebody comes to look at it.
 *
 *  ENTITLEMENT, NOT JUST PRESENCE. Contract Data 20.1 gives access "Following
 *  Airside Induction and Permit Process completions", and airside permits are
 *  per person, per airport, expiry-dated. A lapsed induction is shown against
 *  THE DAY rather than against now, because a permit that expired last month
 *  does not make September's attendance improper — and one that had already
 *  expired in September does. */

import { useMemo, useState } from "react";
import { useEntityCode, useSiteDays, useStore } from "@/lib/store";
import {
  dayGaps,
  dayText,
  entryGaps,
  inductionLapsed,
  isSigned,
  localDate,
  onSiteMs,
  stillOnSite,
  timesDisagree,
  unbackedSignatures,
} from "@/lib/attendance";
import { siteCodeFor, siteFor } from "@/lib/sites";
import { useNow } from "@/lib/clock";
import { AttachmentStrip, PhotoButton } from "@/components/Capture";
import { SignaturePad } from "@/components/SignaturePad";
import ContactPicker from "@/components/ContactPicker";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";
import type { SiteDay } from "@/lib/types";

function sectionLabel(text: string) {
  return (
    <p className="mb-1.5 mt-3 font-mono text-[9px] font-semibold tracking-wide first:mt-0" style={{ color: "var(--ink-4)" }}>
      {text}
    </p>
  );
}

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function mins(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const inputCls = "w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

export default function AttendancePage() {
  const days = useSiteDays();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const openDay = useStore((s) => s.openSiteDay);
  const patchDay = useStore((s) => s.updateSiteDay);
  const addPerson = useStore((s) => s.addAttendee);
  const patchPerson = useStore((s) => s.updateAttendee);
  const removePerson = useStore((s) => s.removeAttendee);
  const sign = useStore((s) => s.signAttendee);
  const addPhoto = useStore((s) => s.addDayAttachment);
  const removePhoto = useStore((s) => s.removeDayAttachment);
  const updatePhoto = useStore((s) => s.updateDayAttachment);

  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const site = siteFor(entityCode);
  const now = useNow();
  /* 0 until the device's clock is read — see src/lib/clock.ts. Everything it
     decides here is additive: which day counts as today, and whether a row is
     still open. Rendering none of it on the first frame is the right failure. */
  const today = now ? localDate(now) : "";
  const todaysDay = useMemo(
    () => (today ? days.find((d) => d.date === today) : undefined),
    [days, today]
  );

  function signIn(p: { contactId?: string; name: string; organisation?: string; role?: string }) {
    const id = todaysDay ? todaysDay.id : now ? openDay(localDate(now)) : null;
    if (!id) return;
    setOpenId(id);
    addPerson(id, p.name, {
      contactId: p.contactId,
      organisation: p.organisation ?? "",
      role: p.role ?? "",
    });
  }

  async function copyDay(day: SiteDay) {
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
      window.prompt("Copy this day's register", text);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">Site attendance</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          TK-003 form 2. Completed on arrival, each day, signed by each person. It feeds
          SF-005 sheet 4 and is held as J14 of the safety file. The day&rsquo;s diary is on its
          own screen — see Daily diary in the Forms menu.
        </p>
      </header>

      {/* SIGN SOMEBODY IN. Pinned, picking from the people directory or typing
          a new name, because the form is completed at the gate while the
          person is standing there. */}
      <Panel tone={todaysDay ? "accent" : undefined} className="mb-4">
        <Field
          label="WHO IS ARRIVING?"
          hint={todaysDay ? `TODAY — ${todaysDay.entries.length} so far, ${stillOnSite(todaysDay).length} still on site` : "opens today's register"}
        >
          <ContactPicker
            entityCode={entityCode}
            placeholder="Search the directory, or type a new name"
            onAdd={signIn}
            /* Before the device clock has loaded, signIn() has no day to
               open or add to and would silently drop the pick — disabling
               the control is what actually blocks it. */
            disabled={!now}
          />
        </Field>
        {!now ? (
          <p className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            WAITING FOR THE DEVICE CLOCK…
          </p>
        ) : null}
      </Panel>

      {days.length === 0 ? (
        <Empty>
          <b>No site days recorded.</b>
          <span>
            This is not the audit. It is the record of who was present and entitled to
            be — the thing somebody asks for a year later, when a finding raised on a
            particular day is being argued about.
          </span>
        </Empty>
      ) : null}

      {days.map((day) => {
        const isOpen = openId === day.id;
        const gaps = dayGaps(day);
        const unbacked = unbackedSignatures(day);
        const open = stillOnSite(day);
        return (
          <div key={day.id} className="mb-3">
            <Panel tone={day.date === today ? "accent" : undefined}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : day.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">{day.date}</span>
                    {day.date === today ? <Pill tone="accent">TODAY</Pill> : null}
                    {open.length ? <Pill tone="warn">{open.length} NOT SIGNED OUT</Pill> : null}
                  </div>
                  <p className="mt-1 text-[13px]">
                    {day.entries.length === 0
                      ? "Nobody recorded"
                      : day.entries.map((e) => e.name || "—").join(", ")}
                  </p>
                  <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {day.id}
                    {day.openedBy ? ` · OPENED BY ${day.openedBy.toUpperCase()}` : ""}
                    {gaps.length ? ` · ${gaps.join(", ").toUpperCase()}` : " · COMPLETE"}
                  </div>
                </div>
              </button>

              {isOpen ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="LOCATION" hint="optional">
                      <input
                        value={day.location}
                        onChange={(e) => patchDay(day.id, { location: e.target.value })}
                        aria-label={`Where ${day.date} was spent`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="PURPOSE" hint="optional">
                      <input
                        value={day.purpose}
                        onChange={(e) => patchDay(day.id, { purpose: e.target.value })}
                        aria-label={`Purpose of visit on ${day.date}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                  </div>

                  <Field
                    label="WHO WAS ON SITE"
                    hint={`${day.entries.length} ${day.entries.length === 1 ? "person" : "people"}`}
                  >
                    <ContactPicker
                      entityCode={entityCode}
                      placeholder="Search the directory, or type a new name"
                      onAdd={(p) =>
                        addPerson(day.id, p.name, {
                          contactId: p.contactId,
                          organisation: p.organisation ?? "",
                          role: p.role ?? "",
                        })
                      }
                    />
                    {day.entries.map((e) => {
                      const lapsed = inductionLapsed(e, day.date);
                      const on = onSiteMs(e);
                      const missing = entryGaps(e);
                      return (
                        <div
                          key={e.id}
                          className="mb-3 mt-3 rounded-[9px] border p-2.5"
                          style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {isSigned(e) ? (
                                <Pill tone="accent">SIGNED {e.signature?.ref}</Pill>
                              ) : (
                                <Pill tone="warn">NOT SIGNED</Pill>
                              )}
                              {lapsed === true ? <Pill tone="warn">INDUCTION LAPSED</Pill> : null}
                              {lapsed === null && e.inductionConfirmed ? (
                                <Pill>NO EXPIRY RECORDED</Pill>
                              ) : null}
                            </div>
                            <Btn onClick={() => removePerson(day.id, e.id)}>
                              <IconX /> Remove
                            </Btn>
                          </div>

                          {sectionLabel("WHO")}
                          <input
                            value={e.name}
                            onChange={(ev) => patchPerson(day.id, e.id, { name: ev.target.value })}
                            aria-label={`Name of person ${e.id}`}
                            placeholder="Full name"
                            className={`mb-2 ${inputCls}`}
                            style={inputStyle}
                          />
                          <input
                            value={e.organisation}
                            onChange={(ev) =>
                              patchPerson(day.id, e.id, { organisation: ev.target.value })
                            }
                            aria-label={`Employer of person ${e.id}`}
                            placeholder="Employer — TPJV, a subconsultant, ACSA"
                            className={`mb-2 ${inputCls}`}
                            style={inputStyle}
                          />
                          <input
                            value={e.role}
                            onChange={(ev) => patchPerson(day.id, e.id, { role: ev.target.value })}
                            aria-label={`Role of person ${e.id}`}
                            placeholder="Role on this audit"
                            className={`mb-2 ${inputCls}`}
                            style={inputStyle}
                          />

                          {/* WHERE AND WHAT — the action-log half of the row.
                              Neither is part of what the signature covers, so
                              editing them afterwards, including by whoever
                              closes the day out, never unsigns anybody. */}
                          {sectionLabel("WHERE & WHAT")}
                          <input
                            value={e.location}
                            onChange={(ev) =>
                              patchPerson(day.id, e.id, { location: ev.target.value })
                            }
                            aria-label={`Location(s) worked by person ${e.id}`}
                            placeholder="Location(s) — MV switchroom, then AGL vault"
                            className={`mb-2 ${inputCls}`}
                            style={inputStyle}
                          />
                          <textarea
                            value={e.notes}
                            onChange={(ev) =>
                              patchPerson(day.id, e.id, { notes: ev.target.value })
                            }
                            rows={2}
                            aria-label={`What person ${e.id} did today`}
                            placeholder="What was done — Inspected AGL vault; assisted T. Nkosi with DB3 fuse replacement"
                            className={`mb-2 ${inputCls}`}
                            style={inputStyle}
                          />

                          {/* ENTITLEMENT. */}
                          {sectionLabel("ENTITLEMENT")}
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Btn
                              variant={e.inductionConfirmed ? "primary" : "default"}
                              onClick={() =>
                                patchPerson(day.id, e.id, {
                                  inductionConfirmed: !e.inductionConfirmed,
                                })
                              }
                            >
                              <IconCheck /> Induction confirmed
                            </Btn>
                            <input
                              value={e.inductionRef}
                              onChange={(ev) =>
                                patchPerson(day.id, e.id, { inductionRef: ev.target.value })
                              }
                              aria-label={`Induction or airside permit number for person ${e.id}`}
                              placeholder="Induction / AVSEC permit no."
                              className={`${inputCls} flex-1 min-w-[180px]`}
                              style={inputStyle}
                            />
                          </div>
                          <label
                            className="mb-2 block font-mono text-[9px]"
                            style={{ color: "var(--ink-4)" }}
                          >
                            PERMIT EXPIRES
                            <input
                              type="date"
                              value={
                                e.inductionExpires ? localDate(e.inductionExpires) : ""
                              }
                              onChange={(ev) =>
                                patchPerson(day.id, e.id, {
                                  /* Parsed as local midday, not midnight: a date
                                     input gives a bare YYYY-MM-DD, and parsing
                                     that as UTC midnight lands on the previous
                                     day everywhere east of Greenwich. */
                                  inductionExpires: ev.target.value
                                    ? new Date(`${ev.target.value}T12:00:00`).getTime()
                                    : null,
                                })
                              }
                              aria-label={`Permit expiry date for person ${e.id}`}
                              className={`mt-1 ${inputCls}`}
                              style={inputStyle}
                            />
                          </label>

                          {/* THE TIMES. Outside what the signature covers. */}
                          {sectionLabel("TIME ON SITE")}
                          <div
                            className="mb-2 font-mono text-[9px]"
                            style={{ color: timesDisagree(e) ? "var(--warn)" : "var(--ink-4)" }}
                          >
                            ARRIVED {e.arrivedAt ? hhmm(e.arrivedAt) : "—"}
                            {e.departedAt ? ` · LEFT ${hhmm(e.departedAt)}` : " · STILL ON SITE"}
                            {on !== null ? ` · ${mins(on).toUpperCase()}` : ""}
                            {timesDisagree(e) ? " · DEPARTURE IS BEFORE ARRIVAL" : ""}
                          </div>
                          {!e.departedAt ? (
                            <Btn
                              className="mb-2"
                              onClick={() =>
                                patchPerson(day.id, e.id, { departedAt: Date.now() })
                              }
                            >
                              Sign out
                            </Btn>
                          ) : (
                            <Btn
                              className="mb-2"
                              onClick={() => patchPerson(day.id, e.id, { departedAt: null })}
                            >
                              <IconX /> Undo sign-out
                            </Btn>
                          )}

                          {/* THE SIGNATURE. */}
                          {sectionLabel("SIGNATURE")}
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
                              {e.signature.ref} · SIGNED {hhmm(e.signature.signedAt)} AS{" "}
                              {e.signature.signedName.toUpperCase() || "—"}
                              <Btn className="ml-2" onClick={() => setSigning(e.id)}>
                                Sign again
                              </Btn>
                            </div>
                          ) : (
                            <Btn variant="primary" onClick={() => setSigning(e.id)}>
                              Sign
                            </Btn>
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
                        Nobody signed in yet. Use the box at the top of the screen.
                      </p>
                    ) : null}
                  </Field>

                  <Field label="PHOTOGRAPHS">
                    <div className="flex justify-end">
                      <PhotoButton
                        compact
                        onCaptured={(m) => addPhoto(day.id, { ...m, createdBy: auditor })}
                      />
                    </div>
                    {day.attachments.length > 0 ? (
                      <div className="mt-2">
                        <AttachmentStrip
                          attachments={day.attachments}
                          thumbSize={40}
                          onRemove={(aid) => removePhoto(day.id, aid)}
                          onUpdate={(aid, p) => updatePhoto(day.id, aid, p)}
                        />
                      </div>
                    ) : null}
                  </Field>

                  <Field label="THE DAY'S REGISTER">
                    <Btn onClick={() => void copyDay(day)}>
                      {copied === day.id ? "Copied" : "Copy the register"}
                    </Btn>
                    {unbacked.length ? (
                      /* SAYS WHAT IS TRUE, NOT WHAT WOULD BE REASSURING. The
                         upload queue in src/lib/sync.ts walks check-point and
                         inspection photographs only; it has never walked
                         signatures, and it does not walk the ISF's or the
                         interview register's photographs either. So there is no
                         "sync" that would clear this, and telling an auditor to
                         press one would be worse than saying nothing. The
                         achievable action is the one named. */
                      <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                        {unbacked.length} SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS DEVICE
                        ONLY. THE RECORD COPY IS NOT WIRED YET — COPY THE REGISTER OUT BEFORE
                        THE TABLET LEAVES SITE.
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
