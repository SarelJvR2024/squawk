"use client";

/** THE SHARED RECORD, ONE PRESS FROM THE MENU.
 *
 *  Sarel, 2026-09-15, looking at the More menu on a phone: "move the passphrase
 *  to this level of the menu, it is too hidden."
 *
 *  He is right, and it was hidden twice over. The passphrase box lives at the
 *  bottom of the export sheet, which is behind More → Export the workbook —
 *  two presses and a scroll past the whole workbook, in a sheet whose title
 *  says nothing about joining anything. An auditor standing on an apron with a
 *  second tablet has no reason to look there, and JoinPrompt only shows on a
 *  device that has captured nothing, so a device that captured one check before
 *  anybody thought about the passphrase had no route at all.
 *
 *  So the shared record gets its own line in the menu, at the same level as
 *  Export and Sync, and this sheet is what it opens. It is the SAME panel the
 *  export sheet renders — one component, one set of states, no second copy of
 *  the passphrase logic to drift. The export sheet keeps its copy: somebody who
 *  is already there should not have to go back out to the menu.
 *
 *  When the deployment has no shared record at all, the panel says so and this
 *  sheet names the server variables that are empty, because "not set up" with
 *  nothing after it is the message that sent Sarel to the Vercel dashboard
 *  guessing. */

import SharedPanel from "@/components/SharedPanel";
import { useShared } from "@/lib/shared";
import { Btn } from "@/components/ui/primitives";
import { IconX } from "@/components/ui/icons";

export default function SharedSheet({ onClose }: { onClose: () => void }) {
  const shared = useShared();
  const missing = shared?.missing ?? [];

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-center overflow-y-auto px-4 pt-[10vh] pb-[10vh]"
      style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="h-fit w-[min(520px,100%)] rounded-[20px] border p-[22px]"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[15px] font-bold">Shared record</h3>
            <p className="mt-[3px] text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              One audit, every device. Enter the team passphrase once.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-[8px] border p-[9px]"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
          >
            <IconX width={13} height={13} />
          </button>
        </div>

        <SharedPanel />

        {/* Named, not hinted at. The three go together or not at all, so the
            list is the whole answer to "why is this off". */}
        {shared?.state === "off" && missing.length > 0 && (
          <p className="mb-3.5 text-[11px] leading-[1.6]" style={{ color: "var(--ink-4)" }}>
            {missing.join(", ")} {missing.length === 1 ? "is" : "are"} not set on this
            deployment. All three are needed together — until they are, captures stay on
            this device and move by export and merge.
          </p>
        )}

        {/* The other half of the answer, for a device that cannot join: nothing
            is lost by not joining, and the file route is right there. */}
        <p className="mb-3.5 text-[11px] leading-[1.6]" style={{ color: "var(--ink-4)" }}>
          A device that never joins still captures, exports and merges — the shared
          record only saves the hand-over. The passphrase is kept on this device alone
          and never rides inside a capture bundle.
        </p>

        <div className="flex justify-end">
          <Btn variant="primary" onClick={onClose}>
            Done
          </Btn>
        </div>
      </div>
    </div>
  );
}
