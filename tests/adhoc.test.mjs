import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THINGS SEEN ON THE WALK, AND THE ONE NUMBER THEY MUST NEVER TOUCH.
 *
 * An ad-hoc inspection item is the most valuable record in an audit and the
 * most dangerous one to file carelessly. It is valuable because nobody asked
 * for it: the register is 324 check-points ACSA wrote, and the defect standing
 * in front of an auditor that nobody put on the list is regularly the finding
 * worth having. It is dangerous because it looks exactly like one of the 324
 * unless something stops it — and the moment "312 of 324" can become "313 of
 * 324" by somebody recording an observation, every completion figure this
 * product publishes is a number nobody can reconcile.
 *
 * So the assertions here are mostly about SEPARATION. Its own type, its own id
 * series, its own list, its own export sheet, its own column in the summary —
 * and no path from any of that into the register's count. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const types = read("src", "lib", "types.ts");
const store = read("src", "lib", "store.ts");
const merge = read("src", "lib", "merge.ts");
const shared = read("src", "lib", "shared.ts");
const exports_ = read("src", "lib", "exports.ts");
const outcome = read("src", "components", "OutcomeControl.tsx");
const sheet = read("src", "components", "AddItemSheet.tsx");
const field = read("src", "app", "(app)", "field", "page.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};
/* Comments discuss the trap; the CODE is what has to be right. Several
   assertions below would pass on a comment alone without this. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* ---- 1 · the record exists and is its own thing ------------------------- */

check("AdHocItem is declared", /export interface AdHocItem \{/.test(types));
for (const f of [
  "id: string;",
  "description: string;",
  "discipline: string | null;",
  "system: string | null;",
  "area: string;",
  "outcome: Compliance | null;",
  "attachments: Attachment[];",
  "findingId: string | null;",
]) {
  const block = types.slice(types.indexOf("export interface AdHocItem"));
  check(`AdHocItem carries ${f.split(":")[0]}`, block.includes(f));
}
check(
  "discipline and asset system are NULLABLE",
  /discipline: string \| null;[\s\S]{0,400}system: string \| null;/.test(
    types.slice(types.indexOf("export interface AdHocItem"))
  ),
  "an unattributed observation is a real state; a required field would be filled with a guess"
);
check(
  "the origin vocabulary is the Hazard's, not a parallel one",
  /origin: "field" \| "acsa" \| "tpjv";/.test(types.slice(types.indexOf("export interface AdHocItem"))),
  "two vocabularies for who raised something means neither can be reported on"
);

/* ---- 2 · the id series cannot be mistaken for a register id ------------- */

check("the id series is WALK-", /`WALK-\$\{uid\(\)/.test(store));
check(
  "and it is random, not sequential",
  !/WALK-\$\{[^}]*length \+ 1/.test(store),
  "two devices both minting WALK-03 would merge into one record and lose an observation"
);
check(
  "a walk photograph's reference is prefixed with the item's own id",
  /nextPhotoRef\(id, item\.attachments\)/.test(store),
  "so WALK-A3F2K_P01 can never be read as a check-point's photograph in the zip"
);

/* ---- 3 · scoped, and absent-means-empty ------------------------------- */

check("VisitData carries adhoc", /adhoc\?: AdHocItem\[\];/.test(store));
check(
  "it is OPTIONAL, so no persisted visit needs a migration",
  /adhoc\?:/.test(store) && !/version: 14/.test(store),
  "absent-means-empty is the one shape change that does not need a version bump"
);
check(
  "resetVisit deletes walk photographs too",
  /\(data\.adhoc \?\? \[\]\)\.flatMap\(\(x\) => x\.attachments\.map\(\(a\) => a\.blobKey\)\)/.test(store),
  "an orphaned blob is invisible and counts against the storage budget forever"
);
check(
  "removing an item deletes its bytes",
  /removeAdhoc:[\s\S]{0,400}delBlobs\(keys\)/.test(store)
);

/* ---- 4 · it survives two auditors and the shared record ---------------- */

check(
  "the merge unions walk items by id",
  /adhocById/.test(merge) && /visitData: \{ responses, verifications, captures, feedback, adhoc \}/.test(merge)
);
check(
  "newer wins on a conflict",
  /\(t\.updatedAt \?\? 0\) > \(m\.updatedAt \?\? 0\)/.test(merge)
);
check("the shared record pushes them", /add\("adhoc", a\.id, when\(a\), a\)/.test(shared));
check("and reads them back", /r\.kind === "adhoc"/.test(shared));

/* ---- 5 · THE COUNT. The whole reason this file exists. ----------------- */

const storeCode = codeOnly(store);
/* The two figures the product publishes as completion. Both are computed from
   `responses` — answers to register check-points — and an ad-hoc item creates
   no response, so it cannot reach either. Asserted on the code rather than
   trusted, because the day somebody "helpfully" adds walk items to the audit
   progress figure, nothing else in this suite would notice. */
const progress = storeCode.slice(
  storeCode.indexOf("export function useAuditProgress"),
  storeCode.indexOf("export function useChecks")
);
check(
  "useAuditProgress never reads adhoc",
  !/adhoc/.test(progress),
  "the completion figure counts answers to ACSA's list and nothing else"
);
const portfolio = storeCode.slice(
  storeCode.indexOf("export function usePortfolio"),
  storeCode.indexOf("export interface AuditProgress")
);
check("usePortfolio never reads adhoc", !/adhoc/.test(portfolio));
check(
  "the walk count is stated SEPARATELY on the inspection screen",
  /\+\{adhocItems\.length\} seen on the walk/.test(field),
  "two numbers, never one — a denominator that grows as you work is not a denominator"
);
check(
  "and the progress bar's denominator is still the register's",
  /\{doneCount\}\/\{visible\.length\}/.test(field)
);

/* ---- 6 · every export says which it is --------------------------------- */

check("there is a walk sheet", /export function walkSheet/.test(exports_));
check("it is in the full workbook", /walkSheet\(x\),/.test(exports_));
check(
  "its rows say where the item came from",
  /ORIGIN_TEXT\[a\.origin\]/.test(exports_)
);
check(
  "the Photographs sheet says which photographs came off the walk",
  /"Seen on the walk — NOT one of the register check-points"/.test(exports_) &&
    /\{ header: "Source", width: 46 \}/.test(exports_)
);
check(
  "the summary has its own column, outside the check-point columns",
  /\{ header: "Seen on the walk \(not in the 324\)", width: 28 \}/.test(exports_)
);
check(
  "the cover sheet explains that it is excluded from the completion figure",
  /DELIBERATELY excluded from Check-points in scope and from Complete/.test(exports_)
);
check(
  "the walk sheet is not folded into the register sheet",
  !/registerSheet[\s\S]{0,2000}x\.adhoc/.test(exports_),
  "a 325th row on a 324-row deliverable makes every count taken off it wrong"
);

/* ---- 7 · the capture sheet's one required field ------------------------ */

check(
  "only the description blocks a save",
  /if \(!text\) \{[\s\S]{0,200}setError/.test(sheet) &&
    !/if \(!draft\.discipline\)/.test(sheet),
  "ten seconds on a walk is the budget; a half-captured item beats a lost one"
);
check(
  'it never writes the literal string "Ad-hoc" as an asset system',
  !/system: "Ad-hoc"/.test(codeOnly(sheet)) && !/system: "Ad-hoc"/.test(codeOnly(field)),
  "that string used to appear as an asset system on every screen that groups by one"
);
check(
  "raising a finding from an item links the two",
  /updateAdhoc\(item\.id, \{ findingId: id \}\)/.test(sheet)
);

/* ---- 8 · AN OUTCOME IS NOT A RATING ------------------------------------ */

const outcomeCode = codeOnly(outcome);
for (const token of ["--bad", "--warn", "--good"]) {
  check(
    `the outcome control does not fill with ${token}`,
    !outcomeCode.includes(token),
    "those are band colours — Unacceptable and Tolerable — and a Fail is not a band"
  );
}
check(
  "it fills with the brand accent instead",
  /background: on \? "var\(--acc\)"/.test(outcomeCode)
);
check(
  "state is carried by more than colour",
  /<Icon width=\{16\} height=\{16\} \/>/.test(outcome) && /\{label\}/.test(outcome),
  "an icon and a word survive sunlight, a projector and a colour-blind reader"
);
check(
  "it is one control, not four cards",
  /role="radiogroup"/.test(outcome) && /grid-cols-4/.test(outcome)
);
check(
  "the same segment tapped twice clears the outcome",
  /onChange\(on \? null : key\)/.test(outcome),
  "a status set by mistake that cannot be unset turns a blank 'not captured' into an untrue Pass"
);

console.log(`\n${failures === 0 ? "AD-HOC OK" : `${failures} FAILURES`}`);
process.exit(failures ? 1 : 0);
