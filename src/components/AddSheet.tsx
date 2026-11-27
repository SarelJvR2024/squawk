"use client";

import { useRouter } from "next/navigation";
import Sheet from "@/components/ui/Sheet";
import { Btn } from "@/components/ui/primitives";
import { IconActivity, IconClipboard } from "@/components/ui/icons";
import { PhotoButton, VoiceNoteButton } from "@/components/Capture";
import type { PhotoCapture, VoiceCapture } from "@/components/Capture";
import { useStore } from "@/lib/store";
import { carryMediaToRaiseForm } from "@/components/RaiseFindingSheet";

/** THE + SHEET — build prompt 5, 21 Nov 2026: "one '+' button on Checks,
 *  Evidence, Walk and Issues opens the same sheet... The context is
 *  pre-filled from where it was opened: check id, asset system, discipline,
 *  shown as chips. Nothing already known is asked again."
 *
 *  THE ISSUE AND EVIDENCE OPTIONS DELIBERATELY DO NOT BUILD NEW SCREENS.
 *  The spec reads "Evidence opens the evidence request for that check (see
 *  prompt 6)" and "Issue opens the issue form (see prompt 8)" — but prompts
 *  6 (Evidence screen redesign) and 8 (Issues screen) have not been built
 *  yet; they come later in this sequence. So this sheet's job is narrower
 *  than it looks: build the ONE unified entry point and its context object,
 *  and wire its four options to whatever already does that job TODAY —
 *  `addEvidenceItem` + the `/evidence?open=` deep link (the same pattern
 *  `ReviewRiskPanel.tsx`'s own "Request for this check" button already
 *  uses) for Evidence, and the existing `RaiseFindingSheet` for Issue (a
 *  non-compliance IS every Finding in this schema today — the
 *  Observation/Non-compliance split and Critical/Safety tags the spec
 *  describes are new fields that belong to prompt 8's own schema work, not
 *  this one). When prompt 6 and prompt 8 land, they replace what is BEHIND
 *  these two options; this sheet's own outer contract (its props, its four
 *  options) does not need to change for that.
 *
 *  REPLACES, PER THE SPEC, "the Raise a finding screen, EvidenceQuickCapture
 *  entry points and Inspection's photo button" — but "keep their code
 *  reachable until prompt 10 removes the old routes" is a direct
 *  instruction that prompt 10 owns deleting them, not this one. So this
 *  sheet is added as a NEW, additional entry point on all four screens;
 *  the old entry points (the /raise nav item, RaiseFindingSheet's own
 *  "Raise a finding" button on Findings, EvidenceQuickCapture on Review,
 *  Inspection's toolbar PhotoButton) are left completely untouched here —
 *  a smaller, safer, more reviewable change than rewiring four already
 *  heavily-tested screens' existing flows in the same PR that introduces
 *  the new one, and field/page.tsx in particular is the 2,700-line screen
 *  prompt 7 replaces wholesale in two prompts' time.
 *
 *  PHOTO AND VOICE NOTE, WITH NO CHECK IN CONTEXT: "attach... to the asset
 *  system in context" is new ground — no existing record both requires no
 *  description AND is addressable by just a system name (AdHocItem's own
 *  `description` is required; it is a walk-FINDING record, not a bare
 *  attachment). The closest honest fit, with no schema change at all, is
 *  the existing unassigned `Capture` tray (`addCapture`) that Inspection's
 *  own toolbar photo button already writes to — its `area` field is
 *  already free text, so a known system name pre-fills it instead of
 *  "Unspecified", and the photo still shows exactly where Inspection's
 *  tray already shows every unassigned capture, to be matched to a
 *  specific check later via the same `assignCapture` flow that exists
 *  today. Nothing new is invented; the only change from today's behaviour
 *  is which text goes in `area`. */
export default function AddSheet({
  open,
  onClose,
  onRaiseIssue,
  onEvidenceCreated,
  presetCheckId,
  presetSystem,
  presetDiscipline,
}: {
  open: boolean;
  onClose: () => void;
  /** Prompt 5 does not build the issue form — this opens whatever the
   *  caller already uses to raise one (RaiseFindingSheet today). Takes no
   *  context: the caller gives RaiseFindingSheet the SAME presetCheckId/
   *  presetSystem/presetDiscipline it gave this sheet, at the same call
   *  site — a single source for that context, not two that could drift.
   *  (Code review on this branch caught an earlier version that handed a
   *  ctx object here which every caller then silently discarded.) */
  onRaiseIssue: () => void;
  /** When the + sheet is opened FROM the Evidence screen itself, navigating
   *  to `/evidence?open=` does nothing: useFormsHubDeepLink (lib/deepLink.ts)
   *  reads the query string in a mount-only effect, and a same-route
   *  `router.push` does not remount the page or re-run it — the new item
   *  would be created and then never open (code review on this branch
   *  caught this). Evidence's own page passes its `setOpenId` here to open
   *  the new item directly instead; everywhere else, where the + sheet is
   *  opened from a DIFFERENT route, the deep link still does the job (a
   *  fresh mount of /evidence runs that effect for the first time). */
  onEvidenceCreated?: (id: string) => void;
  presetCheckId?: string;
  presetSystem?: string;
  presetDiscipline?: string;
}) {
  const addEvidenceItem = useStore((s) => s.addEvidenceItem);
  const router = useRouter();

  /* A photo or voice note starts a finding: it opens the full raise form
     (discipline, asset system, check, text, type, tags, more photos, voice)
     with the capture already attached — it is no longer saved on its own and
     closed (Sarel, 26 Nov 2026). */
  function handleMedia(m: PhotoCapture | VoiceCapture) {
    carryMediaToRaiseForm(m);
    onClose();
    onRaiseIssue();
  }

  function handleEvidence() {
    const label = presetCheckId ?? presetSystem ?? presetDiscipline ?? "this audit";
    const id = addEvidenceItem(`Evidence for ${label}`, {
      /* Conditionally spread, not `checkIds: presetCheckId ? [presetCheckId]
         : undefined` — addEvidenceItem's own default shape only applies a
         field when the seed does not mention its key at all (`...seed` after
         the defaults); an explicit `undefined` would still overwrite
         `checkIds: []` with `undefined`. */
      ...(presetCheckId ? { checkIds: [presetCheckId] } : {}),
      ...(presetSystem ? { system: presetSystem } : {}),
      ...(presetDiscipline ? { discipline: presetDiscipline } : {}),
    });
    onClose();
    if (onEvidenceCreated) {
      onEvidenceCreated(id);
    } else {
      router.push(`/evidence?open=${id}`);
    }
  }

  function handleIssue() {
    onClose();
    onRaiseIssue();
  }

  const hasContext = Boolean(presetCheckId || presetSystem || presetDiscipline);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add"
      badges={
        hasContext ? (
          <>
            {presetCheckId && <span>{presetCheckId}</span>}
            {presetCheckId && (presetSystem || presetDiscipline) && <span>·</span>}
            {presetSystem && <span>{presetSystem}</span>}
            {presetSystem && presetDiscipline && <span>·</span>}
            {presetDiscipline && <span>{presetDiscipline}</span>}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <PhotoButton large label="Photo" className="w-full" onCaptured={handleMedia} />
        <PhotoButton large fromLibrary label="Upload" className="w-full" onCaptured={handleMedia} />
        <VoiceNoteButton large className="w-full" onCaptured={handleMedia} />
        <Btn
          className="min-h-[56px] w-full justify-start gap-2.5 text-[14px] font-semibold"
          onClick={handleEvidence}
        >
          <IconClipboard width={16} height={16} />
          Evidence
        </Btn>
        <Btn
          className="min-h-[56px] w-full justify-start gap-2.5 text-[14px] font-semibold"
          onClick={handleIssue}
        >
          <IconActivity width={16} height={16} />
          Issue
        </Btn>
      </div>
    </Sheet>
  );
}
