# Telegram Worker Menu UX

## Old Problem

Work plan dispatch sent a long Telegram message like “План робіт на тиждень - частина 1/2” with many tickets and many “Виконав” buttons. This was hard to scan and made it unclear which button belonged to which ticket.

## New Plan Dispatch Message

When an admin sends a work plan, the worker receives a short menu message:

```text
📅 План робіт отримано

👷 Виконавець: [workerName]
🗓 Період: [periodStart] — [periodEnd]
📋 Заявок в роботі: [activeCount]

Натисніть кнопку нижче, щоб переглянути заявки.
```

Buttons:

- `📋 Відкрити заявки`
- `⏳ На підтвердженні`
- `✅ Виконані`

The full ticket list is no longer sent immediately.

## Worker Menu

The menu shows worker stats for the dispatched plan:

- active tickets: `new`, `assigned`, `in_progress`
- pending confirmation: `waiting_admin_confirmation`
- done: `done`

Buttons:

- `📋 В роботі`
- `⏳ На підтвердженні`
- `✅ Виконані`

## Active List

`📋 Відкрити заявки` and `📋 В роботі` show a paginated list.

Rules:

- 5 tickets per page.
- Each row contains ticket number, address/object, and a short work description.
- Each ticket has a separate `Відкрити PSD-...` button.
- Pagination uses `➡️ Далі` and `⬅️ Назад` when needed.
- `📅 Меню` returns to the cabinet menu.

## Ticket Card

Opening a ticket replaces the current Telegram message with a full card:

- ticket position in the current section;
- ticket number;
- object/address;
- category;
- priority;
- full description;
- status.

Buttons:

- `✅ Виконав` for active tickets;
- `⬅️ Назад до списку`;
- `➡️ Наступна`;
- `⬅️ Попередня`;
- `📅 Меню`.

Back returns to the same list page from which the ticket was opened.

Next/previous navigation stays inside the same section, for example inside “В роботі”.

## Done Action

The existing `wd:<token>` callback remains supported.

When the worker presses `✅ Виконав`:

- the ticket is checked against the worker;
- status becomes `waiting_admin_confirmation`;
- history is written;
- old already-sent buttons still work;
- the worker receives a short confirmation message with buttons back to active/pending/menu when the plan context is available.

## Callback Data

New worker menu callbacks use compact `wm:*` data:

- `wm:m:<planId>` - menu
- `wm:a:<planId>:<page>` - active list
- `wm:p:<planId>:<page>` - pending confirmation list
- `wm:d:<planId>:<page>` - done list
- `wm:o:<planId>:<index>:<page>:<section>` - open ticket card

The ticket card uses an index inside the selected section instead of putting both plan UUID and ticket UUID into callback data. This keeps callback data under Telegram limits.

Legacy callback:

- `wd:<token>` - worker marks ticket as done

## Telegram Edit Behavior

Menu navigation uses `editMessageText` to avoid chat spam. If edit fails, the code falls back to `sendMessage`.

## Known Issues

- The worker menu is plan-based. It uses the dispatched `workPlanId` from callback data.
- If old Telegram messages contain only legacy `wd:<token>` buttons, they still mark tickets done but cannot always reconstruct the full menu context.
- The menu reads tickets from `work_plan_items.worker_id`; plans without worker-linked items will not show those tickets in a worker cabinet.
