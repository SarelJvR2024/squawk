"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AUDITORS,
  checksAt,
  priorFindingsAt,
  useEntityCode,
  useResponses,
  useStore,
  useVerifications,
  useVisitFindings,
  useVisitHazards,
  useVisitId,
  useVisits,
  deskDone,
  fieldDone,
} from "@/lib/store";
import { ENTITIES, entity as entityOf } from "@/lib/programme";
import { needsDesk, needsField } from "@/lib/verification";
import { useAssistAvailable, useTranscribeAvailable } from "@/lib/assist";
import { portalIdFor } from "@/lib/sites";
import { requestPersistentStorage } from "@/lib/media";
import { usePhotoSync } from "@/lib/sync";
import { useShared } from "@/lib/shared";
import ExportPanel from "@/components/ExportPanel";
import { SyncPanel } from "@/components/SyncPanel";
import ResetPanel from "@/components/ResetPanel";
import AuditsPanel from "@/components/AuditsPanel";
import {
  IconClipboard,
  IconCamera,
  IconCloud,
  IconCloudUp,
  IconGrid,
  IconDownload,
  IconFlag,
  IconGauge,
  IconHelp,
  IconLock,
  IconLoop,
  IconMore,
  IconPin,
  IconSearch,
  IconTeam,
} from "@/components/ui/icons";
import { Pill } from "@/components/ui/primitives";


/* The labels name the AUDIT ACTIVITY, not the software action.
 *
 *  "Capture" and "Field" described what the app does; an auditor thinks in
 *  sessions — working the check-list, walking the assets, following up last
 *  cycle. "Follow-up" earns its place most: it and "Findings" were both about
 *  findings, and neither word said which cycle it meant.
 *
 *  THE ROUTES ARE DELIBERATELY UNCHANGED. /capture, /field and /closure are in
 *  deployed links, the command palette and several test suites; renaming a URL
 *  to match a label is churn with a real cost and no reader benefit. */
const NAV = [
  { href: "/capture", label: "Checks", icon: IconClipboard },
  { href: "/field", label: "Inspection", icon: IconPin },
  { href: "/review", label: "Review", icon: IconCamera },
  /* ASSET ASSURANCE, not "Findings".
     The screen stopped being a findings register when it became the place the
     group agrees an asset system's band — which is the number ACSA publishes
     and the whole reason the engagement exists. "Findings" named the evidence
     rather than the work, and it named it in a way that suggested the register
     of findings was the destination; the findings are still there, one press
     inside it. "Asset assurance" is what TPJV was appointed to do. */
  { href: "/findings", label: "Asset Assurance", icon: IconLoop },
  /* HIRA, not "Hazards" and never "Risks".
     It names the instrument: B170 001M IS a Hazard Identification and Risk
     Assessment, and that is the language SACAA expects to see. "Risks" was the
     alternative and is the one word that cannot be used here — the asset system
     carries ACSA's ERM business-risk rating, and two things called risk, rated
     on two different matrices and going to two different committees, is exactly
     how the last round of confusion started. The route stays /hazards. */
  { href: "/hazards", label: "HIRA", icon: IconFlag },
  { href: "/closure", label: "Follow-up", icon: IconLoop },
  { href: "/dashboard", label: "Dashboard", icon: IconGrid },
  /* Last, and in the nav rather than behind the shortcut sheet, because the
     shortcut sheet is hidden below sm — and the phone is exactly the device
     whose microphone, storage and offline cache somebody needs to check before
     walking onto an apron. The bar scrolls; an eighth destination costs a swipe
     and buys the one screen that answers "will this device work". */
  { href: "/preflight", label: "Pre-flight", icon: IconGauge },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useStore((s) => s.role);
  const setRole = useStore((s) => s.setRole);
  const auditor = useStore((s) => s.auditor);
  const setAuditor = useStore((s) => s.setAuditor);
  const responses = useResponses();
  const verifications = useVerifications();
  const findings = useVisitFindings();
  const hazards = useVisitHazards();
  const entityCode = useEntityCode();
  const shared = useShared();
  /* Only the states a person can actually do something about. "Waiting for
     signal" is not one of them — an auditor in a basement does not need a dot
     telling them they are in a basement. */
  const sharedNeedsYou = shared?.state === "locked" || shared?.state === "error";
  const visitId = useVisitId();
  const setEntity = useStore((s) => s.setEntity);
  const setVisit = useStore((s) => s.setVisit);

  /* The cycle strip and the picker both run off the visits this entity
     actually has, so switching airport re-draws the programme rather than
     showing another site's schedule. */
  const visits = useVisits(entityCode);
  const visitLabel =
    visits.find((v) => v.id === visitId)?.label ?? visitId;

  const [palette, setPalette] = useState(false);
  const aiOn = useAssistAvailable();
  const transcribeOn = useTranscribeAvailable();
  const dictation = useStore((s) => s.dictation);
  const setDictation = useStore((s) => s.setDictation);
  const [help, setHelp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);
  /* The two masthead popovers. Only one is ever open — opening either closes
     the other, because two overlapping panels hanging off one header is a
     thing to dismiss twice. */
  const [more, setMore] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [audits, setAudits] = useState(false);
  const [q, setQ] = useState("");

  const done = useMemo(
    () => Object.values(responses).filter((r) => r.captured).length,
    [responses]
  );
  /* This site's checklist, not the register. 324 at an international, 319 at a
     regional, 200 at Corporate Office — a ring drawn against 324 everywhere
     would never reach 100% at seven of the ten sites. */
  const checks = useMemo(() => checksAt(entityCode), [entityCode]);
  const priorTotal = priorFindingsAt(entityCode).length;
  const verified = Object.values(verifications).filter((v) => v.outcome).length;
  const pct = checks.length ? Math.round((done / checks.length) * 100) : 0;

  /* Each nav badge counts what is outstanding in THAT view, not across the
     register. Capture lists 315 and Field lists 299; a badge of 324 on either
     is a number that cannot be worked down to zero. */
  const desk = useMemo(() => {
    const scope = checks.filter(needsDesk);
    return { done: scope.filter((c) => deskDone(responses[c.id])).length, total: scope.length };
  }, [checks, responses]);
  /* Findings nobody has put into a hazard yet. A finding may sit in at most
     one, so this is a straight set difference. */
  const ungrouped = useMemo(() => {
    const inHazard = new Set(hazards.flatMap((h) => h.findingIds));
    return findings.filter((f) => !inHazard.has(f.id)).length;
  }, [findings, hazards]);
  const field = useMemo(() => {
    const scope = checks.filter(needsField);
    return { done: scope.filter((c) => fieldDone(responses[c.id])).length, total: scope.length };
  }, [checks, responses]);

  useEffect(() => {
    if (role === "acsa" && pathname !== "/dashboard") router.replace("/dashboard");
  }, [role, pathname, router]);

  /* Ask once, on the way in, before there is anything to lose. The browser may
     refuse; the export panel reports the answer rather than this pretending it
     succeeded. */
  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  /* Mounted once, here, so the queue drains whichever screen the auditor is on
     and keeps going while they capture. */
  const sync = usePhotoSync();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA/.test(
        (document.activeElement as HTMLElement)?.tagName ?? ""
      );
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (e.key === "Escape") {
        setPalette(false);
        setHelp(false);
        setExporting(false);
        setSyncing(false);
        setResetting(false);
        setAudits(false);
        /* The masthead popovers close on Escape like everything else here. A
           panel that can only be dismissed by finding its own button again is
           one an auditor learns to avoid opening. */
        setMore(false);
        setRoleOpen(false);
        return;
      }
      if (!typing && e.key === "?") setHelp(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return checks
      .filter(
        (c) =>
          !s ||
          `${portalIdFor(entityCode, c.id)} ${c.requirement} ${c.system} ${c.discipline} ${c.acsaThreshold}`
            .toLowerCase()
            .includes(s)
      )
      .slice(0, 40);
  }, [q, checks, entityCode]);

  const C = 2 * Math.PI * 12;

  return (
    /* THE SHELL IS LOCKED TO THE VIEWPORT, and it took a real defect to make
       that explicit rather than incidental.

       Sarel, on the laptop: "when i scroll to the bottom the whole UI moves up,
       it should be locked so that this doesn't happen." Measured on /closure at
       1440x900: the shell was 900px and `overflow: hidden`, the page's own
       scroller held the 1,178px of content correctly — and the DOCUMENT still
       reported a scrollHeight of 1077 and scrolled 177px, carrying the masthead,
       the audit strip and the navigation off the top of the screen.

       The cause was `sr-only`. Tailwind's sr-only is `position: absolute`, and
       with no positioned ancestor those spans resolve against the INITIAL
       containing block — so a screen-reader label sitting 1,077px down the
       inner scroller inflated the html box by exactly that much. Nine of them
       on that screen; the document's scrollHeight matched the last one to the
       pixel.

       Two fixes, because either alone leaves a way back in:
         `position: relative` here gives every absolutely positioned descendant
         a containing block INSIDE the shell, where `overflow: hidden` can clip
         it — so a stray absolute added later cannot reach the document.
         `overflow: hidden` on html and body (globals.css) means the document
         has no scroll to give even if something does escape.

       And the height is `100dvh` where the browser has it, falling back to the
       `h-screen` class where it does not: on a phone `100vh` is the viewport
       WITH the browser chrome retracted, so a shell sized to it is taller than
       what you can see and the bottom navigation sits under the address bar. */
    <div className="relative flex h-screen flex-col overflow-hidden" style={{ height: "100dvh" }}>
      {/* One row, and it must FIT.
       *
       *  It did not. Measured on the device this is built for, the header
       *  wanted 1,552px against an 820px portrait iPad and 1,590px against a
       *  1,024px one — and the app shell clips rather than scrolls, so the
       *  overflow was not merely awkward, it was gone. In portrait that meant
       *  Dashboard, Jump to check, **Export**, Reset, the shortcut sheet and
       *  the TPJV/ACSA switch could not be reached at all. Export is the
       *  deliverable; an auditor who cannot reach it cannot hand anything over.
       *
       *  The rule now: the brand and the right-hand controls are shrink-0 and
       *  always reachable, and the NAV is the flexible one — min-w-0 so it may
       *  shrink and overflow-x-auto so every destination stays reachable by
       *  swipe, which is the ordinary tablet gesture. */}
      {/* The masthead carries no inline colours of its own: `.masthead`
          redefines the surface tokens for everything inside it, so the
          controls below are unchanged and a control added later inherits
          the dark band instead of staying stubbornly light. */}
      {/* MEASURED ON AN iPHONE 12: the nav was 36px wide holding 844px of
          destinations. It scrolled, technically, but a 36px sliver is not a
          control — it read as a rendering fault, and the dark masthead made it
          a black stub. The whole navigation was effectively gone on the device
          the walkabout is actually done on.

          So below sm the header wraps and the nav takes a full-width row of its
          own. It costs about 44px of a 664px screen and buys back seven
          destinations. From sm upward nothing moves: one row, 52px, exactly as
          measured at 820/1024/1180. */}
      {/* Straight to the work, for anyone driving this from the keyboard. Seven
          destinations plus the audit switcher is a lot of tabbing to reach the
          first check. Invisible until it is focused, which is the only time it
          is of use to anybody. */}
      <a
        href="#work"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-[8px] focus:px-3 focus:py-2 focus:text-[12px] focus:font-semibold"
        style={{ background: "var(--panel)", color: "var(--acc)", boxShadow: "var(--e2)" }}
      >
        Skip to the audit
      </a>
      <header className="masthead flex min-h-[52px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3.5 py-1 sm:h-[52px] sm:flex-nowrap sm:py-0">
        {/* The brand mark goes HOME, which is the one thing everybody already
            expects it to do — and it is why /home needs no ninth destination in
            a nav that is already 767px of bar inside an 820px portrait iPad.
            For ACSA it stays on the dashboard: their role is read-only across
            the audit and the shell redirects them there anyway, so pointing
            their only header link at a screen that bounces would be a link
            that visibly does nothing. */}
        <Link
          href={role === "acsa" ? "/dashboard" : "/home"}
          className="flex min-h-[44px] shrink-0 items-center gap-[9px] no-underline"
        >
          <span
            className="flex h-[27px] w-[27px] items-center justify-center rounded-[8px]"
            style={{
              background: "linear-gradient(140deg, var(--acc), var(--acc-2))",
              boxShadow: "var(--e1)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" width={15} height={15} style={{ color: "var(--on-acc)" }}>
              <path d="M5 13l4 4L19 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {/* THE AUDIT IS THE HEADLINE, not the app name.

              This was the other way round: "Squawk" at 13px bold over the site
              and visit at 8.5px. But nobody needs telling which app they are
              in, and the one question the masthead has to answer without being
              asked is WHICH AUDIT AM I CAPTURING AGAINST — ten sites and six
              visits each, all of which look identical once you are inside a
              check. Capturing a day's work against the wrong visit is not
              recoverable by anyone who does not know it happened.

              So the hierarchy is inverted and the visit carries the accent:
              the site code is the constant, the visit is the thing that can be
              wrong. */}
          <span className="min-w-0">
            <span
              className="block font-mono text-[8.5px] leading-[1.1] tracking-[0.09em]"
              style={{ color: "var(--ink-3)" }}
            >
              SQUAWK
            </span>
            <b className="flex items-center gap-[6px] font-display text-[13.5px] leading-[1.25] font-bold whitespace-nowrap">
              <span style={{ color: "var(--ink)" }}>{entityOf(entityCode).short}</span>
              {/* A chip, not a colour: inside the masthead --acc IS white, so
                  colouring the visit would have painted it the same as the site
                  code beside it. The chip separates them on any ground. */}
              <span
                className="rounded-[6px] px-[7px] py-[1px] text-[12.5px]"
                style={{ background: "var(--acc-soft)", color: "var(--ink)" }}
              >
                {visitLabel}
              </span>
            </b>
          </span>
        </Link>

        <nav
          className="app-nav hide-scrollbar order-last flex w-full min-w-0 shrink-0 basis-full gap-[2px] overflow-x-auto rounded-[11px] p-[3px] sm:order-none sm:w-auto sm:flex-1 sm:basis-auto"
          style={{ background: "var(--sunken)" }}
        >
          {NAV.map((n) => {
            const active = pathname === n.href;
            /* ACSA is read-only across the audit, but Visual review is where
               their engineers answer a photograph — the one screen where their
               input is the point rather than a risk. Comments are labelled by
               role and never touch the observation or the finding. */
            const disabled =
              role === "acsa" && n.href !== "/dashboard" && n.href !== "/review";
            const Icon = n.icon;
            /* Counts read DONE OF TOTAL where there is a finite amount of
               work, because a bare number does not say which it is. "299"
               beside Capture could be 299 done or 299 left, and the auditor
               who needs to know is the one least able to guess.
               Findings and Hazards stay bare: there is no denominator for how
               many findings an audit ought to find, and inventing one would be
               worse than the ambiguity. */
            const badge =
              n.href === "/capture"
                ? `${desk.done}/${desk.total}`
                : n.href === "/field"
                  ? `${field.done}/${field.total}`
                  : n.href === "/closure"
                    ? `${verified}/${priorTotal}`
                    : n.href === "/findings"
                      ? findings.length || ""
                      /* Ungrouped findings, not a count of hazards: a count of
                         hazards would read like progress, and this is the work
                         still outstanding, which is what a badge is for. */
                      : n.href === "/hazards"
                        ? ungrouped || ""
                        : "";
            return (
              <Link
                key={n.href}
                href={disabled ? "#" : n.href}
                aria-disabled={disabled}
                onClick={(e) => disabled && e.preventDefault()}
                /* 44px, because this is a tablet held on an apron.
                   Measured: the nav links were 29px while every other tappable
                   thing in the app was already 44 or more — 8 undersized
                   targets out of 130, and all 8 of them were these, the
                   controls used more than anything else. */
                className="flex min-h-[44px] items-center gap-[6px] whitespace-nowrap rounded-[8px] px-3 py-[6px] font-display text-[11.5px] font-semibold no-underline transition-[var(--t)]"
                style={{
                  background: active ? "var(--panel)" : "transparent",
                  color: active ? "var(--acc)" : "var(--ink-2)",
                  boxShadow: active ? "var(--e1)" : "none",
                  opacity: disabled ? 0.32 : 1,
                  pointerEvents: disabled ? "none" : "auto",
                }}
              >
                <span className="relative flex shrink-0">
                  <Icon width={13} height={13} />
                  {/* A dot on Pre-flight when the shared record needs a person:
                      this device has not been let into the audit yet, or its
                      last sync failed. It goes HERE rather than in the masthead
                      because the masthead's controls are hidden below sm, and a
                      phone is where an auditor most needs to know that their
                      afternoon is not reaching the team. */}
                  {n.href === "/preflight" && sharedNeedsYou && (
                    <span
                      aria-hidden
                      className="absolute -top-[3px] -right-[3px] h-[6px] w-[6px] rounded-full"
                      style={{ background: "var(--warn)" }}
                    />
                  )}
                </span>
                {/* On the bottom bar all seven destinations have to fit across
                    390px, and seven full labels do not — three fitted and the
                    rest were a swipe nobody would think to make. The ACTIVE one
                    keeps its label so you always know where you are; the others
                    are their icon and their count, which is what a bottom bar
                    has always been. Full labels return at sm. */}
                <span className={active ? "" : "hidden sm:inline"}>{n.label}</span>
                {/* The dot above is aria-hidden — a decoration on the icon — so
                    the thing it is telling you has to be here, in words, or a
                    screen-reader user never learns their afternoon is not
                    reaching the team. */}
                {n.href === "/preflight" && sharedNeedsYou && (
                  <span className="sr-only">— the shared record needs you</span>
                )}
                {badge !== "" && badge !== 0 && (
                  <span
                    className="rounded-full px-[5px] font-mono text-[9px]"
                    style={{
                      background: active ? "var(--acc)" : "var(--acc-soft)",
                      color: active ? "var(--on-acc)" : "var(--acc)",
                    }}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => setPalette(true)}
          aria-label="Jump to check"
          className="hidden min-h-[44px] shrink-0 items-center gap-[7px] rounded-[11px] border border-transparent px-[10px] py-[6px] text-[11.5px] transition-[var(--t)] sm:flex lg:min-w-[150px]"
          style={{ background: "var(--sunken)", color: "var(--ink-3)" }}
        >
          <IconSearch width={13} height={13} />
          <span className="hidden lg:inline">Jump to check</span>
          <kbd
            className="ml-auto hidden rounded-[4px] border px-[5px] font-mono text-[8.5px] lg:inline"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            ⌘K
          </kbd>
        </button>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {/* FIVE CONTROLS BECAME ONE BUTTON AND A PILL.
              Sync, Export, Reset and the shortcuts sheet stood in the masthead
              at every width, on every screen, for the whole audit. All four are
              things you reach for once a day at most — three of them at the END
              of an audit — and together they took about a third of a 1280px
              header from the two things that are used constantly: which check
              you are on, and jumping to another one.

              They are behind "More" now. It is a WORD, not a bare glyph: an
              icon alone is one more thing to learn, and the 40px a label costs
              is cheaper than a control nobody finds.

              THE ROLE STAYS OUT HERE, because it is not an action — it is
              state, and it changes what the whole app will do. ACSA is
              read-only: no capture, no Export, no Sync. An auditor who does not
              notice they are in ACSA mode does not go looking in a menu; they
              find that half the app has quietly stopped working. So the pill
              says which role is live at all times, and opens the switch when
              pressed. */}
          {/* AT EVERY WIDTH, unlike the four controls it replaced.

              Reset and the shortcuts sheet used to be hidden below sm to keep
              the phone header at two rows instead of three — but Export and
              Sync were NOT, and putting all four behind a menu that was itself
              hidden on a phone would have taken an auditor's ability to export
              or sync from a phone away entirely. One button costs one slot at
              every width, which is what made the menu worth having. */}
          <div className="relative">
            <button
              onClick={() => { setMore((v) => !v); setRoleOpen(false); }}
              aria-expanded={more}
              aria-haspopup="menu"
              className="flex min-h-[44px] items-center gap-[6px] rounded-[8px] border px-[10px] py-[7px] text-[11.5px] transition-[var(--t)]"
              style={{
                background: more ? "var(--acc-soft)" : "var(--panel)",
                borderColor: more ? "var(--acc-line)" : "var(--line-2)",
                color: more ? "var(--acc)" : "var(--ink-2)",
              }}
            >
              <IconMore width={14} height={14} />
              More
            </button>

            {more && (
              <>
                {/* Catches the press that closes it, at the size of the screen.
                    A menu that only closes on its own button is a menu you have
                    to learn to escape. */}
                <div
                  className="fixed inset-0 z-[70]"
                  onClick={() => setMore(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="More"
                  className="absolute right-0 top-[calc(100%+7px)] z-[75] w-[268px] overflow-hidden rounded-[13px] border p-[5px]"
                  style={{
                    background: "var(--menu-bg)",
                    borderColor: "var(--menu-line)",
                    boxShadow: "var(--e3)",
                  }}
                >
                  {/* ACSA is read-only across the audit: the portal is where
                      their copy comes FROM, and there is nothing for them to
                      export or start again. The menu is then the shortcuts
                      sheet alone, which is still worth a menu — it is the only
                      place that says the keys exist. */}
                  {/* FIRST, because on a phone it is the ONLY route to another
                      site or another audit — the strip that used to carry them
                      is desk-only now. The hint names what is live, so the menu
                      answers "which audit am I in" as well as changing it. */}
                  <MoreItem
                    icon={<IconGrid width={14} height={14} />}
                    label="All audits"
                    hint={`Switch site or audit — ${entityOf(entityCode).short} ${visitLabel} now`}
                    onClick={() => { setMore(false); setAudits(true); }}
                  />
                  <div className="my-[4px] h-px" style={{ background: "var(--menu-line)" }} />
                  {role !== "acsa" && (
                    <MoreItem
                      icon={<IconCloudUp width={14} height={14} />}
                      label="Sync to the portal"
                      hint="Send this visit to SharePoint, as you"
                      onClick={() => { setMore(false); setSyncing(true); }}
                    />
                  )}
                  {role !== "acsa" && (
                    <MoreItem
                      icon={<IconDownload width={14} height={14} />}
                      label="Export the workbook"
                      hint="The register, findings, hazards and photographs"
                      onClick={() => { setMore(false); setExporting(true); }}
                    />
                  )}
                  <MoreItem
                    icon={<IconHelp width={14} height={14} />}
                    label="Keyboard shortcuts"
                    hint="What the keys do, on a device that has them"
                    onClick={() => { setMore(false); setHelp(true); }}
                  />
                  {role !== "acsa" && (
                    <>
                      <div className="my-[4px] h-px" style={{ background: "var(--menu-line)" }} />
                      {/* Last, under a rule, and named for what it does rather
                          than for the word Reset — this one clears captured
                          work, and it is in the same menu as Export. */}
                      <MoreItem
                        icon={<IconLoop width={14} height={14} />}
                        label="Start again"
                        hint="Clear captured work for a dry run"
                        tone="warn"
                        onClick={() => { setMore(false); setResetting(true); }}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* The role, always legible, one press to change. */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => { setRoleOpen((v) => !v); setMore(false); }}
              aria-expanded={roleOpen}
              aria-haspopup="menu"
              aria-label={`Viewing as ${role === "acsa" ? "ACSA" : "TPJV"} — change`}
              className="flex min-h-[44px] items-center gap-[6px] rounded-[8px] border px-[10px] py-[7px] font-mono text-[10px] font-semibold transition-[var(--t)]"
              style={
                role === "acsa"
                  ? { background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }
                  : { background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }
              }
            >
              {role === "acsa" ? "ACSA" : "TPJV"}
            </button>

            {roleOpen && (
              <>
                <div
                  className="fixed inset-0 z-[70]"
                  onClick={() => setRoleOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="Viewing as"
                  className="absolute right-0 top-[calc(100%+7px)] z-[75] w-[268px] overflow-hidden rounded-[13px] border p-[5px]"
                  style={{
                    background: "var(--menu-bg)",
                    borderColor: "var(--menu-line)",
                    boxShadow: "var(--e3)",
                  }}
                >
                  <MoreItem
                    icon={<IconTeam width={14} height={14} />}
                    label="TPJV"
                    hint="Capture, export and sync — the full audit"
                    selected={role !== "acsa"}
                    onClick={() => { setRoleOpen(false); setRole("tpjv"); }}
                  />
                  <MoreItem
                    icon={<IconLock width={14} height={14} />}
                    label="ACSA"
                    hint="Read-only: what the client sees, nothing captured"
                    selected={role === "acsa"}
                    onClick={() => { setRoleOpen(false); setRole("acsa"); }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Whether the evidence has left the tablet yet. An auditor who has
              captured forty photographs on an apron is entitled to know they
              are still only on the apron. Silent when everything is safely in
              the record store, which is most of the time. */}
          {(sync.outstanding > 0 || sync.failed > 0) && (
            <button
              onClick={sync.run}
              disabled={sync.uploading || !sync.online}
              title={
                sync.failed
                  ? "Some photographs could not be sent to the record store. Tap to try again."
                  : sync.online
                    ? "Photographs still only on this device. Tap to send them now."
                    : "Offline — photographs will be sent when there is a network."
              }
              className="flex shrink-0 items-center gap-[5px] rounded-[7px] border px-[8px] py-[4px] font-mono text-[9.5px]"
              style={{
                background: sync.failed ? "var(--warn-bg)" : "var(--panel)",
                borderColor: sync.failed ? "var(--warn-line)" : "var(--line-2)",
                color: sync.failed ? "var(--warn)" : "var(--ink-3)",
              }}
            >
              <IconCloud width={11} height={11} />
              {sync.uploading
                ? `sending ${sync.outstanding}`
                : !sync.online
                  ? `${sync.outstanding} waiting · offline`
                  : sync.failed
                    ? `${sync.failed} failed`
                    : `${sync.outstanding} on device only`}
            </button>
          )}

          <div className="flex items-center gap-[9px] border-l pl-[11px]" style={{ borderColor: "var(--line)" }}>
            <div className="relative h-[30px] w-[30px]">
              <svg viewBox="0 0 30 30" width={30} height={30} style={{ transform: "rotate(-90deg)" }}>
                <circle cx="15" cy="15" r="12" fill="none" stroke="var(--line)" strokeWidth="3.5" />
                <circle
                  cx="15" cy="15" r="12" fill="none" stroke="var(--acc)" strokeWidth="3.5" strokeLinecap="round"
                  strokeDasharray={`${checks.length ? (C * done) / checks.length : 0} ${C}`}
                  style={{ transition: "stroke-dasharray 500ms cubic-bezier(.2,.7,.3,1)" }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] font-semibold">
                {pct}%
              </span>
            </div>
            {/* Stacked under the count, the auditor picker measured TWELVE
                pixels tall — the smallest control in the app, in the header, on
                a tablet. Side by side it can be 44px without the header growing
                past its 52. */}
            <div className="hidden items-center gap-[7px] md:flex">
              <b className="font-mono text-[12px] leading-[1.2] font-semibold tnum">
                {done}/{checks.length}
              </b>
              <select
                value={auditor}
                onChange={(e) => setAuditor(e.target.value)}
                aria-label="Auditor"
                className="min-h-[44px] max-w-[132px] rounded-[8px] border px-[7px] text-[10.5px] outline-none"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
              >
                {AUDITORS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* THE AUDIT STRIP — DESK ONLY, and that is Sarel's call on his own
          phone: "there is a duplication in KSIA label. As long as the top
          purple header is visible then we don't need the second one to also be
          visible the whole time."

          He is right twice over. The masthead already says KSIA and Sep 2026,
          in the app's largest type, and it never scrolls. And this strip is not
          cheap: it is a fixed band above every screen, so on a 664px phone it
          spent about 40px permanently restating a fact already on screen — on
          top of a 52px masthead, a sticky filter bar, an action bar and the
          navigation. Measured on Inspection, the fixed furniture was two thirds
          of the viewport.

          NOTHING IS LOST ON A PHONE. Everything this strip does — switching
          site, switching audit, starting a new one — is what "All audits" does,
          and that is now the first item in the More menu, which is present at
          every width. From sm up there is room for the strip and it stays,
          because on a tablet at a desk the visit timeline is genuinely useful
          at a glance. */}
      <div
        className="no-scrollbar hidden shrink-0 items-center overflow-x-auto border-b px-3.5 py-[7px] sm:flex"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        {/* Which audit everything below belongs to. Ten entities, six visits
            each — the store keys every response, verification and capture by
            this pair, so changing it here changes the whole app's subject. */}
        <select
          value={entityCode}
          onChange={(e) => setEntity(e.target.value)}
          aria-label="Entity"
          className="mr-2.5 h-[26px] shrink-0 rounded-[7px] border px-1.5 font-mono text-[9.5px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
        >
          {ENTITIES.map((e) => (
            <option key={e.code} value={e.code}>
              {e.short} — {e.name}
            </option>
          ))}
        </select>
        {/* The strip was clickable before this, but read as a progress
            indicator, so nobody clicked it. Naming the action is the fix. */}
        <button
          onClick={() => setAudits(true)}
          title="Open any audit, or start a new one"
          className="mr-3 flex shrink-0 items-center gap-[5px] rounded-[7px] border px-[9px] py-[4px] font-mono text-[9.5px] transition-[var(--t)]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
        >
          <IconGrid width={11} height={11} />
          All audits
        </button>
        {/* Desk only. On a phone this row is a horizontal scroller carrying an
            entity picker, a button, this hint and six visit chips — it reads as
            cut off because most of it is off-screen, and the hint is the part
            that earns its place least. Everything it points at is behind
            "All audits", which is right there. */}
        <span className="mr-3 hidden whitespace-nowrap font-mono text-[8.5px] tracking-[0.1em] uppercase sm:inline" style={{ color: "var(--ink-4)" }}>
          tap a visit to open it
        </span>
        {visits.length === 0 && (
          <button
            onClick={() => setAudits(true)}
            className="flex shrink-0 items-center gap-[6px] rounded-[7px] border px-[10px] py-[4px] text-[10.5px] transition-[var(--t)]"
            style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
          >
            No audits at {entityOf(entityCode).short} yet — create the first one
          </button>
        )}
        {visits.map((v, i) => (
          <span key={v.id} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => setVisit(v.id)}
              aria-current={v.id === visitId}
              title={`Show ${v.label}`}
              className="flex shrink-0 items-center gap-[6px] rounded-[7px] px-1.5 py-[3px] transition-[var(--t)]"
              style={
                v.id === visitId
                  ? { background: "var(--acc-soft)", boxShadow: "inset 0 0 0 1px var(--acc-line)" }
                  : undefined
              }
            >
              {/* Decorative, and allowed to be: the note beside it already says
                  the state in words — "23 findings", "not audited", "this
                  visit", "scheduled" — so the colour is a second reading of
                  something written, not the only carrier of it. */}
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full"
                style={{
                  background:
                    v.state === "done" ? "var(--good)" : v.state === "current" ? "var(--acc)" : "var(--line-3)",
                  boxShadow: v.state === "current" ? "0 0 0 3.5px var(--acc-soft)" : "none",
                }}
              />
              <span
                className="whitespace-nowrap text-[10.5px]"
                style={{
                  color: v.state === "current" ? "var(--acc)" : v.state === "done" ? "var(--ink-2)" : "var(--ink-4)",
                  fontWeight: v.state === "current" ? 600 : 400,
                }}
              >
                {v.label}
                <span style={{ opacity: 0.6 }}> · {v.note}</span>
              </span>
            </button>
            {i < visits.length - 1 && (
              <span
                className="mx-2 h-[1.5px] w-[22px] shrink-0 rounded-[2px]"
                style={{ background: v.state === "done" ? "var(--good-line)" : "var(--line)" }}
              />
            )}
          </span>
        ))}
      </div>

      {/* A landmark, and the one heading each screen was missing.

          Every screen started at an h2 — the check's own title on Capture, a
          section title elsewhere, nothing at all on Findings and Hazards — so
          somebody navigating by headings had no top of the document to start
          from, and no way to skip the seven-destination nav to reach the work.
          The heading is visually hidden because the screens are already
          titled by the masthead for a sighted auditor; it names the screen AND
          the audit, because "Findings" without the airport is the one thing
          this app must never be ambiguous about. */}
      <main id="work" className="flex min-h-0 flex-1">
        <h1 className="sr-only">
          {/* /home is reached from the brand mark rather than the nav, so it has
              no NAV row to take a label from — and "Squawk — KSIA Sep 2026" is
              the app's name where every other screen names the work. */}
          {pathname === "/home"
            ? "Home"
            : (NAV.find((n) => n.href === pathname)?.label ?? "Squawk")}{" "}
          — {entityOf(entityCode).short} {visitLabel}
        </h1>
        {children}
      </main>

      {palette && (
        <div
          className="fixed inset-0 z-[80] flex justify-center pt-[10vh]"
          style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setPalette(false)}
        >
          <div
            className="w-[min(620px,92vw)] overflow-hidden rounded-[20px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b px-[17px] py-3.5" style={{ borderColor: "var(--line)" }}>
              <IconSearch width={16} height={16} style={{ color: "var(--ink-3)" }} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                /* Named, not just placeheld. The placeholder is built from the
                   site and its check count so it is different on every screen,
                   which makes it useless to a screen reader announcing the
                   field and useless to a test trying to find it. */
                aria-label="Jump to check"
                placeholder={`Search ${entityOf(entityCode).short}'s ${checks.length} checks — ID, wording, system or ACSA figure…`}
                className="w-full border-none bg-transparent text-[14.5px] outline-none"
              />
            </div>
            <div className="max-h-[min(420px,52vh)] overflow-y-auto p-[5px]">
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setPalette(false);
                    setQ("");
                    router.push(`/capture?check=${c.id}`);
                  }}
                  className="flex w-full items-center gap-[9px] rounded-[8px] px-[11px] py-2 text-left transition-[var(--t)] hover:bg-[var(--acc-soft)]"
                >
                  <span className="w-[92px] shrink-0 font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                    {portalIdFor(entityCode, c.id)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">{c.requirement}</span>
                  <Pill>{c.discipline}</Pill>
                </button>
              ))}
              {results.length === 0 && (
                <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--ink-3)" }}>
                  Nothing matches.
                </div>
              )}
            </div>
            <div className="flex gap-3.5 border-t px-4 py-2 font-mono text-[9px]" style={{ borderColor: "var(--line)", color: "var(--ink-4)" }}>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}

      {help && (
        <div
          className="fixed inset-0 z-[80] flex justify-center pt-[12vh]"
          style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setHelp(false)}
        >
          <div
            className="w-[min(520px,92vw)] rounded-[20px] border p-[22px]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-[14px] font-bold">Keyboard</h3>
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-[7px] text-[12px]">
              {[
                ["⌘K", "Jump to any check"],
                ["1 – 4", "Set status: compliant, non-compliant, N/A, not available"],
                ["← →", "Previous / next check"],
                ["?", "This panel"],
                ["esc", "Close"],
              ].map(([k, v]) => (
                <span key={k} className="contents">
                  <kbd
                    className="justify-self-start rounded-[5px] border px-[7px] py-[2px] font-mono text-[10px]"
                    style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                  >
                    {k}
                  </kbd>
                  <span>{v}</span>
                </span>
              ))}
            </div>

            <h3 className="mt-5 mb-2 text-[14px] font-bold">Voice notes</h3>
            <p className="text-[12px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
              Every voice note is recorded and kept on this device. It plays back
              beside the check it belongs to and stays there until the audit is
              exported or reset — that part needs no network and no service, and
              it is not optional.
            </p>

            {/* The consent switch. It is a switch and not a line of prose
                because "dictation is on" was previously true of every recording
                and said nowhere. */}
            <label
              className="mt-2.5 flex cursor-pointer items-start gap-2.5 rounded-[11px] border p-[11px]"
              style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
            >
              <input
                type="checkbox"
                checked={dictation}
                onChange={(e) => setDictation(e.target.checked)}
                className="mt-[2px] h-[16px] w-[16px] shrink-0 accent-[var(--acc)]"
                aria-label="Live text while recording"
              />
              <span className="min-w-0 text-[12px] leading-[1.55]">
                <b>Live text while recording</b>
                <span className="block" style={{ color: "var(--ink-2)" }}>
                  Shows words on screen as you speak. Your browser does this by
                  streaming the audio to its vendor&rsquo;s speech service — on Chrome
                  that is Google — so it is off unless you switch it on. It is
                  English-only and it is absent on iPad Safari. The recording itself
                  is unaffected either way.
                </span>
              </span>
            </label>

            <p className="mt-2.5 text-[12px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
              {transcribeOn ? (
                <>
                  <b>Transcribe</b> on a note sends that one recording to the
                  transcription service and stores what it heard, word for word. It
                  handles English and Afrikaans in the same sentence, which the
                  browser cannot. It runs only when you press it — never on save,
                  never in the background.
                </>
              ) : (
                <>
                  No transcription service is configured, so a note&rsquo;s text is
                  typed by hand. To turn it on, set{" "}
                  <code className="font-mono text-[11px]">ELEVENLABS_API_KEY</code> in
                  the deployment environment.
                </>
              )}
            </p>

            <h3 className="mt-5 mb-2 text-[14px] font-bold">AI assistance</h3>
            <p className="text-[12px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
              {aiOn ? (
                <>
                  A model is connected. It drafts wording, reads a procedure back in
                  plain English, offers a view on a rating, and turns a transcribed
                  voice note into the written observation — always as a suggestion you
                  accept, edit or ignore. It never sets a status, never rates a finding
                  and never writes to the record on its own. When it writes up a note,
                  the words you actually said are kept beside the suggestion so you can
                  check nothing was changed. Only text is sent to it: the check you are
                  on and, for a write-up, that transcript. Photographs are never sent to
                  it, and audio never is either.
                </>
              ) : (
                <>
                  No model is connected, and everything works without one —{" "}
                  <b>Compose from taps</b> builds your observation from the buttons you
                  have pressed, offline. To turn the assistant on, set{" "}
                  <code className="font-mono text-[11px]">ANTHROPIC_API_KEY</code> in the
                  deployment environment.
                </>
              )}
            </p>

            <p className="mt-2.5 text-[11px] leading-[1.55]" style={{ color: "var(--ink-3)" }}>
              Three things can send data off this device: live text, Transcribe and
              the assistant. Each is listed above, each is separately switched, and
              all three are off until someone turns them on. Nothing else in the app
              leaves the tablet. This is the design document&rsquo;s Q4 question and it
              is not settled yet.
            </p>
          </div>
        </div>
      )}

      {exporting && <ExportPanel onClose={() => setExporting(false)} />}
      {syncing && <SyncPanel onClose={() => setSyncing(false)} />}
      {resetting && <ResetPanel onClose={() => setResetting(false)} />}
      {audits && <AuditsPanel onClose={() => setAudits(false)} />}

      {role === "acsa" && (
        <div
          className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-[11px] px-3.5 py-2 text-[11.5px]"
          style={{ background: "var(--acc-soft)", color: "var(--acc)", boxShadow: "var(--e2)" }}
        >
          <IconLock width={13} height={13} />
          ACSA view — dashboard only. Capture is TPJV.
        </div>
      )}
    </div>
  );
}

/** One row in a masthead menu: an icon, what it does, and a line saying what
 *  that means. The hint is not decoration — "Reset" and "Start again" are the
 *  same button, and only one of them tells you it clears captured work. */
function MoreItem({
  icon,
  label,
  hint,
  onClick,
  tone,
  selected,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  tone?: "warn";
  selected?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      /* --menu-* rather than --panel and friends: this row renders inside the
         masthead, which redefines those for the dark band. See globals.css. */
      className="flex w-full min-h-[44px] items-start gap-[9px] rounded-[9px] px-[9px] py-[8px] text-left transition-[var(--t)] hover:bg-[var(--menu-hover)]"
      style={selected ? { background: "var(--menu-acc-soft)" } : undefined}
    >
      <span
        className="mt-[1px] shrink-0"
        style={{ color: tone === "warn" ? "var(--menu-warn)" : selected ? "var(--menu-acc)" : "var(--menu-ink-2)" }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block text-[11.5px] font-semibold"
          style={{ color: tone === "warn" ? "var(--menu-warn)" : selected ? "var(--menu-acc)" : "var(--menu-ink)" }}
        >
          {label}
        </span>
        <span className="mt-[1px] block text-[10.5px] leading-[1.45]" style={{ color: "var(--menu-ink-2)" }}>
          {hint}
        </span>
      </span>
      {/* The current role says so in a word, not only by its tint. */}
      {selected && (
        <span className="mt-[2px] shrink-0 font-mono text-[9px]" style={{ color: "var(--menu-acc)" }}>
          NOW
        </span>
      )}
    </button>
  );
}
