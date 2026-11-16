"use client";

/** THE RIGHT-HAND PANEL for the Review risk-fields addendum's table — §3.
 *  One finding (an observation or non-compliance) at a time: Type, the
 *  hierarchy it's linked to, its own notes/photos/recordings, the linked
 *  audit check's compliance (read-only), Impact areas, Root cause
 *  categories + notes + Confirmed toggle.
 *
 *  16 Nov 2026 — SEVERITY, LIKELIHOOD AND THE MINI MATRIX ARE GONE FROM THIS
 *  PANEL. Sarel: "we're not going to do severity and likelihood ratings on
 *  a finding level, for now... only on an asset system level." This panel
 *  used to reuse RatingPicker (the asset-system screen's own segmented-
 *  button control) plus a small read-only mini-matrix visualising the
 *  chosen cell; both are removed, along with the "Not rated — pick severity
 *  and likelihood above" result line. `priorityFor` (src/lib/reviewRisk.ts)
 *  is untouched — it is still how the asset-system level derives its band —
 *  this panel simply no longer calls it. See FindingDetail.tsx and
 *  findings/page.tsx for the same removal on the other two screens that
 *  used to let an auditor rate a Finding directly.
 *
 *  Every number and word still on this panel comes from src/lib/risk.ts and
 *  src/lib/reviewRisk.ts — nothing here restates a band label, for the same
 *  reason risk.ts's own header explains at length. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FINDING_TYPE_LABEL,
  IMPACT_AREAS,
  ROOT_CAUSES,
  findingTypeFor,
  toggleMulti,
} from "@/lib/reviewRisk";
import { evidenceAxisFor, reviewCombinedCompliance } from "@/lib/review";
import { assist, polishContext, useAssistAvailable } from "@/lib/assist";
import { TRACKING_LABEL, trackingStage } from "@/lib/evidence";
import { entity as entityOf } from "@/lib/programme";
import { checksAt, checksOf, disciplinesAt, systemsOf } from "@/lib/register";
import { useStore, useEvidenceItems, useFieldSaveStatus, useResponses } from "@/lib/store";
import { AttachmentStrip } from "@/components/Capture";
import { Chip, Pill, SaveStatusPill } from "@/components/ui/primitives";
import type { Compliance, Finding } from "@/lib/types";

/** Read-only — same tone convention as ReviewDetail.tsx's own StatusCell,
 *  recomputed here rather than imported since that component is local
 *  (not exported) and this is a presentation detail, not shared logic
 *  worth a new export. */
const COMPLIANCE_TONE: Record<Compliance, "good" | "bad" | "warn" | "neutral"> = {
  C: "good",
  NC: "bad",
  NV: "warn",
  "N/A": "neutral",
};
const COMPLIANCE_LABEL: Record<Compliance, string> = {
  C: "Compliant",
  NC: "Non-compliant",
  NV: "Not verified",
  "N/A": "Not applicable",
};

export type RiskPatch = Pick<
  Finding,
  | "impactAreas"
  | "rootCauseCategories"
  | "rootCauseNote"
  | "rootCauseConfirmed"
  | "findingType"
  /* PRIORITY 4 (review redesign) — Discipline/Asset system/Audit check,
     added so the hierarchy editor below can patch through the SAME
     onChange every other field here already uses, rather than a second
     callback prop just for these three. */
  | "discipline"
  | "system"
  | "checkId"
  /* PRIORITY 7 (review redesign) — description becomes editable here so
     the "Suggest wording" AI action below has an ordinary field to
     improve, not a read-only paragraph with nowhere for an accepted
     suggestion (or a human tweak) to land. */
  | "description"
>;

export default function ReviewRiskPanel({
  finding,
  entityCode,
  onChange: onChangeProp,
  onClose,
  onOpenCheck,
}: {
  finding: Finding;
  /** For the hierarchy editor's own discipline/system/check option lists —
   *  same entity-scoped register reads ReviewRiskTable's filters already
   *  use, never a second copy of the register. */
  entityCode: string;
  /** The caller owns the write (ReviewPage calls updateFinding), same
   *  division of labour as RecordActions' own onChange. */
  onChange: (patch: Partial<RiskPatch>) => void;
  /** PRIORITY 1 — the panel now only renders when a row is selected (see
   *  /review's own page), so it needs a way back to "nothing selected,
   *  full-width table" rather than staying pinned to the last row forever. */
  onClose: () => void;
  /** PRIORITY 4 — "From linked audit check" (below) hands off to the
   *  real "By check" tab/ReviewDetail for that exact check, rather than
   *  duplicating its own editing UI here. The caller owns switching tabs
   *  and the tree's own discipline/active-check state. */
  onOpenCheck: (checkId: string) => void;
}) {
  const type = findingTypeFor(finding);

  /* PRIORITY 2 (review redesign) — "show saving, saved and failed states;
     never silently lose an edit." `dirty` is a plain boolean, not a fresh
     Date.now() read here — calling Date.now() inside a component is an
     impure-during-render risk the React Compiler's own lint rule refuses
     (`react-hooks/purity`), so the timestamp useFieldSaveStatus compares
     against is `finding.updatedAt`, already stamped by updateFinding
     itself (store.ts, same set() call as lastSavedAt) the moment this
     edit actually lands — not a second, independently-read clock that
     could disagree with it. Reset to false on every finding change (the
     `key={finding.id}` the caller already passes remounts this component
     per finding, so this is really "edited since THIS finding opened,"
     not carried stale from the last one). */
  const [dirty, setDirty] = useState(false);
  function onChange(patch: Partial<RiskPatch>) {
    setDirty(true);
    onChangeProp(patch);
  }
  const saveStatus = useFieldSaveStatus(dirty ? (finding.updatedAt ?? null) : null);

  /* PRIORITY 4 (review redesign) — "allow editing of Discipline, Asset
     system and Audit check. Prevent incompatible hierarchy links."
     Discipline is required (the type itself never allows it empty); Asset
     system and Audit check are both optional ("General"), stored as ""
     and null respectively — same convention ReviewRiskTable's own display
     already reads (f.system ? f.system : "General"), never a sentinel
     string like "General" written into the record itself.

     Changing discipline can orphan the system/check the auditor had
     picked (a system/check that belongs to the OLD discipline, not the
     new one) — cleared here rather than left pointing at a hierarchy
     level that no longer lines up, which is what "prevent incompatible
     links" means for an edit rather than a filter. Changing system alone
     can equally orphan just the check. There is nothing to extract from
     ReviewRiskTable's own discipline→system FILTER logic (a different
     problem: narrowing options, not clearing a stored value) — this is
     self-contained, entity-scoped register reads, same functions. */
  const disciplineOptions = disciplinesAt(entityCode);
  const systemOptions = systemsOf(entityCode, finding.discipline);
  const checkOptions = checksOf(entityCode, finding.discipline, finding.system || undefined);

  function onDisciplineChange(nextDiscipline: string) {
    const validSystems = systemsOf(entityCode, nextDiscipline);
    const nextSystem = finding.system && validSystems.includes(finding.system) ? finding.system : "";
    const validCheckIds = new Set(
      checksOf(entityCode, nextDiscipline, nextSystem || undefined).map((c) => c.id)
    );
    const nextCheckId = finding.checkId && validCheckIds.has(finding.checkId) ? finding.checkId : null;
    onChange({ discipline: nextDiscipline, system: nextSystem, checkId: nextCheckId });
  }

  function onSystemChange(nextSystem: string) {
    const validCheckIds = new Set(
      checksOf(entityCode, finding.discipline, nextSystem || undefined).map((c) => c.id)
    );
    const nextCheckId = finding.checkId && validCheckIds.has(finding.checkId) ? finding.checkId : null;
    onChange({ system: nextSystem, checkId: nextCheckId });
  }

  /* PRIORITY 4 — "Show all relevant... compliance assessments, clearly
     identifying their source." For a finding with no checkId there is no
     check-level compliance to show at all — the summary below is omitted
     entirely, not rendered empty. For one that has it, this reads the
     EXACT same three axes and the exact same derivation ReviewDetail.tsx's
     own sticky compliance strip uses (reviewCombinedCompliance/
     evidenceAxisFor, src/lib/review.ts) — never re-derived, and never
     editable here: editing happens on the real "By check" tab, which
     "Open" below hands off to. */
  const responses = useResponses();
  const evidenceItems = useEvidenceItems();
  const linkedCheck = useMemo(
    () => (finding.checkId ? checksAt(entityCode).find((c) => c.id === finding.checkId) : undefined),
    [entityCode, finding.checkId]
  );
  const linkedResponse = finding.checkId ? responses[finding.checkId] : undefined;
  const linkedEvidenceAxis = useMemo(() => {
    if (!linkedResponse || !finding.checkId) return null;
    const forThisCheck = evidenceItems.filter((e) => e.checkIds.includes(finding.checkId!));
    return evidenceAxisFor(linkedResponse.evidenceVerdict, forThisCheck);
  }, [linkedResponse, evidenceItems, finding.checkId]);
  const linkedCombined = linkedResponse
    ? reviewCombinedCompliance(linkedResponse.compliance, linkedEvidenceAxis, linkedResponse.siteInspection)
    : null;

  /* PRIORITY 7 (review redesign) — "Suggest wording" beside the
     description. Reuses the existing "polish" task/polishContext
     (src/lib/assistPrompts.ts, src/lib/assist.ts) rather than a new
     prompt — polishContext's own doc comment names "a finding's title"
     as exactly the `about` argument this call supplies, and "polish" was
     already written, reviewed and shares SYSTEM's house rules (never
     invent a fact; the auditor decides); it had simply never been called
     from anywhere before this. EPHEMERAL, ON PURPOSE, same convention as
     EvidenceReviewPanel's own suggestion state: nothing is written until
     Accept, and Reject clears this local state rather than persisting a
     rejected draft anywhere — see this file's own onChange wrapper for
     why `key={finding.id}` is what resets it between findings, not an
     effect here.

     16 Nov 2026 — WIDENED CONTEXT. Sarel: "have a look at the discipline,
     asset system, and the audit check that is linked to the finding... to
     reword and describe the audit finding in that context... make sure
     all facts are double checked for the correct airport." polishContext
     now also takes the linked check's own requirement text (so the
     rewrite speaks to what ACSA actually asked for, not a generic
     tidy-up) and the entity's full airport name (feeds SYSTEM's new
     house rule 8 — never name or cite a different airport). Both come
     from state this panel already computes: `linkedCheck` above, and
     `entityCode` the caller already passes in. */
  const aiOn = useAssistAvailable();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [editingSuggestion, setEditingSuggestion] = useState(false);
  const [suggestionEditText, setSuggestionEditText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  /* REVERT, AFTER ACCEPTING — Sarel: "find some user-friendly way that we
     can... revert back to the old notes." Accept used to simply overwrite
     `description` with no way back; this remembers what it overwrote (one
     level, the same "last edit" depth every other undo in this app keeps)
     so a second tap can put it back. Cleared whenever a FRESH suggestion
     is generated or the finding changes (key={finding.id} on the caller
     unmounts this anyway), so "revert" never reaches back past the
     suggestion that is actually on screen. */
  const [preAcceptDescription, setPreAcceptDescription] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  async function runPolish() {
    setAiBusy(true);
    setAiError(null);
    try {
      const text = await assist(
        "polish",
        polishContext(
          finding.description,
          finding.discipline,
          finding.system,
          "note",
          finding.title || undefined,
          linkedCheck?.requirement,
          entityOf(entityCode).name
        )
      );
      setSuggestion(text.trim());
      setEditingSuggestion(false);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "The assistant is unavailable.");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sticky header + close — independent of the scrollable body below,
          so the close control is never scrolled out of reach on a long
          finding, same reasoning ReviewDetail.tsx's own sticky header
          gives for the compliance strip. */}
      <div
        className="sticky top-0 z-[2] flex shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
      >
        <div className="flex items-center gap-[8px]">
          <b className="font-display text-[11.5px] font-semibold">Finding</b>
          <SaveStatusPill status={saveStatus} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close finding panel"
          className="rounded-[6px] px-[7px] py-[3px] text-[12px] font-semibold"
          style={{ color: "var(--ink-3)" }}
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {/* 0 — the Type tag. GENUINELY NEW (see
          docs/capture-review/review-table-v2-discovery.md §2): neither
          issueIndex nor adHoc says whether this is a rule violation or a
          milder observation, so this is a real choice for the auditor,
          defaulting to Non-compliance — see findingTypeFor's own doc
          comment for why. */}
      <div className="mb-2 font-display text-[11px] font-semibold">Type</div>
      <div className="mb-3.5 flex gap-[6px]">
        {(["non-compliance", "observation"] as const).map((t) => (
          <Chip key={t} selected={type === t} onClick={() => onChange({ findingType: t })}>
            {FINDING_TYPE_LABEL[t]}
          </Chip>
        ))}
      </div>

      {/* PRIORITY 4 — "Linked to", same label EvidenceReviewPanel's own
          hierarchy editor already uses for the same three levels, so a
          reviewer who has seen one recognises the other. Discipline is
          required; Asset system and Audit check both offer "General". */}
      <div className="mb-2 font-display text-[11px] font-semibold">Linked to</div>
      <label className="mb-2 block">
        <span className="label-xs">Discipline</span>
        <select
          value={finding.discipline}
          onChange={(e) => onDisciplineChange(e.target.value)}
          className="mt-1 w-full rounded-[8px] border px-2.5 py-2 text-[12.5px] outline-none focus:border-[var(--acc)]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
        >
          {disciplineOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-2 block">
        <span className="label-xs">Asset system</span>
        <select
          value={finding.system || ""}
          onChange={(e) => onSystemChange(e.target.value)}
          className="mt-1 w-full rounded-[8px] border px-2.5 py-2 text-[12.5px] outline-none focus:border-[var(--acc)]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
        >
          <option value="">General (no asset system)</option>
          {systemOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3.5 block">
        <span className="label-xs">Audit check</span>
        <select
          value={finding.checkId ?? ""}
          onChange={(e) => onChange({ checkId: e.target.value || null })}
          className="mt-1 w-full rounded-[8px] border px-2.5 py-2 text-[12.5px] outline-none focus:border-[var(--acc)]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
        >
          <option value="">General (no audit check)</option>
          {checkOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.requirement.slice(0, 80)}
            </option>
          ))}
        </select>
      </label>

      {/* PRIORITY 4/7 — notes, photos and recordings this finding carries
          itself, clearly labelled as THIS finding's own capture (not the
          linked check's — Response.attachments is a separate pool, see
          Finding.attachments' own doc comment in types.ts). The
          description is editable here (PRIORITY 7 needs an ordinary field
          for "Suggest wording" to improve); attachments stay read-only —
          editing a finding's own photo/voice capture happens wherever it
          was raised, this panel only shows it. */}
      <div className="mb-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-[11px] font-semibold">
            Notes, photos &amp; recordings — this finding
          </span>
          {aiOn && (
            <AiSuggestButton
              disabled={!finding.description.trim() || aiBusy}
              busy={aiBusy}
              onRun={() => void runPolish()}
            />
          )}
        </div>
        {/* 16 Nov 2026 — only labelled "Original" while there is something
            to compare it against (a pending suggestion, or wording just
            accepted and still revertible) — the rest of the time this is
            simply the description field, same as always. */}
        {(suggestion || preAcceptDescription !== null) && (
          <div className="label-xs mb-1" style={{ color: "var(--ink-4)" }}>
            {preAcceptDescription !== null ? "Current (AI wording applied)" : "Original"}
          </div>
        )}
        <textarea
          value={finding.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="What was found, in the auditor's own words…"
          className="mb-2 min-h-[72px] w-full resize-y rounded-[8px] border px-2.5 py-2 text-[12.5px] outline-none focus:border-[var(--acc)]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
        />
        {/* REVERT, AND THE "COMBINED" VIEW — Sarel: "have the option to
            toggle between original notes and AI cleaned notes... maybe
            also an option to see the combination of the two... if needed,
            revert back to the old notes." Shown only while
            preAcceptDescription holds something (set by Accept below,
            cleared by Revert or Dismiss) — a quiet strip, not a second
            suggestion card, since by this point the auditor already
            decided once. "Show original" expands the exact text Accept
            overwrote, right here, so "current" and "original" are both on
            screen together — the combined view — without a diff
            renderer. Revert calls the SAME onChange every other edit here
            uses, with that remembered text. */}
        {preAcceptDescription !== null && (
          <div
            className="mb-2 rounded-[8px] border p-2.5 text-[11.5px]"
            style={{ borderColor: "var(--line-2)", background: "var(--sunken)" }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span style={{ color: "var(--ink-3)" }}>
                AI wording applied to this finding&rsquo;s notes.
              </span>
              <div className="flex shrink-0 gap-[6px]">
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className="text-[10.5px] font-semibold underline"
                  style={{ color: "var(--ink-2)" }}
                >
                  {showOriginal ? "Hide original" : "Show original"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ description: preAcceptDescription });
                    setPreAcceptDescription(null);
                    setShowOriginal(false);
                  }}
                  className="text-[10.5px] font-semibold underline"
                  style={{ color: "var(--bad)" }}
                >
                  Revert
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreAcceptDescription(null);
                    setShowOriginal(false);
                  }}
                  aria-label="Dismiss — keep the AI wording, stop offering to revert"
                  className="text-[10.5px]"
                  style={{ color: "var(--ink-4)" }}
                >
                  ✕
                </button>
              </div>
            </div>
            {showOriginal && (
              <p className="whitespace-pre-wrap" style={{ color: "var(--ink-3)" }}>
                {preAcceptDescription || <em>(was blank)</em>}
              </p>
            )}
          </div>
        )}
        {aiError && (
          <p role="alert" className="mb-2 text-[11px] font-semibold" style={{ color: "var(--bad)" }}>
            {aiError}
          </p>
        )}
        {/* PRIORITY 7 — "Every AI change must be a proposal requiring
            review and approval. Rejection leaves the original untouched."
            Exact same ephemeral Accept/Edit/Reject shape
            EvidenceReviewPanel.tsx already uses for its own suggestions —
            nothing here is written until Accept; Reject only clears this
            local state. */}
        {suggestion && (
          <div
            className="mb-2 rounded-[8px] border p-2.5 text-[12px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          >
            <div className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>
              Suggested wording · yours to accept, edit or reject
            </div>
            {editingSuggestion ? (
              <textarea
                value={suggestionEditText}
                onChange={(e) => setSuggestionEditText(e.target.value)}
                rows={3}
                aria-label="Edit the suggestion before accepting"
                className="mb-2 w-full resize-y rounded-[6px] border px-2 py-1.5 text-[12px]"
                style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
              />
            ) : (
              <p className="mb-2 whitespace-pre-wrap">{suggestion}</p>
            )}
            <div className="flex gap-[6px]">
              <button
                type="button"
                onClick={() => {
                  /* The revert strip's own compare point — what Accept is
                     about to overwrite, remembered before it's gone. */
                  setPreAcceptDescription(finding.description);
                  setShowOriginal(false);
                  onChange({ description: editingSuggestion ? suggestionEditText : suggestion });
                  setSuggestion(null);
                  setEditingSuggestion(false);
                }}
                className="rounded-[6px] px-[9px] py-[5px] text-[11px] font-semibold"
                style={{ background: "var(--acc)", color: "#fff" }}
              >
                Accept
              </button>
              {!editingSuggestion && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSuggestion(true);
                    setSuggestionEditText(suggestion);
                  }}
                  className="rounded-[6px] border px-[9px] py-[5px] text-[11px] font-semibold"
                  style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSuggestion(null);
                  setEditingSuggestion(false);
                }}
                className="rounded-[6px] px-[9px] py-[5px] text-[11px] font-semibold"
                style={{ color: "var(--bad)" }}
              >
                Reject
              </button>
            </div>
          </div>
        )}
        {finding.attachments.length > 0 && <AttachmentStrip attachments={finding.attachments} thumbSize={56} />}
      </div>

      {/* PRIORITY 4 — "compliance assessments, clearly identifying their
          source." Omitted entirely with no checkId: there is no check-
          level compliance to show. Read-only summary, never a second
          place to edit it — "Open" hands off to the real screen. */}
      {finding.checkId && linkedResponse && (
        <div className="mb-3.5 rounded-[11px] border p-2.5" style={{ borderColor: "var(--line-2)" }}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-display text-[11px] font-semibold">From linked audit check</span>
            <button
              type="button"
              onClick={() => onOpenCheck(finding.checkId!)}
              className="text-[10.5px] font-semibold underline"
              style={{ color: "var(--acc)" }}
            >
              Open in By check
            </button>
          </div>
          {linkedCheck && (
            <div className="mb-1.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
              {linkedCheck.requirement.slice(0, 110)}
            </div>
          )}
          <div className="flex flex-wrap gap-[6px]">
            <ComplianceChip label="Audit check" value={linkedResponse.compliance} />
            <ComplianceChip label="Evidence" value={linkedEvidenceAxis} />
            <ComplianceChip label="Site inspection" value={linkedResponse.siteInspection} />
            <ComplianceChip label="Combined" value={linkedCombined} />
          </div>
        </div>
      )}

      {/* 4 — Impact areas. Zero or more, same chip-toggle shape as root
          cause categories below. */}
      <div className="mb-2 font-display text-[11px] font-semibold">Impact areas</div>
      <div className="mb-3.5 flex flex-wrap gap-[5px]">
        {IMPACT_AREAS.map((area) => (
          <Chip
            key={area}
            selected={(finding.impactAreas ?? []).includes(area)}
            onClick={() => onChange({ impactAreas: toggleMulti(finding.impactAreas, area) })}
          >
            {area}
          </Chip>
        ))}
        {(finding.impactAreas ?? []).length === 0 && (
          <span className="text-[11px]" style={{ color: "var(--ink-4)" }}>
            None selected
          </span>
        )}
      </div>

      {/* 5 — Root cause categories, then the note, then Confirmed. */}
      <div className="mb-2 font-display text-[11px] font-semibold">Root cause categories</div>
      <div className="mb-2 flex flex-wrap gap-[5px]">
        {ROOT_CAUSES.map((rc) => (
          <Chip
            key={rc}
            selected={(finding.rootCauseCategories ?? []).includes(rc)}
            onClick={() =>
              onChange({ rootCauseCategories: toggleMulti(finding.rootCauseCategories, rc) })
            }
          >
            {rc}
          </Chip>
        ))}
        {(finding.rootCauseCategories ?? []).length === 0 && (
          <span className="text-[11px]" style={{ color: "var(--ink-4)" }}>
            None selected
          </span>
        )}
      </div>

      <label className="mb-2 block">
        <span className="label-xs">Possible root cause / contributing factor</span>
        <textarea
          value={finding.rootCauseNote ?? ""}
          onChange={(e) => onChange({ rootCauseNote: e.target.value })}
          placeholder="What might be behind this…"
          className="mt-1 min-h-[64px] w-full resize-y rounded-[8px] border px-2.5 py-2 text-[12.5px] outline-none focus:border-[var(--acc)]"
          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
        />
      </label>

      <label className="flex min-h-[32px] items-center gap-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
        <input
          type="checkbox"
          checked={!!finding.rootCauseConfirmed}
          onChange={(e) => onChange({ rootCauseConfirmed: e.target.checked })}
          className="h-[16px] w-[16px]"
        />
        Confirmed with airport
        {finding.rootCauseConfirmed ? (
          <Pill tone="good">Confirmed</Pill>
        ) : (
          <Pill tone="neutral">Not confirmed</Pill>
        )}
      </label>

      <EvidenceSection finding={finding} />
      </div>
    </div>
  );
}

/** REVIEW TABLE V2 — evidence at any level of the hierarchy, from this
 *  finding's own panel. See docs/capture-review/review-table-v2-discovery.md
 *  §3: "reusing the same EvidenceItem record and the real /evidence page's
 *  own request-creation logic — not a second, parallel evidence-request
 *  mechanism." This does not re-implement that form: it mints a stub record
 *  with the SAME store action `/evidence`'s own "Log it" button calls
 *  (`addEvidenceItem`), seeded with whichever of this finding's
 *  discipline/system/check the auditor picked, then hands off to the real
 *  page — deep-linked straight to the new row — to fill in who it was asked
 *  of, medium, custody and the rest. */
function EvidenceSection({ finding }: { finding: Finding }) {
  const router = useRouter();
  const items = useEvidenceItems();
  const addEvidenceItem = useStore((s) => s.addEvidenceItem);

  /* Scoped to whichever of this finding's three levels an item was raised
     against — a document bearing on the whole discipline is just as
     relevant here as one bearing on this exact check. */
  const scoped = items.filter(
    (e) =>
      (!!finding.checkId && e.checkIds.includes(finding.checkId)) ||
      (!!finding.system && e.system === finding.system) ||
      (!!finding.discipline && e.discipline === finding.discipline)
  );

  const request = (seed: { discipline?: string; system?: string; checkIds?: string[] }, label: string) => {
    const id = addEvidenceItem(`Evidence for ${finding.title || label}`, seed);
    router.push(`/evidence?open=${id}`);
  };

  return (
    <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--line-2)" }}>
      <div className="mb-2 font-display text-[11px] font-semibold">Evidence</div>

      {scoped.length === 0 ? (
        <div className="mb-2 text-[11px]" style={{ color: "var(--ink-4)" }}>
          Nothing requested yet for this check, asset system or discipline.
        </div>
      ) : (
        <div className="mb-2 flex flex-col gap-[4px]">
          {scoped.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => router.push(`/evidence?open=${e.id}`)}
              className="flex items-center justify-between gap-2 rounded-[8px] border px-2 py-[6px] text-left text-[11px]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            >
              <span className="min-w-0 truncate">{e.title || e.id}</span>
              <Pill tone={trackingStage(e) === "analysis" ? "good" : trackingStage(e) === "received" ? "good" : trackingStage(e) === "requested" ? "warn" : "neutral"}>
                {TRACKING_LABEL[trackingStage(e)]}
              </Pill>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-[6px]">
        {finding.checkId && (
          <SmallBtn onClick={() => request({ checkIds: [finding.checkId!] }, "this check")}>
            Request for this check
          </SmallBtn>
        )}
        {finding.system && (
          <SmallBtn onClick={() => request({ system: finding.system }, finding.system)}>
            Request for {finding.system}
          </SmallBtn>
        )}
        {finding.discipline && (
          <SmallBtn onClick={() => request({ discipline: finding.discipline }, finding.discipline)}>
            Request for {finding.discipline} (discipline)
          </SmallBtn>
        )}
      </div>
    </div>
  );
}

/** PRIORITY 4 — one cell of the linked-check compliance summary. Read-only,
 *  same COMPLIANCE_TONE/COMPLIANCE_LABEL convention as ReviewDetail.tsx's
 *  own StatusCell (not imported — that component is local to its file),
 *  rendered as a Pill since this is a summary card, not the sticky strip. */
/** PRIORITY 7 — the button that kicks off a "polish" suggestion. A small,
 *  ordinary button rather than Btn (ui/primitives.tsx's bigger control) —
 *  this sits beside a section label, not in a toolbar. */
function AiSuggestButton({
  disabled,
  busy,
  onRun,
}: {
  disabled: boolean;
  busy: boolean;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onRun}
      title={disabled && !busy ? "Type something first — there is nothing to improve yet." : undefined}
      className="rounded-[6px] px-[8px] py-[3px] text-[10.5px] font-semibold disabled:opacity-40"
      style={{ color: "var(--acc)" }}
    >
      ✦ {busy ? "Thinking…" : "Suggest wording"}
    </button>
  );
}

function ComplianceChip({ label, value }: { label: string; value: Compliance | null }) {
  return (
    <Pill tone={value ? COMPLIANCE_TONE[value] : "neutral"}>
      {label}: {value ? COMPLIANCE_LABEL[value] : "Not verified"}
    </Pill>
  );
}

function SmallBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[8px] border px-[9px] py-[6px] text-[10.5px] font-semibold"
      style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
    >
      {children}
    </button>
  );
}

