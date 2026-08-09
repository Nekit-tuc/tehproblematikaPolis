# Аудит кнопок і дій адміністратора

Дата аудиту: 2026-08-09  
Гілка під час перевірки: `main`  
Мета: описати, як адміністратор зараз керує заявками, AI-заявками, планами робіт, виконавцями, об'єктами і директорами через UI.

## 1. Короткий висновок

Адміністратор керує заявками переважно через `/tickets` і `/tickets/[id]`. Сторінка списку відповідає за пошук, фільтри, перехід у заявку, export/print і повне видалення через меню картки. Сторінка заявки є основним центром керування: підтвердження, відхилення, зміна статусу, категорії, виконавця, фото, коментарі, Telegram-відправка виконавцю, підтвердження виконання і hard delete.

Планування керується через `/work-planning` і `/work-planning/[id]`. `/work-planning` показує тижні, плани, зведення, документи/export і ручне створення плану з вибраними заявками. `/work-planning/[id]` керує конкретним планом: надсилання в Telegram, повторне надсилання, редагування чернетки, скасування, видалення item-а, перенесення item-а в інший draft plan і quick modal для зміни заявки прямо з плану.

Є два різні confirm-flow:

- `/tickets/[id]` використовує `confirmTicketAction` або `confirmDirectorTicketAction` і після підтвердження викликає `addConfirmedTicketToWeeklyDraftPlan`.
- `/ai-tickets` використовує `confirmAiTicketAction`, призначає/рекомендує виконавця і надсилає Telegram, але не викликає `addConfirmedTicketToWeeklyDraftPlan`.

Це головний ризик: підтвердження AI-заявок у різних UI може поводитись по-різному.

## 2. Ролі і доступи

Основні ролі в перевірених admin-flow:

- `admin`: повний доступ до заявок, планів, hard delete, workers, objects, directors.
- `management`: доступ до більшості керувальних дій заявок і планів, але hard delete заявки обмежений через `canHardDeleteTicket`.
- `tech_manager`: доступ до підтвердження/редагування заявок, планування, workers/objects згідно перевірок `requireRole` і permission helpers.
- `store_manager`: може створювати manual ticket через `/tickets/new`, якщо дозволено `canCreateTicket`.
- `store_director`: не є адмінською роллю; не має бачити адмінські `/tickets`, `/work-planning`, `/objects`.

Фактичні перевірки:

- `/work-planning`, `/work-planning/[id]`, `/ai-tickets`: `requireRole(["admin", "management", "tech_manager"])`.
- `/tickets/new`: `canCreateTicket(profile)`.
- Керування ticket detail: `canEditTicket`, `canConfirmTicket`, `canHardDeleteTicket`, `canAddTicketPhoto`.
- Workers/actions: `requireRole(["admin", "management", "tech_manager"])`.
- Objects/directors/actions: адмінські actions використовують role/profile checks у відповідних server action файлах.

## 3. Сторінка `/tickets`

Файли:

- `app/(app)/tickets/page.tsx`
- `app/(app)/tickets/[id]/actions.ts`

Сторінка `/tickets` є навігаційним і фільтраційним центром для всіх заявок. Вона не змінює заявку напряму, крім hard delete через action menu картки/рядка.

Кнопки і елементи:

- `Нова заявка` → `/tickets/new`.
- `Excel` → `/tickets/export` з поточними query filters.
- `Друк` → `/tickets/print` з поточними query filters.
- Фільтри: пошук, статус, категорія, виконавець, source, priority, період, sort.
- Mobile view switch: cards/table.
- AI pending switch/count: окремий перехід до AI pending.
- Director source filter/tab: показує `source=director_portal`.
- `Відкрити` → `/tickets/[id]`.
- Action menu `Видалити` → `hardDeleteTicketAction`.
- Пагінація `Назад` / `Далі`.

AI і директорські заявки розділяються source-фільтрами. AI pending count рахується для Telegram/AI джерел, director_portal не має попадати в AI tab.

## 4. Сторінка `/tickets/[id]`

Файли:

- `app/(app)/tickets/[id]/page.tsx`
- `app/(app)/tickets/[id]/actions.ts`
- `app/(app)/tickets/[id]/director-actions.ts`

Це головна сторінка керування конкретною заявкою.

Основні дії:

### Підтвердити заявку

Сторінка: `/tickets/[id]`  
Action: `confirmTicketAction(ticketId)` або `confirmDirectorTicketAction(ticketId)`  
Доступ: `canConfirmTicket`, зазвичай `admin`, `management`, `tech_manager`  
Коли показується: `status = pending_review`  
Що робить:

- перевіряє права;
- перевіряє, що status `pending_review`;
- виставляє status `assigned`, якщо є `assignee_worker_id`, інакше `new`;
- для director ticket заповнює `admin_confirmed_at`, `confirmed_by_profile_id`;
- пише `ticket_history`;
- викликає `addConfirmedTicketToWeeklyDraftPlan`;
- revalidate `/work-planning`, `/tickets`, `/tickets/[id]`, `/dashboard`, для director ще `/director/tickets`;
- redirect назад у заявку з success або warning.

Ризик: якщо план не знайдено, заявка вже підтверджена, але адмін бачить warning. Це правильніше за silent failure, але все ще може залишити заявку поза планом.

### Відхилити заявку

Action: `rejectTicketAction(ticketId)` або `rejectDirectorTicketAction(ticketId)`  
Коли показується: `pending_review`  
Що змінює:

- `tickets.status = rejected`;
- `completed_at = null`;
- `updated_at`;
- запис у `ticket_history`;
- revalidate `/tickets`, `/tickets/[id]`, `/dashboard`, для director ще `/director/tickets`.

Ризик: destructive semantic action; confirm dialog залежить від UI-обгортки.

### Змінити статус

Action: `updateTicketStatusAction(ticketId, formData)`  
Варіанти: `new`, `assigned`, `in_progress`, `waiting`, `waiting_admin_confirmation`, `done`, `cancelled`  
Що змінює:

- `tickets.status`;
- `completed_at = now`, якщо статус `done`, інакше `null`;
- `updated_at`;
- `ticket_history`.

Ризик: зміна status не переміщує заявку між планами.

### Призначити виконавця

Action: `assignWorkerAction(ticketId, formData)`  
Helper: `assignTicketToWorker`  
Що змінює:

- `tickets.assignee_worker_id`;
- `assigned_at`;
- часто `status = assigned`;
- `ticket_history`.

Ризик: якщо заявка вже в плані іншого виконавця, сам `work_plan_item` автоматично не переноситься.

### Зняти виконавця

Action: `unassignWorkerAction(ticketId, formData)`  
Helper: `unassignTicketWorker`  
Що змінює:

- `tickets.assignee_worker_id = null`;
- статус може повернутись у `new`, якщо був `assigned` або `waiting_admin_confirmation`;
- `ticket_history`.

Ризик: `work_plan_item.worker_id`/план можуть лишитись старими.

### Змінити категорію

Action: `updateTicketCategoryAction(ticketId, formData)`  
Що змінює:

- `tickets.category_id`;
- `updated_at`;
- `ticket_history`;
- revalidate `/work-planning`.

Ризик: план виконавця не змінюється автоматично. Це прямо зафіксовано і в quick modal плану.

### Надіслати виконавцю

Action: `sendTicketToWorkerAction(ticketId, formData)`  
Helper: `sendTicketToWorker`  
Що робить:

- перевіряє призначеного worker;
- якщо треба, оновлює assignment;
- надсилає Telegram повідомлення;
- створює done token;
- оновлює fields на ticket через helper;
- пише history у helper.

Ризик: якщо у worker немає `telegram_id`, action повертає помилку.

### Підтвердити виконання / повернути

Actions:

- `confirmWorkerCompletionAction(ticketId, formData)`
- `returnWorkerCompletionAction(ticketId, formData)`

Коли: `status = waiting_admin_confirmation`

`confirmWorkerCompletionAction`:

- підтверджує виконання;
- ставить `done`;
- оновлює completion/admin confirmation поля через helper;
- надсилає worker confirmation notification;
- revalidate `/tickets`.

`returnWorkerCompletionAction`:

- ставить `status = assigned`;
- записує `admin_feedback`;
- пише `ticket_history`.

### Фото

Action: `uploadTicketPhotosAction(ticketId, type, formData)`  
Типи залежать від UI: before/after та інші наявні типи.  
Що змінює:

- storage upload;
- `ticket_photos`;
- revalidate `/tickets/[id]`.

### Коментарі

Action: `addTicketCommentAction(ticketId, formData)`  
Що змінює:

- `ticket_comments`;
- `ticket_history` з action `Додано коментар`;
- revalidate `/tickets/[id]`.

### Історія

UI читає `ticket_history`. Сама історія не змінює даних.

### Видалити заявку

Action: `hardDeleteTicketAction(ticketId, formData?)`  
Доступ: `canHardDeleteTicket`, фактично тільки адміністратор  
Що видаляє:

- storage файли фото;
- `worker_ticket_actions`;
- `ticket_comments`;
- `ticket_photos`;
- `ticket_history`;
- `tickets`;
- redirect `/tickets?success=deleted`.

Ризик: незворотна дія. Після видалення історія також видаляється.

## 5. Режими заявки на `/tickets/[id]`

### A. `pending_review` + `source=director_portal`

Є кнопки підтвердити/відхилити. Підтвердження переходить у `new` або `assigned`, заповнює director confirmation поля і додає в weekly draft plan через `addConfirmedTicketToWeeklyDraftPlan`.

### B. `pending_review` + AI/Telegram

На `/tickets/[id]` використовується generic `confirmTicketAction`, який додає в weekly draft plan. На `/ai-tickets` використовується окремий `confirmAiTicketAction`, який не викликає planning helper.

### C. `new`, `assigned`, `in_progress`

Адмін може міняти статус, категорію, виконавця, коментувати, додавати фото, відправляти виконавцю.

### D. `waiting_admin_confirmation`

Адмін може підтвердити виконання або повернути на доопрацювання. Для director flow акт створюється директором на директорській сторінці, а admin бачить акт, якщо він існує.

### E. `done`, `rejected`, `cancelled`

Основні confirm/reject недоступні. Частина редагувань може залишатися доступною за permission helper-ами, hard delete залишається для admin.

## 6. Сторінка `/tickets/new`

Файли:

- `app/(app)/tickets/new/page.tsx`
- `app/(app)/tickets/new/actions.ts`

Поля:

- назва;
- об'єкт;
- категорія;
- priority;
- assigned profile/user;
- due_at;
- description;
- before photos.

Кнопки:

- `Створити заявку` → `createTicketAction`;
- `Очистити` / cancel-style reset.

`createTicketAction`:

- перевіряє auth і `canCreateTicket`;
- генерує `number`;
- вставляє ticket зі status `new`;
- записує `ticket_history` `Заявку створено`;
- завантажує before photos;
- revalidate `/dashboard`, `/tickets`;
- redirect `/tickets/[id]`.

Manual/admin заявка зараз не додається в `work_plan_items` автоматично при створенні.

## 7. Сторінка `/ai-tickets`

Файли:

- `app/(app)/ai-tickets/page.tsx`
- `app/(app)/ai-tickets/actions.ts`

Сторінка показує pending AI/Telegram заявки і дозволяє швидко підтвердити, відхилити або відредагувати їх перед підтвердженням.

Кнопки і форми:

- view switch `Картки` / `Таблиця`;
- фільтри: search, object, category, priority, confidence, date;
- `Застосувати`, `Скинути`;
- `Відкрити` / `Відкрити картку`;
- `Підтвердити`;
- `Відхилити`;
- `Редагувати перед підтвердженням`;
- `Зберегти правки`;
- `Зберегти виконавця`.

Actions:

- `confirmAiTicketAction(ticketId)`;
- `rejectAiTicketAction(ticketId)`;
- `updateAiTicketAction(ticketId, formData)`;
- `assignWorkerToAiTicketAction(ticketId, formData)`.

`confirmAiTicketAction`:

- приймає тільки `pending_review` AI/Telegram sources;
- якщо worker призначений, використовує його;
- якщо ні, шукає recommended worker;
- якщо worker є, ставить `assigned`, `assignee_worker_id`, `assigned_at`;
- якщо worker немає, ставить `new`;
- пише `ticket_history`;
- надсилає Telegram виконавцю, якщо worker є;
- redirect з success code.

Важливо: цей flow не викликає `addConfirmedTicketToWeeklyDraftPlan`, тому може відрізнятись від confirm через `/tickets/[id]`.

## 8. Сторінка `/work-planning`

Файли:

- `app/(app)/work-planning/page.tsx`
- `app/(app)/work-planning/actions.ts`
- `components/work-planning/work-planning-documents-menu.tsx`

Доступ: `admin`, `management`, `tech_manager`.

Основні елементи:

- Week slider: попередній/поточний/наступний/майбутні тижні.
- `Створити план` → відкриває `?create=1`.
- `Документи` menu → export тижня або конкретного плану.
- Cards планів виконавців.
- Action menu плану → `Видалити`.
- Duplicate repeats section → відкриття основної заявки.
- Summary badge: скільки активних/не запланованих.

Create mode:

- title;
- period_start;
- period_end;
- notes;
- ticket checkboxes;
- `Створити план`;
- `Скасувати`.

`createWorkPlanAction`:

- role check;
- вимагає title, period, мінімум одну заявку;
- перевіряє, чи вибрані ticketIds уже є в активних планах;
- нормалізує period через work week helper;
- створює `work_plans`;
- додає rows у `work_plan_items`;
- revalidate `/work-planning`;
- redirect `/work-planning?success=created`.

`ensureAutoDraftPlansAction`:

- викликає `ensureWeeklyDraftPlansForAutoRouting`;
- створює weekly draft plans і переносить unfinished заявки;
- redirect з `created` і `carried`.

`deleteWorkPlanAction`:

- видаляє план через helper `deleteWorkPlan`;
- не дозволяє delete для `done`;
- видаляє dispatches і work_plan_items helper-ом;
- пише ticket_history про вилучення плану для affected tickets;
- revalidate `/work-planning`, `/tickets`, `/dashboard`, `/weekly-control`;
- redirect `/work-planning?success=deleted`.

## 9. Сторінка `/work-planning/[id]`

Файли:

- `app/(app)/work-planning/[id]/page.tsx`
- `app/(app)/work-planning/[id]/actions.ts`
- `app/(app)/work-planning/[id]/quick-ticket-modal.tsx`
- `app/(app)/work-planning/[id]/quick-ticket-actions.ts`

Основні кнопки:

- `Назад` → `/work-planning`.
- `Експорт плану` → `/work-planning/[id]/export`.
- `Надіслати план` → `sendWorkPlanAction`, тільки для `draft`.
- `Повторити невдалі` → `retryFailedWorkPlanDispatchAction`, для sent/partially/done з failed/skipped dispatches.
- `Надіслати повторно всім` → `resendWorkPlanToAllAction`, з confirm dialog.
- `Зберегти` у draft editor → `updateWorkPlanAction`.
- `Скасувати план` → `cancelWorkPlanAction`, тільки draft.
- `Прибрати` item → `removeWorkPlanItemAction`, тільки draft.
- `Перенести` item → `moveWorkPlanItemAction`, тільки draft і тільки в інший draft plan.
- `Відкрити заявку` / quick modal.
- Quick modal actions: status, worker, category, comment.

`updateWorkPlanAction`:

- оновлює title, period, notes;
- тільки якщо plan ще draft;
- нормалізує period;
- revalidate `/work-planning` і `/work-planning/[id]`.

`cancelWorkPlanAction`:

- helper `cancelWorkPlan`;
- тільки draft;
- status `cancelled`;
- revalidate.

`removeWorkPlanItemAction`:

- helper `removeWorkPlanItem`;
- тільки draft;
- видаляє row з `work_plan_items`;
- revalidate.

`moveWorkPlanItemAction`:

- helper `moveWorkPlanItemToDraftPlan`;
- target plan має бути draft;
- оновлює `work_plan_items.work_plan_id` і `worker_id`;
- пише `ticket_history`;
- revalidate current/target plan і `/tickets`.

`sendWorkPlanAction`, `retryFailedWorkPlanDispatchAction`, `resendWorkPlanToAllAction`:

- викликають `sendWorkPlanToWorkers` з mode `initial`, `retry_failed`, `resend_all`;
- створюють rows у `work_plan_dispatches`;
- оновлюють `work_plans.status = sent`, `sent_at`;
- Telegram надсилається тільки worker-ам із `telegram_id`.

## 10. Export планів

Routes:

- `/work-planning/export?week=YYYY-MM-DD`
- `/work-planning/[id]/export`
- `/tickets/export`
- `/tickets/print`
- `/tickets/[id]/act/export`, якщо акт існує.

`WorkPlanningDocumentsMenu` відкриває:

- export усіх планів тижня;
- export конкретного плану.

Export читає дані, не змінює таблиці. Має включати ticket-и незалежно від source, якщо вони є в плані.

## 11. Workers / Objects / Directors

### Workers

Файли:

- `app/(app)/workers/page.tsx`
- `app/(app)/workers/[id]/page.tsx`
- `app/(app)/workers/actions.ts`
- `lib/supabase/workers.ts`

Кнопки:

- `Додати виконавця` → форма create;
- `Зберегти` у формі редагування;
- `Деактивувати`;
- `Видалити або деактивувати`;
- `Заявки` / `Заявки виконавця`;
- періоди на сторінці worker detail;
- `Друк / PDF`;
- `Відкрити заявку`;
- `Зняти виконавця` з worker detail.

Вплив на заявки/плани:

- worker categories впливають на рекомендації виконавців;
- `telegram_id` впливає на dispatch;
- inactive worker не має вибиратись для нових призначень;
- деактивація worker не переносить існуючі planned items автоматично.

### Objects

Файли:

- `app/(app)/objects/page.tsx`
- `app/(app)/objects/actions.ts`
- `app/(app)/objects/object-row.tsx`
- `app/(app)/objects/create-object-form.tsx`

Кнопки:

- `Керування директорами` → `/objects/directors`;
- mobile card `Директори магазинів` → `/objects/directors`;
- filters/search/status;
- view switch cards/table;
- `Редагувати`;
- `Зберегти зміни`;
- `Активувати` / `Зробити неактивним`;
- `Деактивувати об'єкт`;
- `Створити об'єкт`;
- `Згенерувати aliases`.

Вплив:

- object active status впливає на створення/вибір заявок;
- object/director links впливають на director portal access.

### Directors

Файли:

- `app/(app)/objects/directors/page.tsx`
- `app/(app)/objects/directors/[id]/page.tsx`
- `app/(app)/objects/directors/actions.ts`

Кнопки:

- tabs status: всі/pending/approved/rejected;
- `Відкрити`;
- `До об'єктів`;
- `Зберегти профіль`;
- `Підтвердити акаунт`;
- `Відхилити`;
- `Підтвердити` object link;
- `Основний`;
- `Прибрати`;
- `Додати магазин`;
- `Підтвердити` object request;
- `Відхилити` object request.

Вплив:

- `profiles.approval_status`;
- `profiles.is_active`;
- `director_objects.approval_status`;
- `director_objects.is_primary`;
- director object requests.

## 12. Таблиця всіх кнопок

| Сторінка | Кнопка/дія | Хто бачить | Коли доступна | Action | Що змінює | Ризик |
|---|---|---|---|---|---|---|
| `/tickets` | Нова заявка | roles з `canCreateTicket` | завжди на списку | link | нічого | немає |
| `/tickets` | Excel | admin UI | при перегляді списку | route `/tickets/export` | читає tickets | export має повторити filters |
| `/tickets` | Друк | admin UI | при перегляді списку | route `/tickets/print` | читає tickets | print має повторити filters |
| `/tickets` | Відкрити | admin UI | для кожної заявки | link | нічого | немає |
| `/tickets` | Видалити | `canHardDeleteTicket` | у menu заявки | `hardDeleteTicketAction` | deletes ticket/deps | незворотно |
| `/tickets/[id]` | Підтвердити | `canConfirmTicket` | `pending_review` | `confirmTicketAction` / `confirmDirectorTicketAction` | tickets, work_plan_items, ticket_history | plan warning після підтвердження |
| `/tickets/[id]` | Відхилити | `canConfirmTicket` | `pending_review` | `rejectTicketAction` / `rejectDirectorTicketAction` | tickets, ticket_history | destructive status |
| `/tickets/[id]` | Зберегти статус | `canEditTicket` | editable ticket | `updateTicketStatusAction` | tickets, ticket_history | не рухає план |
| `/tickets/[id]` | Призначити | `canConfirmTicket` | якщо є workers | `assignWorkerAction` | tickets, ticket_history | не рухає plan item |
| `/tickets/[id]` | Зняти виконавця | permission helper | якщо worker є | `unassignWorkerAction` | tickets, ticket_history | plan item може лишитись |
| `/tickets/[id]` | Зберегти категорію | `canConfirmTicket` | якщо є categories | `updateTicketCategoryAction` | tickets, ticket_history | не рухає plan item |
| `/tickets/[id]` | Надіслати виконавцю | `canConfirmTicket` | якщо є worker | `sendTicketToWorkerAction` | tickets/history via helper, Telegram | worker без telegram_id |
| `/tickets/[id]` | Підтвердити виконання | `canConfirmTicket` | `waiting_admin_confirmation` | `confirmWorkerCompletionAction` | tickets, history, Telegram | може обійти director act flow |
| `/tickets/[id]` | Повернути | `canConfirmTicket` | `waiting_admin_confirmation` | `returnWorkerCompletionAction` | tickets, ticket_history | потрібен зрозумілий feedback |
| `/tickets/[id]` | Завантажити фото | `canAddTicketPhoto` | згідно type/status | `uploadTicketPhotosAction` | storage, ticket_photos | storage failure |
| `/tickets/[id]` | Додати коментар | `canEditTicket` | editable ticket | `addTicketCommentAction` | ticket_comments, ticket_history | шум у history |
| `/tickets/[id]` | Видалити заявку | admin only | якщо дозволено | `hardDeleteTicketAction` | deletes ticket/deps | незворотно |
| `/tickets/new` | Створити заявку | `canCreateTicket` | valid form | `createTicketAction` | tickets, photos, history | не додає в план |
| `/ai-tickets` | Підтвердити | admin roles | AI pending | `confirmAiTicketAction` | tickets, history, Telegram | не додає в plan |
| `/ai-tickets` | Відхилити | admin roles | AI pending | `rejectAiTicketAction` | tickets, history | destructive status |
| `/ai-tickets` | Зберегти правки | admin roles | details open | `updateAiTicketAction` | tickets, history | може відрізнятись від `/tickets/[id]` |
| `/ai-tickets` | Зберегти виконавця | admin roles | workers list | `assignWorkerToAiTicketAction` | tickets, history | Telegram не надсилається автоматично |
| `/work-planning` | Створити план | admin roles | list page | link `?create=1` | нічого | немає |
| `/work-planning` | Створити план submit | admin roles | create mode | `createWorkPlanAction` | work_plans, work_plan_items | дубль блокується тільки active planned check |
| `/work-planning` | Видалити план | admin roles | plan not done | `deleteWorkPlanAction` | work_plans/items/dispatches/history | destructive |
| `/work-planning` | Документи | admin roles | list page | menu links | reads/export | filters/week clarity |
| `/work-planning/[id]` | Надіслати план | admin roles | draft | `sendWorkPlanAction` | work_plan_dispatches, work_plans | Telegram failures/skips |
| `/work-planning/[id]` | Повторити невдалі | admin roles | sent/partially/done with failed | `retryFailedWorkPlanDispatchAction` | dispatches | repeat spam risk low |
| `/work-planning/[id]` | Надіслати повторно всім | admin roles | sent/partially/done | `resendWorkPlanToAllAction` | dispatches | дубль Telegram повідомлень |
| `/work-planning/[id]` | Зберегти план | admin roles | draft | `updateWorkPlanAction` | work_plans | period normalized |
| `/work-planning/[id]` | Скасувати план | admin roles | draft | `cancelWorkPlanAction` | work_plans.status | заявки лишаються |
| `/work-planning/[id]` | Прибрати item | admin roles | draft | `removeWorkPlanItemAction` | work_plan_items | заявка лишається без плану |
| `/work-planning/[id]` | Перенести item | admin roles | draft + target draft | `moveWorkPlanItemAction` | work_plan_items, history | worker/category conflict |
| `/work-planning/[id]` | Quick status | permission helper | mobile modal | `quickUpdateTicketStatusAction` | tickets, history | не змінює plan status напряму |
| `/work-planning/[id]` | Quick worker | `canConfirmTicket` | mobile modal | `quickAssignWorkerAction` | tickets, history | не переносить item |
| `/work-planning/[id]` | Quick category | `canConfirmTicket` | mobile modal | `quickUpdateTicketCategoryAction` | tickets, history | прямо не змінює plan |
| `/work-planning/[id]` | Quick comment | `canEditTicket` | mobile modal | `quickAddTicketCommentAction` | ticket_comments, history | comment noise |
| `/workers` | Додати виконавця | admin roles | page | `createWorkerAction` | workers, worker_categories | invalid telegram_id |
| `/workers` | Зберегти worker | admin roles | edit details | `updateWorkerAction` | workers, worker_categories | впливає на routing future |
| `/workers` | Деактивувати | admin roles | active worker | `deactivateWorkerAction` | workers.is_active | старі assignments лишаються |
| `/workers` | Видалити/деактивувати | admin roles | details | `deleteOrDeactivateWorkerAction` | workers або is_active | залежить від ticket refs |
| `/objects` | Керування директорами | admin roles | header/mobile card | link | нічого | немає |
| `/objects` | Створити об'єкт | admin roles | create form | `createObjectAction` | objects | aliases quality |
| `/objects` | Редагувати/зберегти | admin roles | row edit | `updateObjectAction` | objects | заявки зберігають old object_id |
| `/objects` | Активувати/деактивувати | admin roles | row/card | `setObjectActiveAction` | objects.is_active | new tickets availability |
| `/objects/directors` | Відкрити | admin roles | director card | link | нічого | немає |
| `/objects/directors/[id]` | Підтвердити акаунт | admin roles | director profile | `approveDirectorAccountAction` | profiles, director_objects | відкриває director access |
| `/objects/directors/[id]` | Відхилити | admin roles | director profile | `rejectDirectorAccountAction` | profiles, director_objects | блокує director access |
| `/objects/directors/[id]` | Додати магазин | admin roles | link form | `addDirectorObjectLinkAction` | director_objects | неправильний object link |
| `/objects/directors/[id]` | Прибрати магазин | admin roles | link row | `removeDirectorObjectLinkAction` | director_objects delete | director loses access |

## 13. Таблиця select/dropdown дій

| Сторінка | Select/dropdown | Варіанти | Action | Що змінює | Ризик |
|---|---|---|---|---|---|
| `/tickets` | status filter | all/statuses | GET query | читає tickets | filters можуть плутати source |
| `/tickets` | category filter | categories | GET query | читає tickets | inactive categories |
| `/tickets` | worker filter | workers | GET query | читає tickets | old inactive worker |
| `/tickets` | source filter | all/director/etc | GET query | читає tickets | AI/director separation |
| `/tickets/[id]` | status | allowed statuses | `updateTicketStatusAction` | tickets, history | не рухає plan |
| `/tickets/[id]` | worker | active workers | `assignWorkerAction` | tickets, history | не рухає plan |
| `/tickets/[id]` | category | active categories | `updateTicketCategoryAction` | tickets, history | не рухає plan |
| `/tickets/[id]` | priority | якщо UI є | відповідний action, якщо є | tickets | не всюди присутній |
| `/tickets/new` | object | active objects | `createTicketAction` | tickets.object_id | object inactive validation |
| `/tickets/new` | category | active categories | `createTicketAction` | tickets.category_id | category required |
| `/tickets/new` | priority | priorities | `createTicketAction` | tickets.priority | default medium |
| `/ai-tickets` | object | objects | `updateAiTicketAction` | tickets.object_id | before confirm |
| `/ai-tickets` | category | categories | `updateAiTicketAction` | tickets.category_id | affects worker recommendation |
| `/ai-tickets` | priority | priorities | `updateAiTicketAction` | tickets.priority | before confirm |
| `/ai-tickets` | worker | workers sorted by recommendation | `assignWorkerToAiTicketAction` | tickets.assignee_worker_id | Telegram not auto |
| `/work-planning` | week slider | generated weeks | GET query | reads plans | default is next week |
| `/work-planning` | category/worker/status/object/assignment filters | lists | GET query | reads tickets | only create-mode rows |
| `/work-planning` | ticket checkbox | planning tickets | `createWorkPlanAction` | work_plan_items | already planned disabled/check |
| `/work-planning/[id]` | target plan | draft plans | `moveWorkPlanItemAction` | work_plan_items | target worker mismatch |
| `/work-planning/[id]` | quick status radio | allowed statuses | `quickUpdateTicketStatusAction` | tickets, history | no plan move |
| `/work-planning/[id]` | quick worker radio/search | workers | `quickAssignWorkerAction` | tickets, history | no plan move |
| `/work-planning/[id]` | quick category radio/search | categories | `quickUpdateTicketCategoryAction` | tickets, history | no plan move |
| `/workers` | category checkboxes | categories | create/update worker | worker_categories | mapping/recommendation changes |
| `/workers` | active checkbox | boolean | create/update worker | workers.is_active | can disable future use |
| `/objects` | status filter | active/inactive | GET query | reads objects | none |
| `/objects/directors/[id]` | approval status | pending/approved/rejected | `updateDirectorProfileAction` | profiles | can bypass explicit approve/reject buttons |
| `/objects/directors/[id]` | object link | objects | `addDirectorObjectLinkAction` | director_objects | wrong store access |

## 14. Небезпечні дії

| Дія | Сторінка | Confirm є? | Що видаляє/скасовує | Чи можна відновити | Ризик |
|---|---|---|---|---|---|
| Видалити заявку | `/tickets`, `/tickets/[id]` | так, через confirm UI | ticket і залежності | ні, без backup | hard delete history/photos |
| Відхилити заявку | `/tickets/[id]`, `/ai-tickets` | залежить від UI | status rejected | вручну зміною status частково | може заблокувати реальну заявку |
| Видалити план | `/work-planning` menu | так | work_plan, items, dispatches | ні, треба створити заново | заявки лишаються без плану |
| Скасувати план | `/work-planning/[id]` | не всюди явно | status cancelled | вручну через БД або новий план | draft unavailable |
| Прибрати item | `/work-planning/[id]` | ні/неявно | work_plan_items row | можна додати в інший plan вручну | заявка випадає з плану |
| Перенести item | `/work-planning/[id]` | ні | змінює work_plan_id | так, повторним move | wrong plan/worker |
| Деактивувати worker | `/workers` | частково | workers.is_active false | так, активувати через edit | old planned items лишаються |
| Видалити/деактивувати worker | `/workers` | так | delete або deactivate | залежить від helper | assignments/dispatch |
| Деактивувати object | `/objects` | є window.confirm в row form | objects.is_active false | так | new tickets не зможуть вибрати object |
| Прибрати director object link | `/objects/directors/[id]` | не видно явного confirm | director_objects row | додати знову | director loses access |

## 15. Які кнопки змінюють які таблиці

| Action | tickets | work_plans | work_plan_items | ticket_history | work_plan_dispatches | workers | objects |
|---|---|---|---|---|---|---|---|
| `createTicketAction` | створює | - | - | створює | - | - | читає |
| `confirmTicketAction` | оновлює | читає/ensure helper | створює | створює | - | читає | - |
| `confirmDirectorTicketAction` | оновлює | читає/ensure helper | створює | створює | - | читає | - |
| `rejectTicketAction` | оновлює | - | - | створює | - | - | - |
| `updateTicketStatusAction` | оновлює | - | - | створює | - | - | - |
| `updateTicketCategoryAction` | оновлює | - | - | створює | - | - | - |
| `assignWorkerAction` | оновлює | - | - | створює | - | читає | - |
| `unassignWorkerAction` | оновлює | - | - | створює | - | - | - |
| `sendTicketToWorkerAction` | оновлює | - | - | створює | - | читає | - |
| `hardDeleteTicketAction` | видаляє | - | може лишати refs якщо FK cascade немає | видаляє | - | - | - |
| `confirmAiTicketAction` | оновлює | - | - | створює | - | читає | - |
| `createWorkPlanAction` | читає | створює | створює | - | - | - | - |
| `deleteWorkPlanAction` | читає | видаляє | видаляє | створює | видаляє | - | - |
| `updateWorkPlanAction` | - | оновлює | - | - | - | - | - |
| `cancelWorkPlanAction` | - | оновлює | - | - | - | - | - |
| `removeWorkPlanItemAction` | - | читає | видаляє | - | - | - | - |
| `moveWorkPlanItemAction` | читає | читає | оновлює | створює | - | читає | - |
| `sendWorkPlanAction` | читає | оновлює | читає | - | створює | читає | - |
| `quickUpdateTicketStatusAction` | оновлює | - | - | створює | - | - | - |
| `quickAssignWorkerAction` | оновлює | - | - | створює | - | читає | - |
| `quickUpdateTicketCategoryAction` | оновлює | - | - | створює | - | - | - |
| `createWorkerAction` | - | - | - | - | - | створює | - |
| `updateWorkerAction` | - | - | - | - | - | оновлює | - |
| `createObjectAction` | - | - | - | - | - | - | створює |
| `updateObjectAction` | - | - | - | - | - | - | оновлює |

## 16. Ticket history

Дії, які пишуть `ticket_history`:

- створення заявки: `createTicketAction`;
- додавання коментаря: `addTicketCommentAction`, `quickAddTicketCommentAction`;
- зміна статусу: `updateTicketStatusAction`, `quickUpdateTicketStatusAction`;
- зміна категорії: `updateTicketCategoryAction`, `quickUpdateTicketCategoryAction`;
- призначення/зняття виконавця: через `assignTicketToWorker`, `unassignTicketWorker`, quick variants;
- підтвердження заявки: `confirmTicketAction`, `confirmDirectorTicketAction`;
- відхилення заявки: `rejectTicketAction`, `rejectDirectorTicketAction`, `rejectAiTicketAction`;
- підтвердження AI: `confirmAiTicketAction`;
- редагування AI: `updateAiTicketAction`;
- додавання в план: `addConfirmedTicketToWeeklyDraftPlan`, `autoAddTelegramTicketToWeeklyDraftPlan`, carry-over helper;
- перенесення item-а між планами: `moveWorkPlanItemToDraftPlan`;
- видалення плану: `deleteWorkPlan` пише історію для affected tickets;
- worker completion confirm/return через відповідні actions/helpers.

Ризик: hard delete заявки видаляє всю її історію.

## 17. Telegram-related actions

Кнопки і actions, які надсилають Telegram:

- `/tickets/[id]` → `sendTicketToWorkerAction` → `sendTicketToWorker`.
- `/tickets/[id]` → `confirmWorkerCompletionAction` → `sendWorkerCompletionConfirmedNotification`.
- `/ai-tickets` → `confirmAiTicketAction` може надіслати заявку worker-у після підтвердження.
- `/work-planning/[id]` → `sendWorkPlanAction`, `retryFailedWorkPlanDispatchAction`, `resendWorkPlanToAllAction` → `sendWorkPlanToWorkers`.

`sendWorkPlanToWorkers`:

- групує plan items по `worker_id`;
- для worker без `telegram_id` створює dispatch `skipped_no_telegram`;
- для помилки створює `failed`;
- для успіху створює `sent`;
- оновлює `work_plans.status = sent`, `sent_at`;
- зберігає записи у `work_plan_dispatches`.

Ризик: `resend_all` може створити повторні Telegram повідомлення для всіх worker-ів.

## 18. Ризики поточного керування

1. `/ai-tickets` confirm-flow відрізняється від `/tickets/[id]`: не додає заявку в weekly draft plan.
2. Зміна виконавця після планування не переносить заявку в план нового виконавця.
3. Зміна категорії після планування не переносить заявку в інший план.
4. Quick modal прямо попереджає, що зміна категорії не змінює план автоматично.
5. Manual/admin заявка з `/tickets/new` не додається в план автоматично.
6. Hard delete заявки видаляє history/photos/comments і є незворотним.
7. Видалення/скасування плану залишає заявки в системі, але без активного плану; адмін має сам це розуміти.
8. Work planning default відкриває next week, що може плутати з current week.
9. Telegram dispatch має кілька modes; без ясного UI-опису `resend_all` може спричинити дубль повідомлень.
10. Старі або inactive workers можуть лишатись у вже створених tickets/items.
11. Дії над заявкою доступні в кількох місцях: `/tickets/[id]`, `/ai-tickets`, `/work-planning/[id]`; логіка не всюди однакова.
12. Some existing files display mojibake text in terminal output; аудит не змінював encoding.

## 19. Що варто покращити наступним етапом

1. Уніфікувати confirm-flow для director/AI/manual заявок через один service layer.
2. Додати при confirm явний вибір: поточний тиждень / наступний тиждень / без плану.
3. На `/tickets` і `/tickets/[id]` показувати badge `У плані` з назвою плану і тижнем.
4. Після зміни виконавця питати: `Перемістити заявку в план нового виконавця?`.
5. Після зміни категорії питати: `Перемістити заявку в план категорії?`.
6. Зробити один Action Panel для заявки, щоб однакові дії не жили в різних UI з різною логікою.
7. Винести destructive actions вниз і додати однакові confirm dialogs.
8. Спрощено поділити `/work-planning`: поточний тиждень, наступний тиждень, архів.
9. Додати пояснення Telegram dispatch modes: initial/retry/resend all.
10. Додати SQL/адмінський індикатор для заявок, які підтверджені, але не в плані.

## 20. SQL для самоперевірки

### Заявки без плану серед активних

```sql
select
  t.id,
  t.number,
  t.source,
  t.status,
  t.category_id,
  t.assignee_worker_id
from tickets t
left join work_plan_items wpi on wpi.ticket_id = t.id
where t.status in ('new', 'assigned', 'in_progress', 'waiting_admin_confirmation')
  and wpi.id is null
order by t.created_at desc;
```

### AI/Telegram pending

```sql
select id, number, source, status, category_id, assignee_worker_id
from tickets
where status = 'pending_review'
  and coalesce(source, '') <> 'director_portal'
order by created_at desc;
```

### Director pending

```sql
select id, number, source, status, category_id, assignee_worker_id
from tickets
where status = 'pending_review'
  and source = 'director_portal'
order by created_at desc;
```

### Дублі в одному плані

```sql
select ticket_id, work_plan_id, count(*)
from work_plan_items
group by ticket_id, work_plan_id
having count(*) > 1;
```

### Дублі в одному тижні

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

### Dispatch-и з помилками

```sql
select
  work_plan_id,
  worker_id,
  status,
  error,
  sent_at
from work_plan_dispatches
where status in ('failed', 'skipped_no_telegram')
order by sent_at desc;
```

## 21. Переглянуті файли

- `app/(app)/tickets/page.tsx`
- `app/(app)/tickets/[id]/page.tsx`
- `app/(app)/tickets/[id]/actions.ts`
- `app/(app)/tickets/[id]/director-actions.ts`
- `app/(app)/tickets/new/page.tsx`
- `app/(app)/tickets/new/actions.ts`
- `app/(app)/ai-tickets/page.tsx`
- `app/(app)/ai-tickets/actions.ts`
- `app/(app)/work-planning/page.tsx`
- `app/(app)/work-planning/actions.ts`
- `app/(app)/work-planning/[id]/page.tsx`
- `app/(app)/work-planning/[id]/actions.ts`
- `app/(app)/work-planning/[id]/quick-ticket-modal.tsx`
- `app/(app)/work-planning/[id]/quick-ticket-actions.ts`
- `components/work-planning/work-planning-documents-menu.tsx`
- `app/(app)/workers/page.tsx`
- `app/(app)/workers/[id]/page.tsx`
- `app/(app)/workers/actions.ts`
- `app/(app)/objects/page.tsx`
- `app/(app)/objects/actions.ts`
- `app/(app)/objects/object-row.tsx`
- `app/(app)/objects/create-object-form.tsx`
- `app/(app)/objects/directors/page.tsx`
- `app/(app)/objects/directors/[id]/page.tsx`
- `app/(app)/objects/directors/actions.ts`
- `lib/supabase/work-plans.ts`
- `lib/supabase/workers.ts`
- `lib/telegram/work-plan-notifications.ts`
- `lib/telegram/worker-notifications.ts`

