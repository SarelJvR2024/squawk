import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* BULK CLEANUP — Sarel: "review all the audit check notes and photo
 *  findings and write it with proper grammar, in technical manner...
 *  update these notes in the app." This session had no access to the live
 *  audit record (no SUPABASE_URL/SUPABASE_SECRET_KEY configured), so the
 *  follow-up ask was to build the rewrite into the app itself, Sarel
 *  running it on the real data from his own device: "build polish notes
 *  in app, must be available in bulk, select which discipline it needs to
 *  clean up and clean up all audit check notes and photo captions in bulk
 *  and also option to link photos to audit checks."
 *
 *  Three things this suite pins down:
 *  1. The new `polish` assist task exists, server and client, and its
 *     prompt keeps the same "never invent a fact or a clause number" rule
 *     every other task in this file already carries.
 *  2. The Cleanup screen (src/app/(app)/cleanup/page.tsx) reads every one
 *     of the three text sources it claims to (check notes, finding
 *     descriptions, photo captions), scoped to the chosen discipline, and
 *     NEVER writes to the record on its own — a proposal always sits
 *     between the model's answer and the store action that would save it.
 *  3. Linking photos to checks reuses the Inspection screen's own
 *     BulkLinkWalkItemsSheet rather than a second implementation — see
 *     that component's own doc comment on why a second one is the wrong
 *     answer here.
 *
 *  Source-reading, same pattern as field-search-prominence.test.mjs and
 *  findings-inspection-link.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const route = fs.readFileSync(path.join(root, "src", "app", "api", "assist", "route.ts"), "utf8");
const prompts = fs.readFileSync(path.join(root, "src", "lib", "assistPrompts.ts"), "utf8");
const assistLib = fs.readFileSync(path.join(root, "src", "lib", "assist.ts"), "utf8");
const cleanup = fs.readFileSync(
  path.join(root, "src", "app", "(app)", "cleanup", "page.tsx"),
  "utf8"
);
const shell = fs.readFileSync(path.join(root, "src", "components", "AppShell.tsx"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- the "polish" task itself, server and client ---------------------- */

check(
  "polish is a real Task, defined where every task's prompt lives (src/lib/assistPrompts.ts), not a client-only string nothing answers",
  /\| "polish";/.test(prompts) && /polish:\s*\n?\s*"Rewrite the note below/.test(prompts)
);

check(
  "polish is a real AssistTask on the client, matching the server's own union",
  /\| "polish";/.test(assistLib)
);

check(
  "the polish prompt carries the same house rule every other task in this file keeps: never invent a fact, a clause or a standard",
  /Do NOT invent, guess at or supply a clause, standard or document reference that is not already given to you/.test(prompts)
);

check(
  "the polish prompt is explicit about carrying every fact across unchanged, not just 'be accurate'",
  /Carry across every fact, measurement, location, quantity and item named below, exactly as given/.test(prompts)
);

check(
  "the polish prompt names the asset system explicitly as something the rewrite must say",
  /Name the asset system given below explicitly in the rewrite/.test(prompts)
);

check(
  "a caption-length rewrite stays caption-length — the prompt does not let a one-line caption balloon into paragraphs",
  /do not expand a caption into paragraphs/.test(prompts)
);

check(
  "the route itself no longer defines the prompts inline — it imports them from the one config file",
  /from "@\/lib\/assistPrompts"/.test(route) && !/const TASK_PROMPT: Record<Task, string> = \{/.test(route)
);

check(
  "polishContext is a real exported function, not just referenced from the page",
  /export function polishContext\(/.test(assistLib)
);

check(
  "polishContext tells the model whether it is rewriting a caption or a full note — the two get different prompt rules",
  /kind === "caption"/.test(assistLib) &&
    /This is a PHOTO CAPTION, not a full observation/.test(assistLib)
);

/* ---- the Cleanup screen itself ----------------------------------------- */

check(
  "the screen is scoped by discipline, using the same disciplinesAt() every other discipline picker in this app reads from",
  /disciplinesAt\(entityCode\)/.test(cleanup)
);

check(
  "audit check notes cover BOTH the desk and the field observation, not just one",
  /r\.observation\?\.trim\(\)/.test(cleanup) && /r\.fieldObservation\?\.trim\(\)/.test(cleanup)
);

check(
  "finding descriptions are their own section, reading Finding.description",
  /findingItems/.test(cleanup) && /f\.description\.trim\(\)/.test(cleanup)
);

check(
  "photo captions cover all three sources a photograph can come from: a check's own response, a walk item, and a finding's own attachments",
  /check-photo\|/.test(cleanup) && /walk-photo\|/.test(cleanup) && /finding-photo\|/.test(cleanup)
);

check(
  "each item's apply() goes through the real store action for where its text actually lives, not a generic patch",
  /apply: \(text\) => patch\(c\.id, \{ observation: text \}\)/.test(cleanup) &&
    /apply: \(text\) => patch\(c\.id, \{ fieldObservation: text \}\)/.test(cleanup) &&
    /apply: \(text\) => updateFinding\(f\.id, \{ description: text \}\)/.test(cleanup) &&
    /apply: \(text\) => updateAttachment\(c\.id, a\.id, \{ caption: text \}\)/.test(cleanup) &&
    /apply: \(text\) => updateAdhocAttachment\(item\.id, a\.id, \{ caption: text \}\)/.test(cleanup) &&
    /apply: \(text\) => updateFindingAttachment\(f\.id, a\.id, \{ caption: text \}\)/.test(cleanup)
);

check(
  "nothing is written to the record until a proposal exists AND a person applies it — no auto-apply path",
  /function applyOne\(item: PolishItem\)/.test(cleanup) &&
    /if \(!prop\?\.proposed\) return;/.test(cleanup) &&
    /item\.apply\(prop\.proposed\)/.test(cleanup) &&
    /* the bulk "run" function proposes only — it must never itself call apply */
    !/async function run\(\)[\s\S]{0,600}\.apply\(/.test(cleanup)
);

check(
  "a kept (rejected) proposal is tracked separately and is excluded from 'apply all accepted'",
  /setKept/.test(cleanup) && /if \(kept\[item\.key\]\) continue;/.test(cleanup)
);

check(
  "the polish tools are hidden entirely when no model is configured, same gate every other assist affordance in this app uses",
  /useAssistAvailable/.test(cleanup) && /\{aiOn && \(/.test(cleanup)
);

check(
  "linking photos to checks does NOT reinvent BulkLinkWalkItemsSheet's picker — it sends the auditor to the one that already exists",
  !/import BulkLinkWalkItemsSheet/.test(cleanup) &&
    !/<BulkLinkWalkItemsSheet/.test(cleanup) &&
    /Open Inspection, select them, and link in bulk/.test(cleanup)
);

check(
  "the unlinked-photo count is scoped to the chosen discipline and to walk items that actually carry a photo",
  /!it\.checkId && inDiscipline\(it\.discipline \?\? ""\)/.test(cleanup) &&
    /\(it\.attachments \?\? \[\]\)\.some\(\(a\) => a\.kind === "photo"\)/.test(cleanup)
);

/* ---- reachable from the app, TPJV only --------------------------------- */

check(
  "Cleanup has a real entry point in the More menu",
  /label="Cleanup"/.test(shell) && /router\.push\("\/cleanup"\)/.test(shell)
);

check(
  "Cleanup is gated TPJV-only, same as Forms and People beside it — a report-polish tool is not ACSA's to see",
  /role !== "acsa" && \(\s*<MoreItem\s*\n\s*icon=\{<IconWand/.test(shell)
);

console.log(failures === 0 ? "\nCLEANUP OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
