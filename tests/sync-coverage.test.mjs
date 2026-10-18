import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* WHAT TRAVELS BETWEEN DEVICES, AND WHAT DOES NOT — 14 October 2026.
 *
 *  Found live: two devices on the same team passphrase showed different
 *  bands for the same asset system. src/lib/shared.ts pushed and pulled
 *  every captured record kind except SystemAssessment (the Asset Assurance
 *  screen) — it simply had no row kind of its own, so a rating only ever
 *  crossed devices through the manual "Share my captures"/"Merge a file"
 *  flow, never through the shared record both devices were already joined
 *  to. Checking what else only reached one device turned up a second, older
 *  gap: src/lib/sync.ts's photo-upload queue only ever scanned a
 *  check-point's own attachments and the walk's — SafetyFinding (ISF),
 *  SiteDay (and its own diary entries), EvidenceItem and IncidentReport each
 *  carry their own photographs that were never queued for upload at all,
 *  so the photograph stayed on whichever tablet took it even though the
 *  record and its 240px thumbnail reached every device.
 *
 *  SAME DAY, SECOND LAYER — the fix above was not enough on its own. Sarel's
 *  rating still would not reach his other browser even after it shipped,
 *  because the push watermark (pushedKey) only ever advances to the newest
 *  `updated_at` among rows actually IN a push batch. His rating predated
 *  "system" existing as a push-able kind at all; by the time the fix
 *  shipped, other, later-timestamped rows had already pushed the watermark
 *  past his rating's own timestamp, and rowsToPush's `at > since` gate
 *  excludes it forever from that point on — the fix above was correct but
 *  could never reach data that was already stuck behind an advanced
 *  watermark. The second fix is a one-time, versioned watermark rewind so
 *  every device resends its full backlog exactly once; safe, because
 *  squawk_push only ever accepts a row newer than what the server already
 *  has, so resending unchanged rows is a no-op.
 *
 *  This suite pins both fixes against regressing, plus a live round trip of
 *  the shared-record fix through the real merge code — not a looser
 *  source-text stand-in for it. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = (...p) => fs.readFileSync(path.join(root, "src", ...p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
};

/* ---- 1 · the shared record pushes and pulls SystemAssessment ----------- */

const shared = src("lib", "shared.ts");

check(
  `"system" is a row kind the shared record knows about`,
  /\|\s*"system";/.test(shared)
);
check(
  "every system assessment this device holds is pushed, keyed by its own key",
  /for \(const \[key, sys\] of Object\.entries\(d\.systems \?\? \{\}\)\) add\("system", key, when\(sys\), sys\);/.test(shared)
);
check(
  "a pulled system row is reconstructed into the bundle's visit.systems",
  /else if \(r\.kind === "system"\) systems\[r\.id\] = r\.payload as SystemAssessment;/.test(shared)
);
check(
  "the bundle this builds actually carries systems through to the merge",
  /visit: \{ responses, verifications, captures, feedback, adhoc, systems \}/.test(shared)
);

/* ---- 2 · a system assessment pushed on one device merges correctly on
   another — the real mergeBundle, not a source-text stand-in for it ------ */

import { useStore } from "@/lib/store";
import { rowsToPush, bundleFromRows } from "@/lib/shared";
import { mergeBundle } from "@/lib/merge";

useStore.setState({ entity: "FAOR", visit: "2026-09" });
useStore.getState().patchSystem("Building & Facilities", "Accessibility & Signage", {
  severity: "D - Minor",
  likelihood: "2 - Improbable",
  ratingConfirmed: true,
  assessedBy: "Sarel",
  assessedAt: Date.now(),
});

const pushed = rowsToPush(0).filter((r) => r.kind === "system");
check("exactly the one rated system is pushed", pushed.length === 1, String(pushed.length));

const bundle = bundleFromRows("FAOR", "2026-09", rowsToPush(0));
const emptyDevice = {
  entity: "FAOR",
  visit: "2026-09",
  visitData: { responses: {}, verifications: {}, captures: [], feedback: {}, adhoc: [], systems: {} },
  findings: [], hazards: [], safetyFindings: [], interviewDays: [], siteDays: [],
  evidenceItems: [], ppeChecks: [], siteAccessLogs: [], toolboxTalks: [],
  incidentReports: [], attendanceRegisters: [],
};
const merged = mergeBundle(emptyDevice, bundle);
const got = merged.visitData.systems["Building & Facilities|Accessibility & Signage"];

check(
  "a second, empty device receives the exact rating the first one gave",
  got?.severity === "D - Minor" && got?.likelihood === "2 - Improbable" && got?.ratingConfirmed === true,
  JSON.stringify(got)
);

/* ---- 2b · the SAME round trip through the real store action, not just the
   pure merge function — found 14 October 2026, a THIRD report of "still not
   syncing" after both the missing row-kind and the stuck-watermark fixes
   had shipped: everything above proved mergeBundle() itself is correct, but
   nothing had exercised useStore's own importBundle action, which is what
   src/lib/shared.ts's sync() actually calls. It turned out to be correct
   too — this pins that down so the next regression (if there is one) shows
   up here instead of needing a live, two-browser repro to find again. */
useStore.setState((s) => ({
  entity: "FAOR",
  visit: "2026-09",
  byVisit: { ...s.byVisit, "FAOR/2026-09": undefined },
}));
const importReport = useStore.getState().importBundle(bundle);
const gotViaStore = useStore.getState().visitData().systems["Building & Facilities|Accessibility & Signage"];
check(
  "the real importBundle store action — what sync() actually calls — applies the same rating",
  typeof importReport !== "string" &&
    gotViaStore?.severity === "D - Minor" &&
    gotViaStore?.likelihood === "2 - Improbable" &&
    gotViaStore?.ratingConfirmed === true,
  typeof importReport === "string" ? importReport : JSON.stringify(gotViaStore)
);

/* ---- 2c · a stale, already-advanced local watermark does not block a
   fresh resync-version check from re-sending an old rating ---------------- */
check(
  "an unseen RESYNC_VERSION is checked against a per-entity-and-visit key, not a single global flag",
  /const pushResyncKey = \(entity: string, visit: string\)/.test(shared),
  "a global flag would only self-heal whichever audit happened to sync first, never the rest"
);

/* ---- 2d · a backgrounded browser catches up the moment it is looked at,
   not only every 30 seconds — the actual mechanism behind the third report:
   two browsers side by side, one of them not in the foreground, whose
   setInterval the browser itself was throttling. ------------------------- */
check(
  "coming back to a tab triggers a sync immediately, not only the interval",
  /document\.addEventListener\("visibilitychange", onVisible\)/.test(shared) &&
    /document\.visibilityState === "visible"/.test(shared),
  "a background tab's 30-second interval is throttled by the browser; switching to the tab is exactly when its work should be checked"
);

/* ---- 3 · every record carrying its own photographs is in the upload
   queue, not just check-points and the walk ------------------------------ */

const sync = src("lib", "sync.ts");
const CARRIERS = [
  ["check-point attachments", "updateAttachment"],
  ["the walk's own attachments", "updateAdhocAttachment"],
  ["ISF (SafetyFinding) attachments", "updateIsfAttachment"],
  ["a site day's own attachments", "updateDayAttachment"],
  ["a site day's diary-entry attachments", "updateDiaryEntryAttachment"],
  ["evidence-log attachments", "updateEvidenceAttachment"],
  ["incident-report attachments", "updateIncidentAttachment"],
  ["a Verification's own attachments", "updateVerificationAttachment"],
];
for (const [label, fn] of CARRIERS) {
  check(`the upload queue scans ${label}`, sync.includes(fn));
}
/* 18 October 2026: the Follow-up screen now writes Verification.attachments
   (Sarel: "upload 'verification' photo's or information for closure"), so
   this is the eighth carrier in the loop rather than the one deliberately
   left out — pinned here so the next person reads the history rather than
   assuming it is still unwired. */
check(
  "the comment says WHEN Verification joined the loop, not that it never would",
  /The Follow-up screen[\s\S]{0,12}now does/.test(sync),
  "the eighth-carrier history has to be readable from the comment, not just from git blame"
);
check(
  "verifications are scanned by pf, same shape as the walk's own items by id",
  /for \(const \[pf, v\] of Object\.entries\(d\?\.verifications \?\? \{\}\)\)/.test(sync)
);
check(
  "the render-time count and the actual upload loop share one collector — can't drift apart again",
  (sync.match(/collectOutstanding\(/g) ?? []).length >= 3
);

/* ---- 4 · a stuck push watermark self-heals once, per device ------------ */

check(
  "the resync flag is its own key, separate from the watermark it rewinds",
  /const pushResyncKey = \(entity: string, visit: string\) => `squawk-push-resync:\$\{entity\}\/\$\{visit\}`;/.test(shared)
);
check(
  "a resync version exists to re-trigger this again in future, without a new key name",
  /const RESYNC_VERSION = "[^"]+";/.test(shared)
);
check(
  "an unseen RESYNC_VERSION rewinds the watermark to zero before rowsToPush runs, not after",
  /if \(local\.get\(pushResyncKey\(entity, visit\)\) !== RESYNC_VERSION\) \{\s*\n\s*local\.del\(pushedKey\(entity, visit\)\);\s*\n\s*local\.set\(pushResyncKey\(entity, visit\), RESYNC_VERSION\);\s*\n\s*\}\s*\n\s*const since = Number\(local\.get\(pushedKey\(entity, visit\)\) \?\? 0\);\s*\n\s*const records = rowsToPush\(since\);/.test(shared),
  "rewinding after `since` is read would do nothing — this sync would still use the stale watermark"
);
check(
  "the rewind runs at most once per device: the flag is set in the same breath it rewinds",
  /local\.del\(pushedKey\(entity, visit\)\);\s*\n\s*local\.set\(pushResyncKey\(entity, visit\), RESYNC_VERSION\);/.test(shared),
  "setting the flag anywhere else risks a device that rewinds on every sync, re-sending its whole backlog forever"
);

process.exit(failures ? 1 : 0);
