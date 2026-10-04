"use client";

/** TOOLBOX TALK RECORD, ON THE TABLET — TK-003 form 6.
 *
 *  A pre-work safety briefing: what topic was covered, who facilitated it,
 *  who attended, and each attendee's signature that they were there and
 *  heard it. ONE RECORD PER TALK, not per day — the same reasoning as the
 *  PPE check and the site access log: a crew can be briefed more than once
 *  in a day as work moves between areas, and each briefing is found later by
 *  what it covered rather than buried inside one day's worth of everything. */

import { useState } from "react";
import { useEntityCode, useStore, useToolboxTalks } from "@/lib/store";
import { isSigned, talkGaps, talkText, unbackedSignatures } from "@/lib/toolbox";
import { siteCodeFor, siteFor } from "@/lib/sites";
import { useFormsHubDeepLink } from "@/lib/deepLink";
import ContactPicker from "@/components/ContactPicker";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconLeft, IconX } from "@/components/ui/icons";

const inputCls = "min-h-[44px] w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function ToolboxTalkPage() {
  const talks = useToolboxTalks();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const open = useStore((s) => s.openToolboxTalk);
  const patchTalk = useStore((s) => s.updateToolboxTalk);
  const removeTalk = useStore((s) => s.removeToolboxTalk);
  const addAttendee = useStore((s) => s.addToolboxAttendee);
  const patchAttendee = useStore((s) => s.updateToolboxAttendee);
  const removeAttendee = useStore((s) => s.removeToolboxAttendee);
  const sign = useStore((s) => s.signToolboxAttendee);

  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  /* ONE ATTENDEE EXPANDED AT A TIME, same reasoning as the attendance
     register: name/role/organisation only matter while a row is actually
     being filled in; once recorded it folds to a single line. */
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draftTopic, setDraftTopic] = useState("");
  const [draftFacilitator, setDraftFacilitator] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  useFormsHubDeepLink(setOpenId);

  const site = siteFor(entityCode);

  function startTalk() {
    if (!draftTopic.trim()) return;
    const id = open({
      topic: draftTopic.trim(),
      facilitator: draftFacilitator.trim(),
      location: draftLocation.trim(),
    });
    setOpenId(id);
    setDraftTopic("");
    setDraftFacilitator("");
    setDraftLocation("");
  }

  async function copyTalk(id: string) {
    const t = talks.find((x) => x.id === id);
    if (!t) return;
    const text = talkText(t, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this toolbox talk", text);
    }
  }

  /* ONE TALK AT A TIME, FULL FOCUS — same change as attendance: Sarel,
     "don't show the top section to create a new register... it should
     represent only that specific register." An open talk is handed from
     person to person the same way. */
  const activeTalk = talks.find((x) => x.id === openId) ?? null;

  if (activeTalk) {
    const t = activeTalk;
    const unbacked = unbackedSignatures(t);
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
            All toolbox talks
          </button>

          <Panel>
            <div data-record-id={t.id} className="font-mono text-[10px]">
              {t.date} · {hhmm(t.openedAt)}
            </div>

            <div className="mt-3 mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="TOPIC">
                <input
                  value={t.topic}
                  onChange={(e) => patchTalk(t.id, { topic: e.target.value })}
                  aria-label={`Topic for talk ${t.id}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
              <Field label="FACILITATOR">
                <input
                  value={t.facilitator}
                  onChange={(e) => patchTalk(t.id, { facilitator: e.target.value })}
                  aria-label={`Facilitator for talk ${t.id}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
              <Field label="LOCATION">
                <input
                  value={t.location}
                  onChange={(e) => patchTalk(t.id, { location: e.target.value })}
                  aria-label={`Location for talk ${t.id}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="WHO WAS THERE" hint={`${t.attendees.length} recorded`}>
              <ContactPicker
                entityCode={entityCode}
                onAdd={(p) => {
                  const rowId = addAttendee(t.id, p.name, {
                    contactId: p.contactId,
                    organisation: p.organisation ?? "",
                  });
                  setExpandedRowId(rowId);
                }}
              />
            </Field>

            {t.attendees.map((a) => {
              const rowOpen = expandedRowId === a.id;
              const rowSigning = signing === a.id;
              const signed = isSigned(a);
              const rowSummary = [a.role, a.organisation].filter((v) => v.trim()).join(" · ");
              return (
                <div
                  key={a.id}
                  className="mb-2 mt-2 rounded-[9px] border p-2"
                  style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                >
                  <div className="flex items-center gap-[6px]">
                    <button
                      type="button"
                      onClick={() => setExpandedRowId(rowOpen ? null : a.id)}
                      className="flex min-h-[30px] min-w-0 flex-1 items-center gap-[6px] text-left"
                    >
                      {signed ? <Pill tone="accent">SIGNED</Pill> : <Pill tone="warn">NOT SIGNED</Pill>}
                      <span className="truncate text-[12.5px] font-semibold">
                        {a.name.trim() || "Unnamed"}
                      </span>
                    </button>

                    {/* THE QUICK SIGN — same control as attendance. */}
                    {!rowSigning && (
                      <button
                        type="button"
                        onClick={() => setSigning(a.id)}
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
                        name={a.name}
                        onCancel={() => setSigning(null)}
                        onSigned={(s) => {
                          sign(t.id, a.id, s);
                          setSigning(null);
                          setExpandedRowId(null);
                        }}
                      />
                    </div>
                  ) : rowOpen ? (
                    <div className="mt-[6px]">
                      <div className="mb-[5px] flex items-center justify-between gap-2">
                        {a.signature ? (
                          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            {a.signature.ref} · SIGNED {hhmm(a.signature.signedAt)} AS{" "}
                            {a.signature.signedName.toUpperCase() || "—"}
                          </span>
                        ) : (
                          <span />
                        )}
                        <Btn
                          onClick={() => {
                            removeAttendee(t.id, a.id);
                            setExpandedRowId((cur) => (cur === a.id ? null : cur));
                          }}
                        >
                          <IconX /> Remove
                        </Btn>
                      </div>

                      <input
                        value={a.name}
                        onChange={(ev) => patchAttendee(t.id, a.id, { name: ev.target.value })}
                        aria-label={`Name of attendee ${a.id}`}
                        placeholder="Full name"
                        className={`mb-2 ${inputCls}`}
                        style={inputStyle}
                      />

                      <div className="flex flex-wrap gap-[6px]">
                        <input
                          value={a.role}
                          onChange={(ev) => patchAttendee(t.id, a.id, { role: ev.target.value })}
                          aria-label={`Role of attendee ${a.id}`}
                          placeholder="Role (optional)"
                          className="min-h-[44px] flex-1 min-w-[140px] rounded-[9px] border px-3 text-[13px]"
                          style={inputStyle}
                        />
                        <input
                          value={a.organisation}
                          onChange={(ev) => patchAttendee(t.id, a.id, { organisation: ev.target.value })}
                          aria-label={`Organisation of attendee ${a.id}`}
                          placeholder="Organisation (optional)"
                          className="min-h-[44px] flex-1 min-w-[160px] rounded-[9px] border px-3 text-[13px]"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {t.attendees.length === 0 ? (
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
                  setSavedId(t.id);
                  window.setTimeout(() => setSavedId(null), 2500);
                }}
              >
                <IconCheck /> Save & close
              </Btn>
              <div className="flex items-center gap-2">
                <Btn onClick={() => void copyTalk(t.id)}>
                  {copied === t.id ? "Copied" : "Copy this talk"}
                </Btn>
                {/* A SECOND TAP BEFORE ANYTHING IS LOST — same pattern as
                    the attendance register's "Delete this register". */}
                {confirmingDelete ? (
                  <>
                    <span className="text-[11px] font-semibold" style={{ color: "var(--warn)" }}>
                      Delete this talk?
                    </span>
                    <Btn onClick={() => setConfirmingDelete(false)}>Cancel</Btn>
                    <Btn
                      onClick={() => {
                        removeTalk(t.id);
                        setOpenId(null);
                        setConfirmingDelete(false);
                      }}
                    >
                      <IconX /> Yes, delete
                    </Btn>
                  </>
                ) : (
                  <Btn onClick={() => setConfirmingDelete(true)}>
                    <IconX /> Delete this talk
                  </Btn>
                )}
              </div>
            </div>
            {unbacked.length ? (
              <p className="mt-1.5 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                {unbacked.length} SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS DEVICE ONLY. THE
                RECORD COPY IS NOT WIRED YET — COPY THIS TALK OUT BEFORE THE TABLET LEAVES SITE.
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
        <h2 className="font-display text-[15px] font-semibold">Toolbox talk</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          What was covered, who gave it, and who was there and signed for it — one record per
          briefing.
        </p>
      </header>

      <Panel tone="accent" className="mb-4">
        <Field label="TOPIC">
          <input
            value={draftTopic}
            onChange={(e) => setDraftTopic(e.target.value)}
            aria-label="Topic of this toolbox talk"
            placeholder="Working at height, MV switchroom access…"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="FACILITATOR" hint="optional">
          <input
            value={draftFacilitator}
            onChange={(e) => setDraftFacilitator(e.target.value)}
            aria-label="Who gave this talk"
            placeholder="Name of facilitator"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="LOCATION" hint="optional">
          <input
            value={draftLocation}
            onChange={(e) => setDraftLocation(e.target.value)}
            aria-label="Where this talk was given"
            placeholder="Site office, apron stand 14…"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <div className="flex justify-end">
          <Btn variant="primary" onClick={startTalk} disabled={!draftTopic.trim()}>
            Log this talk
          </Btn>
        </div>
      </Panel>

      {talks.length === 0 ? (
        <Empty>
          <b>No toolbox talk recorded.</b>
          <span>Log the topic above as the briefing starts.</span>
        </Empty>
      ) : null}

      {talks.map((t) => {
        const gaps = talkGaps(t);
        return (
          <div key={t.id} data-record-id={t.id} className="mb-2">
            <Panel>
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">
                      {t.date} · {hhmm(t.openedAt)}
                    </span>
                    {savedId === t.id ? <Pill tone="accent">✓ SAVED</Pill> : null}
                  </div>
                  <p className="mt-1 text-[13px]">
                    {t.topic.trim() || "No topic recorded"}
                    {t.facilitator.trim() ? ` — ${t.facilitator.trim()}` : ""}
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {t.attendees.length === 0
                      ? "Nobody recorded"
                      : t.attendees.map((a) => a.name || "—").join(", ")}
                  </p>
                  <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {t.id}
                    {t.location ? ` · ${t.location.toUpperCase()}` : ""}
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
