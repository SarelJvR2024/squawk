"use client";

/** The screen the app opens on.
 *
 *  Before this, opening Squawk put you straight into the capture workspace: a
 *  three-pane check-list with a discipline rail, a chip grid and 315 rows of
 *  work, before anybody had said which audit you were in or what was waiting.
 *  It is the right screen to WORK in and the wrong one to ARRIVE at — and for
 *  somebody new it is unreadable as a system, because nothing on it says there
 *  are six other screens or what order they come in.
 *
 *  So this is an orientation screen, and deliberately not a second dashboard.
 *  /dashboard is the ANALYTICAL view — compliance, ACSA's B170 001M risk
 *  profile, movement against 2025, the ten-site portfolio table. Not one of
 *  those appears here. This screen answers four questions about WORK:
 *
 *    what is next          the next site in the Round 1 calendar
 *    what is open          audits that hold work, and how far each has got
 *    where the year is     all ten windows, and how many have been started
 *    what just happened    the last things anybody did in the audit in view
 *
 *  Every number is derived. There is not a literal count anywhere in this file:
 *  the checklist length comes from this site's own applicability (324 at an
 *  international, 319 at a regional, 200 at Corporate Office), the desk and
 *  field totals from what the register's `vtype` declares, and the cross-audit
 *  figures from useAuditProgress — the named selector, because a screen may not
 *  reach into byVisit itself. */

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  checksAt,
  deskDone,
  fieldDone,
  priorFindingsAt,
  useAuditProgress,
  useCaptures,
  useEntity,
  useEntityCode,
  useResponses,
  useStore,
  useVerifications,
  useVisitFindings,
  useVisitHazards,
  useVisitId,
  useVisits,
  visitLabelFor,
} from "@/lib/store";
import {
  auditWindow,
  ENTITIES,
  entity as entityOf,
  PROGRAMME_VISITS,
  type Entity,
} from "@/lib/programme";
import { needsDesk, needsField } from "@/lib/verification";
import { portalIdFor } from "@/lib/sites";
import { Btn, Dot, Empty, Panel, Pill, Track } from "@/components/ui/primitives";
import {
  IconCamera,
  IconClipboard,
  IconFlag,
  IconGrid,
  IconLoop,
  IconPin,
} from "@/components/ui/icons";

/* ---------------------------------------------------------------- the flow

   The seven screens in the order the work actually happens, each naming its
   OWN route. The labels are the navigation's labels, not invented synonyms —
   an auditor told to "go to Follow-up" must find a destination called
   Follow-up. tests/home.test.mjs asserts every href here is a real route and
   every label matches the nav's, because a map of the system that has drifted
   from the system is worse than no map. */
const FLOW = [
  {
    href: "/capture",
    label: "Checks",
    icon: IconClipboard,
    line: "Work this site's checklist at a desk — collect the evidence, ask the questions, record the answer.",
  },
  {
    href: "/field",
    label: "Inspection",
    icon: IconPin,
    line: "Walk the assets. The check-points the register says must be seen on site, with photographs.",
  },
  {
    href: "/review",
    label: "Review",
    icon: IconCamera,
    line: "Every photograph and voice note, by discipline, with a thread for the engineers who were not there.",
  },
  {
    href: "/findings",
    label: "Asset Assurance",
    icon: IconLoop,
    line: "The band each asset system carries — agreed by the group on ACSA's B170 001M, with every finding, check and walk item behind it.",
  },
  {
    /* HIRA, matching the navigation exactly. An auditor told to go to HIRA has
       to find a destination called HIRA — a map that names a screen differently
       from the tab that opens it is a map you stop trusting. The route stays
       /hazards: renaming a URL to match a label is churn. */
    href: "/hazards",
    label: "HIRA",
    icon: IconFlag,
    line: "Consolidate findings into the hazardous event they expose, and rate that event on B170 001M.",
  },
  {
    href: "/closure",
    label: "Follow-up",
    icon: IconLoop,
    line: "Verify what earlier visits left open, and carry forward whatever is still not closed.",
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: IconGrid,
    line: "Compliance, the risk profile and movement against 2025 — this site, and the whole network.",
  },
] as const;

const DAY = 86400000;

/* ------------------------------------------------------------------ the clock

   THE CLOCK IS AN EXTERNAL SYSTEM, and it is read as one.

   This screen is server-rendered like every other one, and the store rehydrates
   from IndexedDB afterwards — so the first client render has to match the
   server's HTML exactly, or React tears the tree down and rebuilds it.
   Date.now() during render cannot do that, and reading it in an effect and
   calling setState is a cascading render the React lint rule correctly refuses.

   useSyncExternalStore is the mechanism meant for exactly this: the server
   snapshot is 0, which every reader below treats as "not known yet" and renders
   nothing for, and the client snapshot is a real time. Everything the clock
   touches is therefore ADDITIVE — it appears a frame after mount and nothing
   already on the screen changes.

   It ticks once a minute rather than being fixed at mount, because "2 min ago"
   left open on a stand for an hour is a lie the reader has no way to detect. */
const CLOCK_TICK = 60000;
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockSubs = new Set<() => void>();

function subscribeClock(onChange: () => void): () => void {
  clockSubs.add(onChange);
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const cb of clockSubs) cb();
    }, CLOCK_TICK);
  }
  return () => {
    clockSubs.delete(onChange);
    if (clockSubs.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}
/** Cached, because a snapshot that returns a new value on every call is an
 *  infinite render loop rather than a fresh reading. */
const clockSnapshot = () => (clockNow ||= Date.now());
const clockOnServer = () => 0;

/** Local midnight for a "YYYY-MM-DD" from the register's calendar. */
const dateOf = (iso: string) => new Date(`${iso}T00:00:00`).getTime();

/** How long ago something happened, in the shortest true form.
 *
 *  Beyond a week it becomes a date: "9 d ago" is arithmetic the reader has to
 *  do, and by then what they want is which day. */
function ago(at: number, now: number): string {
  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/** Where today sits against an audit window, in words rather than a colour. */
function windowState(e: Entity, now: number): { text: string; tone: "accent" | "warn" | "neutral" } {
  const from = dateOf(e.auditFrom);
  const to = dateOf(e.auditTo) + DAY;
  if (now < from) {
    const days = Math.ceil((from - now) / DAY);
    return { text: days === 1 ? "starts tomorrow" : `starts in ${days} days`, tone: "accent" };
  }
  if (now < to) return { text: "window open now", tone: "warn" };
  return { text: "window has passed", tone: "neutral" };
}

type Event = { at: number; what: string; detail: string; tone: "good" | "bad" | "warn" | "accent" };

export default function HomePage() {
  const entityCode = useEntityCode();
  const entity = useEntity();
  const visitId = useVisitId();
  const visits = useVisits(entityCode);
  const responses = useResponses();
  const verifications = useVerifications();
  const captures = useCaptures();
  const findings = useVisitFindings();
  const hazards = useVisitHazards();
  const progress = useAuditProgress();
  const openAudit = useStore((s) => s.openAudit);

  /** 0 until the device's clock is known — see subscribeClock above. */
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, clockOnServer);

  const visitLabel = visits.find((v) => v.id === visitId)?.label ?? visitId;
  const visitNote = visits.find((v) => v.id === visitId)?.note ?? "";

  /* This site's checklist, and the two halves the register routes it into.
     Never the register: 324 is not the denominator at seven of the ten sites,
     and a ring drawn against it would never reach 100% at any of them. */
  const checks = useMemo(() => checksAt(entityCode), [entityCode]);
  const desk = useMemo(() => {
    const scope = checks.filter(needsDesk);
    return { done: scope.filter((c) => deskDone(responses[c.id])).length, total: scope.length };
  }, [checks, responses]);
  const field = useMemo(() => {
    const scope = checks.filter(needsField);
    return { done: scope.filter((c) => fieldDone(responses[c.id])).length, total: scope.length };
  }, [checks, responses]);
  const complete = useMemo(
    () => checks.filter((c) => responses[c.id]?.captured).length,
    [checks, responses]
  );

  /* A rating nobody confirmed is not a rating, so the unrated count is the work
     outstanding rather than a defect in the finding. */
  const unrated = findings.filter(
    (f) => !(f.ratingConfirmed && f.severity && f.likelihood)
  ).length;

  const prior = useMemo(() => priorFindingsAt(entityCode), [entityCode]);
  const verified = prior.filter((p) => verifications[p.portalId]?.outcome).length;

  /* The programme in calendar order — the file lists Round 1 in order already,
     but sorting on the date means it stays right when the eleventh entity is
     added in the middle of it. */
  const calendar = useMemo(
    () => [...ENTITIES].sort((a, b) => a.auditFrom.localeCompare(b.auditFrom)),
    []
  );

  /* Which audits hold work at all. An audit with a scope row but nothing in it
     is one somebody opened and left, and it is not "in progress". */
  const open = useMemo(
    () => progress.filter((r) => r.complete + r.findings + r.hazards + r.media > 0),
    [progress]
  );
  const startedEntities = useMemo(() => new Set(open.map((r) => r.entity)), [open]);

  /* WHAT IS NEXT, without asking the clock.
   *
   *  The first site in the Round 1 calendar that nobody has started. That is a
   *  fact about the work rather than about the date, so it is the same on the
   *  server and on the device, and it stays true if the programme slips. Where
   *  every site has been started there is nothing next, and the panel says so
   *  rather than pointing at the last one again. */
  const next = calendar.find((e) => !startedEntities.has(e.code)) ?? null;
  const nextVisit = useMemo(() => {
    if (!next) return null;
    const mine = PROGRAMME_VISITS.filter((v) => v.entity === next.code);
    return (
      mine.find((v) => v.state === "current") ??
      mine.find((v) => v.state === "scheduled") ??
      mine[mine.length - 1] ??
      null
    );
  }, [next]);
  const nextIsOpen = !!next && next.code === entityCode && nextVisit?.id === visitId;

  /* ------------------------------------------------ what was just done

     Scoped to the audit in view, deliberately. "Recently" across ten sites is a
     feed; what an auditor sitting down at King Shaka needs is the last few
     things that happened in King Shaka's September visit. */
  const recent = useMemo<Event[]>(() => {
    const out: Event[] = [];
    for (const r of Object.values(responses)) {
      const id = portalIdFor(entityCode, r.checkId);
      if (r.deskDoneAt) out.push({ at: r.deskDoneAt, what: "Desk half saved", detail: id, tone: "accent" });
      if (r.fieldDoneAt) out.push({ at: r.fieldDoneAt, what: "Seen on site", detail: id, tone: "good" });
    }
    for (const f of findings) {
      if (f.createdAt) out.push({ at: f.createdAt, what: "Finding raised", detail: f.title, tone: "bad" });
    }
    for (const h of hazards) {
      if (h.createdAt) out.push({ at: h.createdAt, what: "Hazard raised", detail: h.event, tone: "warn" });
    }
    for (const v of Object.values(verifications)) {
      if (v.verifiedAt && v.outcome)
        out.push({ at: v.verifiedAt, what: `2025 finding — ${v.outcome}`, detail: v.pf, tone: "good" });
    }
    for (const c of captures) {
      if (c.createdAt)
        out.push({
          at: c.createdAt,
          what: c.kind === "voice" ? "Voice note captured" : "Photograph captured",
          detail: c.name,
          tone: "accent",
        });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 7);
  }, [responses, findings, hazards, verifications, captures, entityCode]);

  const card = "rounded-[15px] border p-[17px]";
  const cardStyle = { background: "var(--panel)", borderColor: "var(--line)" };

  const stat = (label: string, value: string, sub: string, pct: number | null, tone: string) => (
    <div key={label} className="relative overflow-hidden rounded-[15px] border px-[15px] py-[13px]" style={cardStyle}>
      <span className="absolute inset-x-0 top-0 h-[2.5px]" style={{ background: `var(--${tone})` }} />
      <span className="label-xs block">{label}</span>
      <b
        className="tnum mt-[3px] block font-mono text-[21px] leading-[1.15] font-semibold"
        style={{ color: `var(--${tone})` }}
      >
        {value}
      </b>
      {pct !== null && (
        <span className="mt-[7px] block">
          <Track pct={pct} color={`var(--${tone})`} />
        </span>
      )}
      <span className="mt-[6px] block text-[10.5px]" style={{ color: "var(--ink-3)" }}>
        {sub}
      </span>
    </div>
  );

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-5 pt-5 pb-16">
        {/* ------------------------------------------------------- next up */}
        <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1.25fr_1fr]">
          <section aria-labelledby="home-next" className={card} style={cardStyle}>
            <span className="label-xs">Next in the programme</span>
            {next && nextVisit ? (
              <>
                <h2 id="home-next" className="mt-[5px] flex flex-wrap items-center gap-2 text-[19px] font-bold">
                  {next.name}
                  <Pill tone="accent">{next.short}</Pill>
                  {nextIsOpen && <Pill tone="good">OPEN NOW</Pill>}
                </h2>
                <p className="mt-[6px] text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                  {auditWindow(next.auditFrom, next.auditTo)} · {nextVisit.label} · {nextVisit.note}
                </p>
                <p className="mt-[3px] text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  {checksAt(next.code).length} check-points on this site&apos;s list
                  {now > 0 ? ` · ${windowState(next, now).text}` : ""}
                </p>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {!nextIsOpen && (
                    <Btn variant="primary" onClick={() => openAudit(next.code, nextVisit.id)}>
                      Open {next.short} · {nextVisit.label}
                    </Btn>
                  )}
                  <Link href="/capture" className="no-underline">
                    <Btn variant={nextIsOpen ? "primary" : "default"}>Start with Checks</Btn>
                  </Link>
                  <Link href="/preflight" className="no-underline">
                    <Btn>Check this device</Btn>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 id="home-next" className="mt-[5px] text-[19px] font-bold">
                  Every site in Round 1 has been started
                </h2>
                <p className="mt-[6px] text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                  There is no unstarted audit left in the programme. Pick up an open one below, or
                  add the next visit from Audits in the header.
                </p>
              </>
            )}
          </section>

          {/* --------------------------------------------------- open now */}
          <section aria-labelledby="home-open" className={card} style={cardStyle}>
            <span className="label-xs">The audit you are in</span>
            <h2 id="home-open" className="mt-[5px] flex flex-wrap items-baseline gap-2 text-[15px] font-bold">
              {entity.short}
              <span className="text-[12.5px] font-normal" style={{ color: "var(--ink-2)" }}>
                {visitLabel}
                {visitNote ? ` · ${visitNote}` : ""}
              </span>
            </h2>
            <div className="mt-3">
              <div className="mb-[6px] flex items-baseline justify-between gap-2">
                <span className="text-[11.5px]" style={{ color: "var(--ink-2)" }}>
                  Check-points complete
                </span>
                <b className="tnum font-mono text-[13px] font-semibold">
                  {complete}
                  <span style={{ color: "var(--ink-4)" }}>/{checks.length}</span>
                </b>
              </div>
              <Track pct={checks.length ? (complete / checks.length) * 100 : 0} />
              <p className="mt-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
                Complete means every mode the register declares for a check has been answered — a
                document read <em>and</em> the asset seen, where it asks for both.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/capture" className="no-underline">
                <Btn>Continue at the desk</Btn>
              </Link>
              <Link href="/field" className="no-underline">
                <Btn>Go out and walk</Btn>
              </Link>
            </div>
          </section>
        </div>

        {/* --------------------------------------------------------- stats */}
        <section aria-label="This audit at a glance" className="mb-3.5 grid grid-cols-2 gap-[9px] md:grid-cols-4">
          {stat(
            "At the desk",
            `${desk.done}/${desk.total}`,
            "evidence collected and questions asked",
            desk.total ? (desk.done / desk.total) * 100 : 0,
            "acc"
          )}
          {stat(
            "On site",
            `${field.done}/${field.total}`,
            "the asset itself seen and photographed",
            field.total ? (field.done / field.total) * 100 : 0,
            "good"
          )}
          {stat(
            "Findings",
            String(findings.length),
            unrated
              ? `${unrated} still waiting for the group to agree a rating`
              : "every finding carries an agreed rating",
            null,
            "bad"
          )}
          {stat(
            "2025 follow-up",
            `${verified}/${prior.length}`,
            prior.length ? "carried findings verified this visit" : "a baseline audit — nothing carried in",
            prior.length ? (verified / prior.length) * 100 : 0,
            "warn"
          )}
        </section>

        {/* -------------------------------------- open audits · just done */}
        <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1.25fr_1fr]">
          <section aria-labelledby="home-inprogress" className={card} style={cardStyle}>
            <h2 id="home-inprogress" className="mb-[3px] text-[12.5px] font-bold">
              Audits with work in them
            </h2>
            <p className="mb-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
              Every site and visit that holds captured work, most recently touched first.
            </p>
            {open.length === 0 ? (
              <Empty>
                Nothing captured yet. Open an audit above and the first saved answer puts it here.
              </Empty>
            ) : (
              <div className="flex flex-col gap-1.5">
                {open.map((r) => {
                  const on = r.entity === entityCode && r.visit === visitId;
                  const e = entityOf(r.entity);
                  /* An audit created in the app is not in the programme file,
                     so the raw id is the fallback — and "2026-11" beside a site
                     code is not a date anybody reads. visitLabelFor turns it
                     into the same "Nov 2026" the seeded ones show. */
                  const label =
                    PROGRAMME_VISITS.find((v) => v.entity === r.entity && v.id === r.visit)?.label ??
                    visitLabelFor(r.visit);
                  return (
                    <div
                      key={`${r.entity}/${r.visit}`}
                      className="rounded-[11px] border px-[12px] py-[10px]"
                      style={
                        on
                          ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)" }
                          : { background: "var(--panel)", borderColor: "var(--line-2)" }
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Dot
                          tone={on ? "accent" : "good"}
                          label={on ? "The audit you are in" : "Has captured work"}
                        />
                        <b className="font-display text-[12.5px] font-semibold">{e.short}</b>
                        <span className="text-[11.5px]" style={{ color: "var(--ink-2)" }}>
                          {label}
                        </span>
                        {on && <Pill tone="accent">OPEN NOW</Pill>}
                        <span className="tnum ml-auto font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
                          {r.complete}/{r.checks}
                        </span>
                        {!on && (
                          <Btn
                            className="tap-tight"
                            onClick={() => openAudit(r.entity, r.visit)}
                            aria-label={`Open ${e.short} ${label}`}
                          >
                            Open
                          </Btn>
                        )}
                      </div>
                      <div className="mt-[7px]">
                        <Track
                          pct={r.checks ? (r.complete / r.checks) * 100 : 0}
                          color={on ? "var(--acc)" : "var(--good)"}
                        />
                      </div>
                      <div className="mt-[6px] text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                        {r.findings} finding{r.findings === 1 ? "" : "s"} · {r.hazards} hazard
                        {r.hazards === 1 ? "" : "s"} · {r.media} photograph{r.media === 1 ? "" : "s"} and
                        voice note{r.media === 1 ? "" : "s"}
                        {now > 0 && r.lastActivityAt > 0 ? ` · ${ago(r.lastActivityAt, now)}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="home-recent" className={card} style={cardStyle}>
            <h2 id="home-recent" className="mb-[3px] text-[12.5px] font-bold">
              Just done
            </h2>
            <p className="mb-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
              The last things anybody did in {entity.short} {visitLabel}.
            </p>
            {recent.length === 0 ? (
              <Empty>Nothing recorded in this audit yet.</Empty>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {recent.map((ev, i) => (
                  <li key={`${ev.at}-${i}`} className="flex gap-2">
                    <Dot tone={ev.tone} label={ev.what} />
                    <span className="min-w-0 flex-1">
                      <b className="block text-[11.5px] font-semibold">{ev.what}</b>
                      <span className="block truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                        {ev.detail}
                      </span>
                    </span>
                    {now > 0 && (
                      <span className="shrink-0 font-mono text-[9.5px] whitespace-nowrap" style={{ color: "var(--ink-4)" }}>
                        {ago(ev.at, now)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ----------------------------------------------------- the year */}
        <section aria-labelledby="home-year" className={`${card} mb-3.5`} style={cardStyle}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="home-year" className="text-[12.5px] font-bold">
              Round 1 — the audit calendar
            </h2>
            <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
              {calendar.length} SITES ·{" "}
              {auditWindow(calendar[0].auditFrom, calendar[calendar.length - 1].auditTo)} ·{" "}
              {startedEntities.size} STARTED
            </span>
          </div>
          {/* `relative` IS LOAD-BEARING, and it is the whole reason this strip
              does not drag the app sideways.

              Ten 168px cards in an overflow-x-auto row clip correctly on screen
              and still counted toward the DOCUMENT's scroll area: measured at
              390px the page reported 1,244px of horizontal overflow, and
              window.scrollTo(1000, 0) really moved — the whole shell, masthead
              included, panned off into empty space on a phone. Positioning the
              scroller makes it the containing block its own overflow is
              measured against, and it drops to 0 at 390 and at 1280.

              Nothing else did. overflow-x: clip did not, overflow-y: hidden did
              not, and clipping the section around it did not. Do not remove
              this class because the layout looks fine without it — the fault is
              a viewport that pans, not a card that spills. */}
          <div className="hide-scrollbar relative -mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex gap-2">
              {calendar.map((e) => {
                const started = startedEntities.has(e.code);
                const on = e.code === entityCode;
                const state = now > 0 ? windowState(e, now) : null;
                return (
                  <div
                    key={e.code}
                    className="flex w-[168px] shrink-0 flex-col gap-[5px] rounded-[11px] border px-[11px] py-[10px]"
                    style={
                      on
                        ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)" }
                        : { background: "var(--sunken)", borderColor: "var(--line)" }
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <Dot
                        tone={started ? "good" : "pending"}
                        label={started ? "Started" : "Not started"}
                      />
                      <b className="font-display text-[12px] font-semibold">{e.short}</b>
                      {on && <Pill tone="accent">HERE</Pill>}
                    </div>
                    <span className="text-[10.5px] leading-[1.35]" style={{ color: "var(--ink-2)" }}>
                      {e.name}
                    </span>
                    <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-3)" }}>
                      {auditWindow(e.auditFrom, e.auditTo)}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--ink-4)" }}>
                      {checksAt(e.code).length} check-points
                      {state ? ` · ${state.text}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
            Started means an audit at that site holds captured work — not a flag anybody has to
            remember to set. Windows and sites are data: they come from the programme file, so the
            eleventh airport is a data change.
          </p>
        </section>

        {/* ----------------------------------------------------- the flow */}
        <section aria-labelledby="home-flow" className={card} style={cardStyle}>
          <h2 id="home-flow" className="mb-[3px] text-[12.5px] font-bold">
            How the work flows
          </h2>
          <p className="mb-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
            Seven screens, in the order an audit uses them. Every one of them works offline.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map((s, i) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className="flex flex-col gap-[6px] rounded-[11px] border px-[12px] py-[11px] no-underline transition-[var(--t)] hover:-translate-y-[1px]"
                  style={{ background: "var(--sunken)", borderColor: "var(--line)", color: "var(--ink)" }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="tnum font-mono text-[9px] font-semibold"
                      style={{ color: "var(--ink-4)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Icon width={13} height={13} style={{ color: "var(--acc)" }} />
                    <b className="font-display text-[12px] font-semibold">{s.label}</b>
                  </span>
                  <span className="text-[10.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                    {s.line}
                  </span>
                  <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                    {s.href}
                  </span>
                </Link>
              );
            })}
            <Panel className="flex flex-col justify-center gap-[5px]">
              <span className="label-xs">Before you go</span>
              <Link href="/preflight" className="font-display text-[12px] font-semibold no-underline" style={{ color: "var(--acc)" }}>
                Pre-flight →
              </Link>
              <span className="text-[10.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                Microphone, camera, storage and the offline cache, checked on this device before
                anyone walks onto an apron.
              </span>
            </Panel>
          </div>
        </section>
      </div>
    </div>
  );
}
