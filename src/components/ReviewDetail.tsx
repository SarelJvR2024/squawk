"use client";

/** A reviewer's own view of one check — not the editing workspace Capture and
 *  Field already use (CheckDetail.tsx), which /review reused outright since
 *  13 October 2026. Sarel, after trying that: "this section is confusing...
 *  i dont need all the policy references etc. i want to see the observations
 *  from the audit checks, what evidence was provided and what the comments
 *  and compliance is for the evidence and then all the photos and the photo
 *  notes all linked to the audit check."
 *
 *  So, deliberately NOT here: the ACSA requirement/wording panels, the
 *  register's walkabout instructions, the 2025 prior-finding reference, the
 *  Findings panel. A reviewer reading this already knows what the check
 *  asks; this screen is about what THIS audit found and photographed for it.
 *
 *  THE PHOTO GALLERY IS NEW. CheckDetail never cards a photograph anywhere —
 *  it only counts them, having deliberately pushed photo display off that
 *  screen on 13 October 2026 (see its own history). AttachmentStrip
 *  (Capture.tsx) already renders a full photo card — thumbnail, caption,
 *  location, AI caption — whenever it is NOT given a photo-filtered list;
 *  CheckDetail always filters photos out before handing it attachments. This
 *  is the one screen that does not.
 *
 *  STICKY HEADER + COMPLIANCE STRIP, 15 Oct 2026. Sarel: "keep the audit
 *  check description on top even when i scroll. also have the 3 compliance
 *  checks on top even when scrolling for (audit check, evidence, site
 *  inspection) and then a combined compliance of the 3." The three axes are
 *  `Response.compliance` (the check as a whole), `evidenceVerdict` (what the
 *  evidence shows — already existed) and the new `siteInspection` (what was
 *  physically seen on site — see its own doc comment in types.ts). The
 *  combined cell is DERIVED (reviewCombinedCompliance in src/lib/review.ts),
 *  worst of the three, never stored, and stays a read-only Pill.
 *
 *  THE THREE AXES BECAME EDITABLE RIGHT HERE, 20 Oct 2026. Sarel: "the user
 *  must be able to change them on that screen on the top to make it easy to
 *  review and update." Until now these three were read-only mirrors of
 *  controls elsewhere — evidence verdict and site inspection further down
 *  this same screen, the check's own compliance only on Capture/Field — so
 *  changing any of them while reviewing meant either a long scroll or
 *  leaving this screen entirely. Each cell is now a `<select>` in place of
 *  the old Pill, writing through the exact same actions its matching
 *  section further down already uses (`setCompliance` for the audit check,
 *  `patch` for the other two) — one more place to change from, not a second
 *  copy of the decision.
 *
 *  EVIDENCE REQUESTED / RECEIVED, same date. Requested is the register's own
 *  `check.evidenceExpected`/`acsaEvidence` (CheckDetail already shows this as
 *  its own "evidence line" — this screen never had it); received is what
 *  this audit actually attached, same AttachmentStrip as before, relabelled
 *  and counted so the two sit side by side rather than one being implicit. */

import { useMemo, useState } from "react";
import { disciplinesAt, useResponses, useStore } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import { reviewCombinedCompliance } from "@/lib/review";
import { AttachmentStrip, FileButton, PhotoButton, VoiceNoteButton } from "@/components/Capture";
import RelinkPhotoSheet from "@/components/RelinkPhotoSheet";
import {
  EVIDENCE_STATUSES,
  EVIDENCE_VERDICTS,
  STATUSES,
  toneStyle,
} from "@/components/CheckDetail";
import { Btn, Dot, Empty, type Tone } from "@/components/ui/primitives";
import { IconCheck, IconFlag, IconLeft, IconRight } from "@/components/ui/icons";
import type { Attachment, Check, Compliance } from "@/lib/types";

/** Same mapping CheckDetail's own pinned header uses for `compliance`
 *  (CheckDetail.tsx) — kept here rather than imported so this file's three
 *  compliance cells (and the derived combined one) all read it one way. */
const complianceTone = (v: Compliance | null): Tone =>
  v === "NC" ? "bad" : v === "C" ? "good" : v === "NV" ? "warn" : "neutral";

/** The three editable cells' own option lists, trimmed to what a `<select>`
 *  needs — the full `STATUSES`/`EVIDENCE_VERDICTS` entries also carry an
 *  icon, a hotkey and a short code the button grids further down the screen
 *  need and a dropdown option does not. */
const COMPLIANCE_OPTIONS = STATUSES.map((s) => ({ key: s.key, label: s.label }));
const VERDICT_OPTIONS = EVIDENCE_VERDICTS.map((v) => ({ key: v.key, label: v.label }));

/** Every `Compliance` value's full word, for the one cell (Combined) that is
 *  never a `<select>` and so never gets its word from an `<option>` the way
 *  the other three do. Built from the same two option lists above rather
 *  than a parallel set of strings, so Combined can never show a word the
 *  editable cells do not already use for the same value. Covers all four —
 *  `COMPLIANCE_OPTIONS` carries C/NC/N/A, `VERDICT_OPTIONS` adds NV. */
const COMPLIANCE_LABELS = Object.fromEntries(
  [...COMPLIANCE_OPTIONS, ...VERDICT_OPTIONS].map((o) => [o.key, o.label])
) as Record<Compliance, string>;

/** ONE SLIM STATUS LINE, NOT FOUR BOXED DROPDOWNS — Sarel's second
 *  visual-hierarchy pass, item 5: "On the check screen, replace the four
 *  boxed status dropdowns across the top (Audit check / Evidence / Site
 *  inspection / Combined) with one slim inline status line — small text
 *  with colored dots, not form controls. The actual input controls below
 *  stay exactly as they are."
 *
 *  Each of these four used to be its own bordered, sunken box holding a
 *  `<select>` (three of them) or a `<Pill>` (Combined) — a second, fully
 *  editable copy of `compliance`/`evidenceVerdict`/`siteInspection` sitting
 *  above the identical button grids this same screen already renders for
 *  each axis (Audit check compliance, the Evidence verdict row, Site
 *  inspection, further down). This is now a read-only summary of the same
 *  three fields — a Dot and the word, no box, no `<select>` — and the
 *  button grids below are UNCHANGED: still the one place each axis is
 *  actually set, still calling the exact same `setCompliance`/`patch`
 *  actions. Nothing editable was removed; only the second, redundant way
 *  to edit it from up here. */
function StatusCell({
  label,
  value,
  partial,
  emptyLabel = "Not yet",
}: {
  label: string;
  value: Compliance | null;
  partial?: boolean;
  /** Evidence and Site inspection pass "Not verified" — Sarel: "not yet
   *  should be not verified," since on those two axes "nobody has looked
   *  at this yet" and "this could not be verified" are the same practical
   *  fact. The Audit check cell keeps the plain default. */
  emptyLabel?: string;
}) {
  const word = value ? COMPLIANCE_LABELS[value] : emptyLabel;
  return (
    <span className="flex items-center gap-[6px]">
      <Dot tone={complianceTone(value)} label={`${label}: ${word}`} />
      <span className="text-[11.5px] font-semibold whitespace-nowrap" style={{ color: "var(--ink)" }}>
        {label}
      </span>
      <span className="text-[11.5px] whitespace-nowrap" style={{ color: "var(--ink-3)" }}>
        {word}
      </span>
      {partial && (
        <span
          className="h-[5px] w-[5px] shrink-0 rounded-full"
          style={{ background: "var(--warn)" }}
          title="Not every axis has been reviewed yet"
        />
      )}
    </span>
  );
}

export default function ReviewDetail({
  check,
  onPrev,
  onNext,
}: {
  check: Check;
  onPrev: () => void;
  onNext: () => void;
}) {
  const r = useResponses()[check.id];
  const entityCode = useStore((s) => s.entity);
  const auditor = useStore((s) => s.auditor);
  const visitId = useStore((s) => s.visit);
  const patch = useStore((s) => s.patch);
  const setCompliance = useStore((s) => s.setCompliance);
  const addAttachment = useStore((s) => s.addAttachment);
  const updateAttachment = useStore((s) => s.updateAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const moveAttachment = useStore((s) => s.moveAttachment);
  const addFinding = useStore((s) => s.addFinding);

  /* The photo currently open in the "move it to a different check" sheet —
   *  Review is the one screen a mis-filed photo is actually spotted on
   *  (every check's evidence sits side by side here), so this is the one
   *  screen that offers it. See RelinkPhotoSheet's own doc comment. */
  const [movingPhoto, setMovingPhoto] = useState<Attachment | null>(null);

  /* RAISE A FINDING, WITHOUT LEAVING REVIEW — Sarel: "add a section to
   *  capture a new inspection issue, same fields as capturing it in other
   *  areas of the app and add photo etc." Same shape and the same
   *  `addFinding` call RaiseFindingSheet.tsx and AddItemSheet.tsx's own
   *  raiseFinding already use (checkId, discipline, system, title,
   *  description, issueIndex null, severity/likelihood null,
   *  ratingConfirmed false, rootCause empty, actions empty, actionStatus
   *  "Open", adHoc true) — a fourth capture path for the same kind of
   *  record, not a different one. checkId is always THIS check: a reviewer
   *  reading one check-point's evidence is exactly who spots a new issue
   *  tied to it, and RaiseFindingSheet's own check-point search would only
   *  be finding its way back to the check already on screen. Discipline and
   *  asset system default to the check's own — same convenience
   *  RaiseFindingSheet gives once a check is picked there — but stay
   *  editable, since the issue found while reviewing one check can
   *  genuinely be about a related system. Photo/voice/file capture writes
   *  into THIS check's own Response.attachments via the same `addAttachment`
   *  action and AttachmentStrip the "Evidence received" section above
   *  already uses — a finding has no attachments field of its own anywhere
   *  in this app (see Finding in types.ts); every screen that shows a
   *  finding's photos reads them off the check (or ad-hoc item) it is tied
   *  to, and this keeps that the one rule rather than inventing a second. */
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDiscipline, setNewDiscipline] = useState(check.discipline);
  const [newSystem, setNewSystem] = useState(check.system);
  const [newError, setNewError] = useState<string | null>(null);
  const [newSaved, setNewSaved] = useState<string | null>(null);
  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);

  const raiseFinding = () => {
    const title = newTitle.trim();
    if (!title) {
      setNewError("Say what you found. It is the one thing this cannot default.");
      return;
    }
    const id = addFinding({
      checkId: check.id,
      discipline: newDiscipline,
      system: newSystem,
      area: "",
      title,
      description: newDescription.trim() || title,
      issueIndex: null,
      severity: null,
      likelihood: null,
      ratingConfirmed: false,
      rootCause: "",
      actions: [],
      actionStatus: "Open",
      originVisit: visitId,
      priorRating: null,
      suggestedEvent: "",
      progress: [],
      adHoc: true,
      createdBy: auditor,
    });
    setNewTitle("");
    setNewDescription("");
    setNewError(null);
    setNewSaved(`${id} raised, tied to this check`);
    setTimeout(() => setNewSaved(null), 2600);
  };

  const combined = r ? reviewCombinedCompliance(r.compliance, r.evidenceVerdict, r.siteInspection) : null;
  const combinedPartial = !!r && [r.compliance, r.evidenceVerdict, r.siteInspection].some((v) => v === null);

  const evidenceRequested =
    check.evidenceExpected || (check.acsaEvidence.length > 0 ? check.acsaEvidence.join(" · ") : "");

  return (
    <div className="app-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
      {/* EVERYTHING THAT MUST NOT MOVE: which check this is, its full wording,
          and the four-cell compliance strip. See the file header for why. */}
      <div
        className="sticky top-0 z-[6] border-b px-5 pt-[11px] pb-2.5"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div className="mx-auto w-full max-w-[760px]">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10.5px]" style={{ color: "var(--ink-4)" }}>
              {portalIdFor(entityCode, check.id)}
            </span>
            <span className="ml-auto flex gap-[6px]">
              <Btn icon onClick={onPrev} aria-label="Previous check">
                <IconLeft width={13} height={13} />
              </Btn>
              <Btn icon onClick={onNext} aria-label="Next check">
                <IconRight width={13} height={13} />
              </Btn>
            </span>
          </div>
          <h2 className="mb-2.5 text-[15.5px] font-bold leading-snug">{check.requirement}</h2>
          {r && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <StatusCell label="Audit check" value={r.compliance} />
              <StatusCell label="Evidence" value={r.evidenceVerdict} emptyLabel="Not Verified" />
              <StatusCell label="Site inspection" value={r.siteInspection} emptyLabel="Not Verified" />
              <StatusCell label="Combined" value={combined} partial={combinedPartial} />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-5 py-5">
        {!r ? (
          <Empty>Not captured yet.</Empty>
        ) : (
          <div className="flex flex-col gap-5">
            {/* FIRST SECTION, DELIBERATELY — Sarel: "make sure the audit check
                observation notes is the first section on the review section."
                Labelled "Audit check observation", not "Inspection notes" —
                this is `Response.observation`, the auditor's own write-up for
                THIS check, and "Inspection" already names a separate screen
                and a separate compliance axis (`fieldCompliance`, see its own
                doc comment in types.ts); keeping the old label here invited
                exactly that confusion. */}
            <section>
              <div className="label-xs mb-1.5">Audit check observation</div>
              <textarea
                value={r.observation}
                onChange={(e) => patch(check.id, { observation: e.target.value })}
                placeholder="What was observed"
                aria-label="Audit check observation"
                className="min-h-[96px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[13px] outline-none focus:border-[var(--acc)]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />

              {/* THE AUDIT CHECK'S OWN COMPLIANCE, AS BUTTONS — Sarel: "add
                  the compliance buttons for the audit check." Evidence and
                  Site inspection already get a button grid further down this
                  screen; the audit check's own verdict (`Response.compliance`,
                  the sticky strip's first cell) only had a `<select>` there
                  and no button grid in the body at all. Same STATUSES array
                  and the same `setCompliance` action CheckDetail's own grid
                  and the sticky cell above both already use — one more place
                  to set it from, not a second copy of the value. */}
              <div className="mt-3">
                <div className="label-xs mb-1.5">Audit check compliance</div>
                <div className="grid grid-cols-3 gap-[6px]">
                  {STATUSES.map((st) => {
                    const on = r.compliance === st.key;
                    const quiet = st.group === "qualifier";
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setCompliance(check.id, on ? null : st.key)}
                        aria-pressed={on}
                        title={st.label}
                        className={`flex min-h-[40px] items-center justify-center gap-[6px] rounded-[9px] text-[11.5px] font-semibold transition-[var(--t)] active:translate-y-[1px] ${quiet ? "border" : "border-[1.5px]"}`}
                        style={toneStyle(st.tone, on, quiet)}
                      >
                        <st.Icon width={13} height={13} />
                        {st.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section>
              <div className="label-xs mb-1.5">Evidence</div>

              {evidenceRequested && (
                <div
                  className="mb-2.5 rounded-[8px] border px-[10px] py-[7px] text-[12px] leading-[1.5]"
                  style={{ background: "var(--sunken)", borderColor: "var(--line)", color: "var(--ink-2)" }}
                >
                  <span className="label-xs mr-1.5" style={{ color: "var(--ink-4)" }}>
                    Evidence requested
                  </span>
                  {evidenceRequested}
                </div>
              )}

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

              <div className="mt-3">
                <div className="label-xs mb-1.5">
                  Evidence received{" "}
                  {r.attachments.length > 0 && (
                    <span className="font-mono" style={{ color: "var(--ink-4)" }}>
                      · {r.attachments.length}
                    </span>
                  )}
                </div>
                {r.attachments.length === 0 ? (
                  <Empty>No photos, voice notes or files received yet.</Empty>
                ) : (
                  <AttachmentStrip
                    attachments={r.attachments}
                    onRemove={(id) => removeAttachment(check.id, id)}
                    onUpdate={(id, p) => updateAttachment(check.id, id, p)}
                    onMove={(id) =>
                      setMovingPhoto(r.attachments.find((a) => a.id === id) ?? null)
                    }
                  />
                )}
              </div>

              <div className="mt-3">
                <div className="label-xs mb-1.5">What the evidence proves</div>
                <textarea
                  value={r.evidenceProves}
                  onChange={(e) => patch(check.id, { evidenceProves: e.target.value })}
                  placeholder="What the document or record actually shows"
                  aria-label="What the evidence proves"
                  className="min-h-[72px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[13px] outline-none focus:border-[var(--acc)]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                />
              </div>

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
            </section>

            {/* THE THIRD AXIS. Same three-way shape as Evidence's own verdict
                above (reuses EVIDENCE_VERDICTS, not a parallel set), a
                different question: not what the evidence says, but whether
                the physical site, as seen on the walk, matches it. See
                Response.siteInspection's own doc comment in types.ts. */}
            <section>
              <div className="label-xs mb-1.5">Site inspection</div>
              <div className="mb-1.5 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                Does what was physically seen on site match what was captured?
              </div>
              <div className="grid grid-cols-4 gap-[6px]">
                {EVIDENCE_VERDICTS.map((v) => {
                  const on = r.siteInspection === v.key;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => patch(check.id, { siteInspection: on ? null : v.key })}
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
            </section>

            {/* THE REVIEWER'S OWN SIGN-OFF. A separate question from
                `compliance` (what the asset is) and `evidenceStatus` (whether
                proof exists): is the RECORD itself done — right observation,
                right compliance, right evidence, agreeing with each other —
                and fit to go in front of the client. Two states, same
                toggle-then-note shape as Evidence status above it — tapping
                the chosen one again clears it back to "not yet reviewed"
                rather than forcing a third button for that. */}
            <section>
              <div className="label-xs mb-1.5">Review status</div>
              <div className="grid grid-cols-2 gap-[6px]">
                {(
                  [
                    ["approved", "good", IconCheck, "Approved for client"],
                    ["changesRequired", "warn", IconFlag, "Changes required"],
                  ] as const
                ).map(([key, tone, Icon, label]) => {
                  const on = r.reviewStatus === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        patch(check.id, {
                          reviewStatus: on ? null : key,
                          reviewStatusBy: on ? r.reviewStatusBy : auditor,
                          reviewStatusAt: on ? r.reviewStatusAt : Date.now(),
                        })
                      }
                      aria-pressed={on}
                      className="flex min-h-[40px] items-center justify-center gap-[6px] rounded-[9px] border text-[11.5px] font-semibold transition-[var(--t)] active:translate-y-[1px]"
                      style={toneStyle(tone, on)}
                    >
                      <Icon width={14} height={14} />
                      {label}
                    </button>
                  );
                })}
              </div>

              {r.reviewStatus === "changesRequired" && (
                <div className="mt-2.5">
                  <div className="label-xs mb-1.5">What has to change before this is approved</div>
                  <textarea
                    value={r.reviewStatusNote ?? ""}
                    onChange={(e) => patch(check.id, { reviewStatusNote: e.target.value })}
                    rows={3}
                    aria-label="What has to change before this check is approved"
                    placeholder="e.g. the observation doesn't match the compliance verdict, evidence is still outstanding"
                    className="w-full resize-y rounded-[11px] border px-3 py-2.5 text-[13px] outline-none focus:border-[var(--acc)]"
                    style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                  />
                </div>
              )}

              {r.reviewStatusBy && (
                <div className="mt-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                  {r.reviewStatus === "approved" ? "Approved" : "Marked for changes"} by {r.reviewStatusBy}
                  {r.reviewStatusAt ? ` · ${new Date(r.reviewStatusAt).toLocaleString("en-ZA")}` : ""}
                </div>
              )}
            </section>

            {/* RAISE A FINDING WITHOUT LEAVING REVIEW — see the state/handler
                above this component for the full reasoning. Last section,
                deliberately: everything above is reading and rating what
                this audit already recorded; this is the one place on the
                screen that adds something new. */}
            <section>
              <div className="label-xs mb-1.5">Raise a finding</div>
              <div className="mb-1.5 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                A new issue spotted while reviewing this check — tied to it automatically.
              </div>

              <label className="block">
                <span className="font-display text-[11px] font-semibold">What you found</span>
                <textarea
                  value={newTitle}
                  onChange={(e) => {
                    setNewError(null);
                    setNewTitle(e.target.value);
                  }}
                  placeholder="A short headline — e.g. Fire extinguisher past its service date"
                  aria-label="What you found"
                  className="mt-1 min-h-[52px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[13px] outline-none focus:border-[var(--acc)]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                />
              </label>

              <label className="mt-3 block">
                <span className="font-display text-[11px] font-semibold">Description · optional</span>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Anything else worth recording — defaults to the headline above if left blank"
                  aria-label="Description"
                  className="mt-1 min-h-[64px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[13px] outline-none focus:border-[var(--acc)]"
                  style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                />
              </label>

              {newError && (
                <div className="mt-2 text-[11.5px]" style={{ color: "var(--warn)" }}>
                  {newError}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="font-display text-[11px] font-semibold">Discipline</span>
                  <select
                    value={newDiscipline}
                    onChange={(e) => setNewDiscipline(e.target.value)}
                    aria-label="Discipline"
                    className="mt-1 w-full rounded-[11px] border px-3 py-2.5 text-[13px] outline-none"
                    style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                  >
                    {disciplines.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="font-display text-[11px] font-semibold">Asset system</span>
                  <input
                    value={newSystem}
                    onChange={(e) => setNewSystem(e.target.value)}
                    aria-label="Asset system"
                    className="mt-1 w-full rounded-[11px] border px-3 py-2.5 text-[13px] outline-none"
                    style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
                  />
                </label>
              </div>

              {/* Same photo/voice/file capture as "Evidence received" above —
                  into the SAME check.attachments, because a finding reads its
                  photos off the check it is tied to rather than carrying any
                  of its own. Not re-rendered as a second strip here — one
                  photo card showing twice on the one screen would read as two
                  photographs. It lands in "Evidence received" above,
                  immediately. */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                  {r.attachments.length > 0
                    ? "Adds to Evidence received above."
                    : "Adds to this check's evidence."}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <PhotoButton
                    compact
                    onCaptured={(m) => addAttachment(check.id, { ...m, createdBy: auditor })}
                  />
                  <VoiceNoteButton
                    compact
                    onCaptured={(m) => addAttachment(check.id, { ...m, createdBy: auditor })}
                  />
                  <FileButton
                    compact
                    onCaptured={(m) => addAttachment(check.id, { ...m, createdBy: auditor })}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2.5">
                <Btn variant="primary" onClick={raiseFinding} style={{ minHeight: 44 }}>
                  Raise it
                </Btn>
                {newSaved && (
                  <span className="text-[11.5px] font-semibold" style={{ color: "var(--good)" }}>
                    {newSaved}
                  </span>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <RelinkPhotoSheet
        open={!!movingPhoto}
        onClose={() => setMovingPhoto(null)}
        photo={movingPhoto}
        fromCheckId={check.id}
        onConfirm={(toCheckId) => {
          if (movingPhoto) moveAttachment(check.id, movingPhoto.id, toCheckId);
        }}
      />
    </div>
  );
}
