alter table public.tickets
  add column if not exists repeat_count integer not null default 0,
  add column if not exists last_repeat_at timestamptz null;

create index if not exists tickets_last_repeat_at_idx on public.tickets(last_repeat_at desc);

create table if not exists public.ticket_repeats (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  source_message_id text null,
  source_chat_id text null,
  raw_text text not null,
  normalized_text text null,
  detected_by text not null default 'rule',
  confidence numeric null,
  created_by_name text null,
  created_at timestamptz not null default now()
);

create index if not exists ticket_repeats_ticket_id_idx on public.ticket_repeats(ticket_id);
create index if not exists ticket_repeats_created_at_idx on public.ticket_repeats(created_at desc);
create index if not exists ticket_repeats_source_message_idx
  on public.ticket_repeats(source_chat_id, source_message_id)
  where source_message_id is not null;

alter table public.ticket_repeats enable row level security;

drop policy if exists "Managers can view ticket repeats" on public.ticket_repeats;
create policy "Managers can view ticket repeats"
on public.ticket_repeats
for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_active = true
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Service role can manage ticket repeats" on public.ticket_repeats;
create policy "Service role can manage ticket repeats"
on public.ticket_repeats
for all
to service_role
using (true)
with check (true);
