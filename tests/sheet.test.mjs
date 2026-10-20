import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE ACCESSIBLE-DIALOG MECHANISM, SHARED ONCE.
 *
 *  src/components/ui/Sheet.tsx and src/components/SharedSheet.tsx are two
 *  different markups for the same thing — a backdrop, a panel, a close
 *  button, Escape and backdrop-click already wired to the same `onClose`.
 *  Before this pass neither one tied its title to the dialog for a screen
 *  reader, set initial focus, trapped Tab, or returned focus to whatever
 *  opened it. Fixed once, in src/lib/dialogFocus.ts, and used by both —
 *  this suite is mostly a guard against the second copy drifting back in,
 *  or either sheet quietly losing the piece that calls into it.
 *
 *  Source-read, matching every other suite in this directory: the real Tab-
 *  wrap/Escape/focus-return behaviour is driven in a live browser (see
 *  tests/MANUAL.md and this session's own Playwright pass), not reproduced
 *  here with a DOM stand-in. What a static read CAN catch, and is worth
 *  catching, is drift: the hook's own logic regressing, or one of the two
 *  sheets losing the wire-up that calls it. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const hook = src("lib", "dialogFocus.ts");
const sheet = src("components", "ui", "Sheet.tsx");
const sharedSheet = src("components", "SharedSheet.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* --------------------------------------- 1 · one mechanism, not two copies */

check(
  "the hook exists and is exported for both sheets to share",
  /export function useDialogFocusTrap/.test(hook)
);
check(
  "Sheet.tsx calls the shared hook rather than rolling its own",
  /import \{ useDialogFocusTrap \} from "@\/lib\/dialogFocus";/.test(sheet) &&
    /useDialogFocusTrap[<(]/.test(sheet)
);
check(
  "SharedSheet.tsx calls the SAME shared hook, not a second implementation",
  /import \{ useDialogFocusTrap \} from "@\/lib\/dialogFocus";/.test(sharedSheet) &&
    /useDialogFocusTrap[<(]/.test(sharedSheet)
);
check(
  "SharedSheet has no hand-rolled keydown/focus-trap logic of its own",
  !/addEventListener\(\s*["']keydown["']/.test(sharedSheet),
  "the trap belongs to the shared hook — a second one here is exactly the drift this suite guards against"
);
check(
  "Sheet.tsx has no hand-rolled keydown/focus-trap logic of its own either",
  !/addEventListener\(\s*["']keydown["']/.test(sheet)
);

/* ------------------------------------------------- 2 · the dialog is named */

check(
  "Sheet's dialog is linked to its own title (aria-labelledby + a matching id)",
  /aria-labelledby=\{titleId\}/.test(sheet) && /id=\{titleId\}/.test(sheet)
);
check(
  "SharedSheet's dialog is linked to its own title the same way",
  /aria-labelledby=\{titleId\}/.test(sharedSheet) && /id=\{titleId\}/.test(sharedSheet)
);
check(
  "both still declare role=\"dialog\" aria-modal=\"true\" — unchanged, not replaced",
  /role="dialog"/.test(sheet) &&
    /aria-modal="true"/.test(sheet) &&
    /role="dialog"/.test(sharedSheet) &&
    /aria-modal="true"/.test(sharedSheet)
);

/* --------------------------------------- 3 · what the hook actually does */

check(
  "it remembers the trigger before stealing focus",
  /triggerRef\.current = document\.activeElement/.test(hook)
);
check(
  "it does not steal focus from a field a sheet already autoFocus-ed",
  /container\.contains\(document\.activeElement\)/.test(hook),
  "RaiseFindingSheet/RelinkPhotoSheet already put autoFocus on a specific field inside Sheet.tsx — the hook must not fight that"
);
check(
  "Tab from the last focusable wraps to the first, and Shift+Tab from the first wraps to the last",
  /e\.shiftKey && document\.activeElement === firstEl/.test(hook) &&
    /!e\.shiftKey && document\.activeElement === lastEl/.test(hook) &&
    /lastEl\.focus\(\)/.test(hook) &&
    /firstEl\.focus\(\)/.test(hook)
);
check(
  "Escape calls the current onClose, read through a ref so a stale inline closure is never called",
  /onCloseRef\.current\(\)/.test(hook) &&
    /onCloseRef\.current = onClose/.test(hook)
);
check(
  "closing returns focus to whatever opened it, if it is still in the document",
  /trigger\.focus\(\)/.test(hook) && /document\.contains\(trigger\)/.test(hook)
);
check(
  "the hook is called unconditionally, every render — never after Sheet's own early return",
  (() => {
    const hookCall = sheet.indexOf("useDialogFocusTrap");
    const earlyReturn = sheet.indexOf("if (!open) return null;");
    return hookCall !== -1 && earlyReturn !== -1 && hookCall < earlyReturn;
  })(),
  "a hook called only on some renders breaks React's own rule, not just this one"
);

/* ------------------------------------------ 4 · left alone, on purpose */

check(
  "Sheet's backdrop click-to-close is untouched",
  /className="fixed inset-0 z-\[90\][^"]*"\s*\n\s*style=\{\{ background: "rgba\(16,10,32,\.5\)", backdropFilter: "blur\(4px\)" \}\}\s*\n\s*onClick=\{onClose\}/.test(
    sheet
  )
);
check(
  "SharedSheet's backdrop click-to-close is untouched",
  /className="fixed inset-0 z-\[90\][^"]*"\s*\n\s*style=\{\{ background: "rgba\(16,10,32,\.5\)", backdropFilter: "blur\(4px\)" \}\}\s*\n\s*onClick=\{onClose\}/.test(
    sharedSheet
  )
);
check(
  "both still stop the click reaching the backdrop from inside the panel",
  /onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(sheet) &&
    /onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(sharedSheet)
);

console.log(failures === 0 ? "\nSHEET A11Y OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exitCode = failures ? 1 : 0;
