"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PRIOR, checksOf, useStore } from "@/lib/store";
import { bandFor, movement } from "@/lib/risk";
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

type Filter = "all" | "priority" | "unverified" | "repeat" | "nocover";

export default function ClosurePage() {
  const router = useRouter();
  const responses = useStore((s) => s.responses);
  const findings = useStore((s) => s.findings);
  const verifications = useStore((s) => s.verifications);
  const patchVerification = useStore((s) => s.patchVerification);

  const [filter, setFilter] = useState<Filter>("all");
  const [activePf, setActivePf] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  /** Current rating of an asset system, from this visit's captured data. */
  const currentRating = (discipline: string, system: string) => {
    const cs = checksOf(discipline, system);
    if (cs.length === 0) return "No coverage";
    const bands = findings
      .filter((f) => f.discipline === discipline && f.system === system)
      .map((f) => bandFor(f.severity, f.likelihood));
    if (bands.includes("Red")) return "Unacceptable";
    if (bands.includes("Amber")) return "Tolerable";
    if (cs.some((c) => responses[c.id]?.compliance === "NC")) return "Pending rating";
    if (cs.some((c) => responses[c.id]?.captured)) return "Acceptable";
    return "Not assessed";
  };

  const list = useMemo(() => {
    let l = PRIOR;
    if (filter === "priority") l = l.filter((p) => p.rating === "Unacceptable" || p.rating === "Tolerable");
    if (filter === "unverified") l = l.filter((p) => !verifications[p.pf]?.outcome);
    if (filter === "repeat") l = l.filter((p) => verifications[p.pf]?.outcome === "Open - repeat");
    if (filter === "nocover") l = l.filter((p) => checksOf(p.discipline, p.system).length === 0);
    return l;
  }, [filter, verifications]);

  const active = list.find((p) => p.pf === activePf) ?? list[0];
  const v = active ? verifications[active.pf] : undefined;

  const counts = {
    closed: PRIOR.filter((p) => verifications[p.pf]?.outcome === "Closed").length,
    partial: PRIOR.filter((p) => verifications[p.pf]?.outcome === "Partially closed").length,
    repeat: PRIOR.filter((p) => verifications[p.pf]?.outcome === "Open - repeat").length,
    unverified: PRIOR.filter((p) => !verifications[p.pf]?.outcome).length,
    nocover: PRIOR.filter((p) => checksOf(p.discipline, p.system).length === 0).length,
  };

  const linked = active ? checksOf(active.discipline, active.system) : [];
  const linkedNC = linked.filter((c) => responses[c.id]?.compliance === "NC").length;
  const cur = active ? currentRating(active.discipline, active.system) : "";
  const move = active ? movement(active.rating, cur) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 pb-16">
        <div className="mb-4">
          <h2 className="text-[18px] font-bold">2025 findings · closure verification</h2>
          <p className="mt-1 max-w-[78ch] text-[12.5px]" style={{ color: "var(--ink-2)" }}>
            All {PRIOR.length} findings from the March 2025 ACSA audit, pre-loaded.{" "}
            {PRIOR.length - counts.unverified} of {PRIOR.length} verified this visit.
          </p>
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-[9px] md:grid-cols-5">
          {[
            ["Verified closed", counts.closed, "good"],
            ["Partially closed", counts.partial, "warn"],
            ["Still open — repeat", counts.repeat, "bad"],
            ["Not yet verified", counts.unverified, "neu"],
            ["No check covers it", counts.nocover, "acc"],
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
              Findings carry on the <b>3-year cycle</b>. Anything left open here reappears at March 2027
              with its owner, due date and evidence trail intact.
            </span>
          </div>
        </Panel>

        <div className="mb-3 flex flex-wrap gap-[6px]">
          {(
            [
              ["all", `All ${PRIOR.length}`],
              ["priority", "Was Unacceptable / Tolerable"],
              ["unverified", "Not yet verified"],
              ["repeat", "Repeats"],
              ["nocover", "No 2026 coverage"],
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
                const o = verifications[p.pf]?.outcome;
                const on = p.pf === active?.pf;
                return (
                  <button
                    key={p.pf}
                    onClick={() => setActivePf(p.pf)}
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
                        {p.pf} · {p.system}
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
                <span>{active.pf}</span>
                <span>·</span>
                <span>{active.discipline}</span>
                <span>·</span>
                <span>{active.system}</span>
                <Pill tone={ratingTone(active.rating)}>MAR 2025 {active.rating.toUpperCase()}</Pill>
              </div>
              <h3 className="mb-1 text-[14.5px] leading-[1.35] font-bold">{active.finding}</h3>

              {/* lifecycle */}
              <div
                className="no-scrollbar my-3 flex items-center overflow-x-auto rounded-[11px] border px-[13px] py-[11px]"
                style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
              >
                {[
                  { n: "✓", t: "Raised", s: "Mar 2025", done: true },
                  { n: "2", t: "Remediated", s: "by KSIA", done: !!v?.outcome && v.outcome !== "Not verified" },
                  { n: "3", t: "Verified", s: "Sep 2026", done: !!v?.outcome, now: !v?.outcome },
                  { n: "4", t: "Re-check", s: "Mar 2027", done: false },
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
                        patchVerification(active.pf, {
                          outcome: on ? null : key,
                          verifiedAt: Date.now(),
                        });
                        if (!on) say(`${active.pf} — ${label}`);
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
                onChange={(e) => patchVerification(active.pf, { evidence: e.target.value })}
                placeholder="What proves it was fixed…"
                className="min-h-[70px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[12.5px] outline-none focus:border-[var(--acc)]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />

              <div className="mt-4 mb-2 flex items-center justify-between">
                <b className="font-display text-[11px] font-semibold">
                  Sep 2026 checks covering {active.system}
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
                    const i = list.findIndex((p) => p.pf === active.pf);
                    setActivePf(list[i + 1]?.pf ?? active.pf);
                    say(`${active.pf} saved`);
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
          className="fixed bottom-[22px] left-1/2 z-[100] -translate-x-1/2 rounded-[11px] px-[15px] py-2.5 text-[12px] font-medium"
          style={{ background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--e3)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
