/** Which of interview / evidence / walk a check needs — see CheckChannels in
 *  types.ts. Pure functions; the store holds the config, this reads and edits
 *  it. Only exceptions are stored: a check with no entry needs all three. */

import type { CheckChannelConfig, CheckChannelKey, CheckChannels } from "./types";

export const CHANNEL_KEYS: CheckChannelKey[] = ["interview", "evidence", "walk"];

export const CHANNEL_LABEL: Record<CheckChannelKey, string> = {
  interview: "Interview",
  evidence: "Evidence",
  walk: "Walk",
};

export function channelsOf(config: CheckChannelConfig | undefined, checkId: string): CheckChannels {
  const c = config?.[checkId];
  return {
    interview: c?.interview !== false,
    evidence: c?.evidence !== false,
    walk: c?.walk !== false,
  };
}

/** Turn channels on or off for many checks at once. Returns a new config and
 *  drops entries that are back to "needs all three". */
export function withChannels(
  config: CheckChannelConfig,
  checkIds: string[],
  patch: Partial<CheckChannels>,
): CheckChannelConfig {
  const next: CheckChannelConfig = { ...config };
  for (const id of checkIds) {
    const cur = { ...(next[id] ?? {}) };
    for (const k of CHANNEL_KEYS) {
      if (patch[k] === undefined) continue;
      if (patch[k]) delete cur[k];
      else cur[k] = false;
    }
    if (Object.keys(cur).length === 0) delete next[id];
    else next[id] = cur;
  }
  return next;
}

/** Merge two devices' channel config into one.
 *
 *  NOT WIRED INTO ANY SYNC PATH YET. The build prompt that asked for this
 *  said to sync checkChannels "the same way auditDateOverrides or contacts
 *  sync" — but neither of those actually has cross-device sync in this
 *  codebase: grep shared.ts/sync.ts/merge.ts, neither name appears, and
 *  Bundle (merge.ts) deliberately excludes all three as visit-scoped export
 *  content, which checkChannels is not. So there is nothing for this
 *  function to plug into today; it exists, tested, for when that sync gets
 *  built, not because something calls it now.
 *
 *  NOT TIMESTAMPED either, so not really "last write wins" — an entry here
 *  is just `{checkId: {channel: false}}`, nothing carries when it was set.
 *  Without a per-entry clock the honest merge is the one this codebase
 *  already uses elsewhere for an untimestamped conflict (`unionById` in
 *  merge.ts: "mine wins a shared id"), so that is what this does too. A
 *  check id only one side has an opinion about always carries through. */
export function mergeChannelConfig(
  mine: CheckChannelConfig,
  theirs: CheckChannelConfig,
): CheckChannelConfig {
  return { ...theirs, ...mine };
}

/** How many of these checks need each channel. */
export function channelCounts(config: CheckChannelConfig | undefined, checkIds: string[]) {
  const out: Record<CheckChannelKey, number> = { interview: 0, evidence: 0, walk: 0 };
  for (const id of checkIds) {
    const c = channelsOf(config, id);
    for (const k of CHANNEL_KEYS) if (c[k]) out[k] += 1;
  }
  return out;
}
