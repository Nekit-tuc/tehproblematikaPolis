import { measureAsync } from "@/lib/performance";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { TicketStatus, TicketWithRelations } from "@/types/domain";
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

export type WorkPlanItem = {
  id: string;
  work_plan_id: string;
  ticket_id: string;
  worker_id?: string | null;
  category?: string | null;
  sort_order: number;
  created_at: string;
  ticket?: TicketWithRelations | null;
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

const planningStatuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting_admin_confirmation"];

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
    assigned_at,
    source,
    created_at,
    updated_at,
    object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
    category:categories(id, name, description, is_active, created_at)
  )
`;

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

export async function getPlanningTickets(filters: PlanningFilters = {}): Promise<QueryResult<TicketWithRelations[]>> {
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
  return { data: (data ?? []) as unknown as TicketWithRelations[], error: error?.message ?? null };
}

export async function getTicketsGroupedByCategory(filters: PlanningFilters = {}) {
  const ticketsResult = await getPlanningTickets(filters);
  const groups = new Map<string, { categoryName: string; tickets: TicketWithRelations[] }>();
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

export async function sendWorkPlanToWorkers() {
  return { data: null, error: "Telegram-розсилка планів буде додана на етапі 2." };
}
