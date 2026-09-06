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
  Likelihood,
  PriorFinding,
  Response,
  Role,
  Severity,
  Verification,
} from "./types";
import checksRaw from "@/data/checks.json";
import priorRaw from "@/data/priorFindings.json";
import {
  CURRENT_ENTITY_CODE,
  CURRENT_VISIT_ID,
  entity as entityOf,
  PROGRAMME_VISITS,
} from "./programme";
import { needsDesk, needsField } from "./verification";

export const CHECKS = checksRaw as unknown as Check[];
export const PRIOR = priorRaw as unknown as PriorFinding[];

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
  /** The entity and visit every scoped read and write below belongs to. */
  entity: string;
  visit: string;
  byVisit: Record<string, VisitData>;
  /** Flat across the whole programme — a finding carries its own entity and
   *  originVisit, which is what lets a later visit see what an earlier one
   *  left open. */
  findings: Finding[];
  lastSavedAt: number | null;
  hydrated: boolean;

  setRole: (r: Role) => void;
  setAuditor: (a: string) => void;
  setEntity: (code: string) => void;
  setVisit: (visitId: string) => void;

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
  removeFindingsForIssue: (checkId: string, issueIndex: number) => void;

  verification: (pf: string) => Verification;
  patchVerification: (pf: string, p: Partial<Verification>) => void;

  addAttachment: (checkId: string, a: Omit<Attachment, "id" | "createdAt">) => void;
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
        entity: CURRENT_ENTITY_CODE,
        visit: CURRENT_VISIT_ID,
        byVisit: {},
        findings: [],
        lastSavedAt: null,
        hydrated: false,

        setRole: (role) => set({ role }),
        setAuditor: (auditor) => set({ auditor }),

        setEntity: (code) =>
          set((s) => {
            /* Moving to another airport lands on a visit that airport actually
               has, rather than carrying across a visit id belonging to the
               previous one. */
            const visits = PROGRAMME_VISITS.filter((v) => v.entity === code);
            const keep = visits.some((v) => v.id === s.visit);
            const fallback =
              visits.find((v) => v.state === "current") ?? visits[visits.length - 1];
            return { entity: code, visit: keep ? s.visit : (fallback?.id ?? s.visit) };
          }),

        setVisit: (visit) => set({ visit }),

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
            attachments: [...r.attachments, { ...a, id: uid(), createdAt: Date.now() }],
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
      version: 6,
      migrate: (persisted: unknown, from: number) => {
        const st = persisted as {
          findings?: Finding[];
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
        return st;
      },
      partialize: (s: State) => ({
        role: s.role,
        auditor: s.auditor,
        entity: s.entity,
        visit: s.visit,
        byVisit: s.byVisit,
        findings: s.findings,
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
export const useVisitId = () => useStore((s) => s.visit);
export const useEntity = () => entityOf(useStore((s) => s.entity));

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

/* ---------- derived selectors ---------- */

export const DISCIPLINES = Array.from(new Set(CHECKS.map((c) => c.discipline)));

export function checksOf(discipline?: string | null, system?: string | null) {
  return CHECKS.filter(
    (c) =>
      (!discipline || c.discipline === discipline) && (!system || c.system === system)
  );
}

export function systemsOf(discipline: string) {
  return Array.from(new Set(checksOf(discipline).map((c) => c.system)));
}

export const AREAS = Array.from(new Set(CHECKS.map((c) => c.area))).sort();

export function priorFor(discipline: string, system: string) {
  return PRIOR.find((p) => p.discipline === discipline && p.system === system) ?? null;
}
