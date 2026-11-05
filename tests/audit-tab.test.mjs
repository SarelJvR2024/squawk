import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE AUDIT TAB — all 324 check-points, grouped by asset system, instead
 *  of the full Checks screen rebuilt once per certificate/appointment/
 *  permit/record.
 *
 *  Sarel: "Build this for me under a new tab. Called audit. Streamline
 *  the capturing." Two investigation passes (this session) found that
 *  merging similar-looking checks mostly loses real information — 207 of
 *  324 share a question SHAPE (certificates, appointments, permits,
 *  training, maintenance records) but are almost all genuinely distinct
 *  facts. Later, Sarel: "Keep all 324 checks in the audit tab as well" —
 *  so this screen does not scope down to a subset at all; the win is
 *  reuse and organisation (grouped by `Check.system`, a field that
 *  already existed), never merging two checks' answers into one.
 *
 *  THE HARD REQUIREMENT this suite is really pinning down: every answer
 *  given here has to be traceable back to the original 324 check-points,
 *  by construction — this screen must call the SAME store actions
 *  (setCompliance, commit, patch, addAttachment) against the SAME
 *  Response, keyed by the SAME checkId, that the Checks screen's own
 *  buttons call. Source-read, same pattern as fieldacsatab.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const audit = src("app", "(app)", "audit", "page.tsx");
const shell = src("components", "AppShell.tsx");
const sw = fs.readFileSync(path.join(here, "..", "public", "sw.js"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- scope: all 324, no subsetting field at all -------------------------- */

check(
  "the full register is in scope — no confirmedBy/vtype/inspect filter narrows it to a subset",
  /const allChecks = useMemo\(\(\) => checksAt\(entityCode\), \[entityCode\]\)/.test(audit)
);

check(
  "the screen's own header says plainly that all 324 stay in scope, per Sarel's own words",
  /Keep all 324 checks in the audit tab/.test(audit)
);

/* ---- traceability: the SAME store actions the Checks screen uses -------- */

check(
  "a verdict writes through setCompliance — the same action CheckDetail's own compliance buttons call",
  /setCompliance\(c\.id, next\)/.test(audit)
);

check(
  "a verdict also calls commit(checkId, \"desk\") — stamps deskDoneAt the same way Checks' own Save does",
  /commit\(c\.id, "desk"\)/.test(audit)
);

check(
  "the note writes through patch() onto Response.observation, not a new field",
  /patch\(c\.id, \{ observation: e\.target\.value \}\)/.test(audit)
);

check(
  "photos and voice notes write through addAttachment, same as every other capture screen",
  /addAttachment\(c\.id, \{ \.\.\.m, createdBy: auditor \}\)/.test(audit)
);

check(
  "nothing here invents a second record kind or a mapping table — no addAudit/AuditItem/new store slice",
  !/addAudit|AuditItem|auditChecks:|auditResponses/.test(audit)
);

/* ---- one item open at a time, same reasoning as the Raise/Inspection
   screens' own accordions ------------------------------------------------- */

check(
  "exactly one check is expanded at a time — collapsed rows are a tap target back to it, not a second copy",
  /const activeId = explicitlyClosed[\s\S]{0,40}: openId && scoped\.some/.test(audit)
);

check(
  "answering the open check advances to the next unanswered one automatically",
  /const nextPending = scoped\.find\(\s*\(x\) => x\.id !== c\.id && responses\[x\.id\]\?\.compliance == null/.test(
    audit
  )
);

check(
  "the open card shows the check's own requirement text, not just the asset system name",
  /\{c\.requirement\}/.test(audit)
);

check(
  "tapping the open card collapses it back — it does not reopen on the next render just because it is still first-pending",
  /aria-label="Collapse this check"/.test(audit) && /setExplicitlyClosed\(true\)/.test(audit)
);

/* ---- the higher-level heading and the per-row short note, Sarel: "add a
   higher level heading grouping similar questions. And a short note next
   to the asset type" ------------------------------------------------------ */

check(
  "checks are grouped under a heading by a key field (system or topic), not a per-row computed text",
  /const byKey = new Map<string, typeof scoped>\(\)/.test(audit) && /\[\.\.\.byKey\.entries\(\)\]/.test(audit)
);

check(
  "each collapsed row shows a short note (the check's own requirement text) instead of repeating the system name the heading already gives",
  /const shortNote = \(requirement: string/.test(audit) && /: shortNote\(c\.requirement\)\}/.test(audit)
);

check(
  "the group heading previews a real check's own question (the group's first member), not a synthesised shared one",
  /\{shortNote\(group\[0\]\.requirement, 72\)\}/.test(audit)
);

/* ---- the topic grouping for interviews, Sarel: "Find ways how to group
   the audit checks ie by documentation, by compliance certification, by
   maintenance tasks, Planned maintenance, inspections, measurements,
   training and personel. This will help with the interview questions" --- */

check(
  "a By system / By topic toggle exists and switching it resets which card is open",
  /\["system", "By system"\]/.test(audit) &&
    /\["topic", "By topic"\]/.test(audit) &&
    /const changeGroupMode = \(mode: "system" \| "topic"\) => \{/.test(audit)
);

check(
  "topic mode groups by a static, hand-curated lookup (auditTopics.json), not a regex/keyword classifier",
  /import auditTopicsData from "@\/data\/auditTopics\.json"/.test(audit) &&
    !/\.test\(c\.requirement|\.match\(c\.requirement|new RegExp/.test(audit)
);

check(
  "the screen's own header explains why a regex classifier was tried and rejected, not just asserted",
  /A REGEX CLASSIFIER WAS TRIED AND REJECTED/.test(audit) && /ILS/.test(audit)
);

check(
  "a check with no entry in auditTopics.json falls back to an honest \"Other\", never silently disappearing",
  /const topicFor = \(checkId: string\) => auditTopics\[checkId\] \?\? "Other"/.test(audit)
);

/* ---- the topic data file itself: every one of the 324 checks is mapped,
   to one of exactly the 9 allowed topics — the same kind of self-check
   sites.test.mjs and portals.test.mjs already run on their own data. ----- */

const checksJson = JSON.parse(src("data", "checks.json"));
const topics = JSON.parse(src("data", "auditTopics.json"));
const ALLOWED_TOPICS = new Set([
  "Documentation",
  "Compliance certification",
  "Maintenance tasks",
  "Planned maintenance",
  "Inspections",
  "Measurements",
  "Training",
  "Personnel",
  "Other",
]);

const missing = checksJson.filter((c) => !(c.id in topics)).map((c) => c.id);
check("every one of the 324 checks has a topic assigned", missing.length === 0, missing.slice(0, 5).join(", "));

const badValues = Object.entries(topics)
  .filter(([, v]) => !ALLOWED_TOPICS.has(v))
  .map(([k, v]) => `${k}: ${v}`);
check(
  "every assigned topic is one of the 9 allowed names, no typos or stray categories",
  badValues.length === 0,
  badValues.slice(0, 5).join(", ")
);

const extraIds = Object.keys(topics).filter((id) => !checksJson.some((c) => c.id === id));
check(
  "the topic file carries no ids that aren't real checks — a stale id from a prior register revision",
  extraIds.length === 0,
  extraIds.slice(0, 5).join(", ")
);

/* ---- save & sync, Sarel: "Add a save button on audit page so that info
   can be saved and synced" ------------------------------------------------- */

check(
  "a Save button calls the SAME shared.syncNow() the top-bar Refresh button and the Shared record sheet's own \"Sync now\" call — not a third copy",
  /import \{ useShared \} from "@\/lib\/shared"/.test(audit) && /onClick=\{\(\) => shared\.syncNow\(\)\}/.test(audit)
);

check(
  "the Save button is gated identically to the top-bar Refresh button — hidden with nothing to sync to (state \"off\") or on a locked device",
  /\{shared && shared\.state !== "off" && shared\.unlocked && \(/.test(audit)
);

check(
  "the Save button disables itself while a sync is already running, not a second one racing it",
  /disabled=\{shared\.state === "syncing"\}/.test(audit)
);

/* ---- wired into the shell and the offline shell, same as every other
   nav destination ---------------------------------------------------------- */

check(
  "the nav bar carries an Audit destination at /audit",
  /\{ href: "\/audit", label: "Audit", icon: IconInbox \}/.test(shell)
);

check(
  "/audit is precached for offline launch, same as every other nav destination",
  /"\/audit"/.test(sw)
);

console.log(failures === 0 ? "\nAUDIT TAB OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
