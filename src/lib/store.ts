"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useMemo } from "react";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { clearAllMedia, delBlob, delBlobs } from "./media";
import type {
  Attachment,
  Capture,
  Check,
  Compliance,
  FeedbackNote,
  Finding,
  Hazard,
  Likelihood,
  PriorFinding,
  PriorRating,
  Response,
  Role,
  Severity,
  Verification,
} from "./types";
import {
  CURRENT_ENTITY_CODE,
  CURRENT_VISIT_ID,
  ENTITIES,
  entity as entityOf,
  PROGRAMME_VISITS,
  type Visit as ProgrammeVisit,
} from "./programme";
import { needsDesk, needsField } from "./verification";
import { portalIdFor } from "./sites";
import { nextPhotoRef } from "./photos";

/* The register and the 2025 data are pure lookups and live in ./register, so a
   non-React caller (src/lib/exports.ts) can use them without importing this
   client store. Re-exported here because every screen has always asked the
   store for them. */
export {
  CHECKS,
  PRIOR_RATINGS,
  PRIOR_FINDINGS,
  ALL_DISCIPLINES,
  checksAt,
  priorRatingsAt,
  priorFindingsAt,
  priorFor,
  disciplinesAt,
  checksOf,
  systemsOf,
  areasAt,
} from "./register";
import { CHECKS, checksAt, priorFindingsAt, priorRatingsAt } from "./register";

export const AUDITORS = [
  "Sarel Jansen van Rensburg",
  "Prince Mahlangu",
  "TPJV Electrical Lead",
  "TPJV Civil Lead",
  "TPJV Mechanical Lead",
];

/** Who a finding can be assigned to. The site-side roles carry the entity's own
 *  short code — an action at Cape Town cannot be owned by the "KSIA Electrical
 *  Engineer", which is what this list said when it was a flat constant. */
export function responsibleFor(entityCode: string): string[] {
  const short = entityOf(entityCode).short;
  return [
    `${short} Maintenance Engineering Manager`,
    `${short} Electrical Engineer`,
    `${short} Mechanical Engineer`,
    `${short} Civil Engineer`,
    `${short} B&FM Manager`,
    `${short} E&DM Coordinator`,
    `${short} Fire & Safety / SHE`,
    `${short} Airport Coordinator`,
    "Fuel Operator",
    "ACSA Corporate Office (Maintenance Engineering)",
  ];
}

export const ROOT_CAUSES = [
  "Maintenance backlog",
  "Documentation gap",
  "Design / original installation",
  "Resourcing / staffing",
  "Other",
];

/* ---------- scope ----------

   Everything an audit records belongs to one entity on one visit. Before this
   existed, `responses` was keyed by checkId alone and `verifications` by pf
   alone: capturing KSIA-ELE-001 at King Shaka and then switching to O.R. Tambo
   showed King Shaka's answer, and the September visit overwrote March's. The
   programme was modelled for ten entities across six visits while the data
   layer could hold exactly one cell of that grid.

   The scope key is the composite. Nothing outside this file builds one by
   hand. */

export const scopeKey = (entityCode: string, visitId: string) =>
  `${entityCode}/${visitId}`;

/* ---------- the programme is extensible ----------

   programme.json ships six visits, all of them at FALE. The other nine
   entities have none — so the entity picker could reach them and there was
   nowhere to put what you captured, and switching to O.R. Tambo left the visit
   id of King Shaka's cycle showing above an empty cycle strip.

   Visits are therefore state as well as data: the file seeds the programme,
   and audits created in the app are persisted alongside. A visit id is
   "YYYY-MM" and nothing may create one that is not, because carry-forward
   decides what an earlier visit is by sorting these strings. */

export const VISIT_ID = /^\d{4}-(0[1-9]|1[0-2])$/;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** The programme's visits for one entity, plus any created in the app,
 *  oldest first. One ordering, used everywhere, so "the previous visit" means
 *  the same thing to carry-forward, the cycle strip and the Audits panel. */
export function mergeVisits(
  custom: ProgrammeVisit[],
  entityCode: string
): ProgrammeVisit[] {
  return [
    ...PROGRAMME_VISITS.filter((v) => v.entity === entityCode),
    ...custom.filter((v) => v.entity === entityCode),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

export function visitLabelFor(visitId: string): string {
  const m = visitId.match(VISIT_ID);
  if (!m) return visitId;
  const [y, mm] = visitId.split("-");
  return `${MONTHS[Number(mm) - 1]} ${y}`;
}

export interface VisitData {
  responses: Record<string, Response>;
  verifications: Record<string, Verification>;
  captures: Capture[];
  /** Review notes on visual evidence, keyed by check. Optional rather than
   *  migrated in: an older persisted visit simply has none, which reads
   *  correctly as "nobody has commented yet". Bumping the version to add a
   *  field that is absent-means-empty would risk a migration for no gain. */
  feedback?: Record<string, FeedbackNote[]>;
}

const EMPTY_VISIT: VisitData = Object.freeze({
  responses: Object.freeze({}) as Record<string, Response>,
  verifications: Object.freeze({}) as Record<string, Verification>,
  captures: Object.freeze([]) as unknown as Capture[],
  feedback: Object.freeze({}) as Record<string, FeedbackNote[]>,
});

function emptyResponse(checkId: string): Response {
  return {
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
  };
}

export type Portal = "desk" | "field";

const checkById = new Map(CHECKS.map((c) => [c.id, c]));

/** Has the desk half been answered? */
export const deskDone = (r: Response | undefined) => !!r?.deskDoneAt;
/** Has the field half been answered? */
export const fieldDone = (r: Response | undefined) => !!r?.fieldDoneAt;

/** Complete means every mode the register declares for this check has been
 *  answered — not "somebody pressed Save once". For the 305 checks that need
 *  both a document review and the asset seen, one half is half. */
export function isComplete(checkId: string, r: Response | undefined): boolean {
  if (!r) return false;
  const c = checkById.get(checkId);
  if (!c) return !!r.deskDoneAt || !!r.fieldDoneAt;
  const deskOk = !needsDesk(c) || !!r.deskDoneAt;
  const fieldOk = !needsField(c) || !!r.fieldDoneAt;
  return deskOk && fieldOk;
}

/** What is still outstanding on a check, in words, for a screen to show. */
export function outstandingHalf(checkId: string, r: Response | undefined): Portal | null {
  const c = checkById.get(checkId);
  if (!c) return null;
  if (needsDesk(c) && !r?.deskDoneAt) return "desk";
  if (needsField(c) && !r?.fieldDoneAt) return "field";
  return null;
}

function emptyVerification(pf: string): Verification {
  return {
    pf,
    outcome: null,
    evidence: "",
    attachments: [],
    verifiedBy: "",
    verifiedAt: null,
  };
}

interface State {
  role: Role;
  auditor: string;
  /** Live speech-to-text while a voice note records. OFF until the auditor
   *  turns it on, because the browser's dictation engine is not on-device:
   *  Chrome streams the audio to Google's speech service to produce the text.
   *  Recording itself never depends on this — the audio is the evidence and
   *  is always kept locally. */
  dictation: boolean;
  /** The entity and visit every scoped read and write below belongs to. */
  entity: string;
  visit: string;
  byVisit: Record<string, VisitData>;
  /** Audits created in the app, on top of the six programme.json seeds. */
  customVisits: ProgrammeVisit[];
  /** Flat across the whole programme — a finding carries its own entity and
   *  originVisit, which is what lets a later visit see what an earlier one
   *  left open. */
  findings: Finding[];
  hazards: Hazard[];
  lastSavedAt: number | null;
  hydrated: boolean;

  setRole: (r: Role) => void;
  setAuditor: (a: string) => void;
  setDictation: (on: boolean) => void;
  setEntity: (code: string) => void;
  setVisit: (visitId: string) => void;
  /** Create an audit. Returns null on success, or why it was refused. */
  addVisit: (entityCode: string, visitId: string, note?: string) => string | null;
  /** Delete an audit created in the app. Refused if it holds anything, and
   *  never applicable to the programme.json seeds. */
  removeVisit: (entityCode: string, visitId: string) => string | null;
  openAudit: (entityCode: string, visitId: string) => void;

  visitData: () => VisitData;
  response: (checkId: string) => Response;
  patch: (checkId: string, p: Partial<Response>) => void;
  setCompliance: (checkId: string, c: Compliance | null) => void;
  toggleEvidence: (checkId: string, i: number) => void;
  toggleIssue: (
    checkId: string,
    i: number,
    f: Omit<Finding, "id" | "createdAt" | "entity">
  ) => void;
  setWalkabout: (checkId: string, i: number | null, sets?: Compliance) => void;
  appendObservation: (checkId: string, text: string) => void;
  commit: (checkId: string, portal: Portal) => void;

  addFinding: (f: Omit<Finding, "id" | "createdAt" | "entity">) => string;
  updateFinding: (id: string, p: Partial<Finding>) => void;

  /** Hazards, flat across the programme like findings, each carrying its own
   *  entity and originVisit. Same reason: a hazard raised in September is what
   *  the March visit reads to see what it inherited. */
  addHazard: (h: Omit<Hazard, "id" | "createdAt" | "entity">) => string;
  updateHazard: (id: string, p: Partial<Hazard>) => void;
  removeHazard: (id: string) => void;
  removeFindingsForIssue: (checkId: string, issueIndex: number) => void;

  verification: (pf: string) => Verification;
  patchVerification: (pf: string, p: Partial<Verification>) => void;

  addAttachment: (checkId: string, a: Omit<Attachment, "id" | "createdAt">) => void;
  /** Write a transcript, its provenance or a revision back onto a note that is
   *  already attached. Transcription happens after the fact, so the record has
   *  to be reachable again once the text comes back. */
  updateAttachment: (
    checkId: string,
    attachmentId: string,
    patch: Partial<Attachment>
  ) => void;
  removeAttachment: (checkId: string, attachmentId: string) => void;

  feedbackFor: (checkId: string) => FeedbackNote[];
  addFeedback: (checkId: string, text: string) => void;
  toggleFeedbackResolved: (checkId: string, id: string) => void;
  removeFeedback: (checkId: string, id: string) => void;

  addCapture: (c: Omit<Capture, "id" | "createdAt">) => void;
  assignCapture: (captureId: string, checkId: string) => void;
  dropCapture: (captureId: string) => void;
  discardCapture: (captureId: string) => void;

  /** Clears the CURRENT visit only. Wiping the whole programme because one
   *  visit needs restarting is not a thing anyone means to do. */
  resetVisit: () => void;
  /** Clears every visit at every entity, and every media file. For a dry run,
   *  where the point is to start from nothing twice in a morning. */
  resetEverything: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const idbStorage = {
  getItem: async (name: string) => (await idbGet(name)) ?? null,
  setItem: async (name: string, value: string) => {
    await idbSet(name, value);
  },
  removeItem: async (name: string) => {
    await idbDel(name);
  },
};

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /* Every scoped write goes through here, so a new entity or visit starts
         from a blank sheet instead of inheriting the last one's answers. */
      const writeScope = (fn: (d: VisitData) => Partial<VisitData>) =>
        set((s) => {
          const key = scopeKey(s.entity, s.visit);
          const current = s.byVisit[key] ?? {
            responses: {},
            verifications: {},
            captures: [],
          };
          return {
            byVisit: { ...s.byVisit, [key]: { ...current, ...fn(current) } },
          };
        });

      return {
        role: "tpjv",
        auditor: AUDITORS[0],
        dictation: false,
        entity: CURRENT_ENTITY_CODE,
        visit: CURRENT_VISIT_ID,
        byVisit: {},
        customVisits: [],
        findings: [],
        hazards: [],
        lastSavedAt: null,
        hydrated: false,

        setRole: (role) => set({ role }),
        setAuditor: (auditor) => set({ auditor }),
        setDictation: (dictation) => set({ dictation }),

        setEntity: (code) =>
          set((s) => {
            /* Moving to another airport lands on a visit that airport actually
               has, rather than carrying across a visit id belonging to the
               previous one. An entity with no audits yet keeps the id showing
               so the shell has something to render; the Audits panel is where
               the first one gets created. */
            const visits = mergeVisits(s.customVisits, code);
            const keep = visits.some((v) => v.id === s.visit);
            const fallback =
              visits.find((v) => v.state === "current") ?? visits[visits.length - 1];
            return { entity: code, visit: keep ? s.visit : (fallback?.id ?? s.visit) };
          }),

        setVisit: (visit) => set({ visit }),

        addVisit: (entityCode, visitId, note) => {
          if (!VISIT_ID.test(visitId))
            return "A visit id must be YYYY-MM — carry-forward orders visits by sorting it.";
          const existing = mergeVisits(get().customVisits, entityCode);
          if (existing.some((v) => v.id === visitId))
            return `${entityOf(entityCode).short} already has an audit for ${visitLabelFor(visitId)}.`;
          set((s) => ({
            customVisits: [
              ...s.customVisits,
              {
                id: visitId,
                label: visitLabelFor(visitId),
                entity: entityCode,
                state: "scheduled",
                note: note?.trim() || "added in Squawk",
              },
            ],
          }));
          return null;
        },

        removeVisit: (entityCode, visitId) => {
          const seeded = PROGRAMME_VISITS.some(
            (v) => v.entity === entityCode && v.id === visitId
          );
          if (seeded) return "That audit comes from the programme and cannot be removed.";
          const d = get().byVisit[scopeKey(entityCode, visitId)];
          const hasData =
            !!d &&
            (Object.keys(d.responses).length > 0 ||
              Object.keys(d.verifications).length > 0 ||
              d.captures.length > 0);
          const hasFindings = get().findings.some(
            (f) => f.entity === entityCode && f.originVisit === visitId
          );
          if (hasData || hasFindings)
            return "That audit holds captured data. Reset it first if you mean to discard it.";
          set((s) => ({
            customVisits: s.customVisits.filter(
              (v) => !(v.entity === entityCode && v.id === visitId)
            ),
          }));
          return null;
        },

        openAudit: (entityCode, visitId) => set({ entity: entityCode, visit: visitId }),

        visitData: () => get().byVisit[scopeKey(get().entity, get().visit)] ?? EMPTY_VISIT,

        response: (checkId) => get().visitData().responses[checkId] ?? emptyResponse(checkId),

        patch: (checkId, p) =>
          writeScope((d) => ({
            responses: {
              ...d.responses,
              [checkId]: { ...(d.responses[checkId] ?? emptyResponse(checkId)), ...p },
            },
          })),

        setCompliance: (checkId, c) => get().patch(checkId, { compliance: c }),

        toggleEvidence: (checkId, i) => {
          const r = get().response(checkId);
          const picked = r.evidencePicked.includes(i)
            ? r.evidencePicked.filter((x) => x !== i)
            : [...r.evidencePicked, i];
          get().patch(checkId, { evidencePicked: picked });
        },

        toggleIssue: (checkId, i, findingSeed) => {
          const r = get().response(checkId);
          if (r.issuesPicked.includes(i)) {
            get().patch(checkId, { issuesPicked: r.issuesPicked.filter((x) => x !== i) });
            get().removeFindingsForIssue(checkId, i);
          } else {
            get().patch(checkId, {
              issuesPicked: [...r.issuesPicked, i],
              compliance: "NC",
            });
            get().addFinding({ ...findingSeed, checkId });
          }
        },

        setWalkabout: (checkId, i, sets) => {
          const r = get().response(checkId);
          const next = r.walkaboutPicked === i ? null : i;
          get().patch(checkId, {
            walkaboutPicked: next,
            ...(next !== null && sets ? { compliance: sets } : {}),
          });
        },

        appendObservation: (checkId, text) => {
          const r = get().response(checkId);
          const obs = r.observation ? `${r.observation.replace(/\s*$/, "")} ${text}` : text;
          get().patch(checkId, { observation: obs });
        },

        addAttachment: (checkId, a) => {
          const r = get().response(checkId);
          get().patch(checkId, {
            attachments: [
              ...r.attachments,
              {
                ...a,
                id: uid(),
                /* Assigned here rather than in the component, so a photograph
                   taken in field mode and one taken at the desk are numbered by
                   the same rule and cannot collide. */
                ...(a.kind === "photo"
                  ? { ref: nextPhotoRef(portalIdFor(get().entity, checkId), r.attachments) }
                  : {}),
                createdAt: Date.now(),
              },
            ],
          });
        },

        updateAttachment: (checkId, attachmentId, patch) => {
          const r = get().response(checkId);
          /* id, blobKey and createdAt identify the note and point at its
             bytes. A caller passing them would be renaming the evidence, so
             they are stripped rather than trusted. */
          const { id: _i, blobKey: _b, createdAt: _c, ...safe } = patch;
          void _i; void _b; void _c;
          get().patch(checkId, {
            attachments: r.attachments.map((x) =>
              x.id === attachmentId ? { ...x, ...safe } : x
            ),
          });
        },

        removeAttachment: (checkId, attachmentId) => {
          const r = get().response(checkId);
          const a = r.attachments.find((x) => x.id === attachmentId);
          if (a?.blobKey) void delBlob(a.blobKey);
          get().patch(checkId, {
            attachments: r.attachments.filter((x) => x.id !== attachmentId),
          });
        },

        commit: (checkId, portal) => {
          const r = get().response(checkId);
          const now = Date.now();
          const who = get().auditor;
          const half =
            portal === "desk"
              ? { deskDoneBy: who, deskDoneAt: now }
              : { fieldDoneBy: who, fieldDoneAt: now };
          const next = { ...r, ...half };
          /* `captured` is derived, never asserted. It goes true only once every
             mode the register declares for this check has been answered, so a
             desk save on a check that also needs the asset seen leaves it
             outstanding — which is the whole point of tracking the halves. */
          const complete = isComplete(checkId, next);
          get().patch(checkId, {
            ...half,
            compliance: r.compliance ?? "C",
            captured: complete,
            ...(complete ? { capturedBy: who, capturedAt: now } : {}),
          });
          set({ lastSavedAt: now });
        },

        addFinding: (f) => {
          const id = `F-${uid().toUpperCase().slice(0, 5)}`;
          set((s) => ({
            findings: [
              ...s.findings,
              { ...f, entity: s.entity, id, createdAt: Date.now() },
            ],
          }));
          return id;
        },

        updateFinding: (id, p) =>
          set((s) => ({
            findings: s.findings.map((f) => (f.id === id ? { ...f, ...p } : f)),
          })),

        addHazard: (h) => {
          const id = `HZ-${uid().toUpperCase().slice(0, 5)}`;
          set((s) => ({
            hazards: [...s.hazards, { ...h, entity: s.entity, id, createdAt: Date.now() }],
          }));
          return id;
        },

        updateHazard: (id, p) =>
          set((s) => ({
            hazards: s.hazards.map((h) => (h.id === id ? { ...h, ...p } : h)),
          })),

        removeHazard: (id) =>
          set((s) => ({ hazards: s.hazards.filter((h) => h.id !== id) })),

        removeFindingsForIssue: (checkId, issueIndex) =>
          set((s) => ({
            findings: s.findings.filter(
              (f) =>
                !(
                  f.checkId === checkId &&
                  f.issueIndex === issueIndex &&
                  f.entity === s.entity &&
                  f.originVisit === s.visit
                )
            ),
          })),

        verification: (pf) => get().visitData().verifications[pf] ?? emptyVerification(pf),

        patchVerification: (pf, p) => {
          const next = { ...get().verification(pf), ...p, verifiedBy: get().auditor };
          writeScope((d) => ({ verifications: { ...d.verifications, [pf]: next } }));
          set({ lastSavedAt: Date.now() });
        },

        feedbackFor: (checkId) => get().visitData().feedback?.[checkId] ?? [],

        addFeedback: (checkId, text) => {
          const body = text.trim();
          if (!body) return;
          const note: FeedbackNote = {
            id: `FB-${uid()}`,
            checkId,
            text: body,
            author: get().auditor,
            role: get().role,
            createdAt: Date.now(),
            resolvedAt: null,
          };
          writeScope((d) => ({
            feedback: {
              ...(d.feedback ?? {}),
              [checkId]: [...(d.feedback?.[checkId] ?? []), note],
            },
          }));
          set({ lastSavedAt: Date.now() });
        },

        toggleFeedbackResolved: (checkId, id) =>
          writeScope((d) => ({
            feedback: {
              ...(d.feedback ?? {}),
              [checkId]: (d.feedback?.[checkId] ?? []).map((n) =>
                n.id === id ? { ...n, resolvedAt: n.resolvedAt ? null : Date.now() } : n
              ),
            },
          })),

        removeFeedback: (checkId, id) =>
          writeScope((d) => ({
            feedback: {
              ...(d.feedback ?? {}),
              [checkId]: (d.feedback?.[checkId] ?? []).filter((n) => n.id !== id),
            },
          })),

        addCapture: (c) =>
          writeScope((d) => ({
            captures: [...d.captures, { ...c, id: `CAP-${uid()}`, createdAt: Date.now() }],
          })),

        assignCapture: (captureId, checkId) => {
          const cap = get().visitData().captures.find((c) => c.id === captureId);
          if (!cap) return;
          /* The attachment takes over the capture's blobKey — the bytes are not
             copied and must not be deleted. dropCapture removes the tray record
             only; discardCapture is the one that deletes media. */
          get().addAttachment(checkId, {
            kind: cap.kind,
            name: cap.name,
            blobKey: cap.blobKey,
            mimeType: cap.mimeType,
            dataUrl: cap.dataUrl,
            durationSec: cap.durationSec,
            transcript: cap.transcript,
            transcriptSource: cap.transcriptSource,
            unavailable: cap.unavailable,
            createdBy: cap.createdBy,
          });
          get().dropCapture(captureId);
        },

        dropCapture: (captureId) =>
          writeScope((d) => ({ captures: d.captures.filter((c) => c.id !== captureId) })),

        discardCapture: (captureId) => {
          const cap = get().visitData().captures.find((c) => c.id === captureId);
          if (cap?.blobKey) void delBlob(cap.blobKey);
          get().dropCapture(captureId);
        },

        resetVisit: () => {
          const s = get();
          const key = scopeKey(s.entity, s.visit);
          const data = s.byVisit[key];
          /* Drop this visit's media before its records go, or the blobs become
             orphans nothing can reach and nothing will clean up. */
          if (data) {
            const keys = [
              ...Object.values(data.responses).flatMap((r) =>
                r.attachments.map((a) => a.blobKey)
              ),
              ...Object.values(data.verifications).flatMap((v) =>
                v.attachments.map((a) => a.blobKey)
              ),
              ...data.captures.map((c) => c.blobKey),
            ].filter((k): k is string => !!k);
            if (keys.length) void delBlobs(keys);
          }
          set((st) => {
            const rest = { ...st.byVisit };
            delete rest[key];
            return {
              byVisit: rest,
              findings: st.findings.filter(
                (f) => !(f.entity === st.entity && f.originVisit === st.visit)
              ),
              lastSavedAt: null,
            };
          });
        },

        resetEverything: () => {
          /* Sweeps the media prefix rather than walking the records, so a
             photograph whose record was already deleted goes too. */
          void clearAllMedia();
          set({ byVisit: {}, findings: [], lastSavedAt: null });
        },
      };
    },
    {
      /* The app is called Squawk, but this key predates the name and must not
         change: it is what a tablet's captured audit is stored under, and
         renaming it would orphan every in-flight capture. */
      name: "acsa-assurance-v1",
      storage: createJSONStorage(() => idbStorage),
      /* Bump this whenever a persisted shape changes, and migrate rather than
         discard — a tablet may be carrying a half-captured audit. */
      version: 10,
      migrate: (persisted: unknown, from: number) => {
        const st = persisted as {
          dictation?: boolean;
          findings?: Finding[];
          hazards?: Hazard[];
          responses?: Record<string, Response>;
          verifications?: Record<string, Verification>;
          captures?: Capture[];
          byVisit?: Record<string, VisitData>;
          entity?: string;
          visit?: string;
        } | null;
        if (!st) return st;
        if (from < 2 && Array.isArray(st.findings)) {
          st.findings = st.findings.map((f) => ({
            ...f,
            /* v1 linked a finding to its issue button through the title field.
               Recover the index where that legacy title survives, so untapping
               the button still withdraws the right finding. */
            issueIndex:
              f.issueIndex ??
              (typeof f.title === "string" && /^#\d+$/.test(f.title)
                ? Number(f.title.slice(1))
                : null),
            /* v1 could not tell a suggested rating from an agreed one. Treat
               every carried-over rating as unconfirmed so the group re-agrees
               it rather than inheriting a number nobody decided. */
            ratingConfirmed: f.ratingConfirmed ?? false,
          }));
        }
        if (from < 3 && Array.isArray(st.findings)) {
          /* v2 carried a generic severity/likelihood scale. B170 001M's wording
             is different and, at level 3, means the opposite of what the old
             label said. Migrate by POSITION — the letter and number someone
             chose are what carry meaning — and clear ratingConfirmed, because a
             rating agreed against the wrong words was not agreed against ACSA's
             scale and the group should see it again. */
          const SEV: Record<string, Severity> = {
            A: "A - Catastrophic",
            B: "B - Hazardous",
            C: "C - Major",
            D: "D - Minor",
            E: "E - Negligible",
          };
          const LIK: Record<string, Likelihood> = {
            "1": "1 - Extremely Improbable",
            "2": "2 - Improbable",
            "3": "3 - Remote",
            "4": "4 - Occasional",
            "5": "5 - Frequent",
          };
          st.findings = st.findings.map((f) => ({
            ...f,
            severity: f.severity ? (SEV[f.severity.charAt(0)] ?? null) : null,
            likelihood: f.likelihood ? (LIK[f.likelihood.charAt(0)] ?? null) : null,
            ratingConfirmed: false,
          }));
        }
        if (from < 4) {
          /* v3 and earlier could not record. "Voice note" wrote a fixed
             durationSec and a transcript lifted from the Answer Library;
             "Photo" wrote a filename and no image. Those records describe
             evidence that was never captured, so mark them unavailable —
             the UI shows them struck through with the reason. Deleting them
             instead would quietly shrink an attachment count an auditor may
             already have reported. */
          const markLegacy = <T extends { blobKey?: string; dataUrl?: string }>(a: T): T => ({
            ...a,
            unavailable: !a.blobKey && !a.dataUrl,
          });
          if (st.responses) {
            st.responses = Object.fromEntries(
              Object.entries(st.responses).map(([k, r]) => [
                k,
                {
                  ...r,
                  attachments: Array.isArray(r.attachments)
                    ? r.attachments.map(markLegacy)
                    : [],
                },
              ])
            );
          }
          if (Array.isArray(st.captures)) st.captures = st.captures.map(markLegacy);
        }
        if (from < 5) {
          /* v4 and earlier held exactly one audit: responses keyed by checkId,
             verifications by pf, with no entity or visit anywhere. Everything
             on a tablet at that version was captured at the entity and visit
             the programme file named, so that is the scope it moves into. No
             data is dropped — it is filed where it belongs. */
          const key = scopeKey(CURRENT_ENTITY_CODE, CURRENT_VISIT_ID);
          st.byVisit = {
            [key]: {
              responses: st.responses ?? {},
              verifications: st.verifications ?? {},
              captures: st.captures ?? [],
            },
          };
          st.entity = CURRENT_ENTITY_CODE;
          st.visit = CURRENT_VISIT_ID;
          if (Array.isArray(st.findings)) {
            st.findings = st.findings.map((f) => ({
              ...f,
              entity: f.entity ?? CURRENT_ENTITY_CODE,
              originVisit: f.originVisit || CURRENT_VISIT_ID,
            }));
          }
          delete st.responses;
          delete st.verifications;
          delete st.captures;
        }
        if (from < 6) {
          /* v5 and earlier had one `captured` flag set by whichever screen
             saved first. Which half that was is not recorded anywhere, so it
             cannot be recovered — and guessing costs more than it saves.

             A check with only one mode is unambiguous: the flag can only have
             meant that mode, so it moves there. A check needing both is
             carried to the DESK half only. Claiming the field half would be
             asserting that somebody walked out and looked at the asset, which
             is exactly the kind of invented evidence this application exists
             not to produce. Some checks will therefore go from reading
             "captured" to reading "desk done · awaiting site" — that is the
             migration telling the truth, not losing work. */
          const walk = (rs: Record<string, Response>) =>
            Object.fromEntries(
              Object.entries(rs).map(([id, r]) => {
                const c = CHECKS.find((x) => x.id === id);
                const wasCaptured = !!(r as Response).captured;
                const desk = !c || needsDesk(c);
                const fieldOnly = !!c && needsField(c) && !needsDesk(c);
                const next: Response = {
                  ...r,
                  deskDoneBy: r.deskDoneBy ?? "",
                  deskDoneAt:
                    r.deskDoneAt ?? (wasCaptured && desk ? (r.capturedAt ?? Date.now()) : null),
                  fieldDoneBy: r.fieldDoneBy ?? "",
                  fieldDoneAt:
                    r.fieldDoneAt ??
                    (wasCaptured && fieldOnly ? (r.capturedAt ?? Date.now()) : null),
                };
                if (wasCaptured && !next.deskDoneBy && desk) next.deskDoneBy = r.capturedBy ?? "";
                if (wasCaptured && !next.fieldDoneBy && fieldOnly)
                  next.fieldDoneBy = r.capturedBy ?? "";
                next.captured = isComplete(id, next);
                return [id, next];
              })
            );
          if (st.byVisit) {
            st.byVisit = Object.fromEntries(
              Object.entries(st.byVisit).map(([k, d]) => [
                k,
                { ...d, responses: walk(d.responses ?? {}) },
              ])
            );
          }
        }
        if (from < 7) {
          /* v6 and earlier started the browser's dictation engine automatically
             whenever a voice note was recorded, which sent the auditor's speech
             to the browser vendor's service without anyone being told. A tablet
             upgrading in mid-audit lands with it OFF — the safe side of a
             consent question is off, and turning it back on is one tap in the
             panel. Nothing already captured changes: the audio and any
             transcript already taken are kept exactly as they are. */
          st.dictation = false;
        }
        if (from < 8) {
          /* Photographs captured before this were keyed only by a random id —
             `photo-k3j9x2mq` — which appears nowhere a person would look and
             cannot be cross-referenced from a workbook. Give them the reference
             they should always have had: the check-point's portal id and a
             sequence, in the order they were attached.

             This runs per scope, so a photograph keeps the site prefix of the
             audit it belongs to rather than the entity that happens to be open
             when the tablet upgrades. */
          for (const [key, d] of Object.entries(st.byVisit ?? {})) {
            const entityCode = key.split("/")[0];
            for (const [checkId, r] of Object.entries(d.responses ?? {})) {
              const prefix = portalIdFor(entityCode, checkId);
              let n = 0;
              r.attachments = (r.attachments ?? []).map((a) =>
                a.kind === "photo" && !a.ref
                  ? { ...a, ref: `${prefix}_P${String(++n).padStart(2, "0")}` }
                  : a
              );
            }
          }
        }
        if (from < 9) {
          /* The hazard register did not exist. Nothing to convert — a finding
             is not a hazard, and inventing the event a finding exposes is
             exactly the judgement this app leaves to a person. Existing
             findings get an empty suggestedEvent and the register starts
             empty. */
          st.hazards = st.hazards ?? [];
          if (Array.isArray(st.findings)) {
            st.findings = st.findings.map((f) => ({
              ...f,
              suggestedEvent: f.suggestedEvent ?? "",
            }));
          }
        }
        if (from < 10) {
          /* ACSA's ERM matrix arrived (J050 001FW cl. 9.2.2), so the field that
             stood in for it is renamed to the axis the instrument actually
             has. `ermSeverity` was always null — nothing could set it while the
             scale was unsupplied — so there is no value to carry, only a shape
             to correct. `ermLikelihoodAssumed` starts false: no likelihood has
             been carried across from B170 for any existing hazard. */
          if (Array.isArray(st.hazards)) {
            st.hazards = st.hazards.map((h) => {
              const { ermSeverity, ...rest } = h as Hazard & { ermSeverity?: unknown };
              void ermSeverity;
              return {
                ...rest,
                ermConsequence: null,
                ermLikelihood: null,
                ermConfirmed: false,
                ermLikelihoodAssumed: false,
              } as Hazard;
            });
          }
        }
        return st;
      },
      partialize: (s: State) => ({
        role: s.role,
        auditor: s.auditor,
        dictation: s.dictation,
        entity: s.entity,
        visit: s.visit,
        byVisit: s.byVisit,
        customVisits: s.customVisits,
        findings: s.findings,
        hazards: s.hazards,
        lastSavedAt: s.lastSavedAt,
      }),
    }
  )
);

/* hydration flag so SSR and client agree before local data loads */
if (typeof window !== "undefined") {
  const unsub = useStore.persist.onFinishHydration(() => {
    useStore.setState({ hydrated: true });
    unsub();
  });
  if (useStore.persist.hasHydrated()) useStore.setState({ hydrated: true });
}

/* ---------- scoped hooks ----------

   Screens read through these rather than reaching into `byVisit`, so switching
   entity or visit re-renders everything consistently and no screen can forget
   which audit it is showing. Each returns a reference that is stable while the
   underlying slice is unchanged — a selector building a fresh object every call
   would loop. */

export const useEntityCode = () => useStore((s) => s.entity);
/** Whether the browser's live dictation engine may run while a note records.
 *  Off by default — see the `dictation` field on State for why. */
export const useDictationEnabled = () => useStore((s) => s.dictation);
export const useVisitId = () => useStore((s) => s.visit);
export const useEntity = () => entityOf(useStore((s) => s.entity));

/** Visits for the entity in view — programme seeds plus created audits. */
export function useVisits(entityCode?: string): ProgrammeVisit[] {
  const custom = useStore((s) => s.customVisits);
  const current = useStore((s) => s.entity);
  const code = entityCode ?? current;
  return useMemo(() => mergeVisits(custom, code), [custom, code]);
}

/** Every audit across every entity that either exists in the programme, was
 *  created here, or holds captured data. */
export function useAllAudits(): { entity: string; visit: ProgrammeVisit }[] {
  const custom = useStore((s) => s.customVisits);
  const byVisit = useStore((s) => s.byVisit);
  return useMemo(() => {
    const seen = new Set<string>();
    const out: { entity: string; visit: ProgrammeVisit }[] = [];
    const push = (entityCode: string, v: ProgrammeVisit) => {
      const k = scopeKey(entityCode, v.id);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ entity: entityCode, visit: v });
    };
    for (const v of [...PROGRAMME_VISITS, ...custom]) push(v.entity, v);
    /* A scope holding data but no visit definition would otherwise be
       unreachable — data you captured that the programme has forgotten. */
    for (const key of Object.keys(byVisit)) {
      const [e, id] = key.split("/");
      if (!e || !id || seen.has(key)) continue;
      push(e, { id, label: visitLabelFor(id), entity: e, state: "done", note: "captured here" });
    }
    return out.sort(
      (a, b) => a.entity.localeCompare(b.entity) || a.visit.id.localeCompare(b.visit.id)
    );
  }, [custom, byVisit]);
}

export const useVisitData = () =>
  useStore((s) => s.byVisit[scopeKey(s.entity, s.visit)] ?? EMPTY_VISIT);

export const useResponses = () => useVisitData().responses;
export const useVerifications = () => useVisitData().verifications;
export const useCaptures = () => useVisitData().captures;
export const useFeedback = () => useVisitData().feedback ?? EMPTY_FEEDBACK;

const EMPTY_FEEDBACK: Record<string, FeedbackNote[]> = Object.freeze({});

/** Findings raised on the visit currently in view. */
export function useVisitFindings(): Finding[] {
  const all = useStore((s) => s.findings);
  const entity = useStore((s) => s.entity);
  const visit = useStore((s) => s.visit);
  return useMemo(
    () => all.filter((f) => f.entity === entity && f.originVisit === visit),
    [all, entity, visit]
  );
}

/** Every finding ever raised at the entity in view, across all visits. */
export function useEntityFindings(): Finding[] {
  const all = useStore((s) => s.findings);
  const entity = useStore((s) => s.entity);
  return useMemo(() => all.filter((f) => f.entity === entity), [all, entity]);
}

/** Hazards raised at the entity and visit in view. Scoped the same way
 *  findings are, for the same reason. */
export function useVisitHazards(): Hazard[] {
  const all = useStore((s) => s.hazards);
  const entity = useStore((s) => s.entity);
  const visit = useStore((s) => s.visit);
  return useMemo(
    () => all.filter((h) => h.entity === entity && h.originVisit === visit),
    [all, entity, visit]
  );
}

/* ---------- derived selectors ---------- */


export interface PortfolioRow {
  code: string;
  /** Every visit this entity has anything captured against. */
  visits: string[];
  checks: number;
  captured: number;
  nc: number;
  findings: number;
  prior: number;
}

/** The portfolio view is the one place that legitimately reads ACROSS scopes.
 *  It goes through this selector rather than reaching into byVisit from a
 *  screen, so the rule that screens read in scope stays a rule with exactly one
 *  named exception instead of a convention with a hole in it. */
export function usePortfolio(): PortfolioRow[] {
  const byVisit = useStore((s) => s.byVisit);
  const findings = useStore((s) => s.findings);
  return useMemo(
    () =>
      ENTITIES.map((e) => {
        const scopes = Object.entries(byVisit).filter(([k]) => k.startsWith(`${e.code}/`));
        const seen = new Set<string>();
        let nc = 0;
        for (const [, d] of scopes) {
          for (const [id, r] of Object.entries(d.responses)) {
            if (r.captured) seen.add(id);
            if (r.compliance === "NC") nc++;
          }
        }
        return {
          code: e.code,
          visits: scopes.map(([k]) => k.split("/")[1]).sort(),
          checks: checksAt(e.code).length,
          captured: seen.size,
          nc,
          findings: findings.filter((f) => f.entity === e.code).length,
          prior: priorFindingsAt(e.code).length,
        };
      }),
    [byVisit, findings]
  );
}

/** Hooks, so a screen cannot forget to pass the entity. */
export function useChecks(): Check[] {
  return checksAt(useStore((s) => s.entity));
}
export function usePriorRatings(): PriorRating[] {
  const entityCode = useStore((s) => s.entity);
  return useMemo(() => priorRatingsAt(entityCode), [entityCode]);
}
export function usePriorFindings(): PriorFinding[] {
  const entityCode = useStore((s) => s.entity);
  return useMemo(() => priorFindingsAt(entityCode), [entityCode]);
}
