import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The document and evidence collection log — TK-003 form 7 on the tablet.
 *
 *  This form was MISSED off the first, inferred list of what the tablet should
 *  replace, and the reason is worth keeping in front of whoever changes it: it
 *  looks like audit capture and it is not. It tracks ACSA's own documents,
 *  handed over on site — a chain-of-custody record, not an observation. 180 of
 *  the 324 check-points are `confirmedBy: "Document"`, so it sits behind more
 *  than half the audit.
 *
 *  Eleven parts. Five rules a plausible refactor could invert:
 *
 *    Requested is a state     A log of what ARRIVED cannot say what is missing,
 *                             and what is missing is the only question anybody
 *                             asks this between site visits. Outstanding is
 *                             computed, ordered first, and printed first.
 *
 *    Producing it contradicts Receiving a document clears any standing "cannot
 *    the refusal              be produced" declaration. Without that the same
 *                             row reads as both received and missing, and the
 *                             register has to pick — which is a decision no
 *                             register should be making.
 *
 *    A photograph is not      Nothing left ACSA's premises, so it can never be
 *    an original held         an original on loan however the box is ticked,
 *                             and must not sit on the return list forever.
 *
 *    The bridge               A check marked "compliant, evidence pending" with
 *                             nothing logged here is a debt nobody is chasing.
 *                             This is the only place the two records meet.
 *
 *    Custody, not compliance  A document BEARS ON check-points. Nothing here
 *                             settles one, and there is no path from this
 *                             screen to a Response. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const page = src("app", "(app)", "evidence", "page.tsx");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const {
  MEDIUM_LABEL,
  RETURNABLE,
  checkIdsCovered,
  evidenceStage,
  heldMs,
  heldOriginals,
  isHeldOriginal,
  isOutstanding,
  itemGaps,
  logText,
  outstanding,
  pendingWithoutEntry,
  unbackedSignatures,
} = await import(path.join(here, "..", "src", "lib", "evidence.ts"));

const REQUESTED = new Date("2026-09-29T09:00:00").getTime();
const RECEIVED = new Date("2026-09-30T11:30:00").getTime();

const sig = (over = {}) => ({
  ref: "DOC-7K2P9_S01",
  blobKey: "sig-xyz",
  signedName: "S. Jansen van Rensburg",
  signedAt: RECEIVED,
  ...over,
});

/* Exactly what addEvidenceItem creates: a title, and a request as of now. */
const item = (over = {}) => ({
  id: "DOC-7K2P9",
  entity: "FAOR",
  originVisit: "2026-09",
  title: "AGL daily serviceability inspection logs, Jan–Sep 2026",
  documentNo: "",
  revision: "",
  documentDate: null,
  requestedAt: REQUESTED,
  requestedFrom: "",
  receivedAt: null,
  receivedFrom: "",
  receivedBy: "S. Jansen van Rensburg",
  medium: null,
  isOriginal: false,
  returnedAt: null,
  returnedTo: "",
  unavailableAt: null,
  unavailableReason: "",
  checkIds: [],
  attachments: [],
  signature: null,
  notes: "",
  createdAt: REQUESTED,
  updatedAt: REQUESTED,
  ...over,
});

const received = (over = {}) =>
  item({
    requestedFrom: "T. Nkosi, Airport Manager",
    receivedAt: RECEIVED,
    receivedFrom: "T. Nkosi, Airport Manager",
    medium: "paper",
    checkIds: ["KSIA-ELE-005"],
    signature: sig(),
    ...over,
  });

const ctx = {
  siteName: "O.R. Tambo International Airport (FAOR)",
  siteCode: "ORTIA",
  visitId: "2026-09",
  portalId: (id) => id.replace("KSIA-", "ORTIA-"),
};

/* --------------------------------------------- 1. requested is a real state */

check("a logged-but-unreceived document is outstanding", isOutstanding(item()) === true);
check("a received one is not", isOutstanding(received()) === false);
check(
  "one ACSA has said cannot be produced is not outstanding either",
  isOutstanding(item({ unavailableAt: RECEIVED, unavailableReason: "No such record" })) === false,
  "it is answered — badly, but answered, and it usually becomes the finding"
);
check(
  "outstanding() filters to exactly those",
  outstanding([item(), received(), item({ id: "b" })]).length === 2
);

/* ------------------------------------------------------------ 2. the stages */

check("a bare entry reads requested", evidenceStage(item()) === "requested");
check("a received one reads received", evidenceStage(received()) === "received");
check(
  "a returned one reads returned",
  evidenceStage(received({ isOriginal: true, returnedAt: RECEIVED + 86_400_000 })) === "returned"
);
check(
  "a refused one reads not produced",
  evidenceStage(item({ unavailableAt: RECEIVED })) === "unavailable"
);
check(
  "receiving outranks a stale refusal",
  evidenceStage(received({ unavailableAt: REQUESTED })) === "received",
  "the store clears it on receipt; this ordering means a stale one cannot hide a received document"
);
check(
  "and the store does clear it, rather than leaving the two to argue",
  /receiveEvidence[\s\S]{0,900}unavailableAt: null[\s\S]{0,120}unavailableReason: ""/.test(store),
  "producing the document contradicts having said it could not be produced"
);

/* -------------------------------------------- 3. an original is an obligation */

check(
  "ACSA's paper, received and not returned, is held",
  isHeldOriginal(received({ isOriginal: true })) === true
);
check(
  "once returned it is not",
  isHeldOriginal(received({ isOriginal: true, returnedAt: RECEIVED + 1000 })) === false
);
check("a copy is never held", isHeldOriginal(received({ isOriginal: false })) === false);
check(
  "an original that never arrived is not held",
  isHeldOriginal(item({ isOriginal: true })) === false
);
check(
  "A PHOTOGRAPH IS NEVER AN ORIGINAL HELD",
  isHeldOriginal(received({ isOriginal: true, medium: "photographed" })) === false,
  "nothing left ACSA's premises, so it cannot sit on the return list forever"
);
check(
  "nor is a portal download, nor something only said out loud",
  isHeldOriginal(received({ isOriginal: true, medium: "portal" })) === false &&
    isHeldOriginal(received({ isOriginal: true, medium: "verbal" })) === false
);
check(
  "only paper and a digital file can be handed back",
  JSON.stringify([...RETURNABLE]) === JSON.stringify(["paper", "digital"]),
  `got ${JSON.stringify([...RETURNABLE])}`
);
check(
  "and the store un-ticks 'original' when the medium cannot be one",
  /receiveEvidence[\s\S]{0,1200}RETURNABLE\.includes\(medium\) \? \{\} : \{ isOriginal: false \}/.test(
    store
  )
);
check(
  "heldOriginals lists them",
  heldOriginals([received({ isOriginal: true }), received({ id: "b" })]).length === 1
);

/* ------------------------------------------------- 4. how long it is held */

check("nothing received has been held for no time", heldMs(item(), RECEIVED) === null);
check(
  "a held original is measured to now",
  heldMs(received({ isOriginal: true }), RECEIVED + 86_400_000) === 86_400_000
);
check(
  "a returned one is measured to its return, not to now",
  heldMs(
    received({ isOriginal: true, returnedAt: RECEIVED + 3600_000 }),
    RECEIVED + 999_999_999
  ) === 3600_000
);
check(
  "an unread clock reports nothing rather than fifty-six years",
  heldMs(received({ isOriginal: true }), 0) === null
);
check(
  "a clock that went backwards cannot produce a negative",
  heldMs(received({ isOriginal: true, returnedAt: RECEIVED - 5000 }), 0) === 0
);

/* -------------------------------- 5. the bridge to "compliant, evidence pending" */

const logged = [received({ checkIds: ["KSIA-ELE-005", "KSIA-CIV-052"] })];
check(
  "a pending check with a log entry is not reported",
  pendingWithoutEntry(["KSIA-ELE-005"], logged).length === 0
);
check(
  "a pending check with nothing logged IS reported",
  JSON.stringify(pendingWithoutEntry(["KSIA-ELE-005", "KSIA-PSR-011"], logged)) ===
    JSON.stringify(["KSIA-PSR-011"]),
  "nobody is chasing it, and nobody notices until the report is being written"
);
check(
  "nothing pending means nothing to report",
  pendingWithoutEntry([], logged).length === 0
);
check(
  "an empty log reports every pending check",
  pendingWithoutEntry(["a", "b"], []).length === 2
);
check(
  "the screen reads it off the responses, not off a second copy of the rule",
  /r\.evidencePending/.test(page) && /pendingWithoutEntry/.test(page)
);
check(
  "every check-point the log covers, deduplicated",
  JSON.stringify(
    checkIdsCovered([
      received({ checkIds: ["a", "b"] }),
      received({ id: "x", checkIds: ["b", "c"] }),
    ])
  ) === JSON.stringify(["a", "b", "c"])
);

/* ------------------------------------------- 6. custody, never compliance */

check(
  "the screen says the link bears on rather than settles",
  /BEARS ON — DOES NOT SETTLE/.test(page)
);
check(
  "there is no path from this screen to a response, a status or a finding",
  !/setResponse|patchResponse|setCompliance|addFinding/.test(page),
  "180 checks turn on a document; a log that could mark them compliant would be the audit"
);
check(
  "the type says why this is not audit capture, where the next reader will see it",
  /IT LOOKS LIKE AUDIT CAPTURE AND IT IS NOT/.test(types)
);
check(
  "and the composed log says it to whoever receives it",
  logText([received()], ctx).includes("nothing here settles one")
);

/* ------------------------------------------------------ 7. what is still owed */

const gaps = itemGaps(item());
check("an unreceived entry owes who it was asked of", gaps.includes("who it was asked of"));
check("and which check-points it bears on", gaps.includes("which check-points it bears on"));
check("a title IS enough to log one", !gaps.includes("what it is"));
check(
  "an unreceived entry is NOT asked for a signature",
  !gaps.includes("the collector's signature"),
  "nobody collected anything yet"
);
const rgaps = itemGaps(received({ signature: null, receivedFrom: "", medium: null }));
check("a received entry owes who handed it over", rgaps.includes("who handed it over"));
check("and how it was received", rgaps.includes("how it was received"));
check("and the collector's signature", rgaps.includes("the collector's signature"));
check("a complete received entry owes nothing", itemGaps(received()).length === 0,
  `got ${JSON.stringify(itemGaps(received()))}`);
check(
  "a refusal with no reason given owes one",
  itemGaps(item({ unavailableAt: RECEIVED, checkIds: ["a"] })).includes(
    "why it cannot be produced"
  )
);

/* --------------------------------------------------------- 8. the log as text */

const text = logText(
  [
    item({ id: "DOC-A", title: "Thermography report 2026", requestedFrom: "T. Nkosi" }),
    received({ id: "DOC-B", title: "AGL logs", isOriginal: true }),
  ],
  ctx
);
check("it names the form it is", text.includes("TK-003 form 7"));
check("it counts what is outstanding", text.includes("Outstanding     1"));
check("it counts originals held", text.includes("Originals held  1"));
check(
  "OUTSTANDING COMES FIRST",
  text.indexOf("STILL OUTSTANDING") < text.indexOf("RECEIVED AND CLOSED"),
  "a log ordered by time buries four unsent documents under thirty that arrived"
);
check(
  "and the outstanding item is in that section, not the closed one",
  text.indexOf("Thermography report 2026") < text.indexOf("RECEIVED AND CLOSED")
);
check("originals held get their own section", text.includes("ACSA ORIGINALS HELD BY TPJV"));
check(
  "an empty log says nothing is outstanding rather than printing a blank",
  logText([], ctx).includes("Nothing outstanding.")
);
check(
  "an unsigned receipt says NOT SIGNED rather than leaving the line off",
  logText([received({ signature: null })], ctx).includes("NOT SIGNED")
);
check(
  "a refusal is printed with what they said",
  logText([item({ unavailableAt: RECEIVED, unavailableReason: "Lost in the 2024 move" })], ctx)
    .includes("Lost in the 2024 move")
);
check(
  "check-points print in this site's numbering, not the canonical one",
  text.includes("ORTIA-ELE-005") && !text.includes("KSIA-ELE-005")
);
check("the media are labelled for a reader", MEDIUM_LABEL.photographed === "Photographed");

/* ------------------------------------------ 9. signatures only on this device */

check(
  "a collector's signature with no record copy is reported",
  unbackedSignatures([received()]).length === 1
);
check(
  "one that has been backed up is not",
  unbackedSignatures([received({ signature: sig({ cloudUrl: "https://x" }) })]).length === 0
);
check(
  "and the screen does not imply a sync button that would clear it",
  /THE RECORD COPY IS NOT WIRED YET/.test(page)
);

/* ---------------------------------------------- 10. the store's guarantees */

check(
  "only a title is needed to log one",
  /addEvidenceItem:\s*\(title: string, seed\?/.test(store)
);
check(
  "it is logged as requested as of now, which is what usually happened",
  /addEvidenceItem[\s\S]{0,900}requestedAt: now/.test(store)
);
check(
  "and the screen can say it was offered rather than asked for",
  /Not requested — they offered it/.test(page),
  "people hand you things, and a log that cannot record that is a log that lies"
);
check(
  "id, entity and createdAt cannot be patched",
  /updateEvidenceItem[\s\S]{0,800}id: e\.id[\s\S]{0,160}entity: e\.entity[\s\S]{0,160}createdAt: e\.createdAt/.test(
    store
  )
);
check(
  "the signature cannot be set by a stray patch",
  /updateEvidenceItem[\s\S]{0,500}const \{ signature: _s, \.\.\.safe \}/.test(store),
  "it is set by signEvidence, which is where the reference comes from"
);
check(
  "a superseded collector's mark releases its bytes",
  /signEvidence[\s\S]{0,1200}previous\.blobKey !== sig\.blobKey[\s\S]{0,80}delBlob\(previous\.blobKey\)/.test(
    store
  )
);
check("the log is persisted", /partialize[\s\S]{0,600}evidenceItems: s\.evidenceItems/.test(store));
check("the persisted shape was versioned", /version: 17,/.test(store));
check(
  "the migration defaults the slice",
  /from < 17[\s\S]{0,300}Array\.isArray\(st\.evidenceItems\)[\s\S]{0,80}st\.evidenceItems = \[\]/.test(
    store
  )
);
check("and the key never moved", /name: "acsa-assurance-v1"/.test(store));
check(
  "removing an entry releases its photographs and its signature",
  /removeEvidenceItem[\s\S]{0,700}delBlobs\(keys\)/.test(store)
);

const useEvidenceBody = /export function useEvidenceItems[\s\S]*?\n}/.exec(store)?.[0] ?? "";
check(
  "the register is scoped by entity, NOT by visit",
  /e\.entity === entity/.test(useEvidenceBody) && !/originVisit/.test(useEvidenceBody),
  "a document requested in September and sent in November is the same debt"
);
check(
  "and ordered by what is still owed, not by when it was logged",
  /isOutstanding\(e\) \? 0 : isHeldOriginal\(e\) \? 1 : 2/.test(useEvidenceBody)
);

/* ------------------------------------------------------------ 11. reachable */

check(
  "the log has a route",
  fs.existsSync(path.join(here, "..", "src", "app", "(app)", "evidence", "page.tsx"))
);
check('it is reachable from the shell', /router\.push\("\/evidence"\)/.test(shell));
check("it is not another entry in the nav bar", !/href:\s*"\/evidence"/.test(shell));
check(
  "a screen off the nav bar still has a heading of its own",
  /"\/evidence": "Document and evidence collection log"/.test(shell)
);
const menuItems = [...shell.matchAll(/\{role !== "acsa" && \(\s*<MoreItem[\s\S]*?\/\>\s*\)\}/g)].map(
  (m) => m[0]
);
check(
  "ACSA, who are read-only across the audit, are not offered it",
  menuItems.some((m) => m.includes("Evidence log"))
);
check(
  "the page renders an h2, leaving the shell's h1 alone",
  /<h2 className="font-display text-\[15px\] font-semibold">\s*Document and evidence/.test(page)
);
check(
  "the clock is read as an external system, not called during render",
  !/const now = Date\.now\(\)/.test(page) && /useNow\(\)/.test(page)
);
check(
  "the 180 document check-points are offered first",
  /confirmedBy === "Document"/.test(page) && /Confirmed by a document/.test(page)
);
check(
  "but every other check-point is still offered",
  /Every other check-point/.test(page),
  "a document often bears on a practice or asset check too"
);
check(
  "a date input is parsed at local midday, not UTC midnight",
  /T12:00:00/.test(page)
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
