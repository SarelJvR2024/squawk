"use client";

/** The hazard register.
 *
 *  A findings register answers "what did we see?". This answers "what could
 *  happen?", and they are not the same list. Three findings — no gas
 *  suppression in a substation, a fire-detection gap in the same room, a
 *  maintenance record nobody signed for the panel in it — are one hazard with
 *  three findings behind it, and rating them separately produces three
 *  medium-band paperwork risks where there is one red one.
 *
 *  So consolidation is the point of this screen, and the assistant is genuinely
 *  useful at it: different disciplines write the same physical defect up in
 *  their own language, and the photographs are what settle whether two
 *  write-ups are the same thing. Every proposal here shows the photographs
 *  behind it for exactly that reason — a reviewer can see at a glance whether
 *  the grouping is real.
 *
 *  Nothing the assistant returns is applied. A proposal becomes a hazard when
 *  somebody taps Accept, and its rating stays unagreed until somebody taps a
 *  cell on the matrix. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checksAt,
  disciplinesAt,
  useEntityCode,
  useResponses,
  useStore,
  useVisitFindings,
  useVisitHazards,
} from "@/lib/store";
import {
  assist,
  consolidateContext,
  findingContext,
  parseGroups,
  parseReassessment,
  reassessContext,
  useAssistAvailable,
  useVisionOn,
  type AssistImage,
  type HazardProposal,
  type Reassessment,
} from "@/lib/assist";
import { BAND_META, bandFor, cellCode } from "@/lib/risk";
import { getBlob } from "@/lib/media";
import { Btn, Dot, Empty, Panel, Pill } from "@/components/ui/primitives";
import RecordActions from "@/components/RecordActions";
import StickyActions from "@/components/StickyActions";
import RootCauseAdvice from "@/components/RootCauseAdvice";
import { IconCheck, IconInbox, IconLeft, IconSpark, IconX } from "@/components/ui/icons";
import type { Attachment, Hazard } from "@/lib/types";

/** Vision sends at most eight images per request and the route refuses a ninth
 *  rather than dropping it silently. Consolidation would happily send forty, so
 *  it is capped here too — and the screen says which photographs went. */
const IMAGE_CAP = 8;

/** Who raised it, in words a reader of the register will understand. `acsa`
 *  earns its own label and its own colour: the closing session is where ACSA
 *  add what the check-list missed, and reporting those as theirs is part of
 *  showing the audit listened. */
const ORIGIN_LABEL: Record<Hazard["origin"], string> = {
  consolidated: "CONSOLIDATED",
  field: "SEEN ON THE WALK",
  acsa: "RAISED BY ACSA",
  tpjv: "RAISED BY TPJV",
};

type Filter = "all" | "unrated" | "open";

export default function HazardsPage() {
  const router = useRouter();
  const hazards = useVisitHazards();
  const findings = useVisitFindings();
  const responses = useResponses();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const addHazard = useStore((s) => s.addHazard);
  const updateHazard = useStore((s) => s.updateHazard);
  const removeHazard = useStore((s) => s.removeHazard);

  const aiOn = useAssistAvailable();
  const vision = useVisionOn();

  const [filter, setFilter] = useState<Filter>("all");
  const [discipline, setDiscipline] = useState<string>("All");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [proposals, setProposals] = useState<HazardProposal[] | null>(null);
  const [grouping, setGrouping] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [reread, setReread] = useState<{ id: string; result: Reassessment } | null>(null);
  const [rereading, setRereading] = useState(false);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  /* Photographs behind a set of findings, de-duplicated. A photograph lives on
     the CHECK, so two findings raised at one check share it and it must not be
     counted or sent twice. */
  const photosOf = useMemo(() => {
    return (ids: string[]): Attachment[] => {
      const seen = new Set<string>();
      const out: Attachment[] = [];
      for (const id of ids) {
        const f = findings.find((x) => x.id === id);
        if (!f?.checkId) continue;
        for (const a of responses[f.checkId]?.attachments ?? []) {
          if (a.kind !== "photo" || !a.blobKey || a.unavailable || seen.has(a.id)) continue;
          seen.add(a.id);
          out.push(a);
        }
      }
      return out;
    };
  }, [findings, responses]);

  /* A finding belongs to at most one hazard — parseGroups enforces it on the
     way in, and this is what the screen counts with. */
  const consolidated = useMemo(
    () => new Set(hazards.flatMap((h) => h.findingIds)),
    [hazards]
  );
  const loose = useMemo(
    () => findings.filter((f) => !consolidated.has(f.id)),
    [findings, consolidated]
  );

  const list = useMemo(() => {
    let l = hazards;
    if (discipline !== "All") l = l.filter((h) => h.disciplines.includes(discipline));
    if (filter === "unrated") l = l.filter((h) => !h.ratingConfirmed);
    if (filter === "open") l = l.filter((h) => h.actionStatus !== "Closed");
    return l;
  }, [hazards, filter, discipline]);

  const active: Hazard | undefined = list.find((h) => h.id === activeId) ?? list[0];

  const rated = hazards.filter((h) => h.ratingConfirmed).length;
  const red = hazards.filter(
    (h) => h.ratingConfirmed && bandFor(h.severity, h.likelihood) === "Red"
  ).length;

  /** The blank a new hazard starts from. Every rating field is null and
   *  unconfirmed: a hazard arrives on this register unrated, always. */
  function blank(over: Partial<Hazard>): Omit<Hazard, "id" | "createdAt" | "entity"> {
    return {
      originVisit: visitId,
      event: "",
      description: "",
      why: "",
      findingIds: [],
      disciplines: [],
      systems: [],
      severity: null,
      likelihood: null,
      ratingConfirmed: false,
      ermConsequence: null,
      ermLikelihood: null,
      ermConfirmed: false,
      ermLikelihoodAssumed: false,
      origin: "tpjv",
      note: "",
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
      ...over,
    };
  }

  async function consolidate() {
    setGrouping(true);
    setGroupError(null);
    try {
      const scope = loose;
      if (!scope.length) throw new Error("Every finding is already in a hazard.");
      const items = scope.map((f) => ({
        finding: f,
        check: f.checkId ? checksAt(entityCode).find((c) => c.id === f.checkId) : undefined,
        captions: (f.checkId ? (responses[f.checkId]?.attachments ?? []) : [])
          .filter((a) => a.kind === "photo")
          .map((a) => a.caption?.trim())
          .filter(Boolean) as string[],
      }));

      /* Each image is labelled with the finding it belongs to. Unlabelled,
         eight photographs are eight pictures of an airport and the model
         cannot say WHICH two findings its photographs showed to be one thing —
         and an ungrounded grouping is worse than none. */
      let images: AssistImage[] = [];
      if (vision) {
        const wanted: { ref: string; findingId: string; blobKey: string }[] = [];
        for (const f of scope) {
          for (const a of photosOf([f.id])) {
            if (wanted.length >= IMAGE_CAP) break;
            wanted.push({ ref: a.ref ?? a.name, findingId: f.id, blobKey: a.blobKey! });
          }
        }
        images = (
          await Promise.all(
            wanted.map(async (w) => {
              const blob = await getBlob(w.blobKey);
              return blob
                ? { blob, label: `Photograph ${w.ref} — attached to finding ${w.findingId}` }
                : null;
            })
          )
        ).filter(Boolean) as AssistImage[];
      }

      const parsed = parseGroups(
        await assist("consolidate", consolidateContext(items), images),
        scope.map((f) => f.id)
      );
      if (!parsed.length) throw new Error("No usable grouping came back.");
      setProposals(parsed);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "The assistant is unavailable.");
    } finally {
      setGrouping(false);
    }
  }

  function accept(p: HazardProposal) {
    const ids = p.findingIds ?? [];
    /* EVERY discipline and system the group touches, not the first one's.
       Two write-ups of the same fuse in two disciplines is the case this
       screen exists for; recording one of them undoes the consolidation. */
    const behind = findings.filter((f) => ids.includes(f.id));
    const id = addHazard(
      blank({
        event: p.event,
        description: p.description,
        why: p.why,
        findingIds: ids,
        disciplines: [...new Set(behind.map((f) => f.discipline).filter(Boolean))],
        systems: [...new Set(behind.map((f) => f.system).filter(Boolean))],
        origin: "consolidated",
        note: p.note ?? "",
      })
    );
    setProposals((ps) => (ps ?? []).filter((x) => x !== p));
    setActiveId(id);
    say(`${id} raised · rate it on the matrix`);
  }

  async function rereadNow(h: Hazard) {
    setRereading(true);
    try {
      const photos = photosOf(h.findingIds);
      const behind = findings.filter((f) => h.findingIds.includes(f.id));
      let images: AssistImage[] = [];
      if (vision) {
        images = (
          await Promise.all(
            photos.slice(0, IMAGE_CAP).map(async (a) => {
              const blob = await getBlob(a.blobKey!);
              return blob ? { blob, label: `Photograph ${a.ref ?? a.name}` } : null;
            })
          )
        ).filter(Boolean) as AssistImage[];
      }
      const parsed = parseReassessment(
        await assist(
          "reassess",
          reassessContext(
            {
              ...h,
              discipline: h.disciplines.join(", "),
              system: h.systems.join(", "),
            },
            behind,
            photos.map((a) => a.caption?.trim()).filter(Boolean) as string[]
          ),
          images
        )
      );
      if (!parsed) throw new Error("Nothing usable came back from the re-read.");
      setReread({ id: h.id, result: parsed });
    } catch (e) {
      say(e instanceof Error ? e.message : "The assistant is unavailable");
    } finally {
      setRereading(false);
    }
  }

  /* An empty register offers BOTH ways in.
   *
   *  It used to offer only "Go to capture", which made consolidation look like
   *  the sole route to a hazard — and with no findings yet there was no way to
   *  record one at all. That is wrong twice over. Most hazards are consolidated
   *  from findings, but a hazard spotted on the walk, or one ACSA raises in the
   *  closing session, is not a finding first and never becomes one. The type
   *  has always allowed a hazard with no findings behind it; the screen did
   *  not. */
  if (!hazards.length && !findings.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Empty>
          <IconInbox width={28} height={28} />
          <div className="max-w-[52ch]">
            <b className="mb-1 block font-display text-[14px]" style={{ color: "var(--ink)" }}>
              No hazards yet
            </b>
            A hazard is the <b>event</b> a failed control was protecting against — &ldquo;uncontained
            fuel release on the apron&rdquo;, not &ldquo;register not signed&rdquo;. It is what
            carries the rating, because a finding closes and a hazard does not.
            <br />
            <br />
            Most are built by consolidating findings once they exist. One you see on the walk, or
            one ACSA raises in the closing session, is recorded here directly.
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Btn
              variant="primary"
              onClick={() => {
                const id = addHazard(blank({ origin: "tpjv" }));
                setActiveId(id);
                say(`${id} raised · name the event, then rate it`);
              }}
            >
              Raise a hazard now
            </Btn>
            <Btn onClick={() => router.push("/capture")}>Go to capture</Btn>
            <Btn onClick={() => router.push("/field")}>Go to the walk</Btn>
          </div>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 pb-16">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold">Hazard register</h2>
            <p className="mt-1 max-w-[78ch] text-[12.5px]" style={{ color: "var(--ink-2)" }}>
              What the findings expose, rated as events on ACSA&apos;s B170 001M matrix. A missing
              record is a finding; what the record was protecting against is the hazard, and that is
              the thing worth a severity.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              className="rounded-[9px] border px-2.5 py-[7px] text-[12px]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            >
              <option>All</option>
              {disciplinesAt(entityCode).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <div
              className="flex gap-[2px] rounded-[11px] p-[3px]"
              style={{ background: "var(--sunken)" }}
            >
              {(["all", "unrated", "open"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="rounded-[8px] px-3 py-[6px] font-display text-[11.5px] font-semibold capitalize transition-[var(--t)]"
                  style={{
                    background: filter === f ? "var(--panel)" : "transparent",
                    color: filter === f ? "var(--acc)" : "var(--ink-2)",
                    boxShadow: filter === f ? "var(--e1)" : "none",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-[9px] md:grid-cols-4">
          {[
            ["Hazards", hazards.length, "bad"],
            ["Rated", `${rated}/${hazards.length}`, "acc"],
            ["Red band", red, red ? "bad" : "good"],
            ["Findings not yet grouped", loose.length, loose.length ? "warn" : "good"],
          ].map(([label, value, tone]) => (
            <div
              key={label as string}
              className="relative overflow-hidden rounded-[15px] border px-[15px] py-[13px]"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <span
                className="absolute inset-x-0 top-0 h-[2.5px]"
                style={{ background: `var(--${tone})` }}
              />
              <b
                className="block font-mono text-[23px] leading-[1.15] font-semibold tnum"
                style={{ color: `var(--${tone})` }}
              >
                {value as string}
              </b>
              <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                {label as string}
              </span>
            </div>
          ))}
        </div>

        {/* ------------------------------------------------ consolidation */}
        <div
          className="mb-3.5 rounded-[15px] border px-[15px] py-[13px]"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <b className="font-display text-[12.5px] font-semibold">Consolidate the findings</b>
            <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
              {loose.length
                ? `${loose.length} finding${loose.length === 1 ? "" : "s"} not yet in a hazard.`
                : "Every finding is already in a hazard."}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Btn
                onClick={() =>
                  setActiveId(
                    addHazard(blank({ origin: "tpjv", event: "", createdBy: auditor }))
                  )
                }
              >
                Raise one directly
              </Btn>
              {aiOn && (
                <Btn variant="primary" disabled={grouping || !loose.length} onClick={consolidate}>
                  <IconSpark width={13} height={13} />
                  {grouping ? "Grouping…" : "Propose hazards"}
                </Btn>
              )}
            </div>
          </div>

          {aiOn && loose.length > 0 && (
            <div className="mt-2 text-[10px]" style={{ color: "var(--ink-4)" }}>
              {vision
                ? `Photographs are sent to the assistant for this step — at most ${IMAGE_CAP}, each labelled with the finding it belongs to.`
                : "Photograph captions are sent; the images themselves are not. Turn on ASSIST_VISION to let the assistant read the photographs."}
            </div>
          )}

          {groupError && (
            <div className="mt-2 text-[11px]" style={{ color: "var(--bad)" }}>
              {groupError}
            </div>
          )}

          {proposals?.length === 0 && (
            <div className="mt-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
              All proposals dealt with.
            </div>
          )}

          {proposals?.map((p, i) => {
            const ids = p.findingIds ?? [];
            const photos = photosOf(ids);
            return (
              <div
                key={`${p.event}-${i}`}
                className="mt-2.5 rounded-[11px] border px-[11px] py-[10px]"
                style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {p.event ? (
                    <b className="text-[12.5px]">{p.event}</b>
                  ) : (
                    /* A finding the model did not place. It comes back rather
                       than vanishing — consolidation may be wrong about how
                       things group, it may not make a finding disappear. */
                    <b className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      Not grouped · {ids.join(", ")}
                    </b>
                  )}
                  <span
                    className="font-mono text-[9px] tracking-[.04em] uppercase"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {p.event ? `${p.confidence} confidence · ` : ""}
                    {ids.length} finding{ids.length === 1 ? "" : "s"}
                  </span>
                </div>
                {p.description && (
                  <div className="mt-1 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                    {p.description}
                  </div>
                )}
                {p.why && (
                  <div className="mt-1 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
                    <b>What it exposes:</b> {p.why}
                  </div>
                )}
                {p.note && (
                  <div
                    className="mt-1.5 rounded-[7px] border px-[8px] py-[6px] text-[11px] leading-[1.5]"
                    style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
                  >
                    <div className="mb-[2px] font-mono text-[8.5px] tracking-[.06em] uppercase">
                      Why these belong together
                    </div>
                    {p.note}
                  </div>
                )}

                <div className="mt-1.5 flex flex-wrap gap-[5px]">
                  {ids.map((id) => {
                    const f = findings.find((x) => x.id === id);
                    return (
                      <span
                        key={id}
                        title={f?.description}
                        className="rounded-full border px-[8px] py-[3px] font-mono text-[9.5px]"
                        style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                      >
                        {id}
                        {f ? ` · ${f.discipline}` : ""}
                      </span>
                    );
                  })}
                </div>

                {/* The photographs behind the group. This is the single
                    highest-value thing on the screen: a reviewer can see at a
                    glance whether two write-ups really are one physical thing,
                    without opening either finding. */}
                {photos.length > 0 && (
                  <div className="mt-2">
                    <div className="label-xs mb-1">
                      Photographs behind this group ({photos.length})
                    </div>
                    <div className="flex flex-wrap gap-[6px]">
                      {photos.map((a) => (
                        <figure key={a.id} className="w-[104px]">
                          {a.thumbDataUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={a.thumbDataUrl}
                              alt={a.caption || a.ref || a.name}
                              className="h-[74px] w-full rounded-[7px] border object-cover"
                              style={{ borderColor: "var(--line-2)" }}
                            />
                          ) : (
                            <div
                              className="flex h-[74px] w-full items-center justify-center rounded-[7px] border text-[9px]"
                              style={{ borderColor: "var(--line-2)", color: "var(--ink-4)" }}
                            >
                              no preview
                            </div>
                          )}
                          <figcaption
                            className="mt-[3px] font-mono text-[8.5px] leading-[1.3]"
                            style={{ color: "var(--ink-4)" }}
                          >
                            {a.ref ?? a.name}
                            <span className="block font-sans" style={{ color: "var(--ink-3)" }}>
                              {a.caption?.trim() || "no caption"}
                            </span>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Btn variant="primary" onClick={() => accept(p)}>
                    <IconCheck width={13} height={13} />
                    {p.event ? "Accept as a hazard" : "Raise it as its own hazard"}
                  </Btn>
                  <Btn
                    variant="ghost"
                    onClick={() => setProposals((ps) => (ps ?? []).filter((x) => x !== p))}
                  >
                    <IconX width={13} height={13} />
                    Dismiss
                  </Btn>
                </div>
              </div>
            );
          })}

          {proposals && proposals.length > 0 && (
            <div className="mt-2 text-[10px]" style={{ color: "var(--ink-4)" }}>
              Proposals, unrated. Accepting one creates the hazard; severity and likelihood stay
              yours to agree on the matrix.
            </div>
          )}
        </div>

        {/* ------------------------------------------------ register */}
        {hazards.length === 0 ? (
          <Panel tone="accent">
            <div className="text-[12px]" style={{ color: "var(--acc)" }}>
              No hazards yet. Group the findings above, or raise one directly.
            </div>
          </Panel>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div
              className="overflow-hidden rounded-[15px] border"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              {list.length === 0 ? (
                <Empty>Nothing matches this filter.</Empty>
              ) : (
                list.map((h) => {
                  const band = bandFor(h.severity, h.likelihood);
                  return (
                    <button
                      key={h.id}
                      onClick={() => setActiveId(h.id)}
                      className="flex w-full flex-col gap-[3px] border-b px-3 py-2.5 text-left transition-[var(--t)]"
                      style={{
                        borderColor: "var(--line)",
                        background: active?.id === h.id ? "var(--sunken)" : "transparent",
                      }}
                    >
                      <span className="flex items-center gap-[6px]">
                        <Dot tone={h.ratingConfirmed && band ? BAND_META[band].tone : "pending"} />
                        <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-3)" }}>
                          {h.id}
                        </span>
                        {h.ratingConfirmed && band && (
                          <span className="font-mono text-[9.5px]" style={{ color: `var(--${BAND_META[band].tone})` }}>
                            {cellCode(h.severity, h.likelihood)}
                          </span>
                        )}
                        {!h.ratingConfirmed && <Pill tone="warn">UNRATED</Pill>}
                      </span>
                      <span className="text-[12px] leading-[1.35] font-semibold">
                        {h.event || "(unnamed hazard)"}
                      </span>
                      <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {h.findingIds.length} finding{h.findingIds.length === 1 ? "" : "s"}
                        {h.reassessedAt ? " · re-read after the walk" : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {active && (
              <div
                className="rounded-[15px] border px-[17px] py-[15px]"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                  <span>{active.id}</span>
                  <Pill tone={active.origin === "consolidated" ? "accent" : active.origin === "acsa" ? "warn" : "neutral"}>
                    {ORIGIN_LABEL[active.origin]}
                  </Pill>
                  {active.disciplines.length > 0 && <span>{active.disciplines.join(" · ")}</span>}
                  {active.systems.length > 0 && <span>{active.systems.join(" · ")}</span>}
                  {active.immediate && <Pill tone="bad">IMMEDIATE</Pill>}
                </div>

                <label className="mb-2 block">
                  <span className="label-xs">The event · under 15 words, not the paperwork</span>
                  <input
                    value={active.event}
                    onChange={(e) => updateHazard(active.id, { event: e.target.value })}
                    placeholder="Uncontained fuel release on the apron…"
                    className="mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[13px] font-semibold outline-none focus:border-[var(--acc)]"
                    style={{
                      background: "var(--panel)",
                      borderColor: active.event ? "var(--line-2)" : "var(--warn-line)",
                    }}
                  />
                </label>

                <label className="mb-2 block">
                  <span className="label-xs">Description</span>
                  <textarea
                    value={active.description}
                    onChange={(e) => updateHazard(active.id, { description: e.target.value })}
                    className="mt-1 min-h-[54px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                    style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                  />
                </label>

                <label className="mb-2 block">
                  <span className="label-xs">
                    What control failed, and what it was protecting against
                  </span>
                  <textarea
                    value={active.why}
                    onChange={(e) => updateHazard(active.id, { why: e.target.value })}
                    className="mt-1 min-h-[54px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                    style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                  />
                </label>

                {/* Findings behind it, and the photographs they carry. The link
                    is what makes the rating auditable — a hazard nobody can
                    trace back to an observation is an opinion. */}
                <div className="mb-3">
                  <div className="label-xs mb-1">
                    Findings behind this hazard ({active.findingIds.length})
                  </div>
                  <div className="flex flex-wrap gap-[5px]">
                    {active.findingIds.map((id) => {
                      const f = findings.find((x) => x.id === id);
                      return (
                        <span
                          key={id}
                          className="flex items-center gap-[5px] rounded-full border px-[9px] py-[3px] text-[10.5px]"
                          style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}
                        >
                          <span className="font-mono text-[9px]">{id}</span>
                          {f?.title ?? "(not in this visit)"}
                          <button
                            onClick={() =>
                              updateHazard(active.id, {
                                findingIds: active.findingIds.filter((x) => x !== id),
                              })
                            }
                            aria-label={`Remove ${id} from this hazard`}
                            style={{ color: "var(--ink-4)" }}
                          >
                            <IconX width={10} height={10} />
                          </button>
                        </span>
                      );
                    })}
                    {loose.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const f = findings.find((x) => x.id === e.target.value);
                          /* Adding a finding widens the hazard rather than
                             overwriting it — a second discipline is the point,
                             not a conflict. */
                          updateHazard(active.id, {
                            findingIds: [...active.findingIds, e.target.value],
                            disciplines: [
                              ...new Set([...active.disciplines, f?.discipline].filter(Boolean) as string[]),
                            ],
                            systems: [
                              ...new Set([...active.systems, f?.system].filter(Boolean) as string[]),
                            ],
                          });
                        }}
                        className="rounded-full border px-[9px] py-[3px] text-[10.5px]"
                        style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                      >
                        <option value="">+ add a finding…</option>
                        {loose.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.id} · {f.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {(() => {
                    const photos = photosOf(active.findingIds);
                    if (!photos.length) return null;
                    return (
                      <div className="mt-2 flex flex-wrap gap-[6px]">
                        {photos.map((a) => (
                          <figure key={a.id} className="w-[104px]">
                            {a.thumbDataUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={a.thumbDataUrl}
                                alt={a.caption || a.ref || a.name}
                                className="h-[74px] w-full rounded-[7px] border object-cover"
                                style={{ borderColor: "var(--line-2)" }}
                              />
                            ) : null}
                            <figcaption
                              className="mt-[3px] font-mono text-[8.5px] leading-[1.3]"
                              style={{ color: "var(--ink-4)" }}
                            >
                              {a.ref ?? a.name}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* ACSA's occurrence history, asked for where the rating is
                    made. Four of B170 001M's five likelihood levels are
                    defined by whether the event has happened and how often —
                    "has occurred rarely", "has occurred infrequently" — so a
                    likelihood set without this is a judgement with its
                    evidence missing. It is ACSA's data, not ours. */}
                <label className="mb-2 block">
                  <span className="label-xs">
                    Occurrence history · ACSA&rsquo;s, in their words — the likelihood axis needs it
                  </span>
                  <textarea
                    value={active.occurrence}
                    onChange={(e) => updateHazard(active.id, { occurrence: e.target.value })}
                    placeholder="Has it happened here before, and how often…"
                    className="mt-1 min-h-[48px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                    style={{
                      background: "var(--panel)",
                      borderColor: active.occurrence ? "var(--line-2)" : "var(--warn-line)",
                    }}
                  />
                </label>

                <label className="mb-3 flex items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    checked={active.immediate}
                    onChange={(e) => updateHazard(active.id, { immediate: e.target.checked })}
                    className="h-[16px] w-[16px]"
                  />
                  Raise in the end-of-week critical review with ACSA
                </label>

                <RecordActions
                  record={active}
                  entityCode={entityCode}
                  onChange={(patch) => updateHazard(active.id, patch)}
                  onToast={say}
                  showErm
                  actionLabel="Treatment"
                  secondOpinion={
                    active.findingIds.length
                      ? async () => {
                          const f = findings.find((x) => x.id === active.findingIds[0]);
                          if (!f) throw new Error("The finding behind this hazard is not in view.");
                          const check = f.checkId
                            ? checksAt(entityCode).find((c) => c.id === f.checkId)
                            : undefined;
                          return assist("rating", findingContext(f, check));
                        }
                      : undefined
                  }
                  advice={
                    /* Same component as the check and findings screens. A
                       hazard's cause is the cause behind all the findings in
                       it, and that is what the treatment has to address. */
                    <RootCauseAdvice
                      finding={{
                        description: [active.event, active.why].filter(Boolean).join(". "),
                        discipline: active.disciplines.join(", "),
                        system: active.systems.join(", "),
                        rootCause: active.rootCause,
                      }}
                      attachments={photosOf(active.findingIds)}
                      onPick={(rc) => updateHazard(active.id, { rootCause: rc })}
                    />
                  }
                  footer={
                    <>
                      {/* Why the group agreed the cell they agreed. A rating
                          with no reasoning is a number nobody can defend
                          eighteen months later, and the out-brief is where it
                          gets asked. */}
                      <label className="mt-4 block">
                        <span className="label-xs">Why the group agreed this cell</span>
                        <textarea
                          value={active.ratingRationale}
                          onChange={(e) =>
                            updateHazard(active.id, { ratingRationale: e.target.value })
                          }
                          placeholder="What made it that severity, and that likelihood…"
                          className="mt-1 min-h-[48px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                        />
                      </label>

                      {/* --------------------------- the post-walk re-read */}
                      {aiOn && (
                        <div
                          className="mt-4 rounded-[11px] border px-[11px] py-[10px]"
                          style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <b className="font-display text-[11.5px] font-semibold">
                              Re-read after the walkthrough
                            </b>
                            {active.reassessedAt && (
                              <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                                last done {new Date(active.reassessedAt).toLocaleString("en-ZA")}
                              </span>
                            )}
                            <Btn
                              className="ml-auto"
                              disabled={rereading}
                              onClick={() => rereadNow(active)}
                            >
                              <IconSpark width={13} height={13} />
                              {rereading ? "Reading…" : "Re-read it"}
                            </Btn>
                          </div>
                          <div className="mt-1.5 text-[10px]" style={{ color: "var(--ink-4)" }}>
                            {vision
                              ? "The photographs on the findings behind this hazard are sent."
                              : "Captions are sent; the images are not."}{" "}
                            A photograph shows condition, not occurrence history — it can raise a new
                            hazard, and it may not move a likelihood on its own.
                          </div>

                          {active.reassessNote && (
                            <div
                              className="mt-2 rounded-[7px] border px-[8px] py-[6px] text-[11.5px] leading-[1.5] whitespace-pre-line"
                              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                            >
                              {active.reassessNote}
                            </div>
                          )}

                          {reread?.id === active.id && (
                            <div
                              className="mt-2 rounded-[9px] border px-[9px] py-[8px]"
                              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                            >
                              <div className="text-[11.5px] leading-[1.55]">{reread.result.note}</div>
                              {reread.result.photographsSeen.length > 0 && (
                                <div
                                  className="mt-1.5 font-mono text-[9px]"
                                  style={{ color: "var(--ink-4)" }}
                                >
                                  Photographs read: {reread.result.photographsSeen.join(" · ")}
                                </div>
                              )}
                              {reread.result.ratingComment && (
                                <div
                                  className="mt-1.5 rounded-[7px] border px-[8px] py-[6px] text-[11px] leading-[1.5]"
                                  style={{
                                    background: "var(--warn-bg)",
                                    borderColor: "var(--warn-line)",
                                    color: "var(--warn)",
                                  }}
                                >
                                  <div className="mb-[2px] font-mono text-[8.5px] tracking-[.06em] uppercase">
                                    A view on the rating · the team still decides
                                  </div>
                                  {reread.result.ratingComment}
                                </div>
                              )}
                              {reread.result.newHazards.map((n, i) => (
                                <div
                                  key={`${n.event}-${i}`}
                                  className="mt-1.5 flex flex-wrap items-center gap-2 rounded-[7px] border px-[8px] py-[6px]"
                                  style={{ borderColor: "var(--line-2)" }}
                                >
                                  <span className="text-[11.5px] font-semibold">{n.event}</span>
                                  <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                                    {n.why}
                                  </span>
                                  <Btn
                                    className="ml-auto"
                                    onClick={() => {
                                      const id = addHazard(
                                        blank({
                                          event: n.event,
                                          why: n.why,
                                          disciplines: active.disciplines,
                                          systems: active.systems,
                                          origin: "tpjv",
                                          note: `Seen in a photograph during the re-read of ${active.id}.`,
                                        })
                                      );
                                      setActiveId(id);
                                      say(`${id} raised from the re-read · rate it`);
                                    }}
                                  >
                                    Raise it
                                  </Btn>
                                </div>
                              ))}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Btn
                                  variant="primary"
                                  onClick={() => {
                                    updateHazard(active.id, {
                                      reassessedAt: Date.now(),
                                      reassessNote: reread.result.note,
                                    });
                                    setReread(null);
                                    say("Re-read recorded on the hazard");
                                  }}
                                >
                                  <IconCheck width={13} height={13} />
                                  Record this on the hazard
                                </Btn>
                                <Btn variant="ghost" onClick={() => setReread(null)}>
                                  Dismiss
                                </Btn>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* The register had no save affordance at all — the only
                          button down here was Remove, which is not what an
                          auditor working a list of hazards reaches for. */}
                      <StickyActions
                        state={
                          <>
                            {active.ratingConfirmed
                              ? "rated on B170 001M"
                              : "unrated — counts nowhere until the group agrees a cell"}
                            {active.ermConfirmed && " · ERM agreed"}
                            {active.ermLikelihoodAssumed && " · ⚠ ERM likelihood carried, not agreed"}
                            {!active.event && " · ⚠ unnamed"}
                          </>
                        }
                      >
                        <Btn
                          variant="ghost"
                          onClick={() => {
                            removeHazard(active.id);
                            setActiveId(null);
                            say(`${active.id} removed · the findings are free to regroup`);
                          }}
                        >
                          <IconX width={13} height={13} />
                          Remove
                        </Btn>
                        <Btn
                          onClick={() => {
                            const i = list.findIndex((h) => h.id === active.id);
                            const prev = list[i - 1];
                            if (prev) setActiveId(prev.id);
                          }}
                          disabled={list.findIndex((h) => h.id === active.id) === 0}
                        >
                          <IconLeft width={14} height={14} />
                          Previous
                        </Btn>
                        <Btn
                          variant="primary"
                          onClick={() => {
                            const i = list.findIndex((h) => h.id === active.id);
                            const next = list[i + 1];
                            setActiveId(next?.id ?? active.id);
                            say(next ? `${active.id} saved · ${next.id}` : `${active.id} saved · last one`);
                          }}
                        >
                          <IconCheck width={14} height={14} />
                          Save &amp; next
                        </Btn>
                      </StickyActions>
                    </>
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div
          className="fixed bottom-[22px] left-1/2 z-[100] -translate-x-1/2 rounded-[11px] px-[15px] py-2.5 text-[12px] font-medium"
          style={{ background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--e3)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
