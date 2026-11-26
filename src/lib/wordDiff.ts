/** Word-level diff and an offline "basic tidy", for the wording review.
 *  Pure functions, no model and no network. */

export interface DiffPart {
  text: string;
  kind: "same" | "add" | "del";
}

/** Longest-common-subsequence diff over words (whitespace kept attached). */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.match(/\S+\s*/g) ?? [];
  const b = after.match(/\S+\s*/g) ?? [];
  const norm = (s: string) => s.trim();
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (text: string, kind: DiffPart["kind"]) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(a[i]) === norm(b[j])) {
      push(b[j], "same");
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(a[i++], "del");
    } else {
      push(b[j++], "add");
    }
  }
  while (i < n) push(a[i++], "del");
  while (j < m) push(b[j++], "add");
  return out;
}

const CONTRACTIONS: [RegExp, string][] = [
  [/\bdont\b/gi, "do not"],
  [/\bdoesnt\b/gi, "does not"],
  [/\bcant\b/gi, "cannot"],
  [/\bwont\b/gi, "will not"],
  [/\bisnt\b/gi, "is not"],
  [/\barent\b/gi, "are not"],
  [/\bwasnt\b/gi, "was not"],
  [/\bdidnt\b/gi, "did not"],
  [/\bcouldnt\b/gi, "could not"],
  [/\bshouldnt\b/gi, "should not"],
  [/\bnot working properly\b/gi, "not functioning correctly"],
  [/\bbroken\b/gi, "defective"],
  [/\brusted\b/gi, "corroded"],
  [/\bno one\b/gi, "no person"],
];

/** Rule-based tidy: spacing, capital letters, contractions, full stop. It
 *  fixes presentation only and never adds facts, so it cannot be wrong about
 *  the airport. Used when the AI is off or failing. */
export function basicTidy(text: string): string {
  let t = text.replace(/[ \t]+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to);
  t = t.replace(/\bi\b/g, "I");
  t = t
    .split(/(?<=[.!?])\s+/)
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");
  if (t && !/[.!?]$/.test(t)) t += ".";
  return t;
}
