import type { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

/* The shared audit record — the only door to it, and it opens from the server.
 *
 *  Squawk is local-first and stays that way. Each device captures into its own
 *  IndexedDB whether or not this route answers, and a deployment with no
 *  Supabase configured behaves exactly like the Squawk that existed before this
 *  file did. What this adds is a place the devices meet, so a team of auditors
 *  is working one audit rather than several.
 *
 *  WHY THE BROWSER NEVER TALKS TO SUPABASE DIRECTLY. The obvious build hands the
 *  publishable key to the client and leans on row-level security. That is a
 *  reasonable design when every user signs in and RLS can key on who they are.
 *  Here access is a shared team passphrase, so there is no per-user identity for
 *  a policy to test — and a publishable key in a browser plus a permissive
 *  policy is a URL away from every finding and photograph in the programme.
 *  Instead: the secret key lives here, the table has RLS on with no policies at
 *  all (so the publishable key can do nothing), and the passphrase is checked on
 *  this side where a client cannot get round it. Same reasoning as ASSIST_VISION.
 *
 *  IT NEVER FALLS OPEN. Missing passphrase, missing URL, missing key — any of
 *  them and the route reports itself unavailable and refuses to sync. An
 *  unconfigured deployment is one with no shared record, never one with an
 *  unguarded shared record.
 *
 *  WHAT LEAVES THE DEVICE: the audit records for the visit in view — answers,
 *  findings, hazards, closure items and their captions. Photographs travel as
 *  references; their bytes go to the record store through /api/photos, as they
 *  always have, and never through here.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
const PASS = process.env.SQUAWK_TEAM_PASSPHRASE;

/** Every one of the three, or nothing. */
const configured = () => !!URL_ && !!KEY && !!PASS;

const TABLE = "squawk_records";
/* A visit is a few hundred records; a whole audit with every closure item is
   under a couple of thousand. 4 MB is generous for that and still refuses a
   client trying to use the route as free storage. */
const MAX_BODY = 4 * 1024 * 1024;

/** Compared as digests, so the comparison is constant time and does not leak
 *  the length of the real passphrase along the way. */
function passphraseOk(given: unknown): boolean {
  if (!PASS || typeof given !== "string" || given.length === 0) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(PASS).digest();
  return timingSafeEqual(a, b);
}

/* A brake, not a lock.
 *
 *  Serverless instances come and go, so this counter is per-instance and a
 *  determined attacker gets a fresh one by waiting. It is here because the
 *  cheap attack on a shared passphrase is a fast loop from one place, and this
 *  makes that loop slow and noisy without pretending to be a rate limiter. The
 *  real defence is a long passphrase; this buys time to notice. */
const attempts = new Map<string, { n: number; until: number }>();
const LOCKOUT_MS = 60_000;
const FREE_TRIES = 8;

function tooManyAttempts(who: string): boolean {
  const rec = attempts.get(who);
  if (!rec) return false;
  if (Date.now() > rec.until) {
    attempts.delete(who);
    return false;
  }
  return rec.n >= FREE_TRIES;
}

function noteFailure(who: string) {
  const rec = attempts.get(who) ?? { n: 0, until: Date.now() + LOCKOUT_MS };
  rec.n += 1;
  rec.until = Date.now() + LOCKOUT_MS;
  attempts.set(who, rec);
}

interface Row {
  entity: string;
  visit: string;
  kind: string;
  id: string;
  updated_at: number;
  payload: unknown;
  server_at?: string;
}

export async function GET() {
  return Response.json({
    /* Whether a shared record exists for this deployment. Says nothing about
       what it holds and nothing about the passphrase. */
    available: configured(),
    /* WHICH OF THE THREE IS MISSING, BY NAME ONLY — never a value, never a
       hint at one.

       `available` is all-or-nothing, which is correct for the app's behaviour
       and useless for fixing it: a deployment with two of three set looks
       identical to one with none, and the only way to tell was to guess in the
       Vercel dashboard. Sarel lost most of a day to exactly that, on a preview
       where the variables had been scoped to Production only.

       WHY THIS IS SAFE TO SAY OUT LOUD. It reports the ABSENCE of
       configuration. A missing SQUAWK_TEAM_PASSPHRASE is not a way in — with
       no passphrase set, passphraseOk() returns false for every input and no
       row moves in either direction, so naming it tells an attacker only that
       there is nothing here to attack. No value, no length, no prefix, and
       nothing at all once the deployment is configured: the array is empty and
       stays empty, so a working deployment discloses nothing. */
    missing: configured()
      ? []
      : [
          !URL_ && "SUPABASE_URL",
          !KEY && "SUPABASE_SECRET_KEY",
          !PASS && "SQUAWK_TEAM_PASSPHRASE",
        ].filter(Boolean),
    /* The server's clock, so a device can find out whether its own is wrong.

       Every contested record — over the wire and in the file merge alike — is
       resolved on the updatedAt stamped by the DEVICE that made the edit. A
       tablet running ten minutes fast therefore wins every clash it is part of,
       including against a better answer somebody else gave afterwards, and
       nothing about that is visible to anyone. The merge is right; what was
       missing was a device ever being told its clock is wrong.

       Sent whether or not a shared record is configured, because the file merge
       has exactly the same dependence on device clocks and a team passing a
       memory stick around deserves the same warning. */
    now: new Date().toISOString(),
  });
}

/** How far behind the newest row the cursor is held. Longer than any push
 *  transaction could plausibly stay open; short enough that the re-read is a
 *  rounding error on an audit's traffic. */
const OVERLAP_MS = 60_000;

/** A cursor, moved back by the overlap. Anything unparseable is returned as it
 *  came: a cursor this route cannot read is one it must not silently narrow. */
function rewind(at: string): string {
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(t - OVERLAP_MS).toISOString() : at;
}

export async function POST(req: NextRequest) {
  if (!configured()) {
    return Response.json(
      {
        error:
          "No shared record is configured for this deployment. Captures stay on this device and can still be shared as a file.",
        available: false,
      },
      { status: 503 }
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return Response.json({ error: "That is more than one visit's records." }, { status: 413 });
  }

  let body: {
    passphrase?: string;
    entity?: string;
    visit?: string;
    since?: string | null;
    records?: Row[];
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  /* x-forwarded-for is spoofable. It is used to SEPARATE callers so one client
     retrying does not lock out another, not to identify anybody. */
  const who = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooManyAttempts(who)) {
    return Response.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 }
    );
  }

  if (!passphraseOk(body.passphrase)) {
    noteFailure(who);
    /* The same answer whether the passphrase was wrong, empty or absent. */
    return Response.json({ error: "That team passphrase is not right." }, { status: 401 });
  }
  attempts.delete(who);

  const entity = typeof body.entity === "string" ? body.entity : "";
  const visit = typeof body.visit === "string" ? body.visit : "";
  if (!entity || !visit) {
    return Response.json({ error: "No audit named." }, { status: 400 });
  }

  const headers = {
    apikey: KEY!,
    authorization: `Bearer ${KEY}`,
    "content-type": "application/json",
  };

  try {
    /* PUSH first, so what this device knows is in the record before it asks
       what it is missing — otherwise two devices syncing at the same moment can
       each pull before either has pushed and neither sees the other. */
    const records = Array.isArray(body.records) ? body.records : [];
    let written = 0;
    if (records.length) {
      /* Every row is re-stamped with the audit from the request. A client
         cannot write into another airport's visit by putting a different
         entity in the row than in the request it authenticated for. */
      const scoped = records
        .filter((r) => r && typeof r.kind === "string" && typeof r.id === "string")
        .map((r) => ({
          entity,
          visit,
          kind: r.kind,
          id: r.id,
          updated_at: Number.isFinite(r.updated_at) ? Math.trunc(r.updated_at) : 0,
          payload: r.payload ?? {},
        }));
      const res = await fetch(`${URL_}/rest/v1/rpc/squawk_push`, {
        method: "POST",
        headers,
        body: JSON.stringify({ records: scoped }),
      });
      if (!res.ok) {
        const detail = await res.text();
        console.error("sync push", res.status, detail.slice(0, 300));
        return Response.json(
          { error: `The shared record refused the write (${res.status}).` },
          { status: 502 }
        );
      }
      written = Number(await res.json()) || 0;
    }

    /* PULL: everything in this audit the caller has not seen. The cursor is the
       SERVER's clock — a device with a wrong clock would otherwise write rows
       it could never read back. */
    const since = typeof body.since === "string" && body.since ? body.since : null;
    const query = new URLSearchParams({
      select: "kind,id,updated_at,payload,server_at",
      entity: `eq.${entity}`,
      visit: `eq.${visit}`,
      order: "server_at.asc",
    });
    if (since) query.set("server_at", `gt.${since}`);

    const res = await fetch(`${URL_}/rest/v1/${TABLE}?${query}`, { headers });
    if (!res.ok) {
      const detail = await res.text();
      console.error("sync pull", res.status, detail.slice(0, 300));
      return Response.json(
        { error: `The shared record could not be read (${res.status}).` },
        { status: 502 }
      );
    }
    const rows = (await res.json()) as Row[];

    /* Optional on the row type, because a record store that stopped sending it
       must leave the cursor where it was rather than reset it to the start. */
    const newest = rows.length ? rows[rows.length - 1].server_at : undefined;

    return Response.json({
      records: rows,
      /* The cursor to send next time. Held by the caller rather than the server,
         because the server keeps no per-device state — a device that is wiped
         and set up again simply syncs from the beginning.

         IT IS DELIBERATELY BEHIND THE NEWEST ROW BY A MINUTE, and that is the
         whole of it: Postgres reads now() at a transaction's START and makes
         its rows visible at its COMMIT, so a push that takes a moment lands
         carrying a timestamp from before it began. A device handed a cursor in
         that window would exclude the slow device's rows from every pull it
         ever made again — and the slow device will not re-send them, because
         its own push watermark has moved on. A check captured on one tablet
         would simply never appear on another, with nothing anywhere reporting
         a problem.

         Overlapping costs a re-read of the last minute of the team's work on
         each sync. That is affordable because the merge is idempotent — newer
         wins, evidence is unioned — so a row arriving twice changes nothing the
         second time. Losing a captured check at a national key point is not
         affordable at all. */
      cursor: newest ? rewind(newest) : since,
      written,
      pulled: rows.length,
    });
  } catch (e) {
    console.error("sync", e);
    return Response.json({ error: "Could not reach the shared record." }, { status: 502 });
  }
}
