"use client";

/** The shared record, on screen: is my work reaching the team, and if not, why?
 *
 *  An auditor who thinks their afternoon is shared and finds out at the report
 *  that it was not has lost the afternoon. So the states are named plainly and
 *  the reason is always the next thing on the line — not a spinner that stops
 *  and a hope.
 *
 *  The passphrase is checked against the record before it is kept, so a typo is
 *  caught here rather than by a sync that quietly never works. It is stored on
 *  this device only, outside the audit store, so it can never ride along inside
 *  a capture bundle somebody emails. */

import { useState } from "react";
import { useShared } from "@/lib/shared";
import { Btn } from "@/components/ui/primitives";
import { IconCheck, IconClock, IconTeam, IconX } from "@/components/ui/icons";

const WORDS: Record<string, { word: string; tone: string; says: string }> = {
  off: {
    word: "Not set up",
    tone: "var(--ink-3)",
    says:
      "This deployment has no shared record. Captures stay on this device — hand them over as a file above.",
  },
  locked: {
    word: "Locked",
    tone: "var(--warn)",
    says: "Enter the team passphrase once and this device joins the shared audit.",
  },
  offline: {
    word: "Waiting for signal",
    tone: "var(--warn)",
    says:
      "Nothing is lost. Everything captured here syncs by itself the moment there is a network.",
  },
  syncing: { word: "Syncing", tone: "var(--ink-3)", says: "" },
  synced: { word: "Shared", tone: "var(--good)", says: "" },
  error: { word: "Not syncing", tone: "var(--bad)", says: "" },
};

export default function SharedPanel() {
  const shared = useShared();
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!shared) return null;
  const w = WORDS[shared.state] ?? WORDS.off;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const problem = await shared.unlock(pass);
    setBusy(false);
    if (problem) setErr(problem);
    else setPass("");
  };

  return (
    <div
      className="mb-3.5 rounded-[13px] border p-3"
      style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[180px] flex-1">
          <b className="flex items-center gap-[7px] font-display text-[12.5px] font-semibold">
            <IconTeam width={14} height={14} style={{ color: "var(--acc)" }} />
            Shared record
            <span
              className="inline-flex items-center gap-[4px] font-mono text-[9.5px] tracking-[.06em] uppercase"
              style={{ color: w.tone }}
            >
              {shared.state === "synced" ? (
                <IconCheck width={11} height={11} />
              ) : shared.state === "error" ? (
                <IconX width={11} height={11} />
              ) : (
                <IconClock width={11} height={11} />
              )}
              {w.word}
            </span>
          </b>
          <span
            className="mt-[3px] block text-[11.5px] leading-[1.5]"
            style={{ color: "var(--ink-2)" }}
          >
            {w.says ||
              (shared.lastSyncAt
                ? `Everyone on this audit sees the same record. Last sync ${new Date(
                    shared.lastSyncAt
                  ).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}${
                    shared.pushed || shared.pulled
                      ? ` · sent ${shared.pushed}, received ${shared.pulled}`
                      : ""
                  }.`
                : "Everyone on this audit sees the same record. It syncs by itself.")}
          </span>
          {shared.lastError && shared.state === "error" && (
            <span className="mt-[5px] block text-[11.5px] leading-[1.5]" style={{ color: "var(--bad)" }}>
              {shared.lastError} Nothing captured here is lost — it stays on this device and
              goes up when the record answers again.
            </span>
          )}
        </div>
        {shared.state !== "off" && (
          <div className="flex shrink-0 flex-wrap gap-[6px]">
            {shared.unlocked ? (
              <>
                <Btn variant="ghost" onClick={shared.syncNow}>
                  Sync now
                </Btn>
                <Btn variant="ghost" onClick={shared.forget}>
                  Forget passphrase
                </Btn>
              </>
            ) : null}
          </div>
        )}
      </div>

      {shared.state === "locked" && (
        <form
          className="mt-3 flex flex-wrap items-center gap-[7px]"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Team passphrase"
            aria-label="Team passphrase"
            autoComplete="off"
            className="min-h-[44px] min-w-[200px] flex-1 rounded-[9px] border px-[11px] text-[12.5px] outline-none"
            style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
          />
          <Btn type="submit" variant="primary" disabled={busy}>
            {busy ? "Checking…" : "Join the audit"}
          </Btn>
        </form>
      )}
      {err && (
        <div
          className="mt-2 rounded-[9px] border px-[11px] py-[8px] text-[11.5px] leading-[1.5]"
          style={{ borderColor: "var(--bad)", background: "var(--bad-bg)", color: "var(--bad)" }}
        >
          {err}
        </div>
      )}
    </div>
  );
}
