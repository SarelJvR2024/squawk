"use client";

import { useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Btn, Pill } from "@/components/ui/primitives";
import { IconSearch, IconX } from "@/components/ui/icons";
import { checksAt, disciplinesAt, systemsOf, useEntityCode } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import type { Attachment } from "@/lib/types";

/** RE-LINK A PHOTOGRAPH TO A DIFFERENT CHECK, from the Review screen.
 *
 *  Sarel: "I see some photos might not be linked to the correct asset system
 *  or to the correct audit check... for each photo, we need to build in a
 *  function where we can link if the photo is in the wrong space, wrong
 *  question, wrong asset type. We must have a function there where we can
 *  change the asset type and or audit question that it is linked to."
 *
 *  An attachment has no checkId of its own (see Attachment in types.ts) —
 *  which check it is evidence for is entirely which Response.attachments
 *  array it lives in. Picking a NEW check here is therefore picking both the
 *  asset type and the audit question in one step: a check belongs to exactly
 *  one asset system, so there is no separate "just move the asset system"
 *  action to offer — moving the check moves both, correctly, every time.
 *
 *  Same picker as RaiseFindingSheet.tsx's check-point search (discipline
 *  filter, asset-system chips, the same fuzzy-match string the ⌘K jump-to-
 *  check palette already uses) — one search experience across the app, not
 *  a second one invented for this sheet. The difference: there a check is
 *  optional context for a new finding; here it is the whole point, so
 *  nothing can be confirmed until one is picked, and the current check is
 *  excluded from its own results (re-linking a photo to the check it is
 *  already on is not a move). */

export default function RelinkPhotoSheet({
  open,
  onClose,
  photo,
  fromCheckId,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** The photograph being moved, for the preview at the top of the sheet —
   *  so the auditor can see they picked up the right one before committing. */
  photo: Attachment | null;
  fromCheckId: string;
  onConfirm: (toCheckId: string) => void;
}) {
  const entityCode = useEntityCode();
  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const checks = useMemo(() => checksAt(entityCode), [entityCode]);
  const fromCheck = useMemo(() => checks.find((c) => c.id === fromCheckId) ?? null, [checks, fromCheckId]);

  const [discipline, setDiscipline] = useState<string>("");
  const [system, setSystem] = useState<string | null>(null);
  const [systemQuery, setSystemQuery] = useState("");
  const [checkId, setCheckId] = useState<string | null>(null);
  const [checkQuery, setCheckQuery] = useState("");

  const systems = useMemo(() => {
    const all = discipline
      ? systemsOf(entityCode, discipline)
      : Array.from(new Set(checks.map((c) => c.system)));
    const q = systemQuery.trim().toLowerCase();
    const list = q ? all.filter((s) => s.toLowerCase().includes(q)) : all;
    return list.slice(0, 40);
  }, [entityCode, discipline, systemQuery, checks]);

  /* The SAME search RaiseFindingSheet.tsx and the ⌘K jump-to-check palette
     (AppShell.tsx) run — ID, wording, system, discipline or ACSA figure.
     The check this photo is currently on is excluded: it is not a
     destination, it is where the photo already is. */
  const checkResults = useMemo(() => {
    const q = checkQuery.trim().toLowerCase();
    const scoped = checks
      .filter((c) => c.id !== fromCheckId)
      .filter((c) => !discipline || c.discipline === discipline)
      .filter((c) => !system || c.system === system);
    return scoped
      .filter(
        (c) =>
          !q ||
          `${portalIdFor(entityCode, c.id)} ${c.requirement} ${c.system} ${c.discipline} ${c.acsaThreshold}`
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 30);
  }, [checks, checkQuery, discipline, system, fromCheckId, entityCode]);

  const pickedCheck = checkId ? checks.find((c) => c.id === checkId) ?? null : null;

  if (!open) return null;

  const reset = () => {
    setDiscipline("");
    setSystem(null);
    setSystemQuery("");
    setCheckId(null);
    setCheckQuery("");
  };

  const close = () => {
    reset();
    onClose();
  };

  const confirm = () => {
    if (!checkId) return;
    onConfirm(checkId);
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
      title="Move this photo"
      subtitle="Pick the check-point this photograph is actually evidence for — picking it also fixes the asset system and discipline it's filed under, since a check belongs to exactly one of each."
      footer={
        <>
          <Btn variant="ghost" onClick={close}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={confirm} disabled={!checkId} style={{ minHeight: 44 }}>
            Move photo
          </Btn>
        </>
      }
    >
      {photo && (
        <div
          className="mb-4 flex items-center gap-[10px] rounded-[11px] border px-3 py-2.5"
          style={boxStyle}
        >
          {photo.thumbDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.thumbDataUrl}
              alt={photo.caption || photo.name}
              className="h-[44px] w-[44px] shrink-0 rounded-[8px] object-cover"
            />
          ) : (
            <span
              className="block h-[44px] w-[44px] shrink-0 rounded-[8px]"
              style={{ background: "var(--sunken)" }}
            />
          )}
          <div className="min-w-0">
            <span className="block truncate text-[12.5px]" style={{ color: photo.caption ? "var(--ink-1)" : "var(--ink-3)" }}>
              {photo.caption || "No caption"}
            </span>
            {fromCheck && (
              <span className="block truncate text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                Currently on {portalIdFor(entityCode, fromCheckId)} · {fromCheck.system}
              </span>
            )}
          </div>
        </div>
      )}

      <label className="block">
        <span className={label}>Discipline · optional, narrows the search</span>
        <select
          value={discipline}
          onChange={(e) => {
            setDiscipline(e.target.value);
            setSystem(null);
            setCheckId(null);
          }}
          className={box}
          style={boxStyle}
        >
          <option value="">Every discipline</option>
          {disciplines.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>

      <div className="mt-4">
        <span className={label}>Asset system · optional, narrows the search</span>
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
            <div className="no-scrollbar mt-1.5 flex max-h-[132px] flex-wrap gap-[5px] overflow-y-auto">
              {systems.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSystem(s);
                    setSystemQuery("");
                  }}
                  className="rounded-full border px-[11px] py-[7px] text-[11px]"
                  style={{ background: "var(--panel)", borderColor: "var(--line)", color: "var(--ink-2)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4">
        <span className={label}>Check-point</span>
        {pickedCheck ? (
          <div
            className="mt-1 flex items-center justify-between gap-2 rounded-[11px] border px-3 py-2.5"
            style={boxStyle}
          >
            <div className="min-w-0">
              <span className="block font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                {portalIdFor(entityCode, pickedCheck.id)}
              </span>
              <span className="block truncate text-[12.5px] font-semibold">{pickedCheck.requirement}</span>
              <span className="block truncate text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                {pickedCheck.discipline} · {pickedCheck.system}
              </span>
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
                autoFocus
                value={checkQuery}
                onChange={(e) => setCheckQuery(e.target.value)}
                placeholder="Search by ID, wording, system or ACSA figure…"
                aria-label="Search check-points"
                className="min-h-[44px] w-full border-none bg-transparent text-[13px] outline-none"
              />
            </div>
            <div className="no-scrollbar mt-1.5 max-h-[220px] overflow-y-auto rounded-[11px] border" style={{ borderColor: "var(--line)" }}>
              {checkResults.length === 0 ? (
                <div className="px-3 py-3 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  {checkQuery.trim() ? "Nothing matches." : "Type to search, or narrow by discipline/asset system above."}
                </div>
              ) : (
                checkResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCheckId(c.id);
                      setCheckQuery("");
                    }}
                    className="flex w-full items-center gap-[9px] px-3 py-2 text-left hover:bg-[var(--acc-soft)]"
                  >
                    <span className="w-[86px] shrink-0 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                      {portalIdFor(entityCode, c.id)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px]">{c.requirement}</span>
                    <Pill>{c.system}</Pill>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
