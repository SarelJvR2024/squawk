"use client";

/** IMMEDIATE SAFETY FINDINGS — TK-003 form 1, on the tablet.
 *
 *  Every other screen in this app is about the audit. This one is about
 *  somebody getting hurt this afternoon, and it is built differently for that
 *  reason.
 *
 *  SWP-07 sets the sequence: stop, make safe only if it can be done without
 *  risk, notify the ACSA site representative VERBALLY AT ONCE, complete the
 *  form, issue written notification THE SAME DAY. The scope of work says the
 *  same thing from ACSA's side — "all safety related findings picked up during
 *  the audit must be reported immediately".
 *
 *  Three things follow from that, and they are the whole design.
 *
 *  RAISE IN ONE FIELD. The person raising this is standing in front of the
 *  thing. Type what you saw, hit Raise, deal with the danger. Everything
 *  else — location, who you told, what you did — is filled in afterwards from
 *  somewhere safer. A form that demanded all of it first is a form that gets
 *  written up that evening from memory, and the times on it would be fiction.
 *
 *  THE CLOCKS ARE THE RECORD. raisedAt to notifiedAt is what "at once" means;
 *  raisedAt to the written notice is what "the same day" means. Both are shown
 *  on the row, running, because a gap you can see is a gap somebody closes.
 *
 *  THE NOTICE IS COMPOSED FOR YOU. SWP-07 wants written notification the same
 *  day. The difference between that happening and not happening is usually
 *  whether somebody had to write it from scratch at the end of a four-site day,
 *  so the app writes it and the auditor sends it. */

import { useMemo, useState } from "react";
import {
  useEntityCode,
  useSafetyFindings,
  useStore,
  disciplinesAt,
} from "@/lib/store";
import {
  METHOD_LABEL,
  isfStage,
  missingFields,
  noticeText,
  notifyGapMs,
  unbackedIsfSignature,
  writtenStatus,
} from "@/lib/isf";
import { systemsAt } from "@/lib/register";
import { siteFor, siteCodeFor } from "@/lib/sites";
import { useNow } from "@/lib/clock";
import { useFormsHubDeepLink } from "@/lib/deepLink";
import { AttachmentStrip, PhotoButton, VoiceNoteButton } from "@/components/Capture";
import RecordActions from "@/components/RecordActions";
import RootCauseAdvice from "@/components/RootCauseAdvice";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Chip, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";
import type { IsfStage, NotifyMethod, SafetyFinding, Urgency } from "@/lib/types";
import { URGENCIES } from "@/lib/types";

const METHODS: NotifyMethod[] = ["in-person", "phone", "radio", "message", "email"];

/** Colour carries the urgency, so a glance at the register is enough.
 *  `raised` is red on purpose: an ISF nobody has verbally notified is the one
 *  state SWP-07 treats as unfinished business. */
const STAGE: Record<IsfStage, { label: string; tone: "warn" | "accent" | undefined }> = {
  raised: { label: "NOT YET NOTIFIED", tone: "warn" },
  notified: { label: "NOTIFIED VERBALLY", tone: "accent" },
  issued: { label: "NOTICE ISSUED", tone: "accent" },
  closed: { label: "CLOSED", tone: undefined },
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

function dateInputValue(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeInputValue(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function IsfPage() {
  const findings = useSafetyFindings();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const add = useStore((s) => s.addSafetyFinding);
  const patch = useStore((s) => s.updateSafetyFinding);
  const signFinding = useStore((s) => s.signIsf);
  const addPhoto = useStore((s) => s.addIsfAttachment);
  const removePhoto = useStore((s) => s.removeIsfAttachment);
  const updatePhoto = useStore((s) => s.updateIsfAttachment);

  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const assetSystems = useMemo(() => systemsAt(entityCode), [entityCode]);
  const site = siteFor(entityCode);

  function setRaisedDate(f: SafetyFinding, v: string) {
    if (!v) return;
    const t = new Date(f.raisedAt);
    const merged = new Date(
      `${v}T${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:00`
    );
    patch(f.id, { raisedAt: merged.getTime() });
  }
  function setRaisedTime(f: SafetyFinding, v: string) {
    const [hh, mm] = v.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const merged = new Date(f.raisedAt);
    merged.setHours(hh, mm, 0, 0);
    patch(f.id, { raisedAt: merged.getTime() });
  }
  /* 0 until the device's clock is known — see src/lib/clock.ts. Everything it
     drives here is a warning ABOUT lateness, so rendering none of it on the
     first frame is the right failure: an overdue badge that flickers in is
     additive, one that flickers out would be a notice somebody stopped
     chasing. */
  const now = useNow();
  useFormsHubDeepLink(setOpenId);

  function raise() {
    const text = draft.trim();
    if (!text) return;
    const id = add(text, { discipline: null });
    setDraft("");
    /* Open it immediately. The next thing the auditor does is tell somebody,
       and the notify control is the first thing in the panel. */
    setOpenId(id);
  }

  async function copyNotice(f: SafetyFinding) {
    const text = noticeText(f, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(f.id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      /* Clipboard is refused often enough on a locked-down tablet that a
         silent failure here would be a notice nobody sent. Fall back to
         something the auditor can select by hand. */
      window.prompt("Copy this notice", text);
    }
  }

  const open = findings.filter((f) => !f.closedAt);
  const unnotified = open.filter((f) => isfStage(f) === "raised");

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">Immediate safety findings</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          SWP-07. Stop, make safe only if it can be done without risk, tell the ACSA
          representative at once, then issue the written notice the same day.
        </p>
      </header>

      {/* RAISE. Kept at the top and always visible — scrolling past a register
          to reach it is the wrong shape for something urgent. */}
      <Panel tone={unnotified.length ? "warn" : "accent"} className="mb-4">
        <Field label="WHAT DID YOU SEE?" hint="the only field needed to raise it">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            /* A placeholder is not a name: it disappears the moment somebody
               types, and a screen reader never announced it in the first
               place. Every control on this screen carries its own, because
               Field's label is a <b> beside the input rather than a <label>
               bound to it. */
            aria-label="What did you see?"
            placeholder="Exposed busbar in the MV room, door standing open"
            className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
            style={{ background: "var(--bg)", borderColor: "var(--line)" }}
          />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {unnotified.length
              ? `${unnotified.length} NOT YET NOTIFIED`
              : "TIME IS RECORDED FROM THE MOMENT YOU RAISE IT"}
          </span>
          <Btn variant="primary" onClick={raise} disabled={!draft.trim()}>
            Raise
          </Btn>
        </div>
      </Panel>

      {findings.length === 0 ? (
        <Empty>
          <b>Nothing raised.</b>
          <span>
            An immediate safety finding is for a condition that could hurt somebody now —
            not a non-compliance for the report.
          </span>
        </Empty>
      ) : null}

      {findings.map((f) => {
        const stage = isfStage(f);
        const gap = notifyGapMs(f);
        const written = writtenStatus(f, now);
        const gaps = missingFields(f);
        const isOpen = openId === f.id;
        return (
          <div key={f.id} data-record-id={f.id} className="mb-3">
            <Panel tone={STAGE[stage].tone}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : f.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">{f.id}</span>
                    <Pill>{STAGE[stage].label}</Pill>
                    {written === "late" && !f.closedAt ? (
                      <Pill>WRITTEN NOTICE OVERDUE</Pill>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[13px]">{f.description}</p>
                  <div
                    className="mt-1 font-mono text-[9px]"
                    style={{ color: "var(--ink-4)" }}
                  >
                    RAISED {clock(f.raisedAt)}
                    {f.raisedBy ? ` · ${f.raisedBy}` : ""}
                    {gap === null
                      ? " · NOT NOTIFIED"
                      : ` · NOTIFIED AFTER ${mins(gap).toUpperCase()}`}
                    {gaps.length ? ` · ${gaps.length} FIELD${gaps.length > 1 ? "S" : ""} MISSING` : ""}
                  </div>
                </div>
              </button>

              {isOpen ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  {/* NOTIFY FIRST. It is the top of the panel because it is the
                      next thing SWP-07 asks for, and because an ISF that is
                      never verbally notified is the failure mode this whole
                      screen exists to prevent. */}
                  {!f.notifiedAt ? (
                    <Field label="TELL THE ACSA REPRESENTATIVE" hint="verbally, at once">
                      <input
                        value={f.notifiedTo}
                        onChange={(e) => patch(f.id, { notifiedTo: e.target.value })}
                        aria-label={`Who you told about ${f.id}`}
                        placeholder="Who did you tell?"
                        className="mb-2 w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      />
                      <div className="flex flex-wrap gap-2">
                        {METHODS.map((m) => (
                          <Btn
                            key={m}
                            onClick={() =>
                              patch(f.id, { notifiedMethod: m, notifiedAt: Date.now() })
                            }
                          >
                            {METHOD_LABEL[m]}
                          </Btn>
                        ))}
                      </div>
                    </Field>
                  ) : (
                    <Field label="VERBAL NOTIFICATION">
                      <p className="text-[12px]">
                        {f.notifiedTo || "—"} ·{" "}
                        {f.notifiedMethod ? METHOD_LABEL[f.notifiedMethod] : "—"} ·{" "}
                        {clock(f.notifiedAt)}
                        {gap !== null ? ` (${mins(gap)} after raising)` : ""}
                      </p>
                    </Field>
                  )}

                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="DATE">
                      <input
                        type="date"
                        value={dateInputValue(f.raisedAt)}
                        onChange={(e) => setRaisedDate(f, e.target.value)}
                        aria-label={`Date ${f.id} was raised`}
                        className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      />
                    </Field>
                    <Field label="TIME">
                      <input
                        type="time"
                        value={timeInputValue(f.raisedAt)}
                        onChange={(e) => setRaisedTime(f, e.target.value)}
                        aria-label={`Time ${f.id} was raised`}
                        className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      />
                    </Field>
                  </div>

                  <Field label="WHAT HAPPENED">
                    <textarea
                      value={f.description}
                      onChange={(e) => patch(f.id, { description: e.target.value })}
                      rows={2}
                      aria-label={`What happened — ${f.id}`}
                      placeholder="Exposed busbar in the MV room, door standing open"
                      className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                      style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                    />
                  </Field>

                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="IDENTIFIED BY" hint="who saw it happen">
                      <input
                        value={f.raisedBy}
                        onChange={(e) => patch(f.id, { raisedBy: e.target.value })}
                        aria-label={`Who identified ${f.id}`}
                        className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      />
                    </Field>
                    <Field label="RECORDED BY" hint="who is filling this in">
                      <input
                        value={f.recordedBy}
                        onChange={(e) => patch(f.id, { recordedBy: e.target.value })}
                        aria-label={`Who recorded ${f.id}`}
                        className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      />
                    </Field>
                  </div>

                  <Field label="WHERE" hint="somewhere a person can walk to">
                    <input
                      value={f.location}
                      onChange={(e) => patch(f.id, { location: e.target.value })}
                      aria-label={`Where ${f.id} is`}
                      placeholder="MV switchroom, Pier B basement"
                      className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                      style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                    />
                  </Field>

                  <Field label="LOCATION DESCRIPTION" hint="optional — detail enough to find the exact spot later">
                    <textarea
                      value={f.locationDescription}
                      onChange={(e) => patch(f.id, { locationDescription: e.target.value })}
                      rows={2}
                      aria-label={`Location description for ${f.id}`}
                      placeholder="Between stand 14 and 15, access panel on the apron side"
                      className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                      style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                    />
                  </Field>

                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="DISCIPLINE">
                      <select
                        value={f.discipline ?? ""}
                        onChange={(e) =>
                          patch(f.id, { discipline: e.target.value || null })
                        }
                        aria-label={`Discipline for ${f.id}`}
                        className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      >
                        <option value="">Not attributed</option>
                        {disciplines.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="ASSET SYSTEM">
                      <select
                        value={f.assetSystem ?? ""}
                        onChange={(e) => patch(f.id, { assetSystem: e.target.value || null })}
                        aria-label={`Asset system for ${f.id}`}
                        className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      >
                        <option value="">Not attributed</option>
                        {assetSystems.map((sys) => (
                          <option key={sys} value={sys}>
                            {sys}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="WHAT WAS THE IMPACT">
                      <textarea
                        value={f.actualImpact}
                        onChange={(e) => patch(f.id, { actualImpact: e.target.value })}
                        rows={2}
                        aria-label={`Actual impact of ${f.id}`}
                        placeholder="What actually resulted — damage, delay, a near miss"
                        className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      />
                    </Field>
                    <Field label="WHAT IS A POSSIBLE IMPACT">
                      <textarea
                        value={f.potentialImpact}
                        onChange={(e) => patch(f.id, { potentialImpact: e.target.value })}
                        rows={2}
                        aria-label={`Potential impact of ${f.id}`}
                        placeholder="The reasonable worst case if this happens again"
                        className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      />
                    </Field>
                  </div>

                  <Field label="IMMEDIATE RISK TO PERSONS">
                    <textarea
                      value={f.riskToPersons}
                      onChange={(e) => patch(f.id, { riskToPersons: e.target.value })}
                      rows={2}
                      aria-label={`Immediate risk to persons from ${f.id}`}
                      placeholder="Anyone entering the room could contact live parts"
                      className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                      style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                    />
                  </Field>

                  <Field label="IMMEDIATE ACTION TAKEN" hint="only if it was safe to act">
                    <textarea
                      value={f.immediateAction}
                      onChange={(e) => patch(f.id, { immediateAction: e.target.value })}
                      rows={2}
                      aria-label={`Immediate action taken on ${f.id}`}
                      placeholder="Withdrew, warned two staff nearby, escort locked the door"
                      className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                      style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                    />
                  </Field>

                  <Field label="RISK ASSESSMENT">
                    <RecordActions
                      record={{
                        ...f,
                        discipline: f.discipline ?? undefined,
                        system: f.assetSystem ?? undefined,
                      }}
                      entityCode={entityCode}
                      onChange={(p) => patch(f.id, p)}
                      advice={
                        <RootCauseAdvice
                          finding={{
                            description: f.description,
                            discipline: f.discipline ?? "",
                            system: f.assetSystem ?? "",
                            rootCause: f.rootCause,
                          }}
                          attachments={f.attachments}
                          onPick={(rc) => patch(f.id, { rootCause: rc })}
                        />
                      }
                      actionLabel="Mitigating action"
                    />
                  </Field>

                  <Field label="URGENCY" hint="how soon the underlying issue needs fixing">
                    <div className="flex flex-wrap gap-[6px]">
                      {URGENCIES.map((u) => (
                        <Chip
                          key={u}
                          selected={f.urgency === u}
                          onClick={() => patch(f.id, { urgency: u as Urgency })}
                        >
                          {u}
                        </Chip>
                      ))}
                    </div>
                  </Field>

                  <Field label="PHOTOGRAPHS">
                    <div className="flex justify-end gap-2">
                      <PhotoButton
                        compact
                        onCaptured={(m) =>
                          addPhoto(f.id, {
                            ...m,
                            location: f.location.trim(),
                            createdBy: auditor,
                          })
                        }
                      />
                      <VoiceNoteButton
                        compact
                        onCaptured={(m) => addPhoto(f.id, { ...m, createdBy: auditor })}
                      />
                    </div>
                    {f.attachments.length > 0 ? (
                      <div className="mt-2">
                        <AttachmentStrip
                          attachments={f.attachments}
                          thumbSize={40}
                          onRemove={(aid) => removePhoto(f.id, aid)}
                          onUpdate={(aid, p) => updatePhoto(f.id, aid, p)}
                        />
                      </div>
                    ) : null}
                  </Field>

                  <Field label="AREA / DEPT MANAGER FROM ACSA" hint="who on ACSA's side owns this area">
                    <input
                      value={f.acsaManagerName}
                      onChange={(e) => patch(f.id, { acsaManagerName: e.target.value })}
                      aria-label={`ACSA area or department manager for ${f.id}`}
                      placeholder="Name of the ACSA area or department manager"
                      className="w-full rounded-[9px] border px-3 py-2 text-[13px]"
                      style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                    />
                  </Field>

                  {/* THE SAME-DAY NOTICE. */}
                  <Field
                    label="WRITTEN NOTICE"
                    hint={
                      f.writtenIssuedAt
                        ? `ISSUED ${clock(f.writtenIssuedAt)}`
                        : written === "late"
                          ? "OVERDUE"
                          : written === "dueToday"
                            ? "DUE TODAY"
                            : undefined
                    }
                  >
                    <input
                      value={f.writtenTo}
                      onChange={(e) => patch(f.id, { writtenTo: e.target.value })}
                      aria-label={`Who the written notice for ${f.id} goes to`}
                      placeholder="Airport contact and ACSA Centre of Excellence"
                      className="mb-2 w-full rounded-[9px] border px-3 py-2 text-[13px]"
                      style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Btn onClick={() => void copyNotice(f)}>
                        {copied === f.id ? "Copied" : "Copy notice"}
                      </Btn>
                      {!f.writtenIssuedAt ? (
                        <Btn
                          onClick={() => patch(f.id, { writtenIssuedAt: Date.now() })}
                        >
                          <IconCheck /> Mark issued
                        </Btn>
                      ) : null}
                    </div>
                  </Field>

                  <Field label="AUTHORISED BY" hint="TPJV's authorised person, attesting this record is accurate">
                    <input
                      value={f.authorisedBy}
                      onChange={(e) => patch(f.id, { authorisedBy: e.target.value })}
                      aria-label={`Authorised person for ${f.id}`}
                      placeholder="Name of the TPJV authorised person"
                      className="mb-2 w-full rounded-[9px] border px-3 py-2 text-[13px]"
                      style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                    />
                    {signing === f.id ? (
                      <>
                        <p className="mb-2 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                          By signing, {f.authorisedBy.trim() || "this person"} confirms the
                          finding above, as it stands, is an accurate record.
                        </p>
                        <SignaturePad
                          name={f.authorisedBy || auditor}
                          onCancel={() => setSigning(null)}
                          onSigned={(s) => {
                            signFinding(f.id, s);
                            setSigning(null);
                          }}
                        />
                      </>
                    ) : f.authorisedSignature ? (
                      <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {f.authorisedSignature.ref} · SIGNED {clock(f.authorisedSignature.signedAt)} AS{" "}
                        {f.authorisedSignature.signedName.toUpperCase() || "—"}
                        <Btn className="ml-2" onClick={() => setSigning(f.id)}>
                          Sign again
                        </Btn>
                      </div>
                    ) : (
                      <Btn onClick={() => setSigning(f.id)}>Sign</Btn>
                    )}
                    {unbackedIsfSignature(f).length ? (
                      <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                        THIS SIGNATURE IS ON THIS DEVICE ONLY. COPY THE NOTICE OUT BEFORE THE
                        TABLET LEAVES SITE.
                      </p>
                    ) : null}
                  </Field>

                  {/* CLOSURE means the risk to persons is gone, not that the
                      paperwork is finished. */}
                  {!f.closedAt ? (
                    <Field label="CLOSE" hint="only when the risk to persons is gone">
                      <input
                        value={f.closureNote}
                        onChange={(e) => patch(f.id, { closureNote: e.target.value })}
                        aria-label={`Who confirmed ${f.id} is safe, and how`}
                        placeholder="Who confirmed it, and how"
                        className="mb-2 w-full rounded-[9px] border px-3 py-2 text-[13px]"
                        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                      />
                      <Btn
                        onClick={() =>
                          patch(f.id, { closedAt: Date.now(), closedBy: auditor })
                        }
                        disabled={!f.closureNote.trim()}
                      >
                        Close this finding
                      </Btn>
                    </Field>
                  ) : (
                    <Field label="CLOSED">
                      <p className="text-[12px]">
                        {clock(f.closedAt)}
                        {f.closedBy ? ` · ${f.closedBy}` : ""} — {f.closureNote}
                      </p>
                      <Btn
                        className="mt-2"
                        onClick={() => patch(f.id, { closedAt: null, closedBy: "" })}
                      >
                        <IconX /> Reopen
                      </Btn>
                    </Field>
                  )}

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
    </div>
  );
}
