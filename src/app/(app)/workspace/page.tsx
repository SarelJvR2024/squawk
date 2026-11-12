"use client";

/** THE CONSOLIDATED CAPTURE SURFACE — one tree, one Add button, every level.
 *
 *  Sarel: the app's capture flow had become scattered across Checks, Field
 *  (the walkabout) and Raise a finding, and that scatter is what this screen
 *  is for — not new functionality, a faster, single front door onto the
 *  SAME record store, the same checks and the same walk items those three
 *  screens already read and write. "We can reuse logic that's already in
 *  the system... start with developing new ones, and once they're working
 *  we can decommission some of the older pages." This is that new one; the
 *  older three stay exactly as they are until this earns its keep.
 *
 *  Every discipline is visible and expandable at once (Review and Capture's
 *  own trees restrict to one discipline via a <select> — deliberate there,
 *  wrong here: "bring it all together" means not making the auditor switch
 *  discipline to see what else needs attention).
 *
 *  THE TWO WAYS A CAPTURE REACHES THE RECORD, DELIBERATELY DIFFERENT:
 *    - a CHECK row already has a place for this — Response.compliance and
 *      Response.observation, the same fields CheckDetail (Checks, Field,
 *      Review) already edits. "+" there sets compliance (for Non-compliance,
 *      which the existing setCompliance action already turns into a raised
 *      finding — see store.ts's own note on that guarantee) and opens the
 *      SAME CheckDetail panel every other screen uses, so there is exactly
 *      one place that check's fields live.
 *    - a DISCIPLINE or ASSET SYSTEM row has no check behind it — that is
 *      what AdHocItem (the walk item) has always been for, and AddItemSheet
 *      already captures one in full (description, photos, voice, outcome).
 *      "+" there opens that exact sheet, preset to the row tapped, two new
 *      optional props (presetSystem, presetOutcome) added to it rather than
 *      a second sheet built to do the same job.
 *
 *  EVIDENCE REQUESTS ARE NOT IN THIS PASS. They are the one piece of the
 *  original brief with no existing record to reuse (see
 *  docs/capture-review/discovery.md §4) — a real, separate addition, not a
 *  UI consolidation, and building it into this screen's Add menu before it
 *  has a record of its own would be a button that does nothing. Phase 2. */

import { useEffect, useMemo, useState } from "react";
import {
  checksOf,
  disciplinesAt,
  systemsOf,
  useAdhoc,
  useEntityCode,
  useResponses,
  useStore,
  useVisitFindings,
} from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import CheckDetail from "@/components/CheckDetail";
import AddItemSheet from "@/components/AddItemSheet";
import PageHeading from "@/components/ui/PageHeading";
import { Empty, Pill } from "@/components/ui/primitives";
import { IconEye, IconFlag, IconInbox, IconPlus, IconSearch, IconX } from "@/components/ui/icons";
import type { AdHocItem, Check, Compliance } from "@/lib/types";

type AddTarget =
  | { level: "discipline"; discipline: string }
  | { level: "system"; discipline: string; system: string }
  | { level: "check"; check: Check }
  | { level: "unassigned" };

/** Same string /field uses for the same reason — AdHocItem.discipline is
 *  explicitly nullable ("null is a real answer", see its own doc comment in
 *  types.ts), and /field never hides such an item behind its own
 *  NO_DISCIPLINE bucket. This tree is discipline-rooted, so it needs the
 *  same bucket or an unattributed item would count toward nothing and be
 *  unreachable from here — the independent review that caught this put it
 *  plainly: "a real miscount, not just a missing feature". */
const NO_DISCIPLINE = "No discipline recorded";

const STORAGE_KEY = "squawk.workspace.expanded";

function loadExpanded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(keys: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    /* Private browsing, storage full — the tree just stops remembering
       itself between visits, which is the same screen either way. */
  }
}

/** A row's own captures — NOT its children's, see the roll-up counts below
 *  which separately add them in. A walk item with no outcome at all is an
 *  observation (a note with nothing to verdict), same reading `setCompliance`
 *  itself uses for a check that has not been answered yet. */
function tally(checks: Check[], responses: ReturnType<typeof useResponses>, adhoc: AdHocItem[]) {
  let nc = 0;
  let obs = 0;
  for (const c of checks) {
    const r = responses[c.id];
    if (!r) continue;
    if (r.compliance === "NC") nc++;
    else if (r.observation.trim()) obs++;
  }
  for (const a of adhoc) {
    if (a.outcome === "NC") nc++;
    /* `a.description` is required (AddItemSheet refuses to save a blank
       one) and therefore always truthy — unlike a check's `observation`,
       it says nothing about whether this item has been verdicted. Only an
       item with NO outcome at all is an unresolved observation; one marked
       C, N/A or NV is a closed question, not one still sitting as a note. */
    else if (a.outcome == null && a.description.trim()) obs++;
  }
  return { nc, obs };
}

export default function WorkspacePage() {
  const entityCode = useEntityCode();
  const responses = useResponses();
  const adhocAll = useAdhoc();
  const findings = useVisitFindings();
  const setCompliance = useStore((s) => s.setCompliance);

  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);

  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded());
  useEffect(() => saveExpanded(expanded), [expanded]);
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const [activeCheck, setActiveCheck] = useState<Check | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null);
  /** Reopening an EXISTING unassigned walk item for editing — see the
     NO_DISCIPLINE bucket below. Separate from addTarget, which is only ever
     a fresh draft. */
  const [editingItem, setEditingItem] = useState<AdHocItem | null>(null);

  const unassigned = useMemo(() => adhocAll.filter((a) => !a.discipline), [adhocAll]);

  const findingsOn = (checkId: string) => findings.filter((f) => f.checkId === checkId);

  const openAdd = (target: AddTarget, kind: "observation" | "non_compliance") => {
    setAddMenuFor(null);
    if (target.level === "check") {
      if (kind === "non_compliance" && responses[target.check.id]?.compliance !== "NC") {
        setCompliance(target.check.id, "NC");
      }
      setActiveCheck(target.check);
      setAddTarget(null);
      return;
    }
    setAddTarget(target);
    setAddOutcome(kind === "non_compliance" ? "NC" : null);
  };
  const [addOutcome, setAddOutcome] = useState<Compliance | null>(null);

  const matches = (text: string) => !q || text.toLowerCase().includes(q);

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeading
          title={<span>Capture</span>}
          progress={
            <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
              Every discipline, one Add button — Observation or Non-compliance, at the
              discipline, asset system or check it belongs to.
            </span>
          }
        />

        <div
          className="flex items-center gap-[7px] border-b px-[10px] py-[7px]"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <IconSearch width={14} height={14} style={{ color: "var(--ink-4)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search disciplines, asset systems, checks…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
            aria-label="Search the capture tree"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="shrink-0 rounded-full p-[3px]"
              style={{ color: "var(--ink-4)" }}
            >
              <IconX width={12} height={12} />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {disciplines.map((discipline) => {
            const disciplineChecks = checksOf(entityCode, discipline);
            const disciplineAdhoc = adhocAll.filter((a) => a.discipline === discipline);
            const systems = systemsOf(entityCode, discipline);
            const disciplineMatches = matches(discipline);
            const anyChildMatches =
              disciplineMatches ||
              systems.some((s) => matches(s)) ||
              disciplineChecks.some((c) => matches(c.requirement));
            if (q && !anyChildMatches) return null;

            const dKey = discipline;
            const open = expanded.has(dKey) || (!!q && anyChildMatches);
            const { nc, obs } = tally(disciplineChecks, responses, disciplineAdhoc);

            return (
              <div key={dKey} data-discipline={discipline}>
                <div
                  className="flex items-center gap-[7px] border-b px-[10px] py-[8px]"
                  style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
                >
                  <button
                    onClick={() => toggle(dKey)}
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${discipline}`}
                    className="font-mono text-[9px]"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {open ? "▼" : "▶"}
                  </button>
                  <b className="min-w-0 flex-1 truncate text-[12.5px]">{discipline}</b>
                  {nc > 0 && <Pill tone="bad">{nc} NC</Pill>}
                  {obs > 0 && <Pill tone="neutral">{obs} Obs</Pill>}
                  <AddButton
                    label={`Add to ${discipline}`}
                    menuOpen={addMenuFor === dKey}
                    onOpen={() => setAddMenuFor(addMenuFor === dKey ? null : dKey)}
                    onPick={(kind) => openAdd({ level: "discipline", discipline }, kind)}
                  />
                </div>

                {open &&
                  systems
                    .filter((sys) => !q || matches(sys) || checksOf(entityCode, discipline, sys).some((c) => matches(c.requirement)))
                    .map((sys) => {
                      const sysChecks = checksOf(entityCode, discipline, sys);
                      const sysAdhoc = disciplineAdhoc.filter((a) => a.system === sys);
                      const sysKey = `${discipline}|${sys}`;
                      const sysOpen = expanded.has(sysKey) || !!q;
                      const sTally = tally(sysChecks, responses, sysAdhoc);

                      return (
                        <div key={sysKey} data-system={sys}>
                          <div
                            className="flex items-center gap-[7px] border-b py-[7px] pr-[10px] pl-[26px]"
                            style={{ borderColor: "var(--line)" }}
                          >
                            <button
                              onClick={() => toggle(sysKey)}
                              aria-expanded={sysOpen}
                              aria-label={`${sysOpen ? "Collapse" : "Expand"} ${sys}`}
                              className="font-mono text-[8px]"
                              style={{ color: "var(--ink-4)" }}
                            >
                              {sysOpen ? "▼" : "▶"}
                            </button>
                            <span className="min-w-0 flex-1 truncate text-[11.5px]">{sys}</span>
                            {sTally.nc > 0 && <Pill tone="bad">{sTally.nc} NC</Pill>}
                            {sTally.obs > 0 && <Pill tone="neutral">{sTally.obs} Obs</Pill>}
                            <AddButton
                              label={`Add to ${discipline} › ${sys}`}
                              menuOpen={addMenuFor === sysKey}
                              onOpen={() => setAddMenuFor(addMenuFor === sysKey ? null : sysKey)}
                              onPick={(kind) => openAdd({ level: "system", discipline, system: sys }, kind)}
                            />
                          </div>

                          {sysOpen &&
                            sysChecks
                              .filter((c) => !q || matches(c.requirement) || matches(sys))
                              .map((c) => {
                                const r = responses[c.id];
                                const cKey = c.id;
                                const n = findingsOn(c.id).length;
                                return (
                                  <div
                                    key={cKey}
                                    data-check={c.id}
                                    className="flex items-center gap-[7px] border-b py-[7px] pr-[10px] pl-[42px]"
                                    style={{
                                      borderColor: "var(--line)",
                                      background:
                                        activeCheck?.id === c.id ? "var(--acc-soft)" : "transparent",
                                    }}
                                  >
                                    <button
                                      onClick={() => setActiveCheck(c)}
                                      className="min-w-0 flex-1 text-left"
                                    >
                                      <span
                                        className="block truncate font-mono text-[9px]"
                                        style={{ color: "var(--ink-4)" }}
                                      >
                                        {portalIdFor(entityCode, c.id)}
                                      </span>
                                      <span className="block truncate text-[11px]">{c.requirement}</span>
                                    </button>
                                    {r?.compliance === "NC" && <Pill tone="bad">NC</Pill>}
                                    {n > 0 && <Pill tone="warn">{n}</Pill>}
                                    <AddButton
                                      label={`Add to ${c.requirement}`}
                                      menuOpen={addMenuFor === cKey}
                                      onOpen={() => setAddMenuFor(addMenuFor === cKey ? null : cKey)}
                                      onPick={(kind) => openAdd({ level: "check", check: c }, kind)}
                                    />
                                  </div>
                                );
                              })}
                        </div>
                      );
                    })}
              </div>
            );
          })}

          {/* NO_DISCIPLINE — a walk item is never required to carry one (see
              AdHocItem.discipline's own doc comment: "null is a real
              answer"), and this tree is discipline-rooted. Without this
              bucket such an item matched no row at all: invisible, and its
              own Non-compliance never counted toward anything, anywhere on
              this screen. /field never hides one behind its own equivalent
              bucket; this doesn't either. */}
          {unassigned.length > 0 && (!q || matches(NO_DISCIPLINE)) && (
            <div data-discipline={NO_DISCIPLINE}>
              <div
                className="flex items-center gap-[7px] border-b px-[10px] py-[8px]"
                style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
              >
                <button
                  onClick={() => toggle(NO_DISCIPLINE)}
                  aria-expanded={expanded.has(NO_DISCIPLINE) || !!q}
                  aria-label={`${expanded.has(NO_DISCIPLINE) ? "Collapse" : "Expand"} ${NO_DISCIPLINE}`}
                  className="font-mono text-[9px]"
                  style={{ color: "var(--ink-4)" }}
                >
                  {expanded.has(NO_DISCIPLINE) || q ? "▼" : "▶"}
                </button>
                <b className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  {NO_DISCIPLINE}
                </b>
                {(() => {
                  const { nc, obs } = tally([], responses, unassigned);
                  return (
                    <>
                      {nc > 0 && <Pill tone="bad">{nc} NC</Pill>}
                      {obs > 0 && <Pill tone="neutral">{obs} Obs</Pill>}
                    </>
                  );
                })()}
                <AddButton
                  label={`Add to ${NO_DISCIPLINE}`}
                  menuOpen={addMenuFor === NO_DISCIPLINE}
                  onOpen={() => setAddMenuFor(addMenuFor === NO_DISCIPLINE ? null : NO_DISCIPLINE)}
                  onPick={(kind) => openAdd({ level: "unassigned" }, kind)}
                />
              </div>

              {(expanded.has(NO_DISCIPLINE) || !!q) &&
                unassigned.map((a) => (
                  <button
                    key={a.id}
                    data-walk-item={a.id}
                    onClick={() => setEditingItem(a)}
                    className="flex w-full items-center gap-[7px] border-b py-[7px] pr-[10px] pl-[26px] text-left"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <span className="min-w-0 flex-1 truncate text-[11.5px]">
                      {a.description || "(no description)"}
                    </span>
                    {a.outcome === "NC" && <Pill tone="bad">NC</Pill>}
                  </button>
                ))}
            </div>
          )}

          {disciplines.every((d) => q && !matches(d) && !systemsOf(entityCode, d).some((s) => matches(s))) &&
            q && (
              <Empty>
                <IconInbox width={26} height={26} />
                <div>Nothing matches &ldquo;{query}&rdquo;.</div>
              </Empty>
            )}
        </div>
      </div>

      {activeCheck ? (
        <CheckDetail
          key={activeCheck.id}
          check={activeCheck}
          onPrev={() => {}}
          onNext={() => {}}
          onSaved={() => {}}
        />
      ) : (
        <div className="hidden flex-1 items-center justify-center md:flex">
          <Empty>
            <IconInbox width={26} height={26} />
            <div>Pick a check, or add an observation to a discipline or asset system.</div>
          </Empty>
        </div>
      )}

      <AddItemSheet
        open={!!addTarget || !!editingItem}
        onClose={() => {
          setAddTarget(null);
          setEditingItem(null);
        }}
        editing={editingItem}
        presetDiscipline={
          addTarget && (addTarget.level === "discipline" || addTarget.level === "system")
            ? addTarget.discipline
            : null
        }
        presetSystem={addTarget && addTarget.level === "system" ? addTarget.system : null}
        presetOutcome={addOutcome}
      />
    </>
  );
}

/** One small ghost "+", the popover it opens, and nothing else — the same
 *  control at every level, so the auditor never has to learn a second one.
 *  Bottom-sheet-vs-popover (brief §3.3) is deliberately skipped for this
 *  first pass: a fixed small menu works identically on phone and desktop and
 *  is one component, not two kept in sync. */
function AddButton({
  label,
  menuOpen,
  onOpen,
  onPick,
}: {
  label: string;
  menuOpen: boolean;
  onOpen: () => void;
  onPick: (kind: "observation" | "non_compliance") => void;
}) {
  return (
    <span className="relative shrink-0">
      <button
        onClick={onOpen}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full"
        style={{ color: "var(--ink-3)", background: menuOpen ? "var(--acc-soft)" : "transparent" }}
      >
        <IconPlus width={14} height={14} />
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute top-[30px] right-0 z-20 w-[220px] overflow-hidden rounded-[10px] border shadow-lg"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <div
            className="truncate px-[10px] py-[6px] text-[10px] font-semibold"
            style={{ color: "var(--ink-4)", borderBottom: "1px solid var(--line)" }}
          >
            {label}
          </div>
          <button
            role="menuitem"
            onClick={() => onPick("observation")}
            className="flex w-full items-center gap-[8px] px-[10px] py-[9px] text-left text-[12px]"
          >
            <IconEye width={14} height={14} style={{ color: "var(--info, var(--acc))" }} />
            <span>
              <span className="block font-medium">Observation</span>
              <span className="block text-[10px]" style={{ color: "var(--ink-4)" }}>
                General note — not a verdict
              </span>
            </span>
          </button>
          <button
            role="menuitem"
            onClick={() => onPick("non_compliance")}
            className="flex w-full items-center gap-[8px] px-[10px] py-[9px] text-left text-[12px]"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <IconFlag width={14} height={14} style={{ color: "var(--bad)" }} />
            <span>
              <span className="block font-medium">Non-compliance</span>
              <span className="block text-[10px]" style={{ color: "var(--ink-4)" }}>
                Does not meet the requirement
              </span>
            </span>
          </button>
        </div>
      )}
    </span>
  );
}
