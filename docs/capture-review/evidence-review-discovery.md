# Discovery — Evidence review

Written against "Claude Code brief — Squawk Evidence review screen", on top of
`docs/capture-review/discovery.md`, `docs/capture-review/review-risk-fields-discovery.md`
and `docs/capture-review/review-table-v2-discovery.md`. Same mismatch those three
notes already recorded — the brief is written for a conventional multi-tenant
SaaS app on Postgres, with new tables, RLS and migrations, and this is a
local-first app (Dexie/IndexedDB on the device, one generic `squawk_records`
Supabase table for sync, no SQL schema, no ORM, no migrations framework beyond
this repo's own versioned `if (from < N)` blocks in `src/lib/store.ts`). This is
the fourth pass of the same initiative today, and this note extends the
evidence-tracking work the third pass (review table v2) already built, rather
than replacing it.

## 1. What the brief calls "new" that already existed before this pass

Everything in review-table-v2-discovery.md §3: `EvidenceItem` (`types.ts`),
`evidenceStage()`/`trackingStage()`/`disciplineFor()`/`groupByDiscipline()`
(`evidence.ts`), and the "By discipline" tab on `/evidence`. None of it was
rebuilt. §2 below is what this pass actually added on top of it.

## 2. What was genuinely new, built for this pass

1. **The "uploaded" tracking stage.** `trackingStage()` had no state between
   `requested` and `received`. Added as a derived read — attachments present,
   nothing received, nothing unavailable/insufficient yet — not a stored flag.
   The one subtlety: "Re-request" (point 2 below) stamps a FRESH `requestedAt`
   but deliberately keeps old `attachments`, so `uploaded` only fires for an
   attachment whose `createdAt` is at or after the CURRENT `requestedAt` — see
   `trackingStage`'s own comment in `evidence.ts` for why, and
   `evidence-review.test.mjs`'s "the old file, predating the fresh ask, does
   not fool trackingStage back into 'uploaded'" for the regression this
   guards.

2. **The "insufficient" stage and its own fields.** `EvidenceItem.insufficientAt`/
   `insufficientReason`, same at/note shape as `unavailableAt`/`unavailableReason`
   — a FIFTH independent fact an item can carry, not a new `EvidenceStage`
   value, same reasoning review-table-v2 already used for `analysisAt`. NOT the
   same thing as `unavailableAt` — unavailable means ACSA said the document
   cannot be produced at all; insufficient means something WAS produced and
   does not satisfy the request. Ranked above `received`/`analysis` in
   `trackingStage()` because marking something insufficient is, by
   construction, the latest real fact about it.

3. **`reRequestEvidence(id)`**, a new store action. Clears
   `insufficientAt`/`insufficientReason`/`receivedAt`/`analysisAt`/`analysisNote`
   and stamps a fresh `requestedAt` — but never touches `attachments`, `notes`
   or `signature`. The brief's own rule is "keeps files and history"; see
   point 1 above for how `trackingStage` reads this correctly as `requested`
   again despite the old files still sitting in the array.

4. **`EvidenceItem.complianceRating?: EvidenceComplianceRating`** —
   `"compliant" | "partial" | "nonCompliant"`, a NEW, NARROW type. The
   app-wide `Compliance` type (`"C" | "NC" | "N/A" | "NV"`) was deliberately
   NOT widened — it is load-bearing in `review.ts`, `sharepoint.ts`,
   `CheckDetail.tsx` and elsewhere, and this is a different, narrower
   question (the quality of one piece of evidence, not a check's own
   compliance verdict).

5. **The combined-compliance wiring — the one real product decision here.**
   See §4 below; it gets its own section because it is the judgement call
   most worth Sarel correcting if he pictured something else.

6. **The AI "Analyse evidence"/"Summarise files" flow, with Accept/Edit/
   Reject.** See §5.

7. **The extended "By discipline" view** — `src/components/EvidenceReviewView.tsx`
   (header, count cards, discipline/asset-system filters, status pills with
   counts, the grouped table, the Add-request dialog) and
   `src/components/EvidenceReviewPanel.tsx` (the right panel, 4.1–4.7). See §6
   for where this lives and why.

8. **`shareListText()`** in `evidence.ts` — "Share list with discipline." See
   §7.

9. **Migration v42** — `store.ts`, bumped from 41. One block,
   `insufficientAt`/`insufficientReason` backfilled to `null`/`""` on every
   existing item; `complianceRating` needs no backfill (optional,
   absent-means-not-rated).

## 3. "evidence_status_events" — skipped, and why

The brief's §3.4 asks for a new audit-log table (or reusing an existing
audit-log pattern) recording who changed status and when. This app's existing
per-stage timestamps (`requestedAt`/`receivedAt`/`returnedAt`/`unavailableAt`,
and now `insufficientAt`) already record WHAT happened and WHEN, for every
transition that matters to this screen. A parallel `evidence_status_events`
list would be a fourth (now fifth) thing that goes stale the moment one of
those timestamps changes without somebody remembering to also write an event —
exactly the drift `review.ts`'s own header comment (and `evidenceStage()`'s)
warns about repeatedly in this codebase.

**The real gap, if Sarel wants it**: none of these fields carry an actor — the
app has no per-field "who" today (the closest is `receivedFrom`/`receivedBy`,
which are about the document's custody, not about who clicked a button in
this app). If WHO changed a status matters, not just when, that is a genuine,
small, separate feature (an actor field on each of these timestamps, or a
proper append-only log) — flagged here as a follow-up, not built speculatively
in this pass.

## 4. The combined-compliance judgement call

`reviewCombinedCompliance(compliance, evidenceVerdict, siteInspection)`
(`review.ts`) already existed, pure and derived, worst-of-three, wired into
`ReviewDetail.tsx`'s sticky strip. `evidenceVerdict` is a single `Compliance`
the auditor sets directly per check via the existing `EVIDENCE_VERDICTS`
buttons — coarser than the new, per-`EvidenceItem` `complianceRating`, since
one check can have several `EvidenceItem`s bearing on it.

**The decision**: added `evidenceAxisFor(evidenceVerdict, items)` to `review.ts`
— the worst of the existing `evidenceVerdict` and the worst `complianceRating`
among every `EvidenceItem` whose `checkIds` include this check, mapped
`compliant→"C"`, `nonCompliant→"NC"`, `partial→"NV"`. `ReviewDetail.tsx` now
computes this once per check and feeds it into `reviewCombinedCompliance` in
place of the raw `evidenceVerdict` — extending what already computes the
"Evidence" cell, not adding a second axis or a second combined-compliance
function. `reviewCombinedCompliance`'s own signature and behaviour are
untouched. Unrated evidence (no item has a `complianceRating`) leaves the
result exactly `evidenceVerdict`, so a check nobody has touched on the new
Evidence view reads identically to before this pass.

**Flagging this plainly**: this was a judgement call, not something the brief
states this precisely. A reasonable alternative — a genuinely separate fourth
axis on the sticky strip ("Evidence quality" beside "Evidence") — was
considered and rejected, because the brief's own §4.6 says the rating "feeds
into… combined compliance," and this codebase already has exactly one
mechanism for that. If Sarel pictured a visible, separate axis rather than a
value folded into the existing "Evidence" cell, that is a small, well-scoped
follow-up (`evidenceAxisFor` already isolates the computation; only
`ReviewDetail.tsx`'s own rendering would need to add a second `StatusCell`).

## 5. The AI analysis flow

The closest existing precedent, `PhotoRow`'s "Describe" button in
`Capture.tsx`, calls `assist("caption", …)` and writes the result straight
into an editable field — no suggestion/accept step. Accept/Edit/Reject is a
genuinely new interaction pattern.

**Two new tasks**, `evidenceAnalysis` and `evidenceSummary`, added to the
`Task` union in `assistPrompts.ts` (and the matching `AssistTask` union in
`assist.ts`) with their own `TASK_PROMPT` entries, calling the same
`/api/assist` route every other task already uses — no new provider, route or
dependency. `evidenceAnalysis`'s prompt is built from `B170_SCALES`, same as
the existing `rating` task, and returns structured JSON parsed by the new
`parseEvidenceAnalysis()` in `assist.ts`, following `parseRootCauses`' own
convention of validating against an `allowed` list the CALLER supplies (so
`assist.ts` stays free of a `risk.ts` import). `evidenceSummary` returns plain
text, like `explain`/`narrative`.

**Ephemeral, local-only, never persisted** — the brief's own §4.5 says
Reject "keeps it in history"; the grounding this pass is built against is
explicit that nothing about a pending suggestion is written anywhere until
Accept, and this pass follows that instruction over the brief's literal
wording. `EvidenceReviewPanel`'s `suggestion`/`aiBusy`/`aiError` are plain
`useState`, reset automatically because the panel is keyed by `item.id`
(`EvidenceReviewView` does `<EvidenceReviewPanel key={openItem.id} …>`), so
switching rows clears any pending suggestion on its own. No new EvidenceItem
field, no new record kind, no new store slice.

**Accept** writes the suggestion's text into `analysisNote` (and sets
`analysisAt` if it was not already set) and does NOT create a Finding by
default — `AUTO_CREATE_FINDING_ON_ACCEPT` in `EvidenceReviewPanel.tsx`, a
single named `const`, defaults `false`. Both paths are implemented: the
`addFinding` call exists in the same function, behind that one flag, so
turning the auto-create behaviour on (once Sarel confirms he wants it) is a
one-line change, not a redesign. This is the safer default, and it is flagged
here exactly as the grounding asked, so Sarel can correct it.

**Severity/likelihood are not new `EvidenceItem` fields.** The brief's own
framing talks about storing "the analysis text/severity/likelihood on the
EvidenceItem," but `EvidenceItem` has no severity/likelihood of its own (that
rating lives on a `Finding`, which this request may or may not have one of).
Rather than add two fields that are only ever meaningful when a Finding is
also created, Accept folds the suggested severity/likelihood into the
`analysisNote` text itself ("suggested B/3") when no Finding is minted, and
onto the real `Finding.severity`/`Finding.likelihood` fields when
`AUTO_CREATE_FINDING_ON_ACCEPT` is on. No schema growth for a value that is
only ever acted on in one of two places.

**The lifecycle is enforced on the AI section too.** "Analyse" is only
reachable, per the brief's own status-flow table (§3.4), from `received`.
`EvidenceReviewPanel`'s "Analyse evidence" button is disabled until
`item.receivedAt` is set (`canAnalyse`), so the one place `analysisAt` gets
written outside the per-document editor cannot be used to skip
`requested`/`uploaded` straight to `analysed`. "Summarise files" has no such
gate (it never changes the stage) beyond needing something attached.

**The amber "N waiting" notice** is scoped to the one currently open panel,
not a cross-item count — since nothing is persisted, there is nowhere else to
read a global count from. Flagged as a scope limitation rather than built on
top of a new persisted table just to answer it.

## 6. Where the screen lives

Reused and extended the EXISTING "By discipline" tab on `/evidence`
(review-table-v2's own addition), rather than adding a third tab to
`/review` next to "By check"/"Risk & root cause," and rather than a wholly new
route. `src/components/EvidenceReviewView.tsx` (table, filters, header, the
Add-request dialog) and `src/components/EvidenceReviewPanel.tsx` (the right
panel) are new files, wired into `src/app/(app)/evidence/page.tsx` in place of
the old, much smaller `DisciplineTrackingView` function that used to sit
there.

**This is a judgement call worth stating plainly.** The brief's own mockups
show the Evidence work as a third tab on the Review screen, matching "By
check"/"Risk & root cause." review-table-v2-discovery.md §3c already reasoned
through this exact question for the simpler grouped view and decided against
putting it on `/review`: the evidence log's own data (`EvidenceItem`, custody
rules, discipline/system scoping) is not something `/review`'s other tab
(`Finding`-centric) otherwise touches, and keeping it on `/evidence` keeps the
chain-of-custody record in the one screen that already owns it —
`evidence.test.mjs`'s own "custody, never compliance" guard is exactly this
principle. Given this pass is a much larger extension of the same view (not
just a grouped summary any more, but the full table/panel/AI/compliance-rating
experience the brief asks for), that reasoning was re-examined rather than
assumed — and still holds: nothing about the new work needs `Finding` or
`/review`'s own check tree, and `ReviewDetail.tsx` only needed one small,
additive change (§4) to read evidence ratings into the existing combined
cell, with no need to physically host the Evidence screen there. If Sarel
specifically wants the visual integration of a third tab on `/review` (so an
auditor never leaves that screen), that is a real, reachable follow-up —
`EvidenceReviewView` takes no props from `/evidence`'s own state, so mounting
it as a third tab on `/review` instead is mostly a routing change, not a
rewrite.

The panel itself is a static side panel (`border-l`, fixed width, scrolls
independently), the same shape as `ReviewRiskPanel`/`CheckDetail`'s own right
panes — not the brief's own mockup of a panel sliding in as an overlay. This
app has no overlay panel anywhere on `/review`, and the brief's own rule is
that the existing design system wins on a conflict. Likewise the "dark navy
header" the brief's mockups describe (`#1a2740`) does not exist as a token in
this app's actual palette (`--panel`, `--acc`, etc. — a purple accent, not
navy), so the panel header uses this app's existing uppercase-mono-label
convention instead of inventing a new colour.

There is also no deferred-"Save" bar. Every other editable surface in this
app (the per-document `/evidence` editor, `CheckDetail`, `ReviewRiskPanel`)
writes through its store action the moment a field changes — nothing in
Squawk defers a write to a Save button. Building one Save/Close bar here
would be the one screen in the app that worked differently from every other,
so the panel writes live and the footer carries only the AI-suggestion notice
(§5) when one is pending.

## 7. Share list with discipline

`logText()` in `evidence.ts` already composes the full TK-003 form 7 text —
outstanding-first, held-originals, receipt detail, signatures — for the WHOLE
log. The brief's §3.6 wants something narrower and different in shape: one
discipline's items, with the thing/linked-to/status/a blank "Provided?"
column. Rather than growing a mode flag onto `logText()` (and risking the
form's own, carefully-ordered shape drifting), this pass added a sibling
function, `shareListText(items, discipline, disciplineOf, ctx)`, reusing
`disciplineFor`/the caller's own lookup exactly like `groupByDiscipline`
already does.

**Export pattern reused**: a `navigator.clipboard.writeText` with a
`window.prompt` fallback — the exact pattern `/evidence`'s own "Copy the log"
button already uses for the whole-log export. This repo's other export
patterns (`ExportPanel.tsx`'s workbook/zip downloads, `src/lib/photos.ts`'s
zip-of-photos) are for binary files (xlsx, zip) with their own download
plumbing; a short, printable, tick-box list is closer in kind to the existing
plain-text clipboard copy than to a new file download, so that is the pattern
this reuses rather than standing up a new PDF/print pipeline.

## 8. Notes — kept as a single string (deliberate scope-down)

The brief's §4.7 wants a chronological, dated, multi-author list of notes,
the same shape `Finding`/`Response` already give `ProgressNote[]`. Widening
`EvidenceItem.notes` from a plain string into a `ProgressNote[]` is a real,
reachable change (the shape to copy already exists), but it touches every
existing reader of `EvidenceItem.notes` (the per-document editor's own
textarea, `logText()`'s own composed line) and needs its own migration. Given
the size of everything else in this pass, this is a deliberate scope-down:
`notes` stays the single string it already was, edited from the new panel's
Notes card exactly like it already is from the per-document editor. Flagged
here rather than silently dropped.

## 9. RLS (test 11) — not applicable, replaced

There is no per-organisation multi-tenancy in this app, so "a user from
another organisation cannot read or write this visit's evidence requests" has
no literal equivalent. The real integrity guarantee here is entity scoping —
`useEvidenceItems()` already filters by `entity` (not `originVisit` — evidence
is tracked per entity across visits, same as findings), enforced the same way
throughout the sync layer and the local store. `evidence-review.test.mjs`'s
own scoping test replaces test 11: an item created at one entity does not
leak into another entity's list, and vice versa.

## 10. Tests

`tests/evidence-review.test.mjs`, 63 assertions, same bespoke
`node`-reads-source-text-and-regex-matches convention as
`review-table-v2.test.mjs`, PLUS real store runs (via `@/lib/store`'s real
`useStore`) for the behaviour worth more than a pattern match — re-request's
field-clearing, entity scoping, and the real `parseEvidenceAnalysis()`
parser — same reasoning `compliancefinding.test.mjs` gives for running the
real store rather than only reading it. Needs the alias loader:

```bash
node --import ./tests/alias.mjs tests/evidence-review.test.mjs
```

Covers, numbered against the brief's own §6 list (adapted per this note):
a discipline-only request's General tag (1); the Add-request dialog
rejecting a missing discipline (2); the structural impossibility of
`requested`→`analysed` skipping a step, both in `trackingStage()` itself and
in the panel's own AI gate (3); attach-file→uploaded and mark-received→
received (4); re-request→requested keeping files and history, run against
the real store (5); the asset-system filter scoped to the picked discipline
and resetting on change, in both the table's filter and the panel's own
"Linked to" card (6); status-pill/count-card counts reading off the
discipline/system-filtered set rather than themselves (7); the table mapping
every item with no slice/limit, the exact regression the brief names (8); a
pending AI suggestion changing nothing until Accept, and Reject only
clearing local state (9); `evidenceAxisFor`'s worst-of behaviour and
unrated-evidence-has-no-effect (10); entity scoping in place of RLS (11); the
new store/type/migration shape; the new AI task plumbing, with the real
parser exercised against a well-formed reply, an out-of-range rating, and
plain prose; `shareListText`'s per-discipline filtering and its blank
"Provided?" column; `sortWithinDiscipline`'s General-last ordering; and that
none of the new fields or components reach Capture/Field/Raise-a-
finding/Workspace, or touch the Audit Checks tab's own progress wording.

**Not covered by this suite, and why**: test 12 (no horizontal overflow at
1440×900/1920×849) needs a real browser — this repo's bespoke suites are
either source-read or run against a real store, and the thirteen browser
suites (`e2e.js`, `tablet.test.mjs`'s own layout checks, etc.) need
Playwright, a build and a server, which this pass did not stand up a new one
of for a single layout claim. The table and panel use this app's own existing
flex/`overflow-x-auto`/`overflow-y-auto` patterns throughout (the same ones
`ReviewRiskTable`/`ReviewRiskPanel` already rely on), rather than a fixed
width that could overflow, but this is asserted by convention, not measured.
If Sarel wants this pinned the way `tablet.test.mjs` pins the rest of the
app's layout, that is a small addition to the existing browser suite rather
than a new one.

`tests/README.md`'s table and opening line were updated (103 suites, 90
without a server, 4,026 assertions in total), and `tests/suite-table.test.mjs`
confirms the row against what the suite actually prints.

## 11. Migration

Bumped `src/lib/store.ts`'s version from 41 to 42. One block,
`if (from < 42 && Array.isArray(st.evidenceItems))`, backfilling
`insufficientAt`/`insufficientReason` to `null`/`""` on every existing item —
nothing deleted, nothing re-shaped. `complianceRating` needs no backfill
(optional, absent already means "not rated").

## 12. Branch, workflow

Branch: `evidence-review` (flat, unprefixed, matching this repo's own
convention — see `git branch -a`). This doc sits at
`docs/capture-review/evidence-review-discovery.md` rather than a root
`BLOCKERS.md`/`REPORT.md`, mirroring the three prior passes today. No genuine
blocker was hit; every open question above was resolved with a stated,
flagged judgement call and a safer default, the same way this whole
initiative has handled it.

## 13. Scope shipped vs. deferred

**Shipped and tested**: the new `EvidenceItem` fields (`insufficientAt`/
`insufficientReason`/`complianceRating`), the v42 migration, `trackingStage`'s
two new stages, `reRequestEvidence`, the combined-compliance wiring
(`evidenceAxisFor`, wired into `ReviewDetail.tsx`), the extended "By
discipline" table + right panel (header, count cards, filters, status pills,
grouped table with the brief's six columns, the Add-request dialog, the
panel's Linked-to/Status/Files/Compliance-rating/Notes cards), the AI
analyse/summarise tasks with Accept/Edit/Reject, and `shareListText`/"Share
list with discipline."

**Deferred, by deliberate choice, each flagged above with its reasoning**:
`evidence_status_events` (§3 — the existing timestamps already cover "what
and when"; "who" is a real but separate, small follow-up); a dated,
multi-author Notes list (§8 — kept as the existing single string); a browser
layout test for the new screen (§10 — the existing suites' own convention
does not cover this without standing up a new browser run); and a
cross-item, persisted count of pending AI suggestions (§5 — suggestions are
deliberately ephemeral).
