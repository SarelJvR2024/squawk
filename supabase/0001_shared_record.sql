-- Squawk's shared audit record.
--
-- WHAT THIS IS FOR
--
-- The audit lives in each device's IndexedDB. That is right for an apron with
-- no signal and wrong for a team, so this table is the place the devices meet.
-- It is a SYNC TARGET, not the source of truth: every device keeps capturing
-- into its own store whether or not this is reachable, and a Squawk that cannot
-- see Supabase behaves exactly like the Squawk that existed before it did.
--
-- HOW IT IS REACHED, AND WHY THAT MATTERS
--
-- No browser ever talks to this table. The app's own /api/sync route holds the
-- secret key server-side and checks the team passphrase before it does
-- anything. Row-level security is therefore ENABLED WITH NO POLICIES, which
-- denies everything the publishable key could ever ask for — belt and braces
-- against a key that is, by design, public. The secret key bypasses RLS; that
-- is the only door, and it opens from the server.
--
-- These are findings and photographs from a national key point. The table is
-- deliberately boring: no auth schema, no user rows, no personal data beyond
-- the auditor's name that every record already carried.
--
-- TO INSTALL: paste this whole file into the Supabase SQL editor and run it.
-- It is idempotent — running it twice is harmless.

create table if not exists public.squawk_records (
  -- The audit. Every query is scoped by this pair, and nothing crosses it.
  entity      text   not null,
  visit       text   not null,
  -- 'response' | 'finding' | 'hazard' | 'verification' | 'feedback' | 'capture'
  kind        text   not null,
  -- checkId, F-XXXXX, HZ-XXXXX, or the prior-finding key. Unique within kind.
  id          text   not null,
  -- The DEVICE's clock, in milliseconds — the same updatedAt the local store
  -- stamps and the file merge compares. Device clocks drift, which is exactly
  -- why the pull cursor below uses the server's clock instead.
  updated_at  bigint not null,
  payload     jsonb  not null,
  -- The SERVER's clock, and the only thing a client pages on. A device with a
  -- wrong clock can write a record nobody else ever sees again if the cursor is
  -- its own timestamp; server_at cannot be got wrong by a phone.
  server_at   timestamptz not null default now(),
  primary key (entity, visit, kind, id)
);

-- The one query the app makes: everything in this audit changed since a cursor.
create index if not exists squawk_records_pull
  on public.squawk_records (entity, visit, server_at);

alter table public.squawk_records enable row level security;

-- Deliberately no policies. See the header: the publishable key must be able to
-- do nothing at all, and the secret key does not need one.

-- The conditional upsert.
--
-- PostgREST's own upsert overwrites unconditionally, which would let a tablet
-- that has been in a basement for two hours push its stale copy over an
-- afternoon of somebody else's work. This refuses to go backwards: a row is
-- written only where it is NEWER than what is already there.
--
-- Evidence is not merged here on purpose. Attachments and progress logs must be
-- UNIONED rather than replaced — a photograph on the losing side of a timestamp
-- clash is still a photograph of a defect — and that rule already exists, in
-- src/lib/merge.ts, tested against the real module. The client pulls, merges
-- with those rules, then pushes the merged result. One set of rules, in one
-- place, rather than a second implementation in SQL that could disagree.
--
-- RETURNS THE CONFIRMED STATE OF EVERY SUBMITTED KEY, not a bare count —
-- found 15 October 2026, on a live audit, after a device merged 48 asset
-- systems, the app reported every sync "Shared" with no error, and two
-- syncs later the shared record still held only 2 of them. A plain written
-- count cannot tell a device WHICH of its records actually landed: a lower
-- count than submitted is routine and harmless (somebody else's newer value
-- already won for some of those keys), so a device had no way to tell that
-- apart from the one failure mode that matters — a record it sent simply
-- never reaching the table. squawk_push now answers the only question a
-- device actually needs answered: for each key I just sent, what does the
-- record store hold for it right now? src/lib/shared.ts's sync() checks
-- every key it sent against this before it is allowed to stop re-sending
-- it.
drop function if exists public.squawk_push(jsonb);
create function public.squawk_push(records jsonb)
returns table(kind text, id text, updated_at bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with incoming as (
    select
      r ->> 'entity'                as entity,
      r ->> 'visit'                 as visit,
      r ->> 'kind'                  as kind,
      r ->> 'id'                    as id,
      (r ->> 'updated_at')::bigint  as updated_at,
      r -> 'payload'                as payload
    from jsonb_array_elements(records) as r
  ),
  -- Two devices can send the same record in one batch; keep the newer.
  deduped as (
    select distinct on (entity, visit, kind, id) *
    from incoming
    order by entity, visit, kind, id, updated_at desc
  ),
  -- What each submitted key held BEFORE this call — the ordinary MVCC
  -- snapshot every other CTE here also reads, untouched by the insert
  -- below. A key the upsert skips because a newer value already stood is
  -- still confirmed through this, not lost from the answer.
  existing as (
    select t.entity, t.visit, t.kind, t.id, t.updated_at
    from public.squawk_records t
    join deduped d
      on t.entity = d.entity and t.visit = d.visit and t.kind = d.kind and t.id = d.id
  ),
  upserted as (
    insert into public.squawk_records as t
      (entity, visit, kind, id, updated_at, payload)
    select entity, visit, kind, id, updated_at, payload from deduped
    on conflict (entity, visit, kind, id) do update
      set updated_at = excluded.updated_at,
          payload    = excluded.payload,
          server_at  = now()
      where excluded.updated_at > t.updated_at
    returning t.entity, t.visit, t.kind, t.id, t.updated_at
  )
  -- One row per submitted key: the value now on record for it, whichever
  -- of the two CTEs above actually holds it. Both absent — the safety net
  -- this whole function exists for — comes back with updated_at null, which
  -- the caller reads as "not confirmed, send it again."
  select d.kind, d.id, coalesce(u.updated_at, e.updated_at)
  from deduped d
  left join upserted u
    on u.entity = d.entity and u.visit = d.visit and u.kind = d.kind and u.id = d.id
  left join existing e
    on e.entity = d.entity and e.visit = d.visit and e.kind = d.kind and e.id = d.id;
end;
$$;
