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
 *  register renders, the same RootCauseAdvice the check screen used to render,
 *  and the walk-item block that explains a finding raised from an ad-hoc
 *  observation. It is lifted, not rewritten, so nothing that was true of it
 *  stopped being true when the screen around it changed.
 *
 *  HAZARD ADVICE MOVED HERE, 11 October 2026. It used to stand beside
 *  RootCauseAdvice on the check screen's own "Issues found" tab — "the other
 *  half of the same moment," named right after a finding was raised. That tab
 *  is gone (Sarel: remove it), and this is the one place left where a finding
 *  is still worked in full with its check and attachments in scope, so the
 *  advice moved rather than being dropped — a finding raised without its
 *  issue chips still deserves the same "what event does this expose?"
 *  question, just asked here instead of at the moment it was raised. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { checksAt, useAdhoc, useEntityCode, useResponses, useStore } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import { assist, findingContext } from "@/lib/assist";
import { Btn, Pill } from "@/components/ui/primitives";
import RecordActions from "@/components/RecordActions";
import RootCauseAdvice from "@/components/RootCauseAdvice";
import HazardAdvice from "@/components/HazardAdvice";
import { AttachmentStrip } from "@/components/Capture";
import type { Finding } from "@/lib/types";

/** LINK AN UNLINKED FINDING TO ONE OF THE 324 AUDIT CHECKS, LATER.
 *
 *  Sarel: capture stays easy in the field — nothing forces a walk item or
 *  the finding raised from it to name a check while someone is standing in
 *  front of the asset. This is the "back at the office" half: a finding
 *  with no checkId can be matched to the specific check it is evidence
 *  against, once there is time to look.
 *
 *  Linking does one more thing, not just the usual record-keeping: it sets
 *  that check's own compliance to NC. Sarel: "if an item is marked Non
 *  Compliant... it must affect the audit check compliance to non
 *  compliant... part of the audit non compliance which need to be
 *  rectified and verified in the next audit cycle." A finding IS the
 *  record of something wrong — there is no "compliant finding" in this
 *  app — so linking one to a check is the moment that check joins the
 *  audit's non-compliance count and the normal verify-at-next-visit cycle
 *  every other NC check already goes through. Never reversed here: a
 *  finding, once linked, stays linked — unlinking would leave a check
 *  marked NC with nothing on record explaining why. */
function LinkToCheck({ f, entityCode, onLinked }: { f: Finding; entityCode: string; onLinked: (checkId: string) => void }) {
  const setCompliance = useStore((s) => s.setCompliance);
  const updateFinding = useStore((s) => s.updateFinding);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  /* The SAME search RaiseFindingSheet's own check picker runs — ID, wording,
     system, discipline — so there is one fuzzy-search rule for "find a
     check-point" in this app, not two that can drift apart. */
  const candidates = useMemo(() => {
    const scoped = checksAt(entityCode).filter((c) => !f.discipline || c.discipline === f.discipline);
    const q = query.trim().toLowerCase();
    return scoped
      .filter(
        (c) =>
          !q ||
          `${portalIdFor(entityCode, c.id)} ${c.requirement} ${c.system} ${c.discipline}`
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 30);
  }, [entityCode, f.discipline, query]);

  const link = (checkId: string) => {
    updateFinding(f.id, { checkId });
    /* setCompliance, not a raw patch — it also clears evidencePending for
       us, which can only ever be true alongside a "C" verdict (see
       Response.evidencePending's own doc comment). A raw patch would leave
       a check reading "Compliant, evidence pending" AND "Non-compliant" at
       once. */
    setCompliance(checkId, "NC");
    setOpen(false);
    onLinked(checkId);
  };

  if (!open)
    return (
      <Btn variant="ghost" onClick={() => setOpen(true)} className="text-[10.5px]">
        Link to an audit check
      </Btn>
    );

  return (
    <div className="mt-2 rounded-[11px] border p-2.5" style={{ background: "var(--sunken)", borderColor: "var(--line)" }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={f.discipline ? `Search ${f.discipline} checks…` : "Search all checks…"}
          autoFocus
          className="min-w-0 flex-1 rounded-[8px] border px-2.5 py-1.5 text-[12px] outline-none"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        />
        <Btn variant="ghost" onClick={() => setOpen(false)} className="shrink-0 text-[10.5px]">
          Cancel
        </Btn>
      </div>
      <div className="max-h-[220px] overflow-y-auto">
        {candidates.length === 0 ? (
          <div className="px-1 py-2 text-[11px]" style={{ color: "var(--ink-4)" }}>
            No matching checks.
          </div>
        ) : (
          candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => link(c.id)}
              className="block w-full rounded-[7px] px-2 py-1.5 text-left text-[11.5px] hover:bg-[var(--panel)]"
            >
              <span className="mr-1.5 font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                {portalIdFor(entityCode, c.id)}
              </span>
              {c.requirement}
            </button>
          ))
        )}
      </div>
      <div className="mt-1.5 text-[10px]" style={{ color: "var(--ink-4)" }}>
        Sets that check&apos;s compliance to Non-Compliant. Cannot be undone from here.
      </div>
    </div>
  );
}

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
        {/* Provenance marks, not statuses — item 4 of Sarel's second
            visual-hierarchy pass takes the brand accent off both. */}
        {f.adHoc && <Pill>AD-HOC</Pill>}
        {f.importKey && (
          <Pill title="Written by Import observation pack, not typed by an auditor">
            IMPORTED, TPJV-PROPOSED
          </Pill>
        )}
        {f.checkId && (
          <button
            onClick={() => router.push(`/capture?check=${f.checkId}`)}
            className="underline"
            style={{ color: "var(--acc)" }}
          >
            {portalIdFor(entityCode, f.checkId)}
          </button>
        )}
      </div>
      <h3 className="mb-3 text-[14.5px] leading-[1.35] font-bold">{f.description}</h3>

      {!f.checkId && (
        <div className="mb-3.5">
          <LinkToCheck
            f={f}
            entityCode={entityCode}
            onLinked={(checkId) => say(`Linked to ${portalIdFor(entityCode, checkId)} — marked Non-Compliant`)}
          />
        </div>
      )}

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
          true.

          TWO WAYS A FINDING ENDS UP POINTING BACK AT A WALK ITEM, same
          block either way. Raised live, on the walk: the item's own
          findingId names this finding (the lookup below's first arm).
          Written up from an import pack's "From item" column: THIS
          finding's own fromItemId names the item instead (see
          importPack.ts's applyImportPlan) — the item's findingId stays
          null, because nothing in the live flow ever set it. Either
          direction means the same thing to an auditor reading this
          pane, so either resolves to the same "seen on the walk" block. */}
      {(() => {
        const from = f.fromItemId
          ? adhocItems.find((a) => a.id === f.fromItemId)
          : adhocItems.find((a) => a.findingId === f.id);
        if (!from) return null;
        return (
          <div
            className="mb-3.5 rounded-[11px] border p-3"
            style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {/* A provenance mark, not a status — item 4 of Sarel's
                  second visual-hierarchy pass takes the brand accent off
                  it. */}
              <Pill>SEEN ON THE WALK</Pill>
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

      {/* THE OTHER HALF OF THE SAME MOMENT: what event does this expose?
          Named here, it gives the hazard register something a person wrote
          to consolidate from. Same props shape as RootCauseAdvice above —
          both read the finding's own check and attachments, both only
          propose. */}
      <HazardAdvice
        finding={f}
        check={f.checkId ? checksAt(entityCode).find((c) => c.id === f.checkId) : undefined}
        attachments={f.checkId ? (responses[f.checkId]?.attachments ?? []) : []}
        onAccept={(event) => {
          updateFinding(f.id, { suggestedEvent: event });
          say(`Hazard noted · ${event}`);
        }}
      />
    </>
  );
}
