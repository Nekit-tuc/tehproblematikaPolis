alter type public.object_type add value if not exists 'other';

alter table public.objects
  add column if not exists object_number text,
  add column if not exists district text;

update public.objects
set object_number = coalesce(object_number, id::text)
where object_number is null;

alter table public.objects
  alter column object_number set not null;

create unique index if not exists objects_object_number_unique_idx on public.objects(object_number);
create index if not exists objects_object_number_idx on public.objects(object_number);

drop policy if exists "authenticated objects read" on public.objects;
drop policy if exists "managers manage objects" on public.objects;

create policy "objects read for operations roles"
on public.objects
for select
to authenticated
using (public.current_role() in ('admin','management','tech_manager'));

create policy "admins manage objects"
on public.objects
for all
to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');
