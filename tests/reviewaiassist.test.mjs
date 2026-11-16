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
const assistLib = read("src", "lib", "assist.ts");

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
  /polishContext\(\s*\n\s*finding\.description,\s*\n\s*finding\.discipline,\s*\n\s*finding\.system,\s*\n\s*"note",\s*\n\s*finding\.title \|\| undefined,/.test(
    panel
  )
);
/* 16 Nov 2026 — Sarel: "have a look at the discipline, asset system, and
   the audit check that is linked to the finding... to reword and
   describe the audit finding in that context... make sure all facts are
   double checked for the correct airport." Two more arguments joined the
   same call: the linked check's own requirement text (so the rewrite
   speaks to what ACSA actually asked for), and the entity's full airport
   name (feeds SYSTEM's new house rule 8). */
check(
  "the same call now also carries the linked check's requirement text and the entity's full airport name",
  /linkedCheck\?\.requirement,\s*\n\s*entityOf\(entityCode\)\.name/.test(panel)
);
check(
  "polishContext itself takes both new parameters, both optional, both documented",
  /checkRequirement\?:\s*string/.test(assistLib) && /airport\?:\s*string/.test(assistLib)
);
check(
  "SYSTEM gained house rule 8 — never name or cite a different airport than the one given",
  /8\. Where the material below names which airport this audit is at/.test(assistPrompts)
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
    /* Widened from 600: 16 Nov 2026 added a conditional "Original" label
       between the header (and its AiSuggestButton) and the textarea —
       the button's own position relative to the header is unchanged,
       only the window needed to reach the textarea past it grew. */
    const section = panel.match(/Notes, photos &amp; recordings — this finding[\s\S]{0,900}?<textarea/)?.[0] ?? "";
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

/* ---- 4 · revert-after-accept and the combined view ---------------------
   16 Nov 2026 — Sarel: "have the option to toggle between original notes
   and AI cleaned notes... maybe also an option to see the combination of
   the two... if needed, revert back to the old notes." */

check(
  "Accept remembers what it's about to overwrite, before overwriting it",
  /setPreAcceptDescription\(finding\.description\);\s*\n\s*setShowOriginal\(false\);\s*\n\s*onChange\(\{ description: editingSuggestion \? suggestionEditText : suggestion \}\);/.test(
    panel
  )
);
check(
  "the revert strip only shows once something has actually been accepted — gated on preAcceptDescription, not on the pending suggestion",
  /\{preAcceptDescription !== null && \(/.test(panel)
);
check(
  "Revert writes the remembered pre-accept text back, through the same onChange, then clears the remembered state",
  /onClick=\{\(\) => \{\s*\n\s*onChange\(\{ description: preAcceptDescription \}\);\s*\n\s*setPreAcceptDescription\(null\);\s*\n\s*setShowOriginal\(false\);\s*\n\s*\}\}/.test(
    panel
  )
);
check(
  "\"Show original\" reveals the pre-accept text in place — the combined view, current and original both on screen, no diff renderer needed",
  /onClick=\{\(\) => setShowOriginal\(\(v\) => !v\)\}/.test(panel) &&
    /\{showOriginal && \(/.test(panel) &&
    /\{preAcceptDescription \|\| <em>\(was blank\)<\/em>\}/.test(panel)
);
check(
  "Dismiss clears the revert offer without touching the finding — no onChange in its own handler",
  (() => {
    const m = panel.match(/onClick=\{\(\) => \{\s*\n\s*setPreAcceptDescription\(null\);\s*\n\s*setShowOriginal\(false\);\s*\n\s*\}\}/g);
    return Array.isArray(m) && m.length >= 1;
  })()
);
check(
  "preAcceptDescription/showOriginal are plain local state, same ephemeral convention as suggestion/editingSuggestion above",
  /const \[preAcceptDescription, setPreAcceptDescription\] = useState<string \| null>\(null\);/.test(panel) &&
    /const \[showOriginal, setShowOriginal\] = useState\(false\);/.test(panel)
);

console.log(failures === 0 ? "\nREVIEW AI ASSIST OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
