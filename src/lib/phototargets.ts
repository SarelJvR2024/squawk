/** Photo targets, per discipline — see PhotoTargetsConfig in types.ts. Pure
 *  functions; the store holds the config, this reads and edits it. A
 *  discipline with no entry gets DEFAULT_PHOTO_TARGET, never zero. */

import type { PhotoTargetsConfig } from "./types";

/** Every walk this app has shipped so far has worked to this figure without
 *  it ever being written down — Setup can now override it per discipline,
 *  but a discipline nobody has touched still gets a real number rather than
 *  reading as "0 of 0, 100%" the moment the Walk screen opens. */
export const DEFAULT_PHOTO_TARGET = 20;

export function photoTarget(config: PhotoTargetsConfig | undefined, discipline: string): number {
  const v = config?.[discipline];
  return typeof v === "number" && v > 0 ? v : DEFAULT_PHOTO_TARGET;
}

export function withPhotoTarget(
  config: PhotoTargetsConfig,
  discipline: string,
  target: number,
): PhotoTargetsConfig {
  const next: PhotoTargetsConfig = { ...config };
  if (!discipline) return next;
  /* ROUNDED BEFORE THE "IS IT POSITIVE" CHECK, NOT AFTER — code review on
     this branch: checking `target <= 0` on the UNROUNDED value let 0.4
     (typed directly into the number input, not just reached via its
     spinner) through as "positive", then round it down to the literal 0
     this type's own header promises never happens. Rounding first means
     the only number that can ever be stored is the one the check is
     actually about. */
  const rounded = Math.round(target);
  if (!Number.isFinite(rounded) || rounded <= 0) delete next[discipline];
  else next[discipline] = rounded;
  return next;
}
