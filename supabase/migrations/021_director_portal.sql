alter type public.user_role add value if not exists 'store_director';

create table if not exists public.director_objects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  object_id uuid not null references public.objects(id) on delete cascade,
  phone text null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint director_objects_profile_object_unique unique (profile_id, object_id)
);

create index if not exists director_objects_profile_id_idx on public.director_objects(profile_id);
create index if not exists director_objects_object_id_idx on public.director_objects(object_id);

alter table public.director_objects enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'director_objects' and policyname = 'director objects read own') then
    create policy "director objects read own"
    on public.director_objects
    for select
    to authenticated
    using (profile_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'director_objects' and policyname = 'operations manage director objects') then
    create policy "operations manage director objects"
    on public.director_objects
    for all
    to authenticated
    using (public.current_role() in ('admin','management','tech_manager'))
    with check (public.current_role() in ('admin','management','tech_manager'));
  end if;
end $$;

alter table public.tickets
  add column if not exists created_by_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists director_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists director_phone text null,
  add column if not exists confirmed_by_profile_id uuid null references public.profiles(id) on delete set null;

create index if not exists tickets_director_profile_id_idx on public.tickets(director_profile_id);
create index if not exists tickets_created_by_profile_id_idx on public.tickets(created_by_profile_id);
create index if not exists tickets_confirmed_by_profile_id_idx on public.tickets(confirmed_by_profile_id);
create index if not exists tickets_director_source_status_idx on public.tickets(source, status) where source = 'director_portal';

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'objects' and policyname = 'store directors read assigned objects') then
    create policy "store directors read assigned objects"
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
      )
    );
  end if;
end $$;

drop policy if exists "authenticated tickets read" on public.tickets;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tickets' and policyname = 'tickets read by role scope') then
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
        )
      )
    );
  end if;
end $$;
