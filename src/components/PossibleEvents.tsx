"use client";

/** THE HAZARDOUS EVENTS ONE FINDING COULD LEAD TO, EACH WITH ITS OWN LIKELIHOOD.
 *
 *  Sarel: "allow the capture of multiple possible hazardous events and the
 *  likelihood recorded for each finding."
 *
 *  Plural is the whole point. "TRF 02 at AS1 is off due to oil below the
 *  minimum threshold" is one finding with at least three futures — a trip that
 *  takes a stand off supply, a winding failure that costs a replacement and a
 *  lead time, an oil fire. They are not variations of one event: they have
 *  different likelihoods and different consequences, and an audit that records
 *  only the worst over-rates the common case while one that records only the
 *  likely under-rates the severe. Recording them separately is what makes a
 *  finding's risk arguable instead of asserted.
 *
 *  THE LIKELIHOOD IS ACSA B170 001M's 1–5, the same scale the finding's own
 *  rating uses. It is NOT the ERM instrument's. The two disagree on five of
 *  twenty-five cells and must never be derived from one another — see the
 *  header of src/lib/erm.ts.
 *
 *  THERE IS NO SEVERITY HERE, deliberately. A rating of record is agreed by the
 *  group on the matrix and lives on the Hazard. A severity typed into a
 *  follow-up screen would be a second, un-agreed rating for the same event,
 *  which is the drift `ratingConfirmed` exists to stop. Unrated is a real state
 *  and the default: what this captures is the auditor's list for that
 *  conversation, not the outcome of it. */

import { useState } from "react";
import type { Likelihood, PossibleEvent } from "@/lib/types";
import { LIKELIHOODS } from "@/lib/risk";
import { Btn } from "@/components/ui/primitives";
import { IconPlus, IconX } from "@/components/ui/icons";

export default function PossibleEvents({
  events,
  onAdd,
  onPatch,
  onRemove,
}: {
  events: PossibleEvent[];
  onAdd: (event: string) => void;
  onPatch: (id: string, p: Partial<PossibleEvent>) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  };

  return (
    <div className="mt-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <b className="font-display text-[11px] font-semibold">
          Possible hazardous events
        </b>
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {events.length === 0
            ? "none recorded"
            : `${events.length} · ${events.filter((e) => e.likelihood).length} with a likelihood`}
        </span>
      </div>
      <p className="mb-2 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-4)" }}>
        The event, not the paperwork — what actually goes wrong if this is not
        fixed. Record each one separately; one finding usually has more than one.
        The likelihood is B170 001M&rsquo;s 1&ndash;5. Severity is not asked here: that
        is the group&rsquo;s, agreed on the matrix.
      </p>

      {events.map((e) => (
        <div
          key={e.id}
          className="mb-1.5 rounded-[11px] border px-3 py-2.5"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        >
          <div className="flex items-start gap-2">
            <input
              value={e.event}
              onChange={(ev) => onPatch(e.id, { event: ev.target.value })}
              aria-label="The event"
              className="min-w-0 flex-1 rounded-[8px] border px-2.5 py-[7px] text-[12px] font-semibold outline-none focus:border-[var(--acc)]"
              style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
            />
            <button
              type="button"
              onClick={() => onRemove(e.id)}
              aria-label={`Remove ${e.event || "this event"}`}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border"
              style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
            >
              <IconX width={13} height={13} />
            </button>
          </div>

          {/* LIKELIHOOD, AND "NOT YET" IS ONE OF THE ANSWERS. Pressing the
              selected one again clears it — an auditor who tapped 4 by mistake
              must be able to get back to unrated, because unrated is honest and
              a wrong 4 is not. */}
          <div
            role="radiogroup"
            aria-label={`Likelihood of ${e.event || "this event"}`}
            className="mt-2 flex flex-wrap items-center gap-[5px]"
          >
            <span className="label-xs mr-1" style={{ color: "var(--ink-4)" }}>
              Likelihood
            </span>
            {LIKELIHOODS.map((l) => {
              const on = e.likelihood === l;
              /* B170 001M carries the number INSIDE the label — "4 -
                 Occasional" — because getting the direction of the scale
                 backwards inverts the whole matrix and nothing would say so.
                 The button shows the digit because five words will not fit five
                 across on a tablet; the whole label is the accessible name and
                 the tooltip, and the chosen one is written out in full
                 underneath, so the word is never only in a hover. */
              const num = l.split(" ")[0];
              return (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={l}
                  title={l}
                  onClick={() => onPatch(e.id, { likelihood: on ? null : (l as Likelihood) })}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border font-mono text-[12px] font-semibold transition-[var(--t)]"
                  style={
                    on
                      ? { background: "var(--acc)", borderColor: "var(--acc)", color: "#fff" }
                      : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                  }
                >
                  {num}
                </button>
              );
            })}
            {/* THE CHOICE, IN WORDS, and "unrated" is one of them. A number on
                its own is not a likelihood anybody can check. */}
            <span className="font-mono text-[9.5px]" style={{ color: e.likelihood ? "var(--ink-2)" : "var(--ink-4)" }}>
              {e.likelihood ?? "unrated"}
            </span>
          </div>

          <input
            value={e.note}
            onChange={(ev) => onPatch(e.id, { note: ev.target.value })}
            placeholder="Why it is that likely — optional, and worth more than the number alone"
            aria-label={`Why ${e.event || "this event"} is that likely`}
            className="mt-2 w-full rounded-[8px] border px-2.5 py-[7px] text-[11.5px] outline-none focus:border-[var(--acc)]"
            style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
          />

          <div className="mt-1.5 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {e.createdBy} · {new Date(e.createdAt).toLocaleDateString("en-ZA")}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Uncontained oil fire at AS1…"
          aria-label="Add a possible hazardous event"
          className="min-w-0 flex-1 rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        />
        <Btn disabled={!draft.trim()} onClick={add}>
          <IconPlus width={14} height={14} />
          Add event
        </Btn>
      </div>
    </div>
  );
}
