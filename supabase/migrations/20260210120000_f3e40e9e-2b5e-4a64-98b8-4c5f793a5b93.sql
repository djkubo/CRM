-- Persistent sync coverage + freshness state per source.
-- Rationale: sync_runs is cleaned (7d) by cleanup_and_maintain(), so we need a durable table
-- to remember long backfills and latest "fresh_until" per integration.

create table if not exists public.sync_state (
  source text primary key,
  backfill_start timestamptz null,
  fresh_until timestamptz null,
  last_success_at timestamptz null,
  last_success_run_id uuid null,
  last_success_status text null,
  last_success_meta jsonb not null default '{}'::jsonb,
  last_error_at timestamptz null,
  last_error_message text null,
  updated_at timestamptz not null default now()
);

-- Keep updated_at current (function is created in earlier migrations).
drop trigger if exists update_sync_state_updated_at on public.sync_state;
create trigger update_sync_state_updated_at
  before update on public.sync_state
  for each row execute function public.update_updated_at_column();

alter table public.sync_state enable row level security;

-- Privileges are still required even with RLS; keep these tight.
revoke all on table public.sync_state from public;
grant select, insert, update, delete on table public.sync_state to authenticated;
grant select, insert, update, delete on table public.sync_state to service_role;

drop policy if exists "Admins can manage sync_state" on public.sync_state;
create policy "Admins can manage sync_state"
  on public.sync_state
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Service role can manage sync_state" on public.sync_state;
create policy "Service role can manage sync_state"
  on public.sync_state
  for all
  to service_role
  using (true)
  with check (true);

