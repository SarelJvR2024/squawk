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
 *  is the one screen that does not. */

import { useResponses, useStore } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import { AttachmentStrip } from "@/components/Capture";
import {
  EVIDENCE_STATUSES,
  EVIDENCE_VERDICTS,
  STATUSES,
  toneStyle,
} from "@/components/CheckDetail";
import { Btn, Empty, Pill, type Tone } from "@/components/ui/primitives";
import { IconCheck, IconFlag, IconLeft, IconRight } from "@/components/ui/icons";
import type { Check } from "@/lib/types";

/** STATUSES' own tone strings ("good"/"bad"/"neu") predate Pill's Tone type
 *  and use "neu" where Pill wants "neutral" — mapped here rather than
 *  changing STATUSES, which CheckDetail's own toneStyle() also reads as a
 *  plain string key into CSS variables (`--neu-bg` etc.), not as a Tone. */
const pillTone = (tone: string): Tone => (tone === "neu" ? "neutral" : (tone as Tone));

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

  const compliance = STATUSES.find((s) => s.key === r?.compliance);

  return (
    <div className="app-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
    <div className="mx-auto w-full max-w-[760px] px-5 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10.5px]" style={{ color: "var(--ink-4)" }}>
          {portalIdFor(entityCode, check.id)}
        </span>
        {compliance && <Pill tone={pillTone(compliance.tone)}>{compliance.label}</Pill>}
        <span className="ml-auto flex gap-[6px]">
          <Btn icon onClick={onPrev} aria-label="Previous check">
            <IconLeft width={13} height={13} />
          </Btn>
          <Btn icon onClick={onNext} aria-label="Next check">
            <IconRight width={13} height={13} />
          </Btn>
        </span>
      </div>
      <h2 className="mb-5 text-[16px] font-bold leading-snug">{check.requirement}</h2>

      {!r ? (
        <Empty>Not captured yet.</Empty>
      ) : (
        <div className="flex flex-col gap-5">
          <section>
            <div className="label-xs mb-1.5">Observation</div>
            <textarea
              value={r.observation}
              onChange={(e) => patch(check.id, { observation: e.target.value })}
              placeholder="What was observed"
              aria-label="Observation"
              className="min-h-[96px] w-full resize-y rounded-[11px] border px-3 py-2.5 text-[13px] outline-none focus:border-[var(--acc)]"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
          </section>

          <section>
            <div className="label-xs mb-1.5">Evidence provided</div>
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

          <section>
            <div className="label-xs mb-1.5">
              Photos and voice notes{" "}
              {r.attachments.length > 0 && (
                <span className="font-mono" style={{ color: "var(--ink-4)" }}>
                  · {r.attachments.length}
                </span>
              )}
            </div>
            {r.attachments.length === 0 ? (
              <Empty>No photos or voice notes on this check.</Empty>
            ) : (
              <AttachmentStrip
                attachments={r.attachments}
                onRemove={(id) => removeAttachment(check.id, id)}
                onUpdate={(id, p) => updateAttachment(check.id, id, p)}
              />
            )}
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
