"use client";

/** THE DOCUMENT AND EVIDENCE COLLECTION LOG — TK-003 form 7, on the tablet.
 *
 *  It looks like audit capture and it is not, and that mistake is exactly why
 *  this form was missed off the first inferred list of what the tablet should
 *  replace. It tracks ACSA'S OWN DOCUMENTS, handed over on site: a
 *  chain-of-custody record, not an observation. What a document proves is
 *  decided on the check-point it bears on, by an auditor with it in front of
 *  them. What this answers is narrower and nobody else answers it — what did
 *  they give us, who handed it over, is it a copy or their only original, and
 *  have we given it back.
 *
 *  180 of the 324 check-points are `confirmedBy: "Document"`, so this is the
 *  register behind more than half the audit.
 *
 *  Four things shape the screen.
 *
 *  OUTSTANDING FIRST. The register is ordered by what is still owed, not by
 *  when things were logged. Four documents nobody has sent, buried under thirty
 *  that arrived, is a request that goes unchased for a month.
 *
 *  REQUESTED IS A STATE. A log of what arrived cannot say what is missing, and
 *  what is missing is the only question anybody asks this between site visits.
 *
 *  AN ORIGINAL IS AN OBLIGATION. ACSA's only copy in a TPJV bag has a clock on
 *  it. The register keeps those in their own section until they go back.
 *
 *  AND IT ANSWERS THE OTHER RECORD. A check marked "compliant, evidence
 *  pending" is a debt somebody recorded at a desk. If nothing here names that
 *  check, nobody is chasing it — so the screen says how many, by name. */

import { useMemo, useState } from "react";
import {
  checksAt,
  useEntityCode,
  useEvidenceItems,
  useResponses,
  useStore,
} from "@/lib/store";
import {
  MEDIUM_LABEL,
  RETURNABLE,
  evidenceStage,
  heldMs,
  heldOriginals,
  isHeldOriginal,
  itemGaps,
  logText,
  outstanding,
  pendingWithoutEntry,
  unbackedSignatures,
} from "@/lib/evidence";
import { portalIdFor, siteCodeFor, siteFor } from "@/lib/sites";
import { useNow } from "@/lib/clock";
import { AttachmentStrip, PhotoButton } from "@/components/Capture";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";
import type { EvidenceMedium, EvidenceStage } from "@/lib/types";

const MEDIA: EvidenceMedium[] = ["paper", "digital", "photographed", "portal", "verbal"];

const STAGE: Record<EvidenceStage, { label: string; tone: "accent" | "warn" | undefined }> = {
  requested: { label: "OUTSTANDING", tone: "warn" },
  received: { label: "RECEIVED", tone: "accent" },
  returned: { label: "RETURNED", tone: undefined },
  unavailable: { label: "NOT PRODUCED", tone: "warn" },
};

function days(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return "today";
  return d === 1 ? "1 day" : `${d} days`;
}

function dayOnly(t: number): string {
  return new Date(t).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const inputCls = "w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

export default function EvidencePage() {
  const items = useEvidenceItems();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const responses = useResponses();
  const add = useStore((s) => s.addEvidenceItem);
  const patch = useStore((s) => s.updateEvidenceItem);
  const remove = useStore((s) => s.removeEvidenceItem);
  const receive = useStore((s) => s.receiveEvidence);
  const sign = useStore((s) => s.signEvidence);
  const addPhoto = useStore((s) => s.addEvidenceAttachment);
  const removePhoto = useStore((s) => s.removeEvidenceAttachment);
  const updatePhoto = useStore((s) => s.updateEvidenceAttachment);

  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [handedBy, setHandedBy] = useState<Record<string, string>>({});

  const site = siteFor(entityCode);
  const now = useNow();

  /* The check-points an entry can be attached to, with the 180 this log exists
     for offered first. Not a separate list: a document often bears on a
     Practice or Asset check too, and hiding those would file it wrongly. */
  const { docs, rest } = useMemo(() => {
    const all = checksAt(entityCode);
    return {
      docs: all.filter((c) => c.confirmedBy === "Document"),
      rest: all.filter((c) => c.confirmedBy !== "Document"),
    };
  }, [entityCode]);

  /* THE BRIDGE. Checks somebody marked "compliant, evidence pending" — ACSA
     says they comply and the proof is still to come — that nothing in this log
     names. Nobody is chasing those, and nobody will notice until the report is
     being written. */
  const unchased = useMemo(() => {
    const pending = Object.entries(responses)
      .filter(([, r]) => r.evidencePending)
      .map(([id]) => id);
    return pendingWithoutEntry(pending, items);
  }, [responses, items]);

  const still = outstanding(items);
  const held = heldOriginals(items);

  function log() {
    const title = draft.trim();
    if (!title) return;
    const id = add(title);
    setDraft("");
    setOpenId(id);
  }

  async function copyLog() {
    const text = logText(items, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
      portalId: (id) => portalIdFor(entityCode, id),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this log", text);
    }
  }

  const unbacked = unbackedSignatures(items);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">
          Document and evidence collection log
        </h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          TK-003 form 7. What ACSA handed over, who handed it over, and what went back.
          It is custody, not an audit answer — 180 of the 324 check-points turn on a
          document.
        </p>
      </header>

      {/* LOG ONE. Pinned, one field. */}
      <Panel tone={still.length ? "warn" : undefined} className="mb-4">
        <Field label="WHAT DOCUMENT?" hint="the only field needed to log it">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="What document is being requested or handed over"
            placeholder="AGL daily serviceability inspection logs, Jan–Sep 2026"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {still.length
              ? `${still.length} STILL OUTSTANDING`
              : items.length
                ? "NOTHING OUTSTANDING"
                : "LOGGED AS REQUESTED — MARK IT RECEIVED WHEN IT ARRIVES"}
            {held.length ? ` · ${held.length} ACSA ORIGINAL${held.length > 1 ? "S" : ""} HELD` : ""}
          </span>
          <Btn variant="primary" onClick={log} disabled={!draft.trim()}>
            Log it
          </Btn>
        </div>
      </Panel>

      {/* THE BRIDGE TO THE CHECK SCREEN. */}
      {unchased.length ? (
        <Panel tone="warn" className="mb-4">
          <p className="text-[12px]">
            <b>{unchased.length}</b> check
            {unchased.length === 1 ? " is" : "s are"} marked <i>compliant, evidence
            pending</i> with nothing logged here. Nobody is chasing
            {unchased.length === 1 ? " it" : " them"}.
          </p>
          <p className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {unchased.slice(0, 12).map((id) => portalIdFor(entityCode, id)).join(", ")}
            {unchased.length > 12 ? ` … and ${unchased.length - 12} more` : ""}
          </p>
        </Panel>
      ) : null}

      {items.length === 0 ? (
        <Empty>
          <b>Nothing logged.</b>
          <span>
            This is not the audit. It is the record of what ACSA gave us and what we
            gave back — and of what we asked for and never got, which is the half a
            list of received documents cannot tell you.
          </span>
        </Empty>
      ) : (
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {items.length} ENTR{items.length === 1 ? "Y" : "IES"} — OUTSTANDING FIRST
          </span>
          <Btn onClick={() => void copyLog()}>{copied ? "Copied" : "Copy the log"}</Btn>
        </div>
      )}

      {unbacked.length ? (
        <p className="mb-3 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
          {unbacked.length} COLLECTOR SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS
          DEVICE ONLY. THE RECORD COPY IS NOT WIRED YET — COPY THE LOG OUT BEFORE THE
          TABLET LEAVES SITE.
        </p>
      ) : null}

      {items.map((e) => {
        const stage = evidenceStage(e);
        const isOpen = openId === e.id;
        const gaps = itemGaps(e);
        const heldFor = isHeldOriginal(e) ? heldMs(e, now) : null;
        return (
          <div key={e.id} className="mb-3">
            <Panel tone={STAGE[stage].tone}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : e.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px]">{e.id}</span>
                    <Pill tone={STAGE[stage].tone}>{STAGE[stage].label}</Pill>
                    {isHeldOriginal(e) ? <Pill tone="warn">ACSA ORIGINAL HELD</Pill> : null}
                  </div>
                  <p className="mt-1 text-[13px]">{e.title || "—"}</p>
                  <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {e.documentNo ? `${e.documentNo}${e.revision ? ` REV ${e.revision}` : ""} · ` : ""}
                    {e.checkIds.length
                      ? `${e.checkIds.length} CHECK-POINT${e.checkIds.length > 1 ? "S" : ""}`
                      : "NO CHECK-POINT LINKED"}
                    {heldFor !== null ? ` · HELD ${days(heldFor).toUpperCase()}` : ""}
                    {gaps.length ? ` · ${gaps.length} FIELD${gaps.length > 1 ? "S" : ""} MISSING` : ""}
                  </div>
                </div>
              </button>

              {isOpen ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  {/* WHAT IT IS. */}
                  <Field label="WHAT IT IS" hint="enough to ask for it again">
                    <input
                      value={e.title}
                      onChange={(ev) => patch(e.id, { title: ev.target.value })}
                      aria-label={`Title of document ${e.id}`}
                      placeholder="Document title"
                      className={`mb-2 ${inputCls}`}
                      style={inputStyle}
                    />
                    <div className="mb-2 flex flex-wrap gap-2">
                      <input
                        value={e.documentNo}
                        onChange={(ev) => patch(e.id, { documentNo: ev.target.value })}
                        aria-label={`Document number for ${e.id}`}
                        placeholder="Document no."
                        className={`${inputCls} flex-1 min-w-[150px]`}
                        style={inputStyle}
                      />
                      <input
                        value={e.revision}
                        onChange={(ev) => patch(e.id, { revision: ev.target.value })}
                        aria-label={`Revision of ${e.id}`}
                        placeholder="Rev."
                        className={`${inputCls} w-[100px]`}
                        style={inputStyle}
                      />
                    </div>
                    <label className="block font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                      DATE ON THE DOCUMENT
                      <input
                        type="date"
                        value={
                          e.documentDate
                            ? new Date(e.documentDate).toLocaleDateString("en-CA")
                            : ""
                        }
                        onChange={(ev) =>
                          patch(e.id, {
                            /* Local midday, not UTC midnight — which lands on
                               the previous day everywhere east of Greenwich. */
                            documentDate: ev.target.value
                              ? new Date(`${ev.target.value}T12:00:00`).getTime()
                              : null,
                          })
                        }
                        aria-label={`Date on document ${e.id}`}
                        className={`mt-1 ${inputCls}`}
                        style={inputStyle}
                      />
                    </label>
                  </Field>

                  {/* WHO WE ASKED. */}
                  {!e.receivedAt ? (
                    <Field label="WHO IT WAS ASKED OF">
                      <input
                        value={e.requestedFrom}
                        onChange={(ev) => patch(e.id, { requestedFrom: ev.target.value })}
                        aria-label={`Who ${e.id} was requested from`}
                        placeholder="Name and role"
                        className={`mb-2 ${inputCls}`}
                        style={inputStyle}
                      />
                      {e.requestedAt ? (
                        <p className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                          REQUESTED {dayOnly(e.requestedAt).toUpperCase()}
                          <Btn
                            className="ml-2"
                            onClick={() => patch(e.id, { requestedAt: null })}
                          >
                            Not requested — they offered it
                          </Btn>
                        </p>
                      ) : (
                        <Btn onClick={() => patch(e.id, { requestedAt: Date.now() })}>
                          Mark as requested today
                        </Btn>
                      )}
                    </Field>
                  ) : null}

                  {/* RECEIPT. */}
                  {!e.receivedAt ? (
                    <Field label="HAND-OVER" hint="when it actually arrives">
                      <input
                        value={handedBy[e.id] ?? ""}
                        onChange={(ev) =>
                          setHandedBy((h) => ({ ...h, [e.id]: ev.target.value }))
                        }
                        aria-label={`Who handed over ${e.id}`}
                        placeholder="Who handed it over — a person, not a department"
                        className={`mb-2 ${inputCls}`}
                        style={inputStyle}
                      />
                      <div className="flex flex-wrap gap-2">
                        {MEDIA.map((m) => (
                          <Btn
                            key={m}
                            onClick={() => receive(e.id, (handedBy[e.id] ?? "").trim(), m)}
                          >
                            {MEDIUM_LABEL[m]}
                          </Btn>
                        ))}
                      </div>
                    </Field>
                  ) : (
                    <Field label="RECEIVED">
                      <p className="text-[12px]">
                        {e.receivedFrom || "—"} ·{" "}
                        {e.medium ? MEDIUM_LABEL[e.medium] : "—"} ·{" "}
                        {dayOnly(e.receivedAt)}
                        {e.receivedBy ? ` · collected by ${e.receivedBy}` : ""}
                      </p>
                      <input
                        value={e.receivedFrom}
                        onChange={(ev) => patch(e.id, { receivedFrom: ev.target.value })}
                        aria-label={`Who handed over ${e.id}`}
                        placeholder="Who handed it over"
                        className={`mt-2 ${inputCls}`}
                        style={inputStyle}
                      />
                    </Field>
                  )}

                  {/* CUSTODY. Only where something actually changed hands. */}
                  {e.medium && RETURNABLE.includes(e.medium) ? (
                    <Field label="CUSTODY" hint="ACSA's only copy, or ours to keep">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Btn
                          variant={e.isOriginal ? "primary" : "default"}
                          onClick={() => patch(e.id, { isOriginal: !e.isOriginal })}
                        >
                          ACSA&rsquo;s original
                        </Btn>
                        {e.isOriginal && !e.returnedAt ? (
                          <Btn
                            onClick={() =>
                              patch(e.id, {
                                returnedAt: Date.now(),
                                returnedTo: e.receivedFrom,
                              })
                            }
                          >
                            <IconCheck /> Returned
                          </Btn>
                        ) : null}
                      </div>
                      {e.returnedAt ? (
                        <p className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                          RETURNED {dayOnly(e.returnedAt).toUpperCase()}
                          {e.returnedTo ? ` TO ${e.returnedTo.toUpperCase()}` : ""}
                          <Btn
                            className="ml-2"
                            onClick={() => patch(e.id, { returnedAt: null, returnedTo: "" })}
                          >
                            <IconX /> Undo
                          </Btn>
                        </p>
                      ) : null}
                    </Field>
                  ) : null}

                  {/* NOT PRODUCED. */}
                  {!e.receivedAt ? (
                    <Field
                      label="CANNOT BE PRODUCED"
                      hint={e.unavailableAt ? `RECORDED ${dayOnly(e.unavailableAt)}` : "if ACSA says so"}
                    >
                      <input
                        value={e.unavailableReason}
                        onChange={(ev) => patch(e.id, { unavailableReason: ev.target.value })}
                        aria-label={`Why ${e.id} cannot be produced`}
                        placeholder="What they said — no such record, lost in the 2024 move…"
                        className={`mb-2 ${inputCls}`}
                        style={inputStyle}
                      />
                      {!e.unavailableAt ? (
                        <Btn
                          onClick={() => patch(e.id, { unavailableAt: Date.now() })}
                          disabled={!e.unavailableReason.trim()}
                        >
                          Record that it cannot be produced
                        </Btn>
                      ) : (
                        <Btn onClick={() => patch(e.id, { unavailableAt: null })}>
                          <IconX /> Withdraw that
                        </Btn>
                      )}
                    </Field>
                  ) : null}

                  {/* CHECK-POINTS. */}
                  <Field label="BEARS ON — DOES NOT SETTLE — THESE CHECK-POINTS">
                    {e.checkIds.length ? (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {e.checkIds.map((cid) => (
                          <button
                            key={cid}
                            type="button"
                            onClick={() =>
                              patch(e.id, { checkIds: e.checkIds.filter((x) => x !== cid) })
                            }
                            className="rounded-[6px] border px-2 py-1 font-mono text-[9px]"
                            style={{ background: "var(--bg)", borderColor: "var(--line)" }}
                            aria-label={`Remove ${portalIdFor(entityCode, cid)}`}
                          >
                            {portalIdFor(entityCode, cid)} ×
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <select
                      value=""
                      onChange={(ev) => {
                        const cid = ev.target.value;
                        if (!cid || e.checkIds.includes(cid)) return;
                        patch(e.id, { checkIds: [...e.checkIds, cid] });
                      }}
                      aria-label={`Link a check-point to ${e.id}`}
                      className={inputCls}
                      style={inputStyle}
                    >
                      <option value="">Link a check-point…</option>
                      <optgroup label="Confirmed by a document — this log is their evidence trail">
                        {docs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {portalIdFor(entityCode, c.id)} — {c.requirement.slice(0, 70)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Every other check-point">
                        {rest.map((c) => (
                          <option key={c.id} value={c.id}>
                            {portalIdFor(entityCode, c.id)} — {c.requirement.slice(0, 70)}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </Field>

                  <Field label="NOTE">
                    <textarea
                      value={e.notes}
                      onChange={(ev) => patch(e.id, { notes: ev.target.value })}
                      rows={2}
                      aria-label={`Note on ${e.id}`}
                      placeholder="Anything a reader would need — pages missing, illegible, superseded"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="PHOTOGRAPHS OF THE DOCUMENT">
                    <div className="flex justify-end">
                      <PhotoButton
                        compact
                        onCaptured={(m) => addPhoto(e.id, { ...m, createdBy: auditor })}
                      />
                    </div>
                    {e.attachments.length > 0 ? (
                      <div className="mt-2">
                        <AttachmentStrip
                          attachments={e.attachments}
                          thumbSize={40}
                          onRemove={(aid) => removePhoto(e.id, aid)}
                          onUpdate={(aid, p) => updatePhoto(e.id, aid, p)}
                        />
                      </div>
                    ) : null}
                  </Field>

                  {/* THE COLLECTOR SIGNS — form 7's own requirement. */}
                  {e.receivedAt ? (
                    <Field label="COLLECTOR'S SIGNATURE" hint="TK-003 form 7 is signed by the collector">
                      {signing === e.id ? (
                        <SignaturePad
                          name={e.receivedBy}
                          onCancel={() => setSigning(null)}
                          onSigned={(s) => {
                            sign(e.id, s);
                            setSigning(null);
                          }}
                        />
                      ) : e.signature ? (
                        <p className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                          {e.signature.ref} · {e.signature.signedName.toUpperCase() || "—"}
                          <Btn className="ml-2" onClick={() => setSigning(e.id)}>
                            Sign again
                          </Btn>
                        </p>
                      ) : (
                        <Btn variant="primary" onClick={() => setSigning(e.id)}>
                          Sign
                        </Btn>
                      )}
                    </Field>
                  ) : null}

                  <div className="flex items-center justify-between gap-3">
                    {gaps.length ? (
                      <p className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        STILL MISSING: {gaps.join(", ").toUpperCase()}
                      </p>
                    ) : (
                      <span />
                    )}
                    <Btn onClick={() => remove(e.id)}>
                      <IconX /> Remove
                    </Btn>
                  </div>
                </div>
              ) : null}
            </Panel>
          </div>
        );
      })}
    </div>
  );
}
