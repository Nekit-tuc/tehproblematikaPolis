# Щоденні нагадування

## Для чого це потрібно

Щоденні нагадування допомагають не втрачати активні заявки: виконавці вранці бачать свої поточні задачі в Telegram, а адміністратори отримують короткий push-summary по проблемах, які потребують уваги.

## Cron endpoint

Endpoint:

```text
/api/cron/daily-reminders
```

Endpoint захищений секретом:

```text
CRON_SECRET
```

Також підтримується fallback:

```text
VERCEL_CRON_SECRET
```

Секрет можна передати двома способами:

```text
Authorization: Bearer <CRON_SECRET>
```

або для ручної перевірки:

```text
/api/cron/daily-reminders?secret=<CRON_SECRET>
```

Якщо секрет відсутній або неправильний, endpoint повертає `401`.

## Dry run

Для тесту без реального надсилання:

```text
/api/cron/daily-reminders?secret=<CRON_SECRET>&dryRun=true
```

`dryRun=true`:

- не надсилає Telegram;
- не надсилає push;
- повертає JSON summary по виконавцях і адмінських проблемах.

## Vercel cron

У `vercel.json` додано:

```json
{
  "path": "/api/cron/daily-reminders",
  "schedule": "0 6 * * *"
}
```

Vercel cron schedule заданий у UTC. `0 6 * * *` відповідає 09:00 за Europe/Kyiv під час літнього часу. Бізнес-діапазон робочого тижня система рахує через `lib/date/work-week.ts`, тобто за правилом четвер 17:00 — наступний четвер 17:00.

## Telegram-нагадування виконавцям

Система перевіряє активних виконавців:

- `workers.is_active = true`;
- `workers.telegram_id is not null`;
- є актуальні заявки в роботі або на підтвердженні.

Повідомлення не надсилається, якщо у виконавця немає активних заявок і немає заявок на підтвердженні.

Статуси “В роботі”:

- `new`;
- `assigned`;
- `in_progress`.

Статус “На підтвердженні”:

- `waiting_admin_confirmation`.

Не входять у Telegram-нагадування як активні:

- `pending_review`;
- `done`;
- `rejected`;
- `cancelled`.

Текст нагадування короткий:

```text
👷 Нагадування по заявках

Доброго ранку, [workerName].

📅 Робочий тиждень: [periodStart] — [periodEnd]

📋 В роботі: X
⏳ На підтвердженні: Y
⚠️ Потребують уваги: Z

Натисніть кнопку нижче, щоб відкрити актуальні заявки.
```

Кнопки використовують новий Telegram UX:

- `📋 В роботі`;
- `⏳ На підтвердженні`;
- `✅ Виконані`;
- `📅 Меню`.

Кнопки ведуть у меню поточного активного плану виконавця. Старий формат великих повідомлень зі списком усіх заявок не використовується.

## Admin push

Адмінське нагадування надсилається через існуючу push-систему і helper `sendAdminPushNotification`.

Recipients:

- `admin`;
- `management`;
- `tech_manager`.

Не надсилається:

- `store_director`;
- `worker`.

Push:

```text
Ранковий контроль заявок
Нові: X · Виконані чекають: Y · Не в плані: Z
```

Payload:

```json
{
  "type": "admin_daily_reminder",
  "url": "/dashboard"
}
```

Клік відкриває `/dashboard`.

## Що рахується для адміна

`getAdminAttentionSummary()` рахує:

- заявки директорів на перевірці: `source = director_portal`, `status = pending_review`;
- AI/Telegram заявки на перевірці: `status = pending_review`, `source != director_portal`;
- заявки, які виконавець позначив виконаними: `waiting_admin_confirmation`;
- нові директори на підтвердженні: `profiles.role = store_director`, `approval_status = pending`;
- активні заявки не в планах поточного робочого тижня;
- активні заявки у старих активних планах;
- активні заявки без виконавця;
- активні заявки без категорії;
- активні виконавці без Telegram ID, якщо на них є активні заявки або активні планові items.

Активні заявки для адмінського summary:

- `new`;
- `assigned`;
- `in_progress`;
- `waiting`;
- `waiting_admin_confirmation`.

Активні плани:

- `draft`;
- `sent`;
- `partially_done`.

## Error handling

Cron не падає через часткові помилки Telegram або push. Він збирає:

- `warnings`;
- `errors`;
- `workersChecked`;
- `workerMessagesSent`;
- `adminPushSent`;
- `workerSummaries`;
- `adminSummary`.

Якщо одна Telegram-відправка не спрацювала, решта виконавців все одно обробляються.

## Known issues

- Без окремої таблиці notification logs endpoint може надіслати повторні нагадування, якщо його вручну запустити кілька разів за день.
- Виконавцю з актуальними заявками, але без активного плану поточного тижня, Telegram-меню не надсилається; такий випадок повертається як warning.
- Розклад `0 6 * * *` точно відповідає 09:00 Kyiv у літній час; після сезонної зміни часу може знадобитися окрема перевірка cron schedule.
