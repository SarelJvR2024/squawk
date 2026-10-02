import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* INCIDENT / NEAR-MISS REPORT — TK-003 form 5, added 2 October 2026, built
 *  field-by-field against Annexure 1 of the OHS Act (Act 85 of 1993),
 *  Regulation 9's General Administrative Regulations for Recording and
 *  Investigation of Incidents — not TPJV's own invention of what to ask.
 *  A FLAT RECORD, not a register of sub-entries: two sign-offs stand behind
 *  the facts and the investigation's findings, and the DoL/Compensation
 *  Commissioner notification fields and the HS Committee's remarks are
 *  deliberately outside what they attest to, because those move after
 *  signing as a matter of course. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "incident", "page.tsx");
const shell = src("components", "AppShell.tsx");
const hub = src("app", "(app)", "forms", "page.tsx");
const exportsSrc = src("lib", "exports.ts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const {
  BODY_PARTS,
  EFFECTS,
  INCIDENT_SIGNED_FIELDS,
  incidentSignedFieldsChanged,
  incidentText,
  missingFields,
  unbackedSignatures,
} = await import(path.join(here, "..", "src", "lib", "incident.ts"));

const sig = (over = {}) => ({
  ref: "INC-7K2P9_COMPLETED",
  blobKey: "sig-abc",
  signedName: "T. Nkosi",
  signedAt: Date.now(),
  width: 600,
  height: 264,
  bytes: 4000,
  ...over,
});

const report = (over = {}) => ({
  id: "INC-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  isNearMiss: false,
  date: "2026-10-02",
  time: "09:30",
  location: "MV switchroom, Pier B",
  affectedPersonName: "T. Nkosi",
  affectedPersonIdNumber: "",
  bodyPartAffected: "Hand",
  effect: "Contusion or wound",
  exposure: "Caught a finger closing a cabinet door",
  reportedToCompensationCommissioner: false,
  reportedToDoL: false,
  doLReference: "",
  doLNotifiedAt: null,
  investigatorName: "",
  investigatorDesignation: "",
  investigationDate: "",
  description: "",
  suspectedCause: "",
  recommendedSteps: "",
  actions: [],
  actionStatus: "Open",
  hsCommitteeRemarks: "",
  completedBy: "",
  completedSignature: null,
  competentPersonName: "",
  competentPersonSignature: null,
  attachments: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const ctx = { siteName: "O.R. Tambo International Airport (FAOR)", siteCode: "ORTIA", visitId: "2026-09" };

/* ------------------------------------------- 1. the statutory vocabulary */

check("there are eleven parts of body, matching Annexure 1", BODY_PARTS.length === 11, JSON.stringify(BODY_PARTS));
check("head is one of them", BODY_PARTS.includes("Head"));
check("there are five effects", EFFECTS.length === 5, JSON.stringify(EFFECTS));
check("fracture is one of them", EFFECTS.includes("Fracture"));

/* ------------------------------------------ 2. what the two signatures attest to */

check(
  "the facts and the investigation are signed for",
  INCIDENT_SIGNED_FIELDS.includes("description") &&
    INCIDENT_SIGNED_FIELDS.includes("suspectedCause") &&
    INCIDENT_SIGNED_FIELDS.includes("investigatorName")
);
check(
  "the DoL/Compensation Commissioner fields are NOT signed for",
  !INCIDENT_SIGNED_FIELDS.includes("reportedToDoL") &&
    !INCIDENT_SIGNED_FIELDS.includes("reportedToCompensationCommissioner") &&
    !INCIDENT_SIGNED_FIELDS.includes("doLReference"),
  "a notification sent the next morning must not unsign a record made the day before"
);
check(
  "nor are the HS committee's remarks",
  !INCIDENT_SIGNED_FIELDS.includes("hsCommitteeRemarks"),
  "a committee note added weeks later must not unsign the report"
);
check("changing the description invalidates both signatures", incidentSignedFieldsChanged({ description: "x" }) === true);
check("an empty patch invalidates nothing", incidentSignedFieldsChanged({}) === false);
check("adding a DoL reference does not invalidate it", incidentSignedFieldsChanged({ doLReference: "x" }) === false);
check(
  "the store clears both signatures when a signed field changes",
  /updateIncidentReport[\s\S]{0,700}incidentSignedFieldsChanged\(safe\)[\s\S]{0,300}completedSignature: null, competentPersonSignature: null/.test(
    store
  )
);
check(
  "and the signatures cannot be set by a stray patch",
  /updateIncidentReport[\s\S]{0,400}const \{ id: _i, createdAt: _c, completedSignature: _cs, competentPersonSignature: _ps, \.\.\.safe \}/.test(
    store
  )
);

/* ----------------------------------------------------- 3. what is still owed */

check("a bare near miss owes a description", missingFields(report({ isNearMiss: true })).includes("description"));
check(
  "a bare incident additionally owes an affected person and a part of body",
  missingFields(report({ affectedPersonName: "", bodyPartAffected: null })).includes("affected person") &&
    missingFields(report({ affectedPersonName: "", bodyPartAffected: null })).includes("part of body affected")
);
check(
  "a near miss does not owe either — there is nobody affected",
  !missingFields(report({ isNearMiss: true, affectedPersonName: "", bodyPartAffected: null })).includes("affected person")
);
check(
  "both signatures are owed until they are signed",
  missingFields(report()).includes("completer's signature") &&
    missingFields(report()).includes("competent person's signature")
);
check(
  "a fully completed, fully signed report owes nothing",
  missingFields(
    report({
      description: "Caught a finger closing a cabinet door",
      suspectedCause: "Door closer not adjusted",
      recommendedSteps: "Adjust the door closer",
      completedSignature: sig(),
      competentPersonSignature: sig({ ref: "INC-7K2P9_COMPETENT" }),
    })
  ).length === 0
);

/* -------------------------------------------- 4. signatures only on this device */

check(
  "an unbacked completer's signature is reported",
  unbackedSignatures(report({ completedSignature: sig() })).length === 1
);
check(
  "one that has been backed up is not",
  unbackedSignatures(report({ completedSignature: sig({ cloudUrl: "https://x" }) })).length === 0
);
check(
  "both signatures are checked, not just one",
  unbackedSignatures(
    report({ completedSignature: sig(), competentPersonSignature: sig({ ref: "INC-7K2P9_COMPETENT" }) })
  ).length === 2
);

/* ------------------------------------------------------------- 5. the text */

const bare = incidentText(report(), ctx);
check("it names the report", bare.includes("INC-7K2P9"));
check("it cites Annexure 1", bare.includes("Annexure 1"));
check("it carries the site", bare.includes("O.R. Tambo International Airport"));
check("the heading distinguishes incident from near miss", incidentText(report({ isNearMiss: true }), ctx).includes("NEAR MISS"));

const full = incidentText(
  report({
    description: "Caught a finger closing a cabinet door",
    completedSignature: sig(),
    reportedToDoL: true,
    doLReference: "DOL-2026-0417",
  }),
  ctx
);
check("the description is printed", full.includes("Caught a finger closing a cabinet door"));
check("a signed row names its reference", full.includes("INC-7K2P9_COMPLETED"));
check("the DoL reference is printed when notified", full.includes("DOL-2026-0417"));

/* ------------------------------------------------------------ 6. the store */

check(
  "an incident report is a flat record, not an occasion with sub-entries — no open/return guard needed",
  /addIncidentReport[\s\S]{0,100}=>/.test(store)
);
check("incident reports are persisted", /partialize[\s\S]{0,700}incidentReports: s\.incidentReports/.test(store));
check(
  "the persisted shape was versioned to carry the new slice",
  Number(/version: (\d+),/.exec(store)?.[1] ?? 0) >= 26
);
check(
  "the migration defaults the slice rather than leaving it undefined",
  /from < 26[\s\S]{0,700}Array\.isArray\(st\.incidentReports\)[\s\S]{0,80}st\.incidentReports = \[\]/.test(store)
);
check(
  "deleting a report releases both signatures",
  /removeIncidentReport[\s\S]{0,500}delBlobs\(keys\)/.test(store)
);
check(
  "the two sign-offs carry a fixed suffix, not a numbered one",
  /signIncidentCompleted: \(id, sig\) =>[\s\S]{0,400}ref: `\$\{id\}_COMPLETED`/.test(store) &&
    /signIncidentCompetentPerson: \(id, sig\) =>[\s\S]{0,400}ref: `\$\{id\}_COMPETENT`/.test(store)
);
check(
  "a signature carries its own actions list, reusing MitigationAction",
  /IncidentReport \{[\s\S]{0,2200}actions: MitigationAction\[\]/.test(types)
);

/* ------------------------------------------------------------- 7. reachable */

check("the register has a route", fs.existsSync(path.join(here, "..", "src", "app", "(app)", "incident", "page.tsx")));
check("it is reachable from the Forms hub", /href: "\/incident"/.test(hub));
check("it is not another entry in the nav bar", !/href:\s*"\/incident"/.test(shell));
check("it is not reachable directly from the shell's own menu any more", !/label="Incident/.test(shell));
check("a screen off the nav bar still has a heading of its own", /"\/incident": "Incident \/ near-miss report"/.test(shell));
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">Incident \/ near-miss report<\/h2>/.test(page)
);
check(
  "it is wired into the export workbook, named for what it is",
  /export function incidentSheet\(x: ExportInput\): Sheet \{/.test(exportsSrc) &&
    /name: "Incidents",/.test(exportsSrc)
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
