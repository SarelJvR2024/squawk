"use client";

/** Visual review — every photograph and voice note this visit captured, per
 *  discipline, for an engineer who was not on the apron.
 *
 *  The people who can tell whether a photograph shows the right panel are
 *  mostly not the people holding the tablet. Until this screen existed, visual
 *  evidence was only reachable by opening the one check that carried it, which
 *  meant a discipline lead reviewing electrical evidence had to know which of
 *  324 checks to open first. Nobody does that, so nobody reviewed.
 *
 *  Feedback left here is its own thing. It is not merged into the observation,
 *  which is the auditor's record of what they found, and not into the finding,
 *  which is what goes to ACSA. It is the conversation about the photograph, and
 *  keeping it separate is the whole reason an engineer can be candid in it. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checksAt,
  disciplinesAt,
  useEntity,
  useEntityCode,
  useFeedback,
  useAdhoc,
  useCaptures,
  useResponses,
  useStore,
  useVisitFindings,
  useVisitId,
} from "@/lib/store";
import { PROGRAMME_VISITS } from "@/lib/programme";
import { useBlobUrl, formatDuration } from "@/lib/media";
import { bandFor, BAND_META } from "@/lib/risk";
import { Btn, Dot, Empty, Panel, Pill } from "@/components/ui/primitives";
import { IconCamera, IconCheck, IconMic, IconPlus, IconX } from "@/components/ui/icons";
import type {
  AdHocItem,
  Attachment,
  Capture,
  Check,
  Compliance,
  FeedbackNote,
  Finding,
} from "@/lib/types";

/** ONE ROW ON THIS SCREEN, whether it came off the register or off the walk.
 *
 *  Task #67. Until now this screen read `checksAt(entityCode)` and nothing
 *  else, so a photograph attached to a WALK-xxxxx item — something an auditor
 *  saw that ACSA's list does not cover — existed on the tablet and was
 *  invisible to the engineer reviewing evidence. Those are disproportionately
 *  the photographs worth a second opinion, because nobody wrote a check for
 *  them and there is no threshold to fall back on.
 *
 *  The fields are flattened rather than the row carrying a `check | walk`
 *  union, because every one of them exists on both and the twenty read sites
 *  on this page should not each have to know which kind they hold. `check` and
 *  `walk` are kept for the two places that genuinely differ: where the row is
 *  captured, and what to call it. */
/* The same words the Inspection screen uses for an unattributed walk item.
   They are spelled out rather than left blank because a blank discipline in a
   filter list reads as a bug, and "not recorded" is a real state worth being
   able to filter TO — those are the rows somebody should go back and attribute
   before the out-brief. */
const NO_SYSTEM = "No asset system recorded";
const NO_DISCIPLINE = "No discipline recorded";
const UNASSIGNED = "Not assigned to a check";

/* A Capture and an Attachment hold the same bytes and differ only in whether
   anybody has said where they belong. The two media components on this screen
   take an Attachment, so a capture is adapted rather than the components being
   taught a second shape — one renderer, one set of fallbacks, one placeholder
   wording. `id` doubles as the attachment id, which is safe because a capture
   id (CAP-xxxx) never collides with an attachment id and the row is keyed on
   it either way. */
function captureAsAttachment(c: Capture): Attachment {
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    blobKey: c.blobKey,
    mimeType: c.mimeType,
    dataUrl: c.dataUrl,
    thumbDataUrl: c.thumbDataUrl,
    durationSec: c.durationSec,
    transcript: c.transcript,
    transcriptSource: c.transcriptSource,
    unavailable: c.unavailable,
    caption: c.caption,
    location: c.area,
    createdAt: c.createdAt,
    createdBy: c.createdBy,
  } as Attachment;
}

interface Item {
  /** Check id, or WALK-xxxxx. The feedback map is keyed by string, so a walk
   *  id needs no schema change to carry comments. */
  key: string;
  title: string;
  discipline: string;
  system: string;
  /** NC / C / NV / null — a walk item's `outcome` is the same vocabulary as a
   *  check's `compliance`, deliberately, so this screen's dot means one thing. */
  compliance: Compliance | null;
  observation: string;
  capturedBy: string;
  capturedAt: number;
  /** True for a walk item. The row is marked, because "this was not on ACSA's
   *  list" is the single most useful thing a reviewer can know about it. */
  isWalk: boolean;
  check: Check | null;
  walk: AdHocItem | null;
  /** Set for a loose capture off the walk — one nobody has assigned yet. */
  capture: Capture | null;
  photos: Attachment[];
  voices: Attachment[];
  findings: Finding[];
  notes: FeedbackNote[];
  open: number;
}

/* ---------- media ---------- */

/* WHAT A PHOTOGRAPH CAN BE DRAWN FROM, IN ORDER, and the middle one is the
   whole fix here.

   Three sources, and only one of them crosses between devices:
     url            the full image, out of THIS device's IndexedDB blob store.
                    A blobKey is a pointer into local storage — see
                    src/lib/media.ts — so it resolves on the device that took
                    the photograph and nowhere else, ever.
     thumbDataUrl   the small inline preview, which lives INSIDE the persisted
                    JSON and therefore rides the shared record to every other
                    device on the audit.
     dataUrl        legacy inline bytes from before the media store. Read,
                    never written.

   This screen listed the first and the third and skipped the second, so a
   photograph taken on the phone showed on the phone and showed as "no image
   stored" on the laptop — while the thumbnail that had crossed sat unread in
   the same record. Sarel found it on the first day he used two devices. The
   Capture screen has always had the fallback (src/components/Capture.tsx); this
   one had drifted from it.

   And the placeholder was WRONG when it did fire. "Captured before this worked"
   is the v4 migration's meaning — `unavailable`, set once, on records that
   genuinely predate real capture. A photograph whose bytes are on another
   device is not that, and telling an auditor their evidence is corrupt old data
   when it is one sync away is worse than telling them nothing. Two states, two
   sentences. */
function Photo({ a, onOpen }: { a: Attachment; onOpen?: () => void }) {
  const { url, missing } = useBlobUrl(a.blobKey);
  const src = url ?? a.thumbDataUrl ?? a.dataUrl ?? null;
  if (a.unavailable || (missing && !a.thumbDataUrl && !a.dataUrl)) {
    return (
      <div
        className="flex aspect-[4/3] w-full items-center justify-center rounded-[11px] border px-2 text-center text-[10.5px] leading-[1.4]"
        style={{ background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-4)" }}
      >
        {a.unavailable
          ? "no image stored — captured before this worked"
          : "the image is on the device that took it"}
      </div>
    );
  }
  if (!src) {
    return (
      <div
        className="aspect-[4/3] w-full animate-pulse rounded-[11px] border"
        style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={a.name}
      onClick={onOpen}
      className="w-full cursor-zoom-in rounded-[11px] border object-cover"
      style={{ borderColor: "var(--line-2)", aspectRatio: "4 / 3" }}
    />
  );
}

function Lightbox({ a, onClose }: { a: Attachment; onClose: () => void }) {
  const { url } = useBlobUrl(a.blobKey);
  /* Same chain as the tile, and it has to be — a tile that paints from the
     thumbnail and a lightbox that does not is a photograph you can see until
     you tap it. The thumbnail is small and will look it blown up; a small
     picture of the evidence beats a black rectangle, and the line under it
     says which device holds the full one. */
  const src = url ?? a.thumbDataUrl ?? a.dataUrl ?? null;
  const thumbOnly = !url && !!a.thumbDataUrl;
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-5"
      style={{ background: "rgba(16,10,32,.72)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      {src && (
        <div className="flex max-h-full max-w-full flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={a.name} className="max-h-full max-w-full rounded-[13px]" />
          {thumbOnly && (
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,.72)" }}>
              Preview only — the full image is on the device that took it.
            </span>
          )}
        </div>
      )}
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 flex h-[44px] w-[44px] items-center justify-center rounded-[11px] border"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink)" }}
      >
        <IconX width={16} height={16} />
      </button>
    </div>
  );
}

function VoiceRow({ a }: { a: Attachment }) {
  const { url, missing } = useBlobUrl(a.blobKey);
  const src = url ?? a.dataUrl ?? null;
  const dead = a.unavailable || (missing && !a.dataUrl);
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-[9px] border px-[9px] py-[7px]"
      style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
    >
      <IconMic width={13} height={13} style={{ color: "var(--ink-3)" }} />
      {dead ? (
        <span className="text-[10.5px] line-through" style={{ color: "var(--ink-4)" }}>
          no audio stored
        </span>
      ) : src ? (
        <audio controls src={src} className="h-[32px] max-w-[240px]" preload="metadata" />
      ) : null}
      {!dead && <Pill tone="accent">{formatDuration(a.durationSec)}</Pill>}
      {a.transcript && (
        <span className="w-full text-[11.5px] italic" style={{ color: "var(--ink-2)" }}>
          “{a.transcript}”
        </span>
      )}
    </div>
  );
}

/* ---------- screen ---------- */

export default function ReviewPage() {
  const router = useRouter();
  const responses = useResponses();
  const findings = useVisitFindings();
  const feedback = useFeedback();
  const adhoc = useAdhoc();
  const captures = useCaptures();
  const entity = useEntity();
  const entityCode = useEntityCode();
  const visitId = useVisitId();
  const role = useStore((s) => s.role);
  const addFeedback = useStore((s) => s.addFeedback);
  const toggleFeedbackResolved = useStore((s) => s.toggleFeedbackResolved);
  const removeFeedback = useStore((s) => s.removeFeedback);

  const [discipline, setDiscipline] = useState<string>("All");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [zoom, setZoom] = useState<Attachment | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);

  const visitLabel = PROGRAMME_VISITS.find((v) => v.id === visitId)?.label ?? visitId;

  /* Every check this visit that carries visual or spoken evidence. A check with
     no attachment has nothing to review and is not shown — this screen is about
     what was captured, not what was skipped, which the Capture progress and the
     dashboard already say. */
  const items = useMemo<Item[]>(() => {
    const rows: Item[] = [];

    for (const c of checksAt(entityCode)) {
      const r = responses[c.id];
      if (!r || r.attachments.length === 0) continue;
      const notes = feedback[c.id] ?? [];
      rows.push({
        key: c.id,
        title: c.requirement,
        discipline: c.discipline,
        system: c.system,
        compliance: r.compliance,
        observation: r.observation,
        capturedBy: r.capturedBy ?? "",
        capturedAt: r.capturedAt ?? 0,
        isWalk: false,
        check: c,
        walk: null,
        capture: null,
        photos: r.attachments.filter((a) => a.kind === "photo"),
        voices: r.attachments.filter((a) => a.kind === "voice"),
        findings: findings.filter((f) => f.checkId === c.id),
        notes,
        open: notes.filter((n) => !n.resolvedAt).length,
      });
    }

    /* WALK ITEMS, on the same footing. Discipline and asset system are nullable
       on an ad-hoc item and null is a real answer there — an unattributed
       observation is honest, and forcing an attribution puts a guess into a
       client deliverable. So they get a named bucket rather than being dropped
       from a discipline filter that would otherwise silently hide them. */
    for (const w of adhoc) {
      if (w.attachments.length === 0) continue;
      const notes = feedback[w.id] ?? [];
      rows.push({
        key: w.id,
        title: w.description,
        discipline: w.discipline ?? NO_DISCIPLINE,
        system: w.system ?? NO_SYSTEM,
        compliance: w.outcome,
        observation: w.note,
        capturedBy: w.createdBy,
        capturedAt: w.createdAt,
        isWalk: true,
        check: null,
        walk: w,
        capture: null,
        photos: w.attachments.filter((a) => a.kind === "photo"),
        voices: w.attachments.filter((a) => a.kind === "voice"),
        findings: findings.filter((f) => f.id === w.findingId),
        notes,
        open: notes.filter((n) => !n.resolvedAt).length,
      });
    }

    /* UNASSIGNED CAPTURES — the tray, and the reason this screen exists.
       A photograph taken from the walk's bottom bar attaches to nothing by
       design: it is the fastest path to evidence, no record, no fields, assign
       it later. Which means nobody has yet decided what it is OF — and that is
       precisely the photograph a discipline lead can settle in five seconds
       and an auditor can spend the rest of the audit wondering about.

       A capture carries its own thumbDataUrl, so unlike the full image it does
       cross to the reviewing engineer's laptop. That field was already being
       written and was simply not declared on the type; see the note on
       Capture in types.ts.

       They are shown as themselves, not folded into one "unassigned" row: each
       is separate evidence with its own location and needs its own thread, and
       a pile with one comment box is a pile nobody triages. */
    for (const cap of captures) {
      const notes = feedback[cap.id] ?? [];
      rows.push({
        key: cap.id,
        title:
          cap.caption?.trim() ||
          `Unassigned ${cap.kind === "voice" ? "voice note" : "photograph"} — nobody has said what it is of yet`,
        discipline: NO_DISCIPLINE,
        system: UNASSIGNED,
        /* Not "not captured" — it WAS captured. There is simply no compliance
           question attached to it, because it is attached to no check. */
        compliance: null,
        observation: "",
        capturedBy: cap.createdBy,
        capturedAt: cap.createdAt,
        isWalk: true,
        check: null,
        walk: null,
        capture: cap,
        photos: cap.kind === "photo" ? [captureAsAttachment(cap)] : [],
        voices: cap.kind === "voice" ? [captureAsAttachment(cap)] : [],
        findings: [],
        notes,
        open: notes.filter((n) => !n.resolvedAt).length,
      });
    }

    return rows.sort((a, b) => b.capturedAt - a.capturedAt);
  }, [entityCode, responses, findings, feedback, adhoc, captures]);

  const byDiscipline = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.discipline, (m.get(it.discipline) ?? 0) + 1);
    return m;
  }, [items]);

  const visible = useMemo(
    () =>
      items.filter(
        (it) =>
          (discipline === "All" || it.discipline === discipline) &&
          (!onlyOpen || it.open > 0)
      ),
    [items, discipline, onlyOpen]
  );

  const active = visible.find((it) => it.key === activeId) ?? visible[0];
  const totalPhotos = items.reduce((n, it) => n + it.photos.length, 0);
  const totalVoices = items.reduce((n, it) => n + it.voices.length, 0);
  const totalOpen = items.reduce((n, it) => n + it.open, 0);

  const post = () => {
    if (!active || !draft.trim()) return;
    addFeedback(active.key, draft);
    setDraft("");
  };

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 pb-16">
        <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold">Visual review · {entity.short}</h2>
            <p className="mt-1 max-w-[78ch] text-[12.5px]" style={{ color: "var(--ink-2)" }}>
              Every photograph and voice note captured at {entity.name} on {visitLabel}, by
              discipline. Comments here are a conversation about the evidence — they are never
              written into the observation or the finding.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
            <Pill>
              <IconCamera width={10} height={10} /> {totalPhotos}
            </Pill>
            <Pill>
              <IconMic width={10} height={10} /> {totalVoices}
            </Pill>
            {totalOpen > 0 && <Pill tone="warn">{totalOpen} open</Pill>}
          </div>
        </div>

        {/* discipline is the axis an engineer thinks in — theirs is the only one
            they will read, so it is the first control, not a dropdown. */}
        <div className="mb-3 flex flex-wrap gap-[6px]">
          {["All", ...disciplinesAt(entityCode).filter((d) => byDiscipline.has(d))].map((d) => {
            const n = d === "All" ? items.length : (byDiscipline.get(d) ?? 0);
            return (
              <button
                key={d}
                onClick={() => setDiscipline(d)}
                className="rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)]"
                style={
                  discipline === d
                    ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                    : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                }
              >
                {d} <span style={{ opacity: 0.65 }}>{n}</span>
              </button>
            );
          })}
          <button
            onClick={() => setOnlyOpen((v) => !v)}
            className="rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)]"
            style={
              onlyOpen
                ? { background: "var(--warn)", borderColor: "var(--warn)", color: "#fff" }
                : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
            }
          >
            Open comments only
          </button>
        </div>

        {items.length === 0 ? (
          <Empty>
            <b>No visual evidence captured on {visitLabel} yet.</b>
            <span>
              Photographs and voice notes taken in Capture or Field mode appear here for review.
            </span>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty>Nothing matches this filter.</Empty>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
            {/* the list */}
            <div
              className="max-h-[70vh] overflow-y-auto rounded-[15px] border"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              {visible.map((it) => {
                const on = it.key === active?.key;
                return (
                  <button
                    key={it.key}
                    onClick={() => setActiveId(it.key)}
                    className="relative flex w-full items-start gap-2 border-b px-[11px] py-[9px] text-left transition-[var(--t)]"
                    style={{ borderColor: "var(--line)", background: on ? "var(--acc-soft)" : "transparent" }}
                  >
                    {on && (
                      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: "var(--acc)" }} />
                    )}
                    <Dot
                      tone={
                        it.compliance === "NC"
                          ? "bad"
                          : it.compliance === "C"
                            ? "good"
                            : it.compliance === "NV"
                              ? "warn"
                              : "neutral"
                      }
                      label={it.compliance ?? "Not captured"}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {/* The mark for a hand-added item is the same IconPlus
                            the Inspection screen uses, so one convention means
                            one thing across the product. */}
                        {it.isWalk && (
                          <IconPlus width={8} height={8} aria-hidden className="mr-[3px] inline align-[-1px]" />
                        )}
                        {it.key} · {it.system}
                      </span>
                      <span className="mt-[1px] block truncate text-[11.5px]">
                        {it.title}
                      </span>
                    </span>
                    <span className="mt-[2px] flex shrink-0 items-center gap-1">
                      {it.photos.length > 0 && <Pill>{it.photos.length}📷</Pill>}
                      {it.open > 0 && <Pill tone="warn">{it.open}</Pill>}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* the evidence and the thread */}
            {active && (
              <div
                className="rounded-[15px] border p-[18px]"
                style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "var(--e2)" }}
              >
                <div
                  className="mb-1.5 flex flex-wrap items-center gap-[7px] font-mono text-[10px]"
                  style={{ color: "var(--ink-3)" }}
                >
                  <span>{active.key}</span>
                  <span>·</span>
                  <span>{active.discipline}</span>
                  <span>·</span>
                  <span>{active.system}</span>
                  {active.capture ? (
                    <Pill tone="warn">NOT ASSIGNED TO A CHECK</Pill>
                  ) : (
                    active.isWalk && <Pill tone="accent">ADDED ON THE WALK</Pill>
                  )}
                  {active.compliance && (
                    <Pill
                      tone={
                        active.compliance === "NC"
                          ? "bad"
                          : active.compliance === "C"
                            ? "good"
                            : active.compliance === "NV"
                              ? "warn"
                              : "neutral"
                      }
                    >
                      {active.compliance}
                    </Pill>
                  )}
                  {active.capturedBy && <span>· {active.capturedBy}</span>}
                </div>
                <h3 className="mb-2.5 text-[14.5px] leading-[1.35] font-bold">
                  {active.title}
                </h3>

                {active.photos.length > 0 && (
                  <div
                    className={`mb-3 grid gap-2 ${
                      active.photos.length === 1 ? "grid-cols-1 sm:max-w-[460px]" : "grid-cols-2"
                    }`}
                  >
                    {active.photos.map((a) => (
                      <Photo key={a.id} a={a} onOpen={() => setZoom(a)} />
                    ))}
                  </div>
                )}

                {active.voices.length > 0 && (
                  <div className="mb-3 flex flex-col gap-2">
                    {active.voices.map((a) => (
                      <VoiceRow key={a.id} a={a} />
                    ))}
                  </div>
                )}

                {active.observation && (
                  <div className="mb-3">
                    <div className="label-xs mb-1">Observation recorded on site</div>
                    <p className="text-[12.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
                      {active.observation}
                    </p>
                  </div>
                )}

                {active.findings.length > 0 && (
                  <div className="mb-3 flex flex-col gap-1.5">
                    {active.findings.map((f) => {
                      const band = bandFor(f.severity, f.likelihood);
                      return (
                        <Panel key={f.id} tone={band === "Red" ? "warn" : undefined}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                              {f.id}
                            </span>
                            {band && f.ratingConfirmed ? (
                              <Pill tone={BAND_META[band].tone as "bad" | "warn" | "good"}>{band}</Pill>
                            ) : (
                              <Pill>SUGGESTED — NOT AGREED</Pill>
                            )}
                            {f.owner && (
                              <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                                {f.owner}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[12px] leading-[1.5]">{f.description || f.title}</div>
                        </Panel>
                      );
                    })}
                  </div>
                )}

                {/* the thread */}
                <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--line)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <b className="font-display text-[11px] font-semibold">
                      Engineer feedback{active.notes.length > 0 ? ` (${active.notes.length})` : ""}
                    </b>
                    <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                      not written into the record
                    </span>
                  </div>

                  {active.notes.length === 0 ? (
                    <p className="mb-2.5 text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                      No comments yet.
                    </p>
                  ) : (
                    <div className="mb-2.5 flex flex-col gap-2">
                      {active.notes.map((n) => (
                        <div
                          key={n.id}
                          className="rounded-[11px] border px-[12px] py-[9px]"
                          style={{
                            background: n.resolvedAt ? "var(--sunken)" : "var(--panel)",
                            borderColor: n.resolvedAt ? "var(--line)" : "var(--line-2)",
                            opacity: n.resolvedAt ? 0.72 : 1,
                          }}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <b className="font-display text-[11px] font-semibold">{n.author}</b>
                            <Pill tone={n.role === "acsa" ? "accent" : "neutral"}>
                              {n.role === "acsa" ? "ACSA" : "TPJV"}
                            </Pill>
                            <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                              {new Date(n.createdAt).toLocaleString("en-ZA", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {n.resolvedAt && <Pill tone="good">DEALT WITH</Pill>}
                            <span className="ml-auto flex items-center gap-1">
                              <button
                                onClick={() => toggleFeedbackResolved(active.key, n.id)}
                                aria-label={n.resolvedAt ? "Reopen this comment" : "Mark dealt with"}
                                title={n.resolvedAt ? "Reopen" : "Mark dealt with"}
                                className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border"
                                style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                              >
                                <IconCheck width={12} height={12} />
                              </button>
                              <button
                                onClick={() => removeFeedback(active.key, n.id)}
                                aria-label="Delete this comment"
                                className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border"
                                style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                              >
                                <IconX width={11} height={11} />
                              </button>
                            </span>
                          </div>
                          <div className="text-[12.5px] leading-[1.55] whitespace-pre-line">
                            {n.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post();
                    }}
                    placeholder={
                      role === "acsa"
                        ? "Comment as ACSA — is this the right asset, has it since been dealt with…"
                        : "Comment as TPJV — what should the engineer look at…"
                    }
                    className="min-h-[66px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                    style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                      ⌘/Ctrl + Enter to post
                    </span>
                    <div className="flex items-center gap-2">
                      {/* A walk item does not live on the Capture screen and
                          never will — it has no register id to route to. It is
                          opened where it was recorded. */}
                      <Btn
                        onClick={() =>
                          router.push(active.isWalk ? "/field" : `/capture?check=${active.key}`)
                        }
                      >
                        {active.capture
                          ? "Assign it on the walk"
                          : active.isWalk
                            ? "Open on the walk"
                            : "Open the check"}
                      </Btn>
                      <Btn variant="primary" onClick={post} disabled={!draft.trim()}>
                        <IconCheck width={14} height={14} />
                        Post comment
                      </Btn>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {zoom && <Lightbox a={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
