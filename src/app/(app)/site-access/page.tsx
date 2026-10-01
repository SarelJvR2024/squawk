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
import ContactPicker from "@/components/ContactPicker";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconX } from "@/components/ui/icons";

const inputCls = "min-h-[44px] w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;
const SIDES: SiteAccessSide[] = ["ACSA", "TPJV", "Other"];

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
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
  const [draftArea, setDraftArea] = useState("");
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

  return (
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
        const isOpen = openId === l.id;
        const gaps = logGaps(l);
        const unbacked = unbackedSignatures(l);
        return (
          <div key={l.id} className="mb-3">
            <Panel>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : l.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[10px]">
                    {l.date} · {hhmm(l.openedAt)}
                  </span>
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

              {isOpen ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
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

                  <Field label="WHO WENT IN" hint={`${l.people.length} recorded`}>
                    <ContactPicker
                      entityCode={entityCode}
                      onAdd={(p) => addVisitor(l.id, p.name, { contactId: p.contactId, organisation: p.organisation ?? "" })}
                    />
                  </Field>

                  {l.people.map((v) => (
                    <div
                      key={v.id}
                      className="mb-3 rounded-[9px] border p-2.5"
                      style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        {isSigned(v) ? (
                          <Pill tone="accent">SIGNED {v.signature?.ref}</Pill>
                        ) : (
                          <Pill tone="warn">NOT SIGNED</Pill>
                        )}
                        <Btn onClick={() => removeVisitor(l.id, v.id)}>
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

                      <div className="mb-2 flex flex-wrap gap-[6px]">
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

                      {signing === v.id ? (
                        <SignaturePad
                          name={v.name}
                          onCancel={() => setSigning(null)}
                          onSigned={(s) => {
                            sign(l.id, v.id, s);
                            setSigning(null);
                          }}
                        />
                      ) : v.signature ? (
                        <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                          {v.signature.ref} · SIGNED {hhmm(v.signature.signedAt)} AS{" "}
                          {v.signature.signedName.toUpperCase() || "—"}
                          <Btn className="ml-2" onClick={() => setSigning(v.id)}>
                            Sign again
                          </Btn>
                        </div>
                      ) : (
                        <Btn variant="primary" onClick={() => setSigning(v.id)}>
                          Sign
                        </Btn>
                      )}
                    </div>
                  ))}
                  {l.people.length === 0 ? (
                    <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      Nobody recorded yet. Use the box above.
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    <Btn onClick={() => void copyLog(l)}>{copied === l.id ? "Copied" : "Copy this log"}</Btn>
                    <Btn onClick={() => { removeLog(l.id); setOpenId(null); }}>
                      <IconX /> Delete this log
                    </Btn>
                  </div>
                  {unbacked.length ? (
                    <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
                      {unbacked.length} SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS DEVICE ONLY. THE
                      RECORD COPY IS NOT WIRED YET — COPY THIS LOG OUT BEFORE THE TABLET LEAVES SITE.
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
