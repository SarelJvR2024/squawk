import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE REGISTER REVIEW, NOW PART OF THE MASTER DATA.
 *
 * Sarel, 2026-09-10: "Do the three categories go into checks.json as a field?
 * — go ahead and make sure it is updated across the system."
 *
 * That is the schema change CLAUDE.md reserves for him, and he made it. These
 * assertions are about the two ways it can go wrong afterwards.
 *
 * ONE: the fields exist on the type and in the data but nothing reads them, so
 * the review is a column in a file rather than something an auditor sees. The
 * screen, the workbook and the assistant context are each asserted here.
 *
 * TWO: `checks.json` and `src/data/source/register-review.json` drift apart.
 * The review file is still the working document — it carries the gap notes and
 * the split proposals that checks.json has no business holding — so the two now
 * overlap on three fields and have to agree.
 *
 * And the conflict rule, which is Sarel's other instruction the same day:
 * "still keep the check as the ACSA audit check but add the airport specific
 * requirement and highlight it in the heading so that it is clear there is a
 * conflict." The check text is NOT rewritten. That is asserted, because
 * "correcting" the register is the tempting wrong move and it would leave TPJV
 * unable to reconcile a single row against ACSA's own copy.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const checks = JSON.parse(read("src", "data", "checks.json"));
const review = JSON.parse(read("src", "data", "source", "register-review.json"));
const types = read("src", "lib", "types.ts");
const detail = read("src", "components", "CheckDetail.tsx");
const exports_ = read("src", "lib", "exports.ts");
const assist = read("src", "lib", "assist.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · the data ------------------------------------------------------- */

const BY = new Set(["Document", "Asset", "Practice"]);
const INSPECT = new Set(["examine", "reconcile", "none"]);

check(
  "every check carries what confirms its compliance",
  checks.every((c) => BY.has(c.confirmedBy)),
  `${checks.filter((c) => !BY.has(c.confirmedBy)).length} without one`
);

check(
  "and what the walk contributes",
  checks.every((c) => INSPECT.has(c.inspect)),
  ""
);

check(
  "the two are separate axes, not one collapsed into the other",
  checks.some((c) => c.confirmedBy === "Document" && c.inspect === "reconcile") &&
    checks.some((c) => c.confirmedBy === "Asset" && c.inspect === "examine") &&
    checks.some((c) => c.confirmedBy === "Document" && c.inspect === "none"),
  "a Document check that is also a reconcile is the pair the old single vtype tag could not express"
);

check(
  "vtype is still there, unchanged",
  checks.some((c) => c.vtype),
  "ACSA's own column stays — their copy of the workbook has to reconcile against ours"
);

/* The stub checks are why the review happened. Every one has to carry a
   written compliance test or the screen prints "Test records" back at the
   auditor and calls it a standard. */
const evidenceOf = (c) =>
  Array.isArray(c.evidenceExpected) ? c.evidenceExpected.join(" ") : String(c.evidenceExpected ?? "");
const stubs = checks.filter((c) => evidenceOf(c).trim().length < 40);
check(
  "every check whose evidence column is a stub carries a written compliance test",
  stubs.every((c) => c.complianceTest && c.complianceTest.length > 40),
  `${stubs.filter((c) => !c.complianceTest).length} of ${stubs.length} still fall back to the stub`
);

/* ---- 2 · it agrees with the review it came from -------------------------- */

const drift = checks.filter(
  (c) =>
    review[c.id]?.by !== c.confirmedBy ||
    review[c.id]?.inspect !== c.inspect ||
    (review[c.id]?.proof ?? null) !== c.complianceTest
);
check(
  "checks.json and the review file agree on all three fields",
  drift.length === 0,
  drift.slice(0, 4).map((c) => c.id).join(", ")
);

check(
  "the review file still carries what checks.json has no business holding",
  Object.values(review).some((r) => r.gaps) && Object.values(review).some((r) => r.split),
  "gap notes and split proposals are the argument for re-cutting the register, not master data"
);

/* ---- 3 · a conflict is declared, and the check is NOT rewritten ---------- */

const conflicts = checks.filter((c) => c.siteVariant?.conflict);

check(
  "the site conflicts are marked",
  conflicts.length >= 8,
  `${conflicts.length} marked`
);

check(
  "each carries both statements and the clause that settles it",
  conflicts.every(
    (c) =>
      c.siteVariant.conflict.checkSays &&
      c.siteVariant.conflict.siteRequires &&
      c.siteVariant.conflict.source &&
      ["stricter", "looser", "different"].includes(c.siteVariant.conflict.direction)
  ),
  ""
);

/* THE ONE THAT MATTERS. MEC-037 is titled "A 3 yearly ... Piping Pressure test"
   and D060 021M cl. 4.17.5 makes it YEARLY at King Shaka. The fix is to declare
   the conflict, never to edit ACSA's wording — a row quietly corrected is a row
   nobody can reconcile against their own copy at the out-brief. */
const mec037 = checks.find((c) => c.id === "KSIA-MEC-037");
check(
  "the check's own requirement text is left exactly as ACSA wrote it",
  /3 yearly/i.test(mec037.requirement),
  "the register is the client's document; correcting it in place is not ours to do"
);

check(
  "and the site's contradicting requirement sits beside it",
  /YEARLY/.test(mec037.siteVariant.conflict.siteRequires) &&
    mec037.siteVariant.conflict.direction === "stricter",
  "stricter is the dangerous direction — auditing to the check would pass an installation two years overdue"
);

/* ---- 4 · across the system ---------------------------------------------- */

check(
  "the type declares all three, and the conflict",
  /confirmedBy: "Document" \| "Asset" \| "Practice" \| null;/.test(types) &&
    /inspect: "examine" \| "reconcile" \| "none" \| null;/.test(types) &&
    /complianceTest: string \| null;/.test(types) &&
    /conflict\?: \{/.test(types),
  ""
);

check(
  "the check screen says a conflict is a conflict, not a variant",
  /CONFLICT · \{check\.siteVariant\.site\}/.test(detail) &&
    /the check and ACSA&rsquo;s own manual disagree at/.test(detail),
  "a variant adds detail; a conflict means the title says something ACSA contradicts"
);

check(
  "and shows both figures rather than picking one silently",
  /The check as written says/.test(detail) && /requires — this governs/.test(detail),
  ""
);

check(
  "the screen carries the compliance test where the evidence is judged",
  /\{check\.complianceTest\}/.test(detail) && /Compliant when —/.test(detail),
  ""
);

check(
  "the workbook carries all three next to the requirement",
  /\{ header: "Confirmed by", width: 13 \},/.test(exports_) &&
    /\{ header: "On the walk", width: 15 \},/.test(exports_) &&
    /\{ header: "Compliant when", width: 66, wrap: true \},/.test(exports_),
  ""
);

check(
  "a conflict reads as one in the workbook too",
  /CONFLICT \(\$\{c\.siteVariant\.conflict\.direction\}\)/.test(exports_),
  "a reviewer at head office should not have to spot the discrepancy themselves"
);

check(
  "'nothing to see on site' is spelled out rather than exported as a token",
  /"Nothing to see on site"/.test(exports_),
  "'none' in a cell reads as missing data; it is a finding about the check and should be sortable"
);

check(
  "the assistant is told which standard governs, with both quoted",
  /CONFLICT at \$\{check\.siteVariant\.site\}/.test(assist) &&
    /do not restate the check's own interval as the standard/.test(assist),
  "given only one side, a model reconciles them into something plausible and wrong"
);

check(
  "and the composed observation names the standard actually applied",
  /which differs from the register's own wording/.test(assist),
  "'assessed against the site-specific threshold' is true and useless in a report read a year later"
);

console.log(failures === 0 ? "\nREVIEW FIELDS OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
