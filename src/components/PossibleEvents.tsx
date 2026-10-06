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

import { useMemo, useState, type ReactNode } from "react";
import type { Likelihood, PossibleEvent } from "@/lib/types";
import { LIKELIHOODS } from "@/lib/risk";
import { Btn } from "@/components/ui/primitives";
import { IconPlus, IconX } from "@/components/ui/icons";

const summaryOf = (e: PossibleEvent): string => {
  const bits = [e.likelihood ?? "unrated"];
  if (e.findingIds?.length) bits.push(`${e.findingIds.length} finding${e.findingIds.length === 1 ? "" : "s"}`);
  if (e.assetIds?.length) bits.push(`${e.assetIds.length} asset${e.assetIds.length === 1 ? "" : "s"}`);
  return bits.join(" · ");
};

export default function PossibleEvents({
  events,
  onAdd,
  onPatch,
  onRemove,
  /** Every event already on record at this entity — Hazards and earlier
   *  PossibleEvents both — so typing one that already exists offers the
   *  existing wording instead of a near-duplicate. Optional and defaults to
   *  none, so a caller that has not wired suggestions yet gets the plain
   *  input rather than a crash. */
  suggestions = [],
  /** Sarel: "the risk event is linked to the failure of an asset system or a
   *  specific finding... multiple assets and findings can contribute to the
   *  same hazardous event." A render prop rather than finding/asset props
   *  here, deliberately: this component is also used by the closure screen
   *  for a carried finding's own possible events, which are already tied to
   *  the one finding they were raised against and have nothing to link.
   *  Only the findings-screen caller passes this. */
  evidence,
}: {
  events: PossibleEvent[];
  onAdd: (event: string) => void;
  onPatch: (id: string, p: Partial<PossibleEvent>) => void;
  onRemove: (id: string) => void;
  suggestions?: string[];
  evidence?: (event: PossibleEvent) => ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  /* Sarel: "allow me to minimize hazardous events." A system like Runway
     carries a dozen of these, each with its own likelihood row, note and
     linked evidence — reading the one you actually came for meant scrolling
     past every other one, fully open, every time. Collapsed is a toggle, not
     a default: nothing here starts folded, so a screen that worked before
     this still looks the same until the auditor chooses to fold one away. */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const add = (text: string) => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setDraft("");
    setSuggestOpen(false);
  };

  /* TWO CHARACTERS BEFORE IT SPEAKS. A single letter matches half the
     register and is noise, not help — the list earns its place once there is
     enough to actually narrow on. SUBSTRING, not prefix: "oil fire" should
     surface typing either "oil" or "fire", because an auditor recalling an
     event rarely recalls which word came first. */
  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (q.length < 2) return [];
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
  }, [draft, suggestions]);

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

      {events.map((e) => {
        const isCollapsed = collapsed.has(e.id);
        return (
        <div
          key={e.id}
          className="mb-1.5 rounded-[11px] border px-3 py-2.5"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        >
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => toggleCollapsed(e.id)}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? `Expand ${e.event || "this event"}` : `Minimize ${e.event || "this event"}`}
              className="mt-[9px] flex h-[16px] w-[16px] shrink-0 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className="font-mono text-[8px] leading-none"
                style={{ color: "var(--ink-4)" }}
              >
                {isCollapsed ? "▶" : "▼"}
              </span>
            </button>
            {isCollapsed ? (
              <button
                type="button"
                onClick={() => toggleCollapsed(e.id)}
                className="min-w-0 flex-1 py-[2px] text-left"
              >
                <span className="block truncate text-[12px] font-semibold">
                  {e.event || "Untitled event"}
                </span>
                <span className="block font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                  {summaryOf(e)}
                </span>
              </button>
            ) : (
              <input
                value={e.event}
                onChange={(ev) => onPatch(e.id, { event: ev.target.value })}
                aria-label="The event"
                className="min-w-0 flex-1 rounded-[8px] border px-2.5 py-[7px] text-[12px] font-semibold outline-none focus:border-[var(--acc)]"
                style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
              />
            )}
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

          {!isCollapsed && (
          <>
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

          {evidence?.(e)}

          <div className="mt-1.5 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {e.createdBy} · {new Date(e.createdAt).toLocaleDateString("en-ZA")}
          </div>
          </>
          )}
        </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            /* Not onBlur — a click on a suggestion below blurs the input
               before the click's own handler runs, which would close the
               list out from under the click. A short delay lets the click
               land first; the suggestion button also stops it at the source
               with onMouseDown, this is the belt on top of that braces. */
            onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(draft);
              if (e.key === "Escape") setSuggestOpen(false);
            }}
            placeholder="Uncontained oil fire at AS1…"
            aria-label="Add a possible hazardous event"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestOpen && matches.length > 0}
            aria-controls="possible-event-suggestions"
            className="w-full rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          />
          {suggestOpen && matches.length > 0 && (
            <div
              id="possible-event-suggestions"
              role="listbox"
              aria-label="Matching recorded events"
              className="absolute top-[calc(100%+4px)] left-0 z-10 max-h-[220px] w-full overflow-y-auto rounded-[11px] border py-1"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e2)" }}
            >
              <div
                className="px-3 pt-1 pb-1.5 font-mono text-[9px] uppercase tracking-[0.06em]"
                style={{ color: "var(--ink-4)" }}
              >
                already on record — select to reuse, or keep typing for a new one
              </div>
              {matches.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(m);
                  }}
                  className="block w-full px-3 py-[7px] text-left text-[12px] transition-[var(--t)] hover:bg-[var(--acc-soft)]"
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        <Btn disabled={!draft.trim()} onClick={() => add(draft)}>
          <IconPlus width={14} height={14} />
          Add event
        </Btn>
      </div>
    </div>
  );
}
