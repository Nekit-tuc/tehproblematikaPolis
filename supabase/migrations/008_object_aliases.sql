alter table public.objects
  add column if not exists aliases text[] not null default '{}';

create index if not exists objects_aliases_gin_idx on public.objects using gin (aliases);
