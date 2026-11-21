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

/** How many of these checks need each channel. */
export function channelCounts(config: CheckChannelConfig | undefined, checkIds: string[]) {
  const out: Record<CheckChannelKey, number> = { interview: 0, evidence: 0, walk: 0 };
  for (const id of checkIds) {
    const c = channelsOf(config, id);
    for (const k of CHANNEL_KEYS) if (c[k]) out[k] += 1;
  }
  return out;
}
