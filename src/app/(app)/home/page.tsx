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

import { useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "@/lib/clock";
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
import { Btn, Dot, Empty, Pill, Track } from "@/components/ui/primitives";
import {
  IconCamera,
  IconCheck,
  IconClipboard,
  IconFlag,
  IconGrid,
  IconLeft,
  IconLoop,
  IconPin,
  IconRight,
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

/* The clock lives in src/lib/clock.ts — see the note there on why it is read
   as an external system rather than called during render. */

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
  const now = useNow();

  /* Same affordance as the masthead nav (AppShell.tsx), and for the same
     reason: a row that scrolls sideways with nothing saying so reads as
     "that's all of them" rather than "more if you swipe". Ten 168px site
     cards is nowhere near as easy to miss as the masthead was, but it is
     the same shape of problem, so it gets the same fix rather than a
     different one invented for this one row. */
  const calRef = useRef<HTMLDivElement>(null);
  const [calScroll, setCalScroll] = useState({ left: false, right: false });
  useEffect(() => {
    const el = calRef.current;
    if (!el) return;
    const measure = () => {
      setCalScroll({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);

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

  const card = "rounded-[16px] border p-[17px]";
  const cardStyle = { background: "var(--panel)", borderColor: "var(--line)" };

  /** ONE ROW OF A SLIM PROGRESS STRIP, NOT A BOXED TILE — Sarel's second
   *  visual-hierarchy pass, item 8: "merge the four stat tiles (At the desk
   *  / On site / Findings / 2025 follow-up) into one slim progress strip
   *  under the main audit panel — thin progress bars with numbers, not four
   *  boxed tiles." The four used to be their own cards: a border, a top
   *  accent stripe, a 21px number, a track and a standing sentence of
   *  explanation, each repeated four times. The number and the bar are what
   *  somebody glancing at Home actually reads; the explanatory sentence
   *  moves to `title` (a hover/long-press), the same tooltip trade this
   *  file already makes elsewhere on this screen ("Document and site
   *  evidence…", "Started means…") rather than standing prose.
   *  `pct === null` (Findings has no honest denominator — see its own call
   *  below) skips the bar rather than drawing a 0% one, which would read as
   *  "nothing done" instead of "not that kind of number". */
  const statRow = (label: string, value: string, sub: string, pct: number | null, tone: string) => (
    <div key={label} className="flex items-center gap-3" title={sub}>
      <span className="w-[98px] shrink-0 text-[11px]" style={{ color: "var(--ink-2)" }}>
        {label}
      </span>
      <span className="min-w-0 flex-1">{pct !== null && <Track pct={pct} color={`var(--${tone})`} />}</span>
      <b
        className="tnum w-[64px] shrink-0 text-right font-mono text-[12.5px] font-semibold"
        style={{ color: `var(--${tone})` }}
      >
        {value}
      </b>
    </div>
  );

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-5 pt-5 pb-16">
        {/* ------------------------------------------------------- next up

            LEADS WITH THE SELECTED AUDIT NOW, not "Next in the programme" —
            the ask was to lead with the audit actually in view and ONE main
            action. Nothing in either half's own content changed from what
            was here before; what changed is which one goes first and wider,
            and which button on the screen gets the primary treatment — only
            one does, "Continue at the desk" below, because the guardrail is
            one main button per screen, not one per half. "Next in the
            programme" still has its own actions, just as plain buttons now
            that it is the look-ahead rather than the lead.

            ONE CARD, NOT TWO — item 2's revision. The first pass (commit
            7351d82) got Home from ~8 cards down to 2: this one and "Next in
            the programme" sitting as separate bordered boxes side by side.
            Sarel then decided that was still one card too many for a screen
            whose only genuine OBJECT is the audit in view — "next in the
            programme" is a look-ahead at that same object, not a second
            one, so it does not earn its own border either. Both halves now
            live inside a single bordered card, divided by one hairline rule
            (a vertical one at the width that still runs them side by side,
            a horizontal one once they stack), the same divider language
            every de-carded section below already uses. Neither half's own
            content, copy, or data changed — only the container they sit
            in. Every other section below (the progress strip, Recent
            activity, the audit calendar) is still a VIEW onto that one
            object — a reading of its progress, a list of what happened, a
            row of other sites — and sits on the plain background, one
            hairline rule apart, same as before. */}
        <section aria-label="The audit you are in, and what's next" className={`${card} mb-3.5`} style={cardStyle}>
          <div className="grid gap-3.5 lg:grid-cols-[1.25fr_1fr]">
            <div aria-labelledby="home-open">
            <span className="label-xs">The audit you are in</span>
            <h2 id="home-open" className="mt-[5px] flex flex-wrap items-center gap-2 text-[19px] font-bold">
              {entity.short}
              <Pill tone="accent">{visitLabel}</Pill>
              {visitNote && (
                <span className="text-[12.5px] font-normal" style={{ color: "var(--ink-2)" }}>
                  {visitNote}
                </span>
              )}
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
              {/* THE FULL EXPLANATION MOVED TO A TOOLTIP, not off the page —
                  Sarel: "the whole app is very busy... review what is
                  actually necessary to display." What a document-and-site
                  check means is real information, worth having, and not
                  something read twice a visit: it is a definition, which is
                  exactly what a title attribute is for. The short form stays
                  on the page because "complete" is ambiguous without it. */}
              <p
                className="mt-2 cursor-help text-[11px] underline decoration-dotted underline-offset-2"
                style={{ color: "var(--ink-3)" }}
                title="Complete means every mode the register declares for a check has been answered — a document read and the asset seen, where it asks for both."
              >
                Document and site evidence, where the check asks for both
              </p>
            </div>
            {/* THE ONE MAIN ACTION ON THIS SCREEN. Checks is the first step of
                the seven-step flow named just below, so it is the button
                that carries the primary style — "Go out and walk" is the
                other place this audit's work continues, kept as a plain
                secondary rather than a second primary. */}
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Link href="/capture" className="no-underline">
                <Btn variant="primary">Continue at the desk</Btn>
              </Link>
              <Link href="/field" className="no-underline">
                <Btn>Go out and walk</Btn>
              </Link>
            </div>
            {/* THE ORDER, AS A LINE OF TEXT, NOT A SECOND NAVIGATION — Sarel's
                second visual-hierarchy pass, item 9: "remove the 'How the
                work flows' stepper bar — it duplicates the main navigation.
                If the step order matters, show it once as small text inside
                the current-audit panel." The stepper that used to sit at
                the foot of this page (a row of seven rounded, bordered
                links with icons) was the masthead's own nav, restated in a
                friendlier shape — every one of its destinations, in the
                same order, reachable the same way. The ORDER is the one
                thing the nav bar itself cannot say, and that is all this
                line keeps: plain text, no links, no icons, so it cannot be
                mistaken for a second way to get anywhere. */}
            <p className="mt-3 text-[10.5px] leading-[1.6]" style={{ color: "var(--ink-4)" }}>
              The seven steps, in order: {FLOW.map((s) => s.label).join(" › ")}.
            </p>
          </div>

          {/* --------------------------------------------- next in the programme

              THE DIVIDER, not a second border — a hairline rule above on the
              narrow layout (where this half stacks below the first) and a
              hairline rule to the left on the wide one (where the grid above
              runs them side by side), so the two halves of this one card stay
              visually distinct without either becoming its own box. */}
          <div
            aria-labelledby="home-next"
            className="border-t pt-3.5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-3.5"
            style={{ borderColor: "var(--line)" }}
          >
            <span className="label-xs">Next in the programme</span>
            {next && nextVisit ? (
              <>
                <h2 id="home-next" className="mt-[5px] flex flex-wrap items-baseline gap-2 text-[15px] font-bold">
                  {next.name}
                  <span className="text-[12px] font-normal" style={{ color: "var(--ink-2)" }}>
                    {next.short}
                  </span>
                  {/* CURRENT, not "OPEN NOW" — Sarel, checkpoint feedback:
                      "a visit must never show 'OPEN NOW' and 'window has
                      passed' together." `nextIsOpen` only ever means THIS is
                      the selected entity/visit — it says nothing about the
                      real calendar dates, which `windowState` two lines down
                      computes separately and can genuinely disagree with.
                      "OPEN NOW" claimed the window itself was open; "CURRENT"
                      claims only what this pill has ever actually been able
                      to promise — that this is the one open on screen —
                      which is never false, whatever windowState says beside
                      it. Wording only: nextIsOpen's own condition is
                      unchanged. */}
                  {nextIsOpen && <Pill tone="good">CURRENT</Pill>}
                </h2>
                <p className="mt-[6px] text-[11.5px]" style={{ color: "var(--ink-2)" }}>
                  {auditWindow(next.auditFrom, next.auditTo, next.auditTbc)} · {nextVisit.label} · {nextVisit.note}
                </p>
                <p className="mt-[3px] text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                  {checksAt(next.code).length} check-points on this site&apos;s list
                  {now > 0 ? ` · ${windowState(next, now).text}` : ""}
                </p>
                {/* SECONDARY, deliberately — this card is a look-ahead, not
                    the one main action, so every button here stays the
                    plain/default style even when it opens a different audit
                    outright, rather than competing with the primary button
                    in the lead card above. */}
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {!nextIsOpen && (
                    <Btn onClick={() => openAudit(next.code, nextVisit.id)}>
                      Open {next.short} · {nextVisit.label}
                    </Btn>
                  )}
                  <Link href="/capture" className="no-underline">
                    <Btn>Start with Checks</Btn>
                  </Link>
                  <Link href="/preflight" className="no-underline">
                    <Btn>Check this device</Btn>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 id="home-next" className="mt-[5px] text-[15px] font-bold">
                  Every site in Round 1 has been started
                </h2>
                <p className="mt-[6px] text-[11.5px]" style={{ color: "var(--ink-2)" }}>
                  There is no unstarted audit left in the programme. Pick up an open one below, or
                  add the next visit from Audits in the header.
                </p>
              </>
            )}
          </div>
        </div>
        </section>

        {/* --------------------------------------------------- progress strip

            DE-CARDED — Sarel's second visual-hierarchy pass, item 2:
            "Reserve bordered cards for primary objects only (the current
            audit on Home...). Everything else sits on the plain
            background separated by whitespace and one hairline divider at
            most." This strip is a reading of the current audit's own
            progress, not a second object in its own right, so it drops
            the border and the panel fill and sits straight on the page
            background, with one hairline rule above it marking where the
            lead cards end. */}
        <section
          aria-label="This audit at a glance"
          className="mb-3.5 flex flex-col gap-2 border-t pt-3.5"
          style={{ borderColor: "var(--line)" }}
        >
          {statRow(
            "At the desk",
            `${desk.done}/${desk.total}`,
            "evidence collected and questions asked",
            desk.total ? (desk.done / desk.total) * 100 : 0,
            "acc"
          )}
          {statRow(
            "On site",
            `${field.done}/${field.total}`,
            "the asset itself seen and photographed",
            field.total ? (field.done / field.total) * 100 : 0,
            "good"
          )}
          {statRow(
            "Findings",
            String(findings.length),
            unrated
              ? `${unrated} still waiting for the group to agree a rating`
              : "every finding carries an agreed rating",
            null,
            "bad"
          )}
          {statRow(
            "2025 follow-up",
            `${verified}/${prior.length}`,
            prior.length ? "carried findings verified this visit" : "a baseline audit — nothing carried in",
            prior.length ? (verified / prior.length) * 100 : 0,
            "warn"
          )}
        </section>

        {/* ------------------------------------------------- recent activity

            ONE PANEL, NOT TWO — Sarel's second visual-hierarchy pass, item 8:
            "merge 'Audits with work in them' and 'Just done' into one
            'Recent activity' panel." They used to be side-by-side cards
            answering two different questions about the same thing
            (which audits hold work; what happened most recently in this
            one) — now one hairline divider apart inside a single panel
            instead of two separate borders a gap apart.

            DE-CARDED TOO, same item-2 pass: a list, not an object — the
            border and panel fill are gone, replaced by the one hairline
            rule above (border-t) that already marks every section change
            on this page now. */}
        <section
          aria-labelledby="home-recent"
          className="mb-3.5 border-t pt-3.5"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 id="home-recent" className="mb-[3px] text-[12.5px] font-bold">
            Recent activity
          </h2>
          <div className="mb-1">
            <p className="mb-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
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
                        {/* CURRENT, same rename and same reason as the
                            "next in the programme" card above — `on` here is
                            the identical is-this-selected check, not a date
                            check, and the Dot two lines up already says "The
                            audit you are in" beside it; "OPEN NOW" implied a
                            window-open claim this pill was never actually
                            making. */}
                        {on && <Pill tone="accent">CURRENT</Pill>}
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
          </div>

          {/* ONE HAIRLINE DIVIDER, not a second card border — the two
              questions ("which audits hold work" / "what just happened in
              this one") stay visually distinct without a second box. */}
          <div className="my-3 border-t" style={{ borderColor: "var(--line)" }} />

          <p className="mb-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
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

        {/* ----------------------------------------------------- the year

            DE-CARDED, same item-2 pass — the calendar is a row of its own
            small cards (each one accent-bordered only when selected,
            neutral otherwise, per item 10 above); the SECTION around them
            does not also need a border. One hairline rule above, same as
            every other section change on this page now. */}
        <section
          aria-labelledby="home-year"
          className="mb-3.5 border-t pt-3.5"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="home-year" className="text-[12.5px] font-bold">
              Round 1 — the audit calendar
            </h2>
            {/* "Started" explained once, on hover, rather than as a standing
                paragraph under the strip every time the page loads — Sarel:
                "review that to see what is actually necessary to display to
                the user." The fact itself (started = holds captured work,
                not a flag) is still here for anyone who wants it. */}
            <span
              className="cursor-help font-mono text-[9px]"
              style={{ color: "var(--ink-4)" }}
              title="Started means an audit at that site holds captured work — not a flag anybody has to remember to set."
            >
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
          {/* The fade+chevron pair are siblings of the scroller, not children
              of it — the same split AppShell.tsx's nav uses, and for the
              same reason: an absolutely positioned child of the scroller
              itself would scroll away with the cards instead of staying put
              at the edge. This outer div is purely that positioning
              context; the `relative` the comment above is protecting stays
              on the scroller itself, unchanged. */}
          <div className="relative">
            <div ref={calRef} className="hide-scrollbar relative -mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex gap-2">
              {calendar.map((e) => {
                const started = startedEntities.has(e.code);
                const on = e.code === entityCode;
                const state = now > 0 ? windowState(e, now) : null;
                return (
                  /* TIGHTENED, AND "NOT STARTED" IS GONE — Sarel's second
                     visual-hierarchy pass, item 10: "stop repeating 'NOT
                     STARTED' on every card — that's the default state, show
                     a status chip only when a site is started... Tighten
                     each card to: code, airport name, dates, and one small
                     'starts in N days' line. The selected/current site gets
                     the accent border; all others neutral." Not-started was
                     nine identical chips out of ten cards saying the thing
                     that is true before anybody has opened anything —
                     exactly the standing-badge problem item 1 fixed in the
                     nav, here on the calendar strip instead. Only `started`
                     now earns a visible chip; the check-points count is
                     gone too (code/name/dates/window-state is the tight
                     set asked for). Border stays the one earlier rule it
                     already followed — accent for the selected site, the
                     same neutral --line for every other, started or not. */
                  <div
                    key={e.code}
                    className="flex w-[168px] shrink-0 flex-col gap-[5px] rounded-[11px] border px-[11px] py-[10px]"
                    style={
                      on
                        ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)" }
                        : { background: "var(--sunken)", borderColor: "var(--line)" }
                    }
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b className="font-display text-[12px] font-semibold">{e.short}</b>
                      {on && <Pill tone="accent">HERE</Pill>}
                      {started && (
                        <span
                          className="ml-auto flex items-center gap-[3px] text-[10px] font-semibold"
                          style={{ color: "var(--good)" }}
                        >
                          <IconCheck width={8} height={8} aria-hidden />
                          Started
                        </span>
                      )}
                    </div>
                    <span className="text-[10.5px] leading-[1.35]" style={{ color: "var(--ink-2)" }}>
                      {e.name}
                    </span>
                    <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-3)" }}>
                      {auditWindow(e.auditFrom, e.auditTo, e.auditTbc)}
                    </span>
                    {state && (
                      <span className="text-[10px]" style={{ color: "var(--ink-4)" }}>
                        {state.text}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
            {/* var(--panel) behind the fade, matching this row's own card —
                cardStyle above, not --sunken (what the masthead's fade sits
                on, a different surface behind a different scroller). Read
                off this card's own background rather than copied blind. */}
            {calScroll.left && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-1 left-0 flex w-[28px] items-center justify-start rounded-l-[11px]"
                style={{ background: "linear-gradient(90deg, var(--panel) 40%, transparent)" }}
              >
                <IconLeft width={12} height={12} style={{ color: "var(--ink-3)" }} />
              </span>
            )}
            {calScroll.right && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-1 right-0 flex w-[28px] items-center justify-end rounded-r-[11px]"
                style={{ background: "linear-gradient(270deg, var(--panel) 40%, transparent)" }}
              >
                <IconRight width={12} height={12} style={{ color: "var(--ink-3)" }} />
              </span>
            )}
          </div>
        </section>

        {/* "HOW THE WORK FLOWS" IS GONE, 21 Oct 2026 — Sarel's second
            visual-hierarchy pass, item 9: "remove the 'How the work flows'
            stepper bar — it duplicates the main navigation." This had
            already been cut down once, from eight cards to one row of
            seven linked pills (see this section's own prior history, now
            removed with it) — but a row of links to the same seven
            destinations, in the same order, is still the masthead's own
            nav restated, just in pill shape instead of card shape. The
            order itself — the one fact the nav bar cannot state — now
            lives as a plain-text line inside "The audit you are in" above,
            not as a second set of links. Pre-flight's own quick link here
            is gone with it; it stays reachable from the More menu, same as
            every other screen not in the seven-step sequence. */}
      </div>
    </div>
  );
}
