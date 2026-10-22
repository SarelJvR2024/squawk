import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE DEFERRED ITEM FROM THE DESKTOP/TABLET REDESIGN BRIEF — list and detail
 * side by side on Inspection, from `lg` (1024px) up, with the narrow/medium
 * Sheet modal untouched below it.
 *
 * Source-read, like findings-mobile-nav.test.mjs (that file's own note
 * explains why: no framework needed, and the browser-suite lane in
 * run-all.sh is a fixed, hand-curated list this round does not add to).
 * What a snapshot or a type-check cannot see is the thing most likely to go
 * wrong here: TWO mutually exclusive render paths sharing ONE extraction —
 * a Sheet modal and an inline pane, built from the same `selectedDetail`
 * object, gated so only one of them ever mounts at a width. A second,
 * hand-copied version of the check's fields in one of the two paths is the
 * exact risk the brief named; this reads the source for the single
 * extraction and for both consumers reading the same fields off it, rather
 * than for the fields themselves (the fields are each still inside
 * `selectedDetail`'s own IIFE, verbatim, from before this round touched the
 * file — nothing here re-asserts them one by one). */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const page = fs.readFileSync(
  path.join(root, "src", "app", "(app)", "field", "page.tsx"),
  "utf8"
);

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- the breakpoint is measured, js-driven, and defaults narrow --------- */

check(
  "a wide-detail flag exists, defaulting to the narrow/modal path",
  /\[isWideDetail, setIsWideDetail\] = useState\(false\)/.test(page),
  "before the matchMedia effect runs (first paint, SSR), the Sheet modal must be what's live — never a flash of the wide pane"
);

check(
  "the flag is driven by a 1024px (`lg`) matchMedia query, not a bare CSS breakpoint",
  /window\.matchMedia\("\(min-width: 1024px\)"\)/.test(page),
  "it has to be JS-driven because it gates WHICH of two mutually exclusive things mounts, not just a CSS visibility toggle"
);

check(
  "the query is kept live with a change listener, not read once",
  /mq\.addEventListener\("change", update\)/.test(page) &&
    /mq\.removeEventListener\("change", update\)/.test(page),
  "an auditor rotating a tablet or resizing a window must flip modes without a reload"
);

/* ---- one extraction, built once, consumed by both paths ------------------ */

check(
  "the check's detail is built once, above the component's own return, not inline in either render path",
  /const selectedDetail = \(\(\) => \{/.test(page),
  "two inline copies — one in the Sheet, one in the pane — is exactly the drift risk the brief named"
);

check(
  "that single build returns all five pieces both consumers need",
  /return \{ c, badges, title, subtitle, footer, body \};/.test(page)
);

check(
  "the Sheet modal reads its props from selectedDetail, not from its own locals",
  /badges=\{selectedDetail\.badges\}[\s\S]{0,120}title=\{selectedDetail\.title\}[\s\S]{0,120}subtitle=\{selectedDetail\.subtitle\}[\s\S]{0,120}footer=\{selectedDetail\.footer\}/.test(
    page
  )
);

check(
  "the Sheet's body is selectedDetail.body too, not a second JSX tree",
  /<Sheet[\s\S]{0,400}>\s*\{selectedDetail\.body\}\s*<\/Sheet>/.test(page)
);

check(
  "WideCheckPane is handed the exact same selectedDetail object",
  /<WideCheckPane\s+detail=\{selectedDetail\}/.test(page)
);

/* ---- only one of the two ever mounts -------------------------------------- */

check(
  "the Sheet modal is gated to render ONLY below the breakpoint",
  /\{selectedDetail && !isWideDetail && \(\s*<Sheet/.test(page),
  "mounting it hidden-but-alive at wide widths would leave an idle focus trap and duplicate ids in the DOM"
);

check(
  "the inline pane is gated to render ONLY at and above the breakpoint",
  /\{isWideDetail && \(\s*<WideCheckPane/.test(page)
);

/* A REAL mutual exclusion, not just two independent conditions that happen
 * to agree today — `isWideDetail` must be the exact same boolean (negated
 * for one, bare for the other), read from the exact same state, so the two
 * can never both be true at once by construction. */
check(
  "both gates read the identical state variable, so they can never both be true at once",
  (page.match(/!isWideDetail/g) ?? []).length >= 1 &&
    (page.match(/\{isWideDetail && \(/g) ?? []).length >= 1
);

/* ---- selecting a different item updates the pane in place ---------------- */

/* `selectedDetail` is derived straight from `openItem` (the same piece of
 * state a list-row tap already sets via `setOpenItem(c.id)`, unchanged by
 * this round) — so there is no separate "which item is open in the wide
 * pane" state to go stale, and no close/reopen step for picking a new row
 * while the pane is visible. This is the structural guarantee behind "the
 * pane updates in place": one source of truth, read fresh every render. */
check(
  "selectedDetail is derived from openItem, the same state a row tap sets",
  /const c = openItem \? visible\.find\(\(x\) => x\.id === openItem\) : null;/.test(page)
);

check(
  "no second 'which check is open in the wide pane' state exists to fall out of sync with openItem",
  !/isWideOpenItem|wideSelectedId|wideOpenItem|paneCheckId/.test(page)
);

/* ---- the row tap that opens a check is unchanged by this round ----------- */

check(
  "picking a check-point row still just sets openItem — no separate wide-mode click handler",
  /onClick=\{\(\) => \{ setOpenItem\(c\.id\); setCheckTab\("walkabout"\); \}\}/.test(page)
);

/* ---- the mobile Sheet's own hard-won behaviour is untouched --------------- */

check(
  "the Sheet is still opened with the same props shape it always was (open, wide, onClose)",
  /<Sheet\s*\n\s*open\s*\n\s*wide\s*\n\s*onClose=\{\(\) => setOpenItem\(null\)\}/.test(page)
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
