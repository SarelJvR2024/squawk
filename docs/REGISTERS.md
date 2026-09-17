# The project's own registers and logs

What TPJV keeps during the ACSA Asset Assurance engagement, beyond the audit
capture itself — and which of it Squawk takes over.

**Rewritten 17 September 2026** against TPJV's own documents, and **updated the
same day** against the executed contract (COR 7633/2024/RFP, read in full for
the first time while compiling the O.R. Tambo safety file). The first version
was inferred from ACSA's procedures because the template set was empty; TK-003
and SF-005 have since arrived, and the contract added obligations neither of
them carries on its face.

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
| 2 | Legal Appointments | appointment letters | **tracked** — appointments expire (max 3 years, S010 001M cl. 4) |
| 3 | Competent Persons | certificates | **tracked** — ECSA and SAQA registrations carry renewal dates |
| 4 | Induction & Access | TK-003 forms 2 and 4 | **generated** |
| 5 | Training Record | certificates | store only |
| 6 | PPE Register | TK-003 form 3 | **generated** |
| 7 | Medical Surveillance | — | **determination held, register stays empty** — see below |
| 8 | Incident & Near-Miss | TK-003 form 5 | **generated** |
| 9 | Immediate Safety Findings | TK-003 form 1 | **generated** |
| 10 | Toolbox Talks | TK-003 form 6 | **generated** |
| 11 | Emergency Contacts | ACSA, at site induction | **captured** — four ACSA contacts per site, ten sites |
| 12 | Document & Permit Tracker | correspondence | **tracked** — gates mobilisation, see section 2a |
| 13 | COIDA & Insurance | certificates | **tracked** — LOGS and policy expiry dates |
| — | **Site Attendance & Daily Diary** | TK-003 forms 2 and 8 | **generated** — not in SF-005; added as J14 of the O.R. Tambo safety file |
| — | **Safety File status, per site** | this project | **new** — see section 2b |

**Medical surveillance is now a determination, not a collection.** Part D4 of the
O.R. Tambo safety file records that no medical surveillance is required for this
scope: no construction work, no hazardous chemical agents handled, no asbestos or
lead disturbed, no sustained noise exposure, no confined space entry, no work at
height beyond permanent fixed access, no plant operated. Competence is evidenced
by professional registration instead. What the app holds is **the determination
and its review trigger** — if the working method ever changes to involve entry,
handling, disturbance or plant operation, the determination falls away and
surveillance is arranged before that work proceeds. The register itself stays
empty and explained.

The sheet numbers matter: **TK-003 cites them directly** — form 1 says *"logged
in SF-005 sheet 9"*, form 8 asks *"all logged in SF-005 sheet 9 (Y/N)"*. Any
screen or export the app produces has to use the same numbers, or a form and a
register will disagree about which is which.

The distinction matters: **five registers become a derived view** the app emits
from captured forms, and the app should never ask anyone to type them. The rest
hold documents, and the app at most tracks whether one is current.

### 2a · The permit tracker gates mobilisation

Reading the contract changed what this register is for. **Contract Data 20.1**
gives access to sites *"Following Airside Induction and Permit Process
completions"* — so ACSA's obligation to let us on site runs from completion of
that process, not from our audit date. **Part C4 clause 1.3** adds that *"the
Consultant shall have no claim against ACSA in the event that a permit request is
refused."*

The permit risk sits wholly with TPJV, and the audit date is not secured by the
calendar. A tracker that shows, per site, what is applied for and what is issued
is therefore not administration — it is the thing that says whether a site visit
can happen at all.

### 2b · Safety file status, per site

New, and it falls out of the contract rather than out of SF-005.

**Part C1.3, General Information item 9:** *"All documentation according to the
Safety checklist including a copy of the written Construction Manager appointment
in terms of construction regulation 8, must be submitted 7 days before work
commences."* That is the only submission deadline in the contract, and it repeats
for every one of the ten sites.

ACSA's own procedure then reviews the file on form **OHS 037 within seven working
days** (S010 011M cl. 4.5.2), with a **minimum 90% score** for high-risk
contractors or the work permit is revoked (cl. 4.11), and **no works commence
without safety file approval**.

So each site needs: file issued, submitted date, seven-day deadline computed from
the audit start, ACSA review outcome, score if given, and approval status. Ten
rows, each with a date that moves when the audit calendar moves. The app already
holds the audit calendar, so it can compute the deadline rather than have someone
remember it.

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

## 3a · What the contract added to the forms themselves

Field-level requirements that TK-003 does not carry on its face, found in C1.3:

| Contract requirement | Clause | What the form needs |
|---|---|---|
| Incidents reported to the **Provincial Director: Department of Labour** as well as to ACSA | C1.3 compliance item 10 | The Incident / Near-Miss form (TK-003 form 5) needs a DoL notification field — date, reference, who notified. It currently records ACSA only. |
| No permit-required work before an approved permit is obtained | C1.3 compliance item 12 | The Escort & Access log should record which permit authorised the visit |
| PPE issued **and worn at all times** | C1.3 compliance item 7 | The PPE check is a daily confirmation, not only an issue record — already form 3, worth keeping daily |
| Written safe working procedures made available, and every employee **made conversant** with them | C1.3 compliance item 8 | The SF-004 acknowledgement register is a signing exercise per person per revision — a ninth form, or an extension of form 2 |

---

## 3b · One screen worth more than any single register

Everything above answers a different question than the one actually asked before
a site visit, which is: **can we mobilise to this site on this date?**

The contract makes that answerable from data the app would already hold:

- safety file issued, submitted, and approved by ACSA (section 2b)
- airside induction complete for every mobilising person (J4)
- security vetting cleared, AVSEC permits issued (J12)
- PPE issued and serviceable (J6)
- appointments current and not expired (J2, J3)
- COIDA letter of good standing and insurance in date (J13)
- safe working procedures acknowledged by everyone mobilising (section 3a)
- emergency contacts obtained for the site (J11)

A single per-site readiness view over those eight is the highest-value thing on
this list. It is not a new register — it is a query across the ones already
described, and it turns "I think we're ready" into something with a date on it.

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
2. **The risk classification of this work**, because it sets whether the safety
   file is reviewed annually or monthly, and whether the 90% OHS 037 threshold
   applies. S010 011M §4.13 lists *"Consulting services"* under **Low Risk**;
   §4.11(c) lists *"Work on the airside"* as **high-risk**. TPJV are consultants
   doing airside work and appear to meet both. Raised with ACSA at SF-006 part
   B4.3; pending written confirmation. If high-risk applies, section 2b's score
   field is not decoration — it is the difference between holding a work permit
   and losing it.
3. **The ACSA Safety Checklist**, which defines what C1.3 item 9 obliges us to
   submit and has never been issued to TPJV. Until it arrives, section 2b can
   track submission but cannot check completeness against ACSA's own list.

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
- **NEC3 PSC COR 7633/2024/RFP, Part C1.3** (Occupational Health and Safety
  Agreement), **Contract Data 20.1** and **Part C4 clause 1.3** — read in full
  17 September 2026. Sections 2a, 2b and 3a come from these.
- **S010 011M Contractor Management Requirements Procedure**, version 3,
  effective 19 May 2026. §4.5.1 SHE file contents, §4.8 Permit to Work, §4.15
  access and induction, §4.17 monthly reporting, §§4.11/4.13 risk
  classification.
- **NEC3 Professional Services Contract COR 7633/2024/RFP**, signed 29 April
  2026. Parts C1 to C4 read in full on 17 September 2026. Parts 3 and 4 of the
  tender pack, and the Annexure B pricing spreadsheet, are still unread.
- **Onboarding / kick-off minutes**, 7 July 2026.
