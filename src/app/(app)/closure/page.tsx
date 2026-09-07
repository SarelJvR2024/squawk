"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checksOf,
  useEntity,
  useEntityCode,
  useResponses,
  useStore,
  useVerifications,
  useVisitFindings,
  useVisitId,
} from "@/lib/store";
import { carriesWork, currentRatingOf, useHistory, useOutstanding, visitsOpen } from "@/lib/carryforward";
import ItemTimeline from "@/components/ItemTimeline";
import { PROGRAMME_VISITS } from "@/lib/programme";
import { movement } from "@/lib/risk";
import { Btn, Dot, Empty, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconClock, IconDash, IconLoop, IconX } from "@/components/ui/icons";
import type { VerificationOutcome } from "@/lib/types";

const OUTCOMES: { key: VerificationOutcome; label: string; Icon: typeof IconCheck; tone: string }[] = [
  { key: "Closed", label: "Closed", Icon: IconCheck, tone: "good" },
  { key: "Partially closed", label: "Partially", Icon: IconClock, tone: "warn" },
  { key: "Open - repeat", label: "Repeat", Icon: IconX, tone: "bad" },
  { key: "Not verified", label: "Not verified", Icon: IconDash, tone: "neu" },
];

const ratingTone = (r: string) =>
  r === "Unacceptable" ? "bad" : r === "Tolerable" ? "warn" : r === "Acceptable" ? "good" : "neutral";

type Filter = "all" | "priority" | "unverified" | "repeat" | "carried" | "nocover" | "context";

export default function ClosurePage() {
  const router = useRouter();
  const responses = useResponses();
  const findings = useVisitFindings();
  const verifications = useVerifications();
  const patchVerification = useStore((s) => s.patchVerification);
  const addProgress = useStore((s) => s.addProgress);
  const [progressText, setProgressText] = useState("");
  const updateFinding = useStore((s) => s.updateFinding);
  const entity = useEntity();
  const entityCode = useEntityCode();
  const visitId = useVisitId();

  /* Everything an earlier visit at this entity left open — the seeded 2025
     findings and any finding this app raised on a previous visit that nobody
     closed. Both are the same question in front of the asset. */
  const outstanding = useOutstanding();

  const visitLabel =
    PROGRAMME_VISITS.find((v) => v.id === visitId)?.label ?? visitId;
  const nextVisit = PROGRAMME_VISITS.filter(
    (v) => v.entity === entityCode && v.id > visitId
  )[0];

  const [filter, setFilter] = useState<Filter>("all");
  /* The closure conversation happens with ONE discipline in the room. O.R.
     Tambo carries 33 open items; fifteen rows of somebody else's assets is
     what derails the meeting, and the Electrical lead scrolling past Civil to
     find their own is the failure mode this prevents. */
  const [discipline, setDiscipline] = useState<string>("all");
  const [activePf, setActivePf] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  /** Current rating of an asset system, from this visit's captured data.
   *  Shared with the dashboard — see currentRatingOf in carryforward.ts. */
  const currentRating = (discipline: string, system: string) =>
    currentRatingOf(
      checksOf(entityCode, discipline, system),
      findings.filter((f) => f.discipline === discipline && f.system === system),
      responses
    );

  const list = useMemo(() => {
    let l = outstanding;
    /* CONTEXT IS NOT WORK, so it is not in the list by default. An item rated
       Acceptable needed no mitigation, so there is nothing to verify was
       implemented — counting it as outstanding makes the real number look
       bigger than it is. It is not hidden: the chip below says how many there
       are and shows them. */
    l = filter === "context" ? l.filter((p) => !carriesWork(p)) : l.filter(carriesWork);
    if (discipline !== "all") l = l.filter((p) => p.discipline === discipline);
    if (filter === "priority") l = l.filter((p) => p.rating === "Unacceptable" || p.rating === "Tolerable");
    if (filter === "unverified") l = l.filter((p) => !verifications[p.key]?.outcome);
    if (filter === "repeat") l = l.filter((p) => verifications[p.key]?.outcome === "Open - repeat");
    if (filter === "carried") l = l.filter((p) => p.source === "carried");
    if (filter === "nocover")
      l = l.filter((p) => checksOf(entityCode, p.discipline, p.system).length === 0);
    return l;
  }, [entityCode, filter, discipline, verifications, outstanding]);

  const active = list.find((p) => p.key === activePf) ?? list[0];
  const v = active ? verifications[active.key] : undefined;
  /* Read across every visit, not just this one — see historyFor(). */
  const history = useHistory(active?.key ?? "");

  const carries = useMemo(() => outstanding.filter(carriesWork), [outstanding]);
  const context = useMemo(() => outstanding.filter((p) => !carriesWork(p)), [outstanding]);
  /* The disciplines actually present in what carries, so the picker never
     offers a discipline with nothing behind it. */
  const disciplines = useMemo(
    () => [...new Set(carries.map((p) => p.discipline))].sort(),
    [carries]
  );

  const counts = {
    closed: outstanding.filter((p) => verifications[p.key]?.outcome === "Closed").length,
    partial: outstanding.filter((p) => verifications[p.key]?.outcome === "Partially closed").length,
    repeat: outstanding.filter((p) => verifications[p.key]?.outcome === "Open - repeat").length,
    unverified: outstanding.filter((p) => !verifications[p.key]?.outcome).length,
    carried: outstanding.filter((p) => p.source === "carried").length,
    nocover: outstanding.filter((p) => checksOf(entityCode, p.discipline, p.system).length === 0)
      .length,
  };

  const linked = active ? checksOf(entityCode, active.discipline, active.system) : [];
  const linkedNC = linked.filter((c) => responses[c.id]?.compliance === "NC").length;
  const cur = active ? currentRating(active.discipline, active.system) : "";
  const move = active ? movement(active.rating, cur) : null;

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 pb-16">
        <div className="mb-4">
          <h2 className="text-[18px] font-bold">
            Outstanding at {entity.short} · closure verification
          </h2>
          <p className="mt-1 max-w-[78ch] text-[12.5px]" style={{ color: "var(--ink-2)" }}>
            {outstanding.length === 0 ? (
              <>Nothing is outstanding at {entity.name} coming into {visitLabel}.</>
            ) : (
              <>
                {outstanding.length} item{outstanding.length === 1 ? "" : "s"} left open by earlier
                visits — {outstanding.length - counts.carried} from the 2025 audit,{" "}
                {counts.carried} raised in this system and never closed.{" "}
                {outstanding.length - counts.unverified} of {outstanding.length} verified on{" "}
                {visitLabel}.
              </>
            )}
          </p>
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-[9px] md:grid-cols-5">
          {[
            ["Verified closed", counts.closed, "good"],
            ["Partially closed", counts.partial, "warn"],
            ["Still open — repeat", counts.repeat, "bad"],
            ["Not yet verified", counts.unverified, "neu"],
            ["Carried from a visit", counts.carried, "acc"],
          ].map(([label, value, tone]) => (
            <div
              key={label as string}
              className="relative overflow-hidden rounded-[15px] border px-[15px] py-[13px]"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <span className="absolute inset-x-0 top-0 h-[2.5px]" style={{ background: `var(--${tone})` }} />
              <b className="block font-mono text-[23px] leading-[1.15] font-semibold tnum" style={{ color: `var(--${tone})` }}>
                {value as number}
              </b>
              <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                {label as string}
              </span>
            </div>
          ))}
        </div>

        <Panel tone="accent" className="mb-3.5">
          <div className="flex items-start gap-2.5 text-[11.5px]" style={{ color: "var(--acc)" }}>
            <IconLoop width={14} height={14} style={{ marginTop: 1 }} />
            <span>
              Findings carry on the <b>3-year cycle</b>. Anything still open when this visit ends
              reappears{nextVisit ? ` at ${nextVisit.label}` : " on the next visit"} with its owner,
              due date and evidence trail intact — and marking one <b>Closed</b> here closes the
              finding itself, so it stops carrying.
            </span>
          </div>
        </Panel>

        {disciplines.length > 1 && (
          <div className="mb-2 flex flex-wrap items-center gap-[6px]">
            <span className="label-xs" style={{ color: "var(--ink-3)" }}>
              Discipline
            </span>
            {["all", ...disciplines].map((d) => (
              <button
                key={d}
                onClick={() => setDiscipline(d)}
                className="min-h-[44px] rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)]"
                style={
                  discipline === d
                    ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }
                    : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                }
              >
                {d === "all" ? `All ${carries.length}` : `${d} (${carries.filter((p) => p.discipline === d).length})`}
              </button>
            ))}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-[6px]">
          {(
            [
              ["all", `Carries work (${carries.length})`],
              ["priority", "Was Unacceptable / Tolerable"],
              ["unverified", "Not yet verified"],
              ["repeat", "Repeats"],
              ["carried", `Carried forward (${counts.carried})`],
              ["nocover", "Not covered this visit"],
              ...(context.length
                ? ([["context", `Context only (${context.length})`]] as [Filter, string][])
                : []),
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className="rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)]"
              style={
                filter === k
                  ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                  : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-[15px] border" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
            {list.length === 0 ? (
              <Empty>Nothing matches this filter.</Empty>
            ) : (
              list.map((p) => {
                const o = verifications[p.key]?.outcome;
                const on = p.key === active?.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setActivePf(p.key)}
                    className="relative flex w-full items-start gap-2 border-b px-[11px] py-[9px] text-left transition-[var(--t)]"
                    style={{ borderColor: "var(--line)", background: on ? "var(--acc-soft)" : "transparent" }}
                  >
                    {on && <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: "var(--acc)" }} />}
                    <Dot
                      tone={
                        o === "Closed" ? "good" : o === "Open - repeat" ? "bad" : o ? "warn" : "pending"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {p.key} · {p.system} · {p.originLabel}
                      </span>
                      <span className="mt-[1px] block truncate text-[11.5px]">{p.finding}</span>
                    </span>
                    <span className="mt-[2px]">
                      <Pill tone={ratingTone(p.rating)}>{p.rating.slice(0, 4).toUpperCase()}</Pill>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {active && (
            <div className="rounded-[15px] border p-[18px]" style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "var(--e2)" }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-[7px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                <span>{active.key}</span>
                <span>·</span>
                <span>{active.discipline}</span>
                <span>·</span>
                <span>{active.system}</span>
                <Pill tone={ratingTone(active.rating)}>
                  {active.originLabel.toUpperCase()} {active.rating.toUpperCase()}
                </Pill>
                {active.source === "carried" && <Pill tone="accent">CARRIED FORWARD</Pill>}
                {(() => {
                  const n = visitsOpen(active, entityCode, visitId);
                  return n > 0 ? (
                    <Pill tone="bad">
                      OPEN ACROSS {n + 1} VISIT{n ? "S" : ""}
                    </Pill>
                  ) : null;
                })()}
                {active.owner && <span>· {active.owner}</span>}
                {active.dueDate && <span>· due {active.dueDate}</span>}
              </div>
              <h3 className="mb-1 text-[14.5px] leading-[1.35] font-bold">{active.finding}</h3>

              {/* lifecycle */}
              <div
                className="no-scrollbar my-3 flex items-center overflow-x-auto rounded-[11px] border px-[13px] py-[11px]"
                style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
              >
                {[
                  { n: "✓", t: "Raised", s: active.originLabel, done: true },
                  {
                    n: "2",
                    t: "Remediated",
                    s: `by ${entity.short}`,
                    done: !!v?.outcome && v.outcome !== "Not verified",
                  },
                  { n: "3", t: "Verified", s: visitLabel, done: !!v?.outcome, now: !v?.outcome },
                  {
                    n: "4",
                    t: v?.outcome === "Closed" ? "Closed" : "Re-check",
                    s: v?.outcome === "Closed" ? "does not carry" : (nextVisit?.label ?? "next visit"),
                    done: v?.outcome === "Closed",
                  },
                ].map((step, i, arr) => (
                  <span key={step.t} className="flex shrink-0 items-center">
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className="flex h-[20px] w-[20px] items-center justify-center rounded-full font-mono text-[8.5px] font-semibold"
                        style={{
                          background: step.done ? "var(--good)" : step.now ? "var(--acc)" : "var(--line)",
                          color: step.done ? "#fff" : step.now ? "var(--on-acc)" : "var(--ink-3)",
                          boxShadow: step.now ? "0 0 0 3px var(--acc-soft)" : "none",
                        }}
                      >
                        {step.done ? "✓" : step.n}
                      </span>
                      <span>
                        <b className="block font-display text-[10px] font-semibold whitespace-nowrap">{step.t}</b>
                        <span className="text-[9px] whitespace-nowrap" style={{ color: "var(--ink-4)" }}>
                          {step.s}
                        </span>
                      </span>
                    </span>
                    {i < arr.length - 1 && (
                      <span
                        className="mx-2 h-[1.5px] w-[20px] shrink-0 rounded-[2px]"
                        style={{ background: step.done ? "var(--good-line)" : "var(--line)" }}
                      />
                    )}
                  </span>
                ))}
              </div>

              <div className="mb-2 flex items-center justify-between">
                <b className="font-display text-[11px] font-semibold">Verification</b>
                <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  what did you find this time?
                </span>
              </div>
              <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-4">
                {OUTCOMES.map(({ key, label, Icon, tone }) => {
                  const on = v?.outcome === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        const outcome = on ? null : key;
                        patchVerification(active.key, {
                          outcome,
                          verifiedAt: Date.now(),
                        });
                        /* A carried finding is a real record, not a row in a
                           list. Closing it here has to close it there, or it
                           reappears on the next visit having been verified
                           closed on this one. Un-picking reopens it for the
                           same reason. */
                        if (active.findingId) {
                          updateFinding(active.findingId, {
                            actionStatus:
                              outcome === "Closed"
                                ? "Closed"
                                : outcome === "Partially closed"
                                  ? "In progress"
                                  : "Open",
                          });
                        }
                        if (!on) say(`${active.key} — ${label}`);
                      }}
                      className="flex min-h-[56px] flex-col items-center justify-center gap-[5px] rounded-[11px] border-[1.5px] px-1 py-2.5 font-display text-[10.5px] font-semibold transition-[var(--t)] hover:-translate-y-[1px]"
                      style={
                        on
                          ? { background: `var(--${tone}-bg)`, borderColor: `var(--${tone})`, color: `var(--${tone})` }
                          : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                      }
                    >
                      <Icon width={15} height={15} />
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 mb-2 font-display text-[11px] font-semibold">Evidence of closure</div>
              <textarea
                value={v?.evidence ?? ""}
                onChange={(e) => patchVerification(active.key, { evidence: e.target.value })}
                placeholder="What proves it was fixed…"
                className="min-h-[70px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />

              {/* What must still happen. Shown for anything that is not
                  Closed, and recorded against the CARRIED item rather than
                  raised as a new finding — a new finding breaks the chain back
                  to the audit that found it, and the same problem then reads
                  as two. */}
              {v?.outcome && v.outcome !== "Closed" && (
                <>
                  <div className="mt-4 mb-2 font-display text-[11px] font-semibold">
                    Mitigation action — what must still happen
                  </div>
                  <textarea
                    value={v?.action ?? ""}
                    onChange={(e) => patchVerification(active.key, { action: e.target.value })}
                    placeholder="What is outstanding, and who has it…"
                    className="min-h-[60px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                    style={{
                      background: "var(--panel)",
                      borderColor: v?.action ? "var(--line-2)" : "var(--warn-line)",
                    }}
                  />
                </>
              )}

              {/* The dated log. ACSA's Progress/Update is one cell that gets
                  typed over; this appends, keeping the author, the time and
                  the visit, and the export flattens it back into their cell. */}
              <div className="mt-4 mb-2 font-display text-[11px] font-semibold">Progress</div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={progressText}
                  onChange={(e) => setProgressText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && progressText.trim()) {
                      addProgress(active.key, progressText);
                      setProgressText("");
                      say("Progress recorded");
                    }
                  }}
                  placeholder="What moved, in one line…"
                  className="min-w-0 flex-1 rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                />
                <Btn
                  disabled={!progressText.trim()}
                  onClick={() => {
                    addProgress(active.key, progressText);
                    setProgressText("");
                    say("Progress recorded");
                  }}
                >
                  Add to the log
                </Btn>
              </div>

              {/* Every audit that touched this, in order. */}
              <ItemTimeline
                history={history}
                priorLabel={active.originLabel}
                priorRating={active.rating}
              />

              <div className="mt-4 mb-2 flex items-center justify-between">
                <b className="font-display text-[11px] font-semibold">
                  {visitLabel} checks covering {active.system}
                </b>
                <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  {linked.length} linked · {linkedNC} NC · current: {cur}
                </span>
              </div>

              {linked.length === 0 ? (
                <Panel tone="warn">
                  <div className="text-[11.5px]" style={{ color: "var(--warn)" }}>
                    <b>Coverage guard:</b> no check-point in this visit&apos;s scope covers{" "}
                    <b>{active.system}</b>. Closure cannot be evidenced from the register — add a check
                    or record it as an ad-hoc finding in the field.
                  </div>
                </Panel>
              ) : (
                <div className="max-h-[220px] overflow-y-auto rounded-[11px] border" style={{ borderColor: "var(--line)" }}>
                  {linked.map((c) => {
                    const rr = responses[c.id];
                    return (
                      <button
                        key={c.id}
                        onClick={() => router.push(`/capture?check=${c.id}`)}
                        className="flex w-full items-start gap-2 border-b px-[11px] py-2 text-left transition-[var(--t)] hover:bg-[var(--sunken)]"
                        style={{ borderColor: "var(--line)" }}
                      >
                        <Dot
                          tone={
                            !rr?.captured
                              ? "pending"
                              : rr.compliance === "NC"
                                ? "bad"
                                : rr.compliance === "C"
                                  ? "good"
                                  : rr.compliance === "NV"
                                    ? "warn"
                                    : "neutral"
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            {c.id}
                          </span>
                          <span className="block truncate text-[11.5px]">{c.requirement}</span>
                        </span>
                        <span className="mt-[2px]">
                          <Pill
                            tone={
                              rr?.compliance === "NC"
                                ? "bad"
                                : rr?.compliance === "C"
                                  ? "good"
                                  : rr?.compliance === "NV"
                                    ? "warn"
                                    : "neutral"
                            }
                          >
                            {rr?.compliance ?? "OPEN"}
                          </Pill>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5" style={{ borderColor: "var(--line)" }}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
                    current: <b style={{ color: "var(--ink)" }}>{cur}</b>
                  </span>
                  {move && (
                    <Pill tone={move === "Improved" ? "good" : move === "Worsened" ? "bad" : "warn"}>
                      {move === "Improved" ? "↑" : move === "Worsened" ? "↓" : "→"} {move}
                    </Pill>
                  )}
                </div>
                <Btn
                  variant="primary"
                  onClick={() => {
                    const i = list.findIndex((p) => p.key === active.key);
                    setActivePf(list[i + 1]?.key ?? active.key);
                    say(`${active.key} saved`);
                  }}
                >
                  <IconCheck width={14} height={14} />
                  Save &amp; next
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>

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
