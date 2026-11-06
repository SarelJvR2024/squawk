"use client";

/** BULK CLEANUP — polish notes and captions, and close out unlinked photos,
 *  by discipline, in one place.
 *
 *  Sarel: "review all the audit check notes and photo findings and write it
 *  with proper grammar, in technical manner... update these notes in the
 *  app" — then, asked how, since this session has no access to the live
 *  record: "build polish notes in app, must be available in bulk, select
 *  which discipline it needs to clean up and clean up all audit check notes
 *  and photo captions in bulk and also option to link photos to audit
 *  checks... give all those different options."
 *
 *  THREE TOOLS, ONE SCREEN, ALL READ-THEN-REVIEW-THEN-APPLY. Nothing here
 *  ever writes to the audit record on its own — every rewrite is proposed,
 *  shown beside the original, and only reaches the record when a person
 *  taps Apply, the same contract every other assist feature in this app
 *  already keeps (describe a photo, propose a hazard, consolidate findings:
 *  advisory until accepted). A compliance record ACSA reads is not a place
 *  for a silent bulk edit.
 *
 *  1. AUDIT CHECK NOTES — Response.observation (desk) and
 *     Response.fieldObservation (field), each check's own text, rewritten
 *     for grammar and technical tone without inventing a fact.
 *  2. FINDING DESCRIPTIONS — Finding.description, the same treatment.
 *  3. PHOTO CAPTIONS — every Attachment.caption across check-point
 *     responses, walk items and findings' own photos.
 *
 *  LINKING PHOTOS TO CHECKS deliberately reuses the Inspection screen's own
 *  BulkLinkWalkItemsSheet rather than a second implementation of the same
 *  picker — see that component's own doc comment: "one check-point search
 *  experience in this app, not a second one invented here." This screen
 *  only counts what is still unlinked for the chosen discipline and sends
 *  the auditor to the tool that already exists. */

import { useCallback, useMemo, useState } from "react";
import {
  useEntityCode,
  useResponses,
  useAdhoc,
  useVisitFindings,
  useChecks,
  useStore,
} from "@/lib/store";
import { disciplinesAt } from "@/lib/register";
import { assist, polishContext, useAssistAvailable } from "@/lib/assist";
import { Btn, Empty, Pill } from "@/components/ui/primitives";
import PageHeading from "@/components/ui/PageHeading";
import { DisciplineSelect } from "@/components/ui/DisciplineSelect";
import { IconSpark, IconCheck, IconX } from "@/components/ui/icons";
import Link from "next/link";
import type { Attachment } from "@/lib/types";

/** One piece of text somewhere in the record, polishable the same way
 *  regardless of what it actually is — see PolishSection below. */
interface PolishItem {
  key: string;
  /** What to show above the text, so a reviewer scanning a long list of
   *  proposals can place each one without opening it. */
  label: string;
  system: string;
  text: string;
  apply: (newText: string) => void;
}

type ProposalState = "idle" | "loading" | "proposed" | "applied" | "error";
interface Proposal {
  state: ProposalState;
  original: string;
  proposed?: string;
  error?: string;
}

/** ONE REVIEW LIST, THREE CALLERS. Takes whatever items are in scope this
 *  run, proposes a rewrite for each (sequentially — the assist route has no
 *  bulk endpoint, and three requests in flight at once is three ways to hit
 *  a provider rate limit for one auditor's one click), and lets the auditor
 *  accept or keep each one before anything is applied. */
function PolishSection({
  title,
  hint,
  kind,
  items,
}: {
  title: string;
  hint: string;
  kind: "note" | "caption";
  items: PolishItem[];
}) {
  const [open, setOpen] = useState(false);
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  const [running, setRunning] = useState(false);
  const [kept, setKept] = useState<Record<string, boolean>>({});

  const pending = items.filter((i) => !proposals[i.key] || proposals[i.key].state === "error");
  const proposedCount = Object.values(proposals).filter((p) => p.state === "proposed").length;
  const appliedCount = Object.values(proposals).filter((p) => p.state === "applied").length;

  async function run() {
    setRunning(true);
    setOpen(true);
    for (const item of items) {
      if (proposals[item.key]?.state === "proposed" || proposals[item.key]?.state === "applied") continue;
      setProposals((p) => ({ ...p, [item.key]: { state: "loading", original: item.text } }));
      try {
        const text = await assist(
          "polish",
          polishContext(item.text, "", item.system, kind, item.label)
        );
        setProposals((p) => ({
          ...p,
          [item.key]: { state: "proposed", original: item.text, proposed: text.trim() },
        }));
      } catch (e) {
        setProposals((p) => ({
          ...p,
          [item.key]: {
            state: "error",
            original: item.text,
            error: e instanceof Error ? e.message : "The assistant is unavailable.",
          },
        }));
      }
    }
    setRunning(false);
  }

  function applyOne(item: PolishItem) {
    const prop = proposals[item.key];
    if (!prop?.proposed) return;
    item.apply(prop.proposed);
    setProposals((p) => ({ ...p, [item.key]: { ...prop, state: "applied" } }));
  }

  function applyAllAccepted() {
    for (const item of items) {
      if (kept[item.key]) continue;
      const prop = proposals[item.key];
      if (prop?.state === "proposed") applyOne(item);
    }
  }

  return (
    <div className="rounded-[14px] border" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="block font-display text-[13px] font-semibold">{title}</span>
          <span className="block text-[11px]" style={{ color: "var(--ink-3)" }}>
            {items.length} {items.length === 1 ? "item" : "items"} · {hint}
          </span>
        </span>
        <span className="font-mono text-[11px]" style={{ color: "var(--ink-4)" }}>
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--line)" }}>
          {items.length === 0 ? (
            <Empty>Nothing to polish here for this discipline.</Empty>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Btn variant="primary" onClick={run} disabled={running || pending.length === 0}>
                  <IconSpark width={13} height={13} />
                  {running
                    ? "Polishing…"
                    : pending.length === 0
                      ? "All proposed"
                      : `Polish all ${pending.length}`}
                </Btn>
                {proposedCount > 0 && (
                  <Btn onClick={applyAllAccepted}>
                    <IconCheck width={13} height={13} />
                    Apply {proposedCount} accepted
                  </Btn>
                )}
                {appliedCount > 0 && <Pill tone="good">{appliedCount} applied</Pill>}
              </div>

              <div className="flex flex-col gap-2">
                {items.map((item) => {
                  const prop = proposals[item.key];
                  return (
                    <div
                      key={item.key}
                      className="rounded-[10px] border px-3 py-2"
                      style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1.5 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        <span>{item.system || "No asset system recorded"}</span>
                        <span>·</span>
                        <span>{item.label}</span>
                      </div>

                      <div className="text-[11.5px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
                        {item.text}
                      </div>

                      {prop?.state === "loading" && (
                        <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                          Polishing…
                        </div>
                      )}
                      {prop?.state === "error" && (
                        <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--bad)" }}>
                          {prop.error}
                        </div>
                      )}
                      {prop?.state === "proposed" && !kept[item.key] && (
                        <div className="mt-1.5 flex flex-col gap-1.5">
                          <div
                            className="rounded-[8px] border px-2 py-1.5 text-[11.5px] leading-[1.4]"
                            style={{ borderColor: "var(--acc)", background: "var(--acc-soft)" }}
                          >
                            {prop.proposed}
                          </div>
                          <div className="flex gap-1.5">
                            <Btn onClick={() => applyOne(item)}>
                              <IconCheck width={12} height={12} />
                              Accept
                            </Btn>
                            <Btn onClick={() => setKept((k) => ({ ...k, [item.key]: true }))}>
                              <IconX width={12} height={12} />
                              Keep original
                            </Btn>
                          </div>
                        </div>
                      )}
                      {prop?.state === "proposed" && kept[item.key] && (
                        <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                          Kept as originally captured.
                        </div>
                      )}
                      {prop?.state === "applied" && (
                        <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--good)" }}>
                          Applied — the record now reads the polished version.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CleanupPage() {
  const entityCode = useEntityCode();
  const checks = useChecks();
  const responses = useResponses();
  const adhoc = useAdhoc();
  const findings = useVisitFindings();
  const patch = useStore((s) => s.patch);
  const updateFinding = useStore((s) => s.updateFinding);
  const updateAttachment = useStore((s) => s.updateAttachment);
  const updateAdhocAttachment = useStore((s) => s.updateAdhocAttachment);
  const updateFindingAttachment = useStore((s) => s.updateFindingAttachment);

  const aiOn = useAssistAvailable();
  const [discipline, setDiscipline] = useState("");

  const disciplineOptions = useMemo(
    () => disciplinesAt(entityCode).sort((a, b) => a.localeCompare(b)),
    [entityCode]
  );

  const inDiscipline = useCallback((d: string) => !discipline || d === discipline, [discipline]);

  const noteItems: PolishItem[] = useMemo(() => {
    const out: PolishItem[] = [];
    for (const c of checks) {
      if (!inDiscipline(c.discipline)) continue;
      const r = responses[c.id];
      if (!r) continue;
      if (r.observation?.trim()) {
        out.push({
          key: `${c.id}|observation`,
          label: `${c.id} — desk note`,
          system: c.system,
          text: r.observation.trim(),
          apply: (text) => patch(c.id, { observation: text }),
        });
      }
      if (r.fieldObservation?.trim()) {
        out.push({
          key: `${c.id}|fieldObservation`,
          label: `${c.id} — field note`,
          system: c.system,
          text: r.fieldObservation.trim(),
          apply: (text) => patch(c.id, { fieldObservation: text }),
        });
      }
    }
    return out;
  }, [checks, responses, patch, inDiscipline]);

  const findingItems: PolishItem[] = useMemo(() => {
    return findings
      .filter((f) => inDiscipline(f.discipline) && f.description?.trim())
      .map((f) => ({
        key: `finding|${f.id}`,
        label: `${f.id} — ${f.title || "finding"}`,
        system: f.system,
        text: f.description.trim(),
        apply: (text) => updateFinding(f.id, { description: text }),
      }));
  }, [findings, updateFinding, inDiscipline]);

  const captionItems: PolishItem[] = useMemo(() => {
    const out: PolishItem[] = [];
    const withCaption = (a: Attachment) => a.kind === "photo" && a.caption?.trim();

    for (const c of checks) {
      if (!inDiscipline(c.discipline)) continue;
      const r = responses[c.id];
      for (const a of r?.attachments ?? []) {
        if (!withCaption(a)) continue;
        out.push({
          key: `check-photo|${c.id}|${a.id}`,
          label: `${c.id} photo`,
          system: c.system,
          text: a.caption!.trim(),
          apply: (text) => updateAttachment(c.id, a.id, { caption: text }),
        });
      }
    }
    for (const item of adhoc) {
      if (!inDiscipline(item.discipline ?? "")) continue;
      for (const a of item.attachments ?? []) {
        if (!withCaption(a)) continue;
        out.push({
          key: `walk-photo|${item.id}|${a.id}`,
          label: `${item.id} photo`,
          system: item.system ?? "",
          text: a.caption!.trim(),
          apply: (text) => updateAdhocAttachment(item.id, a.id, { caption: text }),
        });
      }
    }
    for (const f of findings) {
      if (!inDiscipline(f.discipline)) continue;
      for (const a of f.attachments ?? []) {
        if (!withCaption(a)) continue;
        out.push({
          key: `finding-photo|${f.id}|${a.id}`,
          label: `${f.id} photo`,
          system: f.system,
          text: a.caption!.trim(),
          apply: (text) => updateFindingAttachment(f.id, a.id, { caption: text }),
        });
      }
    }
    return out;
  }, [checks, responses, adhoc, findings, updateAttachment, updateAdhocAttachment, updateFindingAttachment, inDiscipline]);

  const unlinkedCount = useMemo(
    () =>
      adhoc.filter(
        (it) => !it.checkId && inDiscipline(it.discipline ?? "") &&
          (it.attachments ?? []).some((a) => a.kind === "photo")
      ).length,
    [adhoc, inDiscipline]
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeading title="Cleanup" progress={<span className="text-[11px]" style={{ color: "var(--ink-3)" }}>Polish notes and captions, close out unlinked photos — by discipline</span>} />

      <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
        <div className="mb-3">
          <DisciplineSelect
            value={discipline}
            onChange={setDiscipline}
            ariaLabel="Discipline to clean up"
            active={!!discipline}
            options={[
              { value: "", label: "Choose a discipline…" },
              ...disciplineOptions.map((d) => ({ value: d, label: d })),
            ]}
          />
        </div>

        {!aiOn && (
          <div
            className="mb-3 rounded-[10px] border px-3 py-2 text-[11.5px]"
            style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn)" }}
          >
            No model is configured for this deployment — the polish tools below need one. Linking photos to checks still works without it.
          </div>
        )}

        {!discipline ? (
          <Empty>Pick a discipline above to see what needs cleaning up.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {aiOn && (
              <>
                <PolishSection
                  title="Audit check notes"
                  hint="desk and field observations"
                  kind="note"
                  items={noteItems}
                />
                <PolishSection
                  title="Finding descriptions"
                  hint="findings raised in this discipline"
                  kind="note"
                  items={findingItems}
                />
                <PolishSection
                  title="Photo captions"
                  hint="check-point, walk and finding photos"
                  kind="caption"
                  items={captionItems}
                />
              </>
            )}

            <div
              className="rounded-[14px] border px-4 py-3"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}
            >
              <div className="mb-1 font-display text-[13px] font-semibold">Link photos to checks</div>
              <div className="mb-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                {unlinkedCount > 0
                  ? `${unlinkedCount} walkabout photograph${unlinkedCount === 1 ? "" : "s"} in ${discipline} ${unlinkedCount === 1 ? "is" : "are"} not tied to a check-point yet — unattributed in the report until they are.`
                  : `Every walkabout photograph in ${discipline} is already tied to a check-point.`}
              </div>
              <Link href="/field">
                <Btn>Open Inspection, select them, and link in bulk →</Btn>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
