# Tests

Thirty-three suites, no framework. Thirteen need a running server; twenty do not.
**Check each suite's exit status, not its output**: a `for` loop over them
reports the status of the loop.

All run with plain `node` except `sharepoint.test.mjs`, `merge.test.mjs` and
`figures.test.mjs`, which need the alias loader so they can import the app's
real modules:

```
node --import ./tests/alias.mjs tests/sharepoint.test.mjs
```

| Suite | Needs a server | Assertions run |
|---|---|---|
| `risk-matrix.test.mjs` | no | 41 |
| `capture.test.mjs` | no | 28 |
| `scope.test.mjs` | no | 46 |
| `carryforward.test.mjs` | no | 31 |
| `review.test.mjs` | no | 22 |
| `tablet.test.mjs` | no | 34 |
| `portals.test.mjs` | no | 31 |
| `reset.test.mjs` | no | 17 |
| `completion.test.mjs` | no | 19 |
| `audits.test.mjs` | no | 18 |
| `voice.test.mjs` | no | 37 |
| `sites.test.mjs` | no | 41 |
| `photos.test.mjs` | no | 103 |
| `hazards.test.mjs` | no | 113 |
| `erm-matrix.test.mjs` | no | 64 |
| `sharepoint.test.mjs` | no | 58 |
| `assets.test.mjs` | no | 21 |
| `checkscreen.test.mjs` | no | 39 |
| `merge.test.mjs` | no | 36 |
| `figures.test.mjs` | no | 7 |
| `e2e.js` | yes | 21 |
| `robustness.js` | yes | 38 |
| `exports.js` | yes | 32 |
| `ai.js` | yes, two of them | 26 |
| `persite.js` | yes | 25 |
| `vision.js` | starts its own | 23 |
| `record.js` | starts its own | 14 |
| `flow.js` | yes | 49 |
| `offline.js` | yes | 18 |
| `team.js` | yes | 15 |
| `preflight.js` | yes | 15 |
| `shared.js` | starts its own | 41 |
| `a11y.js` | yes | 46 |

**1,170 assertions in total**, every count above verified by running the suite,
not by remembering what it used to be. Two in this table were wrong before that
was done.

## `risk-matrix.test.mjs`

Bands all 25 cells of the ACSA B170 001M matrix against an independently written
table and asserts the 6 / 12 / 7 Red / Amber / Green split. **Run it after any
edit to `src/lib/risk.ts`** — it exists to stop the matrix being quietly
"simplified" to I/II/III, which it is not.

```bash
node tests/risk-matrix.test.mjs
```

## `capture.test.mjs`

Guards that voice and photo capture stay real. Before it existed, "Voice note"
flipped a boolean and wrote `a?.IO[0]?.finding` — the first issue option from
the Answer Library — into the auditor's observation as though it had been
dictated on site, with a fixed `durationSec: 14`; "Photo" wrote a filename and
no image; field mode used a generated colour swatch. None of it was visible on
screen, and all of it would have reached an ACSA report as evidence.

Like `risk-matrix.test.mjs` it reads the source rather than running it, because
the fabrication was in what the code *said*. **Run it after any edit to
`src/lib/media.ts`, `src/components/Capture.tsx`, `CheckDetail.tsx` or field
mode.**

```bash
node tests/capture.test.mjs
```

It asserts, in five parts: the fabricated strings and durations are gone from
both capture surfaces; `getUserMedia` and `MediaRecorder` are genuinely used and
the stream is released; an empty transcript stays empty; blobs live under their
own IndexedDB keys and never inside the persisted store; and records made before
capture worked are marked unavailable rather than deleted.

## `scope.test.mjs`

Guards that an audit belongs to one entity on one visit. Before the store was
re-keyed, `responses` was keyed by checkId alone and `verifications` by pf
alone, with no entity or visit in persisted state at all: capturing at King
Shaka and switching to O.R. Tambo showed King Shaka's answers, and September
overwrote March. The app held one cell of a sixty-cell grid and said nothing.

```bash
node tests/scope.test.mjs
```

Six parts: the scope key is the entity and visit together and captured data
lives under it; every write goes through the one scoped helper; no screen reads
the store's raw slices; nothing is hardcoded to one site (owners, the cycle
strip, export filenames); the scope is actually selectable in the shell; and the
v5 migration files pre-scope data rather than dropping it.

## `carryforward.test.mjs`

Guards that what an earlier visit left open reaches the next one. Closure read
one static file — the 23 March 2025 findings — and nothing else; a finding
raised in this app, rated Red, with an owner and a due date, became a row in a
list and then nothing. The shell drew a three-year cycle across every screen
while the cycle was not implemented.

```bash
node tests/carryforward.test.mjs
```

Five parts: seeded and carried items are the same shape and keyed so old
verifications still resolve; only earlier visits can leave something
outstanding and a closed finding stops carrying; an unagreed rating carries as
"Not audited" rather than becoming a decision by surviving; closure reads the
real list and closing an item closes the finding behind it; and no visit label
or site name is hardcoded into the screen.

## `review.test.mjs`

Guards the one rule Visual review exists to protect: a review comment is a
conversation *about* the evidence and is never merged into
`Response.observation` (the auditor's record of what they found) or
`Finding.description` (what reaches ACSA and the SACAA). An engineer who thinks
their aside might be quoted in an audit report writes a different, more careful,
less useful comment — and a report that quietly absorbed one would be
misattributing a finding.

```bash
node tests/review.test.mjs
```

Six parts: the screen writes neither observations nor findings; feedback belongs
to one entity and visit; author and side are recorded on every note; resolving a
comment keeps it and is reversible; the screen is genuinely reviewable
(discipline first, evidence only, lightbox, transcripts, revoked object URLs);
and ACSA can reach it despite being read-only everywhere else.

## `tablet.test.mjs`

Guards that the tablet is treated as the device, not a narrow desktop. Three
things were wrong at once and all three cost capture rather than looks: a mouse
design's 26px targets tapped with a gloved thumb; the check screen going
two-pane only at 1280px, so an iPad in landscape (1180px) stacked and put the
whole reference column above the controls; and field mode — the walkabout
screen — never showing the researched walkabout options at all.

```bash
node tests/tablet.test.mjs
```

Five parts: a `pointer: coarse` floor a mouse never sees; capture never below
the fold; field mode doing the walkabout it exists for, including the library's
own "wants a photograph" flag; fewer scrolls; and the two scope bugs this pass
turned up.

## `checkscreen.test.mjs`

Guards the shape of the check screen after it was cut down to a brief. What was
there worked and was unreadable: seven panels of equal weight down the left, the
four compliance buttons at the top of the right-hand column where reading the
left scrolled them out of sight, and — on a phone — the voice note and camera
below six groups of chips.

```bash
node tests/checkscreen.test.mjs
```

Two kinds of assertion, and the second matters more. First, that the shape is
the one asked for: question, then standard, then plain reading; the site's
stricter threshold inside the standard rather than beside it; the compliance
buttons in the sticky header; the answer box, the voice note, the camera and
Save pinned together at the foot of the screen; evidence to request leading the
capture column. Second, THAT NOTHING WAS DROPPED — every field the register
carries for a check is still rendered somewhere, because a redesign that
quietly loses the external basis is not a tidier screen, it is a smaller audit.

It also pins the two layout bugs the redesign turned up: the grid taking the
flex container's leftover height below `lg` while its content spilled out of it,
which left the pinned bar resting in the middle of the screen with chips
scrolling underneath, and the header compaction being driven by the scroll
container rather than by a breakpoint, so it does nothing from `lg` where the
columns scroll inside themselves.

## `figures.test.mjs`

Does the prose still match the register? It did not.

Rev A2 shrank the check-list from 374 rows to 324 and the app followed it —
every count on screen is derived. The *words* did not. README, these notes and a
dozen source-file headers went on quoting a register of 374, a library of
11,179, a desk-and-field split of 365 and 314, an overlap of 305 and 89 carrying
a question to ask. Not one was true, and every one was written to be helpful.

```bash
node --import ./tests/alias.mjs tests/figures.test.mjs
```

A stale number in a comment is not a typo. This repo's comments are how the next
person learns why a thing is the way it is, and a header opening with a figure
15% wrong quietly devalues everything after it — worse here, because a reader
has no way to tell a stale figure from a deliberate one, and these particular
figures are the shape of the engagement.

So the suite derives them: it reads `checks.json`, the Answer Library and the
site table, works out what is true, then reads every markdown file and source
comment for a number written next to "check-points", "checks" or "options".
Anything that does not match is a failure naming the file and the line. Years
are excluded ("Sep 2026 checks" is a visit) and this file is exempt, because it
quotes the superseded figures to explain them.

## `merge.test.mjs`

Two auditors, one audit. Squawk keeps the audit in one device's IndexedDB, which
is right for an apron with no signal and wrong for a team — and a team is what
does an ACSA audit. Until the shared record exists, a day's work comes back
together by each auditor sharing a bundle and one device merging the rest.

```bash
node --import ./tests/alias.mjs tests/merge.test.mjs
```

**The one suite that runs the real module rather than reading it**, because
`src/lib/merge.ts` is pure: state in, state out. Every assertion is the actual
function deciding. The ones that matter are not about what merges but about what
must never be lost:

- **Evidence is unioned, not overwritten.** A photograph on the losing side of a
  last-write-wins is still a photograph of a defect at a national key point.
  Dropping it would be destroying evidence to settle a clash of timestamps.
- **An append-only log stays append-only**, and a note both devices already held
  is not doubled.
- **Merging the same file twice changes nothing**, because an auditor will do
  that.
- **A bundle from the wrong audit is refused, not warned about.** Cape Town's
  captures inside King Shaka's visit is a mistake nobody catches until the
  report is with ACSA.

Its last section reads the store instead, for the claims that are about wiring
rather than logic: that every mutation stamps `updatedAt`, that `importBundle`
refuses before it writes, that a merge of one airport cannot reach another's
records, and that the version 13 migration back-fills rather than defaulting a
half-captured tablet to zero — 0 loses to everything, so it would have lost to
an emptier copy.

## `portals.test.mjs`

Guards that a check appears where it can actually be answered. The register
declares per row how each check-point is verified — Evidence, Question, Site
Physical Verification — and nothing read it: Capture listed all 324 including
the nine an auditor at a desk cannot answer, and Field routed on whether
someone had written walkabout text.

```bash
node tests/portals.test.mjs
```

Part 1 parses `checks.json` **independently** of `src/lib/verification.ts`, the
way the matrix test bands the matrix against its own table — so the counts are
checked against the data rather than against the module agreeing with itself.
It caught a real arithmetic error on the first run: the overlap came out two
short of what the distribution tempts you into, because the
`Site Physical Verification + Question` rows are desk work as well and it is
easy to count them once.

The routing it asserts: **desk 315 · field 299 · overlap 290 · desk-only 60 ·
field-only 9 · orphaned 0.** Both failure modes are guarded and they pull in
opposite directions — blanket duplication makes each list meaningless, and an
orphaned check is worse because nothing on screen would ever say so.

## `reset.test.mjs`

Guards the Start again control used during a dry run. Everything a reset does
is unrecoverable — no server copy, no undo, and the tablet's IndexedDB is the
only place a half-captured audit exists — so it must be reachable, hard to hit
by accident, and it must clear the media as well as the records.

```bash
node tests/reset.test.mjs
```

Five parts: reachable in the shell and closed to ACSA; two separate scopes;
media actually deleted (a visit reset sweeps its own blobs, a full reset sweeps
the whole `squawk-media/` prefix so orphans go too); arm-then-confirm with a
count of what is about to be lost and disarm-on-scope-change; and reference
data — the 324 checks, the Answer Library, the 23 seeded findings — never
touched.

## `completion.test.mjs`

Guards that a check is complete only when every mode it declares has been
answered. There was one `captured` flag set by whichever screen saved first, so
for the 290 checks needing both a document review and the asset seen, ticking it
at a desk marked it done — the dashboard counted it, the export said
"Captured: Yes", and nobody had walked out to look at the pump.

```bash
node tests/completion.test.mjs
```

Six parts: both halves recorded with who and when; `captured` derived rather
than asserted; each screen counting its own half (a field card must not grey out
because someone read a file at a desk); the auditor told plainly what is still
outstanding; the export reporting Desk done / Site seen / Complete as three
columns; and the v6 migration carrying a dual-mode check to the desk half
**only** — claiming the field half would assert a site visit that may never have
happened.

## `audits.test.mjs`

Guards that any audit can be reached and new ones created. `programme.json`
seeds six visits and all six are at King Shaka — the other nine entities had
none, so the entity picker could reach O.R. Tambo with nowhere to put anything
captured there.

```bash
node tests/audits.test.mjs
```

Five parts: the file still covers one entity (asserted, so the gap stays
visible); created audits persist and merge into one ordering with the seeds; a
visit id is validated as `YYYY-MM` on the way in, because carry-forward decides
what came before by sorting it; deletion cannot lose work — seeded audits are
never removable and one holding responses *or findings* is refused; and the way
in is visible, since the strip was already clickable and nobody clicked it.

## The browser suites

`playwright` is not a dependency of this project — install it locally when you
want to run these:

```bash
npm i -D playwright && npx playwright install chromium
```


```bash
npm run build && npm start &
npx playwright install chromium        # first time only
BASE=http://localhost:3000 node tests/e2e.js
BASE=http://localhost:3000 node tests/robustness.js
BASE=http://localhost:3000 node tests/exports.js
```

- **`e2e.js`** — the walk through the product: raising a finding from an issue
  chip, rating it on the matrix, verifying a 2025 finding, the coverage guard,
  IndexedDB persistence across a reload, the command palette, dark mode, and
  horizontal overflow at 390px.
- **`robustness.js`** — the unhappy paths: empty states, division by zero,
  duplicate findings, a 2,000-character observation and a 400-character unbroken
  token, the ACSA read-only role, keyboard-only navigation, an unknown check id,
  an unknown route.
- **`exports.js`** — captures a check, agrees a rating, raises a hazard,
  downloads the workbook and the CSVs, and reads them back: the filename carries
  entity, visit and date; the photograph index matches the files in the zip; the
  Hazards sheet carries both rating instruments in their own columns and the
  empty ERM ones say they are unsupplied rather than reading blank; the Findings
  sheet names the hazard each finding ended up in; and the ACSA role has no
  export control.

Screenshots land in `shots/`.

## `voice.test.mjs`

Guards the seams around a voice note, which are three separate decisions that
must not collapse into one another: the recording (always, locally, no key), the
browser's live dictation (off until switched on, because it streams audio to the
browser vendor's speech service), server-side transcription (per note, on a tap),
and the model's write-up (a suggestion, never the record).

The invariant worth stating on its own: **a rewrite never overwrites the
verbatim transcript.** A tidy sentence that dropped an item or changed a number
is only catchable if the original is still sitting next to the audio.

```bash
node tests/voice.test.mjs
```

**Run it after any edit to `src/lib/media.ts`, `src/components/Capture.tsx`,
`src/app/api/transcribe/route.ts`, or the AI assistance section of
`AppShell.tsx`.**

## `sites.test.mjs`

Rev A2 covers 3,086 check-points across ten sites, and the tempting reading is
that it is ten registers. It is not: every site uses the same 324-item register
and the same check-point numbers, and where one does not apply its number is
simply not used there. Squawk therefore holds the register **once** and derives
each site's ids and applicable set.

Part 1 defends that shortcut the way `risk-matrix.test.mjs` defends the matrix —
it recomputes every site's count from the register and the applicability rules
and compares against the counts Rev A2 publishes: 324 at the three international
airports, 319 at the six regionals, 200 at Corporate Office, **3,086 in total**.
If those ever disagree, the shortcut is no longer equivalent to the all-sites
file and the register has to be stored per site after all.

Part 3 guards the quieter half: almost nothing about the register is the same at
all ten sites — not the count, not the disciplines, not the asset systems, not
the prior findings, not the ids — and all of it used to be module-level
constants computed from the whole register.

```bash
node tests/sites.test.mjs
```

**Run it after any edit to `src/lib/sites.ts`, `src/lib/register.ts`,
`src/data/checks.json`, `priorFindings.json`, `priorRatings.json` or
`programme.json`.**

## `persite.js`

The browser half of the above. Drives four sites of three different classes —
King Shaka (324, 15 open 2025 findings), O.R. Tambo (324, 33), Bram Fischer
(319, none) and Corporate Office (200, none, and no Civil work at all) — and
reads the counts, the check-point ids and the carried findings **off the
rendered page**, because the failure it guards against is a screen showing the
whole register's numbers while claiming to be at a site.

```bash
npm start -p 3000 &
BASE=http://localhost:3000 node tests/persite.js
```

## `photos.test.mjs`

Three things about a photograph that must stay separate: how it is **stored** (a
phone photo is 4-12 MB as taken, so every image is re-encoded to 1600px / q0.82
first, with the EXIF capture date read off the original before the canvas
destroys it), whether it is **captioned** (uncaptioned is shown as incomplete and
exported as NO CAPTION, because a blank cell reads as "nothing to say"), and
whether it is **sent** (`ASSIST_VISION`, enforced in the route).

```bash
node tests/photos.test.mjs
```

**Run it after any edit to `src/lib/media.ts`, `src/components/Capture.tsx`,
`RootCauseAdvice.tsx` or `src/app/api/assist/route.ts`.**

## `hazards.test.mjs`

The register that answers *what could happen?*, as opposed to the one that
answers *what did we see?*. Rating findings instead of hazards produces a risk
profile made of paperwork — no gaseous suppression in a substation, a
fire-detection gap in the same room and an unsigned maintenance record for the
panel in it score as three medium paperwork risks where there is one red
physical one — and it reads perfectly plausible.

Parts 1–4 **run the real parsers and context builders** out of
`src/lib/assist.ts` rather than reading them, because the rules that matter
there are arithmetic no regex would catch: a finding claimed by two groups stays
in the first one only, a group naming a finding nobody sent is refused rather
than created empty, and an unrecognised confidence degrades to `low` instead of
`high`. A finding in two hazards is double-counted in every total downstream.

The rest is source-reading, in the pattern of `risk-matrix.test.mjs`: nothing
the assistant returns is applied without a tap; the rating block is written once
and rendered from both screens; and the re-read prompt still carries the sentence
that stops a model raising a likelihood off a rusty panel — likelihood on this
scale is occurrence history, and a photograph cannot show that.

```bash
node tests/hazards.test.mjs
```

**Run it after any edit to the hazard register, `RecordActions.tsx`, the assist
parsers or the `hazard` / `consolidate` / `reassess` prompts.**

## `erm-matrix.test.mjs`

ACSA's **second** rating instrument: J050 001FW *Combined Assurance Framework*
cl. 9.2.2. Business risk, priorities I / II / III, and clause 9.1.2 decides
what enters the Combined Assurance Coverage Plan.

The grid is transcribed independently from the framework and checked cell by
cell, the way `risk-matrix.test.mjs` is written against B170 001M — 25 cells,
the 10 / 9 / 6 split, the percentage bands, the priority meanings.

It exists for the reason the B170 suite does **and one more**: the two matrices
look similar enough to be confused and their consequence axes run in *opposite*
directions. B170 severity goes A (Catastrophic) → E (Negligible); ERM
consequence goes 5 (Catastrophic) → 1 (Minor). Anyone tidying them into one
shape inverts this one silently, and the priorities stay plausible while being
exactly wrong.

Later parts compute the **five cells where the instruments disagree** — 1B, 2A,
3B, 4C, 5D — from both grids rather than asserting a remembered list, and check
that ERM is the harsher of the two in every one. Those five are why the Rev A2
register looked like it had a transcription error: it carries this matrix, not
B170 001M. They also assert the separation holds in the code, not only in the
comments: nothing derives one rating from the other, a likelihood carried across
is marked as an assumption, and an unagreed ERM rating reaches no export column.

**Run it after any edit to `src/lib/erm.ts` or `src/lib/risk.ts`.**

```bash
node tests/erm-matrix.test.mjs
```

**Run it after any edit to `src/lib/erm.ts` or `src/lib/risk.ts`.**

## `flow.js`

**Does the number move, and does it move only when it should?**

Every screen derives its figures from one store, and the invariant the whole
application is built on is that a rating the group has not agreed reaches no
KPI, no dashboard and no export. That rule is easy to state and easy to leak.
It leaked: `currentRating()` — which decides whether an asset system reads
Unacceptable, Tolerable or Acceptable this visit — was written twice, on the
dashboard and on closure, and **neither copy checked `ratingConfirmed`**. A
finding raised by tapping an issue button arrives carrying that button's
*suggested* severity, so it banded immediately, and one tap could move the
Improved / Unchanged / Worsened counts against March 2025 — the headline
comparison in the out-brief.

Reading the code did not catch that. It survived because the rule *is* applied
correctly in `exports.ts`, in `carryforward.ts` and in the dashboard's own
`rated` list, each within a few lines of a comment saying so; these two
functions were somewhere else.

So this suite drives a real browser through the auditor's actual path — capture
a check, raise a finding, agree a rating, consolidate a hazard, open closure —
and asserts **what changed and what did not** at each step. Two assertions carry
the weight, and they are deliberately a pair: the movement counts must not move
on a suggestion, and they must move once a person taps the cell. A guard that
never lets anything through is not a guard.

It watches all three movement counts rather than one. Watching only *Worsened*
let the defect through the first time this suite was written: the issue button
on that asset system seeds an **Amber** suggestion and the system was Tolerable
in 2025, so the ungated code scored it *Unchanged* and an assertion aimed at
Worsened saw nothing.

```bash
BASE=http://localhost:3000 node tests/flow.js
```

It also compares two cells in the **same band** — 5A, just agreed, against 5B,
which is Red too and was not — and asserts they do not paint the same. The
report fills an agreed cell solid with white text; a suggestion keeps the soft
tint. If those ever converge, the distinction has quietly stopped existing and
nothing else in the suite would notice.

**Run it after any change to how a figure is derived** — the store's selectors,
the dashboard, closure, or anything that reads `ratingConfirmed`.

## `offline.js`

The suite that answers the question the rest of the repo assumed: **does the app
open with no signal?** Everything else about not losing captured work — the
IndexedDB store, photographs surviving a reload, the sync queue waiting for
signal — took for granted that the app had already loaded. It had not earned
that. Before the service worker, an auditor airside who closed the tab, or whose
phone dropped the page from memory (iOS does this aggressively), got a browser
error page and could not reach a single thing they had captured.

```bash
BASE=http://localhost:3000 node tests/offline.js
```

So it loads the app, **cuts the network with `context.setOffline(true)`**, and
drives it. Reading the source would prove a service-worker file exists, which is
a different claim. It checks the cold start, a second screen from its own URL,
the bare address (a redirect, and therefore the one most likely to break), that
work captured before the signal went is still on screen, and that both lazy
payloads — the Answer Library and the asset register — are reachable with no
signal.

It also asserts the things that must **not** be cached, each of which would be a
defect rather than a missing optimisation: no `/api` response (a cached
availability probe would tell an auditor a model is configured on a deployment
where it is not), not the OAuth redirect (it carries a code and a state in its
URL), nothing cross-origin (the photographs are not copied into a second store
as a side effect of a routing rule), and not the redirecting root (handing a
redirected response to a navigation is a hard error in every browser).

## `team.js`

The same hand-over, driven for real. `merge.test.mjs` proves the rules; this
proves the whole route, because the rules being right is no use if the file
never leaves the first device or never arrives at the second.

```bash
BASE=http://localhost:3000 node tests/team.js
```

Two browser contexts as two tablets. The first captures a check, raises a
finding and shares its captures; the file is read and checked — it names its
audit and who shared it, every record says when it was written, and **no image
bytes travel in it**. The second context starts empty, merges the file, and the
other auditor's work is then in its audit and on its findings screen. Then it
merges the same file again, because an auditor will.

## `preflight.js`

`/preflight` is the screen that answers "will this device work" before somebody
is standing on an apron finding out that it does not. Squawk asks a lot of a
phone — audio, photographs, an audit in IndexedDB, a cached copy of itself, a
queue pushing evidence to the record store — and any of it can be off, refused
or full on one particular device.

```bash
BASE=http://localhost:3000 node tests/preflight.js
```

Two things make the screen worth having and both are asserted: it reports what
is **true** about the device it is running on — the worker really registered,
the database really wrote and read back, the space is in bytes rather than
adjectives — and **it never asks for a permission nobody pressed a button for**.
The microphone and camera stay untested until someone taps, because a permission
granted to get rid of a dialog is not a test that the microphone works.

The microphone is then tested properly in a second browser launched with
Chromium's fake capture device, the same way `ai.js` records a real voice note:
a headless browser has no audio hardware, so pressing the button in the first
context would be testing the sandbox rather than the app.

## `shared.js`

Several auditors, one audit, over the wire. `merge.test.mjs` proves the rules
and `team.js` proves the file route; this proves the shared record — two browser
contexts as two tablets, a real Next server holding the secret key, and **a
Supabase this suite can turn off on purpose** (`tests/fake-supabase.mjs`, which
implements the two endpoints the route calls with the same conditional-upsert
and commit-time semantics as the SQL migration).

```bash
node tests/shared.js        # starts everything it needs
```

Sarel asked for it "in all scenarios with multiple auditors offline and online
as expected and also test some edge cases and do negative testing", and **the
negative half is the half that matters**. A sync that works when everything is
fine is table stakes. What decides whether a team trusts it:

- an **unconfigured deployment says so and refuses to sync** — it never falls
  open;
- a wrong passphrase is refused, tells you nothing about the real one, and is
  never kept on the device;
- guessing is slowed to a crawl, and one client being throttled does not lock
  out another;
- **a row cannot name an audit the request did not authenticate for** — the
  server re-scopes every row to the audit it authenticated;
- **a device out of a basement cannot push its stale copy over newer work**;
- an oversized body is refused rather than stored;
- offline, the app says so, says nothing is lost, and goes on capturing;
- work captured with no signal goes up **by itself** when signal returns;
- when the record is down the app says so plainly, keeps capturing, and
  recovers on its own;
- **two auditors who answered the same check in a basement converge** on the
  later answer when they come up, rather than on whoever synced first;
- a device whose passphrase has stopped working is told, and the passphrase that
  stopped working is dropped rather than retried forever;
- **a check captured on one tablet is never invisible to the rest of the team**,
  even when one auditor's push is still committing while another is handed a
  cursor past it;
- and syncing over and over neither grows the record nor duplicates a finding.

The commit-time one is worth reading in full. Postgres reads `now()` at a
transaction's START and makes its rows visible at its COMMIT, so a slow push
lands carrying a timestamp from before it began — older than a cursor another
device may already hold. That device excludes those rows from every pull it ever
makes again, and the slow device will not re-send them, because its own push
watermark has moved on. Nothing reports a problem; the workbook is just short.
It takes one push overlapping another, so it appears at three auditors rather
than two, and the fix is to hold the cursor a minute behind the newest row.

**The suite could not have caught it as first written.** `fake-supabase.mjs`
stamped each row at write time, in order — *better behaved than Postgres*, and
so it proved something that was not true. It now stamps once per transaction and
takes a `__lag` control that holds a push open before it commits, which is the
only way the race can be expressed at all.

It found two real defects on its first run. An offline device said *"no shared
record on this deployment"* — because the probe that asks cannot get an answer
with no network, which is the worst possible wrong answer: it tells an auditor
in a basement their team is not sharing an audit at all. And a save waited up to
thirty seconds for the next tick, which is now a debounced sync a couple of
seconds after the last save.

## `vision.js`

The one suite that does not read the source. It stands a stub endpoint in front
of the assist route, sends photographs through `/api/assist`, and inspects **the
bytes the route forwarded** — because a client that is told not to send images
and a server that refuses to forward them look identical from outside until you
look. With `ASSIST_VISION` unset it asserts no image block *and* no image byte
reached the network; with it on, that all three arrived in the documented shape,
and that over-cap requests are refused rather than truncated.

The same stub also answers what the route ASKED for, which is where the model
choice is checked: that the request names the configured model, that a wording
task and a judgement task are sent at different effort levels, and that the
token budget leaves room for a thinking model to think before it answers — a
budget sized for a non-thinking model truncates a JSON answer mid-object and
returns nothing, which reads on screen as "the model is broken". And because a
decline arrives as an HTTP 200 with no text, the stub can be told to send one,
so the route's handling of it is exercised rather than assumed.

It starts and stops its own servers — nothing needs to be running first — using
`ASSIST_ENDPOINT` to point the route at the stub.

```bash
node tests/vision.js
```

## `record.js`

Sarel's requirement in one sentence: photographs must go to cloud storage for
the record, **and** they must remain on the capturing device. Those pull against
each other in the obvious implementation — upload, then free the space — and the
failure would be invisible until an auditor tried to look at their own
photograph on an apron with no signal.

So this drives a real browser against the real route with a stub blob store
standing in for Vercel, and checks both halves: the image left, and the image is
still here. It also checks the queue drains without anyone pressing anything,
that the object lands under the path the workbook refers to, and that a reload
does not re-upload what is already stored.

```bash
node tests/record.js
```

## `ai.js`

Needs the app running twice: once with no keys, once fully configured. It
asserts that the offline composer works without a model, that the AI controls
are hidden without one and shown with one, that a model failure is reported
honestly and leaves the record untouched, that a draft is never written to the
record until it is accepted, and that the help panel names every path by which
data can leave the device.

Its third block records a real voice note against Chromium's fake capture
device, which is the only way to see the controls that hang off a note that
exists — and confirms that live text does not run when nobody switched it on.

```bash
npm start -p 3000 &                              # no keys
ANTHROPIC_API_KEY=<anything> ELEVENLABS_API_KEY=<anything> npm start -p 3001 &
BASE_NO_KEY=http://localhost:3000 BASE_WITH_KEY=http://localhost:3001 node tests/ai.js
```

Neither key has to be valid — invalid ones exercise the failure paths, which are
the branches worth testing. The transcription *success* path cannot be tested
without a real key and is the one thing here that has never run.

## `a11y.js`

Can this be used by somebody who cannot see it — or, far more often here, cannot
see it *well*? Squawk is read on a tablet held at arm's length on an apron at
midday, where low-contrast grey is invisible to everybody, and roughly one man in
twelve cannot separate the red dot from the green one.

```bash
BASE=http://localhost:3000 node tests/a11y.js
```

It computes the contrast of every ink step against every surface it can land on,
in **both** themes, from the tokens as the browser actually resolves them — not
from the hex values in the stylesheet — and drives all eight screens looking for
a control nobody could name, a field nobody could label, a missing landmark or
heading, and colour carrying meaning on its own.

On its first run it found: no `main` landmark anywhere, no `h1` on seven of the
eight screens, no skip link, two unlabelled fields on Follow-up, seven status
dots that said nothing at all, and four light-theme tokens below WCAG AA — two
of them at 2.34:1 and 3.23:1, used for 9px hint text.

The dot assertion is the one worth understanding. A small round span passes if it
says what its colour means, **or** if it is marked `aria-hidden` *and the row it
sits in says the state in words anyway* — a green dot beside "23 findings" is a
second reading of something already written. `aria-hidden` on its own is not a
pass; that would let any dot be silenced with one attribute, which is the exact
failure the assertion exists to catch.

## Exit status

Every suite exits non-zero if any assertion failed. Check the status, not the
output — `for f in tests/*; do node $f; done` reports the status of the loop,
not of the suites, and will happily report success over a red one.

`e2e.js` was the exception until it was fixed: it exited 0 whatever happened, so
a genuinely broken run read as green to anything that checked. It no longer does.

## Sandbox egress

Fonts load from `fonts.googleapis.com` at runtime (see `src/app/layout.tsx`),
which an offline sandbox cannot reach. `e2e.js` excludes failed resource loads
from that host, and only that host, from its page-error assertion — the page
renders in its fallback stack and the app is unaffected. Any other resource
failing to load is still a real error.

The transcription service (`api.elevenlabs.io`) is likewise unreachable from a
sandbox, so `api/transcribe`'s success path is the one branch in this repo that
has never been executed. Its failure branches — no key, no audio, oversized,
unreachable upstream, empty result — all have coverage.
