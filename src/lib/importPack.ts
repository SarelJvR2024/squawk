/** "Import observation pack" — reading one of TPJV's observation workbooks
 *  into the currently selected entity and visit as ad-hoc items, draft
 *  findings, draft hazards and check observations.
 *
 *  PURE, like merge.ts and exports.ts: no React, no store read inside it.
 *  Every record this needs comes in on `ImportContext`, so the parsing and
 *  planning can be unit-tested with hand-built fixtures and a screen cannot
 *  forget which slice of the store it meant to read. The only side effects —
 *  the actual writes — happen in `applyImportPlan`, through the callbacks it
 *  is handed, never by mutating anything directly.
 *
 *  THE WORKBOOK'S SHAPE. This reads by HEADER NAME, not column position (see
 *  `headerMap`/`col` below), because two packs have shipped against this one
 *  parser with different columns and that is expected to keep happening:
 *
 *    ACSA's pre-visit pack (PR #138, Oct 2026):
 *      "Ad-hoc items"       Ref, Origin, Description (what you found),
 *                            Discipline, Asset system, Area, Outcome, Note
 *      "Findings"            Ref, Title, Discipline, Asset system,
 *                            Linked checks, Description,
 *                            Root cause (to confirm),
 *                            Mitigation ACSA could adopt (TPJV-proposed), Hazard
 *      "Hazards"              Ref, Event (under 15 words), Description,
 *                            Why (control and what it protects), Disciplines,
 *                            Systems, Findings, Template links
 *      "Check observations"   Check, Discipline, Observation to record,
 *                            What to ask or verify
 *
 *    TPJV's own site-observations pack ("v3", 14 Oct 2026 — ORTIA round),
 *    sheets named "Findings drafts"/"Hazards drafts" rather than bare
 *    "Findings"/"Hazards" (tried as a fallback — see `SHEET_FINDINGS`/
 *    `SHEET_HAZARDS`), with these columns ADDED on top of the above:
 *      "Ad-hoc items"        + Whose note (who raised it — "Sarel" or
 *                              "Adrian", not the field/acsa/tpjv vocabulary;
 *                              see `resolveAdhocOrigin`), + Title
 *      "Findings drafts"     + From item (the Ad-hoc Ref this was written up
 *                              from, kept for traceability only — nothing
 *                              resolves or validates it)
 *      "Check observations"  + From item (same, between Discipline and
 *                              Observation to record)
 *
 *    "Read me" is ignored in both.
 *
 *  Any column neither pack's reader recognises by name is simply not read —
 *  nothing here guesses at a header it was not told about. A SHEET it does
 *  not recognise by name produces an empty list for that sheet rather than
 *  throwing, which is what lets one pack lack "Hazards drafts" (say) without
 *  failing the whole import.
 *
 *  Cells reading literally "(none)" or "(decide in the room)" mean empty, not
 *  literal text — see `blankAware`.
 *
 *  THE HARD INVARIANTS, same as everywhere else in this app (see the header
 *  of src/lib/risk.ts and the comments on Finding/Hazard in types.ts):
 *  nothing here ever sets or proposes a severity or likelihood, nothing here
 *  ever sets ratingConfirmed true, nothing here ever changes an existing
 *  outcome or compliance value, and nothing here touches the persist key, a
 *  migration, or the register itself. A check observation only ever APPENDS
 *  to the existing note.
 *
 *  PROVENANCE ("marked as seeded", in Sarel's own words for this task). This
 *  app already has a `seeded?: boolean` convention — PossibleEvent,
 *  RootCauseNote, MitigationAction, SystemAssessment — but that is the OTHER
 *  import pathway's vocabulary (the one-off FAOR hazard-mapping desktop
 *  script, scripts/import-faor-hazards.mjs, which writes a merge bundle for
 *  a completely different record family and is not wired to any screen's
 *  pill or export column). AdHocItem/Finding/Hazard — the family this module
 *  writes — have never had a `seeded` field; their own, already-shipped
 *  provenance marker is `importKey` below, which is what drives the
 *  "Imported, TPJV-proposed" pill everywhere one of these records is shown
 *  (FindingDetail, the hazards screen, the field screen) and the "Imported,
 *  TPJV-proposed" annotation in exports.ts's walk/findings/hazards sheets.
 *  Reusing `importKey` for this pack rather than bolting a second, different-
 *  looking provenance flag onto these three types is the deliberate choice
 *  here — see the task this shipped against for the full reasoning.
 *
 *  IDEMPOTENCY. Each row gets a stable key — see `computeImportKey` — carried
 *  on the record it produces (AdHocItem.importKey / Finding.importKey /
 *  Hazard.importKey; see their own comments in types.ts) rather than a side
 *  table, so it survives sync/merge, which keys everything by id alone. A
 *  check observation produces no new record — it edits an existing Response —
 *  so its key is embedded in the text it appends instead (see
 *  `CHECK_OBS_MARKER`) and matched back out of the note on a second run. */

import { unzipSync, strFromU8 } from "fflate";
import type {
  AdHocItem,
  Check,
  Finding,
  Hazard,
  MitigationAction,
  Response,
} from "./types";

/* ---------------------------------------------------------- reading .xlsx */

/** One worksheet, as plain rows of plain strings. Row 0 is the header. A cell
 *  with nothing in it is "" , never undefined — every row is padded out to
 *  the sheet's own column count so index-by-position (col 0 = Ref, col 1 =
 *  Origin, …) is safe. */
export interface WorkbookSheet {
  name: string;
  rows: string[][];
}

const XML_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

function unescapeXml(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, code) => {
    if (code[0] === "#") {
      const cp = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return XML_ENTITIES[code] ?? m;
  });
}

/** "A" -> 0, "B" -> 1, … "AA" -> 26. */
function colToIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function textOf(xml: string): string {
  let out = "";
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1];
  return unescapeXml(out);
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(textOf(m[1]));
  return out;
}

/** One sheet's rows, from its worksheetN.xml and the workbook's shared
 *  strings (absent in a workbook — like this app's own writer's output —
 *  that only ever uses inline strings). Handles both self-closing cells
 *  (`<c r="A1" s="3"/>`, an empty cell Excel still wrote a style onto) and the
 *  normal open/close form. */
function parseSheetXml(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const rowIndex = parseInt(rowMatch[1], 10) - 1;
    const cellRe = /<c\s+r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    const cells: string[] = [];
    while ((cellMatch = cellRe.exec(rowMatch[2]))) {
      const col = colToIndex(cellMatch[1]);
      const attrs = cellMatch[2] ?? "";
      const inner = cellMatch[3];
      const typeMatch = /\bt="([^"]+)"/.exec(attrs);
      const type = typeMatch?.[1];
      let value = "";
      if (inner !== undefined) {
        if (type === "inlineStr") {
          value = textOf(inner);
        } else if (type === "s") {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
          const idx = v ? parseInt(v[1], 10) : -1;
          value = shared[idx] ?? "";
        } else if (type === "str") {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
          value = v ? unescapeXml(v[1]) : "";
        } else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
          value = v ? unescapeXml(v[1]) : "";
        }
      }
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return rows.map((r) => {
    const padded = r.slice();
    while (padded.length < width) padded.push("");
    return padded;
  });
}

/** An .xlsx's sheets, in workbook order, as plain string rows. Mirrors
 *  src/lib/xlsx.ts's own writer closely enough that a file this app exported
 *  reads back correctly, and reads a workbook built by Excel or Google
 *  Sheets (shared strings, self-closing empty cells) too. Does not attempt
 *  formulas, merged cells or styles — this is a reader for data, not a
 *  spreadsheet engine. */
export function readWorkbook(bytes: Uint8Array): WorkbookSheet[] {
  const files = unzipSync(bytes);
  const text = (path: string): string | undefined => {
    const f = files[path];
    return f ? strFromU8(f) : undefined;
  };
  const workbookXml = text("xl/workbook.xml");
  if (!workbookXml) throw new Error("That file is not a readable .xlsx workbook.");

  const sheetNames: { name: string; rId: string }[] = [];
  const sheetTagRe = /<sheet\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = sheetTagRe.exec(workbookXml))) {
    const tag = m[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1] ?? "";
    const rId = /\br:id="([^"]*)"/.exec(tag)?.[1] ?? "";
    sheetNames.push({ name: unescapeXml(name), rId });
  }

  const relsXml = text("xl/_rels/workbook.xml.rels") ?? "";
  const targetByRid = new Map<string, string>();
  const relRe = /<Relationship\b[^>]*\/>/g;
  while ((m = relRe.exec(relsXml))) {
    const tag = m[0];
    const id = /\bId="([^"]*)"/.exec(tag)?.[1];
    let target = /\bTarget="([^"]*)"/.exec(tag)?.[1];
    if (!id || !target) continue;
    if (!target.startsWith("/")) target = `xl/${target}`;
    else target = target.slice(1);
    targetByRid.set(id, target);
  }

  const shared = parseSharedStrings(text("xl/sharedStrings.xml"));

  return sheetNames.map(({ name, rId }) => {
    const path = targetByRid.get(rId);
    const xml = path ? text(path) : undefined;
    return { name, rows: xml ? parseSheetXml(xml, shared) : [] };
  });
}

/* ---------------------------------------------------- the workbook's data */

/** Cells that read as empty even though they carry text — ACSA's "not
 *  decided yet" placeholders, per the task this shipped against. */
const BLANK_MARKERS = new Set(["(none)", "(decide in the room)"]);

const trimmed = (v: string | undefined): string => (v ?? "").trim();

/** "" and the two placeholder markers all read as null. Everything else is
 *  returned as typed, including a literal like "(ad-hoc; no single check)" —
 *  only the two exact markers above mean empty; nothing else is guessed at. */
function blankAware(v: string | undefined): string | null {
  const t = trimmed(v);
  return t === "" || BLANK_MARKERS.has(t) ? null : t;
}

function splitList(v: string | undefined): string[] {
  const t = blankAware(v);
  if (!t) return [];
  return t
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export interface AdhocPackRow {
  ref: string;
  originRaw: string | null;
  /** The "Whose note" column — a person's name ("Sarel", "Adrian"), not the
   *  field/acsa/tpjv vocabulary `originRaw` carries. Present only in a pack
   *  that has that column at all (absent means the pack never had it, same
   *  as every other optional column here — not the same as the column
   *  existing but this one cell being blank, which `blankAware` already
   *  reads as null either way). See `resolveAdhocOrigin`. */
  whoseNote: string | null;
  /** The "Title" column — ad-hoc items had no title before the pack that
   *  added this, and AdHocItem itself still has none (see the note in
   *  `buildAdhocNote`): folded into the generated note, never into
   *  `description`, so the source "what you found" text stays untouched. */
  title: string | null;
  description: string;
  discipline: string | null;
  system: string | null;
  area: string;
  outcomeRaw: string | null;
  note: string;
}

export interface FindingPackRow {
  ref: string;
  /** The "From item" column — which Ad-hoc Ref this was written up from.
   *  Kept for traceability only (folded into the generated description —
   *  see `buildFindingDescription`); nothing here resolves or validates it
   *  against the Ad-hoc sheet, the way `linkedChecks`/`hazardRef` are. */
  fromItem: string | null;
  title: string;
  discipline: string;
  system: string | null;
  linkedChecks: string | null;
  description: string;
  rootCause: string;
  mitigation: string;
  hazardRef: string | null;
}

export interface HazardPackRow {
  ref: string;
  event: string;
  description: string;
  why: string;
  disciplines: string[];
  systems: string[];
  findingRefs: string[];
  /** HZ-/RC- references into the Hazard Screening Template Rev 02. Carried
   *  as plain reference text onto the Hazard this becomes (see
   *  `buildHazardNote`) — never as a validated link to anything, because
   *  this app holds no structured template data to validate against (see
   *  the task this shipped against). Reported, not invented: a reference
   *  this import could not check is still imported, as text, flagged as
   *  unverified in the same note it is written into. */
  templateLinks: string | null;
}

export interface CheckObsPackRow {
  /** The sheet's own "Check" column. Doubles as this row's Ref for the
   *  idempotency key — the sheet has no separate Ref column, and the check
   *  id is the one thing every row in it genuinely has to itself. */
  checkCode: string;
  discipline: string;
  /** The "From item" column — see FindingPackRow.fromItem. Folded into the
   *  appended note text; not resolved against anything. */
  fromItem: string | null;
  observation: string;
  askOrVerify: string;
}

export interface ObservationPack {
  fileName: string;
  adhoc: AdhocPackRow[];
  findings: FindingPackRow[];
  hazards: HazardPackRow[];
  checkObservations: CheckObsPackRow[];
}

const SHEET_ADHOC = "Ad-hoc items";
/** The CANONICAL names used only for the idempotency key below — fixed,
 *  regardless of which of `SHEET_FINDINGS_NAMES`/`SHEET_HAZARDS_NAMES` the
 *  workbook actually used, so the key a row gets does not depend on which
 *  pack version it came from, only on the file's own bytes and its Ref. */
const SHEET_FINDINGS = "Findings";
const SHEET_HAZARDS = "Hazards";
/** Tried in order — "Findings"/"Hazards" (ACSA's pre-visit pack) first, then
 *  "Findings drafts"/"Hazards drafts" (TPJV's own site-observations pack):
 *  the two sheets whose rows are still drafts to be agreed, named to say so.
 *  See the header comment above. */
const SHEET_FINDINGS_NAMES = [SHEET_FINDINGS, "Findings drafts"];
const SHEET_HAZARDS_NAMES = [SHEET_HAZARDS, "Hazards drafts"];
const SHEET_CHECK_OBS = "Check observations";

/** A row with nothing at all in any column — the odd trailing blank row a
 *  spreadsheet editor leaves behind. Not real data, and not reported as an
 *  unmapped row either. */
const isBlankRow = (r: string[]) => r.every((c) => trimmed(c) === "");

/** Maps a sheet's own header row (trimmed, as written) to its column index,
 *  so every row-builder below reads BY NAME rather than by position. This is
 *  what lets one parser serve two packs whose columns differ, in whichever
 *  order either pack's author happened to put them in, without either pack
 *  silently reading the other's columns into the wrong field. */
type HeaderMap = Map<string, number>;

function headerMap(header: string[]): HeaderMap {
  const m: HeaderMap = new Map();
  header.forEach((h, i) => {
    const t = trimmed(h);
    if (t && !m.has(t)) m.set(t, i);
  });
  return m;
}

/** The named column's cell, or "" if this sheet has no column by that name —
 *  same as a blank cell, which is the honest reading for an optional column
 *  (Title, Whose note, From item) a given pack simply does not carry. */
function col(h: HeaderMap, row: string[], name: string): string | undefined {
  const i = h.get(name);
  return i === undefined ? undefined : row[i];
}

export function parseObservationPack(bytes: Uint8Array, fileName: string): ObservationPack {
  const sheets = readWorkbook(bytes);
  const byName = new Map(sheets.map((s) => [s.name, s]));
  const findSheet = (names: string[]) => {
    for (const n of names) {
      const s = byName.get(n);
      if (s) return s;
    }
    return undefined;
  };
  const sheetRows = (s: { rows: string[][] } | undefined): { header: HeaderMap; rows: string[][] } => {
    if (!s || s.rows.length === 0) return { header: new Map(), rows: [] };
    return { header: headerMap(s.rows[0]), rows: s.rows.slice(1).filter((r) => !isBlankRow(r)) };
  };

  const adhocSheet = sheetRows(byName.get(SHEET_ADHOC));
  const adhoc: AdhocPackRow[] = adhocSheet.rows.map((r) => ({
    ref: trimmed(col(adhocSheet.header, r, "Ref")),
    originRaw: blankAware(col(adhocSheet.header, r, "Origin")),
    whoseNote: blankAware(col(adhocSheet.header, r, "Whose note")),
    title: blankAware(col(adhocSheet.header, r, "Title")),
    description: trimmed(col(adhocSheet.header, r, "Description (what you found)")),
    discipline: blankAware(col(adhocSheet.header, r, "Discipline")),
    system: blankAware(col(adhocSheet.header, r, "Asset system")),
    area: trimmed(col(adhocSheet.header, r, "Area")),
    outcomeRaw: blankAware(col(adhocSheet.header, r, "Outcome")),
    note: trimmed(col(adhocSheet.header, r, "Note")),
  }));

  const findingsSheet = sheetRows(findSheet(SHEET_FINDINGS_NAMES));
  const findings: FindingPackRow[] = findingsSheet.rows.map((r) => ({
    ref: trimmed(col(findingsSheet.header, r, "Ref")),
    fromItem: blankAware(col(findingsSheet.header, r, "From item")),
    title: trimmed(col(findingsSheet.header, r, "Title")),
    discipline: trimmed(col(findingsSheet.header, r, "Discipline")),
    system: blankAware(col(findingsSheet.header, r, "Asset system")),
    linkedChecks: blankAware(col(findingsSheet.header, r, "Linked checks")),
    description: trimmed(col(findingsSheet.header, r, "Description")),
    rootCause: trimmed(col(findingsSheet.header, r, "Root cause (to confirm)")),
    mitigation: trimmed(col(findingsSheet.header, r, "Mitigation ACSA could adopt (TPJV-proposed)")),
    hazardRef: blankAware(col(findingsSheet.header, r, "Hazard")),
  }));

  const hazardsSheet = sheetRows(findSheet(SHEET_HAZARDS_NAMES));
  const hazards: HazardPackRow[] = hazardsSheet.rows.map((r) => ({
    ref: trimmed(col(hazardsSheet.header, r, "Ref")),
    event: trimmed(col(hazardsSheet.header, r, "Event (under 15 words)")),
    description: trimmed(col(hazardsSheet.header, r, "Description")),
    why: trimmed(col(hazardsSheet.header, r, "Why (control and what it protects)")),
    disciplines: splitList(col(hazardsSheet.header, r, "Disciplines")),
    systems: splitList(col(hazardsSheet.header, r, "Systems")),
    findingRefs: splitList(col(hazardsSheet.header, r, "Findings")),
    templateLinks: blankAware(col(hazardsSheet.header, r, "Template links")),
  }));

  const checkObsSheet = sheetRows(byName.get(SHEET_CHECK_OBS));
  const checkObservations: CheckObsPackRow[] = checkObsSheet.rows.map((r) => ({
    checkCode: trimmed(col(checkObsSheet.header, r, "Check")),
    discipline: trimmed(col(checkObsSheet.header, r, "Discipline")),
    fromItem: blankAware(col(checkObsSheet.header, r, "From item")),
    observation: trimmed(col(checkObsSheet.header, r, "Observation to record")),
    askOrVerify: trimmed(col(checkObsSheet.header, r, "What to ask or verify")),
  }));

  return { fileName, adhoc, findings, hazards, checkObservations };
}

/* --------------------------------------------------------- idempotency key */

/** A small, fast, deterministic (not cryptographic — this only has to be
 *  stable, not secret) hash over the file's own bytes plus the sheet name and
 *  the row's Ref — FNV-1a, 32 bits. The same file, sheet and Ref always
 *  produce the same key, which is what makes a second import of an
 *  unchanged file recognise every row it already wrote, and what makes
 *  "remove everything imported from this file" find exactly those rows and
 *  nothing else. A changed file (even one byte) produces different keys
 *  across the board, which is the right, conservative answer: a workbook
 *  edited after the first import is treated as new rather than guessed at. */
export function computeImportKey(fileBytes: Uint8Array, sheetName: string, ref: string): string {
  let h = 0x811c9dc5;
  const mix = (byte: number) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  };
  for (let i = 0; i < fileBytes.length; i++) mix(fileBytes[i]);
  const tail = `|${sheetName}|${ref}`;
  for (let i = 0; i < tail.length; i++) mix(tail.charCodeAt(i) & 0xff);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Embedded in a check observation's appended text — see the header note on
 *  idempotency. Matched back out of `Response.observation` on a second
 *  import (already-there check) and on undo (removal), rather than kept in
 *  any side table. */
const checkObsMarker = (key: string) => `[Imported, TPJV-proposed — key ${key}]`;

export function buildCheckObsNote(pack: ObservationPack, row: CheckObsPackRow, key: string): string {
  const body = row.askOrVerify
    ? `${row.observation} What to ask/verify: ${row.askOrVerify}`
    : row.observation;
  const from = row.fromItem ? ` From item: ${row.fromItem}.` : "";
  return `Imported from observation pack ${pack.fileName}, ref ${row.checkCode} ${checkObsMarker(key)}:${from} ${body}`;
}

/* ------------------------------------------------------------ the plan */

export type AdhocOrigin = AdHocItem["origin"];

const ADHOC_ORIGINS: ReadonlySet<string> = new Set(["field", "acsa", "tpjv"]);

/** "Sarel"/"Adrian" (the "Whose note" column) spelled out the way the source
 *  text elsewhere in the same pack already spells them — "Adrian Barnes" is
 *  verbatim from the pack's own Note column; "Sarel" has no surname anywhere
 *  in the pack, so none is invented here. Anything else in "Whose note" this
 *  app has not been told about is carried through exactly as written rather
 *  than guessed at — same principle as `resolveAdhocOrigin`. */
const WHOSE_NOTE_NAMES: Record<string, string> = {
  adrian: "Adrian Barnes",
  sarel: "Sarel",
};

function displayWhoseNote(whoseNote: string): string {
  return WHOSE_NOTE_NAMES[whoseNote.toLowerCase()] ?? whoseNote;
}

/** `originRaw` is this app's own three-way vocabulary ("field"/"acsa"/
 *  "tpjv" — ACSA's pre-visit pack states it explicitly per row) and is tried
 *  first so that pack's behaviour is exactly unchanged. `whoseNote` is a
 *  DIFFERENT kind of signal — a person's name, from a pack that records who
 *  wrote the note up rather than which of the app's three origin buckets it
 *  belongs in. Both named people in this pack (Sarel, Adrian Barnes) are
 *  TPJV's own auditors — the Read me sheet says so in both cases — so a row
 *  with a "Whose note" value and no recognised `originRaw` resolves to
 *  "tpjv" ("Raised by TPJV"), never the default below, which stays "field"
 *  only for a row with NEITHER signal — unchanged from the behaviour
 *  tests/import-pack.test.mjs already pins for ACSA's pack (a blank Origin,
 *  or one this app does not recognise, still defaults to "field" there,
 *  because that pack never carries a "Whose note" column at all). */
function resolveAdhocOrigin(raw: string | null, whoseNote: string | null): AdhocOrigin {
  const v = (raw ?? "").toLowerCase();
  if (ADHOC_ORIGINS.has(v)) return v as AdhocOrigin;
  if (whoseNote) return "tpjv";
  return "field";
}

/** The note AdHocItem actually stores — "Imported from observation pack …"
 *  plus, when the pack carries them, this row's Title and who wrote it up
 *  (see `displayWhoseNote`), ahead of the sheet's own Note text verbatim.
 *  AdHocItem has no `title` field of its own (see AdhocPackRow.title's own
 *  comment) and no field for who originally raised a note beyond the three-
 *  way `origin` enum, so both live here rather than being dropped — this is
 *  additive wrapper text the import writes, never a change to what Adrian
 *  Barnes or Sarel actually wrote, which is the `note.row` text appended at
 *  the end, untouched. */
function buildAdhocNote(pack: ObservationPack, row: AdhocPackRow): string {
  const lead = [`Imported from observation pack ${pack.fileName}, ref ${row.ref}.`];
  if (row.title) lead.push(`Title: ${row.title}.`);
  if (row.whoseNote) lead.push(`Raised by ${displayWhoseNote(row.whoseNote)}.`);
  return row.note ? `${lead.join(" ")} ${row.note}` : lead.join(" ");
}

/** The description Finding actually stores — the sheet's own Description
 *  verbatim, then the sheet's own "Linked checks" and "From item" text as
 *  plain, unstructured lines (never turned into a resolved link — see
 *  FindingPackRow.fromItem's own comment), in that order. */
function buildFindingDescription(row: FindingPackRow): string {
  const parts = [row.description];
  if (row.linkedChecks) parts.push(`Linked checks: ${row.linkedChecks}`);
  if (row.fromItem) parts.push(`From item: ${row.fromItem}`);
  return parts.join("\n\n");
}

/** The note Hazard actually stores for an imported hazard — "" for ACSA's
 *  pre-visit pack (it never carried Template links, and applyImportPlan used
 *  to hard-code "" here, which this preserves when there is nothing to add)
 *  plus, when the pack names HZ-/RC- references, that text verbatim with an
 *  explicit caveat: this app holds no structured Hazard Screening Template
 *  data to check them against (see the task this shipped against and
 *  HazardPackRow.templateLinks's own comment), so they are carried as plain
 *  reference text, flagged as unverified, rather than as a validated link to
 *  anything or silently dropped. */
function buildHazardNote(pack: ObservationPack, row: HazardPackRow): string {
  if (!row.templateLinks) return "";
  return (
    `Imported from observation pack ${pack.fileName}, ref ${row.ref}. ` +
    `Template links (Hazard Screening Template Rev 02): ${row.templateLinks} — ` +
    `not verified against template data; this app holds no structured copy of that template to check them against.`
  );
}

export interface PlannedAdhoc {
  row: AdhocPackRow;
  importKey: string;
  alreadyImported: boolean;
  origin: AdhocOrigin;
  note: string;
}

export interface PlannedFinding {
  row: FindingPackRow;
  importKey: string;
  alreadyImported: boolean;
  description: string;
  actions: MitigationAction[];
  /** Set when `alreadyImported` is true — the id of the Finding this file
   *  already created, so a hazard whose "Findings" column names this row
   *  can still be linked correctly on a second import even though this row
   *  itself is not written again. */
  existingId: string | null;
  /** This finding's own "Hazard" column (row.hazardRef), checked against
   *  THIS SAME PACK's own Hazards sheet — never against anything stored,
   *  because a hazard raised from this row does not exist yet on a first
   *  import. Exactly one of three shapes, by design (see
   *  tests/ortia-v3-pack.test.mjs): `row.hazardRef` naming a Ref the
   *  Hazards sheet actually has, `null` (the sheet wrote "(none)" or left
   *  it blank), or a Ref the Hazards sheet does NOT have — reported as
   *  dangling rather than written as if it resolved. Informational only:
   *  nothing here changes which Finding gets written, or which Hazard's
   *  `findingIds` includes it — that is still driven by the Hazards
   *  sheet's OWN "Findings" column (`PlannedHazard.resolvedFindingRefs`),
   *  the direction applyImportPlan actually writes in. The two columns
   *  agree in every row this shipped against; this field is what lets a
   *  pack where they stop agreeing be caught rather than assumed. */
  hazardRefDangling: boolean;
}

export interface PlannedHazard {
  row: HazardPackRow;
  importKey: string;
  alreadyImported: boolean;
  /** Which of this pack's OWN finding Refs this hazard's "Findings" column
   *  named, resolved against the finding rows in the same pack — not yet
   *  resolved to real Finding ids, which only exist once the findings in
   *  this plan have actually been written (see applyImportPlan). A Ref the
   *  pack's own Findings sheet does not have is dropped and reported, same
   *  reasoning as an unmapped check id. */
  resolvedFindingRefs: string[];
  unresolvedFindingRefs: string[];
  /** See `buildHazardNote` — "" when the sheet named no Template links. */
  note: string;
}

export interface PlannedCheckObs {
  row: CheckObsPackRow;
  importKey: string;
  alreadyImported: boolean;
  /** The register id this resolves to ("KSIA-BFM-012" for a sheet value of
   *  "BFM-012"), or null if the current entity's register has no such
   *  check — reported as unmapped and never written. */
  resolvedCheckId: string | null;
  note: string;
}

export interface ImportPlan {
  fileName: string;
  entity: string;
  visit: string;
  blockedReason: string | null;
  adhoc: PlannedAdhoc[];
  findings: PlannedFinding[];
  hazards: PlannedHazard[];
  checkObservations: PlannedCheckObs[];
}

export interface ImportContext {
  entity: string | null | undefined;
  visit: string | null | undefined;
  /** Whoever is running the import — same self-reported identity every
   *  createdBy in this app already carries. Attributed to a person rather
   *  than a fixed "system" string so the activity log (which reads
   *  createdBy/createdAt straight off these records — see activity.ts) says
   *  who ran the import, same as it says who typed anything else. */
  auditor: string;
  /** This visit's existing ad-hoc items — see types.ts's own note on why
   *  these are scoped to the visit rather than flat across the entity. */
  existingAdhoc: AdHocItem[];
  /** This entity+visit's existing findings and hazards — flat across the
   *  programme in the store, already filtered the same way
   *  useVisitFindings()/useVisitHazards() filter them for every screen. */
  existingFindings: Finding[];
  existingHazards: Hazard[];
  /** The current entity's own subset of the register — checksAt(entity). */
  checks: Check[];
  /** This visit's responses, keyed by checkId. */
  responses: Record<string, Response>;
}

/** Resolve a bare register code ("BFM-012") against the current entity's
 *  checks. Every check id in this app's register is "KSIA-" plus exactly
 *  this bare discipline-and-number code (see register.ts and checks.json —
 *  the register is ONE shared workbook across ten sites, see the note on
 *  PriorRating in types.ts), so the bare code is tried first as-is (in case
 *  a future pack already carries the full id) and then with that prefix. */
function resolveCheckId(code: string, checks: Check[]): string | null {
  if (!code) return null;
  if (checks.some((c) => c.id === code)) return code;
  const prefixed = `KSIA-${code}`;
  return checks.some((c) => c.id === prefixed) ? prefixed : null;
}

let actionSeq = 0;
function newActionId(): string {
  actionSeq += 1;
  return `${Date.now().toString(36)}${actionSeq}`;
}

export function buildImportPlan(
  pack: ObservationPack,
  fileBytes: Uint8Array,
  ctx: ImportContext
): ImportPlan {
  const entity = ctx.entity ?? "";
  const visit = ctx.visit ?? "";
  const blockedReason =
    !entity || !visit
      ? "No entity and visit is currently selected. Open an audit first — an import has to land somewhere, and nothing is written until one is open."
      : null;

  const key = (sheet: string, ref: string) => computeImportKey(fileBytes, sheet, ref);

  const adhocKeys = new Set(ctx.existingAdhoc.map((a) => a.importKey).filter(Boolean));
  const findingKeys = new Set(ctx.existingFindings.map((f) => f.importKey).filter(Boolean));
  const hazardKeys = new Set(ctx.existingHazards.map((h) => h.importKey).filter(Boolean));

  const adhoc: PlannedAdhoc[] = pack.adhoc.map((row) => {
    const importKey = key(SHEET_ADHOC, row.ref);
    return {
      row,
      importKey,
      alreadyImported: adhocKeys.has(importKey),
      origin: resolveAdhocOrigin(row.originRaw, row.whoseNote),
      note: buildAdhocNote(pack, row),
    };
  });

  const existingFindingById = new Map(ctx.existingFindings.map((f) => [f.importKey, f.id]));
  const hazardRefSet = new Set(pack.hazards.map((h) => h.ref));
  const findings: PlannedFinding[] = pack.findings.map((row) => {
    const importKey = key(SHEET_FINDINGS, row.ref);
    const actions: MitigationAction[] = row.mitigation
      ? [
          {
            id: newActionId(),
            discipline: row.discipline,
            action: row.mitigation,
            owner: "",
            dueDate: "",
            status: "Open",
            originVisit: visit || undefined,
            createdAt: Date.now(),
            createdBy: ctx.auditor,
          },
        ]
      : [];
    return {
      row,
      importKey,
      alreadyImported: findingKeys.has(importKey),
      description: buildFindingDescription(row),
      actions,
      existingId: existingFindingById.get(importKey) ?? null,
      hazardRefDangling: !!row.hazardRef && !hazardRefSet.has(row.hazardRef),
    };
  });

  const findingRefSet = new Set(pack.findings.map((f) => f.ref));
  const hazards: PlannedHazard[] = pack.hazards.map((row) => {
    const importKey = key(SHEET_HAZARDS, row.ref);
    const resolvedFindingRefs = row.findingRefs.filter((r) => findingRefSet.has(r));
    const unresolvedFindingRefs = row.findingRefs.filter((r) => !findingRefSet.has(r));
    return {
      row,
      importKey,
      alreadyImported: hazardKeys.has(importKey),
      resolvedFindingRefs,
      unresolvedFindingRefs,
      note: buildHazardNote(pack, row),
    };
  });

  const checkObservations: PlannedCheckObs[] = pack.checkObservations.map((row) => {
    /* ACSA's pre-visit pack never repeated a Check code — one row per check,
     *  so the Check code alone was a safe, unique ref for the idempotency
     *  key. TPJV's own pack genuinely does repeat one: BFM-004 carries three
     *  SEPARATE observations here (from W5/OBS-ORT-01, W6/OBS-ORT-02, W7/
     *  OBS-ORT-03), each real text a person needs to see, not a duplicate of
     *  the others — 24 distinct Check codes across these 35 rows, 8 of them
     *  repeated. Keying on the Check code alone would give those three rows
     *  the SAME key and the SAME marker, so "already imported" could no
     *  longer tell them apart: `already` is one `.includes(marker)` test
     *  against the check's single note, so once ANY ONE of the three is
     *  written, all three would read as already-imported, even one whose
     *  own text a person had since edited or removed by hand — this app's
     *  own "nothing a human typed gets silently skipped" guarantee failing
     *  silently in exactly the case it exists for. "From item" (present
     *  only on a pack new enough to repeat a Check at all) disambiguates
     *  them, one key and one marker per row; a pack with no "From item"
     *  column computes exactly the ref it always did, so an importKey
     *  already written from ACSA's pack is untouched by this. */
    const ref = row.fromItem ? `${row.checkCode}|${row.fromItem}` : row.checkCode;
    const importKey = key(SHEET_CHECK_OBS, ref);
    const resolvedCheckId = resolveCheckId(row.checkCode, ctx.checks);
    const note = buildCheckObsNote(pack, row, importKey);
    const already =
      !!resolvedCheckId &&
      (ctx.responses[resolvedCheckId]?.observation ?? "").includes(checkObsMarker(importKey));
    return {
      row,
      importKey,
      alreadyImported: already,
      resolvedCheckId,
      note,
    };
  });

  return { fileName: pack.fileName, entity, visit, blockedReason, adhoc, findings, hazards, checkObservations };
}

/* -------------------------------------------------------------- counting */

export interface PlanCounts {
  adhoc: { total: number; toWrite: number; alreadyImported: number };
  findings: { total: number; toWrite: number; alreadyImported: number };
  hazards: { total: number; toWrite: number; alreadyImported: number };
  checkObservations: {
    total: number;
    toWrite: number;
    alreadyImported: number;
    unmapped: number;
  };
}

export function planCounts(plan: ImportPlan): PlanCounts {
  const bucket = (rows: { alreadyImported: boolean }[]) => ({
    total: rows.length,
    toWrite: rows.filter((r) => !r.alreadyImported).length,
    alreadyImported: rows.filter((r) => r.alreadyImported).length,
  });
  return {
    adhoc: bucket(plan.adhoc),
    findings: bucket(plan.findings),
    hazards: bucket(plan.hazards),
    checkObservations: {
      ...bucket(plan.checkObservations.filter((r) => r.resolvedCheckId !== null)),
      total: plan.checkObservations.length,
      unmapped: plan.checkObservations.filter((r) => r.resolvedCheckId === null).length,
    },
  };
}

/* ---------------------------------------------------------------- apply */

export interface ImportActions {
  addAdhoc: (a: Omit<AdHocItem, "id" | "createdAt">) => string;
  addFinding: (f: Omit<Finding, "id" | "createdAt" | "entity">) => string;
  addHazard: (h: Omit<Hazard, "id" | "createdAt" | "entity">) => string;
  /** Looked up fresh per check rather than passed as a snapshot, so a check
   *  observation appends onto whatever the response holds right now — the
   *  same reasoning appendObservation() in store.ts already follows. */
  getResponse: (checkId: string) => Response;
  patchResponse: (checkId: string, p: Partial<Response>) => void;
  auditor: string;
  visit: string;
}

export interface ApplyResult {
  adhocWritten: number;
  findingsWritten: number;
  hazardsWritten: number;
  checkObservationsWritten: number;
}

/** Writes everything in `plan` that is not already imported and not
 *  unmapped, through the store actions handed in — never by touching state
 *  directly. Findings are written before hazards so a hazard's "Findings"
 *  column (Refs into the SAME pack) can be resolved to the real Finding ids
 *  this import just minted, exactly once, in this one pass. */
export function applyImportPlan(plan: ImportPlan, actions: ImportActions): ApplyResult {
  const result: ApplyResult = {
    adhocWritten: 0,
    findingsWritten: 0,
    hazardsWritten: 0,
    checkObservationsWritten: 0,
  };
  if (plan.blockedReason) return result;

  for (const a of plan.adhoc) {
    if (a.alreadyImported) continue;
    actions.addAdhoc({
      origin: a.origin,
      description: a.row.description,
      discipline: a.row.discipline,
      system: a.row.system,
      area: a.row.area,
      outcome: null,
      note: a.note,
      attachments: [],
      findingId: null,
      createdBy: actions.auditor,
      importKey: a.importKey,
    });
    result.adhocWritten++;
  }

  const findingIdByRef = new Map<string, string>();
  for (const f of plan.findings) {
    if (f.alreadyImported) {
      if (f.existingId) findingIdByRef.set(f.row.ref, f.existingId);
      continue;
    }
    const id = actions.addFinding({
      checkId: null,
      discipline: f.row.discipline,
      system: f.row.system ?? "",
      area: "",
      title: f.row.title,
      description: f.description,
      issueIndex: null,
      severity: null,
      likelihood: null,
      ratingConfirmed: false,
      rootCause: f.row.rootCause,
      actions: f.actions,
      actionStatus: "Open",
      originVisit: actions.visit,
      priorRating: null,
      suggestedEvent: "",
      progress: [],
      adHoc: true,
      createdBy: actions.auditor,
      importKey: f.importKey,
    });
    findingIdByRef.set(f.row.ref, id);
    result.findingsWritten++;
  }

  for (const h of plan.hazards) {
    if (h.alreadyImported) continue;
    const findingIds = h.resolvedFindingRefs
      .map((ref) => findingIdByRef.get(ref))
      .filter((id): id is string => !!id);
    actions.addHazard({
      originVisit: actions.visit,
      event: h.row.event,
      description: h.row.description,
      why: h.row.why,
      findingIds,
      disciplines: h.row.disciplines,
      systems: h.row.systems,
      areas: [],
      otherImpacts: [],
      severity: null,
      likelihood: null,
      ratingConfirmed: false,
      ermConsequence: null,
      ermLikelihood: null,
      ermConfirmed: false,
      ermLikelihoodAssumed: false,
      origin: "tpjv",
      note: h.note,
      occurrence: "",
      ratingRationale: "",
      progress: [],
      immediate: false,
      reassessedAt: null,
      reassessNote: "",
      rootCause: "",
      actions: [],
      actionStatus: "Open",
      createdBy: actions.auditor,
      importKey: h.importKey,
    });
    result.hazardsWritten++;
  }

  for (const c of plan.checkObservations) {
    if (c.alreadyImported || !c.resolvedCheckId) continue;
    const r = actions.getResponse(c.resolvedCheckId);
    const obs = r.observation ? `${r.observation.replace(/\s*$/, "")}\n\n${c.note}` : c.note;
    actions.patchResponse(c.resolvedCheckId, { observation: obs });
    result.checkObservationsWritten++;
  }

  return result;
}

/* ---------------------------------------------------------------- undo */

export interface UndoActions {
  removeAdhoc: (id: string) => void;
  removeFinding: (id: string) => void;
  removeHazard: (id: string) => void;
  getResponse: (checkId: string) => Response;
  patchResponse: (checkId: string, p: Partial<Response>) => void;
}

export interface UndoContext {
  adhoc: AdHocItem[];
  findings: Finding[];
  hazards: Hazard[];
  /** Every check a row in the current visit might have appended to — in
   *  practice checksAt(entity), the same list the plan resolved against. */
  checks: Check[];
  responses: Record<string, Response>;
}

export interface UndoResult {
  adhocRemoved: number;
  findingsRemoved: number;
  hazardsRemoved: number;
  checkObservationsStripped: number;
}

/** "Remove everything imported from this file" — every AdHocItem, Finding
 *  and Hazard still carrying one of this file's import keys, through the
 *  store's own removeAdhoc/removeFinding/removeHazard, and every check
 *  observation block this file's keys produced, stripped back out of the
 *  Response it was appended to. A block is only stripped if it is still
 *  there VERBATIM — if someone has since edited that part of the note, the
 *  exact text this import produced no longer matches, and undo leaves it
 *  alone rather than guessing at what to remove from an edited sentence. */
export function undoImport(fileKeys: Set<string>, ctx: UndoContext, actions: UndoActions): UndoResult {
  const result: UndoResult = {
    adhocRemoved: 0,
    findingsRemoved: 0,
    hazardsRemoved: 0,
    checkObservationsStripped: 0,
  };

  for (const a of ctx.adhoc) {
    if (a.importKey && fileKeys.has(a.importKey)) {
      actions.removeAdhoc(a.id);
      result.adhocRemoved++;
    }
  }
  for (const f of ctx.findings) {
    if (f.importKey && fileKeys.has(f.importKey)) {
      actions.removeFinding(f.id);
      result.findingsRemoved++;
    }
  }
  for (const h of ctx.hazards) {
    if (h.importKey && fileKeys.has(h.importKey)) {
      actions.removeHazard(h.id);
      result.hazardsRemoved++;
    }
  }
  for (const c of ctx.checks) {
    const r = ctx.responses[c.id];
    if (!r?.observation) continue;
    let obs = r.observation;
    let changed = false;
    for (const key of fileKeys) {
      const marker = checkObsMarker(key);
      if (!obs.includes(marker)) continue;
      /* The exact block this import appended: "Imported from observation
         pack <file>, ref <code> [marker]: <body>", preceded by the blank
         line appendImportPlan inserted, or standing alone if it was the
         first thing ever written to this note. */
      const blockRe = new RegExp(
        `(?:\\n\\n)?Imported from observation pack [^\\n]*?${escapeRe(marker)}:[^\\n]*`,
        "g"
      );
      const next = obs.replace(blockRe, "");
      if (next !== obs) {
        obs = next;
        changed = true;
      }
    }
    if (changed) {
      actions.patchResponse(c.id, { observation: obs.trim() });
      result.checkObservationsStripped++;
    }
  }

  return result;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
