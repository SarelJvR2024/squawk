import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PHOTO_TARGET, photoTarget, withPhotoTarget } from "../src/lib/phototargets.ts";

/* BUILD PROMPT 7, 22 NOV 2026 — "Walk screen, replaces Inspection."
 *
 *  field/page.tsx's own logic ported to walk/page.tsx wholesale (checked by
 *  the suites that already read that file's source — adhoc/voice/scope/
 *  addsheet/completion/tablet/location/portals/etc, all repointed at
 *  walk/page.tsx this round, plus field-search-prominence and
 *  field-wide-detail). This suite covers exactly the four pieces this
 *  prompt actually added on top of that port:
 *
 *   1. The photo counter against a target (the pure functions, directly,
 *      then the screen's own use of them — shape tests, same pattern
 *      tests/evidencedisplay.test.mjs already uses for displayStatus).
 *   2. The per-system 3-state badge (Not started/Photos taken/Walked).
 *   3. The tray's two new actions — attach to asset system, turn into
 *      issue — alongside the pre-existing assign-to-check and discard.
 *   4. /field becoming a redirect to /walk, not a 404. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(...parts) {
  return fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
}

let failed = 0;
function check(name, condOrFn, why) {
  try {
    const cond = typeof condOrFn === "function" ? (condOrFn(), true) : condOrFn;
    if (cond === false) throw new Error(why ?? "failed");
    console.log("PASS ", name);
  } catch (e) {
    failed++;
    console.log("FAIL ", name, e.message);
  }
}

/* ---------- 1a. the pure functions, directly ---------- */

check("a discipline with no entry reads as DEFAULT_PHOTO_TARGET (20), never zero", () => {
  if (photoTarget(undefined, "Electrical") !== DEFAULT_PHOTO_TARGET) throw new Error("undefined config");
  if (photoTarget({}, "Electrical") !== DEFAULT_PHOTO_TARGET) throw new Error("empty config");
  if (photoTarget({ Civil: 40 }, "Electrical") !== DEFAULT_PHOTO_TARGET) throw new Error("another discipline's override leaked");
});
check("a real override is read back exactly", () => {
  if (photoTarget({ Electrical: 35 }, "Electrical") !== 35) throw new Error("override not read");
});
check("withPhotoTarget sets a positive target, rounded", () => {
  const next = withPhotoTarget({}, "Electrical", 12.6);
  if (next.Electrical !== 13) throw new Error(JSON.stringify(next));
});
check("withPhotoTarget clears back to the default on 0, a negative number, or NaN — not a target of zero", () => {
  const seeded = { Electrical: 35 };
  for (const bad of [0, -5, NaN]) {
    const next = withPhotoTarget(seeded, "Electrical", bad);
    if ("Electrical" in next) throw new Error(`target ${bad} left an entry: ${JSON.stringify(next)}`);
  }
}, "a target of 0 read literally would make the Walk screen's counter permanently 'at target'");
check(
  "a target that rounds DOWN to zero clears, not stores a literal 0 — code review on this branch",
  () => {
    const next = withPhotoTarget({}, "Electrical", 0.4);
    if ("Electrical" in next) throw new Error(JSON.stringify(next));
  },
  "0.4 is a real number > 0, so checking that before rounding let it through and then rounded it down to the exact 0 this type's header promises never happens",
);
check("withPhotoTarget never mutates the config it was given", () => {
  const seeded = Object.freeze({ Civil: 10 });
  withPhotoTarget(seeded, "Electrical", 20);
});
check("withPhotoTarget on an empty discipline name is a no-op", () => {
  const next = withPhotoTarget({ Civil: 10 }, "", 99);
  if (Object.keys(next).length !== 1) throw new Error(JSON.stringify(next));
});

/* ---------- 1b. wired into the store, Setup, and the Walk screen ---------- */

const types = src("src", "lib", "types.ts");
check("PhotoTargetsConfig exists, additive, same shape as HowToAskConfig", () =>
  /export type PhotoTargetsConfig = Record<string, number>;/.test(types));

const store = src("src", "lib", "store.ts");
check("photoTargets lives on State next to checkChannels/howToAsk", () =>
  /photoTargets: PhotoTargetsConfig;/.test(store));
check("it defaults to {} and persists, same convention as howToAsk", () => {
  if (!/photoTargets: \{\},/.test(store)) throw new Error("no {} default in initial state");
  if (!/checkChannels: s\.checkChannels,\s*\n\s*howToAsk: s\.howToAsk,\s*\n\s*photoTargets: s\.photoTargets,/.test(store))
    throw new Error("not in the persist partialize allowlist");
});
check("setPhotoTarget writes through withPhotoTarget, not a hand-rolled patch", () =>
  /setPhotoTarget: \(discipline, target\) => \{\s*\n\s*set\(\(s\) => \(\{ photoTargets: withPhotoTarget\(s\.photoTargets, discipline, target\) \}\)\);/.test(
    store,
  ));

const setup = src("src", "app", "(app)", "setup", "page.tsx");
check("Setup has its own 'Photo targets' section, reading and writing the real store action", () => {
  if (!/Photo targets/.test(setup)) throw new Error("no section heading");
  if (!/value=\{photoTargets\[d\] \?\? ""\}/.test(setup)) throw new Error("not reading photoTargets");
  if (!/onChange=\{\(e\) => setPhotoTarget\(d, Number\(e\.target\.value\)\)\}/.test(setup))
    throw new Error("not writing through setPhotoTarget");
});
check("it lists every discipline this site has, not a hand-picked few", () =>
  /ALL_DISCIPLINES\.map\(\(d, i\) =>/.test(setup));

const walk = src("src", "app", "(app)", "walk", "page.tsx");
check("the Walk screen counts photographs over exactly what it renders — visible checks and walkVisible items, nothing else", () =>
  /const photoCount = useMemo\(\(\) => \{\s*\n\s*let n = 0;\s*\n\s*for \(const c of visible\)/.test(walk) &&
    /for \(const it of walkVisible\)/.test(walk));
check(
  "the target is null on the location axis — a photo target was never set for a PLACE, only a discipline",
  () => {
    const body = walk.slice(walk.indexOf("const photoTargetValue ="), walk.indexOf("const photoTargetValue =") + 400);
    if (!/groupBy === "discipline"/.test(body)) throw new Error("no axis gate");
    if (!/: null;/.test(body)) throw new Error("no null branch");
  },
);
check("filtered to one discipline, the target is that discipline's own; showing every discipline, it is their sum", () => {
  const body = walk.slice(walk.indexOf("const photoTargetValue ="), walk.indexOf("const photoTargetValue =") + 400);
  if (!/activeFilter\s*\n\s*\? photoTarget\(photoTargets, activeFilter\)/.test(body))
    throw new Error("no single-discipline branch");
  if (!/: disciplines\.reduce\(\(n, d\) => n \+ photoTarget\(photoTargets, d\), 0\)/.test(body))
    throw new Error("no sum-across-disciplines branch");
});
check("the counter is actually rendered, turning the accent colour once the target is met — built but not shown is the exact bug this app's own code reviews keep catching", () => {
  if (!/\{photoTargetValue != null && \(/.test(walk)) throw new Error("not gated on photoTargetValue");
  if (!/\{photoCount\} of \{photoTargetValue\} photo\{photoTargetValue === 1 \? "" : "s"\}/.test(walk))
    throw new Error("the figure itself is not rendered");
  if (!/photoCount >= photoTargetValue \? "var\(--acc\)" : "var\(--ink-3\)"/.test(walk))
    throw new Error("no at-target colour change");
});

/* ---------- 2. the per-system 3-state badge ---------- */

check("walked is its own question, separate from the pre-existing `answered` (compliance + note) metric — fieldDoneAt or walkNA, nothing else", () =>
  /const walkedOf = \(cs: Check\[\]\) =>\s*\n\s*cs\.filter\(\(c\) => fieldDone\(responses\[c\.id\]\) \|\| !!responses\[c\.id\]\?\.walkNA\)\.length;/.test(
    walk,
  ));
check("a system is 'walked' only once every one of its checks is — not merely some of them, and not an empty system", () =>
  /b\.checks\.length > 0 && walked === b\.checks\.length/.test(walk));
check("short of fully walked, photographs still earn 'photosTaken' rather than reading as untouched", () =>
  /\? "walked"\s*\n\s*: photos > 0\s*\n\s*\? "photosTaken"\s*\n\s*: "notStarted"/.test(walk));
check("all three states actually render, as their own Pill, not just computed and dropped", () => {
  if (!/g\.state === "walked" \? \(/.test(walk)) throw new Error("walked not rendered");
  if (!/g\.state === "photosTaken" \? \(/.test(walk)) throw new Error("photosTaken not rendered");
  if (!/Not started/.test(walk)) throw new Error("notStarted label missing");
});

/* ---------- 3. the tray's two new actions ---------- */

check("updateCapture exists on the store, and strips id/blobKey/createdAt like every other capture-safe patcher", () =>
  /updateCapture: \(captureId: string, patch: Partial<Omit<Capture, "id" \| "blobKey" \| "createdAt">>\) => void;/.test(
    store,
  ));
check("attach-to-asset-system sets Capture.area to a real system name — AddSheet's own build-prompt-5 precedent, not new schema", () =>
  /updateCapture\(cap\.id, \{ area: e\.target\.value \}\);/.test(walk) &&
    /tree\s*\n\s*\.filter\(\(g\) => g\.sys !== NO_SYSTEM\)/.test(walk));
check("promoteCaptureToIssue exists on the store and requires a description — AdHocItem's own one unwaivable field", () =>
  /promoteCaptureToIssue: \(\s*\n\s*captureId: string,\s*\n\s*patch: \{ description: string; discipline\?: string \| null; system\?: string \| null \},\s*\n\s*\) => string;/.test(
    store,
  ));
check("it builds a real AdHocItem (origin \"field\", outcome null, findingId null) and moves the capture's attachment across, not a copy", () => {
  const body = store.slice(store.indexOf("promoteCaptureToIssue: (captureId, patch) => {"), store.indexOf("promoteCaptureToIssue: (captureId, patch) => {") + 1000);
  if (!/origin: "field",/.test(body)) throw new Error("wrong origin");
  if (!/description: patch\.description,/.test(body)) throw new Error("description not carried");
  if (!/get\(\)\.addAdhocAttachment\(id, capturePayload\(cap\)\);/.test(body)) throw new Error("attachment not moved");
  if (!/get\(\)\.dropCapture\(captureId\);/.test(body)) throw new Error("capture left in the tray");
});
check("assignCapture and promoteCaptureToIssue share one copy of the capture-to-attachment field list, not two that could drift", () => {
  const n = (store.match(/get\(\)\.add(?:Attachment|AdhocAttachment)\(.*capturePayload\(cap\)\);/g) ?? []).length;
  if (n !== 2) throw new Error(`capturePayload used ${n} times, expected 2`);
});
check("the tray offers the description prompt inline, not a separate sheet — the one field assignCapture's own dropdown does not need", () =>
  /promotingCaptureId === cap\.id &&/.test(walk) && /What you found/.test(walk));
check(
  "turning a capture into an issue never writes the 'no discipline/system recorded' placeholder text as if it were a real value — code review on this branch",
  () => {
    const body = walk.slice(walk.indexOf("const id = promoteCaptureToIssue(cap.id, {"), walk.indexOf("const id = promoteCaptureToIssue(cap.id, {") + 500);
    if (!/activeFilter !== NO_DISCIPLINE/.test(body)) throw new Error("discipline sentinel not guarded");
    if (!/cap\.area !== NO_SYSTEM/.test(body)) throw new Error("system sentinel not guarded");
  },
  "filtered to the 'No discipline recorded' bucket, activeFilter literally equals that placeholder string — without the guard it would be stored on the new AdHocItem as if it were a real discipline name",
);

/* ---------- 4. /field redirects, it does not 404 ---------- */

const field = src("src", "app", "(app)", "field", "page.tsx");
check("/field is a server-side redirect to /walk, the same next/navigation pattern src/app/page.tsx already uses", () =>
  /import \{ redirect \} from "next\/navigation";/.test(field) && /redirect\("\/walk"\);/.test(field));
check("it carries no \"use client\" directive and no store hooks — a plain redirect needs neither", () =>
  !/"use client"/.test(field) && !/useStore/.test(field));
check("AppShell's NAV and FlowStepper's FLOW_STEPS still point at /field, untouched — the nav rename is build prompt 10's job", () => {
  const shell = src("src", "components", "AppShell.tsx");
  const flow = src("src", "components", "ui", "FlowStepper.tsx");
  if (!/\{ href: "\/field", label: "Inspection", icon: IconPin \}/.test(shell)) throw new Error("AppShell NAV changed");
  if (!/\{ href: "\/field", label: "Inspection" \}/.test(flow)) throw new Error("FlowStepper FLOW_STEPS changed");
});

if (failed) process.exit(1);
console.log(failed ? "FAILED" : "all passed");
