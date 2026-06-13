create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'management', 'tech_manager', 'worker', 'store_manager');
create type public.object_type as enum ('store', 'warehouse', 'production', 'office', 'other');
create type public.ticket_status as enum ('new', 'in_progress', 'waiting', 'done', 'cancelled');
create type public.ticket_priority as enum ('low', 'medium', 'high', 'critical');
create type public.photo_type as enum ('before', 'progress', 'after');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'worker',
  object_id uuid,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.object_type not null,
  object_number text not null unique,
  city text not null,
  district text,
  address text not null,
  manager_id uuid constraint objects_manager_id_fkey references public.profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_object_id_fkey foreign key (object_id) references public.objects(id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  title text not null,
  description text not null,
  status public.ticket_status not null default 'new',
  priority public.ticket_priority not null default 'medium',
  object_id uuid not null constraint tickets_object_id_fkey references public.objects(id),
  category_id uuid not null constraint tickets_category_id_fkey references public.categories(id),
  created_by uuid not null constraint tickets_created_by_fkey references public.profiles(id),
  assigned_to uuid constraint tickets_assigned_to_fkey references public.profiles(id),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null constraint ticket_comments_ticket_id_fkey references public.tickets(id) on delete cascade,
  author_id uuid not null constraint ticket_comments_author_id_fkey references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.ticket_photos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null constraint ticket_photos_ticket_id_fkey references public.tickets(id) on delete cascade,
  uploaded_by uuid not null constraint ticket_photos_uploaded_by_fkey references public.profiles(id),
  type public.photo_type not null,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table public.ticket_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null constraint ticket_history_ticket_id_fkey references public.tickets(id) on delete cascade,
  actor_id uuid constraint ticket_history_actor_id_fkey references public.profiles(id),
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index objects_manager_id_idx on public.objects(manager_id);
create index objects_object_number_idx on public.objects(object_number);
create index profiles_object_id_idx on public.profiles(object_id);
create index categories_active_idx on public.categories(is_active);
create index tickets_status_idx on public.tickets(status);
create index tickets_object_id_idx on public.tickets(object_id);
create index tickets_category_id_idx on public.tickets(category_id);
create index tickets_assigned_to_idx on public.tickets(assigned_to);
create index ticket_comments_ticket_id_idx on public.ticket_comments(ticket_id);
create index ticket_photos_ticket_id_idx on public.ticket_photos(ticket_id);
create index ticket_history_ticket_id_idx on public.ticket_history(ticket_id);

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.categories enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_photos enable row level security;
alter table public.ticket_history enable row level security;

create or replace function public.current_role()
returns public.user_role
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create policy "authenticated profiles read" on public.profiles for select to authenticated using (true);
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "objects read for operations roles" on public.objects for select to authenticated using (public.current_role() in ('admin','management','tech_manager'));
create policy "admins manage objects" on public.objects for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "authenticated categories read" on public.categories for select to authenticated using (true);
create policy "managers manage categories" on public.categories for all to authenticated using (public.current_role() in ('admin','management','tech_manager')) with check (public.current_role() in ('admin','management','tech_manager'));

create policy "authenticated tickets read" on public.tickets for select to authenticated using (true);
create policy "team create tickets" on public.tickets for insert to authenticated with check (created_by = auth.uid());
create policy "tech team update tickets" on public.tickets for update to authenticated using (public.current_role() in ('admin','tech_manager','worker')) with check (public.current_role() in ('admin','tech_manager','worker'));

create policy "comments read" on public.ticket_comments for select to authenticated using (true);
create policy "comments create" on public.ticket_comments for insert to authenticated with check (author_id = auth.uid());

create policy "photos read" on public.ticket_photos for select to authenticated using (true);
create policy "photos create" on public.ticket_photos for insert to authenticated with check (uploaded_by = auth.uid());

create policy "history read" on public.ticket_history for select to authenticated using (true);
create policy "history insert" on public.ticket_history for insert to authenticated with check (actor_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('ticket-photos', 'ticket-photos', false)
on conflict (id) do nothing;

create policy "ticket photos authenticated read" on storage.objects for select to authenticated using (bucket_id = 'ticket-photos');
create policy "ticket photos authenticated upload" on storage.objects for insert to authenticated with check (bucket_id = 'ticket-photos');
create policy "ticket photos authenticated update" on storage.objects for update to authenticated using (bucket_id = 'ticket-photos') with check (bucket_id = 'ticket-photos');
