create table if not exists public.weekly_periods (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  status text not null default 'current' check (status in ('current', 'closed', 'archived')),
  title text null,
  created_by uuid null references auth.users(id) on delete set null,
  closed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz null,
  archived_at timestamptz null,
  summary_json jsonb not null default '{}'::jsonb,
  notes text null,
  unique (week_start, week_end)
);

create table if not exists public.weekly_period_tickets (
  id uuid primary key default gen_random_uuid(),
  weekly_period_id uuid not null references public.weekly_periods(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  role text not null default 'created' check (role in ('created', 'planned', 'completed', 'carried_over', 'hot', 'unresolved')),
  ticket_number text null,
  ticket_title text null,
  object_name text null,
  object_address text null,
  category_name text null,
  priority text null,
  status_at_close text null,
  assignee_worker_name text null,
  created_at_snapshot timestamptz null,
  completed_at_snapshot timestamptz null,
  added_at timestamptz not null default now(),
  unique (weekly_period_id, ticket_id, role)
);

create index if not exists weekly_periods_week_start_idx on public.weekly_periods (week_start);
create index if not exists weekly_periods_week_end_idx on public.weekly_periods (week_end);
create index if not exists weekly_periods_status_idx on public.weekly_periods (status);
create index if not exists weekly_period_tickets_weekly_period_id_idx on public.weekly_period_tickets (weekly_period_id);
create index if not exists weekly_period_tickets_ticket_id_idx on public.weekly_period_tickets (ticket_id);
create index if not exists weekly_period_tickets_role_idx on public.weekly_period_tickets (role);
create index if not exists weekly_period_tickets_status_at_close_idx on public.weekly_period_tickets (status_at_close);

alter table public.weekly_periods enable row level security;
alter table public.weekly_period_tickets enable row level security;

drop policy if exists "Managers can view weekly periods" on public.weekly_periods;
create policy "Managers can view weekly periods"
on public.weekly_periods for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_active = true
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can manage weekly periods" on public.weekly_periods;
create policy "Managers can manage weekly periods"
on public.weekly_periods for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_active = true
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_active = true
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can view weekly period tickets" on public.weekly_period_tickets;
create policy "Managers can view weekly period tickets"
on public.weekly_period_tickets for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_active = true
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can manage weekly period tickets" on public.weekly_period_tickets;
create policy "Managers can manage weekly period tickets"
on public.weekly_period_tickets for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_active = true
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_active = true
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);
