create table if not exists public.worker_ticket_actions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz
);

create index if not exists worker_ticket_actions_token_idx on public.worker_ticket_actions(token);
create index if not exists worker_ticket_actions_ticket_id_idx on public.worker_ticket_actions(ticket_id);
create index if not exists worker_ticket_actions_worker_id_idx on public.worker_ticket_actions(worker_id);

alter table public.worker_ticket_actions enable row level security;

drop policy if exists "Managers can view worker ticket actions" on public.worker_ticket_actions;
create policy "Managers can view worker ticket actions"
on public.worker_ticket_actions for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can manage worker ticket actions" on public.worker_ticket_actions;
create policy "Managers can manage worker ticket actions"
on public.worker_ticket_actions for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);
