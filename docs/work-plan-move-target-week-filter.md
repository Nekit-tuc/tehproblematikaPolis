# Work plan move target week filter

## Проблема

У select `Інший план` на сторінці `/work-planning/[id]` показувались draft-плани з усієї системи. Через це однакові авто-плани повторювались для різних робочих тижнів.

## Причина

`getDraftWorkPlansForMove()` фільтрував тільки:

- `status = draft`;
- `id != currentPlanId`.

Фільтра по `period_start` / `period_end` поточного плану не було.

## Нове правило UI

Select для перенесення показує тільки:

- `work_plans.status = draft`;
- `period_start = currentPlan.period_start`;
- `period_end = currentPlan.period_end`;
- `id != currentPlan.id`.

Тобто у відкритому плані тижня `20.08 - 27.08` видно тільки інші draft-плани цього самого тижня.

Якщо інших draft-планів у цьому тижні немає, UI показує:

`Немає інших планів у цьому тижні`

## Server guard

Server helper `moveWorkPlanItemToDraftPlan()` тепер додатково перевіряє:

- current plan існує;
- current plan має `status = draft`;
- target plan існує;
- target plan має `status = draft`;
- target plan не дорівнює current plan;
- target plan має той самий `period_start` і `period_end`;
- duplicate item у target plan не існує.

Якщо target plan з іншого робочого тижня, дія повертає:

`Не можна перенести заявку в план іншого робочого тижня.`

## Доступні статуси

Для перенесення доступні тільки draft-плани.

Не показуються:

- `sent`;
- `partially_done`;
- `done`;
- `cancelled`;
- плани інших тижнів.

## Known issues

- Якщо у межах одного тижня випадково створено два draft-плани з однаковою назвою, обидва залишаться у select, бо це різні записи одного тижня. Це краще виправляти окремою cleanup-процедурою або constraint-логікою.
