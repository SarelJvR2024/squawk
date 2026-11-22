/** BULK EVIDENCE LIST UPLOAD — Setup, build prompt 6: "upload a CSV/XLSX
 *  of evidence items per check (columns: check id, evidence name).
 *  Preview, then import."
 *
 *  Same parse → plan → apply shape as src/lib/importPack.ts, deliberately
 *  lighter: two columns, one row is one new evidence REQUEST, nothing
 *  cross-references another record the way an observation pack's
 *  findings/hazards/ad-hoc items do. So there is no undo/importKey
 *  machinery here — skipping a row that is already logged, on a second
 *  import of a revised list, is enough; there is nothing complex to
 *  reverse if a row turns out wrong, since removing a wrongly-imported
 *  EvidenceItem is already the existing Remove button on /evidence. */

import type { Check, EvidenceItem } from "./types";
import { readWorkbook } from "./importPack";

export interface EvidenceImportRow {
  rowIndex: number;
  checkId: string;
  title: string;
}

export interface EvidenceImportPlanRow extends EvidenceImportRow {
  check: Check | null;
  alreadyLogged: boolean;
}

export interface EvidenceImportPlan {
  rows: EvidenceImportPlanRow[];
  blockedReason: string | null;
}

/** No CSV parser exists anywhere in this codebase — `readWorkbook`'s own
 *  comment explains why .xlsx is hand-rolled too (no zip/XML dependency
 *  in package.json) — and two plain columns do not need a real one.
 *  Comma-split with minimal double-quote handling is the one thing a
 *  spreadsheet's own CSV export can actually produce that a naive split
 *  would break on: a quoted field containing a comma. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

/** Parses the file into rows, by header NAME ("check id", "evidence
 *  name" — case-insensitive) rather than column position, same
 *  robustness-to-reordered-columns `importPack.ts`'s own parser already
 *  gives. Throws with a message that says exactly what was expected, same
 *  convention `ImportPackPanel`'s own catch already follows — never a
 *  bare "parse failed". */
export function parseEvidenceList(bytes: Uint8Array, fileName: string): EvidenceImportRow[] {
  const isXlsx = /\.xlsx$/i.test(fileName);
  let table: string[][];
  if (isXlsx) {
    const sheets = readWorkbook(bytes);
    if (sheets.length === 0) throw new Error("That workbook has no sheets.");
    table = sheets[0].rows;
  } else {
    table = parseCsv(new TextDecoder().decode(bytes));
  }
  if (table.length < 2) {
    throw new Error("That file needs a header row and at least one data row.");
  }
  const header = table[0].map((h) => h.trim().toLowerCase());
  const checkIdCol = header.findIndex((h) => h === "check id" || h === "check-id" || h === "checkid");
  const nameCol = header.findIndex((h) => h === "evidence name" || h === "evidence" || h === "name");
  if (checkIdCol === -1 || nameCol === -1) {
    throw new Error('That file needs a "check id" column and an "evidence name" column.');
  }
  const rows: EvidenceImportRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    const checkId = (row[checkIdCol] ?? "").trim();
    const title = (row[nameCol] ?? "").trim();
    if (!checkId && !title) continue; // a blank trailing row
    rows.push({ rowIndex: i + 1, checkId, title });
  }
  return rows;
}

/** Checks each row against the register and what is already logged —
 *  nothing is written here. A row whose exact check id + title already
 *  exists on an EvidenceItem linked to that check is `alreadyLogged`:
 *  importing the same list twice (a revised spreadsheet re-sent whole,
 *  not just its new rows, is the normal real-world case) must not
 *  duplicate every row that has not changed. */
export function buildEvidenceImportPlan(
  rows: EvidenceImportRow[],
  checks: Check[],
  existing: EvidenceItem[],
): EvidenceImportPlan {
  const checkById = new Map(checks.map((c) => [c.id, c]));
  const planRows: EvidenceImportPlanRow[] = rows.map((r) => {
    const check = checkById.get(r.checkId) ?? null;
    const alreadyLogged = existing.some(
      (e) =>
        e.checkIds.includes(r.checkId) && e.title.trim().toLowerCase() === r.title.toLowerCase(),
    );
    return { ...r, check, alreadyLogged };
  });
  const blockedReason = rows.length === 0 ? "That file has no rows to import." : null;
  return { rows: planRows, blockedReason };
}

export interface EvidenceImportCounts {
  total: number;
  toImport: number;
  unmapped: number;
  alreadyLogged: number;
}

export function evidenceImportCounts(plan: EvidenceImportPlan): EvidenceImportCounts {
  let unmapped = 0;
  let alreadyLogged = 0;
  for (const r of plan.rows) {
    if (!r.check) unmapped++;
    else if (r.alreadyLogged) alreadyLogged++;
  }
  return {
    total: plan.rows.length,
    toImport: plan.rows.length - unmapped - alreadyLogged,
    unmapped,
    alreadyLogged,
  };
}

/** Writes every importable row — mapped to a real check, not already
 *  logged — as one new EvidenceItem each, requested now (addEvidenceItem's
 *  own default), linked to that one check. Returns how many were written;
 *  the caller never needs to re-derive that from the plan. */
export function applyEvidenceImportPlan(
  plan: EvidenceImportPlan,
  addEvidenceItem: (title: string, seed?: Partial<EvidenceItem>) => string,
): number {
  let n = 0;
  for (const r of plan.rows) {
    if (!r.check || r.alreadyLogged) continue;
    addEvidenceItem(r.title, { checkIds: [r.checkId] });
    n++;
  }
  return n;
}
