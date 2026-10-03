import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* SYSTEM-GENERATED REPORTS FOR THE SIX PROJECT-EVIDENCE FORMS.
 *
 *  Sarel: "the forms and registers is for evidence to record our project
 *  compliance and work done and attendance etc which we should be able to
 *  review and generate system generated reports with signatures and
 *  timestamps."
 *
 *  ISF, interviews, attendance and the evidence log each had a full screen
 *  and a real data model — including per-entry signatures, already captured
 *  with a name and a timestamp — but none of the four had ever reached the
 *  workbook. An auditor could see the register on the tablet and could not
 *  hand anyone a file of it. This suite is against that gap specifically:
 *  the sheets exist, they are wired into "Export the workbook", and each
 *  one prints who signed and when rather than just a raw blob key.
 *
 *  PPE checks and the site access log joined the same four on 1 October
 *  2026, when the forms were redesigned around a consistent header and a
 *  people-directory-linked picker — new forms, same reporting obligation. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");
const exports_ = src("lib", "exports.ts");
const panel = src("components", "ExportPanel.tsx");
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const exportsCode = codeOnly(exports_);
const panelCode = codeOnly(panel);

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- 1 · the four sheets exist ------------------------------------------ */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const [fn, name] of [
  ["isfSheet", "Safety (ISF)"],
  ["interviewsSheet", "Interviews"],
  ["attendanceSheet", "Attendance"],
  ["ppeSheet", "PPE checks"],
  ["siteAccessSheet", "Site access"],
  ["evidenceLogSheet", "Evidence log"],
]) {
  check(
    `${fn} is declared and names its sheet "${name}"`,
    new RegExp(`export function ${fn}\\(x: ExportInput\\): Sheet \\{`).test(exports_) &&
      new RegExp(`name: "${escapeRe(name)}",`).test(exports_),
    ""
  );
}

/* ---- 2 · each is scoped to the visit this export is of ------------------ */

for (const [fn, field] of [
  ["isfSheet", "safetyFindings"],
  ["interviewsSheet", "interviewDays"],
  ["attendanceSheet", "siteDays"],
  ["ppeSheet", "ppeChecks"],
  ["siteAccessSheet", "siteAccessLogs"],
  ["evidenceLogSheet", "evidenceItems"],
]) {
  check(
    `${fn} filters x.${field} to this visit, same as every other sheet`,
    new RegExp(`\\(x\\.${field} \\?\\? \\[\\]\\)\\s*\\.filter\\(\\([a-z]+\\) => [a-z]+\\.originVisit === x\\.visit\\)`).test(
      exportsCode
    ),
    "an export of one audit should say what THAT audit's forms captured, not the site's whole history"
  );
}

/* ---- 3 · signatures print as who and when, not a raw blob key ----------- */

check(
  "sigCell prints the signer's name and the timestamp, never the blob key",
  /const sigCell = \(s: Signature \| null\): string => \(s \? `\$\{s\.signedName\} · \$\{when\(s\.signedAt\)\}` : ""\);/.test(
    exportsCode
  ),
  "the workbook is the reviewable record; the image itself lives in the media store"
);

for (const fn of ["interviewsSheet", "attendanceSheet", "ppeSheet", "siteAccessSheet", "evidenceLogSheet"]) {
  check(
    `${fn} calls sigCell on the entry's own signature`,
    new RegExp(`${fn}[\\s\\S]*?sigCell\\(`).test(exportsCode),
    "an interview, an attendee and an evidence item each carry their own Signature"
  );
}

/* ---- 4 · timestamps are dates, not raw epoch numbers --------------------- */

check(
  "ISF prints when() for every timestamp a reviewer asks SWP-07 about",
  /isfSheet[\s\S]{0,600}?when\(f\.raisedAt\)[\s\S]{0,800}?when\(f\.notifiedAt\)[\s\S]{0,200}?when\(f\.writtenIssuedAt\)/.test(
    exportsCode
  ),
  "raisedAt to notifiedAt is the gap SWP-07 calls \"at once\"; raisedAt to writtenIssuedAt is \"the same day\""
);

/* ---- 5 · wired into the workbook and the export panel -------------------- */

check(
  "all six are in fullWorkbook, so \"Export the workbook\" carries them without a second button",
  /isfSheet\(x\),\s*\n\s*interviewsSheet\(x\),\s*\n\s*attendanceSheet\(x\),[\s\S]{0,100}ppeSheet\(x\),\s*\n\s*siteAccessSheet\(x\),[\s\S]{0,200}evidenceLogSheet\(x\),/.test(
    exportsCode
  ),
  "attendanceRegisterSheet(x), now sits between attendanceSheet and ppeSheet — the six this suite names are unmoved, just no longer flush against each other"
);

check(
  "and each is also offered as its own single-sheet download",
  /isf: \(\) => isfSheet\(x\),/.test(panelCode) &&
    /interviews: \(\) => interviewsSheet\(x\),/.test(panelCode) &&
    /attendance: \(\) => attendanceSheet\(x\),/.test(panelCode) &&
    /ppe: \(\) => ppeSheet\(x\),/.test(panelCode) &&
    /siteaccess: \(\) => siteAccessSheet\(x\),/.test(panelCode) &&
    /evidencelog: \(\) => evidenceLogSheet\(x\),/.test(panelCode),
  "a reviewer asking only for the attendance register should not have to open the whole workbook"
);

check(
  "the panel actually reads the six stores this needs",
  /const safetyFindings = useSafetyFindings\(\);/.test(panelCode) &&
    /const interviewDays = useInterviewDays\(\);/.test(panelCode) &&
    /const siteDays = useSiteDays\(\);/.test(panelCode) &&
    /const ppeChecks = usePpeChecks\(\);/.test(panelCode) &&
    /const siteAccessLogs = useSiteAccessLogs\(\);/.test(panelCode) &&
    /const evidenceItems = useEvidenceItems\(\);/.test(panelCode),
  "a sheet function with nothing passed to it produces an honestly empty sheet, which is not the same bug as this one — the data never reaching ExportInput at all"
);

console.log(failures === 0 ? "\nREPORTS OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
