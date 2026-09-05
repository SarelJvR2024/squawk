"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AUDITORS,
  CHECKS,
  PRIOR,
  useEntityCode,
  useResponses,
  useStore,
  useVerifications,
  useVisitFindings,
  useVisitId,
} from "@/lib/store";
import { ENTITIES, entity as entityOf, PROGRAMME_VISITS } from "@/lib/programme";
import { useAssistAvailable } from "@/lib/assist";
import ExportPanel from "@/components/ExportPanel";
import {
  IconClipboard,
  IconCamera,
  IconGrid,
  IconDownload,
  IconHelp,
  IconLock,
  IconLoop,
  IconPin,
  IconSearch,
} from "@/components/ui/icons";
import { Pill } from "@/components/ui/primitives";


const NAV = [
  { href: "/capture", label: "Capture", icon: IconClipboard },
  { href: "/field", label: "Field", icon: IconPin },
  { href: "/review", label: "Review", icon: IconCamera },
  { href: "/findings", label: "Findings", icon: IconLoop },
  { href: "/closure", label: "Closure", icon: IconLoop },
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
  const entityCode = useEntityCode();
  const visitId = useVisitId();
  const setEntity = useStore((s) => s.setEntity);
  const setVisit = useStore((s) => s.setVisit);

  /* The cycle strip and the picker both run off the visits this entity
     actually has, so switching airport re-draws the programme rather than
     showing another site's schedule. */
  const visits = useMemo(
    () => PROGRAMME_VISITS.filter((v) => v.entity === entityCode),
    [entityCode]
  );
  const visitLabel =
    visits.find((v) => v.id === visitId)?.label ?? visitId;

  const [palette, setPalette] = useState(false);
  const aiOn = useAssistAvailable();
  const [help, setHelp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState("");

  const done = useMemo(
    () => Object.values(responses).filter((r) => r.captured).length,
    [responses]
  );
  const unverified = PRIOR.length - Object.values(verifications).filter((v) => v.outcome).length;
  const pct = Math.round((done / CHECKS.length) * 100);

  useEffect(() => {
    if (role === "acsa" && pathname !== "/dashboard") router.replace("/dashboard");
  }, [role, pathname, router]);

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
        return;
      }
      if (!typing && e.key === "?") setHelp(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return CHECKS.filter(
      (c) =>
        !s ||
        `${c.id} ${c.requirement} ${c.system} ${c.discipline} ${c.acsaThreshold}`
          .toLowerCase()
          .includes(s)
    ).slice(0, 40);
  }, [q]);

  const C = 2 * Math.PI * 12;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header
        className="flex h-[52px] shrink-0 items-center gap-3 border-b px-3.5"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <Link href="/dashboard" className="flex shrink-0 items-center gap-[9px] no-underline">
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

        <nav className="flex gap-[2px] rounded-[11px] p-[3px]" style={{ background: "var(--sunken)" }}>
          {NAV.map((n) => {
            const active = pathname === n.href;
            /* ACSA is read-only across the audit, but Visual review is where
               their engineers answer a photograph — the one screen where their
               input is the point rather than a risk. Comments are labelled by
               role and never touch the observation or the finding. */
            const disabled =
              role === "acsa" && n.href !== "/dashboard" && n.href !== "/review";
            const Icon = n.icon;
            const badge =
              n.href === "/capture"
                ? CHECKS.length - done
                : n.href === "/closure"
                  ? unverified
                  : n.href === "/findings"
                    ? findings.length
                    : 0;
            return (
              <Link
                key={n.href}
                href={disabled ? "#" : n.href}
                aria-disabled={disabled}
                onClick={(e) => disabled && e.preventDefault()}
                className="flex items-center gap-[6px] whitespace-nowrap rounded-[8px] px-3 py-[6px] font-display text-[11.5px] font-semibold no-underline transition-[var(--t)]"
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
                {badge > 0 && (
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
          className="flex min-w-[150px] items-center gap-[7px] rounded-[11px] border border-transparent px-[10px] py-[6px] text-[11.5px] transition-[var(--t)]"
          style={{ background: "var(--sunken)", color: "var(--ink-3)" }}
        >
          <IconSearch width={13} height={13} />
          <span className="hidden sm:inline">Jump to check</span>
          <kbd
            className="ml-auto hidden rounded-[4px] border px-[5px] font-mono text-[8.5px] sm:inline"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          {role !== "acsa" && (
            <button
              onClick={() => setExporting(true)}
              className="flex items-center gap-[6px] rounded-[8px] border px-[10px] py-[7px] text-[11.5px] transition-[var(--t)]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
            >
              <IconDownload width={13} height={13} />
              <span className="hidden md:inline">Export</span>
            </button>
          )}

          <button
            onClick={() => setHelp(true)}
            aria-label="Keyboard shortcuts"
            className="rounded-[8px] border p-[9px] transition-[var(--t)]"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            <IconHelp width={14} height={14} />
          </button>

          <div className="flex gap-[2px] rounded-[8px] p-[2px]" style={{ background: "var(--sunken)" }}>
            {(["tpjv", "acsa"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className="rounded-[6px] px-[10px] py-[5px] font-mono text-[10px] font-semibold transition-[var(--t)]"
                style={{
                  background: role === r ? "var(--acc)" : "transparent",
                  color: role === r ? "var(--on-acc)" : "var(--ink-3)",
                }}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-[9px] border-l pl-[11px]" style={{ borderColor: "var(--line)" }}>
            <div className="relative h-[30px] w-[30px]">
              <svg viewBox="0 0 30 30" width={30} height={30} style={{ transform: "rotate(-90deg)" }}>
                <circle cx="15" cy="15" r="12" fill="none" stroke="var(--line)" strokeWidth="3.5" />
                <circle
                  cx="15" cy="15" r="12" fill="none" stroke="var(--acc)" strokeWidth="3.5" strokeLinecap="round"
                  strokeDasharray={`${(C * done) / CHECKS.length} ${C}`}
                  style={{ transition: "stroke-dasharray 500ms cubic-bezier(.2,.7,.3,1)" }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] font-semibold">
                {pct}%
              </span>
            </div>
            <div className="hidden md:block">
              <b className="block font-mono text-[12px] leading-[1.2] font-semibold tnum">
                {done}/{CHECKS.length}
              </b>
              <select
                value={auditor}
                onChange={(e) => setAuditor(e.target.value)}
                className="max-w-[120px] border-none bg-transparent text-[9px] outline-none"
                style={{ color: "var(--ink-3)" }}
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
        <span className="mr-3.5 whitespace-nowrap font-mono text-[8.5px] tracking-[0.1em] uppercase" style={{ color: "var(--ink-4)" }}>
          3-year cycle · 2 visits a year
        </span>
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
                placeholder={`Search all ${CHECKS.length} checks — ID, wording, system or ACSA figure…`}
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
                    {c.id}
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

            <h3 className="mt-5 mb-2 text-[14px] font-bold">AI assistance</h3>
            <p className="text-[12px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
              {aiOn ? (
                <>
                  A model is connected. It drafts wording, reads a procedure back in
                  plain English and offers a view on a rating — always as a suggestion
                  you accept, edit or ignore. It never sets a status, never rates a
                  finding and never writes to the record on its own. Only the text of
                  the check you are on is sent; photographs, voice notes and
                  attachments never leave the device.
                </>
              ) : (
                <>
                  No model is connected, and everything works without one —{" "}
                  <b>Compose from taps</b> builds your observation from the buttons you
                  have pressed, offline. To turn the assistant on, set{" "}
                  <code className="font-mono text-[11px]">ANTHROPIC_API_KEY</code> in the
                  deployment environment. That decision belongs with the data-governance
                  question (design document Q4), because it is the one thing in this app
                  that sends anything off the device.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {exporting && <ExportPanel onClose={() => setExporting(false)} />}

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
