import path from "node:path";
import { fileURLToPath } from "node:url";

/* reviewCombinedCompliance (src/lib/review.ts) — the worst-of-three reading
 *  the Review screen's sticky compliance strip shows, on Sarel's own
 *  explicit instruction (15 Oct 2026): "if any one of the three is
 *  non-compliant, the combined reading is non-compliant."
 *
 *  Imported directly, like risk-matrix.test.mjs imports risk.ts — a relative
 *  path, not the "@/" alias, so this needs no loader and is never added to
 *  NEEDS_ALIAS. */

const here = path.dirname(fileURLToPath(import.meta.url));
const { reviewCombinedCompliance } = await import(
  path.join(here, "..", "src", "lib", "review.ts")
);

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
};

check(
  "all three compliant reads as compliant",
  reviewCombinedCompliance("C", "C", "C") === "C"
);
check(
  "a non-compliance on ANY one axis wins, whichever axis it's on",
  reviewCombinedCompliance("NC", "C", "C") === "NC" &&
    reviewCombinedCompliance("C", "NC", "C") === "NC" &&
    reviewCombinedCompliance("C", "C", "NC") === "NC"
);
check(
  "not-verified beats compliant but loses to non-compliant",
  reviewCombinedCompliance("C", "NV", "C") === "NV" &&
    reviewCombinedCompliance("NC", "NV", "C") === "NC"
);
check(
  "N/A on the audit-check axis is read as a clean outcome, not a worse one than compliant",
  reviewCombinedCompliance("N/A", "C", "C") === "C" || reviewCombinedCompliance("N/A", "C", "C") === "N/A"
);
check(
  "N/A never masks a real non-compliance on another axis",
  reviewCombinedCompliance("N/A", "NC", "C") === "NC"
);
check(
  "a still-unanswered axis (null) is excluded from the comparison, not treated as a value",
  reviewCombinedCompliance(null, "NC", "C") === "NC" && reviewCombinedCompliance(null, "C", "C") === "C"
);
check(
  "all three unanswered returns null — nothing to combine yet, not a fourth compliance value",
  reviewCombinedCompliance(null, null, null) === null
);

process.exit(failures ? 1 : 0);
