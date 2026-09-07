"use client";

/** The rating and treatment block, written once.
 *
 *  A finding and a hazard are different things — one is what was observed, the
 *  other is the event it exposes — but what an auditor does to each is
 *  identical: pick a cell on B170 001M, agree it as a group, name the root
 *  cause, write the action, assign an owner and a date. That block was written
 *  once for the findings screen. The hazard register needs the same block, and
 *  a second copy of a risk matrix is precisely the kind of thing that drifts:
 *  one screen gets a corrected label and the other does not, and the register
 *  ends up carrying two vocabularies for one instrument.
 *
 *  So it lives here, and both screens render this.
 *
 *  Two rules this component enforces rather than hopes for:
 *
 *  - **A rating is not agreed until somebody taps the cell.** `ratingConfirmed`
 *    is set by the tap and by nothing else. A severity and likelihood seeded by
 *    an issue button, or proposed by the assistant, renders dashed and labelled
 *    "suggested" until then, and every count elsewhere ignores it.
 *  - **The ERM matrix is a separate instrument.** Where a record carries one
 *    (hazards do), this shows its state honestly. ACSA have not supplied the
 *    scale, so `erm.available()` is false and the block says so in words rather
 *    than rendering an empty picker that reads like "no risk". Nothing here
 *    derives an ERM rating from the B170 001M one. */

import { useState, type ReactNode } from "react";
import {
  BAND_META,
  LIKELIHOODS,
  LIKELIHOOD_DEF,
  SEVERITIES,
  SEVERITY_DEF,
  bandFor,
  cellCode,
} from "@/lib/risk";
import * as erm from "@/lib/erm";
import { ROOT_CAUSES, responsibleFor } from "@/lib/store";
import { useAssistAvailable } from "@/lib/assist";
import { Chip } from "@/components/ui/primitives";
import AssetPicker from "@/components/AssetPicker";
import { Btn } from "@/components/ui/primitives";
import { IconSpark } from "@/components/ui/icons";
import type {
  ActionStatus,
  ProgressNote,
  ErmConsequence,
  ErmLikelihood,
  Likelihood,
  Severity,
} from "@/lib/types";

/** The shape both findings and hazards satisfy. Deliberately structural: this
 *  component does not import either type, so it cannot start depending on a
 *  field only one of them has. */
export interface RatedRecord {
  id: string;
  severity: Severity | null;
  likelihood: Likelihood | null;
  ratingConfirmed: boolean;
  rootCause: string;
  action: string;
  owner: string;
  dueDate: string;
  actionStatus: ActionStatus;
  /** Which physical assets the record is about. Optional everywhere: plenty of
   *  findings are not about one — a missing register, an appointment nobody
   *  made. */
  assetIds?: string[];
  /** Only to SCOPE the asset picker to what the auditor can plausibly mean.
   *  A hazard spans disciplines, so it passes its first; an id has to pick one,
   *  a record does not. */
  discipline?: string;
  system?: string;
  /** Hazards only. Absent on findings, which are not rated on ERM. */
  ermConsequence?: ErmConsequence | null;
  ermLikelihood?: ErmLikelihood | null;
  ermConfirmed?: boolean;
  ermLikelihoodAssumed?: boolean;
}

export default function RecordActions({
  record,
  entityCode,
  onChange,
  onToast,
  secondOpinion,
  advice,
  showErm = false,
  /* The check screen wants the treatment fields without the matrix: the
     rating is agreed as a group at the findings register, but root cause and
     the action are captured on the day with the responsible person in the
     room. One component either way — writing the four fields twice is how
     they drift. */
  showRating = true,
  actionLabel = "Remediation action",
  progress,
  onProgress,
  footer,
}: {
  record: RatedRecord;
  entityCode: string;
  /** Every change goes through here. The caller owns the store write, so the
   *  same block updates a finding on one screen and a hazard on another. */
  onChange: (patch: Partial<RatedRecord>) => void;
  onToast?: (message: string) => void;
  /** Asks the model for a view on the rating. Omitted where there is nothing
   *  sensible to send; the button then does not render. */
  secondOpinion?: () => Promise<string>;
  /** RootCauseAdvice, rendered by the caller because it needs the record's own
   *  type and photographs. Slotted rather than duplicated. */
  advice?: ReactNode;
  showErm?: boolean;
  showRating?: boolean;
  actionLabel?: string;
  /** The dated log, when the caller keeps one. */
  progress?: ProgressNote[];
  onProgress?: (note: string) => void;
  footer?: ReactNode;
}) {
  const aiOn = useAssistAvailable();
  const [opinion, setOpinion] = useState<{ id: string; text: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const say = (m: string) => onToast?.(m);

  const band = bandFor(record.severity, record.likelihood);

  return (
    <>
      {/* B170 001M, likelihood across and severity down, exactly as the
          standard prints it. Tapping a cell sets both together and agrees the
          rating in the same gesture — the two were once separate selects, and
          a half-set rating is not a rating. */}
      {showRating && (
        <>
      <div className="mb-2 flex items-center justify-between">
        <b className="font-display text-[11px] font-semibold">
          Severity (rows) &times; Likelihood (columns)
        </b>
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          ACSA B170 001M · click the cell the group agrees on
        </span>
      </div>
      <div className="overflow-x-auto">
        <table style={{ borderSpacing: 5, borderCollapse: "separate" }}>
          <thead>
            <tr>
              <th
                className="pr-1.5 text-right font-mono text-[8px] font-medium"
                style={{ color: "var(--ink-4)" }}
              >
                S&nbsp;&darr;
              </th>
              {LIKELIHOODS.map((l) => (
                <th
                  key={l}
                  title={`${l} (${LIKELIHOOD_DEF[l.charAt(0)].gloss || "—"}) — ${LIKELIHOOD_DEF[l.charAt(0)].meaning}`}
                  className="p-[3px] font-mono text-[9px] font-medium"
                  style={{ color: "var(--ink-4)" }}
                >
                  {l.charAt(0)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SEVERITIES.map((s) => (
              <tr key={s}>
                <th
                  title={`${s} — ${SEVERITY_DEF[s.charAt(0)].consequence}. ${SEVERITY_DEF[s.charAt(0)].example}`}
                  className="pr-1.5 text-right font-mono text-[9px] font-medium"
                  style={{ color: "var(--ink-4)" }}
                >
                  {s.charAt(0)}
                </th>
                {LIKELIHOODS.map((l) => {
                  const b = bandFor(s, l)!;
                  const picked = record.severity === s && record.likelihood === l;
                  const tone = BAND_META[b].tone;
                  return (
                    <td key={l}>
                      <button
                        onClick={() => {
                          onChange({ severity: s, likelihood: l, ratingConfirmed: true });
                          say(`${cellCode(s, l)} → ${BAND_META[b].label}`);
                        }}
                        aria-label={`Severity ${s} by likelihood ${l} — ${b}, ${BAND_META[b].label}`}
                        className="h-[42px] w-[56px] rounded-[8px] border-[1.5px] font-mono text-[10.5px] font-semibold transition-[var(--t)]"
                        style={{
                          /* An AGREED cell is filled solid, the way the report
                             prints it. A suggestion keeps the soft tint. */
                          background:
                            picked && record.ratingConfirmed
                              ? `var(--${tone}-solid)`
                              : `var(--${tone}-bg)`,
                          color:
                            picked && record.ratingConfirmed
                              ? "var(--on-solid)"
                              : `var(--${tone})`,
                          borderColor: picked
                            ? record.ratingConfirmed
                              ? "var(--acc)"
                              : "var(--ink-4)"
                            : "transparent",
                          borderStyle: picked && !record.ratingConfirmed ? "dashed" : "solid",
                          boxShadow:
                            picked && record.ratingConfirmed ? "0 0 0 2px var(--acc-soft)" : "none",
                        }}
                      >
                        {cellCode(s, l)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="my-3 flex flex-wrap items-center gap-2 rounded-[11px] px-[15px] py-3 font-display text-[13.5px] font-bold"
        style={
          band
            ? record.ratingConfirmed
              ? {
                  background: `var(--${BAND_META[band].tone}-solid)`,
                  color: "var(--on-solid)",
                }
              : { background: `var(--${BAND_META[band].tone}-bg)`, color: `var(--${BAND_META[band].tone})` }
            : { background: "var(--sunken)", color: "var(--ink-3)", fontWeight: 500, fontSize: 12 }
        }
      >
        {band ? (
          <>
            <span>
              {cellCode(record.severity, record.likelihood)} · {band} — {BAND_META[band].label}
            </span>
            <span className="font-sans text-[11px] font-normal opacity-80">
              {BAND_META[band].strategy}
            </span>
            {!record.ratingConfirmed && (
              <span
                className="ml-auto rounded-full px-2 py-[3px] font-mono text-[9px] font-semibold tracking-[.04em] uppercase"
                style={{ background: "var(--panel)", color: "var(--ink-3)" }}
              >
                Suggested · click to agree
              </span>
            )}
          </>
        ) : (
          "Pick a cell to set severity and likelihood together"
        )}
      </div>

      {/* The ERM rating sits immediately under the B170 001M one, not further
          down behind unrelated fields — two ratings of the same thing belong
          next to each other, and separating them was a real defect once. */}
      {/* The ERM rating sits immediately under the B170 001M one, not further
          down behind unrelated fields — two ratings of the same thing belong
          next to each other, and separating them was a real defect once. */}
      {showErm && (
        <div
          className="mb-3.5 rounded-[11px] border px-[13px] py-[11px]"
          style={{ borderColor: "var(--line-2)", background: "var(--sunken)" }}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="label-xs">
              ACSA enterprise risk · J050 001FW cl. 9.2.2 · a separate instrument
            </span>
          </div>
          {/* Folded away. It is the right explanation and it is four lines
              long, which on a tablet is four lines the auditor scrolls past
              every single time after the first. The one sentence that changes
              what somebody does — that a carried likelihood is not an agreed
              one — is not in here; it appears as a warning at the point it is
              actually true. */}
          <details className="group mb-2">
            <summary
              className="flex cursor-pointer list-none items-center gap-1.5 py-[2px] text-[10.5px] select-none"
              style={{ color: "var(--ink-3)" }}
            >
              <span className="transition-transform group-open:rotate-90">›</span>
              Why this is a second instrument, not a second opinion
            </summary>
            <div className="mt-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
              Consequence runs 5 to 1, the opposite direction to B170 001M&rsquo;s A to E, and this
              likelihood is a <b>probability</b> where B170&rsquo;s is occurrence history. The two
              instruments disagree on five cells by design. Nothing here is derived from the rating
              above without you agreeing it. Clause 9.1.2: priorities I and II enter ACSA&rsquo;s
              Combined Assurance Coverage Plan.
            </div>
          </details>

          {/* Consequence down, likelihood across, exactly as cl. 9.2.2 prints
              it. One tap sets both and agrees them, the same gesture the B170
              matrix uses — and it clears the assumed-likelihood flag, because
              a cell somebody tapped is not a carried number. */}
          <div className="overflow-x-auto">
            <table style={{ borderSpacing: 4, borderCollapse: "separate" }}>
              <thead>
                <tr>
                  <th
                    className="pr-1.5 text-right font-mono text-[8px] font-medium"
                    style={{ color: "var(--ink-4)" }}
                  >
                    C&nbsp;&darr;
                  </th>
                  {erm.ERM_LIKELIHOODS.map((l) => (
                    <th
                      key={l}
                      title={`${l} — ${erm.ERM_LIKELIHOOD_DEF[l.charAt(0)]}`}
                      className="p-[3px] font-mono text-[9px] font-medium"
                      style={{ color: "var(--ink-4)" }}
                    >
                      {l.charAt(0)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {erm.ERM_CONSEQUENCES.map((c) => (
                  <tr key={c}>
                    <th
                      title={`${c} — ${erm.ERM_CONSEQUENCE_DEF[c.charAt(0)]}`}
                      className="pr-1.5 text-right font-mono text-[9px] font-medium"
                      style={{ color: "var(--ink-4)" }}
                    >
                      {c.charAt(0)}
                    </th>
                    {erm.ERM_LIKELIHOODS.map((l) => {
                      const p = erm.ermPriority(c, l)!;
                      const picked = record.ermConsequence === c && record.ermLikelihood === l;
                      const tone = erm.ERM_PRIORITY_META[p].tone;
                      return (
                        <td key={l}>
                          <button
                            onClick={() =>
                              onChange({
                                ermConsequence: c,
                                ermLikelihood: l,
                                ermConfirmed: true,
                                ermLikelihoodAssumed: false,
                              })
                            }
                            aria-label={`Consequence ${c} by likelihood ${l} — priority ${p}, ${erm.ERM_PRIORITY_META[p].tolerance}`}
                            className="h-[36px] w-[52px] rounded-[8px] border-[1.5px] font-mono text-[10px] font-semibold transition-[var(--t)]"
                            style={{
                              background:
                                picked && record.ermConfirmed
                                  ? `var(--${tone}-solid)`
                                  : `var(--${tone}-bg)`,
                              color:
                                picked && record.ermConfirmed
                                  ? "var(--on-solid)"
                                  : `var(--${tone})`,
                              borderColor: picked
                                ? record.ermConfirmed
                                  ? "var(--acc)"
                                  : "var(--ink-4)"
                                : "transparent",
                              borderStyle: picked && !record.ermConfirmed ? "dashed" : "solid",
                              boxShadow:
                                picked && record.ermConfirmed ? "0 0 0 2px var(--acc-soft)" : "none",
                            }}
                          >
                            {p}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(() => {
            const p = erm.ermPriority(record.ermConsequence ?? null, record.ermLikelihood ?? null);
            const suggest = () => {
              const g = erm.suggestErm(record.severity, record.likelihood);
              onChange({
                ermConsequence: g.consequence,
                ermLikelihood: g.likelihood,
                /* NOT confirmed. A carried rating that arrives agreed is the
                   silent derivation this instrument exists to prevent. */
                ermConfirmed: false,
                ermLikelihoodAssumed: g.likelihoodIsAssumed,
              });
              onToast?.("Carried across from B170 001M — check the likelihood, then agree it");
            };
            return (
              <>
                <div
                  className="mt-2 flex flex-wrap items-center gap-2 rounded-[9px] px-[11px] py-[8px] font-display text-[12px] font-bold"
                  style={
                    p
                      ? record.ermConfirmed
                        ? {
                            background: `var(--${erm.ERM_PRIORITY_META[p].tone}-solid)`,
                            color: "var(--on-solid)",
                          }
                        : {
                            background: `var(--${erm.ERM_PRIORITY_META[p].tone}-bg)`,
                            color: `var(--${erm.ERM_PRIORITY_META[p].tone})`,
                          }
                      : { background: "var(--panel)", color: "var(--ink-3)", fontWeight: 500, fontSize: 11 }
                  }
                >
                  {p ? (
                    <>
                      <span>
                        {erm.ermCell(record.ermConsequence ?? null, record.ermLikelihood ?? null)} ·
                        Priority {p} — {erm.ERM_PRIORITY_META[p].tolerance}
                      </span>
                      <span className="font-sans text-[10.5px] font-normal opacity-80">
                        {erm.ERM_PRIORITY_META[p].action}
                      </span>
                      {!record.ermConfirmed && (
                        <span
                          className="ml-auto rounded-full px-2 py-[3px] font-mono text-[8.5px] font-semibold tracking-[.04em] uppercase"
                          style={{ background: "var(--panel)", color: "var(--ink-3)" }}
                        >
                          Suggested · tap a cell to agree
                        </span>
                      )}
                    </>
                  ) : (
                    "No ERM rating set. Tap a cell, or carry the B170 rating across as a starting point."
                  )}
                </div>

                {/* Clause 9.1.2 is the reason this rating exists at all: it is
                    what decides whether the hazard reaches ACSA's Combined
                    Assurance Coverage Plan. Say so where the rating is made. */}
                {p && record.ermConfirmed && (
                  <div className="mt-1.5 text-[11px]" style={{ color: "var(--ink-2)" }}>
                    {erm.entersAssurancePlan(p)
                      ? "Enters the Combined Assurance Coverage Plan (cl. 9.1.2 — I and II as a minimum)."
                      : "Below the Combined Assurance Coverage Plan threshold (cl. 9.1.2)."}
                  </div>
                )}

                {/* The one thing that must not pass quietly. */}
                {record.ermLikelihoodAssumed && record.ermLikelihood && (
                  <div
                    className="mt-1.5 rounded-[7px] border px-[8px] py-[6px] text-[11px] leading-[1.5]"
                    style={{
                      background: "var(--warn-bg)",
                      borderColor: "var(--warn-line)",
                      color: "var(--warn)",
                    }}
                  >
                    <b>This likelihood was carried across, not agreed.</b> B170 001M likelihood is
                    occurrence history; ERM likelihood is a probability band
                    {record.ermLikelihood
                      ? ` (${erm.ERM_LIKELIHOOD_DEF[record.ermLikelihood.charAt(0)]})`
                      : ""}
                    . They are different questions — look at it again and tap the cell you mean.
                  </div>
                )}

                {record.severity && record.likelihood && (
                  <div className="mt-2">
                    <Btn variant="ghost" onClick={suggest}>
                      Carry the B170 rating across as a starting point
                    </Btn>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ACSA's own definitions, in the room, at the moment the group decides.
          The one-word label is not enough to rate against — "Remote" and
          "Occasional" mean specific things here, and an earlier version of this
          tool proved how easily a paraphrase shifts a whole register by a
          notch. */}
      <details className="group mb-3.5">
        <summary
          className="flex cursor-pointer list-none items-center gap-1.5 py-1 font-display text-[11px] font-semibold select-none"
          style={{ color: "var(--ink-3)" }}
        >
          <span className="transition-transform group-open:rotate-90">›</span>
          What the scales mean · B170 001M cl. 4.3.1–4.3.2, verbatim
        </summary>
        <div className="mt-1.5 grid gap-3 md:grid-cols-2">
          <div
            className="rounded-[11px] border p-3"
            style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
          >
            <div className="label-xs mb-1.5">Severity</div>
            {SEVERITIES.map((s) => (
              <div key={s} className="mb-[7px] text-[11.5px] leading-[1.45]">
                <b className="font-mono">{s.charAt(0)}</b> <b>{s.slice(4)}</b>
                <span style={{ color: "var(--ink-2)" }}>
                  {" "}
                  — {SEVERITY_DEF[s.charAt(0)].consequence}
                </span>
              </div>
            ))}
          </div>
          <div
            className="rounded-[11px] border p-3"
            style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
          >
            <div className="label-xs mb-1.5">Likelihood</div>
            {LIKELIHOODS.map((l) => {
              const d = LIKELIHOOD_DEF[l.charAt(0)];
              return (
                <div key={l} className="mb-[7px] text-[11.5px] leading-[1.45]">
                  <b className="font-mono">{l.charAt(0)}</b> <b>{l.slice(4)}</b>
                  {d.gloss && <span style={{ color: "var(--ink-3)" }}> ({d.gloss})</span>}
                  <span style={{ color: "var(--ink-2)" }}> — {d.meaning}</span>
                </div>
              );
            })}
          </div>
        </div>
      </details>

      {aiOn && secondOpinion && (
        /* A second opinion for the room, printed as text. It never moves the
           cell — the group does that, and the group can disagree with it. */
        <div className="mb-3.5">
          {opinion?.id === record.id ? (
            <div
              className="rounded-[11px] border p-3 text-[12px] leading-[1.55] whitespace-pre-line"
              style={{ borderColor: "var(--line-2)", background: "var(--sunken)" }}
            >
              <div className="label-xs mb-1.5">A second opinion · the group still decides</div>
              {opinion.text}
              <div className="mt-2.5">
                <Btn variant="ghost" onClick={() => setOpinion(null)}>
                  Dismiss
                </Btn>
              </div>
            </div>
          ) : (
            <button
              disabled={asking}
              onClick={async () => {
                setAsking(true);
                try {
                  setOpinion({ id: record.id, text: await secondOpinion() });
                } catch (err) {
                  say(err instanceof Error ? err.message : "The assistant is unavailable");
                } finally {
                  setAsking(false);
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
              {asking ? "Thinking…" : "Ask for a second opinion"}
            </button>
          )}
        </div>
      )}

        </>
      )}

      {/* WHICH asset, before WHY it failed. A planner reads the tag first and
          the root cause second, and capturing them in that order is how the
          conversation actually goes with the responsible person in the room. */}
      <div className="mb-3">
        <AssetPicker
          entityCode={entityCode}
          discipline={record.discipline}
          system={record.system}
          value={record.assetIds}
          onChange={(assetIds) => onChange({ assetIds })}
        />
      </div>

      <div className="mb-2 font-display text-[11px] font-semibold">Root cause</div>
      <div className="flex flex-wrap gap-[5px]">
        {ROOT_CAUSES.map((rc) => (
          <Chip
            key={rc}
            selected={record.rootCause === rc}
            onClick={() => onChange({ rootCause: rc })}
          >
            {rc}
          </Chip>
        ))}
      </div>
      {advice && <div className="mb-4">{advice}</div>}

      <div className="mb-2 font-display text-[11px] font-semibold">{actionLabel}</div>
      <textarea
        value={record.action}
        onChange={(e) => onChange({ action: e.target.value })}
        placeholder="What must happen…"
        className="min-h-[70px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label-xs">Owner</span>
          <select
            value={record.owner}
            onChange={(e) => onChange({ owner: e.target.value })}
            className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[11.5px]"
            style={{
              background: "var(--panel)",
              borderColor: record.owner ? "var(--line-2)" : "var(--warn-line)",
            }}
          >
            <option value="">{record.owner ? "Select…" : "⚠ unassigned"}</option>
            {responsibleFor(entityCode).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-xs">Target date</span>
          <input
            type="date"
            value={record.dueDate}
            onChange={(e) => onChange({ dueDate: e.target.value })}
            className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[11.5px]"
            style={{
              background: "var(--panel)",
              borderColor: record.dueDate ? "var(--line-2)" : "var(--warn-line)",
            }}
          />
        </label>
        <label className="block">
          <span className="label-xs">Action status</span>
          <select
            value={record.actionStatus}
            onChange={(e) => onChange({ actionStatus: e.target.value as ActionStatus })}
            className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[11.5px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          >
            {(["Open", "In progress", "Closed"] as ActionStatus[]).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {/* The dated log. ACSA's Progress/Update is one cell that gets typed
          over; this appends, and the export flattens it back into their cell.
          Rendered only where the caller keeps one, so nothing appears on a
          record that has nowhere to put it. */}
      {onProgress && (
        <>
          <div className="mt-4 mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <b className="font-display text-[11px] font-semibold">Progress</b>
            <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
              {progress?.length
                ? `${progress.length} update${progress.length === 1 ? "" : "s"}`
                : "nothing recorded yet"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && note.trim()) {
                  onProgress(note);
                  setNote("");
                  say("Progress recorded");
                }
              }}
              placeholder="What moved, in one line…"
              className="min-w-0 flex-1 rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
            <Btn
              disabled={!note.trim()}
              onClick={() => {
                onProgress(note);
                setNote("");
                say("Progress recorded");
              }}
            >
              Add to the log
            </Btn>
          </div>
          {(progress ?? []).map((n, i) => (
            <div key={`${n.at}-${i}`} className="mt-[6px] flex gap-2 text-[11.5px] leading-[1.5]">
              <span className="shrink-0 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                {new Date(n.at).toLocaleDateString("en-ZA", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <span style={{ color: "var(--ink-2)" }}>
                {n.note}
                <span className="ml-1.5 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  {n.by.split(" ")[0]}
                </span>
              </span>
            </div>
          ))}
        </>
      )}

      {footer}
    </>
  );
}
