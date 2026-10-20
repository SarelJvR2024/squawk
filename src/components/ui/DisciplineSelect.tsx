"use client";

/** THE DISCIPLINE SELECT — one styled `<select>`, standardised on the radius
 *  and type Capture/Dashboard's middle ground already used: `rounded-[9px]`,
 *  `text-[11.5px]`, `py-[7px]`. Capture, Review, Field, Dashboard, HIRA and
 *  People each re-typed this control with a slightly different radius, font
 *  size or padding; this is the one definition, options and wiring left to
 *  the caller so each screen's actual data and filtering logic is untouched.
 *
 *  Not limited to "discipline" in the literal sense — People's site picker
 *  and Field's discipline/location toggle both use it too, because the
 *  control is the same idea (pick one of a short list of scopes) wearing a
 *  different label. */

export type SelectOption = { value: string; label: string };

export function DisciplineSelect({
  value,
  onChange,
  options,
  ariaLabel = "Discipline",
  title,
  /** Set when the caller wants the "a filter is applied" accent treatment —
   *  Field's discipline/location select highlights itself this way when it
   *  isn't on "All". */
  active = false,
  className = "w-full",
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  title?: string;
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <select
      aria-label={ariaLabel}
      title={title}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`shrink-0 rounded-[9px] border px-2 py-[7px] text-[11.5px] outline-none ${className}`}
      style={{
        ...(active
          ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }
          : { background: "var(--panel)", borderColor: "var(--line-2)" }),
        ...style,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
