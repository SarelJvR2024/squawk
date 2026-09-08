/* Two auditors, one audit.
 *
 *  Squawk keeps the audit in one device's IndexedDB, which is right for an
 *  apron with no signal and wrong for a team — and a team is what does an ACSA
 *  audit. Until the shared record exists, a day's work comes back together by
 *  each auditor sharing a bundle and one device merging the rest.
 *
 *  This is the one suite in the repo that runs the real module rather than
 *  reading it, because merge.ts is pure: state in, state out. Every assertion
 *  below is the actual function deciding, and the ones that matter most are not
 *  about what merges but about WHAT MUST NEVER BE LOST:
 *
 *    · evidence is unioned, not overwritten — a photograph on the losing side
 *      of a last-write-wins is still a photograph of a defect at a national key
 *      point, and dropping it would be destroying evidence to settle a clash of
 *      timestamps;
 *    · an append-only log stays append-only across a merge;
 *    · merging the same file twice does nothing the second time, because an
 *      auditor will absolutely do that;
 *    · and a bundle from the wrong audit is REFUSED, not warned about. Cape
 *      Town's captures inside King Shaka's visit is a mistake nobody would
 *      catch until the report was with ACSA.
 *
 *    node --import ./tests/alias.mjs tests/merge.test.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeBundle, refuse, summarise, duplicateFindings, BUNDLE_KIND } from "@/lib/merge";

const here = path.dirname(fileURLToPath(import.meta.url));

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

const T = 1_700_000_000_000;

const photo = (id, cloud = true) => ({
  id,
  kind: "photo",
  name: `${id}.jpg`,
  createdAt: T,
  createdBy: "Someone",
  ...(cloud ? { cloudUrl: `https://blob.example/${id}.jpg` } : {}),
});

const response = (checkId, over = {}) => ({
  checkId,
  compliance: null,
  observation: "",
  evidencePicked: [],
  issuesPicked: [],
  walkaboutPicked: null,
  attachments: [],
  captured: false,
  capturedBy: "",
  capturedAt: null,
  deskDoneBy: "",
  deskDoneAt: null,
  fieldDoneBy: "",
  fieldDoneAt: null,
  flaggedForField: false,
  ...over,
});

const bundle = (over = {}) => ({
  meta: {
    kind: BUNDLE_KIND,
    version: 1,
    entity: "KSIA",
    visit: "2026-09",
    exportedBy: "Prince",
    exportedAt: T,
    counts: { responses: 0, findings: 0, hazards: 0, verifications: 0 },
    photographsNotUploaded: 0,
    ...(over.meta ?? {}),
  },
  visit: { responses: {}, verifications: {}, captures: [], feedback: {}, ...(over.visit ?? {}) },
  findings: over.findings ?? [],
  hazards: over.hazards ?? [],
});

const mine = (over = {}) => ({
  entity: "KSIA",
  visit: "2026-09",
  visitData: { responses: {}, verifications: {}, captures: [], feedback: {}, ...(over.visitData ?? {}) },
  findings: over.findings ?? [],
  hazards: over.hazards ?? [],
});

const HERE = { entity: "KSIA", visit: "2026-09" };

/* ------------------------------ the refusals ------------------------------ */

check("a file that is not a bundle is refused", !!refuse({ hello: "world" }, HERE));
check("so is null", !!refuse(null, HERE));

check(
  "A BUNDLE FROM ANOTHER AIRPORT IS REFUSED",
  /CPTA/.test(refuse(bundle({ meta: { entity: "CPTA" } }), HERE) ?? ""),
  "Cape Town inside King Shaka's visit is not caught until the report is with ACSA"
);

check(
  "and from another visit at the same airport",
  !!refuse(bundle({ meta: { visit: "2027-03" } }), HERE),
  "a follow-up visit's captures are not this visit's"
);

check(
  "a bundle from a newer Squawk says so rather than half-reading it",
  /newer version/.test(refuse(bundle({ meta: { version: 99 } }), HERE) ?? "")
);

check("the right audit is not refused", refuse(bundle(), HERE) === null);

/* -------------------------------- responses ------------------------------- */

{
  const out = mergeBundle(
    mine(),
    bundle({ visit: { responses: { "KSIA-ELE-001": response("KSIA-ELE-001", { compliance: "C", updatedAt: T }) } } })
  );
  check(
    "a check only the other device answered arrives",
    out.visitData.responses["KSIA-ELE-001"]?.compliance === "C" &&
      out.report.responses.added.length === 1
  );
}

{
  const out = mergeBundle(
    mine({ visitData: { responses: { X: response("X", { compliance: "C", updatedAt: T }) } } }),
    bundle({ visit: { responses: { X: response("X", { compliance: "NC", updatedAt: T + 1000 }) } } })
  );
  check("the newer answer wins", out.visitData.responses.X.compliance === "NC");
  check(
    "and a record both devices changed is NAMED, not swallowed",
    out.report.contested.length === 1 &&
      out.report.contested[0].id === "X" &&
      out.report.contested[0].winner === "theirs",
    JSON.stringify(out.report.contested)
  );
}

{
  const out = mergeBundle(
    mine({ visitData: { responses: { X: response("X", { compliance: "C", updatedAt: T + 5000 }) } } }),
    bundle({ visit: { responses: { X: response("X", { compliance: "NC", updatedAt: T }) } } })
  );
  check("an older answer does not overwrite a newer one", out.visitData.responses.X.compliance === "C");
  check(
    "and losing is reported too, so somebody can go and look",
    out.report.contested[0]?.winner === "mine"
  );
}

/* ------------------------- WHAT MUST NEVER BE LOST ------------------------ */

{
  const out = mergeBundle(
    mine({
      visitData: {
        responses: {
          X: response("X", { compliance: "C", updatedAt: T + 5000, attachments: [photo("p-mine")] }),
        },
      },
    }),
    bundle({
      visit: {
        responses: {
          X: response("X", { compliance: "NC", updatedAt: T, attachments: [photo("p-theirs")] }),
        },
      },
    })
  );
  const ids = out.visitData.responses.X.attachments.map((a) => a.id);
  check(
    "EVIDENCE SURVIVES THE SIDE THAT LOST",
    ids.includes("p-mine") && ids.includes("p-theirs"),
    ids.join(", ") + " — the losing device's photograph is still a photograph of a defect"
  );
  check("and the count of what arrived is reported", out.report.attachmentsAdded === 1,
        String(out.report.attachmentsAdded));
}

{
  const shared = { at: T, by: "Prince", visit: "2026-09", outcome: null, note: "Raised with the SHE lead" };
  const out = mergeBundle(
    mine({
      findings: [
        { id: "F-1", entity: "KSIA", originVisit: "2026-09", updatedAt: T, progress: [shared, { ...shared, at: T + 10, note: "Mine only" }] },
      ],
    }),
    bundle({
      findings: [
        { id: "F-1", entity: "KSIA", originVisit: "2026-09", updatedAt: T + 1, progress: [shared, { ...shared, at: T + 20, note: "Theirs only" }] },
      ],
    })
  );
  const notes = out.findings[0].progress.map((n) => n.note);
  check(
    "an append-only log stays append-only across a merge",
    notes.includes("Mine only") && notes.includes("Theirs only"),
    notes.join(" | ")
  );
  check(
    "and a note both devices already had is not doubled",
    notes.filter((n) => n === "Raised with the SHE lead").length === 1,
    notes.join(" | ")
  );
  check(
    "the log comes back in the order it happened",
    out.findings[0].progress.every((n, i, a) => i === 0 || a[i - 1].at <= n.at)
  );
}

/* ------------------------- one defect, raised twice ----------------------- */

/* Two auditors both open KSIA-ELE-014 and both tap "no annual maintenance
   record". Each device mints its own random id, the merge keys on id, and the
   audit now counts one defect twice: twice in the register, rated twice, twice
   in what reaches ACSA. Nothing about that is visible — over the shared record
   the merge report is not even shown.

   REPORTED, NEVER COMBINED. The same button is legitimately raised once per
   switch room, and folding those together would destroy a real finding at a
   national key point — a worse failure than the duplicate it tidied. */
{
  const dup = (id, extra = {}) => ({
    id, entity: "KSIA", originVisit: "2026-09", updatedAt: T,
    checkId: "KSIA-ELE-014", issueIndex: 3,
    title: "No annual switchgear maintenance record", ...extra,
  });

  const out = mergeBundle(
    mine({ findings: [dup("F-AAAAA")] }),
    bundle({ findings: [dup("F-BBBBB")] })
  );

  check(
    "ONE DEFECT RAISED ON TWO DEVICES IS KEPT AS TWO FINDINGS, not silently folded",
    out.findings.length === 2,
    out.findings.map((f) => f.id).join(", ")
  );
  check(
    "and it is REPORTED, so somebody is asked to settle it",
    out.report.duplicates.length === 1 &&
      out.report.duplicates[0].ids.length === 2 &&
      out.report.duplicates[0].ids.includes("F-AAAAA") &&
      out.report.duplicates[0].ids.includes("F-BBBBB"),
    JSON.stringify(out.report.duplicates)
  );
  check(
    "the report names the check, so it can be gone and looked at",
    out.report.duplicates[0]?.checkId === "KSIA-ELE-014",
    out.report.duplicates[0]?.checkId
  );
  check(
    "and carries what each says it is about — which is how the two cases are told apart",
    JSON.stringify(out.report.duplicates[0]?.assets) === JSON.stringify([[], []]),
    JSON.stringify(out.report.duplicates[0]?.assets)
  );
  check(
    "the one line everybody reads says it too",
    /possible duplicate/.test(summarise(out.report)),
    summarise(out.report)
  );

  /* THE CASE THAT MUST NOT FIRE. Two switch rooms, one issue button: that is
     two findings and the asset tags are the whole point of them. */
  const two = duplicateFindings([
    dup("F-AAAAA", { assetIds: ["SAMPLE-KSIA-ELE-A001"] }),
    dup("F-BBBBB", { assetIds: ["SAMPLE-KSIA-ELE-A002"] }),
  ]);
  check(
    "two different assets still group — the app asks, it never decides",
    two.length === 1 &&
      JSON.stringify(two[0].assets) ===
        JSON.stringify([["SAMPLE-KSIA-ELE-A001"], ["SAMPLE-KSIA-ELE-A002"]]),
    JSON.stringify(two)
  );

  check(
    "a different issue button on the same check is NOT a duplicate",
    duplicateFindings([dup("F-AAAAA"), dup("F-BBBBB", { issueIndex: 4 })]).length === 0
  );
  check(
    "nor the same button on a different check",
    duplicateFindings([dup("F-AAAAA"), dup("F-BBBBB", { checkId: "KSIA-ELE-015" })]).length === 0
  );
  check(
    "and two ad-hoc findings are never grouped — a person typed those in their own words",
    duplicateFindings([
      dup("F-AAAAA", { issueIndex: null, adHoc: true }),
      dup("F-BBBBB", { issueIndex: null, adHoc: true }),
    ]).length === 0
  );

  /* A duplicate somebody has already looked at and kept must not be raised
     again on every sync. A system that repeats a settled question gets muted. */
  const again = mergeBundle(
    mine({ findings: [dup("F-AAAAA"), dup("F-BBBBB")] }),
    bundle({ findings: [dup("F-AAAAA"), dup("F-BBBBB")] })
  );
  check(
    "A DUPLICATE ALREADY IN THE AUDIT IS NOT RAISED AGAIN EVERY TIME TWO DEVICES SYNC",
    again.report.duplicates.length === 0,
    JSON.stringify(again.report.duplicates)
  );
}

/* --------------------------- findings and hazards ------------------------- */

{
  const out = mergeBundle(
    mine({ findings: [{ id: "F-1", entity: "KSIA", originVisit: "2026-09", updatedAt: T, title: "Mine" }] }),
    bundle({ findings: [{ id: "F-2", entity: "KSIA", originVisit: "2026-09", updatedAt: T, title: "Theirs" }] })
  );
  check(
    "two auditors raising different findings keep both",
    out.findings.length === 2 && out.report.findings.added.length === 1,
    out.findings.map((f) => f.id).join(", ")
  );
  check("this device's findings keep their order", out.findings[0].id === "F-1");
}

{
  const out = mergeBundle(
    mine({ hazards: [{ id: "HZ-1", entity: "KSIA", originVisit: "2026-09", updatedAt: T, event: "Old wording" }] }),
    bundle({ hazards: [{ id: "HZ-1", entity: "KSIA", originVisit: "2026-09", updatedAt: T + 1, event: "New wording" }] })
  );
  check("a hazard edited on both devices takes the newer wording", out.hazards[0].event === "New wording");
}

/* ------------------------------ idempotency ------------------------------- */

{
  const theirs = bundle({
    visit: { responses: { X: response("X", { compliance: "NC", updatedAt: T, attachments: [photo("p1")] }) } },
    findings: [{ id: "F-9", entity: "KSIA", originVisit: "2026-09", updatedAt: T, progress: [{ at: T, by: "P", visit: "2026-09", outcome: null, note: "n" }] }],
  });
  const once = mergeBundle(mine(), theirs);
  const twice = mergeBundle(
    { ...mine(), visitData: once.visitData, findings: once.findings, hazards: once.hazards },
    theirs
  );
  check(
    "MERGING THE SAME FILE TWICE CHANGES NOTHING",
    JSON.stringify(twice.visitData) === JSON.stringify(once.visitData) &&
      JSON.stringify(twice.findings) === JSON.stringify(once.findings),
    "an auditor will do this"
  );
  check(
    "and the second merge does not double the attachments",
    twice.visitData.responses.X.attachments.length === 1
  );
  check(
    "nor claim a clash with itself",
    twice.report.contested.length === 0,
    JSON.stringify(twice.report.contested)
  );
}

/* --------------------------- photographs, honestly ------------------------ */

{
  const out = mergeBundle(
    mine(),
    bundle({
      visit: {
        responses: {
          X: response("X", { updatedAt: T, attachments: [photo("up", true), photo("not-up", false)] }),
        },
      },
    })
  );
  check(
    "a photograph that never reached the record store is counted, not hidden",
    out.report.photographsWithoutImage === 1,
    String(out.report.photographsWithoutImage) + " — it arrives as a reference with no image"
  );
}

/* ------------------------------- the summary ------------------------------ */

{
  const out = mergeBundle(
    mine(),
    bundle({ visit: { responses: { X: response("X", { updatedAt: T }) } }, findings: [{ id: "F-1", updatedAt: T }] })
  );
  const line = summarise(out.report);
  check(
    "the summary names who it came from and what moved",
    /Prince/.test(line) && /1 check/.test(line) && /1 finding/.test(line),
    line
  );
}

/* --------------------- and the half that is not pure ---------------------
 *
 *  Everything above runs the real merge. These read the store, because they are
 *  claims about wiring rather than about logic: that every mutation says when
 *  it wrote, that a merge cannot reach another airport's records, and that an
 *  audit already half-captured on a tablet does not lose to an empty one.
 */

const store = fs.readFileSync(path.join(here, "..", "src", "lib", "store.ts"), "utf8");
const sharedLib = fs.readFileSync(path.join(here, "..", "src", "lib", "shared.ts"), "utf8");

check(
  "EVERY RESPONSE MUTATION STAMPS THE TIME, because they all funnel through patch()",
  /patch: \(checkId, p\) =>[\s\S]{0,400}updatedAt: Date\.now\(\)/.test(store),
  "setCompliance, toggleEvidence, toggleIssue, setWalkabout, appendObservation, the attachment calls and commit all end here"
);

for (const [fn, why] of [
  ["addFinding", "a finding raised on one device"],
  ["updateFinding", "a rating or an owner agreed on one device"],
  ["addFindingProgress", "a note added to a finding"],
  ["addHazard", "a hazard consolidated on one device"],
  ["updateHazard", "a hazard's wording"],
  ["patchVerification", "a carried-forward item verified"],
]) {
  /* The LAST occurrence, not the first: every action is declared in the State
     interface before it is implemented, and the declaration has no body. */
  const body = store.split(`${fn}:`).pop()?.slice(0, 600) ?? "";
  check(`${fn} says when it wrote — ${why}`, /updatedAt: Date\.now\(\)/.test(body));
}

/* A REFUSED MERGE MUST NOT ADVANCE THE PULL CURSOR.
 *
 *  The shared record pulls rows, hands them to importBundle, and stores the
 *  cursor the server sent back. If the merge is REFUSED — the bundle names an
 *  audit this device is no longer in, which happens when somebody switches
 *  airport or visit while a sync is in flight — nothing is applied, and moving
 *  the cursor anyway means those rows are never pulled again. Another auditor's
 *  afternoon would simply never appear on that device, with nothing said.
 *
 *  The push watermark two lines below already had this rule and said so in
 *  words: a failed sync must re-send, not skip. The pull cursor did not. */
check(
  "a REFUSED merge does not advance the pull cursor",
  /if \(json\.cursor && !refused\)/.test(sharedLib),
  "advancing past rows a refusal threw away is the same silent loss by another door"
);
check(
  "and the refusal is said rather than swallowed",
  /setLastError\(refused\)/.test(sharedLib) &&
    /setSyncState\(refused \? "error" : "synced"\)/.test(sharedLib),
  "a sync that quietly did nothing reads exactly like one that worked"
);

check(
  "importBundle REFUSES BEFORE IT WRITES",
  /const no = refuse\(b, \{ entity: s\.entity, visit: s\.visit \}\);\s*\n\s*if \(no\) return no;/.test(store),
  "a wrong-audit bundle must not half-apply"
);

check(
  "and a merge of one airport cannot touch another's records",
  /elsewhere\.findings/.test(store) && /elsewhere\.hazards/.test(store),
  "findings and hazards are flat across the whole programme; only this audit's are merged"
);

check(
  "the bundle carries only the audit in view",
  /const findings = s\.findings\.filter\(mine\);/.test(store),
  "a bundle is one audit's work, not a copy of the programme"
);

check(
  "THE MIGRATION BACK-FILLS rather than defaulting a half-captured tablet to zero",
  /if \(from < 13\)/.test(store) &&
    /Math\.max\(stamp\(r\.capturedAt\), stamp\(r\.deskDoneAt\), stamp\(r\.fieldDoneAt\)\)/.test(store),
  "0 loses to everything, so an audit already on a tablet would lose to an emptier copy"
);

check(
  "the persist key STILL has not moved",
  /name: "acsa-assurance-v1"/.test(store),
  "it is what a tablet's captured audit is stored under"
);

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nMERGE OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
