# Tickets hide done filter

## Problem

The `/tickets` list mixed active and completed tickets by default. Admins needed a simple way to keep completed `done` tickets out of the daily working list without creating a separate archive page.

## Why there is no archive tab

This change intentionally keeps everything on one `/tickets` page. Completed tickets are controlled by a filter instead of a separate `archive` view or route.

## Filter

The page now has a toggle:

`Не показувати виконані заявки`

When enabled, tickets with `status = done` are hidden.

The filter does not hide:

- `pending_review`
- `new`
- `assigned`
- `in_progress`
- `waiting`
- `waiting_admin_confirmation`
- `rejected`
- `cancelled`

`waiting_admin_confirmation` remains visible because it is not final completion.

## Default

Default `/tickets` behavior is:

`hideDone = true`

So `/tickets` shows all matching tickets except `done`.

## Query Param

Supported URL state:

- `/tickets` means `hideDone=true`
- `/tickets?hideDone=true` means `done` tickets are hidden
- `/tickets?hideDone=false` means `done` tickets are included

The query param is preserved in pagination, filters, print/export links, and ticket `returnTo`.

## status=done

An explicit status filter has priority.

`/tickets?status=done` shows completed tickets even though the default is `hideDone=true`.

When `status=done` is active, the hide-done toggle is displayed as disabled because the explicit status filter is more specific.

## Search and Other Filters

`hideDone` is applied together with:

- search query;
- status;
- category;
- priority;
- worker;
- source;
- period/date range;
- sorting;
- pagination.

Example:

`/tickets?category=...&hideDone=true` returns tickets for that category except `done`.

## Export and Print

`/tickets/print` and `/tickets/export` use the same shared ticket filter helper.

Examples:

- `/tickets?hideDone=true` -> print/export without `done`;
- `/tickets?hideDone=false` -> print/export includes `done`;
- `/tickets?status=done` -> print/export only `done`.

## ReturnTo

Ticket links build `returnTo` from the current filtered URL. If the user opens a ticket from `/tickets?hideDone=false`, the back button returns to `/tickets?hideDone=false`.

## Known Issues

- The filter is URL-based and does not store a personal user preference. Default remains `hideDone=true` for every fresh `/tickets` visit.
