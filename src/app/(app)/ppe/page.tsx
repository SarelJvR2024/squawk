"use client";

/** PPE CHECKS, ON THE TABLET.
 *
 *  Sarel, on what the previous four forms got wrong: a name typed from
 *  scratch for every person, every time, and nine stacked fields with nothing
 *  telling you where one person's row ends and the next begins. This screen
 *  and its three siblings (/site-access, the redesigned /attendance and
 *  /interviews) are built around the fix — pick a known person instead of
 *  retyping them, and group what is actually being asked into sections a
 *  thumb can skim.
 *
 *  ONE RECORD PER OCCASION, NOT PER DAY. A gate check at 07:00 and a spot
 *  check in a different area at 14:00 are two different things to be able to
 *  find later, so "Start a check" always opens a new one — unlike Attendance
 *  and Interviews, there is nothing here that opens-or-returns.
 *
 *  THREE ITEMS, EACH ITS OWN TICK. Hi-vis jacket, safety shoes, and hearing
 *  protection — tap a status pill to cycle compliant → missing → N/A. Hearing
 *  protection defaults to N/A on a check NOT flagged as a noise zone, because
 *  asking for a tick on PPE that genuinely does not apply here is how a
 *  checklist stops being trusted. */

import { useState } from "react";
import { useEntityCode, usePpeChecks, useStore } from "@/lib/store";
import type { PpeCheck, PpeItemKey, PpeStatus } from "@/lib/types";
import { PPE_ITEMS, PPE_ITEM_LABEL, checkGaps, checkText, isSigned, missingItems, unbackedSignatures } from "@/lib/ppe";
import { siteCodeFor, siteFor } from "@/lib/sites";
import ContactPicker from "@/components/ContactPicker";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconX } from "@/components/ui/icons";

const inputCls = "min-h-[44px] w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const STATUS_TONE: Record<PpeStatus, "accent" | "warn" | undefined> = {
  compliant: "accent",
  missing: "warn",
  notApplicable: undefined,
};
const STATUS_LABEL: Record<PpeStatus, string> = {
  compliant: "OK",
  missing: "MISSING",
  notApplicable: "N/A",
};
const NEXT_STATUS: Record<PpeStatus, PpeStatus> = {
  compliant: "missing",
  missing: "notApplicable",
  notApplicable: "compliant",
};

export default function PpePage() {
  const checks = usePpeChecks();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const open = useStore((s) => s.openPpeCheck);
  const patchCheck = useStore((s) => s.updatePpeCheck);
  const removeCheck = useStore((s) => s.removePpeCheck);
  const addPerson = useStore((s) => s.addPpePerson);
  const patchPerson = useStore((s) => s.updatePpePerson);
  const removePerson = useStore((s) => s.removePpePerson);
  const sign = useStore((s) => s.signPpePerson);

  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [draftLocation, setDraftLocation] = useState("");
  const [draftPurpose, setDraftPurpose] = useState("");
  const [draftNoiseZone, setDraftNoiseZone] = useState(false);

  const site = siteFor(entityCode);

  function startCheck() {
    const id = open({ location: draftLocation.trim(), purpose: draftPurpose.trim(), noiseZone: draftNoiseZone });
    setOpenId(id);
    setDraftLocation("");
    setDraftPurpose("");
    setDraftNoiseZone(false);
  }

  async function copyCheck(c: PpeCheck) {
    const text = checkText(c, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(c.id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this PPE check", text);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">PPE checks</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Who was checked, where, and what they had on — hi-vis, safety footwear, and hearing
          protection where the area calls for it. Each check is its own record: a gate check this
          morning and a spot check somewhere else this afternoon are two different things to find
          again later.
        </p>
      </header>

      <Panel tone="accent" className="mb-4">
        <Field label="WHERE IS THIS CHECK?" hint="optional, but makes the check easy to find later">
          <input
            value={draftLocation}
            onChange={(e) => setDraftLocation(e.target.value)}
            aria-label="Location of this PPE check"
            placeholder="Gate, apron Stand 14, MV switchroom…"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="WHY" hint="optional — e.g. arrival gate check, spot check">
          <input
            value={draftPurpose}
            onChange={(e) => setDraftPurpose(e.target.value)}
            aria-label="Purpose of this PPE check"
            placeholder="Arrival gate check"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <div className="mb-3 flex items-center justify-between gap-3">
          <Btn
            variant={draftNoiseZone ? "primary" : "default"}
            onClick={() => setDraftNoiseZone((v) => !v)}
          >
            {draftNoiseZone ? "✓ " : ""}Noise zone — hearing protection required
          </Btn>
        </div>
        <div className="flex justify-end">
          <Btn variant="primary" onClick={startCheck}>
            Start a check
          </Btn>
        </div>
      </Panel>

      {checks.length === 0 ? (
        <Empty>
          <b>No PPE checks recorded.</b>
          <span>Start one above — the time is stamped the moment you do.</span>
        </Empty>
      ) : null}

      {checks.map((c) => {
        const isOpen = openId === c.id;
        const gaps = checkGaps(c);
        const unbacked = unbackedSignatures(c);
        return (
          <div key={c.id} className="mb-3">
            <Panel>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : c.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">
                      {c.date} · {hhmm(c.openedAt)}
                    </span>
                    {c.noiseZone ? <Pill tone="warn">NOISE ZONE</Pill> : null}
                  </div>
                  <p className="mt-1 text-[13px]">
                    {c.location.trim() || "No location recorded"}
                    {c.purpose.trim() ? ` — ${c.purpose.trim()}` : ""}
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {c.people.length === 0
                      ? "Nobody recorded"
                      : c.people.map((e) => e.name || "—").join(", ")}
                  </p>
                  <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {c.id}
                    {c.openedBy ? ` · OPENED BY ${c.openedBy.toUpperCase()}` : ""}
                    {gaps.length ? ` · ${gaps.join(", ").toUpperCase()}` : " · COMPLETE"}
                  </div>
                </div>
              </button>

              {isOpen ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="LOCATION">
                      <input
                        value={c.location}
                        onChange={(e) => patchCheck(c.id, { location: e.target.value })}
                        aria-label={`Location for PPE check ${c.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="PURPOSE">
                      <input
                        value={c.purpose}
                        onChange={(e) => patchCheck(c.id, { purpose: e.target.value })}
                        aria-label={`Purpose for PPE check ${c.id}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
                  </div>
                  <div className="mb-3 flex items-center gap-2">
                    <Btn
                      variant={c.noiseZone ? "primary" : "default"}
                      onClick={() => patchCheck(c.id, { noiseZone: !c.noiseZone })}
                    >
                      {c.noiseZone ? "✓ " : ""}Noise zone
                    </Btn>
                  </div>

                  <Field label="ADD A PERSON" hint={`${c.people.length} checked`}>
                    <ContactPicker
                      entityCode={entityCode}
                      onAdd={(p) => addPerson(c.id, p.name, { contactId: p.contactId, organisation: p.organisation ?? "", role: p.role ?? "" })}
                    />
                  </Field>

                  {c.people.map((e) => {
                    const missing = missingItems(e);
                    return (
                      <div
                        key={e.id}
                        className="mb-3 rounded-[9px] border p-2.5"
                        style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {isSigned(e) ? (
                              <Pill tone="accent">SIGNED {e.signature?.ref}</Pill>
                            ) : (
                              <Pill tone="warn">NOT SIGNED</Pill>
                            )}
                            {missing.length ? <Pill tone="warn">{missing.length} MISSING</Pill> : null}
                          </div>
                          <Btn onClick={() => removePerson(c.id, e.id)}>
                            <IconX /> Remove
                          </Btn>
                        </div>

                        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <input
                            value={e.name}
                            onChange={(ev) => patchPerson(c.id, e.id, { name: ev.target.value })}
                            aria-label={`Name of person ${e.id}`}
                            placeholder="Full name"
                            className={inputCls}
                            style={inputStyle}
                          />
                          <input
                            value={e.organisation}
                            onChange={(ev) => patchPerson(c.id, e.id, { organisation: ev.target.value })}
                            aria-label={`Employer of person ${e.id}`}
                            placeholder="Employer"
                            className={inputCls}
                            style={inputStyle}
                          />
                          <input
                            value={e.role}
                            onChange={(ev) => patchPerson(c.id, e.id, { role: ev.target.value })}
                            aria-label={`Role of person ${e.id}`}
                            placeholder="Role"
                            className={inputCls}
                            style={inputStyle}
                          />
                        </div>

                        <div className="mb-2 flex flex-wrap gap-[6px]">
                          {PPE_ITEMS.map((k: PpeItemKey) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() =>
                                patchPerson(c.id, e.id, {
                                  items: { ...e.items, [k]: NEXT_STATUS[e.items[k]] },
                                })
                              }
                              className="flex min-h-[44px] items-center gap-[6px] rounded-full border px-[12px] text-[11px] font-semibold"
                              style={{
                                background:
                                  STATUS_TONE[e.items[k]] === "accent"
                                    ? "var(--acc-soft)"
                                    : STATUS_TONE[e.items[k]] === "warn"
                                      ? "var(--warn-bg)"
                                      : "var(--panel)",
                                borderColor:
                                  STATUS_TONE[e.items[k]] === "accent"
                                    ? "var(--acc-line)"
                                    : STATUS_TONE[e.items[k]] === "warn"
                                      ? "var(--warn-line)"
                                      : "var(--line-2)",
                                color:
                                  STATUS_TONE[e.items[k]] === "accent"
                                    ? "var(--acc)"
                                    : STATUS_TONE[e.items[k]] === "warn"
                                      ? "var(--warn)"
                                      : "var(--ink-3)",
                              }}
                            >
                              {PPE_ITEM_LABEL[k]} — {STATUS_LABEL[e.items[k]]}
                            </button>
                          ))}
                        </div>

                        <textarea
                          value={e.notes}
                          onChange={(ev) => patchPerson(c.id, e.id, { notes: ev.target.value })}
                          rows={2}
                          aria-label={`Notes for person ${e.id}`}
                          placeholder="Notes — anything worth recording"
                          className={`mb-2 ${inputCls}`}
                          style={inputStyle}
                        />

                        {signing === e.id ? (
                          <SignaturePad
                            name={e.name}
                            onCancel={() => setSigning(null)}
                            onSigned={(s) => {
                              sign(c.id, e.id, s);
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
                      </div>
                    );
                  })}
                  {c.people.length === 0 ? (
                    <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      Nobody checked yet. Use the box above.
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    <Btn onClick={() => void copyCheck(c)}>{copied === c.id ? "Copied" : "Copy this check"}</Btn>
                    <Btn onClick={() => { removeCheck(c.id); setOpenId(null); }}>
                      <IconX /> Delete this check
                    </Btn>
                  </div>
                  {unbacked.length ? (
                    <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                      {unbacked.length} SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS DEVICE ONLY. THE
                      RECORD COPY IS NOT WIRED YET — COPY THIS CHECK OUT BEFORE THE TABLET LEAVES SITE.
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
