"use client";

import { useMemo, useState } from "react";
import { Btn } from "@/components/ui/primitives";
import { AttachmentStrip, PhotoButton, VoiceNoteButton } from "@/components/Capture";
import OutcomeControl from "@/components/OutcomeControl";
import { areasAt, disciplinesAt, systemsOf, useEntityCode, useStore } from "@/lib/store";
import { checksAt } from "@/lib/register";
import { IconCheck, IconSearch, IconX } from "@/components/ui/icons";
import type { AdHocItem, Compliance } from "@/lib/types";

/** ADD SOMETHING THE REGISTER DOES NOT COVER.
 *
 *  The auditor is walking. The budget is about ten seconds: type what you saw,
 *  take the photograph, keep moving. Everything else can be filled in over
 *  coffee, and the sheet reopens on the item to make that easy.
 *
 *  So exactly ONE field is required, and it is the description. Discipline,
 *  asset system, location, outcome and notes are all optional and all default
 *  to empty rather than to a guess:
 *
 *  · An unattributed observation is a real state. Forcing a discipline on it
 *    would put a guess into a client deliverable, and the guess would be
 *    indistinguishable from a judgement.
 *  · Half of what is worth recording on a walk is not about an asset system on
 *    our list. That is itself the finding.
 *
 *  The discipline and location DO pre-fill from whatever the list is filtered
 *  to, because an auditor filtered to Electrical on the apron is almost
 *  certainly recording something electrical on the apron — but a pre-fill is
 *  editable and a requirement is not, and that is the whole difference. */

export default function AddItemSheet({
  open,
  onClose,
  editing,
  /** What the list is filtered to right now, if anything. */
  presetDiscipline,
  presetArea,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The item being completed, or null when this is a new one. */
  editing: AdHocItem | null;
  presetDiscipline?: string | null;
  presetArea?: string | null;
  onSaved?: (id: string, message: string) => void;
}) {
  const entityCode = useEntityCode();
  const auditor = useStore((s) => s.auditor);
  const addAdhoc = useStore((s) => s.addAdhoc);
  const updateAdhoc = useStore((s) => s.updateAdhoc);
  const addAdhocAttachment = useStore((s) => s.addAdhocAttachment);
  const removeAdhocAttachment = useStore((s) => s.removeAdhocAttachment);
  const addFinding = useStore((s) => s.addFinding);
  const visitId = useStore((s) => s.visit);

  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const areas = useMemo(() => areasAt(entityCode), [entityCode]);

  /* A new item's draft. An item being completed writes straight through to the
     store on every change — it already exists, so there is nothing to lose and
     no Save to forget to press. */
  const [draft, setDraft] = useState<{
    description: string;
    discipline: string | null;
    system: string | null;
    area: string;
    outcome: Compliance | null;
    note: string;
  }>({
    description: "",
    discipline: presetDiscipline ?? null,
    system: null,
    area: presetArea ?? "",
    outcome: null,
    note: "",
  });
  const [systemQuery, setSystemQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const item = editing;
  const value = item
    ? {
        description: item.description,
        discipline: item.discipline,
        system: item.system,
        area: item.area,
        outcome: item.outcome,
        note: item.note,
      }
    : draft;

  const set = (p: Partial<typeof draft>) => {
    setError(null);
    if (item) updateAdhoc(item.id, p);
    else setDraft((d) => ({ ...d, ...p }));
  };

  /* The 75 asset systems, scoped to the discipline once one is chosen and
     searched otherwise. Searchable rather than a 75-long select, because a
     select that long is unusable one-handed. */
  const systems = useMemo(() => {
    const all = value.discipline
      ? systemsOf(entityCode, value.discipline)
      : Array.from(new Set(checksAt(entityCode).map((c) => c.system)));
    const q = systemQuery.trim().toLowerCase();
    const list = q ? all.filter((s) => s.toLowerCase().includes(q)) : all;
    return list.slice(0, 40);
  }, [entityCode, value.discipline, systemQuery]);

  if (!open) return null;

  const save = () => {
    const text = value.description.trim();
    if (!text) {
      setError("Say what you found. Everything else can wait.");
      return;
    }
    if (item) {
      onClose();
      return;
    }
    const id = addAdhoc({
      origin: "field",
      description: text,
      discipline: draft.discipline,
      system: draft.system,
      area: draft.area.trim(),
      outcome: draft.outcome,
      note: draft.note.trim(),
      attachments: [],
      findingId: null,
      createdBy: auditor,
    });
    onSaved?.(id, `${id} recorded — not one of the 324`);
    setDraft({
      description: "",
      discipline: presetDiscipline ?? null,
      system: null,
      area: presetArea ?? "",
      outcome: null,
      note: "",
    });
    onClose();
  };

  /* An observation becomes a finding when somebody decides it is one. Offered,
     never automatic: plenty of what is worth recording on a walk is context,
     and a register that raises a finding for every observation is a register
     nobody can work through. The link is kept both ways so the two stay one
     thing rather than becoming two accounts of it. */
  const raiseFinding = () => {
    if (!item || item.findingId) return;
    const id = addFinding({
      checkId: null,
      discipline: item.discipline ?? "",
      /* The asset system if one was named, and the item's own id if not —
         never the string "Ad-hoc", which used to be written here and then
         appeared as an asset system on every screen that groups by one. */
      system: item.system ?? "",
      area: item.area,
      title: "Seen on the walk",
      description: item.description,
      issueIndex: null,
      severity: null,
      likelihood: null,
      ratingConfirmed: false,
      rootCause: "",
      action: "",
      owner: "",
      dueDate: "",
      actionStatus: "Open",
      originVisit: visitId,
      priorRating: null,
      suggestedEvent: "",
      progress: [],
      adHoc: true,
      createdBy: auditor,
    });
    updateAdhoc(item.id, { findingId: id });
    onSaved?.(id, `${id} raised from ${item.id}`);
  };

  const label = "font-display text-[11px] font-semibold";
  const box =
    "mt-1 w-full rounded-[11px] border px-3 py-2.5 text-[13px] outline-none";
  const boxStyle = { background: "var(--panel)", borderColor: "var(--line-2)" };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-start sm:pt-[8vh]"
      style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col rounded-t-[20px] border sm:max-h-[84vh] sm:w-[min(600px,94vw)] sm:rounded-[20px]"
        style={{
          background: "var(--panel)",
          borderColor: "var(--line-2)",
          boxShadow: "var(--e3)",
          /* The sheet's own bottom clears the home indicator. Without this the
             Save button sits under the gesture bar on an iPhone and cannot be
             pressed at all. */
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <h3 className="text-[14px] font-bold">
              {item ? item.id : "Add an inspection item"}
            </h3>
            <p className="mt-[2px] text-[11px]" style={{ color: "var(--ink-3)" }}>
              Something on site the 324 check-points do not cover. It is recorded as
              ours, kept out of the completion count, and marked as such in every export.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[9px]"
            style={{ color: "var(--ink-3)" }}
          >
            <IconX width={16} height={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className={label}>What you found</span>
            <textarea
              autoFocus
              value={value.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Describe what you saw…"
              className={`${box} min-h-[86px] resize-y`}
              style={boxStyle}
            />
          </label>
          {error && (
            <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--warn)" }}>
              {error}
            </div>
          )}

          {/* WP5's layout, applied here from the start: the text has the full
              width and the capture buttons sit under it, rather than sharing
              its horizontal run and squeezing it to a strip. */}
          {item ? (
            <>
              <div className="mt-2 flex justify-end gap-2">
                <PhotoButton
                  compact
                  onCaptured={(m) => addAdhocAttachment(item.id, { ...m, createdBy: auditor })}
                />
                <VoiceNoteButton
                  compact
                  onCaptured={(m) => addAdhocAttachment(item.id, { ...m, createdBy: auditor })}
                />
              </div>
              {item.attachments.length > 0 && (
                <div className="mt-2">
                  <AttachmentStrip
                    attachments={item.attachments}
                    thumbSize={40}
                    onRemove={(id) => removeAdhocAttachment(item.id, id)}
                    onUpdate={(id, p) =>
                      updateAdhoc(item.id, {
                        attachments: item.attachments.map((a) =>
                          a.id === id ? { ...a, ...p } : a
                        ),
                      })
                    }
                  />
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-[11px]" style={{ color: "var(--ink-4)" }}>
              Record it first — photographs and a voice note attach the moment it exists,
              which is one tap away.
            </p>
          )}

          <div className="mt-4">
            <span className={label}>Outcome</span>
            <div className="mt-1.5">
              <OutcomeControl
                value={value.outcome}
                onChange={(o) => set({ outcome: o })}
                size={52}
                idPrefix="adhoc-outcome"
              />
            </div>
            <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--ink-4)" }}>
              Usually Fail. Not forced — leaving it blank means not yet decided, which is
              a real answer on a walk.
            </p>
          </div>

          <label className="mt-4 block">
            <span className={label}>Where</span>
            <input
              value={value.area}
              onChange={(e) => set({ area: e.target.value })}
              list="adhoc-areas"
              placeholder="In your own words — Stand 12, north switch room…"
              className={box}
              style={boxStyle}
            />
            <datalist id="adhoc-areas">
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            {/* THE SAME CAVEAT THE LIST CARRIES, and it belongs here more than
                anywhere: the suggestions in that list are the register's
                categories, and half of them are not places. */}
            <span className="mt-1 block text-[10.5px]" style={{ color: "var(--ink-4)" }}>
              Free text. The suggestions are the register&rsquo;s categories, not physical
              zones — real zone names have not been supplied yet.
            </span>
          </label>

          <label className="mt-4 block">
            <span className={label}>Discipline · optional</span>
            <select
              value={value.discipline ?? ""}
              onChange={(e) => set({ discipline: e.target.value || null, system: null })}
              className={box}
              style={boxStyle}
            >
              <option value="">Not attributed</option>
              {disciplines.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>

          <div className="mt-4">
            <span className={label}>Asset system · optional</span>
            {value.system ? (
              <div
                className="mt-1 flex items-center justify-between gap-2 rounded-[11px] border px-3 py-2.5"
                style={boxStyle}
              >
                <span className="text-[13px] font-semibold">{value.system}</span>
                <button
                  onClick={() => set({ system: null })}
                  aria-label="Clear asset system"
                  className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px]"
                  style={{ color: "var(--ink-3)" }}
                >
                  <IconX width={14} height={14} />
                </button>
              </div>
            ) : (
              <>
                <div
                  className="mt-1 flex items-center gap-2 rounded-[11px] border px-3"
                  style={boxStyle}
                >
                  <IconSearch width={14} height={14} style={{ color: "var(--ink-3)" }} />
                  <input
                    value={systemQuery}
                    onChange={(e) => setSystemQuery(e.target.value)}
                    placeholder="Search the register's asset systems…"
                    aria-label="Search asset systems"
                    className="min-h-[44px] w-full border-none bg-transparent text-[13px] outline-none"
                  />
                </div>
                <div className="no-scrollbar mt-1.5 flex max-h-[132px] flex-wrap gap-[5px] overflow-y-auto">
                  {systems.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        set({ system: s });
                        setSystemQuery("");
                      }}
                      className="rounded-full border px-[11px] py-[7px] text-[11px]"
                      style={{
                        background: "var(--panel)",
                        borderColor: "var(--line)",
                        color: "var(--ink-2)",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <span className="mt-1 block text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                  Leave it blank if none of them fits. Something on site that belongs to no
                  asset system on our list is worth knowing about.
                </span>
              </>
            )}
          </div>

          <label className="mt-4 block">
            <span className={label}>Notes · optional</span>
            <textarea
              value={value.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="Anything else worth recording…"
              className={`${box} min-h-[64px] resize-y`}
              style={boxStyle}
            />
          </label>

          {item && (
            <div
              className="mt-4 rounded-[12px] border p-3"
              style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
            >
              {item.findingId ? (
                <div className="text-[11.5px]" style={{ color: "var(--ink-2)" }}>
                  Raised as finding <b>{item.findingId}</b>. It is on the findings register
                  and rates like any other.
                </div>
              ) : (
                <>
                  <div className="text-[11.5px]" style={{ color: "var(--ink-2)" }}>
                    Is this a finding? Raising one carries this description across and links
                    the two, so it stays one thing rather than two accounts of it.
                  </div>
                  {!item.discipline && (
                    <div className="mt-1.5 text-[11px]" style={{ color: "var(--warn)" }}>
                      No discipline attributed. If this is here because something on site is
                      missing from the register, that is a finding against Asset Information
                      Management — worth considering, not imposed.
                    </div>
                  )}
                  <Btn className="mt-2.5" onClick={raiseFinding}>
                    Raise a finding from this
                  </Btn>
                </>
              )}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: "var(--line)" }}
        >
          <Btn variant="ghost" onClick={onClose}>
            {item ? "Done" : "Cancel"}
          </Btn>
          {!item && (
            <Btn variant="primary" onClick={save} style={{ minHeight: 44 }}>
              <IconCheck width={14} height={14} />
              Record it
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
