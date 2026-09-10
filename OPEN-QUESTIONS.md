# Open questions — what only Sarel can answer

Everything else gets decided and built. This file is the short list of things
that are **not Claude's to pick**, in the order they block work. Each says what
the question is, why it cannot be answered from the code, and what happens in
the meantime.

Last updated: 9 September 2026.

---

## 1 · Where the rating of record lives — ANSWERED IN PART, 2026-09-10

**Sarel's instruction:** *"on this page we are going to do the rating of the asset
systems… at the top of the panel we need to be able to record the likelihood and
severity and the system must calculate the rating and strategy."*

That settles the asset system, and **not the way I expected**. I had written here
that I expected asset systems on ERM and hazardous events on B170 001M. His
wording is B170 001M's vocabulary throughout — *severity* and *likelihood*, and
a *strategy*, which ERM does not have; clause 4.6 pairs one treatment strategy
with each of B170's three bands. So the asset system is rated on **B170 001M**,
severity × likelihood, and the band and strategy are derived from the cell.

Built and live: `SystemAssessment`, per visit, keyed `${discipline}|${system}`,
gated by `ratingConfirmed` like every other rating here. No migration was needed
— it is an absent-means-empty optional on `VisitData`, so nothing historical
had to be converted.

**Still open, and it is the smaller half.** The agreed methodology says the
HAZARD carries the rating of record because a finding closes and a hazard does
not. There are now three rated objects — finding, hazard, asset system — all on
the same instrument, and nothing says which one ACSA's year-on-year comparison
reads. My reading is that the asset system's band is the published number (it is
the row in ACSA's register) and the hazard's is the one that persists between
audits, and that they answer different questions rather than competing. That is
a reading, not a decision, and it is worth one sentence from Sarel.

**Also still open:** whether an asset system should ALSO carry an ERM rating.
Nothing derives one from the B170 cell and nothing will — the two instruments
disagree on five of twenty-five cells. If ACSA's Combined Assurance Coverage
Plan wants asset systems on ERM, that is a second, separately agreed rating on
the same record and about half a day's work.

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
- **The Checks screen still tints its compliance buttons with the band
  colours, and the Inspection screen no longer does.** `CheckDetail.tsx`'s
  `toneStyle()` fills a selected status with `--bad-bg`/`--bad`,
  `--warn-bg`/`--warn` and so on — a soft tint rather than the solid band fill,
  but the same hues, on a control that is a compliance status and not a rating.
  The Inspection screen's new segmented control deliberately does not, and the
  two screens now disagree. I did not change the Checks screen: it was not in
  any of the four specs, you reviewed and approved that layout recently, and
  changing it unasked would undo work you signed off. **Two capture screens
  showing a status two ways is worse than either way**, so this needs a call
  rather than a preference — either the Checks screen adopts the brand palette,
  or the Inspection screen goes back to the tints and I write down why.
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

---

## 7. Photographs between two devices — what is fixed and what is not (2026-09-10)

Sarel captured photographs on his phone, saw them on the phone under Review,
and saw nothing on his laptop. Traced through the code; two separate things
were happening, and only one of them was a bug.

**Fixed.** Every photograph carries a small inline preview (`thumbDataUrl`)
that lives *inside* the persisted JSON, so it rides the shared record to every
device on the audit. The Review screen never read it: it looked for the local
IndexedDB blob and then for the legacy `dataUrl`, and fell through to a
placeholder that said "captured before this worked". The thumbnail had arrived
and was sitting unread in the same record. Review now falls back to it, as the
Capture screen always has, and the placeholder tells the two states apart.

**Not fixed, and it needs a decision.** The full-resolution bytes have no route
between devices at all:

- `blobKey` is a pointer into the capturing device's own IndexedDB. It is
  meaningless anywhere else, by design (`src/lib/media.ts`).
- Photographs are uploaded to Vercel Blob with `access: "private"` — correct,
  they are of a national key point — but there is no read route, no proxy and
  no signed-URL step, and nothing in the app renders `cloudUrl` as an image
  source. So even a device that knows the URL cannot load it.

So after a sync the second device sees the thumbnail, the caption, the
reference, the asset and the location — everything except a full-size image.
That is enough to review and to write up, and not enough to zoom into a serial
plate.

**The question for Sarel:** does the record copy need to be readable from a
second device before the King Shaka dry run? Doing it means a server route that
reads the private blob and streams it to an authenticated caller — perhaps a
day's work, and it puts site photographs of a national key point behind an app
route rather than behind Vercel's private ACL alone. That is a security posture
decision, not a technical one, so it is his.

**Also worth checking on the deployment, not in the code:** whether uploads are
happening at all. `GET /api/photos` answers it directly — it returns
`available`, `via`, `candidates` and `ambiguous`. The route deliberately
refuses to guess when two `*_READ_WRITE_TOKEN` variables exist and
`BLOB_TOKEN_VAR` does not name one; this deployment has had two blob stores.
Credentials are Sarel's alone — nobody should paste a token anywhere.

---

## 8. The Follow-up rework — what was decided, and what still needs Sarel (2026-09-10)

Built to Sarel's instruction of 2026-09-10. Three things were decided here that
he may want to overrule.

**1. A possible hazardous event carries a likelihood and no severity.** He asked
for "multiple possible hazardous events and the likelihood recorded for each",
which is exactly what is built. The judgement call is the omission: a severity
box next to the likelihood would have been the obvious symmetric thing to add,
and it is deliberately absent. A rating of record is agreed by the group on the
matrix and lives on the Hazard; a severity typed on a follow-up screen would be
a second, un-agreed rating for the same event. If he wants a severity here, the
honest way is for a possible event to *promote* into a real Hazard — one press,
carrying the event and the likelihood, rated on the matrix like everything else.
That is about half a day and it is not built.

**2. The status word on a row.** An item with nothing recorded this visit now
reads **OPEN**, not "Not verified". "Not verified" describes what the auditor
has not done; "Open" describes what the finding is, and the finding is in this
list precisely because it is outstanding. Both were defensible; this one is
right for a close-out meeting, where the question is about the asset and not
about the audit team.

**3. The per-audit cell strip came off the row and the legend went with it.**
That was his explicit instruction. The sequence it drew — raised, still open,
closed, found again, not audited — is still recorded and still counted by
`visitsSurvived()`; it is now written out in words in the detail pane's history
instead of drawn as six squares. `VisitStrip` is kept in the tree rather than
deleted, because the data it draws is unchanged and there will be somewhere with
room for it again.

**Still not decided, and it blocks nothing yet:** whether a finding's possible
events should roll up anywhere — a site-level list of "what could go wrong at
KSIA, by likelihood" is the obvious next thing to want from them and nothing
builds it today.

---

## 9. The Findings screen became the asset-system assessment (2026-09-10)

Built to Sarel's instruction. Two judgement calls in it that he may want to
overrule, and one thing that is now missing.

**1. The findings register is not gone; it moved.** The per-finding pane — its
own B170 cell, root cause, owner, due date, progress log, the walk-item block —
is lifted whole into `FindingDetail.tsx` and opens in a sheet from the asset
system's evidence list. Nothing about a finding stopped being editable. What
went is the *flat list of every finding on the site* as a landing view, and with
it the four figure cards at the top (raised / rated / red band / missing owner)
and the duplicate-finding warning that showed when two auditors raised the same
issue on the same check.

**The duplicate warning came back the same day** (2026-09-10, later in the same
session). It was the only place the app told anybody that one defect had been
counted twice, and it only means anything where the two rows are visible
together — so it sits on the asset system's "raised at this audit" list, which
is exactly where the pair always is: both findings are the same check and the
same issue, so they are always in the same asset system. Nothing is outstanding
from this paragraph; it is left in because a loss recorded and then fixed is
worth being able to see the shape of.

**2. Every asset system is listed, whether or not anything was found against
it.** 75 at King Shaka, so the left panel is long. The alternative — listing
only systems that carry a finding — would have made the screen shorter and
would have hidden the systems nobody assessed, which is exactly the gap the
screen exists to close. If the length becomes the complaint, the fix is a
filter, not a shorter list.

**3. The band is not computed from anything.** Not from the findings, not from
the check compliance, not from the 2025 rating. The screen says so on the page.
If Sarel wants a *suggested* cell proposed from the evidence — worst confirmed
finding band, say — that is easy and it must arrive as a suggestion the group
taps to accept, never as a value that counts unagreed. Say the word.
