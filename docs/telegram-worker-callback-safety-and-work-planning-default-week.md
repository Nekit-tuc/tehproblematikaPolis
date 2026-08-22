# Telegram worker callback safety and work-planning default week

## Старі Telegram-кнопки

У виконавців можуть залишатися старі Telegram-повідомлення з кнопкою `Виконав`. Вони фізично залишаються в чаті навіть після перенесення заявки в інший план, перепризначення іншому виконавцю або закриття старого тижня.

Старий і новий UX використовують короткий callback `wd:<token>`. Token зберігається в `worker_ticket_actions` і вказує на `ticket_id`, `worker_id` та дію `worker_done`.

## Safe completion guard

Перед зміною заявки handler виконує `completeTicketFromWorkerTelegram`.

Перевірки:

- token існує і має action `worker_done`;
- token ще не використаний і не протермінований;
- ticket існує;
- worker існує;
- Telegram user відповідає worker.telegram_id;
- ticket status дозволяє виконання;
- заявка не перепризначена іншому worker;
- якщо є active `work_plan_items`, вони не належать іншому worker;
- update виконується тільки якщо status усе ще у дозволеному списку.

## Дозволені статуси

Кнопка `Виконав` може перевести заявку в `waiting_admin_confirmation`, якщо status:

- `new`
- `assigned`
- `in_progress`
- `waiting`

## Заблоковані статуси

Не виконуються повторно:

- `pending_review` — заявка ще не підтверджена адміністратором;
- `waiting_admin_confirmation` — уже очікує підтвердження;
- `done` — уже виконана;
- `rejected` — відхилена;
- `cancelled` — скасована;
- інші невідомі статуси — не дозволені.

## Неактуальний план або виконавець

Active plans:

- `draft`
- `sent`
- `partially_done`

Inactive/archive plans:

- `done`
- `cancelled`

Якщо заявка має active plan item з іншим worker або `ticket.assignee_worker_id` вже вказує на іншого виконавця, стара кнопка не змінює ticket. Виконавець отримує повідомлення, що заявка перенесена або закріплена за іншим виконавцем.

Якщо заявка активна, досі закріплена за тим самим worker і не має active item іншого worker, стара кнопка може спрацювати. Це підтримує старі повідомлення, коли plan item вже очищений, але заявка все ще актуальна для виконавця.

## Telegram responses

Handler повертає конкретні короткі повідомлення:

- `Ця заявка вже позначена як виконана і очікує підтвердження.`
- `Ця заявка вже виконана.`
- `Ця заявка відхилена і не може бути виконана.`
- `Ця заявка скасована і не може бути виконана.`
- `Ця заявка ще не підтверджена адміністратором.`
- `Ця заявка вже закріплена за іншим виконавцем.`
- `Ця заявка перенесена в інший план або до іншого виконавця. Відкрийте актуальний план.`

## /work-planning default week

Раніше `/work-planning` без query параметра `week` відкривав next work week.

Тепер `/work-planning` без `week` відкриває current work week через `getWorkWeekRange()`.

Якщо URL має `week`, він залишається головним джерелом:

- `/work-planning?week=2026-08-20&view=category` відкриє 20.08 — 27.08;
- returnTo з detail page не скидається на default;
- перемикання тижнів і далі працює через query.

Це не змінює бізнес-логіку confirm:

- `confirmTicketWithPlanningDecision` може й далі додавати заявки в `next_week`;
- dashboard modal може обирати `current_week` або `next_week`;
- автопланування має власний вибір target week.

## Known issues

- Callback `wd:<token>` не містить `workPlanId`, тому для старих кнопок перевірка виконується за поточним станом ticket/worker/active plan items у базі.
