"use client";

import { useEffect, useRef, useState } from "react";
import type { Check, Compliance } from "@/lib/types";
import { priorFor, useResponses, useStore, useVisitId } from "@/lib/store";
import { useAnswers } from "@/lib/answers";
import {
  assist,
  checkContext,
  composeObservation,
  useAssistAvailable,
} from "@/lib/assist";
import { bandFor, BAND_META } from "@/lib/risk";
import { modeLabels, needsField } from "@/lib/verification";
import { AttachmentStrip, PhotoButton, VoiceNoteButton } from "./Capture";
import {
  IconCheck,
  IconClock,
  IconDash,
  IconLeft,
  IconPin,
  IconRight,
  IconSpark,
  IconWand,
  IconX,
} from "@/components/ui/icons";
import { Btn, Chip, Field, Panel, Pill } from "@/components/ui/primitives";

const STATUSES: { key: Compliance; label: string; Icon: typeof IconCheck; tone: string }[] = [
  { key: "C", label: "Compliant", Icon: IconCheck, tone: "good" },
  { key: "NC", label: "Non-compliant", Icon: IconX, tone: "bad" },
  { key: "N/A", label: "N/A", Icon: IconDash, tone: "neu" },
  { key: "NV", label: "Not available", Icon: IconClock, tone: "warn" },
];

const toneStyle = (tone: string, on: boolean): React.CSSProperties =>
  on
    ? {
        background: `var(--${tone}-bg)`,
        borderColor: `var(--${tone})`,
        color: `var(--${tone})`,
      }
    : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" };

export default function CheckDetail({
  check,
  onPrev,
  onNext,
  onSaved,
}: {
  check: Check;
  onPrev: () => void;
  onNext: () => void;
  onSaved: (msg: string) => void;
}) {
  const r = useResponses()[check.id] ?? {
    checkId: check.id,
    compliance: null,
    observation: "",
    evidencePicked: [],
    issuesPicked: [],
    walkaboutPicked: null,
    attachments: [],
    captured: false,
    capturedBy: "",
    capturedAt: null,
    deskDoneBy: "",
    deskDoneAt: null,
    fieldDoneBy: "",
    fieldDoneAt: null,
    flaggedForField: false,
  };
  const auditor = useStore((s) => s.auditor);
  const setCompliance = useStore((s) => s.setCompliance);
  const toggleEvidence = useStore((s) => s.toggleEvidence);
  const toggleIssue = useStore((s) => s.toggleIssue);
  const setWalkabout = useStore((s) => s.setWalkabout);
  const appendObservation = useStore((s) => s.appendObservation);
  const patch = useStore((s) => s.patch);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const commit = useStore((s) => s.commit);
  const visitId = useVisitId();

  const aiOn = useAssistAvailable();
  const [draft, setDraft] = useState<string | null>(null);
  const [thinking, setThinking] = useState<null | "observation" | "explain">(null);
  const [explained, setExplained] = useState<string | null>(null);
  const [titleOpen, setTitleOpen] = useState(false);
  const obsRef = useRef<HTMLTextAreaElement>(null);
  const a = useAnswers(check.id);
  const pf = check.pf ? priorFor(check.discipline, check.system) : null;
  const longTitle = check.requirement.length > 140;

  /* Suggestions belong to the check that produced them. */
  useEffect(() => {
    setDraft(null);
    setExplained(null);
    setThinking(null);
    setTitleOpen(false);
  }, [check.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(
        (document.activeElement as HTMLElement)?.tagName ?? ""
      );
      if (typing) return;
      if (["1", "2", "3", "4"].includes(e.key)) {
        const next = STATUSES[Number(e.key) - 1].key;
        setCompliance(check.id, r.compliance === next ? null : next);
      }
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [check.id, r.compliance, setCompliance, onNext, onPrev]);

  const save = (advance: boolean) => {
    commit(check.id, "desk");
    onSaved(
      needsField(check) && !r.fieldDoneAt
        ? `${check.id} — desk done. Still needs the asset seen in Field.`
        : `${check.id} saved`
    );
    if (advance) onNext();
  };

  const photos = r.attachments.filter((x) => x.kind === "photo").length;
  const voice = r.attachments.find((x) => x.kind === "voice");

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      {/* sticky context header */}
      <div
        className="sticky top-0 z-[6] border-b px-5 pt-[11px] pb-2.5"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div className="mb-[5px] flex flex-wrap items-center gap-[7px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
          <span>{check.id}</span>
          <span>·</span>
          <span>{check.system}</span>
          {/* What this check actually requires, from the register's vtype.
              "Physical" also means it is waiting on the tablet in Field mode —
              saving here does not answer that half. */}
          {modeLabels(check).map((m) => (
            <Pill key={m} tone={m === "Physical" ? "warn" : "accent"}>
              {m.toUpperCase()}
            </Pill>
          ))}
          {check.coverage === "none" && <Pill tone="bad">NO ACSA BASIS</Pill>}
          {check.siteVariant && <Pill tone="warn">{check.siteVariant.site} VARIANT</Pill>}
          {pf && (
            <Pill tone={pf.rating === "Unacceptable" ? "bad" : pf.rating === "Tolerable" ? "warn" : "good"}>
              {check.pf} · MAR 2025 {pf.rating.toUpperCase()}
            </Pill>
          )}
          {r.captured && (
            <Pill tone={r.compliance === "NC" ? "bad" : r.compliance === "C" ? "good" : r.compliance === "NV" ? "warn" : "neutral"}>
              {r.compliance}
            </Pill>
          )}
        </div>
        {/* 27 register rows run past 140 characters and one reaches 569. Left
            unclamped they turn the sticky header into half the screen, so a long
            one is capped at three lines with a control to open it. Short ones —
            the great majority — get no clamp and no extra control. */}
        <h2
          className="max-w-[92ch] text-[15.5px] leading-[1.3] font-bold"
          style={
            longTitle && !titleOpen
              ? {
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }
              : undefined
          }
        >
          {check.requirement}
        </h2>
        {longTitle && (
          <button
            onClick={() => setTitleOpen((v) => !v)}
            aria-expanded={titleOpen}
            className="mt-[3px] rounded-[5px] font-mono text-[9.5px] tracking-[.04em] uppercase"
            style={{ color: "var(--acc)" }}
          >
            {titleOpen ? "Show less" : "Show the full wording"}
          </button>
        )}
      </div>

      {needsField(check) && (
        <div
          className="flex items-center gap-2 border-b px-5 py-[7px] text-[11px]"
          style={{ background: "var(--warn-bg)", borderColor: "var(--line)", color: "var(--warn)" }}
        >
          <IconPin width={12} height={12} />
          This check also needs the asset seen on site — it appears in Field inspection too.
        </div>
      )}

      {/* Two panes from lg, not xl. An iPad in landscape is 1180px wide and was
          falling to a single column, which stacked the entire reference column
          — basis, thresholds, ACSA documents — above the capture controls. On
          anything narrower the order below puts capture first instead. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        {/* reference column */}
        <div
          className="order-2 border-b px-[18px] pt-4 pb-[18px] lg:order-1 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:pb-[90px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
        >
          {check.siteVariant && (
            /* 33 checks carry a threshold stricter than the network default at
               this site. It goes above the default, not in a tooltip — an
               auditor who reads the network figure and misses this one audits
               against the wrong standard. */
            <Panel tone="warn" className="mb-[9px]">
              <div className="label-xs" style={{ color: "var(--warn)" }}>
                {check.siteVariant.site} applies here — this overrides the network default
              </div>
              <div
                className="mt-1 text-[12.5px] leading-[1.55] whitespace-pre-line"
                style={{ color: "var(--warn)" }}
              >
                {check.siteVariant.note}
              </div>
            </Panel>
          )}

          <Panel className="mb-[9px]">
            <div className="label-xs">Target / limit</div>
            <div className="mt-1 text-[12.5px] leading-[1.55]">{check.target || "—"}</div>
          </Panel>

          {check.acsaThreshold && (
            <Panel tone="accent" className="mb-[9px]">
              <div className="label-xs" style={{ color: "var(--acc)" }}>
                ACSA states ·{" "}
                {check.acsaDocs.map((d) => `${d.doc}${d.clause ? ` cl. ${d.clause}` : ""}`).join("; ")}
              </div>
              <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--acc)" }}>
                {check.acsaThreshold}
              </div>
            </Panel>
          )}

          {!check.acsaThreshold && (
            /* Silence on screen reads as "nothing to see here". It is the
               opposite: where ACSA's own documents set no threshold, there is
               no standard to audit against, and that is itself the finding. Say
               it, rather than leaving a gap the auditor has to notice. */
            <Panel tone="warn" className="mb-[9px]">
              <div className="label-xs" style={{ color: "var(--warn)" }}>
                ACSA states no threshold
              </div>
              <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--warn)" }}>
                {check.acsaDocs.length > 0
                  ? `${check.acsaDocs
                      .map((d) => d.doc)
                      .join(", ")} covers this but sets no interval, limit or acceptance value. Compliance cannot be assessed against a stated standard — raise the absence itself.`
                  : "No ACSA document covering this check has been identified. There is no internal standard to audit against — raise the absence itself."}
              </div>
            </Panel>
          )}

          {check.question && (
            <Panel className="mb-[9px]">
              <div className="label-xs">Ask ACSA</div>
              <div className="mt-1 text-[12.5px] leading-[1.55] font-medium">{check.question}</div>
            </Panel>
          )}

          {pf && check.pfq && (
            <Panel tone="warn" className="mb-[9px]">
              <div className="label-xs" style={{ color: "var(--warn)" }}>
                {check.pf} follow-up · carried from March 2025
              </div>
              <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--warn)" }}>
                {check.pfq}
              </div>
            </Panel>
          )}

          {check.acsaConflict && (
            <Panel className="mb-[9px]">
              <div className="label-xs">Document issue</div>
              <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
                {check.acsaConflict}
              </div>
            </Panel>
          )}

          {aiOn && (
            /* Reading a procedure back in plain English is the one thing here a
               rule cannot do. It reads only this check's own fields — nothing
               it says is new information, and nothing it says is evidence. */
            <div className="mb-[9px]">
              {explained ? (
                <Panel className="relative">
                  <div className="label-xs">In plain English · AI reading, not evidence</div>
                  <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
                    {explained}
                  </div>
                  <button
                    onClick={() => setExplained(null)}
                    aria-label="Dismiss the explanation"
                    className="absolute top-2 right-2 rounded-[6px] p-1"
                    style={{ color: "var(--ink-4)" }}
                  >
                    <IconX width={13} height={13} />
                  </button>
                </Panel>
              ) : (
                <button
                  disabled={thinking === "explain"}
                  onClick={async () => {
                    setThinking("explain");
                    try {
                      setExplained(await assist("explain", checkContext(check)));
                    } catch (err) {
                      onSaved(err instanceof Error ? err.message : "The assistant is unavailable");
                    } finally {
                      setThinking(null);
                    }
                  }}
                  className="flex items-center gap-[6px] rounded-[8px] border px-[11px] py-[6px] text-[11px] transition-[var(--t)] disabled:opacity-55"
                  style={{
                    background: "var(--panel)",
                    borderColor: "var(--line-2)",
                    color: "var(--ink-2)",
                  }}
                >
                  <IconSpark width={13} height={13} />
                  {thinking === "explain" ? "Reading…" : "Explain this check"}
                </button>
              )}
            </div>
          )}

          {check.walkabout && (
            <Panel className="mb-[9px]">
              <div className="label-xs">Walkabout instruction</div>
              <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
                {check.walkabout}
              </div>
            </Panel>
          )}

          {/* Everything else the register holds for this check. Folded away so the
              column stays scannable, but present — in a workshop the question
              "what exactly does the procedure say?" gets asked, and the answer
              should not be in a spreadsheet on someone else's laptop. */}
          {(check.acsaRequirement ||
            check.acsaEvidence.length > 0 ||
            check.evidenceExpected ||
            check.basis) && (
            <details className="group mb-[9px]">
              <summary
                className="flex cursor-pointer list-none items-center gap-1.5 rounded-[8px] px-1 py-1.5 font-display text-[11px] font-semibold select-none"
                style={{ color: "var(--ink-3)" }}
              >
                <IconRight
                  width={12}
                  height={12}
                  className="transition-transform group-open:rotate-90"
                />
                Full reference
              </summary>

              <div className="mt-1.5">
                {check.acsaRequirement && (
                  <Panel className="mb-[9px]">
                    <div className="label-xs">What ACSA&apos;s procedure requires</div>
                    <div
                      className="mt-1 text-[12.5px] leading-[1.55] whitespace-pre-line"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {check.acsaRequirement}
                    </div>
                  </Panel>
                )}

                {check.acsaEvidence.length > 0 && (
                  <Panel className="mb-[9px]">
                    <div className="label-xs">Records ACSA names</div>
                    <ul className="mt-1 list-disc pl-4 text-[12.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
                      {check.acsaEvidence.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </Panel>
                )}

                {check.evidenceExpected && (
                  <Panel className="mb-[9px]">
                    <div className="label-xs">Evidence expected</div>
                    <div
                      className="mt-1 text-[12.5px] leading-[1.55] whitespace-pre-line"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {check.evidenceExpected}
                    </div>
                  </Panel>
                )}

                {check.basis && (
                  <Panel className="mb-[9px]">
                    <div className="label-xs flex flex-wrap items-center gap-1.5">
                      External basis
                      {check.basisConfidence === "medium" && (
                        <span
                          className="rounded-full px-[6px] py-[1px] font-mono text-[8.5px] normal-case"
                          style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
                          title="The instrument applies, but the clause is cited at document level. Do not quote a clause number from this."
                        >
                          cited at document level
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-1 text-[12.5px] leading-[1.55] whitespace-pre-line"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {check.basis}
                    </div>
                    {check.basisNote && (
                      <div
                        className="mt-2 border-t pt-2 text-[11.5px] leading-[1.5]"
                        style={{ borderColor: "var(--line)", color: "var(--warn)" }}
                      >
                        {check.basisNote}
                      </div>
                    )}
                  </Panel>
                )}
              </div>
            </details>
          )}
        </div>

        {/* capture column */}
        <div
          className="order-1 px-5 pt-4 pb-[18px] lg:order-2 lg:pb-[90px] lg:overflow-y-auto"
          style={{ background: "var(--focus-surface)" }}
        >
          <Field label="Status" hint="1 – 4">
            <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-4">
              {STATUSES.map(({ key, label, Icon, tone }) => (
                <button
                  key={key}
                  onClick={() => setCompliance(check.id, r.compliance === key ? null : key)}
                  className="flex min-h-[56px] flex-col items-center justify-center gap-[5px] rounded-[11px] border-[1.5px] px-1 py-2.5 font-display text-[10.5px] font-semibold transition-[var(--t)] hover:-translate-y-[1px]"
                  style={toneStyle(tone, r.compliance === key)}
                >
                  <Icon width={15} height={15} />
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {a ? (
            <>
              <Field label="Evidence to request" hint={`${r.evidencePicked.length}/${a.EO.length}`}>
                <div className="chip-row flex flex-wrap gap-[5px]">
                  {a.EO.map((e, i) => (
                    <Chip
                      key={i}
                      kind="evidence"
                      selected={r.evidencePicked.includes(i)}
                      title={e.hint}
                      onClick={() => toggleEvidence(check.id, i)}
                    >
                      {r.evidencePicked.includes(i) && <IconCheck width={12} height={12} />}
                      {e.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              {a.AO.length > 0 && (
                <Field label="Likely answers" hint="sets status & seeds the note">
                  <div className="chip-row flex flex-wrap gap-[5px]">
                    {a.AO.map((x, i) => (
                      <Chip
                        key={i}
                        onClick={() => {
                          setCompliance(check.id, x.sets);
                          appendObservation(check.id, x.observation);
                        }}
                      >
                        {x.label}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="Issues found" hint="raises a finding · suggests severity">
                <div className="chip-row flex flex-wrap gap-[5px]">
                  {a.IO.map((x, i) => {
                    const band = bandFor(x.severity_hint, x.likelihood_hint);
                    return (
                      <Chip
                        key={i}
                        kind="issue"
                        selected={r.issuesPicked.includes(i)}
                        title={band ? `${band} — ${BAND_META[band].label}` : undefined}
                        onClick={() => {
                          const picked = r.issuesPicked.includes(i);
                          toggleIssue(check.id, i, {
                            checkId: check.id,
                            discipline: check.discipline,
                            system: check.system,
                            area: check.area,
                            title: x.label,
                            description: x.finding,
                            issueIndex: i,
                            severity: x.severity_hint,
                            likelihood: x.likelihood_hint,
                            ratingConfirmed: false,
                            rootCause: "",
                            action: "",
                            owner: "",
                            dueDate: "",
                            actionStatus: "Open",
                            originVisit: visitId,
                            priorRating: pf?.rating ?? null,
                            adHoc: false,
                            createdBy: auditor,
                          });
                          if (!picked) {
                            appendObservation(check.id, x.finding);
                            onSaved(
                              `Finding raised · ${x.severity_hint.charAt(0)}${x.likelihood_hint.charAt(0)}${band ? ` → ${BAND_META[band].label}` : ""}`
                            );
                          }
                        }}
                      >
                        {x.label}
                        <span className="font-mono text-[8.5px] opacity-70">
                          {x.likelihood_hint.charAt(0)}
                          {x.severity_hint.charAt(0)}
                        </span>
                      </Chip>
                    );
                  })}
                </div>
              </Field>

              {a.WO.length > 0 && (
                <Field label="Walkabout" hint="what the eye settles on">
                  <div className="chip-row flex flex-wrap gap-[5px]">
                    {a.WO.map((w, i) => (
                      <Chip
                        key={i}
                        selected={r.walkaboutPicked === i}
                        onClick={() => setWalkabout(check.id, i, w.sets)}
                      >
                        {w.label}
                        {w.photo ? " 📷" : ""}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}
            </>
          ) : check.optionCount > 0 ? (
            /* The library is loading (it is fetched on first use, not bundled).
               A skeleton keeps the layout from jumping when the chips arrive. */
            <div className="mb-4" aria-busy="true" aria-label="Loading the answer library">
              {[6, 5, 5].map((n, row) => (
                <div key={row} className="mb-3.5">
                  <div
                    className="mb-[7px] h-[9px] w-[110px] rounded-full"
                    style={{ background: "var(--line-2)", opacity: 0.7 }}
                  />
                  <div className="chip-row flex flex-wrap gap-[5px]">
                    {Array.from({ length: n }, (_, i) => (
                      <div
                        key={i}
                        className="h-[27px] rounded-full"
                        style={{
                          width: `${88 + ((i * 37) % 96)}px`,
                          background: "var(--line-2)",
                          opacity: 0.55,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Panel tone="warn" className="mb-4">
              <div className="text-[12px]" style={{ color: "var(--warn)" }}>
                No researched options exist for this check yet — capture by typing.
              </div>
            </Panel>
          )}

          <Field
            label="Observation"
            hint={voice ? "voice note attached" : "tap · type · speak"}
          >
            {a && a.OS.length > 0 && (
              <div className="chip-row mb-[7px] flex flex-wrap gap-[5px]">
                {a.OS.map((sn, i) => (
                  <Chip key={i} onClick={() => appendObservation(check.id, sn)}>
                    + {sn}
                  </Chip>
                ))}
              </div>
            )}
            <textarea
              ref={obsRef}
              value={r.observation}
              onChange={(e) => patch(check.id, { observation: e.target.value })}
              placeholder="Composed from your taps — edit freely…"
              className="min-h-[76px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] leading-[1.55] outline-none transition-[var(--t)] focus:border-[var(--acc)]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
            {draft !== null && (
              /* A draft is a proposal. It sits beside the record until the
                 auditor puts it in — nothing writes itself into the audit. */
              <div
                className="mt-[7px] rounded-[11px] border p-3"
                style={{ borderColor: "var(--acc)", background: "var(--acc-bg)" }}
              >
                <div className="label-xs mb-1.5" style={{ color: "var(--acc)" }}>
                  Suggested wording · yours to accept, edit or ignore
                </div>
                <div className="text-[12.5px] leading-[1.55]">{draft}</div>
                <div className="chip-row mt-2.5 flex flex-wrap gap-[6px]">
                  <Btn
                    onClick={() => {
                      patch(check.id, { observation: draft });
                      setDraft(null);
                      obsRef.current?.focus();
                    }}
                  >
                    Use it
                  </Btn>
                  <Btn variant="ghost" onClick={() => setDraft(null)}>
                    Discard
                  </Btn>
                </div>
              </div>
            )}

            <div className="mt-[7px] flex flex-wrap items-center gap-[6px]">
              <button
                onClick={() => {
                  const text = composeObservation(check, r, a);
                  if (text) setDraft(text);
                  else onSaved("Nothing tapped yet to compose from");
                }}
                className="flex items-center gap-[6px] rounded-[8px] border px-[11px] py-[6px] text-[11px] transition-[var(--t)]"
                style={{
                  background: "var(--panel)",
                  borderColor: "var(--line-2)",
                  color: "var(--ink-2)",
                }}
                title="Builds a sentence from the buttons you have tapped. Works offline, no model needed."
              >
                <IconWand width={13} height={13} />
                Compose from taps
              </button>
              {aiOn && (
                <button
                  disabled={thinking === "observation"}
                  onClick={async () => {
                    setThinking("observation");
                    try {
                      setDraft(await assist("observation", checkContext(check, r, a)));
                    } catch (err) {
                      onSaved(err instanceof Error ? err.message : "The assistant is unavailable");
                    } finally {
                      setThinking(null);
                    }
                  }}
                  className="flex items-center gap-[6px] rounded-[8px] border px-[11px] py-[6px] text-[11px] transition-[var(--t)] disabled:opacity-55"
                  style={{
                    background: "var(--panel)",
                    borderColor: "var(--line-2)",
                    color: "var(--ink-2)",
                  }}
                  title="Drafts the observation from this check's own material. Advisory — you decide."
                >
                  <IconSpark width={13} height={13} />
                  {thinking === "observation" ? "Drafting…" : "Draft with AI"}
                </button>
              )}
              <VoiceNoteButton
                onCaptured={(m) => {
                  addAttachment(check.id, { ...m, createdBy: auditor });
                  /* The transcript is attached to the note, not spliced into
                     the observation. An auditor writes the observation; the
                     recording is evidence beside it. */
                  onSaved(
                    m.transcript
                      ? "Voice note attached with transcript"
                      : "Voice note attached"
                  );
                }}
              />
              <PhotoButton
                onCaptured={(m) => {
                  addAttachment(check.id, { ...m, createdBy: auditor });
                  onSaved(`Photo attached to ${check.id}`);
                }}
              />
              {photos > 0 && <Pill>{photos} photo{photos > 1 ? "s" : ""}</Pill>}
            </div>
            {r.attachments.length > 0 && (
              <div className="mt-[10px]">
                <AttachmentStrip
                  attachments={r.attachments}
                  onRemove={(id) => removeAttachment(check.id, id)}
                />
              </div>
            )}
          </Field>
        </div>
      </div>

      {/* sticky action bar */}
      <div
        className="sticky bottom-0 z-[7] flex flex-wrap items-center justify-between gap-3 border-t px-5 py-2.5"
        style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "0 -4px 16px -8px rgba(22,16,40,.14)" }}
      >
        <div className="flex items-center gap-[6px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
          {/* Both halves, named. "Captured" on a check that also needs the
              asset seen would be a claim nobody has earned yet. */}
          <span
            className="h-[6px] w-[6px] rounded-full"
            style={{
              background: r.captured
                ? "var(--good)"
                : r.deskDoneAt
                  ? "var(--warn)"
                  : "var(--line-3)",
            }}
          />
          {r.captured
            ? `complete · ${r.capturedBy.split(" ")[0]}`
            : r.deskDoneAt
              ? `desk done by ${r.deskDoneBy.split(" ")[0]} · awaiting site`
              : "not captured yet"}
          {needsField(check) && r.fieldDoneAt && ` · site seen by ${r.fieldDoneBy.split(" ")[0]}`}
          {r.issuesPicked.length > 0 && ` · ${r.issuesPicked.length} finding${r.issuesPicked.length > 1 ? "s" : ""}`}
        </div>
        <div className="flex gap-[7px]">
          <Btn icon onClick={onPrev} aria-label="Previous">
            <IconLeft width={14} height={14} />
          </Btn>
          <Btn onClick={() => save(false)}>Save</Btn>
          <Btn variant="primary" onClick={() => save(true)}>
            <IconCheck width={14} height={14} />
            Save &amp; next
          </Btn>
          <Btn icon onClick={onNext} aria-label="Next">
            <IconRight width={14} height={14} />
          </Btn>
        </div>
      </div>
    </div>
  );
}
