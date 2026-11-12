# Discovery — Review risk-fields addendum

Written against "Squawk — Addendum to the Capture & Review brief (Review risk
fields)", on top of `docs/capture-review/discovery.md`. Same translation this
repo's prior discovery note already did for the main brief: the addendum's own
language (`text[]` columns, "generated column", "CI") assumes a conventional
SQL backend this app does not have. This note records what the addendum asks
for, what already exists in this codebase and is being reused, what is
genuinely new, and the mapping decisions made along the way — so Sarel can
sanity-check them before they ship any further.

## 1. What the addendum calls "new" that already exists

| Addendum says | Already is |
|---|---|
| `severity char(1)`, `likelihood smallint` | `Finding.severity: Severity \| null`, `Finding.likelihood: Likelihood \| null` — already the exact A–E / 1–5 scale, same wording, same file (`types.ts`). Not touched. |
| "agreed" / confirmed rating | `Finding.ratingConfirmed: boolean` — already exists, already means exactly "severity AND likelihood are both set, by a tap, not a guess." Not touched. |
| "generated column or computed in one shared function… one source of truth" | `bandFor()` (`src/lib/risk.ts`) already is that one function. `BAND_META`/`BAND_AS_RATING` already carry two of the addendum's synonyms (Red/Amber/Green and Unacceptable/Tolerable/Acceptable). The addendum's own "Priority I/II/III" is a **third** synonym for the same three-way split — added as `BAND_AS_PRIORITY` beside the other two, not a second computation. See risk.ts's own comment on it, and the note on `tests/risk-matrix.test.mjs` below. |
| The 5×5 matrix / "mini 5×5 matrix" | `RecordActions.tsx` already has the full matrix (reused on /findings, /hazards, /isf); `RatingPicker.tsx` already has the compact two-row A–E / 1–5 segmented-button alternative (reused on /findings' asset-system rating). The new Risk panel reuses `RatingPicker` for setting severity/likelihood, and adds one new, small, **read-only** mini-matrix purely to visualise the chosen cell — see §3 below for why this is not a third input mechanism. |
| SEVERITIES/LIKELIHOODS wording, A–E, 1–5 | `SEVERITIES`/`LIKELIHOODS`/`SEVERITY_DEF`/`LIKELIHOOD_DEF` in `risk.ts` already carry this, verbatim from B170 001M. Reused as-is. **Not** reused: the addendum's own parenthetical likelihood percentages ("1 Extremely improbable (<5%)" etc.) — those numbers do not appear anywhere in this codebase's ACSA-sourced wording, and `risk.ts`'s own header is explicit about never restating or inventing a figure for this scale. Flagged in the PR as an open question rather than fabricated. |
| "CI" (§5) | No CI in this repo (no `.github/workflows/`). The bespoke `tests/` runner (`tests/run-all.sh`, documented in `tests/README.md`) is what "must pass" means here. |
| `text[]` columns / "additive migration" | No SQL, no migrations framework. Dexie (IndexedDB) + zustand `persist`, with a versioned `migrate()` function (`src/lib/store.ts`) — bumped to v40 for this pass, following the same `if (from < N)` backfill convention `attachments` got at v39. |

## 2. What is genuinely new

1. **`Finding.rootCauseCategories?: string[]`** — the addendum's "Root cause
   categories", multi-select, zero or more.
2. **`Finding.impactAreas?: string[]`** — the addendum's "Impact areas",
   multi-select, zero or more. `IMPACT_AREAS` (new) in `src/lib/riskVocab.ts`.
3. **`Finding.rootCauseNote?: string`** — the addendum's "Root cause notes"
   free text ("Possible root cause / contributing factor"). See §4 for why
   this is a new field and not a repurposing of `Finding.rootCause`.
4. **`Finding.rootCauseConfirmed?: boolean`** — the "Confirmed-with-airport
   toggle" on the note above, default off (absent).
5. **`BAND_AS_PRIORITY`** in `risk.ts` — the I/II/III alias, see §1.
6. **`src/lib/reviewRisk.ts`** — new, small, pure module: `priorityFor`,
   `toggleMulti`, `applyBulkMulti`, the filter matcher, the multi-select
   counts and the roll-up. The "one shared function" the addendum asks for,
   kept separate from `risk.ts` (which owns the matrix itself) and import-light
   enough to unit-test directly under plain `node` (with the alias loader,
   since it imports `risk.ts`/`riskVocab.ts` by value).
7. **A second tab on `/review`**, "Risk & root cause" — the addendum's table,
   bulk bar, filters and roll-up. Added alongside the existing check-by-check
   tree (`ReviewDetail`), not instead of it — §1's own safety rule keeps
   "existing Checks/Inspection tabs and progress counts untouched," and the
   existing `/review` already does its own job well (see the main brief's
   discovery note on why `/review` already shipped a redesign on 13 Oct 2026).
   Defaults to the existing "By check" view, so nothing about how the screen
   opens today changes.
8. **`ReviewRiskPanel.tsx`** — the right panel's "Risk" section.
9. **Two nav/UI nits** — the bottom nav's full labels moving from `xl`
   (1280px) to `min-[1440px]`, and visible separators in `FlowStepper`'s
   breadcrumb. Both in `src/components/AppShell.tsx`/`ui/FlowStepper.tsx`.

## 3. The mini matrix is not a third input

`RatingPicker` (reused for Severity/Likelihood in the new panel) sets both
axes through five segmented buttons each — the same control already proven on
`/findings`. `RecordActions`' own big matrix sets both axes in one tap on a
cell — the control `/findings` and `/hazards` use instead. Putting the big
clickable matrix next to `RatingPicker` in the new panel would be two input
mechanisms racing to answer the same question. So the addendum's "mini 5×5
matrix with the chosen cell highlighted" is built as a small, **read-only**
visualisation — a 5×5 grid of coloured squares, no `<button>` anywhere in it —
confirming what `RatingPicker` just set, not a second way to set it.

## 4. The `rootCause` mapping decision

The addendum's own framing ("Finding.rootCause already exists as free text —
treat it as the addendum's root cause notes field") does not match what the
field is actually used for today. Reading `RecordActions.tsx` (the component
that writes it, on `/findings`, `/hazards` and `/isf`):

```tsx
<Chip
  key={rc}
  selected={record.rootCause === rc}
  onClick={() => onChange({ rootCause: rc })}
>
```

`rootCause` is set to **exactly one value from the closed `ROOT_CAUSES` list**
via a chip picker — a single category, not a note. `src/lib/assist.ts` reads
it the same way: `f.rootCause && "Root cause selected: ${f.rootCause}"` — a
selection, not a note. (`Hazard.rootCause`, a different record, is described
elsewhere as free text because a hazard's version of this field is assembled
from several asset systems' causes by `hazardPromotion.ts` — a different
field on a different type, following a different rule; not evidence about
`Finding.rootCause`.)

So: **`rootCause` is left completely untouched.** Overloading one string field
to mean "a category chip" on `/findings`/`/hazards`/`/isf` and "free text" on
`/review` would have made the same field mean two different things depending
on which screen last wrote it — exactly the kind of drift this codebase's own
comments (risk.ts's Tolerable/mitigate note, `ratingConfirmed`'s whole reason
for existing) warn against repeatedly. Instead:

- The addendum's multi-select **"root cause categories"** is the natural
  successor to the existing single-select idea, so it reuses the same
  vocabulary (`ROOT_CAUSES`) rather than a new one — see §5.
- The addendum's free-text **"root cause notes"** is a genuinely new field,
  `rootCauseNote`, scoped to `/review` only.

## 5. Open question: the root-cause-category vocabulary

The addendum's own root-cause-category list — *Maintenance, People &
training, Procedure, Equipment & design, Resources, Oversight, External* — is
marked **PROVISIONAL ("confirm with Sarel")** in the brief itself, and it does
not match the vocabulary this app already uses for the same question
(`ROOT_CAUSES` in `riskVocab.ts`, née `store.ts`: *Maintenance backlog,
Documentation gap, Design / original installation, Resourcing / staffing,
Other*).

Shipping the addendum's own list as a second, different root-cause vocabulary
next to the one `/findings`/`/hazards`/`/isf` already use would mean two
incompatible closed lists for the same underlying question, on two different
screens, with no way to reconcile a count across both. Given the addendum
marks its own list provisional, this pass **reuses `ROOT_CAUSES`** for the new
multi-select `rootCauseCategories`, and flags the mismatch for Sarel rather
than silently picking one. Decided here as the safer default; not acted on
irreversibly — `rootCauseCategories` is a plain `string[]`, so swapping the
vocabulary later is a data-entry question, not a schema change.

## 6. Other wording not reproduced, and why

- The addendum's likelihood hints ("(<5%)", "(5–24%)", …) — not in `risk.ts`'s
  ACSA-sourced wording; not fabricated.
- The addendum's example result text, "Priority I · Unacceptable · Improve
  control environment" — the panel shows `BAND_META[band].strategy`
  ("Avoidance — management to act immediately" for Red, etc.), which is the
  wording already sourced into this codebase from the procedure, rather than
  the addendum's own example copy, which does not appear anywhere else in this
  app.

Both are the same kind of decision `tests/risk-matrix.test.mjs` already polices
for the matrix itself: this app derives and reuses sourced wording rather than
restating a plausible paraphrase of it.

## 7. Scope shipped vs. deferred

See the PR description for the full list. In short: the new `Finding` fields,
the migration, the risk-vocabulary module, the Review table (columns, column
toggles, filters, bulk bar for severity/likelihood/impact/root-cause), the
Risk panel, and the roll-up summary all shipped and are tested. AI "Suggest
rating" (the bulk bar's AI-assisted fill) did not — it needs a new structured
`/api/assist` task and a parser, and is a clean, separate follow-up rather than
something to rush into an already-large pass.
