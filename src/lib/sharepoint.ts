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
  Check,
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
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface FieldMap {
  /** logical name -> the list's INTERNAL column name. */
  resolved: Record<string, string>;
  /** Logical names this list has no column for. Reported, never guessed. */
  missing: string[];
}

/** Build the map from the list's own columns.
 *
 *  A read-only column (Created, Modified, computed) is treated as absent: it
 *  exists, and writing to it fails the whole PATCH, which would take the rows
 *  that were fine down with it. */
export function mapFields(
  columns: { name: string; displayName: string; readOnly?: boolean }[],
  wanted: string[]
): FieldMap {
  const byDisplay = new Map<string, { name: string; readOnly?: boolean }>();
  for (const c of columns) byDisplay.set(norm(c.displayName), c);

  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of wanted) {
    const hit = (FIELD_CANDIDATES[key] ?? [])
      .map((d) => byDisplay.get(norm(d)))
      .find((c) => c && !c.readOnly);
    if (hit) resolved[key] = hit.name;
    else missing.push(key);
  }
  return { resolved, missing };
}

/** Drop anything with no column, and anything with nothing to say.
 *
 *  `undefined` and `null` are skipped; the empty string is NOT — clearing a
 *  cell somebody emptied on purpose is a legitimate write. */
export function projectFields(
  map: FieldMap,
  values: Record<string, string | number | null | undefined>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(values)) {
    const col = map.resolved[key];
    if (!col || v === undefined || v === null) continue;
    out[col] = v;
  }
  return out;
}

/* --------------------------------------------------------------- the plan */

export interface SyncInput {
  entity: string;
  visit: string;
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
  blobKey: string;
  caption: string;
}

export interface SyncPlan {
  checkpoints: PlannedRow[];
  findings: PlannedRow[];
  evidence: PlannedFile[];
  /** Why rows were left out, in the words of somebody who might disagree. */
  skipped: { what: string; why: string; count: number }[];
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
export function buildPlan(
  x: SyncInput,
  existing: { checkpoints: Map<string, string>; findings: Map<string, string> },
  unconsolidatedFindings = 0
): SyncPlan {
  const checkpoints: PlannedRow[] = [];
  const findings: PlannedRow[] = [];
  const evidence: PlannedFile[] = [];
  const skipped: SyncPlan["skipped"] = [];

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
        observation: r.observation?.trim() || "",
        auditor: x.auditor,
        assessedOn: new Date().toISOString(),
      },
      summary: `${key} · ${c.discipline} · ${r.compliance}`,
    });

    for (const a of r.attachments ?? []) {
      if (a.kind !== "photo" || !a.blobKey) continue;
      evidence.push({
        checkId: c.id,
        filename: photoFilename(a),
        blobKey: a.blobKey,
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

  return { checkpoints, findings, evidence, skipped, folder: evidenceFolder(x.entity) };
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

export type PhotoBlobReader = (blobKey: string) => Promise<Blob | null>;
