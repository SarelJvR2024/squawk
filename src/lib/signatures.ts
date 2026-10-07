/** What a signature is called, everywhere — `ATT-7K2P9_S01.png`. The same
 *  shape photos.ts keeps for photographs, for the same reason: one
 *  identifier has to mean the same image in the tablet, the record store,
 *  the workbook and the SharePoint sync.
 *
 *  Pure, and deliberately framework-free, same reasoning as photos.ts:
 *  sharepoint.ts's own test suite imports this under plain Node (no DOM),
 *  and signatureSync.ts (a `"use client"` module, browser APIs and all)
 *  imports it too. Neither may end up depending on the other pulling in
 *  code it cannot run. */

import type { Signature } from "./types";

/** The file a signature is written as, in the record store and in the
 *  SharePoint evidence library. Always the ref the register minted it
 *  with — attendanceRegister.ts/store.ts's `ATT-..._S01`, or an evidence
 *  log item's `DOC-..._S01` — so the object and the ref printed anywhere
 *  else agree. */
export function signatureFilename(s: Signature): string {
  return `${s.ref}.png`;
}

/** `FALE/2026-09/ATT-7K2P9_S01.png` — the same per-audit foldering
 *  photoObjectPath uses, so one record store holds both kinds of evidence
 *  without a second convention to keep straight. */
export function signatureObjectPath(entityCode: string, visitId: string, s: Signature): string {
  return `${entityCode}/${visitId}/${signatureFilename(s)}`;
}
