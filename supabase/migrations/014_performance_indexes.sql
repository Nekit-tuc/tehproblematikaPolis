-- Performance indexes for Service Desk AI hot paths.
-- Safe to run repeatedly: every index uses IF NOT EXISTS.

create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_category_id_idx on public.tickets (category_id);
create index if not exists tickets_object_id_idx on public.tickets (object_id);
create index if not exists tickets_assignee_worker_id_idx on public.tickets (assignee_worker_id);
create index if not exists tickets_created_at_idx on public.tickets (created_at desc);
create index if not exists tickets_priority_idx on public.tickets (priority);
create index if not exists tickets_source_idx on public.tickets (source);
create index if not exists tickets_status_created_at_idx on public.tickets (status, created_at desc);
create index if not exists tickets_assignee_worker_status_idx on public.tickets (assignee_worker_id, status);
create index if not exists tickets_object_created_at_idx on public.tickets (object_id, created_at desc);
create index if not exists tickets_telegram_source_group_id_idx on public.tickets (telegram_source_group_id);

create index if not exists ticket_history_ticket_id_idx on public.ticket_history (ticket_id);
create index if not exists ticket_history_created_at_idx on public.ticket_history (created_at desc);
create index if not exists ticket_history_ticket_created_at_idx on public.ticket_history (ticket_id, created_at desc);

create index if not exists ticket_comments_ticket_id_idx on public.ticket_comments (ticket_id);
create index if not exists ticket_photos_ticket_id_idx on public.ticket_photos (ticket_id);

create index if not exists worker_ticket_actions_token_idx on public.worker_ticket_actions (token);
create index if not exists worker_ticket_actions_ticket_id_idx on public.worker_ticket_actions (ticket_id);
create index if not exists worker_ticket_actions_worker_id_idx on public.worker_ticket_actions (worker_id);
create index if not exists worker_ticket_actions_used_at_idx on public.worker_ticket_actions (used_at);
create index if not exists worker_ticket_actions_expires_at_idx on public.worker_ticket_actions (expires_at);

create index if not exists workers_is_active_idx on public.workers (is_active);
create index if not exists workers_telegram_id_idx on public.workers (telegram_id);
create index if not exists workers_telegram_username_idx on public.workers (telegram_username);

create index if not exists worker_categories_worker_id_idx on public.worker_categories (worker_id);
create index if not exists worker_categories_category_id_idx on public.worker_categories (category_id);

create index if not exists categories_is_active_idx on public.categories (is_active);
create index if not exists categories_name_idx on public.categories (name);

create index if not exists objects_is_active_idx on public.objects (is_active);
create index if not exists objects_name_idx on public.objects (name);
create index if not exists objects_address_idx on public.objects (address);
