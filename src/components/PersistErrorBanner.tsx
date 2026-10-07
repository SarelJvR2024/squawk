"use client";

import { usePersistError, useStore } from "@/lib/store";

/** The sentence Capture.tsx already has for one lost photograph
 *  (whyItFailed), for the whole audit — see whyPersistFailed in store.ts.
 *  Dismissible, unlike TabGuard: the commit that triggered this already
 *  succeeded in memory, so nothing is lost yet, only unconfirmed to survive
 *  a reload — an auditor who has read it and is heading somewhere with
 *  signal to export should be able to carry on rather than have it pinned
 *  over the work for the rest of the day. */
export default function PersistErrorBanner() {
  const error = usePersistError();
  const clear = useStore((s) => s.clearPersistError);
  if (!error) return null;
  return (
    <div
      className="flex items-start gap-2 border-b px-[12px] py-[9px] text-[11.5px] leading-[1.5]"
      style={{ background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad)" }}
      role="alert"
    >
      <span className="min-w-0 flex-1">{error}</span>
      <button onClick={clear} className="shrink-0 font-semibold underline">
        Dismiss
      </button>
    </div>
  );
}
