"use client";

/** Pre-flight: prove this device works BEFORE anybody is standing on an apron.
 *
 *  Squawk asks a lot of a phone. It records audio, takes and downscales
 *  photographs, holds an audit in IndexedDB, keeps a copy of itself in a
 *  service-worker cache so it opens with no signal, and pushes evidence to a
 *  record store when there is one. Every one of those can be off, refused,
 *  full, or quietly broken on a particular device — and the way you find out
 *  today is by trying to capture something at King Shaka and having it not
 *  work.
 *
 *  So this is the ten-second version, on the actual device, before it matters.
 *  One screen, one row per thing, and every row says what to DO about it rather
 *  than only that it is red.
 *
 *  The microphone and camera are behind buttons on purpose. Opening a
 *  diagnostic page must not throw two permission prompts at somebody — and a
 *  permission granted by accident, to get rid of a dialog, is not a test that
 *  the microphone works.
 */

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { usePhotoSync } from "@/lib/sync";
import { useShared } from "@/lib/shared";
import {
  formatBytes,
  isStoragePersisted,
  pickAudioMime,
  requestPersistentStorage,
  supportsRecording,
} from "@/lib/media";
import { entity as entityOf } from "@/lib/programme";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { Btn, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconClock, IconX } from "@/components/ui/icons";

type State = "ok" | "warn" | "bad" | "checking" | "ask";

interface Row {
  id: string;
  label: string;
  state: State;
  value: string;
  /** What to do about it. Only shown when it is not ok. */
  hint?: string;
  action?: { label: string; run: () => void };
}

/** A gap in seconds, said the way somebody would say it out loud. */
function describeSeconds(s: number): string {
  if (s < 90) return `${Math.round(s)} seconds`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

const TONE: Record<State, { fg: string; bg: string; line: string; word: string }> = {
  ok: { fg: "var(--good)", bg: "var(--good-bg)", line: "var(--good-line)", word: "Ready" },
  warn: { fg: "var(--warn)", bg: "var(--warn-bg)", line: "var(--warn-line)", word: "Check" },
  bad: { fg: "var(--bad)", bg: "var(--bad-bg)", line: "var(--bad-line)", word: "Not ready" },
  checking: { fg: "var(--ink-3)", bg: "var(--sunken)", line: "var(--line-2)", word: "Checking" },
  ask: { fg: "var(--ink-3)", bg: "var(--sunken)", line: "var(--line-2)", word: "Not tested" },
};

export default function PreflightPage() {
  const entityCode = useStore((s) => s.entity);
  const visit = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const hydrated = useStore((s) => s.hydrated);
  const sync = usePhotoSync();
  const shared = useShared();

  const [sw, setSw] = useState<Row>({ id: "sw", label: "Opens with no signal", state: "checking", value: "" });
  const [store, setStore] = useState<Row>({ id: "idb", label: "This device can store the audit", state: "checking", value: "" });
  const [space, setSpace] = useState<Row>({ id: "space", label: "Room for the evidence", state: "checking", value: "" });
  const [mic, setMic] = useState<Row | null>(null);
  const [cam, setCam] = useState<Row | null>(null);
  const [api, setApi] = useState<Row[]>([]);
  const [clock, setClock] = useState<Row>({ id: "clock", label: "This device's clock", state: "checking", value: "" });
  /* Bumped to re-run every probe. A diagnostic screen has to be able to say
     "and now?" without a reload losing the microphone and camera results. */
  const [nonce, setNonce] = useState(0);
  const recheck = useCallback(() => setNonce((n) => n + 1), []);

  /* ---------------------------------------------------- the service worker */
  const swRow = useCallback(async (): Promise<Row> => {
    if (!("serviceWorker" in navigator)) {
      return {
        id: "sw",
        label: "Opens with no signal",
        state: "bad",
        value: "This browser has no service worker",
        hint: "Use Safari or Chrome rather than a private window — the app will still capture, but it will not open without a network.",
      };
    }
    /* Give registration a moment before calling it missing. OfflineReady
       registers the worker on `load`, and this page's probes start the instant
       it renders — reporting "not registered" on a device where it is simply
       three hundred milliseconds behind would send somebody chasing a problem
       that fixes itself. Three seconds, then the answer is the answer. */
    const reg = await Promise.race([
      navigator.serviceWorker.ready.catch(() => undefined),
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000)),
    ]).then(async (r) => r ?? (await navigator.serviceWorker.getRegistration("/")));
    const keys = await caches.keys();
    const cached = await Promise.all(
      keys.map(async (k) => (await (await caches.open(k)).keys()).length)
    );
    const total = cached.reduce((a, b) => a + b, 0);
    const controlling = !!navigator.serviceWorker.controller;
    const waiting = !!reg?.waiting;
    const standalone =
      typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;

    return {
      id: "sw",
      label: "Opens with no signal",
      state: !reg || !controlling ? "warn" : "ok",
      value: !reg
        ? "Not registered yet"
        : !controlling
          ? "Registered — reload once to arm it"
          : `${total} file${total === 1 ? "" : "s"} cached${standalone ? " · installed to the home screen" : ""}`,
      hint: !reg
        ? "Reload this page while you have signal. Until it registers, closing the tab with no signal means the app will not reopen."
        : !controlling
          ? "Reload once. It takes control on the next load, not the one that installed it."
          : standalone
            ? undefined
            : "Add Squawk to your home screen (Share → Add to Home Screen). It opens without Safari's chrome and keeps its own storage.",
      action: waiting
        ? {
            label: "Apply update",
            run: () => {
              reg?.waiting?.postMessage("squawk:activate-update");
              setTimeout(() => location.reload(), 400);
            },
          }
        : undefined,
    };
  }, []);

  /* --------------------------------------------------------- the database */
  const storeRow = useCallback(async (): Promise<Row> => {
    const key = "squawk-preflight-probe";
    try {
      await idbSet(key, { at: Date.now() });
      const back = (await idbGet(key)) as { at: number } | undefined;
      await idbDel(key);
      return {
        id: "idb",
        label: "This device can store the audit",
        state: back?.at ? "ok" : "bad",
        value: back?.at ? "Written and read back" : "Wrote nothing back",
        hint: back?.at
          ? undefined
          : "IndexedDB is blocked. A private window does this. Captured work would be lost on reload — do not audit on this device until it reads back.",
      };
    } catch (e) {
      return {
        id: "idb",
        label: "This device can store the audit",
        state: "bad",
        value: e instanceof Error ? e.message : "Refused",
        hint: "Captured work would be lost on reload. Leave private browsing, or use another device.",
      };
    }
  }, []);

  /* ------------------------------------------------------------ the space */
  const spaceRow = useCallback(async (): Promise<Row> => {
    const persisted = await isStoragePersisted();
    let value = persisted ? "Storage is persistent" : "Storage is evictable";
    let state: State = persisted ? "ok" : "warn";
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const left = quota - usage;
      value = `${formatBytes(usage)} used of ${formatBytes(quota)} · ${formatBytes(left)} free${
        persisted ? " · persistent" : ""
      }`;
      if (quota > 0 && left < 60 * 1024 * 1024) state = "bad";
      else if (!persisted) state = "warn";
    }
    return {
      id: "space",
      label: "Room for the evidence",
      state,
      value,
      hint:
        state === "bad"
          ? "Under 60 MB free. Export and clear an earlier audit's photographs before this one, or the device will refuse a photograph mid-walk."
          : persisted
            ? undefined
            : "The browser may evict the audit under storage pressure. Tap below to ask for persistent storage — it is usually granted once the app is on the home screen.",
      action: persisted
        ? undefined
        : {
            label: "Ask to keep it",
            /* Ask, then re-run the whole page rather than this one row: asking
               for persistent storage can change the quota too, and a screen
               that updates half of what it just changed is a screen you cannot
               trust. */
            run: () => void requestPersistentStorage().then(recheck),
          },
    };
  }, [recheck]);

  /* ------------------------------------------------------------ the clock */
  /* WHOEVER'S CLOCK IS AHEAD WINS.

     Every contested record is resolved on the updatedAt stamped by the device
     that made the edit — that is true over the wire and true of the file merge,
     and it is the right rule as long as the clocks are right. A tablet running
     ten minutes fast wins every clash it is part of, including against a better
     answer somebody gave afterwards, and nothing about that is visible to
     anybody. This is the one screen where a device is asked to prove itself, so
     this is where it gets told.

     The round trip is subtracted before judging: a slow connection must not
     read as a wrong clock. */
  const clockRow = useCallback(async (): Promise<Row> => {
    try {
      const sent = Date.now();
      const r = await fetch("/api/sync", { cache: "no-store" });
      const j = (await r.json()) as { now?: string };
      const received = Date.now();
      if (!j.now) throw new Error("no clock");
      const server = Date.parse(j.now);
      if (!Number.isFinite(server)) throw new Error("unreadable clock");
      /* The server read its clock somewhere inside the round trip; the middle
         is the best estimate, and half the trip is the worst this can be out
         by for reasons that are not the clock. */
      const skew = Math.round((sent + received) / 2 - server) / 1000;
      const off = Math.abs(skew);
      const way = skew > 0 ? "ahead of" : "behind";
      const state: State = off > 120 ? "bad" : off > 20 ? "warn" : "ok";
      return {
        id: "clock",
        label: "This device's clock",
        state,
        value:
          state === "ok"
            ? `Right, to within ${Math.max(1, Math.round(off))}s`
            : `${describeSeconds(off)} ${way} the server`,
        hint:
          state === "ok"
            ? undefined
            : "Two auditors who answer the same check settle it on whichever device says it answered LAST — so a wrong clock here quietly wins or loses every clash this tablet is part of. Set the date and time to network-provided in the device's settings, then check again.",
      };
    } catch {
      return {
        id: "clock",
        label: "This device's clock",
        state: "warn",
        value: "No answer — this device is offline",
        hint: "Expected with no signal, and capture is unaffected. Check it once where there is a network: a wrong clock decides who wins a contested check.",
      };
    }
  }, []);

  /* ------------------------------------------------------------- the APIs */
  const apiRows = useCallback(async (): Promise<Row[]> => {
    const probes: { path: string; label: string; needed: string }[] = [
      { path: "/api/photos", label: "Record store for photographs", needed: "Photographs stay on this device only. They are not lost — but they will not reach the record copy until a token is set." },
      { path: "/api/assist", label: "AI assistance", needed: "Optional. Compose from taps still works offline; only the drafting and advice buttons disappear." },
      { path: "/api/transcribe", label: "Voice note transcription", needed: "Optional. Notes still record, play back and export; their text is typed by hand." },
    ];
    const rows = await Promise.all(
      probes.map(async ({ path, label, needed }): Promise<Row> => {
        try {
          const r = await fetch(path, { cache: "no-store" });
          const j = (await r.json()) as { available?: boolean; model?: string; via?: string };
          return {
            id: path,
            label,
            state: j.available ? "ok" : "warn",
            value: j.available ? (j.model ?? j.via ?? "Configured") : "Not configured",
            hint: j.available ? undefined : needed,
          };
        } catch {
          return {
            id: path,
            label,
            state: "warn",
            value: "No answer — this device is offline",
            hint: "Expected with no signal. Everything that matters for capture works anyway; check this again where there is a network.",
          };
        }
      })
    );
    return rows;
  }, []);

  /* One place that writes state, and always after an await: the checks
     produce rows, the effect applies them. `live` because a device that fails
     a probe slowly must not set state on a screen somebody has already left. */
  useEffect(() => {
    let live = true;
    void (async () => {
      const [a, b, c, d, e] = await Promise.all([
        swRow(),
        storeRow(),
        spaceRow(),
        apiRows(),
        clockRow(),
      ]);
      if (!live) return;
      setSw(a);
      setStore(b);
      setSpace(c);
      setApi(d);
      setClock(e);
    })();
    return () => {
      live = false;
    };
  }, [swRow, storeRow, spaceRow, apiRows, clockRow, nonce]);

  /* ------------------------------------------- the two that ask for consent */
  const testMic = async () => {
    setMic({ id: "mic", label: "Microphone", state: "checking", value: "Asking for permission…" });
    if (!supportsRecording()) {
      setMic({
        id: "mic",
        label: "Microphone",
        state: "bad",
        value: "This browser cannot record",
        hint: "Voice notes will not work here. Everything else does; type the observation instead.",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      const mime = pickAudioMime();
      setMic({
        id: "mic",
        label: "Microphone",
        state: mime ? "ok" : "warn",
        value: mime ? `Allowed · records ${mime.split(";")[0]}` : "Allowed, but no format this browser will write",
        hint: mime ? undefined : "Voice notes may not save. Test one before relying on it.",
      });
    } catch (e) {
      setMic({
        id: "mic",
        label: "Microphone",
        state: "bad",
        value: e instanceof Error && e.name === "NotAllowedError" ? "Refused" : "Unavailable",
        hint: "Allow the microphone in the browser's site settings. Until then the record button will fail every time it is pressed.",
      });
    }
  };

  const testCam = async () => {
    setCam({ id: "cam", label: "Camera", state: "checking", value: "Asking for permission…" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const track = stream.getVideoTracks()[0];
      const label = track?.getSettings?.();
      stream.getTracks().forEach((t) => t.stop());
      setCam({
        id: "cam",
        label: "Camera",
        state: "ok",
        value: label?.width ? `Allowed · ${label.width}×${label.height}` : "Allowed",
      });
    } catch {
      setCam({
        id: "cam",
        label: "Camera",
        state: "warn",
        value: "Refused or unavailable",
        hint: "Squawk takes photographs through the file picker, which does not need this permission — so the camera button may still work. Try one on a check to be sure.",
      });
    }
  };

  /* The shared record, said in the same shape as everything else here — and
     first among the network rows, because "is my work reaching the team" is the
     question an auditor most wants answered before a day's capture, and the one
     whose wrong answer costs the most. */
  const sharedRow: Row = {
    id: "shared",
    label: "The team sees my work",
    state:
      !shared || shared.state === "off"
        ? "warn"
        : shared.state === "synced"
          ? "ok"
          : shared.state === "error"
            ? "bad"
            : "warn",
    value:
      !shared || shared.state === "off"
        ? "No shared record on this deployment"
        : shared.state === "locked"
          ? "This device has not joined the audit"
          : shared.state === "offline"
            ? "Waiting for signal — nothing is lost"
            : shared.state === "syncing"
              ? "Syncing…"
              : shared.state === "error"
                ? (shared.lastError ?? "The last sync failed")
                : `Synced${shared.lastSyncAt ? ` at ${new Date(shared.lastSyncAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}` : ""}`,
    hint:
      !shared || shared.state === "off"
        ? /* NAMING WHAT IS MISSING, when the probe told us.
             "No shared record on this deployment" is true and leaves somebody
             guessing which of three server variables to look at — Sarel spent
             most of a day on exactly that, on a preview where they had been
             scoped to Production only. The names come from GET /api/sync and
             are names only; see the note there on why that is safe to say. */
          shared?.missing?.length
          ? `Not configured on this deployment — ${shared.missing.join(", ")} ${
              shared.missing.length === 1 ? "is" : "are"
            } not set. All three are needed, or none works. Captures stay on this device meanwhile; hand them over as a file from Export → Team captures.`
          : "Captures stay on this device. Hand them to whoever is assembling the audit as a file, from Export → Team captures."
        : shared.state === "locked"
          ? "Open Export and enter the team passphrase once. Until then this device is auditing on its own."
          : shared.state === "error"
            ? "Nothing captured here is lost — it stays on this device and goes up when the record answers again."
            : undefined,
    action:
      shared && shared.state !== "off" && shared.unlocked
        ? { label: "Sync now", run: shared.syncNow }
        : undefined,
  };

  const rows: Row[] = [
    sw,
    store,
    space,
    /* Next to the shared record on purpose: they are the two rows about
       working alongside other people, and the clock only matters because
       somebody else is answering the same checks. */
    sharedRow,
    clock,
    ...api,
    mic ?? {
      id: "mic",
      label: "Microphone",
      state: "ask",
      value: "Not tested — this asks for permission",
      action: { label: "Test microphone", run: () => void testMic() },
    },
    cam ?? {
      id: "cam",
      label: "Camera",
      state: "ask",
      value: "Not tested — this asks for permission",
      action: { label: "Test camera", run: () => void testCam() },
    },
  ];

  const bad = rows.filter((r) => r.state === "bad").length;
  const warn = rows.filter((r) => r.state === "warn").length;

  return (
    <div className="app-scroll flex min-w-0 flex-1 flex-col overflow-y-auto px-5 py-5">
      <div className="mx-auto w-full max-w-[760px]">
        {/* h2, not h1: the shell already puts one h1 on every screen naming
            the screen and the audit, and a second h1 makes the outline lie
            about which of the two is the page. */}
        <h2 className="font-display text-[19px] font-bold">Pre-flight</h2>
        <p className="mt-1 max-w-[62ch] text-[12.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
          Ten seconds on the device you are going to audit with, before you are standing on an
          apron. Every row says what to do about it, not just that it is red.
        </p>

        <Panel
          tone={bad ? undefined : "accent"}
          className="mt-4 mb-4"
          {...(bad ? {} : {})}
        >
          <div className="label-xs">This device, right now</div>
          <div className="mt-1 text-[13.5px] leading-[1.5] font-semibold">
            {bad > 0
              ? `${bad} thing${bad === 1 ? "" : "s"} would stop you capturing`
              : warn > 0
                ? `Ready to capture · ${warn} worth a look`
                : "Ready to capture"}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-[6px] font-mono text-[10px]">
            <Pill tone="accent">{entityOf(entityCode).short}</Pill>
            <Pill>{visit}</Pill>
            {auditor ? <Pill>{auditor}</Pill> : <Pill tone="warn">NO NAME SET</Pill>}
            {!hydrated && <Pill tone="warn">STILL LOADING</Pill>}
            {sync.outstanding > 0 && (
              <Pill tone="warn">
                {sync.outstanding} PHOTO{sync.outstanding === 1 ? "" : "S"} NOT UPLOADED
              </Pill>
            )}
            {sync.failed > 0 && <Pill tone="bad">{sync.failed} UPLOAD FAILED</Pill>}
          </div>
          {!auditor && (
            <p className="mt-2 text-[11.5px] leading-[1.5]" style={{ color: "var(--warn)" }}>
              Nobody is named on this device. Every capture records who made it, and a merge
              report names the auditor a bundle came from — set your name in the header before
              you start.
            </p>
          )}
        </Panel>

        <div className="mb-3 flex justify-end">
          <Btn variant="ghost" onClick={recheck}>
            Check again
          </Btn>
        </div>

        <ul className="flex flex-col gap-[7px]">
          {rows.map((r) => {
            const t = TONE[r.state];
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-start gap-3 rounded-[13px] border p-3"
                style={{ background: t.bg, borderColor: t.line }}
              >
                <span className="mt-[2px] shrink-0" style={{ color: t.fg }}>
                  {r.state === "ok" ? (
                    <IconCheck width={15} height={15} />
                  ) : r.state === "bad" ? (
                    <IconX width={15} height={15} />
                  ) : (
                    <IconClock width={15} height={15} />
                  )}
                </span>
                <div className="min-w-[200px] flex-1">
                  <b className="block font-display text-[12.5px] font-semibold">{r.label}</b>
                  <span className="mt-[2px] block text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                    {r.value}
                  </span>
                  {r.hint && (
                    <span className="mt-[5px] block text-[11.5px] leading-[1.5]" style={{ color: t.fg }}>
                      {r.hint}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-[7px]">
                  <span className="font-mono text-[9.5px] tracking-[.06em] uppercase" style={{ color: t.fg }}>
                    {t.word}
                  </span>
                  {r.action && (
                    <Btn variant="ghost" onClick={r.action.run}>
                      {r.action.label}
                    </Btn>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-[11px] leading-[1.6]" style={{ color: "var(--ink-3)" }}>
          Nothing here changes the audit. The microphone and camera tests open and immediately
          close a stream, the storage probe writes one key and deletes it, and the three service
          checks ask only whether a key is configured — none of them ever returns its value.
        </p>
      </div>
    </div>
  );
}
