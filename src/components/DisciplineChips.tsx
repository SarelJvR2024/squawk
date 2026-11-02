"use client";

/** A 1-tap discipline picker — chips, not a `<select>`, sized for a gloved
 *  thumb. Shared by RaiseFindingSheet and AddItemSheet, field-capture
 *  mobile pass, so the two fast-capture entry points pick a discipline the
 *  same way rather than one being a dropdown and the other a row of chips.
 *  44px, matching the compliance buttons' own touch target elsewhere in
 *  this app, not Chip's smaller 28-ish px form (ui/primitives.tsx) — that
 *  one is sized for a dense row of many short tags; this is a single
 *  required-feeling choice an auditor makes once per finding. */
export default function DisciplineChips({
  value,
  onChange,
  options,
  clearLabel,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  options: string[];
  /** Rendered as its own chip when supplied — e.g. "Not attributed" — so an
   *  OPTIONAL field can be explicitly cleared with the same one-tap gesture
   *  that picks a value, rather than needing a separate X button somewhere
   *  else. Omit it where the field is required and must always carry one of
   *  `options` (RaiseFindingSheet's own call — discipline is the one thing
   *  that sheet will not let through blank). */
  clearLabel?: string;
}) {
  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex min-h-[44px] items-center justify-center rounded-full border px-[15px] text-[12.5px] font-semibold transition-[var(--t)] active:translate-y-[1px]"
      style={
        on
          ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
          : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
      }
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-[7px]">
      {options.map((d) => chip(d, value === d, () => onChange(d)))}
      {clearLabel && chip(clearLabel, value === null, () => onChange(null))}
    </div>
  );
}
