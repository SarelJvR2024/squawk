# The checks a machine cannot make

Forty-two automated suites cover what can be asserted from source or driven
in a headless browser. This file is the rest: the things that need a real
device, a real network, a real Supabase project and a person who can tell
whether a photograph shows the right panel.

**It is not a substitute for the dry run — it is the dry run's checklist.** Work
down it once end to end before King Shaka, and again after any change to
capture, the store, the service worker or the sync.

Most items below name **what to do** and **what must be true**. The ones marked
**SILENT** are the ones worth doing carefully: they look correct when they are
broken, which is why no automated suite caught them and why a casual walkthrough
will not either.

Record the result beside each line — date, device, pass or what happened. A tick
with no device name is worth very little.

---

## 0 · READS AS A FAULT, IS NOT

Walked end to end on 2026-09-13, on the build now in production. Every screen
renders, every count moves when it should, and nothing was found broken. These
four will still look wrong on a first pass, and each is deliberate. Check them
against this list before writing them down as defects — that is the whole
reason this section exists.

- **The dashboard says `Captured · 0/324` and `0%` after you have answered
  checks.** Correct. "Captured" means the check is FINISHED — every half its
  type declares, desk *and* site. Answer three at the desk and the nav reads
  `Checks 3/315` while the dashboard still reads 0 captured, because nobody has
  been to look at the asset yet. The two numbers measure different things and
  both are right. This is the property that stops 290 checks reading as
  complete with nobody having walked the apron, so it is not going to change
  without a decision to change it.
- **`Checks 3/315` and `Inspection 0/290` do not add up to 324.** Correct.
  315 is what a desk can answer, 290 is what has something to go and see, and
  the two overlap: most checks are in both. 324 is the register.
- **A check answered but not saved shows a hollow dot**, and the count says
  "to save". That is the warning working, not a failed save.
- **Fonts come from Google.** With no signal the app paints immediately in the
  fallback typeface — measured at 149ms even with the font host hanging — so a
  different-looking font on the apron is not a fault. Nothing waits on it.

## 0b · NEW SINCE THE LAST ROUND — worth a deliberate look

- [ ] **The compliance answer is two rows now.** Compliant · Compliant,
      evidence pending · Non-compliant on top; N/A and Not available below, drawn
      quieter. Confirm the chosen one is unmistakable **outdoors in daylight** —
      it gained an inset ring for exactly that, and a tablet in the sun is the
      only place to judge it.
- [ ] **Number keys 1–4 still mean what they always meant**; the new option is
      on 5. Worth one deliberate press of each if you use the keyboard.
- [ ] **"Compliant, evidence pending"** records ACSA saying they comply with the
      proof still to come. Tag one, save, reload — it is still tagged. It counts
      as Compliant everywhere, and appears as its own column in the workbook.
- [ ] **Compose from taps, Draft with AI and the microphone are now icons inside
      the observation box**, top right. Photo stayed a full-size button in the
      bar. **Judge this with gloves on if you can** — it is the one change that
      trades target size for proximity, and the apron is where that is decided.

- [ ] **More → Shared record** is its own line in the menu now, next to Sync.
      The line itself says the state — *Enter the team passphrase*, *Joined*,
      *Not set up*. Open it on a device that has not joined and one that has,
      and check the line agrees with the sheet.
- [ ] **A photograph you did not take now opens at full size** on Visual review,
      fetched from the record copy. Take one on device A, join on device B, open
      it there and **try to read the smallest text in it**. Blurred means it fell
      back to the 240px preview — say so, that is the whole fix.
- [ ] **The photographs zip on a device that took none of them.** It should
      contain every image, not a short one. If any are missing they are listed
      at the bottom of `MANIFEST.csv` under *NOT IN THIS ZIP* and a yellow line
      says so on screen. **SILENT if it regresses** — a short zip looks fine.
- [ ] **Field inspection: Save & close, not Save & next**, and the issue list on
      a phone folds to four with a *Show all* under it. Judge the fold on the
      phone, standing up.

## 1. Before the walk

- [ ] `/preflight` on the **actual tablet**, on the **actual network**, outdoors.
      Microphone, camera, storage estimate and the offline cache all green.
- [ ] `/preflight` on the phone as well, if a phone will be used in Field.
- [ ] Storage estimate has room for a day of photographs. **SILENT** — a full
      device fails at the moment a photograph is taken, not before.
- [ ] The device clock is right. The app warns when it is not; confirm the
      warning is absent rather than assuming.
- [ ] The masthead shows the site and visit you intend to work in. Every count on
      every screen is scoped to those two.

## 2. Capture — the desk half

- [ ] Answer a check, press **Save**, then **hard-refresh the tab**. The answer is
      still there. **SILENT** — this is IndexedDB rather than memory, and it is
      the difference between a browser crash costing nothing and costing a day.
- [ ] Answer a check and do **not** save. The dot is **hollow** and the count
      reads "1 to save". **SILENT** — an answered-but-unsaved check that looks
      identical to an untouched one is how an answer never happens.
- [ ] Press Save on it. The dot fills and the "to save" count clears.
- [ ] **Save & next** moves to the next check *in the whole discipline*, not just
      the open system group, and opens that system's group if it was shut.
- [ ] Collapse the group you are working in. It stays collapsed until the walk
      leaves that system and comes back.
- [ ] The `Checks` badge counts **up** as you save. 315 is the denominator and
      does not move.
- [ ] Keyboard `1`–`4` set Compliant / Non-compliant / N/A / Not available.
      Pressing the same one twice clears it.
- [ ] Evidence, Likely answers, Issues, Walkabout and Snippets each open, and the
      counts on the tabs match what you tapped.
- [ ] The question to ask and the evidence line stay on screen while you work
      through the tabs.
- [ ] A check with no ACSA threshold says so, in the warn colour, rather than
      showing an empty panel. **SILENT** — silence reads as "nothing to see
      here"; it is the opposite, and it is itself a finding.

## 3. Voice, photographs and evidence leaving the device

- [ ] Record a voice note. It plays back.
- [ ] Transcribe it, if a model is configured. The transcript stays attached to
      the note and is **not** spliced into the observation.
- [ ] Take a photograph. It appears with its reference (`KSIA-XXX-000_P01`).
- [ ] Caption it. The caption reaches the export.
- [ ] Watch the masthead pill: "*N* on device only" should **clear** once the
      photograph reaches the record store. **SILENT** — if it stays, the evidence
      exists on that tablet and nowhere else, and nobody is told.
- [ ] Take four or five photographs in a row. Nothing is dropped and the app
      stays responsive.
- [ ] Deny the camera permission once, deliberately. The app says what happened
      rather than failing quietly.

## 4. Field inspection — the site half

- [ ] The 299 site checks are listed, including the nine that appear **only**
      here (`KSIA-ELE-004`, `-010`, `-018`, `-020`, `-022`, `-048`,
      `KSIA-MEC-029`, `KSIA-BFM-026`, `KSIA-PSR-016`).
- [ ] Answering the site half of a check that also has a desk half moves the
      `x/324` completion ring, and only then.
- [ ] A check needing both halves reads "desk done · awaiting site" until the
      site half is answered.

## 5. Review

- [ ] Every photograph and voice note captured this visit appears, grouped by
      discipline.
- [ ] Leave a feedback note. It stays **separate** from the observation and from
      the finding.
- [ ] An engineer who was not on the apron can find evidence without knowing
      which check carried it.

## 6. Findings, hazards and follow-up

- [ ] Raise a finding from an issue chip. It appears on the Findings badge.
- [ ] The suggested severity and likelihood are visibly **not** agreed until
      someone confirms the cell. **SILENT** — an unconfirmed suggestion that
      reads as a judgement is the single worst failure this app can have.
- [ ] Agree a rating on the B170 001M matrix. The dashboard's Red/Amber/Green
      counts move only now.
- [ ] Consolidate findings into a hazard and rate it on **ERM**. The two
      instruments stay separate; neither is derived from the other.
- [ ] Record root cause, treatment, owner and target date on a finding, and a
      progress note. The progress log is dated.
- [ ] Follow-up lists all 15 carried 2025 findings for King Shaka. Verify one as
      Closed and confirm it stops carrying.
- [ ] Two auditors raising the same issue on the same check are reported as
      **duplicates**, and are never silently combined.

## 7. The shared record — two devices

- [ ] Enter the team passcode on a second device. It joins the same audit.
- [ ] Capture on both. Neither overwrites the other.
- [ ] The merge report says what it did.
- [ ] Pull with one device's clock deliberately wrong. The app says the clock is
      wrong rather than losing or duplicating work. **SILENT**
- [ ] A capture that could not be stored says so. It is never silent.

## 8. Offline — the whole point

- [ ] Turn the network off **mid-check**. Keep working. Nothing blinks.
- [ ] Cold-start with the network off: close the tab, go offline, reopen. The app
      loads. **SILENT** — this is the service worker, and it is the difference
      between an audit and a day lost airside.
- [ ] Walk every screen offline. None of them error.
- [ ] Come back online. Queued photographs go up and the pill clears.
- [ ] Deploy while a device is offline, then bring it back. It does not get a
      shell newer than the assets it can fetch. **SILENT**

## 9. Export

- [ ] Export the workbook. Register, Findings, Hazards, Closure, Evidence
      request and Photographs sheets are all present and populated.
- [ ] What you captured is in it — spot-check three checks by portal id.
- [ ] Desk done, Site seen and Complete are **separate columns**. No single
      "Captured" column.
- [ ] The photographs zip contains the images, named to match the workbook's
      references.
- [ ] The check ids are the **site's** ids (`KSIA-…`, or the right prefix for
      whichever site you are in) — never another airport's.
- [ ] No `SAMPLE-` tag appears anywhere in the output.

**The gap named here last round is closed — check it reads right.** The
*Evidence request* sheet — the list that leaves the room for ACSA to action —
was built from the evidence chips an auditor TAPPED (`evidencePicked`) alone, so
a check tagged **"Compliant, evidence pending"** with no chip produced no row at
all. It does now:

- [ ] Tag a check *Compliant, evidence pending*, **pick no evidence chip**, and
      export. It has a row on the *Evidence request* sheet, with *Record
      requested* reading **"Not named — the auditor flagged evidence outstanding
      without picking the record"**.
- [ ] Its *State* reads **"Compliant on the auditor's assessment — record still
      to be produced"**, not "Requested".
- [ ] A check with chips tapped AND the tag set shows one row per chip, each
      with that same State.

**Still Sarel's to decide:** whether that row is what an RFI should actually be
generated from, and what the RFI itself looks like. The sheet now carries the
data either way; the wording above is a first cut and is meant to be argued
with.

## 10. The sync — the portal is configured now

Prince completed the Entra registration on 15 September 2026. **The four
`NEXT_PUBLIC_GRAPH_*` variables are yours to set in Vercel** — they were briefly
committed as defaults and taken straight back out on finding this repository is
public. Until they are set and redeployed, step 1 names exactly which are empty.

Three things to know before you press anything:

- **Only the registered origin can sign in.** One redirect URI exists. A
  preview build is refused by Microsoft *after* the password and the MFA
  prompt — the readiness list says so before you get there, provided
  `NEXT_PUBLIC_GRAPH_ORIGIN` is set. Unset, step 2 reads *not checked*, which
  is the truth rather than a pass.
- **The tenant must be the GUID.** Set to `organizations` the registration is
  refused with AADSTS50194, which reads like a broken app. Step 1 catches it
  on sight now.
- **MFA on the service account is on Prince's phone.** Arrange the first real
  sign-in with him; it is one prompt, once per tab.

- [ ] **More → Sync to the portal**: steps 1–6 of the readiness list all green.
- [ ] Step 1 names any variable that is still empty, by name.
- [ ] Step 2 — *Microsoft will redirect back to this deployment* — is green on
      the live site and **red on a preview**, naming the registered URI. Worth
      opening a preview once just to see it refuse in advance.
- [ ] Read the plan. Rows to add, rows to change, fields with no column, and
      everything left out with its reason.
- [ ] Write. The result reports what was written and what failed.
- [ ] Check the SharePoint lists by eye.
- [ ] **Run the sync a second time.** The plan now says *update*, not *create*,
      and the lists do not double. **SILENT** — a doubling sync looks like it
      worked, twice.
- [ ] **Step 5 names the two lists it will write to**, not just "all found".
      Each airport has its own Check-points list, so read the names and confirm
      they are King Shaka's before writing anything.
- [ ] **The compliance values in SharePoint read as the portal's own choices**
      — `C - Compliant`, not a bare `C`. The options are read off the column on
      every run; if one has no match the plan says so and writes it unchanged.
- [ ] **A non-compliant check with no observation carries a placeholder** in
      SharePoint rather than a blank or ACSA's old text — *"Non-compliant. No
      supporting evidence or observation was recorded during the audit…"*. Read
      it once and tell me if the wording is wrong for ACSA; it is one constant.
- [ ] **Another airport's rows are never touched.** The plan says how many rows
      in the list belong elsewhere. If that number is close to the size of the
      whole list, the matcher has the wrong list — check the names in step 5.
- [ ] **A Title the portal holds twice is refused**, named, and left alone.
- [ ] **A non-compliant check with no finding is warned about, and still syncs.**
      The plan should say so many non-compliant check-points have no finding
      behind them. It is a warning, never a refusal — a non-compliant answer is
      the truth and belongs in the portal.
- [ ] A check with no compliance status is skipped and the plan says so.
- [ ] **AN UPDATE NEVER BLANKS A CELL.** Put text in a check-point's Observation
      column in SharePoint by hand, answer that check in Squawk WITHOUT typing
      an observation, sync, and the SharePoint text is **still there**. Then
      type an observation and sync again — now it is replaced. **SILENT if it
      regresses**: the first real sync blanked ACSA's own text on 33 rows and
      nothing said so.
- [ ] **A check tagged *Compliant, evidence pending* goes across as `C`** with
      the observation starting *EVIDENCE PENDING — …*. The portal has four
      compliance values and Squawk does not invent a fifth; this is how the flag
      travels. Confirm it reads sensibly to somebody looking at the list.
- [ ] **The photographs are OFF by default** and the button's count excludes
      them — 33 rows and 5 photographs reads *Write 33*, not 38. Ticking the
      box puts them back. Sarel, 16 September: not wanted in the portal at this
      stage.
- [ ] **Photographs upload from a device that did not take them** — only worth
      testing once the box above is ticked. Same test as the zip, through the
      sync.
- [ ] **An inspection's photograph is in the count and lands too.** Capture an
      inspection with a photo, read the portal, and the photograph tile should
      include it. It is named `WALK-xxxxx_P01.jpg`, so it cannot be confused
      with a check-point's in the same folder. **The inspection ITEM is still
      not a portal row** — it reaches the portal only through a finding
      consolidated into a hazard, which is a decision for ACSA rather than a
      gap to fill quietly.
- [ ] **They land under the airport AND the visit** — in the **Evidence**
      library, `King Shaka International Airport FALE/2026-09/`. The site folder
      comes from the site table, so another airport gets its own for free. The
      visit folder is what stops March 2027 overwriting September 2026: the
      filename repeats across visits and the upload replaces on conflict.
- [ ] **It is ACSA's folder, not a second one beside it.** The library already
      has ten folders, one per site, in ACSA's spelling — `King Shaka
      International FALE`, not `King Shaka International Airport FALE`. The sync
      reads the library's top level and writes into the one it finds. Two King
      Shaka folders side by side is the regression to watch for.
- [ ] **The path does not repeat the library's own name.** The first five real
      photographs landed in `Evidence/Evidence/King Shaka…` because the folder
      was prefixed `Evidence/` inside a library already called Evidence. The
      prefix now depends on the library's name, so check the breadcrumb: one
      **Evidence**, then the airport.
- [ ] **A partial write says so.** If anything fails, the summary reads *"N of
      M written"* and every missing row is named underneath. **SILENT if it
      regresses** — the first real write reported "33 written. Everything in the
      plan reached the portal" while five photographs had gone nowhere.
- [ ] **Nothing is ever deleted.** The account has Contribute without Delete, so
      a delete would 403 — there is none in the code, but if you ever see one,
      that is the bug.
- [ ] An unagreed ERM rating goes across as a row with **no** severity,
      likelihood, priority or tolerance.
- [ ] ACSA role sees no Sync and no Export at all.

## 11. Only Sarel can do these

- [ ] Prove a captured check reaches the real Supabase:
      `select … from squawk_records order by server_at desc limit 5;`
- [ ] `/preflight` on his own phone, outdoors, on the real network.
- [ ] The end-to-end dry run itself — item #52 in the backlog is blocked on it.
- [ ] Anything touching credentials: the Entra registration, the sync account,
      and the environment variables in Vercel.
- [ ] **The four `NEXT_PUBLIC_GRAPH_*` variables in Vercel**, then a redeploy.
      They are read at build time, so setting them without one changes nothing.
- [ ] **The first real Microsoft sign-in**, with Prince on the phone for the MFA
      prompt. Tell him when.
- [ ] **`SQUAWK_TEAM_PASSPHRASE` scoped to Production as well as Preview.**
      The record copy of every photograph is served through it — without it the
      full-size images do not reach a second device, and the zip on that device
      comes out short.

---

## What is deliberately not here

Anything an automated suite already asserts. If a check below could be written
as a suite, it should be — and if one of these finds a bug, the fix ships with a
suite that would have caught it, which is how every silent-failure class in
`tests/README.md` got there.

---

## 12 · Things seen on the walk, and the number they must not touch

Machine-checked: that the completion denominator does not move, that the item
persists a reload, that collapse and re-expand lose nothing, and that no export
column can be read as a register check-point.

**SILENT if broken — a person has to look:**

- **Take an actual photograph on an actual phone from inside the Add item
  sheet.** The file input, the downscale and the blob store are all covered by
  tests; what is not is whether the rear camera opens, whether the sheet
  survives the camera app taking over the screen, and whether the photograph is
  still attached to the right item when it comes back. On iOS the browser may
  discard the page while the camera is up. If the item is gone or empty when you
  return, the whole feature is worthless on the device it exists for.
- **Record one with gloves on, walking.** The button is 56px and bottom-right;
  that is a measurement, not a test. Whether it is *hittable* is not something a
  headless browser can answer.
- **Check the item is still there tomorrow.** Everything is local-first: an
  observation that reached React state but not IndexedDB looks identical to one
  that persisted, until the tab is closed.
- **Two auditors, two devices, one audit.** Record a walk item on each, sync,
  and confirm both survive. The merge unions by id and the ids are random, so
  a collision is not the risk — a walk item never reaching the shared record at
  all is, and it would look exactly like an auditor who forgot to record one.

## 13 · The Follow-up timeline

**SILENT if broken:**

- **Count the cells against the cycle strip.** The strip is one cell per visit
  at this entity, oldest first. If a visit is missing from the strip, an item
  that survived it looks a visit younger than it is — and "survived 3 visits" is
  the figure the close-out conversation runs on.
- **Confirm the hatched cells are the visits nobody audited.** At King Shaka
  today those are Sep 2025 and Mar 2026, both marked `skipped` in
  `programme.json`. A hatched cell where an audit actually happened, or a blank
  where one did not, both read as "nothing was wrong" — which is the opposite of
  what they mean, and the reason this is drawn at all.
