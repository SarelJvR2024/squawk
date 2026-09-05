# Tests

Six suites, no framework — all run with plain `node`. Four need a running
server; two do not.

| Suite | Needs a server | Asserts |
|---|---|---|
| `risk-matrix.test.mjs` | no | 25 |
| `capture.test.mjs` | no | 27 |
| `e2e.js` | yes | 21 |
| `robustness.js` | yes | 30 |
| `exports.js` | yes | 7 |
| `ai.js` | yes, two of them | 14 |

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

## The browser suites

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

## `ai.js`

Needs the app running twice: once with no key, once with one. It asserts that
the offline composer works without a model, that the AI controls are hidden
without one and shown with one, that a model failure is reported honestly and
leaves the record untouched, and that a draft is never written to the record
until it is accepted.

```bash
npm start -p 3000 &                              # no key
ANTHROPIC_API_KEY=<anything> npm start -p 3001 & # key present
BASE_NO_KEY=http://localhost:3000 BASE_WITH_KEY=http://localhost:3001 node tests/ai.js
```

The key does not have to be valid — an invalid one exercises the failure path,
which is the branch worth testing.

## Known non-failure

In an offline sandbox, `e2e.js` fails its "no uncaught page errors" assertion on
the Google Fonts request. That is the environment, not the app; on Vercel it
passes.
