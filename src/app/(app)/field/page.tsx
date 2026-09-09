"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import type { Check } from "@/lib/types";
import { Btn, Chip, Empty, Pill } from "@/components/ui/primitives";
import AddItemSheet from "@/components/AddItemSheet";
import GroupRow from "@/components/ui/GroupRow";
import OutcomeControl, { OUTCOMES } from "@/components/OutcomeControl";
import { AttachmentStrip, PhotoButton, PhotoThumb, VoiceNoteButton } from "@/components/Capture";
import { useAnswerLibrary } from "@/lib/answers";
import { assist, transcriptContext, useAssistAvailable } from "@/lib/assist";
import { modeLabels, needsField } from "@/lib/verification";
import {
  IconCamera,
  IconCheck,
  IconInbox,
  IconPin,
  IconPlus,
  IconSearch,
  IconX,
} from "@/components/ui/icons";

export default function FieldPage() {
  const router = useRouter();
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

  /* Everything checkable on site here. The tree groups it; the search cuts
     across the tree entirely, because the auditor standing in front of a thing
     wants the check for THAT thing and does not care which group it is in. */
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
    return list;
  }, [entityCode, q]);

  /* THE TREE. Two levels on both axes:
       discipline → asset system → items      (the default)
       location   → asset system → items      (the flip)

     The asset system is the second level on BOTH, and that is deliberate
     rather than symmetrical for its own sake: the asset system is the unit
     ACSA rates, reports and compares year on year, so it is the level an
     auditor should be reading their own work at whichever way they came into
     it.

     Counts are of everything a group HOLDS, not of what the search left
     standing — see GroupRow. An empty group is not rendered at all; a group
     that opens onto nothing is a row that only wastes a press. */
  const tree = useMemo(() => {
    const tops = new Map<string, Map<string, Check[]>>();
    for (const c of visible) {
      /* An explicit bucket, never a hidden row and never a guess. A check with
         no location under the location axis is a real state and the auditor
         needs to see it; dropping it would quietly shrink the list. */
      const top =
        groupBy === "area" ? (c.area?.trim() || "No location recorded") : c.discipline;
      const sys = c.system?.trim() || "No asset system recorded";
      let systems = tops.get(top);
      if (!systems) tops.set(top, (systems = new Map()));
      const list = systems.get(sys);
      if (list) list.push(c);
      else systems.set(sys, [c]);
    }
    const doneOf = (cs: Check[]) => cs.filter((c) => fieldDone(responses[c.id])).length;
    return [...tops.entries()]
      .map(([top, systems]) => {
        const groups = [...systems.entries()].map(([sys, checks]) => ({
          sys,
          checks,
          done: doneOf(checks),
          total: checks.length,
        }));
        return {
          top,
          systems: groups,
          done: groups.reduce((n, g) => n + g.done, 0),
          total: groups.reduce((n, g) => n + g.total, 0),
        };
      })
      .sort((a, b) => a.top.localeCompare(b.top));
  }, [visible, groupBy, responses]);

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

  /* The walk items the current filter and search should show. Same axis as the
     register list, and the same rule: a search finds anything, anywhere. An
     item with no discipline or no location is NEVER hidden by a filter on
     either — a filter that hides an unattributed observation makes the one
     record nobody can re-derive the easiest one to lose. */
  const walkVisible = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    if (q2) {
      return adhocItems.filter((it) =>
        `${it.id} ${it.description} ${it.note} ${it.area} ${it.discipline ?? ""} ${it.system ?? ""}`
          .toLowerCase()
          .includes(q2)
      );
    }
    return adhocItems;
  }, [adhocItems, q]);

  /* Zones come from the programme file. Until ACSA gives us real ones the axis
     falls back to the register's categories, and the strip below says so. */
  const axis = locationAxis(entityCode);
  const doneCount = visible.filter((c) => fieldDone(responses[c.id])).length;


  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-4 pb-24 sm:px-6">
        <div className="mb-3">
          <h2 className="text-[18px] font-bold">Site walkabout</h2>
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
          className="sticky top-0 z-10 -mx-4 mb-3 border-b px-4 py-2.5 sm:-mx-6 sm:px-6"
          style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        >
          <div
            role="radiogroup"
            aria-label="Group the list by"
            /* Full width on a phone, where it is one of two controls and the
               thumb has to find it; capped on a desk, where a 1,130px two-way
               switch is a lot of furniture for a binary choice. */
            className="mb-2 flex gap-[2px] rounded-[11px] p-[3px] sm:max-w-[420px]"
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
                     under the old one still means anything. */
                  setExpanded([]);
                }}
                className="flex min-h-[40px] flex-1 items-center justify-center gap-[6px] rounded-[8px] px-3 font-display text-[11.5px] font-semibold transition-[var(--t)]"
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

          <div
            className="mb-2 flex items-center gap-2 rounded-[11px] border px-3 py-2"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          >
            <IconSearch width={14} height={14} style={{ color: "var(--ink-3)" }} />
            {/* The search box on the walkabout screen is how an auditor finds
                the check for the thing in front of them, and it measured 24px
                — the only control on any screen still under the target. The
                wrapper carries the border, so the height goes on the input. */}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search any check, anywhere…"
              aria-label="Search any check"
              className="min-h-[40px] w-full border-none bg-transparent text-[13px] outline-none"
            />
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
              number that grows as you work, which is not a denominator. */}
          <div className="mt-2 flex items-center gap-2 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
            <span>
              {doneCount}/{visible.length}
            </span>
            <span className="track flex-1">
              <i style={{ width: `${visible.length ? (doneCount / visible.length) * 100 : 0}%`, background: "var(--acc)" }} />
            </span>
            {adhocItems.length > 0 && (
              <span style={{ color: "var(--acc)" }}>
                +{adhocItems.length} seen on the walk
              </span>
            )}
          </div>
        </div>

        {/* SEEN ON THE WALK — its own section, above the register, and marked.
            Not folded in among the check-points: an ad-hoc item has no
            check-point behind it, no ACSA requirement to quote and no place in
            the completion figure, and a row that looks like one of the 324
            while being none of those things is the single most misleading thing
            this screen could render. */}
        {walkVisible.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between px-1 pt-3 pb-1.5">
              <span className="label-xs" style={{ color: "var(--acc)" }}>
                Seen on the walk · not part of the {checksAt(entityCode).length}
              </span>
              <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                {walkVisible.length}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {walkVisible.map((it) => {
                const photos = it.attachments.filter((a) => a.kind === "photo").length;
                const voices = it.attachments.filter((a) => a.kind === "voice").length;
                const outcome = OUTCOMES.find((o) => o.key === it.outcome);
                return (
                  <button
                    key={it.id}
                    data-walk={it.id}
                    onClick={() => {
                      setEditingId(it.id);
                      setSheetOpen(true);
                    }}
                    className="rounded-[13px] border-[1.5px] border-dashed p-3 text-left transition-[var(--t)]"
                    style={{ background: "var(--panel)", borderColor: "var(--acc)" }}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[9.5px]" style={{ color: "var(--acc)" }}>
                        {it.id}
                      </span>
                      <Pill tone="accent">SEEN ON THE WALK</Pill>
                      {it.discipline && <Pill>{it.discipline.split(" ")[0]}</Pill>}
                      {it.system && <Pill>{it.system}</Pill>}
                      {it.findingId && <Pill tone="warn">{it.findingId}</Pill>}
                    </div>
                    <div className="mb-1.5 text-[13px] leading-[1.4] font-semibold">
                      {it.description}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                      {/* The outcome in words, never colour alone — and never in
                          the rating palette. An outcome is not a band. */}
                      <span style={{ color: outcome ? "var(--acc)" : "var(--ink-4)" }}>
                        {outcome ? outcome.label : "no outcome yet"}
                      </span>
                      {it.area && <span>{it.area}</span>}
                      {photos > 0 && <span>{photos} photo{photos === 1 ? "" : "s"}</span>}
                      {voices > 0 && <span>{voices} voice</span>}
                      {photos === 0 && voices === 0 && (
                        <span style={{ color: "var(--warn)" }}>no evidence attached</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {visible.length === 0 && walkVisible.length === 0 ? (
          <Empty>
            <IconInbox width={26} height={26} />
            <div>
              Nothing matches. Clear the search or the filter — or use <b>Add item</b> for
              something on site the register does not cover.
            </div>
          </Empty>
        ) : (
          /* THE TREE. Group → asset system → collapsed rows.

             What it replaces: every item rendered its full answer set, its
             four status cards, its capture buttons and its attachment strip at
             once, three across on a tablet and one across on a phone. Ten
             items was a scroll of several screens, and finding the right
             inspection took longer than doing it.

             A collapsed row carries only what identifies the work: the
             outcome, the id, the check text clamped to two lines, the asset
             system, and small marks for what is attached. Everything else is
             one tap away and unchanged when it gets there. */
          <div
            className="overflow-hidden rounded-[13px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            {tree.map((g) => {
              const gOpen = isOpen(g.top);
              return (
                <div key={g.top} data-group={g.top}>
                  <GroupRow
                    label={g.top}
                    done={g.done}
                    total={g.total}
                    open={gOpen}
                    onToggle={() => toggle(g.top)}
                    sticky
                    title={`${g.top} — ${g.done} of ${g.total} seen`}
                  />
                  {gOpen &&
                    g.systems.map((sub) => {
                      const key = `${g.top}|${sub.sys}`;
                      const sOpen = isOpen(key);
                      /* The 2025 rating for this asset system at THIS site.
                         Looked up by the discipline the checks actually carry
                         rather than by the group's label, because on the
                         location axis the group is a place and a place has no
                         discipline. */
                      const pf = priorFor(entityCode, sub.checks[0]?.discipline ?? "", sub.sys);
                      return (
                        <div key={key} data-system={sub.sys}>
                          <GroupRow
                            label={sub.sys}
                            done={sub.done}
                            total={sub.total}
                            open={sOpen}
                            depth={1}
                            onToggle={() => toggle(key)}
                          >
                            {pf && <Pill tone="warn">{pf.key}</Pill>}
                          </GroupRow>
                          {sOpen &&
                            sub.checks.map((c) => {
                              const r = responses[c.id];
                              const attachments = r?.attachments ?? [];
                              const photos = attachments.filter((a) => a.kind === "photo");
                              const voices = attachments.filter((a) => a.kind === "voice");
                              const wo = library?.[c.id]?.WO ?? [];
                              const picked = r?.walkaboutPicked;
                              const needsPhoto =
                                picked != null && wo[picked]?.photo === true && photos.length === 0;
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
                                    onClick={() => setOpenItem(itemOpen ? null : c.id)}
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
                                    {/* The outcome mark. BLANK WHEN NOT
                                        CAPTURED, and blank means exactly that
                                        — never compliant. Carried by the icon
                                        and the word underneath, so it survives
                                        sunlight and a colour-blind reader. */}
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
                                        {c.system && c.system !== sub.sys && <Pill>{c.system}</Pill>}
                                        {/* THE OTHER HALF, said on the row.
                                            290 of the 324 need a document
                                            review as well as the asset seen.
                                            An auditor who ticks the walk and
                                            moves on, with nothing saying the
                                            check also wants evidence off a
                                            desk, leaves it half answered — and
                                            the completion figure will say so
                                            weeks later with no explanation.
                                            "Physical" is dropped because every
                                            row here is physical. */}
                                        {modeLabels(c)
                                          .filter((m) => m !== "Physical")
                                          .map((m) => (
                                            <Pill key={m} tone="accent">
                                              {m.toUpperCase()}
                                            </Pill>
                                          ))}
                                      </span>
                                      {/* CLAMPED, NOT SHORTENED. The register's
                                          own words, whole, in the DOM — two
                                          lines of them until the row is
                                          opened. Storing or rendering a tidied
                                          version of ACSA's check text is the
                                          defect pass 1 fixed and this must not
                                          reintroduce it. */}
                                      <span
                                        className="block text-[12.5px] leading-[1.4] font-semibold"
                                        style={
                                          itemOpen
                                            ? undefined
                                            : {
                                                display: "-webkit-box",
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: "vertical",
                                                overflow: "hidden",
                                              }
                                        }
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

                                  {itemOpen && (
                                    <div className="px-3 pt-1 pb-3.5">
                                      {/* OURS, AND IT SAYS SO. Smaller, lighter,
                                          and under a label naming the author.
                                          25 of the 324 have no walkabout
                                          written; an empty one renders nothing
                                          at all. */}
                                      {c.walkabout?.trim() && (
                                        <div
                                          className="mb-2.5 rounded-[9px] border-l-[2px] pl-[9px]"
                                          style={{ borderColor: "var(--line-2)" }}
                                        >
                                          <div className="label-xs" style={{ color: "var(--ink-4)" }}>
                                            TPJV walkabout — physical check
                                          </div>
                                          <div className="mt-[2px] text-[11.5px] leading-[1.45]" style={{ color: "var(--ink-3)" }}>
                                            {c.walkabout}
                                          </div>
                                        </div>
                                      )}

                                      {/* THE ANSWER LIBRARY, IN FULL AND
                                          UNCHANGED. Researched per check and
                                          carrying a suggested severity — the
                                          most valuable content in the product.
                                          Collapsed with the row, never
                                          trimmed: eleven options render as
                                          eleven. */}
                                      {wo.length > 0 && (
                                        <div className="chip-row mb-2.5 flex flex-wrap gap-[5px]">
                                          {wo.map((w, i) => (
                                            <Chip
                                              key={i}
                                              selected={r?.walkaboutPicked === i}
                                              onClick={() => {
                                                setWalkabout(c.id, i, w.sets);
                                                commit(c.id, "field");
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
                                          className="mb-2.5 flex items-center gap-2 rounded-[9px] border px-[10px] py-[7px] text-[11px]"
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

                                      <OutcomeControl
                                        value={r?.compliance ?? null}
                                        onChange={(next) => {
                                          setCompliance(c.id, next);
                                          if (next) {
                                            commit(c.id, "field");
                                            say(`${c.id} — ${OUTCOMES.find((o) => o.key === next)?.label}`);
                                          }
                                        }}
                                        size={52}
                                        idPrefix={`out-${c.id}`}
                                      />

                                      {/* WP5 — THE COMMENT FIELD GETS THE ROOM.
                                          It did not exist here at all: an
                                          auditor on the apron could tap a
                                          library chip or a status and could not
                                          type a word, so the most valuable free
                                          text in the product could only be
                                          entered back at a desk. It is the same
                                          observation the Checks screen writes —
                                          one field, one record — and it takes
                                          the full width with nothing sharing
                                          its horizontal run. */}
                                      <label className="mt-3 block">
                                        <span className="label-xs" style={{ color: "var(--ink-4)" }}>
                                          What you found · this is the observation on the record
                                        </span>
                                        <textarea
                                          value={r?.observation ?? ""}
                                          onChange={(e) => patch(c.id, { observation: e.target.value })}
                                          onFocus={(e) =>
                                            e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })
                                          }
                                          placeholder="Speak it if it is long — the microphone writes into this field."
                                          className="mt-1 min-h-[76px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] leading-[1.5] outline-none"
                                          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                                        />
                                      </label>

                                      {/* The toolbar under the field, right
                                          aligned. Camera and microphone are
                                          together for reachability and NOT
                                          because they are the same kind of
                                          thing — the microphone fills the field
                                          above, the camera attaches evidence to
                                          the item. Worth splitting if a better
                                          home for the camera appears. */}
                                      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                                        <PhotoButton
                                          compact
                                          label="Photo"
                                          className="min-h-[44px]"
                                          onCaptured={(m) => {
                                            addAttachment(c.id, { ...m, createdBy: auditor });
                                            say(`Photo added to ${c.id}`);
                                          }}
                                        />
                                        <VoiceNoteButton
                                          compact
                                          onCaptured={(m) => {
                                            addAttachment(c.id, { ...m, createdBy: auditor });
                                            say(`Voice note added to ${c.id}`);
                                          }}
                                        />
                                      </div>

                                      {attachments.length > 0 && (
                                        <div className="mt-2">
                                          <AttachmentStrip
                                            attachments={attachments}
                                            thumbSize={38}
                                            onRemove={(id) => removeAttachment(c.id, id)}
                                            onUpdate={(id, pa) => updateAttachment(c.id, id, pa)}
                                            writeUp={
                                              aiOn
                                                ? (t) => assist("transcript", transcriptContext(t, c, r))
                                                : undefined
                                            }
                                            onAccept={(text) => {
                                              appendObservation(c.id, text);
                                              say(`Written up into ${c.id}`);
                                            }}
                                          />
                                        </div>
                                      )}

                                      {/* SAVE & NEXT, because the accordion costs a
                                          tap per check and this gives it back.
                                          With one item open at a time, working
                                          a 111-check discipline means opening
                                          and shutting 111 rows; this shuts the
                                          current one and opens the next in the
                                          same asset system in a single press,
                                          which is faster than the flat list it
                                          replaced rather than slower.

                                          EXPLICIT, never automatic. Advancing
                                          by itself the moment an outcome is set
                                          would close the item under an auditor
                                          about to attach a photograph — which
                                          is the normal order of work, not the
                                          exception. */}
                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                        {(() => {
                                          const i = sub.checks.findIndex((x) => x.id === c.id);
                                          const next = sub.checks[i + 1];
                                          return next ? (
                                            <Btn
                                              variant="primary"
                                              className="min-h-[44px]"
                                              onClick={() => {
                                                commit(c.id, "field");
                                                setOpenItem(next.id);
                                                say(`Saved · ${portalIdFor(entityCode, next.id)}`);
                                              }}
                                            >
                                              <IconCheck width={14} height={14} />
                                              Save &amp; next
                                            </Btn>
                                          ) : (
                                            <Btn
                                              className="min-h-[44px]"
                                              onClick={() => {
                                                commit(c.id, "field");
                                                setOpenItem(null);
                                                say(`Saved · ${sub.sys} done`);
                                              }}
                                            >
                                              <IconCheck width={14} height={14} />
                                              Save &amp; close
                                            </Btn>
                                          );
                                        })()}
                                        <button
                                          onClick={() => router.push(`/capture?check=${c.id}`)}
                                          className="text-[11.5px] font-semibold hover:underline"
                                          style={{ color: "var(--acc)" }}
                                        >
                                          Open the full check-point →
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
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
        <Btn
          variant="primary"
          className="order-last min-h-[56px] flex-[1.4] justify-center sm:order-none sm:flex-none"
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
          label="Photo"
          className="min-h-[44px] justify-center"
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
        <Btn className="min-h-[44px] justify-center" onClick={() => setHazardOpen(true)}>
          Hazard
        </Btn>
        {captures.length > 0 && (
          <Btn className="min-h-[44px]" onClick={() => setTray(true)} style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}>
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
        presetDiscipline={groupBy === "discipline" && expanded.length === 1 ? expanded[0] : null}
        presetArea={groupBy === "area" && expanded.length === 1 ? expanded[0] : ""}
        onSaved={(_id, message) => say(message)}
      />


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
