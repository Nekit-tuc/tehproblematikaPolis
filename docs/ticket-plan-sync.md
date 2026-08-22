# Ticket And Work Plan Synchronization

## Problem

Ticket details and work planning could diverge after an admin changed a ticket category or assignee from `/tickets/[id]` or the quick ticket modal in `/work-planning/[id]`.

The ticket row was updated, but existing `work_plan_items` could still point to the old worker or remain inside the old worker/category plan.

## What Is Synchronized

The sync keeps these fields aligned where it is safe:

- `tickets.assignee_worker_id`
- `tickets.category_id`
- `work_plan_items.worker_id`
- `work_plan_items.work_plan_id`
- the displayed plan/card where the ticket appears

`work_plan_items.status` is not used. Item state is derived from `tickets.status` and `work_plans.status`.

## Sync Helper

Shared helper:

```ts
syncTicketPlanningAfterUpdate({
  ticketId,
  actorProfileId,
  reason,
  preferredWorkerId,
  categoryId,
})
```

Location:

```text
lib/supabase/work-plans.ts
```

It is called after:

- assigning a worker on `/tickets/[id]`
- unassigning a worker on `/tickets/[id]`
- changing a category on `/tickets/[id]`
- assigning/unassigning a worker in `/work-planning/[id]` quick modal
- changing a category in `/work-planning/[id]` quick modal

## Draft Plans

If the ticket is in a `draft` plan:

- the helper resolves the target worker/route;
- finds the target draft plan in the same work week;
- creates missing auto draft plans for that same week without carry-over;
- moves `work_plan_items.work_plan_id` when the target plan changes;
- updates `work_plan_items.worker_id`;
- updates `work_plan_items.category`;
- removes duplicate target items when possible;
- writes `ticket_history`.

## Sent And Partially Done Plans

If the ticket is in `sent` or `partially_done` plans:

- the ticket update is kept;
- the plan item is not moved automatically;
- the action returns a warning for the admin;
- `ticket_history` records that the plan needs attention.

This avoids silently changing a plan that may already have been dispatched to a worker.

## Done / Archive And Cancelled Plans

`done` and `cancelled` plans are not treated as active sync targets.

- `done` plans remain archive/history.
- `cancelled` plans are ignored.
- non-done tickets stuck in old archive plans should be cleaned by “Оновити систему”.

## Category Routing

For category changes, the new category drives the route. The helper uses existing `autoWorkPlanConfigs`, so the current mapping remains unchanged.

Important expected mapping:

- `Каналізація` routes to Lena’s plan, not Denis.

## Manual Worker Override

For worker changes, the selected worker has priority:

1. worker selected by admin;
2. current ticket worker;
3. category route.

For category changes, the category route is applied so the plan can move to the correct category/worker plan.

## Duplicate Protection

Before moving an item, the helper checks whether the ticket already exists in the target plan.

If duplicate target items exist:

- duplicates are removed;
- the source item is updated;
- a warning is written in the sync result/history.

The helper does not create new `work_plan_items` unless the existing auto draft plans for the week need to be ensured.

## SQL Checks

Check one ticket:

```sql
select
  t.number,
  t.status as ticket_status,
  t.assignee_worker_id,
  tw.name as ticket_worker,
  c.name as category_name,
  wp.title as plan_title,
  wp.status as plan_status,
  wpi.worker_id as item_worker_id,
  iw.name as item_worker,
  wp.period_start,
  wp.period_end
from tickets t
left join workers tw on tw.id = t.assignee_worker_id
left join categories c on c.id = t.category_id
left join work_plan_items wpi on wpi.ticket_id = t.id
left join workers iw on iw.id = wpi.worker_id
left join work_plans wp on wp.id = wpi.work_plan_id
where t.number = 'PSD-2026-XXXX'
order by wp.period_start desc;
```

Find ticket worker vs plan item worker drift:

```sql
select
  t.number,
  tw.name as ticket_worker,
  iw.name as item_worker,
  wp.title,
  wp.status,
  wp.period_start,
  wp.period_end
from tickets t
join work_plan_items wpi on wpi.ticket_id = t.id
join work_plans wp on wp.id = wpi.work_plan_id
left join workers tw on tw.id = t.assignee_worker_id
left join workers iw on iw.id = wpi.worker_id
where wp.status in ('draft','sent','partially_done')
  and t.assignee_worker_id is distinct from wpi.worker_id
order by wp.period_start desc, t.number;
```

Category route vs plan title still depends on text-based `autoWorkPlanConfigs`; verify manually until routing moves to category ids/slugs.

## Known Issues

- Sent and partially done plans are not moved automatically; admin gets a warning and should review/re-dispatch manually.
- Routing still depends on text matching in `autoWorkPlanConfigs`. A future migration to category id or slug based routing would be safer.
- Status changes are not used to move items automatically in this stage; worker/category changes are the synchronization triggers.
