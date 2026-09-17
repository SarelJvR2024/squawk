# The project's own registers and logs

What TPJV has to keep during the ACSA Asset Assurance engagement, beyond the
audit capture itself — and which of it Squawk takes over.

Researched 17 September 2026 from the sources at the bottom. **Nothing here is
built yet.** This is the list the build works from.

---

## The scope rule

Sarel, 17 September 2026:

> build on the tablet everything that replaces hardcopy forms, not all other
> documents and files.

So the line is drawn at **a form somebody fills in and signs**, not at
"anything the project keeps". A certificate is a document — it gets stored, not
re-typed. An attendance sheet is a form — it gets replaced.

That rule takes this list from about twenty-five items to six, which is the
point of having it.

---

## 1 · Forms the tablet replaces

Each of these is a page in a book somebody carries, fills in and signs. All six
are the same shape: a person, a date, a signature.

| Register | Signed by | When | Why it is on the list |
|---|---|---|---|
| **Attendance** | each person | daily, per site | Who was on site, on the day a finding was raised |
| **PPE issue** | receiver | on issue and on replacement | Standard SHE file requirement |
| **Induction** | inductee | once per person per site | **S010 011M §4.15(b)** — ACSA OHS induction before site access, explicitly |
| **Toolbox talk** | attendees | per talk | Standard; the topic is worthless without who heard it |
| **Site diary** | site lead | daily | The project filing plan has `13. Site Working Documents`, and it is empty |
| **Incident / near-miss** | reporter | as it happens | A report written later is a report written differently |

### What this needs that Squawk does not have

**A signature.** Attendance, PPE and induction are worth nothing unsigned — an
attendance register without signatures is a list somebody typed.

Signature capture has to be held to the same rules as a photograph, and for the
same reason:

- stored outside the persisted value, under its own key;
- given a reference, so the workbook and the record agree on what to call it;
- backed up to the record store, because a signature that exists on one tablet
  is a signature that can be lost;
- never silently dropped — a capture that could not be stored says so.

That is the only genuinely new capability in the six. Everything else is a form
over data the app already knows how to hold.

---

## 2 · Forms the tablet tracks but must NOT replace

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

## 3 · What stays out of the app entirely

**Documents.** Certificates of competency, medical fitness certificates,
appointment letters, the Section 37(2) mandatary agreement (OHS 040), HIRAs,
method statements, the SHE plan, the SHE file itself. These are stored and
produced on demand; nobody re-types them into a tablet.

**Desk registers.** RFI, risk / early warning, actions, meeting minutes,
compensation events, correspondence, document control. These are project
management, done at a desk, and they already have a home.

Recorded here only so that a later reader knows they were considered and
deliberately left out.

---

## 4 · Known before building

The list above is **inferred from ACSA's requirements, not read off TPJV's own
forms.** `05. Live Registers`, `08. Templates` and `13. Site Working Documents`
in the project filing plan are all empty, so there is no template set to work
from.

Two things are needed from Sarel before any of this is built:

1. **The forms themselves**, or photographs of the ones that go in the bag. The
   fields matter — mine would be a guess, and a register with the wrong columns
   is worse than none.
2. **Whether anything is missing.** Six is what ACSA's procedure and standard
   practice imply. It is not what a site lead necessarily carries.

One question outstanding with ACSA, because it changes how much file is needed:

> **S010 011M §4.13** lists *"Consulting services"* under **Low Risk** — annual
> audit. **§4.11(c)** lists *"Work on the airside"* as a **high-risk activity** —
> monthly SHE file review audits, and below 90% the work permit is revoked.
>
> TPJV are consultants doing airside work. Which classification applies should
> be confirmed in writing.

---

## Sources

- **S010 011M Contractor Management Requirements Procedure**, version 3,
  effective 19 May 2026 — the binding one. §4.5.1 lists the SHE file contents,
  §4.8 the Permit to Work, §4.15 access and induction, §4.17 monthly reporting.
- **NEC3 Professional Services Contract COR 7633/2024/RFP**, signed 29 April
  2026, on the portal under `Contract/01 Signed contract/`. **Not yet read in
  full** — the NEC obligations above come from the standard form and the
  kick-off minutes, not from its Z-clauses. Reading it properly will change
  section 3.
- **Onboarding / kick-off minutes**, 7 July 2026 — monthly RFI, monthly progress
  meetings whose minutes *are* the progress report, permit contingency funding,
  specialist studies by on-site contractors.
- **The project filing plan** itself, `01 Projects/ACSA Asset Assurance/` —
  thirteen numbered folders, of which `05. Live Registers` is the one this
  document is about.
