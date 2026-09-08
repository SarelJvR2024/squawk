"use client";

import { useEffect, useRef, useState } from "react";
import type { Check, Compliance } from "@/lib/types";
import { priorFor, useEntityCode, useResponses, useStore, useVisitFindings, useVisitId } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import { useAnswers } from "@/lib/answers";
import {
  assist,
  checkContext,
  composeObservation,
  transcriptContext,
  useAssistAvailable,
} from "@/lib/assist";
import { bandFor, BAND_META } from "@/lib/risk";
import { modeLabels, needsField } from "@/lib/verification";
import { AttachmentStrip, PhotoButton, VoiceNoteButton } from "./Capture";
import RootCauseAdvice from "./RootCauseAdvice";
import HazardAdvice from "./HazardAdvice";
import RecordActions from "./RecordActions";
import {
  IconCheck,
  IconClock,
  IconDash,
  IconLeft,
  IconPin,
  IconRight,
  IconSpark,
  IconWand,
  IconX,
} from "@/components/ui/icons";
import { Btn, Chip, Field, Panel, Pill } from "@/components/ui/primitives";

const STATUSES: { key: Compliance; label: string; Icon: typeof IconCheck; tone: string }[] = [
  { key: "C", label: "Compliant", Icon: IconCheck, tone: "good" },
  { key: "NC", label: "Non-compliant", Icon: IconX, tone: "bad" },
  { key: "N/A", label: "N/A", Icon: IconDash, tone: "neu" },
  { key: "NV", label: "Not available", Icon: IconClock, tone: "warn" },
];

/** Every reference extract reads the same way: the document's words, set as
 *  the document set them. Whitespace is preserved because ACSA's procedures
 *  carry numbered sub-clauses on their own lines and reflowing them loses the
 *  numbering an auditor is about to quote. */
function RefText({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[12.5px] leading-[1.6] whitespace-pre-line"
      style={{ color: "var(--ink-2)" }}
    >
      {children}
    </div>
  );
}

const toneStyle = (tone: string, on: boolean): React.CSSProperties =>
  on
    ? {
        background: `var(--${tone}-bg)`,
        borderColor: `var(--${tone})`,
        color: `var(--${tone})`,
      }
    : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" };

export default function CheckDetail({
  check,
  onPrev,
  onNext,
  onSaved,
}: {
  check: Check;
  onPrev: () => void;
  onNext: () => void;
  onSaved: (msg: string) => void;
}) {
  const r = useResponses()[check.id] ?? {
    checkId: check.id,
    compliance: null,
    observation: "",
    evidencePicked: [],
    issuesPicked: [],
    walkaboutPicked: null,
    attachments: [],
    captured: false,
    capturedBy: "",
    capturedAt: null,
    deskDoneBy: "",
    deskDoneAt: null,
    fieldDoneBy: "",
    fieldDoneAt: null,
    flaggedForField: false,
  };
  const auditor = useStore((s) => s.auditor);
  const setCompliance = useStore((s) => s.setCompliance);
  const toggleEvidence = useStore((s) => s.toggleEvidence);
  const toggleIssue = useStore((s) => s.toggleIssue);
  const setWalkabout = useStore((s) => s.setWalkabout);
  const appendObservation = useStore((s) => s.appendObservation);
  const patch = useStore((s) => s.patch);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const updateAttachment = useStore((s) => s.updateAttachment);
  const updateFinding = useStore((s) => s.updateFinding);
  const commit = useStore((s) => s.commit);
  const visitId = useVisitId();

  const aiOn = useAssistAvailable();
  const [draft, setDraft] = useState<string | null>(null);
  const [thinking, setThinking] = useState<null | "observation" | "explain">(null);
  const [explained, setExplained] = useState<string | null>(null);
  const [titleOpen, setTitleOpen] = useState(false);
  const [tab, setTab] = useState(0);
  /* Whether this screen has been scrolled at all.
   *
   *  From lg the two columns scroll inside themselves and this container never
   *  moves, so `stuck` stays false and the header keeps its full title — which
   *  is right, because that is the size that has room for it. Below lg the
   *  whole screen scrolls, and 60px of pinned title on a 664px phone is the
   *  difference between a check-list you can read and a letterbox. It comes
   *  back the moment you scroll to the top, and "Show the full wording" is
   *  still there. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const obsRef = useRef<HTMLTextAreaElement>(null);
  const a = useAnswers(check.id);
  const entityCode = useEntityCode();
  const addFindingProgress = useStore((s) => s.addFindingProgress);
  /* Findings this check has raised, so their root cause can be worked here
     rather than only on the findings screen. */
  const raised = useVisitFindings().filter((f) => f.checkId === check.id);
  /* The id an auditor reads out and the portal syncs on is the SITE's id.
     ORTIA-ELE-001 and KSIA-ELE-001 are the same requirement at two airports;
     showing the King Shaka number at O.R. Tambo would be quoting the wrong
     check-point into an ACSA report. */
  const portalId = portalIdFor(entityCode, check.id);
  /* The prior rating belongs to the entity in view, not to the register row.
     `check.pf` was a static column carrying King Shaka's PF number to every
     site, so a Cape Town check announced a King Shaka finding. */
  const pf = priorFor(entityCode, check.discipline, check.system);
  const longTitle = check.requirement.length > 140;

  /* Suggestions belong to the check that produced them.
     
     Cleared during render rather than in an effect, so the new check never
     paints carrying the previous one's proposed answer — even for one frame.
     A suggested observation flashing under the wrong check-point is not a
     cosmetic bug on an audit tool. */
  const [shownFor, setShownFor] = useState(check.id);
  if (shownFor !== check.id) {
    setShownFor(check.id);
    setDraft(null);
    setExplained(null);
    setThinking(null);
    setTitleOpen(false);
    setTab(0);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setStuck(el.scrollTop > 24);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(
        (document.activeElement as HTMLElement)?.tagName ?? ""
      );
      if (typing) return;
      if (["1", "2", "3", "4"].includes(e.key)) {
        const next = STATUSES[Number(e.key) - 1].key;
        setCompliance(check.id, r.compliance === next ? null : next);
      }
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [check.id, r.compliance, setCompliance, onNext, onPrev]);

  const save = (advance: boolean) => {
    commit(check.id, "desk");
    onSaved(
      needsField(check) && !r.fieldDoneAt
        ? `${portalId} — desk done. Still needs the asset seen in Field.`
        : `${portalId} saved`
    );
    if (advance) onNext();
  };

  /* The extracts, as tabs rather than a stack.
   *
   *  Nothing has been dropped and nothing has been shortened — the procedure
   *  wording, the records ACSA names, the evidence it expects, the external
   *  standard, the walkabout line and any conflict between documents are all
   *  still here in full. What changed is that they no longer decide where the
   *  question is on the screen. A tab only exists where the register actually
   *  carries that field, so a thin check shows two tabs, not six empty ones. */
  const refTabs: { key: string; label: string; body: React.ReactNode }[] = [];
  if (check.acsaRequirement)
    refTabs.push({
      key: "procedure",
      label: "ACSA procedure",
      body: <RefText>{check.acsaRequirement}</RefText>,
    });
  if (check.acsaEvidence.length > 0)
    refTabs.push({
      key: "records",
      label: "Records ACSA names",
      body: (
        <ul
          className="list-disc pl-4 text-[12.5px] leading-[1.7]"
          style={{ color: "var(--ink-2)" }}
        >
          {check.acsaEvidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ),
    });
  if (check.evidenceExpected)
    refTabs.push({
      key: "expected",
      label: "Evidence expected",
      body: <RefText>{check.evidenceExpected}</RefText>,
    });
  if (check.walkabout)
    refTabs.push({
      key: "walkabout",
      label: "Walkabout",
      body: <RefText>{check.walkabout}</RefText>,
    });
  if (check.basis)
    refTabs.push({
      key: "basis",
      label: "External basis",
      body: (
        <>
          {check.basisConfidence === "medium" && (
            <div
              className="mb-1.5 inline-flex rounded-full px-[7px] py-[2px] font-mono text-[9px]"
              style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
              title="The instrument applies, but the clause is cited at document level. Do not quote a clause number from this."
            >
              cited at document level
            </div>
          )}
          <RefText>{check.basis}</RefText>
          {check.basisNote && (
            <div
              className="mt-2 border-t pt-2 text-[11.5px] leading-[1.5]"
              style={{ borderColor: "var(--line)", color: "var(--warn)" }}
            >
              {check.basisNote}
            </div>
          )}
        </>
      ),
    });
  if (check.acsaConflict)
    refTabs.push({
      key: "conflict",
      label: "Document issue",
      body: <RefText>{check.acsaConflict}</RefText>,
    });
  /* Clamped rather than trusted: the tab index resets with the check, but a
     check with two tabs must never index a third one it does not have. */
  const refTab = Math.min(tab, Math.max(0, refTabs.length - 1));

  const photos = r.attachments.filter((x) => x.kind === "photo").length;
  const voice = r.attachments.find((x) => x.kind === "voice");

  return (
    <div ref={scrollRef} className="app-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
      {/* sticky context header */}
      <div
        className="sticky top-0 z-[6] border-b px-5 pt-[11px] pb-2.5"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        {/* ONE LINE THAT SCROLLS on a phone, wrapping only where there is
            room. Three wrapped rows of pills is 50px of pinned header taken
            off a 664px screen before the check has said anything. */}
        <div
          className="mb-[5px] flex flex-nowrap items-center gap-[7px] overflow-x-auto font-mono text-[10px] [&>*]:shrink-0 sm:flex-wrap sm:overflow-visible"
          style={{ color: "var(--ink-3)" }}
        >
          <span>{portalId}</span>
          <span>·</span>
          <span>{check.system}</span>
          {/* What this check actually requires, from the register's vtype.
              "Physical" also means it is waiting on the tablet in Field mode —
              saving here does not answer that half. */}
          {modeLabels(check).map((m) => (
            <Pill key={m} tone={m === "Physical" ? "warn" : "accent"}>
              {m.toUpperCase()}
            </Pill>
          ))}
          {check.coverage === "none" && <Pill tone="bad">NO ACSA BASIS</Pill>}
          {check.siteVariant && <Pill tone="warn">{check.siteVariant.site} VARIANT</Pill>}
          {pf && (
            <Pill tone={pf.rating === "Unacceptable" ? "bad" : pf.rating === "Tolerable" ? "warn" : "good"}>
              {pf.key} · 2025 {pf.rating.toUpperCase()}
            </Pill>
          )}
          {/* Where the check stands, pinned. The sentence in the action bar
              says it more fully and is hidden on a phone, so the pill carries
              it there. */}
          {r.captured ? (
            <Pill tone={r.compliance === "NC" ? "bad" : r.compliance === "C" ? "good" : r.compliance === "NV" ? "warn" : "neutral"}>
              {r.compliance}
            </Pill>
          ) : r.deskDoneAt ? (
            <Pill tone="warn">DESK DONE</Pill>
          ) : null}
        </div>
        {/* 27 register rows run past 140 characters and one reaches 569. Left
            unclamped they turn the sticky header into half the screen, so a long
            one is capped at three lines with a control to open it. Short ones —
            the great majority — get no clamp and no extra control. */}
        <h2
          className={`max-w-[92ch] font-bold ${
            stuck && !titleOpen
              ? "line-clamp-1 text-[13px] leading-[1.35]"
              : `text-[15.5px] leading-[1.3]${
                  longTitle && !titleOpen ? " line-clamp-2 sm:line-clamp-3" : ""
                }`
          }`}
        >
          {check.requirement}
        </h2>
        {/* Only for the genuinely long ones. A title compacted by scrolling
            comes back by scrolling, and a control saying so would cost the row
            the compaction just saved. */}
        {longTitle && (
          <button
            onClick={() => setTitleOpen((v) => !v)}
            aria-expanded={titleOpen}
            className="mt-[3px] rounded-[5px] font-mono text-[9.5px] tracking-[.04em] uppercase"
            style={{ color: "var(--acc)" }}
          >
            {titleOpen ? "Show less" : "Show the full wording"}
          </button>
        )}

        {/* THE ANSWER LIVES IN THE HEADER, which is sticky — so the four
            buttons are on screen whatever the auditor has scrolled to.
            
            They used to be the first thing in the capture column, which meant
            reading a long extract on the left scrolled the answer away on the
            right, and answering meant scrolling back up to a control you could
            no longer see. The status is the one thing on this screen that is
            true of the whole check rather than of a part of it, so it belongs
            with the check's identity, not inside one of the two columns. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-[6px]">
          <span className="label-xs hidden shrink-0 sm:block" style={{ color: "var(--ink-3)" }}>
            Status
          </span>
          {/* Two by two on a phone, one row wherever four labelled buttons
              fit. Four full labels do not fit 350px and wrapped three-then-one,
              which reads as a rendering fault rather than a choice. */}
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-[5px] sm:flex sm:flex-wrap">
            {STATUSES.map(({ key, label, Icon, tone }) => (
              <button
                key={key}
                onClick={() => setCompliance(check.id, r.compliance === key ? null : key)}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-[6px] rounded-[10px] border-[1.5px] px-[7px] font-display text-[11px] font-semibold whitespace-nowrap transition-[var(--t)] sm:px-[10px] sm:text-[11.5px]"
                style={toneStyle(tone, r.compliance === key)}
              >
                {/* The tick goes, not the word. Four labelled buttons fit one
                    390px row without their icons and wrap to two rows with
                    them, and a second 50px row of pinned header costs more
                    than the icon is worth. */}
                <Icon width={14} height={14} className="hidden sm:block" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {needsField(check) && (
        <div
          className="flex items-center gap-2 border-b px-5 py-[6px] text-[10.5px] leading-[1.4] sm:py-[7px] sm:text-[11px]"
          style={{ background: "var(--warn-bg)", borderColor: "var(--line)", color: "var(--warn)" }}
        >
          <IconPin width={12} height={12} />
          This check also needs the asset seen on site — it appears in Field inspection too.
        </div>
      )}

      {/* Two panes from lg, not xl. An iPad in landscape is 1180px wide and was
          falling to a single column, which stacked the entire reference column
          — basis, thresholds, ACSA documents — above the capture controls. On
          anything narrower the order below puts capture first instead. */}
      {/* `flex-1` only from lg, and this is a bug fix, not a tidy-up.
          
          From lg each column scrolls inside itself, so the grid must take the
          leftover height and stop — that is what flex-1 with min-h-0 does.
          Below lg the whole screen scrolls and the grid has to be as tall as
          its content; flex-1 gave it the leftover height instead, its content
          spilled out of a 115px box, and the sticky bar — which can only stick
          within its parent's content box — came to rest in the MIDDLE of the
          screen with chips scrolling underneath it. */}
      <div className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        {/* reference column */}
        <div
          className="order-2 border-b px-[18px] pt-4 pb-[18px] lg:order-1 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:pb-[90px]"
          style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
        >
          {/* THE BRIEF — the three things an auditor opens their mouth with.

              What stood here was seven panels of equal weight: the question,
              the threshold, ACSA's quote, a document conflict, a plain reading,
              the walkabout line, and a folded pile of extracts. All of it is
              real material and none of it was ordered by how the conversation
              actually runs. The question is first because it is the first thing
              said. The standard is second because it is what the answer gets
              measured against. The plain reading is third because it is what
              gets said when the reply is "why are you asking?". Everything else
              is reference — kept in full, one tap away, below. */}

          {check.question && (
            <Panel tone="accent" className="mb-[9px]">
              <div className="label-xs" style={{ color: "var(--acc)" }}>
                Ask ACSA
              </div>
              <div
                className="mt-1 text-[14px] leading-[1.45] font-semibold"
                style={{ color: "var(--acc)" }}
              >
                {check.question}
              </div>
            </Panel>
          )}

          {/* The standard, the site's override of it, and ACSA's own words for
              it, in ONE panel. Three panels made them three subjects; they are
              one subject, and the auditor needs all three in a single glance
              before saying a number out loud. */}
          <Panel className="mb-[9px]">
            <div className="label-xs">The standard to audit against</div>
            <div className="mt-1 text-[13.5px] leading-[1.5] font-semibold">
              {check.target || "—"}
            </div>

            {check.siteVariant && (
              /* 33 checks carry a threshold stricter than the network default at
                 this site. It goes above ACSA's network wording, not in a
                 tooltip — an auditor who reads the network figure and misses
                 this one audits against the wrong standard. */
              <div
                className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
                style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)" }}
              >
                <div className="label-xs" style={{ color: "var(--warn)" }}>
                  {check.siteVariant.site} applies here — this overrides the network default
                </div>
                <div
                  className="mt-1 text-[12.5px] leading-[1.55] whitespace-pre-line"
                  style={{ color: "var(--warn)" }}
                >
                  {check.siteVariant.note}
                </div>
              </div>
            )}

            {check.acsaThreshold ? (
              <div
                className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
                style={{ background: "var(--acc-soft)", borderColor: "var(--acc-line)" }}
              >
                <div className="label-xs" style={{ color: "var(--acc)" }}>
                  ACSA states ·{" "}
                  {check.acsaDocs
                    .map((d) => `${d.doc}${d.clause ? ` cl. ${d.clause}` : ""}`)
                    .join("; ")}
                </div>
                {/* Bounded, because a handful of these run to a dozen lines of
                    quoted clause and the panel below them is the plain reading
                    of the same thing. Every word is still here; the ones past
                    the tenth line are a scroll away rather than a screenful. */}
                <div
                  className="mt-1 max-h-[240px] overflow-y-auto text-[12.5px] leading-[1.55]"
                  style={{ color: "var(--acc)" }}
                >
                  {check.acsaThreshold}
                </div>
              </div>
            ) : (
              /* Silence on screen reads as "nothing to see here". It is the
                 opposite: where ACSA's own documents set no threshold, there is
                 no standard to audit against, and that is itself the finding.
                 Say it, rather than leaving a gap the auditor has to notice. */
              <div
                className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
                style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)" }}
              >
                <div className="label-xs" style={{ color: "var(--warn)" }}>
                  ACSA states no threshold
                </div>
                <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--warn)" }}>
                  {check.acsaDocs.length > 0
                    ? `${check.acsaDocs
                        .map((d) => d.doc)
                        .join(", ")} covers this but sets no interval, limit or acceptance value. Compliance cannot be assessed against a stated standard — raise the absence itself.`
                    : "No ACSA document covering this check has been identified. There is no internal standard to audit against — raise the absence itself."}
                </div>
              </div>
            )}
          </Panel>

          {/* Reading a procedure back in plain English is the one thing on this
              screen a rule cannot do. It reads only this check's own fields —
              nothing it says is new information, and nothing it says is
              evidence. The slot is always here so the brief keeps its shape;
              what fills it depends on whether a model is configured. */}
          <Panel className="mb-[9px]">
            <div className="label-xs">
              In plain English{explained ? " · AI reading, not evidence" : ""}
            </div>
            {explained ? (
              <div className="relative">
                <div
                  className="mt-1 pr-6 text-[12.5px] leading-[1.55]"
                  style={{ color: "var(--ink-2)" }}
                >
                  {explained}
                </div>
                <button
                  onClick={() => setExplained(null)}
                  aria-label="Dismiss the explanation"
                  className="absolute -top-[3px] right-0 rounded-[6px] p-1"
                  style={{ color: "var(--ink-4)" }}
                >
                  <IconX width={13} height={13} />
                </button>
              </div>
            ) : aiOn ? (
              <button
                disabled={thinking === "explain"}
                onClick={async () => {
                  setThinking("explain");
                  try {
                    setExplained(await assist("explain", checkContext(check)));
                  } catch (err) {
                    onSaved(err instanceof Error ? err.message : "The assistant is unavailable");
                  } finally {
                    setThinking(null);
                  }
                }}
                className="mt-1.5 flex items-center gap-[6px] rounded-[8px] border px-[11px] py-[6px] text-[11px] transition-[var(--t)] disabled:opacity-55"
                style={{
                  background: "var(--panel)",
                  borderColor: "var(--line-2)",
                  color: "var(--ink-2)",
                }}
              >
                <IconSpark width={13} height={13} />
                {thinking === "explain" ? "Reading…" : "Explain this check"}
              </button>
            ) : (
              <div className="mt-1 text-[12px] leading-[1.55]" style={{ color: "var(--ink-3)" }}>
                No model is configured on this build, so there is no plain reading to offer here.
                ACSA&apos;s own wording is under Reference below.
              </div>
            )}
          </Panel>

          {pf?.note && (
            <Panel tone="warn" className="mb-[9px]">
              <div className="label-xs" style={{ color: "var(--warn)" }}>
                {pf.key} follow-up · carried from 2025
                {/* A derived rating was computed from that site's own portal
                    findings rather than published as a rating, and says so
                    rather than borrowing an authority nobody gave it. */}
                {pf.derived && " · derived from the 2025 findings"}
              </div>
              <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--warn)" }}>
                {pf.note}
              </div>
            </Panel>
          )}

          {/* THE REFERENCE — everything else the register holds, in full.
              
              It was a stack of panels plus a fold called "Full reference", so
              the column's length depended on how much research a check happened
              to attract and the brief sat somewhere in the middle of it. Tabs
              give it a fixed footprint and one tap to any of it: the extracts
              are exactly as long as they were, they simply no longer decide
              where the question is on the screen. */}
          {refTabs.length > 0 && (
            <div
              className="rounded-[11px] border"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <div
                role="tablist"
                aria-label="Reference extracts"
                className="flex gap-[5px] overflow-x-auto border-b px-[9px] py-[8px]"
                style={{ borderColor: "var(--line)" }}
              >
                {refTabs.map((t, i) => (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={refTab === i}
                    onClick={() => setTab(i)}
                    className="shrink-0 rounded-full border px-[11px] py-[6px] font-display text-[10.5px] font-semibold whitespace-nowrap transition-[var(--t)]"
                    style={
                      refTab === i
                        ? {
                            background: "var(--acc)",
                            borderColor: "var(--acc)",
                            color: "var(--on-acc)",
                          }
                        : {
                            background: "var(--panel)",
                            borderColor: "var(--line-2)",
                            color: "var(--ink-2)",
                          }
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Bounded and scrolling. One register row runs to 569 characters
                  and the longest basis is longer still; unbounded, a single tab
                  would put the brief off the top of the screen again. */}
              <div className="max-h-[34vh] overflow-y-auto px-[13px] py-[11px] lg:max-h-[46vh]">
                {refTabs[refTab].body}
              </div>
            </div>
          )}
        </div>

        {/* capture column */}
        <div
          className="order-1 px-5 pt-4 pb-[18px] lg:order-2 lg:pb-[90px] lg:overflow-y-auto"
          style={{ background: "var(--focus-surface)" }}
        >
          {a ? (
            <>
              <Field label="Evidence to request" hint={`${r.evidencePicked.length}/${a.EO.length}`}>
                <div className="chip-row flex flex-wrap gap-[5px]">
                  {a.EO.map((e, i) => (
                    <Chip
                      key={i}
                      kind="evidence"
                      selected={r.evidencePicked.includes(i)}
                      title={e.hint}
                      onClick={() => toggleEvidence(check.id, i)}
                    >
                      {r.evidencePicked.includes(i) && <IconCheck width={12} height={12} />}
                      {e.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              {a.AO.length > 0 && (
                <Field label="Likely answers" hint="sets status & seeds the note">
                  <div className="chip-row flex flex-wrap gap-[5px]">
                    {a.AO.map((x, i) => (
                      <Chip
                        key={i}
                        onClick={() => {
                          setCompliance(check.id, x.sets);
                          appendObservation(check.id, x.observation);
                        }}
                      >
                        {x.label}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="Issues found" hint="raises a finding · suggests severity">
                <div className="chip-row flex flex-wrap gap-[5px]">
                  {a.IO.map((x, i) => {
                    const band = bandFor(x.severity_hint, x.likelihood_hint);
                    return (
                      <Chip
                        key={i}
                        kind="issue"
                        selected={r.issuesPicked.includes(i)}
                        title={band ? `${band} — ${BAND_META[band].label}` : undefined}
                        onClick={() => {
                          const picked = r.issuesPicked.includes(i);
                          toggleIssue(check.id, i, {
                            checkId: check.id,
                            discipline: check.discipline,
                            system: check.system,
                            area: check.area,
                            title: x.label,
                            description: x.finding,
                            issueIndex: i,
                            severity: x.severity_hint,
                            likelihood: x.likelihood_hint,
                            ratingConfirmed: false,
                            rootCause: "",
                            action: "",
                            owner: "",
                            dueDate: "",
                            actionStatus: "Open",
                            originVisit: visitId,
                            priorRating: pf?.rating ?? null,
                            suggestedEvent: "",
                            progress: [],
                            adHoc: false,
                            createdBy: auditor,
                          });
                          if (!picked) {
                            appendObservation(check.id, x.finding);
                            onSaved(
                              `Finding raised · ${x.severity_hint.charAt(0)}${x.likelihood_hint.charAt(0)}${band ? ` → ${BAND_META[band].label}` : ""}`
                            );
                          }
                        }}
                      >
                        {x.label}
                        <span className="font-mono text-[8.5px] opacity-70">
                          {x.likelihood_hint.charAt(0)}
                          {x.severity_hint.charAt(0)}
                        </span>
                      </Chip>
                    );
                  })}
                </div>

                {/* Root-cause advice for what this check has actually raised.
                    It sits here, next to the issue chips, because this is the
                    moment the auditor is still standing in front of the
                    responsible person — the questions are only useful before
                    everyone leaves the room. Same component as the findings
                    screen. */}
                {raised.map((f) => (
                  <div
                    key={f.id}
                    className="mt-[9px] rounded-[10px] border px-[10px] py-[8px]"
                    style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                  >
                    <div className="flex flex-wrap items-center gap-[6px]">
                      <span className="text-[11px] font-semibold">{f.title}</span>
                      {f.rootCause ? (
                        <Pill tone="accent">{f.rootCause}</Pill>
                      ) : (
                        <Pill tone="warn">No root cause</Pill>
                      )}
                    </div>
                    <RootCauseAdvice
                      finding={f}
                      check={check}
                      attachments={r.attachments}
                      onPick={(rc) => {
                        updateFinding(f.id, { rootCause: rc });
                        onSaved(`Root cause set · ${rc}`);
                      }}
                    />
                    {/* And the other half of the same moment: what event does
                        this expose? Named here, it gives the hazard register
                        something a person wrote to consolidate from. */}
                    <HazardAdvice
                      finding={f}
                      check={check}
                      attachments={r.attachments}
                      onAccept={(event) => {
                        updateFinding(f.id, { suggestedEvent: event });
                        onSaved(`Hazard noted · ${event}`);
                      }}
                    />

                    {/* The four fields ACSA's dashboards carry, on the screen
                        where the issue was raised.
                        The compliance session settles the check, confirms last
                        cycle's finding and captures the root cause in ONE
                        conversation with the responsible person in the room.
                        Making the auditor navigate away is how the second and
                        third get postponed and then never had.
                        Folded, because a check can raise several findings and
                        an open block each would bury the chips above it. The
                        summary line says what is outstanding, so nothing has
                        to be opened to find that out. */}
                    <details className="group mt-[7px]">
                      <summary
                        className="flex cursor-pointer list-none items-center gap-1.5 py-[3px] text-[10.5px] select-none"
                        style={{ color: "var(--ink-3)" }}
                      >
                        <span className="transition-transform group-open:rotate-90">›</span>
                        Treatment ·{" "}
                        {[
                          !f.rootCause && "no root cause",
                          !f.action && "no action",
                          !f.owner && "no owner",
                          !f.dueDate && "no date",
                        ].filter(Boolean).join(", ") || "complete"}
                        {f.progress?.length ? ` · ${f.progress.length} update${f.progress.length === 1 ? "" : "s"}` : ""}
                      </summary>
                      <div className="mt-1.5">
                        <RecordActions
                          record={f}
                          entityCode={entityCode}
                          showRating={false}
                          progress={f.progress}
                          onProgress={(n) => {
                            addFindingProgress(f.id, n);
                            onSaved("Progress recorded");
                          }}
                          onChange={(patch) => updateFinding(f.id, patch)}
                          onToast={onSaved}
                        />
                      </div>
                    </details>
                  </div>
                ))}
              </Field>

              {a.WO.length > 0 && (
                <Field label="Walkabout" hint="what the eye settles on">
                  <div className="chip-row flex flex-wrap gap-[5px]">
                    {a.WO.map((w, i) => (
                      <Chip
                        key={i}
                        selected={r.walkaboutPicked === i}
                        onClick={() => setWalkabout(check.id, i, w.sets)}
                      >
                        {w.label}
                        {w.photo ? " 📷" : ""}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}
            </>
          ) : check.optionCount > 0 ? (
            /* The library is loading (it is fetched on first use, not bundled).
               A skeleton keeps the layout from jumping when the chips arrive. */
            <div className="mb-4" aria-busy="true" aria-label="Loading the answer library">
              {[6, 5, 5].map((n, row) => (
                <div key={row} className="mb-3.5">
                  <div
                    className="mb-[7px] h-[9px] w-[110px] rounded-full"
                    style={{ background: "var(--line-2)", opacity: 0.7 }}
                  />
                  <div className="chip-row flex flex-wrap gap-[5px]">
                    {Array.from({ length: n }, (_, i) => (
                      <div
                        key={i}
                        className="h-[27px] rounded-full"
                        style={{
                          width: `${88 + ((i * 37) % 96)}px`,
                          background: "var(--line-2)",
                          opacity: 0.55,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Panel tone="warn" className="mb-4">
              <div className="text-[12px]" style={{ color: "var(--warn)" }}>
                No researched options exist for this check yet — capture by typing.
              </div>
            </Panel>
          )}

          {a && a.OS.length > 0 && (
            /* The snippets stay HERE, with the other taps, not in the pinned
               box below. They are things to choose, like every other chip on
               this side; the box below is where what you chose gets written. */
            <Field label="Observation snippets" hint="tap to add to the note">
              <div className="chip-row flex flex-wrap gap-[5px]">
                {a.OS.map((sn, i) => (
                  <Chip key={i} onClick={() => appendObservation(check.id, sn)}>
                    + {sn}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
        </div>
      </div>

      {/* THE ANSWER BOX, PINNED — and the actions that commit it, with it.

          The three ways of putting an answer in — type it, say it, photograph
          it — were the LAST thing in the capture column. On a phone that meant
          six groups of chips above them: an auditor standing in a substation
          with a voice note to record had to scroll past everything they had
          already tapped to reach the button, and scroll back to see what they
          had said. They are now on screen at every scroll position, directly
          above the Save that commits them.

          The taps stay in the column above, because those are the reading. This
          is the writing. */}
      <div
        /* bottom-0, not bottom-[var(--bottom-nav)]: `.app-scroll` already pads
           this scroller by the nav's height, and Chrome takes that padding off
           the sticky floor — offsetting again left the bar hovering 56px above
           the nav with a strip of content sliding under it. */
        className="sticky bottom-0 z-[7]"
        style={{
          background: "var(--panel)",
          boxShadow: "0 -6px 18px -10px rgba(22,16,40,.2)",
        }}
      >
        <div className="border-t px-5 pt-[9px] pb-[9px]" style={{ borderColor: "var(--line)" }}>
          <div className="mb-[6px] hidden items-center justify-between gap-3 sm:flex">
            <b className="font-display text-[11px] font-semibold">Observation</b>
            <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
              {voice ? "voice note attached" : "type · speak · photograph"}
              {photos > 0 ? ` · ${photos} photo${photos > 1 ? "s" : ""}` : ""}
            </span>
          </div>

          {draft !== null && (
            /* A draft is a proposal. It sits beside the record until the
               auditor puts it in — nothing writes itself into the audit. */
            <div
              className="mb-[7px] max-h-[28vh] overflow-y-auto rounded-[11px] border p-3"
              style={{ borderColor: "var(--acc)", background: "var(--acc-bg)" }}
            >
              <div className="label-xs mb-1.5" style={{ color: "var(--acc)" }}>
                Suggested wording · yours to accept, edit or ignore
              </div>
              <div className="text-[12.5px] leading-[1.55]">{draft}</div>
              <div className="chip-row mt-2.5 flex flex-wrap gap-[6px]">
                <Btn
                  onClick={() => {
                    patch(check.id, { observation: draft });
                    setDraft(null);
                    obsRef.current?.focus();
                  }}
                >
                  Use it
                </Btn>
                <Btn variant="ghost" onClick={() => setDraft(null)}>
                  Discard
                </Btn>
              </div>
            </div>
          )}

          {r.attachments.length > 0 && (
            /* Bounded, because this bar is pinned: four photographs and a voice
               note being written up must not grow until they own the screen. */
            <div className="mb-[7px] max-h-[34vh] overflow-y-auto">
              <AttachmentStrip
                attachments={r.attachments}
                onRemove={(id) => removeAttachment(check.id, id)}
                onUpdate={(id, p) => updateAttachment(check.id, id, p)}
                /* Only offered where a model is configured. Without one the
                   note is still recorded, played back and transcribed —
                   there is simply nothing to write it up with. */
                writeUp={
                  aiOn
                    ? (t) => assist("transcript", transcriptContext(t, check, r))
                    : undefined
                }
                /* Accepting appends to the observation rather than replacing
                   it: an auditor who has already typed something has not
                   asked for it to be thrown away. */
                onAccept={(text) => {
                  appendObservation(check.id, text);
                  onSaved("Written up into the observation");
                }}
              />
            </div>
          )}

          <textarea
            ref={obsRef}
            value={r.observation}
            onChange={(e) => patch(check.id, { observation: e.target.value })}
            placeholder="Composed from your taps — edit freely…"
            aria-label="Observation"
            /* 44px at rest, 112px once the cursor is in it, and full height
               from sm. A phone that pins a six-line box has two lines of check
               left above it; one that pins a single line has nowhere to write.
               It grows when there is something to write in it. */
            className="max-h-[26vh] min-h-[44px] w-full resize-y rounded-[11px] border px-3 py-2 text-[12.5px] leading-[1.55] outline-none transition-[var(--t)] focus:min-h-[112px] focus:border-[var(--acc)] sm:min-h-[68px] sm:py-2.5"
            style={{ background: "var(--focus-surface)", borderColor: "var(--line-2)" }}
          />

          {/* ONE ROW THAT SCROLLS, not two rows that wrap. At 44px a wrapped
              toolbar is a second 50px band taken off a 664px phone for the
              whole session; sideways it costs nothing and every label stays
              the length it needs to be. */}
          <div className="mt-[7px] flex flex-nowrap items-center gap-[6px] overflow-x-auto [&>*]:shrink-0">
            <button
              onClick={() => {
                const text = composeObservation(check, r, a);
                if (text) setDraft(text);
                else onSaved("Nothing tapped yet to compose from");
              }}
              className="flex items-center gap-[6px] rounded-[8px] border px-[11px] py-[6px] text-[11px] transition-[var(--t)]"
              style={{
                background: "var(--panel)",
                borderColor: "var(--line-2)",
                color: "var(--ink-2)",
              }}
              title="Builds a sentence from the buttons you have tapped. Works offline, no model needed."
            >
              <IconWand width={13} height={13} />
              Compose from taps
            </button>
            {aiOn && (
              <button
                disabled={thinking === "observation"}
                onClick={async () => {
                  setThinking("observation");
                  try {
                    setDraft(await assist("observation", checkContext(check, r, a)));
                  } catch (err) {
                    onSaved(err instanceof Error ? err.message : "The assistant is unavailable");
                  } finally {
                    setThinking(null);
                  }
                }}
                className="flex items-center gap-[6px] rounded-[8px] border px-[11px] py-[6px] text-[11px] transition-[var(--t)] disabled:opacity-55"
                style={{
                  background: "var(--panel)",
                  borderColor: "var(--line-2)",
                  color: "var(--ink-2)",
                }}
                title="Drafts the observation from this check's own material. Advisory — you decide."
              >
                <IconSpark width={13} height={13} />
                {thinking === "observation" ? "Drafting…" : "Draft with AI"}
              </button>
            )}
            <VoiceNoteButton
              onCaptured={(m) => {
                addAttachment(check.id, { ...m, createdBy: auditor });
                /* The transcript is attached to the note, not spliced into
                   the observation. An auditor writes the observation; the
                   recording is evidence beside it. */
                onSaved(
                  m.transcript ? "Voice note attached with transcript" : "Voice note attached"
                );
              }}
            />
            <PhotoButton
              onCaptured={(m) => {
                addAttachment(check.id, { ...m, createdBy: auditor });
                onSaved(`Photo attached to ${portalId}`);
              }}
            />
            {/* What is already attached, in the row that scrolls — the label
                row above it is desk-only. */}
            {photos > 0 && (
              <Pill>
                {photos} photo{photos > 1 ? "s" : ""}
              </Pill>
            )}
            {voice && <Pill tone="accent">voice note</Pill>}
          </div>
        </div>

        {/* the actions */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-2.5"
          style={{
            background: "var(--panel)",
            borderColor: "var(--line)",
            paddingBottom: "calc(0.625rem + var(--sticky-safe))",
          }}
        >
          <div
            /* Hidden on a phone, where the same fact is a pill in the pinned
               header and this row is 26px the check-list cannot spare. */
            className="hidden items-center gap-[6px] font-mono text-[10px] sm:flex"
            style={{ color: "var(--ink-3)" }}
          >
            {/* Both halves, named. "Captured" on a check that also needs the
                asset seen would be a claim nobody has earned yet. */}
            <span
              /* Decorative: the words immediately after it say the same thing —
                 "complete · Sarel", "desk done", "not captured yet". The colour
                 is there to be read at a glance, not to be the only reading. */
              aria-hidden
              className="h-[6px] w-[6px] rounded-full"
              style={{
                background: r.captured
                  ? "var(--good)"
                  : r.deskDoneAt
                    ? "var(--warn)"
                    : "var(--line-3)",
              }}
            />
            {r.captured
              ? `complete · ${r.capturedBy.split(" ")[0]}`
              : r.deskDoneAt
                ? `desk done by ${r.deskDoneBy.split(" ")[0]} · awaiting site`
                : "not captured yet"}
            {needsField(check) && r.fieldDoneAt && ` · site seen by ${r.fieldDoneBy.split(" ")[0]}`}
            {r.issuesPicked.length > 0 &&
              ` · ${r.issuesPicked.length} finding${r.issuesPicked.length > 1 ? "s" : ""}`}
          </div>
          <div className="flex gap-[7px]">
            <Btn icon onClick={onPrev} aria-label="Previous">
              <IconLeft width={14} height={14} />
            </Btn>
            <Btn onClick={() => save(false)}>Save</Btn>
            <Btn variant="primary" onClick={() => save(true)}>
              <IconCheck width={14} height={14} />
              Save &amp; next
            </Btn>
            <Btn icon onClick={onNext} aria-label="Next">
              <IconRight width={14} height={14} />
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
