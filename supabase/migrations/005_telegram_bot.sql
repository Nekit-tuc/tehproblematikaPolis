alter table public.profiles
  add column if not exists telegram_id text unique,
  add column if not exists telegram_username text,
  add column if not exists default_object_id uuid;

alter table public.profiles
  drop constraint if exists profiles_default_object_id_fkey;

alter table public.profiles
  add constraint profiles_default_object_id_fkey
  foreign key (default_object_id) references public.objects(id);

create table if not exists public.telegram_sessions (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null unique,
  step text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_telegram_id_idx on public.profiles(telegram_id);
create index if not exists profiles_default_object_id_idx on public.profiles(default_object_id);
create index if not exists telegram_sessions_telegram_id_idx on public.telegram_sessions(telegram_id);

alter table public.telegram_sessions enable row level security;

create or replace function public.current_object_id()
returns uuid
language sql
stable
as $$
  select object_id from public.profiles where id = auth.uid()
$$;

drop policy if exists "admins manage telegram sessions" on public.telegram_sessions;
create policy "admins manage telegram sessions"
on public.telegram_sessions
for all
to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

drop policy if exists "permitted users update tickets" on public.tickets;
create policy "permitted users update tickets"
on public.tickets
for update
to authenticated
using (
  public.current_role() in ('admin','management','tech_manager')
  or (public.current_role() = 'worker' and assigned_to = auth.uid())
  or (public.current_role() = 'store_manager' and (object_id = public.current_object_id() or created_by = auth.uid()))
)
with check (
  public.current_role() in ('admin','management','tech_manager')
  or (public.current_role() = 'worker' and assigned_to = auth.uid())
  or (public.current_role() = 'store_manager' and (object_id = public.current_object_id() or created_by = auth.uid()))
);

insert into public.categories (name, description, is_active)
values
  ('Сантехніка', 'Роботи з водопостачанням, каналізацією та сантехнічним обладнанням.', true),
  ('Електрика', 'Електроживлення, освітлення, автомати, розетки та електромережі.', true),
  ('Будівельні роботи', 'Ремонтні, монтажні та загальнобудівельні роботи.', true),
  ('Роботи студентів', 'Допоміжні роботи, які виконують студентські бригади.', true),
  ('Холодильне обладнання', 'Холодильники, морозильні камери, вітрини та холодильні системи.', true),
  ('Кондиціонування та вентиляція', 'Кондиціонери, вентиляція, витяжки та кліматичні системи.', true),
  ('Торгове обладнання', 'Стелажі, вітрини, ваги, кошики та інше торгове обладнання.', true),
  ('Каси та POS-обладнання', 'Каси, POS-термінали, сканери, принтери чеків та фіскальне обладнання.', true),
  ('Комп''ютери та мережа', 'Комп''ютери, ноутбуки, локальна мережа, Wi-Fi та периферія.', true),
  ('Інтернет та зв''язок', 'Інтернет-підключення, телефонія, мобільний та резервний зв''язок.', true),
  ('Меблі', 'Офісні, торгові та складські меблі.', true),
  ('Вивіски та реклама', 'Вивіски, банери, навігація та рекламні конструкції.', true),
  ('Прибирання', 'Прибирання приміщень, санітарний стан та клінінг.', true),
  ('Благоустрій території', 'Двір, парковка, фасад, прилегла територія та зовнішні роботи.', true),
  ('Інше', 'Заявки, які не підпадають під інші категорії.', true)
on conflict (name) do update
set
  description = excluded.description,
  is_active = true;
