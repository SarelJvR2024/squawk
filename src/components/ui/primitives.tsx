"use client";

import type { ReactNode, ButtonHTMLAttributes } from "react";

export type Tone = "good" | "bad" | "warn" | "neutral" | "accent";

const toneVars: Record<Tone, { fg: string; bg: string; line: string }> = {
  good: { fg: "var(--good)", bg: "var(--good-bg)", line: "var(--good-line)" },
  bad: { fg: "var(--bad)", bg: "var(--bad-bg)", line: "var(--bad-line)" },
  warn: { fg: "var(--warn)", bg: "var(--warn-bg)", line: "var(--warn-line)" },
  neutral: { fg: "var(--neu)", bg: "var(--neu-bg)", line: "var(--line-2)" },
  accent: { fg: "var(--acc)", bg: "var(--acc-soft)", line: "var(--acc-line)" },
};

export function Pill({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  const t = toneVars[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-mono text-[9.5px] font-semibold whitespace-nowrap"
      style={{ background: t.bg, color: t.fg }}
    >
      {children}
    </span>
  );
}

export function Dot({
  tone,
  hollow = false,
  label,
}: {
  tone: Tone | "pending";
  hollow?: boolean;
  /** What this colour MEANS, for anyone who cannot see it.
   *
   *  A dot is the fastest thing on the screen to read and the only thing on it
   *  that says nothing at all to a screen reader — and roughly one man in
   *  twelve cannot separate the red one from the green one either. The label is
   *  per call site rather than derived from the tone, because the same three
   *  colours mean a rating band on Findings, a verification outcome on
   *  Follow-up and whether an answer is saved on Capture. */
  label?: string;
}) {
  const bg =
    tone === "pending" ? "var(--line-3)" : toneVars[tone as Tone].fg;
  /* HOLLOW means answered but not saved: the colour already says what the
     answer is, the ring says it is not committed yet. A different colour would
     have been a fourth thing to learn; an outline of the colour you are about
     to get reads as "on its way" without a legend. */
  return (
    <span
      className="mt-[5px] flex h-[7px] w-[7px] shrink-0 rounded-full"
      title={label}
      style={{
        background: hollow ? "transparent" : bg,
        boxShadow: hollow ? `inset 0 0 0 2px ${bg}` : "none",
        transition: "var(--t)",
      }}
    >
      {/* The full stop matters: the row beside this reads "F-PRZCN · Electrical",
          and without it the two text nodes are announced as "AmberF-PRZCN". */}
      {label ? <span className="sr-only">{label}. </span> : null}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  icon?: boolean;
};

export function Btn({
  variant = "default",
  icon = false,
  className = "",
  children,
  ...rest
}: BtnProps) {
  const base =
    "inline-flex items-center gap-[7px] font-display font-semibold text-[12px] rounded-[11px] transition-[var(--t)] active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed";
  const pad = icon ? "p-[9px] rounded-[8px]" : "px-[15px] py-[9px]";
  const styles =
    variant === "primary"
      ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)", boxShadow: "var(--e1)" }
      : variant === "ghost"
        ? { background: "transparent", borderColor: "transparent", color: "var(--ink-2)" }
        : /* Destructive actions stop borrowing the neutral style. "Remove this
             hazard" sitting in the same grey as "Previous" is a decision of a
             different weight wearing the same clothes. */
          variant === "danger"
          ? { background: "var(--bad-bg)", borderColor: "var(--bad-line, var(--bad))", color: "var(--bad)" }
          : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink)" };
  return (
    <button
      {...rest}
      className={`${base} ${pad} border ${className}`}
      style={{ ...styles, ...(rest.style ?? {}) }}
    >
      {children}
    </button>
  );
}

/** Answer Library chip — the core capture control. */
export function Chip({
  children,
  selected = false,
  kind = "plain",
  onClick,
  title,
}: {
  children: ReactNode;
  selected?: boolean;
  kind?: "plain" | "evidence" | "issue";
  onClick?: () => void;
  title?: string;
}) {
  let style: React.CSSProperties = {
    background: "var(--panel)",
    borderColor: "var(--line-2)",
    color: "var(--ink-2)",
  };
  if (kind === "issue") {
    style = selected
      ? { background: "var(--bad)", borderColor: "var(--bad)", color: "#fff" }
      : { background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad)" };
  } else if (selected) {
    style =
      kind === "evidence"
        ? { background: "var(--good)", borderColor: "var(--good)", color: "#fff" }
        : { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" };
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex items-center gap-[6px] rounded-full border px-[11px] py-[6px] text-left text-[11.5px] leading-[1.4] transition-[var(--t)] hover:-translate-y-[1px] active:translate-y-0"
      style={style}
    >
      {children}
    </button>
  );
}

export function Panel({
  children,
  tone,
  className = "",
}: {
  children: ReactNode;
  tone?: "accent" | "warn";
  className?: string;
}) {
  const style: React.CSSProperties =
    tone === "accent"
      ? { background: "var(--acc-soft)", borderColor: "var(--acc-line)" }
      : tone === "warn"
        ? { background: "var(--warn-bg)", borderColor: "var(--warn-line)" }
        : { background: "var(--panel)", borderColor: "var(--line)" };
  return (
    <div
      className={`rounded-[11px] border px-[13px] py-[11px] ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <b className="font-display text-[11px] font-semibold">{label}</b>
        {hint ? (
          <span className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center gap-2 px-5 py-10 text-center text-[12px]"
      style={{ color: "var(--ink-3)" }}
    >
      {children}
    </div>
  );
}

export function Track({ pct, color = "var(--acc)" }: { pct: number; color?: string }) {
  return (
    <div className="track">
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}
