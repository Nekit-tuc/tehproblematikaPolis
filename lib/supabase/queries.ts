import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { getCurrentProfile } from "@/lib/auth/server";
import { canViewTicket } from "@/lib/auth/permissions";
import { measureAsync } from "@/lib/performance";
import { getNextWorkWeekRange, getPreviousWorkWeekRange, getWorkWeekLabel, getWorkWeekRange } from "@/lib/date/work-week";
import { getLatestArchivedWeeklyPeriod } from "@/lib/supabase/weekly-control";
import type { Category, CompanyObject, Profile, TicketCommentWithAuthor, TicketHistory, TicketPhotoWithUrl, TicketWithRelations } from "@/types/domain";

export type QueryResult<T> = { data: T; error: string | null };

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

export async function getProfiles(): Promise<QueryResult<Profile[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("profiles:list", () =>
    supabase
      .from("profiles")
      .select("id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at")
      .order("full_name"),
  );
  return { data: (data ?? []) as Profile[], error: error?.message ?? null };
}

export async function getObjectManagers(): Promise<QueryResult<Profile[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("profiles:object_managers", () =>
    supabase
      .from("profiles")
      .select("id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at")
      .in("role", ["store_manager", "management", "tech_manager", "admin"])
      .order("full_name"),
  );
  return { data: (data ?? []) as Profile[], error: error?.message ?? null };
}

export async function getObjects(): Promise<QueryResult<CompanyObject[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase
    .from("objects")
    .select("id, name, type, object_number, city, district, address, aliases, manager_id, is_active, created_at")
    .order("name");
  if (profile.role === "store_manager" && profile.object_id) query = query.eq("id", profile.object_id);
  const { data, error } = await measureAsync("objects:list", () => query);
  return { data: (data ?? []) as CompanyObject[], error: error?.message ?? null };
}

export type ObjectListFilters = {
  q?: string;
  type?: string;
  status?: string;
  district?: string;
  page?: number;
  limit?: number;
};

export type ObjectPageResult = {
  objects: CompanyObject[];
  total: number;
  page: number;
  limit: number;
};

export type ObjectsDirectoryMeta = {
  objects: Array<Pick<CompanyObject, "id" | "object_number" | "district">>;
};

function applyObjectFilters(query: any, filters: ObjectListFilters) {
  if (filters.type && filters.type !== "all") query = query.eq("type", filters.type);
  if (filters.status === "active") query = query.eq("is_active", true);
  if (filters.status === "inactive") query = query.eq("is_active", false);
  if (filters.district && filters.district !== "all") query = query.eq("district", filters.district);

  const search = filters.q?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    query = query.or(`name.ilike.%${escaped}%,object_number.ilike.%${escaped}%,address.ilike.%${escaped}%,city.ilike.%${escaped}%,district.ilike.%${escaped}%`);
  }

  return query;
}

export async function getObjectsPage(filters: ObjectListFilters = {}): Promise<QueryResult<ObjectPageResult>> {
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  if (!hasSupabaseEnv()) return emptyWithError({ objects: [], total: 0, page, limit });
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError({ objects: [], total: 0, page, limit });
  const supabase = await createClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("objects")
    .select("id, name, type, object_number, city, district, address, aliases, manager_id, is_active, created_at", { count: "exact" })
    .order("name");
  if (profile.role === "store_manager" && profile.object_id) query = query.eq("id", profile.object_id);
  query = applyObjectFilters(query, filters).range(from, to);

  const { data, count, error } = await measureAsync("objects:page", () => query);
  return { data: { objects: (data ?? []) as CompanyObject[], total: count ?? 0, page, limit }, error: error?.message ?? null };
}

export async function getObjectsDirectoryMeta(): Promise<QueryResult<ObjectsDirectoryMeta>> {
  if (!hasSupabaseEnv()) return emptyWithError({ objects: [] });
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError({ objects: [] });
  const supabase = await createClient();
  let query = supabase
    .from("objects")
    .select("id, object_number, district")
    .order("object_number");
  if (profile.role === "store_manager" && profile.object_id) query = query.eq("id", profile.object_id);

  const { data, error } = await measureAsync("objects:directory_meta", () => query);
  return { data: { objects: (data ?? []) as ObjectsDirectoryMeta["objects"] }, error: error?.message ?? null };
}

export async function getCategories(): Promise<QueryResult<Category[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("categories:active", () =>
    supabase.from("categories").select("id, name, description, is_active, created_at").eq("is_active", true).order("name"),
  );
  return { data: (data ?? []) as Category[], error: error?.message ?? null };
}

export async function getAllCategories(): Promise<QueryResult<Category[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("categories:all", () =>
    supabase.from("categories").select("id, name, description, is_active, created_at").eq("is_active", true).order("name"),
  );
  return { data: (data ?? []) as Category[], error: error?.message ?? null };
}

const ticketSelect = `
  *,
  object:objects(*),
  category:categories(*),
  creator:profiles!tickets_created_by_fkey(*),
  assignee:profiles!tickets_assigned_to_fkey(*)
`;

const ticketListSelect = `
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
  ai_confidence,
  recommended_department,
  repeat_count,
  last_repeat_at,
  created_at,
  updated_at,
  object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
  category:categories(id, name, description, is_active, created_at),
  assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at),
  worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at)
`;

const ticketPageSelect = `
  id,
  number,
  title,
  status,
  priority,
  object_id,
  category_id,
  assigned_to,
  assignee_worker_id,
  due_at,
  source,
  telegram_source_group_id,
  repeat_count,
  last_repeat_at,
  created_at,
  updated_at,
  object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
  category:categories(id, name, is_active, created_at),
  assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, is_active, created_at),
  worker:workers(id, name, telegram_username, telegram_id, is_active, created_at, updated_at)
`;

type TicketQueryOptions = {
  limit?: number | null;
  status?: string;
  source?: string | string[];
};

export type TicketListFilters = {
  status?: string;
  category?: string;
  priority?: string;
  q?: string;
  sort?: string;
  period?: "this_week" | "previous_week";
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export type TicketPageResult = {
  tickets: TicketWithRelations[];
  total: number;
  page: number;
  limit: number;
};

export async function getTickets(options: TicketQueryOptions = {}): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase.from("tickets").select(ticketListSelect).order("created_at", { ascending: false });
  if (profile.role === "worker") query = query.eq("assigned_to", profile.id);
  if (profile.role === "store_manager") {
    query = profile.object_id ? query.eq("object_id", profile.object_id) : query.eq("created_by", profile.id);
  }
  if (options.status) query = query.eq("status", options.status);
  if (Array.isArray(options.source)) query = query.in("source", options.source);
  else if (options.source) query = query.eq("source", options.source);
  if (options.limit !== null) query = query.limit(options.limit ?? 50);
  const { data, error } = await measureAsync("tickets:list", () => query);
  return { data: (data ?? []) as unknown as TicketWithRelations[], error: error?.message ?? null };
}

export async function getTicketsCount(options: TicketQueryOptions = {}): Promise<QueryResult<number>> {
  if (!hasSupabaseEnv()) return emptyWithError(0);
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError(0);
  const supabase = await createClient();
  let query = supabase.from("tickets").select("id", { count: "exact", head: true });
  if (profile.role === "worker") query = query.eq("assigned_to", profile.id);
  if (profile.role === "store_manager") {
    query = profile.object_id ? query.eq("object_id", profile.object_id) : query.eq("created_by", profile.id);
  }
  if (options.status) query = query.eq("status", options.status);
  if (Array.isArray(options.source)) query = query.in("source", options.source);
  else if (options.source) query = query.eq("source", options.source);
  const { count, error } = await measureAsync("tickets:count", () => query);
  return { data: count ?? 0, error: error?.message ?? null };
}

export async function getRecentTickets(limit = 8): Promise<QueryResult<TicketWithRelations[]>> {
  return getTickets({ limit });
}


function applyTicketAccess(query: any, profile: Profile) {
  if (profile.role === "worker") return query.eq("assigned_to", profile.id);
  if (profile.role === "store_manager") return profile.object_id ? query.eq("object_id", profile.object_id) : query.eq("created_by", profile.id);
  return query;
}

function applyTicketFilters(query: any, filters: TicketListFilters) {
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.category && filters.category !== "all") query = query.eq("category_id", filters.category);
  if (filters.priority && filters.priority !== "all") query = query.eq("priority", filters.priority);
  if (filters.period === "this_week" || filters.period === "previous_week") {
    const range = filters.period === "previous_week" ? getPreviousWorkWeekRange() : getWorkWeekRange();
    query = query.gte("created_at", range.startIso).lt("created_at", range.endIso);
  } else {
    if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00`);
    if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999`);
  }
  const search = filters.q?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    query = query.or(`number.ilike.%${escaped}%,title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }
  return query;
}

export async function getTicketsPage(filters: TicketListFilters = {}): Promise<QueryResult<TicketPageResult>> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  if (!hasSupabaseEnv()) return emptyWithError({ tickets: [], total: 0, page, limit });
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError({ tickets: [], total: 0, page, limit });
  const supabase = await createClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from("tickets").select(ticketPageSelect, { count: "exact" });
  query = applyTicketAccess(query, profile);
  query = applyTicketFilters(query, filters);
  if (filters.sort === "priority_asc" || filters.sort === "priority_desc") {
    query = query.order("priority", { ascending: filters.sort === "priority_asc" }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  query = query.range(from, to);

  const { data, count, error } = await measureAsync("tickets:page", () => query);
  return { data: { tickets: (data ?? []) as unknown as TicketWithRelations[], total: count ?? 0, page, limit }, error: error?.message ?? null };
}

export async function getTicketsForPrint(filters: TicketListFilters = {}): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase.from("tickets").select(ticketListSelect);
  query = applyTicketAccess(query, profile);
  query = applyTicketFilters(query, filters);
  if (filters.sort === "priority_asc" || filters.sort === "priority_desc") {
    query = query.order("priority", { ascending: filters.sort === "priority_asc" }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  query = query.limit(filters.limit ?? 2000);
  const { data, error } = await measureAsync("tickets:print", () => query);
  return { data: (data ?? []) as unknown as TicketWithRelations[], error: error?.message ?? null };
}

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>;

async function countTickets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  label: string,
  build: (query: any) => CountQuery,
) {
  const base = supabase.from("tickets").select("id", { count: "exact", head: true });
  const query = build(base);
  const { count, error } = await measureAsync(label, () => query);
  return { count: count ?? 0, error: error?.message ?? null };
}

export async function getDashboardStats(): Promise<QueryResult<{
  active: number;
  newTickets: number;
  inProgress: number;
  pendingReview: number;
  critical: number;
  done: number;
  objects: number;
}>> {
  if (!hasSupabaseEnv()) {
    return emptyWithError({ active: 0, newTickets: 0, inProgress: 0, pendingReview: 0, critical: 0, done: 0, objects: 0 });
  }
  const supabase = await createClient();
  const [active, newTickets, inProgress, pendingReview, critical, done, objects] = await Promise.all([
    countTickets(supabase, "dashboard:count_active", (query) => query.not("status", "in", "(done,cancelled,rejected)")),
    countTickets(supabase, "dashboard:count_new", (query) => query.eq("status", "new")),
    measureAsync("dashboard:count_planned_in_progress", () =>
      supabase
        .from("work_plan_items")
        .select("ticket_id, ticket:tickets!inner(status), work_plan:work_plans!inner(status)")
        .in("work_plan.status", ["sent", "partially_done"])
        .not("ticket.status", "in", "(done,cancelled,rejected)"),
    ),
    countTickets(supabase, "dashboard:count_pending_review", (query) => query.eq("status", "pending_review")),
    countTickets(supabase, "dashboard:count_critical", (query) => query.eq("priority", "critical")),
    countTickets(supabase, "dashboard:count_done", (query) => query.eq("status", "done")),
    measureAsync("dashboard:count_objects", () => supabase.from("objects").select("id", { count: "exact", head: true }).eq("is_active", true)),
  ]);
  const error = active.error ?? newTickets.error ?? inProgress.error?.message ?? pendingReview.error ?? critical.error ?? done.error ?? objects.error?.message ?? null;
  return {
    data: {
      active: active.count,
      newTickets: newTickets.count,
      inProgress: new Set(((inProgress.data ?? []) as Array<{ ticket_id: string }>).map((row) => row.ticket_id)).size,
      pendingReview: pendingReview.count,
      critical: critical.count,
      done: done.count,
      objects: objects.count ?? 0,
    },
    error,
  };
}


export type WeeklyDashboardDay = {
  iso: string;
  dayLabel: string;
  dateLabel: string;
  count: number;
  hasProblematic: boolean;
};

export type WeeklyDashboardPlanCategory = {
  category: string;
  tickets: number;
  workers: number;
};

export type WeeklyDashboardHotTicket = Pick<TicketWithRelations, "id" | "number" | "title" | "status" | "priority" | "created_at" | "object" | "category">;

export type WeeklyDashboardCommandCenter = {
  period: {
    weekNumber: number;
    monthLabel: string;
    startIso: string;
    endIso: string;
    previousStartIso: string;
    previousEndIso: string;
    nextStartIso: string;
    nextEndIso: string;
  };
  kpi: {
    currentWeekTicketCount: number;
    inWorkCount: number;
    completedThisWeekCount: number;
    problematicCount: number;
    pendingAiCount: number;
    waitingAdminConfirmationCount: number;
  };
  calendarDays: WeeklyDashboardDay[];
  highPriorityTickets: WeeklyDashboardHotTicket[];
  highPriorityTotal: number;
  previousWeekSummary: {
    created: number;
    completed: number;
    carriedOver: number;
    periodId: string | null;
  };
  problemSummary: {
    repeated: number;
    carriedOver: number;
    overdue: number;
    waitingConfirmation: number;
  };
  dailyCounts: WeeklyDashboardDay[];
  nextPlanSummary: {
    totalTickets: number;
    totalWorkers: number;
    categories: WeeklyDashboardPlanCategory[];
    hasPlan: boolean;
  };
};

export type DashboardOverview = {
  userName: string;
  week: {
    startDate: string;
    endDate: string;
    label: string;
  };
  intake: {
    total: number;
    pendingReview: number;
    confirmed: number;
    awaitingPlanning: number;
    critical: number;
  };
  execution: {
    planned: number;
    inProgress: number;
    done: number;
    waitingConfirmation: number;
    notDone: number;
  };
};

const inactiveTicketStatuses = ["done", "cancelled", "rejected"];
const inWorkTicketStatuses = ["assigned", "in_progress", "waiting", "waiting_admin_confirmation"];
const dayLabels = ["Сб", "Нд", "Пн", "Вт", "Ср", "Чт", "Пт"];
const monthFormatter = new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric" });

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function isInactiveStatus(status: string | null | undefined) {
  return inactiveTicketStatuses.includes(status ?? "");
}

function isInWorkStatus(status: string | null | undefined) {
  return inWorkTicketStatuses.includes(status ?? "");
}

function isHighPriority(priority: string | null | undefined) {
  return priority === "critical" || priority === "high";
}

function priorityWeight(priority: string | null | undefined) {
  if (priority === "critical") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value;
}

function plannedCategoryName(row: any) {
  const ticket = Array.isArray(row.ticket) ? row.ticket[0] : row.ticket;
  const category = Array.isArray(ticket?.category) ? ticket.category[0] : ticket?.category;
  return row.category || category?.name || "Без категорії";
}

function plannedPlan(row: any) {
  return Array.isArray(row.work_plan) ? row.work_plan[0] : row.work_plan;
}

async function queryTicketsForProfile(supabase: Awaited<ReturnType<typeof createClient>>, profile: Profile, label: string, build: (query: any) => any) {
  let query = supabase.from("tickets").select(ticketListSelect);
  query = applyTicketAccess(query, profile);
  query = build(query);
  const { data, error } = await measureAsync(label, () => query);
  return { data: (data ?? []) as unknown as TicketWithRelations[], error: error?.message ?? null };
}

function dashboardWeekLabel(startDate: string | Date, endDate: string | Date) {
  return getWorkWeekLabel(startDate, endDate);
}

export async function getDashboardOverview(): Promise<QueryResult<DashboardOverview>> {
  const emptyRange = getWorkWeekRange();
  const empty: DashboardOverview = {
    userName: "Administrator",
    week: {
      startDate: emptyRange.startDate,
      endDate: emptyRange.endDate,
      label: dashboardWeekLabel(emptyRange.start, emptyRange.end),
    },
    intake: { total: 0, pendingReview: 0, confirmed: 0, awaitingPlanning: 0, critical: 0 },
    execution: { planned: 0, inProgress: 0, done: 0, waitingConfirmation: 0, notDone: 0 },
  };
  if (!hasSupabaseEnv()) return emptyWithError(empty);

  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError(empty);

  const supabase = await createClient();
  const currentRange = getWorkWeekRange();
  const weekStart = currentRange.start;
  const weekEnd = currentRange.end;
  const weekStartIso = currentRange.startIso;
  const weekEndIso = currentRange.endIso;

  const [currentWeekTickets, activePlans, currentWeekPlans] = await Promise.all([
    measureAsync("dashboard-overview:intake_minimal", () => {
      let query = supabase
        .from("tickets")
        .select("id,status,priority")
        .gte("created_at", weekStartIso)
        .lt("created_at", weekEndIso)
        .limit(1000);
      query = applyTicketAccess(query, profile);
      return query;
    }),
    measureAsync("dashboard-overview:active_plan_ids", () =>
      supabase
        .from("work_plans")
        .select("id")
        .in("status", ["draft", "sent", "partially_done"])
        .limit(500),
    ),
    measureAsync("dashboard-overview:current_week_plans", () =>
      supabase
        .from("work_plans")
        .select("id")
        .in("status", ["draft", "sent", "partially_done"])
        .gte("period_start", currentRange.startIso)
        .lt("period_start", currentRange.endIso)
        .limit(200),
    ),
  ]);

  type DashboardTicketRow = { id: string; status: string; priority: string | null };
  type DashboardPlannedTicketRow = { id: string; status: string };
  type DashboardPlanItemRow = {
    ticket_id?: string | null;
    ticket?: { id: string; status: string } | { id: string; status: string }[] | null;
  };

  const tickets = (currentWeekTickets.data ?? []) as DashboardTicketRow[];
  const currentTicketIds = tickets.map((ticket) => ticket.id);
  const activePlanIds = ((activePlans.data ?? []) as Array<{ id: string }>).map((plan) => plan.id);
  const currentPlanIds = ((currentWeekPlans.data ?? []) as Array<{ id: string }>).map((plan) => plan.id);

  const [activePlanItems, currentWeekPlanItems] = await Promise.all([
    currentTicketIds.length === 0 || activePlanIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ ticket_id?: string | null }>, error: null })
      : measureAsync("dashboard-overview:active_plan_items_for_intake", () =>
          supabase
            .from("work_plan_items")
            .select("ticket_id")
            .in("work_plan_id", activePlanIds)
            .in("ticket_id", currentTicketIds)
            .limit(Math.max(currentTicketIds.length * 3, 1)),
        ),
    currentPlanIds.length === 0
      ? Promise.resolve({ data: [] as DashboardPlanItemRow[], error: null })
      : measureAsync("dashboard-overview:current_plan_items_minimal", () =>
      supabase
        .from("work_plan_items")
            .select("ticket_id, ticket:tickets(id,status)")
            .in("work_plan_id", currentPlanIds)
        .limit(2000),
        ),
  ]);

  const activePlannedTicketIds = new Set(((activePlanItems.data ?? []) as Array<{ ticket_id?: string | null }>).map((row) => row.ticket_id).filter(Boolean) as string[]);
  const currentPlanTickets = new Map<string, DashboardPlannedTicketRow>();
  for (const row of (currentWeekPlanItems.data ?? []) as DashboardPlanItemRow[]) {
    const ticket = Array.isArray(row.ticket) ? row.ticket[0] ?? null : row.ticket ?? null;
    if (ticket?.id) currentPlanTickets.set(ticket.id, ticket);
  }
  const plannedTickets = Array.from(currentPlanTickets.values());

  const intakeActiveTickets = tickets.filter((ticket) => !isInactiveStatus(ticket.status));
  const pendingReview = tickets.filter((ticket) => ticket.status === "pending_review").length;
  const confirmed = tickets.filter((ticket) => !["pending_review", "rejected", "cancelled"].includes(ticket.status)).length;
  const awaitingPlanning = intakeActiveTickets.filter((ticket) => ticket.status !== "pending_review" && !activePlannedTicketIds.has(ticket.id)).length;
  const critical = intakeActiveTickets.filter((ticket) => isHighPriority(ticket.priority)).length;

  const planned = plannedTickets.length;
  const inProgress = plannedTickets.filter((ticket) => ticket.status === "assigned" || ticket.status === "in_progress").length;
  const done = plannedTickets.filter((ticket) => ticket.status === "done").length;
  const waitingConfirmation = plannedTickets.filter((ticket) => ticket.status === "waiting_admin_confirmation").length;
  const notDone = plannedTickets.filter((ticket) => !isInactiveStatus(ticket.status)).length;

  return {
    data: {
      userName: profile.full_name || profile.email || "Administrator",
      week: {
        startDate: currentRange.startDate,
        endDate: currentRange.endDate,
        label: dashboardWeekLabel(currentRange.start, currentRange.end),
      },
      intake: {
        total: tickets.length,
        pendingReview,
        confirmed,
        awaitingPlanning,
        critical,
      },
      execution: {
        planned,
        inProgress,
        done,
        waitingConfirmation,
        notDone,
      },
    },
    error: currentWeekTickets.error?.message ?? activePlans.error?.message ?? currentWeekPlans.error?.message ?? activePlanItems.error?.message ?? currentWeekPlanItems.error?.message ?? null,
  };
}

export async function getWeeklyDashboardCommandCenter(): Promise<QueryResult<WeeklyDashboardCommandCenter>> {
  const empty: WeeklyDashboardCommandCenter = {
    period: {
      weekNumber: weekNumber(new Date()),
      monthLabel: monthFormatter.format(new Date()),
      startIso: getWorkWeekRange().startIso,
      endIso: getWorkWeekRange().endIso,
      previousStartIso: getPreviousWorkWeekRange().startIso,
      previousEndIso: getPreviousWorkWeekRange().endIso,
      nextStartIso: getNextWorkWeekRange().startIso,
      nextEndIso: getNextWorkWeekRange().endIso,
    },
    kpi: { currentWeekTicketCount: 0, inWorkCount: 0, completedThisWeekCount: 0, problematicCount: 0, pendingAiCount: 0, waitingAdminConfirmationCount: 0 },
    calendarDays: [],
    highPriorityTickets: [],
    highPriorityTotal: 0,
    previousWeekSummary: { created: 0, completed: 0, carriedOver: 0, periodId: null },
    problemSummary: { repeated: 0, carriedOver: 0, overdue: 0, waitingConfirmation: 0 },
    dailyCounts: [],
    nextPlanSummary: { totalTickets: 0, totalWorkers: 0, categories: [], hasPlan: false },
  };

  if (!hasSupabaseEnv()) return emptyWithError(empty);
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError(empty);

  const supabase = await createClient();
  const now = new Date();
  const currentRange = getWorkWeekRange(now);
  const previousRange = getPreviousWorkWeekRange(now);
  const nextRange = getNextWorkWeekRange(now);
  const weekStart = currentRange.start;
  const weekEnd = currentRange.end;
  const previousWeekStart = previousRange.start;
  const previousWeekEnd = previousRange.end;
  const nextWeekStart = nextRange.start;
  const nextWeekEnd = nextRange.end;
  const overdueBoundary = daysAgo(7);

  const [currentWeek, previousWeek, activeTickets, completedByDate, planItems] = await Promise.all([
    queryTicketsForProfile(supabase, profile, "dashboard-weekly:current_week", (query) => query.gte("created_at", weekStart.toISOString()).lt("created_at", weekEnd.toISOString()).order("created_at", { ascending: false }).limit(500)),
    queryTicketsForProfile(supabase, profile, "dashboard-weekly:previous_week", (query) => query.gte("created_at", previousWeekStart.toISOString()).lt("created_at", previousWeekEnd.toISOString()).order("created_at", { ascending: false }).limit(500)),
    queryTicketsForProfile(supabase, profile, "dashboard-weekly:active", (query) => query.not("status", "in", "(done,cancelled,rejected)").order("created_at", { ascending: false }).limit(500)),
    queryTicketsForProfile(supabase, profile, "dashboard-weekly:completed", (query) => query.eq("status", "done").gte("completed_at", weekStart.toISOString()).lt("completed_at", weekEnd.toISOString()).order("completed_at", { ascending: false }).limit(500)),
    measureAsync("dashboard-weekly:plan_items", () => supabase
      .from("work_plan_items")
      .select("ticket_id, worker_id, category, ticket:tickets(status,category:categories(name)), work_plan:work_plans!inner(id,title,status,period_start,period_end)")
      .in("work_plan.status", ["draft", "sent", "partially_done"])
      .limit(700)),
  ]);

  const currentTickets = currentWeek.data;
  const previousTickets = previousWeek.data;
  const active = activeTickets.data;
  const completedIds = new Set<string>();
  for (const ticket of completedByDate.data) completedIds.add(ticket.id);
  for (const ticket of currentTickets) if (ticket.status === "done") completedIds.add(ticket.id);

  const activePlanRows = ((planItems.data ?? []) as any[]).filter((row) => {
    const plan = plannedPlan(row);
    return plan && ["draft", "sent", "partially_done"].includes(plan.status);
  });
  const currentPlanRows = activePlanRows.filter((row) => {
    const plan = plannedPlan(row);
    if (!plan?.period_start) return false;
    const start = new Date(plan.period_start);
    return start >= weekStart && start < weekEnd;
  });
  const plannedTicketIds = new Set(currentPlanRows.map((row) => row.ticket_id).filter(Boolean));
  const inWorkIds = new Set(active.filter((ticket) => isInWorkStatus(ticket.status)).map((ticket) => ticket.id));
  for (const ticketId of plannedTicketIds) inWorkIds.add(ticketId);

  const overdueTickets = active.filter((ticket) => new Date(ticket.created_at) < overdueBoundary);
  const waitingConfirmation = active.filter((ticket) => ticket.status === "waiting_admin_confirmation");
  const problematicCount = new Set([...overdueTickets.map((ticket) => ticket.id), ...waitingConfirmation.map((ticket) => ticket.id)]).size;
  const hotTickets = active
    .filter((ticket) => isHighPriority(ticket.priority))
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const calendarDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const iso = isoDate(date);
    const ticketsForDay = currentTickets.filter((ticket) => isoDate(new Date(ticket.created_at)) === iso);
    return {
      iso,
      dayLabel: dayLabels[index],
      dateLabel: String(date.getDate()),
      count: ticketsForDay.length,
      hasProblematic: ticketsForDay.some((ticket) => isHighPriority(ticket.priority) || ticket.status === "waiting_admin_confirmation"),
    };
  });

  const nextWeekPlanRows = activePlanRows.filter((row) => {
    const plan = plannedPlan(row);
    if (!plan?.period_start) return false;
    const start = new Date(plan.period_start);
    return start >= nextWeekStart && start < nextWeekEnd;
  });
  const effectivePlanRows = nextWeekPlanRows.length > 0 ? nextWeekPlanRows : activePlanRows.filter((row) => plannedPlan(row)?.status === "draft");
  const categoryMap = new Map<string, { tickets: Set<string>; workers: Set<string> }>();
  for (const row of effectivePlanRows) {
    const category = plannedCategoryName(row);
    const group = categoryMap.get(category) ?? { tickets: new Set<string>(), workers: new Set<string>() };
    if (row.ticket_id) group.tickets.add(row.ticket_id);
    if (row.worker_id) group.workers.add(row.worker_id);
    categoryMap.set(category, group);
  }
  const nextPlanCategories = Array.from(categoryMap.entries())
    .map(([category, value]) => ({ category, tickets: value.tickets.size, workers: value.workers.size }))
    .sort((a, b) => b.tickets - a.tickets)
    .slice(0, 4);

  const latestArchive = await getLatestArchivedWeeklyPeriod();
  const archivedSummary = latestArchive.data?.summary_json as { totalCreated?: number; totalCompleted?: number; totalCarriedOver?: number; totalUnresolved?: number } | undefined;
  const error = currentWeek.error ?? previousWeek.error ?? activeTickets.error ?? completedByDate.error ?? planItems.error?.message ?? null;
  return {
    data: {
      period: {
        weekNumber: weekNumber(now),
        monthLabel: monthFormatter.format(now),
        startIso: currentRange.startIso,
        endIso: currentRange.endIso,
        previousStartIso: previousRange.startIso,
        previousEndIso: previousRange.endIso,
        nextStartIso: nextRange.startIso,
        nextEndIso: nextRange.endIso,
      },
      kpi: {
        currentWeekTicketCount: currentTickets.length,
        inWorkCount: inWorkIds.size,
        completedThisWeekCount: completedIds.size,
        problematicCount,
        pendingAiCount: active.filter((ticket) => ticket.status === "pending_review").length,
        waitingAdminConfirmationCount: waitingConfirmation.length,
      },
      calendarDays,
      highPriorityTickets: hotTickets.slice(0, 3),
      highPriorityTotal: hotTickets.length,
      previousWeekSummary: {
        created: archivedSummary?.totalCreated ?? previousTickets.length,
        completed: archivedSummary?.totalCompleted ?? previousTickets.filter((ticket) => ticket.status === "done").length,
        carriedOver: archivedSummary?.totalCarriedOver ?? archivedSummary?.totalUnresolved ?? active.filter((ticket) => new Date(ticket.created_at) < weekStart).length,
        periodId: latestArchive.data?.id ?? null,
      },
      problemSummary: {
        repeated: 0,
        carriedOver: active.filter((ticket) => new Date(ticket.created_at) < weekStart).length,
        overdue: overdueTickets.length,
        waitingConfirmation: waitingConfirmation.length,
      },
      dailyCounts: calendarDays,
      nextPlanSummary: {
        totalTickets: new Set(effectivePlanRows.map((row) => row.ticket_id).filter(Boolean)).size,
        totalWorkers: new Set(effectivePlanRows.map((row) => row.worker_id).filter(Boolean)).size,
        categories: nextPlanCategories,
        hasPlan: effectivePlanRows.length > 0,
      },
    },
    error,
  };
}


export const getTicket = cache(async function getTicket(id: string): Promise<QueryResult<TicketWithRelations | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: "Потрібно увійти в систему." };
  const supabase = await createClient();
  const { data, error } = await measureAsync("ticket:detail", () =>
    supabase.from("tickets").select(ticketSelect).eq("id", id).maybeSingle(),
  );
  const ticket = data as TicketWithRelations | null;
  if (ticket && !canViewTicket(profile, ticket)) return { data: null, error: "Недостатньо прав для перегляду цієї заявки." };
  return { data: ticket, error: error?.message ?? null };
});

export async function getRelatedTicketsBySourceGroup(sourceGroupId: string, currentTicketId: string): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("tickets:related", () => supabase
    .from("tickets")
    .select(ticketListSelect)
    .eq("telegram_source_group_id", sourceGroupId)
    .neq("id", currentTicketId)
    .order("created_at", { ascending: true })
    .limit(20));
  return { data: (data ?? []) as unknown as TicketWithRelations[], error: error?.message ?? null };
}

export async function getTicketComments(ticketId: string): Promise<QueryResult<TicketCommentWithAuthor[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("ticket:comments", () => supabase
    .from("ticket_comments")
    .select("id, ticket_id, author_id, body, created_at, author:profiles!ticket_comments_author_id_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true }));
  return { data: (data ?? []) as unknown as TicketCommentWithAuthor[], error: error?.message ?? null };
}

export async function getTicketHistory(ticketId: string): Promise<QueryResult<TicketHistory[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("ticket:history", () => supabase
    .from("ticket_history")
    .select("id, ticket_id, actor_id, action, metadata, created_at, actor:profiles!ticket_history_actor_id_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true }));
  return { data: (data ?? []) as unknown as TicketHistory[], error: error?.message ?? null };
}

export async function getTicketPhotos(ticketId: string): Promise<QueryResult<TicketPhotoWithUrl[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("ticket:photos", () => supabase
    .from("ticket_photos")
    .select("id, ticket_id, uploaded_by, type, storage_path, caption, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true }));
  if (error) return { data: [], error: error.message };

  const photos = (data ?? []) as TicketPhotoWithUrl[];
  const signed = await Promise.all(
    photos.map(async (photo) => {
      const { data: signedData } = await supabase.storage.from("ticket-photos").createSignedUrl(photo.storage_path, 60 * 10);
      return { ...photo, url: signedData?.signedUrl ?? null };
    }),
  );
  return { data: signed, error: null };
}
