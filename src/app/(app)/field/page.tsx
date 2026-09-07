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
  useResponses,
  useStore,
  useVisitId,
  fieldDone,
} from "@/lib/store";
import { locationAxis } from "@/lib/programme";
import { portalIdFor } from "@/lib/sites";
import type { Check, Compliance } from "@/lib/types";
import { Btn, Chip, Empty, Pill } from "@/components/ui/primitives";
import { AttachmentStrip, PhotoButton, PhotoThumb, VoiceNoteButton } from "@/components/Capture";
import { useAnswerLibrary } from "@/lib/answers";
import { assist, transcriptContext, useAssistAvailable } from "@/lib/assist";
import { modeLabels, needsField } from "@/lib/verification";
import {
  IconCamera,
  IconCheck,
  IconClock,
  IconDash,
  IconInbox,
  IconPin,
  IconSearch,
  IconX,
} from "@/components/ui/icons";

const STATUSES: { key: Compliance; Icon: typeof IconCheck; tone: string; label: string }[] = [
  { key: "C", Icon: IconCheck, tone: "good", label: "Pass" },
  { key: "NC", Icon: IconX, tone: "bad", label: "Fail" },
  { key: "N/A", Icon: IconDash, tone: "neu", label: "N/A" },
  { key: "NV", Icon: IconClock, tone: "warn", label: "Later" },
];

const btnStyle = (tone: string, on: boolean): React.CSSProperties =>
  on
    ? { background: `var(--${tone})`, borderColor: `var(--${tone})`, color: "#fff" }
    : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" };

export default function FieldPage() {
  const router = useRouter();
  const responses = useResponses();
  const captures = useCaptures();
  const visitId = useVisitId();
  /* The researched walkabout options. Field mode is the walkabout screen and
     was the one place that never showed them — an auditor on the apron got
     four status buttons while 11,179 reviewed options sat in the library that
     only the desk screen opened. Loaded once for the session and kept in
     memory, so it survives the wifi dropping. */
  const library = useAnswerLibrary();
  const entity = useEntity();
  const entityCode = useEntityCode();
  const auditor = useStore((s) => s.auditor);
  const setCompliance = useStore((s) => s.setCompliance);
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
  const addFinding = useStore((s) => s.addFinding);
  const addHazard = useStore((s) => s.addHazard);

  const [area, setArea] = useState<string>("All");
  const [q, setQ] = useState("");
  const [groupBy, setGroupBy] = useState<"area" | "discipline">("area");
  const [tray, setTray] = useState(false);
  const [adhoc, setAdhoc] = useState(false);
  /* A hazard seen on the walk. It is not a finding first and it never becomes
     one: nobody wrote up a check-point about it, and consolidating findings
     afterwards cannot invent it. See the modal below. */
  const [hazardOpen, setHazardOpen] = useState(false);
  const [hazEvent, setHazEvent] = useState("");
  const [hazWhy, setHazWhy] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [adhocText, setAdhocText] = useState("");
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

  /* Field work is location-first: everything checkable where you are standing,
     across every discipline. Search overrides the filter entirely. */
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    /* Routed on the register's declared vtype, not on whether someone wrote
       walkabout text. Both give 314 today; only one of them keeps giving 314
       if a walkabout line is ever left blank. See src/lib/verification.ts. */
    let list = checksAt(entityCode).filter(needsField);
    if (s) {
      return list.filter((c) =>
        `${portalIdFor(entityCode, c.id)} ${c.requirement} ${c.area} ${c.discipline} ${c.walkabout ?? ""}`
          .toLowerCase()
          .includes(s)
      );
    }
    if (area !== "All") {
      list = groupBy === "area" ? list.filter((c) => c.area === area) : list.filter((c) => c.discipline === area);
    }
    return list;
  }, [entityCode, q, area, groupBy]);

  const groups = useMemo(() => {
    const g: Record<string, Check[]> = {};
    visible.forEach((c) => {
      const key = groupBy === "area" ? c.area : c.discipline;
      (g[key] ??= []).push(c);
    });
    return g;
  }, [visible, groupBy]);

  /* Zones come from the programme file. Until ACSA gives us real ones the axis
     falls back to the register's categories, and the strip below says so. */
  const axis = locationAxis(entityCode);
  const options = groupBy === "area" ? axis.options : disciplines;
  const doneCount = visible.filter((c) => fieldDone(responses[c.id])).length;


  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-4 pb-24 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold">Site walkabout</h2>
            {/* Prose that orients somebody the first time and costs them a
                scroll every time after. On a 664px phone the preamble, the
                toggle, the search box and the category note filled the whole
                first screen and the first check-point sat below the fold — on
                the screen whose entire job is the check-points. Kept from sm
                upward, where the room exists. */}
            <p className="mt-1 hidden max-w-[78ch] text-[12.5px] sm:block" style={{ color: "var(--ink-2)" }}>
              Nothing here assumes an order. Filter by where you are standing, search anything, or
              capture first and assign it later.
            </p>
          </div>
          <div className="flex gap-[2px] rounded-[11px] p-[3px]" style={{ background: "var(--sunken)" }}>
            {(["area", "discipline"] as const).map((g) => (
              <button
                key={g}
                onClick={() => {
                  setGroupBy(g);
                  setArea("All");
                }}
                className="flex items-center gap-[6px] rounded-[8px] px-3 py-[6px] font-display text-[11.5px] font-semibold transition-[var(--t)]"
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
        </div>

        <div
          className="sticky top-0 z-10 -mx-4 mb-3 border-b px-4 py-2.5 sm:-mx-6 sm:px-6"
          style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        >
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
          <div className="no-scrollbar flex gap-[6px] overflow-x-auto pb-[2px]">
            {["All", ...options].map((o) => (
              <button
                key={o}
                onClick={() => setArea(o)}
                className="whitespace-nowrap rounded-full border px-[11px] py-[5px] text-[11px] font-medium transition-[var(--t)]"
                style={
                  area === o
                    ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                    : { background: "var(--panel)", borderColor: "var(--line)", color: "var(--ink-2)" }
                }
              >
                {o === "All"
                  ? `All ${groupBy === "area" ? (axis.kind === "zone" ? "zones" : "categories") : "disciplines"}`
                  : o}
              </button>
            ))}
          </div>
          {axis.kind === "area" && (
            <div
              className="mt-[7px] hidden text-[10.5px] leading-[1.5] sm:block"
              style={{ color: "var(--ink-3)" }}
            >
              These are the register&rsquo;s categories, not physical zones — {entity.short} zone
              names have not been supplied yet. Search finds any check wherever you
              are standing.
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
            <span>
              {doneCount}/{visible.length}
            </span>
            <span className="track flex-1">
              <i style={{ width: `${visible.length ? (doneCount / visible.length) * 100 : 0}%`, background: "var(--acc)" }} />
            </span>
          </div>
        </div>

        {visible.length === 0 ? (
          <Empty>
            <IconInbox width={26} height={26} />
            <div>
              Nothing here yet. Use <b>Capture now</b> — assign it to a check later.
            </div>
          </Empty>
        ) : (
          Object.entries(groups).map(([g, items]) => (
            <div key={g}>
              <div className="flex items-center justify-between px-1 pt-3 pb-1.5">
                <span className="label-xs">{g}</span>
                <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  {items.filter((c) => fieldDone(responses[c.id])).length}/{items.length}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => {
                  const r = responses[c.id];
                  const attachments = r?.attachments ?? [];
                  const photos = attachments.filter((a) => a.kind === "photo");
                  const wo = library?.[c.id]?.WO ?? [];
                  const picked = r?.walkaboutPicked;
                  const needsPhoto =
                    picked != null && wo[picked]?.photo === true && photos.length === 0;
                  return (
                    <div
                      key={c.id}
                      className="rounded-[13px] border p-3 transition-[var(--t)]"
                      style={{
                        background: "var(--panel)",
                        borderColor: fieldDone(r) ? "var(--line)" : "var(--line-2)",
                        opacity: fieldDone(r) ? 0.78 : 1,
                      }}
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                          {portalIdFor(entityCode, c.id)}
                        </span>
                        <Pill>{groupBy === "area" ? c.discipline.split(" ")[0] : c.area}</Pill>
                        {(() => {
                          /* The 2025 rating for THIS site's asset system. It used
                             to be a column on the register row, which meant every
                             site wore King Shaka's finding. */
                          const pf = priorFor(entityCode, c.discipline, c.system);
                          return pf ? <Pill tone="warn">{pf.key}</Pill> : null;
                        })()}
                        {modeLabels(c)
                          .filter((m) => m !== "Physical")
                          .map((m) => (
                            <Pill key={m} tone="accent">
                              {m.toUpperCase()}
                            </Pill>
                          ))}
                      </div>
                      <button
                        onClick={() => router.push(`/capture?check=${c.id}`)}
                        className="mb-2.5 block text-left text-[12px] leading-[1.42] hover:underline"
                      >
                        {c.walkabout ?? c.requirement}
                      </button>
                      {/* What the eye settles on, in the words the library
                          researched — tapped instead of typed, because typing
                          on an apron is what stops people capturing. Above the
                          four statuses, since picking one usually sets the
                          status anyway. */}
                      {wo.length > 0 && (
                        <div className="chip-row mb-2 flex flex-wrap gap-[5px]">
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

                      {/* The library marks which observations are only worth
                          having with an image behind them. That flag was
                          carried in the data and rendered nowhere but a desk
                          tooltip. Saying it here, while the auditor is still
                          standing in front of the thing, is the whole point. */}
                      {needsPhoto && (
                        <div
                          className="mb-2 flex items-center gap-2 rounded-[9px] border px-[10px] py-[7px] text-[11px]"
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

                      <div className="grid grid-cols-4 gap-[5px]">
                        {STATUSES.map(({ key, Icon, tone, label }) => (
                          <button
                            key={key}
                            onClick={() => {
                              setCompliance(c.id, key);
                              commit(c.id, "field");
                              say(`${c.id} — ${label}`);
                            }}
                            aria-label={label}
                            className="flex min-h-[44px] flex-col items-center justify-center gap-[3px] rounded-[9px] border-[1.5px] py-2 font-display text-[9.5px] font-semibold transition-[var(--t)]"
                            style={btnStyle(tone, r?.compliance === key)}
                          >
                            <Icon width={15} height={15} />
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <PhotoButton
                          compact
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
                        <div className="min-w-0 flex-1">
                          <AttachmentStrip
                            attachments={attachments}
                            thumbSize={34}
                            onRemove={(id) => removeAttachment(c.id, id)}
                            onUpdate={(id, p) => updateAttachment(c.id, id, p)}
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* capture-first action bar */}
      <div
        className="sticky bottom-0 z-20 flex items-center gap-2 border-t px-4 py-2.5 sm:px-6"
        style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "0 -4px 16px -8px rgba(22,16,40,.14)" }}
      >
        <PhotoButton
          primary
          label="Capture now"
          className="flex-1 justify-center sm:flex-none"
          onCaptured={(m) => {
            addCapture({
              ...m,
              area: area === "All" ? "Unspecified" : area,
              createdBy: auditor,
            });
            say("Captured — assign it whenever you like");
          }}
        />
        <Btn className="flex-1 justify-center sm:flex-none" onClick={() => setAdhoc(true)}>
          + New finding
        </Btn>
        {/* The walk is where hazards are actually spotted. Until this existed
            the only route to the register was consolidating findings, which
            cannot produce a hazard nobody wrote a finding about. */}
        <Btn className="flex-1 justify-center sm:flex-none" onClick={() => setHazardOpen(true)}>
          + New hazard
        </Btn>
        {captures.length > 0 && (
          <Btn onClick={() => setTray(true)} style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}>
            {captures.length} unassigned
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
              Taken in the field before deciding where they belong. Assign each to a check, or turn it into a new finding.
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

      {/* ad-hoc finding */}
      {adhoc && (
        <div className="fixed inset-0 z-[80] flex justify-center pt-[10vh]" style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }} onClick={() => setAdhoc(false)}>
          <div
            className="w-[min(560px,92vw)] rounded-[20px] border p-[22px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-bold">New finding</h3>
            <p className="mt-1 mb-3.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
              For something you spot that is not on the 374-point register. It joins the findings register like any other.
            </p>
            <textarea
              value={adhocText}
              onChange={(e) => setAdhocText(e.target.value)}
              placeholder="Describe what you saw…"
              className="min-h-[80px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label-xs">Discipline</span>
                <select value={adhocDisc} onChange={(e) => setAdhocDisc(e.target.value)} className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[12px]" style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}>
                  {disciplines.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label-xs">Location</span>
                <select value={adhocArea} onChange={(e) => setAdhocArea(e.target.value)} className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[12px]" style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}>
                  {areas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setAdhoc(false)}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                onClick={() => {
                  if (!adhocText.trim()) {
                    say("Add a description first");
                    return;
                  }
                  addFinding({
                    checkId: null,
                    discipline: adhocDisc,
                    system: "Ad-hoc",
                    area: adhocArea,
                    title: "Ad-hoc finding",
                    description: adhocText.trim(),
                    issueIndex: null,
                    severity: null,
                    likelihood: null,
                    ratingConfirmed: false,
                    rootCause: "",
                    action: "",
                    owner: "",
                    dueDate: "",
                    actionStatus: "Open",
                    originVisit: visitId,
                    priorRating: null,
                    suggestedEvent: "",
                    progress: [],
                    adHoc: true,
                    createdBy: auditor,
                  });
                  setAdhocText("");
                  setAdhoc(false);
                  say("Finding created");
                }}
              >
                <IconCheck width={14} height={14} />
                Create finding
              </Btn>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-[70px] left-1/2 z-[100] -translate-x-1/2 rounded-[11px] px-[15px] py-2.5 text-[12px] font-medium"
          style={{ background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--e3)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
