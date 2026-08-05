# Mobile Stage 1 Audit

## Поточна архітектура

`mobile` - Android-first Expo/React Native MVP. Застосунок працює напряму з Supabase через public anon key і authenticated user session. Next.js server actions, privileged server keys і web-only imports у mobile не використовуються.

## Auth

Директор входить через телефон і пароль. Телефон нормалізується до цифр, після чого формується internal email:

`director-<normalizedPhone>@polissya.local`

Пароль передається тільки в Supabase Auth. У власних mobile/web таблицях пароль не зберігається.

## Читання заявок

Mobile читає profile поточного користувача, перевіряє `role = store_director`, `approval_status = approved` і `is_active`. Після цього читає тільки approved `director_objects`, а заявки фільтрує по:

- `source = director_portal`
- `object_id in approved director_objects`

Для статусу "У плані" і badge акту використовується batch-запит по `work_plan_items` та `work_completion_acts` для поточного набору ticket ids.

## Створення заявки

`createDirectorTicket` у `mobile/src/lib/director-api.ts` тепер вирівняний з web action:

- перевіряє `object_id` через approved `director_objects`;
- перевіряє active `category_id`;
- створює `number`;
- пише `title`, `description`, `status = pending_review`, `priority = medium`;
- пише `object_id`, `category_id`;
- пише `created_by`, `created_by_profile_id`, `director_profile_id`;
- пише `director_phone` з форми, `director_objects.phone` або `profiles.phone`;
- пише `source = director_portal`;
- залишає `assigned_to` і `assignee_worker_id` порожніми.

## Ticket number

Основний шлях - DB function `public.next_ticket_number()`, яка має grant для `authenticated`. Якщо RPC недоступна, mobile використовує fallback `PSD-YYYY-0001` через читання останніх номерів. Insert має retry до 3 разів при duplicate key.

Для production краще винести створення заявки в Next.js API layer або DB RPC, щоб генерація номера, перевірки і history були атомарними на сервері.

## Ticket history

Після успішного insert створюється `ticket_history`:

- `actor_id = profile.id`
- `action = "Директор створив заявку з мобільного застосунку"`
- `metadata.source = director_portal`
- `metadata.status = pending_review`
- `metadata.mobile = true`

Якщо history insert падає, mobile повертає помилку.

## RLS умови

Потрібні умови для direct Supabase mobile flow:

- `profiles`: authenticated user може прочитати свій profile;
- `director_objects`: store_director читає тільки свої links;
- `objects`: store_director читає тільки objects з approved links;
- `tickets`: store_director читає тільки tickets своїх approved objects;
- `tickets insert`: має дозволяти створення директорської заявки тільки від поточного user;
- `ticket_history insert`: `actor_id = auth.uid()`;
- `work_completion_acts`: store_director читає тільки акти своїх approved objects.

Поточна база дозволяє insert у `tickets` через `created_by = auth.uid()`. Це достатньо для MVP, але не ідеально для production, бо RLS insert-policy не звужує `object_id` до approved director_objects.

## Direct Supabase vs API layer

Direct Supabase підходить для Android MVP і швидкої перевірки UX. Для production краще створити Next.js mobile API endpoint або Supabase RPC:

- один server-side entrypoint для create ticket;
- атомарний ticket number + insert + history;
- server-side object/category/profile checks;
- контрольовані помилки;
- менше ризиків від reverse engineering mobile bundle.

## Ризики

- Fallback генерація номера не є повністю race-safe, хоча retry зменшує ризик.
- `tickets` insert RLS варто посилити або замінити create flow на API/RPC.
- Session storage зараз через AsyncStorage, як у Supabase RN quick start. Для production можна перейти на SecureStore adapter.
- Немає offline queue, фото upload, push notifications і native build профілів.

## Наступний етап

- Android тест через Expo Go з реальним Supabase env.
- Фото upload для заявки.
- Push notifications для зміни статусів.
- Next.js mobile API або Supabase RPC для create ticket.
- Android APK/AAB через EAS Build.
- Worker mobile flow.
- iPhone UI polish і iOS build.
