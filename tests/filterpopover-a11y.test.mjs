import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* TASK 3 OF THE OVERNIGHT REFINEMENT PASS — FilterPopover's own three asks:
 * focus has to actually move into the panel on open (not just `aria-expanded`
 * flipping with focus left behind on the trigger), Tab has to stay inside
 * the panel while it's open, and every way the panel closes — Escape, the
 * backdrop, the × button — has to hand focus back to the button that opened
 * it. A screenshot cannot show any of the three; this reads the source for
 * the specific wiring each one depends on. No browser/Playwright in this
 * sandbox — see the final report. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = fs.readFileSync(
  path.join(root, "src", "components", "ui", "FilterPopover.tsx"),
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
  "the trigger button and the panel each keep their own ref",
  /triggerRef = useRef<HTMLButtonElement>/.test(src) &&
    /panelRef = useRef<HTMLDivElement>/.test(src)
);

check(
  "opening the popover moves focus onto the panel",
  /if \(!open\) return;\s*panelRef\.current\?\.focus\(\);/.test(src),
  "aria-expanded flipping is not enough — a keyboard/screen-reader user needs focus to actually move"
);

check(
  "the panel is focusable itself (tabIndex -1) for that focus-on-open to land anywhere",
  /ref={panelRef}[\s\S]{0,200}tabIndex={-1}/.test(src)
);

check(
  "there is exactly one close path, and every trigger uses it",
  (src.match(/onClick={close}/g) ?? []).length === 2 && /close\(\);/.test(src),
  "Escape, the backdrop's onClick and the × button's onClick must all route through the same close(), not three different setOpen(false)s that drift"
);

check(
  "closing returns focus to the trigger button, not wherever it happened to land",
  /const close = \(\) => \{\s*setOpen\(false\);\s*triggerRef\.current\?\.focus\(\);/.test(src)
);

check(
  "Escape calls that same close()",
  /e\.key === "Escape"\) \{\s*close\(\);/.test(src)
);

check(
  "the backdrop and the × button both close via close(), not a bare setOpen(false)",
  /onClick={close}/.test(src) && !/onClick={\(\) => setOpen\(false\)}/.test(src)
);

/* THE TAB TRAP. Keeping focus inside the panel means: Tab off the last
 * focusable element wraps to the first, and Shift+Tab off the first wraps to
 * the last — both computed from the panel's OWN children each time, since
 * FilterPopover's content is arbitrary per screen. */
check(
  "Tab forward off the last focusable element wraps to the first",
  /current === last\) \{\s*e\.preventDefault\(\);\s*first\.focus\(\);/.test(src)
);
check(
  "Shift+Tab off the first focusable element wraps to the last",
  /e\.shiftKey && current === first\) \{\s*e\.preventDefault\(\);\s*last\.focus\(\);/.test(src)
);
check(
  "the focusable set is read fresh from the panel on every Tab press",
  /panelRef\.current\.querySelectorAll<HTMLElement>\(FOCUSABLE\)/.test(src),
  "a snapshot taken once at open time would go stale the moment a chip row re-renders"
);

console.log(`\n${failures === 0 ? "OK" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
