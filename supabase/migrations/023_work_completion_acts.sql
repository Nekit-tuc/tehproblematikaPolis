create sequence if not exists public.work_completion_act_number_seq;

create or replace function public.next_work_completion_act_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  seq_value bigint;
  year_text text;
begin
  seq_value := nextval('public.work_completion_act_number_seq');
  year_text := to_char(timezone('Europe/Kyiv', now()), 'YYYY');
  return 'ACT-' || year_text || '-' || lpad(seq_value::text, 6, '0');
end;
$$;

grant execute on function public.next_work_completion_act_number() to authenticated;
grant usage, select on sequence public.work_completion_act_number_seq to authenticated;

create table if not exists public.work_completion_acts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  object_id uuid not null references public.objects(id),
  director_profile_id uuid not null references public.profiles(id),
  worker_id uuid null references public.workers(id),
  act_number text not null unique,
  work_description text not null,
  director_comment text null,
  completed_at timestamptz not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_profile_id uuid null references public.profiles(id),
  constraint work_completion_acts_ticket_unique unique(ticket_id)
);

create table if not exists public.work_completion_act_photos (
  id uuid primary key default gen_random_uuid(),
  act_id uuid not null references public.work_completion_acts(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  storage_path text not null,
  file_name text null,
  content_type text null,
  size_bytes bigint null,
  created_at timestamptz not null default now(),
  uploaded_by_profile_id uuid null references public.profiles(id)
);

create index if not exists work_completion_acts_ticket_id_idx on public.work_completion_acts(ticket_id);
create index if not exists work_completion_acts_object_id_idx on public.work_completion_acts(object_id);
create index if not exists work_completion_acts_director_profile_id_idx on public.work_completion_acts(director_profile_id);
create index if not exists work_completion_acts_worker_id_idx on public.work_completion_acts(worker_id);
create index if not exists work_completion_acts_confirmed_at_idx on public.work_completion_acts(confirmed_at desc);
create index if not exists work_completion_acts_act_number_idx on public.work_completion_acts(act_number);

create index if not exists work_completion_act_photos_act_id_idx on public.work_completion_act_photos(act_id);
create index if not exists work_completion_act_photos_ticket_id_idx on public.work_completion_act_photos(ticket_id);

drop trigger if exists set_work_completion_acts_updated_at on public.work_completion_acts;
create trigger set_work_completion_acts_updated_at
before update on public.work_completion_acts
for each row execute function public.set_updated_at();

alter table public.work_completion_acts enable row level security;
alter table public.work_completion_act_photos enable row level security;

drop policy if exists "operations manage work completion acts" on public.work_completion_acts;
create policy "operations manage work completion acts"
on public.work_completion_acts
for all
to authenticated
using (public.current_role() in ('admin','management','tech_manager'))
with check (public.current_role() in ('admin','management','tech_manager'));

drop policy if exists "store directors read own work completion acts" on public.work_completion_acts;
create policy "store directors read own work completion acts"
on public.work_completion_acts
for select
to authenticated
using (
  public.current_role() = 'store_director'
  and exists (
    select 1
    from public.director_objects director_object
    where director_object.profile_id = auth.uid()
      and director_object.object_id = work_completion_acts.object_id
      and director_object.approval_status = 'approved'
  )
);

drop policy if exists "store directors create own work completion acts" on public.work_completion_acts;
create policy "store directors create own work completion acts"
on public.work_completion_acts
for insert
to authenticated
with check (
  public.current_role() = 'store_director'
  and director_profile_id = auth.uid()
  and created_by_profile_id = auth.uid()
  and exists (
    select 1
    from public.director_objects director_object
    where director_object.profile_id = auth.uid()
      and director_object.object_id = work_completion_acts.object_id
      and director_object.approval_status = 'approved'
  )
  and exists (
    select 1
    from public.tickets ticket
    where ticket.id = work_completion_acts.ticket_id
      and ticket.source = 'director_portal'
      and ticket.status = 'waiting_admin_confirmation'
      and ticket.object_id = work_completion_acts.object_id
  )
);

drop policy if exists "operations manage work completion act photos" on public.work_completion_act_photos;
create policy "operations manage work completion act photos"
on public.work_completion_act_photos
for all
to authenticated
using (public.current_role() in ('admin','management','tech_manager'))
with check (public.current_role() in ('admin','management','tech_manager'));

drop policy if exists "store directors read own work completion act photos" on public.work_completion_act_photos;
create policy "store directors read own work completion act photos"
on public.work_completion_act_photos
for select
to authenticated
using (
  public.current_role() = 'store_director'
  and exists (
    select 1
    from public.work_completion_acts act
    join public.director_objects director_object on director_object.object_id = act.object_id
    where act.id = work_completion_act_photos.act_id
      and director_object.profile_id = auth.uid()
      and director_object.approval_status = 'approved'
  )
);

drop policy if exists "store directors create own work completion act photos" on public.work_completion_act_photos;
create policy "store directors create own work completion act photos"
on public.work_completion_act_photos
for insert
to authenticated
with check (
  public.current_role() = 'store_director'
  and uploaded_by_profile_id = auth.uid()
  and exists (
    select 1
    from public.work_completion_acts act
    where act.id = work_completion_act_photos.act_id
      and act.ticket_id = work_completion_act_photos.ticket_id
      and act.director_profile_id = auth.uid()
  )
);

drop policy if exists "store directors confirm own completed tickets" on public.tickets;
create policy "store directors confirm own completed tickets"
on public.tickets
for update
to authenticated
using (
  public.current_role() = 'store_director'
  and source = 'director_portal'
  and status = 'waiting_admin_confirmation'
  and exists (
    select 1
    from public.director_objects director_object
    where director_object.profile_id = auth.uid()
      and director_object.object_id = tickets.object_id
      and director_object.approval_status = 'approved'
  )
)
with check (
  public.current_role() = 'store_director'
  and source = 'director_portal'
  and status = 'done'
  and exists (
    select 1
    from public.director_objects director_object
    where director_object.profile_id = auth.uid()
      and director_object.object_id = tickets.object_id
      and director_object.approval_status = 'approved'
  )
);
