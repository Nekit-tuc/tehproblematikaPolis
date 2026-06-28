alter type public.ticket_status add value if not exists 'pending_review';
alter type public.ticket_status add value if not exists 'rejected';

alter table public.tickets
  add column if not exists source text,
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_message_id text,
  add column if not exists telegram_user_id text,
  add column if not exists telegram_user_name text,
  add column if not exists original_message_text text,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_raw_result jsonb,
  add column if not exists recommended_department text;

create index if not exists tickets_source_idx on public.tickets(source);
create index if not exists tickets_telegram_chat_id_idx on public.tickets(telegram_chat_id);
create index if not exists tickets_telegram_message_id_idx on public.tickets(telegram_message_id);
create index if not exists tickets_ai_confidence_idx on public.tickets(ai_confidence);

drop policy if exists "tech team update tickets" on public.tickets;
create policy "tech team update tickets" on public.tickets
for update to authenticated
using (public.current_role() in ('admin','management','tech_manager','worker'))
with check (public.current_role() in ('admin','management','tech_manager','worker'));
