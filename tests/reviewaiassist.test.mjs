import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* REVIEW AI ASSIST ACTIONS (PRIORITY 4 of the Review redesign) — Risk &
 * root cause tab only. "Place AI actions beside the text, recording or
 * links they improve. Every AI change must be a proposal requiring
 * review and approval. Rejection leaves the original untouched. Never
 * invent ACSA requirements."
 *
 * Reuses the "polish" task and polishContext (src/lib/assistPrompts.ts,
 * src/lib/assist.ts) rather than a new prompt — both already existed,
 * already carried SYSTEM's house rules, and polishContext's own doc
 * comment names "a finding's title" as exactly the right `about`
 * argument; they had simply never been called from anywhere before this.
 * Same ephemeral Accept/Edit/Reject shape EvidenceReviewPanel.tsx already
 * uses for its own suggestions.
 *
 * Source-text regex convention, same as every other review suite. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

const panel = read("src", "components", "ReviewRiskPanel.tsx");
const assistPrompts = read("src", "lib", "assistPrompts.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · reuses the existing "polish" task, never a new prompt -------- */

check(
  "the panel calls the existing \"polish\" task via polishContext, not a new prompt entry",
  /import \{ assist, polishContext, useAssistAvailable \} from "@\/lib\/assist"/.test(panel) &&
    /assist\(\s*\n\s*"polish",/.test(panel)
);
check(
  "polishContext is called with the finding's own discipline/system/title, kind \"note\"",
  /polishContext\(finding\.description, finding\.discipline, finding\.system, "note", finding\.title \|\| undefined\)/.test(
    panel
  )
);
check(
  "no new entry was added to TASK_PROMPT for this — the existing \"polish\" prompt is reused as written",
  (() => {
    const tasks = assistPrompts.match(/export type Task =[\s\S]*?;/)?.[0] ?? "";
    return /\| "polish"/.test(tasks) && !/"reviewPolish"|"suggestWording"|"reviewWording"/.test(assistPrompts);
  })()
);
check(
  "the shared SYSTEM house rules (never invent a fact; the auditor decides) still apply — SYSTEM is not duplicated or overridden for this call",
  /Never invent a fact, a figure, a date, an interval, a clause number or an ACSA document number/.test(
    assistPrompts
  ) && !/polish.*SYSTEM\s*=|SYSTEM\s*=.*polish/i.test(panel)
);

/* ---- 2 · the button sits beside the field it improves, gated like every
   other AI entry point in the app ---------------------------------------- */

check(
  "the button is gated on useAssistAvailable, same convention EvidenceReviewPanel's own AI section uses",
  /const aiOn = useAssistAvailable\(\);/.test(panel) && /\{aiOn && \(/.test(panel)
);
check(
  "the button sits in the same section header as the description field, not somewhere disconnected from it",
  (() => {
    const section = panel.match(/Notes, photos &amp; recordings — this finding[\s\S]{0,600}?<textarea/)?.[0] ?? "";
    return /AiSuggestButton/.test(section);
  })()
);
check(
  "the button disables itself with nothing to improve — an empty description",
  /disabled=\{!finding\.description\.trim\(\) \|\| aiBusy\}/.test(panel)
);

/* ---- 3 · every change is a proposal; Accept writes, Reject never does ---- */

check(
  "nothing writes to the finding until Accept — the suggestion lives only in local useState until then",
  /const \[suggestion, setSuggestion\] = useState<string \| null>\(null\);/.test(panel) &&
    !/setSuggestion\([\s\S]{0,40}onChange\(/.test(panel)
);
check(
  "Accept writes exactly the shown text (or the edited version) to description, through the SAME onChange every other field here uses",
  /onChange\(\{ description: editingSuggestion \? suggestionEditText : suggestion \}\);/.test(panel)
);
check(
  "Reject only clears local state — it never calls onChange, so the original description is untouched",
  (() => {
    const m = panel.match(/onClick=\{\(\) => \{\s*\n\s*setSuggestion\(null\);\s*\n\s*setEditingSuggestion\(false\);\s*\n\s*\}\}/g);
    return Array.isArray(m) && m.length >= 1;
  })()
);
check(
  "Edit lets the auditor change the wording before accepting, same shape as EvidenceReviewPanel's own Edit step",
  /setEditingSuggestion\(true\);\s*\n\s*setSuggestionEditText\(suggestion\);/.test(panel)
);
check(
  "a failed AI call surfaces as a visible, dismissable-by-retry error, never a silent no-op",
  /setAiError\(e instanceof Error \? e\.message : "The assistant is unavailable\."\)/.test(panel) &&
    /role="alert"/.test(panel)
);

console.log(failures === 0 ? "\nREVIEW AI ASSIST OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
