"use client";

import { useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Btn, Pill } from "@/components/ui/primitives";
import { IconSearch, IconX } from "@/components/ui/icons";
import { checksAt, disciplinesAt, systemsOf, useEntityCode } from "@/lib/store";
import { portalIdFor } from "@/lib/sites";
import type { AdHocItem } from "@/lib/types";

/** TIE SEVERAL WALKABOUT PHOTOGRAPHS TO ONE CHECK-POINT, IN ONE ACTION.
 *
 *  A walk item never gets a checkId at capture time — nothing in the field
 *  asks for one, on purpose, so capture stays fast while someone is standing
 *  in front of the asset (same reasoning as FindingDetail.tsx's own
 *  LinkToCheck, the closest precedent to this: "capture stays easy in the
 *  field... this is the 'back at the office' half"). Until a walk item's own
 *  checkId is set, sharepoint.ts's own evidence row writes the item's
 *  internal WALK- id into the portal's CheckID column instead of a real
 *  check-point — so the report can never place its photographs under an
 *  asset system, and they only ever show as an unattributed count
 *  ("N walkabout photographs without an audit area"). See that file's
 *  evidenceValues() call for exactly where that line is drawn.
 *
 *  Linking one at a time (RelinkPhotoSheet's pattern, or typing it on
 *  AddItemSheet) does not scale against a site visit that left dozens of
 *  walkabout items untied — Sarel asked for a bulk way to close that gap,
 *  having found the exact same 4-photo bucket unchanged across three
 *  consecutive syncs. This sheet is that: pick several walk items on the
 *  Checks/Inspection screen (field/page.tsx's own checkbox, shown only on
 *  items with no checkId), pick ONE check-point here, and every selected
 *  item gets that same checkId in one store action.
 *
 *  A SINGLE CHECK, NOT ONE PER ITEM — by design. An auditor who ticks five
 *  photographs together is doing so because they are five photographs of
 *  the one thing being inspected; a selection spanning photographs of
 *  different check-points is not what "bulk-link" is for, and the search
 *  below is deliberately NOT narrowed to the selected items' own existing
 *  discipline/system (several walk items ticked together commonly have
 *  none set yet) — it is the same open, searchable picker RelinkPhotoSheet
 *  and RaiseFindingSheet already use, so there is one check-point search
 *  experience in this app, not a second one invented here.
 *
 *  checkId IS SET; discipline/system ARE NOT TOUCHED — unlike
 *  RelinkPhotoSheet, which moves an Attachment that has no discipline or
 *  system of its own at all. A walk item already carries its own
 *  (AddItemSheet lets the auditor set both at capture), and sharepoint.ts's
 *  own evidenceValues() reads the item's discipline/system independently of
 *  checkId — see its comment: "the item carries its OWN discipline/system
 *  ... this only stops throwing away a real answer that was already
 *  sitting on the item." Overwriting it here on a bulk action, silently,
 *  for every item in the batch, is exactly the kind of wrong-but-plausible
 *  value this app's own conventions elsewhere refuse to guess. */

export default function BulkLinkWalkItemsSheet({
  open,
  onClose,
  items,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** The selected walk items, for the preview list at the top of the sheet
   *  — so the auditor can see what they are about to tie before committing. */
  items: AdHocItem[];
  onConfirm: (checkId: string) => void;
}) {
  const entityCode = useEntityCode();
  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const checks = useMemo(() => checksAt(entityCode), [entityCode]);

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

  /* The SAME search RelinkPhotoSheet/RaiseFindingSheet/the ⌘K palette run —
     ID, wording, system, discipline or ACSA figure. No "exclude the current
     check" rule here: unlike RelinkPhotoSheet, these items do not share one
     starting check to exclude, and most have none at all. */
  const checkResults = useMemo(() => {
    const q = checkQuery.trim().toLowerCase();
    const scoped = checks
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
  }, [checks, checkQuery, discipline, system, entityCode]);

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
      title={`Link ${items.length} item${items.length === 1 ? "" : "s"} to a check-point`}
      subtitle="Pick the ONE check-point these are all evidence for. Each item keeps its own discipline and asset system — only the check-point link is set."
      footer={
        <>
          <Btn variant="ghost" onClick={close}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={confirm} disabled={!checkId} style={{ minHeight: 44 }}>
            Link {items.length} item{items.length === 1 ? "" : "s"}
          </Btn>
        </>
      }
    >
      {items.length > 0 && (
        <div
          className="mb-4 max-h-[132px] overflow-y-auto rounded-[11px] border px-3 py-2"
          style={boxStyle}
        >
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2 py-[3px] text-[11.5px]">
              <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                {it.id}
              </span>
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-2)" }}>
                {it.description}
              </span>
            </div>
          ))}
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
