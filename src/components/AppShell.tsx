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
import ExportPanel from "@/components/ExportPanel";
import { SyncPanel } from "@/components/SyncPanel";
import { graphConfigured } from "@/lib/graph";
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
  IconHelp,
  IconLock,
  IconLoop,
  IconPin,
  IconSearch,
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
  { href: "/findings", label: "Findings", icon: IconLoop },
  { href: "/hazards", label: "Hazards", icon: IconFlag },
  { href: "/closure", label: "Follow-up", icon: IconLoop },
  { href: "/dashboard", label: "Dashboard", icon: IconGrid },
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
     register. Capture lists 365 and Field lists 314; a badge of 374 on either
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
    <div className="flex h-screen flex-col overflow-hidden">
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
      <header className="masthead flex min-h-[52px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3.5 py-1 sm:h-[52px] sm:flex-nowrap sm:py-0">
        <Link href="/dashboard" className="flex min-h-[44px] shrink-0 items-center gap-[9px] no-underline">
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
          <span>
            <b className="block font-display text-[13px] leading-[1.2] font-bold" style={{ color: "var(--ink)" }}>
              Squawk
            </b>
            <span className="font-mono text-[8.5px] tracking-[0.07em]" style={{ color: "var(--ink-3)" }}>
              {entityOf(entityCode).short} · {visitLabel.toUpperCase()}
            </span>
          </span>
        </Link>

        <nav
          className="hide-scrollbar order-last flex w-full min-w-0 shrink-0 basis-full gap-[2px] overflow-x-auto rounded-[11px] p-[3px] sm:order-none sm:w-auto sm:flex-1 sm:basis-auto"
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
               work, because a bare number does not say which it is. "314"
               beside Capture could be 314 done or 314 left, and the auditor
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
                <Icon width={13} height={13} />
                {n.label}
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
          {/* Sync sits beside Export because they are the same act at different
              destinations — the workbook goes to a person, this goes to the
              portal. Hidden entirely where no portal is configured: a button
              that can only ever explain why it does not work is clutter on a
              header that has already been measured down to the pixel.

              ACSA is read-only across the audit, so no sync for them either —
              the portal is where their copy comes FROM. */}
          {role !== "acsa" && graphConfigured() && (
            <button
              onClick={() => setSyncing(true)}
              title="Send this visit's capture to the SharePoint portal"
              className="flex min-h-[44px] items-center gap-[6px] rounded-[8px] border px-[10px] py-[7px] text-[11.5px] transition-[var(--t)]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
            >
              <IconCloudUp width={13} height={13} />
              <span className="hidden lg:inline">Sync</span>
            </button>
          )}

          {role !== "acsa" && (
            <button
              onClick={() => setExporting(true)}
              className="flex min-h-[44px] items-center gap-[6px] rounded-[8px] border px-[10px] py-[7px] text-[11.5px] transition-[var(--t)]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
            >
              <IconDownload width={13} height={13} />
              <span className="hidden md:inline">Export</span>
            </button>
          )}

          {role !== "acsa" && (
            <button
              onClick={() => setResetting(true)}
              aria-label="Start again"
              title="Start again — clear captured data for a dry run"
              className="hidden min-h-[44px] items-center gap-[6px] rounded-[8px] border px-[10px] py-[7px] text-[11.5px] transition-[var(--t)] sm:flex"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-3)" }}
            >
              <IconLoop width={13} height={13} />
              <span className="hidden lg:inline">Reset</span>
            </button>
          )}

          {/* Keyboard shortcuts, on a device with no keyboard — and Start again,
              which is a dry-run tool nobody wants within reach on an apron.
              Both hidden below sm so the phone header stays two rows instead of
              three: on an iPhone SE that is the difference between 155px and
              107px of a 568px screen. */}
          <button
            onClick={() => setHelp(true)}
            aria-label="Keyboard shortcuts"
            className="hidden min-h-[44px] items-center rounded-[8px] border p-[9px] transition-[var(--t)] sm:flex"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            <IconHelp width={14} height={14} />
          </button>

          {/* The role simulator is the one control a phone can go without: it
              exists so somebody can see what ACSA sees, and nobody does that
              one-handed on a 390px screen. Everything else stays reachable at
              every width. */}
          <div className="hidden gap-[2px] rounded-[8px] p-[2px] sm:flex" style={{ background: "var(--sunken)" }}>
            {(["tpjv", "acsa"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className="min-h-[44px] rounded-[6px] px-[10px] py-[5px] font-mono text-[10px] font-semibold transition-[var(--t)]"
                style={{
                  background: role === r ? "var(--acc)" : "transparent",
                  color: role === r ? "var(--on-acc)" : "var(--ink-3)",
                }}
              >
                {r.toUpperCase()}
              </button>
            ))}
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

      <div
        className="no-scrollbar flex shrink-0 items-center overflow-x-auto border-b px-3.5 py-[7px]"
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
        <span className="mr-3 whitespace-nowrap font-mono text-[8.5px] tracking-[0.1em] uppercase" style={{ color: "var(--ink-4)" }}>
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
              <span
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

      <div className="flex min-h-0 flex-1">{children}</div>

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
