# Пропозиція нової логіки планування робіт

Дата: 2026-08-09

Статус: пропозиція бізнес-логіки перед реалізацією. Код, міграції і production-дані цим документом не змінюються.

База для пропозиції: `docs/planning-current-functionality-audit.md`.

## 1. Навіщо змінювати логіку

Поточна система планування вже працює, але має кілька різних сценаріїв, які поводяться не однаково:

- директорські заявки після підтвердження додаються в план через `addConfirmedTicketToWeeklyDraftPlan()`;
- Telegram group заявки можуть додаватися в план ще при створенні, до адмінського підтвердження;
- `/ai-tickets` confirm-flow підтверджує і призначає виконавця, але не гарантує додавання в план;
- manual/admin заявки створюються як `new` і автоматично в план не потрапляють;
- автоплани створюються на наступний тиждень, але адмін не вибирає явно, куди саме класти заявку;
- carry-over запускається як side-effect створення draft plans;
- mapping категорій зав'язаний на текст назви категорії;
- зміна категорії або виконавця після додавання в план не переміщує заявку між планами;
- є DB-захист від дубля в одному плані, але немає єдиного правила "одна заявка в одному тижні".

Головна проблема не в тому, що модуль не працює, а в тому, що планування не має одного зрозумілого decision point. Зараз система сама вирішує "наступний тиждень", а різні джерела заявок проходять різними шляхами.

## 2. Ціль нової логіки

Нова логіка має зробити планування контрольованим і передбачуваним:

1. Кожна заявка після перевірки адміном має пройти однаковий planning decision.
2. Адмін має явно вибирати:
   - додати в поточний тиждень;
   - додати в наступний тиждень;
   - підтвердити без плану.
3. Директорські, AI/Telegram і manual/admin заявки мають використовувати один service layer планування.
4. Заявка не має потрапляти в план до підтвердження, якщо це pending-review заявка.
5. Carry-over має переносити тільки вже підтверджені активні заявки.
6. Зміна виконавця або категорії після планування має мати зрозумілу поведінку.
7. Duplicate protection має бути однаковим для всіх flows.

## 3. Основна модель рішення

Пропонується ввести поняття planning decision.

Для кожної заявки, яку адмін підтверджує або створює вручну, система має визначити:

- `planningMode`: `current_week`, `next_week`, `no_plan`
- `targetWeek`: період робочого тижня, якщо обрано план
- `targetPlan`: конкретний plan, якщо його можна визначити
- `targetWorker`: виконавець, якщо його можна визначити
- `reason`: пояснення, якщо заявка не додана в план

Рекомендована бізнес-логіка:

| Вибір адміна | Що відбувається |
|---|---|
| Поточний тиждень | Заявка підтверджується і додається в draft/active plan поточного робочого тижня |
| Наступний тиждень | Заявка підтверджується і додається в draft plan наступного робочого тижня |
| Без плану | Заявка підтверджується, але work_plan_item не створюється |

Якщо адмін не вибрав режим, default має бути безпечним. Рекомендація:

- для pending-review заявок default у UI: "Наступний тиждень";
- але action має явно отримувати значення, щоб не було прихованого автопланування.

## 4. Підтвердження заявки

### Нова загальна схема

Підтвердження заявки має працювати через один централізований helper:

```ts
confirmTicketWithPlanningDecision(ticketId, {
  actorProfileId,
  planningMode,
  targetWeek,
  preferredWorkerId,
})
```

Helper має:

1. Перевірити права.
2. Перевірити, що заявку можна підтвердити.
3. Перевірити `object_id` і `category_id`.
4. Визначити статус після підтвердження:
   - `assigned`, якщо є `assignee_worker_id`;
   - `new`, якщо виконавця немає.
5. Оновити ticket:
   - `status`;
   - `admin_confirmed_at`;
   - `confirmed_by_profile_id`;
   - `updated_at`.
6. Записати `ticket_history`: "Заявку підтверджено".
7. Якщо `planningMode = no_plan`, записати history: "Заявку підтверджено без додавання в план".
8. Якщо `planningMode = current_week` або `next_week`, викликати planning helper.
9. Якщо план знайдено, створити `work_plan_items`.
10. Якщо план не знайдено, не відкотити підтвердження, але повернути warning.

### Важливе правило

Підтвердження заявки і додавання в план мають бути пов'язані, але не мають ламати одне одного:

- якщо ticket підтвердився, але план не знайдено, ticket лишається підтвердженим;
- адмін бачить warning і може вручну додати заявку в план;
- ticket_history має містити причину.

## 5. Вибір: поточний тиждень / наступний тиждень / без плану

На сторінці `/tickets/[id]` для pending-review заявки потрібно показати блок "Планування після підтвердження".

Варіанти:

1. `Додати в поточний тиждень`
2. `Додати в наступний тиждень`
3. `Підтвердити без плану`

Поруч потрібно показати короткі підказки:

- Поточний тиждень: "заявка піде в план, який виконується зараз".
- Наступний тиждень: "заявка піде в чернетку наступного плану".
- Без плану: "заявку можна буде додати вручну пізніше".

Якщо категорія не має mapping або немає виконавця:

- UI має показати попередження ще до натискання "Підтвердити", якщо це можна визначити.
- Але адмін все одно може підтвердити без плану.

## 6. Директорські заявки

### Поточна проблема

Директор створює заявку, вона йде в `pending_review`, а при підтвердженні система автоматично додає її в наступний тиждень. Адмін не вибирає, чи це терміново на поточний тиждень, чи краще на наступний, чи поки без плану.

### Нова логіка

1. Директор створює заявку:
   - `source = director_portal`
   - `status = pending_review`
   - план не створюється і item не додається.

2. Адмін відкриває заявку:
   - бачить блок "Заявка від директора";
   - може змінити категорію;
   - може призначити виконавця;
   - може вибрати planning mode.

3. Адмін підтверджує:
   - ticket стає `new` або `assigned`;
   - заповнюється `admin_confirmed_at`;
   - заповнюється `confirmed_by_profile_id`;
   - залежно від planning mode створюється `work_plan_item` або ні.

4. Директор у кабінеті бачить:
   - pending: "На перевірці";
   - confirmed без плану: "Підтверджена";
   - in plan: "Додана в план виконання" / "У плані";
   - sent/in progress/done як зараз.

### Рекомендований default

Для директорських заявок default у UI: `Наступний тиждень`, але адмін має мати явний вибір.

## 7. AI / Telegram заявки

### Поточна проблема

Telegram group intake створює pending_review заявку, а `/ai-tickets` confirm-flow має підтверджувати її через shared confirm/planning service і додавати в plan без прямого Telegram-відправлення виконавцю.

### Нова логіка

1. AI/Telegram створює заявку:
   - `source = telegram_group` або `telegram_private_test`;
   - `status = pending_review`;
   - plan item не створюється.

2. AI може запропонувати:
   - object;
   - category;
   - priority;
   - recommended worker.

3. Адмін підтверджує:
   - перевіряє/редагує category;
   - перевіряє/призначає worker;
   - вибирає поточний тиждень / наступний тиждень / без плану.

4. Тільки після підтвердження заявка може потрапити в plan.

5. Telegram repeats:
   - repeat має записуватись у `ticket_repeats`;
   - repeat не має створювати новий plan item;
   - якщо базова заявка ще не підтверджена, repeat не має додавати її в plan.

### Що змінити концептуально

`autoAddTelegramTicketToWeeklyDraftPlan()` варто або прибрати з create-flow, або перевести у режим "після підтвердження". До підтвердження AI/Telegram заявка має жити у review queue.

## 8. Manual/admin заявки

### Поточна поведінка

Manual/admin заявка створюється як `new` і автоматично в plan не додається.

### Нова логіка

При створенні manual/admin заявки адміну варто дати такий самий planning choice:

- створити без плану;
- створити і додати в поточний тиждень;
- створити і додати в наступний тиждень.

Default:

- для звичайної manual заявки: `Без плану`;
- якщо адмін заповнив worker/category і хоче одразу планувати: дозволити вибір.

Це можна зробити другим етапом. На першому етапі достатньо уніфікувати pending-review confirm flows.

## 9. Carry-over

### Нова логіка carry-over

Carry-over має бути окремою контрольованою дією, а не побічним ефектом створення draft plans.

Рекомендовано:

1. Окремий helper:

```ts
carryOverUnfinishedTickets({
  fromWeek,
  toWeek,
  actorProfileId,
  dryRun,
})
```

2. Окрема кнопка або cron:
   - "Перенести незавершені в наступний тиждень".

3. Перед перенесенням система показує preview:
   - скільки заявок буде перенесено;
   - які заявки не переносяться;
   - які заявки не мають mapping.

4. Повторний запуск не створює дублікати.

### Статуси для перенесення

| Status | Переносити? | Причина |
|---|---|---|
| `new` | Так | підтверджена, але ще не виконана |
| `assigned` | Так | призначена, але не завершена |
| `in_progress` | Так | у роботі |
| `waiting` | Так | активна пауза/очікування |
| `waiting_admin_confirmation` | Так | виконання очікує підтвердження |
| `pending_review` | Ні | ще не підтверджена адміном |
| `done` | Ні | закрита |
| `rejected` | Ні | закрита |
| `cancelled` | Ні | закрита |

Ключове правило: `pending_review` не переносити ніколи.

## 10. Визначення виконавця

### Пропонований порядок

1. Якщо адмін явно вибрав `assignee_worker_id`, використовувати його.
2. Якщо виконавця не вибрано, але category має mapping, запропонувати mapped worker.
3. Якщо category має кількох можливих workers, показати список і попросити вибір.
4. Якщо mapping немає, залишити worker empty і показати warning.

### Що має бути джерелом правди

Рекомендація: перейти на category-based routing table.

Ідеальна модель:

```txt
planning_category_routes
- id
- category_id
- default_worker_id
- default_plan_title або plan_group
- is_active
- created_at
- updated_at
```

Якщо не робити міграцію одразу, можна на першому етапі мати config у коді, але ключем має бути `category_id` або стабільний slug, а не текст `category.name`.

## 11. Визначення категорії

Категорія має бути обов'язковою для планування.

Правило:

- заявку можна підтвердити без плану навіть без mapping;
- заявку не можна автоматично додати в plan без category;
- якщо category відсутня, UI має вимагати вибрати категорію або обрати "Без плану".

Для AI/Telegram:

- AI може запропонувати category;
- адмін підтверджує або змінює category;
- тільки після цього працює planning.

Для director:

- директор вибирає category при створенні;
- адмін може її змінити перед підтвердженням.

## 12. Захист від дублікатів

### Бізнес-правило

Одна заявка може бути тільки в одному активному плані одного робочого тижня.

Активні status plans:

- `draft`
- `sent`
- `partially_done`

Закриті/неактивні:

- `done`
- `cancelled`

### Code-level перевірка

Перед insert у `work_plan_items` перевіряти:

1. Чи ticket уже є в target plan.
2. Чи ticket уже є в будь-якому active plan того самого тижня.
3. Якщо є:
   - не створювати дубль;
   - повернути `already_planned`;
   - показати адміну, в якому плані заявка вже є.

### DB-level варіант

Без зміни схеми неможливо просто зробити unique по `ticket_id + week`, бо `period_start/period_end` лежать у `work_plans`, а не в `work_plan_items`.

Можливі майбутні варіанти:

1. Додати `period_start`, `period_end` у `work_plan_items` і unique partial index.
2. Додати окрему таблицю `ticket_planning_assignments`.
3. Додати RPC/function, яка атомарно перевіряє і вставляє item.

На першому етапі достатньо code-level захисту.

## 13. Якщо змінили виконавця після додавання в план

Потрібно зробити явну поведінку.

Пропозиція:

1. Якщо ticket ще не в plan:
   - просто оновити `assignee_worker_id`.

2. Якщо ticket у draft plan:
   - показати confirm:
     "Заявка вже у плані. Перемістити її в план нового виконавця?"
   - варіанти:
     - перемістити;
     - залишити в поточному плані;
     - зняти з плану.

3. Якщо ticket у sent/partially_done plan:
   - не переміщати автоматично;
   - показати warning:
     "План уже надісланий. Зміна виконавця не змінить надісланий план автоматично."
   - дозволити manual move тільки адміну.

4. Якщо ticket done/rejected/cancelled:
   - не переміщати.

## 14. Якщо змінили категорію після додавання в план

Аналогічно до worker:

1. Якщо ticket не в plan:
   - просто оновити category.

2. Якщо ticket у draft plan:
   - запропонувати перемістити в plan, який відповідає новій category.

3. Якщо ticket у sent/partially_done plan:
   - не переміщати автоматично;
   - показати warning.

4. Якщо нова category не має mapping:
   - залишити в поточному plan або зняти з plan за рішенням адміна.

Важливо: зміна category не має тихо залишати item у старому plan без попередження.

## 15. UI зміни

### `/tickets/[id]`

Для pending-review заявки:

- блок "Підтвердження заявки";
- блок "Планування після підтвердження";
- radio/select:
  - Поточний тиждень;
  - Наступний тиждень;
  - Без плану;
- preview target plan:
  - назва plan;
  - worker;
  - period;
  - warning, якщо mapping не знайдено.

Кнопки:

- "Підтвердити"
- "Відхилити"

Після підтвердження:

- якщо додано в plan: success "Заявку додано в план: ..."
- якщо без plan: success "Заявку підтверджено без плану"
- якщо plan не знайдено: warning "Заявку підтверджено, але не додано в план"

### `/ai-tickets`

Замість окремого прихованого flow:

- AI ticket confirm має використовувати той самий planning decision UI;
- recommended worker показувати як підказку, не як безумовне рішення.

### `/work-planning`

Додати:

- явну вкладку/фільтр "Поточний тиждень";
- явну вкладку/фільтр "Наступний тиждень";
- кнопку "Створити/оновити чернетки";
- кнопку "Перенести незавершені";
- badge для source:
  - "Від директора";
  - "AI/Telegram";
  - "Manual".

### `/work-planning/[id]`

Додати або уточнити:

- action "Перемістити в інший план";
- warning при зміні worker/category;
- показ source заявки;
- показ, чи item був carry-over.

## 16. DB зміни, які можуть знадобитися

### Не обов'язково на першому етапі

Перший етап можна зробити без міграцій, якщо:

- planning decision передається через form/action;
- duplicate check робиться code-level;
- mapping лишається config у коді;
- history пишеться в існуючий `ticket_history`;
- plan membership визначається через `work_plan_items`.

### Бажані майбутні міграції

1. `planning_category_routes`

```txt
id uuid
category_id uuid references categories(id)
default_worker_id uuid references workers(id)
plan_title text
is_active boolean
created_at timestamptz
updated_at timestamptz
```

2. `ticket_planning_decisions`

```txt
id uuid
ticket_id uuid references tickets(id)
planning_mode text
target_period_start timestamptz
target_period_end timestamptz
work_plan_id uuid null
decided_by_profile_id uuid
decided_at timestamptz
result text
warning text null
```

3. Додаткові поля в `work_plan_items`:

```txt
source text null -- confirmed_ticket, manual, carry_over
created_by_profile_id uuid null
period_start timestamptz null
period_end timestamptz null
```

4. DB-level duplicate protection для одного ticket в одному тижні.

Це краще робити після code-level стабілізації, щоб не зачепити старі дублікати.

## 17. Що можна зробити без міграцій

Без міграцій можна:

1. Додати `planningMode` у confirm forms/actions.
2. Створити новий service helper:

```ts
addTicketToWorkPlanForWeek(ticketId, {
  week: "current" | "next",
  actorId,
  allowAlreadyPlanned,
})
```

3. Уніфікувати director confirm і generic confirm.
4. Уніфікувати AI confirm з generic planning helper.
5. Вимкнути auto-add Telegram pending-review заявки до плану при створенні.
6. Додати warning UI.
7. Додати code-level duplicate checks.
8. Заборонити carry-over `pending_review`.
9. Додати manual move behavior у draft plans.
10. Писати детальний `ticket_history`.

## 18. Безпечний покроковий план реалізації

### Етап 1. Уніфікувати helper-и без зміни UI

1. Створити planning service layer.
2. Винести common logic:
   - determine work week;
   - ensure draft plans for selected week;
   - route category to plan;
   - check duplicates;
   - insert work_plan_item;
   - write history.
3. Не змінювати поведінку UI, тільки підготувати код.

Ризик низький.

### Етап 2. Додати explicit planningMode у `/tickets/[id]`

1. Для director pending-review показати radio:
   - current week;
   - next week;
   - no plan.
2. Підключити до confirm action.
3. Показувати success/warning.

Ризик середній, але scope контрольований.

### Етап 3. Уніфікувати AI/Telegram confirm

1. Прибрати auto-add pending-review Telegram tickets у plan при створенні.
2. `/ai-tickets` confirm перевести на common planning service.
3. Repeats не мають планувати pending-review.

Ризик середній, бо зачіпає Telegram/AI flow.

### Етап 4. Manual/admin create ticket planning

1. Додати optional planning choice на `/tickets/new`.
2. Default лишити "Без плану".
3. Дозволити одразу додати в current/next week.

Ризик низько-середній.

### Етап 5. Carry-over як окрема дія

1. Заборонити перенесення `pending_review`.
2. Винести carry-over із side-effect ensure helper.
3. Додати preview.
4. Додати кнопку/cron.

Ризик середній.

### Етап 6. Worker/category changes after planning

1. Якщо plan draft, дозволити переміщення.
2. Якщо plan sent, показувати warning.
3. Писати history.

Ризик середній.

### Етап 7. DB стабілізація

1. Перевірити старі дублікати SQL-ом.
2. Вирішити, чи потрібна таблиця `planning_category_routes`.
3. Вирішити, чи потрібна таблиця `ticket_planning_decisions`.
4. Додати DB-level protection тільки після очищення/аналізу даних.

Ризик високий, робити після UI/service стабілізації.

## 19. Рекомендована фінальна бізнес-схема

Фінальна схема має виглядати так:

```txt
Ticket created
  -> pending_review, якщо director або AI/Telegram
  -> new, якщо manual/admin

Admin reviews ticket
  -> chooses category
  -> chooses/accepts worker
  -> chooses planning mode

Confirm
  -> ticket status new/assigned
  -> history confirmed
  -> if planning mode current/next:
       ensure/get plans for selected week
       route by worker/category
       check duplicates
       insert work_plan_item
       history planned
     else:
       history confirmed without plan

Execution
  -> work plan dispatch to workers
  -> worker marks done
  -> admin/director confirms completion

Carry-over
  -> only confirmed active statuses
  -> no pending_review
  -> no done/rejected/cancelled
```

## 20. Головне рішення, яке треба затвердити перед кодом

Потрібно бізнесово підтвердити три правила:

1. Чи має Telegram/AI заявка потрапляти в план тільки після підтвердження адміном?
   - Рекомендація: так.

2. Який default при підтвердженні pending-review заявки?
   - Рекомендація: "Наступний тиждень", але з явним вибором у UI.

3. Чи дозволяємо підтверджувати заявку без плану?
   - Рекомендація: так, щоб адмін міг підтвердити нестандартну заявку і запланувати її вручну пізніше.

Після затвердження цих трьох правил можна переходити до реалізації без хаотичного переписування всього модуля.
