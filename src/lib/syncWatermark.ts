/** How far a device's shared-record push watermark may move after one push —
 *  pulled out of shared.ts's sync() on its own, because this is the one
 *  decision in the whole sync path where a wrong answer costs a record
 *  forever, and that deserves to be tested on its own rather than only ever
 *  exercised inside a React hook wired to fetch and localStorage.
 *
 *  Found 15 October 2026, on a live audit: a device merged 48 asset-system
 *  ratings, the app reported every sync "Shared" with no error, and the
 *  shared record still held only 2 of them afterwards. The watermark had
 *  advanced past all 48 anyway — sync() used to move it to cover every
 *  record it SENT the moment the POST came back 200 OK, without checking
 *  that the record store actually now holds what was sent. Once a record is
 *  past the watermark, rowsToPush's `at > since` gate (shared.ts) excludes
 *  it from every future push, forever — the same shape of failure
 *  RESYNC_VERSION's own history in shared.ts already describes, reached by
 *  a different road: that one was a push-able kind with no row kind at all;
 *  this one is a kind that IS push-able, reported as pushed, that the
 *  record store never actually confirmed.
 *
 *  THE FIX: squawk_push (supabase/0001_shared_record.sql) no longer answers
 *  with a bare count. It answers, for every key a device just sent, what the
 *  record store holds for it right now — freshly written by this call,
 *  already current from before it (a legitimate, harmless skip: somebody
 *  else's newer value already won), or genuinely absent. Only the third
 *  case is a problem, and only this function's job is to tell them apart. */

/** One row of what squawk_push reports back for a key a device just sent.
 *  `updated_at` null means the record store does not currently hold that
 *  key at all. */
export interface ConfirmedRow {
  kind: string;
  id: string;
  updated_at: number | null;
}

/** The rule: every record in `sent` must have a matching, non-null entry in
 *  `confirmed` before the watermark is allowed to move past ANY of them. One
 *  unconfirmed record holds back the whole batch — a scalar watermark has no
 *  way to skip just the bad one — which is a resend of at most a visit's
 *  worth of records, affordable per the same reasoning as OVERLAP_MS in
 *  api/sync/route.ts, against silently never sending a record again. */
export function nextPushWatermark(
  sent: { kind: string; id: string; updated_at: number }[],
  confirmed: ConfirmedRow[],
  since: number
): number {
  if (sent.length === 0) return since;
  const ok = new Set(
    confirmed.filter((c) => c.updated_at !== null).map((c) => `${c.kind}:${c.id}`)
  );
  const allConfirmed = sent.every((r) => ok.has(`${r.kind}:${r.id}`));
  if (!allConfirmed) return since;
  return sent.reduce((n, r) => Math.max(n, r.updated_at), since);
}
