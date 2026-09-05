"use client";

/** Visual review — every photograph and voice note this visit captured, per
 *  discipline, for an engineer who was not on the apron.
 *
 *  The people who can tell whether a photograph shows the right panel are
 *  mostly not the people holding the tablet. Until this screen existed, visual
 *  evidence was only reachable by opening the one check that carried it, which
 *  meant a discipline lead reviewing electrical evidence had to know which of
 *  374 checks to open first. Nobody does that, so nobody reviewed.
 *
 *  Feedback left here is its own thing. It is not merged into the observation,
 *  which is the auditor's record of what they found, and not into the finding,
 *  which is what goes to ACSA. It is the conversation about the photograph, and
 *  keeping it separate is the whole reason an engineer can be candid in it. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHECKS,
  DISCIPLINES,
  useEntity,
  useFeedback,
  useResponses,
  useStore,
  useVisitFindings,
  useVisitId,
} from "@/lib/store";
import { PROGRAMME_VISITS } from "@/lib/programme";
import { useBlobUrl, formatDuration } from "@/lib/media";
import { bandFor, BAND_META } from "@/lib/risk";
import { Btn, Dot, Empty, Panel, Pill } from "@/components/ui/primitives";
import { IconCamera, IconCheck, IconMic, IconX } from "@/components/ui/icons";
import type { Attachment, Check, FeedbackNote, Finding, Response } from "@/lib/types";

interface Item {
  check: Check;
  response: Response;
  photos: Attachment[];
  voices: Attachment[];
  findings: Finding[];
  notes: FeedbackNote[];
  open: number;
}

/* ---------- media ---------- */

function Photo({ a, onOpen }: { a: Attachment; onOpen?: () => void }) {
  const { url, missing } = useBlobUrl(a.blobKey);
  const src = url ?? a.dataUrl ?? null;
  if (a.unavailable || (missing && !a.dataUrl)) {
    return (
      <div
        className="flex aspect-[4/3] w-full items-center justify-center rounded-[11px] border text-[10.5px]"
        style={{ background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-4)" }}
      >
        no image stored — captured before this worked
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
  const src = url ?? a.dataUrl ?? null;
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-5"
      style={{ background: "rgba(16,10,32,.72)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={a.name} className="max-h-full max-w-full rounded-[13px]" />
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
  const entity = useEntity();
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
    return CHECKS.filter((c) => (responses[c.id]?.attachments.length ?? 0) > 0)
      .map((c) => {
        const r = responses[c.id]!;
        const notes = feedback[c.id] ?? [];
        return {
          check: c,
          response: r,
          photos: r.attachments.filter((a) => a.kind === "photo"),
          voices: r.attachments.filter((a) => a.kind === "voice"),
          findings: findings.filter((f) => f.checkId === c.id),
          notes,
          open: notes.filter((n) => !n.resolvedAt).length,
        };
      })
      .sort((a, b) => (b.response.capturedAt ?? 0) - (a.response.capturedAt ?? 0));
  }, [responses, findings, feedback]);

  const byDiscipline = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.check.discipline, (m.get(it.check.discipline) ?? 0) + 1);
    return m;
  }, [items]);

  const visible = useMemo(
    () =>
      items.filter(
        (it) =>
          (discipline === "All" || it.check.discipline === discipline) &&
          (!onlyOpen || it.open > 0)
      ),
    [items, discipline, onlyOpen]
  );

  const active = visible.find((it) => it.check.id === activeId) ?? visible[0];
  const totalPhotos = items.reduce((n, it) => n + it.photos.length, 0);
  const totalVoices = items.reduce((n, it) => n + it.voices.length, 0);
  const totalOpen = items.reduce((n, it) => n + it.open, 0);

  const post = () => {
    if (!active || !draft.trim()) return;
    addFeedback(active.check.id, draft);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
          {["All", ...DISCIPLINES.filter((d) => byDiscipline.has(d))].map((d) => {
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
                const on = it.check.id === active?.check.id;
                return (
                  <button
                    key={it.check.id}
                    onClick={() => setActiveId(it.check.id)}
                    className="relative flex w-full items-start gap-2 border-b px-[11px] py-[9px] text-left transition-[var(--t)]"
                    style={{ borderColor: "var(--line)", background: on ? "var(--acc-soft)" : "transparent" }}
                  >
                    {on && (
                      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: "var(--acc)" }} />
                    )}
                    <Dot
                      tone={
                        it.response.compliance === "NC"
                          ? "bad"
                          : it.response.compliance === "C"
                            ? "good"
                            : it.response.compliance === "NV"
                              ? "warn"
                              : "neutral"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {it.check.id} · {it.check.system}
                      </span>
                      <span className="mt-[1px] block truncate text-[11.5px]">
                        {it.check.requirement}
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
                  <span>{active.check.id}</span>
                  <span>·</span>
                  <span>{active.check.discipline}</span>
                  <span>·</span>
                  <span>{active.check.system}</span>
                  {active.response.compliance && (
                    <Pill
                      tone={
                        active.response.compliance === "NC"
                          ? "bad"
                          : active.response.compliance === "C"
                            ? "good"
                            : active.response.compliance === "NV"
                              ? "warn"
                              : "neutral"
                      }
                    >
                      {active.response.compliance}
                    </Pill>
                  )}
                  {active.response.capturedBy && <span>· {active.response.capturedBy}</span>}
                </div>
                <h3 className="mb-2.5 text-[14.5px] leading-[1.35] font-bold">
                  {active.check.requirement}
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

                {active.response.observation && (
                  <div className="mb-3">
                    <div className="label-xs mb-1">Observation recorded on site</div>
                    <p className="text-[12.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
                      {active.response.observation}
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
                                onClick={() => toggleFeedbackResolved(active.check.id, n.id)}
                                aria-label={n.resolvedAt ? "Reopen this comment" : "Mark dealt with"}
                                title={n.resolvedAt ? "Reopen" : "Mark dealt with"}
                                className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border"
                                style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                              >
                                <IconCheck width={12} height={12} />
                              </button>
                              <button
                                onClick={() => removeFeedback(active.check.id, n.id)}
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
                      <Btn onClick={() => router.push(`/capture?check=${active.check.id}`)}>
                        Open the check
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
