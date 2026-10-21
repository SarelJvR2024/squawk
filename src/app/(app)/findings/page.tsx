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
import { useOutstanding, carriesWork, useKnownHazardousEvents } from "@/lib/carryforward";
import PossibleEvents from "@/components/PossibleEvents";
import { portalIdFor } from "@/lib/sites";
import { BAND_META, bandFor, cellCode } from "@/lib/risk";
import { duplicateFindings } from "@/lib/merge";
import { Btn, Dot, Empty, Pill } from "@/components/ui/primitives";
import type { Tone } from "@/components/ui/primitives";
import GroupRow from "@/components/ui/GroupRow";
import Sheet from "@/components/ui/Sheet";
import RatingPicker from "@/components/RatingPicker";
import FindingDetail from "@/components/FindingDetail";
import CheckDetail from "@/components/CheckDetail";
import SystemTreatment from "@/components/SystemTreatment";
import RaiseFindingSheet from "@/components/RaiseFindingSheet";
import { IconInbox, IconPlus, IconSearch, IconX } from "@/components/ui/icons";
import type { Check, Finding, Tolerance, Attachment, AdHocItem } from "@/lib/types";
import { AttachmentStrip } from "@/components/Capture";

/** Every value the band filter can take, in the order the chips render — the
 *  worst-first reading order an auditor scans a risk list in. */
const BANDS: Tolerance[] = ["Unacceptable", "Tolerable", "Acceptable", "Not audited"];

const NO_SYSTEM = "No asset system recorded";

/** What the Evidence status tab's verdict reads as here — same three codes
 *  as Response.evidenceVerdict (CheckDetail.tsx's EVIDENCE_VERDICTS), kept
 *  as its own small map rather than importing that UI-local array: this
 *  screen only ever needs the label and tone, never the button/icon. */
const EVIDENCE_VERDICT_LABEL: Record<string, string> = {
  C: "Compliant",
  NC: "Non-compliant",
  NV: "Not Verified",
};
const evidenceVerdictTone = (v: string): Tone =>
  v === "C" ? "good" : v === "NC" ? "bad" : "warn";

/** Same reasoning, for Response.evidenceStatus (CheckDetail.tsx's
 *  EVIDENCE_STATUSES) — whether the proof has actually been produced, read
 *  here even when nobody has written a verdict or a proves-sentence yet.
 *  Sarel: "i see no notes is pulling through for the photos, bring back the
 *  compliance" — a check can carry attached photos with a status set
 *  (Provided, say) and nothing else, and this screen showed nothing for it
 *  because the EVIDENCE pill below only fires on evidenceVerdict/Proves. */
const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  noneAvailable: "No evidence",
  specificNotAvailable: "Not produced",
  toBeProvided: "Pending",
  providedForReview: "Provided",
};
const evidenceStatusTone = (v: string): Tone =>
  v === "providedForReview" ? "good" : v === "specificNotAvailable" ? "warn" : "accent";

/** The 2025 audit's own three-level vocabulary, mapped to the app's tones. It
 *  is NOT B170 001M's — see BAND_AS_RATING in src/lib/risk.ts for why the two
 *  vocabularies are bridged rather than treated as the same words. */
const ratingTone = (r: string): Tone =>
  r === "Unacceptable" ? "bad" : r === "Tolerable" ? "warn" : r === "Acceptable" ? "good" : "neutral";

/** The actual CSS custom property behind each tone — NOT a `--${tone}...`
 *  template, because "neutral" breaks that pattern on both counts: the
 *  colour variable is `--neu` (not `--neutral`) and it has no `-line`
 *  variant of its own at all, only the generic `--line-2` every muted border
 *  in the app already uses. Mirrors Pill's own internal table in
 *  components/ui/primitives.tsx, which is not exported. */
const TONE_VARS: Record<Tone, { fg: string; bg: string; line: string }> = {
  good: { fg: "var(--good)", bg: "var(--good-bg)", line: "var(--good-line)" },
  bad: { fg: "var(--bad)", bg: "var(--bad-bg)", line: "var(--bad-line)" },
  warn: { fg: "var(--warn)", bg: "var(--warn-bg)", line: "var(--warn-line)" },
  neutral: { fg: "var(--neu)", bg: "var(--neu-bg)", line: "var(--line-2)" },
  accent: { fg: "var(--acc)", bg: "var(--acc-soft)", line: "var(--acc-line)" },
};

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
      className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[8px] border font-mono text-[10px] font-semibold"
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
  const knownEvents = useKnownHazardousEvents();
  const patchSystem = useStore((s) => s.patchSystem);
  const systemAssessment = useStore((s) => s.systemAssessment);

  const [q, setQ] = useState("");
  /* Sarel: "color code the asset systems to show previous classification, add
     filter for tolerable, unacceptable." The previous audit's band is already
     a coloured pill on every row (see the 2025 one below); this filters the
     tree down to only the bands checked — empty means no filter, same
     "nothing picked reads as everything" rule the discipline filter and the
     walk screen's group filter already use. A system with no prior rating at
     all (`priorFor` returns null — it was not in the 2025 list) matches no
     band and is filtered OUT while any band is checked, because it has no
     previous classification to filter on. */
  const [bandFilter, setBandFilter] = useState<Set<Tolerance>>(new Set());
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
  /** Which check-point's own capture popup is open — Sarel: "when clicking
   *  on the row it should bring up the popup with the same view as when
   *  capturing the inspection." Scoped to the asset system currently shown
   *  (`active.checks`), which is also where prev/next step through. */
  const [openCheckId, setOpenCheckId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /* THE GAP THIS SHEET CLOSES — see RaiseFindingSheet.tsx's own header. This
     screen reviews findings that already exist; nothing on it let an auditor
     raise one that is not tied to a check, so a non-compliance picked up
     outside the register (or at consolidation, reviewing several checks at
     once) had nowhere to go but the walk screen's ad-hoc flow. */
  const [raiseOpen, setRaiseOpen] = useState(false);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  /* WHERE A STICKY GROUP HEADER HAS TO STOP — and the answer depends on which
     scroll container it is sticking inside, which changes at the `lg`
     breakpoint (1024px, matching the grid's own `lg:grid-cols-…` below).

     Below `lg`: the two panels stack into one column and the whole page
     scrolls as a single document (unchanged from before) — the bar above is
     sticky at top 0 in that same scroll, so a group header sticky at top 0
     too would slide underneath it and be invisible for exactly as long as it
     is meant to be useful. `barH` is the bar's real measured height, so the
     group header sticks just below it instead.

     At `lg` and up: the tree becomes its OWN independent scroll container
     (see the panel below), no longer sharing a scroll context with the bar
     at all — the bar sits in the fixed, non-scrolling header zone above both
     panels. A group header there sticks to the TOP of the tree's own scroll,
     so the offset needs to be 0, not the bar's height. */
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const measure = () => setBarH(mq.matches ? 0 : el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    mq.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
    };
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
          .filter(
            (x) =>
              bandFilter.size === 0 ||
              bandFilter.has(priorFor(entityCode, discipline, x.system)?.rating as Tolerance)
          )
          .sort((a, b) =>
            a.system === NO_SYSTEM ? 1 : b.system === NO_SYSTEM ? -1 : a.system.localeCompare(b.system)
          ),
      }))
      .filter((d) => d.systems.length > 0)
      .sort((a, b) => a.discipline.localeCompare(b.discipline));
  }, [entityCode, q, bandFilter]);

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

  /* AN AD-HOC FINDING'S OWN NOTE AND PHOTOS LIVE ON THE OBSERVATION, NOT ON
     THE FINDING — see the comment on FindingDetail's own lookup, which this
     mirrors. Needed here too: Sarel, "show all findings and their photos and
     notes in the right hand panel," and a finding raised off the walk has
     nothing else to show. */
  const adhocByFindingId = useMemo(() => {
    const m = new Map<string, (typeof adhocItems)[number]>();
    for (const it of adhocItems) if (it.findingId) m.set(it.findingId, it);
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
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col px-4 pt-3 pb-16 sm:px-6 lg:min-h-0 lg:flex-1 lg:pb-3">
        {/* COMPACT, ON PURPOSE. This used to be a title line, a sentence of
            prose beneath it, then the bar — three stacked blocks before any
            work was visible. The prose folds into the title row itself (gone
            below `sm`, same as before) and the vertical gaps tighten, so the
            two panels below start noticeably higher without losing any of
            the three things this header actually says: what screen this is,
            how to rate, and the mode/search/filter controls. */}
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          {/* The site by the name the audit uses, not its ICAO code. `entityCode`
              is FALE; the masthead, the nav and every other heading say KSIA,
              and a screen that says FALE reads as a different airport. */}
          <h2 className="text-[15px] font-bold">Asset systems at {entity.short}</h2>
          <p className="hidden text-[11.5px] sm:block" style={{ color: "var(--ink-2)" }}>
            Rate each one as a group on ACSA&rsquo;s B170 001M matrix — band and strategy
            calculated from the cell, never typed.
          </p>
        </div>

        <div
          ref={barRef}
          className="sticky top-0 z-10 -mx-4 mb-1.5 shrink-0 border-b px-4 py-[4px] sm:-mx-6 sm:px-6 sm:py-[5px]"
          style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        >
          {/* THE MODE SWITCH, THE SEARCH BOX AND THE RATING FILTER, ALL ONE ROW
              NOW — Sarel: "move these buttons and search all into one row and
              make thinner." These used to be two rows (the mode switch and the
              rated count above, search and the filter pills below), each with
              its own vertical padding — on a wide screen that was two mostly-
              empty rows stacked on top of each other. One row, flex-wrapping
              at narrow widths exactly as the search-and-filter pairing already
              did, and every control a touch shorter (buttons and the search
              box both lost a few px of min-height) for "thinner". */}
          <div className="flex flex-wrap items-center gap-2">
            {/* THE TWO WAYS IN. Asset system is the default because it is what
                the screen is for; the flat register is the one an auditor
                rating what they raised this morning needs, and it is one press.
                Same control shape as the Inspection screen's axis switch, so
                there is one thing to learn. */}
            <div
              role="radiogroup"
              aria-label="Arrange the work by"
              className="flex min-w-0 gap-[2px] rounded-[11px] p-[2px] sm:max-w-[320px]"
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
                  className="flex min-h-[32px] items-center justify-center gap-[6px] rounded-[8px] px-3 font-display text-[11.5px] font-semibold transition-[var(--t)]"
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

            <div
              className="flex min-w-0 flex-1 items-center gap-2 rounded-[11px] border px-3 py-[2px] sm:max-w-[240px] sm:flex-none"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            >
              <IconSearch width={14} height={14} className="shrink-0" style={{ color: "var(--ink-3)" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={mode === "systems" ? "Search an asset system…" : "Search a finding…"}
                aria-label={mode === "systems" ? "Search an asset system" : "Search a finding"}
                className="min-h-[30px] w-full min-w-0 border-none bg-transparent text-[13px] outline-none"
              />
            </div>

            {/* THE 2025 BAND, AS A FILTER — not just a colour on the row. Sarel:
                "add filter for tolerable, unacceptable." Toggled, not
                radio-picked, because "everything that is not fine" is exactly
                Unacceptable + Tolerable together, and an auditor triaging what
                needs attention first wants both checked at once. Nothing
                checked reads as no filter, same rule the rest of this screen's
                filters use. */}
            {mode === "systems" && (
              <div
                role="group"
                aria-label="Filter by the previous audit's rating"
                className="flex flex-wrap items-center gap-[5px]"
              >
                <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  2025 RATING
                </span>
                {BANDS.map((b) => {
                  const on = bandFilter.has(b);
                  const t = TONE_VARS[ratingTone(b)];
                  return (
                    <button
                      key={b}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setBandFilter((cur) => {
                          const next = new Set(cur);
                          if (next.has(b)) next.delete(b);
                          else next.add(b);
                          return next;
                        })
                      }
                      className="rounded-full border px-[9px] py-[4px] font-mono text-[10px] font-semibold transition-[var(--t)]"
                      style={
                        on
                          ? { background: t.fg, borderColor: t.fg, color: "#fff" }
                          : { background: t.bg, borderColor: t.line, color: t.fg }
                      }
                    >
                      {b}
                    </button>
                  );
                })}
                {bandFilter.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setBandFilter(new Set())}
                    className="font-mono text-[9.5px] underline-offset-2 hover:underline"
                    style={{ color: "var(--ink-3)" }}
                  >
                    clear
                  </button>
                )}
              </div>
            )}

            {/* THE ENTRY POINT THIS SCREEN DID NOT HAVE — Sarel: "make sure
                there's an easy way to capture findings". Always here, in
                either mode, because a non-compliance that is not tied to a
                check does not know or care whether the auditor was arranging
                by asset system or by the flat register when they noticed
                it. */}
            <Btn
              variant="primary"
              className="ml-auto shrink-0"
              onClick={() => setRaiseOpen(true)}
            >
              <IconPlus width={14} height={14} />
              Raise a finding
            </Btn>
          </div>
        </div>

        <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ------------------------------------------------ the hierarchy */}
          <div
            /* TWO DIFFERENT SCROLL STORIES, SPLIT AT `lg`.
               Below `lg` the two panels stack into one column and the outer
               `.app-scroll` div above is the only scroll container — this
               panel has no height constraint of its own and just grows,
               exactly as before.
               At `lg` and up the grid becomes a fixed-height row (the outer
               scroll turns off — see `lg:overflow-hidden` above) and this
               panel becomes an independent scroll region so the tree can move
               without taking the rated-system panel beside it along for the
               ride, and vice versa. `lg:min-h-0` is required for that: a grid
               item's default min-height is `auto`, which would otherwise let
               this panel's content push the row taller than the fixed area
               instead of scrolling inside it.

               `min-w-0` IS load-bearing at every width. A grid item's default
               min-width is `auto`, so a child wider than the track pushes the
               item past it rather than shrinking — and because the app shell
               is `overflow: hidden`, the overflow is CLIPPED rather than
               scrollable. Measured at 375px: the group row's "0/13" count lost
               its last character off the right edge, silently. */
            className="min-w-0 rounded-[11px] border lg:min-h-0 lg:overflow-y-auto"
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
                        /* THE ROW ITSELF CARRIES LAST AUDIT'S COLOUR, not only
                           the small pill at the end of it — Sarel: "color code
                           the asset systems to show previous classification."
                           Scanning 75 rows for the pill's text is slower than
                           scanning for a tint; the pill stays too, because the
                           word is the part colour alone must never carry
                           alone. */
                        const priorTone = pf ? TONE_VARS[ratingTone(pf.rating)] : null;
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
                              background: on ? "var(--acc-soft)" : (priorTone?.bg ?? "transparent"),
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
                                {/* LAST AUDIT'S BAND, BESIDE THIS ONE'S — BUT
                                    ONLY WHEN IT DISAGREES, 21 Oct 2026. Sarel's
                                    second visual-hierarchy pass, item 5: "show
                                    one status badge per row (drop the '2025
                                    TOLERABLE' second badge; keep the year only
                                    where it differs from the current audit)."
                                    Marks (this row's own name line, just above)
                                    already carries the LIVE band as a word and
                                    a colour; when this audit confirmed the same
                                    band 2025 had, this chip was that word a
                                    second time, in different clothes, on the
                                    same row. `sameAsLive` is true only when
                                    there IS a live, confirmed band this visit
                                    AND it equals 2025's own rating — the one
                                    case this chip now renders nothing for. A
                                    changed band, an unconfirmed one, or no live
                                    band at all still show it: those are exactly
                                    the cases where last year's word is new
                                    information, not an echo. */}
                                {(() => {
                                  const sameAsLive =
                                    !!pf && confirmed && !!b && BAND_META[b].label === pf.rating;
                                  if (sameAsLive) return null;
                                  return pf && priorTone ? (
                                    <span
                                      className="shrink-0 rounded-full border px-[6px] py-[1px] font-mono text-[8.5px] font-semibold whitespace-nowrap"
                                      style={{
                                        /* Solid, not the tone's own soft fill —
                                           the row behind it is ALREADY that
                                           fill (see priorTone above), so a pill
                                           in the same colour would blend
                                           straight into it. A panel-coloured
                                           chip with the tone's own border and
                                           text is what still reads as its own
                                           label sitting on a tinted row. */
                                        background: "var(--panel)",
                                        borderColor: priorTone.line,
                                        color: priorTone.fg,
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
                                  );
                                })()}
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
                className="min-w-0 rounded-[16px] border p-[18px] lg:min-h-0 lg:overflow-y-auto"
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
                className="flex min-w-0 items-center justify-center rounded-[16px] border p-8 text-center text-[12.5px] lg:min-h-0"
                style={{ background: "var(--panel)", borderColor: "var(--line)", color: "var(--ink-3)" }}
              >
                {findings.length === 0
                  ? "Nothing has been raised at this visit yet."
                  : "Pick a finding to rate it."}
              </div>
            )
          ) : !active || !a ? (
            <div
              className="flex min-w-0 items-center justify-center rounded-[16px] border p-8 text-center text-[12.5px] lg:min-h-0"
              style={{ background: "var(--panel)", borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              Pick an asset system to rate it and read everything this audit knows about it.
            </div>
          ) : (
            <div
              /* PINNED HEADER, SCROLLING BODY, BELOW `lg` ONLY — same split as
                 the tree beside it, and the same reason: below `lg` this is one
                 block in the single page scroll (unchanged); at `lg` and up it
                 becomes its own independent scroll region so rating this system
                 and scrolling through its evidence doesn't drag the tree along.
                 Sarel: the title, the check count and the severity/likelihood
                 pickers should "remain on top" while the rest — the rationale,
                 root causes, mitigations, possible events and the full evidence
                 list below — scrolls underneath them. That block is the sticky
                 header right below; everything after it is the scrolling body. */
              className="min-w-0 rounded-[16px] border lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto"
              style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "var(--e2)" }}
            >
              <div
                className="rounded-t-[16px] px-[18px] pt-[18px] pb-3 lg:sticky lg:top-0 lg:z-10 lg:shrink-0 lg:border-b"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
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
                  className="mb-2 rounded-[11px] border px-3 py-[7px]"
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
              </div>

              <div className="min-w-0 px-[18px] pt-3 pb-[18px] lg:min-h-0 lg:flex-1">

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

                {/* MIGRATION LEFTOVERS ONLY — see SystemAssessment.unassignedRootCauses.
                    A system with no single event to put its old shared causes/
                    actions on unambiguously; each waits here until filed onto
                    the hazard it actually belongs to. Never shown once both
                    lists are empty, and nothing new is ever added here. */}
                {((a.unassignedRootCauses?.length ?? 0) > 0 ||
                  (a.unassignedActions?.length ?? 0) > 0) && (
                  <div
                    className="mt-3 rounded-[11px] border px-3 py-2.5"
                    style={{ background: "var(--warn-soft)", borderColor: "var(--warn-line)" }}
                  >
                    <div className="mb-1 text-[11px] font-semibold" style={{ color: "var(--warn)" }}>
                      From before causes and actions moved onto each hazard — file
                      these onto the right one below
                    </div>
                    {(a.unassignedRootCauses ?? []).map((r) => (
                      <div key={r.id} className="mt-1 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11.5px]">{r.cause}</span>
                        <select
                          aria-label={`File ${r.cause} onto a hazard`}
                          defaultValue=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            useStore
                              .getState()
                              .assignUnassignedRootCause(
                                active.discipline,
                                active.system,
                                r.id,
                                e.target.value
                              );
                          }}
                          className="rounded-[8px] border px-2 py-1 text-[11px]"
                          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                        >
                          <option value="" disabled>
                            File onto…
                          </option>
                          {a.events.map((ev) => (
                            <option key={ev.id} value={ev.id}>
                              {ev.event || "Untitled event"}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            useStore
                              .getState()
                              .removeUnassignedRootCause(active.discipline, active.system, r.id)
                          }
                          aria-label={`Discard ${r.cause}`}
                          className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] border"
                          style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                        >
                          <IconX width={12} height={12} />
                        </button>
                      </div>
                    ))}
                    {(a.unassignedActions ?? []).map((act) => (
                      <div key={act.id} className="mt-1 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11.5px]">{act.action}</span>
                        <select
                          aria-label={`File this action onto a hazard`}
                          defaultValue=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            useStore
                              .getState()
                              .assignUnassignedAction(
                                active.discipline,
                                active.system,
                                act.id,
                                e.target.value
                              );
                          }}
                          className="rounded-[8px] border px-2 py-1 text-[11px]"
                          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                        >
                          <option value="" disabled>
                            File onto…
                          </option>
                          {a.events.map((ev) => (
                            <option key={ev.id} value={ev.id}>
                              {ev.event || "Untitled event"}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            useStore
                              .getState()
                              .removeUnassignedAction(active.discipline, active.system, act.id)
                          }
                          aria-label="Discard this action"
                          className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] border"
                          style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                        >
                          <IconX width={12} height={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sarel: "also allow to add multiple hazardous events per asset
                    system which must pull through to the hira view" — and later,
                    "dont rate the hazard, rate the asset system severity and
                    likelihood... capture root causes and mitigating actions for
                    the hazard." Same component the closure screen uses for a
                    carried finding's possible events, with likelihood hidden
                    (the asset system above carries the one rating of record) and
                    each event's own root causes/actions expanding inline — see
                    SystemTreatment. Unlike the closure screen's, these are meant
                    to be promoted — see the "From asset assurance" section on
                    /hazards. */}
                <PossibleEvents
                  events={a.events}
                  showLikelihood={false}
                  onAdd={(event) => {
                    useStore.getState().addSystemEvent(active.discipline, active.system, event);
                    say("Hazardous event recorded — pull it through on the HIRA screen");
                  }}
                  onPatch={(id, p) =>
                    useStore.getState().patchSystemEvent(active.discipline, active.system, id, p)
                  }
                  onRemove={(id) =>
                    useStore.getState().removeSystemEvent(active.discipline, active.system, id)
                  }
                  causesAndActions={(e) => (
                    <div className="mt-2">
                      <SystemTreatment
                        rootCauses={e.rootCauses ?? []}
                        actions={e.actions ?? []}
                        onAddCause={(c) => {
                          useStore
                            .getState()
                            .addSystemEventRootCause(active.discipline, active.system, e.id, c);
                          say("Root cause recorded");
                        }}
                        onPatchCause={(id, p) =>
                          useStore
                            .getState()
                            .patchSystemEventRootCause(active.discipline, active.system, e.id, id, p)
                        }
                        onRemoveCause={(id) =>
                          useStore
                            .getState()
                            .removeSystemEventRootCause(active.discipline, active.system, e.id, id)
                        }
                        onAddAction={(t) => {
                          useStore
                            .getState()
                            .addSystemEventAction(active.discipline, active.system, e.id, t);
                          say("Action recorded — it needs an owner and a date");
                        }}
                        onPatchAction={(id, p) =>
                          useStore
                            .getState()
                            .patchSystemEventAction(active.discipline, active.system, e.id, id, p)
                        }
                        onRemoveAction={(id) =>
                          useStore
                            .getState()
                            .removeSystemEventAction(active.discipline, active.system, e.id, id)
                        }
                      />
                    </div>
                  )}
                  suggestions={knownEvents}
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
                  adhocByFindingId={adhocByFindingId}
                  onOpenFinding={setOpenFinding}
                  onOpenCheck={setOpenCheckId}
                />
              </div>
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

      {/* One check-point, in the same capture view as /capture and /field —
          Sarel: "when clicking on the row it should bring up the popup with
          the same view as when capturing the inspection." Scoped to the
          asset system on screen: prev/next step through `active.checks`,
          the same list the check-points section below just listed. */}
      {(() => {
        if (!openCheckId || !active) return null;
        const i = active.checks.findIndex((x) => x.id === openCheckId);
        const c = i >= 0 ? active.checks[i] : null;
        if (!c) return null;
        return (
          <Sheet
            open
            wide
            onClose={() => setOpenCheckId(null)}
            badges={
              <>
                <span>{portalIdFor(entityCode, c.id)}</span>
                <span>·</span>
                <span>{active.system}</span>
              </>
            }
            title={c.requirement || "This check-point carries no register text"}
            subtitle="ACSA check-point · the same capture view as /capture and /field"
            footer={
              <Btn variant="primary" onClick={() => setOpenCheckId(null)}>
                Close
              </Btn>
            }
          >
            <CheckDetail
              key={c.id}
              check={c}
              onPrev={() => {
                if (i > 0) setOpenCheckId(active.checks[i - 1].id);
              }}
              onNext={() => {
                if (i < active.checks.length - 1) setOpenCheckId(active.checks[i + 1].id);
              }}
              onSaved={say}
            />
          </Sheet>
        );
      })()}

      <RaiseFindingSheet
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        onSaved={(id, message) => {
          say(message);
          setRaiseOpen(false);
          /* Land where the new finding can actually be seen without hunting
             for it — the flat register, on the row just raised. It appears
             there (and in its asset system's own "Raised at this audit" list,
             if one was picked) with no special-casing: addFinding() put it in
             the same `findings` list this screen already reads. */
          setMode("findings");
          setActiveFindingId(id);
        }}
      />

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
  adhocByFindingId,
  onOpenFinding,
  onOpenCheck,
}: {
  entityCode: string;
  discipline: string;
  system: string;
  checks: Check[];
  responses: Record<
    string,
    {
      compliance?: string | null;
      observation?: string;
      evidenceStatus?: string | null;
      evidenceVerdict?: string | null;
      evidenceProves?: string;
      attachments?: Attachment[];
    } | undefined
  >;
  prior: { key: string; finding: string; originLabel: string; rating: string }[];
  raised: Finding[];
  walk: { id: string; description: string; outcome: string | null }[];
  /** Finding id → the other ids raised for the same issue on the same check. */
  duplicateOf: Map<string, string[]>;
  /** An ad-hoc finding's note and photographs live on the observation it came
   *  from, not on the finding itself — see the lookup this mirrors in
   *  FindingDetail. */
  adhocByFindingId: Map<string, AdHocItem>;
  onOpenFinding: (id: string) => void;
  /** Opens the same popup capturing uses, on this check-point — Sarel:
   *  "when clicking on the row it should bring op the popup with the same
   *  view as when caoturing the inspection." */
  onOpenCheck: (id: string) => void;
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
          /* A FINDING'S OWN NOTE AND PHOTOS, READ IN THE ROW — Sarel: "show
             all findings and their photos and notes in the right hand
             panel." An ad-hoc finding carries nothing of its own; both live
             on the walk observation it was raised from. A check-raised
             finding reads them off its check's response instead — the
             observation written there, and whatever was attached as
             evidence. */
          const from = adhocByFindingId.get(f.id);
          const checkResponse = f.checkId ? responses[f.checkId] : undefined;
          const note = from ? from.note : (checkResponse?.observation ?? "");
          const attachments = from ? from.attachments : (checkResponse?.attachments ?? []);
          return (
            <FindingRow
              key={f.id}
              f={f}
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
              note={note}
              attachments={attachments}
              duplicateNote={
                /* IN THE ROW, not behind a panel: this is the one moment the
                   two are side by side in a list, which is where a person
                   can actually settle it. */
                duplicateOf.has(f.id) ? (
                  <span
                    className="mt-[2px] block font-mono text-[9px] font-semibold"
                    style={{ color: "var(--warn)" }}
                  >
                    also raised as {duplicateOf.get(f.id)!.join(", ")} — same issue, same check
                  </span>
                ) : null
              }
              onOpen={() => onOpenFinding(f.id)}
            />
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
          /* WHAT THE EVIDENCE PROVES, read onto the asset-system view —
             Sarel: this should also be visible here, not only on the check
             screen that captured it. A check can read COMPLIANT above while
             its own evidence verdict disagrees (the group hasn't reconciled
             them yet), which is exactly the kind of gap this panel exists
             to surface, not hide.

             FALLS BACK TO THE EVIDENCE STATUS — Sarel: "i see no notes is
             pulling through for the photos, bring back the compliance." A
             check can carry photographs and a status (Provided, say) with
             nobody having written a verdict or a proves-sentence yet;
             showing nothing for it read as the evidence having vanished
             rather than as not yet judged. */
          const evidence = (r?.evidenceVerdict || r?.evidenceProves || r?.evidenceStatus) && (
            <span className="mt-[3px] flex flex-wrap items-start gap-[5px]">
              {r?.evidenceVerdict ? (
                <Pill tone={evidenceVerdictTone(r.evidenceVerdict)}>
                  EVIDENCE: {EVIDENCE_VERDICT_LABEL[r.evidenceVerdict] ?? r.evidenceVerdict}
                </Pill>
              ) : (
                r?.evidenceStatus && (
                  <Pill tone={evidenceStatusTone(r.evidenceStatus)}>
                    EVIDENCE: {EVIDENCE_STATUS_LABEL[r.evidenceStatus] ?? r.evidenceStatus}
                  </Pill>
                )
              )}
              {r?.evidenceProves && (
                <span className="min-w-0 flex-1 text-[15px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
                  {r.evidenceProves}
                </span>
              )}
            </span>
          );
          return (
            <CheckRow
              key={c.id}
              id={portalIdFor(entityCode, c.id)}
              tone={tone}
              right={word}
              requirement={c.requirement}
              evidence={evidence}
              attachments={r?.attachments ?? []}
              onOpen={() => onOpenCheck(c.id)}
            />
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

      <div className="mt-2 text-[15px] leading-[1.5]" style={{ color: "var(--ink-4)" }}>
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

/** A FINDING ROW THAT CAN SHOW ITS OWN PHOTOS, NOT JUST `Row`'s SHAPE.
 *
 *  Why this is a separate component rather than `Row` with a couple of extra
 *  props: `AttachmentStrip` renders its own `<button>` per photograph (to open
 *  it full-size), and `Row`'s whole clickable area IS a `<button>` — nesting
 *  one inside the other is invalid HTML and breaks the photo's own click
 *  (the row's onClick would fire too, or the browser would refuse the nesting
 *  outright). So only the title-and-band strip is the button here; the note
 *  and the photos are siblings below it, in the same bordered row but outside
 *  the button, where their own clicks are theirs alone. */
function FindingRow({
  f,
  tone,
  right,
  note,
  attachments,
  duplicateNote,
  onOpen,
}: {
  f: Finding;
  tone: Tone;
  right: string;
  note: string;
  attachments: Attachment[];
  duplicateNote: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <div className="border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--line)" }}>
      <button onClick={onOpen} className="flex w-full items-start gap-2 text-left" style={{ minHeight: 44 }}>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {f.id}
          </span>
          <span className="mt-[1px] block text-[11.5px] leading-[1.4]">{f.description || f.title}</span>
          {duplicateNote}
        </span>
        <span className="mt-[2px] shrink-0">
          <Pill tone={tone}>{right}</Pill>
        </span>
      </button>

      {note.trim() && (
        <div className="mt-[6px] text-[11px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
          {note.trim()}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mt-[6px]">
          <AttachmentStrip attachments={attachments} thumbSize={32} />
        </div>
      )}
    </div>
  );
}

/** A CHECK-POINT ROW THAT OPENS THE SAME CAPTURE VIEW — Sarel: "when clicking
 *  on the row it should bring op the popup with the same view as when
 *  caoturing the inspection." Same button-outside-the-attachments shape as
 *  FindingRow, and the same reason: AttachmentStrip's own per-photo button
 *  cannot nest inside this row's clickable area. */
function CheckRow({
  id,
  tone,
  right,
  requirement,
  evidence,
  attachments,
  onOpen,
}: {
  id: string;
  tone: Tone;
  right: string;
  requirement: string;
  evidence: React.ReactNode;
  attachments: Attachment[];
  onOpen: () => void;
}) {
  return (
    <div className="border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--line)" }}>
      <button onClick={onOpen} className="flex w-full items-start gap-2 text-left" style={{ minHeight: 44 }}>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {id}
          </span>
          <span className="mt-[1px] block text-[11.5px] leading-[1.4]">{requirement}</span>
        </span>
        <span className="mt-[2px] shrink-0">
          <Pill tone={tone}>{right}</Pill>
        </span>
      </button>

      {evidence}

      {attachments.length > 0 && (
        <div className="mt-[6px]">
          <AttachmentStrip attachments={attachments} thumbSize={32} />
        </div>
      )}
    </div>
  );
}
