import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The tablet is the device, not a narrow desktop.
 *
 *  Three things were wrong at once, and all three cost capture rather than
 *  looks:
 *
 *  1. The desk build is a mouse design — 26px chips, 9px type. On an apron,
 *     tapped with a gloved thumb, a target missed twice is an auditor who
 *     stops capturing and writes on paper.
 *  2. The check screen went two-pane only at xl (1280px). An iPad in
 *     landscape is 1180px, so it stacked — and the reference column is first
 *     in the DOM, which put basis, thresholds and every ACSA document above
 *     the controls. Capture was below the fold on the exact device it was
 *     designed for.
 *  3. Field mode is the walkabout screen and was the one screen that never
 *     showed the walkabout options. 9,836 researched options sat in a library
 *     only the desk screen opened, and the flag marking which observations
 *     want a photograph rendered nowhere but a desk tooltip.
 *
 *  Source-read, like the other offline suites. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const css = src("app", "globals.css");
const detail = src("components", "CheckDetail.tsx");
const field = src("app", "(app)", "field", "page.tsx");
const capture = src("components", "Capture.tsx");
const shell = src("components", "AppShell.tsx");
const sticky = src("components", "StickyActions.tsx");

let failures = 0;
const check = (name, cond, detailText = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detailText ? `  [${detailText}]` : ""}`);
  }
};

/* --------------------------------------- Part 1: targets a thumb can hit */

check(
  "the touch floor applies where the pointer is coarse",
  /@media \(pointer: coarse\)/.test(css),
  "a mouse should see no change at all"
);

check(
  "buttons and selects get a 44px floor on touch",
  /button:not\(\.tap-tight\)[\s\S]{0,200}?min-height: 44px;/.test(css),
  ""
);

check(
  "icon-only controls get width too",
  /:has\(> svg:only-child\)[\s\S]{0,80}?min-width: 44px;/.test(css),
  "an icon button has no text to widen it"
);

check(
  "form fields are 16px on touch",
  /input,\s*\n\s*textarea,\s*\n\s*select \{\s*\n\s*font-size: 16px;/.test(css),
  "iOS zooms the page in below 16px and does not zoom back out"
);

check(
  "the floor is opt-out-able",
  /\.tap-tight/.test(css),
  "a global floor with no escape hatch breaks a dense strip somewhere"
);

check(
  "Answer Library chip rows opt in",
  /\.chip-row button \{[\s\S]{0,80}?min-height: 44px;/.test(css) &&
    /chip-row/.test(detail),
  "the chips are the capture control — they are the targets that matter most"
);

/* ------------------------------------- Part 2: capture is not below the fold */

/* The two panes are ONE now. An iPad in landscape is 1180px and the check was
   spending 508px of it on a system rail and a check list beside the panes; the
   navigator is one column and the check screen is one tabbed panel, so nothing
   has to be ordered around a stack that no longer happens. */
check(
  "the check screen is one panel that takes the width, not two panes",
  !/lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.08fr\)\]/.test(detail) &&
    /role="tabpanel"[\s\S]{0,400}lg:min-h-0 lg:flex-1 lg:overflow-y-auto/.test(detail),
  "two columns each with their own tab strip was the busyness Sarel named"
);

/* The strip is three groups now — The requirement, then the Answer library,
   then Reference — and the screen opens on ACSA's own requirement rather than
   on our evidence list (Sarel, 10 Sep). What this assertion has always been
   guarding is unchanged and is the part that matters on a tablet: the CAPTURE
   tabs come before the rest of the reference material, so an auditor is not
   scrolling past four pages of background to reach the controls. */
check(
  "capture comes before the reference in the strip",
  detail.indexOf('group: "do"') < detail.indexOf('group: "read"') &&
    /\(\["acsa", "do", "read"\] as const\)/.test(detail),
  "the reference used to be first in the DOM and sat above the controls when the panes stacked"
);

check(
  "the reference is still shown, not hidden",
  !/hidden lg:block[\s\S]{0,200}?reference/.test(detail) &&
    /siteVariant &&/.test(detail),
  "the site variant must never be collapsed away — 33 checks are stricter here"
);

/* ------------------------- Part 3: field mode does the walkabout it is for */

check(
  "field mode loads the Answer Library",
  /useAnswerLibrary\(\)/.test(field),
  "the walkabout screen was the one screen that never opened it"
);

check(
  "field mode shows the researched walkabout options",
  /library\?\.\[c\.id\]\?\.WO \?\? \[\]/.test(field) && /wo\.map\(\(w, i\) =>/.test(field),
  "four status buttons is not a visual inspection"
);

/* The two calls, in that order, with a comment allowed between them — and the
   comment there is load-bearing, because the commit is exactly what got
   dropped when the check moved from expanding in place into a sheet. The rule
   is "tapping an option credits the field half", not "these two lines are
   adjacent"; an assertion written to the formatting fails on a comment and
   passes on a reordering, which is backwards. */
check(
  "tapping an option records it and its status, as FIELD work",
  /* 2026-09-10: the commit goes through `saveField`, which writes the
     inspection's location and then commits the field half. Same assertion —
     tapping a researched option still credits the FIELD half in the same
     handler — following the call through the helper. */
  /setWalkabout\(c\.id, i, w\.sets\);[\s\S]{0,900}?saveField\(c\.id\);/.test(field),
  "tapped not typed, and credited to the half the tablet can actually answer"
);

check(
  "the photograph expectation is computed from the library flag",
  /wo\[picked\]\?\.photo === true && photos\.length === 0/.test(field),
  "the flag was carried in the data and rendered nowhere but a desk tooltip"
);

check(
  "and said on screen while the auditor is still in front of the asset",
  /Photograph expected for this observation/.test(field),
  ""
);

check(
  "the option's own photo marker is shown on the chip",
  /w\.photo \? " 📷" : ""/.test(field),
  ""
);

/* ------------------------------------------------- Part 4: less scrolling */

/* RETIRED 2026-09-10, and replaced rather than deleted.
   This asserted the card grid the "Seen on the walk" section used — a block of
   ad-hoc items above the register, three across on a tablet. That section is
   gone: Sarel asked for walk items to be filed into the asset system they
   belong to rather than shown at the top, so they are rows in the same list as
   the check-points now and there is no grid left to be three-up. What the
   assertion was really protecting — that a tablet in landscape shows more work
   per screen and not fewer — is protected by the row list itself, so the test
   moves to the property that replaced it. */
check(
  "walk items are rows in the asset system, not a block above the register",
  /data-walk=\{it\.id\}/.test(field) &&
    /for \(const it of walkVisible\) bucket\(it\.system\?\.trim\(\) \|\| NO_SYSTEM\)\.walk\.push\(it\);/.test(
      field
    ) &&
    !/Seen on the walk · not part of the/.test(field),
  "an item filed somewhere else entirely is one the auditor does not see again until the export"
);

check(
  "and a walk item says it is not one of ACSA's, in words and not by colour",
  /ADDED ON THE WALK/.test(field),
  "a row that looks like one of the 324 while being none of those things is the most misleading thing this screen could render"
);

/* --------------------------- Part 5: the scope bugs this pass turned up */

check(
  "media is named with the entity in view",
  /const entityCode = useEntityCode\(\);/.test(capture) &&
    !/CURRENT_ENTITY/.test(capture),
  "a voice note recorded at Cape Town was filenamed FALE-voice-…"
);

check(
  "field mode's zone note names the entity in view",
  !/CURRENT_ENTITY/.test(field),
  ""
);

/* ------------------------ And the phone, for the walkabout ---------------- */

/* The site walkabout is done on a PHONE, not the tablet — nobody carries an
   iPad up a ladder. Measured on an iPhone 12 (390x664) before any of this:

     the nav was 36px wide holding 844px of destinations

   It scrolled, technically. A 36px sliver is not a control, it reads as a
   rendering fault, and against the dark masthead it was a black stub. The
   whole navigation was effectively gone on the device the screen is for. */

check(
  "below sm the header wraps so the nav gets a row of its own",
  /masthead flex min-h-\[52px\] shrink-0 flex-wrap[\s\S]{0,80}sm:h-\[52px\] sm:flex-nowrap/.test(shell),
  "36px of navigation on the device the walkabout is actually done on"
);

check(
  "and the nav claims that whole row, going back to a flex child from sm",
  /order-last flex w-full min-w-0 shrink-0 basis-full[\s\S]{0,90}sm:order-none sm:w-auto sm:flex-1 sm:basis-auto/.test(shell)
);

/* FOUR HEADER CONTROLS BECAME ONE MENU.
   Sync, Export, Start again and the shortcuts sheet each held a slot in the
   masthead all day. Reset and the shortcuts sheet were hidden below sm to keep
   an iPhone SE header at two rows rather than three — 107px of a 568px screen
   instead of 155px. They are all in "More" now, which costs ONE slot, so the
   phone gets the two that matter back rather than losing the other two. */
check(
  "the four header actions are one menu, so the phone header stays two rows",
  /aria-haspopup="menu"/.test(shell) &&
    /label="Keyboard shortcuts"/.test(shell) &&
    /label="Start again"/.test(shell) &&
    /label="Export the workbook"/.test(shell) &&
    /label="Sync to the portal"/.test(shell),
  "four slots for controls used once a day, on every screen, all audit"
);

check(
  "and the menu itself is offered at EVERY width — Export and Sync were never phone-only losses",
  /className="relative">\s*\n\s*<button\s*\n\s*onClick=\{\(\) => \{ setMore/.test(shell),
  "a menu hidden below sm would have taken exporting from a phone away entirely"
);

/* The role simulator stays the one control a phone can go without: it exists
   so somebody can see what ACSA sees, and nobody does that one-handed. */
check(
  "the role pill is still desk-and-tablet only",
  /className="relative hidden sm:block">\s*\n\s*<button\s*\n\s*onClick=\{\(\) => \{ setRoleOpen/.test(shell)
);

check(
  "THE ACTION BAR CLEARS THE HOME INDICATOR",
  /paddingBottom: "calc\(0\.625rem \+ var\(--sticky-safe\)\)"/.test(sticky) &&
    /--sticky-safe: env\(safe-area-inset-bottom\);/.test(css),
  "bottom-0 on an iPhone puts Save & next under the one bit of screen furniture nobody can move"
);

check(
  "and only ONE of the two bottom bars pads for it",
  /--sticky-safe: 0px;/.test(css) && /--bottom-nav: calc\(56px \+ env\(safe-area-inset-bottom\)\)/.test(css),
  "both padding would float the action bar on 34px of nothing"
);

check(
  "the action bar sits ABOVE the bottom nav, not behind it",
  /bottom: "var\(--bottom-nav\)"/.test(sticky) &&
    /* the CODE, not the prose describing it — this assertion tripped on its
       own file's header comment the first time it was written */
    !/className="sticky bottom-0/.test(sticky)
);

check(
  "the walkabout's preamble is kept off the phone's first screen",
  /hidden max-w-\[78ch\] text-\[12\.5px\] sm:block/.test(field),
  "preamble, toggle, search and a category note filled all 664px and the first check-point sat below the fold"
);

/* THE CAVEAT IS THE EXCEPTION, and it took a defect to see why.
   It used to carry `hidden ... sm:block` alongside the preamble, on the same
   reasoning — prose, costs a scroll, hide it on a phone. But it is not prose:
   it is the sentence saying the location axis is not really locations, and the
   register's `area` column it falls back on holds 133 values of which a third
   are not places ("Appointments", "Documentation", "Lessons learnt"). Hiding it
   below sm meant the auditor most likely to read "Appointments" as somewhere
   to walk to was the only one never told it is not. So the phone gets a short
   version and the tablet the full one; neither gets nothing. */
check(
  "the zone caveat renders at 375px, shortened rather than hidden",
  /register&rsquo;s categories, not physical zones\./.test(field) &&
    /<span className="sm:hidden">/.test(field) &&
    !/mt-\[7px\] hidden text-\[10\.5px\] leading-\[1\.5\] sm:block/.test(field),
  "a caveat nobody on a phone can read is a caveat that is not there"
);

/* And the row of filter chips that used to sit under it is gone entirely — the
   list is a tree grouped by discipline now, so a discipline filter chip was a
   second control doing the tree's job, at about 50px of a 664px screen. */
/* A SCREEN IS CALLED WHAT ITS TAB CALLS IT.
   The navigation says "Inspection"; this heading said "Site walkabout", so an
   auditor told to go to Inspection arrived somewhere apparently else. Same
   defect the home screen's flow-strip test caught on the HIRA rename, on a
   screen nothing was checking. */
/* A STICKY HEADER INSIDE AN `overflow-hidden` BOX NEVER STICKS.
   `overflow: hidden` makes an element its own scroll container, so a
   position:sticky child sticks within THAT box — and the tree wrapper is
   taller than the viewport and cannot itself scroll, so the group header
   scrolled away in silence. It looked identical to a header that had not
   reached its stopping point yet, which is why this is asserted rather than
   eyeballed: the screenshot that caught it only caught it because the header
   was expected and absent. */
check(
  "the inspection tree does not clip its own sticky group headers",
  /className="rounded-\[13px\] border"/.test(field) &&
    !/overflow-hidden rounded-\[13px\]/.test(field),
  "the square corner where the first group row meets the border is the price of a header that works"
);
check(
  "the group header stops below the sticky filter bar, not under it",
  /stickyTop=\{barH\}/.test(field) && /new ResizeObserver\(measure\)/.test(field),
  "measured rather than a constant: the bar's height changes with the width and with the axis"
);

check(
  "the Inspection screen names itself as the navigation names it",
  /* 2026-09-10: 16px on a phone, 18px from sm. The subtitle wrapped the
     heading onto a second line at 375px, which is 22px of a 664px screen spent
     restating the tab name — so it is desk-only and the title shrank with it.
     The assertion is unchanged in substance: the screen is called what the
     navigation calls it. */
  /<h2 className="text-\[16px\] font-bold sm:text-\[18px\]">\s*\n\s*Inspection/.test(field),
  "the audit method's word for the session is kept as the subtitle, not as the title"
);

check(
  "the filter chip row is not back",
  !/All \$\{groupBy === "area"/.test(field),
  "the tree is the filter; two controls for one job is how they drift apart"
);

check(
  "NAVIGATION IS UNDER THE THUMB ON A PHONE",
  /\.app-nav \{[\s\S]{0,200}position: fixed;[\s\S]{0,200}bottom: 0;/.test(css) &&
    /@media \(max-width: 639\.98px\)/.test(css),
  "seven destinations pinned to the top of a 664px screen, on a walkabout done one-handed"
);

check(
  "and it is the SAME nav element, not a second copy of the links",
  (shell.match(/<nav/g) || []).length === 1,
  "two navs is two sets of counts to keep in step and two things to get wrong"
);

check(
  "the scrolling content and the toasts both clear it",
  /\.app-scroll \{\s*padding-bottom: var\(--bottom-nav\);/.test(css) &&
    /\.toast-bottom \{\s*bottom: calc\(22px \+ var\(--bottom-nav\)\);/.test(css),
  "a row you can see and cannot press"
);

check(
  "the active destination keeps its label, the others give up theirs",
  /className=\{active \? "" : "hidden sm:inline"\}>\{n\.label\}/.test(shell),
  "seven full labels needed 485px of a 390px bar; three fitted and the rest were a swipe nobody would make"
);

check(
  "pull-to-refresh cannot reload the app mid-walkabout",
  /overscroll-behavior-y: contain;/.test(css),
  "over-scrolling upward is not a rare accident on a list you scroll for 168,000 pixels"
);

check(
  "and the 300ms double-tap delay is gone from everything tappable",
  /touch-action: manipulation;/.test(css) && /-webkit-tap-highlight-color: transparent;/.test(css),
  "a third of a second of nothing after every answer is what makes an app feel broken"
);

check(
  "the walkabout's search box is a real target",
  /* 2026-09-10: `min-w-0` was added when the discipline filter came to share
     this row — without it the flex child refuses to shrink and the search box
     pushes the filter off the edge on a 375px screen. The 40px is the part
     under test and it is untouched. */
  /min-h-\[40px\] w-full min-w-0 border-none bg-transparent text-\[13px\]/.test(field),
  "24px, and it is how an auditor finds the check for the thing in front of them"
);

/* 2026-09-10: Findings no longer HAS an empty screen. It used to early-return
   "no findings yet" when nobody had raised one; it is an asset-system
   assessment now, and every site has asset systems whether or not anything was
   found against them — a system with nothing against it is precisely what has
   to be rateable. The one remaining early return is the hazard register's, and
   the property under test is unchanged for it. */
check(
  "the EMPTY state clears the bottom bar too",
  /app-scroll flex flex-1 items-center justify-center p-8/.test(
    src("app", "(app)", "hazards", "page.tsx")
  ),
  "it is an early return, so it misses the scroller's padding — and its one button is the whole screen"
);

check(
  "and Findings has no empty screen to clear, because it cannot be empty",
  !/app-scroll flex flex-1 items-center justify-center p-8/.test(
    src("app", "(app)", "findings", "page.tsx")
  ),
  "every site has asset systems; one with nothing found against it is the one that most needs rating"
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nTABLET OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
