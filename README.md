# Polissya Service Desk

MVP внутрішньої системи керування технічними заявками для магазинів, складів, виробництва та офісу.

## Стек

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style локальні компоненти
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Excel-експорт через `xlsx`

## Сторінки

- `/login`
- `/dashboard`
- `/tickets`
- `/tickets/new`
- `/tickets/[id]`
- `/objects`
- `/users`
- `/reports`
- `/settings`

## Запуск

```bash
npm install
copy .env.example .env.local
npm run dev
```

PowerShell на Windows може блокувати `npm.ps1`. У такому випадку використовуйте:

```bash
npm.cmd install
npm.cmd run dev
```

## Підключення Supabase

1. Створіть Supabase project.
2. У Supabase Dashboard відкрийте `Project Settings -> API`.
3. Заповніть `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

4. Виконайте SQL з `supabase/migrations/001_initial_schema.sql` у SQL Editor або через Supabase CLI.
5. Створіть користувачів у Supabase Auth для ролей MVP.
6. У таблиці `profiles` мають бути рядки з `id`, які збігаються з `auth.users.id`.
7. Після створення Auth-користувачів адаптуйте UUID у `supabase/seed/001_seed.sql` або вставте свої seed-дані.

Якщо `.env.local` не заповнений або credentials неправильні, protected routes перенаправляють на `/login`, а сторінка входу показує зрозумілу помилку. Demo/fallback авторизації немає.

## Supabase Storage для фото

Міграція створює приватний bucket `ticket-photos`. Якщо створюєте вручну:

1. Відкрийте `Storage -> Buckets`.
2. Створіть bucket з назвою `ticket-photos`.
3. Вимкніть `Public bucket`.
4. У SQL Editor додайте policies:

```sql
insert into storage.buckets (id, name, public)
values ('ticket-photos', 'ticket-photos', false)
on conflict (id) do nothing;

create policy "ticket photos authenticated read"
on storage.objects
for select
to authenticated
using (bucket_id = 'ticket-photos');

create policy "ticket photos authenticated upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'ticket-photos');

create policy "ticket photos authenticated update"
on storage.objects
for update
to authenticated
using (bucket_id = 'ticket-photos')
with check (bucket_id = 'ticket-photos');
```

Файли зберігаються за шляхом:

```text
{ticket_id}/{photo_type}/{timestamp}-{index}-{uuid}.{ext}
```

Обмеження в застосунку:

- максимум 5 фото за одне завантаження;
- формати: jpg, jpeg, png, webp;
- максимум 8 MB на одне фото.

Типи фото:

- `before` - ДО;
- `progress` - В процесі;
- `after` - ПІСЛЯ.

## Перший користувач

1. У Supabase Dashboard відкрийте `Authentication -> Users`.
2. Створіть користувача з email/password, наприклад `admin@polissya.local`.
3. Скопіюйте UUID створеного користувача.
4. Додайте profile для цього UUID:

```sql
insert into public.profiles (id, full_name, email, role, is_active)
values (
  'AUTH_USER_UUID_HERE',
  'Олена Коваль',
  'admin@polissya.local',
  'admin',
  true
);
```

5. Увійдіть на `/login` через email/password.

Перевірити роль поточного користувача можна SQL-запитом:

```sql
select id, full_name, email, role, object_id, is_active
from public.profiles
where email = 'admin@polissya.local';
```

Для `store_manager` заповніть `object_id`, щоб система знала, заявки якого об'єкта він бачить:

```sql
update public.profiles
set object_id = 'OBJECT_UUID_HERE'
where email = 'store@polissya.local';
```

## Права доступу

- `admin`: повний доступ.
- `management`: dashboard, всі заявки, reports, users; без settings.
- `tech_manager`: всі заявки, створення заявок, призначення виконавців, зміна статусів, reports.
- `worker`: тільки призначені йому заявки.
- `store_manager`: тільки заявки свого `object_id`, створення заявок для свого об'єкта.

## Довідник Об'єктів

Сторінка `/objects` доступна ролям:

- `admin`: перегляд, створення, редагування, активація/деактивація;
- `management`: тільки перегляд;
- `tech_manager`: тільки перегляд.

Ролі `worker` і `store_manager` не мають доступу до `/objects`.

Обов'язкові поля об'єкта:

- назва;
- тип об'єкта;
- номер об'єкта / номер магазину;
- місто;
- адреса.

Додаткові поля:

- район;
- відповідальний керуючий;
- активний / неактивний.

Типи об'єктів:

- магазин;
- склад;
- виробництво;
- офіс;
- інше.

Об'єкти не видаляються фізично з бази. Для вимкнення використовується `is_active = false`.

Для існуючої бази після попередніх задач виконайте міграцію:

```sql
supabase/migrations/002_objects_directory_fields.sql
```

## Excel-аналітика

Сторінка `/reports` доступна ролям `admin`, `management`, `tech_manager`.

Доступні фільтри:

- період `від / до`;
- статус;
- категорія;
- об'єкт;
- виконавець;
- пріоритет.

Кнопка `Експорт Excel` формує файл `polissya-service-desk-report.xlsx` з листами:

- `Заявки`;
- `По об'єктах`;
- `По виконавцях`;
- `По категоріях`.

У файлі українські назви колонок, українські статуси/пріоритети, ширини колонок і формат дат `dd.mm.yyyy`.

## Схема БД

Міграція створює:

- `profiles`
- `objects`
- `categories`
- `tickets`
- `ticket_photos`
- `ticket_comments`
- `ticket_history`

Є enum-и:

- `user_role`: `admin`, `management`, `tech_manager`, `worker`, `store_manager`
- `object_type`: `store`, `warehouse`, `production`, `office`
- `ticket_status`: `new`, `in_progress`, `waiting`, `done`, `cancelled`
- `ticket_priority`: `low`, `medium`, `high`, `critical`
- `photo_type`: `before`, `after`

Основні foreign keys:

- `objects.manager_id -> profiles.id`
- `tickets.object_id -> objects.id`
- `tickets.category_id -> categories.id`
- `tickets.created_by -> profiles.id`
- `tickets.assigned_to -> profiles.id`
- `ticket_comments.ticket_id -> tickets.id`
- `ticket_comments.author_id -> profiles.id`
- `ticket_photos.ticket_id -> tickets.id`
- `ticket_photos.uploaded_by -> profiles.id`
- `ticket_history.ticket_id -> tickets.id`
- `ticket_history.actor_id -> profiles.id`

## Архітектура

- `app/` - маршрути та сторінки
- `app/(app)/tickets/new/actions.ts` - server action створення заявки
- `components/ui/` - базові UI-компоненти
- `components/layout/` - sidebar/topbar
- `lib/auth/` - auth helpers і role permissions
- `lib/supabase/` - browser/server/admin clients, env guard, queries
- `lib/reports/` - Excel helpers
- `types/` - доменні типи
- `supabase/` - SQL migration і seed

## Telegram Bot

Telegram-бот дозволяє магазину створити заявку без входу на сайт. Заявка зберігається в Supabase, з'являється на сайті, а admin/management отримують Telegram-повідомлення.

### Створення бота

1. Відкрийте Telegram і знайдіть `@BotFather`.
2. Виконайте `/newbot`.
3. Задайте назву та username бота.
4. Скопіюйте bot token.

### Env

Додайте в `.env.local`:

```env
TELEGRAM_BOT_TOKEN=123456:telegram-token
TELEGRAM_WEBHOOK_SECRET=long-random-secret
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

`SUPABASE_SERVICE_ROLE_KEY` також має бути заповнений, бо webhook працює server-side і створює заявки через service role.

### SQL

Виконайте міграцію:

```text
supabase/migrations/005_telegram_bot.sql
```

Вона додає `profiles.telegram_id`, `profiles.telegram_username`, `profiles.default_object_id`, таблицю `telegram_sessions`, seed категорій і policy для підтвердження заявок ролями `admin`, `management`, `tech_manager`.

### Webhook

Для production-домену:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://your-domain.com/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\"}"
```

Для локальної розробки потрібен публічний HTTPS tunnel, наприклад:

```bash
ngrok http 3000
```

Після цього використайте ngrok HTTPS URL у `setWebhook`.

### Прив'язка Telegram ID

```sql
update public.profiles
set
  telegram_id = '123456789',
  telegram_username = 'telegram_username',
  default_object_id = coalesce(default_object_id, object_id)
where email = 'store@polissya.local';
```

Для admin/management також заповніть `telegram_id`, щоб вони отримували повідомлення про нові заявки:

```sql
update public.profiles
set telegram_id = '987654321'
where email = 'admin@polissya.local';
```

### Сценарій

1. `/start`
2. Кнопка `Створити заявку`
3. Автоматичний вибір об'єкта з `default_object_id` або `object_id`, або вибір зі списку
4. Вибір активної категорії
5. Опис проблеми
6. 0-5 фото
7. Підтвердження
8. Заявка створюється зі статусом `new`
9. Admin/management отримують повідомлення з посиланням на заявку
10. На сайті admin/management/tech_manager натискає `Підтвердити і запустити в роботу`, статус стає `in_progress`
