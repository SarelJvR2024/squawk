"use client";

/** ONE FINDING, IN FULL — the pane the findings register used to be built
 *  around, now opened from the asset system it belongs to.
 *
 *  The Findings screen became an ASSET SYSTEM assessment: ACSA rates, reports
 *  and compares asset systems year on year, so that is what the screen is now
 *  organised by, and a finding is one piece of the evidence the group reads
 *  before agreeing the system's band. That did not make the per-finding work go
 *  away — a finding still carries its own rating, its own root cause and its
 *  own owner — so the pane moved here and opens in a sheet from the asset
 *  system's evidence list rather than being deleted.
 *
 *  Everything in it is what it was: the same RecordActions block the hazard
 *  register renders, the same RootCauseAdvice the check screen renders, and the
 *  walk-item block that explains a finding raised from an ad-hoc observation.
 *  It is lifted, not rewritten, so nothing that was true of it stopped being
 *  true when the screen around it changed. */

import { useRouter } from "next/navigation";
import { checksAt, useAdhoc, useEntityCode, useResponses, useStore } from "@/lib/store";
import { assist, findingContext } from "@/lib/assist";
import { Pill } from "@/components/ui/primitives";
import RecordActions from "@/components/RecordActions";
import RootCauseAdvice from "@/components/RootCauseAdvice";
import { AttachmentStrip } from "@/components/Capture";
import type { Finding } from "@/lib/types";

export default function FindingDetail({
  f,
  onToast,
}: {
  f: Finding;
  onToast?: (message: string) => void;
}) {
  const router = useRouter();
  const entityCode = useEntityCode();
  const responses = useResponses();
  const adhocItems = useAdhoc();
  const updateFinding = useStore((s) => s.updateFinding);
  const addFindingProgress = useStore((s) => s.addFindingProgress);
  const say = (m: string) => onToast?.(m);

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center gap-[7px] font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
        <span>{f.id}</span>
        <span>·</span>
        <span>{f.discipline}</span>
        <span>·</span>
        <span>{f.system}</span>
        {f.priorRating && <Pill tone="bad">REPEAT — MAR 2025 {f.priorRating.toUpperCase()}</Pill>}
        {f.adHoc && <Pill tone="accent">AD-HOC</Pill>}
        {f.checkId && (
          <button
            onClick={() => router.push(`/capture?check=${f.checkId}`)}
            className="underline"
            style={{ color: "var(--acc)" }}
          >
            {f.checkId}
          </button>
        )}
      </div>
      <h3 className="mb-3 text-[14.5px] leading-[1.35] font-bold">{f.description}</h3>

      {/* WHERE IT CAME FROM, WHEN IT CAME OFF THE WALK.
          A finding raised from an ad-hoc item has no check-point behind
          it, so every link this pane normally offers is dead: no
          register text to quote, no evidence expected, and — the one
          that matters — no photographs, because the photographs are
          attached to the observation rather than to the finding.

          Without this block the flow reads as broken: record what you
          saw with three photographs, raise the finding, open the
          findings register, and the finding is there with nothing
          behind it. The observation is looked up rather than stored as
          a second link, because AdHocItem.findingId already holds the
          relation and a second copy of it is a second thing to keep
          true. */}
      {(() => {
        const from = adhocItems.find((a) => a.findingId === f.id);
        if (!from) return null;
        return (
          <div
            className="mb-3.5 rounded-[12px] border p-3"
            style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Pill tone="accent">SEEN ON THE WALK</Pill>
              <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                {from.id}
              </span>
              {from.area && (
                <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                  {from.area}
                </span>
              )}
              <button
                onClick={() => router.push("/field")}
                className="ml-auto text-[11.5px] font-semibold underline"
                style={{ color: "var(--acc)" }}
              >
                Open on the walk
              </button>
            </div>
            <div className="text-[12px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
              This is not one of the {checksAt(entityCode).length} check-points. It was
              recorded on site as something the register does not cover, and it is reported
              that way — here, and in every export.
            </div>
            {from.note.trim() && (
              <div className="mt-1.5 text-[12px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
                {from.note}
              </div>
            )}
            {from.attachments.length > 0 ? (
              <div className="mt-2.5">
                <AttachmentStrip attachments={from.attachments} thumbSize={40} />
              </div>
            ) : (
              <div className="mt-2 text-[11.5px]" style={{ color: "var(--warn)" }}>
                No photograph or voice note was attached to the observation.
              </div>
            )}
          </div>
        );
      })()}

      {/* One rating and treatment block, shared with the hazard
          register. See src/components/RecordActions.tsx — a second copy
          of a risk matrix is how two screens end up carrying two
          vocabularies for one instrument. */}
      <RecordActions
        record={f}
        entityCode={entityCode}
        onChange={(patch) => updateFinding(f.id, patch)}
        onToast={say}
        progress={f.progress}
        onProgress={(n) => addFindingProgress(f.id, n)}
        secondOpinion={async () => {
          const check = checksAt(entityCode).find((c) => c.id === f.checkId);
          return assist("rating", findingContext(f, check));
        }}
        advice={
          /* Same component as the check screen. Some findings are
             worked here rather than at the check, and the advice must
             not differ depending on which screen the auditor opened. */
          <RootCauseAdvice
            finding={f}
            check={f.checkId ? checksAt(entityCode).find((c) => c.id === f.checkId) : undefined}
            attachments={f.checkId ? (responses[f.checkId]?.attachments ?? []) : []}
            onPick={(rc) => updateFinding(f.id, { rootCause: rc })}
          />
        }
      />
    </>
  );
}
