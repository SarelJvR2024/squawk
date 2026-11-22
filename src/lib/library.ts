/** ACSA's procedures, as reference — the Library screen's data layer.
 *
 *  There is no separate "procedure library" dataset anywhere in this repo.
 *  Every ACSA citation — document code, clause, title, requirement
 *  paraphrase, threshold, named records, caveats — lives as PER-CHECK fields
 *  on the register (see Check.acsaDocs/acsaRequirement/acsaThreshold/
 *  acsaEvidence/acsaConflict in types.ts). This file builds the Library's
 *  rows by aggregating those fields across the register, grouped by document
 *  code. It derives them live rather than hardcoding a table, the same way
 *  ALL_DISCIPLINES (register.ts) is derived rather than hand-maintained —
 *  the register is the only source of truth and it changes under a rebase.
 *
 *  70 distinct document codes are cited across the 324 checks — that figure
 *  matches the build brief's "70 procedures used by the audit" exactly and
 *  needs no further source. The brief's companion figure, "19 held but not
 *  cited", does NOT reconcile with anything in this repo: several checks'
 *  acsaConflict text refers to a 99-document corpus TPJV researched against,
 *  which would put the uncited count at 29, not 19 — and even that number's
 *  document codes/titles/content do not exist anywhere in the repo, not even
 *  as a bare list. Per the standing "do not invent clauses" rule, this file
 *  deliberately has no list of uncited procedures — see UNCITED_GAP_NOTE,
 *  surfaced as a plain statement on the Library screen instead of a
 *  fabricated table. */

import type { AcsaDocRef, Check } from "./types";
import { CHECKS, ALL_DISCIPLINES } from "./register";

export interface AcsaProcedure {
  /** The document code, e.g. "D060 001M" — stable, used as the Library's key
   *  and in deep-link query params (?doc=). */
  doc: string;
  title: string;
  /** Every distinct clause any check cites against this document, sorted. */
  clauses: string[];
  /** Every discipline of any check that cites this document — a procedure
   *  can span more than one. */
  disciplines: string[];
  /** One row per citing check: its clause(s) for this doc, plus the check's
   *  own requirement/threshold/evidence/conflict text. All of this is the
   *  check's existing, already-displayed data, regrouped by document
   *  rather than restated or summarised — nothing here is invented. */
  citations: {
    checkId: string;
    clauses: string[];
    acsaRequirement: string;
    acsaThreshold: string;
    acsaEvidence: string[];
    acsaConflict: string;
  }[];
}

function dedupeSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Built once at module load — CHECKS never changes at runtime. */
function buildProcedures(checks: Check[]): Map<string, AcsaProcedure> {
  const byDoc = new Map<string, AcsaProcedure>();
  for (const check of checks) {
    const seenDocsOnThisCheck = new Set<string>();
    for (const ref of check.acsaDocs) {
      if (!ref.doc) continue;
      let proc = byDoc.get(ref.doc);
      if (!proc) {
        proc = {
          doc: ref.doc,
          title: ref.title ?? ref.doc,
          clauses: [],
          disciplines: [],
          citations: [],
        };
        byDoc.set(ref.doc, proc);
      }
      if (ref.clause) proc.clauses.push(ref.clause);
      proc.disciplines.push(check.discipline);

      if (!seenDocsOnThisCheck.has(ref.doc)) {
        seenDocsOnThisCheck.add(ref.doc);
        proc.citations.push({
          checkId: check.id,
          clauses: check.acsaDocs.filter((d) => d.doc === ref.doc).map((d) => d.clause ?? "").filter(Boolean),
          acsaRequirement: check.acsaRequirement,
          acsaThreshold: check.acsaThreshold,
          acsaEvidence: check.acsaEvidence,
          acsaConflict: check.acsaConflict,
        });
      }
    }
  }
  for (const proc of byDoc.values()) {
    proc.clauses = dedupeSorted(proc.clauses);
    proc.disciplines = dedupeSorted(proc.disciplines);
  }
  return byDoc;
}

const PROCEDURES_BY_DOC = buildProcedures(CHECKS);

/** All cited procedures, sorted by document code. 70 of them, per the
 *  register as it stands — see this file's header. */
export const ALL_PROCEDURES: AcsaProcedure[] = Array.from(PROCEDURES_BY_DOC.values()).sort((a, b) =>
  a.doc.localeCompare(b.doc)
);

export function procedureByDoc(doc: string): AcsaProcedure | undefined {
  return PROCEDURES_BY_DOC.get(doc);
}

/** Every check (register-wide — a procedure is not entity-scoped) that
 *  cites this document, in register order. */
export function checksUsingProcedure(doc: string): Check[] {
  return CHECKS.filter((c) => c.acsaDocs.some((d) => d.doc === doc));
}

/** The disciplines any cited procedure touches — for the Library's filter
 *  rail. Register-wide, like ALL_DISCIPLINES itself, because a procedure's
 *  relevance isn't bound to one entity's checklist. */
export const PROCEDURE_DISCIPLINES: string[] = dedupeSorted(
  ALL_PROCEDURES.flatMap((p) => p.disciplines)
).sort((a, b) => ALL_DISCIPLINES.indexOf(a) - ALL_DISCIPLINES.indexOf(b));

/** A one-line, honest statement of the gap — never a fabricated list of the
 *  procedures ACSA holds but no check currently cites. See this file's
 *  header for why no such list exists to show. */
export const UNCITED_GAP_NOTE =
  "This Library lists the 70 ACSA procedures the register actually cites. ACSA's own document set is larger than that — some checks' notes mention a wider, uncited set — but this repo has no list of those documents' codes or titles, so none is shown here. Ask Sarel for ACSA's full procedure index before treating this list as complete.";

export function docRefLabel(ref: AcsaDocRef): string {
  return `${ref.doc ?? ""}${ref.clause ? ` cl. ${ref.clause}` : ""}`.trim();
}

/** The one-line "search any text field" match used across the app (⌘K
 *  palette, RaiseFindingSheet, AddItemSheet — see each file's own filter).
 *  Same shape here: lowercase substring, no fuzzy matching. */
export function procedureMatches(proc: AcsaProcedure, query: string): boolean {
  const s = query.trim().toLowerCase();
  if (!s) return true;
  const haystack = `${proc.doc} ${proc.title} ${proc.clauses.join(" ")} ${proc.citations
    .map((c) => `${c.acsaRequirement} ${c.acsaThreshold}`)
    .join(" ")}`.toLowerCase();
  return haystack.includes(s);
}
