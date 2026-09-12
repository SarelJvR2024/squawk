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
  IconClipboard,
  IconClock,
  IconDash,
  IconHelp,
  IconInfo,
  IconLeft,
  IconPin,
  IconRight,
  IconSpark,
  IconWand,
  IconX,
} from "@/components/ui/icons";
import { Btn, Chip, Panel, Pill } from "@/components/ui/primitives";

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
 *  Five options, and they were never five peers. Two of them are the audit's
 *  verdict on the asset; one is that verdict with the proof still outstanding;
 *  two are housekeeping — this check does not apply here, or ACSA could not
 *  produce the document while we were on site. Rendered as five identical
 *  boxes in a row, an auditor reads five equal choices and the shape of the
 *  decision is lost. So `group` splits them, and the qualifiers are drawn
 *  quieter than the verdicts.
 *
 *  ONE FLAT LIST ALL THE SAME, because both rows are filtered out of it. Two
 *  arrays would let the keyboard and the screen disagree about what a key
 *  means, which is the kind of drift nobody notices until an answer lands on
 *  the wrong check.
 *
 *  THE HOTKEY IS DECLARED, NOT THE POSITION IN THIS ARRAY. The first cut
 *  indexed the array, which put "compliant, evidence pending" on 2 and pushed
 *  Non-compliant to 3 — silently rewriting a shortcut an auditor has already
 *  learned, and the fastest way to file a wrong answer on a check. 1-4 keep
 *  exactly what they have always meant; the new option is additive on 5.
 *
 *  `pending` is not a fifth `Compliance` token — see Response.evidencePending
 *  in types.ts for why it is a flag on "C" instead. */
const STATUSES: {
  key: Compliance;
  /** True only for the "compliant, evidence pending" row. */
  pending?: boolean;
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
    key: "C",
    pending: true,
    hotkey: "5",
    /* Sarel's words for it: ACSA's explanation is that they are compliant, and
       it has to be verified when they submit the evidence. */
    label: "Compliant, evidence pending",
    short: "C · pending",
    Icon: IconClipboard,
    /* `acc` rather than `warn`. Not-available is already warn, and the two are
       the pair most worth telling apart: one is compliant-with-proof-to-come,
       the other is nothing produced at all. */
    tone: "acc",
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
  {
    key: "NV",
    hotkey: "4",
    label: "Not available",
    short: "NV",
    Icon: IconClock,
    tone: "warn",
    group: "qualifier",
  },
];

/** Which row is showing as chosen. The pending flag is part of the identity:
 *  "C" alone and "C" with evidence outstanding are two different answers and
 *  exactly one of them may look selected. */
const isOn = (
  s: (typeof STATUSES)[number],
  compliance: Compliance | null,
  evidencePending: boolean | undefined
) => compliance === s.key && !!s.pending === !!evidencePending;

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
const toneStyle = (tone: string, on: boolean, quiet = false): React.CSSProperties =>
  on
    ? {
        background: `var(--${tone}-bg)`,
        borderColor: `var(--${tone})`,
        color: `var(--${tone})`,
        boxShadow: `inset 0 0 0 1px var(--${tone})`,
      }
    : {
        background: quiet ? "transparent" : "var(--panel)",
        borderColor: quiet ? "var(--line)" : "var(--line-2)",
        color: quiet ? "var(--ink-3)" : "var(--ink-2)",
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
   *  carry falls back to the first one it does. */
  const [panel, setPanel] = useState("standard");
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
      /* Found by its declared hotkey, not by position — 1-4 are what they
         have always been and 5 is the new one. The flag is part of what the
         key sets: 5 is "C" plus the tag, and 1 is "C" without it. */
      const hit = STATUSES.find((x) => x.hotkey === e.key);
      if (hit) {
        const on = isOn(hit, r.compliance, r.evidencePending);
        setCompliance(check.id, on ? null : hit.key, !on && !!hit.pending);
      }
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    /* r.evidencePending belongs here: the handler decides whether a key
       toggles OFF from what is already selected, and "C" with the tag and "C"
       without it are two different selections. A stale flag here makes key 1
       or 2 clear the answer when it should switch between them. */
  }, [check.id, r.compliance, r.evidencePending, setCompliance, onNext, onPrev]);

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
  if (a) {
    panels.push({
      key: "evidence",
      label: "Evidence to request",
      badge: `${r.evidencePicked.length}/${a.EO.length}`,
      group: "do",
      body: (
        <>
          <div className="mb-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            tap what you asked for
          </div>
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
        </>
      ),
    });

    if (a.AO.length > 0)
      panels.push({
        key: "answers",
        label: "Likely answers",
        group: "do",
        body: (
          <>
            <div className="mb-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
              sets status &amp; seeds the note
            </div>
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
          </>
        ),
      });

    panels.push({
      key: "issues",
      label: "Issues found",
      /* Only when something was raised. A zero on every check would be noise
         on the one thing that must stand out when it is not zero. */
      ...(r.issuesPicked.length > 0 ? { badge: String(r.issuesPicked.length) } : {}),
      group: "do",
      body: (
        <>
          <div className="mb-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            raises a finding · suggests severity
          </div>
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

          {/* Root-cause advice for what this check has actually raised. It
              sits here, next to the issue chips, because this is the moment
              the auditor is still standing in front of the responsible person
              — the questions are only useful before everyone leaves the room.
              Same component as the findings screen. */}
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
              {/* And the other half of the same moment: what event does this
                  expose? Named here, it gives the hazard register something a
                  person wrote to consolidate from. */}
              <HazardAdvice
                finding={f}
                check={check}
                attachments={r.attachments}
                onAccept={(event) => {
                  updateFinding(f.id, { suggestedEvent: event });
                  onSaved(`Hazard noted · ${event}`);
                }}
              />

              {/* The four fields ACSA's dashboards carry, on the screen where
                  the issue was raised. The compliance session settles the
                  check, confirms last cycle's finding and captures the root
                  cause in ONE conversation with the responsible person in the
                  room. Making the auditor navigate away is how the second and
                  third get postponed and then never had.
                  Folded, because a check can raise several findings and an
                  open block each would bury the chips above it. The summary
                  line says what is outstanding, so nothing has to be opened to
                  find that out. */}
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
        </>
      ),
    });

    if (a.WO.length > 0)
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
                className="mb-2.5 rounded-[9px] border px-[10px] py-[8px]"
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

    if (a.OS.length > 0)
      panels.push({
        key: "snippets",
        label: "Snippets",
        group: "do",
        body: (
          <>
            <div className="mb-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
              tap to add to the note
            </div>
            <div className="chip-row flex flex-wrap gap-[5px]">
              {a.OS.map((sn, i) => (
                <Chip key={i} onClick={() => appendObservation(check.id, sn)}>
                  + {sn}
                </Chip>
              ))}
            </div>
          </>
        ),
      });
  } else if (check.optionCount > 0) {
    /* The library is fetched on first use, not bundled. The tab is declared
       now, holding a skeleton, so the strip does not gain a tab and jump the
       open panel sideways the moment the fetch lands. */
    panels.push({
      key: "evidence",
      label: "Evidence to request",
      group: "do",
      body: (
        <div aria-busy="true" aria-label="Loading the answer library">
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
      ),
    });
  } else {
    panels.push({
      key: "evidence",
      label: "Evidence to request",
      group: "do",
      body: (
        <Panel tone="warn">
          <div className="text-[12px]" style={{ color: "var(--warn)" }}>
            No researched options exist for this check yet — capture by typing.
          </div>
        </Panel>
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
    body: (
      <>
        {/* ACSA'S OWN WORDS FIRST, verbatim and in quotation marks where the
            register quotes them, with the document and clause that carry them.
            This is the only text on this screen that can be put to ACSA as
            their own. */}
        {check.acsaRequirement && (
          <div className="mb-2.5">
            <div className="label-xs" style={{ color: "var(--ink-4)" }}>
              What ACSA requires
              {check.acsaDocs.length > 0 &&
                ` · ${check.acsaDocs
                  .map((d) => `${d.doc}${d.clause ? ` cl. ${d.clause}` : ""}`)
                  .join("; ")}`}
            </div>
            <div className="mt-1 max-w-[92ch] text-[12.5px] leading-[1.55]">
              {check.acsaRequirement}
            </div>
          </div>
        )}

        <div className="label-xs">The standard to audit against · the register&rsquo;s own column</div>
        <div className="mt-1 max-w-[92ch] text-[13.5px] leading-[1.5] font-semibold">
          {check.target || "—"}
        </div>

        {check.siteVariant?.conflict ? (
          /* BOTH FIGURES, SIDE BY SIDE, AND THE CHECK IS NOT REWRITTEN.
             ACSA's register is the client's document. A row quietly edited to
             say something ACSA never wrote is a row nobody can reconcile
             against their own copy at the out-brief — so the check keeps its
             wording and the site's requirement sits beside it, labelled.
             The auditor decides against the one that governs here; the report
             can cite both. */
          <div
            className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
            style={{ background: "var(--bad-bg)", borderColor: "var(--bad-line)" }}
          >
            <div className="label-xs" style={{ color: "var(--bad)" }}>
              Conflict — the check and ACSA&rsquo;s own manual disagree at {check.siteVariant.site}
            </div>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              <div>
                <div className="label-xs" style={{ color: "var(--ink-3)" }}>
                  The check as written says
                </div>
                <div className="mt-[3px] text-[12.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                  {check.siteVariant.conflict.checkSays}
                </div>
              </div>
              <div>
                <div className="label-xs" style={{ color: "var(--bad)" }}>
                  {check.siteVariant.site} requires — this governs
                </div>
                <div className="mt-[3px] text-[12.5px] leading-[1.5] font-semibold" style={{ color: "var(--bad)" }}>
                  {check.siteVariant.conflict.siteRequires}
                </div>
              </div>
            </div>
            <div className="mt-1.5 font-mono text-[9.5px]" style={{ color: "var(--bad)" }}>
              {check.siteVariant.conflict.source}
              {check.siteVariant.conflict.direction === "stricter" &&
                " · auditing to the check as written would pass an installation this site's own manual says is overdue"}
              {check.siteVariant.conflict.direction === "looser" &&
                " · the check asks for more than ACSA requires here — see the evidence question before raising a finding"}
              {check.siteVariant.conflict.direction === "different" &&
                " · not stricter or looser, a different obligation — read both"}
            </div>
          </div>
        ) : check.siteVariant ? (
          /* 40 checks carry a threshold stricter than the network default at
             this site — 32 of them plain variants, the other 8 conflicts,
             handled in the branch above. It goes above ACSA's network wording,
             not in a tooltip — an auditor who reads the network figure and
             misses this one audits against the wrong standard. */
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
        ) : null}

        {/* WHAT MAKES IT COMPLIANT. Written for the 95 checks whose evidence
            column was a stub — "Test records", "Inspection; programme", nine
            of them empty — and for every check whose ACSA threshold fights its
            own wording. It sits directly under the standard, because it is the
            sentence the evidence gets held against. */}
        {check.complianceTest && (
          <div
            className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
            style={{ background: "var(--good-bg)", borderColor: "var(--good-line)" }}
          >
            <div className="label-xs" style={{ color: "var(--good)" }}>
              Compliant when — agreed in the register review, {check.confirmedBy?.toLowerCase()}
              {check.inspect === "reconcile"
                ? ", reconciled on the walk"
                : check.inspect === "examine"
                  ? ", seen on the walk"
                  : ", nothing to see on site"}
            </div>
            <div className="mt-1 max-w-[92ch] text-[12.5px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
              {check.complianceTest}
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
            <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--acc)" }}>
              {check.acsaThreshold}
            </div>
          </div>
        ) : (
          /* Silence on screen reads as "nothing to see here". It is the
             opposite: where ACSA's own documents set no threshold, there is no
             standard to audit against, and that is itself the finding. Say it,
             rather than leaving a gap the auditor has to notice. */
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
      </>
    ),
  });

  /* Reading a procedure back in plain English is the one thing on this screen
     a rule cannot do. It reads only this check's own fields — nothing it says
     is new information, and nothing it says is evidence. The tab is always
     here so the strip keeps its shape; what fills it depends on whether a
     model is configured. */
  panels.push({
    key: "plain",
    label: "In plain English",
    group: "read",
    body: (
      <>
        <div className="label-xs">
          In plain English{explained ? " · AI reading, not evidence" : ""}
        </div>
        {explained ? (
          <div className="relative">
            <div className="mt-1 max-w-[92ch] pr-6 text-[12.5px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
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
            style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            <IconSpark width={13} height={13} />
            {thinking === "explain" ? "Reading…" : "Explain this check"}
          </button>
        ) : (
          <div className="mt-1 text-[12px] leading-[1.55]" style={{ color: "var(--ink-3)" }}>
            No model is configured on this build, so there is no plain reading to offer here.
            ACSA&apos;s own wording is under ACSA wording.
          </div>
        )}
      </>
    ),
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

  if (check.basis)
    panels.push({
      key: "basis",
      label: "External basis",
      group: "read",
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
          <div className="mt-1 max-w-[92ch] text-[12.5px] leading-[1.55]" style={{ color: "var(--warn)" }}>
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
            off a 664px screen before the check has said anything. */}
        <div
          className="mb-[5px] flex flex-nowrap items-center gap-[7px] overflow-x-auto font-mono text-[10px] [&>*]:shrink-0 sm:flex-wrap sm:overflow-visible"
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
            return (
              <Pill key={m} tone={m === "Physical" ? "warn" : "accent"}>
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
            <Pill tone={check.confirmedBy === "Asset" ? "warn" : check.confirmedBy === "Practice" ? "accent" : "neutral"}>
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
        {/* THE REGISTER'S OWN CHECK TEXT, VERBATIM, AND LABELLED AS SUCH.
            `check.requirement` is the Rev A2 check-point wording — ACSA's
            words, not ours — and it is what a finding must cite. It was
            already the heading; what it did not say was whose it is, and on a
            screen that also carries our question, our evidence list and our
            suggested answers, "the biggest text on the page" is not the same
            as "attributed". Not summarised, not truncated, not title-cased. */}
        <div className="label-xs mb-[2px]" style={{ color: "var(--ink-4)" }}>
          ACSA check-point · the register&rsquo;s wording
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

      {/* THE TWO LINES THE CONVERSATION STARTS FROM, above the tabs and out
          of them. Everything else about this check is one tap away; these two
          are what the auditor says out loud and what they are there to
          collect, so they never move and are never behind a tab.

          The question is not clamped — half the register carries none at all
          and the longest runs to three lines, which is cheap next to reading
          only half of what you are about to ask. The evidence sentence is one
          line, because the longest runs to 606 characters; the whole of it is
          under ACSA wording, one press away, and the line says so. */}
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
                className={`min-w-0 max-w-[92ch] text-[13.5px] leading-[1.4] font-semibold${
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
              className="mt-[3px] flex w-full items-baseline gap-2 text-left"
            >
              <span className="label-xs shrink-0">Evidence</span>
              <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--ink-2)" }}>
                {evidenceLine}
              </span>
              <span
                className="shrink-0 font-mono text-[9px] tracking-[.04em] uppercase"
                style={{ color: "var(--acc)" }}
              >
                all of it
              </span>
            </button>
          )}
        </div>
      )}

      {/* ONE STRIP, TWO GROUPS. What the auditor does with this check, then
          what the auditor reads to do it — separated by a gap rather than a
          heading, because eleven pills under two headings is a heading per
          three pills.

          It wraps rather than scrolling sideways. The whole reason the counts
          are on the tabs is so nothing tapped is hidden — a strip that pushes
          the last two off the right edge hides them again, and a horizontal
          scrollbar is the least likely thing on the screen to be noticed. */}
      <div
        /* WRAPS from sm, and scrolls sideways below it. The counts are on the
           tabs so that nothing tapped is hidden by a closed panel, and a strip
           that pushes the last two off the right edge hides them again — so on
           anything with room, it wraps. A 390px phone has no such room: eleven
           pills wrap to five rows, and five rows of PINNED strip is most of
           what is left after the answer bar. */
        className="flex items-center gap-x-[14px] gap-y-[5px] overflow-x-auto border-b px-5 py-[8px] whitespace-nowrap sm:flex-wrap sm:overflow-visible"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        {(["acsa", "do", "read"] as const).map((group) => {
          const mine = panels.filter((t) => t.group === group);
          if (mine.length === 0) return null;
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
              className="flex shrink-0 gap-[5px] sm:flex-wrap"
            >
              {mine.map((t) => {
                const on = openKey === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={on}
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
      </div>

      {/* THE PANEL — the whole width, and from lg the whole leftover height,
          scrolling inside itself.

          `flex-1` only from lg, and that is a bug fix, not a tidy-up. From lg
          the panel scrolls inside itself, so it must take the leftover height
          and stop — that is what flex-1 with min-h-0 does. Below lg the whole
          screen scrolls and the panel has to be as tall as its content;
          flex-1 gave it the leftover height instead, its content spilled out
          of a short box, and the sticky bar — which can only stick within its
          parent's content box — came to rest in the MIDDLE of the screen. */}
      <div
        role="tabpanel"
        data-panel={openKey}
        /* No deep bottom padding at lg any more: the panel is its own
           scroller and the pinned bar is a sibling below it, not something
           floating over its last line. Below lg the whole screen scrolls and
           the bar is the last thing in it, so the same holds. */
        className="px-5 pt-[13px] pb-[18px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        style={{ background: open.group === "do" ? "var(--focus-surface)" : "var(--sunken)" }}
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

                 pr-[124px] keeps the text clear of the icon cluster. The
                 padding is on the RIGHT rather than the bottom because the box
                 is 44px at rest — a bottom gutter would leave a single line of
                 writing nowhere to sit. */
              className="max-h-[26vh] min-h-[44px] w-full resize-y rounded-[11px] border py-2 pr-[124px] pl-3 text-[12.5px] leading-[1.55] outline-none transition-[var(--t)] focus:min-h-[112px] focus:border-[var(--acc)] sm:min-h-[68px] sm:py-2.5"
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
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border transition-[var(--t)] active:translate-y-[1px]"
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
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border transition-[var(--t)] active:translate-y-[1px] disabled:opacity-40"
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
             may not shrink. The gaps give back what the third row costs. */
          className="flex flex-wrap items-center gap-x-3 gap-y-[6px] border-t px-5 py-2 sm:gap-y-2 sm:py-2.5"
          style={{
            background: "var(--panel)",
            borderColor: "var(--line)",
            paddingBottom: "calc(0.5rem + var(--sticky-safe))",
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
          {/* WRITING IT DOWN AND ANSWERING IT, IN ONE BAR.

              These four used to be their own row above the observation field,
              which put a band of 31-44px controls between the box you type in
              and the buttons that answer the check — three stacked strips of
              furniture where two would do. They belong beside the answer: on a
              phone they are one row above the compliance buttons, on a desk
              they sit inline with them.

              IT STILL SCROLLS SIDEWAYS RATHER THAN WRAPPING on a phone, which
              is the same reasoning as before the move: at 44px a wrapped
              toolbar is a second 50px band taken off a 664px screen for the
              whole session, and this bar already spends a third of it.
              Sideways it costs nothing and every label stays the length it
              needs to be. */}
          {/* Compose, Draft and the mic moved INTO the observation box above —
              see the note there. What is left is the one control that has to
              stay a proper 44px target, and the pills saying what is attached. */}
          <div className="no-scrollbar flex flex-nowrap items-center gap-[6px] overflow-x-auto sm:overflow-visible [&>*]:shrink-0">
            <PhotoButton
              onCaptured={(m) => {
                addAttachment(check.id, { ...m, createdBy: auditor });
                onSaved(`Photo attached to ${portalId}`);
              }}
            />
            {/* What is already attached. The label row above the observation
                says the same thing and is desk-only, so on a phone these pills
                are the only place it is said. */}
            {photos > 0 && (
              <Pill>
                {photos} photo{photos > 1 ? "s" : ""}
              </Pill>
            )}
            {voice && <Pill tone="accent">voice note</Pill>}
          </div>

          {/* THE VERDICT, THEN THE THINGS THAT ARE NOT A VERDICT.
              Two rows, at every width, and grids rather than a wrapping flex
              row so they stay that way — as a single wrapping row these broke
              two-and-two the moment the capture tools joined this bar, which
              reads as a rendering fault rather than a choice.

              Splitting them is not a layout trick to fit five across 390px
              (though it does that too). It is the decision's actual shape: the
              top row is what the audit concludes about the asset, the bottom
              row is this check not applying here and ACSA not producing the
              document while we were on site. Five identical boxes said those
              were the same kind of answer. */}
          <div className="flex min-w-[280px] flex-1 flex-col gap-[5px]">
            <div className="grid grid-cols-3 gap-[5px]">
              {STATUSES.filter((x) => x.group === "verdict").map((st) => {
                const on = isOn(st, r.compliance, r.evidencePending);
                return (
                  <button
                    key={st.label}
                    onClick={() =>
                      setCompliance(check.id, on ? null : st.key, !on && !!st.pending)
                    }
                    /* The full phrase, always, to a screen reader — the phone
                       shows the code to fit the targets across 390px, and "C"
                       read out loud is not an answer anybody should have to
                       decode. */
                    aria-label={st.label}
                    aria-pressed={on}
                    title={st.label}
                    className="flex min-h-[44px] items-center justify-center gap-[6px] rounded-[10px] border-[1.5px] px-[7px] font-display text-[11px] font-semibold whitespace-nowrap transition-[var(--t)] sm:px-[10px] sm:text-[11.5px]"
                    style={toneStyle(st.tone, on)}
                  >
                    <st.Icon width={14} height={14} />
                    {/* ACSA's own code on a phone, the words everywhere else.
                        C, NC, N/A and NV are not abbreviations invented here:
                        they are what the record stores and what the export
                        column says. */}
                    <span className="sm:hidden">{st.short}</span>
                    <span className="hidden sm:inline">{st.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Drawn quieter — transparent, a lighter border, muted text —
                because reaching for one of these is saying there is nothing to
                assess, and that should not compete with the answer above it. */}
            <div className="grid grid-cols-2 gap-[5px]">
              {STATUSES.filter((x) => x.group === "qualifier").map((st) => {
                const on = isOn(st, r.compliance, r.evidencePending);
                return (
                  <button
                    key={st.label}
                    onClick={() => setCompliance(check.id, on ? null : st.key)}
                    aria-label={st.label}
                    aria-pressed={on}
                    title={st.label}
                    className="flex min-h-[44px] items-center justify-center gap-[6px] rounded-[10px] border px-[7px] font-display text-[11px] font-semibold whitespace-nowrap transition-[var(--t)] sm:px-[10px]"
                    style={toneStyle(st.tone, on, true)}
                  >
                    <st.Icon width={13} height={13} />
                    <span className="sm:hidden">{st.short}</span>
                    <span className="hidden sm:inline">{st.label}</span>
                  </button>
                );
              })}
            </div>
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
