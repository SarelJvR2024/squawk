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
];
for (const [label, fn] of CARRIERS) {
  check(`the upload queue scans ${label}`, sync.includes(fn));
}
check(
  "Verification.attachments is left out deliberately, not forgotten",
  /nothing in the app ever writes/.test(sync)
);
check(
  "the render-time count and the actual upload loop share one collector — can't drift apart again",
  (sync.match(/collectOutstanding\(/g) ?? []).length >= 3
);

process.exit(failures ? 1 : 0);
