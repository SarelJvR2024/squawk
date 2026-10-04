import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* EVIDENCE STATUS — has the proof for this check actually been produced?
 *
 *  Sarel, 2 October 2026: "Ons die checks page we have an option for
 *  compliant pending evidence, i want to re,ove that option. Also remove
 *  the not available options. I wan to introduce a evidence
 *  functionpnality where we can indicate either no evidence available,
 *  specific evidemcd not available and lkst the evidemcd description,
 *  evidence to be provided and list the details, evidemce provided for
 *  review and allow the upload of a a file or capture of a photo."
 *
 *  Four states, two of them asking for a free-text note, one asking for a
 *  file. Deliberately a question separate from the compliance verdict (see
 *  tests/evidencepending.test.mjs for the one it replaced on the Checks
 *  page) and from "Evidence to request" (what was asked for, not whether it
 *  came back) — EVIDENCE_STATUSES and the panel built from it are their own
 *  thing, not a repaint of either.
 *
 *  Source-read, like checkscreen.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const types = read("src/lib/types.ts");
const store = read("src/lib/store.ts");
const detail = read("src/components/CheckDetail.tsx");
const codeOnly = detail.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ---- the type ------------------------------------------------------------ */

check(
  "EvidenceStatus is its own union, not a repaint of Compliance",
  /export type EvidenceStatus =/.test(types)
);
check(
  "and it has exactly the four states Sarel asked for, in his order",
  /"noneAvailable"\s*\n\s*\|\s*"specificNotAvailable"\s*\n\s*\|\s*"toBeProvided"\s*\n\s*\|\s*"providedForReview"/.test(
    types
  )
);
check(
  "Response carries it as a required field, not optional",
  /evidenceStatus: EvidenceStatus \| null;/.test(types)
);
check(
  "and the note that goes with it",
  /evidenceStatusNote: string;/.test(types)
);

/* ---- the migration — every response already on a tablet predates this --- */

check(
  "the store version moved past every build that predates this field",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 27
);
check(
  "emptyResponse declares both fields, so a fresh response is explicit",
  /evidenceStatus: null,\s*\n\s*evidenceStatusNote: "",/.test(store)
);
check(
  "a migration backfills both fields on every response already on a device",
  /if \(from < 27\) \{[\s\S]{0,1200}r\.evidenceStatus = null[\s\S]{0,200}r\.evidenceStatusNote = ""/.test(
    store
  )
);

/* ---- the fallback response CheckDetail renders before any patch --------- */

/* A response that does not exist yet (nobody has touched this check) is
   rendered from a literal default in CheckDetail, not from emptyResponse —
   a second place the same two fields have to be declared, and the kind of
   gap that leaves a controlled textarea starting undefined (a React
   warning the moment the first patch makes it a string) rather than "". */
check(
  "and CheckDetail's own not-yet-touched fallback carries the same two fields",
  /evidencePending: false,\s*\n\s*evidenceStatus: null,\s*\n\s*evidenceStatusNote: "",/.test(
    codeOnly
  ),
  "a second default that forgets the field is a textarea that starts uncontrolled"
);

/* ---- the panel ------------------------------------------------------------ */

check(
  "EVIDENCE_STATUSES declares all four states, each with its own label",
  /key: "noneAvailable",[\s\S]{0,120}label: "No evidence available"/.test(codeOnly) &&
    /key: "specificNotAvailable",[\s\S]{0,120}label: "Specific evidence not available"/.test(
      codeOnly
    ) &&
    /key: "toBeProvided",[\s\S]{0,120}label: "Evidence to be provided"/.test(codeOnly) &&
    /key: "providedForReview",[\s\S]{0,120}label: "Evidence provided for review"/.test(codeOnly)
);

check(
  "the panel is unconditional — it does not wait on the answer library existing",
  /panels\.push\(\{\s*\n\s*key: "evidenceStatus",/.test(codeOnly)
);

check(
  "selecting a state patches the response directly, and tapping it again clears it",
  /onClick=\{\(\) => patch\(check\.id, \{ evidenceStatus: on \? null : es\.key \}\)\}/.test(
    codeOnly
  )
);

check(
  "only one state can be selected at a time",
  /const on = r\.evidenceStatus === es\.key;/.test(codeOnly)
);

/* ---- the note field — two states only, labelled for what it is asking --- */

check(
  "the note field appears only for the two states that need one",
  /note: "What is missing",/.test(codeOnly) && /note: "What, and by when",/.test(codeOnly)
);
check(
  "noneAvailable and providedForReview carry no note config — self-explanatory states",
  !/key: "noneAvailable",[\s\S]{0,120}note:/.test(codeOnly) &&
    !/key: "providedForReview",[\s\S]{0,120}note:/.test(codeOnly)
);
/* A DECISION OF SAREL'S THAT HE LATER REVERSED: "this section should allow
   multiple evidence to be recorded and not all in one text box." The note
   was a single textarea — "Doc 1\nDoc 2" typed as two lines of one blob —
   now it is one row per item, add/remove as needed. Still the same
   `evidenceStatusNote` field underneath, one string joined on "\n" — the
   change is in how it is edited, not what is persisted, so no migration. */
check(
  "the note writes into evidenceStatusNote, not a field another state could also use",
  /const items = r\.evidenceStatusNote\.split\("\\n"\);/.test(codeOnly) &&
    /patch\(check\.id, \{ evidenceStatusNote: next\.join\("\\n"\) \}\)/.test(codeOnly)
);
check(
  "it is a list of items, not one paragraph — each is its own input, with add/remove",
  /items\.map\(\(item, i\) =>/.test(codeOnly) &&
    /Remove this item/.test(codeOnly) &&
    /Add another/.test(codeOnly)
);
check(
  "its placeholder is specific to which of the two states is active",
  /active\.key === "specificNotAvailable"\s*\n\s*\? "Which document or record ACSA could not produce"\s*\n\s*: "What it is, and when it is expected"/.test(
    codeOnly
  )
);

/* ---- the upload — one state only, into the SAME attachments array ------- */

/* A DECISION OF SAREL'S THAT HE LATER REVERSED: "remove the paperclip and
   photo icon, introduce them in the evidence section — all photos and
   evidence will be uploaded in the evidence section." The upload used to
   be gated to the one state most likely to carry proof; it is
   unconditional now, since a photo is just as often the proof that
   evidence is still outstanding as it is the proof itself, and this panel
   is now the one place in the whole screen an auditor reaches for either
   control. */
check(
  "the upload is unconditional, not gated to any one evidence state",
  !/\{r\.evidenceStatus === "providedForReview" && \(/.test(codeOnly)
);
check(
  "and it offers both a photo capture and a file pick, Sarel's own wording",
  (() => {
    const start = codeOnly.indexOf('mt-2.5 flex flex-wrap items-center gap-[6px]');
    const end = codeOnly.indexOf("A SPACER", start);
    const slice = codeOnly.slice(start, end === -1 ? start + 1200 : end);
    return /<PhotoButton/.test(slice) && /<FileButton/.test(slice);
  })()
);
check(
  "it writes into the one attachments array every other evidence control already uses",
  (() => {
    const start = codeOnly.indexOf('mt-2.5 flex flex-wrap items-center gap-[6px]');
    const end = codeOnly.indexOf("A SPACER", start);
    const slice = codeOnly.slice(start, end === -1 ? start + 1200 : end);
    return /addAttachment\(check\.id,/.test(slice);
  })(),
  "a second, evidence-only attachment list is a second place a photo can go missing from"
);

/* ---- the strip can say which state is chosen without opening the tab ---- */

check(
  "the tab carries a badge naming the chosen state once one is chosen",
  /\.\.\.\(r\.evidenceStatus\s*\n\s*\? \{ badge: EVIDENCE_STATUSES\.find\(\(s\) => s\.key === r\.evidenceStatus\)\?\.label\.split\(" "\)\[0\] \}/.test(
    codeOnly
  )
);

/* ---- the invariant this question must never become ---------------------- */

/* THE WHOLE POINT OF SPLITTING THIS OUT of the compliance verdict: an
   evidence state must never gate or override the C/NC/N-A answer. If this
   regresses, the two questions have been re-merged into the single
   overloaded flag Sarel asked to get rid of. */
check(
  "setting an evidence state never calls setCompliance — the two questions stay separate",
  !/evidenceStatus[\s\S]{0,60}setCompliance/.test(codeOnly) &&
    !/setCompliance[\s\S]{0,200}evidenceStatus:/.test(codeOnly)
);

console.log(failures === 0 ? "\nEVIDENCE STATUS OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
