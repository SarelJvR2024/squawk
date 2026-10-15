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
 *  worst of the three, never stored. All four cells here are READ-ONLY
 *  mirrors of state set by the editable controls further down this same
 *  screen (evidence verdict, site inspection) or elsewhere (the check's own
 *  compliance, set on Capture/Field) — one place to look, one place to
 *  change, same split the old top-of-screen compliance Pill already used.
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

/** One cell of the sticky strip — a label and a read-only Pill mirroring
 *  whatever the editable controls further down this screen (or, for
 *  `compliance`, Capture/Field) last set. `partial` marks the combined cell
 *  when not all three axes have been answered yet, so a clean-looking "C"
 *  is never mistaken for a finished review. */
function ComplianceCell({
  label,
  value,
  partial,
}: {
  label: string;
  value: Compliance | null;
  partial?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-[3px] rounded-[8px] border px-[4px] py-[6px] text-center"
      style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
    >
      <span className="label-xs leading-tight" style={{ color: "var(--ink-4)" }}>
        {label}
      </span>
      <Pill tone={complianceTone(value)} title={partial ? "Not every axis has been reviewed yet" : undefined}>
        {value ?? "—"}
        {partial ? " ·" : ""}
      </Pill>
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
              <ComplianceCell label="Audit check" value={r.compliance} />
              <ComplianceCell label="Evidence" value={r.evidenceVerdict} />
              <ComplianceCell label="Site inspection" value={r.siteInspection} />
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
