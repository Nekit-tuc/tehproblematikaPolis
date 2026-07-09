create table if not exists public.work_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'partially_done', 'done', 'cancelled')),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz null,
  notes text null
);

create table if not exists public.work_plan_items (
  id uuid primary key default gen_random_uuid(),
  work_plan_id uuid not null references public.work_plans(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  worker_id uuid null references public.workers(id) on delete set null,
  category text null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (work_plan_id, ticket_id)
);

create table if not exists public.work_plan_dispatches (
  id uuid primary key default gen_random_uuid(),
  work_plan_id uuid not null references public.work_plans(id) on delete cascade,
  worker_id uuid null references public.workers(id) on delete set null,
  telegram_chat_id text null,
  sent_at timestamptz not null default now(),
  status text not null default 'sent',
  message_id text null,
  error text null
);

create index if not exists work_plans_status_idx on public.work_plans (status);
create index if not exists work_plans_period_start_idx on public.work_plans (period_start);
create index if not exists work_plans_period_end_idx on public.work_plans (period_end);
create index if not exists work_plan_items_work_plan_id_idx on public.work_plan_items (work_plan_id);
create index if not exists work_plan_items_ticket_id_idx on public.work_plan_items (ticket_id);
create index if not exists work_plan_items_worker_id_idx on public.work_plan_items (worker_id);
create index if not exists work_plan_dispatches_work_plan_id_idx on public.work_plan_dispatches (work_plan_id);
create index if not exists work_plan_dispatches_worker_id_idx on public.work_plan_dispatches (worker_id);
