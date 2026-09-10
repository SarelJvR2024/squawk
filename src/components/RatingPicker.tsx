"use client";

/** SEVERITY AND LIKELIHOOD, PICKED ONE AXIS AT A TIME.
 *
 *  Sarel, on the asset-system screen: "remove the large rating matrix, make it
 *  more simple to select severity and likelihood."
 *
 *  The 5×5 grid is 25 cells, about 300px tall and 340px wide, and it is the
 *  right control on the findings and hazard screens — the group argues over a
 *  cell and points at it. On the asset-system screen it is the largest thing on
 *  the page, above the evidence it is supposed to be agreed FROM, and rating 75
 *  asset systems through it means 75 encounters with a wall of squares. Two rows
 *  of five is the same choice in a fifth of the height.
 *
 *  WHAT IS NOT ALLOWED TO DRIFT, and does not:
 *
 *  - The vocabulary is B170 001M's, imported from src/lib/risk.ts — the same
 *    SEVERITIES and LIKELIHOODS the matrix draws. Neither control owns the
 *    scale, so a corrected label reaches both.
 *  - The band and the treatment strategy come from bandFor()/BAND_META, never
 *    from anything typed here.
 *  - **A half-set rating is not a rating.** The matrix agrees the rating in the
 *    same gesture that sets it, because tapping a cell is inherently a complete
 *    choice. Two axes can be half-answered, so `ratingConfirmed` goes true only
 *    when BOTH are set, and picking one alone leaves the record unconfirmed and
 *    the panel saying which half is missing. That is the same rule the matrix
 *    enforces by its shape; here it is enforced by the code.
 *
 *  THE NUMBER AND THE LETTER ARE INSIDE THE LABEL — "A - Catastrophic",
 *  "4 - Occasional" — because getting the direction of either scale backwards
 *  inverts the whole matrix and nothing would say so. The button shows the
 *  character because five words will not fit five across on a tablet; the whole
 *  label is its accessible name and its tooltip, and the chosen one is written
 *  out in full underneath, so the word is never only in a hover. */

import { LIKELIHOODS, LIKELIHOOD_DEF, SEVERITIES, SEVERITY_DEF } from "@/lib/risk";
import type { Likelihood, Severity } from "@/lib/types";

export default function RatingPicker({
  severity,
  likelihood,
  onChange,
}: {
  severity: Severity | null;
  likelihood: Likelihood | null;
  /** The caller owns the write. `ratingConfirmed` is decided here, because the
   *  rule about half-set ratings belongs with the control that can create one. */
  onChange: (p: {
    severity: Severity | null;
    likelihood: Likelihood | null;
    ratingConfirmed: boolean;
  }) => void;
}) {
  const set = (s: Severity | null, l: Likelihood | null) =>
    onChange({ severity: s, likelihood: l, ratingConfirmed: !!s && !!l });

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <Axis
        label="Severity"
        hint="ACSA B170 001M cl. 4.3.1"
        options={SEVERITIES}
        value={severity}
        def={(o) => {
          const d = SEVERITY_DEF[o.charAt(0)];
          return `${o} — ${d.consequence}. ${d.example}`;
        }}
        onPick={(v) => set(v as Severity | null, likelihood)}
      />
      <Axis
        label="Likelihood"
        hint="cl. 4.3.2"
        options={LIKELIHOODS}
        value={likelihood}
        def={(o) => {
          const d = LIKELIHOOD_DEF[o.charAt(0)];
          return `${o}${d.gloss ? ` (${d.gloss})` : ""} — ${d.meaning}`;
        }}
        onPick={(v) => set(severity, v as Likelihood | null)}
      />
    </div>
  );
}

function Axis({
  label,
  hint,
  options,
  value,
  def,
  onPick,
}: {
  label: string;
  hint: string;
  options: string[];
  value: string | null;
  def: (o: string) => string;
  onPick: (v: string | null) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <b className="font-display text-[11px] font-semibold">{label}</b>
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {hint}
        </span>
      </div>
      <div role="radiogroup" aria-label={label} className="flex gap-[5px]">
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={def(o)}
              title={def(o)}
              /* Pressing the chosen one again clears it. An auditor who tapped
                 C by mistake has to be able to get back to unrated — unrated is
                 honest and a wrong C is not — and clearing one axis takes the
                 rating back to unconfirmed, which is what a half-set rating is. */
              onClick={() => onPick(on ? null : o)}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-[9px] border-[1.5px] font-mono text-[13px] font-semibold transition-[var(--t)]"
              style={
                on
                  ? { background: "var(--acc)", borderColor: "var(--acc)", color: "#fff" }
                  : {
                      background: "var(--panel)",
                      borderColor: "var(--line-2)",
                      color: "var(--ink-2)",
                    }
              }
            >
              {o.charAt(0)}
            </button>
          );
        })}
      </div>
      {/* THE CHOICE, IN WORDS. A letter on its own is not a severity anybody can
          check, and the definition must not live only in a tooltip on a device
          that has no hover. */}
      <div
        className="mt-1 text-[10.5px] leading-[1.45]"
        style={{ color: value ? "var(--ink-2)" : "var(--ink-4)" }}
      >
        {value ?? `Not picked — ${options.length} to choose from`}
      </div>
    </div>
  );
}
