"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  areasAt,
  checksAt,
  disciplinesAt,
  priorFor,
  useCaptures,
  useEntity,
  useEntityCode,
  useAdhoc,
  useResponses,
  useVisitFindings,
  useStore,
  useVisitId,
  fieldDone,
} from "@/lib/store";
import { locationAxis } from "@/lib/programme";
import { portalIdFor } from "@/lib/sites";
import type { AdHocItem, Check, Response } from "@/lib/types";
import { Btn, Chip, Empty, Pill } from "@/components/ui/primitives";
import AddItemSheet from "@/components/AddItemSheet";
import GroupRow from "@/components/ui/GroupRow";
import Sheet from "@/components/ui/Sheet";
import OutcomeControl, { OUTCOMES } from "@/components/OutcomeControl";
import {
  AttachmentStrip,
  LOCATION_LIST_ID,
  LocationOptions,
  PhotoButton,
  PhotoThumb,
  VoiceNoteButton,
} from "@/components/Capture";
import { useAnswerLibrary } from "@/lib/answers";
import { assist, transcriptContext, useAssistAvailable } from "@/lib/assist";
import { modeLabels, needsField } from "@/lib/verification";
import {
  IconCamera,
  IconCheck,
  IconFlag,
  IconInbox,
  IconPin,
  IconPlus,
  IconSearch,
  IconX,
} from "@/components/ui/icons";

/* EXPLICIT BUCKETS, NEVER HIDDEN ROWS AND NEVER A GUESS.
   A check with no asset system, no location or no discipline is a real state
   and the auditor has to see it; dropping it would quietly shrink the list, and
   the count under it, with nothing saying so. Named once so the filter, the
   tree and the sort all mean the same thing by them. */
const NO_SYSTEM = "No asset system recorded";
const NO_AREA = "No location recorded";
const NO_DISCIPLINE = "No discipline recorded";

/** THE LAST PLACE THIS AUDIT NAMED.
 *
 *  An auditor who opens Inspection, walks off to Findings and comes back is in
 *  the same room they were in a minute ago; making them type it again is the
 *  thing the location field exists to stop. Read off the record rather than out
 *  of storage, because the record is the only thing that survives the device
 *  being handed to the other auditor.
 *
 *  Read ONCE, as the initial value of the running location — not watched. It is
 *  where you are NOW, and a write by any other control must not drag it
 *  somewhere else under the auditor mid-walk. */
function lastLocationIn(responses: Record<string, Response | undefined>): string {
  let best = "";
  let bestAt = -1;
  for (const r of Object.values(responses)) {
    const loc = r?.location?.trim();
    if (!loc) continue;
    const at = r?.updatedAt ?? 0;
    if (at >= bestAt) {
      bestAt = at;
      best = loc;
    }
  }
  return best;
}

export default function FieldPage() {
  const responses = useResponses();
  const captures = useCaptures();
  const visitId = useVisitId();
  /* The researched walkabout options. Field mode is the walkabout screen and
     was the one place that never showed them — an auditor on the apron got
     four status buttons while 9,836 reviewed options sat in the library that
     only the desk screen opened. Loaded once for the session and kept in
     memory, so it survives the wifi dropping. */
  const library = useAnswerLibrary();
  const entity = useEntity();
  const entityCode = useEntityCode();
  const auditor = useStore((s) => s.auditor);
  const setCompliance = useStore((s) => s.setCompliance);
  const patch = useStore((s) => s.patch);
  const setWalkabout = useStore((s) => s.setWalkabout);
  const commit = useStore((s) => s.commit);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const updateAttachment = useStore((s) => s.updateAttachment);
  const appendObservation = useStore((s) => s.appendObservation);
  const aiOn = useAssistAvailable();
  const addCapture = useStore((s) => s.addCapture);
  const assignCapture = useStore((s) => s.assignCapture);
  const discardCapture = useStore((s) => s.discardCapture);
  const addHazard = useStore((s) => s.addHazard);

  const [q, setQ] = useState("");
  /* THE AXIS. Discipline is the default and location is the flip.
     It used to be the other way round, on the reasoning that field work is
     location-first. That reasoning is sound and the data does not support it:
     `programme.json` carries no zones, so the location axis falls back to the
     register's `area` column — 133 values of which a third are not places at
     all ("Appointments", "Documentation", "Lessons learnt"). Defaulting to an
     axis that is mostly not what its name says is worse than defaulting to one
     that is. Flip the default back the day real zones land; that is a
     one-line change and this comment is the note to do it. */
  const [groupBy, setGroupBy] = useState<"area" | "discipline">("discipline");
  /* THE TOP LEVEL IS A FILTER NOW, NOT A ROW YOU OPEN.
     It was the first level of the tree: six discipline rows, and every one of
     them had to be opened before an asset system was even visible. Sarel, on
     the phone: "it will be better if the top layer of the hierarchy is a filter
     and not an expansion". He is right, and the reason is that the top level is
     not something an auditor browses — they know which discipline they are
     walking, they know it before they unlock the screen, and making them press
     it every session buys nothing.

     So the discipline (or, on the flip, the location) picks the subject and the
     tree underneath is asset system → checks, one level to open instead of two.
     "" is every one of them, which is the honest default: nothing is hidden
     until the auditor chooses to hide it.

     A select rather than a chip strip, deliberately. The chip strip is what
     this screen had before the tree and it is why it was removed: 133 register
     categories in a horizontally scrolling row is not a filter anybody can use,
     and it cost about 50px of a 664px screen permanently. A select is one
     40px control at any list length, and on a phone it opens as the platform's
     own picker. */
  const [filter, setFilter] = useState("");
  /* WHERE THE AUDITOR IS STANDING, carried across checks.
     Typed once per place, offered on every inspection opened after it, written
     to the record on commit. See the Location field in the sheet — the whole
     point is that a walk through one switch room costs one location, not
     eleven. Session state: it is where you are NOW, and the records keep their
     own copies. */
  const [here, setHere] = useState(() => lastLocationIn(useStore.getState().visitData().responses));
  /* Which groups are open. "top" and "top|system" — one flat set for both
     levels, because a key can only mean one of them. Session state, per the
     brief: remembered while the screen is open, not persisted. */
  const [expanded, setExpanded] = useState<string[]>([]);
  /* THE ACCORDION. One item open at a time.
     The whole point of the change: every item used to render its full answer
     set, its status buttons and its capture controls at once, which on a phone
     made finding the right inspection harder than doing it. Multi-expand was
     considered and rejected — two open items on a 664px screen show less of
     each than one does, and the comparison it would buy is not a thing anybody
     does on a walk. Collapsing HIDES; nothing is discarded, because every
     control writes straight to the store on change. */
  const [openItem, setOpenItem] = useState<string | null>(null);

  /* WHERE A STICKY GROUP HEADER HAS TO STOP.
     The filter bar is sticky at top 0. A group header also sticky at top 0
     slides underneath it and is invisible for exactly as long as it is
     supposed to be useful — which is worse than not sticking at all, and it
     would have looked like the feature was working from any screenshot taken
     while a group header happened to be below the fold.
     So the bar is measured. Its height changes with the width (the caveat is
     one line on a phone and three on a tablet) and with the axis, so it is
     observed rather than read once. */
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
  const [tray, setTray] = useState(false);
  /* Things seen on the walk that the register does not cover. Kept in its own
     list rather than mixed into `visible`: an ad-hoc item has no check-point
     behind it, so nothing that reads the register's shape can render one, and
     the completion figure must never see it at all. */
  const adhocItems = useAdhoc();
  const findings = useVisitFindings();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /* A hazard seen on the walk. It is not a finding first and it never becomes
     one: nobody wrote up a check-point about it, and consolidating findings
     afterwards cannot invent it. See the modal below. */
  const [hazardOpen, setHazardOpen] = useState(false);
  const [hazEvent, setHazEvent] = useState("");
  const [hazWhy, setHazWhy] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  /* This site's disciplines and areas — a regional airport has no passenger
     boarding bridges and Corporate Office has no airfield at all. */
  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const areas = useMemo(() => areasAt(entityCode), [entityCode]);
  const [adhocDisc, setAdhocDisc] = useState(disciplines[0]);
  const [adhocArea, setAdhocArea] = useState(areas[0]);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  /* SAVING A CHECK WRITES WHERE IT WAS DONE.
     The location box shows the running location before it is on the record —
     the auditor did not type it on THIS check, so writing it the moment the
     sheet opened would put a place on a record they only looked at. It lands on
     commit instead, which is the moment the auditor says this inspection
     happened. Every path that commits the field half goes through here, so
     there is no route that saves a check and loses where it was. */
  const saveField = (id: string) => {
    const existing = responses[id]?.location?.trim();
    if (!existing && here.trim()) patch(id, { location: here.trim() });
    commit(id, "field");
  };

  /* WHAT THE LOCATION BOXES SUGGEST — the inspection's and every photograph's,
     from one list. Places this walk has already named come FIRST, because on a
     walk the next location is nearly always one of the last few; the site's
     register categories follow, with the caveat the Add-item sheet already
     carries about half of them not being places at all. */
  const knownLocations = useMemo(() => {
    const seen: string[] = [];
    const push = (v: string | undefined | null) => {
      const t = v?.trim();
      if (t && !seen.includes(t)) seen.push(t);
    };
    for (const r of Object.values(responses)) {
      push(r?.location);
      for (const a of r?.attachments ?? []) push(a.location);
    }
    for (const it of adhocItems) {
      push(it.area);
      for (const a of it.attachments) push(a.location);
    }
    for (const a of areas) push(a);
    return seen;
  }, [responses, adhocItems, areas]);

  /* THE TOP-LEVEL VALUE A CHECK BELONGS TO, on whichever axis is live. One
     function so the filter, the option list and the ad-hoc rule cannot drift
     apart — three places deciding "which discipline is this" separately is how
     a filter comes to hide a row it was never asked to hide. */
  const topOf = useMemo(
    () => (c: Check) =>
      groupBy === "area" ? c.area?.trim() || NO_AREA : c.discipline?.trim() || NO_DISCIPLINE,
    [groupBy]
  );

  /* Every value the filter can take, off the WHOLE register for this site
     rather than off what is currently showing — a filter whose options change
     as you use it cannot be undone. */
  const tops = useMemo(() => {
    const set = new Set<string>();
    for (const c of checksAt(entityCode).filter(needsField)) set.add(topOf(c));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [entityCode, topOf]);

  /* A FILTER THAT DOES NOT EXIST ON THIS AXIS FILTERS NOTHING.
     Flipping the axis clears it, but a filter can also stop existing under it —
     a site switched underneath the screen, a register re-cut. Derived rather
     than corrected in an effect: a value the list cannot honour is read as "all
     of them", which shows everything, where clearing it a render later would
     flash an empty screen first. */
  const activeFilter = filter && tops.includes(filter) ? filter : "";

  /* Everything checkable on site here, after the filter and the search.

     THE SEARCH BEATS THE FILTER, and that is deliberate. An auditor standing in
     front of a thing types what it is; if the discipline filter then hid it
     because they had set the filter twenty minutes ago in another building,
     the answer would be "no results" for a check that exists. So a search runs
     across the whole register and the strip under the bar says so. */
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    /* Routed on the register's declared vtype, not on whether someone wrote
       walkabout text. Both give 299 today; only one of them keeps giving 299
       if a walkabout line is ever left blank. See src/lib/verification.ts. */
    const list = checksAt(entityCode).filter(needsField);
    if (s) {
      return list.filter((c) =>
        `${portalIdFor(entityCode, c.id)} ${c.requirement} ${c.area} ${c.discipline} ${c.walkabout ?? ""}`
          .toLowerCase()
          .includes(s)
      );
    }
    if (activeFilter) return list.filter((c) => topOf(c) === activeFilter);
    return list;
  }, [entityCode, q, activeFilter, topOf]);

  /* The walk items the current filter and search should show. Same two rules as
     the register list, plus one of its own: an item with no discipline and no
     location is NEVER hidden by a filter on either — a filter that hides an
     unattributed observation makes the one record nobody can re-derive the
     easiest one to lose. */
  const walkVisible = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    if (q2) {
      return adhocItems.filter((it) =>
        `${it.id} ${it.description} ${it.note} ${it.area} ${it.discipline ?? ""} ${it.system ?? ""}`
          .toLowerCase()
          .includes(q2)
      );
    }
    if (!activeFilter) return adhocItems;
    return adhocItems.filter((it) => {
      const own = (groupBy === "area" ? it.area : it.discipline)?.trim();
      return !own || own === activeFilter;
    });
  }, [adhocItems, q, activeFilter, groupBy]);

  /* THE TREE, NOW ONE LEVEL DEEP: asset system → the work under it.

     The discipline (or the place) came out of the tree and became the filter
     above it — see the note on `filter`. What is left is the level that earns
     an expansion: the asset system is the unit ACSA rates, reports and compares
     year on year, so it is the level an auditor should be reading their own
     work at.

     AD-HOC ITEMS SIT IN IT, and that is the second change. They had their own
     block above the register, on the reasoning that an item with no check-point
     behind it must not look like one of the 324. The reasoning was sound and
     the placement was wrong: what the auditor wants when they are standing at a
     pump station is everything about that pump station, and a walk item filed
     somewhere else entirely is a finding they will not see again until the
     export. So it is filed under its asset system with the rest of the work and
     carries a mark saying it was added by hand.

     The COUNTS still ignore them completely. `done` and `total` are of
     check-points; a walk item is reported beside the fraction, never inside it,
     because a denominator that grows as you work is not a denominator. */
  const tree = useMemo(() => {
    const systems = new Map<string, { checks: Check[]; walk: AdHocItem[] }>();
    const bucket = (key: string) => {
      let b = systems.get(key);
      if (!b) systems.set(key, (b = { checks: [], walk: [] }));
      return b;
    };
    for (const c of visible) bucket(c.system?.trim() || NO_SYSTEM).checks.push(c);
    /* An explicit bucket, never a hidden row. A walk item recorded without an
       asset system is a real state — most are, because the auditor recording
       one is looking at something the register does not cover. */
    for (const it of walkVisible) bucket(it.system?.trim() || NO_SYSTEM).walk.push(it);
    const doneOf = (cs: Check[]) => cs.filter((c) => fieldDone(responses[c.id])).length;
    return [...systems.entries()]
      .map(([sys, b]) => ({
        sys,
        checks: b.checks,
        walk: b.walk,
        done: doneOf(b.checks),
        total: b.checks.length,
      }))
      /* The unattributed bucket last, wherever its name would sort. It is a
         residue, not an asset system, and it must not head the list. */
      .sort((a, b) =>
        a.sys === NO_SYSTEM ? 1 : b.sys === NO_SYSTEM ? -1 : a.sys.localeCompare(b.sys)
      );
  }, [visible, walkVisible, responses]);

  /* How many findings each check has raised, so the collapsed row can say so
     without opening. Counted once for the list rather than filtered per row. */
  const findingsHere = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of findings) {
      if (!f.checkId) continue;
      m.set(f.checkId, (m.get(f.checkId) ?? 0) + 1);
    }
    return m;
  }, [findings]);

  const toggle = (key: string) =>
    setExpanded((e) => (e.includes(key) ? e.filter((x) => x !== key) : [...e, key]));

  /* A SEARCH OPENS EVERYTHING, and this is not a nicety.
     The groups are shut by default. Type "hydrant" into a screen whose groups
     are shut and the tree returns the two groups the matches live in, both
     closed, showing nothing — a search that finds five check-points and
     displays none of them, which reads as "no results" and is the worst
     possible answer because it is wrong. So while a search is running, every
     group is open regardless of what the auditor had folded away; clearing the
     search puts their own expansion state back untouched. */
  const searching = q.trim().length > 0;
  const isOpen = (key: string) => searching || expanded.includes(key);

  /* Zones come from the programme file. Until ACSA gives us real ones the axis
     falls back to the register's categories, and the strip below says so. */
  const axis = locationAxis(entityCode);
  const doneCount = visible.filter((c) => fieldDone(responses[c.id])).length;


  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-4 pb-24 sm:px-6">
        <div className="mb-2 sm:mb-3">
          {/* NAMED AS THE TAB NAMES IT. The navigation says "Inspection" and
              this heading said "Site walkabout" — an auditor told to go to
              Inspection landed on a screen called something else, which is the
              same defect the home screen's own test caught on the HIRA rename.
              The walkabout wording is kept as the subtitle, because it is what
              the audit method calls this session and it says what the screen
              is for in a way "Inspection" does not. */}
          <h2 className="text-[16px] font-bold sm:text-[18px]">
            Inspection{" "}
            {/* The subtitle wrapped the heading onto a second line at 375px,
                which is 22px of a 664px screen spent restating the tab name.
                Desk only, where it costs nothing. */}
            <span className="hidden sm:inline" style={{ color: "var(--ink-3)" }}>
              · the site walkabout
            </span>
          </h2>
          {/* Prose that orients somebody the first time and costs them a
              scroll every time after. On a 664px phone the preamble, the
              toggle, the search box and the category note filled the whole
              first screen and the first check-point sat below the fold — on
              the screen whose entire job is the check-points. Kept from sm
              upward, where the room exists. */}
          <p className="mt-1 hidden max-w-[78ch] text-[12.5px] sm:block" style={{ color: "var(--ink-2)" }}>
            Nothing here assumes an order. Group by discipline or by where you are standing,
            search anything, or capture first and assign it later.
          </p>
        </div>

        {/* THE STICKY HEADER — the axis switch, the search and the filter, in
            that order, and all three reachable without scrolling.

            The axis switch used to sit ABOVE this bar, in the page heading's
            row, so it scrolled away with the title: on a phone the control
            that decides the entire shape of the list was gone by the second
            screenful. It is in the bar now, first, because it is the one that
            changes what everything below it means. */}
        <div
          ref={barRef}
          className="sticky top-0 z-10 -mx-4 mb-2 border-b px-4 py-[7px] sm:-mx-6 sm:px-6 sm:py-2.5"
          style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        >
          <div className="mb-1.5 flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Group the list by"
            /* Capped on a desk, where a 1,130px two-way switch is a lot of
               furniture for a binary choice. On a phone it shares its row with
               the progress figure rather than owning one: measured at 375px
               this sticky bar was 156px of a 664px screen, and between it, the
               masthead and the two bottom bars the furniture came to 437px —
               two thirds of the viewport, on the screen whose entire job is
               the list underneath. */
            className="flex min-w-0 flex-1 gap-[2px] rounded-[11px] p-[3px] sm:max-w-[420px] sm:flex-none"
            style={{ background: "var(--sunken)" }}
          >
            {(["discipline", "area"] as const).map((g) => (
              <button
                key={g}
                role="radio"
                aria-checked={groupBy === g}
                onClick={() => {
                  setGroupBy(g);
                  /* A new axis has different groups, so nothing that was open
                     under the old one still means anything — and the filter is
                     a discipline on one axis and a place on the other, so it
                     means nothing either. */
                  setExpanded([]);
                  setFilter("");
                }}
                className="flex min-h-[38px] flex-1 items-center justify-center gap-[6px] rounded-[8px] px-3 font-display text-[11.5px] font-semibold transition-[var(--t)] sm:min-h-[40px]"
                style={{
                  background: groupBy === g ? "var(--panel)" : "transparent",
                  color: groupBy === g ? "var(--acc)" : "var(--ink-2)",
                  boxShadow: groupBy === g ? "var(--e1)" : "none",
                }}
              >
                {g === "area" && <IconPin width={13} height={13} />}
                By {g === "area" ? "location" : "discipline"}
              </button>
            ))}
            </div>
            {/* Progress beside the switch, not under it. Two numbers on one
                24px line instead of two lines. */}
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
              <span>
                {doneCount}/{visible.length}
              </span>
              {adhocItems.length > 0 && (
                <span style={{ color: "var(--acc)" }}>+{adhocItems.length}</span>
              )}
            </span>
          </div>

          <div className="mb-1.5 flex items-stretch gap-2">
          {/* THE TOP LEVEL, AS A FILTER. It was six rows of the tree that every
              auditor opened and closed on every visit to this screen. It is one
              control now, and the tree under it starts at the asset system.

              It shares its row with the search rather than taking one of its
              own: measured at 375px this bar was already 122px of a 664px
              screen after the last trim, and a third row would put back most of
              what that trim bought. */}
          <select
            value={activeFilter}
            onChange={(e) => {
              setFilter(e.target.value);
              /* Different subject, different systems — nothing that was open
                 under the last one still means anything. */
              setExpanded([]);
            }}
            aria-label={groupBy === "area" ? "Filter by location" : "Filter by discipline"}
            title={activeFilter || (groupBy === "area" ? "Every location" : "Every discipline")}
            className="w-[124px] shrink-0 rounded-[11px] border px-2 text-[11.5px] outline-none sm:w-[210px]"
            style={{
              minHeight: 42,
              background: activeFilter ? "var(--acc-soft)" : "var(--panel)",
              borderColor: activeFilter ? "var(--acc-line)" : "var(--line-2)",
              color: activeFilter ? "var(--acc)" : "var(--ink-2)",
            }}
          >
            <option value="">{groupBy === "area" ? "All locations" : "All disciplines"}</option>
            {tops.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div
            className="flex min-w-0 flex-1 items-center gap-2 rounded-[11px] border px-3 py-1 sm:py-2"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          >
            <IconSearch width={14} height={14} className="shrink-0" style={{ color: "var(--ink-3)" }} />
            {/* The search box on the walkabout screen is how an auditor finds
                the check for the thing in front of them, and it measured 24px
                — the only control on any screen still under the target. The
                wrapper carries the border, so the height goes on the input. */}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search anywhere…"
              aria-label="Search any check"
              className="min-h-[40px] w-full min-w-0 border-none bg-transparent text-[13px] outline-none"
            />
          </div>
          </div>
          {/* SAID OUT LOUD, because otherwise it looks like the filter broke.
              A search runs across the whole register — it has to, or the check
              for the thing in front of the auditor is missing because of a
              filter they set in another building — and the row count jumping
              past the filter needs one line of explanation. */}
          {searching && activeFilter && (
            <div className="mb-1.5 text-[10.5px]" style={{ color: "var(--ink-3)" }}>
              Searching every {groupBy === "area" ? "location" : "discipline"}, not just{" "}
              <b>{activeFilter}</b>.
            </div>
          )}
          {/* THE FILTER CHIP ROW IS GONE, AND THAT IS THE POINT.
              It was a row of discipline names that filtered a flat list. The
              list is now a tree grouped BY discipline, so the chips were a
              second control doing the tree's job — press "Electrical" or open
              the Electrical group, same result, two ways to learn it and two
              things to keep in sync. On the location axis it was worse: 133
              register categories in a horizontally scrolling strip is not a
              filter anybody can use.

              It also cost about 50px of a 664px screen, permanently, at the
              top. Between the axis switch, the search, the chips and the
              progress line the sticky furniture came to a third of the
              viewport — the letterbox the brief caps at a quarter. Search
              still finds anything anywhere, and the tree is the filter. */}
          {/* THE CAVEAT, AND IT RENDERS ON A PHONE.
              It carried `hidden sm:block` — so on the 375px screen this whole
              screen exists for, the one sentence saying the location axis is
              not really locations did not render at all. The auditor most
              likely to read "Appointments" as a place was the only one never
              told it is not one. Shortened rather than hidden: the full
              sentence is still there from sm, where there is room for it. */}
          {axis.kind === "area" && groupBy === "area" && (
            <div className="mt-[7px] text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
              <span className="sm:hidden">
                These are the register&rsquo;s categories, not physical zones.
              </span>
              <span className="hidden sm:inline">
                These are the register&rsquo;s categories, not physical zones — {entity.short} zone
                names have not been supplied yet. Search finds any check wherever you are standing.
              </span>
            </div>
          )}
          {/* TWO NUMBERS, NEVER ONE. The bar is progress through ACSA's list and
              nothing else; what we found that was not on it is stated beside it
              rather than added to it. Adding them would make the denominator a
              number that grows as you work, which is not a denominator.
              The figures moved up beside the axis switch; this is the track,
              which is two pixels and carries the same fact at a glance. */}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="track flex-1">
              <i style={{ width: `${visible.length ? (doneCount / visible.length) * 100 : 0}%`, background: "var(--acc)" }} />
            </span>
            {adhocItems.length > 0 && (
              <span className="shrink-0 font-mono text-[9.5px]" style={{ color: "var(--acc)" }}>
                +{adhocItems.length} seen on the walk
              </span>
            )}
          </div>
        </div>

        {visible.length === 0 && walkVisible.length === 0 ? (
          <Empty>
            <IconInbox width={26} height={26} />
            <div>
              Nothing matches. Clear the search or the filter — or use <b>Add item</b> for
              something on site the register does not cover.
            </div>
          </Empty>
        ) : (
          /* THE LIST. Asset system → the work under it, and the work is both
             kinds: the register's check-points and the things we found that it
             does not cover, in one place, in the order somebody standing at the
             asset would want them.

             A collapsed row carries only what identifies the work: the outcome,
             the id, the wording clamped to two lines, and small marks for what
             is attached. Everything else is one tap away and unchanged when it
             gets there. */
          <div
            /* NO `overflow-hidden` HERE, however much the rounded corners want
               it. `overflow: hidden` makes an element its own scroll
               container, so a `position: sticky` group header inside it sticks
               within THIS box rather than within the page scroller — and since
               this box is taller than the viewport and cannot itself scroll,
               the header never sticks at all. It scrolled away silently, which
               looked exactly like a header that had not reached its stopping
               point yet. The square corner where the first group row meets the
               border is the price, and it is worth paying. */
            className="rounded-[13px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            {tree.map((g) => {
              const gOpen = isOpen(g.sys);
              /* The 2025 rating for this asset system at THIS site. Looked up
                 by the discipline the checks actually carry rather than by the
                 filter, because on the location axis the filter is a place and
                 a place has no discipline. */
              const pf = priorFor(entityCode, g.checks[0]?.discipline ?? "", g.sys);
              return (
                <div key={g.sys} data-group={g.sys} data-system={g.sys}>
                  <GroupRow
                    label={g.sys}
                    done={g.done}
                    total={g.total}
                    open={gOpen}
                    onToggle={() => toggle(g.sys)}
                    sticky
                    stickyTop={barH}
                    title={`${g.sys} — ${g.done} of ${g.total} seen${
                      g.walk.length ? `, plus ${g.walk.length} added by hand` : ""
                    }`}
                  >
                    {pf && <Pill tone="warn">{pf.key}</Pill>}
                    {/* BESIDE THE FRACTION, NEVER INSIDE IT. Walk items are
                        counted separately and said separately, because adding
                        them would make the denominator a number that grows as
                        you work. */}
                    {g.walk.length > 0 && (
                      <Pill tone="accent">+{g.walk.length}</Pill>
                    )}
                  </GroupRow>
                  {gOpen && (
                    <>
                      {g.checks.map((c) => {
                        const r = responses[c.id];
                        const attachments = r?.attachments ?? [];
                        const photos = attachments.filter((a) => a.kind === "photo");
                        const voices = attachments.filter((a) => a.kind === "voice");
                        const wo = library?.[c.id]?.WO ?? [];
                        const picked = r?.walkaboutPicked;
                        const needsPhoto =
                          picked != null && wo[picked]?.photo === true && photos.length === 0;
                        /* The row no longer expands in place — tapping it opens
                           the check in a sheet. It still marks itself as the one
                           that is open, because the sheet is dismissible and
                           coming back to a list with nothing highlighted loses
                           your place. */
                        const itemOpen = openItem === c.id;
                        const outcome = OUTCOMES.find((o) => o.key === r?.compliance);
                        const raised = findingsHere.get(c.id) ?? 0;
                        return (
                          <div
                            key={c.id}
                            data-check={c.id}
                            className="border-b"
                            style={{ borderColor: "var(--line)" }}
                          >
                            {/* THE COLLAPSED ROW. Full width, one tap. */}
                            <button
                              onClick={() => setOpenItem(c.id)}
                              aria-haspopup="dialog"
                              aria-expanded={itemOpen}
                              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
                              style={{
                                background: itemOpen ? "var(--acc-soft)" : "transparent",
                                minHeight: 56,
                                /* Recedes once the asset has been SEEN — the field half,
                                   never the derived `captured` flag. A row must not fade
                                   because somebody read a document at a desk: 290 of the
                                   324 need both halves, and greying on the wrong one tells
                                   an auditor on the apron that work they still have to do
                                   is finished. */
                                opacity: fieldDone(r) && !itemOpen ? 0.62 : 1,
                              }}
                            >
                              {/* The outcome mark. BLANK WHEN NOT CAPTURED, and
                                  blank means exactly that — never compliant.
                                  Carried by the icon and the word underneath, so
                                  it survives sunlight and a colour-blind
                                  reader. */}
                              <span
                                className="mt-[1px] flex w-[34px] shrink-0 flex-col items-center gap-[2px]"
                                style={{ color: outcome ? "var(--acc)" : "var(--ink-4)" }}
                              >
                                {outcome ? (
                                  <outcome.Icon width={15} height={15} />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="block h-[13px] w-[13px] rounded-full border-[1.5px] border-dashed"
                                    style={{ borderColor: "var(--line-2)" }}
                                  />
                                )}
                                <span className="font-mono text-[8px] leading-none">
                                  {outcome ? outcome.label : "—"}
                                </span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="mb-[3px] flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                                    {portalIdFor(entityCode, c.id)}
                                  </span>
                                  {/* THE OTHER HALF, said on the row. 290 of the
                                      324 need a document review as well as the
                                      asset seen. An auditor who ticks the walk
                                      and moves on, with nothing saying the check
                                      also wants evidence off a desk, leaves it
                                      half answered — and the completion figure
                                      will say so weeks later with no
                                      explanation. "Physical" is dropped because
                                      every row here is physical. */}
                                  {modeLabels(c)
                                    .filter((m) => m !== "Physical")
                                    .map((m) => (
                                      <Pill key={m} tone="accent">
                                        {m.toUpperCase()}
                                      </Pill>
                                    ))}
                                </span>
                                {/* CLAMPED, NOT SHORTENED. The register's own
                                    words, whole, in the DOM — two lines of them
                                    until the row is opened. Storing or rendering
                                    a tidied version of ACSA's check text is the
                                    defect pass 1 fixed and this must not
                                    reintroduce it. */}
                                <span
                                  className="block text-[12.5px] leading-[1.4] font-semibold"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                >
                                  {c.requirement?.trim() ? (
                                    c.requirement
                                  ) : (
                                    <span style={{ color: "var(--warn)" }}>
                                      {portalIdFor(entityCode, c.id)} — the register carries no
                                      check text for this check-point
                                    </span>
                                  )}
                                </span>
                                <span
                                  className="mt-[3px] flex flex-wrap items-center gap-2 font-mono text-[9px]"
                                  style={{ color: "var(--ink-4)" }}
                                >
                                  {r?.location?.trim() && <span>{r.location}</span>}
                                  {photos.length > 0 && <span>{photos.length}📷</span>}
                                  {voices.length > 0 && <span>{voices.length}🎙</span>}
                                  {r?.observation?.trim() && <span>note</span>}
                                  {raised > 0 && (
                                    <span style={{ color: "var(--warn)" }}>
                                      {raised} finding{raised === 1 ? "" : "s"}
                                    </span>
                                  )}
                                  {needsPhoto && (
                                    <span style={{ color: "var(--warn)" }}>photo expected</span>
                                  )}
                                </span>
                              </span>
                            </button>
                          </div>
                        );
                      })}

                      {/* ADDED BY HAND, FILED WITH THE REST OF THE WORK.
                          Same row shape as a check-point, in the same asset
                          system, because that is where somebody standing at the
                          asset will look for it — and marked, at the front of
                          the row, because it is NOT one of the 324: it has no
                          ACSA requirement behind it, no threshold to quote, and
                          no place in the completion figure. The mark is an icon
                          AND the words "added on the walk", never colour alone.
                          The border stays dashed for the same reason. */}
                      {g.walk.map((it) => {
                        const photos = it.attachments.filter((a) => a.kind === "photo").length;
                        const voices = it.attachments.filter((a) => a.kind === "voice").length;
                        const outcome = OUTCOMES.find((o) => o.key === it.outcome);
                        return (
                          <div
                            key={it.id}
                            data-walk={it.id}
                            className="border-b"
                            style={{ borderColor: "var(--line)" }}
                          >
                            <button
                              onClick={() => {
                                setEditingId(it.id);
                                setSheetOpen(true);
                              }}
                              aria-haspopup="dialog"
                              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
                              style={{ minHeight: 56 }}
                            >
                              <span
                                className="mt-[1px] flex w-[34px] shrink-0 flex-col items-center gap-[2px]"
                                style={{ color: outcome ? "var(--acc)" : "var(--ink-4)" }}
                              >
                                {outcome ? (
                                  <outcome.Icon width={15} height={15} />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="block h-[13px] w-[13px] rounded-full border-[1.5px] border-dashed"
                                    style={{ borderColor: "var(--line-2)" }}
                                  />
                                )}
                                <span className="font-mono text-[8px] leading-none">
                                  {outcome ? outcome.label : "—"}
                                </span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="mb-[3px] flex flex-wrap items-center gap-1.5">
                                  {/* THE MARK. An icon and a word, together —
                                      one row in a list of check-points that is
                                      not a check-point has to say so in a way
                                      that survives a greyscale printout. */}
                                  <span
                                    className="flex items-center gap-[3px] rounded-[5px] border border-dashed px-[5px] py-[1px] font-mono text-[8.5px]"
                                    style={{ borderColor: "var(--acc)", color: "var(--acc)" }}
                                    title="Added on the walk — not one of ACSA's check-points, and not counted in the completion figure"
                                  >
                                    <IconPlus width={9} height={9} />
                                    ADDED ON THE WALK
                                  </span>
                                  <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                                    {it.id}
                                  </span>
                                  {it.findingId && <Pill tone="warn">{it.findingId}</Pill>}
                                </span>
                                <span
                                  className="block text-[12.5px] leading-[1.4] font-semibold"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                >
                                  {it.description}
                                </span>
                                <span
                                  className="mt-[3px] flex flex-wrap items-center gap-2 font-mono text-[9px]"
                                  style={{ color: "var(--ink-4)" }}
                                >
                                  {it.area && <span>{it.area}</span>}
                                  {photos > 0 && <span>{photos}📷</span>}
                                  {voices > 0 && <span>{voices}🎙</span>}
                                  {photos === 0 && voices === 0 && (
                                    <span style={{ color: "var(--warn)" }}>no evidence attached</span>
                                  )}
                                </span>
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* THE ADD CONTROL, AND WHY IT IS IN THE BAR RATHER THAN FLOATING OVER IT.
          The brief asked for a floating action button bottom-right. On a phone
          this screen already carries two fixed layers at the bottom: the app's
          own navigation (56px plus the home indicator, fixed below sm) and this
          action bar. A circle floating above both would be a third, and the
          same brief caps sticky furniture at about a quarter of a 664px
          viewport — which those two already come close to spending.

          So the bar itself is the thumb zone, and Add item is its primary:
          56px, bottom-right on a phone (order-last below sm), labelled in
          words, never scrolled away, and clearing the home indicator through
          --sticky-safe like everything else here. It satisfies every property
          the brief asked the button for. Raise it if you disagree — the thing
          it must not become is a third stacked layer. */}
      <div
        className="sticky bottom-0 z-20 flex items-center gap-2 border-t px-4 py-2.5 sm:px-6"
        style={{
          background: "var(--panel)",
          borderColor: "var(--line)",
          boxShadow: "0 -4px 16px -8px rgba(22,16,40,.14)",
          paddingBottom: "calc(10px + var(--sticky-safe))",
        }}
      >
        {/* IT RAN OFF THE RIGHT EDGE ON A REAL PHONE. Four controls plus the
            unassigned badge came to more than 375px, so "Add item" — the
            primary, and the one control the brief says must always be hittable
            — was clipped. The two secondaries are icon-only below sm now, with
            their names on aria-label, and the primary takes the room that
            frees. `min-w-0` so a flex child can actually shrink. */}
        <Btn
          variant="primary"
          className="order-last min-h-[56px] min-w-0 flex-1 justify-center sm:order-none sm:flex-none"
          onClick={() => {
            setEditingId(null);
            setSheetOpen(true);
          }}
        >
          <IconPlus width={16} height={16} />
          Add item
        </Btn>
        {/* Still the fastest path to a photograph: no record, no fields, assign
            it later from the tray. Different from Add item, which creates the
            record the photograph belongs to. */}
        <PhotoButton
          compact
          className="min-h-[44px] w-[44px] shrink-0 justify-center sm:w-auto sm:px-[13px]"
          onCaptured={(m) => {
            addCapture({
              ...m,
              area: "Unspecified",
              createdBy: auditor,
            });
            say("Captured — assign it whenever you like");
          }}
        />
        {/* The walk is where hazards are actually spotted. Until this existed
            the only route to the register was consolidating findings, which
            cannot produce a hazard nobody wrote a finding about. */}
        <Btn
          className="min-h-[44px] shrink-0 justify-center px-0 sm:px-[15px]"
          style={{ width: 44 }}
          aria-label="Raise a hazard seen on the walk"
          onClick={() => setHazardOpen(true)}
        >
          <IconFlag width={16} height={16} />
          <span className="hidden sm:inline">Hazard</span>
        </Btn>
        {captures.length > 0 && (
          <Btn
            className="min-h-[44px] shrink-0 px-[11px] sm:px-[15px]"
            aria-label={`${captures.length} unassigned captures`}
            onClick={() => setTray(true)}
            style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
          >
            {captures.length}
            <span className="hidden sm:inline"> unassigned</span>
          </Btn>
        )}
        <span className="ml-auto hidden font-mono text-[10px] sm:block" style={{ color: "var(--ink-3)" }}>
          offline-capable · syncs when connected
        </span>
      </div>

      {/* unassigned tray */}
      {tray && (
        <div className="fixed inset-0 z-[80] flex justify-center pt-[10vh]" style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }} onClick={() => setTray(false)}>
          <div
            className="max-h-[70vh] w-[min(560px,92vw)] overflow-y-auto rounded-[20px] border p-[22px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-bold">Unassigned captures</h3>
            <p className="mt-1 mb-3.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
              Taken in the field before deciding where they belong. Assign each to a check-point, or
              discard it.
            </p>
            {captures.map((cap) => (
              <div key={cap.id} className="mb-2 flex items-center gap-2.5 rounded-[11px] border p-2.5" style={{ background: "var(--sunken)", borderColor: "var(--line)" }}>
                <PhotoThumb a={cap} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                    {cap.name} · {cap.area}
                  </div>
                  <div className="text-[12px]">Awaiting assignment</div>
                </div>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    assignCapture(cap.id, e.target.value);
                    say("Photo assigned");
                  }}
                  className="max-w-[150px] rounded-[8px] border px-2 py-1.5 text-[11px]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                >
                  <option value="">Assign to…</option>
                  {visible.slice(0, 60).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}
                    </option>
                  ))}
                </select>
                <button onClick={() => discardCapture(cap.id)} aria-label="Discard" style={{ color: "var(--ink-3)" }}>
                  <IconX width={14} height={14} />
                </button>
              </div>
            ))}
            {captures.length === 0 && <Empty>Tray is empty.</Empty>}
            <div className="mt-3 flex justify-end">
              <Btn onClick={() => setTray(false)}>Close</Btn>
            </div>
          </div>
        </div>
      )}

      {/* a hazard seen on the walk */}
      {hazardOpen && (
        <div
          className="fixed inset-0 z-[80] flex justify-center pt-[10vh]"
          style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setHazardOpen(false)}
        >
          <div
            className="w-[min(560px,92vw)] rounded-[20px] border p-[22px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-bold">New hazard</h3>
            <p className="mt-1 mb-3.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
              The <b>event</b>, not the paperwork. &ldquo;Uncontained fuel release on the apron&rdquo;,
              not &ldquo;register not signed&rdquo; — the event is what carries the rating, because a
              finding closes and a hazard does not. It arrives on the register unrated; the group
              agrees the cell there.
            </p>
            <label className="block">
              <span className="label-xs">The event · under 15 words</span>
              <input
                value={hazEvent}
                onChange={(e) => setHazEvent(e.target.value)}
                placeholder="Uncontained fuel release on the apron…"
                className="mt-1 w-full rounded-[11px] border px-3 py-2.5 text-[13px] font-semibold outline-none"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />
            </label>
            <label className="mt-3 block">
              <span className="label-xs">What control failed, and what it was protecting against</span>
              <textarea
                value={hazWhy}
                onChange={(e) => setHazWhy(e.target.value)}
                placeholder="What you saw, and what it would take to go wrong…"
                className="mt-1 min-h-[70px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label-xs">Discipline</span>
                <select
                  value={adhocDisc}
                  onChange={(e) => setAdhocDisc(e.target.value)}
                  className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[12px]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                >
                  {disciplines.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label-xs">Location</span>
                <select
                  value={adhocArea}
                  onChange={(e) => setAdhocArea(e.target.value)}
                  className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[12px]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                >
                  {areas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setHazardOpen(false)}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                onClick={() => {
                  if (!hazEvent.trim()) {
                    say("Name the event first");
                    return;
                  }
                  const id = addHazard({
                    originVisit: visitId,
                    event: hazEvent.trim(),
                    description: "",
                    why: hazWhy.trim(),
                    findingIds: [],
                    disciplines: [adhocDisc],
                    systems: [adhocArea],
                    /* Unrated, on both instruments, always. The walk names the
                       event; the group rates it. */
                    severity: null,
                    likelihood: null,
                    ratingConfirmed: false,
                    ermConsequence: null,
                    ermLikelihood: null,
                    ermConfirmed: false,
                    ermLikelihoodAssumed: false,
                    /* Seen on the walk, and the register says so. */
                    origin: "field",
                    note: `Seen on the walk at ${adhocArea}.`,
                    occurrence: "",
                    ratingRationale: "",
                    progress: [],
                    immediate: false,
                    reassessedAt: null,
                    reassessNote: "",
                    rootCause: "",
                    action: "",
                    owner: "",
                    dueDate: "",
                    actionStatus: "Open",
                    createdBy: auditor,
                  });
                  setHazEvent("");
                  setHazWhy("");
                  setHazardOpen(false);
                  say(`${id} raised · rate it on the hazard register`);
                }}
              >
                <IconCheck width={14} height={14} />
                Create hazard
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* THE CHECK, IN A SHEET RATHER THAN EXPANDED IN THE LIST.

          It expanded in place first, which is what the brief asked for, and on
          a real phone it did not work. Sarel's words: too much scrolling, hard
          to see what you need, and "the save button is not easily visible to
          find to save it". All three are the same cause — an expanded item
          rendered into the gap between a 156px sticky filter bar and a 132px
          bottom bar on a 664px screen, so the answer buttons, the comment
          field, the photographs and the save control were spread down a column
          about 220px tall, and Save was last.

          The sheet is the layout he pointed at as the clean one: the add-item
          form. Same reasoning applies to a register check, more so — a check
          carries the register's wording, our walkabout instruction, up to
          eleven researched answers, an outcome, a comment and its evidence.
          Given the whole viewport it reads as one job with the commit pinned
          under it; squeezed into a third of the viewport it reads as a pile.

          The list keeps its shape while the sheet is open, so closing it puts
          the auditor back exactly where they were. */}
      {(() => {
        const c = openItem ? visible.find((x) => x.id === openItem) : null;
        if (!c) return null;
        const r = responses[c.id];
        const attachments = r?.attachments ?? [];
        const photos = attachments.filter((x) => x.kind === "photo");
        const wo = library?.[c.id]?.WO ?? [];
        const picked = r?.walkaboutPicked;
        const needsPhoto = picked != null && wo[picked]?.photo === true && photos.length === 0;
        const pf = priorFor(entityCode, c.discipline, c.system);
        /* The next check in the same asset system, so Save & next walks the
           system rather than jumping somewhere unrelated. */
        const sameSystem = visible.filter(
          (x) => x.discipline === c.discipline && x.system === c.system
        );
        const next = sameSystem[sameSystem.findIndex((x) => x.id === c.id) + 1];
        return (
          <Sheet
            open
            wide
            onClose={() => setOpenItem(null)}
            badges={
              <>
                <span>{portalIdFor(entityCode, c.id)}</span>
                <span>·</span>
                <span>{c.system}</span>
                {modeLabels(c)
                  .filter((m) => m !== "Physical")
                  .map((m) => (
                    <Pill key={m} tone="accent">
                      {m.toUpperCase()}
                    </Pill>
                  ))}
                {pf && <Pill tone="warn">{pf.key} · 2025 {pf.rating.toUpperCase()}</Pill>}
              </>
            }
            title={
              c.requirement?.trim() ? (
                c.requirement
              ) : (
                <span style={{ color: "var(--warn)" }}>
                  {portalIdFor(entityCode, c.id)} — the register carries no check text for this
                  check-point
                </span>
              )
            }
            subtitle="ACSA check-point · the register's wording"
            footer={
              <>
                {/* THE CAMERA AND THE MICROPHONE LIVE HERE NOW.
                    They were in the body, under the observation box, in a row
                    of their own. Sarel, on the phone: they make the boxes very
                    busy. They did — the body of a check already carries the
                    register's wording, our walkabout instruction, up to eleven
                    researched answers, an outcome, a location and a comment,
                    and two more controls in the middle of that reads as one
                    more thing to scroll past rather than a tool.

                    In the footer they are the opposite: pinned, never scrolled
                    away, one thumb-reach from the Save they sit beside, and out
                    of the reading order entirely. Icon-only with an aria-label
                    — a camera and a microphone are the two glyphs on earth that
                    need no word, and the room they free goes to the primary.

                    "Full check-point →" WAS HERE AND IS GONE, at Sarel's
                    instruction. It left the walk for the desk screen mid-walk,
                    which is the opposite of what this screen is for; everything
                    it went to fetch — ACSA's requirement, the threshold, the
                    document and clause — is on the desk screen when the desk
                    half is done. */}
                <span className="flex shrink-0 items-center gap-2">
                  <PhotoButton
                    compact
                    className="min-h-[44px] w-[44px] justify-center"
                    onCaptured={(m) => {
                      addAttachment(c.id, {
                        ...m,
                        /* WHERE IT WAS TAKEN, WITHOUT A SINGLE EXTRA TAP.
                           The camera is always where the auditor is, so the
                           photograph inherits the inspection's location — or,
                           before one has been typed on this check, the running
                           one from the last place they named. Editable per
                           photograph, because one inspection can carry evidence
                           from two places. */
                        location: r?.location?.trim() || here,
                        createdBy: auditor,
                      });
                      say(`Photo added to ${portalIdFor(entityCode, c.id)}`);
                    }}
                  />
                  <VoiceNoteButton
                    compact
                    className="min-h-[44px] w-[44px] justify-center"
                    onCaptured={(m) => {
                      addAttachment(c.id, { ...m, createdBy: auditor });
                      say(`Voice note added to ${portalIdFor(entityCode, c.id)}`);
                    }}
                  />
                </span>
                {next ? (
                  <Btn
                    variant="primary"
                    onClick={() => {
                      saveField(c.id);
                      setOpenItem(next.id);
                      say(`Saved · ${portalIdFor(entityCode, next.id)}`);
                    }}
                  >
                    <IconCheck width={14} height={14} />
                    Save &amp; next
                  </Btn>
                ) : (
                  <Btn
                    variant="primary"
                    onClick={() => {
                      saveField(c.id);
                      setOpenItem(null);
                      say(`Saved · ${c.system} done`);
                    }}
                  >
                    <IconCheck width={14} height={14} />
                    Save &amp; close
                  </Btn>
                )}
              </>
            }
          >
            {/* OURS, AND IT SAYS SO. 25 of the 324 have no walkabout written;
                an empty one renders nothing at all. */}
            {c.walkabout?.trim() && (
              <div
                className="mb-3 rounded-[9px] border-l-[2px] pl-[9px]"
                style={{ borderColor: "var(--line-2)" }}
              >
                <div className="label-xs" style={{ color: "var(--ink-4)" }}>
                  TPJV walkabout — physical check
                </div>
                <div className="mt-[2px] text-[12px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
                  {c.walkabout}
                </div>
              </div>
            )}

            {/* THE ANSWER LIBRARY, IN FULL AND UNCHANGED. Researched per check
                and carrying a suggested severity — the most valuable content in
                the product. Never trimmed: eleven options render as eleven. */}
            {wo.length > 0 && (
              <div className="chip-row mb-3 flex flex-wrap gap-[5px]">
                {wo.map((w, i) => (
                  <Chip
                    key={i}
                    selected={r?.walkaboutPicked === i}
                    onClick={() => {
                      setWalkabout(c.id, i, w.sets);
                      /* AND IT COMMITS. Tapping a researched option is the
                         fast path on a walk — the whole point is that it is
                         tapped rather than typed — and it credits the FIELD
                         half, which is the one a tablet in front of the asset
                         can actually answer. The sheet's Save & next is the
                         visible commit for somebody who wants one; it is not a
                         replacement for this. Dropping it here would have made
                         every check cost an extra press, which is the opposite
                         of the complaint that started this change. */
                      saveField(c.id);
                      say(
                        w.photo && photos.length === 0
                          ? `${portalIdFor(entityCode, c.id)} — ${w.label}. Photograph expected.`
                          : `${c.id} — ${w.label}`
                      );
                    }}
                    title={w.photo ? "This observation expects a photograph" : undefined}
                  >
                    {w.label}
                    {w.photo ? " 📷" : ""}
                  </Chip>
                ))}
              </div>
            )}

            {needsPhoto && (
              <div
                className="mb-3 flex items-center gap-2 rounded-[9px] border px-[10px] py-[7px] text-[11px]"
                style={{
                  background: "var(--warn-bg)",
                  borderColor: "var(--warn-line)",
                  color: "var(--warn)",
                }}
              >
                <IconCamera width={13} height={13} />
                Photograph expected for this observation
              </div>
            )}

            <div className="label-xs mb-1.5" style={{ color: "var(--ink-4)" }}>
              Outcome
            </div>
            <OutcomeControl
              value={r?.compliance ?? null}
              onChange={(nextOutcome) => {
                setCompliance(c.id, nextOutcome);
                if (nextOutcome) {
                  saveField(c.id);
                  say(`${c.id} — ${OUTCOMES.find((o) => o.key === nextOutcome)?.label}`);
                }
              }}
              size={52}
              idPrefix={`out-${c.id}`}
            />

            {/* WHERE, AND IT IS TYPED ONCE PER PLACE.
                The register's `area` column cannot answer this — it is a
                CATEGORY, 133 of them at KSIA, and a third are not places at all
                ("Appointments", "Documentation", "Lessons learnt"). A finding
                nobody can walk back to is a finding nobody can close, so the
                inspection carries where the auditor was standing, in their own
                words, with the site's areas offered as suggestions and none of
                them forced.

                THE RUNNING LOCATION is the part that makes it usable on a walk.
                Type "north switch room" on the first check and every check
                opened after it offers the same, so a switch room with eleven
                check-points in it costs one location and not eleven. It is
                offered, not written: what is on the record is what the auditor
                left in the box when they saved. */}
            <label className="mt-4 block">
              <span className="label-xs" style={{ color: "var(--ink-4)" }}>
                Where you are standing
              </span>
              <input
                value={r?.location ?? here}
                onChange={(e) => {
                  patch(c.id, { location: e.target.value });
                  setHere(e.target.value);
                }}
                list={LOCATION_LIST_ID}
                placeholder="Stand 12, north switch room, Pier B roof…"
                className="mt-1 min-h-[44px] w-full rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />
              {!r?.location && here && (
                <span className="mt-1 block text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                  Carried from the last place you named — it goes on the record when you save.
                </span>
              )}
            </label>

            <label className="mt-4 block">
              <span className="label-xs" style={{ color: "var(--ink-4)" }}>
                What you found · the observation on the record
              </span>
              <textarea
                value={r?.observation ?? ""}
                onChange={(e) => patch(c.id, { observation: e.target.value })}
                placeholder="Speak it if it is long — the microphone writes into this field."
                className="mt-1 min-h-[88px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] leading-[1.5] outline-none"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />
            </label>

            {attachments.length > 0 && (
              <div className="mt-2.5">
                <AttachmentStrip
                  attachments={attachments}
                  thumbSize={40}
                  onRemove={(id) => removeAttachment(c.id, id)}
                  onUpdate={(id, pa) => updateAttachment(c.id, id, pa)}
                  writeUp={
                    aiOn ? (t) => assist("transcript", transcriptContext(t, c, r)) : undefined
                  }
                  onAccept={(text) => {
                    appendObservation(c.id, text);
                    say(`Written up into ${c.id}`);
                  }}
                />
              </div>
            )}
          </Sheet>
        );
      })()}

      {/* THE ADD SHEET. Replaces the old "+ New finding" modal, which took a
          description, a discipline and a location and nothing else — no
          photograph, no voice note, no outcome, no asset system — on the one
          screen where the auditor is standing in front of the thing with a
          camera in their hand. An observation raised there arrived on the
          findings register already committed to being a finding, with no
          evidence attached and an asset system of the literal string "Ad-hoc",
          which then showed up as an asset system on every screen that groups
          by one.

          Nothing is lost: the sheet raises a finding from the item in one tap,
          carrying the description and linking the two, so what used to be the
          only path is still a path and now arrives with its evidence. */}
      <AddItemSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditingId(null);
        }}
        editing={editingId ? (adhocItems.find((a) => a.id === editingId) ?? null) : null}
        /* Pre-filled from the group the auditor has open, where exactly one
           is: filtered to Electrical, they are almost certainly recording
           something electrical. A pre-fill is editable and a requirement is
           not, and that is the whole difference. */
        /* Pre-filled from the filter and from where the auditor said they are.
           A pre-fill is editable and a requirement is not, and that is the
           whole difference. */
        presetDiscipline={groupBy === "discipline" ? activeFilter || null : null}
        presetArea={here || (groupBy === "area" ? activeFilter : "")}
        /* AND IT OPENS THE GROUP IT LANDED IN.
           The asset systems are shut by default, so recording something seen
           on the walk used to file it correctly and show the auditor nothing —
           the toast said WALK-xxxxx recorded and the screen looked exactly as
           it had a second earlier. An auditor who cannot see what they just
           recorded records it again. Caught by tests/robustness.js, which
           looks for the description on screen after saving. */
        onSaved={(id, message) => {
          const item = useStore.getState().adhoc().find((a) => a.id === id);
          const key = item?.system?.trim() || NO_SYSTEM;
          setExpanded((e) => (e.includes(key) ? e : [...e, key]));
          say(message);
        }}
      />


      {/* One datalist for every location box on this screen — the inspection's
          and every photograph's. See LocationOptions. */}
      <LocationOptions values={knownLocations} />

      {toast && (
        <div
          className="toast-above-bar fixed left-1/2 z-[100] -translate-x-1/2 rounded-[11px] px-[15px] py-2.5 text-[12px] font-medium"
          style={{ background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--e3)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
