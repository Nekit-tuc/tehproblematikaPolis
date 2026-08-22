# Аудит поточного функціоналу планування робіт

Дата аудиту: 2026-08-09

Гілка на момент перевірки: `main`

Мета документа: зафіксувати, як зараз фактично працюють плани робіт у Service Desk AI, перед зміною бізнес-логіки. У межах аудиту логіку не змінено.

## 1. Короткий висновок

Планування побудоване навколо таблиць `work_plans`, `work_plan_items` і `work_plan_dispatches`. План є контейнером на робочий тиждень, а `work_plan_items` прив'язує заявки до конкретного плану і, за можливості, до виконавця.

У системі є два основних механізми планування:

1. Ручне створення плану через `/work-planning`, коли адмін вибирає заявки і створює план.
2. Автоматичні чернетки планів для наступного робочого тижня через `ensureWeeklyDraftPlansForAutoRouting()`.

Автоматичні чернетки створюються на наступний робочий тиждень. Поточний робочий тиждень визначається helper-ом `lib/date/work-week.ts` як четвер 17:00 -> наступний четвер 17:00, але обчислення зроблене через локальний `Date`, без явного timezone-conversion в коді. Це означає, що фактична timezone залежить від runtime.

Підтвердження заявки через generic action `/tickets/[id]`, директорська confirm-action і `/ai-tickets` проходять через shared confirm/planning service. Telegram group intake створює pending_review заявки; додавання в план має відбуватись після підтвердження.

## 2. Перевірені файли

Основні файли планування:

- `lib/supabase/work-plans.ts`
- `lib/date/work-week.ts`
- `app/(app)/work-planning/page.tsx`
- `app/(app)/work-planning/actions.ts`
- `app/(app)/work-planning/[id]/page.tsx`
- `app/(app)/work-planning/[id]/actions.ts`
- `app/(app)/work-planning/[id]/quick-ticket-actions.ts`
- `app/(app)/work-planning/export/route.ts`
- `app/(app)/work-planning/[id]/export/route.ts`
- `app/api/cron/ensure-weekly-plans/route.ts`

Заявки і підтвердження:

- `app/(app)/tickets/[id]/actions.ts`
- `app/(app)/tickets/[id]/director-actions.ts`
- `app/(app)/tickets/[id]/page.tsx`
- `app/(app)/tickets/page.tsx`
- `app/(app)/tickets/new/actions.ts`
- `app/(app)/director/tickets/new/actions.ts`
- `app/(app)/ai-tickets/actions.ts`

Telegram / AI / виконавці:

- `lib/telegram/group-intake.ts`
- `lib/telegram/work-plan-notifications.ts`
- `lib/telegram/worker-notifications.ts`
- `lib/supabase/workers.ts`
- `lib/supabase/worker-queries.ts`

Запити і звіти:

- `lib/supabase/queries.ts`
- `lib/supabase/weekly-control.ts`

Міграції:

- `supabase/migrations/015_work_planning_center.sql`
- `supabase/migrations/016_fix_work_planning_rls.sql`
- `supabase/migrations/018_weekly_control_periods.sql`
- `supabase/migrations/020_work_week_datetime_boundaries.sql`
- `supabase/migrations/010_workers_module.sql`
- `supabase/migrations/021_director_portal.sql`

## 3. Таблиці планування

### `tickets`

Заявка є основною одиницею роботи. Планування використовує такі поля:

- `id` - primary key заявки.
- `number` - номер заявки, генерується helper-ом `generateTicketNumber()`.
- `source` - джерело: `director_portal`, `telegram_group`, `telegram_private_test`, manual/admin тощо.
- `status` - статус заявки.
- `category_id` - категорія, ключова для маршрутизації в автоплан.
- `assignee_worker_id` - призначений виконавець.
- `object_id` - магазин/об'єкт.
- `director_profile_id` - директор, якщо заявка з директорського порталу.
- `director_phone` - телефон директора.
- `created_by_profile_id` - профіль, який створив заявку, якщо є.
- `admin_confirmed_at` - час підтвердження адміном.
- `confirmed_by_profile_id` - хто підтвердив.
- `created_at`, `updated_at`.

При створенні директорської заявки:

- `source = 'director_portal'`
- `status = 'pending_review'`
- `priority = 'medium'`
- `assignee_worker_id = null`

При створенні manual/admin заявки:

- `status = 'new'`
- заявка не додається в план автоматично.

При створенні Telegram group / private test заявки:

- заявка створюється як `pending_review`.
- додавання в план може виконатися одразу через `autoAddTelegramTicketToWeeklyDraftPlan()`.

### `work_plans`

План робіт на період.

Ключові поля:

- `id`
- `title`
- `period_start`
- `period_end`
- `status`: `draft`, `sent`, `partially_done`, `done`, `cancelled`
- `created_by`
- `created_at`
- `updated_at`
- `sent_at`
- `notes`

Після міграції `020_work_week_datetime_boundaries.sql` поля `period_start` і `period_end` мають тип `timestamptz`.

Важливо: у `work_plans` немає явного `worker_id`. Виконавець визначається через назву автоплану, `work_plan_items.worker_id` і конфіг `autoWorkPlanConfigs`.

### `work_plan_items`

Зв'язка заявки з планом.

Ключові поля:

- `id`
- `work_plan_id`
- `ticket_id`
- `worker_id`
- `category`
- `sort_order`
- `created_at`

Є DB constraint:

```sql
unique (work_plan_id, ticket_id)
```

Це захищає від дубля однієї заявки в одному плані, але не гарантує, що одна заявка не буде в двох різних планах одного тижня.

### `work_plan_dispatches`

Журнал надсилання плану виконавцям у Telegram.

Ключові поля:

- `id`
- `work_plan_id`
- `worker_id`
- `telegram_chat_id`
- `sent_at`
- `status`: фактично використовуються `sent`, `failed`, `skipped_no_telegram`
- `message_id`
- `error`

Створюється helper-ом `sendWorkPlanToWorkers()`.

### `categories`

Категорії використовуються для:

- ручного фільтрування заявок;
- AI/Telegram класифікації;
- recommendation worker через `worker_categories`;
- auto-plan mapping через `autoWorkPlanConfigs`.

Планувальний auto mapping зараз базується на тексті `category.name`, не на `category_id` або `slug`.

### `workers`

Виконавці використовуються для:

- `tickets.assignee_worker_id`;
- `work_plan_items.worker_id`;
- Telegram dispatch.

Ключові поля:

- `id`
- `name`
- `telegram_id`
- `telegram_username`
- `is_active`

Для auto-plan worker lookup використовуються тільки активні workers.

### `ticket_history`

Історія пишеться при:

- створенні заявки;
- підтвердженні заявки;
- відхиленні;
- додаванні в план;
- перенесенні в наступний тиждень;
- зміні статусу/категорії/виконавця;
- Telegram dispatch/worker flow.

Для планування важливі metadata sources:

- `confirmed_ticket_planning`
- `telegram_auto_planning`
- `weekly_carry_over`
- `work_plan_quick_modal`

## 4. Робочий тиждень

### Поточна логіка

Центральний helper: `lib/date/work-week.ts`.

Константи:

```ts
WORK_WEEK_START_DAY = 4
WORK_WEEK_START_HOUR = 17
WORK_WEEK_START_MINUTE = 0
```

Тобто логічний робочий тиждень: четвер 17:00 -> наступний четвер 17:00.

Функції:

- `getWorkWeekRange(date)` - повертає тиждень, у який входить дата.
- `getCurrentWorkWeek(now)` - alias на поточний тиждень.
- `getPreviousWorkWeekRange(date)` - попередній тиждень.
- `getNextWorkWeekRange(date)` - наступний тиждень.
- `formatWorkWeekDateRange(start, end)` - форматування періоду.

### Де використовується

- `/work-planning` для default/current/next week.
- `ensureWeeklyDraftPlansForAutoRouting()` для створення планів на наступний тиждень.
- `createWorkPlanAction()` для нормалізації manual plan period.
- `work-planning/export` для тижневого export.
- dashboard/weekly-control/report helpers.

### Ризик

Helper працює через JS `Date` і `setHours(17,0,0,0)`. У коді не використовується явне перетворення в `Europe/Kyiv`. Якщо runtime працює в UTC, межа тижня може фактично зміститися відносно Kyiv time.

Міграція `020_work_week_datetime_boundaries.sql` приводить DB колонки до `timestamptz` через `at time zone 'Europe/Kyiv'`, але сам runtime-helper timezone-explicit не є.

### Рекомендація

Наступним етапом зробити timezone-explicit helper для `Europe/Kyiv` і використовувати його у всіх місцях створення/пошуку планів.

## 5. Створення планів

### Ручне створення

Route/action: `app/(app)/work-planning/actions.ts`.

Функція: `createWorkPlanAction(formData)`.

Доступ:

- `admin`
- `management`
- `tech_manager`

Flow:

1. Читає `title`, `period_start`, `period_end`, `notes`, `ticketIds`.
2. Нормалізує період через `normalizeWorkPlanPeriod()`.
3. Якщо `period_end` не збігається з helper-ом, використовує helper-івський `endDate`.
4. Перевіряє, чи вибрані заявки вже є в активних планах.
5. Створює `work_plans`.
6. Додає вибрані заявки в `work_plan_items`.
7. Revalidate `/work-planning`.
8. Redirect на `/work-planning/{planId}`.

Manual plan створює рівно один план з вибраною назвою.

### Автоматичне створення

Функція: `ensureWeeklyDraftPlansForAutoRouting(date = new Date())`.

Де:

- `lib/supabase/work-plans.ts`
- cron route: `app/api/cron/ensure-weekly-plans/route.ts`
- викликається також при auto-add Telegram/confirmed ticket helper-ах.

Важливо: auto ensure створює плани на наступний робочий тиждень через `getNextWorkWeekRange(date)`.

Flow:

1. Визначає наступний робочий тиждень.
2. Бере titles з `autoWorkPlanConfigs`.
3. Шукає активні плани (`draft`, `sent`, `partially_done`) з тим самим `period_start`, `period_end`, `title`.
4. Створює відсутні плани зі статусом `draft`.
5. Оновлює стару default note, якщо вона дорівнює legacy note.
6. Запускає carry-over незавершених заявок з попереднього тижня в ці draft plans.
7. Повертає `periodStart`, `periodEnd`, `plans`, `created`, `carriedOver`.

## 6. Auto work plan configs

Поточний auto mapping задається у `lib/supabase/work-plans.ts` в `autoWorkPlanConfigs`.

| Категорія | Куди потрапляє | Виконавець | Як визначається | Ризик |
|---|---|---|---|---|
| Будівельні роботи | Максим - буд роботи | Максим | `category.name` text matcher + worker lookup by telegram_id/username/name | залежить від тексту категорії |
| Студенти / організаційні питання | Нікіта - студенти/організаційні питання | Нікіта | text matcher | перейменування категорії може зламати |
| Електрика | Женя - важливі питання/електрика | Женя | text matcher | окремо від `worker_categories` |
| Буд-роботи, зварювальні, ремонтні проф | Віталік - загальні будроботи/сварка | Віталік / бригада | text matcher | довга назва, багато варіантів написання |
| Сантехніка | Денис - сантехніка | Денис | text matcher | може конфліктувати з каналізацією, якщо категорії змішають |
| Вікна / двері / фурнітура | Віталік - вікна/двері/фурнітура | Віталік | text matcher | залежить від slash/dash normalization |
| Каналізація | Лена - каналізація | Лена | text matcher `каналізація`, `канал` + telegram_id | зараз Каналізація йде до Лени, не до Дениса |

### Як шукається worker

Функція: `findAutoPlanWorkerId()`.

Пріоритет:

1. `telegramId` з config, тільки active worker.
2. `telegramUsername` з config, тільки active worker.
3. fallback: список active workers і match по імені/username через `workerMatches()`.

Якщо worker inactive або не знайдений, `worker_id` у `work_plan_items` може бути `null`, але item все одно може бути доданий у plan.

### Ризик mapping

Auto-plan mapping не використовує `category_id` або `slug`. Він залежить від нормалізованого тексту `category.name`. Якщо назву категорії перейменують, mapping може не спрацювати.

Також у системі є окремий worker recommendation через `worker_categories` у `findRecommendedWorkerForTicket()`. Це інше джерело правди, ніж `autoWorkPlanConfigs`.

## 7. Додавання заявки в план

### Спільний helper для підтверджених заявок

Функція:

```ts
addConfirmedTicketToWeeklyDraftPlan(ticketId, actorId?)
```

Де: `lib/supabase/work-plans.ts`.

Повертає:

- `added`
- `reason`
- `planId`
- `planTitle`
- `itemId`
- `workerId`

Можливі `reason`:

- `added`
- `already_planned`
- `supabase_missing`
- `ticket_not_found`
- `closed_ticket`
- `missing_category`
- `category_not_mapped`
- `ensure_failed`
- `plan_not_found`
- `existing_error`
- `insert_error`

Flow:

1. Завантажує ticket через admin client.
2. Не додає `done`, `rejected`, `cancelled`.
3. Вимагає `category_id` і `category.name`.
4. Якщо у ticket є `assignee_worker_id`, спочатку намагається знайти plan config по worker.
5. Якщо worker config не знайдено, fallback на category mapping.
6. Викликає `ensureWeeklyDraftPlansForAutoRouting()`, тобто працює з наступним робочим тижнем.
7. Перевіряє, чи ticket уже є в одному з планів цього ensured week.
8. Шукає draft plan по config title.
9. Визначає `worker_id`: ticket.assignee_worker_id або auto worker за config.
10. Додає `work_plan_items`.
11. На duplicate `23505` повертає `already_planned`.
12. Пише `ticket_history`: "Заявку додано в план виконання".

### Директорська заявка

Створення:

- action: `app/(app)/director/tickets/new/actions.ts`
- `source = 'director_portal'`
- `status = 'pending_review'`
- `priority = 'medium'`
- ticket number генерується через `generateTicketNumber()`
- пишеться history: директор створив заявку.

Підтвердження:

- generic: `confirmTicketAction()` у `app/(app)/tickets/[id]/actions.ts`
- director-specific: `confirmDirectorTicketAction()` у `app/(app)/tickets/[id]/director-actions.ts`

Обидва варіанти:

- дозволені для ролей через `canConfirmTicket`.
- перевіряють `status = pending_review`.
- `nextStatus = assigned`, якщо `assignee_worker_id` є.
- `nextStatus = new`, якщо виконавця немає.
- для director-specific flow обов'язково перевіряються `source = director_portal`, `object_id`, `category_id`.
- заповнюються `admin_confirmed_at`, `confirmed_by_profile_id`.
- викликається `addConfirmedTicketToWeeklyDraftPlan()`.
- якщо plan не знайдено, redirect повертає `statusWarning`.

Що бачить директор:

- директорський UI використовує work_plan_items для статусу "Додана в план виконання" / "У плані".

### AI / Telegram заявка

Є два різні flows:

1. Telegram group intake:
   - `lib/telegram/group-intake.ts`
   - створює pending-review ticket через `createPendingTicket()`.
   - після створення викликає `autoAddTelegramTicketToWeeklyDraftPlan({ ticketId, categoryName })`.
   - для repeat також може викликати auto planning існуючого ticket.

2. `/ai-tickets` confirm:
   - `app/(app)/ai-tickets/actions.ts`
   - працює тільки з `status = pending_review` і source `telegram_group` / `telegram_private_test`.
   - призначає рекомендованого worker через `findRecommendedWorkerForTicket()`.
   - оновлює status на `assigned` або `new`.
   - не надсилає Telegram виконавцю напряму після confirm.
   - додає заявку в план через shared confirm/planning service.

Висновок: AI/Telegram заявки підтверджуються через shared confirm/planning service. Виконавець отримує Telegram після dispatch плану або через окрему ручну дію “Надіслати виконавцю”.

### Manual/admin заявка

Створення:

- action: `app/(app)/tickets/new/actions.ts`
- `status = 'new'`
- number через `generateTicketNumber()`
- history: заявка створена.

Manual/admin заявка не додається в plan автоматично при створенні. Її можна додати через ручне створення work plan або інші manual планувальні дії.

## 8. Визначення виконавця

Фактичні правила залежать від flow.

### При додаванні confirmed ticket у auto plan

Пріоритет:

1. Якщо ticket має `assignee_worker_id`, helper намагається знайти plan config по worker.
2. Якщо plan config по worker не знайдено, fallback на category mapping.
3. `work_plan_items.worker_id = ticket.assignee_worker_id`, якщо він є.
4. Якщо ticket worker відсутній, worker шукається через `findAutoPlanWorkerId(config)`.
5. Якщо worker не знайдений або inactive, item може бути створений з `worker_id = null`.

### При `/ai-tickets` confirm

Пріоритет інший:

1. Якщо `assignee_worker_id` вже є, використовується він.
2. Якщо немає, `findRecommendedWorkerForTicket()` шукає active workers з Telegram і категорією через `worker_categories`.
3. Якщо worker знайдений, ticket стає `assigned`.
4. Якщо worker не знайдений, ticket стає `new`.

Цей flow не використовує `autoWorkPlanConfigs`.

### Після додавання в plan

Якщо змінити виконавця або категорію заявки після додавання в plan:

- ticket оновиться;
- history запишеться;
- `work_plan_items` автоматично не переноситься в інший plan.

У `quickUpdateTicketCategoryAction()` навіть є metadata note, що plan виконавця автоматично не змінюється.

Ризик: може виникнути конфлікт, коли `ticket.assignee_worker_id` уже один, а item залишився в плані іншого worker/категорії.

## 9. Перенесення незавершених заявок

Функція:

```ts
carryOverUnfinishedTicketsToWeeklyDraftPlans()
```

Вона приватна всередині `lib/supabase/work-plans.ts` і викликається тільки з `ensureWeeklyDraftPlansForAutoRouting()`.

Коли запускається:

- при cron ensure weekly plans;
- при auto-add Telegram ticket, бо той викликає ensure;
- при add confirmed ticket helper, бо той викликає ensure;
- при будь-якому майбутньому виклику `ensureWeeklyDraftPlansForAutoRouting()`.

Flow:

1. Береться target week з `ensureWeeklyDraftPlansForAutoRouting()` - наступний тиждень.
2. Шукаються previous plans за періодом `range.start - 7 days` -> `range.start`.
3. Беруться previous work_plan_items.
4. Переноситься тільки один item на ticket.
5. Якщо ticket уже є в target draft plans, він не дублюється.
6. Mapping визначається по category або по title попереднього plan.
7. Створюється новий `work_plan_items` у draft plan нового тижня.
8. Новий ticket не створюється.
9. Пишеться `ticket_history` з source `weekly_carry_over`.

### Які статуси переносяться

Логіка `ticketIsUnfinished(status)` переносить усе, що не входить у closed statuses:

| Status | Переноситься? | Причина |
|---|---|---|
| `new` | Так | не closed |
| `assigned` | Так | не closed |
| `in_progress` | Так | не closed |
| `waiting` | Так | не closed |
| `waiting_admin_confirmation` | Так | не closed |
| `pending_review` | Так, якщо вже випадково є у старому plan | не closed; це ризик |
| `done` | Ні | closed |
| `cancelled` | Ні | closed |
| `rejected` | Ні | closed |

Ризик: `pending_review` не має потрапляти в плани, але якщо старі дані вже мають pending_review item, carry-over перенесе його, бо статус не у closed list.

## 10. Захист від дублікатів

Є три рівні захисту.

1. DB constraint:

```sql
unique (work_plan_id, ticket_id)
```

2. Manual planning:
   - `createWorkPlanAction()` перевіряє selected tickets через `getActivePlannedTickets()`.
   - Якщо ticket уже є в active plan (`draft`, `sent`, `partially_done`), створення блокується.

3. Auto confirmed helper:
   - перевіряє, чи ticket уже є в ensured week plans.
   - не перевіряє всі активні плани за всі періоди, тільки плани поточного ensured week.

Telegram auto helper:

- перевіряє, чи ticket уже є в будь-якому active work_plan.

Carry-over:

- перевіряє target draft plans і `seenTicketIds`.

Ризик: DB не забороняє одну заявку в двох різних планах одного тижня. Code-level protection є, але різниться між flows.

## 11. UI `/work-planning`

Файл: `app/(app)/work-planning/page.tsx`.

Доступ:

- `admin`
- `management`
- `tech_manager`

Default week:

- якщо query `week` відсутній, відкривається next work week.
- якщо `week` є, він нормалізується через `getWorkWeekRange(new Date(`${week}T17:00:00`))`.

Сторінка показує:

- week slider;
- плани за selected week;
- counts по тижнях;
- duplicate repeats для Telegram-заявок у планах;
- action menu для export.

Плани отримуються через `getWorkPlans({ from: selectedWeek.startIso, to: selectedWeek.endIso })`.

Картки планів показують:

- title;
- period;
- status;
- кількість items;
- done count;
- unassigned count;
- link на detail plan.

У поточному коді є компоненти filter form / grouped tickets для manual plan creation, але фактичний top-level після останніх змін сфокусований на week slider і plans section.

## 12. UI `/work-planning/[id]`

Файл: `app/(app)/work-planning/[id]/page.tsx`.

Сторінка показує:

- header плану;
- статус;
- період;
- metrics;
- dispatch actions;
- export;
- список items, згрупований по `item.worker_id`;
- quick ticket modal для статусу/worker/category/comment;
- remove item з plan, якщо plan draft;
- move item to another draft plan, якщо plan draft;
- editor плану, якщо status draft;
- dispatch history.

Для director tickets у plan item card показується badge "Від директора", якщо `ticket.source === 'director_portal'`.

### Дії

- `sendWorkPlanAction()` - надсилання draft plan виконавцям.
- `retryWorkPlanDispatchAction()` - повторити failed/skipped dispatch.
- `resendWorkPlanAction()` - надіслати всім повторно.
- `removeWorkPlanItemAction()` - прибрати item з draft plan.
- `moveWorkPlanItemAction()` - перенести item в інший draft plan.
- `updateWorkPlanAction()` - редагувати draft plan.
- `cancelWorkPlanAction()` - скасувати draft plan.
- `deleteWorkPlanAction()` - видалення plan, якщо дозволено.

## 13. UI `/tickets/[id]` і планування

Файл actions: `app/(app)/tickets/[id]/actions.ts`.

Підтвердження pending-review через `confirmTicketAction()`:

1. Перевіряє права.
2. Перевіряє `status = pending_review`.
3. Визначає `nextStatus`: `assigned` або `new`.
4. Для director ticket заповнює `admin_confirmed_at` і `confirmed_by_profile_id`.
5. Пише history.
6. Викликає `addConfirmedTicketToWeeklyDraftPlan()`.
7. Якщо helper повертає warning reason, redirect має `statusWarning`.

Зміна категорії:

- оновлює `tickets.category_id`;
- пише history;
- revalidate `/work-planning`;
- не переносить item між планами.

Зміна виконавця:

- `assignTicketToWorker()` оновлює `tickets.assignee_worker_id`, `assigned_at`, `status = assigned`;
- не переносить item між планами.

Зміна статусу:

- status оновлюється;
- якщо `done`, `completed_at = now`;
- не змінює work_plan_items.

## 14. Export і Telegram dispatch

### Export усіх планів тижня

Route: `app/(app)/work-planning/export/route.ts`.

URL:

```txt
/work-planning/export?week=YYYY-MM-DD
```

Behavior:

- require role admin/management/tech_manager;
- визначає week через `getWorkWeekRange()`;
- бере всі plans selected week;
- бере всі items цих plans;
- формує `.xlsx` через ExcelJS;
- filename `work-plans-{start}-{end}.xlsx`.

### Export одного плану

Route: `app/(app)/work-planning/[id]/export/route.ts`.

Behavior:

- require role admin/management/tech_manager;
- бере plan і items;
- формує `.xlsx`;
- filename `work-plan-{period_start}-{period_end}.xlsx`.

Export бере всі items плану, включно з director_portal заявками.

### Telegram dispatch

Helper: `sendWorkPlanToWorkers(workPlanId, { mode })`.

Behavior:

1. Завантажує plan, items, dispatches.
2. Групує items по `item.worker_id`.
3. Якщо немає items з worker_id, повертає помилку.
4. Якщо worker не знайдений, пише failed dispatch.
5. Якщо worker без `telegram_id`, пише `skipped_no_telegram`.
6. Якщо worker має Telegram, надсилає повідомлення chunk-ами по 8 items.
7. Для кожної заявки створюється worker done token і inline button "Виконав".
8. При initial success plan переходить у `sent`, `sent_at = now`.

## 15. AI tab і director tab

Файл: `app/(app)/tickets/page.tsx`.

Поточний `/tickets` має source filter:

- all sources;
- `source = director_portal` для "Від директорів".

AI pending count рахується через:

```ts
getTicketsCount({ status: "pending_review", source: ["telegram_group", "telegram_private_test"] })
```

Це відокремлює AI/Telegram pending від director_portal pending у count.

## 16. RLS

Міграція `016_fix_work_planning_rls.sql` вмикає RLS для:

- `work_plans`
- `work_plan_items`
- `work_plan_dispatches`

Доступ:

- `admin`, `management`, `tech_manager` можуть select/insert/update work plans/items/dispatches.
- delete work_plans і work_plan_dispatches дозволений тільки `admin`.

Автоматичні helper-и використовують admin client там, де потрібно обійти user RLS для системних операцій.

## 17. SQL для перевірки

### Останні плани

```sql
select
  id,
  title,
  period_start,
  period_end,
  status,
  created_at
from work_plans
order by period_start desc, title asc
limit 50;
```

### Останні items

```sql
select
  wpi.id,
  wpi.work_plan_id,
  wpi.ticket_id,
  wpi.worker_id,
  wp.title,
  wp.period_start,
  wp.period_end,
  t.number,
  t.source,
  t.status
from work_plan_items wpi
join work_plans wp on wp.id = wpi.work_plan_id
join tickets t on t.id = wpi.ticket_id
order by wpi.created_at desc
limit 100;
```

### Директорські заявки в планах

```sql
select
  t.id,
  t.number,
  t.source,
  t.status,
  wp.title,
  wp.period_start,
  wp.period_end
from tickets t
join work_plan_items wpi on wpi.ticket_id = t.id
join work_plans wp on wp.id = wpi.work_plan_id
where t.source = 'director_portal'
order by t.created_at desc
limit 50;
```

### AI/Telegram заявки в планах

```sql
select
  t.id,
  t.number,
  t.source,
  t.status,
  wp.title,
  wp.period_start,
  wp.period_end
from tickets t
join work_plan_items wpi on wpi.ticket_id = t.id
join work_plans wp on wp.id = wpi.work_plan_id
where coalesce(t.source, '') <> 'director_portal'
order by t.created_at desc
limit 50;
```

### Дублікати в одному плані

```sql
select
  ticket_id,
  work_plan_id,
  count(*)
from work_plan_items
group by ticket_id, work_plan_id
having count(*) > 1;
```

### Дублікати в одному тижні

```sql
select
  wpi.ticket_id,
  wp.period_start,
  wp.period_end,
  count(*) as plans_count
from work_plan_items wpi
join work_plans wp on wp.id = wpi.work_plan_id
group by wpi.ticket_id, wp.period_start, wp.period_end
having count(*) > 1;
```

### Каналізація

```sql
select
  t.id,
  t.number,
  c.name as category_name,
  w.name as worker_name,
  wp.title as plan_title,
  wp.period_start,
  wp.period_end
from tickets t
join categories c on c.id = t.category_id
left join work_plan_items wpi on wpi.ticket_id = t.id
left join work_plans wp on wp.id = wpi.work_plan_id
left join workers w on w.id = coalesce(wpi.worker_id, wp.worker_id)
where c.name ilike '%Каналіза%'
order by t.created_at desc
limit 30;
```

Примітка: у поточній схемі `work_plans.worker_id` не описаний у міграції `015_work_planning_center.sql`. Якщо такого поля немає в production, цей SQL треба адаптувати:

```sql
left join workers w on w.id = wpi.worker_id
```

### Pending review заявки, які випадково попали в план

```sql
select
  t.id,
  t.number,
  t.source,
  t.status,
  wp.title,
  wp.period_start
from tickets t
join work_plan_items wpi on wpi.ticket_id = t.id
join work_plans wp on wp.id = wpi.work_plan_id
where t.status = 'pending_review'
order by t.created_at desc;
```

## 18. Ризики поточної логіки

1. Timezone helper не є явно `Europe/Kyiv` у JS runtime, хоча бізнес-правило каже четвер 17:00 Kyiv.
2. Auto-plan mapping базується на тексті `category.name`, а не на `category_id` або `slug`.
3. Є два джерела worker routing: `autoWorkPlanConfigs` і `worker_categories`.
4. `/ai-tickets` confirm-flow не викликає `addConfirmedTicketToWeeklyDraftPlan()`, на відміну від `/tickets/[id]` confirm-flow.
5. `pending_review` може бути перенесений carry-over, якщо він уже потрапив у старий plan.
6. Зміна категорії або виконавця після додавання в plan не переносить item в інший plan.
7. DB constraint захищає від дубля тільки в одному plan, але не в межах одного тижня.
8. `work_plans` не має явного `worker_id`, тому worker плану фактично зашитий у title/config і `work_plan_items.worker_id`.
9. Автоматичні плани створюються на наступний тиждень, тоді як частина UI/dashboard показує поточний тиждень. Це може плутати користувача без чітких labels.
10. Carry-over запускається як side-effect ensure helper-а, а не окремим контрольованим cron/job тільки для перенесення.

## 19. Що можна змінити наступним етапом

1. Зробити централізований planning service з єдиним flow для director, AI/Telegram і manual підтверджень.
2. Перейти з text mapping категорій на `category_id` або стабільний `slug`.
3. Додати explicit `Europe/Kyiv` work week helper.
4. Додати code-level або DB-level захист від дубля ticket у кількох планах одного тижня.
5. Розділити "створити плани наступного тижня" і "carry-over" на окремі дії/job-и.
6. Додати ручне переміщення заявки між планами при зміні worker/category.
7. Додати явне поле `planned_at` або окремий статус/ознаку, щоб UI не виводив planned state тільки через join до `work_plan_items`.
8. Узгодити `/ai-tickets` confirm-flow з generic `confirmTicketAction()`.

## 20. Підсумок фактичної поведінки

- Поточний/наступний тиждень: helper Thursday 17:00 -> Thursday 17:00, але timezone залежить від runtime.
- Автоматичні плани: створюються на наступний тиждень за `autoWorkPlanConfigs`.
- Директорська заявка: pending_review -> admin confirm -> new/assigned -> addConfirmedTicketToWeeklyDraftPlan -> next week draft plan або warning.
- Telegram group заявка: pending_review -> autoAddTelegramTicketToWeeklyDraftPlan при створенні -> next week draft plan, якщо category mapped.
- `/ai-tickets` confirm: pending_review -> new/assigned, worker recommendation, додавання в plan через shared service; Telegram виконавцю не надсилається до dispatch плану або ручної дії.
- Manual/admin заявка: створюється `new`, автоматично не планується.
- Carry-over: переносить незакриті tickets із попереднього тижня в наступні draft plans при ensure.
- Каналізація: у `autoWorkPlanConfigs` маршрутизується до Лени.
- Duplicate protection: strong for same plan, partial for same week, різна між flows.
