# Оптимізація підтвердження AI/Telegram заявки

## Проблема

Підтвердження заявки на `/ai-tickets` було повільним, бо action перед shared confirm service додатково:

- читав pending ticket;
- читав існуючого worker;
- запускав `findRecommendedWorkerForTicket`;
- рахував worker workload;
- після цього shared service повторно читав ticket/worker і додавав заявку в план.

Telegram-відправку після confirm уже вимкнено окремою зміною.

## Що підвантажується заздалегідь

Після завантаження `/ai-tickets` сторінка готує confirm readiness для видимих pending заявок:

- route preview категорія → план;
- suggested worker;
- target plan title;
- next-week draft plans;
- чи заявка вже є в активному плані;
- warning для missing category, unmapped category, missing worker або plan not ready.

## Як працює confirm readiness

Helper `getAiTicketConfirmReadiness()` у `lib/supabase/ai-tickets.ts` використовує вже завантажені tickets/workers і один раз перевіряє draft plans та active plan items.

На картці заявки показується:

- “Маршрут підготовлено”, якщо є worker і draft plan;
- warning, якщо маршрут потребує уваги.

Форма confirm передає `preferred_worker_id` hidden field, якщо він підготовлений.

## Що лишилось на серверній перевірці

`confirmAiTicketAction` усе одно викликає `confirmTicketWithPlanningDecision`.

Shared service перевіряє:

- права;
- що ticket існує;
- що status = `pending_review`;
- що source = `telegram_group` або `telegram_private_test`;
- що category є;
- що preferred worker активний, якщо переданий.

Якщо prepared worker став недійсним, action повторює confirm без preferred worker.

## Draft plans і carry-over

Readiness helper готує next-week draft plans з `skipCarryOver: true`.

AI confirm також додає заявку в plan через shared service, але передає `skipPlanningCarryOver: true`, щоб не запускати старий carry-over на кожен клік.

Звичайна поведінка `ensureWeeklyDraftPlansForAutoRouting()` без параметрів не змінена.

## Telegram

Telegram виконавцю не надсилається при AI confirm.

Виконавець отримує заявку тільки:

- після dispatch плану на `/work-planning/[id]`;
- або через ручну дію “Надіслати виконавцю” на `/tickets/[id]`.

## Revalidate

Після AI confirm лишились потрібні revalidate:

- `/ai-tickets`
- `/tickets`
- `/tickets/[id]`
- `/work-planning`
- `/dashboard`

Director pages і reports не revalidate-яться для AI confirm.

## Performance logs

Додано gated label:

- `ai-ticket:confirm:total`
- `ai-ticket:confirm:retry-without-preferred-worker`
- `ai-tickets:confirm-readiness`
- `ai-tickets:confirm-readiness:existing`

Вони пишуться тільки коли `NODE_ENV=development` або `PERFORMANCE_LOGS=1`.

## Known issues

- Readiness готується для видимої сторінки заявок, не для всіх сторінок пагінації.
- Route mapping усе ще базується на існуючому текстовому helper.
- Якщо між render сторінки і confirm дані змінились, shared service має фінальне слово.
