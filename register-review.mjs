/** THE REGISTER REVIEW WORKBOOK.
 *
 *  Sarel: "the first thing i want us to review in the 324 audit checks is to
 *  critically look at it whether it requires a discussion to confirm compliance
 *  or an actual piece of evidence like a COC or something that need to be
 *  inspected physically in the airport or asset. everything needs evidence but
 *  some looks for a document as the main evidence and others look for a
 *  discussion and evidence to confirm the answers. it feels like there is too
 *  many checks in multiple categories. do a thorough check again to determine
 *  how we will confirm the compliance of an item. lets make this our first
 *  review and along with it let record exactly what should be inspected and what
 *  we are looking for as evidence to make the check compliant."
 *
 *  And, narrowing it: "look at what to inspect or what the check and requirement
 *  refer to, is it something physical like an asset, a colour, a vent etc then
 *  its something to go see."
 *
 *  THE THREE CATEGORIES ARE Document / Asset / Practice, agreed in conversation
 *  and settled with "agree, go ahead". They answer one question — what decides
 *  whether this check is compliant:
 *
 *    Document  a certificate, a report, a register, a drawing, a lab result.
 *              The number or the signature IS the compliance. Reading it is the
 *              only way to know, and nothing on site can substitute for it.
 *    Asset     a physical thing, or a condition of one — a colour, a vent, a
 *              guard, a crack, a lid. You have to go and look, and no file can
 *              make a faded marking compliant.
 *    Practice  a way of working. Whether the round actually happens, whether the
 *              trigger actually produces the action, whether the procedure is
 *              followed rather than merely written. Fails while every document
 *              in the file reads clean.
 *
 *  THE THRESHOLD IS NOT A FOURTH CATEGORY. 274 of the 324 checks carry a
 *  measurable physical figure, so a "Specification" category would swallow the
 *  register whole and say nothing. The threshold is an attribute of nearly every
 *  check and it belongs in what makes it compliant, not in what confirms it.
 *
 *  `inspect` is the second axis, and it is not the same question:
 *    examine    go and look; the walk can find the answer
 *    reconcile  go and look to check the record is THIS asset's — a serial
 *               number against a certificate, a measured distance against a
 *               drawing, the towers on site against the certificates held
 *    none       there is nothing to see; the walk would be theatre
 *
 *  A Document check can still be `reconcile` — that is the whole point of the
 *  distinction. A calibration certificate is the compliance, AND the walk is
 *  what proves the certificate belongs to the meter in front of you.
 *
 *  Run: node --experimental-strip-types register-review.mjs
 */

import fs from "node:fs";
import { buildWorkbook } from "./src/lib/xlsx.ts";

const checks = JSON.parse(fs.readFileSync("src/data/checks.json", "utf8"));
const review = JSON.parse(fs.readFileSync("src/data/source/register-review.json", "utf8"));

const flat = (v) => (Array.isArray(v) ? v.join("\n") : v == null ? "" : String(v));

/* ------------------------------------------------------------------ Review */
/* One row per check, in register order. The three "current" columns are what
   the register says today; the rest is the proposal. Nothing is overwritten
   here — this workbook is the argument, and checks.json only changes after
   Sarel has read it. */
const reviewSheet = {
  name: "Review",
  columns: [
    { header: "ID", width: 16 },
    { header: "Discipline", width: 22 },
    { header: "Asset system", width: 28, wrap: true },
    { header: "Area", width: 20, wrap: true },
    { header: "Requirement", width: 54, wrap: true },
    { header: "Current vtype", width: 26, wrap: true },
    { header: "Confirmed by", width: 13 },
    { header: "Go and see", width: 11 },
    { header: "Why that category", width: 60, wrap: true },
    { header: "What to inspect", width: 60, wrap: true },
    { header: "What makes it compliant", width: 66, wrap: true },
    { header: "Gaps", width: 60, wrap: true },
    { header: "Split / merge candidate", width: 52, wrap: true },
  ],
  rows: checks.map((c) => {
    const r = review[c.id] ?? {};
    return [
      c.id,
      c.discipline,
      c.system,
      c.area,
      flat(c.requirement),
      flat(c.vtype),
      r.by ?? "",
      r.inspect ?? "",
      r.why ?? "",
      /* What to inspect: the register's own walkabout text where it has one.
         `inspect: none` rows are stated as such rather than left blank — blank
         reads as "not yet written", which is a different thing from "there is
         nothing to see here". */
      r.inspect === "none" ? "— nothing to inspect on site" : flat(c.walkabout),
      /* What makes it compliant: the proposed line where the review wrote one
         (every stub and every conflict got one), otherwise the register's
         existing evidenceExpected. */
      r.proof ?? flat(c.evidenceExpected),
      flat(r.gaps),
      r.split ?? "",
    ];
  }),
};

/* ----------------------------------------------------------------- Summary */
const disciplines = [...new Set(checks.map((c) => c.discipline))];
const count = (pred) => checks.filter(pred).length;
const summary = {
  name: "Summary",
  columns: [
    { header: "Discipline", width: 26 },
    { header: "Checks", width: 9 },
    { header: "Document", width: 11 },
    { header: "Asset", width: 9 },
    { header: "Practice", width: 10 },
    { header: "Go and see", width: 12 },
    { header: "Reconcile", width: 11 },
    { header: "Nothing to see", width: 15 },
    { header: "Checks with a gap noted", width: 24 },
    { header: "Split / merge candidates", width: 25 },
  ],
  rows: [
    ...disciplines.map((d) => {
      const inD = (p) => count((c) => c.discipline === d && p(review[c.id] ?? {}));
      return [
        d,
        count((c) => c.discipline === d),
        inD((r) => r.by === "Document"),
        inD((r) => r.by === "Asset"),
        inD((r) => r.by === "Practice"),
        inD((r) => r.inspect === "examine"),
        inD((r) => r.inspect === "reconcile"),
        inD((r) => r.inspect === "none"),
        inD((r) => !!r.gaps),
        inD((r) => !!r.split),
      ];
    }),
    [
      "ALL",
      checks.length,
      count((c) => review[c.id]?.by === "Document"),
      count((c) => review[c.id]?.by === "Asset"),
      count((c) => review[c.id]?.by === "Practice"),
      count((c) => review[c.id]?.inspect === "examine"),
      count((c) => review[c.id]?.inspect === "reconcile"),
      count((c) => review[c.id]?.inspect === "none"),
      count((c) => !!review[c.id]?.gaps),
      count((c) => !!review[c.id]?.split),
    ],
  ],
};

/* -------------------------------------------------------------------- Gaps */
/* One row per gap note, not per check — a check with three problems argues
   three times, and each one is a separate decision for Sarel. */
const gapRows = [];
for (const c of checks) {
  for (const g of review[c.id]?.gaps ?? []) {
    /* The kind is derived from the note's own words rather than typed twice,
       so the filter can never disagree with what the note says. */
    const kind = /duplicat|verbatim|copy of|near-identical|overlaps|appears (six|five|four|three) times|recurs at|of (five|six) near-identical|identical requirement text|repeats the .* set/i.test(g)
      ? "Duplicate or overlap"
      : /CONFLICT|conflicting|DIRECT|two different intervals|three different clocks|says .* ACSA .* says/i.test(g)
        ? "Conflict in the source"
        : /evidence stub|NO evidence stated|no ACSA evidence named/i.test(g)
          ? "Evidence not stated"
          : /WRONG SYSTEM|copy-paste|copied from|wrong surface|typo|carries the typo/i.test(g)
            ? "Wrong content on the row"
            : /no acsaThreshold|no threshold|no pass mark|no interval|no criterion|no stated criterion|nowhere in ACSA|not in ACSA|ACSA (requires only|states no|does not|never says|qualifies)|requires NO|not stated|is not stated|ACSA'?s? (threshold|calibration list|own manual|manual'?s? term)|no source named|appears? nowhere else|but not by ACSA|a third unrelated system|old vocabulary/i.test(g)
              ? "No threshold to test against"
              : /no walkabout text at all/i.test(g)
                ? "Noted — nothing to inspect, correctly"
                : /the row's own question/i.test(g)
                  ? "The question does the check's work"
                  : /bundles|two different checks in one|three checks in one|three different check types|four unrelated|two checks in one|unanswerable|applicability/i.test(g)
                    ? "More than one check in the row"
                    : "Other";
    gapRows.push([c.id, c.discipline, c.system, kind, g]);
  }
}
const gaps = {
  name: "Gaps",
  columns: [
    { header: "ID", width: 16 },
    { header: "Discipline", width: 22 },
    { header: "Asset system", width: 28, wrap: true },
    { header: "Kind", width: 24 },
    { header: "What is wrong with the check as written", width: 96, wrap: true },
  ],
  rows: gapRows,
};

/* ------------------------------------------------------- Split candidates */
const splits = {
  name: "Split or merge",
  columns: [
    { header: "ID", width: 16 },
    { header: "Discipline", width: 22 },
    { header: "Asset system", width: 28, wrap: true },
    { header: "Requirement", width: 54, wrap: true },
    { header: "Proposal", width: 84, wrap: true },
  ],
  rows: checks
    .filter((c) => review[c.id]?.split)
    .map((c) => [c.id, c.discipline, c.system, flat(c.requirement), review[c.id].split]),
};

/* --------------------------------------------------------- Kind of gap, counted */
const kinds = [...new Set(gapRows.map((r) => r[3]))];
const gapSummary = {
  name: "Gaps by kind",
  columns: [
    { header: "Kind", width: 28 },
    { header: "Notes", width: 9 },
    { header: "Checks affected", width: 17 },
  ],
  rows: kinds
    .map((k) => [
      k,
      gapRows.filter((r) => r[3] === k).length,
      new Set(gapRows.filter((r) => r[3] === k).map((r) => r[0])).size,
    ])
    .sort((a, b) => b[1] - a[1]),
};

const bytes = buildWorkbook([summary, reviewSheet, gaps, gapSummary, splits]);
const out = process.argv[2] ?? "KSIA-register-review.xlsx";
fs.writeFileSync(out, bytes);
console.log(
  `${out} — ${checks.length} checks, ${gapRows.length} gap notes, ${splits.rows.length} split/merge candidates`
);
