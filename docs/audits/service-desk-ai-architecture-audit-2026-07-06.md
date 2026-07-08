# Архітектурний аудит Service Desk AI - 2026-07-06

Проєкт: `C:\Users\User\Desktop\Розробка\Проект Заяка техпроблематики`

Гілка: `feature/workers-module`

Режим аудиту: без змін у коді продукту, без міграцій, без комітів. Дозволено створити тільки audit-документи в `docs/audits`.

## 1. Короткий висновок

Проєкт збирається успішно через `npm run build`, має робочі основні сторінки, AI pipeline, Telegram webhook, модуль AI-заявок і новий модуль виконавців. Головна проблема не в build-помилках, а в тому, що система зараз живе між двома архітектурними поколіннями:

- стара модель виконавців: `profiles.role = worker` і `tickets.assigned_to`;
- нова модель виконавців: таблиця `workers` і поле `tickets.assignee_worker_id`;
- старий Telegram dialog/session flow;
- новий Telegram group AI intake і worker callback `wd:{token}`.

Через це ризики знаходяться в правах доступу, RLS, звітах, підтвердженні AI-заявок, Telegram callback routing і різних трактуваннях статусів заявки.

## 2. Перевірені ділянки

Перевірено:

- маршрути Next.js у `app/(app)` і `app/api`;
- `lib/telegram/*`;
- `lib/ai/*`;
- `lib/stores/*`;
- `lib/supabase/*`;
- `lib/auth/*`;
- `types/domain.ts`;
- Supabase migrations `001`-`011`;
- layout/sidebar/mobile navigation;
- package scripts;
- git state.

## 3. Git і build

Поточна гілка: `feature/workers-module`.

Статус на момент аудиту: робоче дерево було чисте і синхронізоване з `origin/feature/workers-module`.

`npm run build`: проходить.

`npm run lint`: не є придатною non-interactive перевіркою, бо `next lint` просить інтерактивно налаштувати ESLint.

Останні важливі коміти:

- `ace9e82 Fix worker done callback routing`
- `0dcfec2 Базова гілка... 5. версія-1`
- `c2e6886 Merge mobile UI redesign into workers module`
- `f48fd9c ... модуль виконавці...`

## 4. Поточна архітектура

### Основні сторінки

- `/dashboard`
- `/tickets`
- `/tickets/new`
- `/tickets/[id]`
- `/ai-tickets`
- `/ai-test`
- `/objects`
- `/workers`
- `/workers/[id]`
- `/users`
- `/reports`
- `/settings`

### API routes

- `/api/telegram/webhook`
- `/api/ai/classify`

### Основні модулі

- `lib/telegram/bot.ts` - головний Telegram update handler.
- `lib/telegram/group-intake.ts` - AI intake з Telegram групи/private test.
- `lib/telegram/worker-notifications.ts` - надсилання заявки виконавцю.
- `lib/telegram/worker-callbacks.ts` - callback кнопки "Виконав".
- `lib/ai/group-message-analyzer.ts` - OpenAI/fallback AI v2.
- `lib/stores/match-store.ts` - Object Matcher v2.
- `lib/stores/object-source.ts` - джерело об'єктів: Supabase або static fallback.
- `lib/supabase/workers.ts` - mutations для workers.
- `lib/supabase/worker-queries.ts` - queries для workers.
- `lib/supabase/queries.ts` - загальні ticket/object/profile/category queries.
- `lib/auth/permissions.ts` - role permissions.

## 5. Telegram

### Webhook secret

`app/api/telegram/webhook/route.ts` перевіряє query param:

```text
?secret=...
```

Порівняння йде з:

```text
process.env.TELEGRAM_WEBHOOK_SECRET
```

Якщо env secret порожній, route повертає `500`. Якщо secret відсутній або не співпадає - `401`.

Важливо: README/інструкції частково описують `secret_token`/header `X-Telegram-Bot-Api-Secret-Token`, але фактичний код використовує query param. Це треба уніфікувати в документації та в команді встановлення webhook.

### Callback "Виконав"

Поточна локальна логіка правильна:

- `handleTelegramUpdate()` спочатку обробляє `update.callback_query`;
- якщо `callback_query.data` починається з `wd:`, викликається `handleWorkerDoneCallback()`;
- після цього update не передається в старий dialog handler;
- тільки після callback routing обробляється `update.message`.

`worker-notifications.ts` створює token через `randomBytes(9).toString("base64url")`, записує його в `worker_ticket_actions`, а callback data робить короткою:

```text
wd:{token}
```

`worker-callbacks.ts` уже не використовує join:

```text
.select("*, ticket:tickets(*), worker:workers(*)")
```

Замість цього використовуються окремі прямі запити:

- `worker_ticket_actions` по token;
- `tickets` по `action.ticket_id`;
- `workers` по `action.worker_id`.

### Ризик деплою

Якщо у Telegram після натискання "Виконав" досі з'являється:

```text
Ця дія вже неактуальна. Надішліть /start, щоб почати заново.
```

або повідомлення про створення заявки, то найімовірніша причина не в локальному коді, а в тому, що webhook у Telegram дивиться на старий Vercel deployment, main branch або старий preview.

Текст "Ця дія вже неактуальна..." лежить у legacy Telegram dialog flow:

- `lib/telegram/messages.ts`
- використовується через `lib/telegram/handlers.ts`

Цей handler не повинен отримувати `wd:*`.

## 6. AI pipeline

AI v2 побудований навколо Work Items:

```text
Telegram message
-> Object Matcher
-> Object Resolver
-> Work Item Extractor / OpenAI
-> Work Classifier
-> Priority Engine
-> Ticket Builder
-> tickets.status = pending_review
```

`/api/ai/classify` повертає діагностику:

- `localStoreMatch`;
- `objectResolver`;
- `objectSource`;
- `aiMode`;
- `openaiConfigured`;
- `model`;
- `fallbackReason`;
- analysis з `workItems` і alias `tickets`.

OpenAI працює як основний режим, якщо є `OPENAI_API_KEY`; fallback parser використовується без падіння.

### Ризик Object Resolver

У `lib/ai/object-resolver.ts` є підозріла логіка для випадку, коли local matcher не `resolved`. Функція `findResolvedCompanyObject()` фактично не дає AI вибрати object з candidates, якщо resolver повернув `allowedObjectIds: []`.

Це може суперечити задуму: якщо matcher `ambiguous`, AI може вибрати тільки з candidates. Зараз це місце варто перевірити окремо перед production.

## 7. Заявки і статуси

Типи статусів у `types/domain.ts`:

- `pending_review`
- `new`
- `assigned`
- `in_progress`
- `waiting`
- `waiting_admin_confirmation`
- `done`
- `cancelled`
- `rejected`

У базі enum доповнений міграціями:

- `006_ai_ticket_intake.sql` додає `pending_review`, `rejected`;
- `010_workers_module.sql` додає `assigned`, `waiting_admin_confirmation`.

### Ризик status naming

У коді зустрічається статус `completed` як логічний inactive status у деяких worker helper-ах, але в enum/типах основний фінальний статус - `done`.

Це не ламає build, але створює ризик неправильних фільтрів і статистики.

## 8. AI-заявки

`/ai-tickets` показує заявки:

- `status = pending_review`;
- `source = telegram_group` або `telegram_private_test`.

Сторінка дозволяє:

- редагувати AI-заявку до підтвердження;
- призначити worker через `tickets.assignee_worker_id`;
- підтвердити;
- відхилити.

### Критичний дубль бізнес-логіки

Підтвердження `pending_review` зараз відрізняється на різних сторінках:

- `app/(app)/ai-tickets/actions.ts::confirmAiTicketAction()` може знайти/використати worker, поставити `assigned`, створити history і відправити Telegram;
- `app/(app)/tickets/[id]/actions.ts::confirmTicketAction()` просто переводить `pending_review -> new`.

Це означає, що одна й та сама бізнес-операція має різний результат залежно від UI-сторінки.

Рекомендація: винести єдиний service для transition `pending_review -> new/assigned/rejected`, а UI має тільки викликати цей service.

## 9. Модуль виконавців

Нова модель:

- `workers`;
- `worker_categories`;
- `tickets.assignee_worker_id`;
- `worker_ticket_actions`;
- `/workers`;
- `/workers/[id]`.

`getTicketsByWorkerId(workerId)` використовує:

```text
.eq("assignee_worker_id", workerId)
```

Це правильно для нового модуля.

### Найбільший архітектурний конфлікт

У проєкті одночасно живуть дві моделі виконавця:

1. Старий worker як profile:
   - `profiles.role = worker`;
   - `tickets.assigned_to`;
   - `assigned_to = auth.uid()`;

2. Новий worker як окрема сутність:
   - `workers`;
   - `tickets.assignee_worker_id`;
   - Telegram worker notification;
   - worker callback.

Через це:

- worker role у `lib/auth/permissions.ts` бачить/редагує заявки через `assigned_to`, а не `assignee_worker_id`;
- `getTickets()` для role `worker` теж фільтрує через `assigned_to`;
- RLS policies у міграціях теж орієнтовані на `assigned_to`;
- reports використовують profile workers, не workers table.

Це найважливіша проблема всієї архітектури.

## 10. Permissions і RLS

`lib/auth/permissions.ts`:

- route access для `/workers`, `/ai-tickets`, `/ai-test` виглядає логічно;
- але ticket-level permissions для role `worker` використовують `ticket.assigned_to === profile.id`.

RLS policies у Supabase також містять правила на `tickets.assigned_to = auth.uid()`.

Це означає: якщо заявка призначена тільки через `assignee_worker_id`, користувач із role `worker` у старій auth-моделі може не бачити свою заявку або не мати прав, залежно від того, як саме worker пов'язаний із profile.

Потрібне рішення:

- або зв'язати `workers.profile_id`/`workers.user_id` з auth user;
- або лишити workers як зовнішніх Telegram-виконавців без login-доступу;
- або мігрувати worker role повністю на `workers`.

Поки це не вирішено, permissions/RLS вразливі до розсинхрону.

## 11. Reports

`lib/reports/analytics.ts` працює переважно з:

- `profiles`;
- `ticket.assigned_to`.

Це означає, що Excel-звіти по виконавцях не відображають коректно новий модуль `workers` і `tickets.assignee_worker_id`.

Після впровадження workers module звіти треба оновити окремо.

## 12. Navigation і mobile

Desktop sidebar містить `/workers`.

Mobile drawer/bottom navigation не повністю покриває нові worker routes. Це не критична runtime-помилка, але на мобільному інтерфейсі користувач може не знайти модуль виконавців.

## 13. Database

Міграції в цілому послідовні:

- `001` базові таблиці/enums;
- `006` AI intake;
- `009` ticket number sequence/function;
- `010` workers module;
- `011` worker action tokens.

Проблема не в наявності полів, а в тому, що старі policies і частина application code ще не адаптовані до нової worker-моделі.

## 14. Top 5 критичних проблем

### 1. Роздвоєна модель виконавців

`profiles/assigned_to` і `workers/assignee_worker_id` одночасно використовуються як основна прив'язка виконавця.

Наслідок: різні сторінки, звіти, permissions і RLS можуть бачити різну реальність.

### 2. Різне підтвердження `pending_review`

`/ai-tickets` і `/tickets/[id]` підтверджують AI-заявки різними шляхами.

Наслідок: одна заявка може піти в `assigned` і Telegram з однієї сторінки, але просто в `new` з іншої.

### 3. RLS і permissions ще старої моделі

Worker-доступ у code/RLS орієнтований на `assigned_to`, а новий модуль призначає через `assignee_worker_id`.

Наслідок: потенційно неправильний доступ або невидимі заявки для worker role.

### 4. Telegram webhook/deployment drift

Локальний код routing для `wd:*` правильний, але симптоми користувача вказують на старий deployment або webhook URL, який не вказує на актуальний commit.

Наслідок: у production може працювати не той код, який перевіряється локально.

### 5. Reports не адаптовані до нового workers module

Звіти по виконавцях використовують `assigned_to`/profiles.

Наслідок: Excel-аналітика по виконавцях стає неточною після переходу на `workers`.

## 15. Інші проблеми

- README/інструкції Telegram webhook не повністю відповідають фактичному query-secret способу.
- `sendTicketToWorker()` має прихований side effect: може змінювати призначення і статус перед відправкою.
- `markTicketSentToWorker()` і `sendTicketToWorker()` дублюють частину history/update логіки.
- `completed` згадується як status-like value, хоча основний enum має `done`.
- `next lint` не налаштований для CI.
- Static `store-addresses.ts` fallback може приховувати проблеми із Supabase objects.

## 16. Рекомендований порядок виправлення

1. Перевірити Telegram webhook deployment:
   - `getWebhookInfo`;
   - URL;
   - query secret;
   - Vercel deployment/branch/commit;
   - додати version/commit log у webhook response logs.

2. Зафіксувати canonical worker model:
   - або workers є Telegram-only external executors;
   - або workers мають зв'язок з auth profiles;
   - після рішення оновити permissions, RLS, reports і UI.

3. Винести єдину ticket lifecycle service:
   - `confirmPendingReviewTicket`;
   - `rejectPendingReviewTicket`;
   - `assignWorkerToTicket`;
   - `sendTicketToWorker`;
   - `confirmWorkerDone`.

4. Уніфікувати `pending_review` flow:
   - `/ai-tickets`;
   - `/tickets/[id]`;
   - Telegram AI intake;
   - ticket history.

5. Оновити RLS policies під нову модель:
   - особливо worker visibility/edit;
   - `ticket_photos`;
   - comments/history if needed.

6. Оновити reports:
   - worker stats по `assignee_worker_id`;
   - окремо показувати profile assignee, якщо воно лишається.

7. Додати non-interactive lint/test gate:
   - ESLint config;
   - smoke tests для Telegram callback routing;
   - unit tests для Object Matcher і ticket numbering.

8. Оновити документацію:
   - webhook через `?secret=`;
   - Vercel env;
   - worker assignment lifecycle;
   - AI-ticket confirmation rules.

## 17. Що не змінювалось

Під час аудиту не змінювались:

- application code;
- Supabase migrations;
- package dependencies;
- Telegram/OpenAI logic;
- UI;
- git commits.

Створено тільки audit-документи.
