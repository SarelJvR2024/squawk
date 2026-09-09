# The checks a machine cannot make

Thirty-four automated suites cover what can be asserted from source or driven
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

## 10. The sync — once the portal is configured

- [ ] **More → Sync to the portal**: steps 1–5 of the readiness list all green.
- [ ] Read the plan. Rows to add, rows to change, fields with no column, and
      everything left out with its reason.
- [ ] Write. The result reports what was written and what failed.
- [ ] Check the SharePoint lists by eye.
- [ ] **Run the sync a second time.** The plan now says *update*, not *create*,
      and the lists do not double. **SILENT** — a doubling sync looks like it
      worked, twice.
- [ ] A check with no compliance status is skipped and the plan says so.
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

---

## What is deliberately not here

Anything an automated suite already asserts. If a check below could be written
as a suite, it should be — and if one of these finds a bug, the fix ships with a
suite that would have caught it, which is how every silent-failure class in
`tests/README.md` got there.
