"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Check, Compliance, EvidenceStatus } from "@/lib/types";
import { priorFor, useEntityCode, useResponses, useStore, useVisitFindings } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import { useAnswers } from "@/lib/answers";
import {
  assist,
  checkContext,
  composeObservation,
  transcriptContext,
  useAssistAvailable,
} from "@/lib/assist";
import { modeLabels, needsField } from "@/lib/verification";
import { AttachmentStrip, FileButton, PhotoButton, VoiceNoteButton } from "./Capture";
import AcsaRequirementPanel from "./AcsaRequirementPanel";
import FindingDetail from "./FindingDetail";
import {
  IconCheck,
  IconClipboard,
  IconClock,
  IconDash,
  IconFlag,
  IconHelp,
  IconInfo,
  IconLeft,
  IconPin,
  IconPlus,
  IconRight,
  IconSpark,
  IconWand,
  IconX,
} from "@/components/ui/icons";
import { Btn, Chip, Pill } from "@/components/ui/primitives";

/** HOW A CHECK IS ANSWERED, as a shape.
 *
 *  ACSA's register declares this per check-point in its `vtype` column, and
 *  the three are genuinely different jobs: one is a conversation, one is a
 *  document you take away, one is a walk to the asset. 290 of the 324 are more
 *  than one of them at once. A row of three identically-shaped pills makes
 *  that distinction something an auditor has to read rather than see, which on
 *  a list of a hundred check-points is a distinction nobody reads.
 *
 *  The word stays beside the icon. An icon on its own is a guess, and this is
 *  the field that decides whether a check can be closed at a desk at all. */
const MODE_ICON: Record<string, typeof IconHelp> = {
  Question: IconHelp,
  Evidence: IconClipboard,
  Physical: IconPin,
};

/** THE ANSWER, AND WHAT IS NOT AN ANSWER.
 *
 *  Three options, and they were never three peers. Two are the audit's
 *  verdict on the asset; one is housekeeping — this check does not apply
 *  here. Rendered as three identical boxes in a row, an auditor reads three
 *  equal choices and the shape of the decision is lost. So `group` splits
 *  them, and the qualifier is drawn quieter than the verdicts.
 *
 *  REDUCED FROM FIVE, 2 October 2026 (Sarel: "remove that [compliant,
 *  evidence pending] option. Also remove the not available options"). Both
 *  removed rows were really answering a different question than this
 *  control asks — whether the EVIDENCE for an answer exists — wearing it as
 *  a compliance verdict because there was nowhere else to put it. That
 *  question now has its own place: the Evidence status panel below, with
 *  four states instead of two and room for what is actually missing or
 *  still to come. Existing records captured against the old "C, evidence
 *  pending" or "NV" answers are UNCHANGED — this only removes the buttons
 *  that write new ones; see Response.evidencePending and isOn() below for
 *  how a response carrying either still renders correctly.
 *
 *  ONE FLAT LIST ALL THE SAME, because the qualifier is filtered out of it
 *  for layout, not kept in a second array. Two arrays would let the
 *  keyboard and the screen disagree about what a key means, which is the
 *  kind of drift nobody notices until an answer lands on the wrong check.
 *
 *  THE HOTKEY IS DECLARED, NOT THE POSITION IN THIS ARRAY — 1-3 keep
 *  exactly what they have always meant, so removing 4 and 5 could not
 *  silently reassign a shortcut an auditor already knows. */
export const STATUSES: {
  key: Compliance;
  /** The number key that sets it. Declared, never positional — see above. */
  hotkey: string;
  label: string;
  /** ACSA's own code, for a phone that cannot fit the word. */
  short: string;
  Icon: typeof IconCheck;
  tone: string;
  group: "verdict" | "qualifier";
}[] = [
  {
    key: "C",
    hotkey: "1",
    label: "Compliant",
    short: "C",
    Icon: IconCheck,
    tone: "good",
    group: "verdict",
  },
  {
    key: "NC",
    hotkey: "2",
    label: "Non-compliant",
    short: "NC",
    Icon: IconX,
    tone: "bad",
    group: "verdict",
  },
  {
    key: "N/A",
    hotkey: "3",
    label: "N/A",
    short: "N/A",
    Icon: IconDash,
    tone: "neu",
    group: "qualifier",
  },
];

/** Which row is showing as chosen. A response carrying the old "C, evidence
 *  pending" answer (see Response.evidencePending) is still just "C" here —
 *  there is no longer a second Compliant row for it to disagree with, and
 *  the compliance verdict IS Compliant regardless of what the now-separate
 *  Evidence status panel says about the proof. */
const isOn = (s: (typeof STATUSES)[number], compliance: Compliance | null) =>
  compliance === s.key;

/** EVIDENCE STATUS — a question separate from the verdict above: has the
 *  proof for this check actually been produced? Added 2 October 2026 in
 *  place of the "compliant, evidence pending" and "not available"
 *  compliance buttons (see the note on STATUSES), with room for what is
 *  actually missing or still to come rather than one overloaded flag. */
export const EVIDENCE_STATUSES: {
  key: EvidenceStatus;
  label: string;
  hint: string;
  Icon: typeof IconCheck;
  tone: string;
  /** Present only for the two states that ask for a free-text note, and
   *  what the note is of — the label the textarea itself carries. */
  note?: string;
}[] = [
  {
    key: "noneAvailable",
    label: "No evidence",
    hint: "No evidence available — nothing exists to collect for this check",
    Icon: IconDash,
    tone: "neu",
  },
  {
    key: "specificNotAvailable",
    label: "Not produced",
    hint: "Specific evidence not available — something was asked for and could not be produced",
    Icon: IconX,
    tone: "warn",
    note: "What is missing",
  },
  {
    key: "toBeProvided",
    label: "Pending",
    hint: "Evidence pending — ACSA will produce it after the visit",
    Icon: IconClock,
    tone: "acc",
    note: "What, and by when",
  },
  {
    key: "providedForReview",
    label: "Provided",
    hint: "Evidence provided for review — attach what was handed over",
    Icon: IconCheck,
    tone: "good",
  },
];

/** THE VERDICT THE EVIDENCE ITSELF SUPPORTS — a different question from
 *  EVIDENCE_STATUSES above (has the proof been produced) and from STATUSES
 *  (the check's own compliance verdict).
 *
 *  Replaces "Evidence to request", "Likely answers" and "Issues found" —
 *  Sarel, 11 October 2026, removing all three chip-picking tabs in favour of
 *  this: what the evidence actually proves, written and judged, not asked
 *  for and ticked off.
 *
 *  ALL FOUR OF `Compliance`'S VALUES, 20 Oct 2026. Originally three —
 *  "N/A" was deliberately left out, on the reasoning that evidence cannot
 *  answer whether a check applies at all, only what it shows once it does.
 *  Sarel, reviewing the Review screen's button rows: "should be compliant,
 *  non-compliant, not verified, not applicable" — overriding that on his own
 *  direct instruction, for consistency with the audit check's own verdict
 *  (STATUSES) and so every button row on this screen offers the same shape
 *  of answer. A check that genuinely does not apply can have no evidence to
 *  judge either, and this is now how that gets said here. */
export const EVIDENCE_VERDICTS: {
  key: Compliance;
  label: string;
  Icon: typeof IconCheck;
  tone: string;
}[] = [
  { key: "C", label: "Compliant", Icon: IconCheck, tone: "good" },
  { key: "NC", label: "Non-compliant", Icon: IconX, tone: "bad" },
  { key: "NV", label: "Not Verified", Icon: IconHelp, tone: "warn" },
  { key: "N/A", label: "Not Applicable", Icon: IconDash, tone: "neu" },
];

/** A SCROLLABLE ROW SAYS SO. Sarel, reviewing a 390px screenshot of the tag
 *  row and the tab strip: both are cut off at the edge with nothing on
 *  screen to say there is more if you swipe. Both rows already scroll
 *  sideways on purpose (see each one's own comment — the tab strip in
 *  particular is a direct, quoted Sarel decision never to wrap), so the fix
 *  is the fade-plus-chevron pair home/page.tsx's audit calendar strip
 *  already uses for the same shape of problem, not a new pattern invented
 *  for this one. */
function useEdgeScroll(ref: React.RefObject<HTMLDivElement | null>) {
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setEdge({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return edge;
}

/** The fade+chevron themselves, as the two edge-conditional siblings — never
 *  children — of the scroller they sit beside. An absolutely positioned
 *  child of the scroller would scroll away with it instead of staying put
 *  at the edge; same split home/page.tsx's calendar strip already made. */
function ScrollEdges({ edge }: { edge: { left: boolean; right: boolean } }) {
  return (
    <>
      {edge.left && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 flex w-[22px] items-center justify-start"
          style={{ background: "linear-gradient(90deg, var(--panel) 35%, transparent)" }}
        >
          <IconLeft width={10} height={10} style={{ color: "var(--ink-3)" }} />
        </span>
      )}
      {edge.right && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex w-[22px] items-center justify-end"
          style={{ background: "linear-gradient(270deg, var(--panel) 35%, transparent)" }}
        >
          <IconRight width={10} height={10} style={{ color: "var(--ink-3)" }} />
        </span>
      )}
    </>
  );
}

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

/** THE CHOSEN ANSWER HAS TO BE OBVIOUS ON AN APRON AT MIDDAY.
 *
 *  A tinted background plus a coloured border was too quiet: on a tablet in
 *  daylight the difference between chosen and not chosen is a wash. The inset
 *  ring doubles the border's apparent weight without changing the box model,
 *  so nothing shifts as the answer is tapped.
 *
 *  Tint-and-ring rather than a solid fill with white text, because half the
 *  tone colours inverse in dark mode — `--good` is #157d51 in light and
 *  #4ecb8b in dark — and white on that would be unreadable. Both halves of
 *  this come from per-theme variables, so both themes stay correct. */
export const toneStyle = (tone: string, on: boolean, quiet = false): React.CSSProperties =>
  on
    ? {
        background: `var(--${tone}-bg)`,
        borderColor: `var(--${tone})`,
        color: `var(--${tone})`,
        /* The lift (--e1) is new, 20 Oct 2026 — "make them look more modern and
           consistent throughout the app." Stacked after the existing inset
           ring rather than replacing it, so the selected state keeps the ring
           AND gains the same subtle elevation every other selected surface in
           the app already uses. Deliberately --e1, not OutcomeControl's
           stronger --e2 — OutcomeControl's four-segment trough is a different,
           bolder pattern by design (see its own doc comment on why it never
           takes a tone colour); these flatter tone-tinted grids get the
           lighter lift so the two stay visually distinct, not identical. */
        boxShadow: `inset 0 0 0 1px var(--${tone}), var(--e1)`,
        fontWeight: 700,
        /* An inline style, not a Tailwind class, because it has to beat
           globals.css's site-wide `:focus-visible { outline: 2px solid
           var(--acc); outline-offset: 2px }` — that rule sits outside any
           @layer, so `outline-none` in className can never win against it
           on any browser that treats a tap as focus-visible (several do,
           and this device gets tapped constantly). An offset ring on one
           of five equal, tightly packed buttons reads as "this one broke,"
           not "this one is focused" — worse once it is also the selected
           button, stacking on the tone ring above. That ring is already a
           strong, unambiguous affordance (fill, border, icon,
           aria-pressed) with nothing else in this file relying on the
           global outline to be seen, so it is dropped here rather than
           recoloured — the same trade the rest of this cluster's buttons
           make implicitly by never reaching this state visibly before. */
        outline: "none",
      }
    : {
        background: quiet ? "transparent" : "var(--panel)",
        borderColor: quiet ? "var(--line)" : "var(--line-2)",
        color: quiet ? "var(--ink-3)" : "var(--ink-2)",
        outline: "none",
      };

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
    evidencePending: false,
    evidenceStatus: null,
    evidenceStatusNote: "",
    evidencePendingNote: "",
    evidenceProves: "",
    evidenceVerdict: null,
    siteInspection: null,
    combinedComment: "",
    combinedCommentAt: null,
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
  const setWalkabout = useStore((s) => s.setWalkabout);
  const appendObservation = useStore((s) => s.appendObservation);
  const patch = useStore((s) => s.patch);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const updateAttachment = useStore((s) => s.updateAttachment);
  const commit = useStore((s) => s.commit);
  const systemAssessment = useStore((s) => s.systemAssessment);
  const patchSystem = useStore((s) => s.patchSystem);

  const aiOn = useAssistAvailable();
  const [draft, setDraft] = useState<string | null>(null);
  const [thinking, setThinking] = useState<null | "observation">(null);
  const [titleOpen, setTitleOpen] = useState(false);
  /* ONE open panel, by key.
   *
   *  It used to be two pieces of state — an index into the reference extracts
   *  on the left and a key into the capture panels on the right — because
   *  there were two columns. There is one now, so there is one.
   *
   *  It is deliberately NOT reset when the check changes. An auditor walking a
   *  discipline works the same panel check after check — evidence, evidence,
   *  evidence — and being thrown back to the first tab on every Save & next is
   *  a press per check for the whole walk. A key that this check does not
   *  carry falls back to the first one it does.
   *
   *  THIRD TIME HOLDING AT "standard" (ACSA requirement) — ui-refresh Stage
   *  2, Area 3 tried moving the default to each check's own first capture
   *  ("do") panel instead, on the reasoning that a reference panel open by
   *  default competes with the primary read → record → attach → decide →
   *  save flow for first-paint attention. Sarel, reviewing it: keep it the
   *  way he originally wanted — the requirement stays the tab already open,
   *  not one to go and find. Reverted; see tests/checkscreen.test.mjs for
   *  the regression guard, unchanged back to what it asserted before this
   *  attempt. */
  const [panel, setPanel] = useState("standard");
  /* A stable, instance-unique id for the tab ↔ tabpanel wiring below
     (aria-controls / aria-labelledby). `useId()` rather than a literal
     string — CheckDetail opens inside a Sheet from several screens
     (Capture, Findings, Field), and more than one could in principle sit
     in the DOM at once; two tabpanels sharing one id would make the
     aria-labelledby/aria-controls pair ambiguous for a screen reader. */
  const panelBaseId = useId();
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
  /* The tag row and the tab strip both scroll sideways on purpose (see each
     one's own comment) — these two just say so. See useEdgeScroll/
     ScrollEdges above. */
  const tagRowRef = useRef<HTMLDivElement>(null);
  const tagRowEdge = useEdgeScroll(tagRowRef);
  const tabStripRef = useRef<HTMLDivElement>(null);
  const tabStripEdge = useEdgeScroll(tabStripRef);
  const obsRef = useRef<HTMLTextAreaElement>(null);
  const a = useAnswers(check.id);
  const entityCode = useEntityCode();
  /* Findings already raised against this check, in full — not a link out to
     the Asset Assurance screen. See the "Findings" panel below for why. */
  const checkFindings = useVisitFindings().filter((f) => f.checkId === check.id);
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
    setThinking(null);
    setTitleOpen(false);
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
      /* Found by its declared hotkey, not by position — 1-3 are what they
         have always been. */
      const hit = STATUSES.find((x) => x.hotkey === e.key);
      if (hit) {
        const on = isOn(hit, r.compliance);
        setCompliance(check.id, on ? null : hit.key);
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

  /* ONE TABBED SPACE, not two columns of stacked panels.
   *
   *  What stood here was a reference column and a capture column, each with
   *  its own tab strip inside it: ACSA's wording on the left, the chips on the
   *  right, and the four compliance buttons above both. It was everything the
   *  register holds about a check, on screen at once, and the complaint about
   *  it was exactly right — you could not see what you needed to see.
   *
   *  Now there is one strip and one panel, and the panel gets the whole width.
   *  Two groups of tabs, because they are two different activities: what the
   *  auditor DOES on this check, then what the auditor READS to do it. The
   *  question to ask and the evidence needed stay out of the tabs entirely —
   *  they are the two lines the conversation actually starts from, so they sit
   *  above the strip and never move.
   *
   *  NOTHING WAS DROPPED. Every field the register carries is still rendered,
   *  in full, in one of these panels. */
  type PanelDef = {
    key: string;
    label: string;
    badge?: string;
    group: "acsa" | "do" | "read";
    body: React.ReactNode;
  };
  const panels: PanelDef[] = [];

  /* --------------------------------------------------- what the auditor does
     THE COUNT ON EACH TAB IS NOT DECORATION. One panel on screen at a time
     means the rest are off it, and a tab that only said "Evidence to request"
     would hide the fact that three were picked. The badge is what keeps the
     state of the whole check legible while only one panel is open. */
  /* "EVIDENCE TO REQUEST", "LIKELY ANSWERS" AND "ISSUES FOUND" REMOVED, 11
     October 2026 — Sarel: remove those three tabs. All three were chip-pick
     machinery over the Answer Library (what to ask for, what to answer,
     what to raise); the Evidence status panel below absorbs the one
     question worth keeping from them — not what was asked for, but what
     the evidence actually proves — as a plain text field and a verdict,
     rather than a researched list to tap through. See EVIDENCE_STATUSES and
     Response.evidenceProves/evidenceVerdict in types.ts.

     This also removes raising a finding from this screen's chips — "Issues
     found" was the only place that happened from a check's issue options.
     A finding already raised still opens from the Asset Assurance screen
     (FindingDetail), where its root cause and treatment are worked exactly
     as they were here; nothing about an EXISTING finding changed. Walkabout
     is unaffected and still depends on the Answer Library being loaded, so
     it keeps the same `if (a)` gate the removed three shared. */
  if (a && a.WO.length > 0)
    panels.push({
      key: "walkabout",
      label: "Walkabout",
      ...(r.walkaboutPicked !== null ? { badge: "1" } : {}),
      group: "do",
      body: (
        <>
          {/* The register's own walkabout instruction had a tab of its own in
              the reference column, one tap from chips about the same walk.
              It is the lead line of the walk now, which is where an auditor
              would read it. */}
          {check.walkabout && (
            <div
              className="mb-2.5 rounded-[8px] border px-[10px] py-[8px]"
              style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
            >
              <div className="label-xs">What the register says to look at</div>
              <div className="mt-1">
                <RefText>{check.walkabout}</RefText>
              </div>
            </div>
          )}
          <div className="mb-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            what the eye settles on
          </div>
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
        </>
      ),
    });

  /* EVIDENCE STATUS — whether the proof for this check has actually been
     produced, a question separate from the compliance verdict and from
     "Evidence to request" above (which is what was asked for, not whether
     it came back). Unconditional, unlike the three branches above: it does
     not depend on the answer library existing, because the question is the
     same with or without researched options. See EVIDENCE_STATUSES and the
     note on Response.evidenceStatus in types.ts. */
  panels.push({
    key: "evidenceStatus",
    label: "Evidence status",
    ...(r.evidenceStatus
      ? { badge: EVIDENCE_STATUSES.find((s) => s.key === r.evidenceStatus)?.label }
      : {}),
    group: "do",
    body: (
      <>
        <div className="mb-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          has the proof for this check actually been produced?
        </div>
        <div className="grid grid-cols-4 gap-[6px]">
          {EVIDENCE_STATUSES.map((es) => {
            const on = r.evidenceStatus === es.key;
            return (
              <button
                key={es.key}
                type="button"
                onClick={() => patch(check.id, { evidenceStatus: on ? null : es.key })}
                aria-pressed={on}
                title={es.hint}
                className="flex min-h-[40px] flex-col items-center justify-center gap-[3px] rounded-[9px] border px-[6px] py-[6px] text-center text-[10.5px] font-semibold leading-tight transition-[var(--t)] active:translate-y-[1px]"
                style={toneStyle(es.tone, on)}
              >
                <es.Icon width={14} height={14} className="shrink-0" />
                {es.label}
              </button>
            );
          })}
        </div>

        {/* WHAT THE EVIDENCE PROVES, AND THE VERDICT IT SUPPORTS.
            Replaces "Evidence to request" / "Likely answers" / "Issues
            found" — Sarel, 11 October 2026. Unconditional, like the status
            buttons above: the question ("what does the evidence show")
            applies whether or not it has actually been produced yet, so
            there is nothing to gate this behind. Independent of the status
            buttons above (whether the proof exists) and of the check's own
            compliance verdict (the top-level STATUSES) — this is what the
            document itself says, in the auditor's words and the group's
            read of it.

            MOVED RIGHT AFTER THE STATUS GRID, Sarel: "make sure the user
            sees the compliance and attach files buttons all at the initial
            view not needing to scroll." This and the attach-files row right
            below it used to sit after the per-status missing-document list,
            so picking "specific evidence not available" or "to be
            provided" pushed both of them past the fold. That list (what's
            missing, one row per item) now comes after attachments instead
            — it is the one part of this panel that genuinely grows without
            bound, so it is the part that should scroll, not the verdict or
            the attach buttons. */}
        <div className="mt-2.5">
          <label className="label-xs mb-1 block" style={{ color: "var(--ink-4)" }}>
            What the evidence proves
          </label>
          <textarea
            value={r.evidenceProves}
            onChange={(e) => patch(check.id, { evidenceProves: e.target.value })}
            placeholder="What the document or record actually shows, in your own words"
            aria-label="What the evidence proves"
            className="min-h-[64px] w-full resize-y rounded-[8px] border px-3 py-2 text-[12.5px] outline-none focus:border-[var(--acc)]"
            style={{ background: "var(--bg)", borderColor: "var(--line-2)" }}
          />
          <div className="mt-2 grid grid-cols-4 gap-[6px]">
            {EVIDENCE_VERDICTS.map((v) => {
              const on = r.evidenceVerdict === v.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => patch(check.id, { evidenceVerdict: on ? null : v.key })}
                  aria-pressed={on}
                  title={v.label}
                  className="flex min-h-[40px] min-w-0 items-center justify-center gap-[4px] rounded-[9px] border px-[2px] text-center text-[10px] font-semibold leading-tight transition-[var(--t)] active:translate-y-[1px]"
                  style={toneStyle(v.tone, on)}
                >
                  <v.Icon width={12} height={12} className="shrink-0" />
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* UPLOAD LIVES HERE NOW, NOT IN A FLOATING BAR UNDER EVERY TAB.
            Sarel: "remove the paperclip and photo icon, introduce them in
            the evidence section — all photos and evidence will be
            uploaded in the evidence section." Unconditional rather than
            gated to "evidence provided for review" — a photo is just as
            often the proof that evidence is still outstanding ("to be
            provided", dated) as it is the proof itself. Photo and File
            write into the same attachments array the observation panel's
            own strip shows; this is not a second, evidence-only
            attachment list, just the one place an auditor now reaches for
            either. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-[6px]">
          <PhotoButton
            compact
            onCaptured={(m) => {
              addAttachment(check.id, { ...m, createdBy: auditor });
              onSaved(`Photo attached to ${portalId}`);
            }}
          />
          <FileButton
            compact
            onCaptured={(m) => {
              addAttachment(check.id, { ...m, createdBy: auditor });
              onSaved(`File attached to ${portalId}`);
            }}
          />
          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {r.attachments.length === 0
              ? "nothing attached yet"
              : `${r.attachments.length} attached`}
          </span>
        </div>

        {/* A DESCRIPTION FOR EACH FILE, RIGHT WHERE IT WAS JUST ATTACHED.
            Sarel: "when uploading evidence allow to add a description for
            each file." A photograph already carried a caption; a plain
            file never did — FileRow gained one here rather than the
            auditor having to go find the same attachment in the
            observation panel's strip below to say what it is.

            PHOTOS EXCLUDED, 13 October 2026 — Sarel: "photos should not
            come up in the evidence view... i still see the photo, they
            should not be visible from there." The camera button above
            still captures them into this same attachments array — the
            Review screen (/review, "every photograph this visit
            captured, per discipline") is the one place a photograph is
            now shown and captioned, so a photo attached from here is
            not lost, only not carded again in this tab. */}
        {r.attachments.some((a) => a.kind !== "photo") ? (
          <div className="mt-2.5">
            <AttachmentStrip
              attachments={r.attachments.filter((a) => a.kind !== "photo")}
              thumbSize={40}
              onRemove={(id) => removeAttachment(check.id, id)}
              onUpdate={(id, p) => updateAttachment(check.id, id, p)}
            />
          </div>
        ) : null}

        {/* THE NOTE, ONLY WHERE IT MEANS SOMETHING, AND AS ITEMS NOT A PARAGRAPH.
            "No evidence available" and "provided for review" are
            self-explanatory; the other two are not useful without saying
            what is missing, or what and when — so the field appears only
            for those two, labelled for the question it is actually
            answering.

            Sarel: "this section should allow multiple evidence to be
            recorded and not all in one text box." It was a single
            textarea — "Doc 1\nDoc 2" typed as two lines of one blob, which
            reads back as a paragraph to split apart rather than a list to
            scan or export cell-by-cell. One row per item instead, add/remove
            as needed. Still stored as a string joined on "\n" — same
            export, the change is in how it's edited, not the shape it's
            persisted in.

            TWO SEPARATE LISTS, NOT ONE READ TWO WAYS. DECISION REVERSED —
            Sarel: "the list of evidence for evidence pending and specific
            evidence not availbale is two seperate lists, allow to keep
            seperate lists." `evidenceStatusNote` used to carry both
            statuses' items, so switching between them showed the same
            list under a different heading and a note typed under one
            looked like it belonged to the other the moment you tapped
            back. specificNotAvailable keeps evidenceStatusNote;
            toBeProvided gets its own field, evidencePendingNote — see the
            note on both in types.ts.

            MOVED BELOW THE VERDICT AND ATTACH BUTTONS, Sarel: "make sure
            the user sees the compliance and attach files buttons all at
            the initial view not needing to scroll." This list is the one
            part of the panel that genuinely grows without bound (an
            auditor can add as many missing-document rows as there are
            documents), so it is the part that scrolls — not the verdict
            or the attach buttons above it. */}
        {(() => {
          const active = EVIDENCE_STATUSES.find((es) => es.key === r.evidenceStatus);
          if (!active?.note) return null;
          const field = active.key === "toBeProvided" ? "evidencePendingNote" : "evidenceStatusNote";
          const items = r[field].split("\n");
          const setItems = (next: string[]) => patch(check.id, { [field]: next.join("\n") });
          const itemPlaceholder =
            active.key === "specificNotAvailable"
              ? "Which document or record ACSA could not produce"
              : "What it is, and when it is expected";
          return (
            <div className="mt-2.5">
              <div className="label-xs mb-1">{active.note}</div>
              <div className="flex flex-col gap-[6px]">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-[6px]">
                    <input
                      value={item}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = e.target.value;
                        setItems(next);
                      }}
                      aria-label={`${active.note} — item ${i + 1}`}
                      placeholder={itemPlaceholder}
                      className="w-full rounded-[8px] border px-3 py-2 text-[12.5px]"
                      style={{ background: "var(--bg)", borderColor: "var(--line-2)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : [""])}
                      aria-label="Remove this item"
                      className="shrink-0 rounded-[8px] p-1.5"
                      style={{ color: "var(--ink-4)" }}
                    >
                      <IconX width={13} height={13} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setItems([...items, ""])}
                className="mt-1.5 flex items-center gap-[5px] rounded-[8px] px-[7px] py-1 text-[11px] font-semibold"
                style={{ color: "var(--acc)" }}
              >
                <IconPlus width={12} height={12} />
                Add another
              </button>
            </div>
          );
        })()}

        {/* A SPACER, not a design choice — this panel is the first in the
           "do" group routinely tall enough to expose a `position: sticky`
           quirk in the pinned answer bar below: on a short check (little
           ACSA-requirement text, no prior content pushing total page
           height comfortably past the viewport), the sticky bar's "stuck"
           render position sits ABOVE its own natural flow position rather
           than after it, and paints over whatever this panel put in that
           gap — confirmed by disabling `position: sticky` on it and
           diffing the two layouts. Reserving this much height keeps total
           content past the threshold where that pull-up happens, without
           touching the pinned bar itself, which every other tab also
           depends on. */}
        <div aria-hidden className="h-[220px]" />
      </>
    ),
  });

  /* FLAG FOR REVIEW — an internal note on the check-point itself, never on
     the asset it audits and never sent to ACSA. Sarel: "add an internal
     flag option to tag with a note on how to improve this check." Its own
     tab rather than folded into Issues found, which is about what the
     audit found wrong on site — a different question from "this
     check-point's wording is ambiguous" or "the evidence list is missing
     something". Same toggle-then-note shape as Evidence status, so the
     note only shows once there is something to say. */
  panels.push({
    key: "improve",
    label: "Flag for review",
    ...(r.improvementFlag ? { badge: "⚑" } : {}),
    group: "do",
    body: (
      <>
        <div className="mb-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          a note on the check-point itself, not on what was found here — never part of the audit record
        </div>
        <button
          type="button"
          onClick={() => patch(check.id, { improvementFlag: !r.improvementFlag })}
          aria-pressed={!!r.improvementFlag}
          className="flex min-h-[44px] items-center gap-[7px] rounded-[9px] border px-[10px] py-[7px] text-left text-[11px] font-semibold transition-[var(--t)]"
          style={toneStyle("warn", !!r.improvementFlag)}
        >
          <IconFlag width={14} height={14} className="shrink-0" />
          Flag this check for improvement
        </button>

        {r.improvementFlag && (
          <div className="mt-2.5">
            <div className="label-xs mb-1">What should change, and why</div>
            <textarea
              value={r.improvementNote ?? ""}
              onChange={(e) => patch(check.id, { improvementNote: e.target.value })}
              rows={3}
              aria-label="How to improve this check"
              placeholder="e.g. the wording is ambiguous, the evidence list is missing something, the threshold looks outdated"
              className="w-full rounded-[8px] border px-3 py-2 text-[12.5px]"
              style={{ background: "var(--bg)", borderColor: "var(--line-2)" }}
            />
          </div>
        )}
      </>
    ),
  });

  /* FINDINGS, IN FULL, ON THE CHECK THAT RAISED THEM — 13 October 2026.
     Sarel wanted one screen that carries "all evidence requests, evidence
     notes, compliance, observations, findings, photos ... everything you
     have in the system for that audit check", editable in place.

     A finding already raised against this check is read and worked HERE —
     the exact FindingDetail pane the Asset Assurance screen opens in a
     sheet, lifted in rather than re-rewritten, so its rating, root cause,
     treatment and hazard advice stay the one true place they are edited.
     There is still no way to RAISE a new finding from a check — that was
     deliberately removed 11 October 2026 (Sarel: remove "Issues found")
     and this panel does not reopen it; it only surfaces what Asset
     Assurance already has for this check id. A check with none gets no
     tab at all, same as every other conditional panel here. */
  if (checkFindings.length > 0)
    panels.push({
      key: "findings",
      label: "Findings",
      badge: String(checkFindings.length),
      group: "do",
      body: (
        <div className="flex flex-col gap-[18px]">
          {checkFindings.map((f, i) => (
            <div key={f.id}>
              {i > 0 && <div className="mb-[18px] border-t" style={{ borderColor: "var(--line)" }} />}
              <FindingDetail f={f} onToast={onSaved} />
            </div>
          ))}
        </div>
      ),
    });

  /* AN INTERNAL NOTE ON THE ASSET SYSTEM — 13 October 2026. Sarel: "add a
     field to add internal notes per asset system, clearly label this as
     an internal note and this must never get synced to sharepoint or
     reported to a client report." Scoped to discipline+system rather than
     to this one check — the same SystemAssessment every check under this
     system already shares (see the Asset Assurance screen's own rating
     panel) — so a note typed from any check under "Markings" is the same
     note read from every other check under it, not one copy per
     check-point. See SystemAssessment.internalNote's own doc comment for
     where this is (and is deliberately never) read. */
  {
    const sysA = systemAssessment(check.discipline, check.system);
    panels.push({
      key: "internalNote",
      label: "Internal note",
      ...(sysA.internalNote?.trim() ? { badge: "●" } : {}),
      group: "do",
      body: (
        <>
          <div
            className="mb-2 flex items-center gap-[6px] rounded-[8px] border px-[10px] py-[7px] text-[10.5px] font-semibold"
            style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
          >
            <IconInfo width={13} height={13} className="shrink-0" />
            INTERNAL ONLY — never synced to SharePoint, never in a client report
          </div>
          <div className="mb-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            shared by every check under {check.system} — the team&apos;s own working note, not ACSA&apos;s
          </div>
          <textarea
            value={sysA.internalNote ?? ""}
            onChange={(e) => patchSystem(check.discipline, check.system, { internalNote: e.target.value })}
            rows={4}
            aria-label={`Internal note for ${check.system}`}
            placeholder="A note for the team — a question to raise, something to chase, a doubt about the evidence"
            className="w-full rounded-[8px] border px-3 py-2 text-[12.5px]"
            style={{ background: "var(--bg)", borderColor: "var(--line-2)" }}
          />
        </>
      ),
    });
  }

  /* -------------------------------------------------- what the auditor reads
     The standard, the site's override of it, and ACSA's own words for it, in
     ONE panel. Three panels made them three subjects; they are one subject,
     and the auditor needs all three in a single glance before saying a number
     out loud. */
  panels.push({
    key: "standard",
    label: "ACSA requirement",
    /* ITS OWN GROUP, RENDERED FIRST. It was "The standard", fourth in the
       Reference group, behind five tabs of our own material — so the screen
       opened on what we suggest the auditor collect, and ACSA's actual
       requirement was four presses away. That is the wrong way round: you read
       the requirement, then you go and get the evidence for it. The strip now
       renders this group, then the Answer library, then the rest of the
       Reference tabs, and the screen opens here. */
    group: "acsa",
    body: <AcsaRequirementPanel check={check} />,
  });


  /* ACSA's own words, in full: what the procedure requires, the records it
     names, the evidence it expects, and any place its own documents disagree.
     Four tabs in the old reference column, four headed sections in one now —
     they are read together or not at all, and the panel has the whole width to
     set them side by side. */
  if (
    check.acsaRequirement ||
    check.acsaEvidence.length > 0 ||
    check.evidenceExpected ||
    check.acsaConflict
  )
    panels.push({
      key: "acsa",
      label: "ACSA wording",
      group: "read",
      body: (
        <div className="grid gap-[14px] lg:grid-cols-2">
          {check.acsaRequirement && (
            <section>
              <div className="label-xs mb-1">What ACSA&apos;s procedure requires</div>
              <RefText>{check.acsaRequirement}</RefText>
            </section>
          )}
          {check.acsaEvidence.length > 0 && (
            <section>
              <div className="label-xs mb-1">Records ACSA names</div>
              <ul className="list-disc pl-4 text-[12.5px] leading-[1.7]" style={{ color: "var(--ink-2)" }}>
                {check.acsaEvidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </section>
          )}
          {check.evidenceExpected && (
            <section>
              <div className="label-xs mb-1">Evidence expected</div>
              <RefText>{check.evidenceExpected}</RefText>
            </section>
          )}
          {check.acsaConflict && (
            <section>
              <div className="label-xs mb-1" style={{ color: "var(--warn)" }}>
                Where ACSA&apos;s own documents disagree
              </div>
              <RefText>{check.acsaConflict}</RefText>
            </section>
          )}
        </div>
      ),
    });

  if (pf?.note)
    panels.push({
      key: "prior",
      label: `${pf.key} · 2025`,
      group: "read",
      body: (
        <>
          <div className="label-xs" style={{ color: "var(--warn)" }}>
            {pf.key} follow-up · carried from 2025
            {/* A derived rating was computed from that site's own portal
                findings rather than published as a rating, and says so rather
                than borrowing an authority nobody gave it. */}
            {pf.derived && " · derived from the 2025 findings"}
          </div>
          <div className="mt-1 max-w-[92ch] xl:max-w-[150ch] text-[12.5px] leading-[1.55]" style={{ color: "var(--warn)" }}>
            {pf.note}
          </div>
        </>
      ),
    });

  /* Falls back to the first panel rather than showing nothing: which panels
     exist depends on this check's own fields and on what the library holds for
     it, and the auditor arrives with one already chosen. */
  const openKey = panels.some((t) => t.key === panel) ? panel : panels[0].key;
  const open = panels.find((t) => t.key === openKey)!;

  /* The evidence line that stays above the tabs. The register's own sentence
     where it has one, ACSA's named records where it does not — one line, with
     the whole of it a tap away under ACSA wording. */
  const evidenceLine =
    check.evidenceExpected || (check.acsaEvidence.length > 0 ? check.acsaEvidence.join(" · ") : "");

  const photos = r.attachments.filter((x) => x.kind === "photo").length;
  const voice = r.attachments.find((x) => x.kind === "voice");
  const files = r.attachments.filter((x) => x.kind === "file").length;

  return (
    <div ref={scrollRef} className="app-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
      {/* EVERYTHING THAT MUST NOT MOVE, IN ONE PINNED BLOCK: which check this
          is, what to ask, what evidence is needed, and the tabs that choose
          what fills the rest of the screen.

          The tab strip used to sit in the scrolling body. On a tablet that was
          invisible — the body scrolls inside itself there and the strip never
          moves anyway — but on a phone the whole screen scrolls, and a strip
          scrolled to the foot of it sits UNDER the pinned answer bar, where it
          cannot be pressed. "Tabs at the top so I don't need to scroll" is not
          true of a strip you have to scroll to. */}
      <div className="relative z-[6] sm:sticky sm:top-0" style={{ background: "var(--panel)" }}>
      <div
        /* PINNED AS A BLOCK FROM sm, and only the identity below it.

           On a 390px phone this block measured 308px with the answer bar at
           292 — between them there was no check left on the screen at all.
           Nothing here is worth less than the others; there is simply not room
           to pin all of it on a phone, so below sm only the line saying WHICH
           CHECK THIS IS stays, and the brief and the strip scroll with the
           rest. They are near the top of the scroll, which on a phone is where
           a thumb starts. */
        className="sticky top-0 z-[6] border-b px-5 pt-[11px] pb-2.5 sm:static"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        {/* ONE LINE THAT SCROLLS on a phone, wrapping only where there is
            room. Three wrapped rows of pills is 50px of pinned header taken
            off a 664px screen before the check has said anything.

            relative + ScrollEdges, below sm only (sm:overflow-visible
            already means there is never an edge to show from sm up — the
            row wraps there instead, see the className). */}
        <div className="relative mb-[5px]">
        <div
          ref={tagRowRef}
          className="flex flex-nowrap items-center gap-[7px] overflow-x-auto font-mono text-[10px] [&>*]:shrink-0 sm:flex-wrap sm:overflow-visible"
          style={{ color: "var(--ink-3)" }}
        >
          <span>{portalId}</span>
          <span>·</span>
          <span>{check.system}</span>
          {/* HOW THIS CHECK IS ANSWERED, as an icon and a word.
              From the register's own `vtype`, which is one of seven
              combinations — a check can be any of asking, collecting and
              looking, or all three at once, and 290 of the 324 are more than
              one. The icon is what an auditor reads at a glance across a list
              of pills that otherwise all look alike; the word stays because an
              icon alone is a guess, and "Physical" in particular carries a
              consequence the shape cannot say — the check is also waiting on
              the tablet in Field mode, and saving here does not answer that
              half. */}
          {modeLabels(check).map((m) => {
            const Icon = MODE_ICON[m] ?? IconInfo;
            /* How the check is answered is a category, not a status —
               item 4 of Sarel's second visual-hierarchy pass takes the
               brand accent off every mode but Physical, which keeps its
               warn because it carries a real consequence (see above). */
            return (
              <Pill key={m} tone={m === "Physical" ? "warn" : "neutral"}>
                <Icon width={10} height={10} aria-hidden />
                {m.toUpperCase()}
              </Pill>
            );
          })}
          {check.coverage === "none" && <Pill tone="bad">NO ACSA BASIS</Pill>}
          {/* A CONFLICT IS NOT A VARIANT, and it does not get a variant's pill.
              Sarel: "highlight it in the heading so that it is clear there is a
              conflict." A variant adds detail the network default omits; a
              conflict means the check's own title says something ACSA
              contradicts at this site — MEC-037 is titled "A 3 yearly ...
              Piping Pressure test" while D060 021M cl. 4.17.5 makes it YEARLY
              at King Shaka. An auditor who reads the title and nothing else
              audits to the wrong interval, so the heading has to say so before
              anything else does. */}
          {check.siteVariant?.conflict ? (
            <Pill tone="bad">
              CONFLICT · {check.siteVariant.site} {check.siteVariant.conflict.direction.toUpperCase()}
            </Pill>
          ) : (
            check.siteVariant && <Pill tone="warn">{check.siteVariant.site} VARIANT</Pill>
          )}
          {/* What settles this check, from the register review. Two axes, so
              two pills: a Document check that is also a reconcile says both,
              which is the pair the old single vtype tag could not express. */}
          {check.confirmedBy && (
            /* What settles the check is a category, not a status — item 4
               of Sarel's second visual-hierarchy pass takes the brand
               accent off "Practice", which now reads the same neutral
               every other non-Asset value already does. */
            <Pill tone={check.confirmedBy === "Asset" ? "warn" : "neutral"}>
              {check.confirmedBy.toUpperCase()}
            </Pill>
          )}
          {check.inspect && check.inspect !== "none" && (
            <Pill tone="neutral">{check.inspect === "reconcile" ? "GO AND RECONCILE" : "GO AND SEE"}</Pill>
          )}
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
        <div className="sm:hidden">
          <ScrollEdges edge={tagRowEdge} />
        </div>
        </div>
        {/* THE REGISTER'S OWN CHECK TEXT, VERBATIM, AND LABELLED AS SUCH.
            `check.requirement` is the Rev A2 check-point wording — ACSA's
            words, not ours — and it is what a finding must cite. It was
            already the heading; what it did not say was whose it is, and on a
            screen that also carries our question, our evidence list and our
            suggested answers, "the biggest text on the page" is not the same
            as "attributed". Not summarised, not truncated, not title-cased. */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="label-xs mb-[2px]" style={{ color: "var(--ink-4)" }}>
              ACSA check-point · the register&rsquo;s wording
            </div>
            {/* 27 register rows run past 140 characters and one reaches 569. Left
                unclamped they turn the sticky header into half the screen, so a long
                one is capped at three lines with a control to open it. Short ones —
                the great majority — get no clamp and no extra control. */}
            <h2
              className={`max-w-[92ch] xl:max-w-[150ch] font-bold ${
                stuck && !titleOpen
                  ? "line-clamp-1 text-[13px] leading-[1.35]"
                  : `text-[15.5px] leading-[1.3]${
                      longTitle && !titleOpen ? " line-clamp-2 sm:line-clamp-3" : ""
                    }`
              }`}
            >
              {check.requirement}
            </h2>
          </div>
          {/* PREV/NEXT, ALSO AT THE TOP — Sarel's second visual-hierarchy
              pass, item 6: "the check title + one status line + prev/next
              arrows" at the top of the Checks screen. These call the exact
              same onPrev/onNext this screen already wires to the bottom
              answer bar's own Previous/Next (and to the ArrowLeft/ArrowRight
              keys) — one more place to reach them, not a second pair of
              actions, and the bottom bar's own pair is untouched: moving
              fast between checks while answering is the more common path
              and stays under the thumb there. */}
          <div className="flex shrink-0 items-center gap-[6px]">
            <Btn icon onClick={onPrev} aria-label="Previous check">
              <IconLeft width={13} height={13} />
            </Btn>
            <Btn icon onClick={onNext} aria-label="Next check">
              <IconRight width={13} height={13} />
            </Btn>
          </div>
        </div>
        {/* Only for the genuinely long ones. A title compacted by scrolling
            comes back by scrolling, and a control saying so would cost the row
            the compaction just saved. */}
        {longTitle && (
          <button
            onClick={() => setTitleOpen((v) => !v)}
            aria-expanded={titleOpen}
            className="mt-[3px] rounded-[8px] font-mono text-[9.5px] tracking-[.04em] uppercase"
            style={{ color: "var(--acc)" }}
          >
            {titleOpen ? "Show less" : "Show the full wording"}
          </button>
        )}
      </div>

      {/* A DECISION OF SAREL'S THAT HE LATER REVERSED: this banner used to
          show here only for the checks that `needsField` picked out as
          also belonging on Inspection (290 of them), flagging the overlap. Capture and
          Field both list the full 324 now (see the note on needsDesk/
          needsField in src/lib/verification.ts), so "this check also needs
          the asset seen on site" would be true of every check on this
          screen, every time — a permanent banner that never distinguishes
          anything is not information, it is wallpaper. Removed rather than
          made unconditional. */}

      {/* THE TWO LINES THE CONVERSATION STARTS FROM, above the tabs and out
          of them. Everything else about this check is one tap away; these two
          are what the auditor says out loud and what they are there to
          collect, so they never move and are never behind a tab.

          Neither is clamped at rest — half a question or half an evidence
          list is worse than a few extra lines, and the longest evidence
          sentence runs to 606 characters, which used to be cut to one line
          with an ellipsis. Sarel: make sure it expands so all the text is
          visible, not cut off. Both still clamp to one line once the header
          is "stuck" (scrolled), the same bargain the pinned title already
          makes — full text is one scroll-to-top away, not gone. */}
      {(check.question || evidenceLine) && (
        <div
          className="border-b px-5 py-[8px]"
          style={{ background: "var(--focus-surface)", borderColor: "var(--line)" }}
        >
          {check.question && (
            <div className="flex items-baseline gap-2">
              {/* OURS, AND IT SAYS SO. This is TPJV's reading of the
                  check-point above — how we propose to test whether it is met
                  — and it is not in ACSA's register. An auditor quoting it as
                  though ACSA wrote it can be contested on the spot; ACSA
                  cannot contest a finding raised against their own wording,
                  which is why the two are one above the other and labelled
                  differently. Same rule the Inspection screen follows. */}
              <span className="label-xs shrink-0 pt-[2px] whitespace-nowrap" style={{ color: "var(--acc)" }}>
                TPJV asks
              </span>
              <span
                /* Full at rest — half a question is worse than a third line —
                   and one line once the screen has been scrolled, which is the
                   same bargain the title makes and for the same reason: on a
                   phone every pinned line is a line of the check you cannot
                   see. It comes back by scrolling to the top. */
                className={`min-w-0 max-w-[92ch] xl:max-w-[150ch] text-[13.5px] leading-[1.4] font-semibold${
                  stuck ? " line-clamp-1" : ""
                }`}
                style={{ color: "var(--acc)" }}
              >
                {check.question}
              </span>
            </div>
          )}
          {evidenceLine && (
            <button
              onClick={() => setPanel("acsa")}
              title={evidenceLine}
              className="mt-[3px] flex w-full items-start gap-2 text-left"
            >
              <span className="label-xs shrink-0 pt-[1px]">Evidence</span>
              <span
                className={`min-w-0 flex-1 text-[12px] leading-[1.4]${stuck ? " truncate" : ""}`}
                style={{ color: "var(--ink-2)" }}
              >
                {evidenceLine}
              </span>
              <span
                className="shrink-0 pt-[1px] font-mono text-[9px] tracking-[.04em] uppercase"
                style={{ color: "var(--acc)" }}
              >
                ACSA wording
              </span>
            </button>
          )}
        </div>
      )}

      {/* ONE STRIP, TWO GROUPS. What the auditor does with this check, then
          what the auditor reads to do it — separated by a gap rather than a
          heading, because eleven pills under two headings is a heading per
          three pills.

          IT SCROLLS SIDEWAYS, ALWAYS, rather than wrapping from sm. Sarel:
          "make all buttons fit in one row (the buttons for acsa
          requirements, issues, walkabout...)." It used to wrap on anything
          with room, so nothing tapped was ever hidden by a closed panel —
          but twelve tabs beside a half-width reference panel wraps to two
          rows even on a desk-width window, and two rows of tab strip is
          the same busyness the tabbed redesign was built to get rid of.
          One row, scrolling, is the same bargain the strip already made
          for a phone, now kept at every width. */}
      <div className="relative">
      <div
        ref={tabStripRef}
        className="flex flex-nowrap items-center gap-x-[14px] gap-y-[5px] overflow-x-auto border-b px-5 py-[8px] whitespace-nowrap"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        {(["acsa", "do", "read"] as const).map((group) => {
          const mine = panels.filter((t) => t.group === group);
          if (mine.length === 0) return null;
          /* THE SAME TAB nobody has to re-discover with a mouse. ARIA's
             tabs pattern keeps exactly one tab per tablist in the normal
             Tab order (the rest are tabIndex=-1) and moves focus between
             them with the arrow keys instead — so Tab skips straight from
             "before the strip" to "after it" rather than stopping at every
             pill. The one IN the tab order is whichever tab is actually
             open, when it belongs to this group; otherwise this group's
             own first tab, so the group is still reachable at all.
             Arrow/Home/End below both move focus AND activate the tab
             landed on — the same "selection follows focus" model a tablist
             this shallow (two or three tabs per group) reads most simply. */
          const groupHasOpen = mine.some((t) => t.key === openKey);
          const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            const list = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
            );
            if (list.length === 0) return;
            const i = list.indexOf(document.activeElement as HTMLButtonElement);
            let next = -1;
            if (e.key === "ArrowRight") next = i < 0 ? 0 : (i + 1) % list.length;
            else if (e.key === "ArrowLeft") next = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = list.length - 1;
            else return;
            e.preventDefault();
            const btn = list[next];
            btn.focus();
            if (btn.dataset.key) setPanel(btn.dataset.key);
          };
          return (
            <div
              key={group}
              role="tablist"
              aria-label={
                group === "acsa"
                  ? "The requirement"
                  : group === "do"
                    ? "Answer library"
                    : "Reference"
              }
              onKeyDown={onTabKeyDown}
              className="flex shrink-0 flex-nowrap gap-[5px]"
            >
              {mine.map((t, i) => {
                const on = openKey === t.key;
                const inTabOrder = groupHasOpen ? on : i === 0;
                return (
                  <button
                    key={t.key}
                    id={`${panelBaseId}-tab-${t.key}`}
                    data-key={t.key}
                    role="tab"
                    aria-selected={on}
                    aria-controls={`${panelBaseId}-tabpanel`}
                    tabIndex={inTabOrder ? 0 : -1}
                    onClick={() => setPanel(t.key)}
                    className="flex shrink-0 items-center gap-[5px] rounded-full border px-[11px] py-[6px] font-display text-[10.5px] font-semibold whitespace-nowrap transition-[var(--t)]"
                    style={
                      on
                        ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                        : group === "do"
                          ? { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                          : /* Reference reads quieter than capture: same shape,
                               no border weight, so the eye lands on the doing
                               first and the reading is there when it is
                               wanted. */
                            { background: "var(--sunken)", borderColor: "transparent", color: "var(--ink-3)" }
                    }
                  >
                    {t.label}
                    {t.badge && (
                      <span
                        className="rounded-full px-[5px] font-mono text-[9px]"
                        style={
                          on
                            ? { background: "var(--on-acc)", color: "var(--acc)" }
                            : { background: "var(--acc-soft)", color: "var(--acc)" }
                        }
                      >
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* Every width, not sm:hidden — this row scrolls at every width by
          design (see the comment above it), unlike the tag row above,
          which only scrolls below sm. */}
      <ScrollEdges edge={tabStripEdge} />
      </div>
      </div>

      {/* FROM lg, TWO COLUMNS, EACH SCROLLING INSIDE ITSELF.
          Sarel: "the space to read the box of text is getting very small,
          rework this layout so that it is easier to read, maybe split into
          a left and right panel." The reference panel used to take the
          whole width and whatever height was left under the capture column
          below it — on a desk-width window with photographs and a long
          observation already attached, that could be three lines of ACSA's
          own wording in a box with a scrollbar. Reading and writing now sit
          side by side instead, each with the full leftover height to
          scroll inside, so the reference text is never squeezed by how
          much the auditor has already written below it.

          Below lg this is a plain stack again, unchanged from before — a
          two-column row on a phone is two half-width columns neither one
          can be read in. */}
      <div className="lg:flex lg:min-h-0 lg:flex-1 lg:items-stretch">
      {/* THE PANEL — half the width from lg, the whole leftover height,
          scrolling inside itself.

          `flex-1` only from lg, and that is a bug fix, not a tidy-up. From lg
          the panel scrolls inside itself, so it must take the leftover height
          and stop — that is what flex-1 with min-h-0 does. Below lg the whole
          screen scrolls and the panel has to be as tall as its content;
          flex-1 gave it the leftover height instead, its content spilled out
          of a short box, and the sticky bar — which can only stick within its
          parent's content box — came to rest in the MIDDLE of the screen. */}
      <div
        id={`${panelBaseId}-tabpanel`}
        role="tabpanel"
        aria-labelledby={`${panelBaseId}-tab-${openKey}`}
        tabIndex={0}
        data-panel={openKey}
        /* No deep bottom padding at lg any more: the panel is its own
           scroller and the capture column is a sibling beside it, not
           something floating over its last line. Below lg the whole screen
           scrolls and the bar is the last thing in it, so the same holds. */
        className="px-5 pt-[13px] pb-[18px] lg:min-h-0 lg:w-1/2 lg:shrink-0 lg:overflow-y-auto lg:border-r"
        style={{
          background: open.group === "do" ? "var(--focus-surface)" : "var(--sunken)",
          borderColor: "var(--line)",
        }}
      >
        {open.body}
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
           the nav with a strip of content sliding under it.

           FROM lg this is the right-hand column instead, beside the
           reference panel rather than pinned under the page — `lg:static`
           turns the stickiness off (there is nothing left for it to stick
           to; the column is simply as tall as the row beside it) and
           `lg:flex-col` lets the Observation block below take the leftover
           height of ITS OWN column and scroll inside that, with the
           compliance bar still the last, non-scrolling thing in it — the
           same pinned-bar bargain the page above makes, one level deeper.

           max-h-[70vh] BELOW lg ONLY, added for the mobile keyboard — found
           with Playwright, not assumed: shrink the viewport to roughly what
           a phone keyboard leaves (390x464, a 390x844 screen with ~45%
           covered) and this block alone still fit, Save and the compliance
           buttons both stayed on screen. Shrink it further, to what an iOS
           keyboard WITH its QuickType/emoji row can take (~55% of a
           375x667 screen), and this block had no ceiling — it is exactly
           as tall as its own content, sticky or not, and with nowhere to
           give, it rode up over whatever the tab panel above it was
           showing, so a field being read there (not even typed in) came
           back as un-clickable, covered by this bar. 70vh keeps that from
           ever reaching 100%: whatever is left of a short viewport, roughly
           30% of it stays free for the panel above.

           max-h-[25vh] AT REST, 70vh ONLY WHILE THE OBSERVATION BOX HAS
           FOCUS — Sarel, reviewing a 390px screenshot with nothing typed
           yet: the bar was still the 70vh ceiling's full height even with
           no keyboard open, because nothing here actually shrank at rest —
           70vh was a ceiling this block simply never had reason to hit,
           not a resting size. `has-[.obs-pane:focus-within]:max-h-[70vh]`
           keys the expansion to the ONE field that matters (the Observation
           textarea, wrapped `.obs-pane` just below) rather than to
           `:focus-within` on this whole bar, which would also fire from
           tapping Compliant/Non-compliant/N/A or Save and re-expand the bar
           for no reason right when the auditor is about to move on. Save
           and the compliance buttons are never inside the part that
           shrinks — see the flex-col split two lines down, where the
           Observation block is `flex-1 overflow-y-auto` (it gives) and the
           answer bar below it is `shrink-0` (it never does) — so "smaller
           at rest" never costs reaching either, at 25vh or at 70vh alike.

           lg:max-h-none lg:overflow-visible because `lg:static` below
           already turns this into an ordinary column cell beside the
           reference panel, where the Observation block's own
           lg:overflow-y-auto does the scrolling at that width instead —
           this rule must not fight that one. */
        className="sticky bottom-0 z-[7] flex min-h-0 max-h-[25vh] flex-col overflow-hidden has-[.obs-pane:focus-within]:max-h-[70vh] lg:static lg:w-1/2 lg:shrink-0 lg:max-h-none lg:overflow-visible"
        style={{
          background: "var(--panel)",
          boxShadow: "0 -6px 18px -10px rgba(22,16,40,.2)",
        }}
      >
        {/* .obs-pane: the one field the pinned bar's own resting height
             keys off — see the has-[...] selector on the bar itself, just
             above. flex-1/min-h-0/overflow-y-auto are no longer lg:-only:
             this block has always been the one that gives (the answer bar
             below it, shrink-0, never has), now true at every width, not
             only from lg. */}
        <div
          className="obs-pane flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t px-5 pt-[9px] pb-[9px]"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="mb-[6px] hidden items-center justify-between gap-3 sm:flex">
            <b className="font-display text-[11px] font-semibold">Observation</b>
            {/* It used to read "type · speak · photograph", naming the three
                ways in. The tools are in the box now and say that themselves,
                so this says what is ALREADY HERE instead — which is the thing
                the label could not tell you before. */}
            <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
              {voice || photos > 0
                ? [
                    voice ? "voice note attached" : "",
                    photos > 0 ? `${photos} photo${photos > 1 ? "s" : ""}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "nothing attached yet"}
            </span>
          </div>

          {draft !== null && (
            /* A draft is a proposal. It sits beside the record until the
               auditor puts it in — nothing writes itself into the audit.
               Neutral, not accent: same box Capture.tsx's identical
               "revised" proposal uses, since a pending suggestion is not a
               status and nothing here is a selection or a primary action
               either — item 4 of Sarel's second visual-hierarchy pass. */
            <div
              className="mb-[7px] max-h-[28vh] overflow-y-auto rounded-[11px] border p-3"
              style={{ borderColor: "var(--line-2)", background: "var(--sunken)" }}
            >
              <div className="label-xs mb-1.5" style={{ color: "var(--ink-3)" }}>
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

          {r.attachments.some((a) => a.kind !== "photo") && (
            /* Bounded, because this bar is pinned: four photographs and a voice
               note being written up must not grow until they own the screen.

               PHOTOS EXCLUDED — Sarel: "dont pull the photos into this
               view." Upload and management already moved to the Evidence
               status panel ("all photos and evidence will be uploaded in
               the evidence section"); what belongs here is voice notes,
               for the one thing this bar is actually for — writing a
               recording up into the observation. The count above still
               says how many photos are attached, so nothing about them is
               hidden, only their cards. */
            <div className="mb-[7px] max-h-[34vh] overflow-y-auto">
              <AttachmentStrip
                attachments={r.attachments.filter((a) => a.kind !== "photo")}
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

          {/* THE WRITING TOOLS SIT IN THE BOX THEY WRITE INTO.
              Sarel, 2026-09-12: "Move mic icon and choose from taps and draft
              with ai as small icons in the text box on the right."

              They were three labelled buttons in the bar below, which put the
              three ways of filling this field in a different place from the
              field, and cost the row that the compliance answer now uses. In
              the box they are where the hand already is.

              Photo deliberately stays a full 44px labelled button in the bar.
              It is the one of the four used in gloves on an apron, and a 34px
              icon in a text field is the wrong target for that. */}
          <div className="relative lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <textarea
              ref={obsRef}
              value={r.observation}
              onChange={(e) => patch(check.id, { observation: e.target.value })}
              placeholder="Type, or use the tools on the right…"
              aria-label="Observation"
              /* 44px at rest, 112px once the cursor is in it, and full height
                 from sm. A phone that pins a six-line box has two lines of check
                 left above it; one that pins a single line has nowhere to write.
                 It grows when there is something to write in it.

                 FROM lg THE CAP COMES OFF. Below that the box shares the
                 screen with the register panel above it and max-h-[26vh]
                 is what keeps it from pushing that panel out of reach — but
                 from lg the two sit side by side in their own columns (see
                 the sticky wrapper's own note above), so the only thing
                 bounding this box on a laptop was itself, not the register.
                 lg:flex-1 lets it take whatever the column has left instead
                 of stopping at a fraction of the viewport with the rest of
                 the panel sitting empty beneath it.

                 pr-[124px] keeps the text clear of the icon cluster. The
                 padding is on the RIGHT rather than the bottom because the box
                 is 44px at rest — a bottom gutter would leave a single line of
                 writing nowhere to sit. */
              className="max-h-[26vh] min-h-[44px] w-full resize-y rounded-[11px] border py-2 pr-[124px] pl-3 text-[12.5px] leading-[1.55] outline-none transition-[var(--t)] focus:min-h-[112px] focus:border-[var(--acc)] sm:min-h-[68px] sm:py-2.5 lg:max-h-none lg:min-h-0 lg:flex-1"
              style={{ background: "var(--focus-surface)", borderColor: "var(--line-2)" }}
            />
            {/* top-right, not centred: the box grows to 112px on focus and a
                vertically centred cluster would walk down the field as it
                does. Pinned to the top it stays where the eye left it. */}
            <div className="absolute top-[5px] right-[5px] flex items-center gap-[4px]">
              <button
                type="button"
                onClick={() => {
                  const text = composeObservation(check, r, a);
                  if (text) setDraft(text);
                  else onSaved("Nothing tapped yet to compose from");
                }}
                aria-label="Compose from taps"
                title="Compose from taps — builds a sentence from the buttons you have tapped. Works offline, no model needed."
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border transition-[var(--t)] active:translate-y-[1px]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
              >
                <IconWand width={14} height={14} />
              </button>
              {aiOn && (
                <button
                  type="button"
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
                  aria-label={thinking === "observation" ? "Drafting…" : "Draft with AI"}
                  title="Draft with AI — drafts the observation from this check's own material. Advisory, you decide."
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border transition-[var(--t)] active:translate-y-[1px] disabled:opacity-40"
                  style={
                    thinking === "observation"
                      ? { background: "var(--acc-bg)", borderColor: "var(--acc)", color: "var(--acc)" }
                      : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                  }
                >
                  <IconSpark width={14} height={14} />
                </button>
              )}
              <VoiceNoteButton
                inline
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
            </div>
          </div>

        </div>

        {/* THE ANSWER, AND WHAT COMMITS IT, IN THE SAME PINNED BAR.

            The four compliance buttons used to sit in the sticky header, above
            two columns. They were the biggest thing on the screen and they
            were at the top of it, which put a decision above the material the
            decision is made from, and made the header a third of a tablet.

            Down here they are still on screen at every scroll position — this
            bar is pinned too — they are under the thumb rather than across the
            screen from Save, and the check gets the height back. */}
        <div
          /* Tighter vertically than it looks like it should be, because on a
             phone this is three 44px rows and the targets are the thing that
             may not shrink. The gaps give back what the third row costs.
             shrink-0: the pinned bar's own flex-col split (see its className
             above) means this row is the one that must NOT give, whatever
             the bar's own max-height is doing — Save and the compliance
             buttons stay on screen at 25vh exactly as they did at 70vh. */
          className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-[6px] border-t px-5 py-2 sm:gap-y-2 sm:py-2.5"
          style={{
            background: "var(--panel)",
            borderColor: "var(--line)",
            paddingBottom: "calc(0.5rem + var(--sticky-safe))",
          }}
        >
          {/* WHAT IS ALREADY ATTACHED, NOT WHERE YOU ATTACH IT.
              Sarel: "remove the paperclip and photo icon, introduce them in
              the evidence section — all photos and evidence will be
              uploaded in the evidence section." Photo and File used to
              live here, in their own row above the compliance buttons;
              they are both now in the Evidence status panel instead, the
              one place an auditor reaches for either, rather than a
              second copy floating under every tab. These pills are what
              is left: a glance at what is attached without leaving
              whichever tab is open — the label row above the observation
              says the same thing and is desk-only, so on a phone these
              are the only place it is said. */}
          <div className="no-scrollbar flex flex-nowrap items-center gap-[6px] overflow-x-auto sm:overflow-visible [&>*]:shrink-0">
            {photos > 0 && (
              <Pill>
                {photos} photo{photos > 1 ? "s" : ""}
              </Pill>
            )}
            {/* A plain attachment count, same as photos and files beside
                it — item 4 of Sarel's second visual-hierarchy pass takes
                the brand accent off it. */}
            {voice && <Pill>voice note</Pill>}
            {files > 0 && (
              <Pill>
                {files} file{files > 1 ? "s" : ""}
              </Pill>
            )}
          </div>

          {/* THREE, ONE ROW AT EVERY WIDTH. Down from five (2 October 2026 —
              see the note on STATUSES) to the two verdicts and the one
              qualifier that actually settle a check; "evidence pending" and
              "not available" moved to the Evidence status panel, which asks
              a different question from this one. Three columns fit a
              single row from a phone up, so there is no longer a narrower
              layout to fall back to. N/A keeps the quieter styling
              (transparent, lighter border) toneStyle's `quiet` flag gives
              it — the one qualifier among two verdicts still reads as a
              different kind of answer. */}
          <div className="grid min-w-[280px] flex-1 grid-cols-3 gap-[4px]">
            {STATUSES.map((st) => {
              const on = isOn(st, r.compliance);
              const quiet = st.group === "qualifier";
              return (
                <button
                  key={st.label}
                  onClick={() => setCompliance(check.id, on ? null : st.key)}
                  aria-pressed={on}
                  title={st.label}
                  /* min-w-0 lets the grid keep all three columns the same
                     width — without it a flex child's default min-width is
                     its own content, so a long label forces its column
                     wider than the others. */
                  /* outline-none, and deliberately no focus ring in its
                     place — see the identical note this block carried
                     before the merge: the browser's own default outline
                     stacks outside the tone ring on a button that is both
                     tapped AND still focused, which on a tablet is every
                     tap, and reads as one oversized box. The selected
                     state itself (background, border, tone, aria-pressed)
                     is already the affordance. */
                  /* text-[9.5px] below sm, not st.short's code. Sarel,
                     reviewing a 390px screenshot: "the outcome buttons must
                     read 'Compliant', 'Non-compliant', 'N/A', not C/NC."
                     "Non-compliant" is the long one — 9.5px plus the tight
                     gap/padding already on this button is what gets all
                     three full words onto one row of three columns at 390px
                     without wrapping or shrinking the 44px target. st.short
                     stays on the STATUSES entries themselves (it is still
                     ACSA's own code, still read by whatever exports off of
                     it) — it is just no longer what this button shows or
                     says, at any width. */
                  className={`flex min-h-[44px] min-w-0 items-center justify-center gap-[4px] rounded-[9px] px-[4px] py-1 text-center font-display text-[9.5px] leading-tight font-semibold outline-none transition-[var(--t)] active:translate-y-[1px] sm:px-[6px] sm:text-[10.5px] ${quiet ? "border" : "border-[1.5px]"}`}
                  style={toneStyle(st.tone, on, quiet)}
                >
                  <st.Icon width={12} height={12} className="shrink-0" />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>

          {/* CENTERED, ON ITS OWN ROW. Sarel: "centre the save, save next
              buttons." `w-full` is the same trick the note below already
              uses to force a line of its own in this flex-wrap bar — once
              it has the full width, `justify-center` centers the four
              controls within it rather than leaving them pinned to
              wherever the pills/verdict grid happened to end. */}
          <div className="flex w-full items-center justify-center gap-[7px]">
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

          {/* Sarel: this note was taking a lot of space, crowded in beside
              Photo/the verdict grid/Save. It used to sit first in this row,
              competing for width with four other controls that all need
              room; `w-full` on a flex-wrap row forces it onto its own line
              below them instead — same information, but it no longer
              squeezes anything else, and the row above stays exactly as
              wide as the controls actually need. Hidden on a phone, where
              the same fact is already a pill in the pinned header and this
              line is 26px the check-list cannot spare. */}
          <div
            className="hidden w-full items-center gap-[6px] font-mono text-[10px] sm:flex"
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
        </div>
      </div>
      </div>
    </div>
  );
}
