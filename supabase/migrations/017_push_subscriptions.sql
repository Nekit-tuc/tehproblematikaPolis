create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  device_label text null,
  is_active boolean not null default true,
  last_success_at timestamptz null,
  last_error_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_is_active_idx on public.push_subscriptions(is_active);
create index if not exists push_subscriptions_endpoint_idx on public.push_subscriptions(endpoint);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions own read" on public.push_subscriptions;
create policy "push subscriptions own read"
on public.push_subscriptions
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_role() in ('admin','management','tech_manager')
);

drop policy if exists "push subscriptions own insert" on public.push_subscriptions;
create policy "push subscriptions own insert"
on public.push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "push subscriptions own update" on public.push_subscriptions;
create policy "push subscriptions own update"
on public.push_subscriptions
for update
to authenticated
using (
  user_id = auth.uid()
  or public.current_role() in ('admin','management','tech_manager')
)
with check (
  user_id = auth.uid()
  or public.current_role() in ('admin','management','tech_manager')
);

drop policy if exists "push subscriptions own delete" on public.push_subscriptions;
create policy "push subscriptions own delete"
on public.push_subscriptions
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.current_role() in ('admin','management','tech_manager')
);
