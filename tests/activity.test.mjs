/* The activity log's normaliser — activityEvents().
 *
 *  Sarel's own request: "Build an audit log for me to keep track of all
 *  sync and captures to see what was done everyday by whom." This suite
 *  checks the half of that job activity.ts does — turning every capture
 *  type in the app into one flat, dated, attributed list — one positive
 *  case per record kind, direct and container attribution kept apart, and
 *  the sort order the whole screen depends on.
 *
 *  Run directly: activity.ts type-imports only, so it loads under plain
 *  node with no alias loader — same reasoning as risk-matrix.test.mjs's own
 *  note on risk.ts. */

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const { activityEvents } = await import("../src/lib/activity.ts");

/* ------------------------------------------------------------- fixtures --- */

const T = (s) => Date.parse(s);

const EMPTY_INPUT = {
  findings: [],
  hazards: [],
  responses: {},
  checks: [],
  adhoc: [],
  captures: [],
  safetyFindings: [],
  incidentReports: [],
  interviewDays: [],
  siteDays: [],
  ppeChecks: [],
  toolboxTalks: [],
  attendanceRegisters: [],
  siteAccessLogs: [],
  evidenceItems: [],
};
const input = (overrides) => ({ ...EMPTY_INPUT, ...overrides });

/* --------------------------------------------------------- empty input ---- */

check(
  "an entirely empty input produces no events",
  activityEvents(EMPTY_INPUT).length === 0
);

/* -------------------------------------------------------------- finding --- */

{
  const events = activityEvents(
    input({
      findings: [
        {
          id: "F-1",
          checkId: "KSIA-ELE-001",
          title: "corroded busbar",
          description: "x",
          createdAt: T("2026-09-15T08:00:00+02:00"),
          createdBy: "Prince Mahlangu",
        },
      ],
    })
  );
  check("a finding produces one direct event", events.length === 1);
  check(
    "the finding event is attributed directly to its createdBy",
    events[0].kind === "finding" &&
      events[0].byConfidence === "direct" &&
      events[0].by === "Prince Mahlangu" &&
      events[0].at === T("2026-09-15T08:00:00+02:00")
  );
  check(
    "the finding's summary names the finding, not just its id",
    events[0].summary.includes("corroded busbar")
  );
}

/* --------------------------------------------------------------- hazard --- */

{
  const events = activityEvents(
    input({
      hazards: [
        {
          id: "HZ-1",
          event: "fuel spill on apron",
          createdAt: T("2026-09-15T08:30:00+02:00"),
          createdBy: "Sarel Jansen van Rensburg",
        },
      ],
    })
  );
  check(
    "a hazard produces one direct event naming the hazard's event text",
    events.length === 1 &&
      events[0].kind === "hazard" &&
      events[0].byConfidence === "direct" &&
      events[0].by === "Sarel Jansen van Rensburg" &&
      events[0].summary.includes("fuel spill on apron")
  );
}

/* ------------------------------------------------------------- response --- */

{
  const checks = [{ id: "KSIA-ELE-001", discipline: "Electrical" }];

  const deskOnly = activityEvents(
    input({
      checks,
      responses: {
        "KSIA-ELE-001": {
          checkId: "KSIA-ELE-001",
          compliance: "C",
          deskDoneAt: T("2026-09-15T09:00:00+02:00"),
          deskDoneBy: "Prince Mahlangu",
          fieldDoneAt: null,
          fieldDoneBy: "",
        },
      },
    })
  );
  check(
    "a response with only the desk half done produces exactly one event",
    deskOnly.length === 1 && deskOnly[0].kind === "response-desk"
  );
  check(
    "the desk event is direct, names the check-point and the compliance word",
    deskOnly[0].byConfidence === "direct" &&
      deskOnly[0].by === "Prince Mahlangu" &&
      deskOnly[0].summary.includes("KSIA-ELE-001") &&
      deskOnly[0].summary.includes("Compliant")
  );

  const both = activityEvents(
    input({
      checks,
      responses: {
        "KSIA-ELE-001": {
          checkId: "KSIA-ELE-001",
          compliance: "NC",
          deskDoneAt: T("2026-09-15T09:00:00+02:00"),
          deskDoneBy: "Prince Mahlangu",
          fieldDoneAt: T("2026-09-16T10:00:00+02:00"),
          fieldDoneBy: "Sarel Jansen van Rensburg",
        },
      },
    })
  );
  check(
    "a response with BOTH halves done produces two genuinely separate events",
    both.length === 2
  );
  check(
    "the two events are the desk and field halves, each with its own who and when",
    both.some((e) => e.kind === "response-desk" && e.by === "Prince Mahlangu") &&
      both.some((e) => e.kind === "response-field" && e.by === "Sarel Jansen van Rensburg") &&
      both.find((e) => e.kind === "response-desk").at !==
        both.find((e) => e.kind === "response-field").at
  );

  const neither = activityEvents(
    input({
      checks,
      responses: {
        "KSIA-ELE-001": {
          checkId: "KSIA-ELE-001",
          compliance: null,
          deskDoneAt: null,
          deskDoneBy: "",
          fieldDoneAt: null,
          fieldDoneBy: "",
        },
      },
    })
  );
  check(
    "a response with neither half done produces no event at all",
    neither.length === 0
  );

  const unknownCheck = activityEvents(
    input({
      checks: [],
      responses: {
        "KSIA-ELE-999": {
          checkId: "KSIA-ELE-999",
          compliance: "NC",
          deskDoneAt: T("2026-09-15T09:00:00+02:00"),
          deskDoneBy: "Prince Mahlangu",
          fieldDoneAt: null,
          fieldDoneBy: "",
        },
      },
    })
  );
  check(
    "a response for a check not in the register still produces an event, by raw checkId",
    unknownCheck.length === 1 && unknownCheck[0].summary.includes("KSIA-ELE-999")
  );
}

/* ---------------------------------------------------------------- adhoc --- */

{
  const events = activityEvents(
    input({
      adhoc: [
        {
          id: "WALK-1",
          origin: "field",
          description: "loose paving outside Pier B",
          createdAt: T("2026-09-15T11:00:00+02:00"),
          createdBy: "Prince Mahlangu",
        },
      ],
    })
  );
  check(
    "an ad-hoc item produces one direct event naming the observation",
    events.length === 1 &&
      events[0].kind === "adhoc" &&
      events[0].byConfidence === "direct" &&
      events[0].summary.includes("loose paving outside Pier B")
  );
}

/* -------------------------------------------------------------- capture --- */

{
  const events = activityEvents(
    input({
      captures: [
        { id: "c1", kind: "photo", name: "n", area: "apron", createdAt: T("2026-09-15T11:30:00+02:00"), createdBy: "Prince Mahlangu" },
        { id: "c2", kind: "voice", name: "n2", area: "apron", createdAt: T("2026-09-15T11:31:00+02:00"), createdBy: "Prince Mahlangu" },
      ],
    })
  );
  check("two tray captures produce two direct events", events.length === 2);
  check(
    "a photo capture reads as a photo, not yet filed",
    events.some((e) => e.kind === "capture" && e.summary.includes("Photo") && e.summary.includes("not yet filed"))
  );
  check(
    "a voice capture reads as a voice note, not a photo",
    events.some((e) => e.kind === "capture" && e.summary.includes("Voice note"))
  );
}

/* --------------------------------------------------------- safety finding - */

{
  const differing = activityEvents(
    input({
      safetyFindings: [
        {
          id: "ISF-1",
          entity: "KSIA",
          originVisit: "2026-09",
          raisedAt: T("2026-09-15T07:00:00+02:00"),
          raisedBy: "Prince Mahlangu",
          recordedBy: "Sarel Jansen van Rensburg",
          description: "exposed cabling",
          createdAt: T("2026-09-15T07:05:00+02:00"),
        },
      ],
    })
  );
  check(
    "an ISF is attributed to recordedBy, with raisedBy named in the summary when it differs",
    differing.length === 1 &&
      differing[0].kind === "safety-finding" &&
      differing[0].byConfidence === "direct" &&
      differing[0].by === "Sarel Jansen van Rensburg" &&
      differing[0].summary.includes("Prince Mahlangu") &&
      differing[0].summary.includes("exposed cabling") &&
      differing[0].at === T("2026-09-15T07:00:00+02:00")
  );

  const same = activityEvents(
    input({
      safetyFindings: [
        {
          id: "ISF-2",
          entity: "KSIA",
          originVisit: "2026-09",
          raisedAt: T("2026-09-15T07:00:00+02:00"),
          raisedBy: "Prince Mahlangu",
          recordedBy: "Prince Mahlangu",
          description: "exposed cabling",
          createdAt: T("2026-09-15T07:05:00+02:00"),
        },
      ],
    })
  );
  check(
    "when raisedBy and recordedBy are the same person, the name is not repeated",
    (same[0].summary.match(/Prince Mahlangu/g) ?? []).length === 1
  );
}

/* ------------------------------------------------------------- incident --- */

{
  const events = activityEvents(
    input({
      incidentReports: [
        {
          id: "INC-1",
          entity: "KSIA",
          originVisit: "2026-09",
          isNearMiss: true,
          description: "dropped tool",
          completedBy: "Sarel Jansen van Rensburg",
          createdAt: T("2026-09-15T12:00:00+02:00"),
        },
      ],
    })
  );
  check(
    "a near-miss incident report reads as a near miss, attributed to completedBy",
    events.length === 1 &&
      events[0].kind === "incident-report" &&
      events[0].byConfidence === "direct" &&
      events[0].by === "Sarel Jansen van Rensburg" &&
      events[0].summary.toLowerCase().includes("near miss")
  );
}

/* ---------------------------------------------------- interview records --- */

{
  const events = activityEvents(
    input({
      interviewDays: [
        {
          id: "INT-1",
          entity: "KSIA",
          originVisit: "2026-09",
          date: "2026-09-15",
          location: "Maintenance office",
          openedAt: T("2026-09-15T13:00:00+02:00"),
          openedBy: "Sarel Jansen van Rensburg",
          entries: [
            { id: "e1", name: "T. Nkosi", role: "Maintenance lead", createdAt: T("2026-09-15T13:10:00+02:00") },
          ],
          apologies: [
            { id: "a1", name: "J. Dlamini", reason: "on leave", createdAt: T("2026-09-15T13:05:00+02:00") },
          ],
        },
      ],
    })
  );
  check("an interview day produces its own open event plus one per entry and apology", events.length === 3);
  check(
    "the day itself is opened directly, by the auditor who opened it",
    events.some((e) => e.kind === "interview-day-open" && e.byConfidence === "direct" && e.by === "Sarel Jansen van Rensburg")
  );
  check(
    "the interview entry has no who of its own — it is attributed to the day's opener, flagged as container",
    events.some((e) => e.kind === "interview-entry" && e.byConfidence === "container" && e.by === "Sarel Jansen van Rensburg" && e.summary.includes("T. Nkosi"))
  );
  check(
    "the apology is container-attributed the same way",
    events.some((e) => e.kind === "interview-apology" && e.byConfidence === "container" && e.summary.includes("J. Dlamini"))
  );
}

/* --------------------------------------------------------- site day/diary - */

{
  const events = activityEvents(
    input({
      siteDays: [
        {
          id: "ATT-1",
          entity: "KSIA",
          originVisit: "2026-09",
          date: "2026-09-15",
          location: "Terminal",
          openedAt: T("2026-09-15T06:00:00+02:00"),
          openedBy: "Prince Mahlangu",
          diaryEntries: [
            { id: "d1", category: "weather", text: "12mm rain overnight", createdAt: T("2026-09-15T06:30:00+02:00") },
          ],
          entries: [
            { id: "ae1", name: "Someone", createdAt: T("2026-09-15T06:05:00+02:00") },
          ],
        },
      ],
    })
  );
  check(
    "a site day opens directly and its diary entry is container-attributed",
    events.length === 2 &&
      events.some((e) => e.kind === "site-day-open" && e.byConfidence === "direct" && e.by === "Prince Mahlangu") &&
      events.some((e) => e.kind === "diary-entry" && e.byConfidence === "container" && e.summary.includes("12mm rain overnight"))
  );
  check(
    "SiteDay's own legacy attendance rows (entries) are deliberately not surfaced as a third event",
    !events.some((e) => e.summary.includes("Someone"))
  );
}

/* --------------------------------------------------------------- PPE check */

{
  const events = activityEvents(
    input({
      ppeChecks: [
        {
          id: "PPE-1",
          entity: "KSIA",
          originVisit: "2026-09",
          date: "2026-09-15",
          location: "Gate 3",
          openedAt: T("2026-09-15T07:00:00+02:00"),
          openedBy: "Sarel Jansen van Rensburg",
          people: [{ id: "p1", name: "J. Dlamini", createdAt: T("2026-09-15T07:05:00+02:00") }],
        },
      ],
    })
  );
  check(
    "a PPE check opens directly and its rows are container-attributed to the opener",
    events.length === 2 &&
      events.some((e) => e.kind === "ppe-check-open" && e.byConfidence === "direct") &&
      events.some((e) => e.kind === "ppe-entry" && e.byConfidence === "container" && e.summary.includes("J. Dlamini"))
  );
}

/* --------------------------------------------------------------- toolbox --- */

{
  const events = activityEvents(
    input({
      toolboxTalks: [
        {
          id: "TBX-1",
          entity: "KSIA",
          originVisit: "2026-09",
          date: "2026-09-15",
          topic: "fall protection",
          openedAt: T("2026-09-15T06:45:00+02:00"),
          openedBy: "Prince Mahlangu",
          attendees: [{ id: "a1", name: "T. Nkosi", createdAt: T("2026-09-15T06:50:00+02:00") }],
        },
      ],
    })
  );
  check(
    "a toolbox talk opens directly, naming its topic, and its attendee is container-attributed",
    events.length === 2 &&
      events.some((e) => e.kind === "toolbox-talk-open" && e.byConfidence === "direct" && e.summary.includes("fall protection")) &&
      events.some((e) => e.kind === "toolbox-attendee" && e.byConfidence === "container")
  );
}

/* ------------------------------------------------------- attendance reg --- */

{
  const events = activityEvents(
    input({
      attendanceRegisters: [
        {
          id: "ATR-1",
          entity: "KSIA",
          originVisit: "2026-09",
          date: "2026-09-15",
          time: "08:00",
          purpose: "morning muster",
          openedAt: T("2026-09-15T08:00:00+02:00"),
          openedBy: "Sarel Jansen van Rensburg",
          rows: [{ id: "r1", name: "J. Dlamini", createdAt: T("2026-09-15T08:05:00+02:00") }],
          apologies: [{ id: "ap1", name: "T. Nkosi", reason: "sick", createdAt: T("2026-09-15T08:06:00+02:00") }],
        },
      ],
    })
  );
  check(
    "an attendance register opens directly, naming the date and purpose",
    events.some((e) => e.kind === "attendance-register-open" && e.byConfidence === "direct" && e.summary.includes("2026-09-15") && e.summary.includes("morning muster"))
  );
  check(
    "its sign-in row is container-attributed to the register's opener",
    events.some((e) => e.kind === "attendance-row" && e.byConfidence === "container" && e.by === "Sarel Jansen van Rensburg" && e.summary.includes("J. Dlamini"))
  );
  check(
    "an apology on the same register is container-attributed too",
    events.some((e) => e.kind === "attendance-apology" && e.byConfidence === "container" && e.summary.includes("T. Nkosi"))
  );
  check("the register totals three events: itself, one row, one apology", events.length === 3);
}

/* ------------------------------------------------------------ site access - */

{
  const events = activityEvents(
    input({
      siteAccessLogs: [
        {
          id: "ACC-1",
          entity: "KSIA",
          originVisit: "2026-09",
          date: "2026-09-15",
          area: "MV switchroom",
          escortedBy: "J. Dlamini",
          openedAt: T("2026-09-15T10:00:00+02:00"),
          openedBy: "Prince Mahlangu",
          people: [{ id: "v1", name: "T. Nkosi", side: "ACSA", createdAt: T("2026-09-15T10:05:00+02:00") }],
        },
      ],
    })
  );
  check(
    "a site access log opens directly, naming the area and the escort",
    events.some((e) => e.kind === "site-access-log-open" && e.byConfidence === "direct" && e.summary.includes("MV switchroom") && e.summary.includes("J. Dlamini"))
  );
  check(
    "its visitor row is container-attributed and names which side they were on",
    events.some((e) => e.kind === "site-access-visitor" && e.byConfidence === "container" && e.summary.includes("T. Nkosi") && e.summary.includes("ACSA"))
  );
}

/* ------------------------------------------------------------ evidence --- */

{
  const events = activityEvents(
    input({
      evidenceItems: [
        {
          id: "DOC-1",
          entity: "KSIA",
          originVisit: "2026-09",
          title: "fire system test certificate",
          receivedBy: "Sarel Jansen van Rensburg",
          createdAt: T("2026-09-15T14:00:00+02:00"),
        },
      ],
    })
  );
  check(
    "an evidence item is attributed directly to receivedBy",
    events.length === 1 &&
      events[0].kind === "evidence-item" &&
      events[0].byConfidence === "direct" &&
      events[0].by === "Sarel Jansen van Rensburg" &&
      events[0].summary.includes("fire system test certificate")
  );
}

/* ------------------------------------------------------------ sort order - */

{
  const events = activityEvents(
    input({
      findings: [
        { id: "F-1", checkId: null, title: "early", description: "", createdAt: T("2026-09-15T08:00:00+02:00"), createdBy: "A" },
      ],
      hazards: [
        { id: "HZ-1", event: "late", createdAt: T("2026-09-16T08:00:00+02:00"), createdBy: "B" },
      ],
      adhoc: [
        { id: "WALK-1", origin: "field", description: "middle", createdAt: T("2026-09-15T20:00:00+02:00"), createdBy: "C" },
      ],
    })
  );
  check(
    "mixed kinds come back newest-first by `at`, not grouped by kind",
    events.length === 3 &&
      events[0].summary.includes("late") &&
      events[1].summary.includes("middle") &&
      events[2].summary.includes("early")
  );
}

console.log(failures === 0 ? "\nACTIVITY OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
