"use client";

/** INCIDENT / NEAR-MISS REPORT — TK-003 form 5.
 *
 *  Built field-for-field against Annexure 1 of the OHS Act (Act 85 of 1993),
 *  Regulation 9's General Administrative Regulations for Recording and
 *  Investigation of Incidents — see the note at the top of IncidentReport in
 *  types.ts for why. This is a statutory record, not a risk-rated finding:
 *  there is no severity/likelihood matrix here, because Annexure 1 does not
 *  ask for one — it asks what happened, who was affected, who investigated,
 *  and what is being done about it. */

import { useState } from "react";
import { useEntityCode, useIncidentReports, useStore } from "@/lib/store";
import { BODY_PARTS, EFFECTS, incidentText, missingFields, unbackedSignatures } from "@/lib/incident";
import { siteCodeFor, siteFor } from "@/lib/sites";
import { useFormsHubDeepLink } from "@/lib/deepLink";
import { AttachmentStrip, PhotoButton, VoiceNoteButton } from "@/components/Capture";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Chip, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";
import type { ActionStatus, IncidentReport, MitigationAction } from "@/lib/types";

const inputCls = "w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;
const uid = () => Math.random().toString(36).slice(2, 10);
const STATUSES: ActionStatus[] = ["Open", "In progress", "Closed"];

function clock(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function IncidentPage() {
  const reports = useIncidentReports();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const add = useStore((s) => s.addIncidentReport);
  const patch = useStore((s) => s.updateIncidentReport);
  const remove = useStore((s) => s.removeIncidentReport);
  const signCompleted = useStore((s) => s.signIncidentCompleted);
  const signCompetent = useStore((s) => s.signIncidentCompetentPerson);
  const addPhoto = useStore((s) => s.addIncidentAttachment);
  const removePhoto = useStore((s) => s.removeIncidentAttachment);
  const updatePhoto = useStore((s) => s.updateIncidentAttachment);

  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  useFormsHubDeepLink(setOpenId);
  const site = siteFor(entityCode);

  function startReport(isNearMiss: boolean) {
    const id = add({ isNearMiss, completedBy: auditor });
    setOpenId(id);
  }

  async function copyReport(r: IncidentReport) {
    const text = incidentText(r, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(r.id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this report", text);
    }
  }

  function addAction(r: IncidentReport) {
    const a: MitigationAction = {
      id: uid(),
      action: "",
      owner: "",
      dueDate: "",
      status: "Open",
      originVisit: visitId,
      createdAt: Date.now(),
      createdBy: auditor,
    };
    patch(r.id, { actions: [...r.actions, a] });
  }

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">Incident / near-miss report</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Annexure 1, OHS Act 85 of 1993 — what happened, who was affected, who investigated, and
          what is being done about it.
        </p>
      </header>

      <Panel tone="warn" className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
            Record what happened now — every field can be filled in afterwards.
          </span>
          <div className="flex gap-2">
            <Btn variant="primary" onClick={() => startReport(false)}>
              Report incident
            </Btn>
            <Btn onClick={() => startReport(true)}>Report near miss</Btn>
          </div>
        </div>
      </Panel>

      {reports.length === 0 ? (
        <Empty>
          <b>Nothing reported.</b>
          <span>Use the buttons above the moment something happens or is nearly missed.</span>
        </Empty>
      ) : null}

      {reports.map((r) => {
        const isOpen = openId === r.id;
        const gaps = missingFields(r);
        const unbacked = unbackedSignatures(r);
        return (
          <div key={r.id} data-record-id={r.id} className="mb-3">
            <Panel tone={r.isNearMiss ? undefined : "warn"}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : r.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">{r.id}</span>
                    <Pill tone={r.isNearMiss ? undefined : "warn"}>
                      {r.isNearMiss ? "NEAR MISS" : "INCIDENT"}
                    </Pill>
                  </div>
                  <p className="mt-1 text-[13px]">
                    {r.isNearMiss ? r.exposure.trim() || "No detail yet" : r.affectedPersonName.trim() || "No name recorded"}
                    {r.location.trim() ? ` — ${r.location.trim()}` : ""}
                  </p>
                  <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {r.date} {r.time}
                    {gaps.length ? ` · ${gaps.length} FIELD${gaps.length > 1 ? "S" : ""} MISSING` : " · COMPLETE"}
                  </div>
                </div>
              </button>

              {isOpen ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  <div className="mb-3 flex flex-wrap gap-[6px]">
                    <Chip selected={!r.isNearMiss} onClick={() => patch(r.id, { isNearMiss: false })}>
                      Incident
                    </Chip>
                    <Chip selected={r.isNearMiss} onClick={() => patch(r.id, { isNearMiss: true })}>
                      Near miss
                    </Chip>
                  </div>

                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Field label="DATE">
                      <input
                        type="date"
                        value={r.date}
                        onChange={(e) => patch(r.id, { date: e.target.value })}
                        aria-label={`Date of ${r.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="TIME">
                      <input
                        type="time"
                        value={r.time}
                        onChange={(e) => patch(r.id, { time: e.target.value })}
                        aria-label={`Time of ${r.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="LOCATION">
                      <input
                        value={r.location}
                        onChange={(e) => patch(r.id, { location: e.target.value })}
                        aria-label={`Location of ${r.id}`}
                        placeholder="MV switchroom, Pier B"
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                  </div>

                  {!r.isNearMiss ? (
                    <>
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Field label="AFFECTED PERSON">
                          <input
                            value={r.affectedPersonName}
                            onChange={(e) => patch(r.id, { affectedPersonName: e.target.value })}
                            aria-label={`Affected person for ${r.id}`}
                            className={inputCls}
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="ID NUMBER">
                          <input
                            value={r.affectedPersonIdNumber}
                            onChange={(e) => patch(r.id, { affectedPersonIdNumber: e.target.value })}
                            aria-label={`ID number for ${r.id}`}
                            className={inputCls}
                            style={inputStyle}
                          />
                        </Field>
                      </div>

                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Field label="PART OF BODY AFFECTED">
                          <select
                            value={r.bodyPartAffected ?? ""}
                            onChange={(e) =>
                              patch(r.id, { bodyPartAffected: (e.target.value || null) as IncidentReport["bodyPartAffected"] })
                            }
                            aria-label={`Part of body affected for ${r.id}`}
                            className={inputCls}
                            style={inputStyle}
                          >
                            <option value="">Not recorded</option>
                            {BODY_PARTS.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="EFFECT">
                          <select
                            value={r.effect ?? ""}
                            onChange={(e) =>
                              patch(r.id, { effect: (e.target.value || null) as IncidentReport["effect"] })
                            }
                            aria-label={`Effect for ${r.id}`}
                            className={inputCls}
                            style={inputStyle}
                          >
                            <option value="">Not recorded</option>
                            {EFFECTS.map((eff) => (
                              <option key={eff} value={eff}>
                                {eff}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </>
                  ) : null}

                  <Field label="MACHINE / PROCESS / EXPOSURE">
                    <textarea
                      value={r.exposure}
                      onChange={(e) => patch(r.id, { exposure: e.target.value })}
                      rows={2}
                      aria-label={`Exposure for ${r.id}`}
                      placeholder="What machine, process or condition was involved"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>

                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="COMPENSATION COMMISSIONER NOTIFIED">
                      <div className="flex flex-wrap gap-[6px]">
                        <Btn
                          variant={r.reportedToCompensationCommissioner ? "primary" : "default"}
                          onClick={() => patch(r.id, { reportedToCompensationCommissioner: true })}
                        >
                          Yes
                        </Btn>
                        <Btn
                          variant={!r.reportedToCompensationCommissioner ? "primary" : "default"}
                          onClick={() => patch(r.id, { reportedToCompensationCommissioner: false })}
                        >
                          No
                        </Btn>
                      </div>
                    </Field>
                    <Field label="DEPT OF LABOUR NOTIFIED">
                      <div className="flex flex-wrap gap-[6px]">
                        <Btn
                          variant={r.reportedToDoL ? "primary" : "default"}
                          onClick={() => patch(r.id, { reportedToDoL: true, doLNotifiedAt: r.doLNotifiedAt ?? Date.now() })}
                        >
                          Yes
                        </Btn>
                        <Btn
                          variant={!r.reportedToDoL ? "primary" : "default"}
                          onClick={() => patch(r.id, { reportedToDoL: false })}
                        >
                          No
                        </Btn>
                      </div>
                      {r.reportedToDoL ? (
                        <input
                          value={r.doLReference}
                          onChange={(e) => patch(r.id, { doLReference: e.target.value })}
                          aria-label={`Dept of Labour reference for ${r.id}`}
                          placeholder="Reference number"
                          className={`mt-2 ${inputCls}`}
                          style={inputStyle}
                        />
                      ) : null}
                    </Field>
                  </div>

                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Field label="INVESTIGATOR">
                      <input
                        value={r.investigatorName}
                        onChange={(e) => patch(r.id, { investigatorName: e.target.value })}
                        aria-label={`Investigator for ${r.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="DESIGNATION">
                      <input
                        value={r.investigatorDesignation}
                        onChange={(e) => patch(r.id, { investigatorDesignation: e.target.value })}
                        aria-label={`Investigator designation for ${r.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="INVESTIGATED ON">
                      <input
                        type="date"
                        value={r.investigationDate}
                        onChange={(e) => patch(r.id, { investigationDate: e.target.value })}
                        aria-label={`Investigation date for ${r.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                  </div>

                  <Field label="DESCRIPTION">
                    <textarea
                      value={r.description}
                      onChange={(e) => patch(r.id, { description: e.target.value })}
                      rows={3}
                      aria-label={`Description for ${r.id}`}
                      placeholder="What happened, in sequence"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="SUSPECTED CAUSE">
                    <textarea
                      value={r.suspectedCause}
                      onChange={(e) => patch(r.id, { suspectedCause: e.target.value })}
                      rows={2}
                      aria-label={`Suspected cause for ${r.id}`}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="RECOMMENDED STEPS">
                    <textarea
                      value={r.recommendedSteps}
                      onChange={(e) => patch(r.id, { recommendedSteps: e.target.value })}
                      rows={2}
                      aria-label={`Recommended steps for ${r.id}`}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="ACTION TAKEN" hint={`${r.actions.length} logged`}>
                    {r.actions.map((a) => (
                      <div
                        key={a.id}
                        className="mb-2 rounded-[9px] border p-2.5"
                        style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <textarea
                            value={a.action}
                            onChange={(e) =>
                              patch(r.id, {
                                actions: r.actions.map((x) =>
                                  x.id === a.id ? { ...x, action: e.target.value, updatedAt: Date.now() } : x
                                ),
                              })
                            }
                            rows={2}
                            aria-label="What must happen"
                            placeholder="What must happen"
                            className={inputCls}
                            style={inputStyle}
                          />
                          <Btn
                            onClick={() => patch(r.id, { actions: r.actions.filter((x) => x.id !== a.id) })}
                          >
                            <IconX />
                          </Btn>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <input
                            value={a.owner}
                            onChange={(e) =>
                              patch(r.id, {
                                actions: r.actions.map((x) =>
                                  x.id === a.id ? { ...x, owner: e.target.value, updatedAt: Date.now() } : x
                                ),
                              })
                            }
                            aria-label="Owner"
                            placeholder="Owner"
                            className={inputCls}
                            style={inputStyle}
                          />
                          <input
                            type="date"
                            value={a.dueDate}
                            onChange={(e) =>
                              patch(r.id, {
                                actions: r.actions.map((x) =>
                                  x.id === a.id ? { ...x, dueDate: e.target.value, updatedAt: Date.now() } : x
                                ),
                              })
                            }
                            aria-label="Due date"
                            className={inputCls}
                            style={inputStyle}
                          />
                          <select
                            value={a.status}
                            onChange={(e) =>
                              patch(r.id, {
                                actions: r.actions.map((x) =>
                                  x.id === a.id ? { ...x, status: e.target.value as ActionStatus, updatedAt: Date.now() } : x
                                ),
                              })
                            }
                            aria-label="Status"
                            className={inputCls}
                            style={inputStyle}
                          >
                            {STATUSES.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                    <Btn onClick={() => addAction(r)}>+ Add action</Btn>
                  </Field>

                  <Field label="HEALTH AND SAFETY COMMITTEE REMARKS" hint="optional">
                    <textarea
                      value={r.hsCommitteeRemarks}
                      onChange={(e) => patch(r.id, { hsCommitteeRemarks: e.target.value })}
                      rows={2}
                      aria-label={`HS committee remarks for ${r.id}`}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="PHOTOGRAPHS">
                    <div className="flex justify-end gap-2">
                      <PhotoButton compact onCaptured={(m) => addPhoto(r.id, { ...m, createdBy: auditor })} />
                      <VoiceNoteButton compact onCaptured={(m) => addPhoto(r.id, { ...m, createdBy: auditor })} />
                    </div>
                    {r.attachments.length > 0 ? (
                      <div className="mt-2">
                        <AttachmentStrip
                          attachments={r.attachments}
                          thumbSize={40}
                          onRemove={(aid) => removePhoto(r.id, aid)}
                          onUpdate={(aid, p) => updatePhoto(r.id, aid, p)}
                        />
                      </div>
                    ) : null}
                  </Field>

                  <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="COMPLETED BY">
                      <input
                        value={r.completedBy}
                        onChange={(e) => patch(r.id, { completedBy: e.target.value })}
                        aria-label={`Completed by for ${r.id}`}
                        className={`mb-2 ${inputCls}`}
                        style={inputStyle}
                      />
                      {signing === `${r.id}_COMPLETED` ? (
                        <SignaturePad
                          name={r.completedBy || auditor}
                          onCancel={() => setSigning(null)}
                          onSigned={(s) => {
                            signCompleted(r.id, s);
                            setSigning(null);
                          }}
                        />
                      ) : r.completedSignature ? (
                        <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                          {r.completedSignature.ref} · SIGNED {clock(r.completedSignature.signedAt)} AS{" "}
                          {r.completedSignature.signedName.toUpperCase() || "—"}
                          <Btn className="ml-2" onClick={() => setSigning(`${r.id}_COMPLETED`)}>
                            Sign again
                          </Btn>
                        </div>
                      ) : (
                        <Btn onClick={() => setSigning(`${r.id}_COMPLETED`)}>Sign</Btn>
                      )}
                    </Field>

                    <Field label="COMPETENT PERSON">
                      <input
                        value={r.competentPersonName}
                        onChange={(e) => patch(r.id, { competentPersonName: e.target.value })}
                        aria-label={`Competent person for ${r.id}`}
                        className={`mb-2 ${inputCls}`}
                        style={inputStyle}
                      />
                      {signing === `${r.id}_COMPETENT` ? (
                        <SignaturePad
                          name={r.competentPersonName}
                          onCancel={() => setSigning(null)}
                          onSigned={(s) => {
                            signCompetent(r.id, s);
                            setSigning(null);
                          }}
                        />
                      ) : r.competentPersonSignature ? (
                        <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                          {r.competentPersonSignature.ref} · SIGNED {clock(r.competentPersonSignature.signedAt)} AS{" "}
                          {r.competentPersonSignature.signedName.toUpperCase() || "—"}
                          <Btn className="ml-2" onClick={() => setSigning(`${r.id}_COMPETENT`)}>
                            Sign again
                          </Btn>
                        </div>
                      ) : (
                        <Btn onClick={() => setSigning(`${r.id}_COMPETENT`)}>Sign</Btn>
                      )}
                    </Field>
                  </div>
                  {unbacked.length ? (
                    <p className="mb-2 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                      {unbacked.length} SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS DEVICE ONLY. COPY
                      THIS REPORT OUT BEFORE THE TABLET LEAVES SITE.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    <Btn onClick={() => void copyReport(r)}>
                      {copied === r.id ? "Copied" : <><IconCheck /> Copy this report</>}
                    </Btn>
                    <Btn onClick={() => { remove(r.id); setOpenId(null); }}>
                      <IconX /> Delete this report
                    </Btn>
                  </div>
                  {gaps.length ? (
                    <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                      STILL OWED: {gaps.join(", ").toUpperCase()}
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
