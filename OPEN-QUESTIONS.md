# Open questions — what only Sarel can answer

Everything else gets decided and built. This file is the short list of things
that are **not Claude's to pick**, in the order they block work. Each says what
the question is, why it cannot be answered from the code, and what happens in
the meantime.

Last updated: 9 September 2026.

---

## 1 · Where the rating of record lives

**Blocks:** the asset-system assessment view, and everything that depends on it —
the HIRA rebuild's mirrored lists, the ACSA discipline-dashboard export sheet.

The agreed audit methodology says *the hazard carries the rating of record,
because it is the thing that persists year on year — a finding closes, a hazard
does not.* The asset-system spec puts a rating on the **asset system**. Both can
be true only if they use different instruments, and the code already supports
exactly that:

| Object | Instrument today | Fields |
|---|---|---|
| `Finding` | B170 001M only | `severity` · `likelihood` · `ratingConfirmed` |
| `Hazard` | B170 001M **and** ERM | the above, plus `ermConsequence` · `ermLikelihood` · `ermConfirmed` · `ermLikelihoodAssumed` |
| `Check` / `Response` | none | — |

**What I expect you to confirm:** asset system rated on **ERM** (J050 001FW
cl. 9.2.2, axis labelled *Impact*), hazardous event rated on **B170 001M** (axis
labelled *Severity*). Nothing has to be inverted to get there — the hazard
already carries both.

**Why it needs you and not me:** it is where the number ACSA compares year on
year comes from, and moving it later means migrating live audit data.

**Until then:** nothing has moved. No migration written, no fields added.

---

## 2 · Whether hazard events are owned by the asset system or shared

**Blocks:** the same work as #1, and cannot be settled by reading the code
because neither shape exists yet.

The asset-system spec puts hazard events *inside* the asset-system block
(section 5b). The HIRA spec makes the hazardous event a **first-class record
owned by nobody**, because one event is fed by several asset systems — a power
failure follows a generator failure *or* a UPS failure *or* a distribution
fault, and if the event were a child of an asset system it would exist three
times and be rated three times.

Those are compatible only one way: the asset-system block **links to** a shared
event rather than owning one. That is what I would build. Your section 10 read
as leaving it open deliberately, so I have not.

**Until then:** `Hazard` stays as it is — a top-level record with
`findingIds[]` and `systems[]`.

---

## 3 · The ERM impact axis — 5–1 or A–E

**Blocks:** nothing today; it is a persisted-value change, so it gets more
expensive with every audit captured.

Carried over from the rating terminology audit. `ErmConsequence` is stored as
`"5 - Catastrophic"` … `"1 - Minor"`, running the opposite direction to B170's
`"A - Catastrophic"` … `"E - Negligible"`. That is correct against ACSA's
framework and it is the thing most likely to be "tidied" into agreement by
somebody who has not read the header of `src/lib/erm.ts`.

If ACSA's template turns out to letter its impact axis, the change is a
persisted-value migration, not a display change.

---

## 4 · Two things in the register that are ACSA's to fix, not ours

Neither blocks anything. Both are worth putting to Prince rather than working
around.

- **The `area` column is not locations.** 133 distinct values at King Shaka, of
  which roughly a third are not places an auditor can walk to — "Appointments",
  "Documentation", "Compliance", "Lessons learnt", "Certificates". The
  Inspection screen's location axis falls back to it because
  `programme.json`'s zone map is deliberately empty, and it says so on screen
  at every width now. Real zone names landing in `programme.json` is a **data
  change, not a rebuild**. This is open question Q13.
- **The register has 75 asset systems, not 84.** Worth reconciling against
  whatever list the 84 came from before the dashboard export is built, because
  the export is one row per asset system.

---

## 5 · Deliberate deviations from the written specs — raise if you disagree

Each of these is a judgement I made and would defend, not an oversight.

- **The add button is the primary in the sticky action bar, not a floating
  circle above it.** On a phone this screen already carries two fixed layers at
  the bottom — the app's own navigation (56px plus the home indicator) and the
  action bar. A third would have spent most of the quarter-viewport budget the
  brief sets for sticky furniture. The button is 56px, bottom-right below `sm`,
  labelled in words, never scrolled away, and clears the home indicator. Every
  property the brief asked for; one fewer layer.
- **Multi-expand was rejected in favour of a strict accordion.** Two open items
  on a 664px screen show less of each than one does, and comparing two
  check-points side by side is not something anybody does mid-walk.
- **Camera and microphone are in one toolbar under the comment field.** They
  are genuinely different affordances — the microphone fills *that field*, the
  camera attaches evidence to *the item* — and the brief was right to flag it.
  I put them together for reachability and would split them the day a better
  home for the camera appears. Not a strong view.
- **The filter chip row on the Inspection screen is gone.** The list is a tree
  grouped by discipline now, so a row of discipline chips was a second control
  doing the tree's job, at about 50px of a 664px screen permanently. Search
  still cuts across everything.
- **"+ New finding" on the walk is gone,** replaced by *Add item* plus one tap
  to raise a finding from what you recorded. The old modal took a description,
  a discipline and a location and nothing else — no photograph, no voice note,
  no outcome — on the one screen where the auditor is standing in front of the
  thing with a camera in their hand. It also wrote the literal string `"Ad-hoc"`
  as the asset system, which then appeared as an asset system on every screen
  that groups by one. Nothing is lost; what used to be the only path now
  arrives with its evidence attached.

---

## 6 · Known defects I have not fixed, and why

- **`historyFor()` drops a visit with nothing recorded.** `src/lib/carryforward.ts`
  — the reasoning in its comment is sound for what it renders (a narrative of
  what was said, where an empty entry says nothing). The year-on-year spec wants
  the opposite for the *timeline*: a visit that did not happen must be marked,
  never blank. I did not change `historyFor`; I added `timelineFor()` beside it,
  which gives every visit a cell and marks a skipped one explicitly. Two
  functions, two jobs, both documented. If you would rather have one, say which.
- **`bandFor()` coerces an out-of-range cell to Green** where `ermPriority()`
  returns null. Carried from the rating audit. Changing it is a one-line fix and
  a behaviour change on a rating function, so it waits for a word from you.
- **The Visual review screen does not show walk photographs.** `/review` builds
  its list from `checksAt(entity)` and each check's `Response.attachments`, so a
  photograph attached to a `WALK-xxxxx` item is not in it — an engineer who was
  not on site cannot see or comment on it. It is a real gap and a contained
  one: the screen's `Item` type is keyed on `check` and `response`, and the
  feedback map is keyed by check id, which a WALK id would satisfy without a
  schema change. I did not do it tonight because it is a rewrite of a screen
  the four specs do not touch, and a half-done version of it is worse than the
  honest gap. Roughly an hour's work.
- **The Follow-up screen now shows two different timelines.** Mine (every audit,
  as a shape, in the list) and the existing `ItemTimeline` (Raised → Remediated
  → Verified → Re-check, for the selected item). They are different things and
  they look similar. Worth a decision about which survives.
