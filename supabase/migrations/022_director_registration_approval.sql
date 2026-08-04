-- Director registration approval support.
-- 021_director_portal.sql creates the base store_director role, director_objects,
-- director ticket fields and initial RLS policies. This migration only adds
-- approval workflow fields, pending links and director object requests.

alter table public.profiles
  add column if not exists phone text null,
  add column if not exists approval_status text not null default 'approved',
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_approval_status_check') then
    alter table public.profiles
      add constraint profiles_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_approval_status_idx on public.profiles(approval_status);
create index if not exists profiles_phone_idx on public.profiles(phone);
create index if not exists profiles_role_approval_status_idx on public.profiles(role, approval_status);

alter table public.director_objects
  add column if not exists approval_status text not null default 'approved',
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null,
  add column if not exists note text null,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'director_objects_approval_status_check') then
    alter table public.director_objects
      add constraint director_objects_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists director_objects_profile_approval_idx on public.director_objects(profile_id, approval_status);
create index if not exists director_objects_object_approval_idx on public.director_objects(object_id, approval_status);
create index if not exists director_objects_approval_status_idx on public.director_objects(approval_status);

create table if not exists public.director_object_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_address text not null,
  status text not null default 'pending',
  resolved_object_id uuid null references public.objects(id) on delete set null,
  admin_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz null,
  approved_by_profile_id uuid null references public.profiles(id) on delete set null,
  rejected_at timestamptz null,
  rejection_reason text null,
  constraint director_object_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists director_object_requests_profile_id_idx on public.director_object_requests(profile_id);
create index if not exists director_object_requests_status_idx on public.director_object_requests(status);
create index if not exists director_object_requests_resolved_object_id_idx on public.director_object_requests(resolved_object_id);
create index if not exists director_object_requests_created_at_idx on public.director_object_requests(created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_director_objects_updated_at on public.director_objects;
create trigger set_director_objects_updated_at
before update on public.director_objects
for each row execute function public.set_updated_at();

drop trigger if exists set_director_object_requests_updated_at on public.director_object_requests;
create trigger set_director_object_requests_updated_at
before update on public.director_object_requests
for each row execute function public.set_updated_at();

alter table public.director_objects enable row level security;
alter table public.director_object_requests enable row level security;

drop policy if exists "director objects read own" on public.director_objects;
create policy "director objects read own"
on public.director_objects
for select
to authenticated
using (
  profile_id = auth.uid()
  and public.current_role()::text = 'store_director'
);

drop policy if exists "operations manage director objects" on public.director_objects;
create policy "operations manage director objects"
on public.director_objects
for all
to authenticated
using (public.current_role() in ('admin','management','tech_manager'))
with check (public.current_role() in ('admin','management','tech_manager'));

drop policy if exists "director object requests read own" on public.director_object_requests;
create policy "director object requests read own"
on public.director_object_requests
for select
to authenticated
using (
  profile_id = auth.uid()
  and public.current_role()::text = 'store_director'
);

drop policy if exists "director object requests insert own" on public.director_object_requests;
create policy "director object requests insert own"
on public.director_object_requests
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and public.current_role()::text = 'store_director'
  and status = 'pending'
);

drop policy if exists "operations manage director object requests" on public.director_object_requests;
create policy "operations manage director object requests"
on public.director_object_requests
for all
to authenticated
using (public.current_role() in ('admin','management','tech_manager'))
with check (public.current_role() in ('admin','management','tech_manager'));

drop policy if exists "store directors read assigned objects" on public.objects;
drop policy if exists "store directors read approved objects" on public.objects;
create policy "store directors read approved objects"
on public.objects
for select
to authenticated
using (
  public.current_role()::text = 'store_director'
  and exists (
    select 1
    from public.director_objects director_object
    where director_object.profile_id = auth.uid()
      and director_object.object_id = objects.id
      and director_object.approval_status = 'approved'
  )
);

drop policy if exists "tickets read by role scope" on public.tickets;
create policy "tickets read by role scope"
on public.tickets
for select
to authenticated
using (
  public.current_role() in ('admin','management','tech_manager')
  or (public.current_role() = 'worker' and assigned_to = auth.uid())
  or (public.current_role() = 'store_manager' and (object_id = public.current_object_id() or created_by = auth.uid()))
  or (
    public.current_role()::text = 'store_director'
    and exists (
      select 1
      from public.director_objects director_object
      where director_object.profile_id = auth.uid()
        and director_object.object_id = tickets.object_id
        and director_object.approval_status = 'approved'
    )
  )
);

drop policy if exists "operations read director profiles" on public.profiles;
create policy "operations read director profiles"
on public.profiles
for select
to authenticated
using (public.current_role() in ('admin','management','tech_manager'));