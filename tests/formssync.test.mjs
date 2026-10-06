import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The nine Tier 1 forms now travel through the shared record too.
 *
 *  HIRA and every form (ISF, interviews, site days/diary, PPE, site access,
 *  toolbox talks, incident reports, attendance registers) lived only in each
 *  device's own IndexedDB — the shared Supabase record only ever carried
 *  checks, findings and hazards. Two auditors on two tablets never saw each
 *  other's forms, and a device lost or wiped took its ISFs and interviews
 *  with it. Sarel asked for this directly after the reset-propagation fix:
 *  "make sure the forms also sync between devices."
 *
 *  THE RULE IS THE SAME ONE FINDINGS/HAZARDS ALREADY FOLLOW, GENERALISED —
 *  newer wins on the record as a whole, but every id-bearing sub-list a form
 *  carries (an ISF's actions, an interview day's entries, a PPE check's
 *  people) unions rather than follows the newer side, the same reason a
 *  finding's progress log already does. See mergeFlatRecords/mergeForm in
 *  lib/merge.ts — one generic implementation rather than nine hand-written
 *  ones, because nine hand-written merge functions is nine places the next
 *  field rename gets missed in one of them.
 *
 *  ONE TRANSPORT, TWO PATHS — the live Supabase sync (lib/shared.ts) and the
 *  file-based export/import between devices (store.ts's exportBundle/
 *  importBundle) both move the same Bundle through the same mergeBundle, so
 *  this fix covers "no signal, email the file" too, not just the live case.
 *
 *  Source-read, like reset-sync.test.mjs and merge.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const merge = src("lib", "merge.ts");
const shared = src("lib", "shared.ts");
const store = src("lib", "store.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const FORMS = [
  "safetyFindings",
  "interviewDays",
  "siteDays",
  "evidenceItems",
  "ppeChecks",
  "siteAccessLogs",
  "toolboxTalks",
  "incidentReports",
  "attendanceRegisters",
];
const ROW_KINDS = [
  "safetyFinding",
  "interviewDay",
  "siteDay",
  "evidenceItem",
  "ppeCheck",
  "siteAccessLog",
  "toolboxTalk",
  "incidentReport",
  "attendanceRegister",
];

/* ---- the Bundle carries all nine, not just findings and hazards --------- */

check(
  "Bundle declares all nine Tier 1 form arrays",
  FORMS.every((f) => new RegExp(`${f}: ${f[0].toUpperCase()}`).test(merge)) ||
    FORMS.every((f) => merge.includes(`${f}: `)),
  "a Bundle missing a form array is a form that cannot travel"
);

check(
  "MergeInput and MergeResult both carry all nine, same as findings/hazards",
  (() => {
    const inputStart = merge.indexOf("export interface MergeInput");
    const inputBlock = merge.slice(inputStart, merge.indexOf("}", inputStart));
    const resultStart = merge.indexOf("export interface MergeResult");
    const resultBlock = merge.slice(resultStart, merge.indexOf("report: MergeReport", resultStart));
    return FORMS.every((f) => inputBlock.includes(`${f}:`) && resultBlock.includes(`${f}:`));
  })()
);

/* ---- the generic merge, not nine hand-written ones ----------------------- */

check(
  "mergeFlatRecords unions the listFields by id and lets the newer record win on the rest",
  /function mergeFlatRecords<T extends \{ id: string; updatedAt\?: number \}>/.test(merge) &&
    /\(merged as Record<string, unknown>\)\[field as string\] = unionById\(mv, tv\);/.test(merge)
);

check(
  "mergeForm folds every form's counts into one aggregate bucket, not nine",
  /function mergeForm<T extends \{ id: string; updatedAt\?: number \}>/.test(merge) &&
    /report\.forms\.added\.push\(\.\.\.counts\.added\);/.test(merge)
);

check(
  "MergeReport carries that one aggregate forms bucket",
  /forms: Counts;/.test(merge)
);

check(
  "mergeBundle calls mergeForm for all nine forms, theirs defaulted so an older bundle with none still merges",
  FORMS.every((f) =>
    new RegExp(`const ${f} = mergeForm\\(\\s*\\n?\\s*mine\\.${f},\\s*\\n?\\s*theirs\\.${f} \\?\\? \\[\\]`).test(
      merge
    )
  ),
  "a bundle from before this shipped has none of these fields at all"
);

check(
  "each form's own id-bearing sub-lists are named, not guessed generically",
  /const safetyFindings = mergeForm\(\s*\n\s*mine\.safetyFindings,\s*\n\s*theirs\.safetyFindings \?\? \[\],\s*\n\s*\["attachments", "actions"\]/.test(
    merge
  ) &&
    /const interviewDays = mergeForm\(\s*\n\s*mine\.interviewDays,\s*\n\s*theirs\.interviewDays \?\? \[\],\s*\n\s*\["entries", "apologies"\],\s*\n\s*report\s*\n\s*\);/.test(
      merge
    ) &&
    /const siteDays = mergeForm\(\s*\n\s*mine\.siteDays,\s*\n\s*theirs\.siteDays \?\? \[\],\s*\n\s*\["diaryEntries", "workedBy", "entries", "attachments"\]/.test(
      merge
    ) &&
    /const ppeChecks = mergeForm\(mine\.ppeChecks, theirs\.ppeChecks \?\? \[\], \["people"\], report\);/.test(merge) &&
    /const toolboxTalks = mergeForm\(mine\.toolboxTalks, theirs\.toolboxTalks \?\? \[\], \["attendees"\], report\);/.test(
      merge
    ),
  "an interview day's entries and a PPE check's people are different fields, not one guessed name"
);

check(
  "the merge result actually returns all nine arrays, not just the local ones it built",
  (() => {
    const returnStart = merge.lastIndexOf("return {");
    const returnBlock = merge.slice(returnStart, merge.indexOf("report,", returnStart));
    return FORMS.every((f) => returnBlock.includes(f));
  })()
);

check(
  "the one-line summary mentions forms, not just checks/findings/hazards",
  /`\$\{n\(r\.forms\)\} form entr\$\{n\(r\.forms\) === 1 \? "y" : "ies"\}`/.test(merge)
);

/* ---- the row shape every device already pushes and pulls ---------------- */

check(
  "SharedRow's kind union carries all nine form kinds",
  ROW_KINDS.every((k) => new RegExp(`"${k}"`).test(shared))
);

check(
  "rowsToPush pushes all nine, filtered by entity the same way findings/hazards already are",
  FORMS.every((f, i) =>
    new RegExp(`for \\(const x of s\\.${f}\\.filter\\(mine\\)\\) add\\("${ROW_KINDS[i]}", x\\.id, when\\(x\\), x\\);`).test(
      shared
    )
  )
);

check(
  "bundleFromRows buckets all nine kinds back into typed arrays",
  ROW_KINDS.every((k, i) => new RegExp(`else if \\(r\\.kind === "${k}"\\) ${FORMS[i]}.push`).test(shared))
);

check(
  "the bundle shared.ts builds actually carries all nine arrays out",
  (() => {
    const fnStart = shared.indexOf("export function bundleFromRows");
    const returnStart = shared.indexOf("return {", fnStart);
    const returnBlock = shared.slice(returnStart, shared.indexOf("};", returnStart));
    return FORMS.every((f) => returnBlock.includes(f));
  })()
);

/* ---- both transports: the live sync AND the file-based export/import ---- */

check(
  "exportBundle (the file-based path) carries all nine forms out, filtered by entity",
  (() => {
    const start = store.indexOf("exportBundle: () => {");
    const end = store.indexOf("importBundle: (b) => {", start);
    const block = store.slice(start, end);
    return FORMS.every((f) => new RegExp(`${f}: s\\.${f}\\.filter\\(mine\\),`).test(block));
  })(),
  "the live Supabase sync and the emailed-file path share one Bundle — missing it here means it only syncs live, not offline"
);

check(
  "importBundle hands mergeBundle all nine, filtered the same way as findings/hazards",
  (() => {
    const start = store.indexOf("importBundle: (b) => {");
    const end = store.indexOf("set((st) => ({", start);
    const block = store.slice(start, end);
    return FORMS.every((f) => new RegExp(`${f}: s\\.${f}\\.filter\\(mine\\),`).test(block));
  })()
);

check(
  "importBundle applies the merged result back into state, elsewhere-entities untouched",
  (() => {
    const start = store.indexOf("set((st) => ({", store.indexOf("importBundle: (b) => {"));
    const end = store.indexOf("lastSavedAt: Date.now(),", start);
    const block = store.slice(start, end);
    return FORMS.every((f) => new RegExp(`${f}: \\[\\.\\.\\.elsewhere\\.${f}, \\.\\.\\.result\\.${f}\\],`).test(block));
  })(),
  "a result applied without the elsewhere half would drop every other entity's forms on the next merge"
);

console.log(
  failures === 0 ? "\nFORMS SYNC OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
