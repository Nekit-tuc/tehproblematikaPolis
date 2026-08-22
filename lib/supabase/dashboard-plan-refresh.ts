import { getNextWorkWeekRange, getWorkWeekRange, type WorkWeekRange } from "@/lib/date/work-week";
import { measureAsync } from "@/lib/performance";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { getAutoWorkPlanRoutePreview, type WorkPlanStatus } from "@/lib/supabase/work-plans";
import type { TicketStatus } from "@/types/domain";
import type { QueryResult } from "./queries";

export type DashboardPlanRefreshTargetWeek = "current_week" | "next_week";

export type DashboardPlanRefreshWeek = {
  key: DashboardPlanRefreshTargetWeek;
  label: string;
  startIso: string;
  endIso: string;
};

export type DashboardPlanRefreshTicketPlan = {
  planId: string;
  planTitle: string;
  planStatus: WorkPlanStatus;
  periodStart: string;
  periodEnd: string;
  weekKey: DashboardPlanRefreshTargetWeek | "other_week";
};

export type DashboardPlanRefreshTicket = {
  id: string;
  number: string | null;
  description: string;
  status: TicketStatus;
  sourceLabel: string;
  objectLabel: string;
  categoryLabel: string;
  assigneeWorkerId: string | null;
  assigneeWorkerName: string | null;
  recommendedWorkerId: string | null;
  recommendedWorkerName: string | null;
  planLinks: DashboardPlanRefreshTicketPlan[];
};

export type DashboardPlanRefreshData = {
  weeks: {
    current: DashboardPlanRefreshWeek;
    next: DashboardPlanRefreshWeek;
  };
  workers: Array<{ id: string; name: string }>;
  tickets: DashboardPlanRefreshTicket[];
};

export type DashboardPlanRefreshSummary = {
  added: number;
  alreadyPlanned: number;
  skipped: number;
  errors: number;
  details: DashboardPlanRefreshSummaryDetail[];
};

export type DashboardPlanRefreshSummaryDetail = {
  ticketId: string;
  ticketNumber: string | null;
  status: "added" | "already_planned" | "skipped" | "error";
  reasonCode: DashboardPlanRefreshReasonCode;
  reasonText: string;
  message: string;
};

type DashboardPlanRefreshSummaryDetailInput =
  Omit<DashboardPlanRefreshSummaryDetail, "reasonCode" | "reasonText"> &
  Partial<Pick<DashboardPlanRefreshSummaryDetail, "reasonCode" | "reasonText">>;

export type DashboardPlanRefreshReasonCode =
  | "added"
  | "already_planned_current_week"
  | "already_planned_other_active_week"
  | "pending_review"
  | "rejected"
  | "cancelled"
  | "done"
  | "status_not_addable"
  | "missing_category"
  | "category_not_mapped"
  | "worker_not_found"
  | "worker_inactive"
  | "draft_plan_not_found"
  | "plan_already_sent"
  | "insert_failed"
  | "update_failed"
  | "check_existing_failed"
  | "unexpected_error"
  | "no_active_tickets";

const activePlanStatuses: WorkPlanStatus[] = ["draft", "sent", "partially_done"];
const addableStatuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation"];
const blockedStatuses: TicketStatus[] = ["pending_review", "rejected", "cancelled", "done"];

type WorkerRow = { id: string; name: string | null; is_active?: boolean | null; telegram_username?: string | null };
type Relation<T> = T | T[] | null | undefined;

function one<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function emptyData(error: string | null = null): QueryResult<DashboardPlanRefreshData> {
  return {
    data: {
      weeks: {
        current: { key: "current_week", label: "Поточний тиждень", startIso: "", endIso: "" },
        next: { key: "next_week", label: "Наступний тиждень", startIso: "", endIso: "" },
      },
      workers: [],
      tickets: [],
    },
    error,
  };
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[\/\\–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceLabel(source: string | null | undefined) {
  if (source === "director_portal") return "директор";
  if (source?.startsWith("telegram") || source === "ai") return "Telegram/AI";
  return "manual/admin";
}

function weekInfo(range: WorkWeekRange, key: DashboardPlanRefreshTargetWeek): DashboardPlanRefreshWeek {
  return {
    key,
    label: key === "current_week" ? "Поточний тиждень" : "Наступний тиждень",
    startIso: range.startIso,
    endIso: range.endIso,
  };
}

function weekKeyForPlan(
  plan: { period_start: string; period_end: string },
  current: DashboardPlanRefreshWeek,
  next: DashboardPlanRefreshWeek,
) {
  if (plan.period_start === current.startIso && plan.period_end === current.endIso) return "current_week";
  if (plan.period_start === next.startIso && plan.period_end === next.endIso) return "next_week";
  return "other_week";
}

function findWorkerByRoute(workers: WorkerRow[], workerName: string | null | undefined) {
  const expected = normalize(workerName);
  if (!expected) return null;
  return workers.find((worker) => {
    const actual = normalize(worker.name);
    return actual === expected || actual.includes(expected) || expected.includes(actual);
  }) ?? null;
}

function activePlanInAnyWeek(planLinks: DashboardPlanRefreshTicketPlan[]) {
  return planLinks[0] ?? null;
}

function emptySummary(): DashboardPlanRefreshSummary {
  return { added: 0, alreadyPlanned: 0, skipped: 0, errors: 0, details: [] };
}

function addSummaryDetail(
  summary: DashboardPlanRefreshSummary,
  detail: DashboardPlanRefreshSummaryDetailInput,
) {
  const reasonCode = detail.reasonCode ?? (
    detail.status === "added" ? "added" :
    detail.status === "already_planned" ? "already_planned_current_week" :
    detail.status === "skipped" ? "status_not_addable" :
    "unexpected_error"
  );
  const text = detail.reasonText ?? reasonText(reasonCode);
  summary.details.push({
    ...detail,
    reasonCode,
    reasonText: text,
  });
}

function reasonText(code: DashboardPlanRefreshReasonCode, extra?: string | null) {
  const texts: Record<DashboardPlanRefreshReasonCode, string> = {
    added: "Заявку додано в план.",
    already_planned_current_week: "Заявка вже є в плані вибраного тижня.",
    already_planned_other_active_week: "Заявка ще прив'язана до іншого активного плану. Спочатку натисніть 'Оновити систему'.",
    pending_review: "Заявка ще на перевірці. Спочатку підтвердіть її.",
    rejected: "Заявка відхилена і не додається в план.",
    cancelled: "Заявка скасована і не додається в план.",
    done: "Заявка вже виконана.",
    status_not_addable: "Статус заявки не дозволяє додати її в план.",
    missing_category: "У заявки не вибрана категорія.",
    category_not_mapped: "Для категорії не налаштований маршрут планування.",
    worker_not_found: "Не знайдено виконавця для цієї категорії.",
    worker_inactive: "Виконавець неактивний або не має Telegram ID.",
    draft_plan_not_found: "Не знайдено draft-план для вибраного тижня.",
    plan_already_sent: "План вибраного тижня вже надісланий. Автоматично не додаємо.",
    insert_failed: "Помилка Supabase при додаванні в work_plan_items.",
    update_failed: "Помилка Supabase при оновленні заявки.",
    check_existing_failed: "Не вдалося перевірити наявний план заявки.",
    unexpected_error: "Неочікувана помилка.",
    no_active_tickets: "Немає активних заявок для планування.",
  };
  return extra ? `${texts[code]} ${extra}` : texts[code];
}

function reasonCodeForBlockedStatus(status: TicketStatus): DashboardPlanRefreshReasonCode {
  if (status === "pending_review") return "pending_review";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "done") return "done";
  return "status_not_addable";
}

function addResultDetail(
  summary: DashboardPlanRefreshSummary,
  detail: Omit<DashboardPlanRefreshSummaryDetail, "reasonText" | "message"> & { reasonText?: string; message?: string },
) {
  const text = detail.reasonText ?? reasonText(detail.reasonCode);
  addSummaryDetail(summary, {
    ...detail,
    reasonText: text,
    message: detail.message ?? `${ticketLabel({ id: detail.ticketId, number: detail.ticketNumber })}: ${text}`,
  });
}

function ticketLabel(ticket: { number?: string | null; id: string }) {
  return ticket.number ?? ticket.id;
}

function sameWeek(plan: { period_start: string; period_end: string }, range: WorkWeekRange) {
  return plan.period_start === range.startIso && plan.period_end === range.endIso;
}

async function appendHistory(
  supabase: ReturnType<typeof createAdminClient>,
  ticketId: string,
  actorId: string,
  description: string,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_profile_id: actorId,
    action: "plan_refresh",
    description,
    metadata,
  });
}

export async function getDashboardPlanRefreshData(limit = 80): Promise<QueryResult<DashboardPlanRefreshData>> {
  if (!hasSupabaseEnv()) return emptyData(missingSupabaseMessage);

  return measureAsync("dashboard-plan-refresh:data", async () => {
    const supabase = createAdminClient();
    const currentWeek = weekInfo(getWorkWeekRange(), "current_week");
    const nextWeek = weekInfo(getNextWorkWeekRange(), "next_week");

    const [ticketsResult, workersResult] = await Promise.all([
      supabase
        .from("tickets")
        .select("id, number, title, description, status, source, category_id, assignee_worker_id, created_at, object:objects(id,name,address), category:categories(id,name), assignee:workers(id,name)")
        .neq("status", "done")
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase.from("workers").select("id,name,is_active,telegram_username").eq("is_active", true).order("name", { ascending: true }),
    ]);

    if (ticketsResult.error) return emptyData(ticketsResult.error.message);
    if (workersResult.error) return emptyData(workersResult.error.message);

    const tickets = ticketsResult.data ?? [];
    const workers = ((workersResult.data ?? []) as WorkerRow[]).map((worker) => ({
      id: worker.id,
      name: worker.name ?? "Без імені",
      is_active: worker.is_active,
      telegram_username: worker.telegram_username,
    }));
    const ticketIds = tickets.map((ticket) => ticket.id);
    const planLinksByTicket = new Map<string, DashboardPlanRefreshTicketPlan[]>();

    if (ticketIds.length > 0) {
      const { data: planItems, error } = await supabase
        .from("work_plan_items")
        .select("ticket_id, work_plan:work_plans!inner(id,title,status,period_start,period_end)")
        .in("ticket_id", ticketIds)
        .in("work_plan.status", activePlanStatuses);

      if (error) return emptyData(error.message);

      for (const item of planItems ?? []) {
        const plan = one(item.work_plan);
        if (!plan || !item.ticket_id) continue;
        const links = planLinksByTicket.get(item.ticket_id) ?? [];
        links.push({
          planId: plan.id,
          planTitle: plan.title,
          planStatus: plan.status as WorkPlanStatus,
          periodStart: plan.period_start,
          periodEnd: plan.period_end,
          weekKey: weekKeyForPlan(plan, currentWeek, nextWeek),
        });
        planLinksByTicket.set(item.ticket_id, links);
      }
    }

    const mappedTickets: DashboardPlanRefreshTicket[] = tickets.map((ticket) => {
      const object = one(ticket.object);
      const category = one(ticket.category);
      const assignee = one(ticket.assignee);
      const route = getAutoWorkPlanRoutePreview({
        categoryName: category?.name ?? null,
        worker: assignee ? { name: assignee.name, telegram_username: null } : null,
      });
      const recommendedWorker = ticket.assignee_worker_id
        ? workers.find((worker) => worker.id === ticket.assignee_worker_id) ?? null
        : findWorkerByRoute(workers, route.workerName);

      return {
        id: ticket.id,
        number: ticket.number ?? null,
        description: ticket.description ?? ticket.title ?? "Без опису",
        status: ticket.status as TicketStatus,
        sourceLabel: sourceLabel(ticket.source),
        objectLabel: object ? [object.name, object.address].filter(Boolean).join(" · ") : "Об'єкт не вказано",
        categoryLabel: category?.name ?? "Без категорії",
        assigneeWorkerId: ticket.assignee_worker_id ?? null,
        assigneeWorkerName: assignee?.name ?? null,
        recommendedWorkerId: recommendedWorker?.id ?? null,
        recommendedWorkerName: recommendedWorker?.name ?? null,
        planLinks: planLinksByTicket.get(ticket.id) ?? [],
      };
    });

    return {
      data: {
        weeks: { current: currentWeek, next: nextWeek },
        workers: workers.map((worker) => ({ id: worker.id, name: worker.name ?? "Без імені" })),
        tickets: mappedTickets,
      },
      error: null,
    };
  });
}

async function getOrCreateDraftPlan(
  supabase: ReturnType<typeof createAdminClient>,
  range: WorkWeekRange,
  planTitle: string,
  actorId: string,
) {
  const { data: plans, error } = await supabase
    .from("work_plans")
    .select("id,title,status,period_start,period_end")
    .eq("title", planTitle)
    .eq("period_start", range.startIso)
    .eq("period_end", range.endIso)
    .in("status", activePlanStatuses)
    .order("created_at", { ascending: true });

  if (error) return { plan: null, error: error.message, errorCode: "draft_plan_not_found" as const };

  const draft = (plans ?? []).find((plan) => plan.status === "draft");
  if (draft) return { plan: draft, error: null };

  const activeNonDraft = (plans ?? []).find((plan) => plan.status !== "draft");
  if (activeNonDraft) {
    return {
      plan: null,
      error: "План вибраного тижня вже надісланий. Заявку не додано.",
      errorCode: "plan_already_sent" as const,
    };
  }

  const { data: created, error: createError } = await supabase
    .from("work_plans")
    .insert({
      title: planTitle,
      period_start: range.startIso,
      period_end: range.endIso,
      status: "draft",
      created_by_profile_id: actorId,
      notes: "Створено під час оновлення планів з dashboard.",
    })
    .select("id,title,status,period_start,period_end")
    .single();

  if (createError) return { plan: null, error: createError.message, errorCode: "draft_plan_not_found" as const };
  return { plan: created, error: null };
}

export async function addTicketsToSelectedWeekPlans(input: {
  ticketIds: string[];
  targetWeek: DashboardPlanRefreshTargetWeek;
  workerOverrides?: Record<string, string | null | undefined>;
  actorId: string;
  historyDescription?: string;
}): Promise<QueryResult<DashboardPlanRefreshSummary>> {
  const summary: DashboardPlanRefreshSummary = emptySummary();
  if (!hasSupabaseEnv()) return { data: summary, error: missingSupabaseMessage };
  if (input.ticketIds.length === 0) return { data: summary, error: null };

  return measureAsync("dashboard-plan-refresh:add", async () => {
    const supabase = createAdminClient();
    const targetRange = input.targetWeek === "current_week" ? getWorkWeekRange() : getNextWorkWeekRange();
    const ticketIds = Array.from(new Set(input.ticketIds));

    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("id, number, status, category_id, assignee_worker_id, category:categories(id,name), assignee:workers(id,name,telegram_username)")
      .in("id", ticketIds);

    if (ticketsError) return { data: summary, error: ticketsError.message };

    const { data: workers, error: workersError } = await supabase
      .from("workers")
      .select("id,name,is_active,telegram_username")
      .eq("is_active", true);

    if (workersError) return { data: summary, error: workersError.message };
    const activeWorkers = (workers ?? []) as WorkerRow[];

    for (const ticket of tickets ?? []) {
      const status = ticket.status as TicketStatus;
      if (blockedStatuses.includes(status) || !addableStatuses.includes(status)) {
        summary.skipped += 1;
        addSummaryDetail(summary, {
          ticketId: ticket.id,
          ticketNumber: ticket.number ?? null,
          status: "skipped",
          reasonCode: reasonCodeForBlockedStatus(status),
          message: status === "pending_review"
            ? `${ticketLabel(ticket)}: спочатку підтвердіть заявку.`
            : `${ticketLabel(ticket)}: статус не дозволяє додати заявку в план.`,
        });
        if (status === "pending_review") {
          await appendHistory(supabase, ticket.id, input.actorId, "Заявку не додано в план під час оновлення: спочатку потрібно підтвердити заявку.");
        }
        continue;
      }

      const existing = await supabase
        .from("work_plan_items")
        .select("id, work_plan:work_plans!inner(id,title,status,period_start,period_end)")
        .eq("ticket_id", ticket.id)
        .in("work_plan.status", activePlanStatuses)
        .limit(1)
        .maybeSingle();

      if (existing.error) {
        summary.errors += 1;
        addSummaryDetail(summary, {
          ticketId: ticket.id,
          ticketNumber: ticket.number ?? null,
          status: "error",
          reasonCode: "check_existing_failed",
          reasonText: reasonText("check_existing_failed", existing.error.message),
          message: `${ticketLabel(ticket)}: ${reasonText("check_existing_failed", existing.error.message)}`,
        });
        continue;
      }

      const existingPlan = existing.data ? one(existing.data.work_plan) : null;
      if (existingPlan) {
        const isSameWeek = sameWeek(existingPlan, targetRange);
        if (isSameWeek) summary.alreadyPlanned += 1;
        else summary.skipped += 1;
        addSummaryDetail(summary, {
          ticketId: ticket.id,
          ticketNumber: ticket.number ?? null,
          status: isSameWeek ? "already_planned" : "skipped",
          reasonCode: isSameWeek ? "already_planned_current_week" : "already_planned_other_active_week",
          message: isSameWeek
            ? `${ticketLabel(ticket)}: вже є в плані вибраного тижня.`
            : `${ticketLabel(ticket)}: ще прив'язана до іншого активного плану. Спочатку натисніть "Оновити систему".`,
        });
        continue;
      }

      const category = one(ticket.category);
      const assignee = one(ticket.assignee);
      const overrideWorkerId = input.workerOverrides?.[ticket.id]?.trim() || null;
      const overrideWorker = overrideWorkerId ? activeWorkers.find((worker) => worker.id === overrideWorkerId) ?? null : null;

      if (overrideWorkerId && !overrideWorker) {
        summary.errors += 1;
        addSummaryDetail(summary, {
          ticketId: ticket.id,
          ticketNumber: ticket.number ?? null,
          status: "error",
          reasonCode: "worker_inactive",
          message: `${ticketLabel(ticket)}: ${reasonText("worker_inactive")}`,
        });
        await appendHistory(supabase, ticket.id, input.actorId, "Заявку не додано в план під час оновлення: вибраного виконавця не знайдено.");
        continue;
      }

      const route = getAutoWorkPlanRoutePreview({
        categoryName: category?.name ?? null,
        worker: overrideWorker
          ? { name: overrideWorker.name, telegram_username: overrideWorker.telegram_username ?? null }
          : assignee
            ? { name: assignee.name, telegram_username: assignee.telegram_username ?? null }
            : null,
      });

      if (!category) {
        summary.errors += 1;
        addSummaryDetail(summary, {
          ticketId: ticket.id,
          ticketNumber: ticket.number ?? null,
          status: "error",
          reasonCode: "missing_category",
          message: `${ticketLabel(ticket)}: ${reasonText("missing_category")}`,
        });
        await appendHistory(supabase, ticket.id, input.actorId, "Заявку не додано в план під час оновлення: у заявки не вибрана категорія.");
        continue;
      }

      if (!route.found || !route.planTitle) {
        summary.errors += 1;
        addSummaryDetail(summary, {
          ticketId: ticket.id,
          ticketNumber: ticket.number ?? null,
          status: "error",
          reasonCode: "category_not_mapped",
          message: `${ticketLabel(ticket)}: ${reasonText("category_not_mapped")} Категорія: ${category.name ?? "без назви"}.`,
        });
        await appendHistory(supabase, ticket.id, input.actorId, "Заявку не додано в план під час оновлення: не знайдено маршрут категорії або виконавця.", {
          categoryName: category?.name ?? null,
        });
        continue;
      }

      const targetWorker = overrideWorker ?? (ticket.assignee_worker_id ? activeWorkers.find((worker) => worker.id === ticket.assignee_worker_id) ?? null : null) ?? findWorkerByRoute(activeWorkers, route.workerName);
      if (!targetWorker) {
        summary.errors += 1;
        const workerReasonCode = ticket.assignee_worker_id ? "worker_inactive" : "worker_not_found";
        addSummaryDetail(summary, {
          ticketId: ticket.id,
          ticketNumber: ticket.number ?? null,
          status: "error",
          reasonCode: workerReasonCode,
          message: `${ticketLabel(ticket)}: ${reasonText(workerReasonCode)}`,
        });
        await appendHistory(supabase, ticket.id, input.actorId, "Заявку не додано в план під час оновлення: не визначено виконавця.", {
          planTitle: route.planTitle,
        });
        continue;
      }

      const planResult = await getOrCreateDraftPlan(supabase, targetRange, route.planTitle, input.actorId);
      if (!planResult.plan) {
        summary.errors += 1;
        const planReasonCode = planResult.errorCode ?? "draft_plan_not_found";
        const planReasonText = reasonText(planReasonCode, planResult.error ?? null);
        addSummaryDetail(summary, {
          ticketId: ticket.id,
          ticketNumber: ticket.number ?? null,
          status: "error",
          reasonCode: planReasonCode,
          reasonText: planReasonText,
          message: `${ticketLabel(ticket)}: ${planReasonText}`,
        });
        await appendHistory(supabase, ticket.id, input.actorId, `Заявку не додано в план під час оновлення: ${planResult.error ?? "план не знайдено"}.`, {
          planTitle: route.planTitle,
          targetWeek: input.targetWeek,
        });
        continue;
      }

      if (overrideWorkerId && ticket.assignee_worker_id !== overrideWorkerId) {
        const updatePayload: Record<string, unknown> = {
          assignee_worker_id: overrideWorkerId,
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (status === "new") updatePayload.status = "assigned";
        const { error: updateError } = await supabase.from("tickets").update(updatePayload).eq("id", ticket.id);
        if (updateError) {
          summary.errors += 1;
          addSummaryDetail(summary, {
            ticketId: ticket.id,
            ticketNumber: ticket.number ?? null,
            status: "error",
            reasonCode: "update_failed",
            reasonText: reasonText("update_failed", updateError.message),
            message: `${ticketLabel(ticket)}: ${reasonText("update_failed", updateError.message)}`,
          });
          continue;
        }
        await appendHistory(supabase, ticket.id, input.actorId, "Виконавця змінено під час оновлення планів.", {
          workerId: overrideWorkerId,
        });
      }

      const { count } = await supabase
        .from("work_plan_items")
        .select("id", { count: "exact", head: true })
        .eq("work_plan_id", planResult.plan.id);

      const { error: insertError } = await supabase.from("work_plan_items").insert({
        work_plan_id: planResult.plan.id,
        ticket_id: ticket.id,
        worker_id: targetWorker.id,
        status: "planned",
        sort_order: count ?? 0,
      });

      if (insertError) {
        if (insertError.code === "23505") {
          summary.alreadyPlanned += 1;
          addSummaryDetail(summary, {
            ticketId: ticket.id,
            ticketNumber: ticket.number ?? null,
            status: "already_planned",
            reasonCode: "already_planned_current_week",
            message: `${ticketLabel(ticket)}: ${reasonText("already_planned_current_week")}`,
          });
        } else {
          summary.errors += 1;
          const insertReasonText = reasonText("insert_failed", insertError.message);
          addSummaryDetail(summary, {
            ticketId: ticket.id,
            ticketNumber: ticket.number ?? null,
            status: "error",
            reasonCode: "insert_failed",
            reasonText: insertReasonText,
            message: `${ticketLabel(ticket)}: ${insertReasonText}`,
          });
        }
        continue;
      }

      await appendHistory(supabase, ticket.id, input.actorId, input.historyDescription ?? "Заявку додано в план через оновлення планів.", {
        planId: planResult.plan.id,
        planTitle: planResult.plan.title,
        targetWeek: input.targetWeek,
        workerId: targetWorker.id,
      });
      summary.added += 1;
      addSummaryDetail(summary, {
        ticketId: ticket.id,
        ticketNumber: ticket.number ?? null,
        status: "added",
        reasonCode: "added",
        message: `${ticketLabel(ticket)}: додано в план ${planResult.plan.title}.`,
      });
    }

    return { data: summary, error: null };
  });
}

export async function autoPlanAllActiveTickets(input: {
  targetWeek: DashboardPlanRefreshTargetWeek;
  actorId: string;
}): Promise<QueryResult<DashboardPlanRefreshSummary>> {
  const summary = emptySummary();
  if (!hasSupabaseEnv()) return { data: summary, error: missingSupabaseMessage };

  return measureAsync("dashboard-plan-refresh:auto-plan", async () => {
    const supabase = createAdminClient();
    const { data: tickets, error } = await supabase
      .from("tickets")
      .select("id")
      .in("status", addableStatuses)
      .order("created_at", { ascending: true })
      .limit(2000);

    if (error) return { data: summary, error: error.message };

    const ticketIds = (tickets ?? [])
      .map((ticket) => ticket.id)
      .filter((ticketId): ticketId is string => Boolean(ticketId));

    if (ticketIds.length === 0) {
      addSummaryDetail(summary, {
        ticketId: "system",
        ticketNumber: null,
        status: "skipped",
        reasonCode: "no_active_tickets",
        message: "Немає активних заявок для планування.",
      });
      return { data: summary, error: null };
    }

    return addTicketsToSelectedWeekPlans({
      actorId: input.actorId,
      targetWeek: input.targetWeek,
      ticketIds,
      workerOverrides: {},
      historyDescription: "Заявку додано в план через автопланування.",
    });
  });
}
