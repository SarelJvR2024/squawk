# The project's own registers and logs

What TPJV keeps during the ACSA Asset Assurance engagement, beyond the audit
capture itself — and which of it Squawk takes over.

**Rewritten 17 September 2026** against TPJV's own documents. The first version
of this file was inferred from ACSA's procedures because the template set was
empty; TK-003 and SF-005 have since arrived, and the inferred six-form list was
wrong in three places. What follows is read off the real documents.

---

## The scope rule

Sarel, 17 September 2026:

> build on the tablet everything that replaces hardcopy forms, not all other
> documents and files.

So the line is drawn at **a form somebody fills in and signs**, not at
"anything the project keeps". A certificate is a document — it gets stored, not
re-typed. An attendance sheet is a form — it gets replaced.

---

## 1 · The forms the tablet replaces — TK-003

`TPJV-ACSA-AA-TK-003 Field Forms`, 2 September 2026. Eight forms, carried on
site in hard copy today. All eight are in scope: each is a page somebody fills
in and signs on site.

| # | Form | Completed | Signed by | Feeds |
|---|---|---|---|---|
| 1 | **Immediate Safety Finding** | on identification, without delay | reporter + ACSA escort | SF-005 sheet 9 |
| 2 | **Site Attendance & Induction Confirmation** | on arrival, each day | each person, per day | SF-005 sheet 4 |
| 3 | **PPE Check** | before entering site, each day | checker | SF-005 sheet 6 |
| 4 | **Escort & Access Log** | continuously while airside | — | SF-005 sheet 4 |
| 5 | **Incident / Near-Miss Report** | on any incident | completer + competent person | SF-005 sheet 8 |
| 6 | **Toolbox Talk Record** | before each mobilisation | every attendee | SF-005 sheet 10 |
| 7 | **Document & Evidence Collection Log** | as evidence is collected | collector | the findings register, TK-012 |
| 8 | **Daily Site Closeout** | end of each site day | team lead + ACSA escort | confirms sheet 9 is complete |

### Where the inferred list was wrong

Worth recording, because the same mistake is easy to repeat:

- **Form 4 (Escort & Access Log) was not on the inferred list at all.** It is
  specific to how this contract actually works — escorted at all times airside
  — and no generic SHE-file list would have produced it.
- **Form 8 (Daily Site Closeout) was inferred as a "site diary".** It is not a
  diary. It is a closeout check whose real purpose is the line *"any safety
  findings today (Y/N) — all logged in SF-005 sheet 9 (Y/N)"*: it exists to
  catch a finding that was raised and not reported.
- **Form 7 (Document & Evidence Collection Log) was missed**, because it looks
  like audit capture. It is not — it tracks *ACSA's* documents handed over on
  site, which is a chain-of-custody record, not an observation.

Form 1 is the one to build first. It is the only form whose value is destroyed
by delay, and SWP-07 requires written notification the same day.

### What this needs that Squawk does not have

**A signature.** Forms 2, 3, 5, 6 and 8 are worth nothing unsigned — an
attendance register without signatures is a list somebody typed.

Signature capture has to be held to the same rules as a photograph, and for the
same reason:

- stored outside the persisted value, under its own key;
- given a reference, so the workbook and the record agree on what to call it;
- backed up to the record store, because a signature that exists on one tablet
  is a signature that can be lost;
- never silently dropped — a capture that could not be stored says so.

Form 1 and Form 8 additionally need an **ACSA escort signature**, which is a
second person signing on our device. That is a different trust question from a
team member signing, and it is worth deciding deliberately rather than by
default.

---

## 2 · The registers the forms feed — SF-005

`TPJV-ACSA-AA-SF-005 H&S Live Registers`, 1 September 2026. Thirteen sheets,
kept live across all ten sites for the duration of the contract.

| Sheet | Register | Fed by | App role |
|---|---|---|---|
| 1 | Cover | — | — |
| 2 | Legal Appointments | appointment letters | store only |
| 3 | Competent Persons | certificates | store only |
| 4 | Induction & Access | TK-003 forms 2 and 4 | **generated** |
| 5 | Training Record | certificates | store only |
| 6 | PPE Register | TK-003 form 3 | **generated** |
| 7 | Medical Surveillance | certificates | store only |
| 8 | Incident & Near-Miss | TK-003 form 5 | **generated** |
| 9 | Immediate Safety Findings | TK-003 form 1 | **generated** |
| 10 | Toolbox Talks | TK-003 form 6 | **generated** |
| 11 | Emergency Contacts | ACSA, at site induction | store only |
| 12 | Document & Permit Tracker | correspondence | store only |
| 13 | COIDA & Insurance | certificates | store only |

The sheet numbers matter: **TK-003 cites them directly** — form 1 says *"logged
in SF-005 sheet 9"*, form 8 asks *"all logged in SF-005 sheet 9 (Y/N)"*. Any
screen or export the app produces has to use the same numbers, or a form and a
register will disagree about which is which.

The distinction matters: **five registers become a derived view** the app emits
from captured forms, and the app should never ask anyone to type them. The rest
hold documents, and the app at most tracks whether one is current.

---

## 3 · Forms the tablet tracks but must NOT replace

These are **ACSA's own forms, issued to TPJV**. We hold the paper. Replacing
them is not ours to do; knowing they are valid is.

| Document | Issued under | What the app would do |
|---|---|---|
| **Permit to Work** (M&E 070) | S010 011M §4.8 | Hold which permit covers this site and scope, and when it expires. Per site **and per scope** — a scope change needs a new permit. |
| **Works on Aerodrome** (V010 005M) | S010 011M §4.8(b) | Signed before airside work starts |
| **Airside / AVSEC permit** (AVSEC Form No. 2) | airport security | Per person, per airport, expiry-dated |

A screen that says "permit in force until 14 March" is a log, not a form
replacement. Useful, and a different job.

---

## 4 · What stays out of the app entirely

**Documents.** Certificates of competency, medical fitness certificates,
appointment letters, the Section 37(2) mandatary agreement, baseline risk
assessments, safe working procedures, the safety file itself. These are stored
and produced on demand; nobody re-types them into a tablet.

**Desk registers.** RFI, risk / early warning, actions, meeting minutes,
compensation events, correspondence, document control. These are project
management, done at a desk, and they already have a home.

Recorded here only so that a later reader knows they were considered and
deliberately left out.

---

## 5 · Known before building

The blocker recorded in the first version of this file — *"there is no template
set to work from"* — **is now closed.** TK-003 and SF-005 are the templates,
and the field names above are read off them rather than guessed.

Two things remain open:

1. **Whether the ACSA escort signs on our device** (forms 1 and 8). A second
   party signing on a TPJV tablet is a different proposition from a team member
   signing, and it should be a decision rather than an implementation detail.
2. **The risk classification of this work**, because it changes how much file is
   needed. S010 011M §4.13 lists *"Consulting services"* under **Low Risk** —
   annual audit. §4.11(c) lists *"Work on the airside"* as a **high-risk
   activity** — monthly SHE file review audits, and below 90% the work permit is
   revoked. TPJV are consultants doing airside work, and appear to meet both
   descriptions. Raised with ACSA in the O.R. Tambo safety file (SF-006, part
   B4); pending written confirmation.

The build itself waits until after the O.R. Tambo dry run, so that the forms
are built against a site day that actually happened.

---

## Sources

- **TPJV-ACSA-AA-TK-003 Field Forms**, 2 September 2026 — the eight forms in
  section 1, read field by field.
- **TPJV-ACSA-AA-SF-005 H&S Live Registers**, 1 September 2026 — the thirteen
  registers in section 2.
- **TPJV-ACSA-AA-SF-004 Safety Plan and SWPs**, Rev 01B, 2 September 2026 —
  SWP-07 sets the reporting obligation Form 1 discharges.
- **S010 011M Contractor Management Requirements Procedure**, version 3,
  effective 19 May 2026. §4.5.1 SHE file contents, §4.8 Permit to Work, §4.15
  access and induction, §4.17 monthly reporting, §§4.11/4.13 risk
  classification.
- **NEC3 Professional Services Contract COR 7633/2024/RFP**, signed 29 April
  2026, on the portal under `Contract/01 Signed contract/`. **Not yet read in
  full** — the NEC obligations cited elsewhere come from the standard form and
  the kick-off minutes, not from its Z-clauses.
- **Onboarding / kick-off minutes**, 7 July 2026.
