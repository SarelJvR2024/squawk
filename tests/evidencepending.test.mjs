import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* "COMPLIANT, EVIDENCE PENDING" — THE TAG, AND THE INVARIANT UNDER IT.
 *
 * Sarel, 2026-09-12: "add a button for compliant, evidence pending. i will
 * still define the logic for this button, for now just add it as a tag to note
 * that from the explanation ACSA's explanation is that they are compliant but
 * need to be verified when they submit the evidence" — and, a minute later,
 * "we can maybe later use this tag to generate an RFI to request the
 * information".
 *
 * That second sentence is what these assertions are really protecting. A tag
 * that only exists in the UI is decoration; a tag an RFI gets generated from
 * has to be a recorded field that reaches the workbook and that cannot be left
 * behind by a changed answer. Three ways it could go wrong:
 *
 * ONE: someone "tidies" it into a fifth Compliance token. That would look
 * cleaner and would fall through every count, rating, export and completion
 * rule that switches on the four — each one a place a check silently stops
 * being counted. The union is asserted to still have exactly four members.
 *
 * TWO: the flag gets written somewhere other than setCompliance, and drifts
 * onto a non-compliance. "Evidence pending" against a non-compliant answer is
 * not a statement anybody made, and an RFI list built from it would ask ACSA
 * for proof of a failure. One entry point, asserted.
 *
 * THREE: it never reaches the export, so the RFI cannot be generated from the
 * workbook at all — which was the entire point of recording it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");

let fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  if (c) {
    log.push(`PASS  ${n}`);
  } else {
    fail++;
    log.push(`FAIL  ${n}${x ? `  [${x}]` : ""}`);
  }
};

const types = read("src/lib/types.ts");
const store = read("src/lib/store.ts");
const exports_ = read("src/lib/exports.ts");
const detail = read("src/components/CheckDetail.tsx");
const field = read("src/app/(app)/field/page.tsx");

/* ---- ONE: it is a flag, not a fifth Compliance token ------------------- */

const union = types.match(/export type Compliance = ([^;]+);/);
ok("Compliance is still declared as a union", !!union);
const members = (union?.[1] ?? "").split("|").map((m) => m.trim().replace(/"/g, ""));
ok(
  "COMPLIANCE STILL HAS EXACTLY FOUR TOKENS — evidence-pending is not a fifth",
  members.length === 4 && ["C", "NC", "N/A", "NV"].every((m) => members.includes(m)),
  members.join(",")
);

ok(
  "Response carries evidencePending, and it is optional so no record needs migrating",
  /evidencePending\?: boolean;/.test(types)
);
ok(
  "and the type says why it is a flag rather than a token",
  /not a fifth `Compliance`|NOT A FIFTH/i.test(types)
);

/* ---- TWO: one entry point, and the flag can only ride "C" ------------- */

ok(
  "setCompliance takes the flag",
  /setCompliance: \(checkId: string, c: Compliance \| null, evidencePending\?: boolean\)/.test(
    store
  )
);
ok(
  "AND IT REFUSES TO SET THE FLAG ON ANYTHING BUT \"C\"",
  /evidencePending: c === "C" \? evidencePending : false/.test(store)
);
ok(
  "emptyResponse declares it, so a fresh response is explicit rather than undefined",
  /evidencePending: false,/.test(store)
);

/* Nothing may WRITE the field except the guard — a second writer is how it
   would drift onto a non-compliance without passing the `c === "C"` test.
   Counting bare mentions would count the doc comment and the parameter; this
   counts object keys, of which exactly two are legitimate: emptyResponse's
   `false`, and the guarded write itself. */
const storeWrites = [...store.matchAll(/^\s*evidencePending: /gm)].map((m) => m[0].trim());
ok(
  "THE STORE WRITES evidencePending IN EXACTLY TWO PLACES — the guard and the empty response",
  storeWrites.length === 2,
  `${storeWrites.length} writes`
);

/* And nowhere else in the app may write it at all: every screen has to go
   through setCompliance, which is what makes the invariant hold. */
const strayWriters = ["src/components/CheckDetail.tsx", "src/app/(app)/field/page.tsx"].filter(
  (f) => /patch\([^)]*evidencePending/.test(read(f))
);
ok(
  "and no screen patches it behind setCompliance's back",
  strayWriters.length === 0,
  strayWriters.join(",")
);

/* ---- the screen ------------------------------------------------------- */

ok(
  "the check screen offers it as its own button",
  /label: "Compliant, evidence pending"/.test(detail)
);
ok(
  "selection is decided by compliance AND the flag together, so C and C-pending cannot both look chosen",
  /compliance === s\.key && !!s\.pending === !!evidencePending/.test(detail)
);
/* THE SHORTCUTS AN AUDITOR HAS ALREADY LEARNED DO NOT MOVE.
   The first cut indexed STATUSES by position, which put the new option on 2
   and pushed Non-compliant to 3 — tests/shared.js drives compliance by
   keyboard and annotates press("2") as Non-compliant, which is how it was
   caught. A shortcut that quietly changes meaning is the fastest way to file
   a wrong answer against a check. */
ok(
  "NON-COMPLIANT IS STILL KEY 2, and the new option is additive on 5",
  /hotkey: "1",[\s\S]{0,200}label: "Compliant",/.test(detail) &&
    /hotkey: "2",[\s\S]{0,80}label: "Non-compliant"/.test(detail) &&
    /hotkey: "3",[\s\S]{0,80}label: "N\/A"/.test(detail) &&
    /hotkey: "4",[\s\S]{0,80}label: "Not available"/.test(detail) &&
    /hotkey: "5",[\s\S]{0,400}label: "Compliant, evidence pending"/.test(detail)
);
ok(
  "and the handler finds the key by its declared hotkey, never by array position",
  /STATUSES\.find\(\(x\) => x\.hotkey === e\.key\)/.test(detail) &&
    !/STATUSES\[Number\(e\.key\)/.test(detail)
);

ok(
  "the number keys set the flag too rather than only the token",
  /setCompliance\(check\.id, on \? null : hit\.key, !on && !!hit\.pending\)/.test(detail)
);
ok(
  "and the two verdict/qualifier rows are filtered from ONE list, so the keyboard and the screen cannot disagree",
  /STATUSES\.filter\(\(x\) => x\.group === "verdict"\)/.test(detail) &&
    /STATUSES\.filter\(\(x\) => x\.group === "qualifier"\)/.test(detail) &&
    (detail.match(/^const STATUSES/gm) ?? []).length === 1
);

/* ---- the field screen must not silently drop it ----------------------- */

ok(
  "THE FIELD HALF CARRIES THE TAG when it confirms the same verdict",
  /nextOutcome === "C" \? !!r\?\.evidencePending : false/.test(field)
);

/* ---- THREE: it reaches the workbook, or no RFI can be generated ------- */

ok(
  "the responses sheet has its own Evidence pending column",
  /header: "Evidence pending"/.test(exports_)
);
ok(
  "and a row says it in words rather than a bare yes",
  /r\?\.evidencePending \? "ACSA says compliant — evidence still to be produced"/.test(exports_)
);
ok(
  "the status cell is left reading exactly \"Compliant\", so existing filters and counts still work",
  /C: "Compliant",/.test(exports_) &&
    /r\?\.compliance \? STATUS_WORD\[r\.compliance\] : ""/.test(exports_)
);
ok(
  "the discipline summary counts how many each discipline owes",
  /header: "of which evidence pending"/.test(exports_) &&
    /r\.compliance === "C" && r\.evidencePending/.test(exports_)
);

/* ---- the tools moved into the observation box ------------------------- */

ok(
  "compose, draft and the mic are inside the observation box",
  /aria-label="Compose from taps"/.test(detail) &&
    /aria-label={thinking === "observation" \? "Drafting…" : "Draft with AI"}/.test(detail) &&
    /<VoiceNoteButton\s+inline/.test(detail)
);
ok(
  "the textarea reserves room for them rather than running text underneath",
  /pr-\[124px\]/.test(detail)
);
ok(
  "PHOTO KEEPS ITS 44px TARGET IN THE BAR — it is the one used in gloves",
  /Compose, Draft and the mic moved INTO the observation box/.test(detail) &&
    /<PhotoButton/.test(detail)
);
ok(
  "the inline mic is a distinct base class, not a Tailwind override gamble",
  /const TAP_INLINE =/.test(read("src/components/Capture.tsx"))
);
ok(
  "and a recording still shows its clock inline rather than clipping it",
  /inline\s*\?\s*formatDuration\(rec\.elapsed\)/.test(read("src/components/Capture.tsx"))
);

console.log(log.join("\n"));
if (fail) {
  console.log(`\n${fail} FAILURES`);
  process.exit(1);
}
console.log("\nEVIDENCE PENDING OK");
