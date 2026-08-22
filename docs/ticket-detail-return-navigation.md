# Ticket Detail Return Navigation

## Problem

The ticket detail page `/tickets/[id]` could lose the source context after opening a ticket from filtered lists or planning pages. The in-app back button and redirects after ticket actions could return the user to a default tickets view instead of the original page.

Examples that must keep context:

- `/tickets?status=assigned`
- `/tickets?status=pending_review&source=director_portal`
- `/ai-tickets`
- `/work-planning?week=2026-08-20&view=category`
- `/work-planning/[id]?returnTo=...`
- `/director/tickets`

## ReturnTo Rule

Links to `/tickets/[id]` now pass a `returnTo` query parameter:

```text
/tickets/[ticketId]?returnTo=/tickets%3Fstatus%3Dassigned
```

The source page builds `returnTo` from its current path and filters, then encodes it into the ticket detail URL.

## Updated Entry Points

The following entry points now preserve ticket return context:

- `/tickets` list rows, mobile cards, and actions menu.
- `/ai-tickets` table/cards and related ticket links.
- `/work-planning` ticket rows and duplicate repeat links.
- `/work-planning/[id]` quick ticket modal links.
- `/workers/[id]` ticket cards.
- `/weekly-control/[id]` ticket snapshot links.
- `/tickets/acts` ticket links.
- `/reports/weekly` report ticket rows/cards.
- `/tickets/new` redirects to a newly created ticket with `returnTo=/tickets`.

## Safe Validation

The ticket detail page and ticket actions validate `returnTo` before using it.

Allowed internal prefixes:

- `/tickets`
- `/ai-tickets`
- `/dashboard`
- `/work-planning`
- `/director/tickets`
- `/workers`
- `/weekly-control`
- `/reports`

Blocked values:

- `http://...`
- `https://...`
- `//...`
- `javascript:...`
- any non-allowed path

Invalid `returnTo` falls back to a safe default.

## Back Button

The `/tickets/[id]` back button is a direct link to the validated `returnTo`. It does not rely on `router.back()`, because server actions and redirects can change browser history.

Fallback without `returnTo`:

- director portal tickets: `/tickets?source=director_portal`
- pending AI/Telegram tickets: `/ai-tickets`
- all other tickets: `/tickets`

## Actions

Ticket detail forms include a hidden `returnTo` field. Server actions preserve it when redirecting back to the ticket detail page after:

- confirm/reject
- status change
- category change
- worker assign/unassign
- manual Telegram send
- worker completion confirm/return
- photo upload
- comment add
- hard delete error handling

For hard delete success, the action redirects to the validated `returnTo` instead of the deleted ticket page.

## Known Issues

- Some non-primary report or export links intentionally do not use `returnTo` because they open generated files, not the ticket detail page.
- `/director/tickets/[id]` is a separate director-facing detail route and was not converted to `/tickets/[id]` return navigation.
