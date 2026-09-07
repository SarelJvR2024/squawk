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
  });
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

    return Response.json({
      records: rows,
      /* The cursor to send next time. Held by the caller rather than the server,
         because the server keeps no per-device state — a device that is wiped
         and set up again simply syncs from the beginning. */
      cursor: rows.length ? rows[rows.length - 1].server_at : since,
      written,
      pulled: rows.length,
    });
  } catch (e) {
    console.error("sync", e);
    return Response.json({ error: "Could not reach the shared record." }, { status: 502 });
  }
}
