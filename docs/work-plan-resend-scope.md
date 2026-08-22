# Scope of work plan resend

## Problem

On the specific work plan page (`/work-planning/[id]`) the resend button used wording for a bulk action:

- `Надіслати повторно всім виконавцям`
- `Повторно всім`

That was misleading because the page is opened for one concrete work plan/subdivision.

## Single-plan resend

On `/work-planning/[id]` the action is scoped to the opened `workPlanId`.

Button labels:

- Draft plan: `Надіслати план`
- Already sent active plan: `Надіслати повторно`
- Failed dispatch retry: `Повторити невдалі`

The resend confirmation now says that only this plan will be resent.

## Resend-all

A bulk resend-all action belongs only on a weekly overview page if such a control is intentionally shown there. It should not be presented on `/work-planning/[id]`.

## Server action

The specific plan page uses `resendSingleWorkPlanAction(workPlanId)`. It calls `sendWorkPlanToWorkers(workPlanId, { mode: "resend_all" })`.

The mode name is kept for compatibility with the existing dispatch helper, but the helper receives a single `workPlanId` and loads:

- one `work_plans` row by id;
- `work_plan_items` only for that id;
- `work_plan_dispatches` only for that id.

It does not query all plans in the selected week and does not iterate over other work plans.

## Telegram UX

Resending a specific plan continues to use the existing work plan Telegram notification pipeline. That means it keeps the worker mini-cabinet format:

- short `План робіт отримано` message;
- `Відкрити заявки`;
- worker menu/list/card callbacks.

## Verification

To verify manually:

1. Open a sent plan at `/work-planning/[id]`.
2. Confirm the button says `Надіслати повторно`.
3. Click it.
4. Check `work_plan_dispatches`: new rows should have only this `work_plan_id`.
5. Confirm no other plans from the week received new dispatch rows.

## Known Issues

- `SendWorkPlanMode` still contains the legacy value `resend_all`. In the detail page path this means "resend all worker groups inside this one plan", not "resend all weekly plans".
