# Planning data consistency audit

## UI mismatch

Було видно три різні картини:

- dashboard modal після автопланування: `added=0`, `already=0`, `skipped=19`, `errors=88`;
- `/work-planning` summary: `108 активні / 0 у планах`;
- `/work-planning` hero: `14 планів`, `19 заявок`, `7 чернеток`;
- cards планів: `0 заявок`.

## Причина `work_plan_items.status`

Схема з migration `supabase/migrations/015_work_planning_center.sql` створює `work_plan_items` як зв'язувальну таблицю:

- `id`
- `work_plan_id`
- `ticket_id`
- `worker_id`
- `category`
- `sort_order`
- `created_at`

Колонки `status` у `work_plan_items` немає. Status заявки треба брати з `tickets.status`, status плану - з `work_plans.status`.

Dashboard autoplanning писав у `work_plan_items` поле `status: "planned"`, через що Supabase повертав:

`Could not find the 'status' column of 'work_plan_items' in the schema cache`

Це виправлено: insert тепер пише тільки реальні поля `work_plan_id`, `ticket_id`, `worker_id`, `category`, `sort_order`.

## Причина 108 / 19 / 0

Знайдено кілька різних правил підрахунку:

- `getWorkPlanningSummary()` рахував active tickets із `pending_review`, але не використовував єдиний список активних статусів для планування.
- `getWorkPlanningSummary()` рахував planned тільки у планах `sent` / `partially_done`, тому draft-плани не входили у `plannedActive`.
- Hero тижня рахував items у планах за тиждень окремим query.
- Cards отримували plans через `getWorkPlans`, але сторінка передавала `selectedWeek.startIso/endIso` для date-колонок `period_start/period_end`, що могло роз'їжджатися з week overview.

## Єдине правило active tickets

Для планування активними вважаються:

- `new`
- `assigned`
- `in_progress`
- `waiting`
- `waiting_admin_confirmation`

Не входять в active planning:

- `pending_review`
- `done`
- `rejected`
- `cancelled`

## Єдине правило planned active

Заявка вважається запланованою для активного планування, якщо:

- існує `work_plan_items` row для `ticket_id`;
- пов'язаний `work_plans.status` входить у `draft`, `sent`, `partially_done`;
- для summary `/work-planning` план належить поточному робочому тижню.

Архівні плани `done` залишаються історією, але не рахуються як active planning.

## Що змінено

- `lib/supabase/dashboard-plan-refresh.ts`
  - прибрано insert поля `status` у `work_plan_items`;
  - додано запис `category` у `work_plan_items`;
  - error details уже повертають `reasonCode` / `reasonText`.

- `lib/supabase/work-plans.ts`
  - `planningStatuses` тепер включає `waiting`;
  - summary більше не включає `pending_review`;
  - `plannedActive` рахує `draft`, `sent`, `partially_done`;
  - `plannedActive` обмежено поточним робочим тижнем.

- `app/(app)/work-planning/page.tsx`
  - `getWorkPlans` тепер отримує `selectedWeek.startDate/endDate`, а не ISO datetime.

## SQL для перевірки

### 1. Структура work_plan_items

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'work_plan_items'
order by ordinal_position;
```

### 2. Плани поточного тижня

```sql
select id, title, status, period_start, period_end
from work_plans
where period_start >= '2026-08-20'
  and period_end <= '2026-08-27'
order by title;
```

### 3. Items у поточному тижні

```sql
select
  wp.title,
  wp.status as plan_status,
  wpi.id as item_id,
  wpi.ticket_id,
  wpi.worker_id,
  t.number,
  t.status as ticket_status,
  c.name as category_name
from work_plan_items wpi
join work_plans wp on wp.id = wpi.work_plan_id
join tickets t on t.id = wpi.ticket_id
left join categories c on c.id = t.category_id
where wp.period_start >= '2026-08-20'
  and wp.period_end <= '2026-08-27'
order by wp.title, t.number;
```

### 4. Active tickets

```sql
select status, count(*)
from tickets
where status in ('new','assigned','in_progress','waiting','waiting_admin_confirmation')
group by status
order by status;
```

### 5. Active tickets with plan count

```sql
select
  count(*) filter (where wpi.id is null) as active_unplanned,
  count(*) filter (where wpi.id is not null) as active_planned
from tickets t
left join work_plan_items wpi on wpi.ticket_id = t.id
left join work_plans wp on wp.id = wpi.work_plan_id
where t.status in ('new','assigned','in_progress','waiting','waiting_admin_confirmation')
  and (
    wp.id is null
    or (
      wp.period_start >= '2026-08-20'
      and wp.period_end <= '2026-08-27'
      and wp.status in ('draft','sent','partially_done')
    )
  );
```

### 6. Tickets прив'язані до старих активних планів

```sql
select
  t.number,
  t.status as ticket_status,
  wp.title,
  wp.status as plan_status,
  wp.period_start,
  wp.period_end
from work_plan_items wpi
join tickets t on t.id = wpi.ticket_id
join work_plans wp on wp.id = wpi.work_plan_id
where t.status <> 'done'
  and wp.period_end < '2026-08-20'
  and wp.status in ('draft','sent','partially_done')
order by wp.period_start desc, t.number;
```

## Known issues

- `getWorkPlanningSummary()` зараз показує стан поточного робочого тижня. Якщо адмін переглядає майбутній або минулий тиждень, hero цього тижня і top summary можуть мати різний контекст.
- У коді є старі mojibake-рядки в UI/текстах. Їх не виправляли, бо заборонено запускати mass replace / encoding fixer.
- Якщо в базі вже є старі active items у минулих планах, треба натиснути `/work-planning` -> `Оновити систему`, щоб вивести not-done заявки зі старих active plans.
