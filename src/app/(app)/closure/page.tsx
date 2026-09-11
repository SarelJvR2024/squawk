"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checksOf,
  useEntity,
  useEntityCode,
  useResponses,
  useStore,
  useVerifications,
  useVisitFindings,
  useVisitId,
} from "@/lib/store";
import {
  carriesWork,
  currentRatingOf,
  timelineFor,
  useOutstanding,
  useStream,
  visitsOpen,
  visitsSurvived,
} from "@/lib/carryforward";
import type { Outstanding } from "@/lib/carryforward";
import ItemStream from "@/components/ItemStream";
import PossibleEvents from "@/components/PossibleEvents";
import GroupRow from "@/components/ui/GroupRow";
import { PROGRAMME_VISITS } from "@/lib/programme";
import { movement } from "@/lib/risk";
import { Btn, Dot, Empty, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconClock, IconDash, IconX } from "@/components/ui/icons";
import type { VerificationOutcome } from "@/lib/types";

const OUTCOMES: { key: VerificationOutcome; label: string; Icon: typeof IconCheck; tone: string }[] = [
  { key: "Closed", label: "Closed", Icon: IconCheck, tone: "good" },
  { key: "Partially closed", label: "Partially", Icon: IconClock, tone: "warn" },
  { key: "Open - repeat", label: "Repeat", Icon: IconX, tone: "bad" },
  { key: "Not verified", label: "Not verified", Icon: IconDash, tone: "neu" },
];

const ratingTone = (r: string) =>
  r === "Unacceptable" ? "bad" : r === "Tolerable" ? "warn" : r === "Acceptable" ? "good" : "neutral";

type Filter = "all" | "priority" | "unverified" | "repeat" | "carried" | "nocover" | "context";

export default function ClosurePage() {
  const router = useRouter();
  const responses = useResponses();
  const findings = useVisitFindings();
  const verifications = useVerifications();
  const patchVerification = useStore((s) => s.patchVerification);
  const addProgress = useStore((s) => s.addProgress);
  const addPossibleEvent = useStore((s) => s.addPossibleEvent);
  const patchPossibleEvent = useStore((s) => s.patchPossibleEvent);
  const removePossibleEvent = useStore((s) => s.removePossibleEvent);
  const [progressText, setProgressText] = useState("");
  const updateFinding = useStore((s) => s.updateFinding);
  const entity = useEntity();
  const entityCode = useEntityCode();
  const visitId = useVisitId();

  /* Everything an earlier visit at this entity left open — the seeded 2025
     findings and any finding this app raised on a previous visit that nobody
     closed. Both are the same question in front of the asset. */
  const outstanding = useOutstanding();

  const visitLabel =
    PROGRAMME_VISITS.find((v) => v.id === visitId)?.label ?? visitId;
  const nextVisit = PROGRAMME_VISITS.filter(
    (v) => v.entity === entityCode && v.id > visitId
  )[0];

  const [filter, setFilter] = useState<Filter>("all");
  /* The closure conversation happens with ONE discipline in the room. O.R.
     Tambo carries 33 open items; fifteen rows of somebody else's assets is
     what derails the meeting, and the Electrical lead scrolling past Civil to
     find their own is the failure mode this prevents. */
  const [discipline, setDiscipline] = useState<string>("all");
  const [activePf, setActivePf] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  /** Current rating of an asset system, from this visit's captured data.
   *  Shared with the dashboard — see currentRatingOf in carryforward.ts. */
  const currentRating = (discipline: string, system: string) =>
    currentRatingOf(
      checksOf(entityCode, discipline, system),
      findings.filter((f) => f.discipline === discipline && f.system === system),
      responses
    );

  const list = useMemo(() => {
    let l = outstanding;
    /* CONTEXT IS NOT WORK, so it is not in the list by default. An item rated
       Acceptable needed no mitigation, so there is nothing to verify was
       implemented — counting it as outstanding makes the real number look
       bigger than it is. It is not hidden: the chip below says how many there
       are and shows them. */
    l = filter === "context" ? l.filter((p) => !carriesWork(p)) : l.filter(carriesWork);
    if (discipline !== "all") l = l.filter((p) => p.discipline === discipline);
    if (filter === "priority") l = l.filter((p) => p.rating === "Unacceptable" || p.rating === "Tolerable");
    if (filter === "unverified") l = l.filter((p) => !verifications[p.key]?.outcome);
    if (filter === "repeat") l = l.filter((p) => verifications[p.key]?.outcome === "Open - repeat");
    if (filter === "carried") l = l.filter((p) => p.source === "carried");
    if (filter === "nocover")
      l = l.filter((p) => checksOf(entityCode, p.discipline, p.system).length === 0);
    return l;
  }, [entityCode, filter, discipline, verifications, outstanding]);

  /* Every visit this entity has, oldest first — including the ones marked
     `skipped`, which is exactly the point: a visit that did not happen has to
     appear on the timeline as not audited rather than be left out and read as
     a clean sheet. */
  const entityVisits = useMemo(
    () => PROGRAMME_VISITS.filter((v) => v.entity === entityCode),
    [entityCode]
  );
  const byVisit = useStore((s) => s.byVisit);
  const timelines = useMemo(() => {
    const m = new Map<string, ReturnType<typeof timelineFor>>();
    for (const p of outstanding) {
      m.set(p.key, timelineFor(byVisit, entityCode, visitId, p, entityVisits));
    }
    return m;
  }, [byVisit, entityCode, visitId, outstanding, entityVisits]);

  /* GROUPED BY ASSET SYSTEM, because that is the unit the close-out
     conversation is actually held in — the discipline lead answers for a
     switchboard, not for a list of finding numbers — and it is the unit ACSA
     rates and compares year on year. Every prior audit's items are in here
     together: a 2025 finding and one this app raised in 2026 are the same
     question in front of the same asset, and splitting them by where they came
     from would ask it twice. */
  const grouped = useMemo(() => {
    const key = (p: { system: string }) => p.system?.trim() || "No asset system recorded";
    /* THE COUNT IS OF EVERYTHING THE ASSET SYSTEM CARRIES, not of what the
       chip filter left standing. "2/3" that changes meaning when somebody
       presses "Repeats" is not progress, it is arithmetic about a filter — and
       this screen's whole job is telling a discipline lead how much of their
       own asset system is still undecided. Scoped to the discipline in the
       room, because that genuinely changes whose work it is; not to the chips,
       which only change what is being looked at. */
    const carriedHere = outstanding
      .filter(carriesWork)
      .filter((p) => discipline === "all" || p.discipline === discipline);
    const totals = new Map<string, { done: number; total: number }>();
    for (const p of carriedHere) {
      const k = key(p);
      const t = totals.get(k) ?? { done: 0, total: 0 };
      t.total++;
      if (verifications[p.key]?.outcome) t.done++;
      totals.set(k, t);
    }

    const by = new Map<string, typeof list>();
    for (const p of list) {
      const k = key(p);
      const g = by.get(k);
      if (g) g.push(p);
      else by.set(k, [p]);
    }
    return [...by.entries()]
      .map(([sys, items]) => ({
        sys,
        items,
        /* THE SAME ITEMS, ROUND BY ROUND. An open asset system reads as a
           timeline — the audit that raised each finding, oldest first — so the
           grouping is computed once here rather than per render in the tree.
           Visit ids are "YYYY-MM" and sort lexicographically, which is why
           there is no date parsing anywhere in this file. */
        byAudit: (() => {
          const rounds = new Map<string, { visit: string; label: string; items: Outstanding[] }>();
          for (const p of items) {
            const r = rounds.get(p.originVisit);
            if (r) r.items.push(p);
            else
              rounds.set(p.originVisit, {
                visit: p.originVisit,
                label: p.originLabel,
                items: [p],
              });
          }
          return [...rounds.values()].sort((a, b) => a.visit.localeCompare(b.visit));
        })(),
        done: totals.get(sys)?.done ?? items.filter((p) => verifications[p.key]?.outcome).length,
        total: totals.get(sys)?.total ?? items.length,
      }))
      .sort((a, b) => a.sys.localeCompare(b.sys));
  }, [list, verifications, outstanding, discipline]);

  /* SHUT BY DEFAULT — and this reverses what it was.
     2026-09-09: everything opened by default, on the reasoning that this is a
     worklist to burn down rather than a tree to explore, and an auditor
     arriving at a closed list has to press every group before seeing any work.
     2026-09-10, Sarel, looking at it on his laptop: "the whole asset
     system/checklist hierarchy should be minimised by default, it is currently
     all expanded." Both halves are recorded rather than the first overwritten,
     because the earlier reasoning is still true of a short list — it is the
     LONG one it gets wrong. O.R. Tambo carries 33 open items across a dozen
     asset systems; opening all of them makes the screen a scroll with no shape
     to it, and the shape is what tells an auditor which asset to take next.

     `null` means "not yet decided by anybody" and reads as all-shut; once the
     auditor opens or closes anything it becomes their own set, and a group they
     opened stays open while they work it. */
  const [openSystems, setOpenSystems] = useState<string[] | null>(null);

  const active = list.find((p) => p.key === activePf) ?? list[0];
  const v = active ? verifications[active.key] : undefined;
  /* EVERYTHING RECORDED AGAINST THE ACTIVE ITEM, across every visit — see
     streamFor(). Memoised on the fields it actually reads rather than on
     `active`, which is a fresh object on every render and would rebuild the
     stream on every keystroke in the evidence box. */
  const originVisit = active?.originVisit;
  const originRating = active?.rating ?? null;
  const raised = useMemo(
    () =>
      originVisit
        ? {
            /* Visit ids are "YYYY-MM"; Date parses that as UTC midnight on the
               first, which is an honest floor for a record whose own date is
               the audit and nothing finer. `dated: "visit"` says so. */
            at: Date.parse(`${originVisit}-01T00:00:00Z`),
            dated: "visit" as const,
            visit: originVisit,
            rating: originRating,
          }
        : undefined,
    [originVisit, originRating]
  );
  const stream = useStream(active?.key ?? "", raised);

  const carries = useMemo(() => outstanding.filter(carriesWork), [outstanding]);
  const context = useMemo(() => outstanding.filter((p) => !carriesWork(p)), [outstanding]);
  /* The disciplines actually present in what carries, so the picker never
     offers a discipline with nothing behind it. */
  const disciplines = useMemo(
    () => [...new Set(carries.map((p) => p.discipline))].sort(),
    [carries]
  );

  const counts = {
    closed: outstanding.filter((p) => verifications[p.key]?.outcome === "Closed").length,
    partial: outstanding.filter((p) => verifications[p.key]?.outcome === "Partially closed").length,
    repeat: outstanding.filter((p) => verifications[p.key]?.outcome === "Open - repeat").length,
    unverified: outstanding.filter((p) => !verifications[p.key]?.outcome).length,
    carried: outstanding.filter((p) => p.source === "carried").length,
    nocover: outstanding.filter((p) => checksOf(entityCode, p.discipline, p.system).length === 0)
      .length,
  };

  const linked = active ? checksOf(entityCode, active.discipline, active.system) : [];
  const linkedNC = linked.filter((c) => responses[c.id]?.compliance === "NC").length;
  const cur = active ? currentRating(active.discipline, active.system) : "";
  const move = active ? movement(active.rating, cur) : null;

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 pb-16">
        {/* THE TOP OF THIS SCREEN WAS HALF THE SCREEN.
            Heading, a four-line paragraph, five cards about 100px tall, a
            standing explanation of the 3-year cycle, two rows of chips and a
            legend — measured on Sarel's laptop, roughly 560px before the first
            item of work. His words: "the top section is too big where it has
            the heading and description of what the page is about, we lose a lot
            of screen space."

            What it is now: the heading with the count in it, the five figures
            as ONE line, and the cycle explanation behind a summary that opens.
            Nothing is deleted — every number and every sentence is still
            reachable — but the default state of the screen is the worklist. */}
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-[17px] font-bold">
            Follow-up at {entity.short}
          </h2>
          <p className="text-[12px]" style={{ color: "var(--ink-2)" }}>
            {outstanding.length === 0 ? (
              <>Nothing outstanding coming into {visitLabel}.</>
            ) : (
              <>
                {outstanding.length} item{outstanding.length === 1 ? "" : "s"} left open by earlier
                visits. Open an asset system for its findings in audit order; open one for
                everything ever recorded against it.
              </>
            )}
          </p>
        </div>

        {/* ONE LINE, AT EVERY WIDTH. It was this line below sm and five cards
            above it — the same five numbers rendered twice, and the card
            version cost about 110px of a laptop screen to say what fits on
            one. The colour is still on each number, so the close-out meeting
            reads it the same way; it just does not own the first screen. */}
        <div
          className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[11px] border px-3 py-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          {(
            [
              [counts.closed, "verified closed", "good"],
              [counts.partial, "partially closed", "warn"],
              [counts.repeat, "still open — repeat", "bad"],
              [counts.unverified, "not yet verified", "neu"],
              [counts.carried, "carried from a visit", "acc"],
            ] as [number, string, string][]
          ).map(([n, label, tone]) => (
            <span key={label} className="flex items-baseline gap-1.5">
              <b className="tnum font-mono text-[15px] leading-none" style={{ color: `var(--${tone})` }}>
                {n}
              </b>
              <span style={{ color: "var(--ink-3)" }}>{label}</span>
            </span>
          ))}
        </div>

        {/* THE CYCLE, FOLDED. It is the single most important thing to
            understand about this screen and it is read once, not every time —
            a standing banner that says the same four sentences on every visit
            is furniture by the second day. The summary line still names the
            cycle, so nobody has to know to open it to learn that one exists. */}
        <details className="mb-2.5">
          <summary
            className="cursor-pointer list-none rounded-[9px] border px-3 py-[7px] text-[11px]"
            style={{ background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }}
          >
            Findings carry on the <b>3-year cycle</b> — what that means for closing one
          </summary>
          <div className="mt-1.5 px-3 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
            Anything still open when this visit ends reappears
            {nextVisit ? ` at ${nextVisit.label}` : " on the next visit"} with its owner, due date
            and evidence trail intact — and marking one <b>Closed</b> here closes the finding
            itself, so it stops carrying.
          </div>
        </details>

        {disciplines.length > 1 && (
          <div className="mb-2 flex flex-wrap items-center gap-[6px]">
            <span className="label-xs" style={{ color: "var(--ink-3)" }}>
              Discipline
            </span>
            {["all", ...disciplines].map((d) => (
              <button
                key={d}
                onClick={() => setDiscipline(d)}
                className="min-h-[44px] rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)]"
                style={
                  discipline === d
                    ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }
                    : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                }
              >
                {d === "all" ? `All ${carries.length}` : `${d} (${carries.filter((p) => p.discipline === d).length})`}
              </button>
            ))}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-[6px]">
          {(
            [
              ["all", `Carries work (${carries.length})`],
              ["priority", "Was Unacceptable / Tolerable"],
              ["unverified", "Not yet verified"],
              ["repeat", "Repeats"],
              ["carried", `Carried forward (${counts.carried})`],
              ["nocover", "Not covered this visit"],
              ...(context.length
                ? ([["context", `Context only (${context.length})`]] as [Filter, string][])
                : []),
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className="rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)]"
              style={
                filter === k
                  ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                  : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* THE LEGEND WENT WITH THE STRIP IT EXPLAINED.
            It was six little cells and their words, above the list, teaching a
            shape that is no longer drawn — Sarel: "don't have an icon per
            audit, just need to see the current status of the finding, and the
            year/month when it was logged". A legend for a control that does not
            exist is the worst kind of furniture: it costs a row of the screen
            AND teaches something untrue. The status is a word on the row now,
            the date is beside it, and the sequence across audits is written out
            in the detail pane's history. VisitStrip itself is kept — the
            timeline it draws is still what visitsSurvived() counts, and it will
            be wanted again when there is somewhere with room for it. */}

        <div className="grid gap-3 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-[15px] border" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
            {list.length === 0 ? (
              <Empty>Nothing matches this filter.</Empty>
            ) : (
              grouped.map((g) => {
                /* The system holding the item on the right stays open however
                   the list is folded — a detail pane showing a finding whose
                   row is inside a shut group is a screen that has lost track of
                   what it is showing. */
                const open = openSystems === null
                  ? active?.system === g.sys
                  : openSystems.includes(g.sys);
                return (
                  <div key={g.sys} data-system={g.sys}>
                    <GroupRow
                      label={g.sys}
                      done={g.done}
                      total={g.total}
                      open={open}
                      holds={active?.system === g.sys}
                      onToggle={() =>
                        setOpenSystems((cur) => {
                          /* The first press takes over from the default, and
                             takes the default's own state with it — otherwise
                             opening a second system would silently shut the one
                             the detail pane is showing. */
                          const base =
                            cur ?? (active?.system ? [active.system] : []);
                          return base.includes(g.sys)
                            ? base.filter((x) => x !== g.sys)
                            : [...base, g.sys];
                        })
                      }
                      title={`${g.sys} — ${g.done} of ${g.total} decided this visit`}
                    />
                    {open && (
                      /* THE TIMELINE, IN THE LEFT PANEL.
                         Sarel: "I like this idea of the timeline view, let's
                         bring that into the left panel — when you expand an
                         asset system it brings up this timeline view of all
                         findings in order of the audit timeline, and the
                         current status of each finding."

                         So an open asset system is not a flat list any more.
                         Its findings are grouped under the audit that RAISED
                         them, oldest audit first, on a rail — which is the one
                         ordering that answers the question this screen exists
                         for: what has this asset system been carrying, and for
                         how long. A March 2025 finding and a September 2026 one
                         in the same system are different ages of problem and
                         the list used to render them identically.

                         THE PER-AUDIT CELL STRIP IS GONE from the row, at his
                         instruction — "don't have an icon per audit, just need
                         to see the current status of the finding, and the
                         year/month when it was logged". The strip's whole job
                         was to show the shape across visits; the rail's audit
                         markers now carry the "when", the status pill carries
                         the "what", and the full open→closed→open sequence
                         lives in the detail pane's stream, which is where there
                         is room to write it in words. */
                      <div className="pb-1">
                        {g.byAudit.map((round) => (
                          <div key={round.visit}>
                            {/* THE AUDIT MARKER. Small, mono, and it is a
                                date rather than a heading — the findings under
                                it are the work; this says when they started. */}
                            <div
                              className="flex items-center gap-2 px-[11px] pt-[7px] pb-[3px]"
                              style={{ color: "var(--ink-4)" }}
                            >
                              <span
                                aria-hidden
                                className="h-[7px] w-[7px] shrink-0 rounded-full"
                                style={{ background: "var(--line-3)" }}
                              />
                              <span className="font-mono text-[9px] tracking-[0.08em] uppercase">
                                raised {round.label}
                              </span>
                              <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                              <span className="font-mono text-[9px]">
                                {round.items.length}
                              </span>
                            </div>
                            {round.items.map((p) => {
                              const o = verifications[p.key]?.outcome;
                              const on = p.key === active?.key;
                              const cells = timelines.get(p.key) ?? [];
                              const survived = visitsSurvived(cells, visitId);
                              const covered =
                                checksOf(entityCode, p.discipline, p.system).length > 0;
                              /* THE CURRENT STATUS, IN WORDS.
                                 An item is in this list because it is
                                 outstanding, so with nothing recorded this
                                 visit it is OPEN — not "not verified", which
                                 describes what the auditor has not done rather
                                 than what the finding is. Once this visit
                                 records an outcome, that outcome is the
                                 status. */
                              const status = o ?? "Open";
                              const tone =
                                o === "Closed"
                                  ? "good"
                                  : o === "Open - repeat"
                                    ? "bad"
                                    : o === "Partially closed"
                                      ? "warn"
                                      : "neutral";
                              return (
                                <button
                                  key={p.key}
                                  data-item={p.key}
                                  onClick={() => setActivePf(p.key)}
                                  className="relative flex w-full items-start gap-2 border-b py-[9px] pr-[11px] pl-[22px] text-left transition-[var(--t)]"
                                  style={{
                                    borderColor: "var(--line)",
                                    background: on ? "var(--acc-soft)" : "transparent",
                                  }}
                                >
                                  {/* The rail. Decorative — the audit marker
                                      above says the date in words and the row
                                      says the id and the status, so this is a
                                      second reading of something written. */}
                                  <span
                                    aria-hidden
                                    className="absolute inset-y-0 left-[14px] w-px"
                                    style={{ background: "var(--line)" }}
                                  />
                                  {on && (
                                    <span
                                      className="absolute inset-y-0 left-0 w-[2.5px]"
                                      style={{ background: "var(--acc)" }}
                                    />
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span
                                        className="font-mono text-[9px]"
                                        style={{ color: "var(--ink-4)" }}
                                      >
                                        {p.key}
                                      </span>
                                      {/* WHEN IT WAS LOGGED, on the row, in
                                          full. It is the second half of what
                                          Sarel asked the strip to be replaced
                                          by, and it survives the row being read
                                          out of the context of its marker. */}
                                      <span
                                        className="font-mono text-[9px]"
                                        style={{ color: "var(--ink-4)" }}
                                      >
                                        {p.originLabel}
                                      </span>
                                      <span className="ml-auto shrink-0">
                                        <Pill tone={tone}>{status.toUpperCase()}</Pill>
                                      </span>
                                    </span>
                                    <span className="mt-[3px] block truncate text-[11.5px]">
                                      {p.finding}
                                    </span>
                                    <span className="mt-[3px] flex flex-wrap items-center gap-2 font-mono text-[9px]">
                                      <span style={{ color: "var(--ink-4)" }}>
                                        {p.rating}
                                      </span>
                                      {survived > 0 && (
                                        <span style={{ color: "var(--warn)" }}>
                                          survived {survived} visit{survived === 1 ? "" : "s"}
                                        </span>
                                      )}
                                      {/* THE COVERAGE GUARD, on the row rather
                                          than only in the detail pane. Closure
                                          cannot be evidenced against a check
                                          nobody is doing, and the person
                                          deciding needs to know that before they
                                          decide, not after. */}
                                      {!covered && (
                                        <span style={{ color: "var(--bad)" }}>
                                          not covered this visit
                                        </span>
                                      )}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {active && (
            <div className="rounded-[15px] border p-[18px]" style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "var(--e2)" }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-[7px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                <span>{active.key}</span>
                <span>·</span>
                <span>{active.discipline}</span>
                <span>·</span>
                <span>{active.system}</span>
                <Pill tone={ratingTone(active.rating)}>
                  {active.originLabel.toUpperCase()} {active.rating.toUpperCase()}
                </Pill>
                {active.source === "carried" && <Pill tone="accent">CARRIED FORWARD</Pill>}
                {(() => {
                  const n = visitsOpen(active, entityCode, visitId);
                  return n > 0 ? (
                    <Pill tone="bad">
                      OPEN ACROSS {n + 1} VISIT{n ? "S" : ""}
                    </Pill>
                  ) : null;
                })()}
                {active.owner && <span>· {active.owner}</span>}
                {active.dueDate && <span>· due {active.dueDate}</span>}
              </div>
              <h3 className="mb-1 text-[14.5px] leading-[1.35] font-bold">{active.finding}</h3>

              {/* lifecycle */}
              <div
                className="no-scrollbar my-3 flex items-center overflow-x-auto rounded-[11px] border px-[13px] py-[11px]"
                style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
              >
                {[
                  { n: "✓", t: "Raised", s: active.originLabel, done: true },
                  {
                    n: "2",
                    t: "Remediated",
                    s: `by ${entity.short}`,
                    done: !!v?.outcome && v.outcome !== "Not verified",
                  },
                  { n: "3", t: "Verified", s: visitLabel, done: !!v?.outcome, now: !v?.outcome },
                  {
                    n: "4",
                    t: v?.outcome === "Closed" ? "Closed" : "Re-check",
                    s: v?.outcome === "Closed" ? "does not carry" : (nextVisit?.label ?? "next visit"),
                    done: v?.outcome === "Closed",
                  },
                ].map((step, i, arr) => (
                  <span key={step.t} className="flex shrink-0 items-center">
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className="flex h-[20px] w-[20px] items-center justify-center rounded-full font-mono text-[8.5px] font-semibold"
                        style={{
                          background: step.done ? "var(--good)" : step.now ? "var(--acc)" : "var(--line)",
                          color: step.done ? "#fff" : step.now ? "var(--on-acc)" : "var(--ink-3)",
                          boxShadow: step.now ? "0 0 0 3px var(--acc-soft)" : "none",
                        }}
                      >
                        {step.done ? "✓" : step.n}
                      </span>
                      <span>
                        <b className="block font-display text-[10px] font-semibold whitespace-nowrap">{step.t}</b>
                        <span className="text-[9px] whitespace-nowrap" style={{ color: "var(--ink-4)" }}>
                          {step.s}
                        </span>
                      </span>
                    </span>
                    {i < arr.length - 1 && (
                      <span
                        className="mx-2 h-[1.5px] w-[20px] shrink-0 rounded-[2px]"
                        style={{ background: step.done ? "var(--good-line)" : "var(--line)" }}
                      />
                    )}
                  </span>
                ))}
              </div>

              <div className="mb-2 flex items-center justify-between">
                <b className="font-display text-[11px] font-semibold">Verification</b>
                <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  what did you find this time?
                </span>
              </div>
              <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-4">
                {OUTCOMES.map(({ key, label, Icon, tone }) => {
                  const on = v?.outcome === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        const outcome = on ? null : key;
                        patchVerification(active.key, {
                          outcome,
                          verifiedAt: Date.now(),
                        });
                        /* A carried finding is a real record, not a row in a
                           list. Closing it here has to close it there, or it
                           reappears on the next visit having been verified
                           closed on this one. Un-picking reopens it for the
                           same reason. */
                        if (active.findingId) {
                          updateFinding(active.findingId, {
                            actionStatus:
                              outcome === "Closed"
                                ? "Closed"
                                : outcome === "Partially closed"
                                  ? "In progress"
                                  : "Open",
                          });
                        }
                        if (!on) say(`${active.key} — ${label}`);
                      }}
                      className="flex min-h-[56px] flex-col items-center justify-center gap-[5px] rounded-[11px] border-[1.5px] px-1 py-2.5 font-display text-[10.5px] font-semibold transition-[var(--t)] hover:-translate-y-[1px]"
                      style={
                        on
                          ? { background: `var(--${tone}-bg)`, borderColor: `var(--${tone})`, color: `var(--${tone})` }
                          : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                      }
                    >
                      <Icon width={15} height={15} />
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 mb-2 font-display text-[11px] font-semibold">Evidence of closure</div>
              <textarea
                value={v?.evidence ?? ""}
                onChange={(e) => patchVerification(active.key, { evidence: e.target.value })}
                placeholder="What proves it was fixed…"
                aria-label="Evidence that it was fixed"
                className="min-h-[70px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />

              {/* TWO FIELDS, TWO QUESTIONS, and they used to be one that only
                  appeared when the outcome was not Closed.

                  Sarel: "need to capture remediation actions and next steps and
                  updates logged to the current audit." They are genuinely
                  different things and ACSA's own sheet folds them into one cell,
                  which is how a finding regularly arrives at the next audit with
                  the chase recorded and no remedy at all:

                    REMEDIATION is what fixes the thing. A finding closed this
                    visit still has one, and it is the single most useful
                    sentence at the next audit — hence always shown, not only
                    while something is outstanding.

                    NEXT STEP is what happens next in getting it done: who is
                    being chased, what the site committed to at close-out, which
                    report is being waited for.

                  Both are recorded against the CARRIED item rather than raised
                  as a new finding — a new finding breaks the chain back to the
                  audit that found it, and the same problem then reads as two. */}
              <div className="mt-4 mb-2 font-display text-[11px] font-semibold">
                Remediation action — what fixes it
              </div>
              <textarea
                value={v?.action ?? ""}
                onChange={(e) => patchVerification(active.key, { action: e.target.value })}
                placeholder="What was done, or what has to be done, and who has it…"
                aria-label="Remediation action"
                className="min-h-[60px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                style={{
                  background: "var(--panel)",
                  /* The warn border only where a blank is actually a gap: an
                     item this visit says is still open with no action recorded.
                     A closed item with no action is untidy, not wrong. */
                  borderColor:
                    !v?.action && v?.outcome && v.outcome !== "Closed"
                      ? "var(--warn-line)"
                      : "var(--line-2)",
                }}
              />

              <div className="mt-4 mb-2 font-display text-[11px] font-semibold">
                Next step — what happens next
              </div>
              <textarea
                value={v?.nextStep ?? ""}
                onChange={(e) => patchVerification(active.key, { nextStep: e.target.value })}
                placeholder="Who is being chased, what the site committed to, what is being waited for…"
                aria-label="Next step"
                className="min-h-[54px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />

              {/* The dated log. ACSA's Progress/Update is one cell that gets
                  typed over; this appends, keeping the author, the time and
                  the visit, and the export flattens it back into their cell. */}
              <div className="mt-4 mb-2 font-display text-[11px] font-semibold">Progress</div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={progressText}
                  onChange={(e) => setProgressText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && progressText.trim()) {
                      addProgress(active.key, progressText);
                      setProgressText("");
                      say("Progress recorded");
                    }
                  }}
                  placeholder="What moved, in one line…"
                  aria-label="Progress note"
                  className="min-w-0 flex-1 rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                />
                <Btn
                  disabled={!progressText.trim()}
                  onClick={() => {
                    addProgress(active.key, progressText);
                    setProgressText("");
                    say("Progress recorded");
                  }}
                >
                  Add to the log
                </Btn>
              </div>

              {/* The hazardous events this finding could lead to, each with its
                  own likelihood. See the component — plural is the point. */}
              <PossibleEvents
                events={v?.possibleEvents ?? []}
                onAdd={(text) => {
                  addPossibleEvent(active.key, text);
                  say("Event recorded — rate its likelihood");
                }}
                onPatch={(id, patch) => patchPossibleEvent(active.key, id, patch)}
                onRemove={(id) => {
                  removePossibleEvent(active.key, id);
                  say("Event removed");
                }}
              />

              {/* EVERYTHING THAT TOUCHED THIS, in one order — the outcome each
                  audit recorded, the evidence, the photographs somebody went
                  and took, the voice notes, the updates and the possible events.
                  It replaces ItemTimeline, which was one row per audit off the
                  verification alone and had nowhere to put a photograph. The
                  open → closed → open sequence Sarel asked to see is the
                  outcome entries read down the column, in words. */}
              <ItemStream entries={stream} />

              <div className="mt-4 mb-2 flex items-center justify-between">
                <b className="font-display text-[11px] font-semibold">
                  {visitLabel} checks covering {active.system}
                </b>
                <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  {linked.length} linked · {linkedNC} NC · current: {cur}
                </span>
              </div>

              {linked.length === 0 ? (
                <Panel tone="warn">
                  <div className="text-[11.5px]" style={{ color: "var(--warn)" }}>
                    <b>Coverage guard:</b> no check-point in this visit&apos;s scope covers{" "}
                    <b>{active.system}</b>. Closure cannot be evidenced from the register — add a check
                    or record it as an ad-hoc finding in the field.
                  </div>
                </Panel>
              ) : (
                <div className="max-h-[220px] overflow-y-auto rounded-[11px] border" style={{ borderColor: "var(--line)" }}>
                  {linked.map((c) => {
                    const rr = responses[c.id];
                    return (
                      <button
                        key={c.id}
                        onClick={() => router.push(`/capture?check=${c.id}`)}
                        className="flex w-full items-start gap-2 border-b px-[11px] py-2 text-left transition-[var(--t)] hover:bg-[var(--sunken)]"
                        style={{ borderColor: "var(--line)" }}
                      >
                        <Dot
                          tone={
                            !rr?.captured
                              ? "pending"
                              : rr.compliance === "NC"
                                ? "bad"
                                : rr.compliance === "C"
                                  ? "good"
                                  : rr.compliance === "NV"
                                    ? "warn"
                                    : "neutral"
                          }
                        label={rr?.compliance ?? "Not captured"}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            {c.id}
                          </span>
                          <span className="block truncate text-[11.5px]">{c.requirement}</span>
                        </span>
                        <span className="mt-[2px]">
                          <Pill
                            tone={
                              rr?.compliance === "NC"
                                ? "bad"
                                : rr?.compliance === "C"
                                  ? "good"
                                  : rr?.compliance === "NV"
                                    ? "warn"
                                    : "neutral"
                            }
                          >
                            {rr?.compliance ?? "OPEN"}
                          </Pill>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5" style={{ borderColor: "var(--line)" }}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                    current: <b style={{ color: "var(--ink)" }}>{cur}</b>
                  </span>
                  {move && (
                    <Pill tone={move === "Improved" ? "good" : move === "Worsened" ? "bad" : "warn"}>
                      {move === "Improved" ? "↑" : move === "Worsened" ? "↓" : "→"} {move}
                    </Pill>
                  )}
                </div>
                <Btn
                  variant="primary"
                  onClick={() => {
                    const i = list.findIndex((p) => p.key === active.key);
                    setActivePf(list[i + 1]?.key ?? active.key);
                    say(`${active.key} saved`);
                  }}
                >
                  <IconCheck width={14} height={14} />
                  Save &amp; next
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div
          className="toast-bottom fixed left-1/2 z-[100] -translate-x-1/2 rounded-[11px] px-[15px] py-2.5 text-[12px] font-medium"
          style={{ background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--e3)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
