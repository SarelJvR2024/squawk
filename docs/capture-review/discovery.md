# Discovery — IA/UX consolidation (not new functionality)

Written against the brief "Claude Code Brief — Squawk: Multi-Level Capture, Review Table,
Root Cause, Risk Matrix & Roll-up Summary". After discovery, the brief's own premise (a
greenfield feature set on a conventional SQL backend) does not match this codebase, and
Sarel confirmed directly that the actual goal is narrower: **consolidate the IA and UX
of screens that already do this job today, reusing the existing data model and
components — not add a parallel feature set.** This doc records what already exists, so
any redesign builds on it rather than duplicating it.

## 1. Architecture (does not match the brief's assumptions)

- Next.js 16 (App Router), React 19, Zustand store, local-first: Dexie (IndexedDB) is
  the device's own record store.
- Sync, not a conventional backend: one generic table in Supabase, `squawk_records`
  (`entity, visit, kind, id, updated_at, payload, server_at`) — payload is JSON per
  record kind (`response`, `adhoc`, `finding`, `hazard`, `verification`, `system`). No
  ORM, no per-entity SQL tables, no migrations framework. RLS is on with zero policies;
  a passphrase-gated server route (`/api/sync`) is the only door, by design (see that
  route's own extensive header comment).
- A second, independent sync target: SharePoint, via Microsoft Graph, delegated
  auth-code+PKCE signed in as the auditor — no server-side client secret, by design
  (`src/lib/graph.ts`'s own header explains why). `src/lib/sharepoint.ts` builds the
  portal's lists/Evidence library from the same local data.
- No CI (`.github/workflows/` does not exist), no Playwright, no vitest/jest. The test
  suite is a bespoke `node`-based runner (`tests/run-all.sh`, ~95 suites, thousands of
  assertions), documented in `tests/README.md`. Conventions there are strict and must be
  followed for any new suite.
- AI: `src/app/api/assist/route.ts` (text enhancement) and `/api/transcribe` (voice),
  both server-side, Anthropic-backed.

None of the brief's "new tables / migrations / ORM / RLS / ... ✅ or add Playwright"
language applies. Where the brief says "findings table", read "the existing `Finding`
record kind in the shared sync + its own screens".

## 2. Current navigation / IA (`src/components/AppShell.tsx`)

| Tab | Route | What it actually does |
|---|---|---|
| Checks | `/capture` | The 324-check register, check-by-check Compliant/Non-compliant/N/A |
| Audit | `/audit` | Document-check capture (reusable per-document checklist, added recently) |
| Inspection | `/field` | The walkabout: ad-hoc items (`AdHocItem`/`WALK-` ids) by discipline/area, photos+voice, not tied to a register check |
| Raise a finding | `/raise` | Dedicated capture flow for a finding: one required note, optional photos+voice (own captions), then discipline → asset system → area, each step collapsing into the next as it's answered |
| Asset Assurance | `/findings` | Per-asset-system risk rating (severity/likelihood/band), with a right-hand panel showing every open finding, this visit's compliant/non-compliant checks and walk items for that system, root causes, mitigation actions |
| HIRA | `/hazards` | Hazard consolidation (merges several findings into one hazard, ERM rating) |
| Follow-up | `/closure` | Prior visit's carried findings, this visit's verification outcome |
| Dashboard | `/dashboard` | Overview |

**The "scattered" feeling the redesign is meant to fix, concretely:** understanding one
audit check or one asset system fully today means visiting several of the above. This
is not a new observation — two deliberate passes at the same problem already shipped:

- **`/review`** (13 October 2026, confirmed with Sarel directly in its own header
  comment) solved this for a single **check**: left-rail discipline/check tree, right
  pane is `CheckDetail` in full (observation, compliance, evidence, findings, photos),
  replacing a flat photo gallery.
- **`/findings`** (its own header comment, Sarel's words quoted directly) solved this
  for a single **asset system**: rate severity/likelihood as a group, see every
  compliant/non-compliant check, walk item and open finding for that system in one
  panel, capture multiple root causes and mitigation actions there.

So the redesign asked for now is the next, broader pass: bring capture (today split
across Checks / Audit / Inspection / Raise a finding) and review/bulk-editing (today
split across Asset Assurance / HIRA / Follow-up) into fewer, faster, more consistent
surfaces — reusing what `/review` and `/findings` already proved, not re-solving it.

## 3. Data model the brief assumed was missing — already exists

| Brief concept | Already exists as |
|---|---|
| `findings` table (observation/non-compliance, discipline/asset/check path, description, photos/voice) | `Finding` (`types.ts:930`) — `checkId`, `discipline`, `system`, `area`, `title`, `description`, `attachments`, `adHoc` flag distinguishes a register-raised vs. walk/raise-a-finding-raised one |
| Impact × Likelihood risk matrix, A–E / 1–5, derived priority/tolerance | `Severity`/`Likelihood` types (`types.ts:30-42`) are **already exactly** A-E / 1-5 with the brief's own labels; `bandFor()` + `BAND_META` (`src/lib/risk.ts`) is **already** the full 5×5 B170 001M lookup table, with Red/Amber/Green → Unacceptable/Tolerable/Acceptable — the same 3-tier tolerance the brief calls I/II/III, already correct and already sourced against two different wordings ACSA has used (see that file's own comments). **Nothing to rebuild here.** |
| Root cause (type + text + confirmed/unconfirmed) | `Finding.rootCause` (single text) at the finding level; `SystemAssessment`'s `PossibleEvent`/`RootCauseNote`/`MitigationAction` (`types.ts:1037,1104`) at the asset-system level, already supporting **multiple** root causes and **multiple** actions per event, each with `seeded` provenance. A finding-level `rootCauseType` enum + confirmed/unconfirmed toggle (brief §2.5/§4.3) is the one genuinely new, small field — small enough to add to `Finding` directly if wanted. |
| Evidence requests (no due date, status) | `Check.evidenceExpected` (static, per check, what's normally expected) + `Verification.evidenceRequested` (free text, asked against a carried finding) + the PDF report's own "Records requested from ACSA" table, which already reads as check/item/state/requested/requested-by. A **first-class, listable, per-discipline evidence-request item with a status** (requested/received/insufficient) is the one piece that doesn't fully exist as its own record yet — closest existing shape is `Verification.evidenceRequested`, which is text-only and scoped to carried findings only. |
| Capture components (text/photo/voice/transcribe) | `AttachmentStrip`, voice recording + `/api/transcribe`, reused already by `/raise`, `/field`, `CheckDetail`. Nothing new needed. |
| Roll-up by discipline/asset-system/check, priority mix, short-term export | Partially exists (Asset Assurance's own asset-system view, PDF report's "Asset Systems: Risk to Operations" table); a **generic, on-screen** roll-up/summary view with drill-through doesn't exist yet as its own UI. |

## 4. What's genuinely new, if anything

Only three things from the brief don't already exist in some form:
1. A finding-level root-cause **type** (enum) + confirmed/unconfirmed toggle, alongside the existing free-text `rootCause`.
2. A first-class, standalone evidence-request record (not borrowed from `Verification`), with a simple status.
3. An on-screen roll-up/summary view (today this only really exists inside the PDF report, not live in the app).

Everything else the brief asked for is an **IA/UX consolidation problem**, not a data or
logic gap: reuse `Finding`, `AdHocItem`, `SystemAssessment`, `risk.ts`, `AttachmentStrip`,
and the two already-proven consolidation patterns (`/review`, `/findings`), applied more
broadly and made faster for bulk use.
