"use client";

/** THE "RISK" SECTION of the Review risk-fields addendum's right panel — §3.
 *  One finding (an observation or non-compliance) at a time, in the order the
 *  addendum asks for: Severity, Likelihood, a mini matrix with the result,
 *  Impact areas, Root cause categories + notes + Confirmed toggle.
 *
 *  REUSES RATHER THAN INVENTS, per the discovery note: Severity/Likelihood
 *  are the exact same segmented-button control the asset-system screen uses
 *  (RatingPicker.tsx) — not a third rating control. The mini matrix below it
 *  is new, but it is a READ-ONLY VISUALISATION of the cell RatingPicker just
 *  set, not a second input mechanism: tapping a cell in the big matrix on
 *  /findings and /hazards (RecordActions.tsx) sets severity+likelihood
 *  together in one gesture; here the two axes are already set by
 *  RatingPicker's own segmented buttons, so a second clickable matrix next to
 *  it would just be two controls fighting over one answer. The matrix is kept
 *  small deliberately — the addendum calls for a "mini" one, and this screen
 *  already has a table of many findings to its left, unlike /findings' one
 *  asset-system-at-a-time screen where the full-size matrix earns its room.
 *
 *  Every number and word on this panel comes from src/lib/risk.ts and
 *  src/lib/reviewRisk.ts — nothing here restates a severity/likelihood
 *  definition or a band label, for the same reason risk.ts's own header
 *  explains at length. */

import { useRouter } from "next/navigation";
import { LIKELIHOOD_DEF, LIKELIHOODS, SEVERITIES, SEVERITY_DEF, BAND_META, bandFor } from "@/lib/risk";
import {
  FINDING_TYPE_LABEL,
  IMPACT_AREAS,
  ROOT_CAUSES,
  findingTypeFor,
  priorityFor,
  toggleMulti,
} from "@/lib/reviewRisk";
import { TRACKING_LABEL, trackingStage } from "@/lib/evidence";
import { useStore, useEvidenceItems } from "@/lib/store";
import RatingPicker from "@/components/RatingPicker";
import { Chip, Pill } from "@/components/ui/primitives";
import type { Finding, Likelihood, Severity } from "@/lib/types";

export type RiskPatch = Pick<
  Finding,
  | "severity"
  | "likelihood"
  | "ratingConfirmed"
  | "impactAreas"
  | "rootCauseCategories"
  | "rootCauseNote"
  | "rootCauseConfirmed"
  | "findingType"
>;

export default function ReviewRiskPanel({
  finding,
  onChange,
}: {
  finding: Finding;
  /** The caller owns the write (ReviewPage calls updateFinding), same
   *  division of labour as RecordActions' own onChange. */
  onChange: (patch: Partial<RiskPatch>) => void;
}) {
  const priority = priorityFor(finding);
  const type = findingTypeFor(finding);

  return (
    <div>
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

      <div className="mb-2 font-display text-[11px] font-semibold">Risk</div>

      {/* 1 & 2 — Severity, then Likelihood. Same control, same vocabulary,
          as the asset-system screen; `ratingConfirmed` is decided by
          RatingPicker itself, true only once BOTH axes are set, never typed
          directly — this panel renders no input bound to the rating. */}
      <RatingPicker
        severity={finding.severity}
        likelihood={finding.likelihood}
        onChange={(p) => onChange(p)}
      />

      {/* 3 — the mini matrix, and the result. Read-only: see this file's own
          header for why it is not a second way to set the cell. */}
      <div className="mt-3 mb-3.5">
        <MiniMatrix severity={finding.severity} likelihood={finding.likelihood} />
        <div
          className="mt-2 flex flex-wrap items-center gap-2 rounded-[11px] px-[13px] py-[10px] font-display text-[12.5px] font-bold"
          style={
            priority
              ? {
                  background: `var(--${priority.tone}-bg)`,
                  color: `var(--${priority.tone})`,
                }
              : { background: "var(--sunken)", color: "var(--ink-3)", fontWeight: 500, fontSize: 12 }
          }
        >
          {priority ? (
            <>
              <span>{priority.label}</span>
              {finding.severity && finding.likelihood && (
                <span className="font-sans text-[11px] font-normal opacity-80">
                  {BAND_META[bandFor(finding.severity, finding.likelihood)!].strategy}
                </span>
              )}
            </>
          ) : (
            "Not rated — pick severity and likelihood above"
          )}
        </div>
      </div>

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

/** A small, read-only 5×5 grid — severity down, likelihood across, same
 *  orientation as RecordActions' full-size matrix — with the chosen cell
 *  highlighted in its band colour. Not a `<button>` anywhere: see this
 *  file's own header for why this control does not also set the rating. */
function MiniMatrix({
  severity,
  likelihood,
}: {
  severity: Severity | null;
  likelihood: Likelihood | null;
}) {
  return (
    <table aria-label="Severity by likelihood, B170 001M" style={{ borderSpacing: 2, borderCollapse: "separate" }}>
      <thead>
        <tr>
          <th className="w-[14px]" />
          {LIKELIHOODS.map((l) => (
            <th
              key={l}
              title={`${l} — ${LIKELIHOOD_DEF[l.charAt(0)].meaning}`}
              className="font-mono text-[7px] font-medium"
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
              title={`${s} — ${SEVERITY_DEF[s.charAt(0)].consequence}`}
              className="pr-[3px] text-right font-mono text-[7px] font-medium"
              style={{ color: "var(--ink-4)" }}
            >
              {s.charAt(0)}
            </th>
            {LIKELIHOODS.map((l) => {
              const band = bandFor(s, l)!;
              const picked = severity === s && likelihood === l;
              const tone = BAND_META[band].tone;
              return (
                <td key={l}>
                  <span
                    aria-hidden
                    className="block h-[14px] w-[14px] rounded-[3px]"
                    style={{
                      background: picked ? `var(--${tone}-solid)` : `var(--${tone}-bg)`,
                      boxShadow: picked ? "0 0 0 1.5px var(--acc)" : "none",
                    }}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
