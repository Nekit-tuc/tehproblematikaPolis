create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  telegram_username text,
  telegram_id text unique,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_categories (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(worker_id, category_id)
);

do $$
begin
  alter type public.ticket_status add value if not exists 'assigned';
exception
  when undefined_object then null;
end $$;

do $$
begin
  alter type public.ticket_status add value if not exists 'waiting_admin_confirmation';
exception
  when undefined_object then null;
end $$;

alter table public.tickets
  add column if not exists assignee_worker_id uuid references public.workers(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists sent_to_worker_at timestamptz,
  add column if not exists worker_completed_at timestamptz,
  add column if not exists admin_confirmed_at timestamptz,
  add column if not exists admin_rating integer,
  add column if not exists admin_feedback text;

alter table public.tickets
  drop constraint if exists tickets_admin_rating_range;

alter table public.tickets
  add constraint tickets_admin_rating_range check (admin_rating is null or admin_rating between 1 and 5);

create index if not exists workers_is_active_idx on public.workers(is_active);
create index if not exists worker_categories_worker_id_idx on public.worker_categories(worker_id);
create index if not exists worker_categories_category_id_idx on public.worker_categories(category_id);
create index if not exists tickets_assignee_worker_id_idx on public.tickets(assignee_worker_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_workers_updated_at on public.workers;
create trigger set_workers_updated_at
before update on public.workers
for each row execute function public.set_updated_at();

alter table public.workers enable row level security;
alter table public.worker_categories enable row level security;

drop policy if exists "Authenticated users can view workers" on public.workers;
create policy "Authenticated users can view workers"
on public.workers for select
to authenticated
using (true);

drop policy if exists "Managers can manage workers" on public.workers;
create policy "Managers can manage workers"
on public.workers for all
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

drop policy if exists "Authenticated users can view worker categories" on public.worker_categories;
create policy "Authenticated users can view worker categories"
on public.worker_categories for select
to authenticated
using (true);

drop policy if exists "Managers can manage worker categories" on public.worker_categories;
create policy "Managers can manage worker categories"
on public.worker_categories for all
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
