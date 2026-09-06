# Tests

Fifteen suites, no framework — all run with plain `node`. Four need a running
server; eleven do not.

| Suite | Needs a server | Assertions run |
|---|---|---|
| `risk-matrix.test.mjs` | no | 29 |
| `capture.test.mjs` | no | 28 |
| `scope.test.mjs` | no | 46 |
| `carryforward.test.mjs` | no | 20 |
| `review.test.mjs` | no | 22 |
| `tablet.test.mjs` | no | 18 |
| `portals.test.mjs` | no | 27 |
| `reset.test.mjs` | no | 17 |
| `completion.test.mjs` | no | 18 |
| `audits.test.mjs` | no | 17 |
| `voice.test.mjs` | no | 36 |
| `e2e.js` | yes | 21 |
| `robustness.js` | yes | 30 |
| `exports.js` | yes | 7 |
| `ai.js` | yes, two of them | 26 |

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

## `portals.test.mjs`

Guards that a check appears where it can actually be answered. The register
declares per row how each check-point is verified — Evidence, Question, Site
Physical Verification — and nothing read it: Capture listed all 374 including
the nine an auditor at a desk cannot answer, and Field routed on whether
someone had written walkabout text.

```bash
node tests/portals.test.mjs
```

Part 1 parses `checks.json` **independently** of `src/lib/verification.ts`, the
way the matrix test bands the matrix against its own table — so the counts are
checked against the data rather than against the module agreeing with itself.
It caught a real arithmetic error on the first run: the overlap is 305, not the
303 it is tempting to get from the distribution, because the two
`Site Physical Verification + Question` rows are desk work as well.

The routing it asserts: **desk 365 · field 314 · overlap 305 · desk-only 60 ·
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
data — the 374 checks, the Answer Library, the 23 seeded findings — never
touched.

## `completion.test.mjs`

Guards that a check is complete only when every mode it declares has been
answered. There was one `captured` flag set by whichever screen saved first, so
for the 305 checks needing both a document review and the asset seen, ticking it
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
- **`exports.js`** — captures a check, agrees a rating, downloads the workbook
  and the CSV, checks the filename carries entity, visit and date, and that the
  ACSA role has no export control.

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
