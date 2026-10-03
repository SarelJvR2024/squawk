"use client";

/** THE ATTENDANCE REGISTER, ON THE TABLET.
 *
 *  Sarel, 3 October 2026, replacing the old daily arrival/departure log:
 *  "There must be an option to create a new attendance register... we can
 *  even create attendance registers ahead of time. It doesn't have to be
 *  on the day, so you can create blank attendance registers. The
 *  attendance register needs... the date and time and the location and
 *  the purpose of the meeting. And when we open the attendance register,
 *  there must be rows where multiple people can be added. And they can
 *  add the signature and if they're not already on the system with the
 *  email and phone number they can be added in there."
 *
 *  ONE RECORD PER REGISTER YOU CREATE, not per day — the same shape as
 *  Toolbox Talk, and for the same reason: a morning muster and an
 *  afternoon toolbox attendance are two different registers, and one
 *  record per calendar day is how the second one gets lost inside the
 *  first's row list. See AttendanceRegister in src/lib/types.ts.
 *
 *  CREATABLE AHEAD OF TIME. Date and time default to now but are editable
 *  to anything — a blank register for next Tuesday's muster, created
 *  today with nobody signed yet, is working exactly as intended. Nothing
 *  on this screen requires a field to be filled in before "Create
 *  register" is pressable.
 *
 *  A SIMPLE SIGN-IN SHEET, not the old induction/entitlement form. Name,
 *  who they were there for, how to reach them, and their mark — no
 *  arrival/departure tracking, no permit expiry. That richer record still
 *  exists for any day captured before this change (src/lib/attendance.ts,
 *  unchanged) and the daily diary and closeout still live where they
 *  always did — see src/app/(app)/diary and src/app/(app)/closeout. */

import { useState } from "react";
import { useAttendanceRegisters, useEntityCode, useStore } from "@/lib/store";
import { isSigned, registerGaps, registerText, unbackedSignatures } from "@/lib/attendanceRegister";
import { siteCodeFor, siteFor } from "@/lib/sites";
import { useFormsHubDeepLink } from "@/lib/deepLink";
import ContactPicker from "@/components/ContactPicker";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Empty, Panel, Pill } from "@/components/ui/primitives";
import { IconX } from "@/components/ui/icons";

const inputCls = "min-h-[38px] w-full rounded-[8px] border px-2.5 py-1.5 text-[12.5px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/* A FIELD WITHOUT Field's OVERHEAD. Sarel: "Forms need to fit without
   scrolling, use space efficiently." The shared <Field> primitive
   (components/ui/primitives.tsx) gives every field its own label row plus
   16px of bottom margin — right for a screen with four or five fields
   total, but this register's date/time/purpose/location block alone used
   four of them stacked, which is most of what pushed an open register
   with a single row 600-900px past a 664px tablet screen. This is the
   same label-over-input shape at a fraction of the chrome: a 9px mono
   label with 2px of its own margin, no separate hint row, no bottom
   margin of its own — the grid it sits in supplies the gap instead. Kept
   local to this screen rather than changed in the shared primitive, which
   every other form in the app still wants its normal spacing from. */
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

/* The local calendar date, not toISOString() — the same reason
   src/lib/attendance.ts's localDate exists: a register created at 23:40 is
   dated today, not tomorrow in UTC. en-CA gives YYYY-MM-DD directly. */
function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function AttendancePage() {
  const registers = useAttendanceRegisters();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const open = useStore((s) => s.openAttendanceRegister);
  const patchRegister = useStore((s) => s.updateAttendanceRegister);
  const removeRegister = useStore((s) => s.removeAttendanceRegister);
  const addRow = useStore((s) => s.addAttendanceRow);
  const patchRow = useStore((s) => s.updateAttendanceRow);
  const removeRow = useStore((s) => s.removeAttendanceRow);
  const sign = useStore((s) => s.signAttendanceRow);
  const updateContact = useStore((s) => s.updateContact);

  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState(todayLocal);
  const [draftTime, setDraftTime] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftPurpose, setDraftPurpose] = useState("");
  useFormsHubDeepLink(setOpenId);

  const site = siteFor(entityCode);

  function createRegister() {
    const id = open({
      date: draftDate || todayLocal(),
      time: draftTime.trim(),
      location: draftLocation.trim(),
      purpose: draftPurpose.trim(),
    });
    setOpenId(id);
    setDraftDate(todayLocal());
    setDraftTime("");
    setDraftLocation("");
    setDraftPurpose("");
  }

  async function copyRegister(id: string) {
    const r = registers.find((x) => x.id === id);
    if (!r) return;
    const text = registerText(r, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this register", text);
    }
  }

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-2.5">
        <h2 className="font-display text-[15px] font-semibold">Attendance register</h2>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
          A signed sign-in sheet for a meeting, muster or briefing. Create one for now, or
          ahead of time for a date still to come — it can sit blank until it is needed.
        </p>
      </header>

      {/* CREATE A NEW REGISTER. Always pressable — nothing here is required,
          because a blank register created ahead of time is the whole point
          of this screen. Date defaults to today and time is blank; both are
          editable here and again after creation.

          ONE ROW OF FOUR, NOT FOUR STACKED FIELDS. Sarel: "Forms need to
          fit without scrolling, use space efficiently." mini() replaces
          <Field> here — see its own comment above. */}
      <Panel tone="accent" className="mb-3 py-[9px]">
        <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-4">
          {mini(
            "DATE",
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              aria-label="Date for the new register"
              className={inputCls}
              style={inputStyle}
            />
          )}
          {mini(
            "TIME",
            <input
              type="time"
              value={draftTime}
              onChange={(e) => setDraftTime(e.target.value)}
              aria-label="Time for the new register"
              className={inputCls}
              style={inputStyle}
            />,
            "optional"
          )}
          {mini(
            "PURPOSE",
            <input
              value={draftPurpose}
              onChange={(e) => setDraftPurpose(e.target.value)}
              aria-label="Purpose of the meeting"
              placeholder="Morning muster…"
              className={inputCls}
              style={inputStyle}
            />,
            "optional"
          )}
          {mini(
            "LOCATION",
            <input
              value={draftLocation}
              onChange={(e) => setDraftLocation(e.target.value)}
              aria-label="Location for the new register"
              placeholder="Site office…"
              className={inputCls}
              style={inputStyle}
            />,
            "optional"
          )}
        </div>
        <div className="mt-[8px] flex justify-end">
          <Btn variant="primary" onClick={createRegister}>
            Create register
          </Btn>
        </div>
      </Panel>

      {registers.length === 0 ? (
        <Empty>
          <b>No attendance register yet.</b>
          <span>Create one above — now, or ahead of time for a date still to come.</span>
        </Empty>
      ) : null}

      {registers.map((r) => {
        const isOpen = openId === r.id;
        const gaps = registerGaps(r);
        const unbacked = unbackedSignatures(r);
        return (
          <div key={r.id} data-record-id={r.id} className="mb-2">
            <Panel>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : r.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[10px]">
                    {r.date}
                    {r.time ? ` · ${r.time}` : ""}
                  </span>
                  <p className="mt-1 text-[13px]">
                    {r.purpose.trim() || "No purpose recorded"}
                    {r.location.trim() ? ` — ${r.location.trim()}` : ""}
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {r.rows.length === 0
                      ? "Nobody recorded"
                      : r.rows.map((row) => row.name || "—").join(", ")}
                  </p>
                  <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {r.id}
                    {gaps.length ? ` · ${gaps.join(", ").toUpperCase()}` : r.rows.length ? " · COMPLETE" : ""}
                  </div>
                </div>
              </button>

              {isOpen ? (
                <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "var(--line)" }}>
                  <div className="mb-2.5 grid grid-cols-2 gap-[6px] sm:grid-cols-4">
                    {mini(
                      "DATE",
                      <input
                        type="date"
                        value={r.date}
                        onChange={(e) => patchRegister(r.id, { date: e.target.value })}
                        aria-label={`Date for register ${r.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    )}
                    {mini(
                      "TIME",
                      <input
                        type="time"
                        value={r.time}
                        onChange={(e) => patchRegister(r.id, { time: e.target.value })}
                        aria-label={`Time for register ${r.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    )}
                    {mini(
                      "PURPOSE",
                      <input
                        value={r.purpose}
                        onChange={(e) => patchRegister(r.id, { purpose: e.target.value })}
                        aria-label={`Purpose for register ${r.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    )}
                    {mini(
                      "LOCATION",
                      <input
                        value={r.location}
                        onChange={(e) => patchRegister(r.id, { location: e.target.value })}
                        aria-label={`Location for register ${r.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    )}
                  </div>

                  {mini(
                    `WHO WAS THERE`,
                    <ContactPicker
                      entityCode={entityCode}
                      placeholder="Search the directory, or type a new name"
                      onAdd={(p) =>
                        addRow(r.id, p.name, {
                          contactId: p.contactId,
                          organisation: p.organisation ?? "",
                          role: p.role ?? "",
                          phone: p.phone ?? "",
                          email: p.email ?? "",
                        })
                      }
                    />,
                    `${r.rows.length} recorded`
                  )}

                  {r.rows.map((row) => (
                    <div
                      key={row.id}
                      className="mb-2 mt-2 rounded-[9px] border p-2"
                      style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                    >
                      <div className="mb-[6px] flex flex-wrap items-center justify-between gap-2">
                        {isSigned(row) ? (
                          <Pill tone="accent">SIGNED {row.signature?.ref}</Pill>
                        ) : (
                          <Pill tone="warn">NOT SIGNED</Pill>
                        )}
                        <Btn onClick={() => removeRow(r.id, row.id)}>
                          <IconX /> Remove
                        </Btn>
                      </div>

                      <input
                        value={row.name}
                        onChange={(ev) => patchRow(r.id, row.id, { name: ev.target.value })}
                        aria-label={`Name of attendee ${row.id}`}
                        placeholder="Full name"
                        className={`mb-[6px] ${inputCls}`}
                        style={inputStyle}
                      />

                      {/* ROLE/ORGANISATION, THEN PHONE/EMAIL — a 2x2 grid, not
                          two full-width rows each. Sarel: "Forms need to fit
                          without scrolling, use space efficiently." Phone and
                          email are patched onto the directory contact too,
                          when there is one — Sarel: "if they're not already
                          on the system with the email and phone number they
                          can be added in there" — so the next form that picks
                          this person already has it. */}
                      <div className="grid grid-cols-2 gap-[6px]">
                        <input
                          value={row.role}
                          onChange={(ev) => patchRow(r.id, row.id, { role: ev.target.value })}
                          aria-label={`Role of attendee ${row.id}`}
                          placeholder="Role (optional)"
                          className={inputCls}
                          style={inputStyle}
                        />
                        <input
                          value={row.organisation}
                          onChange={(ev) => patchRow(r.id, row.id, { organisation: ev.target.value })}
                          aria-label={`Organisation of attendee ${row.id}`}
                          placeholder="Organisation (optional)"
                          className={inputCls}
                          style={inputStyle}
                        />
                        <input
                          value={row.phone}
                          onChange={(ev) => {
                            patchRow(r.id, row.id, { phone: ev.target.value });
                            if (row.contactId) updateContact(row.contactId, { phone: ev.target.value });
                          }}
                          type="tel"
                          aria-label={`Phone number of attendee ${row.id}`}
                          placeholder="Phone (optional)"
                          className={inputCls}
                          style={inputStyle}
                        />
                        <input
                          value={row.email}
                          onChange={(ev) => {
                            patchRow(r.id, row.id, { email: ev.target.value });
                            if (row.contactId) updateContact(row.contactId, { email: ev.target.value });
                          }}
                          type="email"
                          aria-label={`Email address of attendee ${row.id}`}
                          placeholder="Email (optional)"
                          className={inputCls}
                          style={inputStyle}
                        />
                      </div>
                      <div className="mt-[6px]" />

                      {signing === row.id ? (
                        <SignaturePad
                          name={row.name}
                          onCancel={() => setSigning(null)}
                          onSigned={(s) => {
                            sign(r.id, row.id, s);
                            setSigning(null);
                          }}
                        />
                      ) : row.signature ? (
                        <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                          {row.signature.ref} · SIGNED {hhmm(row.signature.signedAt)} AS{" "}
                          {row.signature.signedName.toUpperCase() || "—"}
                          <Btn className="ml-2" onClick={() => setSigning(row.id)}>
                            Sign again
                          </Btn>
                        </div>
                      ) : (
                        <Btn variant="primary" onClick={() => setSigning(row.id)}>
                          Sign
                        </Btn>
                      )}
                    </div>
                  ))}
                  {r.rows.length === 0 ? (
                    <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      Nobody recorded yet. Use the box above.
                    </p>
                  ) : null}

                  <div
                    className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <Btn onClick={() => void copyRegister(r.id)}>
                      {copied === r.id ? "Copied" : "Copy this register"}
                    </Btn>
                    <Btn
                      onClick={() => {
                        removeRegister(r.id);
                        setOpenId(null);
                      }}
                    >
                      <IconX /> Delete this register
                    </Btn>
                  </div>
                  {unbacked.length ? (
                    <p className="mt-1.5 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                      {unbacked.length} SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS DEVICE ONLY. THE
                      RECORD COPY IS NOT WIRED YET — COPY THE REGISTER OUT BEFORE THE TABLET LEAVES SITE.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </Panel>
          </div>
        );
      })}
      </div>
    </div>
  );
}
