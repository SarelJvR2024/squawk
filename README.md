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
| Seed data | **Rev A2 all sites (06 Sep 2026): 324 check-points × 10 sites = 3,086**, 6 disciplines, 99 ACSA documents mapped, 33 site variants, **78 open 2025 findings** and 66 asset-system ratings across three airports |
| Answer Library (section 7) | **Complete — all 324 checks, re-keyed to Rev A2** |
| Capture workspace (section 8) | Three-pane workspace, answer chips, real voice and photo capture, progress, ⌘K, keyboard |
| Field inspection mode | Location-first, researched walkabout options with photo expectation, 44px targets, capture-first tray, ad-hoc findings, offline |
| Findings and rating | ACSA B170 001M matrix, agreed vs suggested ratings, root cause, owner, due date |
| Hazards | Consolidation from findings with the photographs behind each group, post-walk re-read, **both rating instruments live** — B170 001M for the safety event, ACSA's ERM (J050 001FW cl. 9.2.2) for the business risk |
| Closure | Carry-forward: this site's own 2025 findings plus anything an earlier visit left open, four-way verification, coverage guard, lifecycle |
| Audits | Every entity × visit in one place; open any, create new ones; the programme file seeds, the app extends |
| Dashboards | Airport, discipline and a real ten-site portfolio, with movement against 2025 |
| Visual review | All photographs and voice notes per discipline per airport, with an engineer feedback thread |
| AI assistance | Optional and advisory — off unless a key is set |
| Voice notes | Always recorded on the device; transcription and write-up are opt-in |
| Exports | Excel and CSV: register, findings, hazards, closure, evidence request, summary, photographs — plus the images as files |
| Pre-flight | `/preflight` — microphone, camera, storage, offline cache and the three services, checked on the device before anyone walks onto an apron |
| Shared record | Supabase, behind a team passphrase — every auditor's work in one audit, syncing by itself, and off entirely unless configured |
| Team captures | Share a device's work as one file and merge another auditor's; evidence is never overwritten |
| Word report templates | Not started — design document phase 4 |

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**, design tokens in `src/app/globals.css`
- **Zustand** + **IndexedDB** (`idb-keyval`) — local-first, offline capable
- **fflate** — for writing .xlsx and the photograph zip
- **@vercel/blob** — the record copy of every photograph. Added rather than
  calling the REST API by hand: the `x-api-version` contract is not documented,
  and guessing at an undocumented wire format is worse than a documented
  dependency. Nothing outside `src/app/api/photos/route.ts` imports it

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

Thirty-three suites, no framework, all plain `node`. See `tests/README.md` — and
check each suite's **exit status**, not the output: a `for` loop over them
reports the status of the loop, not of the suites.

```bash
node tests/risk-matrix.test.mjs          # the ACSA matrix, all 25 cells
node tests/capture.test.mjs              # capture is real, not fabricated
node tests/scope.test.mjs                # one audit per entity per visit
node tests/carryforward.test.mjs         # earlier visits reach the next one
node tests/review.test.mjs               # feedback never becomes the record
node tests/tablet.test.mjs               # the tablet is the device
node tests/portals.test.mjs              # checks reach the right view
node tests/reset.test.mjs                # starting again is safe
node tests/completion.test.mjs           # complete means every mode answered
node tests/audits.test.mjs               # any audit reachable, new ones creatable
node tests/voice.test.mjs                # a rewrite never overwrites what was said
node tests/sites.test.mjs                # ten sites, one register, right counts
node tests/photos.test.mjs               # stored, captioned, and only sent on purpose
node tests/hazards.test.mjs              # a finding is in at most one hazard
node tests/erm-matrix.test.mjs           # two instruments, and where they disagree
node tests/merge.test.mjs                # two auditors' work, combined without loss
node tests/checkscreen.test.mjs          # the brief, and that nothing was dropped
node tests/figures.test.mjs              # the prose still matches the register
node tests/assets.test.mjs               # a stand-in tag can never reach the portal
node tests/sharepoint.test.mjs           # nothing reaches the tenant by accident
node tests/vision.js                     # starts its own servers
node tests/record.js                     # starts its own server
node tests/shared.js                     # starts its own server and a fake Supabase
npm run build && npm start &             # then, against a running server:
BASE=http://localhost:3000 node tests/e2e.js          # 21 assertions
BASE=http://localhost:3000 node tests/robustness.js   # 38 assertions
BASE=http://localhost:3000 node tests/exports.js      # 32 assertions
BASE=http://localhost:3000 node tests/persite.js      # 25 assertions, four sites
BASE=http://localhost:3000 node tests/flow.js         # 49 assertions
BASE=http://localhost:3000 node tests/offline.js      # 18, with the network cut
BASE=http://localhost:3000 node tests/team.js         # 15, two devices, one audit
BASE=http://localhost:3000 node tests/preflight.js    # 15, on a device with no mic
BASE=http://localhost:3000 node tests/a11y.js         # 46, contrast and the keyboard
BASE_NO_KEY=... BASE_WITH_KEY=... node tests/ai.js    # 26 assertions
```

Run `tests/risk-matrix.test.mjs` after **any** edit to `src/lib/risk.ts`,
`tests/erm-matrix.test.mjs` after any edit to `src/lib/erm.ts`,
`tests/hazards.test.mjs` after any edit to the hazard register, `RecordActions`
or the assist parsers,
`tests/capture.test.mjs` after any edit to `src/lib/media.ts`,
`src/components/Capture.tsx`, `CheckDetail.tsx` or field mode, and
`tests/sites.test.mjs` after any edit to the register, the site table or
`programme.json`.

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
| `ASSIST_MODEL` | Overrides the model id. Defaults to `claude-opus-5` ($5 / $25 per million input / output tokens). Set it to `claude-sonnet-5` ($2 / $10) if the bill matters more than the judgement. |
| `ELEVENLABS_API_KEY` | Turns **Transcribe** on for voice notes. Without it a note is still recorded, kept and played back; its text is typed by hand. |
| `TRANSCRIBE_MODEL` | Overrides the transcription model id. Defaults to `scribe_v1`. |
| `TRANSCRIBE_LANGUAGE` | Pins transcription to one language. **Leave unset.** Auto-detection is what carries an auditor switching between English and Afrikaans inside one sentence. |
| `ASSIST_VISION` | `1` sends photographs to the model. **Unset or `0` and no image byte leaves**, whatever the client sends — the route strips them. Every AI affordance still works on captions alone. |
| `ASSIST_ENDPOINT` | Where the assist request goes. Defaults to the Anthropic API; point it at an in-tenant endpoint if ACSA's governance requires the data to stay there. Nothing in the UI changes. |
| `SUPABASE_URL` | Turns the **shared record** on, with the two below. The project URL, e.g. `https://xxxx.supabase.co`. All three or none: any one missing and the route reports itself unavailable and refuses to sync. |
| `SUPABASE_SECRET_KEY` | The **secret** key (`sb_secret_…`), never the publishable one. It stays on the server; no browser ever sees it, and the table has row-level security on with no policies so the publishable key can do nothing at all. |
| `SQUAWK_TEAM_PASSPHRASE` | What lets a device join the audit. Five or six unrelated words — somebody will read it to a colleague once and type it on a phone. It is the only thing between a URL and every site's findings and photographs. |
| `BLOB_TOKEN_VAR` | Names which `*_READ_WRITE_TOKEN` to use, for a project with more than one blob store. Only needed when two are set; see *Checking it is on*. |
| `NEXT_PUBLIC_GRAPH_CLIENT_ID` | Turns **Sync to the portal** on. The client id of an Entra ID app registration; a public value by design in this flow, **not a credential**. Without it the Sync button is not rendered at all and everything else is unchanged. |
| `NEXT_PUBLIC_GRAPH_TENANT` | The tenant to sign in against. Defaults to `organizations` (any work account). Pin it to TPJV's tenant id to stop anyone signing in with an unrelated Microsoft account. |
| `NEXT_PUBLIC_GRAPH_SITE` | The SharePoint site the portal lives at, e.g. `tpjv.sharepoint.com/sites/ACSA-Asset-Assurance`. |
| `SQUAWK_READ_WRITE_TOKEN` | Turns the **record copy** on: every photograph is also written to Vercel Blob, privately. This is the live deployment's name — the store `squawk-blob` was created with the custom prefix `SQUAWK`, and **Vercel generates the value; you never type it**. The route accepts any `*_READ_WRITE_TOKEN`, so the default `BLOB_READ_WRITE_TOKEN` works too, and `GET /api/photos` reports which name it found. Without one the app is unchanged — capture, caption, export, all local — and says on screen that photographs are on the device only. |

Setting any of these is a **data-governance decision, not a technical one** —
see *Photographs*, *Voice notes* and *AI assistance* below.

Fonts load from Google Fonts at runtime because the build environment this was
written in cannot reach `fonts.googleapis.com`. On Vercel you can switch
`src/app/layout.tsx` back to `next/font/google` for build-time optimisation.

## The asset register — a stand-in, for now

A finding says something is wrong. The **asset** says what it is wrong *with*,
and that is the half a maintenance planner needs to raise a job card:
*"corroded busbar"* is a photograph, *"corroded busbar, MV Switchboard 3B"* is
work.

**ACSA has not supplied the register.** `src/data/assets.sample.json` is a
stand-in so the linking, the screens and the export are built and tested for
the day it arrives — 1,506 rows across all ten sites, coherent with the
register's own disciplines and asset systems.

### Nothing invented reaches a system of record

An invented asset tag filed against a real finding, in a list ACSA reads, is
worse than no tag at all. Three guards, deliberately redundant:

| | |
|---|---|
| **The tag says so** | every id begins with `SAMPLE-`, so a tag pasted into an email or a screenshot announces itself |
| **The file says so** | `meta.source` is `"sample"`, and the asset panel carries a standing warning while it is |
| **The sync refuses** | `sendableAssets()` drops them, and the plan reports how many it withheld |

Links **do** reach the workbook, where a person is reading and the prefix tells
them what they are looking at. They do not reach the portal, where a machine
files them and nobody looks again.

### Replacing it

Overwrite `src/data/assets.sample.json` in the same shape and set `meta.source`
to `"acsa"`. **Nothing else changes** — the warning disappears, the sync starts
sending the tags, and the links captured against sample tags stay exactly where
they are (they are stored as tags, so they simply stop resolving and show as
*"not in the register"* until re-linked).

The register is fetched on first use rather than shipped in the initial bundle,
the same treatment the Answer Library gets and for the same reason.

## Sync to the portal

Squawk's deliverable is the workbook. The portal is where ACSA and TPJV keep
the same audit as a living list, and **Sync** writes this visit's capture
straight into it — as the signed-in auditor, not as a service account, so the
portal's own history says who did it.

### What it writes

| Portal | Gets |
|---|---|
| **Check-points** list | one row per check somebody actually answered, keyed on `Title` = the check-point id |
| **Findings** list | one row per **hazard**, keyed on `Title`, plus a status and progress update on every prior finding verified this visit |
| **Evidence** library | every photograph, into `Evidence/<Site name> <ICAO>/`, named by its own reference |

`Title` is the join in both directions. That is the register's own instruction:

> `checkpoints[].id` is the portal key (Check-points list, Title column);
> `priorFindings2025[].portalId` is the Findings list Title. Keep both
> unchanged in Squawk so results can sync back.

**Hazards, not findings.** Only a hazard carries the ERM rating, and the
portal rates on ERM. That is also the model: the same missing diesel cut-out
fuse was PF-02 for Electrical and PF-21 for Process Safety in March 2025 — two
rows, two ratings, one fuse. The hazard is the event, and it is what persists
year on year. Syncing findings would put the duplication back. A finding in no
hazard is counted in the plan and **not** written, so it cannot look synced
when it is not.

### What it refuses to write

- **A rating nobody agreed.** The hazard goes across; the severity, likelihood,
  priority and tolerance are left null unless `ermConfirmed`. A suggestion is
  indistinguishable from a judgement once it is in a list the Audit & Risk
  Committee reads.
- **A blank compliance.** A check nobody answered is skipped entirely. Writing
  `""` turns "we did not get to it" into "we looked and it was fine".
- **A second copy of anything.** Every row is matched on `Title` and PATCHed if
  it is there. A hazard remembers the `portalId` it was given on its first
  successful create, so the next visit updates it.

### Why it asks you to look first

Sign in → read the portal → **read the plan** → then a button that writes.
Until that last button, the app has issued nothing but `GET`s. The plan shows
every row that would be added or changed, every field that has no column to go
in, and everything deliberately left out with the reason.

### The columns are read at run time, never hardcoded

SharePoint's internal column names are not its display names — "Risk priority"
can be `field_7` — and writing to a guessed name returns `200 OK` having stored
nothing, which is the worst failure available because it looks like it worked.
So the internal names are read off the lists on every run and matched by
display name. A field with no column is reported in the plan and skipped.

### Setting it up (Sarel)

One Entra ID app registration in TPJV's tenant:

1. **App registrations → New registration.** Any name.
2. **Redirect URI: Single-page application (SPA)** — this matters, SPA is what
   enables PKCE without a secret and the CORS the token call needs. Add
   `https://<your-domain>/graph-callback`, and the same on
   `http://localhost:3000` if you want it locally.
3. **API permissions →** Microsoft Graph → **Delegated** → `Sites.ReadWrite.All`.
   Grant admin consent.
4. **Do not create a client secret.** There is nowhere to put one and nothing
   wants it.
5. Set `NEXT_PUBLIC_GRAPH_CLIENT_ID`, `NEXT_PUBLIC_GRAPH_SITE` and (recommended)
   `NEXT_PUBLIC_GRAPH_TENANT` in Vercel, and redeploy.

**No credential is ever typed into Squawk and none is stored in it.** The
access token lives in the tab's memory for as long as the tab is open and is
never written to `localStorage`, IndexedDB or the store — a reload signs you
out. That is deliberate: this is a tablet carried around a national key point,
and a bearer token for the evidence library on it is worth more than the
tablet. Signing in again is one button, once, at the end of an audit.

The scope is **delegated**: the sync can do exactly what the signed-in auditor
could do by hand in a browser, and Graph enforces that, not this code.

## Project structure

```
src/
  app/
    (app)/            capture · field · review · findings · hazards · closure · dashboard
    api/assist/       the AI endpoint — text out, never audio or images
    api/transcribe/   voice-note transcription — the only route audio leaves by
  lib/
    register.ts       the register and the 2025 data, entity-scoped, no React
    sites.ts          which checks apply where, and each site's portal ids
    media.ts          recording, photo downscaling, EXIF date, the blob store
    photos.ts         what a photograph is called, and the export zip
    sync.ts           the queue that gets photographs to the record store
    globals.css       design tokens for both themes
    manifest.ts       the web manifest — installable, starts at /capture
  components/
    AppShell.tsx      header, nav, cycle strip, command palette, role switch
    CheckDetail.tsx   the check screen — brief left, capture right, answer pinned
    OfflineReady.tsx  registers the worker, warms the two lazy payloads
    RootCauseAdvice.tsx  candidate causes and, more usefully, what to ask
    HazardAdvice.tsx  the event a finding exposes, named at the check
    RecordActions.tsx the rating and treatment block — findings AND hazards
    ExportPanel.tsx   the export sheet
    TeamMerge.tsx     share a device's captures, merge another's
    ui/               primitives and icons
  lib/
    types.ts          domain model
    merge.ts          combining two auditors' work into one audit
    shared.ts         the shared record, from the device's side
    risk.ts           ACSA B170 001M matrix — Red / Amber / Green
    erm.ts            ACSA's enterprise risk matrix — declared, and empty
    store.ts          state, persistence, selectors
    programme.ts      entities, visits, zones — all data-driven
    answers.ts        lazily-loaded Answer Library
    assist.ts         offline composer + optional AI client
    exports.ts        what each export sheet contains
    xlsx.ts           minimal .xlsx writer
  data/
    checks.json       324 check-points with ACSA mappings and external basis
    answers.json      9,836 researched options, loaded on demand
    priorFindings.json  the 23 March 2025 findings
    programme.json    entities, the 3-year cycle, zones
tests/                thirty-three suites — see tests/README.md
```

## Notes for whoever picks this up

- **The risk matrix is ACSA's, not a generic one.** `src/lib/risk.ts` implements
  B170 001M: severity A–E × likelihood 1–5, banded Red / Amber / Green. Clause
  4.6 states no other format is accepted by the SACAA Director of Civil
  Aviation. Do not "simplify" this to I/II/III. The unit test exists to stop
  exactly that.

- **Cells are printed severity-first (`B4`), and the band does not come from
  that string.** B170 001M's own tables write the cell likelihood-first; the
  portal writes no combined cell at all, carrying severity and likelihood as
  two separate fields; and the generated dashboard and the Cluster 3 report
  print it severity-first. Sarel settled it: follow the register and the
  dashboard, so the app prints what the report's reader will see.

  The band is looked up on an internal, likelihood-first key that is never
  displayed. That decoupling is the point: `RED` and `AMBER` are keyed on a
  cell string, so flipping the printed form without it would have made every
  lookup miss and banded all 25 cells Green — the whole instrument silently
  inverted, with no error anywhere. `risk-matrix.test.mjs` asserts the printed
  form, the bands, and the 6 / 12 / 7 split independently, so the notation can
  change again without the matrix being able to move.

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

- **Capture must be real, and the test says so.** Voice and photo were
  fabricated until `src/lib/media.ts` existed: the mic button wrote a fixed
  duration and a transcript lifted from the Answer Library straight into the
  auditor's observation. Audio and images now come from `getUserMedia` /
  `MediaRecorder` and the camera, blobs live under their own IndexedDB keys
  (never inside the persisted store, which rewrites on every keystroke), and a
  transcript is only ever what the dictation engine heard or the auditor typed.
  An empty transcript is a correct answer. `tests/capture.test.mjs` exists to
  stop any of that being quietly undone.

- **An audit belongs to one entity on one visit.** State is keyed by
  `${entity}/${visit}` (`src/lib/store.ts`). Screens read through
  `useResponses` / `useVerifications` / `useCaptures` / `useVisitFindings`,
  never the raw slices — a raw read shows whatever scope was last selected.
  Anything that names a site or a visit follows the scope: owners, the cycle
  strip, the closure lifecycle, export filenames. `tests/scope.test.mjs`
  enforces it.

- **Findings carry forward, and that is a mechanism now.** `src/lib/carryforward.ts`
  merges the seeded 2025 findings with anything raised at this entity on an
  earlier visit that nobody closed, and closure verifies both the same four
  ways. Marking one Closed closes the finding itself, so it stops carrying. A
  rating the group never agreed carries as "Not audited" — surviving a visit
  must not turn a suggestion into a decision.

- **A review comment is not the record.** `/review` shows every photograph and
  voice note per discipline for the airport in view, so a discipline lead can
  answer evidence without knowing which of 324 checks carries it. Comments
  there are never merged into the observation or the finding — an engineer who
  thinks their aside might be quoted in an ACSA report writes a more careful,
  less useful comment, and a report that absorbed one would be misattributing a
  finding. `tests/review.test.mjs` enforces it. ACSA's role is read-only
  everywhere else but can comment here, because their engineers answering a
  photograph is the point of the screen.

- **Every figure in the prose is derived from the register, and checked.** Rev
  A2 shrank the check-list from 374 rows to 324; the app followed it, because
  every count on screen is computed. The words did not. This file, the test
  notes and a dozen source headers went on quoting a register of 374, a library
  of 11,179, a desk-and-field split of 365 and 314, an overlap of 305, and 89
  carrying a question to ask. Not one was true. A stale number in a
  comment is not a typo here — the comments are how the next person learns why
  something is the way it is, and a reader has no way to tell a stale figure
  from a deliberate one. `tests/figures.test.mjs` now works the numbers out from
  the data and reads every markdown file and source comment for a figure written
  next to "check-points", "checks" or "options"; anything that disagrees fails,
  naming the file and the line.

- **The shared record is a sync target, never the source of truth.** Each
  device captures into its own IndexedDB whether or not Supabase answers, and a
  deployment with nothing configured behaves exactly like the Squawk that
  existed before it — the file merge below is still there. What the record adds
  is that a team is working *one* audit rather than several.

  **No browser ever talks to Supabase.** The obvious build hands the publishable
  key to the client and leans on row-level security; that is right when every
  user signs in and a policy can key on who they are. Access here is a shared
  team passphrase, so there is no per-user identity for a policy to test — and a
  publishable key in a browser plus a permissive policy is a URL away from every
  finding and photograph in the programme. Instead the secret key lives in
  `/api/sync`, the table has RLS on with **no policies at all**, and the
  passphrase is checked server-side where a client cannot get round it. Same
  reasoning as `ASSIST_VISION`.

  It never falls open: any of the three variables missing and the route reports
  itself unavailable and refuses. The merge rules are not reimplemented — rows
  are shaped into a bundle and handed to the same `src/lib/merge.ts` the export
  sheet uses, so evidence unions and a contested record resolves identically
  whether it arrived over the wire or on a memory stick. `tests/shared.js` drives
  two devices against a Supabase it can switch off, and most of its 31
  assertions are the negative ones.

- **Two auditors, one audit.** An ACSA audit is done by a team and the audit
  lives in one device's IndexedDB, so until the shared record exists a day's
  work comes back together by hand: each auditor shares a `.squawk.json` bundle
  from the export sheet, and one device merges the rest. The rules are in
  `src/lib/merge.ts` and three of them are load-bearing. **A bundle from another
  airport or another visit is refused, not warned about** — Cape Town's captures
  inside King Shaka's visit is a mistake nobody catches until the report is with
  ACSA. **Where both devices changed the same record the newer wins and the
  report names it**, because a merge that quietly drops somebody's afternoon is
  worse than one that refuses. And **evidence is unioned, never overwritten**: a
  photograph on the losing side of a last-write-wins is still a photograph of a
  defect, so two auditors who photographed the same thing end up with both.

  Photographs travel as references. A bundle carrying image bytes would run to
  hundreds of megabytes and could not be sent, so the records travel and the
  images are read from the record store where the upload queue has already put
  them — and both the share button and the merge report say how many have not
  got there yet, because finding that out at report time is a bad afternoon.
  `updatedAt` on every record is what makes any of it possible; store version 13
  back-fills it from the best timestamp each record already carried.
  `tests/merge.test.mjs` runs the real module, `tests/team.js` drives two
  browser contexts as two tablets.

- **It opens with no signal, and that is tested by cutting the network.**
  Everything else here about not losing captured work — IndexedDB, photographs
  surviving a reload, the upload queue waiting for signal — assumed the app had
  already loaded. `public/sw.js` is what earns that assumption: an auditor
  airside who closes the tab, or whose phone drops the page from memory, still
  opens Squawk and reaches everything they captured. Navigations are served from
  cache and revalidated behind (a stale shell is not dangerous — the audit is in
  IndexedDB, not the HTML — and nobody mid-walkabout should wait on a network
  timeout to open a screen); `/_next/static/*` is cache-first because the
  filenames are content-hashed. `src/app/manifest.ts` makes it installable, and
  it starts at `/capture` rather than `/`, because `/` is a redirect and a
  launch that begins with a redirect begins with a network request.

  Four things are deliberately never cached, and each would be a defect rather
  than a missing optimisation: `/api/*` (a cached availability probe would tell
  an auditor a model is configured on a deployment where it is not),
  `/graph-callback` (it carries an authorisation code and a state in its URL),
  anything cross-origin (the photographs are **not** copied into a second store
  as a side effect of a routing rule), and the redirecting root. The two lazy
  payloads — the Answer Library and the asset register — are fetched
  deliberately after load rather than on first use, because "offline-safe" and
  "fetched when someone happens to open the right panel" are not the same thing.
  `tests/offline.js` asserts all of it with the network actually switched off.

- **The check screen is a brief, not a dossier.** The three things an auditor
  opens their mouth with — the question to ask, the standard to audit against,
  and a plain reading of what is actually being checked — are the top of the
  reference column, in that order, with this site's stricter threshold inside
  the standard rather than beside it. Everything else the register carries for
  a check (ACSA's procedure wording, the records it names, the evidence it
  expects, the external instrument, the walkabout line, any conflict between
  documents) sits behind tabs in a bounded, scrolling panel below them: kept in
  full, one tap away, and no longer deciding where the question is on the
  screen. The four compliance buttons are in the sticky header, so reading the
  left column no longer scrolls the answer off the right. And the answer box,
  the voice note, the camera and Save are pinned together at the foot of the
  screen at every scroll position — on a phone they used to be below six groups
  of chips. `tests/checkscreen.test.mjs` asserts both the new shape and, field
  by field, that nothing was dropped to get it.

- **The tablet is the device, not a narrow desktop.** The touch floor lives in
  one `@media (pointer: coarse)` block in `globals.css` — 44px targets, 16px
  fields so iOS does not zoom the page in mid-capture — rather than a second
  set of components; a mouse sees none of it. The check screen goes two-pane at
  `lg`, because an iPad in landscape is 1180px and was stacking the entire
  reference column above the controls, and when it does stack capture is
  ordered first. `tests/tablet.test.mjs` enforces it.

- **A check appears where it can be answered.** `vtype` on every register row
  declares Evidence / Question / Site Physical Verification, and
  `src/lib/verification.ts` is the only place that reads it. Capture lists the
  315 a desk can progress, Field lists the 299 that need the asset seen, they
  overlap on 290, and nothing is orphaned. The overlap is not duplication —
  reading the maintenance record and looking at the pump are two acts on one
  requirement — but a check in a view that cannot progress it is.
  `tests/portals.test.mjs` parses the register independently to check this.

- **Complete means every declared mode is answered.** A response carries a desk
  half and a field half, each stamped with who and when; `captured` is derived
  from whether every mode the check's `vtype` declares is covered, and is never
  set directly. Capture counts the desk half, Field counts the field half, and
  only the dashboard, the progress ring and the export speak of "complete". The
  export reports Desk done / Site seen / Complete as separate columns — one
  "Captured" column would tell ACSA a site check happened when it had not.

- **The register is Rev A2, and the rebase is reproducible.** `src/data/source/`
  holds the register as issued; `scripts/rebase-to-revA2.mjs` transforms it into
  `checks.json`, `priorFindings.json` and a re-keyed `answers.json`, and refuses
  to write if any check would lose its `vtype` or its Answer Library options.
  Rev A2 carries twelve fields where Squawk's `Check` carries twenty-five — the
  ACSA reference block, citation confidence, site variants, walkabout text and
  `vtype` are researched content this project produced and the script preserves
  them by id. 303 ids are unchanged; the 21 ME Management items are matched to
  their new Process Safety & Risk numbers **by requirement text, not position**,
  because the renumbering is not positional (KSIA-MEM-002 is KSIA-PSR-029).

- **Answer Library content is reviewed content.** Issue buttons seed findings
  with suggested severities, so they carry weight. A discipline lead signs off
  each set before it goes live (design document Q9).

## Ten sites, one register

Rev A2 covers **3,086 check-points across ten sites**, but it is not ten
registers. Every site uses the same 324-item register and the same check-point
numbers — `KSIA-ELE-005`, `ORTIA-ELE-005` and `CO-ELE-005` are the same
requirement at three sites, which is the point: results compare across the
group. Where a check-point does not apply its number is simply not used there
(gaps, no renumbering).

Squawk therefore holds the register **once** and derives the rest:
`portalIdFor()` gives the site-prefixed id — the portal's sync key and the
number an auditor reads out — and `checksFor()` gives that site's applicable
subset. Storing 3,086 rows instead would mean ten copies of every requirement,
threshold and walkabout instruction, which drift apart the first time one is
corrected and nobody remembers there are nine others.

| Class | Sites | Checklist | Removed |
|---|---|---|---|
| International | King Shaka, O.R. Tambo, Cape Town | **324** | — |
| Regional | Bram Fischer, King Phalo, Chief Dawid Stuurman, George, Kimberley, Upington | **319** | Passenger boarding bridges (5) |
| Corporate | ACSA Corporate Office | **200** | All airfield work (124) — AGL, ILS, AWOS, X-ray, PBBs, fuel, BHS, water treatment, gas hot water, all Civil, fuel farm MHI |

Applicability is a TPJV assumption for the register, confirmed by the discipline
leads before each site audit; **nothing is removed from the contract scope**.
Where a system exists in the register but not at a particular site — a hydrant
fuel system, a water treatment plant at a small regional — the check stays and
the auditor records N/A. Only whole asset systems that cannot exist at that
class of site are removed.

`tests/sites.test.mjs` recomputes all ten counts and the 3,086 total from the
register itself rather than trusting the numbers above.

## 2025 findings, per airport

The portal's **78 open 2025 findings** are carried in and seeded as outstanding
items for the next visit to verify: King Shaka 15 (March 2025), O.R. Tambo 33
(May 2025), Cape Town 30 (March 2025). The other seven sites are baseline audits
and correctly carry none.

- `portalId` (`ORTIA-ELE-P01`) is the Title of the item in ACSA's Findings list
  and is the key a closure syncs back on. It is never regenerated or renumbered.
- **19 of the 78 name a building or an area rather than a register asset
  system** — Cargo Building, Parkade Bridges, Medical Surveillance Records and
  the rest. They are carried and shown with the words the 2025 report used, and
  the discipline lead allocates them in the field. Dropping them for not joining
  to a check would lose real open findings.
- A **prior rating** is a property of the site, not of a requirement shared by
  ten of them. King Shaka carries the 22 asset-system ratings published in March
  2025; O.R. Tambo's and Cape Town's are derived from their own findings and are
  labelled as derived, because a derived rating must not be shown as though ACSA
  had signed it off.

There used to be `pf` and `pfq` columns on the register row itself. They were
King Shaka's numbers, so a Cape Town check announced a King Shaka finding, and
seven never-audited sites announced one too. They are gone.

## Hazards

The findings register answers *what did we see?*. The hazard register at
`/hazards` answers *what could happen?*, and they are not the same list.

A finding is an observation — a missing record, a worn coupler. A hazard is the
event the failed control was protecting against, and that is what carries a
severity. Rate the findings instead and the register that reaches ACSA is a risk
profile made of paperwork: no gaseous suppression in a substation, a
fire-detection gap in the same room and an unsigned maintenance record for the
panel in it score as three medium paperwork risks where there is one red
physical one. It reads perfectly plausible and it is wrong.

So hazards are built by **consolidating** findings, and one hazard commonly
stands behind several. The two counts are reported separately everywhere and
**must never be added together**.

Three things on that screen are worth knowing:

- **Every consolidation proposal shows the photographs behind it.** This is the
  highest-value thing on the page. Two disciplines write the same physical
  defect up in their own language, and the photographs are what settle whether
  the write-ups are one thing — a reviewer can see it at a glance without
  opening either finding.
- **A finding belongs to at most one hazard.** The prompt says so and
  `parseGroups` enforces it, dropping a repeat claim and refusing a group left
  with nothing. A finding in two hazards is double-counted in every total
  downstream.
- **The post-walk re-read** looks at the hazard again after the site walk. It
  may raise a new hazard from something visible in a photograph; it may not move
  a likelihood on the strength of one. Likelihood on this scale is occurrence
  history, and a photograph shows condition.

Nothing is applied without a tap. A proposal becomes a hazard when somebody
accepts it, and the rating stays *unrated* — counting in no KPI, no dashboard
and no export column — until somebody clicks a cell on the matrix.

### The ERM matrix — ACSA's second instrument

A hazard carries **two** ratings, and they are different instruments measuring
different things.

**B170 001M** (`src/lib/risk.ts`) rates a *safety hazard* in the format the
SACAA Director of Civil Aviation accepts: severity A–E by likelihood 1–5, banded
Red / Amber / Green.

**The ERM matrix** (`src/lib/erm.ts`) rates *business risk* and decides what
enters ACSA's Combined Assurance Coverage Plan. J050 001FW *Combined Assurance
Framework*, Version 1, 19 October 2017, clause 9.2.2: consequence 5–1 by
likelihood 1–5, giving priority **I / II / III** — Unacceptable, Tolerable,
Acceptable. Clause 9.1.2 is why it is carried at all: *risks rated as I and II
as a minimum shall be included in the Combined Assurance Coverage Plan*.

Three things about the pair that are easy to get wrong, and expensive:

- **The consequence axis runs the other way.** B170 goes A (Catastrophic) → E
  (Negligible); ERM goes 5 (Catastrophic) → 1 (Minor). Anyone tidying the two
  into one shape inverts this matrix silently and the priorities stay
  plausible-looking while being exactly wrong.
- **The likelihood axes are not the same question.** B170's is *occurrence
  history* — "has occurred rarely". ERM's is a *probability band* — "Likely,
  25–54%". A hazard can sit at B170 level 3 and ERM level 2 with neither being
  wrong. So the app will carry a B170 rating across as a **starting point**, and
  it marks the likelihood as an assumption on screen and in the export until
  somebody looks at it again and taps a cell.
- **ERM is markedly harsher.** 10 / 9 / 6 against B170's 6 / 12 / 7.

Laid on top of each other the two disagree on five cells — **1B, 2A, 3B, 4C,
5D**, ERM harsher in every one. That is not a defect in either. It is also the
answer to a question this project escalated: the Rev A2 register's matrix
disagreed with B170 001M on those exact five cells, which looked like a
transcription error. It was not. **The register carries the ERM matrix**, and
the real error is that ACSA's Compliance Check-list Template cites B170 001M in
its header while printing the ERM grid underneath. Worth telling Prince; nothing
in this repo needs changing for it.

`tests/erm-matrix.test.mjs` transcribes the grid independently from the
framework and asserts all 25 cells, the 10/9/6 split, the axis direction, the
percentage bands, clause 9.1.2, and the five disagreements — computed from both
grids rather than remembered, so the day either is edited the claim is
re-checked. Run it after any edit to `erm.ts` or `risk.ts`.

## Photographs

### One name, in every place

Every photograph is called `KSIA-ELE-001_P01` — the check-point's portal id and
a sequence number — and that one string is:

- the filename in the export zip (`photographs/KSIA-ELE-001_P01.jpg`)
- the object name in the record store (`FALE/2026-09/KSIA-ELE-001_P01.jpg`)
- the **File** column of the Photographs sheet, and *Photograph files* on every
  finding
- the anchor a Word report will place the image at

So somebody holding the workbook can find the photograph without asking anybody.

**Sequence numbers are never reused.** Delete `_P01` and the next photograph is
`_P03`. A reference that silently came to mean a different image would let a
finding evidenced by `_P02` in March be evidenced by a different photograph in
September, with nothing on screen or in the workbook saying so. A gap in the
numbering is the cheap price.

### Four places a photograph lives

| | Why | For how long |
|---|---|---|
| **The tablet** | The working copy — captioned and looked at on site, offline | The audit. **Never deleted because a record copy exists** |
| **The record store** | The copy that survives the device | Retention, still undecided |
| **The export zip** | Handed over, attached to an email, filed | With the deliverable |
| **The Word report** | Evidence beside the finding it supports | Phase 4, not built |

### Captions

**Every photograph is captioned, or it is incomplete.** A photograph with no
caption is a JPEG in a browser's storage that nobody can search, report on or
recognise in six months — the workbook row would carry a filename and a
timestamp. So an uncaptioned photograph is shown in the same warn treatment a
finding with no owner gets, the export writes **NO CAPTION** rather than a blank
cell that reads as "nothing to say", and the export panel counts how many are
outstanding before you produce the workbook.

The caption carries its **source**. One an auditor wrote and one the assistant
proposed and a person accepted are not the same evidence, and the export says
which. Typing over a proposal hands authorship back.

### On the device

**Images never enter the persisted store.** Zustand's `persist` writes the whole
store to one key on every change; base64 images in it would re-serialise
megabytes per keystroke. The store holds metadata and a 240px thumbnail; the
full image lives under its own key in the media store. Deleting a photograph
deletes the stored image too.

**Every image is downscaled before it is stored** — longest edge 1600px, JPEG
q0.82. A phone photograph is 4–12 MB as taken and 300–600 KB stored, still far
more than enough to read a serial plate. The canvas re-encode strips EXIF, which
is mostly welcome; but *when* a photograph was taken is audit evidence, so
`DateTimeOriginal` is read off the original first and kept.

**The app asks the browser not to evict the audit**
(`navigator.storage.persist()`) and reports the answer rather than assuming it.
Safari clears script-writable storage for a site not visited for about a week
unless it is added to the home screen; Chrome evicts under pressure. If the
browser refuses, the export panel says so in words.

**The export panel shows what the evidence costs the tablet** and warns above
~200 MB. A device running out of storage mid-audit must fail visibly: the
browser's own quota error is opaque and arrives while somebody is on an apron.

### The record copy — `SQUAWK_READ_WRITE_TOKEN`

A tablet is a capture device, not a records system. Browser storage is evicted
under pressure, cleared with site data, and gone with the device — and a finding
challenged in six months is evidenced by the photograph or by nothing.

- Every photograph is queued the moment it is captured and uploaded when there
  is a network. The queue is **derived from the records**, not held beside them:
  anything with a stored image and no `cloudUrl` is outstanding, by definition,
  so it survives a reload, a crashed tab and a flat battery.
- **Create the store with Access: Private.** The dashboard defaults the radio to
  Public — *"anyone with the URL can access them"* — and these are photographs
  of a national key point: a public blob URL is a URL anybody who ever sees it
  can keep, permanently, with no authentication. The route uploads with
  `access: "private"`, so a Public store refuses and the error says exactly that
  rather than passing through an SDK message. It deliberately does **not** retry
  as public: whether site photographs sit on an open URL is not a decision a
  retry makes. Reading one back needs a signed URL — a route to build when
  somebody needs it; the local copy serves the app today.
- **The token's name does not matter, and that is deliberate.** Creating a store
  offers a custom environment-variable prefix; the live store uses `SQUAWK`, so
  the variable is `SQUAWK_READ_WRITE_TOKEN`. Reading only the default name would
  make a correctly created store look **identical to no store at all** — nothing
  uploading, nothing erroring, the header quietly saying "on device only"
  forever, and somebody believing the photographs were being kept. Any
  `*_READ_WRITE_TOKEN` is taken, and `GET /api/photos` names the one it used.
- **Region is fixed at creation.** `squawk-blob` is in `iad1` (Washington,
  D.C.). ACSA is a South African state-owned entity and these are photographs of
  national key points, so where they physically rest belongs with whoever owns
  the data-governance answer. It cannot be changed later, only recreated.
- Uploads run **one at a time**. Eight in parallel on airport wifi is eight
  timeouts.
- The header says when photographs are still only on the device; each row says
  which of them. Silent once everything is stored.
- Without the token none of this appears and the audit is unchanged.

> Vercel Blob was chosen over SharePoint or an in-tenant Azure account. It is
> the least new infrastructure, and it puts ACSA site photographs with a third
> party neither ACSA nor TPJV governs. That is the Q4 question and it was
> decided knowingly; if ACSA's governance requires otherwise,
> `src/app/api/photos/route.ts` is the single place that changes.

### Getting the images out

**Images** in the export panel produces a zip of the photographs, separate from
the workbook on purpose: the index is a few kilobytes and the evidence is not,
so an auditor can send a discipline lead the workbook without a hundred
megabytes attached and fetch the images when somebody asks. The zip carries a
`MANIFEST.csv` so it still reads on its own once separated from the workbook —
which, being a separate download, it will be.

### Turning the shared record on

One step only Sarel can do, once:

1. Create a Supabase project (free tier is enough for an audit).
2. Open the **SQL editor** and run `supabase/0001_shared_record.sql` from this
   repo, whole. It creates the table, the index, turns row-level security on
   with no policies, and adds the conditional-upsert function. It is idempotent.
3. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `SQUAWK_TEAM_PASSPHRASE` in
   Vercel — none of them `NEXT_PUBLIC_` — and redeploy.
4. On each auditor's device: **Export → Shared record → the passphrase → Join the
   audit.** Once per device, and it is remembered.

`/preflight` says which of those has happened on the device in front of you.
Until all of it has, the app is unchanged and captures are handed over as a file
from the same sheet.

### Checking it is on

Three probes, in a browser, on whichever deployment you are testing. None ever
returns a key's value:

```
/api/photos      → {"available":true,"via":"SQUAWK_READ_WRITE_TOKEN"}
/api/assist      → {"available":true,"model":"claude-opus-5","vision":false}
/api/transcribe  → {"available":true,"model":"scribe_v1"}
/api/sync        → {"available":true}
```

`available: false` means the variable did not reach the *running* deployment —
usually because it was added after the last build. Redeploy. On `/api/photos`,
`via` is how you tell a working prefix from one being silently ignored.

`available: true` only means the token is present. If the store was created
Public, this probe still passes and the first upload fails with a message
telling you to recreate it.

**`ambiguous: true` means two stores and no choice.** A project that has had two
blob stores has two tokens, and the second one does not replace the first — it
sits alongside it. When more than one `*_READ_WRITE_TOKEN` is set and
`BLOB_TOKEN_VAR` does not say which to use, **the route uploads nothing** and
`reason` says so.

**`BLOB_READ_WRITE_TOKEN` gets no preference for being the default name.** It is
usually the *older* connection — the store that existed before anyone chose a
custom prefix — so preferring it is how a deployment keeps quietly writing to the
store it replaced. Giving the newer store a prefix is the deliberate act; being
the default is not. That is deliberate: picking one by any
tidy rule is wrong half the time, and a record copy in a store nobody
remembers is a record nobody will ever look in. The photograph stays on the
device regardless.

Two ways to resolve it, either is fine:

- Set `BLOB_TOKEN_VAR` to the name of the one you mean, and keep both. This is
  the safer of the two: it is reversible, and it does not depend on working out
  which store a token belongs to.
- Or delete the tokens of the stores you replaced. `candidates` lists every name
  the route can see, so you know what is there to remove.

This is not hypothetical — it is what this deployment did. `squawk-blob` was
created Private with the prefix `SQUAWK`, giving `SQUAWK_READ_WRITE_TOKEN`, but
`/api/photos` on production answered `via: "BLOB_READ_WRITE_TOKEN"` — a second,
earlier token still present and preferred by the old rule. Photographs were
being offered to a store nobody had chosen.

### Retention — still undecided

Nobody has said how long photographs are kept, where the master lives once an
audit closes, who the custodian is, or what happens at device handover. The
record store makes the question answerable; it does not answer it.

### Vision — `ASSIST_VISION`

Whether site photographs reach the model is a separate decision from whether
they reach the record store, and it defaults to **off**:

- With the flag unset the route drops images from the request before it is
  assembled — **the server is the enforcement point**, and no client change gets
  round it.
- The affordance still works with vision off; it runs on captions alone, which
  is the other reason an uncaptioned photograph is treated as incomplete.
- The screen says which, in a line rather than a tooltip: *"Photographs are sent
  to the assistant for this step"* or *"Photograph captions are sent; the images
  themselves are not."*
- At most **8 images and 4 MB** per request, **refused** with a readable message
  rather than truncated — an answer about eight of nine photographs says nothing
  about the ninth.

`tests/vision.js` proves this against a real forwarded request body rather than
by reading the code.

## Voice notes

**A note is recorded, stored and played back on the device, always.** That needs
no key, no service and no network, and nothing in the app may make it
conditional. The audio is the evidence; everything below is convenience on top
of it.

Three separate steps turn a spoken note into written text, and each is a
separate decision by the person holding the tablet:

| Step | What it does | Default |
|---|---|---|
| **Live text** | The browser writes words on screen as you speak. This is *not* on-device — Chrome streams the audio to Google's speech service to do it. English-only, and absent on iPadOS Safari. | **Off.** A switch in the shortcuts panel, and the app says on screen while it is running. |
| **Transcribe** | Sends *that one recording* to the transcription service and stores what came back, word for word. Handles English and Afrikaans in the same sentence, which the browser cannot. | Only where `ELEVENLABS_API_KEY` is set, and only on a tap. Never on save, never in the background. |
| **Write it up** | Asks the model to turn the verbatim transcript into the written observation for that check — the wording an auditor would have typed, not a literal reading of a ramble. | Only where a model is configured, and only on a tap. |

**The verbatim transcript is kept after the rewrite, next to the audio.** A
tidied sentence that quietly dropped one of three items, or turned 40mm into
40cm, is the exact failure this application exists to prevent, and the only way
to catch it is to still have the original. The rewrite lives in its own field,
is labelled *suggested wording — not in the record*, and reaches the observation
only when someone presses **Use it** — where it is appended to what the auditor
already typed, not substituted for it.

Before Transcribe existed, dictation started itself on every recording and said
so nowhere. Store version 7 turns it off for anyone upgrading mid-audit;
captured audio and existing transcripts are untouched.

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

It also writes up a transcribed voice note, proposes a caption for a
photograph, and proposes **root causes** — where the useful output is not the
cause but the *question to put to the responsible person*, because a root cause
is something they know and the auditor does not. `askInstead` is rendered at
least as prominently as the cause, and picking a cause is the only thing
`RootCauseAdvice` can change; the questions are for the room and are never
written into the record.

Three more tasks serve the hazard register. **`hazard`** names the event a
finding exposes, from the check screen, while the auditor is still in front of
the asset. **`consolidate`** groups the findings that describe one physical
thing. **`reassess`** re-reads a hazard after the site walk. All three propose;
none of them rates, and `reassess` is told in the prompt that a photograph may
raise a new hazard but may **not** raise a likelihood on its own — likelihood on
this scale is occurrence history, and a photograph cannot show that. Without
that sentence a model looks at a rusty panel and pushes the likelihood up, which
is the wrong reasoning applied to the right evidence.

What is sent: the check in front of the auditor, a transcript for a write-up,
and — **only when `ASSIST_VISION` is on** — the photographs being asked about.
Audio is never sent. `src/lib/assist.ts` has the context builders, which are the
single place that decides this.

Images sent for consolidation are **labelled** — each one is preceded by a line
naming the photograph and the finding it hangs off. Unlabelled, eight
photographs are eight pictures of an airport and the model cannot say *which*
two findings its photographs showed to be one thing; an attribution a reviewer
cannot check is worse than no grouping at all.

Every key stays server-side. Five things can put data somewhere other than the
tablet — live text, Transcribe, the assistant, photographs through the
assistant, and the record copy — and all five are off until someone turns them
on. That is Q4 and it is not settled. If
ACSA's governance requires data to stay in their tenant, point
`src/app/api/assist/route.ts` and `src/app/api/transcribe/route.ts` at
in-tenant endpoints; nothing in the UI changes.

## Reading it in the sun

Squawk is read on a tablet held at arm's length on an apron at midday. That is
the accessibility problem here, and it is not a minority one: low-contrast grey
in direct sun is invisible to everybody, and roughly one man in twelve cannot
separate the red dot from the green one.

Four light-theme tokens were below WCAG AA when this was measured — `--ink-4` at
**2.34:1** and, in dark, **3.23:1**, both used at 9 to 11.5px. The ink ladder is
now 18.3 / 7.6 / 6.8 / 5.2 on a panel: four steps that still read as four steps,
none of them unreadable. `--good` and `--warn` moved a shade for the same
reason.

Alongside that: a `main` landmark and one `h1` per screen naming the screen and
the audit (both supplied by `AppShell`, so a page adds an `h2`, not a second
`h1`); a skip link as the first thing the keyboard reaches; and every status dot
either saying what its colour means or marked `aria-hidden` because the row it
sits in already says it in words.

`tests/a11y.js` computes all of this from the tokens **as the browser resolves
them**, in both themes, and drives all eight screens. It fails if a token drifts
back under AA or a dot goes quiet.
