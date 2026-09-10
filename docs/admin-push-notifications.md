# Admin push notifications

## Supported Push Events

Service Desk AI sends web/PWA push notifications to admins for:

1. A director creates a new ticket.
2. A worker marks a ticket as completed from Telegram.
3. A new director registers and waits for approval.

The implementation uses the existing PWA push stack:

- `push_subscriptions`
- VAPID keys
- `public/sw.js`
- `lib/push/send-push-notification.ts`

No parallel push system is created.

## Recipients

Push notifications are sent only to active users with these roles:

- `admin`
- `management`
- `tech_manager`

They are not sent to `store_director` or `worker` roles.

## New Director Ticket

When an approved director creates a ticket through the director portal, the ticket is inserted with:

- `source = director_portal`
- `status = pending_review`

After the ticket and history row are created successfully, admins receive:

Title:

`Нова заявка від директора`

Body:

`[Адреса/об'єкт] · [короткий опис]`

Payload data:

- `type: director_ticket_created`
- `url: /tickets/[id]?returnTo=/tickets?source=director_portal`
- `ticketId`
- `ticketNumber`
- `source: director_portal`

If push delivery fails, ticket creation still succeeds.

## Worker Completed Ticket

When a worker presses `✅ Виконав` in Telegram, the callback first verifies that the status really changes from an active state to:

`waiting_admin_confirmation`

Only after a successful status change, admins receive:

Title:

`Виконавець виконав заявку`

Body:

`[Номер] · [Адреса/об'єкт] · очікує підтвердження`

Payload data:

- `type: worker_completed_ticket`
- `url: /tickets/[id]`
- `ticketId`
- `ticketNumber`
- `status: waiting_admin_confirmation`

Repeated old Telegram callbacks that do not change status do not send another push.

## New Director Registration

When a director registers through `/director/register`, the profile is created with:

- `role = store_director`
- `approval_status = pending`

After profile and director-object links are created successfully, admins receive:

Title:

`Новий директор зареєструвався`

Body:

`[ПІБ] · [телефон] · очікує підтвердження`

Payload data:

- `type: director_registered`
- `url: /objects/directors/[id]`
- `directorProfileId`

If push delivery fails, registration still succeeds.

## Click URL

The service worker reads the URL from notification payload data and opens/focuses that URL:

1. `notification.data.url`
2. fallback `/dashboard`

Existing AI pending review pushes still pass `/ai-tickets`, so that flow remains unchanged.

## Duplicate Protection

- Director ticket push is sent only after the ticket insert and history insert succeed.
- Worker completed push is sent only on the first successful transition to `waiting_admin_confirmation`.
- Director registration push is sent only during registration after profile/director-object creation.
- Push failures are logged and do not throw fatal errors into business actions.

## Known Issues

- Push delivery depends on active browser subscriptions and configured VAPID keys.
- The helper logs counts, not full subscription endpoints.
