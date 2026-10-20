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

import { useResponses, useStore } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import { reviewCombinedCompliance } from "@/lib/review";
import { AttachmentStrip } from "@/components/Capture";
import {
  EVIDENCE_STATUSES,
  EVIDENCE_VERDICTS,
  STATUSES,
  toneStyle,
} from "@/components/CheckDetail";
import { Btn, Empty, Pill, type Tone } from "@/components/ui/primitives";
import { IconCheck, IconFlag, IconLeft, IconRight } from "@/components/ui/icons";
import type { Check, Compliance } from "@/lib/types";

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

/** Same CSS-variable tones `toneStyle` (CheckDetail.tsx) takes, not the
 *  `Tone` union `Pill` takes — "neu"/"acc" rather than "neutral"/"accent" —
 *  so a cell's `<select>` reads in exactly the colour its own section
 *  further down the screen already shows for the same value. `null` keeps
 *  the cell's own sunken, unanswered look rather than any tone at all. */
function selectStyle(value: Compliance | null): React.CSSProperties {
  if (!value) return { background: "var(--sunken)", borderColor: "var(--line)", color: "var(--ink-2)" };
  const tone = value === "NC" ? "bad" : value === "C" ? "good" : value === "NV" ? "warn" : "neu";
  return toneStyle(tone, true);
}

/** One cell of the sticky strip. Three of the four — audit check, evidence,
 *  site inspection — take `options`/`onChange` and render a `<select>` that
 *  writes straight through to the same action its own section further down
 *  this screen (or, for the audit check, Capture/Field) already calls, so
 *  there is no second copy of the value to keep in sync. The fourth,
 *  Combined, is derived and never passes them, so it stays the plain
 *  read-only Pill it always was — showing the full word (COMPLIANCE_LABELS),
 *  not the stored code: Sarel, 20 Oct 2026, after the strip's three `<select>`
 *  cells shipped already spelling theirs out, "fix the combined compliance,
 *  it must be a word not an abbreviation or a concatenation" — the Pill was
 *  still printing the raw "NC" the record stores, with a literal " ·"
 *  appended when the review was still partial. `partial` now marks that with
 *  a small corner dot outside the word (plus the same title and an sr-only
 *  note) rather than punctuation glued onto the end of it, so the word
 *  itself is never anything but the word. */
function ComplianceCell({
  label,
  value,
  partial,
  options,
  onChange,
}: {
  label: string;
  value: Compliance | null;
  partial?: boolean;
  options?: { key: Compliance; label: string }[];
  onChange?: (next: Compliance | null) => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-[3px] rounded-[8px] border px-[4px] py-[6px] text-center"
      style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
    >
      <span className="label-xs leading-tight" style={{ color: "var(--ink-4)" }}>
        {label}
      </span>
      {options && onChange ? (
        <select
          aria-label={label}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as Compliance))}
          className="min-h-[30px] w-full rounded-full border px-1.5 py-[2px] text-center font-mono text-[9.5px] font-semibold outline-none"
          style={selectStyle(value)}
        >
          <option value="">— not yet</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="relative inline-flex">
          <Pill tone={complianceTone(value)} title={partial ? "Not every axis has been reviewed yet" : undefined}>
            {value ? COMPLIANCE_LABELS[value] : "Not yet"}
            {partial && <span className="sr-only"> — not every axis reviewed yet</span>}
          </Pill>
          {partial && (
            <span
              aria-hidden="true"
              className="absolute -top-[3px] -right-[3px] h-[6px] w-[6px] rounded-full"
              style={{ background: "var(--warn)" }}
            />
          )}
        </span>
      )}
    </div>
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
  const patch = useStore((s) => s.patch);
  const setCompliance = useStore((s) => s.setCompliance);
  const updateAttachment = useStore((s) => s.updateAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);

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
            <div className="grid grid-cols-4 gap-[6px]">
              <ComplianceCell
                label="Audit check"
                value={r.compliance}
                options={COMPLIANCE_OPTIONS}
                onChange={(v) => setCompliance(check.id, v)}
              />
              <ComplianceCell
                label="Evidence"
                value={r.evidenceVerdict}
                options={VERDICT_OPTIONS}
                onChange={(v) => patch(check.id, { evidenceVerdict: v })}
              />
              <ComplianceCell
                label="Site inspection"
                value={r.siteInspection}
                options={VERDICT_OPTIONS}
                onChange={(v) => patch(check.id, { siteInspection: v })}
              />
              <ComplianceCell label="Combined" value={combined} partial={combinedPartial} />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-5 py-5">
        {!r ? (
          <Empty>Not captured yet.</Empty>
        ) : (
          <div className="flex flex-col gap-5">
            <section>
              <div className="label-xs mb-1.5">Inspection notes</div>
              <textarea
                value={r.observation}
                onChange={(e) => patch(check.id, { observation: e.target.value })}
                placeholder="What was observed"
                aria-label="Inspection notes"
                className="min-h-[96px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[13px] outline-none focus:border-[var(--acc)]"
                style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
              />
            </section>

            <section>
              <div className="label-xs mb-1.5">Evidence</div>

              {evidenceRequested && (
                <div
                  className="mb-2.5 rounded-[9px] border px-[10px] py-[7px] text-[12px] leading-[1.5]"
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
                      className="flex min-h-[40px] flex-col items-center justify-center gap-[3px] rounded-[9px] border px-[6px] py-[6px] text-center text-[10.5px] font-semibold leading-tight transition-[var(--t)]"
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

              <div className="mt-2 grid grid-cols-3 gap-[6px]">
                {EVIDENCE_VERDICTS.map((v) => {
                  const on = r.evidenceVerdict === v.key;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => patch(check.id, { evidenceVerdict: on ? null : v.key })}
                      aria-pressed={on}
                      className="flex min-h-[40px] items-center justify-center gap-[6px] rounded-[9px] border text-[11.5px] font-semibold transition-[var(--t)]"
                      style={toneStyle(v.tone, on)}
                    >
                      <v.Icon width={13} height={13} />
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
              <div className="grid grid-cols-3 gap-[6px]">
                {EVIDENCE_VERDICTS.map((v) => {
                  const on = r.siteInspection === v.key;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => patch(check.id, { siteInspection: on ? null : v.key })}
                      aria-pressed={on}
                      className="flex min-h-[40px] items-center justify-center gap-[6px] rounded-[9px] border text-[11.5px] font-semibold transition-[var(--t)]"
                      style={toneStyle(v.tone, on)}
                    >
                      <v.Icon width={13} height={13} />
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
                      className="flex min-h-[40px] items-center justify-center gap-[6px] rounded-[9px] border text-[11.5px] font-semibold transition-[var(--t)]"
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
          </div>
        )}
      </div>
    </div>
  );
}
