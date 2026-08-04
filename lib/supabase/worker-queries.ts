import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { cache } from "react";
import { measureAsync } from "@/lib/performance";
import { addDays, getPreviousWorkWeekRange, getWorkWeekRange, type WorkWeekRange } from "@/lib/date/work-week";
import type { Category, Ticket, TicketWithRelations, Worker, WorkerStats, WorkerWithCategories } from "@/types/domain";
import type { QueryResult } from "./queries";

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

function normalizeWorker(worker: WorkerWithCategories): WorkerWithCategories {
  return {
    ...worker,
    categories: (worker.worker_categories ?? [])
      .map((item) => Array.isArray(item.category) ? item.category[0] : item.category)
      .filter((category): category is Category => Boolean(category?.is_active)),
  };
}

const inactiveTicketStatuses = ["done", "completed", "cancelled", "rejected"];
const workerSelect = `
  id,
  name,
  phone,
  telegram_username,
  telegram_id,
  is_active,
  notes,
  created_at,
  updated_at,
  worker_categories(
    id,
    worker_id,
    category_id,
    created_at,
    category:categories(id, name, description, is_active, created_at)
  )
`;

export async function getWorkers(): Promise<QueryResult<WorkerWithCategories[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:list", () => supabase
    .from("workers")
    .select(workerSelect)
    .order("is_active", { ascending: false })
    .order("name"));

  return { data: ((data ?? []) as unknown as WorkerWithCategories[]).map(normalizeWorker), error: error?.message ?? null };
}

export const getActiveWorkers = cache(async function getActiveWorkers(): Promise<QueryResult<WorkerWithCategories[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:active", () => supabase
    .from("workers")
    .select(workerSelect)
    .eq("is_active", true)
    .order("name"));

  return { data: ((data ?? []) as unknown as WorkerWithCategories[]).map(normalizeWorker), error: error?.message ?? null };
});

export async function getWorkerById(id: string): Promise<QueryResult<WorkerWithCategories | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await measureAsync("worker:detail", () => supabase
    .from("workers")
    .select(workerSelect)
    .eq("id", id)
    .maybeSingle());

  return { data: data ? normalizeWorker(data as unknown as WorkerWithCategories) : null, error: error?.message ?? null };
}

export async function getWorkersByCategory(categoryId: string): Promise<QueryResult<WorkerWithCategories[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:by_category", () => supabase
    .from("workers")
    .select(workerSelect)
    .eq("is_active", true)
    .eq("worker_categories.category_id", categoryId)
    .order("name"));
  return { data: ((data ?? []) as unknown as WorkerWithCategories[]).map(normalizeWorker), error: error?.message ?? null };
}

export type TicketFilterWorker = Pick<Worker, "id" | "name" | "is_active">;

export const getTicketFilterWorkers = cache(async function getTicketFilterWorkers(): Promise<QueryResult<TicketFilterWorker[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("tickets:filter_workers", () =>
    supabase
      .from("workers")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("name"),
  );

  return { data: (data ?? []) as TicketFilterWorker[], error: error?.message ?? null };
});

export async function findRecommendedWorkerForTicket(
  ticket: Pick<Ticket, "category_id">,
): Promise<QueryResult<WorkerWithCategories | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };

  const workersResult = await getActiveWorkers();
  if (workersResult.error) return { data: null, error: workersResult.error };

  const workers = workersResult.data.filter((worker) => Boolean(worker.telegram_id));
  if (workers.length === 0) return { data: null, error: null };

  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:workload", () => supabase
    .from("tickets")
    .select("assignee_worker_id,status")
    .not("assignee_worker_id", "is", null));

  if (error) return { data: null, error: error.message };

  const activeCounts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ assignee_worker_id: string | null; status: string }>) {
    if (inactiveTicketStatuses.includes(row.status)) continue;
    if (!row.assignee_worker_id) continue;
    activeCounts.set(row.assignee_worker_id, (activeCounts.get(row.assignee_worker_id) ?? 0) + 1);
  }

  const candidates = workers.filter((worker) => worker.categories?.some((category) => category.id === ticket.category_id));
  if (candidates.length === 0) {
    console.info("[worker-auto-assignment] no_worker_found", { categoryId: ticket.category_id });
    return { data: null, error: null };
  }
  const [recommendedWorker] = [...candidates].sort((left, right) => {
    const workloadDiff = (activeCounts.get(left.id) ?? 0) - (activeCounts.get(right.id) ?? 0);
    return workloadDiff || left.name.localeCompare(right.name, "uk");
  });

  if (recommendedWorker) {
    console.info("[worker-auto-assignment] assigned", {
      categoryId: ticket.category_id,
      workerId: recommendedWorker.id,
      activeTickets: activeCounts.get(recommendedWorker.id) ?? 0,
    });
  }

  return { data: recommendedWorker ?? null, error: null };
}

export async function getWorkerStats(): Promise<QueryResult<WorkerStats[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const workersResult = await getWorkers();
  if (workersResult.error) return { data: [], error: workersResult.error };

  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:stats_rows", () => supabase
    .from("tickets")
    .select("assignee_worker_id,status,admin_rating")
    .not("assignee_worker_id", "is", null));
  if (error) return { data: [], error: error.message };

  const rows = (data ?? []) as Array<{ assignee_worker_id: string | null; status: string; admin_rating: number | null }>;
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.assignee_worker_id) continue;
    const scoped = grouped.get(row.assignee_worker_id) ?? [];
    scoped.push(row);
    grouped.set(row.assignee_worker_id, scoped);
  }
  const stats = workersResult.data.map((worker) => {
    const assigned = grouped.get(worker.id) ?? [];
    const ratings = assigned.map((row) => row.admin_rating).filter((rating): rating is number => typeof rating === "number");
    return {
      worker,
      total: assigned.length,
      active: assigned.filter((row) => !["done", "cancelled", "rejected"].includes(row.status)).length,
      done: assigned.filter((row) => row.status === "done").length,
      waitingConfirmation: assigned.filter((row) => row.status === "waiting_admin_confirmation").length,
      averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    };
  });

  return { data: stats, error: null };
}

const workerTicketSelect = `
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
  assigned_at,
  sent_to_worker_at,
  worker_completed_at,
  admin_confirmed_at,
  admin_rating,
  admin_feedback,
  source,
  telegram_source_group_id,
  created_at,
  updated_at,
  object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
  category:categories(id, name, description, is_active, created_at),
  creator:profiles!tickets_created_by_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at),
  assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at)
`;

export async function getTicketsByWorkerId(workerId: string): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("worker:tickets", () => supabase
    .from("tickets")
    .select(workerTicketSelect)
    .eq("assignee_worker_id", workerId)
    .order("created_at", { ascending: false })
    .limit(100));

  return { data: (data ?? []) as unknown as TicketWithRelations[], error: error?.message ?? null };
}

export type WorkerTicketPeriod = "this_week" | "previous_week" | "month" | "custom";

export type WorkerTicketPeriodRange = {
  period: WorkerTicketPeriod;
  from: string;
  to: string;
  fromIso: string;
  toIso: string;
  label: string;
};

export type WorkerPlanTicketRow = {
  itemId: string;
  ticketId: string;
  workerId: string | null;
  createdAt: string;
  ticket: TicketWithRelations;
  plan: {
    id: string;
    title: string;
    status: string;
    period_start: string;
    period_end: string;
  } | null;
};

export type WorkerTicketOverview = {
  period: WorkerTicketPeriodRange;
  activeTickets: TicketWithRelations[];
  plannedTickets: WorkerPlanTicketRow[];
  completedTickets: WorkerPlanTicketRow[];
  stats: {
    active: number;
    planned: number;
    completed: number;
    waitingConfirmation: number;
  };
};

const activeWorkerTicketStatuses = ["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation"];
const activeWorkPlanStatuses = ["draft", "sent", "partially_done"];

const workerOverviewTicketSelect = `
  id,
  number,
  title,
  description,
  status,
  priority,
  object_id,
  category_id,
  assignee_worker_id,
  due_at,
  completed_at,
  assigned_at,
  sent_to_worker_at,
  worker_completed_at,
  admin_confirmed_at,
  source,
  repeat_count,
  last_repeat_at,
  created_at,
  updated_at,
  object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
  category:categories(id, name, description, is_active, created_at),
  worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at)
`;

function formatPeriodDate(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

function formatShortPeriod(start: Date | string, end: Date | string) {
  return `${formatPeriodDate(start).slice(0, 5)} - ${formatPeriodDate(end).slice(0, 5)}`;
}

function monthRange(now = new Date()): WorkWeekRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return {
    start,
    end,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function customRange(from?: string, to?: string): WorkWeekRange | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? "")) return null;
  const start = new Date(`${from}T00:00:00`);
  const end = addDays(new Date(`${to}T00:00:00`), 1);
  return {
    start,
    end,
    startDate: from!,
    endDate: to!,
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function resolveWorkerTicketPeriod(period?: string, from?: string, to?: string): WorkerTicketPeriodRange {
  const requested: WorkerTicketPeriod = period === "previous_week" || period === "month" || period === "custom" ? period : "this_week";
  const custom = requested === "custom" ? customRange(from, to) : null;
  const selected: WorkerTicketPeriod = requested === "custom" && !custom ? "this_week" : requested;
  const range = selected === "previous_week" ? getPreviousWorkWeekRange() : selected === "month" ? monthRange() : selected === "custom" ? custom! : getWorkWeekRange();

  return {
    period: selected,
    from: range.startDate,
    to: selected === "custom" ? addDays(range.end, -1).toISOString().slice(0, 10) : range.endDate,
    fromIso: range.startIso,
    toIso: range.endIso,
    label: selected === "custom" ? `${formatPeriodDate(range.start)} - ${formatPeriodDate(addDays(range.end, -1))}` : formatShortPeriod(range.start, range.end),
  };
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeOverviewTicket(row: TicketWithRelations): TicketWithRelations {
  return {
    ...row,
    object: normalizeRelation(row.object),
    category: normalizeRelation(row.category),
    worker: normalizeRelation(row.worker),
  };
}

export function getWorkerTicketCompletionDate(ticket: Pick<TicketWithRelations, "admin_confirmed_at" | "worker_completed_at" | "completed_at" | "updated_at" | "status">) {
  return ticket.admin_confirmed_at ?? ticket.worker_completed_at ?? ticket.completed_at ?? (ticket.status === "done" ? ticket.updated_at : null);
}

function dateInRange(value: string | null | undefined, fromIso: string, toIso: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= new Date(fromIso).getTime() && time < new Date(toIso).getTime();
}

type RawPlanTicketRow = {
  id: string;
  ticket_id: string;
  worker_id?: string | null;
  created_at: string;
  ticket?: TicketWithRelations | TicketWithRelations[] | null;
  work_plan?: WorkerPlanTicketRow["plan"] | WorkerPlanTicketRow["plan"][] | null;
};

function normalizePlanRow(row: RawPlanTicketRow): WorkerPlanTicketRow | null {
  const ticket = normalizeRelation(row.ticket);
  if (!ticket) return null;
  return {
    itemId: row.id,
    ticketId: row.ticket_id,
    workerId: row.worker_id ?? null,
    createdAt: row.created_at,
    ticket: normalizeOverviewTicket(ticket),
    plan: normalizeRelation(row.work_plan),
  };
}

function dedupeTickets(tickets: TicketWithRelations[]) {
  const map = new Map<string, TicketWithRelations>();
  for (const ticket of tickets) if (!map.has(ticket.id)) map.set(ticket.id, ticket);
  return [...map.values()];
}

function dedupePlanRows(rows: WorkerPlanTicketRow[]) {
  const map = new Map<string, WorkerPlanTicketRow>();
  for (const row of rows) {
    const existing = map.get(row.ticketId);
    if (!existing || new Date(row.plan?.period_start ?? row.createdAt).getTime() > new Date(existing.plan?.period_start ?? existing.createdAt).getTime()) {
      map.set(row.ticketId, row);
    }
  }
  return [...map.values()].sort((left, right) => new Date(right.plan?.period_start ?? right.createdAt).getTime() - new Date(left.plan?.period_start ?? left.createdAt).getTime());
}

export async function getWorkerTicketOverview(workerId: string, period?: string, from?: string, to?: string): Promise<QueryResult<WorkerTicketOverview>> {
  const periodRange = resolveWorkerTicketPeriod(period, from, to);
  const emptyData: WorkerTicketOverview = {
    period: periodRange,
    activeTickets: [],
    plannedTickets: [],
    completedTickets: [],
    stats: { active: 0, planned: 0, completed: 0, waitingConfirmation: 0 },
  };
  if (!hasSupabaseEnv()) return emptyWithError(emptyData);

  const supabase = await createClient();
  const [assignedActiveResult, activePlannedResult, plannedPeriodResult, assignedCompletedResult, plannedCompletedResult] = await Promise.all([
    measureAsync("worker:active_tickets", () =>
      supabase
        .from("tickets")
        .select(workerOverviewTicketSelect)
        .eq("assignee_worker_id", workerId)
        .in("status", activeWorkerTicketStatuses)
        .order("created_at", { ascending: false })
        .limit(150),
    ),
    measureAsync("worker:active_plan_tickets", () =>
      supabase
        .from("work_plan_items")
        .select(`id, ticket_id, worker_id, created_at, work_plan:work_plans!inner(id, title, status, period_start, period_end), ticket:tickets!inner(${workerOverviewTicketSelect})`)
        .eq("worker_id", workerId)
        .in("work_plan.status", activeWorkPlanStatuses)
        .in("ticket.status", activeWorkerTicketStatuses)
        .limit(250),
    ),
    measureAsync("worker:planned_tickets", () =>
      supabase
        .from("work_plan_items")
        .select(`id, ticket_id, worker_id, created_at, work_plan:work_plans!inner(id, title, status, period_start, period_end), ticket:tickets!inner(${workerOverviewTicketSelect})`)
        .eq("worker_id", workerId)
        .gte("work_plan.period_start", periodRange.fromIso)
        .lt("work_plan.period_start", periodRange.toIso)
        .limit(500),
    ),
    measureAsync("worker:completed_assigned_tickets", () =>
      supabase
        .from("tickets")
        .select(workerOverviewTicketSelect)
        .eq("assignee_worker_id", workerId)
        .eq("status", "done")
        .order("updated_at", { ascending: false })
        .limit(500),
    ),
    measureAsync("worker:completed_plan_tickets", () =>
      supabase
        .from("work_plan_items")
        .select(`id, ticket_id, worker_id, created_at, work_plan:work_plans!inner(id, title, status, period_start, period_end), ticket:tickets!inner(${workerOverviewTicketSelect})`)
        .eq("worker_id", workerId)
        .eq("ticket.status", "done")
        .limit(700),
    ),
  ]);

  const error = assignedActiveResult.error ?? activePlannedResult.error ?? plannedPeriodResult.error ?? assignedCompletedResult.error ?? plannedCompletedResult.error;
  if (error) return { data: emptyData, error: error.message };

  const assignedActive = ((assignedActiveResult.data ?? []) as unknown as TicketWithRelations[]).map(normalizeOverviewTicket);
  const activePlanned = ((activePlannedResult.data ?? []) as unknown as RawPlanTicketRow[]).map(normalizePlanRow).filter((row): row is WorkerPlanTicketRow => Boolean(row));
  const plannedPeriod = ((plannedPeriodResult.data ?? []) as unknown as RawPlanTicketRow[]).map(normalizePlanRow).filter((row): row is WorkerPlanTicketRow => Boolean(row));
  const assignedCompleted = ((assignedCompletedResult.data ?? []) as unknown as TicketWithRelations[]).map(normalizeOverviewTicket);
  const plannedCompleted = ((plannedCompletedResult.data ?? []) as unknown as RawPlanTicketRow[]).map(normalizePlanRow).filter((row): row is WorkerPlanTicketRow => Boolean(row));

  const activeTickets = dedupeTickets([...assignedActive, ...activePlanned.map((row) => row.ticket)]);
  const plannedTickets = dedupePlanRows(plannedPeriod);
  const completedMap = new Map<string, WorkerPlanTicketRow>();

  for (const ticket of assignedCompleted) {
    if (!dateInRange(getWorkerTicketCompletionDate(ticket), periodRange.fromIso, periodRange.toIso)) continue;
    completedMap.set(ticket.id, {
      itemId: `assigned-${ticket.id}`,
      ticketId: ticket.id,
      workerId,
      createdAt: ticket.updated_at,
      ticket,
      plan: null,
    });
  }
  for (const row of plannedCompleted) {
    if (!dateInRange(getWorkerTicketCompletionDate(row.ticket), periodRange.fromIso, periodRange.toIso)) continue;
    const existing = completedMap.get(row.ticketId);
    if (!existing || (row.plan && !existing.plan)) completedMap.set(row.ticketId, row);
  }

  const completedTickets = [...completedMap.values()].sort((left, right) => new Date(getWorkerTicketCompletionDate(right.ticket) ?? right.ticket.updated_at).getTime() - new Date(getWorkerTicketCompletionDate(left.ticket) ?? left.ticket.updated_at).getTime());

  return {
    data: {
      period: periodRange,
      activeTickets,
      plannedTickets,
      completedTickets,
      stats: {
        active: activeTickets.length,
        planned: plannedTickets.length,
        completed: completedTickets.length,
        waitingConfirmation: activeTickets.filter((ticket) => ticket.status === "waiting_admin_confirmation").length,
      },
    },
    error: null,
  };
}

