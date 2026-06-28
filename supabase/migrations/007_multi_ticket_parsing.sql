alter table public.tickets
  add column if not exists telegram_source_group_id text;

create index if not exists tickets_telegram_source_group_id_idx
  on public.tickets(telegram_source_group_id);
