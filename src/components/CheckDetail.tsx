"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Check, Compliance, EvidenceStatus } from "@/lib/types";
import { channelsOf } from "@/lib/channels";
import { channelOf } from "@/lib/attachmentChannel";
import {
  deskDone,
  needsDeskCommit,
  priorFor,
  useEntityCode,
  useEvidenceItems,
  useResponses,
  useStore,
  useVisitFindings,
} from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import { useAnswers } from "@/lib/answers";
import {
  assist,
  checkContext,
  composeObservation,
  transcriptContext,
  useAssistAvailable,
} from "@/lib/assist";
import { modeLabels, needsDesk, needsField } from "@/lib/verification";
import { checksOf } from "@/lib/register";
import { trackingStage } from "@/lib/evidence";
import { AttachmentStrip, FileButton, PhotoButton, VoiceNoteButton } from "./Capture";
import AcsaRequirementPanel from "./AcsaRequirementPanel";
import { StandardsPanel, EvidenceListPanel } from "./CheckStandardsSheets";
import { ReferencePanel } from "./ReferencePanel";
import FindingDetail from "./FindingDetail";
import Sheet from "./ui/Sheet";
import AddSheet from "./AddSheet";
import RaiseFindingSheet from "./RaiseFindingSheet";
import {
  IconCheck,
  IconClipboard,
  IconClock,
  IconDash,
  IconFlag,
  IconHelp,
  IconInfo,
  IconLeft,
  IconMore,
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
  /* RELABELLED, NOT RETYPED (build prompt 2, 21 Nov 2026). The methodology
   *  calls these Discussed / Non-compliance / Not applicable; `key` and
   *  `short` stay exactly "C"/"NC"/"N/A" — that is still the stored
   *  Compliance value and ACSA's own export code, read as-is by the
   *  dashboard, review, exports and the SharePoint sync (sarel, 21 Nov:
   *  no change to what SharePoint gets, only this screen's own words). Only
   *  `label`, what this button says, changed. No data migration: a
   *  response already stored as "C" already meant this, under an older
   *  word for it. */
  {
    key: "C",
    hotkey: "1",
    label: "Discussed",
    short: "C",
    Icon: IconCheck,
    tone: "good",
    group: "verdict",
  },
  {
    key: "NC",
    hotkey: "2",
    label: "Non-compliance",
    short: "NC",
    Icon: IconX,
    tone: "bad",
    group: "verdict",
  },
  {
    key: "N/A",
    hotkey: "3",
    label: "Not applicable",
    short: "N/A",
    Icon: IconDash,
    tone: "neu",
    group: "qualifier",
  },
  /* 19 Nov 2026 — BACK, reversing the 2 October removal this array's own
   *  header describes, on Sarel's own direct instruction this time:
   *  "on this screen on the compliance add 'require evidence to verify'
   *  as an additional option." The Evidence status panel below still
   *  answers "has the proof been produced" on its own four-state scale —
   *  this is the check's own VERDICT again carrying a fourth answer,
   *  same shape as EVIDENCE_VERDICTS/OutcomeControl's own NV entry
   *  already do elsewhere, just worded to match today's instruction
   *  rather than "Not verified". hotkey "6" rather than reclaiming "4" —
   *  the OLD "4" meant "Compliant, evidence pending", a genuinely
   *  different answer from this one, and the whole reason 4/5 were
   *  retired outright instead of reassigned (see this array's own
   *  header) was so a stale muscle-memory press could never land on a
   *  changed meaning. Reusing "4" here would do exactly that.
   *
   *  CONFIRMED STILL IN, 21 Nov 2026. The build-prompts doc for this same
   *  day's redesign reads "the check result becomes exactly three options
   *  ... 'Not verified' no longer exists as a result" — written without
   *  knowing about the instruction two days above this one. Asked Sarel
   *  directly: this stays a fourth option, the 21 Nov doc's "exactly
   *  three" is Discussed/Non-compliance/Not applicable (STATUSES' first
   *  three keys), not a removal of this one. */
  {
    key: "NV",
    hotkey: "6",
    label: "Requires evidence to verify",
    short: "NV",
    Icon: IconClock,
    tone: "warn",
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
  onPrev: rawPrev,
  onNext: rawNext,
  onSaved,
}: {
  check: Check;
  onPrev: () => void;
  onNext: () => void;
  onSaved: (msg: string) => void;
}) {
  const responses = useResponses();
  const r = responses[check.id] ?? {
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
  /* Which of interview / evidence / walk this check needs — set in Setup.
     A check can need fewer than three; the ones it does not need are not
     shown, so the auditor is never asked for something the config has ruled
     out. All three until the config says otherwise. */
  const channelConfig = useStore((s) => s.checkChannels);
  const channels = channelsOf(channelConfig, check.id);
  /* Written in Setup, not per-visit — same reasoning as channelConfig just
     above. Build prompt 4 ("How to ask" notes). */
  const howToAskNote = useStore((s) => s.howToAsk[check.id]) ?? "";
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
  /* WHICH SHEET IS OPEN, by key, or null for none (build prompt 3, "the
   *  check, one screen" redesign, 21 Nov 2026). Replaces the single
   *  always-one-panel-open tab strip: the new layout shows Interview/
   *  Evidence/Walk/Issues as flat summary rows by default, each opening
   *  its own Sheet on tap for the detail that used to be a tab. "How to
   *  ask", "ACSA requirement" and the "More" overflow (Flag for review,
   *  ACSA wording, the carried-forward prior note) are Sheets too, so this
   *  one piece of state covers all of them.
   *
   *  RESET ON EVERY CHECK CHANGE, unlike the old `panel` state it replaces.
   *  That one stayed open on purpose, walking a discipline tab after tab;
   *  a Sheet is a deliberate, momentary look at one thing, not a resting
   *  view of the screen, so the next check opens with every Sheet closed
   *  rather than reopening whatever was last read. */
  const [sheet, setSheet] = useState<string | null>(null);
  /* The + sheet's "Issue" option hands off to RaiseFindingSheet, which is
     its own modal, not one more `sheet` key — the + sheet closes first
     (sheet -> null), then this opens, so only one is ever on screen. */
  const [raiseOpen, setRaiseOpen] = useState(false);
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
    setSheet(null);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setStuck(el.scrollTop > 24);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /* THE OTHER HALF OF "SAVE IS AUTOMATIC" — onPrev/onNext below (the
   *  bottom bar, the top icon pair, the arrow keys) cover leaving through
   *  THIS screen's own controls. They do not cover leaving by clicking a
   *  different check straight off the list, or navigating to another
   *  screen entirely — both just change `check.id` or unmount this
   *  component without ever calling onPrev/onNext.
   *
   *  READS THE STORE DIRECTLY AT CLEANUP TIME (`useStore.getState()`, not
   *  the `r` this render closed over) — React runs a changed effect's
   *  cleanup AFTER the next render has already happened, and by then `r`
   *  here is the NEW check's response, `check.id` having already moved on;
   *  closing over `r` would commit the wrong check's data under the old
   *  check's id. `response(id)` (store.ts) reads whichever check `id`
   *  names, live, independent of what this component is showing now.
   *
   *  CONDITIONAL, unlike onNext/onPrev's unconditional commit — this path
   *  is passive, not a deliberate "done with this one": committing a check
   *  nobody actually touched would falsely stamp deskDoneAt on something
   *  the auditor only glanced at. needsDeskCommit() (store.ts), not plain
   *  deskAnswered() — deskAnswered reads false forever once a check has
   *  EVER been committed, so an auditor re-opening an already-done check,
   *  changing the answer, then leaving passively would never get
   *  deskDoneAt/deskDoneBy re-stamped under deskAnswered alone (code review
   *  on this branch caught it: the new answer is safely in `responses`
   *  either way, but "who/when last reviewed this" would go stale and
   *  silently wrong). needsDeskCommit adds the other half: already
   *  committed, but edited again since — see its own doc comment. */
  useEffect(() => {
    const id = check.id;
    return () => {
      if (needsDeskCommit(useStore.getState().response(id))) commit(id, "desk");
    };
  }, [check.id, commit]);

  /* SAVE IS AUTOMATIC (build prompt 2, 21 Nov 2026) — Sarel: "remove the
   *  separate Save / Save & next pair. One 'Next check' action." There is
   *  no longer a tap that only saves without moving: every way OFF this
   *  check — the bottom bar's Next check, the Prev/Next icon pair at the
   *  top of the screen, and the ArrowLeft/ArrowRight keys below — commits
   *  first. Shadows the raw onPrev/onNext props so every existing call site
   *  (keyboard handler, the top icon pair, the bottom bar) keeps working
   *  unchanged; only what "onPrev"/"onNext" DO changed, not who calls them.
   *  Going backward commits too — an auditor who answers, then taps Prev to
   *  re-check something, must not lose that answer because the only
   *  direction that used to save was forward. Declared ABOVE the keyboard
   *  effect below, which closes over both by name — a `const` declared
   *  after the effect that reads it is a temporal-dead-zone crash, not a
   *  hoisting question. */
  const onPrev = useCallback(() => {
    commit(check.id, "desk");
    rawPrev();
  }, [check.id, commit, rawPrev]);
  const onNext = useCallback(() => {
    commit(check.id, "desk");
    onSaved(
      needsField(check, channelConfig) && !r.fieldDoneAt
        ? `${portalId} — desk done. Still needs the asset seen in Field.`
        : `${portalId} saved`
    );
    rawNext();
  }, [check, channelConfig, r.fieldDoneAt, onSaved, portalId, commit, rawNext]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(
        (document.activeElement as HTMLElement)?.tagName ?? ""
      );
      if (typing) return;
      /* Found by its declared hotkey, not by position — 1-3 are what they
         have always been; 6 is the NV verdict's own, deliberately not
         the retired 4/5 (see STATUSES' own note). */
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
              addAttachment(check.id, { ...m, channel: "evidence", createdBy: auditor });
              onSaved(`Photo attached to ${portalId}`);
            }}
          />
          <FileButton
            compact
            onCaptured={(m) => {
              addAttachment(check.id, { ...m, channel: "evidence", createdBy: auditor });
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
        {r.attachments.some((a) => a.kind !== "photo" && channelOf(a) === "evidence") ? (
          <div className="mt-2.5">
            <AttachmentStrip
              attachments={r.attachments.filter((a) => a.kind !== "photo" && channelOf(a) === "evidence")}
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

  /* Setup can switch walk and evidence off for a check. Dropped here, after
     every push, so none of the panel bodies above need to know. Safe to
     splice unconditionally: "standard" (line ~1007) and "evidenceStatus"
     (line ~631) are both pushed unconditionally, so panels never empties
     out from under openKey's own fallback (line ~1106) just below. */
  for (let i = panels.length - 1; i >= 0; i--) {
    const k = panels[i].key;
    if ((k === "walkabout" && !channels.walk) || (k === "evidenceStatus" && !channels.evidence)) {
      panels.splice(i, 1);
    }
  }

  /* A Sheet shows one panel's body at a time now, by key — see `sheet`'s own
     doc comment above. `panelByKey` is the lookup every Sheet below reads;
     a key with no matching panel (the check it belonged to has none, or
     Setup switched the channel off since it was opened) renders nothing
     rather than throwing, same reasoning the old `openKey` fallback existed
     for. */
  const panelByKey = (key: string | null) => panels.find((t) => t.key === key);

  /* The evidence line that stays above the rows — the register's own
     sentence where it has one, ACSA's named records where it does not.
     Empty when Setup has switched evidence off for this check, same as the
     evidenceStatus panel itself and the Evidence row just below. */
  const evidenceLine = channels.evidence
    ? check.evidenceExpected || (check.acsaEvidence.length > 0 ? check.acsaEvidence.join(" · ") : "")
    : "";

  const photos = r.attachments.filter((x) => x.kind === "photo").length;
  const voice = r.attachments.find((x) => x.kind === "voice");
  const files = r.attachments.filter((x) => x.kind === "file").length;

  /* THE THREE CHANNEL ROWS' OWN SUMMARIES (build prompt 3, 21 Nov 2026) —
   *  computed once here, read by the flat rows below and by their Sheets'
   *  badges. Each is independent of the other two and of `compliance`: a
   *  check can be Non-compliance overall while its Walk channel reads
   *  "done" and its Evidence channel reads "Open", because those are three
   *  different questions (was it asked, is the document in, was the asset
   *  seen), not three votes toward one answer. */
  const interviewState: "done" | "na" | "empty" = r.interviewNA
    ? "na"
    : r.interviewDone
      ? "done"
      : "empty";
  /* Every EvidenceItem that names this check among its checkIds — the same
     many-to-many EvidenceReviewView.tsx already reads (one item can satisfy
     several checks, a check can need several items). "Settled" is received,
     in analysis, or returned (the custody record closed one way or
     another) — trackingStage's own ranking, not a second one invented
     here. */
  const evidenceItems = useEvidenceItems().filter((e) => e.checkIds.includes(check.id));
  const evidenceSettled = evidenceItems.filter((e) =>
    ["received", "analysis", "returned"].includes(trackingStage(e))
  ).length;
  const walkState: "done" | "na" | "empty" = r.walkNA ? "na" : r.fieldDoneAt ? "done" : "empty";

  /* THE HEADER'S "N / M" — desk progress for THIS asset system only, the
     same pair capture/page.tsx's own per-system row already computes
     (checksOf(entityCode, discipline, system).filter(needsDesk) + deskDone)
     — not threaded in as a prop, because every other per-check number on
     this screen (pf, evidenceLine, the channel summaries above) is already
     computed locally rather than passed down, and a second source for the
     same pair is how the two drift. */
  const systemChecks = checksOf(entityCode, check.discipline, check.system).filter((c) =>
    needsDesk(c, channelConfig)
  );
  const systemDone = systemChecks.filter((c) => deskDone(responses[c.id])).length;

  return (
    <div ref={scrollRef} className="app-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
      {/* ONE SLIM PINNED BLOCK (build prompt 3, "the check, one screen"
          redesign, 21 Nov 2026) — Sarel: "One slim header: discipline, asset
          system, '19 / 24', thin progress bar... Remove the icon row
          clutter and the 'Step 1 of 7' line from this screen." Replaces the
          old header's full tag row (seven kinds of pill: modes, coverage,
          variant/conflict, confirmedBy, inspect, prior rating, captured
          status) with exactly the identity and position prompt 3 names.
          Nothing in that old row was deleted without a replacement —
          modeLabels/confirmedBy/inspect move into the ACSA requirement
          Sheet as supporting context; coverage/conflict/prior-rating, the
          genuine safety-relevant warnings among them, stay visible here as
          one compact pill rather than buried a tap away. "Step 1 of 7" is
          suppressed for this one route in AppShell.tsx, not deleted — every
          other screen in the seven-step flow still shows it. */}
      <div
        className="sticky top-0 z-[6] border-b px-5 pt-[11px] pb-2.5"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div className="mb-[5px] flex flex-wrap items-center gap-[7px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
          <span>{portalId}</span>
          <span>·</span>
          <span>{check.system}</span>
          <span>·</span>
          <span className="tnum">
            {systemDone} / {systemChecks.length}
          </span>
          <span
            className="h-[4px] min-w-[40px] flex-1 overflow-hidden rounded-full"
            style={{ background: "var(--line)" }}
            role="img"
            aria-label={`${systemDone} of ${systemChecks.length} captured in ${check.system}`}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${systemChecks.length ? Math.round((systemDone / systemChecks.length) * 100) : 0}%`,
                background: "var(--acc)",
              }}
              aria-hidden="true"
            />
          </span>
          {/* THE GENUINELY SAFETY-RELEVANT WARNINGS, one pill, not seven.
              A conflict or a missing ACSA basis is not clutter — it is the
              one thing on the old pill row an auditor could not afford to
              miss — so it stays pinned rather than moving into the ACSA
              requirement Sheet with the rest. */}
          {check.coverage === "none" && <Pill tone="bad">NO ACSA BASIS</Pill>}
          {check.siteVariant?.conflict && (
            <Pill tone="bad">
              CONFLICT · {check.siteVariant.site} {check.siteVariant.conflict.direction.toUpperCase()}
            </Pill>
          )}
          {pf?.rating === "Unacceptable" && (
            <Pill tone="bad">
              {pf.key} · 2025 UNACCEPTABLE
            </Pill>
          )}
        </div>
        {/* THE REGISTER'S OWN CHECK TEXT, VERBATIM, AND LABELLED AS SUCH.
            `check.requirement` is the Rev A2 check-point wording — ACSA's
            words, not ours — and it is what a finding must cite. Not
            summarised, not truncated, not title-cased. */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="label-xs mb-[2px] hidden lg:block" style={{ color: "var(--ink-4)" }}>
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


      {/* THE QUESTION, AND THE TWO BUTTONS THAT READ FOR IT — build prompt 3:
          "The question, with two buttons: 'How to ask' (opens the saved
          note) and 'ACSA requirement' (opens the clause/policy)." Not
          clamped at rest, same reasoning the old version of this block
          followed — half a question is worse than a few extra lines — and
          still one line once the header is "stuck". */}
      {check.question && channels.interview && (
        <div
          className="border-b px-5 py-[8px]"
          style={{ background: "var(--focus-surface)", borderColor: "var(--line)" }}
        >
          <div className="flex items-baseline gap-2">
            <span className="label-xs shrink-0 pt-[2px] whitespace-nowrap" style={{ color: "var(--acc)" }}>
              TPJV asks
            </span>
            <span
              className={`min-w-0 max-w-[92ch] xl:max-w-[150ch] text-[13.5px] leading-[1.4] font-semibold${
                stuck ? " line-clamp-1" : ""
              }`}
              style={{ color: "var(--acc)" }}
            >
              {check.question}
            </span>
          </div>
          <div className="mt-[6px] flex flex-wrap gap-[6px]">
            {/* "HOW TO ASK" — build prompt 4 ("How to ask notes", Setup
                section, bulk apply, voice input) owns the real feature. This
                button is the structural placeholder prompt 3 asks for: it
                opens, and says honestly that there is nothing here yet
                rather than pretending to be prompt 4 early. */}
            <Btn onClick={() => setSheet("howToAsk")} className="text-[11px]">
              How to ask
            </Btn>
            <Btn onClick={() => setSheet("standard")} className="text-[11px]">
              ACSA requirement
            </Btn>
            {/* "⋯ MORE" — Flag for review, ACSA wording, and the
                carried-forward prior finding, folded into one overflow
                Sheet rather than left as tabs of their own (confirmed with
                Sarel: nothing here is deleted, just no longer competing for
                space with the three channel rows below). */}
            <Btn icon onClick={() => setSheet("more")} aria-label="More — Flag for review, ACSA wording, prior finding">
              <IconMore width={14} height={14} />
            </Btn>
            {/* "+" — build prompt 5, the one unified add-anything entry
                point. Pre-filled with this check's own id/system/discipline,
                so Evidence/Issue never ask for what this screen already
                knows. */}
            <Btn icon onClick={() => setSheet("add")} aria-label="Add — photo, voice note, evidence or an issue, for this check">
              <IconPlus width={14} height={14} />
            </Btn>
          </div>
        </div>
      )}

      {/* REFERENCE ROW — always shown, whether or not the check has a TPJV
          question. The ACSA requirement, ICAO and other standards, and the
          evidence list are read for EVERY check; the row above only exists
          for checks with a question, so on the rest of them these were not
          reachable at all. "ACSA requirement" is repeated here only when
          that row is absent, so it never appears twice. */}
      <div
        className="flex flex-wrap gap-[6px] border-b px-5 py-[7px]"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        {!(check.question && channels.interview) && (
          <Btn onClick={() => setSheet("standard")} className="text-[11px]">
            ACSA requirement
          </Btn>
        )}
        <Btn onClick={() => setSheet("reference")} className="text-[11px]">
          Reference &amp; specs
        </Btn>
        <Btn onClick={() => setSheet("icao")} className="text-[11px]">
          ICAO &amp; standards
        </Btn>
        <Btn onClick={() => setSheet("evidenceList")} className="text-[11px]">
          Evidence list
        </Btn>
      </div>

      {/* THE THREE CHANNEL ROWS, FIXED ORDER, SAME COLOURS EVERY TIME — build
          prompt 3. A row for a channel Setup has switched off for this check
          is not shown at all (channels.interview/evidence/walk, same test
          every other screen in this redesign uses). Each row is a summary;
          the detail each one used to be a whole tab for — the walkabout
          chip picker, the four-state evidence picker, "what the interview
          actually found" — opens in its own Sheet on tap, reusing that tab's
          exact body rather than rebuilding it. */}
      <div className="flex flex-col gap-[1px] border-b px-5 py-[7px]" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
        {channels.interview && (
          <div className="flex min-h-[40px] items-center justify-between gap-2 py-[5px]">
            <span className="text-[12.5px] font-semibold">Interview</span>
            <div className="flex items-center gap-[6px]">
              <button
                type="button"
                onClick={() => patch(check.id, { interviewDone: !r.interviewDone, interviewNA: false })}
                aria-pressed={interviewState === "done"}
                aria-label="Interview done"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-full border"
                style={toneStyle("good", interviewState === "done", true)}
              >
                <IconCheck width={14} height={14} />
              </button>
              <button
                type="button"
                onClick={() => patch(check.id, { interviewNA: !r.interviewNA, interviewDone: false })}
                aria-pressed={interviewState === "na"}
                className="rounded-full border px-[9px] py-[5px] text-[10px] font-semibold"
                style={toneStyle("neu", interviewState === "na", true)}
              >
                N/A
              </button>
            </div>
          </div>
        )}
        {channels.evidence && (
          <div className="flex min-h-[40px] items-center justify-between gap-2 py-[5px]">
            <button
              type="button"
              onClick={() => setSheet("evidenceStatus")}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            >
              <span className="min-w-0">
                <span className="text-[12.5px] font-semibold">Evidence</span>
                {/* What ACSA's own wording names, or the register's own
                    evidence sentence — the same text the old "evidence line"
                    carried above the tab strip, now the Evidence row's own
                    secondary line rather than a separate always-visible
                    banner. */}
                {evidenceLine && (
                  <span className="block max-w-[46ch] truncate text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                    {evidenceLine}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-[6px] font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
                {r.evidenceNA || r.evidenceStatus === "noneAvailable" ? (
                  <Pill tone="neutral">N/A</Pill>
                ) : evidenceItems.length > 0 ? (
                  <>
                    {evidenceSettled} of {evidenceItems.length}
                    <Pill tone={evidenceSettled === evidenceItems.length ? "good" : "warn"}>
                      {evidenceSettled === evidenceItems.length ? "Complete" : "Open"}
                    </Pill>
                  </>
                ) : (
                  <Pill tone={r.evidenceStatus ? "warn" : "neutral"}>
                    {r.evidenceStatus
                      ? EVIDENCE_STATUSES.find((s) => s.key === r.evidenceStatus)?.label
                      : "Open"}
                  </Pill>
                )}
              </span>
            </button>
            {/* EVIDENCE N/A — build prompt 6, same shape as Interview/Walk's
                own N/A buttons just above/below: a per-audit answer on a row
                that is still shown, independent of evidenceStatus (a
                narrative about the document) and of any EvidenceItems
                already linked to this check. */}
            <button
              type="button"
              onClick={() => patch(check.id, { evidenceNA: !r.evidenceNA })}
              aria-pressed={!!r.evidenceNA}
              className="shrink-0 rounded-full border px-[9px] py-[5px] text-[10px] font-semibold"
              style={toneStyle("neu", !!r.evidenceNA, true)}
            >
              N/A
            </button>
          </div>
        )}
        {channels.walk && (
          <div className="flex min-h-[40px] items-center justify-between gap-2 py-[5px]">
            <button
              type="button"
              onClick={() => setSheet("walkabout")}
              className="flex flex-1 items-center gap-2 text-left"
            >
              <span className="text-[12.5px] font-semibold">Walk</span>
              {photos > 0 && (
                <span className="font-mono text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                  {photos} photo{photos > 1 ? "s" : ""}
                </span>
              )}
            </button>
            <div className="flex items-center gap-[6px]">
              <span
                aria-label={walkState === "done" ? "Walk done" : "Walk not yet done"}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-full border"
                style={toneStyle("good", walkState === "done", true)}
              >
                <IconCheck width={14} height={14} />
              </span>
              <button
                type="button"
                onClick={() => patch(check.id, { walkNA: !r.walkNA })}
                aria-pressed={walkState === "na"}
                className="rounded-full border px-[9px] py-[5px] text-[10px] font-semibold"
                style={toneStyle("neu", walkState === "na", true)}
              >
                N/A
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ISSUES — "Open issues on this check shown as a row" (build prompt
          3). Shown even at zero, same reasoning the row above it gives an
          auditor "nothing attached yet" rather than disappearing: a row
          that only exists once there is something in it looks like it was
          never built. Opens the exact FindingDetail content the old
          "Findings" tab showed, when there is something to open. */}
      <button
        type="button"
        onClick={() => checkFindings.length > 0 && setSheet("findings")}
        disabled={checkFindings.length === 0}
        className="flex min-h-[40px] w-full items-center justify-between gap-2 border-b px-5 py-[7px] text-left disabled:opacity-60"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <span className="text-[12.5px] font-semibold">Issues</span>
        {checkFindings.length > 0 ? (
          <span className="flex items-center gap-[6px] font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
            {checkFindings.length} issue{checkFindings.length > 1 ? "s" : ""}
            <Pill tone="warn">Open</Pill>
          </span>
        ) : (
          <span className="font-mono text-[11px]" style={{ color: "var(--ink-4)" }}>
            No issues
          </span>
        )}
      </button>

      {/* INTERNAL NOTE — this check's own, for this audit; never printed,
          never synced. See Response.internalNote's own doc comment for why
          this sits beside, not instead of, the asset-system-wide internal
          note (still reachable under "More"). */}
      <div className="border-b px-5 py-[9px]" style={{ borderColor: "var(--line)" }}>
        <div className="mb-[5px] flex items-center gap-[6px] text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
          <IconInfo width={12} height={12} />
          Internal note — never printed in any report
        </div>
        <textarea
          value={r.internalNote ?? ""}
          onChange={(e) => patch(check.id, { internalNote: e.target.value })}
          rows={2}
          aria-label="Internal note for this check"
          placeholder="A note for the team, this audit only"
          className="w-full resize-y rounded-[8px] border px-3 py-2 text-[12.5px]"
          style={{ background: "var(--bg)", borderColor: "var(--line-2)" }}
        />
      </div>

      {/* EVERY TAB THE OLD STRIP CARRIED, STILL REACHABLE — now as Sheets,
          one per row/button above, each showing one panel's exact body.
          `panelByKey` returns undefined for a key this check has no panel
          for (Setup switched evidence/walk off since the Sheet was last
          opened, or this check carries no prior-year note) — the Sheet
          then renders nothing rather than guessing at a fallback, same
          "falls back to nothing it does not have" rule the old openKey
          computation used to apply to a single open tab. */}
      {/* Build prompt 4: a note written in Setup, before the audit, shown here
          collapsed by default — this Sheet IS the collapse: nothing shows
          until the button above is tapped. */}
      <Sheet open={sheet === "howToAsk"} onClose={() => setSheet(null)} title="How to ask">
        {howToAskNote.trim() ? (
          <p className="whitespace-pre-wrap text-[13px] leading-[1.5]">{howToAskNote}</p>
        ) : (
          <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            No note set for this check. Write one in Setup → How to ask notes.
          </p>
        )}
      </Sheet>
      <Sheet open={sheet === "reference"} onClose={() => setSheet(null)} title="Reference & specs" wide>
        <ReferencePanel check={check} />
      </Sheet>
      <Sheet open={sheet === "icao"} onClose={() => setSheet(null)} title="ICAO & standards" wide>
        <StandardsPanel check={check} />
      </Sheet>
      <Sheet open={sheet === "evidenceList"} onClose={() => setSheet(null)} title="Evidence list" wide>
        <EvidenceListPanel check={check} />
      </Sheet>
      <Sheet open={sheet === "standard"} onClose={() => setSheet(null)} title="ACSA requirement" wide>
        {panelByKey("standard")?.body}
      </Sheet>
      <Sheet open={sheet === "evidenceStatus"} onClose={() => setSheet(null)} title="Evidence status" wide>
        {/* THE FULL EVIDENCE LINE, NEVER CUT OFF — Sarel: "make sure it
            expands so all the text is visible, not cut off." The Evidence
            row itself (above) truncates to one line for the flat-row
            summary; the whole sentence, up to 606 characters in the
            register, is always here, uncut, one tap away. */}
        {evidenceLine && (
          <div
            className="mb-2.5 rounded-[8px] border px-[10px] py-[8px]"
            style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
          >
            <div className="label-xs">Evidence needed</div>
            <RefText>{evidenceLine}</RefText>
          </div>
        )}
        {panelByKey("evidenceStatus")?.body}
      </Sheet>
      <Sheet open={sheet === "walkabout"} onClose={() => setSheet(null)} title="Walkabout">
        {/* WHAT WAS RECORDED ON THE WALK FOR THIS CHECK — the walk's own note
            (never the desk observation), its photographs and the voice notes
            recorded on the walk. Capture here is tagged "walk", so it shows
            here and not under Evidence or the desk observation. */}
        <div className="mb-3 flex flex-col gap-2.5">
          <div className="label-xs">Recorded on the walk</div>
          {r.fieldObservation?.trim() ? (
            <p className="whitespace-pre-wrap text-[12.5px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
              {r.fieldObservation}
            </p>
          ) : (
            <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              No walk note yet. Add one on the Walk screen.
            </p>
          )}
          {r.attachments.some((a) => channelOf(a) === "walk") ? (
            <AttachmentStrip
              attachments={r.attachments.filter((a) => channelOf(a) === "walk")}
              thumbSize={56}
              onRemove={(id) => removeAttachment(check.id, id)}
              onUpdate={(id, p) => updateAttachment(check.id, id, p)}
            />
          ) : (
            <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              No walk photos or voice notes yet.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-[6px]">
            <PhotoButton
              compact
              onCaptured={(m) => {
                addAttachment(check.id, { ...m, channel: "walk", createdBy: auditor });
                onSaved(`Walk photo attached to ${portalId}`);
              }}
            />
            <VoiceNoteButton
              compact
              onCaptured={(m) => {
                addAttachment(check.id, { ...m, channel: "walk", createdBy: auditor });
                onSaved(`Walk voice note attached to ${portalId}`);
              }}
            />
          </div>
        </div>
        {panelByKey("walkabout")?.body}
      </Sheet>
      <Sheet open={sheet === "findings"} onClose={() => setSheet(null)} title="Findings" wide>
        {panelByKey("findings")?.body}
      </Sheet>
      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title="More" subtitle="ACSA wording · Flag for review · asset-system note · prior finding" wide>
        <div className="flex flex-col gap-5">
          {(modeLabels(check).length > 0 || check.confirmedBy || (check.inspect && check.inspect !== "none")) && (
            <div className="flex flex-wrap gap-[6px]">
              {modeLabels(check).map((m) => {
                const Icon = MODE_ICON[m] ?? IconInfo;
                return (
                  <Pill key={m} tone={m === "Physical" ? "warn" : "neutral"}>
                    <Icon width={10} height={10} aria-hidden />
                    {m.toUpperCase()}
                  </Pill>
                );
              })}
              {check.confirmedBy && (
                <Pill tone={check.confirmedBy === "Asset" ? "warn" : "neutral"}>
                  {check.confirmedBy.toUpperCase()}
                </Pill>
              )}
              {check.inspect && check.inspect !== "none" && (
                <Pill tone="neutral">{check.inspect === "reconcile" ? "GO AND RECONCILE" : "GO AND SEE"}</Pill>
              )}
            </div>
          )}
          {panelByKey("acsa") && (
            <div>
              <div className="label-xs mb-1.5">ACSA wording</div>
              {panelByKey("acsa")?.body}
            </div>
          )}
          <div>
            <div className="label-xs mb-1.5">Flag for review</div>
            {panelByKey("improve")?.body}
          </div>
          {/* THE ASSET-SYSTEM NOTE — code review on this branch caught that
              this never actually made it into the Sheet, even though the
              PR description and checkscreen.test.mjs both claimed it had:
              the test only grepped for patchSystem's own source text, which
              still existed, not for it being rendered anywhere reachable.
              Labelled distinctly from the new per-check note above (the
              flat row, not this Sheet) — see Response.internalNote's own
              doc comment for the two notes' different scopes. */}
          <div>
            <div className="label-xs mb-1.5">Internal note — this asset system, every check under it</div>
            {panelByKey("internalNote")?.body}
          </div>
          {panelByKey("prior") && (
            <div>
              <div className="label-xs mb-1.5">Prior finding</div>
              {panelByKey("prior")?.body}
            </div>
          )}
        </div>
      </Sheet>

      {/* THE + SHEET — build prompt 5. "Issue" hands off to RaiseFindingSheet
          (its own modal, not a `sheet` key) with the same check context. */}
      <AddSheet
        open={sheet === "add"}
        onClose={() => setSheet(null)}
        onRaiseIssue={() => setRaiseOpen(true)}
        presetCheckId={check.id}
        presetSystem={check.system}
        presetDiscipline={check.discipline}
      />
      <RaiseFindingSheet
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        onSaved={() => setRaiseOpen(false)}
        presetCheckId={check.id}
        presetSystem={check.system}
        presetDiscipline={check.discipline}
      />

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
           tapping a result button or Next check and re-expand the bar
           for no reason right when the auditor is about to move on. Next
           check and the result buttons are never inside the part that
           shrinks — see the flex-col split two lines down, where the
           Observation block is `flex-1 overflow-y-auto` (it gives) and the
           answer bar below it is `shrink-0` (it never does) — so "smaller
           at rest" never costs reaching either, at 25vh or at 70vh alike.

           lg:max-h-none lg:overflow-visible because `lg:static` below
           already turns this into an ordinary column cell beside the
           reference panel, where the Observation block's own
           lg:overflow-y-auto does the scrolling at that width instead —
           this rule must not fight that one. */
        className="sticky bottom-0 z-[7] flex min-h-0 max-h-[25vh] flex-col overflow-hidden has-[.obs-pane:focus-within]:max-h-[70vh]"
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

          {r.attachments.some((a) => a.kind !== "photo" && channelOf(a) === "check") && (
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
                attachments={r.attachments.filter((a) => a.kind !== "photo" && channelOf(a) === "check")}
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
          <div className="relative">
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

                 pr-[260px], not 164px — Sarel, screenshot of the live app:
                 "These buttons are in the way." 164px cleared the cluster
                 at REST (Compose from taps, Draft with AI when aiOn,
                 Photo, Voice — four 34px squares and three 4px gaps), but
                 VoiceNoteButton's own `inline` form deliberately drops its
                 fixed width while recording to carry the running timer
                 (see that component's own doc comment: "while recording
                 it still widens... because a recording that does not show
                 it is running is how an auditor loses a note"), and grows
                 a Discard button beside it too — the exact two elements
                 the screenshot shows sitting on top of already-typed text.
                 260px is sized for that worst case with dictation OFF
                 (wand 34 + sparkle 34 + camera 34 + 3×4px gaps + the
                 voice cluster's own recording-pill-plus-discard, itself
                 measured from VoiceNoteButton's `inline`/`recording`
                 classes), not merely the four-icons-at-rest width — and
                 with a few px of slack past that for the clock's own
                 "0:03"→"10:07" jump: useRecorder has no duration cap, so
                 a long dictated observation can push the timer to a
                 second minute digit, which is exactly the kind of
                 width-the-pill-didn't-have overlap this PR exists to
                 close, just at a longer recording instead of at rest.
                 The live-dictation transcript readout (opt-in, off by
                 default) can still run wider than this on its own — a
                 separate, pre-existing, much rarer case this does not
                 chase. The padding is on the RIGHT rather than the bottom
                 because the box is 44px at rest — a bottom gutter would
                 leave a single line of writing nowhere to sit. */
              className="max-h-[26vh] min-h-[44px] w-full resize-y rounded-[11px] border py-2 pr-[260px] pl-3 text-[12.5px] leading-[1.55] outline-none transition-[var(--t)] focus:min-h-[112px] focus:border-[var(--acc)] sm:min-h-[68px] sm:py-2.5"
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
              {/* CAMERA, REACHABLE WITHOUT A TAB SWITCH — field-capture mobile
                 pass. Photo used to live only in the Evidence status panel
                 (see that panel's own note — a deliberate move, Sarel: "all
                 photos and evidence will be uploaded in the evidence
                 section"), which meant the one control used most on a walk
                 was one tab away from the only part of this screen that is
                 always on screen without scrolling. Writes into the exact
                 same r.attachments array via the exact same addAttachment
                 call the Evidence panel's own PhotoButton already uses — a
                 photo taken here and one taken there are the same thing,
                 just two places to reach for it now. The photo count pill
                 in the bar below already says how many are attached; this
                 does not duplicate it with a second count. */}
              <PhotoButton
                inline
                onCaptured={(m) => {
                  addAttachment(check.id, { ...m, channel: "check", createdBy: auditor });
                  onSaved(`Photo attached to ${portalId}`);
                }}
              />
              <VoiceNoteButton
                inline
                onCaptured={(m) => {
                  addAttachment(check.id, { ...m, channel: "check", createdBy: auditor });
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

          {/* A NOTE PER PHOTO, BELOW THE ONE GENERAL NOTE ABOVE — Sarel,
             field-capture mobile pass: a general note for the check and a
             note per photo are two different things, and an auditor who
             took three photographs on one check needs to say what each one
             shows without leaving this screen. This REVERSES "photos should
             not come up in the evidence view... they should not be visible
             from there" (13 October 2026, see the Evidence status panel's
             own note) for THIS bar specifically — that decision was about
             not duplicating the Evidence status tab's upload surface;
             today's ask is the opposite problem, a caption an auditor
             cannot currently reach without leaving for the separate Review
             screen. Same PhotoRow/AttachmentStrip Review already uses for
             this, so a caption typed here and one typed there are the same
             field, read back the same way everywhere that reads it. */}
          {r.attachments.some((a) => a.kind === "photo") && (
            <div className="mt-[7px] max-h-[34vh] overflow-y-auto">
              <AttachmentStrip
                attachments={r.attachments.filter((a) => a.kind === "photo")}
                thumbSize={40}
                onRemove={(id) => removeAttachment(check.id, id)}
                onUpdate={(id, p) => updateAttachment(check.id, id, p)}
              />
            </div>
          )}
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

          {/* FOUR, ONE ROW AT EVERY WIDTH — back up from three, 19 November
              2026 (see STATUSES' own note), now that "requires evidence to
              verify" is a verdict button again, not only the Evidence
              status panel's job. N/A and the new NV entry both keep the
              quieter styling (transparent, lighter border) toneStyle's
              `quiet` flag gives them — the two qualifiers among the two
              verdicts still read as a different kind of answer. */}
          <div className="grid min-w-[280px] flex-1 grid-cols-4 gap-[4px]">
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
              it has the full width, `justify-center` centers the controls
              within it rather than leaving them pinned to wherever the
              pills/verdict grid happened to end.
              ONE BUTTON, NOT FOUR (build prompt 2, 21 Nov 2026) — Sarel:
              "remove the separate Save / Save & next pair. One 'Next check'
              action." Save and Save & next are gone outright, not merged
              into Next check as a second control beside it: `onNext` above
              already commits before it advances, so a bare Next arrow next
              to a "Next check" button would be two ways to do the same
              thing. Prev stays — the only one of the four with a job this
              button doesn't do (go backward), and it commits too (onPrev,
              above). */}
          <div className="flex w-full items-center justify-center gap-[7px]">
            <Btn icon onClick={onPrev} aria-label="Previous">
              <IconLeft width={14} height={14} />
            </Btn>
            <Btn variant="primary" onClick={onNext}>
              <IconCheck width={14} height={14} />
              Next check
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
            {needsField(check, channelConfig) && r.fieldDoneAt && ` · site seen by ${r.fieldDoneBy.split(" ")[0]}`}
            {r.issuesPicked.length > 0 &&
              ` · ${r.issuesPicked.length} finding${r.issuesPicked.length > 1 ? "s" : ""}`}
          </div>
        </div>
      </div>
    </div>
  );
}
