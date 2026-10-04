"use client";

/** SITE ACCESS LOG, ON THE TABLET — one per area visited.
 *
 *  Sarel's own words on what this needed to capture: "where we went, purpose,
 *  who escorted us, who went from ACSA and TPJV." Attendance already answers
 *  who was on site at the whole airport that day; this is the finer-grained
 *  question — who was standing in THIS switchroom, under whose escort, and
 *  why — which is what a finding raised in that specific area gets checked
 *  against.
 *
 *  ONE RECORD PER AREA VISITED, not per day — the same reasoning as the PPE
 *  check. The team can walk through four areas before lunch and each one is
 *  its own log, found later by area rather than buried inside one day's
 *  worth of everywhere. */

import { useState } from "react";
import { useEntityCode, useSiteAccessLogs, useStore } from "@/lib/store";
import type { SiteAccessLog, SiteAccessSide } from "@/lib/types";
import { isSigned, logGaps, logText, unbackedSignatures } from "@/lib/siteAccess";
import { siteCodeFor, siteFor } from "@/lib/sites";
import { useFormsHubDeepLink } from "@/lib/deepLink";
import ContactPicker from "@/components/ContactPicker";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconLeft, IconX } from "@/components/ui/icons";

const inputCls = "min-h-[44px] w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;
const SIDES: SiteAccessSide[] = ["ACSA", "TPJV", "Other"];

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** HH:MM for a <input type="time">, in the device's own timezone. */
function timeInputValue(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SiteAccessPage() {
  const logs = useSiteAccessLogs();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const open = useStore((s) => s.openSiteAccessLog);
  const patchLog = useStore((s) => s.updateSiteAccessLog);
  const removeLog = useStore((s) => s.removeSiteAccessLog);
  const addVisitor = useStore((s) => s.addSiteAccessVisitor);
  const patchVisitor = useStore((s) => s.updateSiteAccessVisitor);
  const removeVisitor = useStore((s) => s.removeSiteAccessVisitor);
  const sign = useStore((s) => s.signSiteAccessVisitor);

  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  /* ONE VISITOR EXPANDED AT A TIME, same reasoning as the attendance
     register: name/side/organisation only matter while a row is actually
     being filled in; once recorded it folds to a single line.
     DECISION REVERSED: adding a visitor used to auto-expand their new row
     straight into that detail panel. Sarel: "when adding a person to the
     site access just keep it in one row, dont show expanded box" — a
     freshly added visitor now folds to the same one-line row as everyone
     else; tapping it still opens the detail panel to fill in side/
     organisation. */
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draftArea, setDraftArea] = useState("");
  useFormsHubDeepLink(setOpenId);
  const [draftPurpose, setDraftPurpose] = useState("");
  const [draftEscort, setDraftEscort] = useState("");

  const site = siteFor(entityCode);

  function startLog() {
    if (!draftArea.trim()) return;
    const id = open({
      area: draftArea.trim(),
      purpose: draftPurpose.trim(),
      escortedBy: draftEscort.trim(),
    });
    setOpenId(id);
    setDraftArea("");
    setDraftPurpose("");
    setDraftEscort("");
  }

  /* Day/start/end, same editable-not-just-stamped pattern as PPE's
     setCheckDate/setCheckTime (Sarel, 4 October 2026: "allow adding day,
     start and end time"). Changing the date keeps every time of day it
     carries — openedAt (the start) and, if set, endTime. */
  function setLogDate(l: SiteAccessLog, v: string) {
    if (!v) return;
    const mergeDate = (t: number) => {
      const d = new Date(t);
      return new Date(
        `${v}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`
      ).getTime();
    };
    patchLog(l.id, {
      date: v,
      openedAt: mergeDate(l.openedAt),
      endTime: l.endTime !== null ? mergeDate(l.endTime) : null,
    });
  }
  function setStartTime(l: SiteAccessLog, v: string) {
    const [hh, mm] = v.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const merged = new Date(`${l.date}T00:00:00`);
    merged.setHours(hh, mm, 0, 0);
    patchLog(l.id, { openedAt: merged.getTime() });
  }
  /* Nullable like DiaryEntry.at — a visit still being walked has no end
     yet, and clearing the input puts it back there rather than keeping a
     stale time. */
  function setEndTime(l: SiteAccessLog, v: string) {
    if (!v) {
      patchLog(l.id, { endTime: null });
      return;
    }
    const [hh, mm] = v.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const merged = new Date(`${l.date}T00:00:00`);
    merged.setHours(hh, mm, 0, 0);
    patchLog(l.id, { endTime: merged.getTime() });
  }

  async function copyLog(l: SiteAccessLog) {
    const text = logText(l, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(l.id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this site access log", text);
    }
  }

  /* ONE LOG AT A TIME, FULL FOCUS — same change as attendance: Sarel,
     "don't show the top section to create a new register... it should
     represent only that specific register." An open log is handed from
     person to person the same way. */
  const activeLog = logs.find((l) => l.id === openId) ?? null;

  if (activeLog) {
    const l = activeLog;
    const unbacked = unbackedSignatures(l);
    return (
      <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
          <button
            type="button"
            onClick={() => {
              setOpenId(null);
              setConfirmingDelete(false);
            }}
            className="mb-2.5 flex items-center gap-1 text-[12px] font-semibold"
            style={{ color: "var(--acc)" }}
          >
            <IconLeft width={12} height={12} />
            All site access logs
          </button>

          <Panel>
            <div data-record-id={l.id} className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="DATE">
                <input
                  type="date"
                  value={l.date}
                  onChange={(e) => setLogDate(l, e.target.value)}
                  aria-label={`Date for log ${l.id}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
              <Field label="START">
                <input
                  type="time"
                  value={timeInputValue(l.openedAt)}
                  onChange={(e) => setStartTime(l, e.target.value)}
                  aria-label={`Start time for log ${l.id}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
              <Field label="END" hint="optional">
                <input
                  type="time"
                  value={l.endTime !== null ? timeInputValue(l.endTime) : ""}
                  onChange={(e) => setEndTime(l, e.target.value)}
                  aria-label={`End time for log ${l.id}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="AREA">
                <input
                  value={l.area}
                  onChange={(e) => patchLog(l.id, { area: e.target.value })}
                  aria-label={`Area for log ${l.id}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
              <Field label="PURPOSE">
                <input
                  value={l.purpose}
                  onChange={(e) => patchLog(l.id, { purpose: e.target.value })}
                  aria-label={`Purpose for log ${l.id}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
              <Field label="ESCORTED BY">
                <input
                  value={l.escortedBy}
                  onChange={(e) => patchLog(l.id, { escortedBy: e.target.value })}
                  aria-label={`Escort for log ${l.id}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="NOTES" hint="optional — what the team saw or noted about the area itself">
              <textarea
                value={l.notes}
                onChange={(e) => patchLog(l.id, { notes: e.target.value })}
                rows={2}
                aria-label={`Notes for log ${l.id}`}
                placeholder="Site access observation notes…"
                className={inputCls}
                style={inputStyle}
              />
            </Field>

            <div className="mt-3">
              <Field label="WHO WENT IN" hint={`${l.people.length} recorded`}>
                <ContactPicker
                  entityCode={entityCode}
                  onAdd={(p) => {
                    addVisitor(l.id, p.name, {
                      contactId: p.contactId,
                      organisation: p.organisation ?? "",
                    });
                  }}
                />
              </Field>
            </div>

            {l.people.map((v) => {
              const rowOpen = expandedRowId === v.id;
              const rowSigning = signing === v.id;
              const signed = isSigned(v);
              const rowSummary = [v.side, v.organisation].filter((s) => s.trim()).join(" · ");
              return (
                <div
                  key={v.id}
                  className="mb-2 mt-2 rounded-[9px] border p-2"
                  style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                >
                  <div className="flex items-center gap-[6px]">
                    <button
                      type="button"
                      onClick={() => setExpandedRowId(rowOpen ? null : v.id)}
                      className="flex min-h-[30px] min-w-0 flex-1 items-center gap-[6px] text-left"
                    >
                      {signed ? <Pill tone="accent">SIGNED</Pill> : <Pill tone="warn">NOT SIGNED</Pill>}
                      <span className="truncate text-[12.5px] font-semibold">
                        {v.name.trim() || "Unnamed"}
                      </span>
                    </button>

                    {/* THE QUICK SIGN — same control as attendance. */}
                    {!rowSigning && (
                      <button
                        type="button"
                        onClick={() => setSigning(v.id)}
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

                  {!rowOpen && !rowSigning && rowSummary ? (
                    <p className="mt-[3px] truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                      {rowSummary}
                    </p>
                  ) : null}

                  {rowSigning ? (
                    <div className="mt-[6px]">
                      <SignaturePad
                        name={v.name}
                        onCancel={() => setSigning(null)}
                        onSigned={(s) => {
                          sign(l.id, v.id, s);
                          setSigning(null);
                          setExpandedRowId(null);
                        }}
                      />
                    </div>
                  ) : rowOpen ? (
                    <div className="mt-[6px]">
                      <div className="mb-[5px] flex items-center justify-between gap-2">
                        {v.signature ? (
                          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            {v.signature.ref} · SIGNED {hhmm(v.signature.signedAt)} AS{" "}
                            {v.signature.signedName.toUpperCase() || "—"}
                          </span>
                        ) : (
                          <span />
                        )}
                        <Btn
                          onClick={() => {
                            removeVisitor(l.id, v.id);
                            setExpandedRowId((cur) => (cur === v.id ? null : cur));
                          }}
                        >
                          <IconX /> Remove
                        </Btn>
                      </div>

                      <input
                        value={v.name}
                        onChange={(ev) => patchVisitor(l.id, v.id, { name: ev.target.value })}
                        aria-label={`Name of visitor ${v.id}`}
                        placeholder="Full name"
                        className={`mb-2 ${inputCls}`}
                        style={inputStyle}
                      />

                      <div className="flex flex-wrap gap-[6px]">
                        {SIDES.map((side) => (
                          <Btn
                            key={side}
                            variant={v.side === side ? "primary" : "default"}
                            onClick={() => patchVisitor(l.id, v.id, { side })}
                          >
                            {side}
                          </Btn>
                        ))}
                        <input
                          value={v.organisation}
                          onChange={(ev) => patchVisitor(l.id, v.id, { organisation: ev.target.value })}
                          aria-label={`Organisation of visitor ${v.id}`}
                          placeholder="Organisation / subconsultant (optional)"
                          className="min-h-[44px] flex-1 min-w-[160px] rounded-[9px] border px-3 text-[13px]"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {l.people.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                Nobody recorded yet. Use the box above.
              </p>
            ) : null}

            <div
              className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2"
              style={{ borderColor: "var(--line)" }}
            >
              <Btn
                variant="primary"
                onClick={() => {
                  setOpenId(null);
                  setConfirmingDelete(false);
                  setSavedId(l.id);
                  window.setTimeout(() => setSavedId(null), 2500);
                }}
              >
                <IconCheck /> Save & close
              </Btn>
              <div className="flex items-center gap-2">
                <Btn onClick={() => void copyLog(l)}>
                  {copied === l.id ? "Copied" : "Copy this log"}
                </Btn>
                {/* A SECOND TAP BEFORE ANYTHING IS LOST — same pattern as
                    the attendance register's "Delete this register". */}
                {confirmingDelete ? (
                  <>
                    <span className="text-[11px] font-semibold" style={{ color: "var(--warn)" }}>
                      Delete this log?
                    </span>
                    <Btn onClick={() => setConfirmingDelete(false)}>Cancel</Btn>
                    <Btn
                      onClick={() => {
                        removeLog(l.id);
                        setOpenId(null);
                        setConfirmingDelete(false);
                      }}
                    >
                      <IconX /> Yes, delete
                    </Btn>
                  </>
                ) : (
                  <Btn onClick={() => setConfirmingDelete(true)}>
                    <IconX /> Delete this log
                  </Btn>
                )}
              </div>
            </div>
            {unbacked.length ? (
              <p className="mt-1.5 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                {unbacked.length} SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS DEVICE ONLY. THE
                RECORD COPY IS NOT WIRED YET — COPY THIS LOG OUT BEFORE THE TABLET LEAVES SITE.
              </p>
            ) : null}
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">Site access log</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Where the team went, why, who escorted them in, and who from ACSA and TPJV was there —
          one record per area visited.
        </p>
      </header>

      <Panel tone="accent" className="mb-4">
        <Field label="WHERE DID YOU GO?">
          <input
            value={draftArea}
            onChange={(e) => setDraftArea(e.target.value)}
            aria-label="Area or zone visited"
            placeholder="MV switchroom, Pier B · Airside apron, Stand 14…"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="PURPOSE" hint="optional">
          <input
            value={draftPurpose}
            onChange={(e) => setDraftPurpose(e.target.value)}
            aria-label="Purpose of this visit"
            placeholder="Asset inspection, follow-up on a finding…"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="ESCORTED BY" hint="optional">
          <input
            value={draftEscort}
            onChange={(e) => setDraftEscort(e.target.value)}
            aria-label="Who escorted the team"
            placeholder="Name of escort"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <div className="flex justify-end">
          <Btn variant="primary" onClick={startLog} disabled={!draftArea.trim()}>
            Log this visit
          </Btn>
        </div>
      </Panel>

      {logs.length === 0 ? (
        <Empty>
          <b>No site access logged.</b>
          <span>Log the area above as the team enters it.</span>
        </Empty>
      ) : null}

      {logs.map((l) => {
        const gaps = logGaps(l);
        return (
          <div key={l.id} data-record-id={l.id} className="mb-2">
            <Panel>
              <button
                type="button"
                onClick={() => setOpenId(l.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">
                      {l.date} · {hhmm(l.openedAt)}
                    </span>
                    {savedId === l.id ? <Pill tone="accent">✓ SAVED</Pill> : null}
                  </div>
                  <p className="mt-1 text-[13px]">
                    {l.area.trim() || "No area recorded"}
                    {l.purpose.trim() ? ` — ${l.purpose.trim()}` : ""}
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {l.people.length === 0
                      ? "Nobody recorded"
                      : l.people.map((v) => `${v.name || "—"} (${v.side})`).join(", ")}
                  </p>
                  <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {l.id}
                    {l.escortedBy ? ` · ESCORTED BY ${l.escortedBy.toUpperCase()}` : ""}
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
