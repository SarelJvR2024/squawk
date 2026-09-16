/** What Squawk writes back to the portal, and what it refuses to.
 *
 *  Two lists and one document library, named by the register itself:
 *
 *    meta.keys — "checkpoints[].id is the portal key (Check-points list, Title
 *    column); priorFindings2025[].portalId is the Findings list Title. Keep
 *    both unchanged in Squawk so results can sync back."
 *
 *  Everything below hangs off that sentence. Title is the join, in both
 *  directions, which is why `checkpoints[].id` and `priorFindings2025[].portalId`
 *  have been preserved verbatim since the register was vendored.
 *
 *  THE THREE RULES THIS FILE EXISTS TO ENFORCE
 *
 *  1. A rating nobody agreed is not a rating. `ermConfirmed` gates every rating
 *     field. A severity the assistant proposed and a person never looked at
 *     must not appear in a portal that feeds the Audit & Risk Committee — it
 *     would be indistinguishable from a judgement once it is in there.
 *
 *  2. A blank status is NOT compliant. A check nobody answered is left alone.
 *     Writing "" into a compliance column turns "we did not get to it" into
 *     "we looked and it was fine", and no reader could tell afterwards.
 *
 *  3. Nothing is written twice. Every write is matched on Title first and
 *     PATCHed if it is there. Running the sync a second time produces the same
 *     portal, not a doubled one.
 *
 *  WHICH RATING GOES IN. The portal rates on ACSA's ERM instrument, not on
 *  B170 001M. That is measured, not assumed: run both matrices over all 56
 *  rateable prior findings and ERM reproduces 54, B170 only 42 — and 13 of
 *  B170's 14 misses land exactly on the five cells where the two instruments
 *  disagree (1B, 3B, 4C). If the portal were B170 those are the cells it would
 *  get RIGHT. So the ERM consequence, likelihood, priority and tolerance are
 *  what go back. The B170 rating stays in the workbook, where the safety case
 *  reads it.
 *
 *  AND IN THE PORTAL'S OWN WORDS. The portal spells its scales "C - Significant"
 *  and "3 - Likely". Those exact strings are DERIVED from the vendored register
 *  below rather than typed out here, so they cannot drift from what is actually
 *  in the list.
 *
 *  A note for whoever reads this next to src/app/api/assist/route.ts, where a
 *  near-identical looking set of words is a documented DEFECT: these are not
 *  the same thing. Telling a model that B170 001M's likelihood 3 means "Likely"
 *  inverts its meaning — B170's level 3 is "Remote", occurrence history, and an
 *  opinion given against the wrong word is worthless. Writing the portal's own
 *  string back into the portal's own column is a round trip. One is a
 *  description of a scale; the other is a value in a vocabulary that belongs to
 *  somebody else. */

import priorRaw from "@/data/priorFindings.json";
import * as erm from "./erm";
import { photoFilename } from "./photos";
import { portalIdFor, siteCodeFor, siteFor } from "./sites";
import type {
  Attachment,
  Check,
  Finding,
  ErmConsequence,
  ErmLikelihood,
  Hazard,
  PriorFinding,
  ProgressNote,
  Response,
  Verification,
} from "./types";

/* ------------------------------------------------- the portal's vocabulary */

/** The severity and likelihood strings, read off the register rather than
 *  written here.
 *
 *  All ten are present in the real portal data, so nothing is invented — which
 *  matters, because inventing ACSA's wording is exactly the thing this project
 *  does not do. If a level ever stops appearing in the register this map loses
 *  it and the sync reports the gap rather than guessing a replacement. */
function observed(field: "severity" | "likelihood"): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of priorRaw as unknown as PriorFinding[]) {
    const v = (p as unknown as Record<string, string>)[field];
    if (typeof v === "string" && v.trim()) m.set(v.trim().charAt(0), v.trim());
  }
  return m;
}

const SEVERITY_WORDS = observed("severity");
const LIKELIHOOD_WORDS = observed("likelihood");

/** ERM's consequence axis runs 5 (Catastrophic) down to 1 (Minor); the portal's
 *  runs A down to E. They map by position.
 *
 *  AND THE WORDS ARE ALREADY THE SAME ONES. ERM's own labels are "4 - Critical"
 *  and "3 - Significant"; the portal's are "B - Critical" and "C - Significant".
 *  Same vocabulary, different index. That is a fourth independent confirmation
 *  that the portal rates on ERM, and it sharpens what the assist-route defect
 *  actually was: not somebody inventing a generic scale, but somebody
 *  describing ERM's scale and labelling it B170 001M. B170's level 3 is
 *  "Remote" — occurrence history — and ERM's level 3 is "Likely" — a
 *  probability band. Telling a model the second while naming the first inverts
 *  the meaning, which is exactly why that fix mattered.
 *
 *  So this conversion changes the index and nothing else. If the two ever stop
 *  agreeing on the words, `portalSeverity` returns null rather than writing a
 *  string the portal does not use. */
const CONSEQUENCE_LETTER: Record<ErmConsequence, string> = {
  "5 - Catastrophic": "A",
  "4 - Critical": "B",
  "3 - Significant": "C",
  "2 - Moderate": "D",
  "1 - Minor": "E",
};

/** The word after the index, "4 - Critical" -> "critical". */
const wordOf = (s: string) => s.split("-").slice(1).join("-").trim().toLowerCase();

export function portalSeverity(c: ErmConsequence | null | undefined): string | null {
  if (!c) return null;
  const letter = CONSEQUENCE_LETTER[c];
  const portal = letter ? SEVERITY_WORDS.get(letter) : undefined;
  if (!portal) return null;
  /* Refuse rather than write a string the portal does not use. If ACSA
     rewords one axis and not the other, a silent mismatch here would put a
     value in the list that no view or filter matches — which looks synced and
     is not. */
  return wordOf(portal) === wordOf(c) ? portal : null;
}

export function portalLikelihood(l: ErmLikelihood | null | undefined): string | null {
  if (!l) return null;
  const portal = LIKELIHOOD_WORDS.get(String(l).charAt(0));
  if (!portal) return null;
  return wordOf(portal) === wordOf(l) ? portal : null;
}

/* ------------------------------------------------------------ the columns */

/** The logical fields the sync knows how to write, and the display names a
 *  SharePoint list might carry them under.
 *
 *  Matched case- and space-insensitively against the list's ACTUAL columns at
 *  run time. Nothing here is an internal name and nothing here is guessed into
 *  a write: a logical field whose column is not present is reported in the plan
 *  and simply not written. That is deliberate — a portal with no Progress
 *  column should still be able to receive the ratings. */
export const FIELD_CANDIDATES: Record<string, string[]> = {
  title: ["Title"],
  discipline: ["Discipline"],
  assetSystem: ["Asset system", "Asset System", "AssetSystem"],
  observation: ["Observation", "Finding", "Description"],
  severity: ["Severity", "Consequence"],
  likelihood: ["Likelihood", "Probability"],
  riskPriority: ["Risk priority", "Risk Priority", "Priority"],
  tolerance: ["Tolerance", "Risk rating", "Risk Rating"],
  status: ["Status"],
  dateRaised: ["Date raised", "Date Raised", "Raised"],
  rootCause: ["Root cause", "Root Cause"],
  treatment: ["Risk treatment", "Risk Treatment", "Treatment"],
  owner: ["Owner", "Responsible", "Responsible person"],
  targetDate: ["Target date", "Target Date", "Due date"],
  progress: ["Progress/Update", "Progress / Update", "Progress", "Update"],
  compliance: ["Compliance", "Result", "Outcome"],
  auditor: ["Auditor", "Assessed by", "Captured by"],
  assessedOn: ["Assessed on", "Date assessed", "Assessed"],
  reference: ["Reference", "Source"],
  assets: ["Assets", "Asset", "Asset tag", "Asset ID", "Equipment"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** WHAT THE PORTAL HAS TO LOOK LIKE, in one place.
 *
 *  The lists Squawk writes to, the columns it needs in each, and the names it
 *  will accept for them used to be three facts in two files: the field lists
 *  sat in SyncPanel, the list-name patterns were regexes inline in its reader,
 *  and FIELD_CANDIDATES was here. Whoever builds the SharePoint site needs all
 *  three and has to be told them EXACTLY — a column called something Squawk
 *  does not recognise is silently skipped — so they are one export now, and the
 *  readiness screen renders them from this rather than from a list somebody
 *  typed out beside it. */

/** By display name, because internal names are `field_7` and nobody builds a
 *  list to those. A space is allowed where a hyphen is: SharePoint's own new-
 *  list dialog will happily produce "Check points". */
export const LIST_NAMES = {
  checkpoints: /^check[-\s]?points?$/i,
  findings: /^findings?$/i,
  /** Not anchored: this one matches a library's name loosely on purpose —
      "Documents", "Shared Documents" and "Evidence" are all the same thing
      here, and a site has exactly one of them worth writing photographs to. */
  evidence: /document|shared|evidence/i,
} as const;

export const CHECK_FIELDS = [
  "title", "discipline", "assetSystem", "compliance", "observation", "auditor", "assessedOn",
] as const;

export const FINDING_FIELDS = [
  "title", "discipline", "assetSystem", "observation", "severity", "likelihood",
  "riskPriority", "tolerance", "status", "rootCause", "treatment", "owner",
  "targetDate", "progress", "dateRaised", "assets",
] as const;

/** The column contract, for a person to build against: the name to create, and
 *  the other names that would also be matched. Derived from FIELD_CANDIDATES,
 *  so a change to what the sync looks for changes what the screen asks for. */
export function columnContract(
  fields: readonly string[]
): { key: string; create: string; alsoAccepts: string[] }[] {
  return fields.map((key) => {
    const names = FIELD_CANDIDATES[key] ?? [];
    return { key, create: names[0] ?? key, alsoAccepts: names.slice(1) };
  });
}

export interface FieldMap {
  /** logical name -> the list's INTERNAL column name. */
  resolved: Record<string, string>;
  /** Logical names this list has no column for. Reported, never guessed. */
  missing: string[];
  /** logical name -> the options a Choice column will accept, read off the
   *  column itself. Absent for every other kind of column. See `portalChoice`. */
  choices: Record<string, string[]>;
}

/** Build the map from the list's own columns.
 *
 *  A read-only column (Created, Modified, computed) is treated as absent: it
 *  exists, and writing to it fails the whole PATCH, which would take the rows
 *  that were fine down with it. */
export function mapFields(
  columns: {
    name: string;
    displayName: string;
    readOnly?: boolean;
    choice?: { choices?: string[] };
  }[],
  wanted: string[]
): FieldMap {
  type Col = { name: string; readOnly?: boolean; choice?: { choices?: string[] } };
  const byDisplay = new Map<string, Col>();
  for (const c of columns) byDisplay.set(norm(c.displayName), c);
  /* AND BY INTERNAL NAME, as a second pass.
   *
   *  Display names are what somebody building a list types, which is why they
   *  are what FIELD_CANDIDATES holds — but they are also what somebody RENAMES
   *  later, and renaming a column in SharePoint's list UI changes only the
   *  display name. The internal name it was created with never moves.
   *
   *  TPJV's Check-points and Findings lists, read on 16 September 2026, are
   *  exactly that case: the built-in Title column is still internally `Title`
   *  and still holds every portal id — the sync READ 33 of them and matched
   *  them — but its display name had been changed, so a display-only lookup
   *  reported the join key as absent and the plan offered to write rows that
   *  could never be found again.
   *
   *  Display name still wins: it is what a person deliberately chose, and a
   *  list with both an "Observation" column and something internally named
   *  `Observation` should write to the one the builder meant. This only
   *  catches what the first pass missed. */
  const byInternal = new Map<string, Col>();
  for (const c of columns) byInternal.set(norm(c.name), c);

  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  const choices: Record<string, string[]> = {};
  for (const key of wanted) {
    const names = FIELD_CANDIDATES[key] ?? [];
    const hit =
      names.map((d) => byDisplay.get(norm(d))).find((c) => c && !c.readOnly) ??
      names.map((d) => byInternal.get(norm(d))).find((c) => c && !c.readOnly);
    if (hit) {
      resolved[key] = hit.name;
      if (hit.choice?.choices?.length) choices[key] = hit.choice.choices;
    } else missing.push(key);
  }
  return { resolved, missing, choices };
}

/* ------------------------------------------- speaking the column's language */

/** Turn a value into the option the column will actually accept.
 *
 *  Prince Mahlangu, 16 September 2026, reading the lists after the first real
 *  sync: "the values are the bare codes C, NC and NV instead of the portal
 *  choices 'C - Compliant', 'NC - Non-compliant' and 'NV - Not available' —
 *  the web part copes, the lists show codes."
 *
 *  THE STRINGS ARE NOT WRITTEN DOWN HERE, and that is the whole point. ACSA's
 *  choice wording appears nowhere in the vendored register, so typing it into
 *  this file would be Squawk inventing their vocabulary — the one thing this
 *  project does not do. It is read off the column instead, the same way the
 *  internal column names are, so a choice ACSA rewords is picked up by the
 *  next run rather than drifting silently.
 *
 *  THE MATCH IS ON THE CODE, not on the words: "C" finds "C - Compliant"
 *  because the option's leading code is C. An exact option is taken as-is,
 *  which is why the severity and likelihood values — already the portal's own
 *  strings, derived from the register — pass through untouched.
 *
 *  Returns null when the column offers options and NONE of them fit. That is
 *  reported rather than written: a value a Choice column will reject either
 *  fails the whole PATCH or lands as something nobody chose. */
export function portalChoice(value: string, choices: string[] | undefined): string | null {
  if (!choices?.length) return value;
  const v = value.trim();
  if (!v) return v;
  const exact = choices.find((c) => c.trim() === v);
  if (exact) return exact;
  const loose = choices.find((c) => norm(c) === norm(v));
  if (loose) return loose;
  /* The option's leading code, up to the first separator: "C - Compliant" -> C,
     "3 - Likely" -> 3. Compared case-insensitively against the whole value. */
  const code = (c: string) => c.split(/[\s\-–—:,/]+/)[0]?.trim().toLowerCase() ?? "";
  const byCode = choices.find((c) => code(c) === v.toLowerCase());
  return byCode ?? null;
}

/** Every value in these rows that the column it is bound for will refuse.
 *  Shown in the plan, so a mismatch is seen before it is written. */
export function choiceMismatches(
  map: FieldMap,
  rows: PlannedRow[]
): { field: string; value: string; offered: string[] }[] {
  const seen = new Set<string>();
  const out: { field: string; value: string; offered: string[] }[] = [];
  for (const r of rows) {
    for (const [key, v] of Object.entries(r.values)) {
      const offered = map.choices[key];
      if (!offered?.length || typeof v !== "string" || !v.trim()) continue;
      if (portalChoice(v, offered) !== null) continue;
      const k = `${key}\u0000${v}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ field: key, value: v, offered });
    }
  }
  return out;
}

/** Drop anything with no column, and anything with nothing to say.
 *
 *  `undefined` and `null` are always skipped. THE EMPTY STRING DEPENDS ON THE
 *  ACTION, and that distinction is the whole point of this signature.
 *
 *  On a CREATE there is nothing underneath to lose, so an empty string is just
 *  an empty new cell.
 *
 *  On an UPDATE it would write over whatever is already in the portal. The
 *  first real sync, 16 September 2026, updated 33 rows in a list ACSA had
 *  seeded themselves — and every check answered without an observation typed
 *  carried `observation: ""`, which went in and blanked theirs. Nobody asked
 *  for that. Tapping Compliant without adding a note is not a statement that
 *  the portal's existing text should go.
 *
 *  Sarel's rule, the same day: "make updates skip empty values." So an update
 *  can fill a cell and change a cell, and can never empty one. The cost is
 *  that a deletion made in Squawk does not propagate — rare, visible in the
 *  workbook either way, and a person can clear the cell in SharePoint. That is
 *  the cheaper mistake by a distance. */
/** CAN THIS LIST BE SYNCED AT ALL?
 *
 *  `title` is not one field among the others — it is the JOIN. Every row is
 *  matched on Title in both directions: `buildPlan` reads the Titles already
 *  in the list to decide create against update, and `mintPortalId` continues
 *  the portal's own sequence from them. A list Squawk cannot write a Title to
 *  is a list where every run creates the same rows again, because nothing it
 *  wrote is findable next time.
 *
 *  That is the doubling sync — the failure this whole file's third rule exists
 *  to prevent, and the one that looks like it worked, twice, until somebody
 *  reads the report. So it is a refusal, not a warning among warnings.
 *
 *  Seen for real on 16 September 2026: TPJV's Check-points and Findings lists
 *  both came back with no writable Title, and the plan offered to write anyway.
 *  Either the column was renamed (only the display name "Title" is accepted)
 *  or it is read-only, which `mapFields` treats as absent on purpose — writing
 *  to a read-only column fails the whole PATCH and takes the good rows with
 *  it. */
export function canJoin(map: FieldMap | null | undefined): boolean {
  return !!map && !map.missing.includes("title");
}

/** The sentence to put in front of somebody, naming the list. */
export function joinRefusal(list: string): string {
  return `${list} has no writable Title column, so Squawk cannot match rows in it. Title is the key every row is found by — without it each run would create the same rows again instead of updating them. Check whether Title has been renamed (only the display name "Title" is accepted) or made read-only.`;
}

export function projectFields(
  map: FieldMap,
  values: Record<string, string | number | null | undefined>,
  /* Defaults to "create" — the permissive case — so a caller that forgets to
     say which it is cannot silently acquire the power to blank cells. */
  action: RowAction = "create"
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(values)) {
    const col = map.resolved[key];
    if (!col || v === undefined || v === null) continue;
    if (action === "update" && v === "") continue;
    /* A Choice column takes one of its own options or nothing. An option that
       matches is substituted; a value with no match is left as it is and
       reported by choiceMismatches, because guessing at a column's vocabulary
       is how "C" ended up in a list whose options read "C - Compliant". */
    if (typeof v === "string" && map.choices[key]?.length) {
      out[col] = portalChoice(v, map.choices[key]) ?? v;
      continue;
    }
    out[col] = v;
  }
  return out;
}

/* ------------------------------------------- indexing what is already there */

export interface ExistingIndex {
  /** Title -> item id, for THIS SITE'S rows only. */
  byTitle: Map<string, string>;
  /** Titles this site has more than one row for. The join is ambiguous for
   *  every one of them, so they are refused rather than resolved. */
  duplicates: string[];
  /** Rows in the list belonging to some other site. Counted, never touched. */
  foreign: number;
  /** And their Titles, so "which rows are these?" is answerable from inside
   *  Squawk rather than by hand in SharePoint. A diagnosis nobody can run
   *  without a SharePoint tutorial is a diagnosis that does not get run. */
  foreignTitles: string[];
  /** Rows whose Title is empty. Counted so a list full of them is visible. */
  untitled: number;
}

/** Build the Title -> item id index the plan joins on.
 *
 *  THIS USED TO BE THREE LINES IN THE PANEL AND IT WAS WRONG IN TWO WAYS.
 *
 *  It indexed EVERY row in the list with no notion of which site the row
 *  belonged to, and it did so into a plain Map — so two rows sharing a Title
 *  silently collapsed to whichever came last, and an update could land on a
 *  row nobody meant. Squawk is the only thing writing to that portal, and six
 *  rows for Bram Fischer came out of a King Shaka test; the mechanism is still
 *  unproven, but a join that cannot say which site a row is for, and that
 *  resolves an ambiguous key by arrival order, is not a join anybody should be
 *  betting a system of record on.
 *
 *  So: rows whose Title does not carry this site's code are not indexed at
 *  all — they cannot be matched, so they cannot be written. A Title this site
 *  has twice is recorded as ambiguous and refused. Both counts are reported,
 *  because "nothing matched" and "half the list is another airport's" are very
 *  different answers to why a plan looks wrong. */
export function indexExisting(
  rows: { title: string; id: string }[],
  siteCode: string
): ExistingIndex {
  const prefix = `${siteCode}-`.toLowerCase();
  const byTitle = new Map<string, string>();
  const seen = new Set<string>();
  const dupes = new Set<string>();
  let foreign = 0;
  const foreignTitles: string[] = [];
  let untitled = 0;

  for (const r of rows) {
    const t = (r.title ?? "").trim();
    if (!t) {
      untitled++;
      continue;
    }
    if (!t.toLowerCase().startsWith(prefix)) {
      foreign++;
      foreignTitles.push(t);
      continue;
    }
    if (seen.has(t)) dupes.add(t);
    seen.add(t);
    byTitle.set(t, r.id);
  }
  for (const t of dupes) byTitle.delete(t);

  return { byTitle, duplicates: [...dupes], foreign, foreignTitles, untitled };
}

/** Does this Title belong to the site being synced?
 *
 *  The last gate before a write. Every Title the plan mints comes from
 *  portalIdFor, which always leads with the site's code — so a row that fails
 *  this is a bug in Squawk, not a mis-typed list, and it must not reach the
 *  portal. */
export function belongsToSite(title: string, siteCode: string): boolean {
  return title.toLowerCase().startsWith(`${siteCode}-`.toLowerCase());
}

/* --------------------------------------------------------------- the plan */

export interface SyncInput {
  entity: string;
  visit: string;
  /** This visit's findings, used only to notice a non-compliant check with
   *  nothing written behind it. Optional so the plan builder's own tests do
   *  not have to care. */
  findings?: Finding[];
  visitLabel: string;
  checks: Check[];
  responses: Record<string, Response>;
  /** The CONSOLIDATED view. The portal's Findings list receives hazards, not
   *  findings, and that is not a shortcut — see buildPlan. */
  hazards: Hazard[];
  prior: PriorFinding[];
  verifications: Record<string, Verification>;
  auditor: string;
}

export type RowAction = "create" | "update";

export interface PlannedRow {
  /** The Title this row joins on. */
  key: string;
  action: RowAction;
  /** Existing SharePoint item id, when this is an update. */
  itemId?: string;
  /** The hazard this row came from, so a Title minted on create can be written
   *  back to it and the next sync updates instead of creating again. */
  hazardId?: string;
  /** Logical field values, before the column map is applied. */
  values: Record<string, string | number | null | undefined>;
  /** One line a person can read, so the preview means something. */
  summary: string;
}

export interface PlannedFile {
  checkId: string;
  filename: string;
  /** The attachment itself, not just its local key.
   *
   *  A photograph's BYTES live in up to two places — this device's IndexedDB
   *  and the record copy — and which of them answers is not a thing the plan
   *  can know: the local key rides in the persisted JSON and crosses to every
   *  device on the audit, while the image does not. Planning on `blobKey`
   *  alone meant an auditor who joined the audit rather than taking the
   *  photographs uploaded nothing and was told the images were "no longer on
   *  this device", when the record held every one of them. */
  attachment: Attachment;
  caption: string;
}

export interface SyncPlan {
  checkpoints: PlannedRow[];
  findings: PlannedRow[];
  evidence: PlannedFile[];
  /** Why rows were left out, in the words of somebody who might disagree. */
  skipped: { what: string; why: string; count: number }[];
  /** Things that ARE going across and should be said out loud anyway.
   *
   *  Distinct from `skipped` on purpose. Skipped is "this is not being
   *  written"; a warning is "this is being written and it will read as less
   *  than it is". Prince Mahlangu found the first one by reading the portal:
   *  fifteen non-compliant check-points with no finding behind any of them, so
   *  Energy and Demand Management came out Acceptable with a non-compliant
   *  check underneath it. Sarel's rule: warn, do not block — a non-compliant
   *  answer is still the truth and still belongs in the portal. */
  warnings: { what: string; why: string; count: number }[];
  folder: string;
}

/** ACSA's Progress/Update is ONE cell that gets typed over at every follow-up.
 *  Squawk keeps the entries with their author and date; this is where the log
 *  is flattened back into their format on the way out — their shape, our
 *  history, and nothing lost at this end. */
export function flattenProgress(notes: ProgressNote[] | undefined): string {
  if (!notes?.length) return "";
  return notes
    .map((n) => `${new Date(n.at).toLocaleDateString("en-ZA")} — ${n.by}: ${n.note}`)
    .join("\n");
}

/** The evidence folder for a site: `Evidence/King Shaka International FALE`.
 *
 *  One folder per site, matching the ten already in the library. Derived from
 *  the site table so a new site gets the same shape without anybody editing a
 *  path by hand. */
export function evidenceFolder(entityCode: string): string {
  const s = siteFor(entityCode);
  if (!s) return "Evidence";
  return `Evidence/${s.name} ${s.icao}`;
}

/** The Title for a hazard that has never been in the portal.
 *
 *  The observed convention is `KSIA-ELE-P01` — site, discipline, then a
 *  sequence. A new one continues the sequence rather than restarting it, so
 *  this has to see every Title already taken; `taken` is the live list read
 *  back from SharePoint, not a guess from local state, because somebody else
 *  may have added rows since the last sync.
 *
 *  A consolidated hazard spans disciplines by nature (that is the point of
 *  consolidating). The FIRST discipline is used for the id and every one of
 *  them still goes in the Discipline column — an id has to pick one, a record
 *  does not. */
export function mintPortalId(
  entityCode: string,
  disciplines: string[],
  taken: Set<string>
): string {
  const site = siteCodeFor(entityCode);
  const disc = (disciplines[0] ?? "GEN").slice(0, 3).toUpperCase();
  const prefix = `${site}-${disc}-P`;
  let n = 0;
  for (const t of taken) {
    if (!t.startsWith(prefix)) continue;
    const got = Number(t.slice(prefix.length));
    if (Number.isFinite(got)) n = Math.max(n, got);
  }
  return `${prefix}${String(n + 1).padStart(2, "0")}`;
}

/** Build the whole plan without writing anything.
 *
 *  This is the safety property that matters most in the feature: an auditor
 *  sees every row that would be created or changed, and every row that would
 *  NOT be and why, BEFORE any request with a method other than GET is made.
 *  A sync you cannot preview is a sync you have to trust, and nobody should
 *  have to trust this one.
 *
 *  WHY HAZARDS AND NOT FINDINGS. A finding carries the B170 001M rating; only
 *  a hazard carries the ERM one, and the portal rates on ERM. That is not a
 *  convenient coincidence, it is the model: findings are what one discipline
 *  wrote up at one check-point, and the same missing fuse was PF-02 for
 *  Electrical and PF-21 for Process Safety in March 2025 — two rows, two
 *  ratings, one fuse. The hazard is the event, it is what persists year on
 *  year, and it is what the register should therefore contain. Syncing
 *  findings would put the duplication back.
 *
 *  So a finding nobody has consolidated yet does not go across, and the plan
 *  says so out loud rather than letting it look synced. */
/** WHAT A NON-COMPLIANT CHECK SAYS WHEN NOBODY TYPED ANYTHING.
 *
 *  Sarel, 16 September 2026: "it might be NC because the airport could not
 *  provide compliant evidence. So let's by default on the sync just say
 *  NC - No compliance evidence could be provided, or something like that but
 *  technically correct."
 *
 *  The "technically correct" is the whole difficulty, and the reason this is a
 *  named constant rather than a string in a template. Squawk knows exactly two
 *  things about such a check: an auditor marked it non-compliant, and nobody
 *  wrote anything down. It does NOT know that the airport was asked and could
 *  not produce evidence — that may well be what happened, and it is the most
 *  likely reading, but it is a cause nobody recorded. Writing it as though it
 *  were observed would put a claim into ACSA's system of record that no
 *  auditor made, on a row ACSA reads and acts on.
 *
 *  So the sentence states what IS known and nothing more. It is still useful:
 *  it tells a reader the gap is real rather than a sync fault, and it tells
 *  the audit team the detail is owed.
 *
 *  IT ALSO CLOSES A HOLE THIS FILE OPENED EARLIER TODAY. Since an update no
 *  longer writes an empty string, a check that went non-compliant with no
 *  observation would otherwise leave whatever the portal already had sitting
 *  underneath the new answer — old text under a fresh NC, which reads as
 *  though somebody wrote it about this audit. A placeholder is better than
 *  either a blank or a stranger's sentence. */
export const NC_WITHOUT_DETAIL =
  "Non-compliant. No supporting evidence or observation was recorded during the audit — detail to follow from the audit team.";

export function buildPlan(
  x: SyncInput,
  existing: { checkpoints: Map<string, string>; findings: Map<string, string> },
  unconsolidatedFindings = 0
): SyncPlan {
  const checkpoints: PlannedRow[] = [];
  const findings: PlannedRow[] = [];
  const evidence: PlannedFile[] = [];
  const skipped: SyncPlan["skipped"] = [];
  const warnings: SyncPlan["warnings"] = [];

  /* --- check-points: only the ones somebody actually answered --------- */
  let unanswered = 0;
  for (const c of x.checks) {
    const r = x.responses[c.id];
    if (!r || !r.compliance) {
      unanswered++;
      continue;
    }
    const key = portalIdFor(x.entity, c.id);
    const itemId = existing.checkpoints.get(key);
    checkpoints.push({
      key,
      action: itemId ? "update" : "create",
      itemId,
      values: {
        title: key,
        discipline: c.discipline,
        assetSystem: c.system,
        compliance: r.compliance,
        /* EVIDENCE PENDING GOES ACROSS, IN THE OBSERVATION.
           The portal's compliance column has four values and "Compliant,
           evidence pending" is not one of them — it is a C with a flag on it,
           and inventing a fifth token for ACSA's list is the one thing this
           file will not do. But writing a bare C for a check whose record has
           not been produced says "we looked and it was fine", which is rule 2
           of this file's header in the other direction. So the flag travels as
           the first sentence of the observation, where a reader of the portal
           sees it on the same row as the C. */
        observation:
          [
            r.evidencePending
              ? "EVIDENCE PENDING — compliant on the auditor's assessment; the record was not produced during the audit."
              : "",
            r.observation?.trim() || "",
          ]
            .filter(Boolean)
            .join(" ") ||
          /* Only for a non-compliant answer. A compliant or not-applicable
             check with nothing typed needs no sentence — the status is the
             whole statement. See NC_WITHOUT_DETAIL. */
          (r.compliance === "NC" ? NC_WITHOUT_DETAIL : ""),
        auditor: x.auditor,
        assessedOn: new Date().toISOString(),
      },
      summary: `${key} · ${c.discipline} · ${r.compliance}${r.evidencePending ? " (evidence pending)" : ""}`,
    });

    for (const a of r.attachments ?? []) {
      /* Either source will do. `unavailable` is the one real exclusion: it is
         set when the browser evicted the image and there is no record copy,
         and it means the bytes are gone rather than elsewhere. */
      if (a.kind !== "photo" || a.unavailable) continue;
      if (!a.blobKey && !a.cloudUrl) continue;
      evidence.push({
        checkId: c.id,
        filename: photoFilename(a),
        attachment: a,
        caption: a.caption?.trim() ?? "",
      });
    }
  }
  if (unanswered) {
    skipped.push({
      what: "check-points",
      why: "no compliance captured — a blank status is NOT compliant, and writing one would say we looked",
      count: unanswered,
    });
  }

  /* PLACEHOLDER: what a non-compliant check says when nobody typed anything.
   *
   *  It still goes across — a non-compliant check is the truth and the portal
   *  should carry it. But the portal rates an asset system from its FINDINGS,
   *  so an NC nobody wrote a finding for leaves the rating reading better than
   *  the evidence. Found in the real portal by Prince Mahlangu, 16 September
   *  2026: Energy and Demand Management at King Shaka reading Acceptable with
   *  a non-compliant check-point behind it. */
  const withFinding = new Set(
    (x.findings ?? []).map((f) => f.checkId).filter((id): id is string => !!id)
  );
  const bareNC = x.checks.filter(
    (c) => x.responses[c.id]?.compliance === "NC" && !withFinding.has(c.id)
  ).length;
  if (bareNC) {
    warnings.push({
      what: "non-compliant check-points have no finding behind them",
      why: "they go across as non-compliant, but the portal rates an asset system from its findings — so the rating will read better than the evidence until each one has its finding written",
      count: bareNC,
    });
  }

  /* --- this visit's hazards ------------------------------------------- */
  const taken = new Set(existing.findings.keys());
  let unrated = 0;
  for (const h of x.hazards) {
    /* A hazard whose ERM cell NOBODY AGREED still goes across — it is a real
       exposure and the portal should carry it — but WITHOUT a rating. A
       severity the assistant proposed and a person never looked at is
       indistinguishable from a judgement once it is in a list that feeds the
       Audit & Risk Committee. */
    const agreed = h.ermConfirmed && !!h.ermConsequence && !!h.ermLikelihood;
    if (!agreed) unrated++;

    const key = h.portalId ?? mintPortalId(x.entity, h.disciplines, taken);
    taken.add(key);
    const itemId = existing.findings.get(key);
    const priority = agreed ? erm.ermPriority(h.ermConsequence!, h.ermLikelihood!) : null;
    findings.push({
      key,
      action: itemId ? "update" : "create",
      itemId,
      hazardId: h.id,
      values: {
        title: key,
        discipline: h.disciplines.join(", "),
        assetSystem: h.systems.join(", "),
        observation: [h.event, h.description].filter(Boolean).join(" — "),
        severity: agreed ? portalSeverity(h.ermConsequence) : null,
        likelihood: agreed ? portalLikelihood(h.ermLikelihood) : null,
        riskPriority: priority,
        tolerance: priority ? (erm.ERM_PRIORITY_META[priority].tolerance ?? null) : null,
        status: h.actionStatus || "Open",
        rootCause: h.rootCause ?? "",
        treatment: h.action ?? "",
        owner: h.owner ?? "",
        targetDate: h.dueDate || null,
        progress: flattenProgress(h.progress),
        assets: sendableAssets(h.assetIds).join(", ") || null,
        dateRaised: h.createdAt ? new Date(h.createdAt).toISOString() : null,
      },
      summary: agreed
        ? `${key} · ${priority} · ${priority ? erm.ERM_PRIORITY_META[priority].tolerance : ""}`
        : `${key} · no agreed ERM cell — the hazard goes across, the rating does not`,
    });
  }
  if (unrated) {
    skipped.push({
      what: "hazard ratings",
      why: "nobody has agreed the ERM cell — the hazard syncs, the rating does not",
      count: unrated,
    });
  }
  const withheldAssets = x.hazards.reduce(
    (n, h) => n + (h.assetIds ?? []).length - sendableAssets(h.assetIds).length,
    0
  );
  if (withheldAssets) {
    skipped.push({
      what: "asset links",
      why: "they are SAMPLE- tags from the stand-in register — they go in the workbook, never into a system of record",
      count: withheldAssets,
    });
  }
  if (unconsolidatedFindings) {
    skipped.push({
      what: "findings not yet in a hazard",
      why: "the register carries hazards, not findings — consolidate them and sync again",
      count: unconsolidatedFindings,
    });
  }

  /* --- last cycle's findings, verified this visit ---------------------- */
  let unverified = 0;
  for (const p of x.prior) {
    const v = x.verifications[p.portalId];
    if (!v?.outcome) {
      unverified++;
      continue;
    }
    const itemId = existing.findings.get(p.portalId);
    findings.push({
      key: p.portalId,
      action: itemId ? "update" : "create",
      itemId,
      values: {
        title: p.portalId,
        status: v.outcome,
        progress: flattenProgress(v.progress),
        treatment: v.action ?? "",
      },
      summary: `${p.portalId} · ${v.outcome} (last cycle)`,
    });
  }
  if (unverified) {
    skipped.push({
      what: "prior findings",
      why: "not verified this visit — left exactly as the portal has them",
      count: unverified,
    });
  }

  return { checkpoints, findings, evidence, skipped, warnings, folder: evidenceFolder(x.entity) };
}

/** Asset links that are safe to send.
 *
 *  A `SAMPLE-` tag is a stand-in invented so the linking could be built before
 *  ACSA supplied the register. It belongs in the workbook, where a person is
 *  reading and the prefix tells them what it is. It does NOT belong in the
 *  portal, where a machine files it against a real finding and nobody looks at
 *  it again — an invented asset number in a system of record is worse than no
 *  asset number at all.
 *
 *  So the sync drops them, and the plan says how many it dropped. When the real
 *  register arrives its tags carry no prefix and this returns them untouched;
 *  the guard turns itself off. */
export function sendableAssets(ids: string[] | undefined): string[] {
  return (ids ?? []).filter((id) => !id.startsWith("SAMPLE-"));
}

/** Totals for the confirm line, so nobody presses a button that says "Sync"
 *  without knowing what it is about to do. */
export function planTotals(plan: SyncPlan) {
  const count = (rows: PlannedRow[], a: RowAction) => rows.filter((r) => r.action === a).length;
  return {
    checkpointsNew: count(plan.checkpoints, "create"),
    checkpointsChanged: count(plan.checkpoints, "update"),
    findingsNew: count(plan.findings, "create"),
    findingsChanged: count(plan.findings, "update"),
    photographs: plan.evidence.length,
    writes: plan.checkpoints.length + plan.findings.length + plan.evidence.length,
  };
}

/** How the writer gets an image's bytes. Takes the attachment, not a local
 *  key, and THROWS rather than returning null — a photograph that cannot be
 *  read is reported by filename with the reason, never dropped. */
export type PhotoBlobReader = (a: Attachment) => Promise<Blob>;
