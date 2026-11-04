import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Response.fieldObservation reaches sharepoint.ts and exports.ts correctly
 *  (see tests/sharepoint.test.mjs and tests/exports.test.mjs) — but two
 *  screens still only ever read Response.observation for their own summary
 *  displays, found by the standing SharePoint sync-integrity review the
 *  same day fieldObservation shipped (PR #218): dashboard.tsx's
 *  Check-points card, and findings/page.tsx's note built for a
 *  check-raised finding's row. A note typed only on the Inspection screen
 *  was invisible in both places once the two fields stopped being the
 *  same text — same bug class the review exists to catch, one layer up
 *  from sync, in display code. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const dashboard = src("app", "(app)", "dashboard", "page.tsx");
const findings = src("app", "(app)", "findings", "page.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- dashboard.tsx's Check-points card ----------------------------------- */

check(
  "the dashboard check-point card shows fieldObservation alongside observation, not instead of it",
  /\{r\?\.observation && \(/.test(dashboard) &&
    /\{r\?\.fieldObservation\?\.trim\(\) && \(/.test(dashboard),
  "a note typed only on the Inspection screen must still be visible here"
);

check(
  "the field note is labelled, so it is never mistaken for the desk's own observation",
  /Inspection:\{" "\}/.test(dashboard)
);

/* ---- findings/page.tsx's note for a check-raised finding ----------------- */

check(
  "a check-raised finding's note combines observation AND fieldObservation, not just observation",
  /checkResponse\?\.observation\?\.trim\(\) \|\| ""/.test(findings) &&
    /checkResponse\?\.fieldObservation\?\.trim\(\)/.test(findings),
  "a finding raised from a check must carry the Inspection screen's own note too, not only the desk's"
);

check(
  "the combined note is labelled the same way as the dashboard card, not silently concatenated",
  /`Inspection: \$\{checkResponse\.fieldObservation\.trim\(\)\}`/.test(findings)
);

check(
  "a walk-raised (adhoc) finding's own note is untouched — it never shared observation/fieldObservation to begin with",
  /const note = from\s*\n\s*\? from\.note/.test(findings),
  "from.note is AdHocItem's own field, a different source entirely"
);

check(
  "the local Response shape findings/page.tsx declares for its own props includes fieldObservation",
  /compliance\?: string \| null;\s*\n\s*observation\?: string;\s*\n\s*fieldObservation\?: string;/.test(findings),
  "without this, TypeScript would never have caught a typo in the field name here"
);

console.log(
  failures === 0 ? "\nFIELD OBSERVATION DISPLAY OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
