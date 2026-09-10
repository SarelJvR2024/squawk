"use client";

/** THE ASSET SYSTEM ASSESSMENT — the rating ACSA actually publishes.
 *
 *  Sarel: "on this page we are going to do the rating of the asset systems. We
 *  can again use the same hierarchy which is in the checks page; in the
 *  hierarchy we only have discipline and asset system. Per asset system we add
 *  icons in the hierarchy for severity, likelihood and rating. In the right hand
 *  panel we include a list of all open findings from previous audit, and the
 *  current audit checks compliant and non compliant ones and the inspections to
 *  give us the full view of the asset system. At the top of the panel we need to
 *  be able to record the likelihood and severity and the system must calculate
 *  the rating and strategy. We also need to be able to capture multiple root
 *  causes, multiple mitigation actions."
 *
 *  This screen was the findings register: a flat list of findings, each rated on
 *  its own. That work still exists — a finding still carries its own band, its
 *  own root cause and its own owner — and it opens from the evidence list here,
 *  in a sheet (see FindingDetail). What changed is what the screen is ABOUT.
 *
 *  WHY THE ASSET SYSTEM AND NOT THE FINDING. ACSA rates, reports and compares
 *  asset systems year on year: that is the row in their register, the unit a
 *  Cluster report is written about, and the number a station manager is asked to
 *  explain. Squawk rated findings and hazards and had no rating at all on the
 *  thing ACSA publishes, so an asset system's band was something a reader
 *  inferred from the worst finding under it. Inferring it is wrong twice:
 *  three Amber findings on one system is not an Amber system, and a system with
 *  no findings is not automatically Green — it may simply not have been looked
 *  at, which is a different and worse fact.
 *
 *  SO NOTHING HERE IS COMPUTED FROM THE FINDINGS. The band comes from a cell the
 *  group taps on B170 001M, and `ratingConfirmed` gates it like every other
 *  rating in this product. The findings, the checks and the walk items are
 *  EVIDENCE the group reads before agreeing that cell, which is why the panel
 *  shows all of them, compliant ones included — a system whose checks all passed
 *  and whose 2025 finding is still open is a real and common shape, and only
 *  seeing both halves makes it visible.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  checksAt,
  priorFor,
  useAdhoc,
  useEntity,
  useEntityCode,
  useResponses,
  useStore,
  useSystems,
  useVisitFindings,
  fieldDone,
} from "@/lib/store";
import { useOutstanding, carriesWork } from "@/lib/carryforward";
import { portalIdFor } from "@/lib/sites";
import { BAND_META, bandFor, cellCode } from "@/lib/risk";
import { duplicateFindings } from "@/lib/merge";
import { Btn, Dot, Empty, Pill } from "@/components/ui/primitives";
import type { Tone } from "@/components/ui/primitives";
import GroupRow from "@/components/ui/GroupRow";
import Sheet from "@/components/ui/Sheet";
import RatingPicker from "@/components/RatingPicker";
import FindingDetail from "@/components/FindingDetail";
import SystemTreatment from "@/components/SystemTreatment";
import { IconInbox, IconSearch } from "@/components/ui/icons";
import type { Check, Finding } from "@/lib/types";

const NO_SYSTEM = "No asset system recorded";

/** The 2025 audit's own three-level vocabulary, mapped to the app's tones. It
 *  is NOT B170 001M's — see BAND_AS_RATING in src/lib/risk.ts for why the two
 *  vocabularies are bridged rather than treated as the same words. */
const ratingTone = (r: string): Tone =>
  r === "Unacceptable" ? "bad" : r === "Tolerable" ? "warn" : r === "Acceptable" ? "good" : "neutral";

/** SEVERITY, LIKELIHOOD AND RATING AS THREE SMALL MARKS.
 *
 *  Sarel asked for icons; these are characters, and deliberately. B170 001M's
 *  scales ARE a letter and a digit — "C - Major", "4 - Occasional" — so the
 *  letter and the digit are the icon, and they say exactly what a glyph would
 *  have to be learned to mean. The band is a word, never a colour alone.
 *
 *  An unset half is an em dash. A blank square in a column of ratings reads as
 *  a zero or as a rendering fault; a dash reads as "not answered", which is
 *  what it is.
 *
 *  A cell the group has NOT agreed renders dashed and muted — the same
 *  distinction the whole product makes, because a rating nobody tapped counts
 *  nowhere and must not look like one that does. */
function Marks({
  severity,
  likelihood,
  band,
  confirmed,
}: {
  severity: string | null;
  likelihood: string | null;
  band: "Red" | "Amber" | "Green" | null;
  confirmed: boolean;
}) {
  const live = band && confirmed;
  const box = (v: string | null, title: string) => (
    <span
      title={title}
      className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border font-mono text-[10px] font-semibold"
      style={{
        borderColor: v ? "var(--line-2)" : "var(--line)",
        borderStyle: v ? "solid" : "dashed",
        background: v ? "var(--sunken)" : "transparent",
        color: v ? "var(--ink-1)" : "var(--ink-4)",
      }}
    >
      {v ? v.charAt(0) : "—"}
    </span>
  );
  return (
    <span className="flex shrink-0 items-center gap-[3px]">
      {box(severity, severity ? `Severity ${severity}` : "Severity not picked")}
      {box(likelihood, likelihood ? `Likelihood ${likelihood}` : "Likelihood not picked")}
      <span
        title={
          band
            ? confirmed
              ? `${BAND_META[band].label} — agreed`
              : `${BAND_META[band].label} — suggested, not agreed by the group`
            : "Not rated at this audit"
        }
        className="shrink-0 rounded-full px-[6px] py-[1px] font-mono text-[8.5px] font-semibold whitespace-nowrap"
        style={
          live
            ? {
                background: `var(--${BAND_META[band].tone}-bg)`,
                color: `var(--${BAND_META[band].tone})`,
              }
            : {
                border: "1px dashed var(--line-3)",
                color: "var(--ink-4)",
              }
        }
      >
        {band ? (confirmed ? BAND_META[band].label.toUpperCase() : "SUGGESTED") : "NOT RATED"}
      </span>
    </span>
  );
}

export default function FindingsPage() {
  const entityCode = useEntityCode();
  const entity = useEntity();
  const findings = useVisitFindings();
  const responses = useResponses();
  const adhocItems = useAdhoc();
  const systems = useSystems();
  const outstanding = useOutstanding();
  const patchSystem = useStore((s) => s.patchSystem);
  const systemAssessment = useStore((s) => s.systemAssessment);

  const [q, setQ] = useState("");
  /* TWO WAYS INTO THE SAME WORK, and the second one is not a nicety.
     The screen is the asset-system assessment — that is what Sarel asked for
     and it is the default. But a finding still carries its own B170 cell, and
     on the asset-system view the only route to it is: know which asset system
     it is under, open that system, find it in the evidence list, open it. An
     auditor who has just raised eleven findings on a walk and wants to rate
     them at the out-brief does not know or care which systems they are under —
     they want the eleven. Making them hunt is how findings arrive at ACSA
     unrated.
     So the flat register is one press away, listing every finding at this
     visit with its band. It is not a second screen: the same FindingDetail
     pane renders in both. */
  const [mode, setMode] = useState<"systems" | "findings">("systems");
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  /* `null` means "nobody has folded anything yet" and reads as: the discipline
     holding whatever the right panel is showing is open, everything else shut.
     Once the auditor presses a header it becomes their own set. Same shape the
     Follow-up screen uses, and for the same reason — a list whose default state
     contradicts the panel beside it has lost track of what it is showing. */
  const [expanded, setExpanded] = useState<string[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  /* WHERE A STICKY GROUP HEADER HAS TO STOP. Same measurement the Inspection
     screen makes and for the same reason: a header sticky at top 0 under a bar
     that is also sticky at top 0 slides underneath it and is invisible for
     exactly as long as it is meant to be useful. */
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setBarH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* EVERY ASSET SYSTEM AT THIS SITE, from the register rather than from what
     happens to carry a finding. A system with nothing against it still has to
     be rateable — "we looked and it was sound" is a finding of the audit, and a
     system that never appears cannot be given one. */
  const tree = useMemo(() => {
    const checks = checksAt(entityCode);
    const byDiscipline = new Map<string, Map<string, Check[]>>();
    for (const c of checks) {
      const sys = c.system?.trim() || NO_SYSTEM;
      let m = byDiscipline.get(c.discipline);
      if (!m) byDiscipline.set(c.discipline, (m = new Map()));
      const list = m.get(sys);
      if (list) list.push(c);
      else m.set(sys, [c]);
    }
    const s = q.trim().toLowerCase();
    return [...byDiscipline.entries()]
      .map(([discipline, m]) => ({
        discipline,
        systems: [...m.entries()]
          .map(([system, checks]) => ({ system, checks }))
          .filter(
            (x) =>
              !s ||
              `${x.system} ${discipline}`.toLowerCase().includes(s) ||
              x.checks.some((c) => c.requirement?.toLowerCase().includes(s))
          )
          .sort((a, b) =>
            a.system === NO_SYSTEM ? 1 : b.system === NO_SYSTEM ? -1 : a.system.localeCompare(b.system)
          ),
      }))
      .filter((d) => d.systems.length > 0)
      .sort((a, b) => a.discipline.localeCompare(b.discipline));
  }, [entityCode, q]);

  /* THE SCREEN ARRIVES ON SOMETHING. An asset-system assessment whose right
     panel says "pick one" is half a screen of nothing and a press before any
     work starts; the first system of the first discipline is as good a place to
     land as any, and it is one press to go somewhere else. Derived rather than
     written into state, so it follows the search rather than pinning the panel
     to a system the search has filtered away. */
  const firstKey = tree[0]?.systems[0]
    ? `${tree[0].discipline}|${tree[0].systems[0].system}`
    : null;
  const shownKey =
    activeKey && tree.some((d) => d.systems.some((x) => `${d.discipline}|${x.system}` === activeKey))
      ? activeKey
      : firstKey;
  const shownDiscipline = shownKey?.split("|")[0] ?? null;

  /* A search opens everything it matched. Shut groups showing nothing reads as
     "no results" and is the worst possible answer, because it is wrong. */
  const searching = q.trim().length > 0;
  const isOpen = (key: string) =>
    searching || (expanded === null ? key === shownDiscipline : expanded.includes(key));
  const toggle = (key: string) =>
    setExpanded((cur) => {
      /* The first press takes the default's own state with it, so opening a
         second discipline does not silently shut the one being shown. */
      const base = cur ?? (shownDiscipline ? [shownDiscipline] : []);
      return base.includes(key) ? base.filter((x) => x !== key) : [...base, key];
    });

  /* ONE DEFECT COUNTED TWICE REACHES ACSA AS TWO — and this is the only place
     that says so.

     Two auditors who both tap the same issue button on the same check each mint
     a finding with its own random id, and the merge keys on id, so it keeps
     both. Over the shared record that happens silently: the merge report is
     only shown for a file merge, so nothing would ever say it out loud.

     The warning lived on the old flat findings list, and it only means anything
     where the two rows are side by side — which, on this screen, is the asset
     system's "raised at this audit" list. Both findings are the same check and
     the same issue, so they are always in the same asset system, and the pair
     is visible together. */
  const duplicateOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of duplicateFindings(findings)) {
      for (const id of d.ids) m.set(id, d.ids.filter((x) => x !== id));
    }
    return m;
  }, [findings]);

  /* The flat register, in the id order the findings were raised. Same search
     box as the tree — a search on this screen means "find the thing I am
     looking for", whichever way the list happens to be arranged. */
  const flat = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return findings;
    return findings.filter((f) =>
      `${f.id} ${f.description} ${f.title} ${f.discipline} ${f.system}`.toLowerCase().includes(t)
    );
  }, [findings, q]);

  /* Findings raised THIS visit, per asset system. */
  const findingsBySystem = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of findings) {
      const k = `${f.discipline}|${f.system?.trim() || NO_SYSTEM}`;
      const l = m.get(k);
      if (l) l.push(f);
      else m.set(k, [f]);
    }
    return m;
  }, [findings]);

  /* Still open from an earlier audit, per asset system. Scoped with carriesWork
     so an item rated Acceptable in 2025 — which required no mitigation, so
     there is nothing to verify — is not counted as work the system carries. */
  const priorBySystem = useMemo(() => {
    const m = new Map<string, typeof outstanding>();
    for (const p of outstanding.filter(carriesWork)) {
      const k = `${p.discipline}|${p.system?.trim() || NO_SYSTEM}`;
      const l = m.get(k);
      if (l) l.push(p);
      else m.set(k, [p]);
    }
    return m;
  }, [outstanding]);

  const walkBySystem = useMemo(() => {
    const m = new Map<string, typeof adhocItems>();
    for (const it of adhocItems) {
      const k = `${it.discipline ?? ""}|${it.system?.trim() || NO_SYSTEM}`;
      const l = m.get(k);
      if (l) l.push(it);
      else m.set(k, [it]);
    }
    return m;
  }, [adhocItems]);

  /* A plain lookup, not a memo. It is two array scans over a tree the search
     already narrowed, and wrapping it cost more than it saved — the React
     compiler refuses to optimise the surrounding component when a memo's body
     returns early from inside a loop, which is a worse trade than doing the
     scan. */
  const active = (() => {
    if (!shownKey) return null;
    const [discipline, system] = shownKey.split("|");
    const d = tree.find((x) => x.discipline === discipline);
    const s = d?.systems.find((x) => x.system === system);
    return s ? { discipline, system, checks: s.checks } : null;
  })();

  /* Same rule as the asset system: land on something. A register whose panel
     says "pick one" costs a press before any rating starts, and the auditor is
     here to rate. Derived so it follows the search rather than pinning the pane
     to a finding the search filtered away. */
  const shownFinding =
    flat.find((f) => f.id === activeFindingId) ?? flat[0] ?? null;

  const a = active ? systemAssessment(active.discipline, active.system) : null;
  const band = a ? bandFor(a.severity, a.likelihood) : null;

  const rated = Object.values(systems).filter((x) => x.ratingConfirmed).length;
  const totalSystems = tree.reduce((n, d) => n + d.systems.length, 0);

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 pb-16 sm:px-6">
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {/* The site by the name the audit uses, not its ICAO code. `entityCode`
              is FALE; the masthead, the nav and every other heading say KSIA,
              and a screen that says FALE reads as a different airport. */}
          <h2 className="text-[17px] font-bold">Asset systems at {entity.short}</h2>
          {/* Three lines of prose on a 375px screen, above the work, every time.
              It orients somebody once and costs everybody else a scroll after
              that — the same trade the Inspection and Follow-up headings make.
              Kept from sm, where the room exists. */}
          <p className="hidden text-[12px] sm:block" style={{ color: "var(--ink-2)" }}>
            Rate each one as a group on ACSA&rsquo;s B170 001M matrix. The band and the treatment
            strategy are calculated from the cell, never typed.
          </p>
        </div>

        <div
          ref={barRef}
          className="sticky top-0 z-10 -mx-4 mb-2 border-b px-4 py-[7px] sm:-mx-6 sm:px-6 sm:py-2.5"
          style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        >
          <div className="mb-1.5 flex items-center gap-2">
            {/* THE TWO WAYS IN. Asset system is the default because it is what
                the screen is for; the flat register is the one an auditor
                rating what they raised this morning needs, and it is one press.
                Same control shape as the Inspection screen's axis switch, so
                there is one thing to learn. */}
            <div
              role="radiogroup"
              aria-label="Arrange the work by"
              className="flex min-w-0 flex-1 gap-[2px] rounded-[11px] p-[3px] sm:max-w-[420px] sm:flex-none"
              style={{ background: "var(--sunken)" }}
            >
              {(
                [
                  ["systems", "By asset system"],
                  ["findings", "Findings raised"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={mode === k}
                  onClick={() => setMode(k)}
                  className="flex min-h-[38px] flex-1 items-center justify-center gap-[6px] rounded-[8px] px-3 font-display text-[11.5px] font-semibold transition-[var(--t)] sm:min-h-[40px]"
                  style={{
                    background: mode === k ? "var(--panel)" : "transparent",
                    color: mode === k ? "var(--acc)" : "var(--ink-2)",
                    boxShadow: mode === k ? "var(--e1)" : "none",
                  }}
                >
                  {label}
                  {k === "findings" && findings.length > 0 && (
                    <span className="font-mono text-[10px]">{findings.length}</span>
                  )}
                </button>
              ))}
            </div>
            {/* TWO NUMBERS, AND THE DENOMINATOR IS EVERY ASSET SYSTEM AT THE
                SITE — not the ones that happen to carry a finding. A system
                nobody rated is the gap this screen exists to close. */}
            <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
              {mode === "systems"
                ? `${rated}/${totalSystems} rated`
                : `${findings.filter((f) => f.ratingConfirmed).length}/${findings.length} rated`}
            </span>
          </div>

          <div
            className="flex min-w-0 items-center gap-2 rounded-[11px] border px-3 py-1 sm:py-2"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          >
            <IconSearch width={14} height={14} className="shrink-0" style={{ color: "var(--ink-3)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={mode === "systems" ? "Search an asset system…" : "Search a finding…"}
              aria-label={mode === "systems" ? "Search an asset system" : "Search a finding"}
              className="min-h-[40px] w-full min-w-0 border-none bg-transparent text-[13px] outline-none"
            />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ------------------------------------------------ the hierarchy */}
          <div
            /* No `overflow-hidden`: it would make this its own scroll container
               and a sticky group header inside would never stick. Same trap the
               Inspection screen documents.

               `min-w-0` IS load-bearing. A grid item's default min-width is
               `auto`, so a child wider than the track pushes the item past it
               rather than shrinking — and because the app shell is
               `overflow: hidden`, the overflow is CLIPPED rather than
               scrollable. Measured at 375px: the group row's "0/13" count lost
               its last character off the right edge, silently. */
            className="min-w-0 rounded-[13px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            {mode === "findings" ? (
              flat.length === 0 ? (
                <Empty>
                  <IconInbox width={24} height={24} />
                  <div>
                    {findings.length === 0
                      ? "No finding has been raised at this visit yet. They arrive from the answer library's issue buttons on a check, and from the walk."
                      : "Nothing matches that search."}
                  </div>
                </Empty>
              ) : (
                flat.map((f) => {
                  const b = bandFor(f.severity, f.likelihood);
                  const on = f.id === shownFinding?.id;
                  return (
                    <button
                      key={f.id}
                      data-finding={f.id}
                      onClick={() => setActiveFindingId(f.id)}
                      className="relative flex w-full items-start gap-2 border-b px-[11px] py-[9px] text-left transition-[var(--t)]"
                      style={{
                        borderColor: "var(--line)",
                        background: on ? "var(--acc-soft)" : "transparent",
                        minHeight: 56,
                      }}
                    >
                      {on && (
                        <span
                          className="absolute inset-y-0 left-0 w-[2.5px]"
                          style={{ background: "var(--acc)" }}
                        />
                      )}
                      <Dot
                        tone={
                          b && f.ratingConfirmed
                            ? BAND_META[b].tone
                            : b
                              ? "neutral"
                              : "pending"
                        }
                        label={
                          b ? (f.ratingConfirmed ? BAND_META[b].label : "Suggested") : "Not rated"
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate font-mono text-[9px]"
                          style={{ color: "var(--ink-4)" }}
                        >
                          {f.id} · {f.discipline}
                          {f.adHoc ? " · ad-hoc" : ""}
                        </span>
                        {duplicateOf.has(f.id) && (
                          <span
                            className="mt-[2px] block truncate font-mono text-[9px] font-semibold"
                            style={{ color: "var(--warn)" }}
                          >
                            also raised as {duplicateOf.get(f.id)!.join(", ")} — same issue, same check
                          </span>
                        )}
                        <span className="mt-[1px] block truncate text-[11.5px]">
                          {f.description || f.title}
                        </span>
                      </span>
                      {b && (
                        <span className="mt-[2px] shrink-0">
                          <Pill tone={f.ratingConfirmed ? BAND_META[b].tone : "neutral"}>
                            {f.ratingConfirmed
                              ? (cellCode(f.severity, f.likelihood) ?? "RATED")
                              : "SUGGESTED"}
                          </Pill>
                        </span>
                      )}
                    </button>
                  );
                })
              )
            ) : tree.length === 0 ? (
              <Empty>
                <IconInbox width={24} height={24} />
                <div>Nothing matches that search.</div>
              </Empty>
            ) : (
              tree.map((d) => {
                const open = isOpen(d.discipline);
                const done = d.systems.filter(
                  (x) => systems[`${d.discipline}|${x.system}`]?.ratingConfirmed
                ).length;
                return (
                  <div key={d.discipline} data-group={d.discipline}>
                    <GroupRow
                      label={d.discipline}
                      done={done}
                      total={d.systems.length}
                      open={open}
                      onToggle={() => toggle(d.discipline)}
                      sticky
                      stickyTop={barH}
                      title={`${d.discipline} — ${done} of ${d.systems.length} asset systems rated`}
                    />
                    {open &&
                      d.systems.map((x) => {
                        const key = `${d.discipline}|${x.system}`;
                        const rec = systems[key];
                        const b = bandFor(rec?.severity ?? null, rec?.likelihood ?? null);
                        const confirmed = rec?.ratingConfirmed === true;
                        const on = key === shownKey;
                        const pf = priorFor(entityCode, d.discipline, x.system);
                        const open2025 = priorBySystem.get(key)?.length ?? 0;
                        const raised = findingsBySystem.get(key)?.length ?? 0;
                        return (
                          <button
                            key={key}
                            data-system={x.system}
                            onClick={() => setActiveKey(key)}
                            /* The whole name, for the row that cannot show it.
                               Three marks on the name's line means a long asset
                               system truncates at about 24 characters —
                               "Accessibility & S…" — and the full name is
                               otherwise only in the panel once you have already
                               chosen the row. */
                            title={x.system}
                            /* MINIMISED, at Sarel's word: "the section in the
                               left panel for an asset system has a lot of white
                               space, provide more minimised view." It was three
                               stacked lines and 88px a row — the name, a row of
                               pills, and a line of counts — times 75 asset
                               systems. Two lines and 52px now, with nothing
                               dropped: the marks moved onto the name's own line
                               and the counts share the second one with the 2025
                               band. */
                            className="relative flex w-full items-center gap-2 border-b px-[10px] py-[7px] text-left transition-[var(--t)]"
                            style={{
                              borderColor: "var(--line)",
                              background: on ? "var(--acc-soft)" : "transparent",
                            }}
                          >
                            {on && (
                              <span
                                className="absolute inset-y-0 left-0 w-[2.5px]"
                                style={{ background: "var(--acc)" }}
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-[12.5px] leading-[1.3] font-semibold">
                                  {x.system}
                                </span>
                                {/* SEVERITY, LIKELIHOOD AND RATING, INLINE.
                                    Three marks on the name's own line rather
                                    than a row of pills under it. Each carries
                                    its value as text — a letter, a digit, a band
                                    word — so none of it is read by colour
                                    alone, and an unset half is an em dash
                                    rather than a blank that reads as zero. */}
                                <Marks
                                  severity={rec?.severity ?? null}
                                  likelihood={rec?.likelihood ?? null}
                                  band={b}
                                  confirmed={confirmed}
                                />
                              </span>
                              <span className="mt-[3px] flex items-center gap-2">
                                <span
                                  className="min-w-0 flex-1 truncate font-mono text-[9px]"
                                  style={{ color: "var(--ink-4)" }}
                                >
                                  {x.checks.length} check{x.checks.length === 1 ? "" : "s"}
                                  {open2025 > 0 && (
                                    <span style={{ color: "var(--warn)" }}> · {open2025} still open</span>
                                  )}
                                  {raised > 0 && <span> · {raised} raised</span>}
                                </span>
                                {/* LAST AUDIT'S BAND, BESIDE THIS ONE'S.
                                    Sarel asked for both, with the previous one
                                    "transparent maybe" — so it renders at 55%
                                    against the same tone, which reads as behind
                                    rather than as a second live rating. The word
                                    "2025" is on it, because a faded pill with no
                                    date is just a pill somebody has to ask
                                    about. */}
                                {pf ? (
                                  <span
                                    className="shrink-0 rounded-full px-[6px] py-[1px] font-mono text-[8.5px] font-semibold whitespace-nowrap"
                                    style={{
                                      background: `var(--${ratingTone(pf.rating)}-bg)`,
                                      color: `var(--${ratingTone(pf.rating)})`,
                                      opacity: 0.55,
                                    }}
                                    title={`March 2025 rated this asset system ${pf.rating}`}
                                  >
                                    2025 {pf.rating.toUpperCase()}
                                  </span>
                                ) : (
                                  <span
                                    className="shrink-0 font-mono text-[8.5px] whitespace-nowrap"
                                    style={{ color: "var(--ink-4)", opacity: 0.7 }}
                                    title="March 2025 did not rate this asset system"
                                  >
                                    2025 —
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                );
              })
            )}
          </div>

          {/* ------------------------------------------------- the assessment */}
          {mode === "findings" ? (
            shownFinding ? (
              <div
                className="min-w-0 rounded-[15px] border p-[18px]"
                style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "var(--e2)" }}
              >
                {/* THE SAME PANE, INLINE. It opens in a sheet from an asset
                    system's evidence list and fills the panel here — one
                    component either way, because a finding rated from one route
                    and a finding rated from the other must not be able to
                    differ. */}
                <FindingDetail f={shownFinding} onToast={say} />
              </div>
            ) : (
              <div
                className="flex min-w-0 items-center justify-center rounded-[15px] border p-8 text-center text-[12.5px]"
                style={{ background: "var(--panel)", borderColor: "var(--line)", color: "var(--ink-3)" }}
              >
                {findings.length === 0
                  ? "Nothing has been raised at this visit yet."
                  : "Pick a finding to rate it."}
              </div>
            )
          ) : !active || !a ? (
            <div
              className="flex min-w-0 items-center justify-center rounded-[15px] border p-8 text-center text-[12.5px]"
              style={{ background: "var(--panel)", borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              Pick an asset system to rate it and read everything this audit knows about it.
            </div>
          ) : (
            <div
              className="min-w-0 rounded-[15px] border p-[18px]"
              style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "var(--e2)" }}
            >
              <div
                className="mb-1.5 flex flex-wrap items-center gap-[7px] font-mono text-[10px]"
                style={{ color: "var(--ink-3)" }}
              >
                <span>{active.discipline}</span>
                <span>·</span>
                <span>{active.checks.length} check-points</span>
                {a.assessedAt && (
                  <span>
                    rated by {a.assessedBy} on{" "}
                    {new Date(a.assessedAt).toLocaleDateString("en-ZA")}
                  </span>
                )}
              </div>
              <h3 className="mb-1 text-[15px] leading-[1.3] font-bold">{active.system}</h3>

              {/* THE BAND AND THE STRATEGY, CALCULATED. Both are read off the
                  cell — clause 4.6 pairs one treatment strategy with each band,
                  and typing either by hand is how a register ends up with a Red
                  system whose strategy says "monitor". */}
              <div
                className="mb-3.5 rounded-[12px] border px-3 py-2.5"
                style={{
                  /* The band's surface, off the tone tokens the whole app
                     shares. BAND_META carries a tone, not colours — the colours
                     live in one place in globals.css and a second set here is
                     how two screens come to render different Reds. */
                  background:
                    band && a.ratingConfirmed
                      ? `var(--${BAND_META[band].tone}-bg)`
                      : "var(--sunken)",
                  borderColor:
                    band && a.ratingConfirmed
                      ? `var(--${BAND_META[band].tone}-line)`
                      : "var(--line)",
                }}
              >
                {band ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <b
                        className="font-display text-[13px] font-semibold"
                        style={{
                          color: a.ratingConfirmed
                            ? `var(--${BAND_META[band].tone})`
                            : "var(--ink-3)",
                        }}
                      >
                        {cellCode(a.severity, a.likelihood)} · {BAND_META[band].label}
                      </b>
                      {!a.ratingConfirmed && (
                        <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                          suggested — counts nowhere until the group agrees it
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-[3px] text-[11.5px] leading-[1.5]"
                      style={{
                        color: a.ratingConfirmed
                          ? `var(--${BAND_META[band].tone})`
                          : "var(--ink-3)",
                      }}
                    >
                      Strategy · {BAND_META[band].strategy}
                    </div>
                  </>
                ) : (
                  <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    Not rated. Pick a severity and a likelihood below — the band and the treatment
                    strategy follow from the cell.
                  </div>
                )}
              </div>

              {/* THE MATRIX IS GONE FROM THIS SCREEN, at Sarel's instruction:
                  "remove the large rating matrix, make it more simple to select
                  severity and likelihood."

                  It is still the right control on the findings and hazard
                  screens — the group argues over a cell and points at it — and
                  RecordActions still draws it there. Here it was 25 cells and
                  about 300px sitting above the evidence it is meant to be
                  agreed FROM, encountered once per asset system, seventy-five
                  times.

                  Nothing about the instrument changed. RatingPicker takes its
                  scales from the same SEVERITIES and LIKELIHOODS, derives the
                  band from the same bandFor(), and enforces the same rule the
                  matrix enforces by its shape: a half-set rating is not a
                  rating, so ratingConfirmed goes true only when both axes are
                  answered. */}
              <RatingPicker
                severity={a.severity}
                likelihood={a.likelihood}
                onChange={(patch) => patchSystem(active.discipline, active.system, patch)}
              />

              <label className="mt-1 block">
                <span className="label-xs" style={{ color: "var(--ink-4)" }}>
                  Why the group agreed that cell
                </span>
                <textarea
                  value={a.ratingRationale}
                  onChange={(e) =>
                    patchSystem(active.discipline, active.system, { ratingRationale: e.target.value })
                  }
                  placeholder="What the band rests on — the evidence below, in a sentence…"
                  aria-label="Why the group agreed that cell"
                  className="mt-1 min-h-[54px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                />
              </label>

              {/* Several root causes and several mitigation actions. */}
              <SystemTreatment
                assessment={a}
                onAddCause={(c) => {
                  useStore.getState().addRootCause(active.discipline, active.system, c);
                  say("Root cause recorded");
                }}
                onPatchCause={(id, p) =>
                  useStore.getState().patchRootCause(active.discipline, active.system, id, p)
                }
                onRemoveCause={(id) =>
                  useStore.getState().removeRootCause(active.discipline, active.system, id)
                }
                onAddAction={(t) => {
                  useStore.getState().addMitigation(active.discipline, active.system, t);
                  say("Action recorded — it needs an owner and a date");
                }}
                onPatchAction={(id, p) =>
                  useStore.getState().patchMitigation(active.discipline, active.system, id, p)
                }
                onRemoveAction={(id) =>
                  useStore.getState().removeMitigation(active.discipline, active.system, id)
                }
              />

              {/* ---------------------------------- the full view of the system */}
              <SystemEvidence
                entityCode={entityCode}
                discipline={active.discipline}
                system={active.system}
                checks={active.checks}
                responses={responses}
                prior={priorBySystem.get(`${active.discipline}|${active.system}`) ?? []}
                raised={findingsBySystem.get(`${active.discipline}|${active.system}`) ?? []}
                walk={walkBySystem.get(`${active.discipline}|${active.system}`) ?? []}
                duplicateOf={duplicateOf}
                onOpenFinding={setOpenFinding}
              />
            </div>
          )}
        </div>
      </div>

      {/* One finding, in full, in a sheet. The pane the register used to be
          built around — see FindingDetail. */}
      {(() => {
        const f = openFinding ? findings.find((x) => x.id === openFinding) : null;
        if (!f) return null;
        return (
          <Sheet
            open
            wide
            onClose={() => setOpenFinding(null)}
            badges={
              <>
                <span>{f.id}</span>
                <span>·</span>
                <span>{f.system}</span>
                {f.priorRating && <Pill tone="bad">REPEAT</Pill>}
              </>
            }
            title={f.description || f.title}
            subtitle="One finding · rated on its own, and evidence for the asset system's band"
            footer={
              <Btn variant="primary" onClick={() => setOpenFinding(null)}>
                Done
              </Btn>
            }
          >
            <FindingDetail f={f} onToast={say} />
          </Sheet>
        );
      })()}

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

/** THE FULL VIEW OF ONE ASSET SYSTEM — everything this audit and the last one
 *  know about it, in the order a group reads it before agreeing a band.
 *
 *  Four lists, and the third is the one that is easy to leave out:
 *
 *    1. Still open from an earlier audit. The system's history.
 *    2. Findings raised at this audit.
 *    3. THIS AUDIT'S CHECK-POINTS — compliant ones included. A system whose
 *       checks all passed and whose 2025 finding is still open is a real and
 *       common shape, and a panel that showed only the failures would hide it.
 *       A blank status is shown as NOT CAPTURED and never as compliant.
 *    4. What the walk found that the register does not cover.
 */
function SystemEvidence({
  entityCode,
  discipline,
  system,
  checks,
  responses,
  prior,
  raised,
  walk,
  duplicateOf,
  onOpenFinding,
}: {
  entityCode: string;
  discipline: string;
  system: string;
  checks: Check[];
  responses: Record<string, { compliance?: string | null; observation?: string } | undefined>;
  prior: { key: string; finding: string; originLabel: string; rating: string }[];
  raised: Finding[];
  walk: { id: string; description: string; outcome: string | null }[];
  /** Finding id → the other ids raised for the same issue on the same check. */
  duplicateOf: Map<string, string[]>;
  onOpenFinding: (id: string) => void;
}) {
  const seen = checks.filter((c) => fieldDone(responses[c.id] as never)).length;
  const nc = checks.filter((c) => responses[c.id]?.compliance === "NC").length;
  const ok = checks.filter((c) => responses[c.id]?.compliance === "C").length;
  const blank = checks.filter((c) => !responses[c.id]?.compliance).length;

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <b className="font-display text-[11px] font-semibold">
          Everything this audit knows about {system}
        </b>
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {ok} compliant · {nc} non-compliant · {blank} not captured · {seen} seen on site
        </span>
      </div>

      <Section
        label={`Still open from an earlier audit (${prior.length})`}
        empty="Nothing carried into this visit for this asset system."
      >
        {prior.map((p) => (
          <Row key={p.key} id={p.key} tone="warn" right={p.rating.toUpperCase()}>
            <span style={{ color: "var(--ink-4)" }}>{p.originLabel} · </span>
            {p.finding}
          </Row>
        ))}
      </Section>

      <Section
        label={`Raised at this audit (${raised.length})`}
        empty="No finding has been raised against this asset system at this audit."
      >
        {raised.map((f) => {
          const b = bandFor(f.severity, f.likelihood);
          return (
            <Row
              key={f.id}
              id={f.id}
              tone={b && f.ratingConfirmed ? BAND_META[b].tone : "neutral"}
              right={
                b
                  ? f.ratingConfirmed
                    ? /* cellCode prints severity-first (C4) while looking up
                         likelihood-first. Deliberate and documented in
                         src/lib/risk.ts — do not "tidy" it. Never null here,
                         because a band exists only when both halves do. */
                      (cellCode(f.severity, f.likelihood) ?? "RATED")
                    : "SUGGESTED"
                  : "NOT RATED"
              }
              onClick={() => onOpenFinding(f.id)}
            >
              {f.description || f.title}
              {/* IN THE ROW, not behind a panel: this is the one moment the two
                  are side by side in a list, which is where a person can
                  actually settle it. */}
              {duplicateOf.has(f.id) && (
                <span
                  className="mt-[2px] block font-mono text-[9px] font-semibold"
                  style={{ color: "var(--warn)" }}
                >
                  also raised as {duplicateOf.get(f.id)!.join(", ")} — same issue, same check
                </span>
              )}
            </Row>
          );
        })}
      </Section>

      <Section
        label={`This audit's check-points (${checks.length})`}
        empty="No check-point at this site covers this asset system."
      >
        {checks.map((c) => {
          const r = responses[c.id];
          /* A BLANK STATUS IS NOT CAPTURED, and never compliant. It is the one
             thing this panel must not soften: a system read as compliant on
             checks nobody answered is a band agreed on evidence that does not
             exist. */
          const word =
            r?.compliance === "C"
              ? "COMPLIANT"
              : r?.compliance === "NC"
                ? "NON-COMPLIANT"
                : r?.compliance === "NA"
                  ? "NOT APPLICABLE"
                  : "NOT CAPTURED";
          const tone: Tone =
            r?.compliance === "C"
              ? "good"
              : r?.compliance === "NC"
                ? "bad"
                : r?.compliance === "NA"
                  ? "neutral"
                  : "warn";
          return (
            <Row key={c.id} id={portalIdFor(entityCode, c.id)} tone={tone} right={word}>
              {c.requirement}
            </Row>
          );
        })}
      </Section>

      <Section
        label={`Seen on the walk, not on the register (${walk.length})`}
        empty="The walk found nothing here that the register does not cover."
      >
        {walk.map((w) => (
          <Row key={w.id} id={w.id} tone="accent" right={(w.outcome ?? "no outcome").toUpperCase()}>
            {w.description}
          </Row>
        ))}
      </Section>

      <div className="mt-2 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-4)" }}>
        None of this computes the band. It is what the group reads before agreeing the cell —
        three Amber findings on one asset system is not an Amber system, and a system with no
        findings is not automatically Green.
      </div>
      <div className="sr-only">
        {discipline} · {system}
      </div>
    </div>
  );
}

function Section({
  label,
  empty,
  children,
}: {
  label: string;
  empty: string;
  children: React.ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="mb-3">
      <div className="label-xs mb-1" style={{ color: "var(--ink-4)" }}>
        {label}
      </div>
      {has ? (
        <div
          className="overflow-hidden rounded-[11px] border"
          style={{ borderColor: "var(--line)" }}
        >
          {children}
        </div>
      ) : (
        /* SAID, NOT LEFT BLANK. "No finding was raised here" and "this list did
           not render" look identical when a section simply disappears, and only
           one of them is information. */
        <div
          className="rounded-[11px] border px-3 py-2 text-[11.5px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line)", color: "var(--ink-4)" }}
        >
          {empty}
        </div>
      )}
    </div>
  );
}

function Row({
  id,
  tone,
  right,
  children,
  onClick,
}: {
  id: string;
  tone: Tone;
  right: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          {id}
        </span>
        <span className="mt-[1px] block text-[11.5px] leading-[1.4]">{children}</span>
      </span>
      <span className="mt-[2px] shrink-0">
        <Pill tone={tone}>{right}</Pill>
      </span>
    </>
  );
  return onClick ? (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-2 border-b px-3 py-2 text-left last:border-b-0"
      style={{ borderColor: "var(--line)", minHeight: 44 }}
    >
      {inner}
    </button>
  ) : (
    <div
      className="flex items-start gap-2 border-b px-3 py-2 last:border-b-0"
      style={{ borderColor: "var(--line)" }}
    >
      {inner}
    </div>
  );
}
