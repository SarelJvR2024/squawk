"use client";

/** The central place to review one audit check.
 *
 *  Sarel: "i want us to update the review page. this should be a page where
 *  you have the audit checks on the left per discipline and on the right
 *  panel have all evidence requests, evidence notes, compliance,
 *  observations, findings, photos all in one place everything you have in
 *  the system for that audit check. this should be the central place to
 *  review everything for an audit check and all compliance statuses and
 *  allow the editing and updating of all fields." Confirmed with him
 *  directly: this REPLACES the old screen outright, not alongside it.
 *
 *  REVERSED, 13 October 2026. The old /review was a flat gallery — every
 *  photograph and voice note this visit captured, with a feedback thread
 *  bolted on for an engineer who was never on site, deliberately kept out of
 *  the record. That screen answered one question (does this photo show the
 *  right panel?) and could not answer the one a reviewer actually has: is
 *  THIS CHECK done — right observation, right compliance, right evidence,
 *  any findings raised against it, all agreeing with each other? Finding
 *  that out meant opening Capture for the answer, Asset Assurance for the
 *  finding, and the old /review for the photo, three screens for one check.
 *
 *  So this is the same left-rail-plus-detail shape as Capture
 *  (src/app/(app)/capture/page.tsx) — the discipline a reviewer is working
 *  pointed at a `<select>`, its asset systems collapsible, checks nested
 *  under them — with CheckDetail on the right, the exact component Capture
 *  and Field already use to edit a check in full. Nothing new to maintain,
 *  nothing to keep in sync: opening a check here and editing IS editing the
 *  record, because it is the same screen.
 *
 *  Three things only a REVIEWER'S pass needs, that Capture's workspace does
 *  not:
 *    - every check, not only the ones a desk can progress. `needsDesk`
 *      exists to keep a tablet from offering a question with nothing to
 *      answer; it says nothing about whether there is something worth
 *      reviewing — a physical-only check can still carry an observation, an
 *      attachment or a finding.
 *    - no ad-hoc walk items. "Audit checks... per discipline" is the
 *      register, not a hand-added observation with no register id — those
 *      are reviewed on the screen that raised them (Asset Assurance, /field).
 *    - filters aimed at "what needs a second look", not "what is left to
 *      ask" — Capture's open/ask/pf chips are a desk workflow; a reviewer
 *      going back over a finished visit wants non-compliances, raised
 *      findings, flagged checks and evidence still outstanding. */

import { useMemo, useState } from "react";
import {
  checksOf,
  disciplinesAt,
  priorFor,
  systemsOf,
  useEntityCode,
  useResponses,
  useVisitFindings,
} from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import ReviewDetail from "@/components/ReviewDetail";
import { Dot, Empty, Pill } from "@/components/ui/primitives";
import { FilterBar } from "@/components/ui/FilterBar";
import { DisciplineSelect } from "@/components/ui/DisciplineSelect";
import { IconInbox } from "@/components/ui/icons";
import type { Check, Response } from "@/lib/types";

type Filter = "all" | "nc" | "findings" | "flagged" | "evidence" | "unsigned";

const STATUS_FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  nc: "NC",
  findings: "Findings",
  flagged: "Flagged",
  evidence: "Evidence",
  unsigned: "Not signed off",
};

const RATING_TONE = {
  Unacceptable: "bad",
  Tolerable: "warn",
  Acceptable: "good",
  "Not audited": "neutral",
} as const;

/** "Reviewed" here means nobody still has to come back to it cold — there is
 *  a compliance verdict, or at minimum an observation written down. It is
 *  deliberately not the desk's `deskDone`/commit flag: this screen is not a
 *  workflow step to tick off, it is read straight off whatever is on the
 *  record right now, so editing a field here moves the count on the same
 *  render rather than waiting on a save. */
function reviewed(r: Response | undefined): boolean {
  return !!r && (!!r.compliance || r.observation.trim().length > 0);
}

export default function ReviewPage() {
  const responses = useResponses();
  const findings = useVisitFindings();
  const entityCode = useEntityCode();
  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);

  const [picked, setDiscipline] = useState<string>(disciplines[0]);
  const discipline = disciplines.includes(picked) ? picked : disciplines[0];
  const [expanded, setExpanded] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  /* Every register check in this discipline — no `needsDesk`. That filter
     exists to keep a tablet from offering a question with nothing to answer
     at a desk; a reviewer going back over the whole check needs exactly the
     physical-only rows it excludes, because those can still carry an
     observation, an attachment, or a finding raised against them. */
  const disciplineChecks = useMemo(
    () => checksOf(entityCode, discipline),
    [entityCode, discipline]
  );

  const findingsOn = (checkId: string) => findings.filter((f) => f.checkId === checkId);

  const visible = useMemo(() => {
    let list = disciplineChecks;
    if (filter === "nc") list = list.filter((c) => responses[c.id]?.compliance === "NC");
    if (filter === "findings") list = list.filter((c) => findingsOn(c.id).length > 0);
    if (filter === "flagged") list = list.filter((c) => !!responses[c.id]?.improvementFlag);
    if (filter === "evidence")
      list = list.filter((c) => {
        const status = responses[c.id]?.evidenceStatus;
        return status === "toBeProvided" || status === "specificNotAvailable";
      });
    /* THE REVIEWER'S OWN QUEUE — Sarel's sign-off status (see ReviewDetail's
       "Review status" section). Not the same as "open" above: a check can
       be fully answered and still not have had a reviewer's own pass
       over it. */
    if (filter === "unsigned") list = list.filter((c) => !responses[c.id]?.reviewStatus);
    return list;
  }, [disciplineChecks, filter, responses, findings]);

  const active: Check | undefined =
    visible.find((c) => c.id === activeId) ?? visible[0];

  /* Same reconcile-during-render as Capture's deep link and walk, and for the
     same reason: an effect would paint the closed group first and correct it
     a frame later, which on a tablet is a visible flash. */
  const [autoOpened, setAutoOpened] = useState<string | null>(null);
  if (active && active.system !== autoOpened) {
    setAutoOpened(active.system);
    if (!expanded.includes(active.system)) setExpanded([...expanded, active.system]);
  }

  const move = (delta: number) => {
    if (!active) return;
    const i = visible.findIndex((c) => c.id === active.id);
    const next = visible[i + delta];
    if (next) setActiveId(next.id);
  };

  const complianceTone = (c: Check) => {
    const r = responses[c.id];
    return r?.compliance === "NC"
      ? ("bad" as const)
      : r?.compliance === "C"
        ? ("good" as const)
        : r?.compliance === "NV"
          ? ("warn" as const)
          : ("neutral" as const);
  };
  const dotTone = (c: Check) => (reviewed(responses[c.id]) ? complianceTone(c) : ("pending" as const));

  /* The tree: this discipline's asset systems, in register order, carrying
     whichever of their checks the filter left standing. A system the filter
     empties is not shown — an "Electrical Reticulation (0)" that opens onto
     nothing is a row that only wastes a press. */
  const groups = useMemo(() => {
    const by = new Map<string, Check[]>();
    for (const c of visible) {
      const list = by.get(c.system);
      if (list) list.push(c);
      else by.set(c.system, [c]);
    }
    return systemsOf(entityCode, discipline)
      .filter((sys) => by.has(sys))
      .map((sys) => ({ sys, checks: by.get(sys)! }));
  }, [visible, entityCode, discipline]);

  return (
    <>
      {/* navigator — same shape as Capture's: the filter, the discipline,
          the asset systems with their checks nested under them. */}
      <div
        className="hidden w-[290px] shrink-0 flex-col overflow-y-auto border-r md:flex"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div
          className="sticky top-0 z-[5] border-b px-[9px] pt-[9px] pb-[8px]"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          {/* Same shared disclosure Capture uses — see
              src/components/ui/FilterBar.tsx — this row was an identical
              copy-paste of Capture's and had drifted into a 2-line wrap on
              desktop because "Not signed off" didn't fit one row. */}
          <FilterBar
            className="mb-[7px]"
            summary={<>Showing: <b>{STATUS_FILTER_LABEL[filter]}</b></>}
            active={filter !== "all"}
            groups={[
              {
                options: (
                  [
                    ["all", "All"],
                    ["nc", "NC"],
                    ["findings", "Findings"],
                    ["flagged", "Flagged"],
                    ["evidence", "Evidence"],
                    ["unsigned", "Not signed off"],
                  ] as [Filter, string][]
                ).map(([key, label]) => ({ key, label })),
                value: filter,
                onChange: (k) => setFilter(k as Filter),
              },
            ]}
          />

          <DisciplineSelect
            ariaLabel="Discipline"
            value={discipline}
            onChange={(v) => {
              setDiscipline(v);
              setExpanded([]);
              setAutoOpened(null);
              setActiveId(null);
            }}
            options={disciplines.map((d) => {
              const cs = checksOf(entityCode, d);
              const done = cs.filter((c) => reviewed(responses[c.id])).length;
              return { value: d, label: `${d} — ${done}/${cs.length}` };
            })}
          />

          <div className="mt-[7px] flex items-start justify-between gap-2">
            <div className="text-[10px]" style={{ color: "var(--ink-3)" }}>
              {visible.filter((c) => reviewed(responses[c.id])).length} reviewed ·{" "}
              {visible.filter((c) => !reviewed(responses[c.id])).length} open
            </div>
            <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
              {visible.length}
            </span>
          </div>
        </div>

        {groups.length === 0 ? (
          <Empty>
            <IconInbox width={26} height={26} />
            <div>Nothing matches this filter.</div>
          </Empty>
        ) : (
          groups.map(({ sys, checks }) => {
            /* The system's progress counts every check it has, not the ones
               this filter left standing — same reasoning as Capture's rail. */
            const all = checksOf(entityCode, discipline, sys);
            const done = all.filter((c) => reviewed(responses[c.id])).length;
            const nc = all.filter((c) => responses[c.id]?.compliance === "NC").length;
            const pf = priorFor(entityCode, discipline, sys);
            const open = expanded.includes(sys);
            const holds = active?.system === sys;
            const pct = all.length ? (done / all.length) * 100 : 0;
            return (
              <div key={sys} data-system={sys}>
                <button
                  onClick={() =>
                    setExpanded(open ? expanded.filter((x) => x !== sys) : [...expanded, sys])
                  }
                  aria-expanded={open}
                  title={`${sys} — ${done} of ${all.length} reviewed${nc > 0 ? `, ${nc} non-compliant` : ""}${
                    pf ? `, carries ${pf.key} from the last visit` : ""
                  }`}
                  className="relative flex w-full items-center gap-[5px] overflow-hidden border-b px-[9px] py-[7px] text-left transition-[var(--t)]"
                  style={{
                    borderColor: "var(--line)",
                    background: holds ? "var(--acc-soft)" : "transparent",
                    color: holds ? "var(--acc)" : "var(--ink-2)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-mono text-[8px] leading-none"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {open ? "▼" : "▶"}
                  </span>
                  <b className="min-w-0 flex-1 truncate text-[11px] font-semibold">{sys}</b>
                  {pf && <Pill tone={RATING_TONE[pf.rating]}>{pf.key}</Pill>}
                  <span
                    className="shrink-0 font-mono text-[9px]"
                    style={{ color: holds ? "var(--acc)" : "var(--ink-4)" }}
                  >
                    {done}/{all.length}
                    {nc > 0 && ` · ${nc}NC`}
                  </span>
                  <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: "var(--line-2)" }}>
                    <span
                      className="block h-full"
                      style={{ width: `${pct}%`, background: holds ? "var(--acc)" : "var(--good)" }}
                    />
                  </span>
                </button>

                {open &&
                  checks.map((c) => {
                    const on = c.id === active?.id;
                    const nFindings = findingsOn(c.id).length;
                    const signOff = responses[c.id]?.reviewStatus;
                    return (
                      <button
                        key={c.id}
                        data-check={c.id}
                        onClick={() => setActiveId(c.id)}
                        className="relative flex w-full items-start gap-2 border-b py-[8px] pr-[11px] pl-[20px] text-left transition-[background_var(--t)]"
                        style={{
                          borderColor: "var(--line)",
                          background: on ? "var(--acc-soft)" : "transparent",
                        }}
                      >
                        {on && (
                          <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: "var(--acc)" }} />
                        )}
                        <Dot
                          tone={dotTone(c)}
                          label={reviewed(responses[c.id]) ? "Reviewed" : "Not yet reviewed"}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            {portalIdFor(entityCode, c.id)}
                          </span>
                          <span className="mt-[1px] block truncate text-[11.5px]">{c.requirement}</span>
                        </span>
                        {nFindings > 0 && <Pill tone="warn">{nFindings}</Pill>}
                        {signOff === "approved" && <Pill tone="good">✓</Pill>}
                        {signOff === "changesRequired" && <Pill tone="warn">⚠</Pill>}
                      </button>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>

      {/* detail — Sarel, after trying the full CheckDetail workspace here:
          "this section is confusing... i dont need all the policy
          references etc." ReviewDetail is a trimmed, review-specific view:
          observation, evidence and its verdict, and every photo/voice note
          with its caption — see ReviewDetail's own header for what it
          deliberately leaves out and why. */}
      {active ? (
        <ReviewDetail
          key={active.id}
          check={active}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Empty>
            <IconInbox width={26} height={26} />
            <div>Select a check.</div>
          </Empty>
        </div>
      )}
    </>
  );
}
