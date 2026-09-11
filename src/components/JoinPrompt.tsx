"use client";

/** ASKING A NEW DEVICE TO JOIN THE AUDIT, ONCE.
 *
 *  Sarel, 2026-09-11, after losing most of a day to it: "add a prompt for a new
 *  device to join the audit."
 *
 *  The passphrase box exists and always has — at the bottom of the export
 *  sheet, which is behind More → Export the workbook. Nothing ever pointed at
 *  it. So a second device opened the app, showed 0/315 and an empty Visual
 *  review, and looked for all the world like a deployment with no data in it.
 *  There was no error, because nothing had gone wrong: the device simply had
 *  not been let in, and nothing said so.
 *
 *  WHAT THIS IS NOT. It is not a login and it is not a gate. Squawk is
 *  local-first and a device that never joins is fully usable — it captures, it
 *  exports, it merges from a file. So this is dismissible, it stays dismissed,
 *  and it never blocks the screen behind it: it is a banner in the flow of the
 *  page, above the work area, not a panel floating over a corner of it. See the
 *  note where AppShell mounts it for why that distinction matters here.
 *
 *  WHEN IT SHOWS, and these conditions are all of them:
 *    - the deployment HAS a shared record (state "locked" — a deployment with
 *      none has nothing to join, and a prompt to enter a passphrase that would
 *      be refused is worse than silence)
 *    - this device has captured NOTHING yet, which is what makes it a new
 *      device rather than one somebody deliberately keeps standalone
 *    - nobody has dismissed it on this device
 *
 *  The second condition is the one that keeps it honest. An auditor who has
 *  been working offline all morning does not want to be asked; a device with an
 *  empty record almost certainly wants the team's. */

import { useState } from "react";
import { useShared } from "@/lib/shared";
import { useStore } from "@/lib/store";
import { Btn } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";

const DISMISS_KEY = "squawk-join-dismissed";

export default function JoinPrompt() {
  const shared = useShared();
  const hydrated = useStore((s) => s.hydrated);
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* Lazy, and in a try/catch: this renders inside AppShell, which is
     server-rendered, and a browser with site data blocked throws on read. */
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* Dismissed for this session only, then. Better than throwing at an
         auditor who blocked site data on purpose. */
    }
  };

  if (dismissed || !hydrated) return null;
  if (shared?.state !== "locked") return null;
  /* `lastSavedAt` is the store's own stamp for "this device has committed
     something". Null means nothing has ever been captured here. */
  if (lastSavedAt) return null;

  const submit = async () => {
    if (!pass.trim()) return;
    setBusy(true);
    setErr(null);
    const problem = await shared.unlock(pass);
    setBusy(false);
    if (problem) {
      setErr(problem);
      return;
    }
    /* Joined. The prompt disappears because the state stops being "locked",
       and it is marked dismissed so it cannot come back if somebody later
       forgets the passphrase on this device — at that point they chose to
       leave, and being asked again would be nagging. */
    setPass("");
    dismiss();
  };

  return (
    /* A region rather than a dialog: it is in the flow of the page, it traps
       nothing, and calling it a dialog would tell a screen reader to expect a
       modal that never arrives. */
    <section
      className="flex flex-wrap items-center gap-x-[14px] gap-y-[9px] border-b px-4 py-[11px] sm:px-6"
      style={{ background: "var(--acc-soft)", borderColor: "var(--acc-line)" }}
      aria-label="Join the shared audit"
    >
      <div className="min-w-[220px] flex-1">
        <b className="font-display text-[12.5px] font-semibold">This device has not joined the audit</b>
        {/* WHAT IT COSTS THEM, not what the feature is called. An auditor who
            skips this will not find out for a day, and the sentence that would
            have stopped them is the one naming the consequence. */}
        <p className="mt-0.5 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
          Enter the team passphrase once and this device sees everyone else&rsquo;s work — their
          checks, findings and photographs — and theirs sees yours. Until then it audits on its own.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-[7px]"
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
          /* Named differently from the box in the export sheet on purpose. Both
             can be on screen at once — the prompt does not close when somebody
             opens Export — and two password fields announcing themselves as
             "Team passphrase" is a coin toss for anyone navigating by label. */
          aria-label="Team passphrase to join the audit"
          autoComplete="off"
          className="min-h-[44px] min-w-[180px] flex-1 rounded-[9px] border px-[11px] text-[12.5px] outline-none focus:border-[var(--acc)]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        />
        <Btn type="submit" variant="primary" disabled={busy || !pass.trim()}>
          {busy ? "Checking…" : <><IconCheck width={13} height={13} />Join</>}
        </Btn>
        {/* THE WAY OUT IS NAMED. Dismissing this must not mean losing the door —
            somebody who does not have the passphrase to hand needs to know
            where to go once they do. */}
        <button
          type="button"
          onClick={dismiss}
          title="It is under More → Export the workbook whenever you have it"
          className="flex min-h-[44px] shrink-0 items-center gap-[5px] rounded-[9px] border px-[10px] text-[11.5px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-3)" }}
        >
          <IconX width={11} height={11} />
          Not now
        </button>
      </form>

      {err && (
        <div className="w-full text-[11.5px]" style={{ color: "var(--bad)" }}>
          {err}
        </div>
      )}
    </section>
  );
}
