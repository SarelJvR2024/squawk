# Squawk

Audit capture, field inspection, findings closure and reporting for the ACSA
asset assurance programme, built for Thabile-Pridin JV.

In aviation maintenance a *squawk* is a reported defect: it is logged, it is
rated, it stays open until someone verifies the fix. That is this application's
whole loop, across a three-year cycle and ten entities.

Reference: the design document (*Asset Assurance Capture Platform*, draft v0.2).
Section numbers in code comments point at that document.

## What is in here

| Area | State |
|---|---|
| Design system (section 5 interface standard) | Implemented as CSS tokens and primitives, light and dark |
| Data model (section 6) | Typed domain model, local-first store over IndexedDB |
| Seed data | 374 check-points, 8 disciplines, 99 ACSA documents mapped, 33 site variants, 23 March 2025 findings |
| Answer Library (section 7) | **Complete — all 374 checks, 11,179 researched options** |
| Capture workspace (section 8) | Three-pane workspace, answer chips, voice and photo, progress, ⌘K, keyboard |
| Field inspection mode | Location-first, 44px targets, capture-first tray, ad-hoc findings, offline |
| Findings and rating | ACSA B170 001M matrix, agreed vs suggested ratings, root cause, owner, due date |
| Closure | 23 prior findings, four-way verification, coverage guard, lifecycle |
| Dashboards | Airport, discipline and portfolio, with movement against March 2025 |
| AI assistance | Optional and advisory — off unless a key is set |
| Exports | Excel and CSV: register, findings, closure, evidence request, summary |
| Word report templates | Not started — design document phase 4 |

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**, design tokens in `src/app/globals.css`
- **Zustand** + **IndexedDB** (`idb-keyval`) — local-first, offline capable
- **fflate** — the only runtime dependency beyond the framework, for writing .xlsx

Local-first is a deliberate choice while the hosting and data-governance question
(design document Q4) is open: nothing leaves the device, and the store sits
behind an interface so a server backend can be added without touching the UI.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

## Tests

Five suites, no framework, all plain `node`. See `tests/README.md`.

```bash
node tests/risk-matrix.test.mjs          # the ACSA matrix, all 25 cells
npm run build && npm start &             # then, against a running server:
BASE=http://localhost:3000 node tests/e2e.js          # 21 assertions
BASE=http://localhost:3000 node tests/robustness.js   # 30 assertions
BASE=http://localhost:3000 node tests/exports.js      #  7 assertions
BASE_NO_KEY=... BASE_WITH_KEY=... node tests/ai.js    # 14 assertions
```

Run `tests/risk-matrix.test.mjs` after **any** edit to `src/lib/risk.ts`.

## Deploying to Vercel

A standard Next.js project. No database, no environment variables required.

**Option A — via GitHub (recommended)**

1. Create a repository on GitHub and push this folder to it.
2. Go to [vercel.com/new](https://vercel.com/new) and import that repository.
3. Vercel detects Next.js — accept the defaults and deploy.

**Option B — from your machine**

```bash
npx vercel          # links the project and deploys a preview
npx vercel --prod   # promote to production
```

### Optional environment variables

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Turns the AI assistance on. Without it the endpoint reports itself unavailable and every AI affordance disappears; the app is fully usable either way. |
| `ASSIST_MODEL` | Overrides the model id. Defaults to `claude-sonnet-4-5`. |

Setting the key is a **data-governance decision, not a technical one** — see
*AI assistance* below.

Fonts load from Google Fonts at runtime because the build environment this was
written in cannot reach `fonts.googleapis.com`. On Vercel you can switch
`src/app/layout.tsx` back to `next/font/google` for build-time optimisation.

## Project structure

```
src/
  app/
    (app)/            capture · field · findings · closure · dashboard
    api/assist/       the AI endpoint — the only thing that leaves the device
    globals.css       design tokens for both themes
  components/
    AppShell.tsx      header, nav, cycle strip, command palette, role switch
    CheckDetail.tsx   the check screen — reference left, capture right
    ExportPanel.tsx   the export sheet
    ui/               primitives and icons
  lib/
    types.ts          domain model
    risk.ts           ACSA B170 001M matrix — Red / Amber / Green
    store.ts          state, persistence, selectors
    programme.ts      entities, visits, zones — all data-driven
    answers.ts        lazily-loaded Answer Library
    assist.ts         offline composer + optional AI client
    exports.ts        what each export sheet contains
    xlsx.ts           minimal .xlsx writer
  data/
    checks.json       374 check-points with ACSA mappings and external basis
    answers.json      11,179 researched options, loaded on demand
    priorFindings.json  the 23 March 2025 findings
    programme.json    entities, the 3-year cycle, zones
tests/                five suites — see tests/README.md
```

## Notes for whoever picks this up

- **The risk matrix is ACSA's, not a generic one.** `src/lib/risk.ts` implements
  B170 001M: severity A–E × likelihood 1–5, cells written likelihood-first
  (`3A`), banded Red / Amber / Green. Clause 4.6 states no other format is
  accepted by the SACAA Director of Civil Aviation. Do not "simplify" this to
  I/II/III. The unit test exists to stop exactly that.

- **A suggested rating is not a rating.** An issue button carries a suggested
  severity and likelihood, but the audit rates as a group exercise, so a finding
  carries `ratingConfirmed` and stays *Suggested — click to agree* until someone
  clicks the cell the group settled on. Only then does it reach the KPIs, the
  dashboard or the export. Keep it that way.

- **A blank status means not captured, never compliant.** This holds in the UI,
  in the dashboard and in every export.

- **Where ACSA states no threshold, the absence is the finding.** Do not fill it
  with an industry norm. The screen says so explicitly and the Answer Library
  raises it as an issue.

- **Site variants are real.** 33 checks carry a threshold stricter than the
  network default at FALE — monthly water sampling, yearly hydrant pressure
  test, vacuum-only circuit breakers. They are shown above the default, not in
  a tooltip.

- **Citation confidence is shown for a reason.** 36 of the researched external
  citations are at document level rather than clause level and are marked as
  such. A clause number nobody confirmed is worse in an audit report than none.

- **Zones, entities and visits are data.** `src/data/programme.json`. Adding an
  airport or the next visit is a data change. Zones are deliberately empty and
  field mode says so on screen rather than pretending the register's `area`
  categories are places.

- **Answer Library content is reviewed content.** Issue buttons seed findings
  with suggested severities, so they carry weight. A discipline lead signs off
  each set before it goes live (design document Q9).

## AI assistance

Two layers, deliberately separate.

**The composer needs no model.** *Compose from taps* turns the buttons the
auditor has pressed into a readable observation — deterministically, offline, on
the tablet. That is the everyday path and it must never depend on a network.

**On top sits an optional assistant** that drafts the observation, reads an ACSA
procedure back in plain English, and offers a second opinion on a rating. Every
result is a suggestion shown beside the record with **Use it** and **Discard**.
It never sets a status, never rates a finding, never marks anything captured,
and the rating opinion is printed as text — it does not move the cell.

Only the text of the check in front of the auditor is sent. Photographs, voice
notes and attachments never leave the device; `src/lib/assist.ts` has the
context builders, which are the single place that decides this.

The key stays server-side. Turning the assistant on means data leaves the
device, so it belongs with Q4 — if ACSA's governance requires data to stay in
their tenant, point `src/app/api/assist/route.ts` at an in-tenant endpoint
instead. Nothing in the UI changes.
