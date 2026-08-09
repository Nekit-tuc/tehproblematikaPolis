# Planning Stage 1 Implementation Notes

Дата: 2026-08-09

## Що реалізовано

Створено єдиний server-side helper:

`lib/tickets/confirm-ticket-with-planning.ts`

Основна функція:

`confirmTicketWithPlanningDecision(ticketId, options)`

Підтримані options:

- `actorProfileId`
- `planningMode: "current_week" | "next_week" | "no_plan"`
- `preferredWorkerId`
- `sourceContext`
- `expectedSource`
- `requireObject`
- `requireCategory`

## Які actions підключено

Підключено спільний confirm service до:

1. Generic confirm на `/tickets/[id]`
   - `app/(app)/tickets/[id]/actions.ts`

2. Director confirm
   - `app/(app)/tickets/[id]/director-actions.ts`

3. AI/Telegram confirm
   - `app/(app)/ai-tickets/actions.ts`

## Default planningMode

На цьому етапі UI ще не передає planningMode.

Тому actions явно передають:

`planningMode = "next_week"`

Це зберігає поточну бізнес-ідею: підтверджені заявки потрапляють у чернетки наступного робочого тижня.

## Що змінилось для `/ai-tickets`

Раніше `/ai-tickets` мав окрему confirm-логіку:

- сам оновлював `tickets.status`;
- сам призначав worker;
- сам писав history;
- не проходив через planning helper.

Тепер:

- AI action як і раніше визначає existing/recommended worker;
- далі викликає `confirmTicketWithPlanningDecision`;
- service оновлює ticket, пише history і додає заявку в план;
- Telegram-відправка лишилась після confirm, щоб не переписувати bot flow на цьому етапі.

## Director заявки

Director confirm тепер проходить через той самий service.

Для director action додано service-level guards:

- `expectedSource = "director_portal"`
- `requireObject = true`
- `requireCategory = true`

## Planning behavior

`planningMode = "next_week"`:

- викликає існуючий `addConfirmedTicketToWeeklyDraftPlan`;
- використовує поточну auto-draft логіку наступного тижня;
- не створює дубль, якщо заявка вже є в плані вибраного тижня.

`planningMode = "no_plan"`:

- не створює `work_plan_items`;
- пише history: `Заявку підтверджено без додавання в план`.

`planningMode = "current_week"`:

- підготовлено як supported option у service;
- на цьому етапі повертає structured warning `current_week_not_supported`;
- ticket при цьому лишається підтвердженим.

## Pending review і planning

Додано guard-и:

- `addConfirmedTicketToWeeklyDraftPlan` не додає ticket у план, якщо status ще `pending_review`;
- `autoAddTelegramTicketToWeeklyDraftPlan` не додає Telegram ticket у план, якщо status ще `pending_review`;
- carry-over не переносить `pending_review`.

## Telegram auto-add

Повністю Telegram bot не переписувався.

Змінено тільки безпечну частину:

- auto-add у план для Telegram pending заявок тепер повертає `pending_review_not_confirmed`;
- створення Telegram/AI заявки не змінювалось;
- планування перенесено в confirm-flow.

## Warning-и

Service повертає warning-и для:

- `missing_category`
- `category_not_mapped`
- `plan_not_found`
- `ensure_failed`
- `closed_ticket`
- `pending_review_not_confirmed`
- `current_week_not_supported`
- `insert_error`

Якщо planning warning виникає після підтвердження, ticket лишається підтвердженим, а причина пишеться в `ticket_history`.

## Ризики, що лишились

1. `current_week` ще не додає в поточний тиждень автоматично.
2. Mapping категорій усе ще залежить від існуючої auto-plan логіки.
3. Telegram-відправка AI заявки лишилась окремим кроком після confirm.
4. Старий inline confirm-код у actions залишено нижче нового early path як тимчасовий fallback/cleanup target; фактично він не виконується після redirect.
5. UI ще не дає адмінам вибрати current week / next week / no plan вручну.

## Наступний рекомендований крок

Етап 2:

- додати компактний planning selector у pending confirm UI;
- прибрати старий unreachable confirm-код з actions;
- показати на `/tickets/[id]`, у який саме план потрапила заявка або чому вона не в плані.

