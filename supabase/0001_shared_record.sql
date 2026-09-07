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
create or replace function public.squawk_push(records jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  written integer;
begin
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
  upserted as (
    insert into public.squawk_records as t
      (entity, visit, kind, id, updated_at, payload)
    select entity, visit, kind, id, updated_at, payload from deduped
    on conflict (entity, visit, kind, id) do update
      set updated_at = excluded.updated_at,
          payload    = excluded.payload,
          server_at  = now()
      where excluded.updated_at > t.updated_at
    returning 1
  )
  select count(*) into written from upserted;
  return written;
end;
$$;
