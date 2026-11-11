# Capture/Review consolidation — status report

## 1. What Sarel can now do

- There's a new screen, **Capture (all)**, in the **More** menu — it shows every
  discipline, asset system and check at once, in one expandable, searchable list,
  instead of switching between Checks, Inspection and Raise a finding to find where
  something belongs.
- Every row — discipline, asset system, or a single check — has its own small **+**
  button. Tapping it asks one question: **Observation** or **Non-compliance**, right
  where you tapped.
- Picking **Non-compliance** on a check sets it Non-compliant immediately (exactly
  like it would from Checks or Review) and opens that check's full detail so you can
  add the note and photo in the same motion.
- Picking either option on a discipline or asset system opens the same capture sheet
  Inspection already uses — description, photos, voice note — pre-filled to that
  discipline/system so you don't re-pick it.
- Rolled-up counts (how many Non-compliant, how many Observations) show at every
  level of the tree, so you can see where attention is needed without opening
  anything.
- **Nothing existing changed.** Checks, Inspection, Raise a finding, Review and Asset
  Assurance are exactly as they were — this is a new, additional way in, reachable
  from the More menu so it can be tried without being in the way.

## 2. Why this is smaller than the original brief, and on purpose

The brief I was given described a much bigger rebuild — new database tables, a
rebuilt findings table with bulk AI actions, a new risk-matrix and root-cause system,
Playwright tests, a CI pipeline. Before writing any code, I checked the actual app
against that brief and found two things:

1. **The brief's technical assumptions didn't match this app.** Squawk has no SQL
   database with migrations — it's local-first (the device's own storage) synced
   through one shared record, and there's no CI or Playwright today. Building what
   the brief described literally would have meant inventing a second, parallel system
   next to the one already running this audit.
2. **Most of what the brief asked for already exists**, built over the last couple of
   weeks and confirmed with you directly in each case: `/review` already does
   "everything for one check in one place," `/findings` already does the asset-system
   risk rating with the right matrix, root causes and multiple actions. The real
   problem — which you confirmed when I checked — is that these pieces feel
   scattered, not that they're missing.

So I stopped, wrote up exactly what I found
(`docs/capture-review/discovery.md`), and asked you how to proceed. You confirmed:
reuse what's there, build new screens and prove them before retiring the old ones,
and start with capture. That's what shipped.

## 3. What's not finished, and why

Deliberately deferred, not abandoned:
- **Evidence requests** — there's no existing record for a standalone, listable
  evidence request yet (the closest things today are a static per-check "what's
  normally expected" note and a free-text field tied only to carried findings).
  Building this properly is its own small piece of new data, not a UI change, so it
  wasn't rushed into this pass.
- **A rebuilt, bulk-editable Review table** and **a roll-up/summary view on screen**
  — both real, both next, both build on `/findings` and `/review` rather than
  replacing them from scratch.
- **Bulk AI actions, Playwright, CI** — the AI actions need the evidence-request and
  root-cause pieces to exist first to be useful; Playwright/CI are infrastructure
  additions this repo doesn't have today and weren't asked for again once the brief
  was corrected to "reuse what's there."

## 4. Decisions made without asking (and why they were safe to make)

- **Route name**: `/workspace`, since `/capture` was already taken (by the existing
  Checks screen). Nav label is "Capture (all)".
- **Where it lives**: the More menu, not the main bottom bar — the same cautious
  rollout `/raise` itself got before the team decided it had earned a permanent
  bar slot, and the bar is already at 8 destinations with a documented mobile
  label-wrapping limit.
- **No new data shape for Observation vs. Non-compliance at the walk-item level** —
  reused the existing `outcome` field (null = observation, "NC" = non-compliance),
  which already carries this exact meaning elsewhere in the app.

Nothing here is a business-data assumption; it's all reuse of a pattern already in
the codebase.

## 5. Technical section

- **No database migrations** — there's no database to migrate; nothing new was
  added to the shared sync record's shape at all in this pass.
- **Files changed**: `src/app/(app)/workspace/page.tsx` (new), `src/components/AddItemSheet.tsx`
  (+2 optional props), `src/components/AppShell.tsx` (nav entry), `tests/workspace.test.mjs`
  (new, 19 assertions), `tests/tablet.test.mjs` (one real gap fixed — the new
  two-pane screen needed the same scroll exception `/capture` and `/review` already
  have), `tests/README.md` (counts: 100 suites, 3,851 assertions, verified by
  running the suite, not typed in).
- **Rollback**: delete the branch, or revert the PR — nothing touches existing data
  or existing screens, so there is nothing to roll back on those.
- **Tests**: `npx tsc --noEmit` clean, `npx eslint` clean on every file this PR
  touches, `bash tests/run-all.sh --source` — 0 of 100 source suites failed.
- **Branch**: `feature/capture-review-v2`. **Draft PR**:
  https://github.com/SarelJvR2024/squawk/pull/234 (not merged — an independent
  review pass is running against it now).
