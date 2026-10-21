import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* TASK 2 OF THE OVERNIGHT REFINEMENT PASS — fixing a specific, reported bug:
 * below `lg`, tapping an asset system or a finding row left the list on
 * screen with the detail panel rendered far below it, because both halves of
 * the screen stacked into one column and neither one ever hid. That failure
 * is invisible to a snapshot (the detail panel DID render — just a long
 * scroll away) and invisible to a type-check (nothing here is a type error),
 * so this reads the actual source for the three things that have to all be
 * true together: a row tap flips a flag and ONLY a row tap does, something
 * hides the list once that flag is set (and un-hides it at `lg`, where this
 * never mattered), and a way back exists that is not itself a second list.
 *
 * No framework, no browser — this sandbox has no Playwright installed, which
 * is why this is a static read of the source rather than a rendered
 * interaction test. See the final report for that gap named explicitly. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const page = fs.readFileSync(
  path.join(root, "src", "app", "(app)", "findings", "page.tsx"),
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

check(
  "a mobile detail-open flag exists, defaulting closed",
  /\[mobileDetailOpen, setMobileDetailOpen\] = useState\(false\)/.test(page),
  "the list must be what shows first, on every load, before any row is tapped"
);

check(
  "opening the detail view captures the list's own scroll position first",
  /openMobileDetail = \(\) => \{\s*setMobileListScroll\(scrollRef\.current\?\.scrollTop/.test(
    page
  ),
  "without this, 'back' always lands at the top of the list instead of where the auditor left it"
);

check(
  "going back closes the detail view and restores that scroll position",
  /backToList = \(\) => \{\s*setMobileDetailOpen\(false\);[\s\S]{0,120}scrollRef\.current\?\.scrollTo/.test(
    page
  )
);

/* BOTH ROUTES IN — the asset-system tree row and the flat findings-register
 * row are two different onClick handlers in this file; a fix applied to only
 * one of them fixes the bug on only one of the screen's two modes. */
check(
  "picking an asset-system row opens the mobile detail view",
  /onClick={\(\) => \{\s*setActiveKey\(key\);\s*openMobileDetail\(\);/.test(page)
);
check(
  "picking a finding row (the flat register) opens the mobile detail view too",
  /onClick={\(\) => \{\s*setActiveFindingId\(f\.id\);\s*openMobileDetail\(\);/.test(page)
);

/* THE DEFAULT SELECTION MUST NOT COUNT AS A TAP. shownKey/shownFinding land
 * on the first system/finding so the panel never arrives empty (desktop
 * behaviour, unchanged) — but that derivation must never itself flip
 * mobileDetailOpen, or the very first paint on a phone would already be
 * showing the detail view with nothing tapped. */
check(
  "landing on the first system/finding by default never sets the mobile flag itself",
  !/const shownKey =[\s\S]{0,200}setMobileDetailOpen/.test(page) &&
    !/const shownFinding =[\s\S]{0,200}setMobileDetailOpen/.test(page)
);

/* THE LIST HIDES, AND ONLY BELOW `lg`. Tailwind's unprefixed `hidden` has no
 * media query, so it is `lg:block` (or `lg:flex`, matching whatever that
 * panel's own desktop display already was) that has to win it back — if
 * that pairing is missing, the fix either never hides the list on a phone or
 * never un-hides the panels side by side on desktop. */
check(
  "the list panel hides below `lg` once the detail view is open, and comes back at `lg`",
  /mobileDetailOpen \? "hidden" : ""/.test(page) && /lg:block lg:min-h-0 lg:overflow-y-auto/.test(page)
);

check(
  "each of the three detail-panel branches gets the matching hidden/lg: pairing",
  (page.match(/mobileCls\}/g) ?? []).length >= 3,
  "systems-mode, findings-mode and the empty-selection fallback all need it, not just one"
);

/* THE WAY BACK, AND IT IS lg:hidden — a 'Back to the list' control that also
 * showed up on desktop, where the list is already visible beside the panel,
 * would be a second, redundant way to do nothing. */
check(
  'a "Back to…" control exists, reachable only below `lg`',
  /onClick={backToList}[\s\S]{0,160}lg:hidden/.test(page) &&
    /Back to \{mode === "findings" \? "findings" : "asset systems"\}/.test(page)
);

/* NOTHING ELSE RESET. Search text and the 2025-rating filter must survive a
 * trip from list to detail and back — this scans the two functions that do
 * that trip for any call that touches them. */
const navFns = page.match(/const (?:openMobileDetail|backToList) = [\s\S]*?\n  \};/g) ?? [];
check(
  "switching between list and detail never touches the search box or the rating filter",
  navFns.length === 2 && navFns.every((fn) => !/setQ\(|setBandFilter\(/.test(fn)),
  "task 2 is presentation/navigation only — filters are task 3's and must not move here"
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
