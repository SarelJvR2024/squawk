"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  areasAt,
  checksAt,
  disciplinesAt,
  priorFor,
  useCaptures,
  useDisciplineFilter,
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
import type { AdHocItem, Check } from "@/lib/types";
import { Btn, Empty, Pill } from "@/components/ui/primitives";
import PageHeading from "@/components/ui/PageHeading";
import { DisciplineSelect } from "@/components/ui/DisciplineSelect";
import { FilterPopover } from "@/components/ui/FilterPopover";
import AddItemSheet from "@/components/AddItemSheet";
import GroupRow from "@/components/ui/GroupRow";
import Sheet from "@/components/ui/Sheet";
import OutcomeControl, { OUTCOMES } from "@/components/OutcomeControl";
import AcsaRequirementPanel from "@/components/AcsaRequirementPanel";
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

/* THEN: a running "where you are standing" carried the last place this audit
   named into every inspection opened after it, so a switch room with eleven
   check-points in it cost one typed location and not eleven (lastLocationIn,
   below, used to read that starting value off the record).

   NOW (Sarel, twice): first "the field where you are standing gets pulled to
   the next inspection you open" — fixed by moving the carry to commit instead
   of every keystroke — then, once that still was not what he wanted, "it is
   still not clearing... it should be an empty field." The running location is
   gone, not just the premature write. A freshly opened inspection's location
   is blank unless THAT check already has its own saved one. The suggestions
   list underneath it (knownLocations, below) still offers recent places on
   the datalist — one tap instead of retyping — it simply no longer fills
   itself in. */

/** ONE LINKAGE AXIS, AS A THREE-WAY TOGGLE WITH ITS OWN COUNTS ON ITS FACE.
 *
 *  "All / N linked / N unlinked", each number counting PHOTOGRAPHS — see
 *  walkLinkage's own comment in FieldPage for why photos rather than items.
 *  Reused for both axes (check and asset system) rather than written twice,
 *  since the two rows are identical in shape and differ only in their
 *  label and their counts.
 *
 *  REVISED, 20 October 2026 — Sarel, relayed via another session after a
 *  screenshot: "check the numbers in these filter they are either wrong or
 *  confusing. also improve the look of this filter setup." Checked: the
 *  counts were correct, but nothing on the button said what they were
 *  counting, sitting one row below a header chip that counts something
 *  else entirely (check-points, not photographs) in the same bare-number
 *  shape. `label` now carries the unit ("Photos linked to…") so a reader
 *  never has to guess, the camera icon gives the same answer at a glance,
 *  and each button leads with its own number ("0 linked") rather than
 *  trailing it in parentheses, which is both the clearer reading order and
 *  what the header chip itself already does ("+16"). */
function LinkageFilter({
  label,
  value,
  onChange,
  linked,
  unlinked,
}: {
  label: string;
  value: "all" | "linked" | "unlinked";
  onChange: (v: "all" | "linked" | "unlinked") => void;
  linked: number;
  unlinked: number;
}) {
  const options: { key: "all" | "linked" | "unlinked"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "linked", label: `${linked} linked` },
    { key: "unlinked", label: `${unlinked} unlinked` },
  ];
  return (
    <div>
      <div className="mb-1 flex items-center gap-[5px]">
        <IconCamera width={11} height={11} style={{ color: "var(--ink-4)" }} />
        <div className="label-xs">{label}</div>
      </div>
      <div role="radiogroup" aria-label={label} className="flex gap-[2px] rounded-[11px] p-[3px]" style={{ background: "var(--sunken)" }}>
        {options.map((o) => (
          <button
            key={o.key}
            role="radio"
            aria-checked={value === o.key}
            onClick={() => onChange(o.key)}
            title={o.key === "all" ? "Every walk photo, linked or not" : `${o.label} — of walk photos`}
            className="flex min-h-[34px] flex-1 items-center justify-center rounded-[8px] px-2 font-mono text-[10px] font-semibold transition-[var(--t)]"
            style={{
              background: value === o.key ? "var(--panel)" : "transparent",
              color: value === o.key ? "var(--acc)" : "var(--ink-2)",
              boxShadow: value === o.key ? "var(--e1)" : "none",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** THE WIDE-MODE TWIN OF THE SHEET, NEVER MOUNTED AT THE SAME TIME AS IT.
 *
 *  Same chrome as Sheet.tsx on purpose — a badges row, a title, a subtitle,
 *  a scrolling body, a footer pinned at the bottom — so a check reads the
 *  same whichever of the two is on screen; what it leaves out is everything
 *  that makes Sheet a DIALOG: no backdrop, no `role="dialog"`, no focus
 *  trap, no Escape handler, no close button. It does not need any of that —
 *  the list beside it is never hidden, so there is nothing modal about it
 *  for it to escape, and the Save & close button already clears the
 *  selection (see `selectedDetail`'s footer) the same way Escape would.
 *
 *  `detail` is `selectedDetail`, built once in FieldPage and handed to
 *  whichever of this component or Sheet is mounted — see that constant's
 *  own doc comment for why there is only one copy of a check's fields to
 *  drift out of sync. `null` (nothing selected yet) renders a placeholder
 *  rather than nothing, so the list never jumps sideways as a selection is
 *  made or cleared — the column is always there once this component mounts
 *  at all (FieldPage only mounts it once `isWideDetail` is true).
 *
 *  STICKY, offset by the search bar's own measured height (`barOffset`,
 *  `barH` in FieldPage) so it starts just under that bar rather than behind
 *  it — the same offset GroupRow's own sticky group headers already use.
 *  `maxHeight` keeps it from growing past the viewport once content is
 *  long; it scrolls internally past that, independently of the list beside
 *  it, which keeps scrolling the page as it always has below `lg` and still
 *  does here (this pane is the one exception, not the list). */
function WideCheckPane({
  detail,
  barOffset,
  maxHeightPx,
}: {
  detail: {
    badges: ReactNode;
    title: ReactNode;
    subtitle: ReactNode;
    footer: ReactNode;
    body: ReactNode;
  } | null;
  barOffset: number;
  /** `.app-scroll`'s own measured height minus the search bar minus the
   *  "Add item" bar minus a few pixels — see the call site's own comment.
   *  `undefined` only for the render or two before those measurements
   *  land; `70vh` is a conservative stand-in for that brief window, never
   *  what ships to a screenshot or a real session. */
  maxHeightPx?: number;
}) {
  const stickyStyle = {
    top: barOffset,
    maxHeight: maxHeightPx ? `${maxHeightPx}px` : "70vh",
  };
  if (!detail) {
    return (
      <div
        className="flex w-[380px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[16px] border p-8 text-center"
        style={{ ...stickyStyle, position: "sticky", borderColor: "var(--line)", color: "var(--ink-3)" }}
      >
        <IconInbox width={22} height={22} />
        <p className="text-[12.5px]">Select a check-point from the list to see it here.</p>
      </div>
    );
  }
  return (
    <div
      className="flex w-[380px] shrink-0 flex-col overflow-hidden rounded-[16px] border"
      style={{ ...stickyStyle, position: "sticky", borderColor: "var(--line-2)", background: "var(--panel)", boxShadow: "var(--e1)" }}
    >
      <div className="shrink-0 border-b px-5 py-3" style={{ borderColor: "var(--line)" }}>
        {detail.badges && (
          <div
            className="mb-[5px] flex flex-wrap items-center gap-[6px] font-mono text-[10px]"
            style={{ color: "var(--ink-3)" }}
          >
            {detail.badges}
          </div>
        )}
        <h3 className="text-[14px] leading-[1.35] font-bold">{detail.title}</h3>
        {detail.subtitle && (
          <p className="mt-[3px] text-[11px] leading-[1.45]" style={{ color: "var(--ink-3)" }}>
            {detail.subtitle}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{detail.body}</div>
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        {detail.footer}
      </div>
    </div>
  );
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
  const setFieldCompliance = useStore((s) => s.setFieldCompliance);
  const patch = useStore((s) => s.patch);
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
  /* The Internal Working Area, directly on a check — see the section inside
     the Inspection sheet below. Same AdHocItem mechanism as the general walk
     items above; addFinding/updateAdhoc are the exact raise-a-finding pair
     AddItemSheet already uses, reused rather than duplicated. */
  const addAdhoc = useStore((s) => s.addAdhoc);
  const updateAdhoc = useStore((s) => s.updateAdhoc);
  const removeAdhoc = useStore((s) => s.removeAdhoc);
  const addAdhocAttachment = useStore((s) => s.addAdhocAttachment);
  const removeAdhocAttachment = useStore((s) => s.removeAdhocAttachment);
  const updateAdhocAttachment = useStore((s) => s.updateAdhocAttachment);
  const addFinding = useStore((s) => s.addFinding);

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
     own picker.

     SHARED WITH CAPTURE, REVIEW AND HIRA ON THE DISCIPLINE AXIS ONLY — see
     useDisciplineFilter's own note in src/lib/store.ts. The location axis
     (`groupBy === "area"`) has nothing to share with those screens, so it
     keeps its own local state exactly as before; `filter`/`setFilter` below
     is a thin read-through to whichever axis is live, so every other use of
     `filter` in this file (by way of `activeFilter`) is unchanged. */
  const [areaFilter, setAreaFilter] = useState("");
  /* LINKAGE FILTERS — independent of the discipline/location axis above and
     of each other: an item can be linked to a check, to a system, to both,
     or neither, so these are two separate three-way toggles rather than one
     combined "linked/unlinked" switch that could not express "has a system
     but no check" at all. See walkLinkage/walkVisible below. */
  const [checkLinkFilter, setCheckLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [systemLinkFilter, setSystemLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const sharedDiscipline = useDisciplineFilter();
  const setSharedDiscipline = useStore((s) => s.setDisciplineFilter);
  const filter = groupBy === "area" ? areaFilter : sharedDiscipline;
  const setFilter = (v: string) => {
    if (groupBy === "area") setAreaFilter(v);
    else setSharedDiscipline(v);
  };
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
  /* WHICH HALF OF THE SHEET IS SHOWING — our own walkabout instruction and
     the capture controls, or ACSA's own wording for the check. Sarel: he
     wants the actual ACSA requirement reachable from the walk, not only the
     TPJV walkabout note. It used to be a "Full check-point →" link off to
     the desk screen; that left the walk for the desk mid-walk, which is the
     opposite of what this screen is for, and was removed for exactly that
     reason (see the Save & close footer below). A tab keeps the reference
     material on the one screen without reopening the question that removal
     answered — nothing here navigates anywhere.

     Reset to "walkabout" whenever a different check opens (see the open
     button below) — opening one check's ACSA wording must not leave the
     next one open to it too. */
  const [checkTab, setCheckTab] = useState<"walkabout" | "acsa">("walkabout");

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
  /* LIST+DETAIL SIDE BY SIDE, FROM `lg` (1024px) UP — the deferred item from
     the desktop/tablet redesign brief, this round. `lg` is this app's own
     established threshold for "both halves of a two-pane split stay
     comfortably usable" — Checks' own CheckDetail.tsx reference/record split
     uses it (`lg:grid-cols-2`/`lg:w-1/2`), and tests/tablet.test.mjs exists
     because that pane went two-pane only at `xl` (1280px) first and stacked
     on an iPad in landscape (1180px) as a result; `lg` is the fix that
     shipped for it. Measured directly for THIS screen's own content at
     1024×768 before choosing it here too — see this round's screenshots.

     JS-DRIVEN, NOT A BARE CSS BREAKPOINT, because what it gates is WHICH of
     two mutually exclusive things mounts (the Sheet modal below `lg`, the
     inline `WideCheckPane` at and above it) — never both at once. Two
     copies of the same dialog in the DOM at once would mean two focus traps
     and duplicate ids (the Internal Working Area's inputs, the outcome
     radiogroup's `idPrefix`); gating render in JS means only one ever
     exists, rather than hiding one of two mounted copies with CSS and
     hoping an inert focus trap stays inert. Defaults to false (narrow/modal)
     until the effect below runs, matching how `barH` above already defaults
     to 0 before its own measurement — consistent with this file's existing
     pattern for "the real answer needs the DOM", not a new one. */
  const [isWideDetail, setIsWideDetail] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsWideDetail(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  /* HOW TALL `WideCheckPane` IS ALLOWED TO GET — measured, not guessed, the
     same reason `barH` above is measured rather than assumed. The pane
     sticks inside `.app-scroll`'s own scrollport, which is shorter than
     `100vh` (the masthead and the tab strip above this page eat some of
     that), and this screen also has a second sticky element BELOW it — the
     "Add item" bar — that a height guessed from `100vh` alone drifted under
     by exactly the few pixels that bar is tall, covering Save & close the
     first time this was measured by eye. `scrollAreaH` is `.app-scroll`'s
     own box, `addBarH` is that bottom bar's, and the pane's cap is the
     first minus the search bar already measured (`barH`) minus the second,
     with a few pixels of breathing room — the exact space actually left for
     it, on this screen, at this width, rather than an assumption about how
     much chrome sits above and below it. */
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [scrollAreaH, setScrollAreaH] = useState(0);
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const measure = () => setScrollAreaH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const addBarRef = useRef<HTMLDivElement>(null);
  const [addBarH, setAddBarH] = useState(0);
  useEffect(() => {
    const el = addBarRef.current;
    if (!el) return;
    const measure = () => setAddBarH(el.getBoundingClientRect().height);
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

  /* SAVING A CHECK NO LONGER INVENTS WHERE IT WAS DONE. There is nothing left
     to carry forward — see the note above where the running location used to
     live. What is on the record is exactly what the auditor typed into THIS
     check's own box, or nothing. */
  const saveField = (id: string) => {
    commit(id, "field");
  };

  /* AN INTERNAL WORKING AREA ITEM BECOMES A FINDING EXACTLY THE WAY AN
     ORDINARY WALK ITEM DOES — see AddItemSheet's own raiseFinding, which this
     mirrors field for field rather than inventing a second mechanism. The
     link is kept both ways, same reason: the observation and the finding
     stay one thing rather than becoming two accounts of it, and the item
     drops out of the Internal Working Area list the moment findingId is
     set — see that filter inside the check Sheet below. */
  const raiseInternalFinding = (item: AdHocItem) => {
    if (item.findingId) return;
    const id = addFinding({
      checkId: null,
      discipline: item.discipline ?? "",
      system: item.system ?? "",
      area: item.area,
      title: "Seen on the walk",
      description: item.description,
      issueIndex: null,
      severity: null,
      likelihood: null,
      ratingConfirmed: false,
      rootCause: "",
      actions: [],
      actionStatus: "Open",
      originVisit: visitId,
      priorRating: null,
      suggestedEvent: "",
      progress: [],
      adHoc: true,
      createdBy: auditor,
    });
    updateAdhoc(item.id, { findingId: id });
    say(`${id} raised from ${item.id}`);
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

  /* NOT ONE OF THE 324, AND NOT ONE OF THESE EITHER while it is still parked.
     An Internal Working Area item (AdHocItem.internal) is captured from
     inside a check's own Inspection popup and lives there, never under its
     asset system in this list — "not visible externally" was explicit. Once
     it is promoted (findingId set) it is a real finding and rejoins this
     list exactly as any other promoted walk item always has. */
  const walkCandidates = useMemo(
    () => adhocItems.filter((it) => !it.internal || it.findingId),
    [adhocItems]
  );

  /* The walk items the current discipline/location filter and search should
     show — everything EXCEPT the linkage filters below, so their own counts
     (and buttons) describe what is in view right now, not what they would
     leave behind once pressed. Same two rules as the register list, plus one
     of its own: an item with no discipline and no location is NEVER hidden by
     a filter on either — a filter that hides an unattributed observation
     makes the one record nobody can re-derive the easiest one to lose. */
  const walkScoped = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    if (q2) {
      return walkCandidates.filter((it) =>
        `${it.id} ${it.description} ${it.note} ${it.area} ${it.discipline ?? ""} ${it.system ?? ""}`
          .toLowerCase()
          .includes(q2)
      );
    }
    if (!activeFilter) return walkCandidates;
    return walkCandidates.filter((it) => {
      const own = (groupBy === "area" ? it.area : it.discipline)?.trim();
      return !own || own === activeFilter;
    });
  }, [walkCandidates, q, activeFilter, groupBy]);

  /* LINKED, OR NOT — TWO SEPARATE QUESTIONS, EACH WITH ITS OWN COUNT.
     Sarel: "give a clear update on number of photos linked vs not linked to
     audit checks, linked vs not linked to asset system and add those as
     filters." Counted in photos, not items, because a handful of
     unattributed items can carry most of the evidence shot that day — an
     item count would read as "a few loose ends" when the real number is "40
     photographs nobody can trace to a check yet". Scoped to walkScoped, so
     the counts move with the discipline/location filter and search exactly
     as the tree itself does. */
  const walkLinkage = useMemo(() => {
    let checkLinked = 0, checkUnlinked = 0, systemLinked = 0, systemUnlinked = 0;
    for (const it of walkScoped) {
      const photos = it.attachments.filter((a) => a.kind === "photo").length;
      if (it.checkId) checkLinked += photos;
      else checkUnlinked += photos;
      if (it.system?.trim()) systemLinked += photos;
      else systemUnlinked += photos;
    }
    return { checkLinked, checkUnlinked, systemLinked, systemUnlinked };
  }, [walkScoped]);

  const walkVisible = useMemo(() => {
    return walkScoped.filter((it) => {
      if (checkLinkFilter === "linked" && !it.checkId) return false;
      if (checkLinkFilter === "unlinked" && it.checkId) return false;
      if (systemLinkFilter === "linked" && !it.system?.trim()) return false;
      if (systemLinkFilter === "unlinked" && it.system?.trim()) return false;
      return true;
    });
  }, [walkScoped, checkLinkFilter, systemLinkFilter]);

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
  /* THE PCT FOR THE RESTORED PAGE-HEADING FIGURE — desktop/tablet redesign,
     phase 1 checkpoint. `doneCount`/`visible.length` just above are the
     exact pair that used to sit beside the Filters button as
     "{doneCount}/{visible.length}" before d7d79bb's item-7 commit dropped
     it on the (mistaken) claim that "the existing track+figure just below
     this bar... already did that job" — the track survived, the figure did
     not; see the sticky header's own progress-track block further down,
     which carries no number at all today. This is that number, restored,
     not recomputed: same two variables, nothing new. */
  const visiblePct = visible.length ? Math.round((doneCount / visible.length) * 100) : 0;

  /* THE FILTERS POPOVER'S OWN BUTTON — just "Filters" or "Filters · X",
   *  21 Oct 2026 (the second visual-hierarchy pass, item 7). This used to
   *  carry a one-line readout of all three axes at once plus a count
   *  badge for how many were non-default — both gone now, see the
   *  FilterPopover call's own doc comment just below for why. `X` is the
   *  one thing worth a glance on the button itself: the discipline or
   *  location actually selected, when one is. Everything else (the
   *  search term, the two linkage filters) is still exactly as reachable
   *  as it was — one tap into the panel — just no longer spelled out on
   *  the button's own face. */
  const fieldFilterLabel = activeFilter ? `Filters · ${activeFilter}` : "Filters";


  /* NAMED AS THE TAB NAMES IT. The navigation says "Inspection" and this
     heading said "Site walkabout" — an auditor told to go to Inspection
     landed on a screen called something else, which is the same defect the
     home screen's own test caught on the HIRA rename. The walkabout wording
     is kept as the subtitle, because it is what the audit method calls this
     session and it says what the screen is for in a way "Inspection" does
     not. */
  const heading = (
    <h2 className="text-[15px] font-bold">
      Inspection{" "}
      {/* The subtitle wrapped the heading onto a second line at 375px, which
          is 22px of a 664px screen spent restating the tab name. Desk only,
          where it costs nothing. */}
      <span className="hidden sm:inline" style={{ color: "var(--ink-3)" }}>
        · the site walkabout
      </span>
    </h2>
  );

  /* THE SELECTED CHECK'S DETAIL — BUILT ONCE, RENDERED IN ONE OF TWO PLACES.
     Desktop/tablet redesign, this round: the list+detail side-by-side item
     deferred last round, because the Sheet below (see its own long comment
     where it is used) is a deliberate, hard-won fix for real phone-width
     defects — an expanded-in-place check lost its Save button and its
     scrolling broke. Converting it by hand into two copies, one for the
     modal and one for an inline pane, was the risk flagged then: the two
     would drift the first time either one got a field added to it and
     nobody remembered the other.

     So there is exactly one copy. Every field, attachment tool, outcome
     control and the Internal Working Area build here, ONCE, into five
     pieces (`badges`/`title`/`subtitle`/`footer`/`body` — the same five the
     Sheet component itself already separates a header from a body from a
     footer by). Below `lg` they go to the Sheet exactly as before — nothing
     in this object's shape or content is new, only where it is computed.
     At `lg` and up `WideCheckPane` renders the SAME five beside the list
     instead. Neither path hand-retypes a single field. */
  const selectedDetail = (() => {
    const c = openItem ? visible.find((x) => x.id === openItem) : null;
    if (!c) return null;
    const r = responses[c.id];
    const attachments = r?.attachments ?? [];
    const photos = attachments.filter((x) => x.kind === "photo");
    const wo = library?.[c.id]?.WO ?? [];
    const picked = r?.walkaboutPicked;
    const needsPhoto = picked != null && wo[picked]?.photo === true && photos.length === 0;
    const pf = priorFor(entityCode, c.discipline, c.system);

    const badges = (
      <>
        <span>{portalIdFor(entityCode, c.id)}</span>
        <span>·</span>
        <span>{c.system}</span>
        {/* How the check is answered is a category, not a status —
            item 4 of Sarel's second visual-hierarchy pass takes the
            brand accent off it. */}
        {modeLabels(c)
          .filter((m) => m !== "Physical")
          .map((m) => <Pill key={m}>{m.toUpperCase()}</Pill>)}
        {pf && <Pill tone="warn">{pf.key} · 2025 {pf.rating.toUpperCase()}</Pill>}
      </>
    );

    const title = c.requirement?.trim() ? (
      c.requirement
    ) : (
      <span style={{ color: "var(--warn)" }}>
        {portalIdFor(entityCode, c.id)} — the register carries no check text for this
        check-point
      </span>
    );

    const subtitle = "ACSA check-point · the register's wording";

    const footer = (
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
                /* WHERE IT WAS TAKEN, WITHOUT A SINGLE EXTRA TAP —
                   when this check already has one typed. No running
                   location to fall back on any more; a photograph on
                   a check nobody has named a place for is simply
                   editable per photograph, same as always. */
                location: r?.location?.trim() || "",
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
        {/* SAVE & CLOSE, ALWAYS — never "save and next".
            Sarel, from the apron: "the save and next button should
            rather be a save and close button because the inspections
            wont necessarily flow in sequence."

            That is the difference between the desk and the walk. At a
            desk an auditor works a discipline top to bottom and the
            next check is the right one to open. On a walk they are
            standing in front of a thing, and what they inspect next is
            decided by where their feet are, not by register order.
            Advancing for them opened a check about somewhere else and
            made them close it again — a press against them on every
            item.

            Closing returns to the list, which is where the next choice
            is actually made. `next` is no longer computed for this.
            IN WIDE MODE this still closes/clears the pane rather than the
            check itself changing shape — `setOpenItem(null)` deselects,
            which is the inline-pane equivalent of the modal closing. */}
        <Btn
          variant="primary"
          onClick={() => {
            saveField(c.id);
            setOpenItem(null);
            say(`Saved · ${portalIdFor(entityCode, c.id)}`);
          }}
        >
          <IconCheck width={14} height={14} />
          Save &amp; close
        </Btn>
      </>
    );

    const body = (
      <>
        {/* WHICH HALF IS SHOWING — see checkTab's own note above. Two tabs,
            pill-shaped like CheckDetail's own tab strip, so a reference tab
            reads the same wherever it appears in this app. "ACSA
            requirement" is deliberately the same label the desk screen uses
            for the identical panel — see AcsaRequirementPanel. */}
        <div role="tablist" className="mb-3 flex flex-nowrap gap-[5px]">
          {(
            [
              ["walkabout", "Walkabout"],
              ["acsa", "ACSA requirement"],
            ] as [typeof checkTab, string][]
          ).map(([key, label]) => {
            const on = checkTab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                onClick={() => setCheckTab(key)}
                className="flex shrink-0 items-center gap-[5px] rounded-full border px-[11px] py-[6px] font-display text-[10.5px] font-semibold whitespace-nowrap transition-[var(--t)]"
                style={
                  on
                    ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                    : { background: "var(--sunken)", borderColor: "transparent", color: "var(--ink-3)" }
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        {checkTab === "acsa" ? (
          <AcsaRequirementPanel check={c} />
        ) : (
          <>
            {/* OURS, AND IT SAYS SO. 25 of the 324 have no walkabout written;
                an empty one renders nothing at all. */}
            {c.walkabout?.trim() && (
              <div
                className="mb-3 rounded-[8px] border-l-[2px] pl-[9px]"
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

            {/* THE RESEARCHED ANSWER OPTIONS (Response.walkaboutPicked's
                chips) ARE GONE FROM THIS POPUP, 11 October 2026 — Sarel:
                remove the answer options from the popup screen. `wo`/
                `picked` just above are still read for `needsPhoto` below —
                whatever an earlier tap (or the desk screen's own Walkabout
                tab, which still carries these chips) already set keeps
                driving that warning; there is simply no longer a way to set
                a NEW one from here. Outcome (Compliant/Non-compliant/N/A)
                right below remains the one thing this popup commits. */}

            {needsPhoto && (
              <div
                className="mb-3 flex items-center gap-2 rounded-[8px] border px-[10px] py-[7px] text-[11px]"
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

            {/* THE "OUTCOME" CAPTION IS GONE, deliberately — Sarel's second
                visual-hierarchy pass, item 3: delete a label that only
                restates what the content already says. The four buttons
                immediately below read "Compliant", "Non-compliant", "N/A",
                "Later" — nobody needs told that is the outcome before
                reading the word "Compliant" on a button. OutcomeControl's
                own radiogroup still carries aria-label="Outcome"
                (OutcomeControl.tsx), so the accessible name survives; only
                the sighted, redundant copy of it is removed. */}
            <OutcomeControl
              value={r?.fieldCompliance ?? null}
              onChange={(nextOutcome) => {
                /* Response.fieldCompliance — this screen's own verdict, kept
                   apart from the desk's `compliance` (see that field's own
                   doc comment in types.ts). No evidence-pending flag to carry
                   here: that is a Checks-screen RFI concept with nothing on
                   this axis for it to agree or disagree with. */
                setFieldCompliance(c.id, nextOutcome);
                if (nextOutcome) {
                  saveField(c.id);
                  say(`${portalIdFor(entityCode, c.id)} — ${OUTCOMES.find((o) => o.key === nextOutcome)?.label}`);
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

                EMPTY UNTIL TYPED, ON EVERY CHECK. It used to carry the last
                place named on this walk forward as a starting value — Sarel,
                after that leaked mid-typing and then still did not sit right
                even fixed: "it is still not clearing... it should be an empty
                field." So it is: a freshly opened inspection shows nothing
                here whatever an earlier one was answered with. The datalist
                below still suggests recent places as you type — one tap, not
                a retype — it simply no longer fills itself in. */}
            <label className="mt-4 block">
              <span className="label-xs" style={{ color: "var(--ink-4)" }}>
                Where you are standing
              </span>
              <input
                value={r?.location ?? ""}
                onChange={(e) => patch(c.id, { location: e.target.value })}
                list={LOCATION_LIST_ID}
                placeholder="Stand 12, north switch room, Pier B roof…"
                className="mt-1 min-h-[44px] w-full rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />
            </label>

            <label className="mt-4 block">
              {/* VISIBLE CAPTION REMOVED, ACCESSIBLE NAME KEPT — Sarel's
                  second visual-hierarchy pass, item 3: "What you found · the
                  observation on the record" restated what the placeholder
                  and the field's own position (right under the outcome)
                  already say. sr-only rather than deleted outright: the
                  <label> still needs something to give the textarea a name
                  for anyone using a screen reader, and "Observation" says
                  that in three words instead of nine. */}
              <span className="sr-only">Observation</span>
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
                    say(`Written up into ${portalIdFor(entityCode, c.id)}`);
                  }}
                />
              </div>
            )}

            {/* INTERNAL WORKING AREA — parked notes that are not yet a
                finding and not yet visible outside this tool. Sarel: field
                auditors need somewhere for "needs further assessment, a
                document to check, something to raise with ACSA later" that
                currently has nowhere to live except being mentally parked,
                which costs the desk team photo-filtering time afterwards.

                REUSES AdHocItem, see its own `internal` field for the full
                reasoning — this is deliberately not a new record kind.
                MULTIPLE items per check, each independently flaggable and
                independently promotable — confirmed design, not a single
                scratch box. Mirrors the Walkabout section just above it:
                same location pattern, same textarea-plus-capture shape, same
                card styling as the rest of this screen — dashed border and
                the accent tint so it reads as its own thing without a new
                modal pattern (see UX_REVIEW.md on "repeatable item" already
                being built three different ways). */}
            {(() => {
              const internalItems = adhocItems.filter(
                (a) => a.checkId === c.id && a.internal && !a.findingId
              );
              return (
                <div
                  className="mt-5 rounded-[11px] border border-dashed p-3"
                  style={{ borderColor: "var(--acc-line)", background: "var(--acc-soft)" }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className="font-display text-[11px] font-semibold"
                      style={{ color: "var(--acc)" }}
                    >
                      Internal Working Area
                    </span>
                    <Btn
                      variant="ghost"
                      className="min-h-[32px] px-2 py-1 text-[10.5px]"
                      onClick={() =>
                        addAdhoc({
                          origin: "field",
                          description: "",
                          discipline: c.discipline?.trim() || null,
                          system: c.system?.trim() || null,
                          area: r?.location?.trim() ?? "",
                          outcome: null,
                          note: "",
                          attachments: [],
                          findingId: null,
                          createdBy: auditor,
                          checkId: c.id,
                          internal: true,
                        })
                      }
                    >
                      <IconPlus width={11} height={11} />
                      Add item
                    </Btn>
                  </div>
                  <p className="mb-2.5 text-[15px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
                    Not visible externally and not linked to any report — a place to park what
                    you are not ready to call a finding yet.
                  </p>

                  {internalItems.length === 0 ? (
                    <p className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                      Nothing parked here yet.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {internalItems.map((it) => (
                        <div
                          key={it.id}
                          className="rounded-[11px] border p-2.5"
                          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                              {it.id}
                            </span>
                            <button
                              onClick={() => removeAdhoc(it.id)}
                              aria-label="Remove this parked item"
                              className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px]"
                              style={{ color: "var(--ink-3)" }}
                            >
                              <IconX width={12} height={12} />
                            </button>
                          </div>

                          <label className="block">
                            <span className="label-xs" style={{ color: "var(--ink-4)" }}>
                              Where you are standing
                            </span>
                            <input
                              value={it.area}
                              onChange={(e) => updateAdhoc(it.id, { area: e.target.value })}
                              list={LOCATION_LIST_ID}
                              placeholder="Stand 12, north switch room, Pier B roof…"
                              className="mt-1 min-h-[40px] w-full rounded-[8px] border px-2.5 py-2 text-[12px] outline-none"
                              style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                            />
                          </label>

                          <label className="mt-2 block">
                            <span className="label-xs" style={{ color: "var(--ink-4)" }}>
                              What you found and would like to do
                            </span>
                            <textarea
                              value={it.description}
                              onChange={(e) => updateAdhoc(it.id, { description: e.target.value })}
                              placeholder="Further assessment, check documents, regulations, codes, refer to engineer and discuss, consult ACSA, park observation for later stage…"
                              className="mt-1 min-h-[64px] w-full resize-y rounded-[8px] border px-2.5 py-2 text-[12px] leading-[1.45] outline-none"
                              style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                            />
                          </label>

                          <div className="mt-2 flex flex-wrap gap-[6px]">
                            <button
                              onClick={() =>
                                updateAdhoc(it.id, { flagEngineerReview: !it.flagEngineerReview })
                              }
                              className="rounded-full border px-[9px] py-[4px] text-[10px] font-semibold"
                              style={
                                it.flagEngineerReview
                                  ? { background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }
                                  : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-3)" }
                              }
                            >
                              <IconFlag width={10} height={10} style={{ display: "inline", marginRight: 3 }} />
                              Engineer review
                            </button>
                            <button
                              onClick={() =>
                                updateAdhoc(it.id, { flagAuditScopeReview: !it.flagAuditScopeReview })
                              }
                              className="rounded-full border px-[9px] py-[4px] text-[10px] font-semibold"
                              style={
                                it.flagAuditScopeReview
                                  ? { background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }
                                  : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-3)" }
                              }
                            >
                              <IconFlag width={10} height={10} style={{ display: "inline", marginRight: 3 }} />
                              Audit scope review
                            </button>
                          </div>

                          <div className="mt-2 flex justify-end gap-2">
                            <PhotoButton
                              compact
                              onCaptured={(m) =>
                                addAdhocAttachment(it.id, {
                                  ...m,
                                  location: it.area.trim(),
                                  createdBy: auditor,
                                })
                              }
                            />
                            <VoiceNoteButton
                              compact
                              onCaptured={(m) => addAdhocAttachment(it.id, { ...m, createdBy: auditor })}
                            />
                          </div>
                          {it.attachments.length > 0 && (
                            <div className="mt-2">
                              <AttachmentStrip
                                attachments={it.attachments}
                                thumbSize={36}
                                onRemove={(aid) => removeAdhocAttachment(it.id, aid)}
                                onUpdate={(aid, pa) => updateAdhocAttachment(it.id, aid, pa)}
                              />
                            </div>
                          )}

                          <div className="mt-2.5 flex items-center justify-end">
                            <Btn
                              className="min-h-[36px] px-2.5 py-1.5 text-[10.5px]"
                              onClick={() => raiseInternalFinding(it)}
                            >
                              <IconCheck width={12} height={12} />
                              Move to findings
                            </Btn>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </>
    );

    return { c, badges, title, subtitle, footer, body };
  })();

  return (
    /* PHASE 2: an outer flex-col wrapper so the page heading can sit OUTSIDE
       the scrolling container as its own shrink-0 bar, the same shape
       Checks already has (src/app/(app)/capture/page.tsx) and shares with
       it through PageHeading (src/components/ui/PageHeading.tsx) — title
       and progress on the left, an actions slot on the right. It used to be
       the first in-flow block inside `.app-scroll`, which meant it scrolled
       away with the list; pinned here it stays visible at every scroll
       position, same as Checks' own heading row. */
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeading
        title={
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            {heading}
            {/* Prose that orients somebody the first time and costs them a
                scroll every time after. ON ITS OWN LINE, it was a second
                stacked block above a bar that already explains itself (the
                toggle's labels, the search placeholder) — folded onto the
                title's own row instead, so it costs a few extra characters of
                width rather than a whole line of height. Still sm-only; a
                664px phone has room for neither version. */}
            <p className="hidden text-[11.5px] sm:block" style={{ color: "var(--ink-2)" }}>
              Nothing here assumes an order — group by discipline or by where you are standing,
              search anything, or capture first and assign it later.
            </p>
          </div>
        }
        progress={
          /* THE PAGE-HEADING PROGRESS FIGURE, RESTORED — desktop/tablet
             redesign, phase 1 checkpoint. `doneCount`/`visible.length` are
             the exact pair that used to render here as "{doneCount}/
             {visible.length}" (see their own comment just above this
             return), presented now as a slim 4px bar plus words rather
             than the bare mono fraction that used to sit beside the
             Filters button — new presentation, same source of truth. */
          <div className="flex min-w-[160px] flex-1 items-center gap-2.5 sm:max-w-[360px] sm:flex-none">
            <span
              className="h-[4px] flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--line)" }}
              role="img"
              aria-label={`${doneCount} of ${visible.length} captured, ${visiblePct}%`}
            >
              {/* a11y.js's "small round span" dot-check can mistake this fill
                  for an unlabelled status dot once it's 0% wide (0x4px, same
                  footprint as a real dot) — the sr-only text gives the span
                  it sits in real textContent so the check's own "aria-hidden
                  AND the row already says it in words" rule is satisfied. */}
              <span className="sr-only">
                {doneCount} of {visible.length} captured, {visiblePct}%
              </span>
              <span
                className="block h-full rounded-full"
                style={{ width: `${visiblePct}%`, background: "var(--acc)" }}
                aria-hidden="true"
              />
            </span>
            <span className="tnum shrink-0 font-mono text-[12px]" style={{ color: "var(--ink-2)" }} aria-hidden="true">
              {doneCount} of {visible.length} captured · {visiblePct}%
            </span>
            {visible.length > 0 && doneCount === visible.length && (
              <IconCheck
                width={13}
                height={13}
                aria-label="All check-points captured"
                style={{ color: "var(--acc)" }}
              />
            )}
          </div>
        }
      />
    <div ref={scrollAreaRef} className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-3 pb-24 sm:px-6">
        {/* THE STICKY HEADER.

            SEARCH IS ITS OWN ROW NOW, FIRST, ALWAYS VISIBLE — overnight
            refinement, task 3: "expose its existing search prominently
            instead of burying every way to locate an asset behind a
            'Filters' button." It used to live inside the FilterPopover
            below, behind a tap on "Filters · <whatever is set>" — the one
            way an auditor standing at an asset finds the check for it was
            hidden behind the one control that also changes what's filtered.
            Nothing about search itself changed: same `q`/`setQ`, same
            whole-register reach, same "Searching every…" note when a filter
            is also set — it is simply the first thing in the bar rather
            than three levels deep in a popover.

            The Filters popover (the axis switch, the discipline/location
            select and the photo-linkage filters) is still exactly as
            reachable as before, directly below — advanced grouping stays
            available, it is just no longer the way search is reached. */}
        <div
          ref={barRef}
          className="sticky top-0 z-10 -mx-4 mb-2 border-b px-4 py-[5px] sm:-mx-6 sm:px-6 sm:py-[7px]"
          style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        >
          <div
            className="flex min-w-0 items-center gap-2 rounded-[11px] border px-3 py-1 sm:py-2"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          >
            <IconSearch width={14} height={14} className="shrink-0" style={{ color: "var(--ink-3)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search anywhere…"
              aria-label="Search any check"
              className="min-h-[40px] w-full min-w-0 border-none bg-transparent text-[13px] outline-none"
            />
          </div>
          {/* SAID OUT LOUD, because otherwise it looks like the filter broke.
              A search runs across the whole register — it has to, or the
              check for the thing in front of the auditor is missing because
              of a filter they set in another building. */}
          {searching && activeFilter && (
            <div className="mt-1 text-[10.5px]" style={{ color: "var(--ink-3)" }}>
              Searching every {groupBy === "area" ? "location" : "discipline"}, not just{" "}
              <b>{activeFilter}</b>.
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            {/* THE BUTTON NAMES WHAT IS SET, IT DOES NOT ALSO COUNT IT —
                Sarel's second visual-hierarchy pass, item 7: "Filter button
                label becomes 'Filters · Civil' — drop the '8/56 +16' from
                the button; show result counts above the list instead." The
                button used to carry three things at once: the word
                "Filters", a count badge (how many of the axes are
                non-default) and a full summary line ("By discipline ·
                Electrical · 'ramp' · linked to a check"). `fieldFilterLabel`
                replaces all three with the one thing worth reading at a
                glance — which discipline or location is active, right in
                the label — and nothing is lost: the full detail (search
                term, linkage filters and all) is still one tap away inside
                the panel, unchanged. The result counts this button used to
                sit beside (doneCount/visible.length, +walkVisible.length)
                move to sit directly above the list instead — see the
                existing track+figure just below this bar, which already
                did that job; the one that duplicated it beside this button
                is the one that is gone. */}
            <FilterPopover
              label={fieldFilterLabel}
              className="min-w-0 flex-1 sm:max-w-[420px] sm:flex-none"
            >
              <div
                role="radiogroup"
                aria-label="Group the list by"
                className="flex gap-[2px] rounded-[11px] p-[3px]"
                style={{ background: "var(--sunken)" }}
              >
                {(["discipline", "area"] as const).map((g) => (
                  <button
                    key={g}
                    role="radio"
                    aria-checked={groupBy === g}
                    onClick={() => {
                      setGroupBy(g);
                      /* A new axis has different groups, so nothing that was
                         open under the old one still means anything. The
                         location axis's own filter resets here exactly as it
                         always did — a place filter means nothing once
                         you've left it. The discipline axis does NOT reset:
                         it is the shared filter (useDisciplineFilter), and
                         clearing it on every toggle back to "By discipline"
                         would throw away the whole point of sharing it with
                         Capture/Review/HIRA. Setting it directly (not through
                         `setFilter`, which reads the OLD `groupBy` from this
                         closure) avoids clearing the wrong axis. */
                      setExpanded([]);
                      setAreaFilter("");
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

              {/* THE TOP LEVEL, AS A FILTER. It was six rows of the tree that
                  every auditor opened and closed on every visit to this
                  screen. It is one control now, and the tree under it starts
                  at the asset system. */}
              <DisciplineSelect
                value={activeFilter}
                onChange={(v) => {
                  setFilter(v);
                  /* Different subject, different systems — nothing that was
                     open under the last one still means anything. */
                  setExpanded([]);
                }}
                ariaLabel={groupBy === "area" ? "Filter by location" : "Filter by discipline"}
                title={activeFilter || (groupBy === "area" ? "Every location" : "Every discipline")}
                active={!!activeFilter}
                className="w-full"
                options={[
                  { value: "", label: groupBy === "area" ? "All locations" : "All disciplines" },
                  ...tops.map((t) => ({ value: t, label: t })),
                ]}
              />

              {/* A SEPARATE GROUP, SAID SO. The axis switch and the
                  discipline/location select above answer "where" (search
                  itself moved out of this panel — see the sticky header's
                  own note above) — this answers "linked to what", a
                  different question about the same walk items. A rule and a
                  small heading keep a reader from reading these as a
                  continuation of the same list. */}
              {/* "PHOTO FILTERS", BEHIND A DISCLOSURE — Sarel's second
                  visual-hierarchy pass, item 7: "remove the duplicated
                  'All / linked / unlinked' segmented blocks (keep one, or
                  fold photo filters behind a 'Photo filters' disclosure)."
                  The two LinkageFilter rows below are not literally
                  duplicated — one axis is "linked to a check", the other
                  "linked to an asset system" — but they are the same
                  three-way control shape twice in a row, and removing
                  either one would be a real loss of filtering capability
                  (a logic change this pass does not make). Folding both
                  behind one disclosure keeps both axes fully working,
                  closed by default, so the panel's own first screen is the
                  three controls that answer "where" rather than five that
                  read as one repeating list. */}
              <details className="group -mx-[14px] border-t px-[14px] pt-2" style={{ borderColor: "var(--line)" }}>
                <summary className="-mt-1 flex min-h-[30px] cursor-pointer list-none items-center gap-[6px] text-[9.5px] font-semibold tracking-wide uppercase" style={{ color: "var(--ink-4)" }}>
                  <span aria-hidden className="shrink-0 font-mono transition-transform group-open:rotate-90">
                    ›
                  </span>
                  Photo filters — linked to the register, or not
                </summary>
                {/* LINKED, OR NOT — in photographs, not items. See
                    walkLinkage's own comment above for why. Each row is
                    independent: a walk item can be linked to a check, to a
                    system, to both or to neither, so "Linked"/"Unlinked" on
                    one row says nothing about the other. */}
                <div className="mt-2 flex flex-col gap-2">
                  <LinkageFilter
                    label="Photos linked to a check"
                    value={checkLinkFilter}
                    onChange={setCheckLinkFilter}
                    linked={walkLinkage.checkLinked}
                    unlinked={walkLinkage.checkUnlinked}
                  />
                  <LinkageFilter
                    label="Photos linked to an asset system"
                    value={systemLinkFilter}
                    onChange={setSystemLinkFilter}
                    linked={walkLinkage.systemLinked}
                    unlinked={walkLinkage.systemUnlinked}
                  />
                </div>
              </details>
            </FilterPopover>
          </div>
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
            <div className="mt-[7px] text-[15px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
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
            {walkVisible.length > 0 && (
              <span className="shrink-0 font-mono text-[9.5px]" style={{ color: "var(--acc)" }}>
                +{walkVisible.length} seen on the walk
              </span>
            )}
          </div>
        </div>

        {/* LIST AND DETAIL, SIDE BY SIDE FROM `lg` (1024px) UP.
            Desktop/tablet redesign, this round — the deferred item. Below
            `lg` this wrapper is a no-op: a plain block, one column, exactly
            what rendered here before this round touched the file. At `lg`
            and up it becomes a row: the list keeps its existing shape and
            width (nothing in this `min-w-0 lg:flex-1` wrapper below changes
            how the tree itself renders) and `WideCheckPane` — the SAME
            badges/title/subtitle/footer/body `selectedDetail` builds once,
            above this component's `return`, for the Sheet modal too — sits
            beside it. `lg:items-start` lets the pane be only as tall as its
            own content/sticky cap rather than stretched to the list's full
            height, and `lg:sticky` (set on the pane itself) keeps it in view
            as the list scrolls past it, offset by `barH` so it starts right
            under the search bar rather than behind it. */}
        <div className="lg:flex lg:min-h-0 lg:items-start lg:gap-4">
        <div className="min-w-0 lg:min-h-0 lg:flex-1">
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
            className="rounded-[11px] border"
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
                    showCheck
                    title={`${g.sys} — ${g.done} of ${g.total} seen${
                      g.walk.length ? `, plus ${g.walk.length} added by hand` : ""
                    }`}
                  >
                    {pf && <Pill tone="warn">{pf.key}</Pill>}
                    {/* BESIDE THE FRACTION, NEVER INSIDE IT. Walk items are
                        counted separately and said separately, because adding
                        them would make the denominator a number that grows as
                        you work. */}
                    {/* A count, not a status — item 4 of Sarel's second
                        visual-hierarchy pass takes the brand accent off it. */}
                    {g.walk.length > 0 && <Pill>+{g.walk.length}</Pill>}
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
                        const outcome = OUTCOMES.find((o) => o.key === r?.fieldCompliance);
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
                              onClick={() => { setOpenItem(c.id); setCheckTab("walkabout"); }}
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
                                  {/* How the check is answered is a
                                      category, not a status — item 4 of
                                      Sarel's second visual-hierarchy pass
                                      takes the brand accent off it. */}
                                  {modeLabels(c)
                                    .filter((m) => m !== "Physical")
                                    .map((m) => (
                                      <Pill key={m}>{m.toUpperCase()}</Pill>
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
                                  {/* A provenance mark, not a status — item 4
                                      of Sarel's second visual-hierarchy pass
                                      takes the brand accent off it. */}
                                  <span
                                    className="flex items-center gap-[3px] rounded-[8px] border border-dashed px-[5px] py-[1px] font-mono text-[8.5px]"
                                    style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                                    title="Added on the walk — not one of ACSA's check-points, and not counted in the completion figure"
                                  >
                                    <IconPlus width={9} height={9} />
                                    ADDED ON THE WALK
                                  </span>
                                  <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                                    {it.id}
                                  </span>
                                  {it.findingId && <Pill tone="warn">{it.findingId}</Pill>}
                                  {it.importKey && (
                                    <Pill title="Written by Import observation pack — not typed on the walk">
                                      IMPORTED, TPJV-PROPOSED
                                    </Pill>
                                  )}
                                </span>
                                {it.title && (
                                  <span
                                    className="mb-[1px] block text-[10px] font-semibold uppercase tracking-wide"
                                    style={{ color: "var(--ink-3)" }}
                                  >
                                    {it.title}
                                  </span>
                                )}
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
                                  {it.raisedBy && <span>raised by {it.raisedBy}</span>}
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
        {isWideDetail && (
          <WideCheckPane
            detail={selectedDetail}
            barOffset={barH}
            maxHeightPx={scrollAreaH > 0 ? Math.max(240, scrollAreaH - barH - addBarH - 8) : undefined}
          />
        )}
        </div>
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
        ref={addBarRef}
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
            className="max-h-[70vh] w-[min(560px,92vw)] overflow-y-auto rounded-[16px] border p-[22px]"
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
                      {portalIdFor(entityCode, c.id)}
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
            className="w-[min(560px,92vw)] rounded-[16px] border p-[22px]"
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
                  className="mt-1 w-full rounded-[8px] border px-2.5 py-2 text-[12px]"
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
                  className="mt-1 w-full rounded-[8px] border px-2.5 py-2 text-[12px]"
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
                    areas: [],
                    otherImpacts: [],
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
                    actions: [],
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
          the auditor back exactly where they were.

          DESKTOP/TABLET REDESIGN, THIS ROUND — the deferred item: list and
          detail side by side from `lg` up. The content that used to be built
          inline, right here, is now built once as `selectedDetail` (see just
          above this component's own `return`, right after `heading`) and fed
          to whichever of two wrappers is on screen: this Sheet below the
          breakpoint, or `WideCheckPane` beside the list at and above it. Only
          one of the two ever mounts — `isWideDetail` gates it below — so
          there is never a second dialog, a second focus trap, or a duplicate
          id (the Internal Working Area's own inputs, the outcome
          radiogroup's `idPrefix`) in the DOM at once. Nothing in this Sheet
          itself changed; what moved is only WHERE its badges/title/subtitle/
          footer/body get built. */}
      {selectedDetail && !isWideDetail && (
        <Sheet
          open
          wide
          onClose={() => setOpenItem(null)}
          badges={selectedDetail.badges}
          title={selectedDetail.title}
          subtitle={selectedDetail.subtitle}
          footer={selectedDetail.footer}
        >
          {selectedDetail.body}
        </Sheet>
      )}

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
        /* Pre-filled from the filter. A pre-fill is editable and a
           requirement is not, and that is the whole difference. */
        presetDiscipline={groupBy === "discipline" ? activeFilter || null : null}
        presetArea={groupBy === "area" ? activeFilter : ""}
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
    </div>
  );
}
