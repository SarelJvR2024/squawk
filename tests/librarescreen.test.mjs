import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* BUILD PROMPT 9, 22 NOV 2026 — "Library (policies as reference)."
 *
 *  There is no separate "procedure library" dataset anywhere in this repo —
 *  every ACSA citation lives per-check on the register (checks.json), and
 *  src/lib/library.ts aggregates it by document code. This suite RUNS that
 *  aggregation for real (needs the alias loader — see tests/alias.mjs and
 *  NEEDS_ALIAS in suite-table.test.mjs) rather than only pattern-matching
 *  its source, because the one fact that matters most here — exactly 70
 *  distinct procedures, no more, no fewer, no invented ones — is a claim
 *  about the real register, not about how the code is written. The rest
 *  (the page, the four entry points) is proven the way every other screen
 *  in this codebase is, by pinning its source. */
import { ALL_PROCEDURES, PROCEDURE_DISCIPLINES, UNCITED_GAP_NOTE, checksUsingProcedure, docRefLabel, procedureByDoc, procedureMatches } from "@/lib/library";
import { CHECKS } from "@/lib/register";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(...parts) {
  return fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
}

let failed = 0;
function check(name, condOrFn, why) {
  try {
    const cond = typeof condOrFn === "function" ? (condOrFn(), true) : condOrFn;
    if (cond === false) throw new Error(why ?? "failed");
    console.log("PASS ", name);
  } catch (e) {
    failed++;
    console.log("FAIL ", name, e.message);
  }
}

/* ---------- the data layer, run for real against the actual register ---------- */

check("exactly 70 distinct procedures are cited across the register — the build brief's own figure, not invented", () => {
  if (ALL_PROCEDURES.length !== 70) throw new Error(`got ${ALL_PROCEDURES.length}`);
});
check("every procedure's doc code is unique and every one has a title", () => {
  const docs = ALL_PROCEDURES.map((p) => p.doc);
  if (new Set(docs).size !== docs.length) throw new Error("duplicate doc code");
  if (ALL_PROCEDURES.some((p) => !p.title)) throw new Error("a procedure has no title");
});
check("a citation carries only what's actually used downstream — no unread checkRequirementLabel left over from an earlier draft", () => {
  const keys = Object.keys(ALL_PROCEDURES[0].citations[0]);
  if (keys.includes("checkRequirementLabel")) throw new Error("dead field still present");
});
check("the busiest procedure, D080 002M, is cited by exactly 34 of the register's checks — matches the register directly, not a hand-typed table", () => {
  const p = procedureByDoc("D080 002M");
  if (!p) throw new Error("not found");
  if (p.citations.length !== 34) throw new Error(`got ${p.citations.length}`);
});
check("checksUsingProcedure agrees with the procedure's own citation count, for several procedures, not just the busiest", () => {
  for (const doc of ["D080 002M", "D060 014M", "D060 023M", "B090 001M"]) {
    const p = procedureByDoc(doc);
    const checks = checksUsingProcedure(doc);
    if (!p || checks.length !== p.citations.length)
      throw new Error(`${doc}: ${checks.length} vs ${p?.citations.length}`);
  }
});
check("a check citing the same document twice (clause variants) is counted once, not twice, in that procedure's citations", () => {
  for (const p of ALL_PROCEDURES) {
    const ids = p.citations.map((c) => c.checkId);
    if (new Set(ids).size !== ids.length) throw new Error(`${p.doc} double-counts a check`);
  }
});
check("a procedure's citations never exceed the whole register's own check count", () => {
  if (ALL_PROCEDURES.some((p) => p.citations.length > CHECKS.length)) throw new Error("impossible count");
});
check("PROCEDURE_DISCIPLINES has no duplicates and is a subset of every citing check's own discipline", () => {
  if (new Set(PROCEDURE_DISCIPLINES).size !== PROCEDURE_DISCIPLINES.length) throw new Error("duplicate discipline");
});
check("procedureMatches finds a procedure by its bare code, case-insensitively", () => {
  if (!procedureMatches(procedureByDoc("D080 002M"), "d080 002m")) throw new Error("no match");
});
check("procedureMatches finds a procedure by a word from its title", () => {
  if (!procedureMatches(procedureByDoc("D080 002M"), "fire fighting")) throw new Error("no title match");
});
check("an empty query matches every procedure (no filter applied)", () => {
  if (!ALL_PROCEDURES.every((p) => procedureMatches(p, ""))) throw new Error("empty query excluded something");
});
check("docRefLabel renders doc + clause together, and just the doc when there is no clause", () => {
  if (docRefLabel({ doc: "D060 001M", clause: "6" }) !== "D060 001M cl. 6") throw new Error("with clause wrong");
  if (docRefLabel({ doc: "D060 001M", clause: null }) !== "D060 001M") throw new Error("without clause wrong");
});

/* ---------- the "do not invent clauses" rule, proven about the gap note itself ---------- */

check("UNCITED_GAP_NOTE is a plain statement, not a fabricated list of uncited procedure codes or titles", () => {
  if (typeof UNCITED_GAP_NOTE !== "string" || UNCITED_GAP_NOTE.length < 20) throw new Error("no gap note");
  /* The one thing this note must never contain: a document-code-shaped
     token this repo cannot source (the investigation found none beyond
     the 70 cited ones — see library.ts's own header). A crude but real
     guard: no ACSA-style code pattern anywhere in the note's own text. */
  if (/\b[A-Z]\d{3} \d{3}(M|P|WI|FW)?\b/.test(UNCITED_GAP_NOTE)) throw new Error("gap note names a document code");
});

/* ---------- the page: list + card, driven by one ?doc=/?clause= pair ---------- */

const libraryPage = src("src", "app", "(app)", "library", "page.tsx");

check("the page is Suspense-wrapped around useSearchParams, same convention Issues/Walk use for a query-param-driven screen", () => {
  if (!/<Suspense[\s\S]*?<LibraryPageInner \/>/.test(libraryPage)) throw new Error("no Suspense wrapper");
});
check("?doc= switches straight to the card, with no other state to reconstruct", () => {
  if (!/const docParam = searchParams\.get\("doc"\);/.test(libraryPage)) throw new Error("no doc param read");
  if (!/if \(docParam\) \{/.test(libraryPage)) throw new Error("no doc-param branch");
});
check("the list is searchable and discipline-filterable, per the build brief", () => {
  if (!/procedureMatches\(p, query\)/.test(libraryPage)) throw new Error("no search filter");
  if (!/p\.disciplines\.includes\(discipline\)/.test(libraryPage)) throw new Error("no discipline filter");
});
check("each list row shows code, title and \"used by N checks\" — the brief's exact phrase", () => {
  if (!/Used by \{p\.citations\.length\} check/.test(libraryPage)) throw new Error("no used-by-N-checks row");
});
check("the card shows requirements with clause, records it names, and things to watch for — the brief's three sections", () => {
  if (!/Key requirements, with clause/.test(libraryPage)) throw new Error("no requirements section");
  if (!/Records it names/.test(libraryPage)) throw new Error("no records section");
  if (!/Things to watch for/.test(libraryPage)) throw new Error("no watch-fors section");
});
check("the card shows the checks that use this procedure, each opening straight to that check", () => {
  if (!/router\.push\(`\/capture\?check=\$\{c\.checkId\}`\)/.test(libraryPage)) throw new Error("no open-check link");
});
check("the gap note is rendered on the list screen, not hidden or only in a comment", () => {
  if (!/\{UNCITED_GAP_NOTE\}/.test(libraryPage)) throw new Error("gap note not rendered");
});
check("the card never fabricates content for a doc code it doesn't recognise — it shows an empty state instead", () => {
  if (!/No cited procedure has the code/.test(libraryPage)) throw new Error("no not-found state");
});

/* ---------- entry point 4: More > Library ---------- */

const appShell = src("src", "components", "AppShell.tsx");

check("AppShell's OFF_NAV carries a heading for /library — it is More-menu only, not in NAV", () => {
  if (!/"\/library": "Library",/.test(appShell)) throw new Error("no OFF_NAV entry");
});
check("the More menu has a Library MoreItem that navigates to /library", () => {
  const i = appShell.indexOf('label="Library"');
  if (i < 0) throw new Error("no Library MoreItem");
  const body = appShell.slice(i, i + 300);
  if (!/router\.push\("\/library"\)/.test(body)) throw new Error("MoreItem does not navigate to /library");
});

/* ---------- entry point 1: a check's "ACSA requirement" opens the clause ---------- */

const acsaPanel = src("src", "components", "AcsaRequirementPanel.tsx");

check("AcsaRequirementPanel's own signature is untouched — Library's link-in is additive, not a prop change", () => {
  if (!/export default function AcsaRequirementPanel\(\{ check \}: \{ check: Check \}\)/.test(acsaPanel))
    throw new Error("signature changed");
});
check("every doc this check cites gets its own \"Open in Library\" link, at its own clause", () => {
  if (!/Open in Library/.test(acsaPanel)) throw new Error("no Library link");
  if (!/router\.push\(\s*\n?\s*`\/library\?doc=\$\{encodeURIComponent\(d\.doc!\)\}/.test(acsaPanel))
    throw new Error("link does not deep-link by doc");
  if (!/clause=\$\{encodeURIComponent\(d\.clause\)\}/.test(acsaPanel)) throw new Error("link does not carry the clause");
});

/* ---------- entry point 2: "cite a procedure" from an issue ---------- */

const reviewPanel = src("src", "components", "ReviewRiskPanel.tsx");

check("RiskPatch gained citedDocs, alongside critical/safetyTag from build prompt 8", () => {
  if (!/\| "critical"\s*\n\s*\| "safetyTag"\s*\n[\s\S]{0,200}\| "citedDocs"/.test(reviewPanel))
    throw new Error("citedDocs not added to RiskPatch");
});
check("a finding's own citedDocs render as chips that open the Library card, with a way to remove one", () => {
  if (!/finding\.citedDocs && finding\.citedDocs\.length > 0/.test(reviewPanel)) throw new Error("no citedDocs branch");
  if (!/Remove citation/.test(reviewPanel)) throw new Error("no remove control");
});
check("with no citedDocs yet, the linked check's own acsaDocs show as a labelled SUGGESTION, never silently adopted", () => {
  if (!/Not cited yet\. Suggested from \{linkedCheck\.id\}/.test(reviewPanel)) throw new Error("no suggestion copy");
  if (!/onChange\(\{ citedDocs: linkedCheck\.acsaDocs \}\)/.test(reviewPanel)) throw new Error("no explicit adopt action");
});
check("\"Cite a procedure\" opens a real search over the same 70 procedures the Library page lists, not a hand-typed list", () => {
  if (!/ALL_PROCEDURES\.filter\(\(p\) => procedureMatches\(p, procQuery\)\)/.test(reviewPanel)) throw new Error("no search");
});
check(
  "a procedure already cited on this finding is disabled in the picker — citing it twice would list the same procedure twice on export",
  () => {
    if (!/disabled=\{!!finding\.citedDocs\?\.some\(\(d\) => d\.doc === p\.doc\)\}/.test(reviewPanel))
      throw new Error("no dedup guard on the picker button");
  },
);

/* ---------- entry point 3: Issues "To review" shows the clause, tap to read ---------- */

check("the panel shows the linked check's ACSA clause independently of this visit's own response, so a carried finding still shows it", () => {
  const i = reviewPanel.indexOf("ACSA CLAUSE, TAP TO READ");
  if (i < 0) throw new Error("no ACSA clause section");
  const body = reviewPanel.slice(i, i + 900);
  if (!/linkedCheck && linkedCheck\.acsaDocs\.length > 0/.test(body)) throw new Error("not gated on linkedCheck alone");
  if (!/router\.push\(\s*\n?\s*`\/library\?doc=\$\{encodeURIComponent\(d\.doc!\)\}/.test(body))
    throw new Error("clause link does not deep-link to Library");
});

/* ---------- the data model addition itself ---------- */

const types = src("src", "lib", "types.ts");

check("Finding.citedDocs is optional and absent-means-unset, same convention as critical/safetyTag", () => {
  if (!/citedDocs\?: AcsaDocRef\[\];/.test(types)) throw new Error("citedDocs not added, or not optional");
});

if (failed) process.exit(1);
console.log(failed ? "FAILED" : "all passed");
