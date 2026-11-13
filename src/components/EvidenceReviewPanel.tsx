"use client";

/** EVIDENCE REVIEW — the right panel (4.1–4.7 of Sarel's brief), opened when
 *  a row in EvidenceReviewView's table is clicked. See docs/capture-review/
 *  evidence-review-discovery.md for the translation this whole feature is
 *  built against; the short version: this is a static side panel, same
 *  shape as ReviewRiskPanel/CheckDetail's own right pane, NOT a modal
 *  overlay — the brief's own mockup shows one sliding in, but this app has
 *  no overlay panel anywhere on /review, and "the existing app's design
 *  system wins wherever they conflict" is the brief's own rule.
 *
 *  Every field here writes straight through `updateEvidenceItem` — there is
 *  no Save button, because nothing else in this app defers a write either;
 *  a Save bar would be the one screen in Squawk that worked differently
 *  from every other. */

import { useMemo, useState } from "react";
import { checksAt } from "@/lib/register";
import { LIKELIHOODS, SEVERITIES } from "@/lib/risk";
import {
  EVIDENCE_COMPLIANCE_LABEL,
  TRACKING_LABEL,
  fileTypeBadge,
  trackingStage,
  type EvidenceTrackingStage,
} from "@/lib/evidence";
import { useStore } from "@/lib/store";
import {
  assist,
  evidenceContext,
  parseEvidenceAnalysis,
  useAssistAvailable,
  useVisionOn,
  type EvidenceAnalysisResult,
} from "@/lib/assist";
import { fullPhotoBlob } from "@/lib/recordimage";
import { AttachmentStrip, FileButton, PhotoButton } from "@/components/Capture";
import { Btn, Field, Pill, type Tone } from "@/components/ui/primitives";
import { IconLeft, IconRight, IconX } from "@/components/ui/icons";
import type { Check, EvidenceComplianceRating, EvidenceItem, Likelihood, Severity } from "@/lib/types";

const inputCls = "w-full rounded-[8px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

/** Short, readable fragment of a check's requirement text for inline hint
 *  copy (e.g. "Feeds into: …") — not a table cell, so this stays shorter
 *  than the requirement truncation used in the table/panel selects. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

const STAGE_TONE: Partial<Record<EvidenceTrackingStage, Tone>> = {
  requested: "neutral",
  notStarted: "neutral",
  uploaded: "warn",
  received: "accent",
  analysis: "good",
  insufficient: "bad",
  unavailable: "warn",
};

const COMPLIANCE_TONE: Record<EvidenceComplianceRating, Tone> = {
  compliant: "good",
  partial: "warn",
  nonCompliant: "bad",
};

/** EVIDENCE REVIEW — whether Accepting an "Analyse evidence" suggestion that
 *  carries a finding also mints a draft Finding, or only stores the
 *  analysis text/severity/likelihood on the EvidenceItem itself. The
 *  brief's own §4.5 flags this CONFIRM WITH SAREL; default OFF, the safer
 *  choice pending his word, same pattern this whole session has used for
 *  every other open question — see docs/capture-review/
 *  evidence-review-discovery.md §5. Both paths are implemented below,
 *  behind this one flag, so flipping it is the whole change once he
 *  confirms. */
const AUTO_CREATE_FINDING_ON_ACCEPT = false;

type Suggestion =
  | { kind: "analysis"; result: EvidenceAnalysisResult }
  | { kind: "summary"; text: string };

function severityFull(letter: string): Severity | null {
  return SEVERITIES.find((s) => s.charAt(0) === letter) ?? null;
}
function likelihoodFull(digit: string): Likelihood | null {
  return LIKELIHOODS.find((l) => l.charAt(0) === digit) ?? null;
}

export default function EvidenceReviewPanel({
  item,
  entityCode,
  visitId,
  auditor,
  disciplines,
  onPrev,
  onNext,
  onClose,
}: {
  item: EvidenceItem;
  entityCode: string;
  visitId: string;
  auditor: string;
  disciplines: string[];
  onPrev?: () => void;
  onNext?: () => void;
  onClose?: () => void;
}) {
  const patch = useStore((s) => s.updateEvidenceItem);
  const reRequest = useStore((s) => s.reRequestEvidence);
  const addFinding = useStore((s) => s.addFinding);
  const addPhoto = useStore((s) => s.addEvidenceAttachment);
  const removePhoto = useStore((s) => s.removeEvidenceAttachment);
  const updatePhoto = useStore((s) => s.updateEvidenceAttachment);

  const aiOn = useAssistAvailable();
  const vision = useVisionOn();

  const allChecks = useMemo(() => checksAt(entityCode), [entityCode]);
  const checkById = useMemo(() => new Map(allChecks.map((c) => [c.id, c])), [allChecks]);
  const linkedCheck: Check | undefined = item.checkIds.length
    ? checkById.get(item.checkIds[0])
    : undefined;

  const systemOptions = item.discipline
    ? Array.from(new Set(allChecks.filter((c) => c.discipline === item.discipline).map((c) => c.system)))
    : [];
  const checkOptions = allChecks.filter(
    (c) => (!item.discipline || c.discipline === item.discipline) && (!item.system || c.system === item.system)
  );

  const stage = trackingStage(item);
  /* THE LIFECYCLE'S OWN GATE ON THE AI SECTION. "Analyse" is only reachable
     from `received` in the brief's own status-flow table (3.4) — running
     the AI tools, or accepting what they suggest, before anything has
     actually arrived would let `analysisAt` get set with `receivedAt`
     still null, which is exactly the "requested straight to analysed"
     skip the brief's own rules forbid (and trackingStage() cannot be
     fooled into reporting: it only ever reads `analysis` once
     `receivedAt` is set). So the buttons are disabled until then, rather
     than relying on nobody pressing them out of order. */
  const canAnalyse = !!item.receivedAt;

  /* ---- 4.5 AI analysis — ephemeral, local state only. See this file's own
     header and docs/capture-review/evidence-review-discovery.md §5: a
     suggestion is never written anywhere until Accept, and nothing about
     it is persisted as a new EvidenceItem field or a new record kind — it
     lives only as long as this panel is open on this item. Keying the
     panel by item.id (EvidenceReviewView does this) resets it on its own
     whenever a different row is opened. */
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [aiBusy, setAiBusy] = useState<"analysis" | "summary" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [editingSuggestion, setEditingSuggestion] = useState(false);
  const [editText, setEditText] = useState("");
  const [handled, setHandled] = useState(false);

  async function runAi(kind: "analysis" | "summary") {
    setAiBusy(kind);
    setAiError(null);
    setHandled(false);
    try {
      const images: Blob[] = [];
      if (vision) {
        for (const a of item.attachments.filter((x) => x.kind === "photo")) {
          try {
            images.push(await fullPhotoBlob(a, entityCode, visitId));
          } catch {
            /* One unreadable photo should not stop the others, or the
               request — the context text still names the document. */
          }
        }
      }
      const ctx = evidenceContext({ title: item.title, notes: item.notes }, linkedCheck);
      if (kind === "summary") {
        const text = await assist("evidenceSummary", ctx, images);
        setSuggestion({ kind: "summary", text: text.trim() });
      } else {
        const raw = await assist("evidenceAnalysis", ctx, images);
        const parsed = parseEvidenceAnalysis(
          raw,
          SEVERITIES.map((s) => s.charAt(0)),
          LIKELIHOODS.map((l) => l.charAt(0))
        );
        if (!parsed) throw new Error("The assistant did not answer in the expected shape.");
        setSuggestion({ kind: "analysis", result: parsed });
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "The assistant is unavailable.");
    } finally {
      setAiBusy(null);
    }
  }

  function accept() {
    if (!suggestion) return;
    const now = Date.now();
    if (suggestion.kind === "summary") {
      const text = editingSuggestion ? editText : suggestion.text;
      patch(item.id, {
        analysisNote: [item.analysisNote.trim(), `Summary: ${text}`].filter(Boolean).join("\n\n"),
      });
    } else {
      const r = suggestion.result;
      const findingText = editingSuggestion ? editText : r.findingText;
      const ratingNote =
        findingText && (r.severity || r.likelihood)
          ? ` (suggested ${r.severity || "—"}${r.likelihood ? `/${r.likelihood}` : ""})`
          : "";
      patch(item.id, {
        analysisAt: item.analysisAt ?? now,
        analysisNote: [
          item.analysisNote.trim(),
          findingText ? `Analysis: ${findingText}${ratingNote}` : `Analysis: ${r.reason}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      if (AUTO_CREATE_FINDING_ON_ACCEPT && findingText) {
        addFinding({
          checkId: item.checkIds[0] ?? null,
          discipline: item.discipline ?? linkedCheck?.discipline ?? "",
          system: item.system ?? linkedCheck?.system ?? "",
          area: "",
          title: findingText.slice(0, 80),
          description: findingText,
          issueIndex: null,
          severity: severityFull(r.severity),
          likelihood: likelihoodFull(r.likelihood),
          ratingConfirmed: false,
          rootCause: "",
          actions: [],
          actionStatus: "Open",
          originVisit: visitId,
          priorRating: null,
          suggestedEvent: "",
          progress: [],
          adHoc: true,
          createdBy: auditor,
          attachments: [],
        });
      }
    }
    setHandled(true);
    setEditingSuggestion(false);
  }

  function reject() {
    /* EPHEMERAL, ON PURPOSE — see this file's header. The brief's own words
       are "keeps it in history"; the grounding this pass is built against
       is explicit that nothing about a pending suggestion is persisted, so
       Reject clears the local state rather than writing a rejected record
       anywhere. Flagged in the PR. */
    setSuggestion(null);
    setEditingSuggestion(false);
    setHandled(false);
  }

  const steps: { key: string; label: string; done: boolean }[] = [
    { key: "requested", label: "Requested", done: !!item.requestedAt },
    { key: "uploaded", label: "Uploaded", done: item.attachments.length > 0 },
    { key: "received", label: "Received", done: !!item.receivedAt },
    { key: "analysed", label: "Analysed", done: !!item.analysisAt },
  ];
  const canMarkInsufficient = ["uploaded", "received", "analysis"].includes(stage);
  const canReRequest = stage === "insufficient";

  const [insufficientReasonDraft, setInsufficientReasonDraft] = useState("");

  return (
    <div className="flex h-full flex-col">
      {/* 4.1 — header */}
      <div className="mb-3 shrink-0">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[9.5px] uppercase" style={{ color: "var(--ink-4)" }}>
            Evidence request · {item.discipline || "General"}
          </span>
          <span className="flex gap-[6px]">
            <Btn icon onClick={onPrev} disabled={!onPrev} aria-label="Previous request">
              <IconLeft width={13} height={13} />
            </Btn>
            <Btn icon onClick={onNext} disabled={!onNext} aria-label="Next request">
              <IconRight width={13} height={13} />
            </Btn>
            {onClose && (
              <Btn icon onClick={onClose} aria-label="Close panel">
                <IconX width={13} height={13} />
              </Btn>
            )}
          </span>
        </div>
        <h3 className="mb-2 text-[14.5px] font-bold leading-snug">{item.title || item.id}</h3>
        <div className="flex flex-wrap items-center gap-[6px]">
          <Pill tone={STAGE_TONE[stage]}>{TRACKING_LABEL[stage]}</Pill>
          {item.complianceRating && (
            <Pill tone={COMPLIANCE_TONE[item.complianceRating]}>
              {EVIDENCE_COMPLIANCE_LABEL[item.complianceRating]}
            </Pill>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 4.2 — Linked to */}
        <Field label="LINKED TO">
          <div className="flex flex-col gap-2">
            <select
              value={item.discipline ?? ""}
              onChange={(e) =>
                patch(item.id, {
                  discipline: e.target.value || undefined,
                  system: undefined,
                  checkIds: [],
                })
              }
              aria-label="Discipline"
              className={inputCls}
              style={inputStyle}
            >
              <option value="">No discipline (General)</option>
              {disciplines.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={item.system ?? ""}
              onChange={(e) => patch(item.id, { system: e.target.value || undefined })}
              aria-label="Asset system"
              disabled={!item.discipline}
              className={inputCls}
              style={inputStyle}
            >
              <option value="">General (discipline-level)</option>
              {systemOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={item.checkIds[0] ?? ""}
              onChange={(e) =>
                patch(item.id, { checkIds: e.target.value ? [e.target.value] : [] })
              }
              aria-label="Audit check"
              className={inputCls}
              style={inputStyle}
            >
              <option value="">No specific check</option>
              {checkOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.requirement.slice(0, 80)}
                </option>
              ))}
            </select>
            <p className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
              Leave asset system and check empty to keep this a General discipline request.
            </p>
          </div>
        </Field>

        {/* 4.3 — Status */}
        <Field label="STATUS">
          <div className="mb-3 flex flex-wrap gap-[6px]">
            {steps.map((s) => (
              <span
                key={s.key}
                className="inline-flex items-center gap-1 rounded-[8px] border px-2 py-[4px] text-[10.5px] font-semibold"
                style={
                  s.done
                    ? { background: "var(--good-bg)", borderColor: "var(--good-line)", color: "var(--good)" }
                    : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-3)" }
                }
              >
                {s.done ? "✓ " : ""}
                {s.label}
              </span>
            ))}
          </div>

          {stage === "insufficient" && (
            <p className="mb-2 text-[11.5px]" style={{ color: "var(--bad)" }}>
              Marked insufficient{item.insufficientReason ? `: ${item.insufficientReason}` : "."}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {canMarkInsufficient && (
              <>
                <input
                  value={insufficientReasonDraft}
                  onChange={(e) => setInsufficientReasonDraft(e.target.value)}
                  aria-label="Why this evidence is insufficient"
                  placeholder="Why it doesn't satisfy the request"
                  className={`${inputCls} flex-1 min-w-[160px]`}
                  style={inputStyle}
                />
                <Btn
                  variant="danger"
                  disabled={!insufficientReasonDraft.trim()}
                  onClick={() => {
                    patch(item.id, {
                      insufficientAt: Date.now(),
                      insufficientReason: insufficientReasonDraft.trim(),
                    });
                    setInsufficientReasonDraft("");
                  }}
                >
                  Mark insufficient
                </Btn>
              </>
            )}
            {canReRequest && (
              <Btn variant="primary" onClick={() => reRequest(item.id)}>
                Re-request
              </Btn>
            )}
          </div>
        </Field>

        {/* 4.4 — Files */}
        <Field
          label="FILES"
          hint={`${item.attachments.length} file${item.attachments.length === 1 ? "" : "s"}`}
        >
          <div className="mb-2 flex justify-end gap-2">
            <PhotoButton compact onCaptured={(m) => addPhoto(item.id, { ...m, createdBy: auditor })} />
            <FileButton onCaptured={(m) => addPhoto(item.id, { ...m, createdBy: auditor })} compact />
          </div>
          {/* 4.4's own "type badge: PDF/XLS/IMG/etc." — a quick-scan row
              above the full AttachmentStrip (which already shows name,
              uploaded-by, date and size) rather than duplicating that
              detail here. */}
          {item.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-[6px]">
              {item.attachments.map((a) => (
                <Pill key={a.id} title={a.name}>
                  {fileTypeBadge(a)} · {a.name}
                </Pill>
              ))}
            </div>
          )}
          {item.attachments.length > 0 ? (
            <AttachmentStrip
              attachments={item.attachments}
              thumbSize={40}
              onRemove={(aid) => removePhoto(item.id, aid)}
              onUpdate={(aid, p) => updatePhoto(item.id, aid, p)}
            />
          ) : (
            <p className="text-[11px]" style={{ color: "var(--ink-4)" }}>
              Nothing attached yet.
            </p>
          )}
        </Field>

        {/* 4.5 — AI analysis */}
        <Field label="AI ANALYSIS">
          {!aiOn ? (
            <p className="text-[11px]" style={{ color: "var(--ink-4)" }}>
              No model is configured for this deployment.
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-2">
                <Btn
                  disabled={aiBusy !== null || !canAnalyse}
                  title={canAnalyse ? undefined : "Receive this evidence first — analysis follows receipt in the lifecycle."}
                  onClick={() => void runAi("analysis")}
                >
                  ✦ {aiBusy === "analysis" ? "Analysing…" : "Analyse evidence"}
                </Btn>
                <Btn
                  disabled={aiBusy !== null || item.attachments.length === 0}
                  title={item.attachments.length === 0 ? "Nothing attached to summarise yet." : undefined}
                  onClick={() => void runAi("summary")}
                >
                  ✦ {aiBusy === "summary" ? "Summarising…" : "Summarise files"}
                </Btn>
              </div>
              {aiError && (
                <p role="alert" className="mb-2 text-[11px] font-semibold" style={{ color: "var(--bad)" }}>
                  {aiError}
                </p>
              )}
              {suggestion && !handled && (
                <div
                  className="rounded-[11px] border p-[10px] text-[12px]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                >
                  <p className="mb-1" style={{ color: "var(--bad)", textDecoration: "line-through" }}>
                    {item.analysisNote.trim() || "No analysis recorded yet."}
                  </p>
                  {editingSuggestion ? (
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      aria-label="Edit the suggestion before saving"
                      className={`mb-2 ${inputCls}`}
                      style={inputStyle}
                    />
                  ) : (
                    <p className="mb-1 font-semibold" style={{ color: "var(--good)" }}>
                      {suggestion.kind === "summary" ? suggestion.text : suggestion.result.findingText || "No finding suggested."}
                    </p>
                  )}
                  <p className="mb-2 italic" style={{ color: "var(--ink-3)" }}>
                    {suggestion.kind === "summary" ? "AI summary of attached files." : suggestion.result.reason}
                    {suggestion.kind === "analysis" && (suggestion.result.severity || suggestion.result.likelihood)
                      ? ` Suggested rating: ${suggestion.result.severity || "—"}/${suggestion.result.likelihood || "—"}.`
                      : ""}
                  </p>
                  <div className="flex gap-2">
                    <Btn variant="primary" onClick={accept}>
                      Accept
                    </Btn>
                    {!editingSuggestion ? (
                      <Btn
                        onClick={() => {
                          setEditingSuggestion(true);
                          setEditText(suggestion.kind === "summary" ? suggestion.text : suggestion.result.findingText);
                        }}
                      >
                        Edit
                      </Btn>
                    ) : null}
                    <Btn variant="danger" onClick={reject}>
                      Reject
                    </Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </Field>

        {/* 4.6 — Compliance rating */}
        <Field label="COMPLIANCE RATING">
          <select
            value={item.complianceRating ?? ""}
            onChange={(e) =>
              patch(item.id, {
                complianceRating: (e.target.value || undefined) as EvidenceComplianceRating | undefined,
              })
            }
            aria-label="Compliance rating"
            className={`mb-2 ${inputCls}`}
            style={inputStyle}
          >
            <option value="">Not rated</option>
            {(Object.keys(EVIDENCE_COMPLIANCE_LABEL) as EvidenceComplianceRating[]).map((k) => (
              <option key={k} value={k}>
                {EVIDENCE_COMPLIANCE_LABEL[k]}
              </option>
            ))}
          </select>
          <p className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
            Feeds into:{" "}
            {linkedCheck
              ? `${truncate(linkedCheck.requirement, 48)} combined compliance`
              : "General — not linked to a check"}
          </p>
        </Field>

        {/* 4.7 — Notes */}
        <Field label="NOTES">
          <textarea
            value={item.notes}
            onChange={(e) => patch(item.id, { notes: e.target.value })}
            rows={3}
            aria-label="Notes"
            placeholder="Anything a reader would need to know about this request"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
      </div>

      {suggestion && !handled && (
        <div
          className="mt-2 shrink-0 rounded-[8px] px-3 py-2 text-center text-[11px] font-semibold"
          style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
        >
          1 AI suggestion waiting
        </div>
      )}
    </div>
  );
}
