/** "How to ask" notes — see HowToAskConfig in types.ts. Pure functions; the
 *  store holds the config, this reads and edits it. A check with no entry,
 *  or an empty string, both mean "no note set". */

import type { HowToAskConfig } from "./types";

/** Set the same note on every given check id, replacing whatever was there.
 *  An empty string clears a note — it is still stored, not deleted, which
 *  keeps `mergeHowToAsk` below able to tell "cleared" from "never visited". */
export function withHowToAsk(
  config: HowToAskConfig,
  checkIds: string[],
  note: string,
): HowToAskConfig {
  const next: HowToAskConfig = { ...config };
  for (const id of checkIds) next[id] = note;
  return next;
}

/** How many of these checks have a real note — non-empty once whitespace is
 *  trimmed, the same test the Checks screen uses to decide whether there is
 *  anything to show. Setup's "312 of 324 set" count. */
export function howToAskCount(config: HowToAskConfig | undefined, checkIds: string[]): number {
  if (!config) return 0;
  return checkIds.filter((id) => (config[id] ?? "").trim().length > 0).length;
}

/** Merge two devices' notes into one.
 *
 *  NOT WIRED INTO ANY SYNC PATH YET, same honest limit mergeChannelConfig
 *  (lib/channels.ts) documents for itself: the build prompt for this feature
 *  said to share it "through the team record like checkChannels", but
 *  checkChannels itself is not wired into any sync path either — grep
 *  shared.ts/sync.ts/merge.ts, `checkChannels` does not appear in any of
 *  them. This exists, tested, for when that sync gets built, not because
 *  something calls it now.
 *
 *  NOT TIMESTAMPED either, so this is the same best-available rule
 *  mergeChannelConfig uses rather than a true last-write-wins: "mine wins a
 *  shared id" (`unionById` in merge.ts, for comparison). A check id only one
 *  side has a note for always carries through. */
export function mergeHowToAsk(mine: HowToAskConfig, theirs: HowToAskConfig): HowToAskConfig {
  return { ...theirs, ...mine };
}
