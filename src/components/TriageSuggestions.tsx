"use client";

/** BULK "CLEAN UP WORDING" — now a full triage of each selected finding.
 *
 *  Sarel, 28 Nov 2026: "the AI cleanup is not smart enough... improve how the
 *  AI is proposing cleanup... also let it do cleanup of root cause, impact,
 *  timeline, and linking it to audit checks if not linked."
 *
 *  Each finding goes to the `triage` task with its full context (airport,
 *  discipline, asset system, the linked check or a shortlist of candidate
 *  checks, the notes, voice transcripts, photo captions and, where the
 *  deployment sends them, the photographs). What comes back is a PROPOSAL, set
 *  out field by field so the reviewer can take the wording and refuse a root
 *  cause, or the other way round. Nothing is written until Accept. "Accept
 *  all" takes the wording and every suggestion the model was at least medium
 *  sure of; a low-confidence suggestion has to be applied by hand.
 *
 *  Basic tidy (no model, no network) stays as the offline fallback. */

import { useRef, useState } from "react";
import { assist, useAssistAvailable, useVisionOn, type AssistImage } from "@/lib/assist";
import { entity as entityOf } from "@/lib/programme";
import { fullPhotoBlob } from "@/lib/recordimage";
import { checkRefOf } from "@/lib/reportText";
import { buildTriageContext, parseTriage, patchFor, type TriageSuggestion } from "@/lib/triageSuggest";
import { basicTidy, wordDiff } from "@/lib/wordDiff";
import { Pill } from "@/components/ui/primitives";
import { IconSpark } from "@/components/ui/icons";
import type { Check, Finding, Response } from "@/lib/types";

interface Proposal {
  state: "loading" | "proposed" | "applied" | "error";
  suggestion?: TriageSuggestion;
  /** Basic tidy only: the offline text, no suggestions beyond wording. */
  basicText?: string;
  shortlist?: Check[];
  error?: string;
}

/** Up to three photographs of the finding, as blobs the model can read. The
 *  route drops them unless ASSIST_VISION is on, so this is only worth doing
 *  when the deployment says it will send them. */
async function photoImages(f: Finding, entityCode: string, visitId: string): Promise<AssistImage[]> {
  const out: AssistImage[] = [];
  for (const a of f.attachments.filter((x) => x.kind === "photo").slice(0, 3)) {
    try {
      out.push({ blob: await fullPhotoBlob(a, entityCode, visitId), label: `Photograph ${out.length + 1} of this finding` });
    } catch {
      if (a.thumbDataUrl) {
        try {
          out.push({ blob: await (await fetch(a.thumbDataUrl)).blob(), label: `Photograph ${out.length + 1} of this finding (small preview)` });
        } catch {
          /* leave it out; captions still go */
        }
      }
    }
  }
  return out;
}

const CONF_TONE = { high: "good", medium: "warn", low: "neutral" } as const;

export default function BulkTriageSuggest({
  findings,
  entityCode,
  visitId,
  checksById,
  allChecks,
  responses,
  onChangeOne,
}: {
  findings: Finding[];
  entityCode: string;
  visitId: string;
  checksById: Map<string, Check>;
  allChecks: Check[];
  responses: Record<string, Response>;
  onChangeOne: (id: string, patch: Partial<Finding>) => void;
}) {
  const aiOn = useAssistAvailable();
  const vision = useVisionOn();
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const eligible = findings.filter((f) => (f.description || f.title).trim());
  const pending = eligible.filter((f) => !proposals[f.id] || proposals[f.id].state === "error");
  const proposedList = eligible.filter((f) => proposals[f.id]?.state === "proposed");
  const appliedCount = Object.values(proposals).filter((p) => p.state === "applied").length;
  const failed = eligible.filter((f) => proposals[f.id]?.state === "error");
  const original = (f: Finding) => (f.description || f.title).trim();

  async function run(offline = false) {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    for (const f of eligible) {
      const cur = proposals[f.id]?.state;
      if (cur === "proposed" || cur === "applied") continue;
      if (offline) {
        setProposals((p) => ({ ...p, [f.id]: { state: "proposed", basicText: basicTidy(original(f)) } }));
        continue;
      }
      setProposals((p) => ({ ...p, [f.id]: { state: "loading" } }));
      try {
        const check = f.checkId ? checksById.get(f.checkId) : undefined;
        const resp = f.checkId ? responses[f.checkId] : undefined;
        const { context, shortlist } = buildTriageContext({
          airport: entityOf(entityCode).name,
          finding: f,
          check,
          allChecks: check ? undefined : allChecks,
          deskNote: f.originVisit === visitId ? resp?.observation : undefined,
          photoCaptions: f.attachments.filter((a) => a.kind === "photo" && a.caption?.trim()).map((a) => a.caption!.trim()),
          transcripts: f.attachments.filter((a) => a.kind === "voice" && a.transcript?.trim()).map((a) => a.transcript!.trim()),
        });
        const images = vision ? await photoImages(f, entityCode, visitId) : [];
        const raw = await assist("triage", context, images);
        const suggestion = parseTriage(raw, shortlist, original(f));
        setProposals((p) => ({ ...p, [f.id]: { state: "proposed", suggestion, shortlist } }));
      } catch (e) {
        setProposals((p) => ({
          ...p,
          [f.id]: { state: "error", error: e instanceof Error ? e.message : "The assistant is unavailable." },
        }));
      }
    }
    setRunning(false);
    runningRef.current = false;
  }

  function apply(f: Finding, patch: Partial<Finding>, done = true) {
    if (Object.keys(patch).length) onChangeOne(f.id, patch);
    if (done) setProposals((p) => ({ ...p, [f.id]: { ...p[f.id], state: "applied" } }));
  }

  function applyAll(f: Finding) {
    const prop = proposals[f.id];
    if (prop?.basicText !== undefined) {
      const text = (edits[f.id] ?? prop.basicText).trim();
      if (text) apply(f, { description: text });
      return;
    }
    if (!prop?.suggestion) return;
    const s = prop.suggestion;
    const edited = edits[f.id];
    const patch = patchFor(edited !== undefined ? { ...s, finding: { ...s.finding, text: edited, changed: true, kind: "observed" } } : s, f, { onlyConfident: true });
    const link = patch.checkId ? checksById.get(patch.checkId) ?? prop.shortlist?.find((c) => c.id === patch.checkId) : undefined;
    if (link && !f.system && link.discipline === f.discipline) patch.system = link.system;
    apply(f, patch);
  }

  function reject(id: string) {
    setProposals((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  }

  const reviewing = Object.keys(proposals).length > 0;
  const lbl = "mb-0.5 text-[9.5px] font-semibold uppercase tracking-wide";

  return (
    <div>
      <div className="mb-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
        AI cleanup — reads each finding with its airport, discipline, asset system, audit check and photos, and proposes the wording, root cause, impact, timeline and check link. Nothing changes until you accept it.
      </div>
      <div className="flex flex-wrap items-center gap-[6px]">
        {aiOn && (
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={running || eligible.length === 0 || pending.length === 0}
            className="flex items-center gap-[5px] rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold disabled:opacity-55"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            <IconSpark width={12} height={12} />
            {running ? "Reviewing…" : pending.length === 0 ? "All proposed" : `AI cleanup for ${pending.length}`}
          </button>
        )}
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={running || eligible.length === 0 || pending.length === 0}
          className="rounded-[8px] border px-[9px] py-[6px] text-[11px] font-semibold disabled:opacity-55"
          style={{ borderColor: "var(--line-2)", color: "var(--ink-2)", background: "var(--panel)" }}
          title="Spelling, capital letters, full stops and plain wording. Works without the AI and adds no facts."
        >
          Basic tidy{aiOn ? "" : ` for ${pending.length}`}
        </button>
        {proposedList.length > 0 && (
          <button
            type="button"
            onClick={() => proposedList.forEach(applyAll)}
            className="rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold"
            style={{ background: "var(--good)", color: "#fff" }}
            title="Applies the wording and every suggestion the assistant was at least medium sure of. Low-confidence suggestions stay for you to apply one by one."
          >
            Accept all {proposedList.length}
          </button>
        )}
        {appliedCount > 0 && <Pill tone="good">{appliedCount} applied</Pill>}
        {aiOn && !vision && (
          <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
            Photographs are not sent to the AI on this deployment, so it works from the photo captions.
          </span>
        )}
      </div>
      {!aiOn && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
          The AI assistant is not switched on for this deployment, so Basic tidy is offered instead.
        </div>
      )}
      {failed.length > 0 && (
        <div role="alert" className="mt-1.5 rounded-[8px] border px-2 py-1.5 text-[10.5px]" style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad)" }}>
          {proposals[failed[0].id]?.error} {failed.length > 1 ? `(${failed.length} findings affected.) ` : ""}
          <button type="button" onClick={() => void run(true)} className="font-semibold underline">
            Use Basic tidy for these instead
          </button>
        </div>
      )}

      {reviewing && (
        <div className="mt-2 flex flex-col gap-2">
          {eligible
            .filter((f) => proposals[f.id] && proposals[f.id].state !== "error")
            .map((f) => {
              const prop = proposals[f.id];
              const s = prop.suggestion;
              const check = f.checkId ? checksById.get(f.checkId) : undefined;
              const base = original(f);
              const suggested = edits[f.id] ?? s?.finding.text ?? prop.basicText ?? "";
              const parts = prop.state === "proposed" ? wordDiff(base, suggested) : [];
              const changes = parts.filter((x) => x.kind !== "same").length;
              const linkedCheck = s?.checkLink ? prop.shortlist?.find((c) => c.id === s.checkLink!.id) : undefined;
              return (
                <div key={f.id} className="rounded-[10px] border p-2.5 text-[11.5px]" style={{ borderColor: "var(--line-2)", background: "var(--panel)" }}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>{f.title || f.id}</span>
                    <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                      {f.discipline}{f.system ? ` · ${f.system}` : ""}
                    </span>
                    {check ? <Pill tone="neutral">Check {checkRefOf(check.id)}</Pill> : <Pill tone="warn">Not linked to a check</Pill>}
                    {prop.state === "proposed" && (
                      <Pill tone={changes === 0 ? "neutral" : "warn"}>{changes === 0 ? "Wording unchanged" : `${changes} wording change${changes === 1 ? "" : "s"}`}</Pill>
                    )}
                    {prop.basicText !== undefined && <Pill tone="neutral">Basic tidy</Pill>}
                  </div>
                  {check && (
                    <div className="mb-1.5 text-[10.5px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
                      <b>Audit check:</b> {check.question || check.requirement}
                    </div>
                  )}
                  {prop.state === "loading" && <div style={{ color: "var(--ink-4)" }}>Reading the finding, its check and photos…</div>}
                  {prop.state === "applied" && <div style={{ color: "var(--good)" }}>Applied.</div>}
                  {prop.state === "proposed" && (
                    <>
                      {s?.finding.kind === "restates-check" && (
                        <div className="mb-1.5 rounded-[6px] border px-2 py-1.5" style={{ borderColor: "var(--warn-line, var(--line-2))", background: "var(--warn-bg, var(--sunken))" }}>
                          This note restates the audit check. No condition was recorded, so the wording is left as it is.
                        </div>
                      )}
                      {s && s.finding.needsAuditor.length > 0 && (
                        <div className="mb-1.5">
                          <div className={lbl} style={{ color: "var(--ink-3)" }}>Needs the auditor</div>
                          <ul className="list-disc pl-4" style={{ color: "var(--ink-2)" }}>
                            {s.finding.needsAuditor.map((q, i) => <li key={i}>{q}</li>)}
                          </ul>
                        </div>
                      )}
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <div className={lbl} style={{ color: "var(--ink-3)" }}>Now (removed words struck through)</div>
                          <div className="whitespace-pre-wrap rounded-[6px] border px-2 py-1.5 leading-[1.5]" style={{ borderColor: "var(--line-2)" }}>
                            {parts.filter((x) => x.kind !== "add").map((x, i) =>
                              x.kind === "del" ? (
                                <span key={i} style={{ background: "var(--bad-bg)", color: "var(--bad)", textDecoration: "line-through" }}>{x.text}</span>
                              ) : (
                                <span key={i}>{x.text}</span>
                              )
                            )}
                          </div>
                        </div>
                        <div>
                          <div className={lbl} style={{ color: "var(--ink-3)" }}>Suggested (added words highlighted)</div>
                          <div className="whitespace-pre-wrap rounded-[6px] border px-2 py-1.5 leading-[1.5]" style={{ borderColor: "var(--acc)", background: "var(--acc-soft)" }}>
                            {parts.filter((x) => x.kind !== "del").map((x, i) =>
                              x.kind === "add" ? (
                                <span key={i} style={{ background: "var(--good-bg, #d9f2e3)", color: "var(--good)", fontWeight: 600 }}>{x.text}</span>
                              ) : (
                                <span key={i}>{x.text}</span>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                      {s?.finding.basis && <div className="mt-1 text-[10.5px]" style={{ color: "var(--ink-3)" }}>Based on: {s.finding.basis}</div>}
                      {s && (s.finding.extracted.cause || s.finding.extracted.recommendation) && (
                        <div className="mt-1 text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                          Moved out of the finding: {s.finding.extracted.cause && <>stated cause &ldquo;{s.finding.extracted.cause}&rdquo; </>}
                          {s.finding.extracted.recommendation && <>recommendation &ldquo;{s.finding.extracted.recommendation}&rdquo;</>}
                        </div>
                      )}

                      {s && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {/* ROOT CAUSE */}
                          <FieldRow
                            label="Root cause"
                            now={(f.rootCauseCategories ?? []).join(", ") || "not set"}
                            empty={s.rootCauses.length === 0 ? s.rootCauseQuestion || "Not enough in the notes to suggest one." : ""}
                            items={s.rootCauses.map((x) => ({ text: x.category, reason: x.reason, conf: x.confidence }))}
                            onApply={s.rootCauses.length ? () => apply(f, { rootCauseCategories: Array.from(new Set([...(f.rootCauseCategories ?? []), ...s.rootCauses.map((x) => x.category)])) }, false) : undefined}
                          />
                          {/* IMPACT */}
                          <FieldRow
                            label="Impact"
                            now={(f.impactAreas ?? []).join(", ") || "not set"}
                            empty={s.impactAreas.length === 0 ? "Not enough in the notes to suggest one." : ""}
                            items={s.impactAreas.map((x) => ({ text: x.area, reason: x.reason, conf: x.confidence }))}
                            onApply={s.impactAreas.length ? () => apply(f, { impactAreas: Array.from(new Set([...(f.impactAreas ?? []), ...s.impactAreas.map((x) => x.area)])) }, false) : undefined}
                          />
                          {/* TIMELINE */}
                          <FieldRow
                            label="Timeline"
                            now={f.timeline || "not set"}
                            empty={s.timeline ? "" : "Not enough in the notes to judge urgency."}
                            items={s.timeline ? [{ text: s.timeline.value, reason: s.timeline.reason, conf: s.timeline.confidence }] : []}
                            onApply={s.timeline ? () => apply(f, { timeline: s.timeline!.value }, false) : undefined}
                          />
                          {/* CHECK LINK */}
                          {!f.checkId && (
                            <FieldRow
                              label="Audit check"
                              now="not linked"
                              empty={s.checkLink ? "" : "No check on the shortlist fits this finding well enough to link."}
                              items={
                                s.checkLink && linkedCheck
                                  ? [{ text: `${checkRefOf(linkedCheck.id)} · ${(linkedCheck.question || linkedCheck.requirement).slice(0, 140)}`, reason: s.checkLink.reason, conf: s.checkLink.confidence }]
                                  : []
                              }
                              onApply={
                                s.checkLink && linkedCheck
                                  ? () => apply(f, { checkId: linkedCheck.id, ...(!f.system && linkedCheck.discipline === f.discipline ? { system: linkedCheck.system } : {}) }, false)
                                  : undefined
                              }
                            />
                          )}
                          {s.photoNotes && (
                            <div className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                              <b>Photographs show:</b> {s.photoNotes}
                            </div>
                          )}
                        </div>
                      )}

                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[10.5px]" style={{ color: "var(--ink-3)" }}>Edit the suggested wording before accepting</summary>
                        <textarea
                          value={suggested}
                          onChange={(e) => setEdits((c) => ({ ...c, [f.id]: e.target.value }))}
                          className="mt-1 min-h-[90px] w-full rounded-[6px] border p-2 text-[11.5px]"
                          style={{ borderColor: "var(--line-2)", background: "var(--panel)", color: "var(--ink)" }}
                        />
                      </details>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => applyAll(f)} className="rounded-[7px] px-3 py-1.5 text-[11px] font-semibold" style={{ background: "var(--good)", color: "#fff" }}>
                          Accept wording and confident suggestions
                        </button>
                        <button
                          type="button"
                          onClick={() => apply(f, { description: suggested.trim() })}
                          className="rounded-[7px] border px-3 py-1.5 text-[11px] font-semibold"
                          style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}
                          disabled={!suggested.trim() || s?.finding.kind === "restates-check"}
                        >
                          Wording only
                        </button>
                        <button type="button" onClick={() => reject(f.id)} className="rounded-[7px] border px-3 py-1.5 text-[11px] font-semibold" style={{ borderColor: "var(--bad-line)", color: "var(--bad)" }}>
                          Reject (keep as is)
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/** One suggestion line: what it is now, what is proposed with the reason and
 *  how sure the assistant was, and its own Apply. */
function FieldRow({
  label,
  now,
  items,
  empty,
  onApply,
}: {
  label: string;
  now: string;
  items: { text: string; reason: string; conf: "high" | "medium" | "low" }[];
  empty: string;
  onApply?: () => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className="grid items-start gap-x-2 gap-y-0.5 rounded-[6px] border px-2 py-1.5 md:grid-cols-[92px_1fr_auto]" style={{ borderColor: "var(--line-2)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>{label}</div>
      <div className="min-w-0">
        {items.length === 0 ? (
          <span style={{ color: "var(--ink-3)" }}>{empty}</span>
        ) : (
          items.map((it, i) => (
            <div key={i} className="mb-0.5 last:mb-0">
              <b>{it.text}</b>{" "}
              <Pill tone={CONF_TONE[it.conf]}>{it.conf}</Pill>
              {it.reason && <span style={{ color: "var(--ink-3)" }}> — {it.reason}</span>}
            </div>
          ))
        )}
        <div className="text-[10px]" style={{ color: "var(--ink-4)" }}>Now: {now}</div>
      </div>
      {onApply && (
        <button
          type="button"
          disabled={done}
          onClick={() => {
            onApply();
            setDone(true);
          }}
          className="rounded-[6px] border px-2 py-1 text-[10.5px] font-semibold disabled:opacity-60"
          style={{ borderColor: "var(--line-2)", color: "var(--acc)" }}
        >
          {done ? "Applied" : "Apply"}
        </button>
      )}
    </div>
  );
}
