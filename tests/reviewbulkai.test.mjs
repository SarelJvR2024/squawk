import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* BULK AI ON THE REVIEW TABLE — Sarel's own words, verbatim from the
 * brief this implements:
 *
 * "I want us to be able to do bulk transcribing of the voice notes when
 * the user is capturing findings. They might capture the root cause, but
 * they might not do the transcribing of it. So I want us to have an
 * option to do bulk transcribing of the voice notes, and those
 * transcribed notes must automatically go into the notes field to be
 * automatically captured in the notes field. We also need AI to correct,
 * to review the context of the finding... have a look at the discipline,
 * asset system, and the audit check that is linked to the finding... to
 * reword and describe the audit finding in that context... a review from
 * a technical and grammar perspective... make sure all facts are double
 * checked for the correct airport."
 *
 * Two bulk tools, on the SAME selection checkboxes the table's own
 * impact/root-cause bulk edit already uses: BulkSuggestWording (reuses
 * the single-finding "polish" call ReviewRiskPanel's own button makes)
 * and BulkTranscribeVoiceNotes (reuses the app's one transcription
 * service, src/app/api/transcribe/route.ts). Source-text regex
 * convention, same as every other review suite — neither component is
 * executed; both are read as text and checked against the real call
 * shapes/props they must use. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");

const table = read("src", "components", "ReviewRiskTable.tsx");
const panel = read("src", "components", "ReviewRiskPanel.tsx");
const assistLib = read("src", "lib", "assist.ts");
const storeSrc = read("src", "lib", "store.ts");
const types = read("src", "lib", "types.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · both tools sit in the bulk bar, same selection as everything
   else there, not a separate UI the auditor has to discover ------------- */

check(
  "BulkBar now takes the actual selected findings, entityCode and checksById — not just a count — so the AI tools have something to propose against",
  /findings: Finding\[\];/.test(table) &&
    /entityCode: string;/.test(table) &&
    /checksById: Map<string, Check>;/.test(table)
);
check(
  "the table passes its real selected findings, entityCode and checksById into BulkBar — not a second, parallel lookup",
  /<BulkBar\s*\n\s*count=\{selected\.size\}\s*\n\s*findings=\{selectedFindings\}\s*\n\s*entityCode=\{entityCode\}\s*\n\s*checksById=\{checksById\}/.test(
    table
  )
);
check(
  "BulkBar renders both AI tools beside its own impact/root-cause bulk edit, not on a separate screen",
  /<BulkSuggestWording findings=\{findings\} entityCode=\{entityCode\} checksById=\{checksById\} onChangeOne=\{onChangeOne\} \/>/.test(
    table
  ) && /<BulkTranscribeVoiceNotes findings=\{findings\} onChangeOne=\{onChangeOne\} \/>/.test(table)
);
check(
  "a single row's own onChange (not the batch onApply) is what an individual AI proposal's Accept and a transcription's auto-apply both use — one finding written, not every selected one with an empty patch on the rest",
  /onChangeOne: \(id: string, patch: Partial<Finding>\) => void;/.test(table) &&
    /onChangeOne=\{onChange\}/.test(table)
);

/* ---- 2 · BulkSuggestWording reuses the exact single-finding call ------- */

check(
  "BulkSuggestWording is gated on useAssistAvailable, same as every other AI entry point",
  /function BulkSuggestWording\(/.test(table) && /const aiOn = useAssistAvailable\(\);/.test(table)
);
check(
  "it calls the SAME \"polish\" task through polishContext, with the SAME widened context (title, linked check requirement, airport) ReviewRiskPanel's single-finding button now sends",
  /assist\(\s*\n\s*"polish",\s*\n\s*polishContext\(\s*\n\s*f\.description,\s*\n\s*f\.discipline,\s*\n\s*f\.system,\s*\n\s*"note",\s*\n\s*f\.title \|\| undefined,\s*\n\s*f\.checkId \? checksById\.get\(f\.checkId\)\?\.requirement : undefined,\s*\n\s*entityOf\(entityCode\)\.name/.test(
    table
  )
);
check(
  "nothing is written for any finding until its own Accept — proposals live in local state, same ephemeral convention as the single-finding panel",
  /const \[proposals, setProposals\] = useState<Record<string, AiProposal>>\(\{\}\);/.test(table) &&
    !/setProposals\([\s\S]{0,60}onChangeOne\(/.test(table)
);
check(
  "Accept (applyOne) writes exactly the proposed text, through onChangeOne — the real per-row apply",
  /onChangeOne\(f\.id, \{ description: prop\.text \}\);/.test(table)
);
check(
  "Reject only clears that finding's own proposal — never calls onChangeOne",
  /setProposals\(\(p\) => \{ const next = \{ \.\.\.p \}; delete next\[f\.id\]; return next; \}\)/.test(table)
);
check(
  "requests run sequentially, not in parallel — same rate-limit reasoning /cleanup's own PolishSection documents",
  /for \(const f of eligible\) \{\s*\n\s*if \(proposals\[f\.id\]\?\.state === "proposed" \|\| proposals\[f\.id\]\?\.state === "applied"\) continue;/.test(
    table
  )
);
check(
  "only findings with something to improve are offered — an empty description is skipped, same guard the single-finding button uses",
  /const eligible = findings\.filter\(\(f\) => f\.description\.trim\(\)\);/.test(table)
);
check(
  "an \"Apply N accepted\" bulk action exists, same shape /cleanup's own PolishSection already proved, beside the per-row Accept",
  /function applyAllProposed\(\) \{/.test(table) && /Apply \{proposedCount\} accepted/.test(table)
);

/* ---- 3 · BulkTranscribeVoiceNotes — verbatim only, auto-applied -------- */

check(
  "it is gated on useTranscribeAvailable, same as the per-note Transcribe button (Capture.tsx)",
  /function BulkTranscribeVoiceNotes\(/.test(table) && /const canTranscribe = useTranscribeAvailable\(\);/.test(table)
);
check(
  "scope is untranscribed voice attachments specifically — a.kind voice, a.blobKey present, no transcript yet — not every attachment",
  /f\.attachments\.filter\(\(a\) => a\.kind === "voice" && a\.blobKey && !a\.transcript\)/.test(table)
);
check(
  "it calls the SAME transcribe() the per-note button calls, imported from the one assist module",
  /import \{[\s\S]{0,200}\btranscribe\b[\s\S]{0,200}\} from "@\/lib\/assist"/.test(table) &&
    /const \{ text \} = await transcribe\(blob, a\.name \|\| "note\.webm"\);/.test(table)
);
check(
  "the transcript is stored on the attachment through updateFindingAttachment, the real store action FindingDetail/Capture already use for this — not a second, parallel write path",
  /updateFindingAttachment\(f\.id, a\.id, \{ transcript: text, transcriptSource: "service", transcribedAt: Date\.now\(\) \}\)/.test(
    table
  )
);
check(
  "updateFindingAttachment is a real store action, taking the finding id, the attachment id and a patch",
  /updateFindingAttachment: \(\s*\n\s*id: string,\s*\n\s*attachmentId: string,\s*\n\s*patch: Partial<Attachment>\s*\n\s*\) => void;/.test(
    storeSrc
  )
);
check(
  "the verbatim text is appended straight into the finding's own notes field — automatically, no second tap, same rule raise/page.tsx's own applyVoiceNote already follows for a brand-new finding",
  /onChangeOne\(f\.id, \{ description: f\.description\.trim\(\) \? `\$\{f\.description\}\\n\$\{text\}` : text \}\);/.test(table)
);
check(
  "this does NOT also run the AI \"write it up\" rewrite on the transcript — no assist(\"transcript\", call inside BulkTranscribeVoiceNotes, keeping the AI rewrite a reviewed, separate step (BulkSuggestWording)",
  (() => {
    const start = table.indexOf("function BulkTranscribeVoiceNotes(");
    const end = table.indexOf("\n}\n", start);
    const fn = start === -1 ? "" : table.slice(start, end === -1 ? undefined : end);
    return fn.length > 0 && !/assist\(\s*\n?\s*"transcript"/.test(fn) && !/adhocTranscriptContext/.test(fn);
  })()
);
check(
  "a recording no longer stored on this device fails that one note loudly, not silently — same honesty Capture.tsx's own runTranscribe already keeps",
  /that recording is no longer stored on this device/.test(table)
);
check(
  "Attachment carries transcript/transcriptSource/transcribedAt — the exact fields this writes — already declared on the type, not invented here",
  /transcript\?: string;/.test(types) && /transcriptSource\?: "browser" \| "service";/.test(types) && /transcribedAt\?: number;/.test(types)
);

/* ---- 4 · the widened polishContext signature itself -------------------- */

check(
  "polishContext takes the two new optional parameters this bulk tool (and the single-finding panel) both now pass",
  /export function polishContext\(/.test(assistLib) &&
    /checkRequirement\?: string,/.test(assistLib) &&
    /airport\?: string/.test(assistLib)
);
check(
  "when given, the airport and the audit check requirement both actually appear in the built context string",
  /airport && `Airport: \$\{airport\}`,/.test(assistLib) &&
    /checkRequirement && `Audit check requirement: \$\{checkRequirement\}`,/.test(assistLib)
);

console.log(failures === 0 ? "\nREVIEW BULK AI OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
