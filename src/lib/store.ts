"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { delBlob } from "./media";
import type {
  Attachment,
  Capture,
  Check,
  Compliance,
  Finding,
  Likelihood,
  PriorFinding,
  Response,
  Role,
  Severity,
  Verification,
  Visit,
} from "./types";
import checksRaw from "@/data/checks.json";
import priorRaw from "@/data/priorFindings.json";

export const CHECKS = checksRaw as unknown as Check[];
export const PRIOR = priorRaw as unknown as PriorFinding[];

export const AUDITORS = [
  "Sarel Jansen van Rensburg",
  "Prince Mahlangu",
  "TPJV Electrical Lead",
  "TPJV Civil Lead",
  "TPJV Mechanical Lead",
];

export const RESPONSIBLE = [
  "KSIA Maintenance Engineering Manager",
  "KSIA Electrical Engineer",
  "KSIA Mechanical Engineer",
  "KSIA Civil Engineer",
  "KSIA B&FM Manager",
  "KSIA E&DM Coordinator",
  "KSIA Fire & Safety / SHE",
  "KSIA Airport Coordinator",
  "Fuel Operator",
  "ACSA Corporate Office (Maintenance Engineering)",
];

export const ROOT_CAUSES = [
  "Maintenance backlog",
  "Documentation gap",
  "Design / original installation",
  "Resourcing / staffing",
  "Other",
];

/** 3-year cycle, two visits a year. Only Mar 2025 and Sep 2026 carry data.
 *  @deprecated Read from src/data/programme.json via src/lib/programme.ts —
 *  this copy stays only until every caller has moved across. */
export const VISITS: Visit[] = [
  { id: "2025-03", label: "Mar 2025", site: "KSIA", state: "done", note: "23 findings" },
  { id: "2025-09", label: "Sep 2025", site: "KSIA", state: "skipped", note: "not audited" },
  { id: "2026-03", label: "Mar 2026", site: "KSIA", state: "skipped", note: "not audited" },
  { id: "2026-09", label: "Sep 2026", site: "KSIA", state: "current", note: "this visit" },
  { id: "2027-03", label: "Mar 2027", site: "KSIA", state: "scheduled", note: "scheduled" },
  { id: "2027-09", label: "Sep 2027", site: "KSIA", state: "scheduled", note: "cycle close" },
];

export const CURRENT_VISIT = "2026-09";

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
    flaggedForField: false,
  };
}

interface State {
  role: Role;
  auditor: string;
  responses: Record<string, Response>;
  findings: Finding[];
  verifications: Record<string, Verification>;
  captures: Capture[];
  lastSavedAt: number | null;
  hydrated: boolean;

  setRole: (r: Role) => void;
  setAuditor: (a: string) => void;
  response: (checkId: string) => Response;
  patch: (checkId: string, p: Partial<Response>) => void;
  setCompliance: (checkId: string, c: Compliance | null) => void;
  toggleEvidence: (checkId: string, i: number) => void;
  toggleIssue: (checkId: string, i: number, f: Omit<Finding, "id" | "createdAt">) => void;
  setWalkabout: (checkId: string, i: number | null, sets?: Compliance) => void;
  appendObservation: (checkId: string, text: string) => void;
  commit: (checkId: string) => void;

  addFinding: (f: Omit<Finding, "id" | "createdAt">) => string;
  updateFinding: (id: string, p: Partial<Finding>) => void;
  removeFindingsForIssue: (checkId: string, issueIndex: number) => void;

  verification: (pf: string) => Verification;
  patchVerification: (pf: string, p: Partial<Verification>) => void;

  addAttachment: (checkId: string, a: Omit<Attachment, "id" | "createdAt">) => void;
  removeAttachment: (checkId: string, attachmentId: string) => void;

  addCapture: (c: Omit<Capture, "id" | "createdAt">) => void;
  assignCapture: (captureId: string, checkId: string) => void;
  dropCapture: (captureId: string) => void;
  discardCapture: (captureId: string) => void;

  resetAll: () => void;
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
    (set, get) => ({
      role: "tpjv",
      auditor: AUDITORS[0],
      responses: {},
      findings: [],
      verifications: {},
      captures: [],
      lastSavedAt: null,
      hydrated: false,

      setRole: (role) => set({ role }),
      setAuditor: (auditor) => set({ auditor }),

      response: (checkId) => get().responses[checkId] ?? emptyResponse(checkId),

      patch: (checkId, p) =>
        set((s) => ({
          responses: {
            ...s.responses,
            [checkId]: { ...(s.responses[checkId] ?? emptyResponse(checkId)), ...p },
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

      commit: (checkId) => {
        const r = get().response(checkId);
        get().patch(checkId, {
          captured: true,
          compliance: r.compliance ?? "C",
          capturedBy: get().auditor,
          capturedAt: Date.now(),
        });
        set({ lastSavedAt: Date.now() });
      },

      addFinding: (f) => {
        const id = `F-${uid().toUpperCase().slice(0, 5)}`;
        set((s) => ({ findings: [...s.findings, { ...f, id, createdAt: Date.now() }] }));
        return id;
      },

      updateFinding: (id, p) =>
        set((s) => ({
          findings: s.findings.map((f) => (f.id === id ? { ...f, ...p } : f)),
        })),

      removeFindingsForIssue: (checkId, issueIndex) =>
        set((s) => ({
          findings: s.findings.filter(
            (f) => !(f.checkId === checkId && f.issueIndex === issueIndex)
          ),
        })),

      verification: (pf) =>
        get().verifications[pf] ?? {
          pf,
          outcome: null,
          evidence: "",
          attachments: [],
          verifiedBy: "",
          verifiedAt: null,
        },

      patchVerification: (pf, p) =>
        set((s) => ({
          verifications: {
            ...s.verifications,
            [pf]: { ...get().verification(pf), ...p, verifiedBy: get().auditor },
          },
          lastSavedAt: Date.now(),
        })),

      addCapture: (c) =>
        set((s) => ({
          captures: [...s.captures, { ...c, id: `CAP-${uid()}`, createdAt: Date.now() }],
        })),

      assignCapture: (captureId, checkId) => {
        const cap = get().captures.find((c) => c.id === captureId);
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
        set((s) => ({ captures: s.captures.filter((c) => c.id !== captureId) })),

      discardCapture: (captureId) => {
        const cap = get().captures.find((c) => c.id === captureId);
        if (cap?.blobKey) void delBlob(cap.blobKey);
        get().dropCapture(captureId);
      },

      removeAttachment: (checkId, attachmentId) => {
        const r = get().response(checkId);
        const a = r.attachments.find((x) => x.id === attachmentId);
        if (a?.blobKey) void delBlob(a.blobKey);
        get().patch(checkId, {
          attachments: r.attachments.filter((x) => x.id !== attachmentId),
        });
      },

      resetAll: () =>
        set({ responses: {}, findings: [], verifications: {}, captures: [], lastSavedAt: null }),
    }),
    {
      /* The app is called Squawk, but this key predates the name and must not
         change: it is what a tablet's captured audit is stored under, and
         renaming it would orphan every in-flight capture. */
      name: "acsa-assurance-v1",
      storage: createJSONStorage(() => idbStorage),
      /* Bump this whenever a persisted shape changes, and migrate rather than
         discard — a tablet may be carrying a half-captured audit. */
      version: 4,
      migrate: (persisted: unknown, from: number) => {
        const st = persisted as {
          findings?: Finding[];
          responses?: Record<string, Response>;
          captures?: Capture[];
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
        return st;
      },
      partialize: (s: State) => ({
        role: s.role,
        auditor: s.auditor,
        responses: s.responses,
        findings: s.findings,
        verifications: s.verifications,
        captures: s.captures,
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
