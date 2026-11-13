# Discovery — Review table v2 (Sarel's three follow-ups on the approved mockup)

Written on top of `docs/capture-review/discovery.md` and
`docs/capture-review/review-risk-fields-discovery.md`. Sarel reviewed a
screenshot of the "Risk & root cause" tab those two notes describe and asked
for three more things, iterating on the same screen, after confirming a
static HTML mockup's column layout was right. This note records what already
existed and was reused, what is genuinely new, and the judgement calls — so
Sarel can confirm or correct them.

## 1. The table itself — widened to the approved column set

`ReviewRiskTable.tsx` used to show four toggleable columns (default: Rating,
Impact, Root cause) beside a truncated Finding cell. The mockup Sarel
approved is a single, FIXED wide table: select · Type · Discipline · Asset
system · Audit check · Finding/comment (wraps) · Severity · Likelihood ·
Rating · Root cause · Impact · Evidence. Since the mockup is one specific
table, not a customisable one, the column-toggle UI (`ALL_COLUMNS`/
`DEFAULT_COLUMNS`/`toggleColumn`) is gone — every column always renders.
Rating stays read-only (unchanged, `priorityFor`), as do the Root cause and
Impact chip previews. Clicking a row still opens `ReviewRiskPanel` unchanged
in its existing Risk section; the panel gained two NEW sections (Type,
Evidence — see §2 and §3) rather than having its existing content touched.

**Discipline and Asset system filters** reuse `ALL_DISCIPLINES` and
`systemsOf`/`systemsAt` (`src/lib/register.ts`) exactly as asked — no second
vocabulary. The Asset system filter's own options narrow to the active
Discipline filter (`systemsOf`) when one is set, and fall back to every
system at the entity (`systemsAt`) otherwise; both wire into
`reviewRisk.ts`'s existing `ReviewRiskFilter`/`matchesReviewRiskFilter`
rather than a parallel filter mechanism — two new filter kinds
(`"discipline"`, `"system"`) on the same discriminated union the other five
already use.

## 2. The "Type" tag — genuinely new, not derived

Checked both candidates the brief named before adding anything:

- **`issueIndex`** (`Finding.issueIndex: number | null`) says which CAPTURE
  MECHANISM raised a finding — an Answer Library issue button (non-null) vs.
  typed free text (null). `store.ts`'s `raiseFindingFromCheck`/
  `raiseFindingFromAdhoc` and every sheet that raises a finding (`raise/
  page.tsx`, `RaiseFindingSheet.tsx`, `ReviewDetail.tsx`'s own checkless-
  finding flow) all set it to `null` — it says nothing about compliance vs.
  observation, only about which button was tapped, and the one case that
  isn't null (an Answer Library issue chip) is itself just as capable of
  describing a non-compliance as an observation.
- **`adHoc`** (`Finding.adHoc: boolean`) says which CAPTURE PATH raised a
  finding — the 324-check register (`false`, set by `raiseFindingFromCheck`)
  vs. a walk/raise-a-finding screen (`true`, set by `raiseFindingFromAdhoc`,
  `raise/page.tsx`, `RaiseFindingSheet.tsx`). A register-raised finding
  (`adHoc: false`) IS unambiguously a non-compliance — `setCompliance`'s own
  "NC becomes a finding" rule (`compliancefinding.test.mjs`) only ever mints
  one when the check itself was marked Non-compliant. But an `adHoc: true`
  finding is raised through free text with no such gate — `raise/page.tsx`
  and the walk's own promote-an-observation flow ask for a note, a
  discipline, an asset system, a check; none of them ask whether what was
  typed is a rule violation or a milder observation worth recording. Reading
  `adHoc` as the Type tag would read every single ad-hoc finding as the same
  thing, which is exactly not true of them.

**Conclusion: neither field answers "is this a compliance/rule violation or
a milder observation" — this is genuinely new information only the auditor
can supply.** Added `Finding.findingType?: "non-compliance" | "observation"`,
optional, absent reads as `"non-compliance"` through `findingTypeFor()`
(`src/lib/reviewRisk.ts`) — never read off `f.findingType` directly, same
"one function decides the default" discipline `priorityFor` already
established for "Not rated". Default is non-compliance because these ARE
findings (the safer reading when nobody has said otherwise), with a two-chip
toggle in `ReviewRiskPanel` ("Type" section, above the existing "Risk"
section) for the auditor to mark one an observation instead. Shown read-only
in the table as a small Pill (bad tone for non-compliance, neutral for
observation); edited only in the panel, same split as every other
risk-review field.

No migration needed — same reasoning as `Response.evidencePending`: an
optional boolean/enum whose absence already means something specific
(here, "non-compliance") needs no backfill, only a reader that defaults it
consistently, which `findingTypeFor` is.

## 3. Evidence — grouped-by-discipline view, and capture at any level

### What already existed and was reused wholesale

`EvidenceItem` (`src/lib/types.ts`) already tracks a document's custody
end-to-end — `requestedAt`/`requestedFrom`, `receivedAt`/`receivedFrom`/
`receivedBy`, `unavailableAt`/`unavailableReason`, `returnedAt`/`returnedTo`
— and `/evidence` (`src/app/(app)/evidence/page.tsx`) already has the whole
request-creation flow: `addEvidenceItem(title, seed?)` (one field needed,
`seed` already a `Partial<EvidenceItem>` escape hatch), `updateEvidenceItem`,
`receiveEvidence`, the custody rules in `src/lib/evidence.ts`
(`evidenceStage`, `isHeldOriginal`, `itemGaps`, …), and the Forms-hub deep
link (`useFormsHubDeepLink`, `?open=<id>`) that scrolls straight to a record
by id. None of this was rebuilt — see §3c below for exactly how the Review
panel reuses it rather than growing a second evidence-request mechanism.

### 3a. "Analysis" — the one genuinely new concept

Sarel named a fourth state (not started / Requested / Received / Analysis)
that doesn't exist in the data model. For a document's own CUSTODY record —
as opposed to the audit answer itself, which stays on the check screen's
`Response.evidenceProves` — the natural reading of "Analysis" is: **the
auditor has looked at a RECEIVED document and formed a view on what it shows
or proves**, a step after receipt, not instead of it or a replacement for the
check-level evidence question.

Added as `EvidenceItem.analysisAt: number | null` + `analysisNote: string`,
**the exact same shape as the existing `unavailableAt`/`unavailableReason`
pair** — not a new value in `EvidenceStage`/`evidenceStage()`. Folding it
into that enum would force an item to be in only one of
requested/received/returned/unavailable/analysed at a time, which is false:
a returned original can have been analysed first, and an analysed document
is still, separately, received. So `src/lib/evidence.ts` gets a parallel,
narrower function for the new view only — `trackingStage()` → one of
`notStarted`/`requested`/`received`/`analysis`/`returned`/`unavailable` —
rather than widening the custody register's own stage. `evidenceStage()`
itself is untouched.

The analysis field surfaces on `/evidence`'s own item card too (a new
"ANALYSIS" field, visible once `receivedAt` is set, same show/hide and
button shape as "CANNOT BE PRODUCED"), so the new state is capturable from
the one real place evidence is edited, not only from the new grouped view.

### 3b. Evidence at any level of the hierarchy

Added `EvidenceItem.discipline?: string` and `system?: string`, alongside
the existing `checkIds: string[]` — all three optional, any combination,
free text matching the register's own discipline/system names (not a closed
list in this module, same reasoning as every other field here that reads a
check-point id rather than a `Check`). `/evidence`'s own request-creation UI
gained a new "ALSO BEARS ON — A DISCIPLINE OR ASSET SYSTEM, OVERALL" field,
right above the existing check-point picker, so an auditor can scope a
request to a whole discipline or asset system with no check-point at all,
same as the existing field already lets them pick none, one, or several
checks.

### 3c. The grouped-by-discipline view — where it lives, and why

Built as a new section WITHIN `/evidence` ("By document" / "By discipline"
tabs at the top of the screen, defaulting to "By document" so nothing about
how the screen opens today changes), not a new tab on `/review`.

Reasoning: the grouped view is a different LENS on the evidence log's own
data — `EvidenceItem`, custody rules, the discipline/system fields just
added — none of which `/review` otherwise touches. `/review`'s "Risk & root
cause" tab is about `Finding`; pulling the evidence log into a tab there
would mean importing `useEvidenceItems`/`src/lib/evidence.ts` into a screen
whose whole existing job is findings, and would leave `/evidence` as two
diverging views of the same register (one flat list there, one grouped view
on a different route). Keeping both views on `/evidence` keeps the
chain-of-custody record in the one screen that already owns it, the same
reasoning `evidence.test.mjs`'s own "custody, never compliance" guard
already enforces for everything else on that page.

`groupByDiscipline()`/`disciplineFor()` (`src/lib/evidence.ts`) are the one
shared function for this, same discipline as `rollupBy` in `reviewRisk.ts`:
the screen supplies only how to place an item (its own `discipline`, else
its first linked check's discipline via a lookup the caller supplies, else
`"Unassigned"`), never how to count it. Opening an item from the grouped view
switches back to "By document" and scrolls to the real card — reusing the
same card and the same edit paths, not a second renderer for the same
record.

### 3d. Reaching it from a finding's own panel

`ReviewRiskPanel` gained a new "Evidence" section (below the existing Risk
content, which stays untouched) showing every `EvidenceItem` whose
`checkIds` includes this finding's `checkId`, or whose `system`/`discipline`
matches the finding's own — i.e. everything already scoped to this exact
check, this asset system overall, or this discipline overall. Three buttons
("Request for this check" / "Request for \<system\>" / "Request for
\<discipline\> (discipline)", each only shown where the finding actually has
that level) call the SAME `addEvidenceItem(title, seed)` store action
`/evidence`'s own "Log it" button calls, seeded with the matching
`checkIds`/`system`/`discipline`, and then route straight to
`/evidence?open=<id>` — the real page's own deep link — so the auditor
finishes the request (who it was asked of, medium, custody) using the real
form. Nothing here re-implements that form; it mints the stub record and
hands off, which is the "not a second, parallel evidence-request mechanism"
the brief asked for.

## 4. Migration

Bumped to v41 (from v40, where the prior review-risk-fields pass left it).
One new migration block, same `if (from < N)` convention as every other
slice: `EvidenceItem.analysisAt`/`analysisNote` are new and required, so
every existing item backfills to `null`/`""` — the honest read for an item
logged before "Analysis" existed. `discipline`/`system` are optional and
absent already means "not scoped to one," so neither needs a migration.
`Finding.findingType` is optional and defaulted by a reader function (§2),
so it needs no migration either — nothing is persisted that would otherwise
read wrong.

## 5. Scope shipped

All three things above, with tests in `tests/review-table-v2.test.mjs`
(source-read, same bespoke convention `tests/review-risk-fields.test.mjs`
established) covering: the discipline/system filter kinds and their
matching logic; `findingTypeFor`'s default and the panel's toggle; the
`trackingStage`/`groupByDiscipline` functions against hand-built fixtures;
the new EvidenceItem fields and the v41 migration; and that capture
surfaces (Capture/Field/Raise-a-finding/Workspace) still carry none of the
review-only fields, extending the existing guard to `findingType`.
