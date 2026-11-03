"use client";

/** RAISE A FINDING — a dedicated screen, built fresh.
 *
 *  Sarel, after testing the Inspection tab's own declutter pass on his
 *  phone: "I really think we must create a new tab, start fresh. There's
 *  too many things that's not working there. Keep the structure for
 *  raising a finding." So this keeps RaiseFindingSheet's own fields and
 *  save shape (same addFinding call, same default shape, so a finding
 *  raised from here cannot drift into a different shape from one raised
 *  anywhere else) but drops the check-point picker — a later, back-at-
 *  the-office decision (FindingDetail's own "Link to an audit check"
 *  already does that) — and is its own full screen, not a sheet reached
 *  from somewhere else, because it is now reached from the nav bar
 *  directly.
 *
 *  THE FLOW SAREL ASKED FOR, IN ITS OWN WORDS: "after you raise a finding,
 *  you should be able to capture multiple photos and then record a note
 *  per photo and also a note for the finding itself. So as a minimum you
 *  must record a note for the finding, and if the user wants, he can also
 *  record a note for each photo and then link it to a discipline, asset
 *  system and an area, but minimize it so that after you, for example,
 *  have selected a discipline, it should minimize that section again and
 *  then automatically expand the asset system section."
 *
 *  So: ONE required field (the note for the finding itself — `title`
 *  below). Photos and a voice note are optional, multiple, each with its
 *  own optional caption via AttachmentStrip's own per-item editor — no
 *  new UI needed for that half, it already exists. Discipline, asset
 *  system and area are each their own step, collapsed the moment the one
 *  before it is answered and auto-revealing the next — `Step` below is
 *  the one piece of UI this screen needed that nothing else in the app
 *  already had.
 *
 *  EVIDENCE NOW LIVES ON THE FINDING ITSELF — Finding.attachments, new
 *  (see its own doc comment in types.ts). The gap this is built to close:
 *  a finding with no check-point picked used to have nowhere of its own
 *  to keep a photograph, and the sheet this screen is built from used to
 *  refuse rather than silently drop one. It no longer has to. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AttachmentStrip, PhotoButton, VoiceNoteButton, forgetMedia } from "@/components/Capture";
import DisciplineChips from "@/components/DisciplineChips";
import { Btn, Panel } from "@/components/ui/primitives";
import { IconCheck, IconEdit, IconSearch } from "@/components/ui/icons";
import { areasAt, disciplinesAt, systemsOf, useEntityCode, useStore } from "@/lib/store";
import { checksAt } from "@/lib/register";
import { adhocTranscriptContext, assist, useAssistAvailable } from "@/lib/assist";
import type { Attachment } from "@/lib/types";

const uid = () => Math.random().toString(36).slice(2, 10);

/** ONE STEP OF THE DISCIPLINE → ASSET SYSTEM → AREA RUN.
 *
 *  Collapsed to a single summary row the moment it has a value, same
 *  reasoning AddItemSheet's own asset-system/notes toggles just got (too
 *  much on screen at once is too much on screen at once, whether the
 *  cause is a block that renders unconditionally or three fields open at
 *  the same time) — the difference here is the collapse is automatic, not
 *  tapped, because Sarel asked for the NEXT step to open by itself too:
 *  "once you select something, automatically minimize that section and
 *  show the area." `open` is still a prop, not purely derived from
 *  `value`, so a step that is DONE can still be reopened to change the
 *  answer without losing what the one after it already has. */
function Step({
  label,
  value,
  open,
  onOpen,
  onClear,
  children,
}: {
  label: string;
  value: string | null;
  open: boolean;
  onOpen: () => void;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (!open && value) {
    return (
      <div
        className="mt-3 flex items-center justify-between gap-2 rounded-[11px] border px-3 py-2.5"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
      >
        <div className="min-w-0">
          <span className="label-xs block" style={{ color: "var(--ink-4)" }}>
            {label}
          </span>
          <span className="block truncate text-[13px] font-semibold">{value}</span>
        </div>
        <button
          onClick={onOpen}
          aria-label={`Change ${label.toLowerCase()}`}
          className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px]"
          style={{ color: "var(--ink-3)" }}
        >
          <IconEdit width={13} height={13} />
        </button>
      </div>
    );
  }
  if (!open) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-display text-[11px] font-semibold">{label} · optional</span>
        {value && (
          <button onClick={onClear} className="text-[10.5px] underline" style={{ color: "var(--ink-3)" }}>
            Clear
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export default function RaisePage() {
  const router = useRouter();
  const entityCode = useEntityCode();
  const auditor = useStore((s) => s.auditor);
  const visitId = useStore((s) => s.visit);
  const addFinding = useStore((s) => s.addFinding);
  const addFindingAttachment = useStore((s) => s.addFindingAttachment);
  const aiOn = useAssistAvailable();

  const disciplines = disciplinesAt(entityCode);
  const areas = areasAt(entityCode);
  const checks = checksAt(entityCode);

  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState<string | null>(null);
  const [system, setSystem] = useState<string | null>(null);
  const [systemQuery, setSystemQuery] = useState("");
  const [area, setArea] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* WHICH STEP IS OPEN — advances itself, per Sarel's own instruction.
     Starts on discipline; a step the auditor has not reached yet is
     simply not rendered at all (see Step's own `open` prop), rather than
     rendered disabled, which would still cost the scroll it is meant to
     save. */
  const [openStep, setOpenStep] = useState<"discipline" | "system" | "area" | null>("discipline");

  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);

  const systems = discipline
    ? systemsOf(entityCode, discipline)
    : Array.from(new Set(checks.map((c) => c.system)));
  const systemResults = systemQuery.trim()
    ? systems.filter((s) => s.toLowerCase().includes(systemQuery.trim().toLowerCase())).slice(0, 40)
    : [];

  const reset = () => {
    setTitle("");
    setDiscipline(null);
    setSystem(null);
    setSystemQuery("");
    setArea("");
    setError(null);
    setOpenStep("discipline");
    setPendingAttachments([]);
  };

  const save = () => {
    const t = title.trim();
    if (!t) {
      setError("Say what you found. It is the one thing this cannot default.");
      return;
    }
    const id = addFinding({
      checkId: null,
      discipline: discipline ?? "",
      system: system ?? "",
      area: area.trim(),
      title: t,
      description: t,
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
    });
    /* Each capture joins the FINDING's own attachments — addFindingAttachment
       generates its own F-xxxxx_P01 reference, same convention as every
       other evidence source in this app. */
    for (const { id: _pid, createdAt: _pc, ...rest } of pendingAttachments) {
      void _pid;
      void _pc;
      addFindingAttachment(id, rest);
    }
    setToast(`${id} raised${pendingAttachments.length ? ` · ${pendingAttachments.length} attached` : ""}.`);
    reset();
  };

  const label = "font-display text-[11px] font-semibold";
  const box = "mt-1 w-full rounded-[11px] border px-3 py-2.5 text-[13px] outline-none";
  const boxStyle = { background: "var(--panel)", borderColor: "var(--line-2)" };

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[640px] px-4 pb-24 pt-3">
        <header className="mb-3">
          <h2 className="font-display text-[15px] font-semibold">Raise a finding</h2>
          <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
            Not tied to one of the {checks.length} check-points — something on site worth
            recording on its own. Link it to a check-point later, from the finding itself, if it
            turns out to be about one.
          </p>
        </header>

        {toast && (
          <Panel tone="good" className="mb-3">
            <div className="text-[12px]" style={{ color: "var(--good)" }}>
              {toast}
            </div>
          </Panel>
        )}

        <label className="block">
          <span className={label}>What you found</span>
          <textarea
            autoFocus
            value={title}
            onChange={(e) => {
              setError(null);
              setTitle(e.target.value);
            }}
            placeholder="A short headline — e.g. Fire extinguisher past its service date"
            className={`${box} min-h-[64px] resize-y`}
            style={boxStyle}
          />
        </label>
        {error && (
          <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--warn)" }}>
            {error}
          </div>
        )}

        {/* PHOTO AND VOICE — multiple, each with its own caption via
            AttachmentStrip's own per-item editor (already built; nothing
            new needed for "a note per photo"). */}
        <div className="mt-3 flex flex-wrap items-center gap-[10px]">
          <PhotoButton
            onCaptured={(m) =>
              setPendingAttachments((cur) => [...cur, { ...m, createdBy: auditor, id: uid(), createdAt: Date.now() }])
            }
          />
          <VoiceNoteButton
            onCaptured={(m) =>
              setPendingAttachments((cur) => [...cur, { ...m, createdBy: auditor, id: uid(), createdAt: Date.now() }])
            }
          />
        </div>
        {pendingAttachments.length > 0 && (
          <div className="mt-2.5">
            <AttachmentStrip
              attachments={pendingAttachments}
              thumbSize={44}
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
                  ? (t) => assist("transcript", adhocTranscriptContext(t, { description: title, discipline, system, area }))
                  : undefined
              }
              onAccept={(text) => setTitle((cur) => (cur.trim() ? `${cur}\n${text}` : text))}
            />
          </div>
        )}

        {/* DISCIPLINE → ASSET SYSTEM → AREA, one at a time, each one
            collapsing itself and opening the next the moment it is
            answered — exactly what Sarel described. */}
        <Step
          label="Discipline"
          value={discipline}
          open={openStep === "discipline"}
          onOpen={() => setOpenStep("discipline")}
          onClear={() => {
            setDiscipline(null);
            setSystem(null);
            setOpenStep("discipline");
          }}
        >
          <DisciplineChips
            value={discipline}
            onChange={(d) => {
              setDiscipline(d);
              setSystem(null);
              /* Auto-advance — a discipline picked opens Asset system;
                 clearing it (d === null) stays here rather than jumping
                 forward to a step that would read as skipped. */
              setOpenStep(d ? "system" : "discipline");
            }}
            options={disciplines}
            clearLabel="Not attributed"
          />
        </Step>

        <Step
          label="Asset system"
          value={system}
          open={openStep === "system"}
          onOpen={() => setOpenStep("system")}
          onClear={() => {
            setSystem(null);
            setOpenStep("system");
          }}
        >
          <div className="flex items-center gap-2 rounded-[11px] border px-3" style={boxStyle}>
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
              {systemResults.length === 0 ? (
                <div className="px-3 py-3 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  Nothing matches.
                </div>
              ) : (
                systemResults.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSystem(s);
                      setSystemQuery("");
                      /* Auto-advance to Area — same rule as Discipline. */
                      setOpenStep("area");
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-[12.5px] hover:bg-[var(--acc-soft)]"
                  >
                    {s}
                  </button>
                ))
              )}
            </div>
          )}
        </Step>

        <Step
          label="Area"
          value={area.trim() || null}
          open={openStep === "area"}
          onOpen={() => setOpenStep("area")}
          onClear={() => setArea("")}
        >
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            list="raise-areas"
            placeholder="In your own words — Stand 12, north switch room…"
            className={box}
            style={boxStyle}
          />
          <datalist id="raise-areas">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Step>

        <div className="mt-5 flex items-center gap-2">
          <Btn variant="primary" onClick={save} style={{ minHeight: 44 }}>
            <IconCheck width={14} height={14} />
            Raise it
          </Btn>
          <Btn variant="ghost" onClick={() => router.push("/findings")}>
            See all findings
          </Btn>
        </div>
      </div>
    </div>
  );
}
