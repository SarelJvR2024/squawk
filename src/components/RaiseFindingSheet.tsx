"use client";

import { useEffect, useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Btn, Pill } from "@/components/ui/primitives";
import { IconSearch, IconX } from "@/components/ui/icons";
import { AttachmentStrip, PhotoButton, VoiceNoteButton, forgetMedia } from "@/components/Capture";
import DisciplineChips from "@/components/DisciplineChips";
import { adhocTranscriptContext, assist, useAssistAvailable } from "@/lib/assist";
import { checksAt, disciplinesAt, systemsOf, useEntityCode, useStore } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import type { Attachment } from "@/lib/types";

const uid = () => Math.random().toString(36).slice(2, 10);

/** RAISE A FINDING THAT IS NOT TIED TO ANY SPECIFIC CHECK.
 *
 *  Sarel: "there might be findings that we pick up which is not relating to a
 *  specific audit check... the findings will definitely fit into a discipline
 *  and potentially also to an asset type... make sure there's an easy way to
 *  capture findings, to link it to a discipline and or asset type and or a
 *  question or a check."
 *
 *  The Findings screen (src/app/(app)/findings/page.tsx) was built to RATE
 *  findings that already exist — nothing on it let an auditor RAISE one. The
 *  only way to raise a finding with no check behind it was the walk screen's
 *  ad-hoc-item-then-promote flow (AddItemSheet.tsx's raiseFinding), which
 *  needs a system/area context on that screen. This sheet is the second,
 *  general entry point this screen itself needed — same `addFinding` action,
 *  same default shape, copied straight from AddItemSheet.tsx's own call
 *  (checkId null unless a check is picked, severity/likelihood/rootCause
 *  empty, actionStatus "Open", ratingConfirmed false) so the two capture
 *  paths cannot drift into two different shapes of finding.
 *
 *  Every Finding IS a non-compliance in this schema — see Finding in
 *  src/lib/types.ts, `checkId: string | null`. Raising one here, with or
 *  without a check attached, is what makes `outstandingFor()`
 *  (src/lib/carryforward.ts) carry it into the next visit's Follow-up screen;
 *  that function filters on `originVisit`/`actionStatus` only, never on
 *  `checkId`, so nothing further is needed here for that to work.
 *
 *  ONLY DISCIPLINE AND A DESCRIPTION OF WHAT WAS FOUND ARE REQUIRED — Sarel's
 *  own wording was "and or asset type and or a question or a check", i.e.
 *  asset system and check-point are both optional. Forcing either would put
 *  a guess into a finding that may genuinely be about neither. */

export default function RaiseFindingSheet({
  open,
  onClose,
  onSaved,
  presetCheckId,
  presetSystem,
  presetDiscipline,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string, message: string) => void;
  /** Build prompt 5 (the + sheet): context the + sheet already had when
   *  "Issue" was tapped, so this screen does not ask again for a
   *  discipline/system/check-point it was opened already knowing. Plain
   *  defaults, same fields this sheet already lets the auditor pick by
   *  hand — not locked, since "asset system and check-point are both
   *  optional" already means a preset one can still be widened or cleared. */
  presetCheckId?: string;
  presetSystem?: string;
  presetDiscipline?: string;
}) {
  const entityCode = useEntityCode();
  const auditor = useStore((s) => s.auditor);
  const visitId = useStore((s) => s.visit);
  const addFinding = useStore((s) => s.addFinding);
  const addFindingAttachment = useStore((s) => s.addFindingAttachment);
  const aiOn = useAssistAvailable();

  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const checks = useMemo(() => checksAt(entityCode), [entityCode]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discipline, setDiscipline] = useState<string>("");
  const [system, setSystem] = useState<string | null>(null);
  const [systemQuery, setSystemQuery] = useState("");
  const [checkId, setCheckId] = useState<string | null>(null);
  const [checkQuery, setCheckQuery] = useState("");
  /* TYPE AND TAGS, SET AT RAISING — Sarel (25 Nov 2026): "when raising a
     finding add an option to indicate compliance as Observation. Add option
     to tag it as critical, safety." They are the same Finding fields the
     Issues screen already sets and filters on (findingType, critical,
     safetyTag), so a finding raised here lands under the right chip with no
     second pass. Default is non-compliance, the same default findingTypeFor()
     already applies to an unset one. */
  const [findingType, setFindingType] = useState<"non-compliance" | "observation">("non-compliance");
  const [critical, setCritical] = useState(false);
  const [safetyTag, setSafetyTag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Apply the + sheet's context on the transition into open, not on every
     render — the picker state below is otherwise freely editable by hand,
     same as before this prop existed, and re-applying the preset on a
     render the open check-point triggered (picking a check back-fills
     discipline/system below) would fight the auditor's own edit. */
  /* eslint-disable react-hooks/set-state-in-effect -- genuinely syncing to
     the moment `open` flips true, not state derivable from props/state
     alone (see the comment above this effect) */
  useEffect(() => {
    if (!open) return;
    if (presetDiscipline) setDiscipline(presetDiscipline);
    if (presetSystem) setSystem(presetSystem);
    if (presetCheckId) setCheckId(presetCheckId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only `open` is meant to retrigger this; the preset props are read, not depended on
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* PHOTOS AND A VOICE NOTE, CAPTURED BEFORE ANYTHING ELSE IS TYPED —
   *  field-capture mobile pass, matching AddItemSheet's own "take the
   *  photograph, keep moving" brief.
   *
   *  HELD HERE UNTIL Raise it IS PRESSED, same as before — Finding did not
   *  carry its own attachments when this was first written, so a capture
   *  taken before a check-point was picked had nowhere to go and save()
   *  refused rather than silently dropping it. Finding.attachments now
   *  exists (see its own doc comment in types.ts, added after Sarel: "after
   *  you raise a finding, you should be able to capture multiple photos"),
   *  so every capture here joins the FINDING's own attachments via
   *  addFindingAttachment once it exists — a check-point, if one is ever
   *  picked, is no longer a precondition for keeping a photo. */
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);

  /* Scoped to the discipline once one is chosen — same rule AddItemSheet's
     own asset-system picker uses — and searched otherwise. */
  const systems = useMemo(() => {
    const all = discipline
      ? systemsOf(entityCode, discipline)
      : Array.from(new Set(checks.map((c) => c.system)));
    const q = systemQuery.trim().toLowerCase();
    const list = q ? all.filter((s) => s.toLowerCase().includes(q)) : all;
    return list.slice(0, 40);
  }, [entityCode, discipline, systemQuery, checks]);

  /* The SAME search the ⌘K jump-to-check palette (AppShell.tsx) runs — ID,
     wording, system, discipline or ACSA figure — so there is one fuzzy-search
     rule in this app, not two that can drift apart. */
  const checkResults = useMemo(() => {
    const q = checkQuery.trim().toLowerCase();
    const scoped = discipline ? checks.filter((c) => c.discipline === discipline) : checks;
    return scoped
      .filter(
        (c) =>
          !q ||
          `${portalIdFor(entityCode, c.id)} ${c.requirement} ${c.system} ${c.discipline} ${c.acsaThreshold}`
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 30);
  }, [checks, checkQuery, discipline, entityCode]);

  const pickedCheck = checkId ? checks.find((c) => c.id === checkId) ?? null : null;

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setDescription("");
    setDiscipline("");
    setSystem(null);
    setSystemQuery("");
    setCheckId(null);
    setCheckQuery("");
    setError(null);
    setFindingType("non-compliance");
    setCritical(false);
    setSafetyTag(false);
    setPendingAttachments([]);
  };

  const close = () => {
    /* Never assigned anywhere, so never recorded anywhere else — the same
       forgetting AddItemSheet gives a capture that never becomes a real
       item. */
    for (const a of pendingAttachments) void forgetMedia(a.blobKey);
    reset();
    onClose();
  };

  const save = () => {
    const t = title.trim();
    if (!t) {
      setError("Say what you found. It is the one thing this cannot default.");
      return;
    }
    if (!discipline) {
      setError("Pick a discipline. Asset system and check-point are both optional, this is not.");
      return;
    }
    /* SAME DEFAULT SHAPE AS AddItemSheet.tsx'S raiseFinding — copied field for
       field so the two capture paths produce a consistently-shaped finding.
       checkId is null unless a check was picked here, which is exactly the
       case outstandingFor() already carries forward with no filtering on it. */
    const id = addFinding({
      checkId,
      discipline,
      system: system ?? "",
      area: "",
      title: t,
      description: description.trim() || t,
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
      attachments: [],
      findingType,
      ...(critical ? { critical: true } : {}),
      ...(safetyTag ? { safetyTag: true } : {}),
    });
    /* Always the FINDING's own attachments now, checkId picked or not — see
       Finding.attachments' own doc comment. addFindingAttachment generates
       each photo's own F-xxxxx_P01 reference the same way addAttachment
       always has for a check-point photo. */
    for (const { id: _pid, createdAt: _pc, ...rest } of pendingAttachments) {
      void _pid;
      void _pc;
      addFindingAttachment(id, rest);
    }
    onSaved?.(id, `${id} raised${checkId ? "" : " — not tied to a check-point"}`);
    reset();
    onClose();
  };

  const label = "font-display text-[11px] font-semibold";
  const box = "mt-1 w-full rounded-[11px] border px-3 py-2.5 text-[13px] outline-none";
  const boxStyle = { background: "var(--panel)", borderColor: "var(--line-2)" };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Raise a finding"
      footer={
        <>
          <Btn variant="ghost" onClick={close}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={save} style={{ minHeight: 44 }}>
            Raise it
          </Btn>
        </>
      }
    >
      {/* PHOTO AND VOICE, FIRST — field-capture mobile pass. See the note on
         pendingAttachments above for where a capture taken here actually
         ends up.

         LARGE, PRIMARY, AND A GALLERY PICKER ALONGSIDE THE CAMERA — build
         prompt 8 (22 Nov 2026), ported from the old /raise screen rather
         than lost when that screen became a redirect. Sarel, on that
         screen: "I want to upload a photo, because it might be that
         there's some photos already on the phone... the easiest way will
         be then just to select a photo from my gallery." Same handler,
         same resulting attachment either way — PhotoButton's own
         `fromLibrary` prop only changes which OS picker opens. This sheet
         is now the one place every screen's own "+" raises an issue from
         (build prompt 5), so the capability moves with it rather than
         staying behind on the one screen it used to be the only path to. */}
      <div className="flex flex-wrap items-center gap-[10px]">
        <PhotoButton
          large
          primary
          onCaptured={(m) => {
            setPendingAttachments((cur) => [...cur, { ...m, createdBy: auditor, id: uid(), createdAt: Date.now() }]);
          }}
        />
        <PhotoButton
          large
          fromLibrary
          onCaptured={(m) => {
            setPendingAttachments((cur) => [...cur, { ...m, createdBy: auditor, id: uid(), createdAt: Date.now() }]);
          }}
        />
        <VoiceNoteButton
          large
          onCaptured={(m) => {
            setPendingAttachments((cur) => [...cur, { ...m, createdBy: auditor, id: uid(), createdAt: Date.now() }]);
          }}
        />
      </div>
      {pendingAttachments.length > 0 && (
        <div className="mt-2.5">
          <AttachmentStrip
            attachments={pendingAttachments}
            thumbSize={40}
            onRemove={(id) => {
              const a = pendingAttachments.find((x) => x.id === id);
              if (a) void forgetMedia(a.blobKey);
              setPendingAttachments((cur) => cur.filter((x) => x.id !== id));
            }}
            onUpdate={(id, p) =>
              setPendingAttachments((cur) => cur.map((a) => (a.id === id ? { ...a, ...p } : a)))
            }
            writeUp={
              aiOn
                ? (t) =>
                    assist(
                      "transcript",
                      adhocTranscriptContext(t, { description, discipline, system, area: "" })
                    )
                : undefined
            }
            onAccept={(text) =>
              setDescription((cur) => (cur.trim() ? `${cur}\n${text}` : text))
            }
          />
        </div>
      )}

      <label className="mt-4 block">
        <span className={label}>What you found</span>
        <textarea
          autoFocus
          value={title}
          onChange={(e) => {
            setError(null);
            setTitle(e.target.value);
          }}
          placeholder="A short headline — e.g. Fire extinguisher past its service date"
          className={`${box} min-h-[52px] resize-y`}
          style={boxStyle}
        />
      </label>

      <label className="mt-3 block">
        <span className={label}>Description · optional</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Anything else worth recording — defaults to the headline above if left blank"
          className={`${box} min-h-[72px] resize-y`}
          style={boxStyle}
        />
      </label>

      <div className="mt-4">
        <span className={label}>Type</span>
        <div className="mt-1.5 flex flex-wrap gap-[6px]" role="group" aria-label="Finding type">
          {(
            [
              ["non-compliance", "Non-compliance"],
              ["observation", "Observation"],
            ] as const
          ).map(([v, text]) => (
            <button
              key={v}
              type="button"
              aria-pressed={findingType === v}
              onClick={() => setFindingType(v)}
              className="min-h-[38px] rounded-full border px-3 text-[12px] font-semibold"
              style={
                findingType === v
                  ? { background: "var(--acc)", color: "#fff", borderColor: "var(--acc)" }
                  : { background: "var(--panel)", color: "var(--ink-2)", borderColor: "var(--line-2)" }
              }
            >
              {text}
            </button>
          ))}
        </div>
        <span className={`${label} mt-3 block`}>Tag</span>
        <div className="mt-1.5 flex flex-wrap gap-[6px]" role="group" aria-label="Finding tags">
          {(
            [
              ["Critical", critical, setCritical],
              ["Safety", safetyTag, setSafetyTag],
            ] as const
          ).map(([text, on, set]) => (
            <button
              key={text}
              type="button"
              aria-pressed={on}
              onClick={() => set(!on)}
              className="min-h-[38px] rounded-full border px-3 text-[12px] font-semibold"
              style={
                on
                  ? { background: "var(--bad)", color: "#fff", borderColor: "var(--bad)" }
                  : { background: "var(--panel)", color: "var(--ink-2)", borderColor: "var(--line-2)" }
              }
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-2 text-[11.5px]" style={{ color: "var(--warn)" }}>
          {error}
        </div>
      )}

      <div className="mt-4">
        <span className={label}>Discipline</span>
        <div className="mt-1.5">
          <DisciplineChips
            value={discipline || null}
            onChange={(d) => {
              setError(null);
              setDiscipline(d ?? "");
              setSystem(null);
              setCheckId(null);
            }}
            options={disciplines}
          />
        </div>
      </div>

      <div className="mt-4">
        <span className={label}>Asset system · optional</span>
        {system ? (
          <div
            className="mt-1 flex items-center justify-between gap-2 rounded-[11px] border px-3 py-2.5"
            style={boxStyle}
          >
            <span className="text-[13px] font-semibold">{system}</span>
            <button
              onClick={() => setSystem(null)}
              aria-label="Clear asset system"
              className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px]"
              style={{ color: "var(--ink-3)" }}
            >
              <IconX width={14} height={14} />
            </button>
          </div>
        ) : (
          <>
            {/* A COMPACT SEARCHABLE CHOOSER, NOT A WALL OF CHIPS — overnight
                refinement, task 6. This used to render every matching asset
                system (up to 40) as an always-visible row of pill chips the
                moment this field was reached — the "wall of chips" the brief
                names, and the exact opposite shape of the check-point
                chooser two fields down, which already showed its results
                only once there was something to search for. Same
                `systems` list, same discipline scoping, same search box;
                the only change is that the results only render once typing
                starts, matching the check-point field's own pattern so the
                two optional-field choosers in this form behave the same
                way. Nothing about which systems are offered changed. */}
            <div className="mt-1 flex items-center gap-2 rounded-[11px] border px-3" style={boxStyle}>
              <IconSearch width={14} height={14} style={{ color: "var(--ink-3)" }} />
              <input
                value={systemQuery}
                onChange={(e) => setSystemQuery(e.target.value)}
                placeholder="Search the register's asset systems…"
                aria-label="Search asset systems"
                className="min-h-[44px] w-full border-none bg-transparent text-[13px] outline-none"
              />
            </div>
            {systemQuery.trim() && (
              <div
                className="no-scrollbar mt-1.5 max-h-[160px] overflow-y-auto rounded-[11px] border"
                style={{ borderColor: "var(--line)" }}
              >
                {systems.length === 0 ? (
                  <div className="px-3 py-3 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    Nothing matches.
                  </div>
                ) : (
                  systems.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setSystem(s);
                        setSystemQuery("");
                      }}
                      className="flex w-full items-center px-3 py-2 text-left text-[12.5px] hover:bg-[var(--acc-soft)]"
                    >
                      {s}
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4">
        <span className={label}>Check-point · optional</span>
        {pickedCheck ? (
          <div
            className="mt-1 flex items-center justify-between gap-2 rounded-[11px] border px-3 py-2.5"
            style={boxStyle}
          >
            <div className="min-w-0">
              <span className="block font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                {portalIdFor(entityCode, pickedCheck.id)}
              </span>
              <span className="line-clamp-2 block text-[12.5px] leading-snug font-semibold">{pickedCheck.requirement}</span>
            </div>
            <button
              onClick={() => setCheckId(null)}
              aria-label="Clear check-point"
              className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px]"
              style={{ color: "var(--ink-3)" }}
            >
              <IconX width={14} height={14} />
            </button>
          </div>
        ) : (
          <>
            <div className="mt-1 flex items-center gap-2 rounded-[11px] border px-3" style={boxStyle}>
              <IconSearch width={14} height={14} style={{ color: "var(--ink-3)" }} />
              <input
                value={checkQuery}
                onChange={(e) => setCheckQuery(e.target.value)}
                placeholder="Search by ID, wording, system or ACSA figure…"
                aria-label="Search check-points"
                className="min-h-[44px] w-full border-none bg-transparent text-[13px] outline-none"
              />
            </div>
            {checkQuery.trim() && (
              <div className="no-scrollbar mt-1.5 max-h-[160px] overflow-y-auto rounded-[11px] border" style={{ borderColor: "var(--line)" }}>
                {checkResults.length === 0 ? (
                  <div className="px-3 py-3 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    Nothing matches.
                  </div>
                ) : (
                  checkResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCheckId(c.id);
                        setCheckQuery("");
                        /* A check narrows the discipline/system a finding is
                           about — fill them in if nothing was picked yet,
                           same convenience AddItemSheet's area pre-fill gives,
                           never overwriting a deliberate choice already made. */
                        if (!discipline) setDiscipline(c.discipline);
                        if (!system) setSystem(c.system);
                      }}
                      className="flex w-full items-start gap-[9px] px-3 py-2 text-left hover:bg-[var(--acc-soft)]"
                    >
                      <span className="w-[86px] shrink-0 pt-[1px] font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                        {portalIdFor(entityCode, c.id)}
                      </span>
                      <span className="line-clamp-2 min-w-0 flex-1 text-[12px] leading-snug">{c.requirement}</span>
                      <Pill>{c.discipline}</Pill>
                    </button>
                  ))
                )}
              </div>
            )}
            <span className="mt-1 block text-[10.5px]" style={{ color: "var(--ink-4)" }}>
              Leave it blank if this is not about one specific question — it will still carry
              into the next visit&rsquo;s Follow-up screen.
            </span>
          </>
        )}
      </div>
    </Sheet>
  );
}
