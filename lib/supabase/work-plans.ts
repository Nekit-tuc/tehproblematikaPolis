import { measureAsync } from "@/lib/performance";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { sendWorkPlanToWorker } from "@/lib/telegram/work-plan-notifications";
import type { TicketStatus, TicketWithRelations, Worker } from "@/types/domain";
import type { QueryResult } from "./queries";

export type WorkPlanStatus = "draft" | "sent" | "partially_done" | "done" | "cancelled";

export type WorkPlan = {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  status: WorkPlanStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  sent_at?: string | null;
  notes?: string | null;
  items_count?: number;
};

export type WorkPlanningSummary = {
  totalActive: number;
  plannedActive: number;
  unplannedActive: number;
};

export type PlanningTicket = TicketWithRelations & {
  isPlanned: boolean;
  plannedPlanId: string | null;
  plannedPlanTitle: string | null;
  plannedPlanStatus: WorkPlanStatus | null;
  plannedPlanPeriodStart: string | null;
  plannedPlanPeriodEnd: string | null;
};

export type ActivePlannedTicket = {
  ticketId: string;
  ticketNumber: string | null;
  planId: string;
  planTitle: string;
  planStatus: WorkPlanStatus;
  planPeriodStart: string;
  planPeriodEnd: string;
};

export type WorkPlanItem = {
  id: string;
  work_plan_id: string;
  ticket_id: string;
  worker_id?: string | null;
  category?: string | null;
  sort_order: number;
  created_at: string;
  ticket?: TicketWithRelations | null;
  worker?: Worker | null;
};

export type WorkPlanDispatchStatus = "sent" | "failed" | "skipped_no_telegram";
export type SendWorkPlanMode = "initial" | "retry_failed" | "resend_all";

export type WorkPlanDispatch = {
  id: string;
  work_plan_id: string;
  worker_id?: string | null;
  telegram_chat_id?: string | null;
  sent_at: string;
  status: WorkPlanDispatchStatus;
  message_id?: string | null;
  error?: string | null;
  worker?: Worker | null;
};

export type PlanningFilters = {
  from?: string;
  to?: string;
  categoryId?: string;
  workerId?: string;
  status?: TicketStatus | "";
  objectId?: string;
  assignment?: "all" | "with_worker" | "without_worker";
  limit?: number;
};

export type CreateWorkPlanInput = {
  title: string;
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
  createdBy?: string | null;
};

export type UpdateWorkPlanInput = {
  title: string;
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
};

const planningStatuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting_admin_confirmation"];
const activeWorkPlanStatuses: WorkPlanStatus[] = ["draft", "sent", "partially_done"];

const planningTicketSelect = `
  id,
  number,
  title,
  description,
  status,
  priority,
  object_id,
  category_id,
  created_by,
  assigned_to,
  assignee_worker_id,
  due_at,
  completed_at,
  worker_completed_at,
  assigned_at,
  source,
  created_at,
  updated_at,
  object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
  category:categories(id, name, description, is_active, created_at)
`;

const planItemSelect = `
  id,
  work_plan_id,
  ticket_id,
  worker_id,
  category,
  sort_order,
  created_at,
  worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at),
  ticket:tickets(
    id,
    number,
    title,
    description,
    status,
    priority,
    object_id,
    category_id,
    created_by,
    assigned_to,
    assignee_worker_id,
    due_at,
    completed_at,
    worker_completed_at,
    assigned_at,
    source,
    created_at,
    updated_at,
    object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
    category:categories(id, name, description, is_active, created_at)
  )
`;

const dispatchSelect = `
  id,
  work_plan_id,
  worker_id,
  telegram_chat_id,
  sent_at,
  status,
  message_id,
  error,
  worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at)
`;

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

type ActivePlanItemRow = {
  ticket_id: string;
  ticket?: { number?: string | null } | { number?: string | null }[] | null;
  work_plan?: {
    id: string;
    title: string;
    status: WorkPlanStatus;
    period_start: string;
    period_end: string;
  } | {
    id: string;
    title: string;
    status: WorkPlanStatus;
    period_start: string;
    period_end: string;
  }[] | null;
};

function planFromRow(row: ActivePlanItemRow) {
  const plan = Array.isArray(row.work_plan) ? row.work_plan[0] : row.work_plan;
  return plan ?? null;
}

function ticketFromRow(row: ActivePlanItemRow) {
  const ticket = Array.isArray(row.ticket) ? row.ticket[0] : row.ticket;
  return ticket ?? null;
}

async function getActivePlannedItemRows(ticketIds: string[]) {
  if (ticketIds.length === 0) return { data: [] as ActivePlanItemRow[], error: null };
  const supabase = await createClient();
  const { data, error } = await measureAsync("work-planning:active_planned_items", () =>
    supabase
      .from("work_plan_items")
      .select(`
        ticket_id,
        ticket:tickets(number),
        work_plan:work_plans!inner(id, title, status, period_start, period_end)
      `)
      .in("ticket_id", ticketIds)
      .in("work_plan.status", activeWorkPlanStatuses),
  );
  return { data: (data ?? []) as unknown as ActivePlanItemRow[], error: error?.message ?? null };
}

function plannedInfoMap(rows: ActivePlanItemRow[]) {
  const map = new Map<string, ActivePlannedTicket>();
  for (const row of rows) {
    const plan = planFromRow(row);
    if (!plan || map.has(row.ticket_id)) continue;
    map.set(row.ticket_id, {
      ticketId: row.ticket_id,
      ticketNumber: ticketFromRow(row)?.number ?? null,
      planId: plan.id,
      planTitle: plan.title,
      planStatus: plan.status,
      planPeriodStart: plan.period_start,
      planPeriodEnd: plan.period_end,
    });
  }
  return map;
}

export async function getActivePlannedTickets(ticketIds: string[]): Promise<QueryResult<ActivePlannedTicket[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const uniqueTicketIds = Array.from(new Set(ticketIds.filter(Boolean)));
  const rowsResult = await getActivePlannedItemRows(uniqueTicketIds);
  if (rowsResult.error) return { data: [], error: rowsResult.error };
  return { data: Array.from(plannedInfoMap(rowsResult.data).values()), error: null };
}

export async function getPlanningTickets(filters: PlanningFilters = {}): Promise<QueryResult<PlanningTicket[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase
    .from("tickets")
    .select(planningTicketSelect)
    .in("status", planningStatuses)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59`);
  if (filters.categoryId && filters.categoryId !== "all") query = query.eq("category_id", filters.categoryId);
  if (filters.workerId && filters.workerId !== "all") query = query.eq("assignee_worker_id", filters.workerId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.objectId && filters.objectId !== "all") query = query.eq("object_id", filters.objectId);
  if (filters.assignment === "with_worker") query = query.not("assignee_worker_id", "is", null);
  if (filters.assignment === "without_worker") query = query.is("assignee_worker_id", null);

  const { data, error } = await measureAsync("work-planning:tickets", () => query);
  if (error) return { data: [], error: error.message };

  const tickets = (data ?? []) as unknown as TicketWithRelations[];
  const plannedRowsResult = await getActivePlannedItemRows(tickets.map((ticket) => ticket.id));
  const plannedMap = plannedInfoMap(plannedRowsResult.data);
  const ticketsWithPlanning = tickets.map((ticket) => {
    const planned = plannedMap.get(ticket.id);
    return {
      ...ticket,
      isPlanned: Boolean(planned),
      plannedPlanId: planned?.planId ?? null,
      plannedPlanTitle: planned?.planTitle ?? null,
      plannedPlanStatus: planned?.planStatus ?? null,
      plannedPlanPeriodStart: planned?.planPeriodStart ?? null,
      plannedPlanPeriodEnd: planned?.planPeriodEnd ?? null,
    };
  });
  return { data: ticketsWithPlanning, error: plannedRowsResult.error };
}

export async function getTicketsGroupedByCategory(filters: PlanningFilters = {}) {
  const ticketsResult = await getPlanningTickets(filters);
  const groups = new Map<string, { categoryName: string; tickets: PlanningTicket[] }>();
  for (const ticket of ticketsResult.data) {
    const categoryId = ticket.category_id || "uncategorized";
    const categoryName = ticket.category?.name ?? "Без категорії";
    const group = groups.get(categoryId) ?? { categoryName, tickets: [] };
    group.tickets.push(ticket);
    groups.set(categoryId, group);
  }
  return { data: Array.from(groups.entries()).map(([categoryId, group]) => ({ categoryId, ...group })), error: ticketsResult.error };
}

export async function createWorkPlan(input: CreateWorkPlanInput): Promise<QueryResult<WorkPlan | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await measureAsync("work-planning:create_plan", () =>
    supabase
      .from("work_plans")
      .insert({
        title: input.title,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        notes: input.notes || null,
        created_by: input.createdBy || null,
      })
      .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes")
      .single(),
  );
  return { data: data as WorkPlan | null, error: error?.message ?? null };
}

export async function addTicketsToWorkPlan(workPlanId: string, ticketIds: string[]) {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const uniqueTicketIds = Array.from(new Set(ticketIds.filter(Boolean)));
  if (uniqueTicketIds.length === 0) return { data: null, error: "Оберіть хоча б одну заявку для плану." };

  const supabase = await createClient();
  const { data: tickets, error: ticketError } = await measureAsync("work-planning:selected_tickets", () =>
    supabase
      .from("tickets")
      .select("id, assignee_worker_id, category:categories(name)")
      .in("id", uniqueTicketIds),
  );
  if (ticketError) return { data: null, error: ticketError.message };

  const rows = ((tickets ?? []) as Array<{ id: string; assignee_worker_id?: string | null; category?: { name?: string | null } | { name?: string | null }[] | null }>).map((ticket, index) => {
    const category = Array.isArray(ticket.category) ? ticket.category[0] : ticket.category;
    return {
      work_plan_id: workPlanId,
      ticket_id: ticket.id,
      worker_id: ticket.assignee_worker_id ?? null,
      category: category?.name ?? null,
      sort_order: index,
    };
  });

  if (rows.length === 0) return { data: null, error: "Вибрані заявки не знайдено." };
  const { data, error } = await measureAsync("work-planning:add_items", () =>
    supabase.from("work_plan_items").insert(rows).select("id"),
  );
  return { data, error: error?.message ?? null };
}

export async function removeTicketFromWorkPlan(workPlanId: string, ticketId: string) {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plan_items")
    .delete()
    .eq("work_plan_id", workPlanId)
    .eq("ticket_id", ticketId)
    .select("id");
  return { data, error: error?.message ?? null };
}

export async function getWorkPlans(): Promise<QueryResult<WorkPlan[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("work-planning:plans", () =>
    supabase
      .from("work_plans")
      .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes, work_plan_items(id)")
      .order("created_at", { ascending: false })
      .limit(20),
  );

  const plans = ((data ?? []) as Array<WorkPlan & { work_plan_items?: Array<{ id: string }> | null }>).map((plan) => ({
    ...plan,
    items_count: plan.work_plan_items?.length ?? 0,
  }));
  return { data: plans, error: error?.message ?? null };
}

export async function getWorkPlanById(id: string): Promise<QueryResult<WorkPlan | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plans")
    .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes")
    .eq("id", id)
    .maybeSingle();
  return { data: data as WorkPlan | null, error: error?.message ?? null };
}

export async function updateWorkPlan(id: string, input: UpdateWorkPlanInput): Promise<QueryResult<WorkPlan | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plans")
    .update({
      title: input.title,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      notes: input.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes")
    .maybeSingle();
  return { data: data as WorkPlan | null, error: error?.message ?? null };
}

export async function getWorkPlanItems(id: string): Promise<QueryResult<WorkPlanItem[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plan_items")
    .select(planItemSelect)
    .eq("work_plan_id", id)
    .order("sort_order", { ascending: true });
  return { data: (data ?? []) as unknown as WorkPlanItem[], error: error?.message ?? null };
}

export async function removeWorkPlanItem(workPlanId: string, ticketId: string) {
  const planResult = await getWorkPlanById(workPlanId);
  if (planResult.error) return { data: null, error: planResult.error };
  if (!planResult.data) return { data: null, error: "План не знайдено." };
  if (planResult.data.status !== "draft") return { data: null, error: "Змінювати склад можна тільки у чернетці плану." };
  return removeTicketFromWorkPlan(workPlanId, ticketId);
}

export async function updateWorkPlanStatus(id: string, status: WorkPlanStatus) {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return { data, error: error?.message ?? null };
}

export async function cancelWorkPlan(workPlanId: string) {
  const planResult = await getWorkPlanById(workPlanId);
  if (planResult.error) return { data: null, error: planResult.error };
  if (!planResult.data) return { data: null, error: "План не знайдено." };
  if (planResult.data.status !== "draft") return { data: null, error: "Скасувати можна тільки чернетку плану." };
  return updateWorkPlanStatus(workPlanId, "cancelled");
}

export async function getWorkPlanDispatches(workPlanId: string): Promise<QueryResult<WorkPlanDispatch[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plan_dispatches")
    .select(dispatchSelect)
    .eq("work_plan_id", workPlanId)
    .order("sent_at", { ascending: false });
  return { data: (data ?? []) as unknown as WorkPlanDispatch[], error: error?.message ?? null };
}

function groupedItemsByWorker(items: WorkPlanItem[]) {
  const groups = new Map<string, WorkPlanItem[]>();
  for (const item of items) {
    if (!item.worker_id) continue;
    const group = groups.get(item.worker_id) ?? [];
    group.push(item);
    groups.set(item.worker_id, group);
  }
  return groups;
}

function latestDispatchByWorker(dispatches: WorkPlanDispatch[]) {
  const latest = new Map<string, WorkPlanDispatch>();
  for (const dispatch of dispatches) {
    if (!dispatch.worker_id || latest.has(dispatch.worker_id)) continue;
    latest.set(dispatch.worker_id, dispatch);
  }
  return latest;
}

function filterWorkerGroupsByMode(
  workerGroups: Map<string, WorkPlanItem[]>,
  dispatches: WorkPlanDispatch[],
  mode: SendWorkPlanMode,
) {
  if (mode === "initial" || mode === "resend_all") return workerGroups;

  const latest = latestDispatchByWorker(dispatches);
  const retryGroups = new Map<string, WorkPlanItem[]>();
  for (const [workerId, items] of workerGroups.entries()) {
    const lastDispatch = latest.get(workerId);
    if (!lastDispatch || lastDispatch.status === "failed" || lastDispatch.status === "skipped_no_telegram") {
      retryGroups.set(workerId, items);
    }
  }
  return retryGroups;
}

async function createDispatchRow(input: {
  workPlanId: string;
  workerId: string;
  telegramChatId?: string | null;
  status: WorkPlanDispatchStatus;
  messageId?: string | null;
  error?: string | null;
}) {
  const supabase = await createClient();
  return supabase.from("work_plan_dispatches").insert({
    work_plan_id: input.workPlanId,
    worker_id: input.workerId,
    telegram_chat_id: input.telegramChatId ?? null,
    status: input.status,
    message_id: input.messageId ?? null,
    error: input.error ?? null,
  });
}

const WORK_PLAN_SEND_CONCURRENCY = 4;

type WorkerSendResult = {
  sent: number;
  failed: number;
  skipped: number;
};

async function sendWorkPlanToWorkerGroup(input: {
  workPlanId: string;
  plan: WorkPlan;
  workerId: string;
  items: WorkPlanItem[];
}): Promise<WorkerSendResult> {
  const { workPlanId, plan, workerId, items } = input;
  const worker = items[0]?.worker;
  if (!worker) {
    await createDispatchRow({ workPlanId, workerId, status: "failed", error: "Виконавця не знайдено." });
    return { sent: 0, failed: 1, skipped: 0 };
  }

  if (!worker.telegram_id) {
    await createDispatchRow({ workPlanId, workerId, status: "skipped_no_telegram", error: "У виконавця не підключено Telegram." });
    return { sent: 0, failed: 0, skipped: 1 };
  }

  const result = await sendWorkPlanToWorker(worker, plan, items);
  if (result.ok) {
    await createDispatchRow({
      workPlanId,
      workerId,
      telegramChatId: worker.telegram_id,
      status: "sent",
      messageId: result.messageIds.join(","),
    });
    return { sent: 1, failed: 0, skipped: 0 };
  }

  await createDispatchRow({
    workPlanId,
    workerId,
    telegramChatId: worker.telegram_id,
    status: "failed",
    error: result.error,
  });
  return { sent: 0, failed: 1, skipped: 0 };
}


export async function getWorkPlanningSummary(): Promise<QueryResult<WorkPlanningSummary>> {
  if (!hasSupabaseEnv()) return emptyWithError({ totalActive: 0, plannedActive: 0, unplannedActive: 0 });
  const supabase = await createClient();
  const activeStatuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation", "pending_review"];

  const [activeTicketsResult, plannedRowsResult] = await Promise.all([
    measureAsync("work-planning:summary_active_tickets", () =>
      supabase.from("tickets").select("id", { count: "exact" }).in("status", activeStatuses),
    ),
    measureAsync("work-planning:summary_planned_items", () =>
      supabase
        .from("work_plan_items")
        .select("ticket_id, ticket:tickets!inner(status), work_plan:work_plans!inner(status)")
        .in("work_plan.status", ["sent", "partially_done"])
        .in("ticket.status", activeStatuses),
    ),
  ]);

  if (activeTicketsResult.error) return { data: { totalActive: 0, plannedActive: 0, unplannedActive: 0 }, error: activeTicketsResult.error.message };
  if (plannedRowsResult.error) return { data: { totalActive: activeTicketsResult.count ?? 0, plannedActive: 0, unplannedActive: activeTicketsResult.count ?? 0 }, error: plannedRowsResult.error.message };

  const totalActive = activeTicketsResult.count ?? 0;
  const plannedActive = new Set(((plannedRowsResult.data ?? []) as Array<{ ticket_id: string }>).map((row) => row.ticket_id)).size;
  return { data: { totalActive, plannedActive, unplannedActive: Math.max(totalActive - plannedActive, 0) }, error: null };
}

export async function getWorkPlanActiveTicketCount(): Promise<QueryResult<number>> {
  const summary = await getWorkPlanningSummary();
  return { data: summary.data.plannedActive, error: summary.error };
}

export async function deleteWorkPlan(workPlanId: string, actorId: string): Promise<QueryResult<null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };

  const planResult = await getWorkPlanById(workPlanId);
  if (planResult.error) return { data: null, error: planResult.error };
  if (!planResult.data) return { data: null, error: "План не знайдено." };
  if (planResult.data.status === "done") {
    return { data: null, error: "Завершений план не можна видалити. Його можна переглянути в архіві." };
  }

  const itemsResult = await getWorkPlanItems(workPlanId);
  if (itemsResult.error) return { data: null, error: itemsResult.error };

  const supabase = await createClient();
  const ticketIds = Array.from(new Set(itemsResult.data.map((item) => item.ticket_id).filter(Boolean)));

  if (ticketIds.length > 0) {
    const historyRows = ticketIds.map((ticketId) => ({
      ticket_id: ticketId,
      actor_id: actorId,
      action: "План робіт видалено. Заявку повернуто до доступних для планування.",
      metadata: { work_plan_id: workPlanId, work_plan_status: planResult.data?.status ?? null },
    }));
    const { error: historyError } = await supabase.from("ticket_history").insert(historyRows);
    if (historyError) return { data: null, error: historyError.message };
  }

  const { error: dispatchError } = await supabase.from("work_plan_dispatches").delete().eq("work_plan_id", workPlanId);
  if (dispatchError) return { data: null, error: dispatchError.message };

  const { error: itemsError } = await supabase.from("work_plan_items").delete().eq("work_plan_id", workPlanId);
  if (itemsError) return { data: null, error: itemsError.message };

  const { error } = await supabase.from("work_plans").delete().eq("id", workPlanId);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function sendWorkPlanToWorkers(
  workPlanId: string,
  options: { mode?: SendWorkPlanMode } = {},
): Promise<QueryResult<{ sent: number; failed: number; skipped: number } | null>> {
  const mode = options.mode ?? "initial";
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const planResult = await getWorkPlanById(workPlanId);
  if (planResult.error) return { data: null, error: planResult.error };
  if (!planResult.data) return { data: null, error: "План не знайдено." };
  const plan = planResult.data;
  if (mode === "initial" && plan.status !== "draft") {
    return { data: null, error: "Первинне надсилання доступне тільки для чернетки плану." };
  }
  if (mode !== "initial" && (plan.status === "draft" || plan.status === "cancelled")) {
    return { data: null, error: "Повторне надсилання доступне тільки для вже надісланого активного плану." };
  }

  const dispatchesResult = await getWorkPlanDispatches(workPlanId);
  if (dispatchesResult.error) return { data: null, error: dispatchesResult.error };

  const itemsResult = await getWorkPlanItems(workPlanId);
  if (itemsResult.error) return { data: null, error: itemsResult.error };
  const workerGroups = groupedItemsByWorker(itemsResult.data);
  if (workerGroups.size === 0) return { data: null, error: "У плані немає заявок із призначеними виконавцями." };

  const targetGroups = filterWorkerGroupsByMode(workerGroups, dispatchesResult.data, mode);
  if (targetGroups.size === 0) return { data: { sent: 0, failed: 0, skipped: 0 }, error: null };

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const workerEntries = Array.from(targetGroups.entries());
  for (let index = 0; index < workerEntries.length; index += WORK_PLAN_SEND_CONCURRENCY) {
    const batch = workerEntries.slice(index, index + WORK_PLAN_SEND_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(([workerId, items]) => sendWorkPlanToWorkerGroup({ workPlanId, plan, workerId, items })),
    );

    for (const [resultIndex, result] of results.entries()) {
      if (result.status === "fulfilled") {
        sent += result.value.sent;
        failed += result.value.failed;
        skipped += result.value.skipped;
        continue;
      }

      failed += 1;
      const [workerId] = batch[resultIndex];
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      await createDispatchRow({ workPlanId, workerId, status: "failed", error: message });
    }
  }

  if (mode === "initial" && sent > 0) {
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("work_plans")
      .update({ status: "sent", sent_at: now, updated_at: now })
      .eq("id", workPlanId);
    if (error) return { data: null, error: error.message };
  }

  return { data: { sent, failed, skipped }, error: null };
}
