"use client";

/** The shared audit record, from the device's side.
 *
 *  Squawk stays local-first. Everything is captured into this device's
 *  IndexedDB first and always, and this file only ever moves copies: it pushes
 *  what this device knows and pulls what it does not. A deployment with no
 *  shared record configured, a device with no passphrase entered, an apron with
 *  no signal — in every one of those the app is exactly what it was before, and
 *  the file-based merge is still there.
 *
 *  THE MERGE RULES ARE NOT REIMPLEMENTED HERE. Rows pulled from the record are
 *  shaped into a bundle and handed to the same src/lib/merge.ts the export sheet
 *  uses, so evidence is unioned rather than overwritten, progress logs stay
 *  append-only, and a record both devices changed resolves the same way whether
 *  it arrived over the wire or on a memory stick. One set of rules, tested once,
 *  in one place.
 *
 *  THE PASSPHRASE IS NOT IN THE AUDIT STORE. It lives in localStorage, on its
 *  own, deliberately outside the zustand store that gets persisted and
 *  exported — because a capture bundle is a file auditors email to each other,
 *  and a credential that rides along inside one is a credential that has left
 *  the building. */

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "./store";
import type { Bundle } from "./merge";
import { BUNDLE_KIND, BUNDLE_VERSION } from "./merge";
import type { AdHocItem, Attachment, Capture, FeedbackNote, Finding, Hazard, Response, Verification } from "./types";

const PASS_KEY = "squawk-team-passphrase";
/* Whether this deployment HAS a shared record, remembered across launches.
 *
 *  Without this an offline device says "no shared record on this deployment",
 *  because the probe that asks cannot get an answer with no network — which is
 *  both wrong and the worst possible wrong: it tells an auditor in a basement
 *  that their team is not sharing an audit at all, when in fact their work is
 *  queued and fine. Remembered, the same device says "waiting for signal". */
const AVAIL_KEY = "squawk-shared-available";
const cursorKey = (entity: string, visit: string) => `squawk-cursor:${entity}/${visit}`;
const pushedKey = (entity: string, visit: string) => `squawk-pushed:${entity}/${visit}`;

/** Rows are what travels: one per record, with the device clock that stamped it. */
export interface SharedRow {
  /* `kind` is a bare text column in Postgres with no CHECK constraint (see
     supabase/0001_shared_record.sql), deliberately — adding a record type must
     not need a schema migration run by hand on a live audit. */
  kind: "response" | "verification" | "finding" | "hazard" | "feedback" | "capture" | "adhoc";
  id: string;
  updated_at: number;
  payload: unknown;
  server_at?: string;
}

const local = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      /* A private window, or storage refused. Sync is simply off; nothing else
         about the app changes. */
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore — the next sync re-pulls from the beginning, which is correct
         and merely slower. */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const when = (r: { updatedAt?: number } | undefined) => r?.updatedAt ?? 0;

/** What this device holds for the audit in view, as rows.
 *
 *  `since` keeps a sync proportional to what changed rather than to how much
 *  has been captured — a device three days into an audit should not re-send
 *  three days of work every thirty seconds. Records with no updatedAt at all
 *  (captured before the field existed, back-filled to 0 by the migration) go on
 *  the first sync and then stop. */
export function rowsToPush(since: number): SharedRow[] {
  const s = useStore.getState();
  const d = s.visitData();
  const mine = (r: { entity: string; originVisit: string }) =>
    r.entity === s.entity && r.originVisit === s.visit;
  const rows: SharedRow[] = [];

  const add = (kind: SharedRow["kind"], id: string, at: number, payload: unknown) => {
    if (at > since) rows.push({ kind, id, updated_at: at, payload });
  };

  for (const [checkId, r] of Object.entries(d.responses)) add("response", checkId, when(r), r);
  for (const [pf, v] of Object.entries(d.verifications)) add("verification", pf, when(v), v);
  for (const f of s.findings.filter(mine)) add("finding", f.id, when(f), f);
  for (const h of s.hazards.filter(mine)) add("hazard", h.id, when(h), h);
  /* Captures and feedback carry no updatedAt of their own — they are
     append-only and their identity is their id, so the newest thing in the list
     is the list's clock. */
  for (const c of d.captures ?? []) add("capture", c.id, c.createdAt ?? 0, c);
  /* Things seen on the walk sync like anything else. They are the one record
     type nobody can re-derive: a register check missed on one device is still
     on the list, an unshared observation is simply gone. */
  for (const a of d.adhoc ?? []) add("adhoc", a.id, when(a), a);
  for (const [checkId, notes] of Object.entries(d.feedback ?? {})) {
    const at = notes.reduce((n, x) => Math.max(n, x.createdAt ?? 0), 0);
    add("feedback", checkId, at, notes);
  }
  return rows;
}

/** Rows from the record, shaped into the bundle the merge already understands. */
export function bundleFromRows(entity: string, visit: string, rows: SharedRow[]): Bundle {
  const responses: Record<string, Response> = {};
  const verifications: Record<string, Verification> = {};
  const feedback: Record<string, FeedbackNote[]> = {};
  const captures: Capture[] = [];
  const adhoc: AdHocItem[] = [];
  const findings: Finding[] = [];
  const hazards: Hazard[] = [];

  for (const r of rows) {
    if (r.kind === "response") responses[r.id] = r.payload as Response;
    else if (r.kind === "verification") verifications[r.id] = r.payload as Verification;
    else if (r.kind === "feedback") feedback[r.id] = (r.payload ?? []) as FeedbackNote[];
    else if (r.kind === "capture") captures.push(r.payload as Capture);
    else if (r.kind === "adhoc") adhoc.push(r.payload as AdHocItem);
    else if (r.kind === "finding") findings.push(r.payload as Finding);
    else if (r.kind === "hazard") hazards.push(r.payload as Hazard);
  }

  const photographsNotUploaded = Object.values(responses).reduce(
    (n, r) =>
      n + ((r.attachments ?? []) as Attachment[]).filter((a) => a.kind === "photo" && !a.cloudUrl).length,
    0
  );

  return {
    meta: {
      kind: BUNDLE_KIND,
      version: BUNDLE_VERSION,
      entity,
      visit,
      exportedBy: "the shared record",
      exportedAt: Date.now(),
      counts: {
        responses: Object.keys(responses).length,
        findings: findings.length,
        hazards: hazards.length,
        verifications: Object.keys(verifications).length,
      },
      photographsNotUploaded,
    },
    visit: { responses, verifications, captures, feedback, adhoc },
    findings,
    hazards,
  };
}

export type SharedState =
  | "off"          // nothing configured for this deployment
  | "locked"       // configured, but this device has not been given the passphrase
  | "offline"      // no signal
  | "syncing"
  | "synced"
  | "error";

export interface SharedRecord {
  state: SharedState;
  /** Which of the three server variables the deployment is missing, by NAME.
   *  Empty on a configured deployment and on a device that has never reached
   *  the probe — see the note on GET /api/sync for why naming the absent ones
   *  discloses nothing. It exists so "not set up" can say WHICH, instead of
   *  sending somebody guessing through the Vercel dashboard. */
  missing: string[];
  /** Never the passphrase itself — only whether this device has one. */
  unlocked: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  /** What the last sync moved, for the pre-flight screen and the export sheet. */
  pushed: number;
  pulled: number;
  syncNow: () => void;
  unlock: (passphrase: string) => Promise<string | null>;
  forget: () => void;
}

/** Poll rather than subscribe. A live socket on an apron is a battery cost for
 *  a latency nobody is waiting on: two auditors on the same audit need each
 *  other's work within a minute, not within a second. */
const EVERY_MS = 30_000;

export function useSharedRecord(): SharedRecord {
  const entity = useStore((s) => s.entity);
  const visit = useStore((s) => s.visit);
  const hydrated = useStore((s) => s.hydrated);
  const importBundle = useStore((s) => s.importBundle);
  /* Bumped by every commit. Watching it is what turns "your work reaches the
     team within half a minute" into "within a few seconds of pressing Save",
     which is the difference between a shared record an auditor trusts and one
     they keep poking at to see whether it has caught up. */
  const lastSavedAt = useStore((s) => s.lastSavedAt);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  /* Only the part of the state a sync actually decides. Everything else —
     off, locked, offline — is DERIVED below rather than stored, so the two can
     never disagree about which is true. */
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [moved, setMoved] = useState({ pushed: 0, pulled: 0 });
  /* A ref, not state: a re-render in the middle of a sync must not start a
     second one, and two syncs racing is how a device pushes its own stale copy
     over the answer it just pulled. */
  const running = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      /* Read after the await, not before: this component is server-rendered
         too, and localStorage does not exist there. */
      const j = await fetch("/api/sync")
        .then((r) => r.json() as Promise<{ available?: boolean; missing?: string[] }>)
        .catch(() => null);
      if (!live) return;
      setUnlocked(!!local.get(PASS_KEY));
      if (j) {
        setAvailable(!!j.available);
        /* Deliberately NOT remembered across launches the way `available` is.
           An offline device should say "waiting for signal", not recite a list
           of variables it cannot currently check — and a deployment that got
           configured since the last launch would otherwise keep showing the
           stale list until somebody happened to be online. */
        setMissing(Array.isArray(j.missing) ? j.missing : []);
        local.set(AVAIL_KEY, j.available ? "1" : "0");
      } else {
        /* No answer. Fall back to what this device last learned rather than
           declaring there is no shared record — see AVAIL_KEY. */
        setAvailable(local.get(AVAIL_KEY) === "1");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const sync = useCallback(async () => {
    if (running.current || !available || !hydrated) return;
    const passphrase = local.get(PASS_KEY);
    if (!passphrase) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncState("idle");
      return;
    }
    running.current = true;
    setSyncState("syncing");
    try {
      const since = Number(local.get(pushedKey(entity, visit)) ?? 0);
      const records = rowsToPush(since);
      const cursor = local.get(cursorKey(entity, visit));
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase, entity, visit, since: cursor, records }),
      });
      const json = (await res.json()) as {
        error?: string;
        records?: SharedRow[];
        cursor?: string | null;
        written?: number;
        pulled?: number;
      };
      if (!res.ok) {
        /* A wrong passphrase is the one failure that should stop trying: the
           device is not going to guess it on the next tick. */
        if (res.status === 401) {
          local.del(PASS_KEY);
          setUnlocked(false);
        }
        setLastError(json.error ?? `The shared record answered ${res.status}.`);
        setSyncState("error");
        return;
      }

      const rows = json.records ?? [];
      /* How many of the pulled rows CHANGED something on this device.

         The cursor deliberately overlaps — see the note in /api/sync — so the
         last minute of the team's work comes back on every sync. Reporting the
         raw row count would leave a device that has caught up saying it pulled
         four records, over and over, which reads as churn nobody can explain.
         What an auditor wants to know is what arrived that they did not have. */
      let changed = 0;
      /* A refusal is a string. It means NOTHING was applied — the bundle named
         an audit this device is no longer in, which happens if somebody
         switches airport or visit while a sync is in flight. */
      let refused: string | null = null;
      if (rows.length) {
        /* Same rules as the file merge — evidence unioned, newer wins, and a
           record both sides changed reported rather than swallowed. */
        const report = importBundle(bundleFromRows(entity, visit, rows));
        if (typeof report === "string") {
          refused = report;
        } else {
          changed =
            report.responses.added.length +
            report.responses.updated.length +
            report.findings.added.length +
            report.findings.updated.length +
            report.hazards.added.length +
            report.hazards.updated.length +
            report.verifications.added.length +
            report.verifications.updated.length +
            report.attachmentsAdded +
            report.progressAdded;
        }
      }
      /* THE CURSOR MOVES ONLY IF THE ROWS WERE APPLIED — the same rule as the
         push watermark below, which already said it: a failed sync must
         re-send, not skip. Advancing past rows a refused merge threw away
         would mean this device never pulls them again, and another auditor's
         afternoon would simply never appear on it. */
      if (json.cursor && !refused) local.set(cursorKey(entity, visit), json.cursor);
      /* Only move the push watermark once the write is acknowledged. A failed
         sync must re-send, not skip. */
      if (records.length) {
        local.set(
          pushedKey(entity, visit),
          String(records.reduce((n, r) => Math.max(n, r.updated_at), since))
        );
      }
      setMoved({ pushed: json.written ?? 0, pulled: changed });
      setLastSyncAt(Date.now());
      /* Said, not swallowed. The next sync will fetch the same rows again and
         apply them once the device is back on the audit they belong to. */
      setLastError(refused);
      setSyncState(refused ? "error" : "synced");
    } catch {
      setLastError("Could not reach the shared record.");
      setSyncState("error");
    } finally {
      running.current = false;
    }
  }, [available, hydrated, entity, visit, importBundle]);

  /* Saved something? Push it, shortly. Debounced rather than immediate because
     answering a check is often three or four saves in a row — one sync at the
     end of that is what should go up, not four. */
  useEffect(() => {
    if (!available || !unlocked || !lastSavedAt) return;
    const t = setTimeout(() => void sync(), 2500);
    return () => clearTimeout(t);
  }, [lastSavedAt, available, unlocked, sync]);

  /* The loop, plus a sync the moment signal comes back — an auditor walking out
     of a substation should not wait half a minute to see the team's work. */
  useEffect(() => {
    if (!available || !unlocked) return;
    /* The first sync is scheduled rather than called: it lets the screen paint
       before the network starts, which on a tablet coming up on an apron is the
       order that matters. */
    const first = setTimeout(() => void sync(), 0);
    const t = setInterval(() => void sync(), EVERY_MS);
    const onOnline = () => void sync();
    addEventListener("online", onOnline);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      removeEventListener("online", onOnline);
    };
  }, [available, unlocked, sync]);

  const unlock = useCallback(
    async (passphrase: string): Promise<string | null> => {
      const given = passphrase.trim();
      if (!given) return "Enter the team passphrase.";
      /* Checked against the server before it is kept, so a typo is caught here
         rather than by a sync that quietly never works. */
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase: given, entity, visit, since: null, records: [] }),
      }).catch(() => null);
      if (!res) return "Could not reach the shared record. Try again where there is signal.";
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        return j.error ?? `The shared record answered ${res.status}.`;
      }
      local.set(PASS_KEY, given);
      setUnlocked(true);
      return null;
    },
    [entity, visit]
  );

  const forget = useCallback(() => {
    local.del(PASS_KEY);
    setUnlocked(false);
  }, []);

  /* Derived, in one place, in the order that answers "why is nothing syncing?"
     from the outside in: is there a record at all, has this device been let in,
     is there signal, and only then what the last attempt did. */
  const state: SharedState =
    !available
      ? "off"
      : !unlocked
        ? "locked"
        : typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : syncState === "idle"
            ? "syncing"
            : syncState;

  return {
    state,
    missing,
    unlocked,
    lastSyncAt,
    lastError,
    pushed: moved.pushed,
    pulled: moved.pulled,
    syncNow: () => void sync(),
    unlock,
    forget,
  };
}

/* One poller for the whole app.
 *
 *  The status is wanted in three places — the export sheet, the pre-flight
 *  screen, and a dot on the nav — and three copies of the hook would be three
 *  timers asking the same question on three different beats, which is both
 *  wasteful on a phone and a good way to have two syncs race. AppShell mounts
 *  it once; everything else reads it. */
const Ctx = createContext<SharedRecord | null>(null);

export function SharedRecordProvider({ children }: { children: ReactNode }) {
  const value = useSharedRecord();
  return createElement(Ctx.Provider, { value }, children);
}

/** The shared record's status, from anywhere inside the app shell. Returns null
 *  outside it, which reads correctly as "nothing to say". */
export function useShared(): SharedRecord | null {
  return useContext(Ctx);
}
