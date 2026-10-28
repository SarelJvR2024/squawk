import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THINGS SEEN ON THE WALK, AND THE ONE NUMBER THEY MUST NEVER TOUCH.
 *
 * An ad-hoc inspection item is the most valuable record in an audit and the
 * most dangerous one to file carelessly. It is valuable because nobody asked
 * for it: the register is 324 check-points ACSA wrote, and the defect standing
 * in front of an auditor that nobody put on the list is regularly the finding
 * worth having. It is dangerous because it looks exactly like one of the 324
 * unless something stops it — and the moment "312 of 324" can become "313 of
 * 324" by somebody recording an observation, every completion figure this
 * product publishes is a number nobody can reconcile.
 *
 * So the assertions here are mostly about SEPARATION. Its own type, its own id
 * series, its own list, its own export sheet, its own column in the summary —
 * and no path from any of that into the register's count. */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const types = read("src", "lib", "types.ts");
const store = read("src", "lib", "store.ts");
const merge = read("src", "lib", "merge.ts");
const shared = read("src", "lib", "shared.ts");
const exports_ = read("src", "lib", "exports.ts");
const outcome = read("src", "components", "OutcomeControl.tsx");
const sheet = read("src", "components", "AddItemSheet.tsx");
const field = read("src", "app", "(app)", "field", "page.tsx");
const panel = read("src", "components", "SyncPanel.tsx");
const bulkLinkSheet = read("src", "components", "BulkLinkWalkItemsSheet.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};
/* Comments discuss the trap; the CODE is what has to be right. Several
   assertions below would pass on a comment alone without this. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* ---- 1 · the record exists and is its own thing ------------------------- */

check("AdHocItem is declared", /export interface AdHocItem \{/.test(types));
for (const f of [
  "id: string;",
  "description: string;",
  "discipline: string | null;",
  "system: string | null;",
  "area: string;",
  "outcome: Compliance | null;",
  "attachments: Attachment[];",
  "findingId: string | null;",
]) {
  const block = types.slice(types.indexOf("export interface AdHocItem"));
  check(`AdHocItem carries ${f.split(":")[0]}`, block.includes(f));
}
check(
  "discipline and asset system are NULLABLE",
  /discipline: string \| null;[\s\S]{0,400}system: string \| null;/.test(
    types.slice(types.indexOf("export interface AdHocItem"))
  ),
  "an unattributed observation is a real state; a required field would be filled with a guess"
);
check(
  "the origin vocabulary is the Hazard's, not a parallel one",
  /origin: "field" \| "acsa" \| "tpjv";/.test(types.slice(types.indexOf("export interface AdHocItem"))),
  "two vocabularies for who raised something means neither can be reported on"
);

/* ---- 2 · the id series cannot be mistaken for a register id ------------- */

check("the id series is WALK-", /`WALK-\$\{uid\(\)/.test(store));
check(
  "and it is random, not sequential",
  !/WALK-\$\{[^}]*length \+ 1/.test(store),
  "two devices both minting WALK-03 would merge into one record and lose an observation"
);
check(
  "a walk photograph's reference is prefixed with the item's own id",
  /nextPhotoRef\(id, item\.attachments\)/.test(store),
  "so WALK-A3F2K_P01 can never be read as a check-point's photograph in the zip"
);

/* ---- 3 · scoped, and absent-means-empty ------------------------------- */

check("VisitData carries adhoc", /adhoc\?: AdHocItem\[\];/.test(store));
check(
  "it is OPTIONAL, so no persisted visit needs a migration",
  /adhoc\?:/.test(store) && !/from < \d+[\s\S]{0,300}\.adhoc\b[\s\S]{0,120}= \[\]/.test(store),
  "absent-means-empty is the one shape change that does not need a version bump. " +
    "This used to assert the version had not reached 14, which pinned an unrelated " +
    "global counter — the safety-findings slice moved it and this rule had not changed."
);
check(
  "resetVisit deletes walk photographs too",
  /\(data\.adhoc \?\? \[\]\)\.flatMap\(\(x\) => x\.attachments\.map\(\(a\) => a\.blobKey\)\)/.test(store),
  "an orphaned blob is invisible and counts against the storage budget forever"
);
check(
  "removing an item deletes its bytes",
  /removeAdhoc:[\s\S]{0,400}delBlobs\(keys\)/.test(store)
);

/* ---- 4 · it survives two auditors and the shared record ---------------- */

check(
  "the merge unions walk items by id",
  /* 2026-09-10: `systems` joined the visit literal when asset systems got a
     rating of their own. The assertion is unchanged in substance — the merged
     visit carries the walk items, by id — and follows the literal. */
  /adhocById/.test(merge) &&
    /visitData: \{ responses, verifications, captures, feedback, adhoc, systems: assessedSystems \}/.test(
      merge
    )
);
check(
  "newer wins on a conflict",
  /\(t\.updatedAt \?\? 0\) > \(m\.updatedAt \?\? 0\)/.test(merge)
);
check("the shared record pushes them", /add\("adhoc", a\.id, when\(a\), a\)/.test(shared));
check("and reads them back", /r\.kind === "adhoc"/.test(shared));

/* ---- 5 · THE COUNT. The whole reason this file exists. ----------------- */

const storeCode = codeOnly(store);
/* The two figures the product publishes as completion. Both are computed from
   `responses` — answers to register check-points — and an ad-hoc item creates
   no response, so it cannot reach either. Asserted on the code rather than
   trusted, because the day somebody "helpfully" adds walk items to the audit
   progress figure, nothing else in this suite would notice. */
const progress = storeCode.slice(
  storeCode.indexOf("export function useAuditProgress"),
  storeCode.indexOf("export function useChecks")
);
check(
  "useAuditProgress never reads adhoc",
  !/adhoc/.test(progress),
  "the completion figure counts answers to ACSA's list and nothing else"
);
const portfolio = storeCode.slice(
  storeCode.indexOf("export function usePortfolio"),
  storeCode.indexOf("export interface AuditProgress")
);
check("usePortfolio never reads adhoc", !/adhoc/.test(portfolio));
/* FIXED, 20 October 2026 — this used to read walkCandidates (the GLOBAL
   walk-item count) regardless of the screen's own discipline/location
   filter, so filtering to one discipline still showed every walk item
   across all of them. walkVisible is the filtered count the tree itself
   actually renders — see FieldPage's own comment on walkScoped/walkVisible. */
check(
  "the walk count is stated SEPARATELY on the inspection screen",
  /\+\{walkVisible\.length\} seen on the walk/.test(field),
  "two numbers, never one — a denominator that grows as you work is not a denominator"
);
check(
  "and it reflects the active filter, not the global walk-item count",
  !/\+\{walkCandidates\.length\} seen on the walk/.test(field),
  "a discipline filter that still showed every discipline's walk items was not a filter"
);
check(
  "and that count excludes a parked, not-yet-promoted Internal Working Area item",
  /const walkCandidates = useMemo\(\s*\n\s*\(\) => adhocItems\.filter\(\(it\) => !it\.internal \|\| it\.findingId\),/.test(
    field
  ),
  "an internal item is not visible externally, including in this screen's own 'seen on the walk' count, until it is promoted"
);
/* The literal "{doneCount}/{visible.length}" text moved on 21 Oct 2026 — the
   second visual-hierarchy pass, item 7 — out of the duplicate figure that
   used to sit beside the Filters button (dropped; the track below already
   said the same thing) and now exists only as the track's own width
   calculation. The denominator itself is unchanged. */
check(
  "and the progress bar's denominator is still the register's",
  /\(doneCount \/ visible\.length\) \* 100/.test(field)
);

/* ---- 6 · every export says which it is --------------------------------- */

check("there is a walk sheet", /export function walkSheet/.test(exports_));
check("it is in the full workbook", /walkSheet\(x\),/.test(exports_));
check(
  "its rows say where the item came from",
  /ORIGIN_TEXT\[a\.origin\]/.test(exports_)
);
check(
  "the Photographs sheet says which photographs came off the walk",
  /"Seen on the walk — NOT one of the register check-points"/.test(exports_) &&
    /\{ header: "Source", width: 46 \}/.test(exports_)
);
check(
  "the summary has its own column, outside the check-point columns",
  /\{ header: "Seen on the walk \(not in the 324\)", width: 28 \}/.test(exports_)
);
check(
  "the cover sheet explains that it is excluded from the completion figure",
  /DELIBERATELY excluded from Check-points in scope and from Complete/.test(exports_)
);
check(
  "the walk sheet is not folded into the register sheet",
  !/registerSheet[\s\S]{0,2000}x\.adhoc/.test(exports_),
  "a 325th row on a 324-row deliverable makes every count taken off it wrong"
);

/* ---- 7 · the capture sheet's one required field ------------------------ */

check(
  "only the description blocks a save",
  /if \(!text\) \{[\s\S]{0,200}setError/.test(sheet) &&
    !/if \(!draft\.discipline\)/.test(sheet),
  "ten seconds on a walk is the budget; a half-captured item beats a lost one"
);

/* "take the photograph, keep moving" — the sheet's own stated brief — only
   held true for an item reopened from the list. A brand-new item's first
   save used to close the sheet before the camera or microphone ever
   appeared, so the photograph that was supposedly one tap away in fact
   needed the auditor to find the row again and reopen it. Sarel asked for
   this twice: first that capture should survive Record it rather than
   close the sheet, then — pointing straight at the box above the
   description field, before anything is typed — that it should not have
   to wait for Record it at all. A capture taken before the item exists is
   held in pendingAttachments and folded in the moment it does. */
/* Window widened 13 October 2026 from 1000 to 1800 chars — save() grew a
   block between clearing pendingAttachments and setCreatedId(id) (see "an
   item created already marked NC raises automatically" below — 27 October
   2026's refactor changed that block's own content, reading back what the
   store raised, but not its rough size). The assertion's point is
   unchanged: Record it still ends on setCreatedId, never onClose(). */
check(
  "Record it no longer closes the sheet — it creates the item and stays open",
  /const save = \(\) => \{[\s\S]{0,400}const id = addAdhoc\(\{[\s\S]{0,1800}setCreatedId\(id\);/.test(
    sheet
  ) && !/const save = \(\) => \{[\s\S]{0,1800}\n\s*onClose\(\);/.test(sheet),
  "a new item's photo and voice-note controls must appear in the same sitting it was typed in"
);

check(
  "the just-created item is looked up reactively, so its own attachments appear as they land",
  /const \[createdId, setCreatedId\] = useState<string \| null>\(null\);/.test(sheet) &&
    /const createdItem = createdId \? adhocItems\.find\(\(a\) => a\.id === createdId\) \?\? null : null;/.test(
      sheet
    ) &&
    /const item = editing \?\? createdItem;/.test(sheet)
);

check(
  "every path that closes the sheet clears the just-created id, so reopening fresh is actually fresh",
  /const close = \(\) => \{\s*\n\s*setCreatedId\(null\);/.test(sheet) &&
    !/onClick=\{onClose\}/.test(sheet),
  "this component is not remounted between opens — a stale createdId would reopen on last walk's item, not a blank draft"
);

check(
  "a capture taken before Record it is held locally, not dropped and not blocked on",
  /const \[pendingAttachments, setPendingAttachments\] = useState<Attachment\[\]>\(\[\]\);/.test(sheet) &&
    /if \(item\) addAdhocAttachment\(item\.id, a\);\s*\n\s*else setPendingAttachments/.test(sheet),
  "the mic and camera must work in the same box the description is typed into, before the item exists"
);

check(
  "a capture nobody keeps is forgotten, bytes and all, when the sheet closes without becoming an item",
  /for \(const a of pendingAttachments\) void forgetMedia\(a\.blobKey\);/.test(sheet),
  "an abandoned photograph must not sit in storage forever with nothing pointing at it"
);

check(
  "pending captures join the item in the order they were taken, the moment Record it gives them an id",
  /for \(const \{ id: _pid, createdAt: _pc, \.\.\.rest \} of pendingAttachments\) \{[\s\S]{0,120}addAdhocAttachment\(id, rest\);/.test(
    sheet
  ),
  "a photograph's reference number is assigned off the item's own attachments, so order matters"
);

check(
  "a transcribed voice note can be written up before the item exists too, same AI gate as every other capture screen",
  /writeUp=\{\s*\n\s*aiOn\s*\n\s*\? \(t\) => assist\("transcript", adhocTranscriptContext\(t, item \?\? draft\)\)\s*\n\s*: undefined\s*\n\s*\}/.test(
    sheet
  )
);

check(
  "accepting the write-up appends to Description rather than silently overwriting what was typed",
  /onAccept=\{\(\) =>\s*\n\s*set\(\{\s*\n\s*description: value\.description\.trim\(\)\s*\n\s*\? `\$\{value\.description\}\\n\$\{text\}`\s*\n\s*: text,/.test(
    sheet
  ) ||
    /onAccept=\{\(text\) =>\s*\n\s*set\(\{\s*\n\s*description: value\.description\.trim\(\)\s*\n\s*\? `\$\{value\.description\}\\n\$\{text\}`\s*\n\s*: text,/.test(
      sheet
    ),
  "a voice note is evidence added to what was already captured, not a replacement for it"
);

check(
  "adhocTranscriptContext exists for items with no Check to give the model, same shape as transcriptContext",
  /export function adhocTranscriptContext\(\s*\n\s*transcript: string,\s*\n\s*item: \{ description: string; discipline: string \| null; system: string \| null; area: string \}\s*\n\s*\): string \{/.test(
    read("src", "lib", "assist.ts")
  )
);
check(
  'it never writes the literal string "Ad-hoc" as an asset system',
  !/system: "Ad-hoc"/.test(codeOnly(sheet)) && !/system: "Ad-hoc"/.test(codeOnly(field)),
  "that string used to appear as an asset system on every screen that groups by one"
);
/* MOVED TO THE STORE, 27 October 2026 — Sarel: "we moved away from using
   the field for add finding. if something is captured as non-compliant it
   should automatically be set as a finding." The 13 October refactor above
   had already centralized the SHAPE into one helper, but that helper still
   lived inside AddItemSheet.tsx — so the guarantee only held for items
   whose outcome changed through that one sheet. A second screen quietly
   had its own, third copy of the same shape (field/page.tsx's
   raiseInternalFinding, for Internal Working Area items), and anything
   that set outcome "NC" any other way — a different screen, an import
   script — skipped the auto-raise entirely, which is exactly the gap
   Sarel is describing here having reappeared.
   The fix moves the guarantee into store.ts itself: addAdhoc (an item
   created already NC) and updateAdhoc (one changed to it afterward) both
   raise through raiseFindingFromAdhoc, a store action, so ANY caller gets
   it — not just whichever UI component remembered to check. The two
   components below now read back what the store did rather than raising a
   second time. */
check(
  "raising a finding from an adhoc item is built in exactly one place: the store's raiseFindingFromAdhoc",
  /raiseFindingFromAdhoc: \(item\) =>\s*\n\s*get\(\)\.addFinding\(\{/.test(store) &&
    /title: "Seen on the walk",/.test(
      store.slice(store.indexOf("raiseFindingFromAdhoc: (item)"), store.indexOf("raiseFindingFromAdhoc: (item)") + 800)
    ),
  "a second copy of this shape is exactly what let field/page.tsx's version drift into a third"
);
check(
  "an item created already marked NC raises automatically, from the store, not the component that called addAdhoc",
  /if \(a\.outcome === "NC" && a\.findingId == null\) \{\s*\n\s*const findingId = get\(\)\.raiseFindingFromAdhoc\(item\);\s*\n\s*get\(\)\.updateAdhoc\(id, \{ findingId \}\);/.test(
    store
  ),
  "the one path an outcome-change check on an existing item cannot cover — there is no existing item yet"
);
check(
  "an existing item raises automatically the moment updateAdhoc sets its outcome to NC, regardless of which screen called it",
  /if \(p\.outcome === "NC" && p\.findingId === undefined\) \{[\s\S]{0,200}get\(\)\.raiseFindingFromAdhoc\(item\);/.test(
    store
  ),
  "this is the guarantee Sarel asked for: it fires for EVERY caller of updateAdhoc, not only AddItemSheet's own"
);
check(
  "capture stays easy in the field — raising never requires a checkId",
  /checkId: null,/.test(
    store.slice(store.indexOf("raiseFindingFromAdhoc: (item)"), store.indexOf("raiseFindingFromAdhoc: (item)") + 400)
  ),
  "linking to a register check is deliberately a later, office-side step — see components/FindingDetail.tsx"
);
check(
  "AddItemSheet no longer keeps its own copy of the raise-a-finding shape",
  !/const raiseFindingFrom = /.test(sheet) && !/const addFinding = useStore/.test(sheet),
  "a second copy of this shape next to the store's own is exactly the drift this change was asked to stop"
);
check(
  "AddItemSheet's manual button raises through the store's helper",
  /const raiseFinding = \(\) => \{\s*\n\s*if \(!item \|\| item\.findingId\) return;\s*\n\s*const id = useStore\.getState\(\)\.raiseFindingFromAdhoc\(item\);/.test(
    sheet
  )
);
check(
  "AddItemSheet's outcome control and save() read back what the store already did, rather than raising a second finding on top of it",
  /if \(o === "NC" && item\) \{\s*\n\s*const saved = useStore\.getState\(\)\.visitData\(\)\.adhoc\?\.find\(\(x\) => x\.id === item\.id\);/.test(
    sheet
  ) &&
    /const saved = useStore\.getState\(\)\.visitData\(\)\.adhoc\?\.find\(\(x\) => x\.id === id\);/.test(sheet),
  "calling raiseFindingFromAdhoc here too, on top of what addAdhoc/updateAdhoc already raised, would mint two findings for one observation"
);
check(
  "field/page.tsx's Internal Working Area items raise through the SAME store helper, not a third copy of the shape",
  /const raiseInternalFinding = \(item: AdHocItem\) => \{\s*\n\s*if \(item\.findingId\) return;\s*\n\s*const id = useStore\.getState\(\)\.raiseFindingFromAdhoc\(item\);/.test(
    field
  ) && !/const addFinding = useStore/.test(field),
  "this was the second, independent copy of the Finding shape that let it drift — see raiseFindingFromAdhoc's own comment in store.ts"
);

/* ---- 7A · THE CATCH-UP FOR AN ITEM STUCK BEFORE THE GUARANTEE EXISTED --
 *  The NC-auto-raises guarantee above only fires on a write (addAdhoc/
 *  updateAdhoc). An internal item that was already NC before it existed,
 *  and has not been touched since, never gets one — and per sharepoint.ts's
 *  externallyVisible(), an internal item with no finding never reaches the
 *  portal at all, so its photographs silently never reach a report either.
 *  backfillInternalNcFindings is the one-time fix: the same write, done
 *  once, for everything already stuck this way. */

check(
  "backfillInternalNcFindings exists on the store, scoped to internal+NC+un-findinged items",
  /backfillInternalNcFindings: \(excludedDisciplines\) => \{\s*\n\s*const excluded = new Set\(excludedDisciplines \?\? \[\]\);\s*\n\s*const stuck = \(get\(\)\.visitData\(\)\.adhoc \?\? \[\]\)\.filter\(\s*\n\s*\(a\) =>\s*\n\s*a\.internal &&\s*\n\s*a\.outcome === "NC" &&\s*\n\s*a\.findingId == null/.test(
    store
  ),
  "the exact condition externallyVisible excludes on — see that function's own comment in sharepoint.ts"
);

check(
  "and it holds back the SAME disciplines the warning it answers already excludes from its count",
  /backfillInternalNcFindings: \(excludedDisciplines\) => \{[\s\S]{0,400}!\(a\.discipline && excluded\.has\(a\.discipline\)\)/.test(
    store
  ),
  "raising a finding is a real register write — a discipline held back this run must not get one quietly just because its photos would not have synced either"
);

check(
  "it raises through the SAME helper every other path uses, not a fourth copy of the shape",
  /backfillInternalNcFindings: \(excludedDisciplines\) => \{[\s\S]{0,600}get\(\)\.raiseFindingFromAdhoc\(item\)/.test(store),
  "one shape, four callers now: addAdhoc, updateAdhoc, the manual buttons, and this catch-up"
);

check(
  "it writes findingId back onto each item it raises for, not just the finding itself",
  /backfillInternalNcFindings: \(excludedDisciplines\) => \{[\s\S]{0,700}get\(\)\.updateAdhoc\(item\.id, \{ findingId \}\)/.test(
    store
  ),
  "raising the finding alone does not make the item externallyVisible — the item's own findingId is what the sync gate reads"
);

check(
  "it returns how many it fixed, for the Sync panel to say so",
  /return stuck\.length;/.test(store)
);

check(
  "declared on the State interface too, not just the implementation",
  /backfillInternalNcFindings: \(excludedDisciplines\?: string\[\]\) => number;/.test(store)
);

check(
  "and the Sync panel's own button passes its own excludedDisciplines through, not an empty default",
  /useStore\.getState\(\)\.backfillInternalNcFindings\(\[\.\.\.excludedDisciplines\]\);/.test(panel),
  "calling it with no argument would raise findings for every held-back discipline too — the bug this pairing exists to prevent"
);

/* ---- 7B · TYING A WALK ITEM TO A CHECK-POINT, IN BULK ------------------
 *  sharepoint.ts's own evidenceValues() writes a walk item's internal WALK-
 *  id into the portal's CheckID column until item.checkId is set — only
 *  then does a photograph's evidence row carry a real check-point the
 *  report can place under an asset system. Nothing in the app ever set
 *  checkId on an ordinary (non-internal) walk item after capture, so an
 *  auditor who left photographs untied had no way to close that gap except
 *  one item at a time. bulkLinkAdhocToCheck + BulkLinkWalkItemsSheet are
 *  the bulk way — 28 October 2026, Sarel: "can you build a way to tie them
 *  in bulk", having found the same unlinked photographs unchanged across
 *  three consecutive syncs. */

check(
  "bulkLinkAdhocToCheck exists on the store, declared on the State interface",
  /bulkLinkAdhocToCheck: \(ids: string\[\], checkId: string\) => number;/.test(store)
);

check(
  "it only touches items that exist AND are not already on that check-point",
  /bulkLinkAdhocToCheck: \(ids, checkId\) => \{[\s\S]{0,300}byId\.has\(id\) && byId\.get\(id\)!\.checkId !== checkId/.test(
    store
  ),
  "a no-op re-link should not count toward, or re-stamp updatedAt on, items already on the target check"
);

check(
  "it links through updateAdhoc — the one write path — not a direct scope patch",
  /bulkLinkAdhocToCheck: \(ids, checkId\) => \{[\s\S]{0,400}get\(\)\.updateAdhoc\(id, \{ checkId \}\)/.test(store),
  "going through updateAdhoc keeps this consistent with every other adhoc write in the file, including its own NC-raises-a-finding guarantee"
);

check(
  "it patches checkId ALONE — discipline and system are never touched by a bulk link",
  !/bulkLinkAdhocToCheck: \(ids, checkId\) => \{[\s\S]{0,400}get\(\)\.updateAdhoc\(id, \{ checkId, (discipline|system)/.test(
    store
  ),
  "a walk item carries its own discipline/system (AddItemSheet lets the auditor set both) — sharepoint.ts's evidenceValues() already reads them independently of checkId; overwriting a real answer silently on a bulk action is exactly the wrong-but-plausible value this app's conventions elsewhere refuse to guess"
);

check(
  "it returns how many it actually linked, for the toast to say so",
  /return targets\.length;/.test(store)
);

const fieldCode = codeOnly(field);

check(
  "the Checks/Inspection screen offers a checkbox on a walk item ONLY while it has no checkId",
  /\{!it\.checkId && \(\s*\n\s*<label/.test(field),
  "an item already linked has nothing a bulk action here would do to it"
);

check(
  "selection is tracked as a Set, cleared on Clear and after a successful link",
  /const \[selectedWalkIds, setSelectedWalkIds\] = useState<Set<string>>\(new Set\(\)\);/.test(field) &&
    /setSelectedWalkIds\(new Set\(\)\)/.test(fieldCode),
  "session state only — see the checkbox's own note: a selection surviving a reload with nothing open would be a trap, not a convenience"
);

check(
  "a live selection replaces the Add item bar rather than adding a third sticky layer",
  /selectedWalkIds\.size > 0 \? \(/.test(field) && /\{selectedWalkIds\.size\} selected/.test(field),
  "the existing bar's own comment: \"the thing it must not become is a third stacked layer\""
);

check(
  "the bulk-link sheet is fed exactly the selected items, and confirming calls the store action",
  /<BulkLinkWalkItemsSheet[\s\S]{0,200}items=\{adhocItems\.filter\(\(it\) => selectedWalkIds\.has\(it\.id\)\)\}/.test(
    field
  ) && /bulkLinkAdhocToCheck\(\[\.\.\.selectedWalkIds\], checkId\)/.test(field)
);

check(
  "BulkLinkWalkItemsSheet's own confirm hands back a bare checkId, not a patch object — the no-overwrite rule lives in ONE place",
  /onConfirm: \(checkId: string\) => void;/.test(bulkLinkSheet) && /onConfirm\(checkId\);/.test(bulkLinkSheet),
  "if this sheet ever started passing discipline/system back too, store.ts's own no-overwrite behaviour would be bypassed from here"
);

/* ---- 8 · AN OUTCOME IS NOT A RATING ------------------------------------ */

const outcomeCode = codeOnly(outcome);
for (const token of ["--bad", "--warn", "--good"]) {
  check(
    `the outcome control does not fill with ${token}`,
    !outcomeCode.includes(token),
    "those are band colours — Unacceptable and Tolerable — and a verdict is not a band"
  );
}
check(
  "the field verdict reads Compliant/Non-compliant, same as the desk's own words for C/NC",
  /\{ key: "C", label: "Compliant", Icon: IconCheck \}/.test(outcome) &&
    /\{ key: "NC", label: "Non-compliant", Icon: IconX \}/.test(outcome),
  'Sarel, 7 October 2026: one check answered on two screens must not read as two different verdicts — "Pass/Fail" here, "Compliant/Non-compliant" on CheckDetail, for the exact same C/NC'
);
check(
  "it fills with the brand accent instead",
  /background: on \? "var\(--acc\)"/.test(outcomeCode)
);
check(
  "state is carried by more than colour",
  /<Icon width=\{16\} height=\{16\} \/>/.test(outcome) && /\{label\}/.test(outcome),
  "an icon and a word survive sunlight, a projector and a colour-blind reader"
);
check(
  "it is one control, not four cards",
  /role="radiogroup"/.test(outcome) && /grid-cols-4/.test(outcome)
);
check(
  "the same segment tapped twice clears the outcome",
  /onChange\(on \? null : key\)/.test(outcome),
  "a status set by mistake that cannot be unset turns a blank 'not captured' into an untrue Compliant"
);

console.log(`\n${failures === 0 ? "AD-HOC OK" : `${failures} FAILURES`}`);
process.exit(failures ? 1 : 0);
