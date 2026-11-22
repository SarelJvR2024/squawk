"use client";

/** SETUP — what each audit check needs.
 *
 *  Sarel, 21 Nov 2026: "some audit checks won't need a question or evidence or
 *  an inspection — all 3 isn't always needed and should be set in the config."
 *
 *  Every check needs all three (interview, evidence, walk) until it is switched
 *  off here. The Checks screen then shows only the channels a check needs.
 *  Switch a whole asset system at once, or open it and set single checks.
 *  Stored as exceptions only — see lib/channels.ts. */

import { useMemo, useRef, useState } from "react";
import { CHECKS, ALL_DISCIPLINES } from "@/lib/register";
import { CHANNEL_KEYS, CHANNEL_LABEL, channelCounts, channelsOf } from "@/lib/channels";
import { howToAskCount } from "@/lib/howtoask";
import { DEFAULT_PHOTO_TARGET, photoTarget } from "@/lib/phototargets";
import {
  applyEvidenceImportPlan,
  buildEvidenceImportPlan,
  evidenceImportCounts,
  parseEvidenceList,
  type EvidenceImportPlan,
} from "@/lib/evidenceImport";
import { useEvidenceItems, useStore } from "@/lib/store";
import type { CheckChannelKey } from "@/lib/types";
import { transcribe, useTranscribeAvailable } from "@/lib/assist";
import { supportsRecording, useIsClient, useRecorder } from "@/lib/media";
import { IconUpload } from "@/components/ui/icons";
import { IconMic } from "@/components/ui/icons";

function Toggle({
  on,
  mixed,
  label,
  text,
  onClick,
}: {
  on: boolean;
  mixed?: boolean;
  label: string;
  /** What the chip says: the channel's name. Filled = needed, outline = off. */
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mixed ? "mixed" : on}
      aria-label={label}
      onClick={onClick}
      className="rounded-full border px-3 py-[6px] text-[12px] font-semibold"
      style={{
        borderColor: on || mixed ? "var(--acc)" : "var(--line)",
        background: on ? "var(--acc)" : "transparent",
        color: on ? "#fff" : mixed ? "var(--acc)" : "var(--ink-4)",
      }}
    >
      {text}{mixed ? " (some)" : ""}
    </button>
  );
}

/** Record a short voice note and append its transcript to the How-to-ask
 *  editor it sits beside. Deliberately NOT VoiceNoteButton (Capture.tsx):
 *  that button keeps the recording itself as an attachment, which this note
 *  has nowhere to show — only the transcribed words matter here, so the
 *  blob is discarded once transcribe() has read it.
 *
 *  Appends through `appendHowToAsk` (store.ts), not a note value passed in
 *  as a prop — that value would be whatever `note` the row held at the
 *  moment recording stopped, stale by the time transcribe()'s network
 *  round-trip resolves if anything was typed by hand in between. Reading
 *  the store fresh at write time, inside the store's own updater, cannot
 *  go stale the way a closed-over prop can (code review on this branch
 *  caught the closure version actually doing this). */
function NoteMicButton({ checkId }: { checkId: string }) {
  const canTranscribe = useTranscribeAvailable();
  const isClient = useIsClient();
  const supported = !isClient || supportsRecording();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const appendHowToAsk = useStore((s) => s.appendHowToAsk);

  /* A recording cut off mid-record (the row collapsed, or another check's
     editor opened) must still reach the note, not be silently thrown away
     — same reasoning useRecorder's own doc comment gives, and the same
     thing VoiceNoteButton (Capture.tsx) wires up for this hook. There is
     nobody left mounted to show a failure to by the time this fires, so
     it is best-effort and silent on error, same as that component. */
  const rec = useRecorder((result) => {
    void transcribe(result.blob, "how-to-ask.webm")
      .then(({ text }) => {
        if (text.trim()) appendHowToAsk(checkId, text.trim());
      })
      .catch(() => {});
  });
  const recording = rec.state === "recording";

  async function toggle() {
    if (busy) return;
    if (!recording) {
      setBusy(true);
      setFailed(null);
      await rec.start();
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const result = await rec.stop();
      if (result) {
        const { text } = await transcribe(result.blob, "how-to-ask.webm");
        if (text.trim()) appendHowToAsk(checkId, text.trim());
      }
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Transcription is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  if (!canTranscribe || !supported) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={recording}
        aria-label={recording ? "Stop recording" : "Record a voice note for this field"}
        className="inline-flex items-center gap-1 rounded-full border px-3 py-[6px] text-[12px] font-semibold"
        style={{
          borderColor: recording ? "var(--bad)" : "var(--line)",
          color: recording ? "var(--bad)" : "var(--ink-3)",
        }}
      >
        <IconMic width={13} height={13} />
        {recording ? "Stop" : busy ? "…" : "Voice"}
      </button>
      {failed && (
        <span className="text-[11px]" style={{ color: "var(--bad)" }}>
          {failed}
        </span>
      )}
    </span>
  );
}

/** One check's "How to ask" editor, collapsed to its id/requirement + a
 *  Set/No note chip until opened — 324 open textareas at once is not a
 *  screen anyone could use. */
function CheckNoteRow({
  check,
  note,
  onChange,
  systemCount,
  disciplineCount,
  onApplyToSystem,
  onApplyToDiscipline,
}: {
  check: (typeof CHECKS)[number];
  note: string;
  onChange: (next: string) => void;
  systemCount: number;
  disciplineCount: number;
  onApplyToSystem: () => void;
  onApplyToDiscipline: () => void;
}) {
  const [open, setOpen] = useState(false);
  const set = note.trim().length > 0;
  return (
    <div className="border-t py-2" style={{ borderColor: "var(--line)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-2 text-left"
      >
        <span className="min-w-[240px] flex-1 text-[12.5px] leading-[1.3]">
          <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
            {check.id}
          </span>{" "}
          {check.requirement}
        </span>
        <span
          className="rounded-full border px-2 py-[3px] text-[11px] font-semibold"
          style={{
            borderColor: set ? "var(--acc)" : "var(--line)",
            color: set ? "var(--acc)" : "var(--ink-4)",
          }}
        >
          {set ? "Set" : "No note"}
        </span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => onChange(e.target.value)}
            placeholder="How should an auditor ask this question?"
            aria-label={`How to ask note for ${check.id}`}
            rows={3}
            className="w-full resize-y rounded-[8px] border px-3 py-2 text-[13px]"
            style={{ background: "var(--bg)", borderColor: "var(--line-2)" }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <NoteMicButton checkId={check.id} />
            <button
              type="button"
              onClick={onApplyToSystem}
              className="rounded-full border px-3 py-[6px] text-[12px] font-semibold"
              style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              Apply to {systemCount} checks in this asset system
            </button>
            <button
              type="button"
              onClick={onApplyToDiscipline}
              className="rounded-full border px-3 py-[6px] text-[12px] font-semibold"
              style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              Apply to {disciplineCount} checks in this discipline
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** BULK EVIDENCE LIST UPLOAD — build prompt 6: "upload a CSV/XLSX of
 *  evidence items per check (columns: check id, evidence name). Preview,
 *  then import." Same file-picker-driven, parse → preview → confirm shape
 *  as ImportPackPanel.tsx; nothing is written until Confirm is pressed,
 *  and the preview names exactly what it will do — how many rows, which
 *  are unmapped, which are already logged and will be skipped. */
function BulkEvidenceUpload() {
  const items = useEvidenceItems();
  const addEvidenceItem = useStore((s) => s.addEvidenceItem);
  const fileInput = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<EvidenceImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [showRows, setShowRows] = useState(false);

  async function pickFile(f: File) {
    setError(null);
    setImported(null);
    setPlan(null);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await f.arrayBuffer());
    } catch {
      setError("That file could not be read.");
      return;
    }
    try {
      const rows = parseEvidenceList(bytes, f.name);
      setPlan(buildEvidenceImportPlan(rows, CHECKS, items));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read.");
    }
  }

  function confirm() {
    if (!plan) return;
    const n = applyEvidenceImportPlan(plan, addEvidenceItem);
    setImported(n);
    setPlan(null);
  }

  const counts = plan ? evidenceImportCounts(plan) : null;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-[16px] font-bold">Bulk evidence list upload</h2>
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
        A CSV or XLSX with two columns — &ldquo;check id&rdquo; and &ldquo;evidence
        name&rdquo; — one row per document you want on the custody log before the
        visit. Nothing is imported until you confirm.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pickFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="flex items-center gap-[6px] rounded-full border px-3 py-[6px] text-[12px] font-semibold"
        style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
      >
        <IconUpload width={14} height={14} />
        Choose file
      </button>

      {error && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      {imported !== null && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--good)" }}>
          {imported} evidence request{imported === 1 ? "" : "s"} imported.
        </p>
      )}

      {plan && counts && (
        <div className="mt-3 rounded-[10px] border p-3" style={{ borderColor: "var(--line)" }}>
          <div className="mb-2 flex flex-wrap gap-2 text-[12px]" aria-label="Import preview">
            <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--line)" }}>
              {counts.total} rows
            </span>
            <span
              className="rounded-full border px-3 py-1"
              style={{ borderColor: "var(--acc)", color: "var(--acc)" }}
            >
              {counts.toImport} to import
            </span>
            {counts.alreadyLogged > 0 && (
              <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--line)" }}>
                {counts.alreadyLogged} already logged — skipped
              </span>
            )}
            {counts.unmapped > 0 && (
              <span
                className="rounded-full border px-3 py-1"
                style={{ borderColor: "var(--warn-line)", color: "var(--warn)" }}
              >
                {counts.unmapped} unmapped check id{counts.unmapped === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowRows((v) => !v)}
            className="mb-2 font-mono text-[9.5px] uppercase tracking-[.04em]"
            style={{ color: "var(--acc)" }}
          >
            {showRows ? "Hide every row" : "Show every row"}
          </button>
          {showRows && (
            <div className="mb-2 max-h-[280px] overflow-y-auto">
              {plan.rows.map((r) => (
                <div
                  key={r.rowIndex}
                  className="flex items-center justify-between gap-2 border-t py-1.5 text-[11.5px]"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                      {r.checkId}
                    </span>{" "}
                    {r.title || "—"}
                  </span>
                  <span
                    className="shrink-0 font-mono text-[9px] uppercase"
                    style={{ color: !r.check ? "var(--warn)" : r.alreadyLogged ? "var(--ink-4)" : "var(--acc)" }}
                  >
                    {!r.check ? "Unmapped" : r.alreadyLogged ? "Already logged" : "Will import"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={confirm}
            disabled={counts.toImport === 0}
            className="rounded-full px-4 py-[8px] text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--acc)" }}
          >
            Confirm — import {counts.toImport} row{counts.toImport === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SetupPage() {
  const config = useStore((s) => s.checkChannels);
  const setCheckChannels = useStore((s) => s.setCheckChannels);
  const howToAsk = useStore((s) => s.howToAsk);
  const setHowToAsk = useStore((s) => s.setHowToAsk);
  const photoTargets = useStore((s) => s.photoTargets);
  const setPhotoTarget = useStore((s) => s.setPhotoTarget);
  const [discipline, setDiscipline] = useState<string>("");
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = CHECKS.filter(
      (c) =>
        (!discipline || c.discipline === discipline) &&
        (!needle || `${c.id} ${c.requirement} ${c.system}`.toLowerCase().includes(needle)),
    );
    const map = new Map<string, typeof rows>();
    for (const c of rows) {
      const k = `${c.discipline} · ${c.system}`;
      map.set(k, [...(map.get(k) ?? []), c]);
    }
    return [...map.entries()];
  }, [discipline, q]);

  const totals = channelCounts(config, CHECKS.map((c) => c.id));

  /* Every check CURRENTLY IN SCOPE — the discipline picked above, or the
     whole register when none is. Not `groups`' own flattened checks: those
     are also narrowed by the search box, and a bulk tool that quietly
     shrinks to match a half-typed search is a bulk tool nobody can trust. */
  const scopeChecks = discipline ? CHECKS.filter((c) => c.discipline === discipline) : CHECKS;
  const scopeIds = scopeChecks.map((c) => c.id);
  const scopeLabel = discipline || "every discipline";
  const scopeCounts = channelCounts(config, scopeIds);

  const resetScope = () => {
    if (
      window.confirm(
        `Reset ${scopeIds.length} check${scopeIds.length === 1 ? "" : "s"} in ${scopeLabel} to needing interview, evidence and walk? This clears every exception set for them.`,
      )
    ) {
      setCheckChannels(scopeIds, { interview: true, evidence: true, walk: true });
    }
  };

  const howToAskTotal = howToAskCount(howToAsk, CHECKS.map((c) => c.id));

  return (
    <div className="app-scroll mx-auto min-h-0 w-full max-w-[900px] flex-1 overflow-y-auto px-4 py-4">
      <h1 className="mb-1 text-[18px] font-bold">Setup</h1>
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
        Choose what each audit check needs. A check that needs no interview, evidence or walk
        will not show it on the Checks screen.
      </p>
      <div className="mb-3 flex flex-wrap gap-2 text-[12px]" aria-label="Totals">
        {CHANNEL_KEYS.map((k) => (
          <span key={k} className="rounded-full border px-3 py-1" style={{ borderColor: "var(--line)" }}>
            {CHANNEL_LABEL[k]} needed on {totals[k]} of {CHECKS.length}
          </span>
        ))}
      </div>
      <div
        className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
        style={{ borderColor: "var(--line)" }}
      >
        <span className="min-w-[160px] flex-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
          Apply to all {scopeIds.length} checks in {scopeLabel}:
        </span>
        {CHANNEL_KEYS.map((k: CheckChannelKey) => (
          <Toggle
            key={k}
            text={CHANNEL_LABEL[k]}
            label={`${CHANNEL_LABEL[k]} for every check in ${scopeLabel}`}
            on={scopeCounts[k] === scopeIds.length}
            mixed={scopeCounts[k] > 0 && scopeCounts[k] < scopeIds.length}
            onClick={() =>
              setCheckChannels(scopeIds, { [k]: scopeCounts[k] !== scopeIds.length })
            }
          />
        ))}
        <button
          type="button"
          onClick={resetScope}
          className="rounded-full border px-3 py-[6px] text-[12px] font-semibold"
          style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
        >
          Reset to all three
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search checks…"
          aria-label="Search checks"
          className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-[14px]"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        />
        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          aria-label="Discipline"
          className="rounded-md border px-3 py-2 text-[14px]"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        >
          <option value="">All disciplines</option>
          {ALL_DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {groups.length === 0 && <p className="text-[13px]">No checks match.</p>}

      {groups.map(([name, checks]) => {
        const ids = checks.map((c) => c.id);
        const n = channelCounts(config, ids);
        return (
          <details key={name} className="mb-2 rounded-lg border" style={{ borderColor: "var(--line)" }}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-[180px] flex-1 text-[14px] font-semibold">
                {name} <span style={{ color: "var(--ink-4)" }}>({checks.length})</span>
              </span>
              {CHANNEL_KEYS.map((k: CheckChannelKey) => (
                <span key={k} onClick={(e) => e.stopPropagation()}>
                  <Toggle
                    text={CHANNEL_LABEL[k]}
                    label={`${CHANNEL_LABEL[k]} for every check in ${name}`}
                    on={n[k] === ids.length}
                    mixed={n[k] > 0 && n[k] < ids.length}
                    onClick={() => setCheckChannels(ids, { [k]: n[k] !== ids.length })}
                  />
                </span>
              ))}
            </summary>
            <div className="border-t px-3 py-2" style={{ borderColor: "var(--line)" }}>
              <div className="mb-1 text-[11px]" style={{ color: "var(--ink-4)" }}>
                Filled = the check needs it. Outline = off.
              </div>
              {checks.map((c) => {
                const ch = channelsOf(config, c.id);
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t py-2" style={{ borderColor: "var(--line)" }}>
                    <span className="min-w-[240px] flex-1 text-[12.5px] leading-[1.3]">
                      <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                        {c.id}
                      </span>{" "}
                      {c.requirement}
                    </span>
                    {CHANNEL_KEYS.map((k) => (
                      <Toggle
                        key={k}
                        text={CHANNEL_LABEL[k]}
                        label={`${CHANNEL_LABEL[k]} for ${c.id}`}
                        on={ch[k]}
                        onClick={() => setCheckChannels([c.id], { [k]: !ch[k] })}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}

      {/* Build prompt 4, 21 Nov 2026: an optional per-check note, written
          here, shown on the Checks screen during the interview. Uses the
          same search/discipline filter above it, rather than a second copy
          of that UI for one more list. */}
      <h2 className="mt-6 mb-1 text-[16px] font-bold">How to ask notes</h2>
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
        Optional guidance for how to phrase a question during the interview. Never shown in a
        report.
      </p>
      <div className="mb-3 flex flex-wrap gap-2 text-[12px]" aria-label="How to ask totals">
        <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--line)" }}>
          {howToAskTotal} of {CHECKS.length} set
        </span>
      </div>

      {groups.map(([name, checks]) => {
        const groupIds = checks.map((c) => c.id);
        const groupSet = howToAskCount(howToAsk, groupIds);
        return (
          <details key={`notes-${name}`} className="mb-2 rounded-lg border" style={{ borderColor: "var(--line)" }}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-[180px] flex-1 text-[14px] font-semibold">
                {name} <span style={{ color: "var(--ink-4)" }}>({checks.length})</span>
              </span>
              <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                {groupSet} of {checks.length} set
              </span>
            </summary>
            <div className="border-t px-3 py-2" style={{ borderColor: "var(--line)" }}>
              {checks.map((c) => {
                /* The FULL asset system and discipline, from the unfiltered
                   register — not `groupIds`/`checks` above, which are
                   narrowed by the search box. "Apply to N checks" under an
                   active search must mean every check in that system or
                   discipline, not just the ones the search happens to be
                   showing right now — same reasoning `scopeChecks` above
                   already applies to the channel-switch bulk bar. */
                const systemIds = CHECKS.filter(
                  (x) => x.discipline === c.discipline && x.system === c.system,
                ).map((x) => x.id);
                const disciplineIds = CHECKS.filter((x) => x.discipline === c.discipline).map((x) => x.id);
                return (
                  <CheckNoteRow
                    key={c.id}
                    check={c}
                    note={howToAsk[c.id] ?? ""}
                    onChange={(next) => setHowToAsk([c.id], next)}
                    systemCount={systemIds.length}
                    disciplineCount={disciplineIds.length}
                    onApplyToSystem={() => {
                      const note = howToAsk[c.id] ?? "";
                      if (
                        window.confirm(
                          `Apply this note to all ${systemIds.length} checks in ${name}? This replaces any note already set on them.`,
                        )
                      ) {
                        setHowToAsk(systemIds, note);
                      }
                    }}
                    onApplyToDiscipline={() => {
                      const note = howToAsk[c.id] ?? "";
                      if (
                        window.confirm(
                          `Apply this note to all ${disciplineIds.length} checks in ${c.discipline}? This replaces any note already set on them.`,
                        )
                      ) {
                        setHowToAsk(disciplineIds, note);
                      }
                    }}
                  />
                );
              })}
            </div>
          </details>
        );
      })}

      {/* Build prompt 7 (Walk screen, 22 Nov 2026): a photo counter against a
          target on the Walk screen, so the auditor knows when they have
          photographed enough of a discipline. Per discipline, not per
          check — a target that fine-grained would need its own list the
          size of the register for no benefit nobody asked for. A blank box
          means "use the default" (DEFAULT_PHOTO_TARGET); typing 0 or
          clearing it both read the same way, via setPhotoTarget. */}
      <h2 className="mt-6 mb-1 text-[16px] font-bold">Photo targets</h2>
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
        How many photographs the Walk screen expects per discipline, for its own counter. Leave
        blank to use the default of {DEFAULT_PHOTO_TARGET}.
      </p>
      <div className="mb-3 rounded-lg border" style={{ borderColor: "var(--line)" }}>
        {ALL_DISCIPLINES.map((d, i) => (
          <div
            key={d}
            className="flex items-center gap-2 px-3 py-2"
            style={i > 0 ? { borderTop: "1px solid var(--line)" } : undefined}
          >
            <span className="min-w-[160px] flex-1 text-[13px]">{d}</span>
            <input
              type="number"
              min={1}
              value={photoTargets[d] ?? ""}
              onChange={(e) => setPhotoTarget(d, Number(e.target.value))}
              placeholder={String(DEFAULT_PHOTO_TARGET)}
              aria-label={`Photo target for ${d}`}
              className="w-[80px] rounded-md border px-2 py-1 text-[13px]"
              style={{ borderColor: "var(--line)", background: "var(--bg)" }}
            />
            <span className="w-[70px] text-[11px]" style={{ color: "var(--ink-4)" }}>
              now {photoTarget(photoTargets, d)}
            </span>
          </div>
        ))}
      </div>

      <BulkEvidenceUpload />
    </div>
  );
}
