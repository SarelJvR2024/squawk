"use client";

/** Start again — for a dry run, where the point is to reach a clean sheet
 *  twice in a morning without anyone opening a console.
 *
 *  Two steps, always. Everything this panel does is unrecoverable: there is no
 *  server copy, no undo, and a tablet's IndexedDB is the only place a
 *  half-captured audit exists. A single-tap Reset next to Export is a lost
 *  morning waiting to happen, so the button arms and the confirm names exactly
 *  what is about to go. */

import { useState } from "react";
import { scopeKey, useEntity, useResponses, useStore, useVisitId } from "@/lib/store";
import { PROGRAMME_VISITS } from "@/lib/programme";
import { Btn, Panel, Pill } from "@/components/ui/primitives";
import { IconLoop, IconX } from "@/components/ui/icons";

type Scope = "visit" | "everything";

export default function ResetPanel({ onClose }: { onClose: () => void }) {
  const entity = useEntity();
  const visitId = useVisitId();
  const responses = useResponses();
  const byVisit = useStore((s) => s.byVisit);
  const findings = useStore((s) => s.findings);
  const resetVisit = useStore((s) => s.resetVisit);
  const resetEverything = useStore((s) => s.resetEverything);

  const [scope, setScope] = useState<Scope>("visit");
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const visitLabel = PROGRAMME_VISITS.find((v) => v.id === visitId)?.label ?? visitId;

  /* Counted from the real records, so the confirm says what is actually
     there rather than what the screen last happened to show. */
  const thisVisit = {
    captured: Object.values(responses).filter((r) => r.captured).length,
    attachments: Object.values(responses).reduce((n, r) => n + r.attachments.length, 0),
    findings: findings.filter((f) => f.entity === entity.code && f.originVisit === visitId)
      .length,
  };
  const everything = {
    visits: Object.keys(byVisit).length,
    captured: Object.values(byVisit).reduce(
      (n, d) => n + Object.values(d.responses).filter((r) => r.captured).length,
      0
    ),
    attachments: Object.values(byVisit).reduce(
      (n, d) => n + Object.values(d.responses).reduce((m, r) => m + r.attachments.length, 0),
      0
    ),
    findings: findings.length,
  };

  const nothingToClear =
    scope === "visit"
      ? thisVisit.captured + thisVisit.attachments + thisVisit.findings === 0
      : everything.visits + everything.findings === 0;

  const go = () => {
    if (scope === "visit") {
      resetVisit();
      setDone(`${entity.short} · ${visitLabel} cleared. Start capturing.`);
    } else {
      resetEverything();
      setDone("Every visit at every entity cleared, and all media deleted.");
    }
    setArmed(false);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-center pt-[10vh] px-4"
      style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="h-fit w-[min(520px,100%)] rounded-[20px] border p-[22px]"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[15px] font-bold">Start again</h3>
            <p className="mt-[3px] text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              For a dry run. There is no undo and no server copy.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-[8px] border p-[9px]"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
          >
            <IconX width={13} height={13} />
          </button>
        </div>

        {done ? (
          <>
            <Panel tone="accent">
              <div className="text-[12.5px]" style={{ color: "var(--acc)" }}>
                {done}
              </div>
            </Panel>
            <div className="mt-3.5 flex justify-end">
              <Btn variant="primary" onClick={onClose}>
                Done
              </Btn>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2">
              {(
                [
                  [
                    "visit",
                    `This visit — ${entity.short} · ${visitLabel}`,
                    `${thisVisit.captured} captured · ${thisVisit.attachments} photos and recordings · ${thisVisit.findings} findings`,
                  ],
                  [
                    "everything",
                    "Everything — every entity, every visit",
                    `${everything.visits} visit${everything.visits === 1 ? "" : "s"} with data · ${everything.captured} captured · ${everything.attachments} photos and recordings · ${everything.findings} findings`,
                  ],
                ] as [Scope, string, string][]
              ).map(([k, label, detail]) => (
                <button
                  key={k}
                  onClick={() => {
                    setScope(k);
                    setArmed(false);
                  }}
                  className="rounded-[12px] border px-[13px] py-[11px] text-left transition-[var(--t)]"
                  style={
                    scope === k
                      ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)" }
                      : { background: "var(--panel)", borderColor: "var(--line-2)" }
                  }
                >
                  <b className="block font-display text-[12px] font-semibold">{label}</b>
                  <span className="mt-[2px] block text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {detail}
                  </span>
                </button>
              ))}
            </div>

            {/* The seeded 2025 findings are reference data loaded from a file,
                not captured state — saying so here stops the obvious worry
                that resetting throws them away. */}
            <p className="mb-3 text-[11px]" style={{ color: "var(--ink-4)" }}>
              The 324 check-points, the Answer Library and the 23 March 2025 findings are
              reference data and are never cleared — only what this audit captured.
            </p>

            {nothingToClear ? (
              <Panel>
                <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  Nothing captured here yet — already a clean sheet.
                </div>
              </Panel>
            ) : armed ? (
              <Panel tone="warn">
                <div className="text-[12.5px] leading-[1.5]" style={{ color: "var(--warn)" }}>
                  <b>This cannot be undone.</b>{" "}
                  {scope === "visit" ? (
                    <>
                      {entity.short} · {visitLabel} loses {thisVisit.captured} captured check
                      {thisVisit.captured === 1 ? "" : "s"}, {thisVisit.attachments} photograph
                      {thisVisit.attachments === 1 ? "" : "s"} and recording
                      {thisVisit.attachments === 1 ? "" : "s"}, and {thisVisit.findings} finding
                      {thisVisit.findings === 1 ? "" : "s"}. Other visits are untouched.
                    </>
                  ) : (
                    <>
                      All {everything.visits} visit{everything.visits === 1 ? "" : "s"} across
                      every entity, {everything.attachments} media file
                      {everything.attachments === 1 ? "" : "s"} and {everything.findings} finding
                      {everything.findings === 1 ? "" : "s"} are deleted.
                    </>
                  )}
                </div>
              </Panel>
            ) : null}

            <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
              <Pill>{scopeKey(entity.code, visitId)}</Pill>
              <span className="flex-1" />
              {armed && <Btn onClick={() => setArmed(false)}>Cancel</Btn>}
              <Btn
                variant="primary"
                disabled={nothingToClear}
                onClick={() => (armed ? go() : setArmed(true))}
                style={
                  armed
                    ? { background: "var(--bad)", borderColor: "var(--bad)", color: "#fff" }
                    : undefined
                }
              >
                <IconLoop width={14} height={14} />
                {armed
                  ? scope === "visit"
                    ? "Yes — clear this visit"
                    : "Yes — clear everything"
                  : "Reset"}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
