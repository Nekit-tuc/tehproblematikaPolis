# Work planning data consistency fix

## Що було неузгоджено

На `/work-planning` одночасно показувались різні цифри:

- top counter: `107 не заплановано / 107 активні / 0 у планах`;
- hero: `14 планів / 19 заявок / 7 чернеток`;
- plan cards могли показувати інший стан.

Причина була не в одній таблиці, а в різних правилах підрахунку.

## Чому було 107 / 0 / 19

1. Top counter рахував active tickets не тим самим набором статусів.
2. Top counter раніше рахував planned тільки у `sent` / `partially_done`, тому заявки у `draft` планах давали `0 у планах`.
3. Top counter не був прив'язаний до selected week з URL.
4. Hero рахував `work_plan_items` по week overview.
5. Cards отримували plans через date range, але сторінка передавала ISO datetime для date-колонок `period_start` / `period_end`.
6. Week overview порівнював date-only `period_start` з Date range, де початок тижня має 17:00, що могло не зіставити план із правильним тижнем.

## Єдине правило active ticket

Активні для планування:

- `new`
- `assigned`
- `in_progress`
- `waiting`
- `waiting_admin_confirmation`

Не активні для планування:

- `pending_review`
- `rejected`
- `cancelled`
- `done`

## Єдине правило planned active ticket

Active ticket вважається запланованою у вибраному тижні, якщо:

- є `work_plan_items.ticket_id = tickets.id`;
- `work_plan_items.work_plan_id = work_plans.id`;
- `work_plans.period_start = selectedWeek.startDate`;
- `work_plans.period_end = selectedWeek.endDate`;
- `work_plans.status in ('draft','sent','partially_done')`;
- `tickets.status` входить в active planning statuses.

## Як тепер рахуються блоки

Top counter:

- `activeTicketsCount` = усі active tickets у системі;
- `plannedActiveTicketsCount` = active tickets у планах вибраного тижня зі статусами планів `draft`, `sent`, `partially_done`;
- `unplannedActiveTicketsCount = activeTicketsCount - plannedActiveTicketsCount`.

Hero:

- `plansCount` = плани вибраного тижня;
- `ticketsCount` = унікальні `ticket_id` із `work_plan_items` вибраного тижня;
- `draftCount` = плани зі статусом `draft`.

Plan cards:

- отримують plans за `selectedWeek.startDate/endDate`;
- counts беруться з embedded `work_plan_items`;
- статус заявки береться з `tickets.status`;
- статус плану береться з `work_plans.status`;
- `work_plan_items.status` не використовується.

## Що зроблено з work_plan_items.status

У `work_plan_items` немає колонки `status`. Insert автопланування більше не пише `status: "planned"`.

Для `work_plan_items` використовуються тільки реальні поля:

- `work_plan_id`
- `ticket_id`
- `worker_id`
- `category`
- `sort_order`

## Autoplanning

Autoplanning тепер:

- не падає через `work_plan_items.status`;
- якщо ticket вже є у вибраному тижні, повертає `already_planned`;
- якщо ticket є в іншому active plan, повертає `skipped` із поясненням натиснути `Оновити систему`;
- перевіряє всі active plan links для ticket і віддає пріоритет плану вибраного тижня.

## SQL для перевірки

### A. Структура work_plan_items

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'work_plan_items'
order by ordinal_position;
```

### B. Плани вибраного тижня

```sql
select id, title, status, period_start, period_end
from work_plans
where period_start >= '2026-08-20'
  and period_end <= '2026-08-27'
order by title;
```

### C. Work plan items вибраного тижня

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

### D. Active tickets

```sql
select status, count(*)
from tickets
where status in ('new','assigned','in_progress','waiting','waiting_admin_confirmation')
group by status
order by status;
```

### E. Active planned tickets вибраного тижня

```sql
select count(distinct t.id) as planned_active_tickets
from tickets t
join work_plan_items wpi on wpi.ticket_id = t.id
join work_plans wp on wp.id = wpi.work_plan_id
where t.status in ('new','assigned','in_progress','waiting','waiting_admin_confirmation')
  and wp.status in ('draft','sent','partially_done')
  and wp.period_start >= '2026-08-20'
  and wp.period_end <= '2026-08-27';
```

### F. Active tickets у старих активних планах

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
where t.status in ('new','assigned','in_progress','waiting','waiting_admin_confirmation')
  and wp.status in ('draft','sent','partially_done')
  and wp.period_end < '2026-08-20'
order by wp.period_start desc, t.number;
```

## Known issues

- Top counter показує active tickets у системі й planned active саме для вибраного тижня. Якщо active ticket запланована в іншому тижні, вона не входить у `у планах` для поточного selected week.
- Hero `Заявок` показує всі заявки в планах вибраного тижня, включно з done/rejected/cancelled, якщо такі items є в планах.
- Повну фактичну перевірку чисел треба зробити після refresh UI або через SQL, бо Codex не виконував live SQL проти Supabase.
