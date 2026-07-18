import { getCurrentUser } from "@/lib/auth/server";
import { measureAsync } from "@/lib/performance";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import type { QueryResult } from "@/lib/supabase/queries";
import type { TicketPriority, TicketStatus, TicketWithRelations } from "@/types/domain";

export type WeeklyPeriodStatus = "current" | "closed" | "archived";
export type WeeklyTicketRole = "created" | "planned" | "completed" | "carried_over" | "hot" | "unresolved";

export type WeeklySummary = {
  totalCreated: number;
  totalCompleted: number;
  totalUnresolved: number;
  totalCarriedOver: number;
  totalHot: number;
  totalPlanned: number;
  totalWaitingAdminConfirmation: number;
  byCategory: Array<{ name: string; count: number }>;
  byObjectTop: Array<{ name: string; count: number }>;
  byWorker: Array<{ name: string; count: number }>;
};

export type WeeklyPeriod = {
  id: string;
  week_start: string;
  week_end: string;
  status: WeeklyPeriodStatus;
  title?: string | null;
  created_by?: string | null;
  closed_by?: string | null;
  created_at: string;
  closed_at?: string | null;
  archived_at?: string | null;
  summary_json: Partial<WeeklySummary> | Record<string, unknown>;
  notes?: string | null;
};

export type WeeklyPeriodTicket = {
  id: string;
  weekly_period_id: string;
  ticket_id: string;
  role: WeeklyTicketRole;
  ticket_number?: string | null;
  ticket_title?: string | null;
  object_name?: string | null;
  object_address?: string | null;
  category_name?: string | null;
  priority?: TicketPriority | string | null;
  status_at_close?: TicketStatus | string | null;
  assignee_worker_name?: string | null;
  created_at_snapshot?: string | null;
  completed_at_snapshot?: string | null;
  added_at: string;
};

export type WeeklyPeriodDetails = {
  period: WeeklyPeriod | null;
  tickets: WeeklyPeriodTicket[];
  summary: WeeklySummary;
};

const inactiveStatuses = new Set(["done", "cancelled", "rejected"]);
const emptySummary: WeeklySummary = {
  totalCreated: 0,
  totalCompleted: 0,
  totalUnresolved: 0,
  totalCarriedOver: 0,
  totalHot: 0,
  totalPlanned: 0,
  totalWaitingAdminConfirmation: 0,
  byCategory: [],
  byObjectTop: [],
  byWorker: [],
};

const ticketSnapshotSelect = `
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
  completed_at,
  worker_completed_at,
  admin_confirmed_at,
  created_at,
  updated_at,
  object:objects(id, name, address),
  category:categories(id, name),
  worker:workers(id, name)
`;

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

function toLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function atLocalStart(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function startOfWeek(date: Date) {
  const value = atLocalStart(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function getCurrentWeekRange(date = new Date()) {
  const start = startOfWeek(date);
  const end = endOfDay(addDays(start, 6));
  const nextStart = addDays(start, 7);
  const nextEnd = endOfDay(addDays(nextStart, 6));
  return {
    start,
    end,
    startIso: toLocalDate(start),
    endIso: toLocalDate(end),
    nextStartIso: toLocalDate(nextStart),
    nextEndIso: toLocalDate(nextEnd),
  };
}

function formatPeriodTitle(startIso: string, endIso: string) {
  const format = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" });
  return `Тиждень ${format.format(new Date(`${startIso}T12:00:00`))}-${format.format(new Date(`${endIso}T12:00:00`))}`;
}

function normalizeSummary(raw: unknown): WeeklySummary {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<WeeklySummary>;
  return {
    ...emptySummary,
    ...value,
    byCategory: Array.isArray(value.byCategory) ? value.byCategory : [],
    byObjectTop: Array.isArray(value.byObjectTop) ? value.byObjectTop : [],
    byWorker: Array.isArray(value.byWorker) ? value.byWorker : [],
  };
}

function periodToSummary(period: WeeklyPeriod | null | undefined) {
  return normalizeSummary(period?.summary_json);
}

async function getOrCreatePeriodForRange(startIso: string, endIso: string, status: WeeklyPeriodStatus) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: existing, error: selectError } = await measureAsync("weekly-control:period_by_range", () =>
    supabase.from("weekly_periods").select("*").eq("week_start", startIso).eq("week_end", endIso).maybeSingle(),
  );
  if (selectError) return { data: null, error: selectError.message };
  if (existing) return { data: existing as WeeklyPeriod, error: null };

  const payload = {
    week_start: startIso,
    week_end: endIso,
    status,
    title: formatPeriodTitle(startIso, endIso),
    created_by: user?.id ?? null,
  };
  const { data, error } = await measureAsync("weekly-control:create_period", () =>
    supabase.from("weekly_periods").insert(payload).select("*").single(),
  );
  if (error?.code === "23505") {
    const retry = await supabase.from("weekly_periods").select("*").eq("week_start", startIso).eq("week_end", endIso).maybeSingle();
    return { data: (retry.data ?? null) as WeeklyPeriod | null, error: retry.error?.message ?? null };
  }
  return { data: (data ?? null) as WeeklyPeriod | null, error: error?.message ?? null };
}

export async function getOrCreateCurrentWeeklyPeriod(): Promise<QueryResult<WeeklyPeriod | null>> {
  if (!hasSupabaseEnv()) return emptyWithError(null);
  const range = getCurrentWeekRange();
  return getOrCreatePeriodForRange(range.startIso, range.endIso, "current");
}

export async function getWeeklyPeriods(limit = 20): Promise<QueryResult<WeeklyPeriod[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("weekly-control:list_periods", () =>
    supabase.from("weekly_periods").select("*").order("week_start", { ascending: false }).limit(limit),
  );
  return { data: (data ?? []) as WeeklyPeriod[], error: error?.message ?? null };
}

export async function getLatestArchivedWeeklyPeriod(): Promise<QueryResult<WeeklyPeriod | null>> {
  if (!hasSupabaseEnv()) return emptyWithError(null);
  const supabase = await createClient();
  const { data, error } = await measureAsync("weekly-control:latest_archived", () =>
    supabase.from("weekly_periods").select("*").in("status", ["closed", "archived"]).order("week_start", { ascending: false }).limit(1).maybeSingle(),
  );
  return { data: (data ?? null) as WeeklyPeriod | null, error: error?.message ?? null };
}

export async function getWeeklyPeriodDetails(periodId: string): Promise<QueryResult<WeeklyPeriodDetails>> {
  if (!hasSupabaseEnv()) return emptyWithError({ period: null, tickets: [], summary: emptySummary });
  const supabase = await createClient();
  const [periodResult, ticketsResult] = await Promise.all([
    measureAsync("weekly-control:period_detail", () => supabase.from("weekly_periods").select("*").eq("id", periodId).maybeSingle()),
    measureAsync("weekly-control:period_tickets", () =>
      supabase.from("weekly_period_tickets").select("*").eq("weekly_period_id", periodId).order("role").order("ticket_number"),
    ),
  ]);
  const period = (periodResult.data ?? null) as WeeklyPeriod | null;
  const tickets = (ticketsResult.data ?? []) as WeeklyPeriodTicket[];
  const error = periodResult.error?.message ?? ticketsResult.error?.message ?? null;
  return { data: { period, tickets, summary: periodToSummary(period) }, error };
}

function isHighPriority(ticket: TicketWithRelations) {
  return ticket.priority === "critical" || ticket.priority === "high";
}

function completionDate(ticket: TicketWithRelations) {
  return ticket.admin_confirmed_at ?? ticket.worker_completed_at ?? ticket.completed_at ?? (ticket.status === "done" ? ticket.updated_at : null);
}

function dateInRange(iso: string | null | undefined, start: Date, end: Date) {
  if (!iso) return false;
  const value = new Date(iso);
  return value >= start && value <= end;
}

function ticketKey(ticket: TicketWithRelations, role: WeeklyTicketRole) {
  return `${ticket.id}:${role}`;
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asTicket(row: any): TicketWithRelations | null {
  const ticket = normalizeRelation(row?.ticket) as TicketWithRelations | null;
  if (!ticket) return null;
  if (!ticket.worker && row?.worker) ticket.worker = normalizeRelation(row.worker) as any;
  return ticket;
}

function addTicket(map: Map<string, { ticket: TicketWithRelations; role: WeeklyTicketRole }>, ticket: TicketWithRelations | null, role: WeeklyTicketRole) {
  if (!ticket?.id) return;
  const key = ticketKey(ticket, role);
  if (!map.has(key)) map.set(key, { ticket, role });
}

function snapshotRow(periodId: string, ticket: TicketWithRelations, role: WeeklyTicketRole) {
  return {
    weekly_period_id: periodId,
    ticket_id: ticket.id,
    role,
    ticket_number: ticket.number ?? null,
    ticket_title: ticket.title ?? null,
    object_name: ticket.object?.name ?? null,
    object_address: ticket.object?.address ?? null,
    category_name: ticket.category?.name ?? null,
    priority: ticket.priority ?? null,
    status_at_close: ticket.status ?? null,
    assignee_worker_name: ticket.worker?.name ?? null,
    created_at_snapshot: ticket.created_at ?? null,
    completed_at_snapshot: completionDate(ticket),
  };
}

function countBy(rows: Array<{ ticket: TicketWithRelations }>, getLabel: (ticket: TicketWithRelations) => string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = getLabel(row.ticket) || "Не вказано";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "uk-UA"));
}

function buildSummary(rows: Array<{ ticket: TicketWithRelations; role: WeeklyTicketRole }>): WeeklySummary {
  const byRole = (role: WeeklyTicketRole) => rows.filter((row) => row.role === role);
  const uniqueTickets = new Map<string, TicketWithRelations>();
  for (const row of rows) uniqueTickets.set(row.ticket.id, row.ticket);
  const uniqueRows = Array.from(uniqueTickets.values()).map((ticket) => ({ ticket }));
  return {
    totalCreated: byRole("created").length,
    totalCompleted: byRole("completed").length,
    totalUnresolved: byRole("unresolved").length,
    totalCarriedOver: byRole("carried_over").length,
    totalHot: byRole("hot").length,
    totalPlanned: byRole("planned").length,
    totalWaitingAdminConfirmation: Array.from(uniqueTickets.values()).filter((ticket) => ticket.status === "waiting_admin_confirmation").length,
    byCategory: countBy(uniqueRows, (ticket) => ticket.category?.name ?? "Без категорії"),
    byObjectTop: countBy(uniqueRows, (ticket) => ticket.object?.name ?? "Без об'єкта").slice(0, 8),
    byWorker: countBy(uniqueRows, (ticket) => ticket.worker?.name ?? "Без виконавця"),
  };
}

async function queryCompletedTickets(supabase: Awaited<ReturnType<typeof createClient>>, start: Date, end: Date) {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const fields = ["completed_at", "admin_confirmed_at", "worker_completed_at", "updated_at"];
  const results = await Promise.all(fields.map((field) =>
    measureAsync(`weekly-control:completed:${field}`, () =>
      supabase.from("tickets").select(ticketSnapshotSelect).eq("status", "done").gte(field, startIso).lte(field, endIso).limit(1000),
    ),
  ));
  const map = new Map<string, TicketWithRelations>();
  let error: string | null = null;
  for (const result of results) {
    if (result.error && !error) error = result.error.message;
    for (const ticket of (result.data ?? []) as unknown as TicketWithRelations[]) {
      if (dateInRange(completionDate(ticket), start, end)) map.set(ticket.id, ticket);
    }
  }
  return { data: Array.from(map.values()), error };
}


async function queryPreviousCarryOverTicketIds(supabase: Awaited<ReturnType<typeof createClient>>, weekStartIso: string) {
  const previousPeriodResult = await measureAsync("weekly-control:previous_period", () =>
    supabase
      .from("weekly_periods")
      .select("id")
      .lt("week_start", weekStartIso)
      .in("status", ["closed", "archived"])
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (previousPeriodResult.error) return { ids: [] as string[], error: previousPeriodResult.error.message };
  const previousPeriodId = (previousPeriodResult.data as { id?: string } | null)?.id;
  if (!previousPeriodId) return { ids: [] as string[], error: null as string | null };

  const previousTicketsResult = await measureAsync("weekly-control:previous_unresolved", () =>
    supabase
      .from("weekly_period_tickets")
      .select("ticket_id")
      .eq("weekly_period_id", previousPeriodId)
      .in("role", ["unresolved", "carried_over"])
      .limit(1500),
  );
  const ids = Array.from(new Set(((previousTicketsResult.data ?? []) as Array<{ ticket_id: string | null }>).map((row) => row.ticket_id).filter(Boolean) as string[]));
  return { ids, error: previousTicketsResult.error?.message ?? null };
}

async function queryTicketsByIds(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  if (ids.length === 0) return { data: [] as TicketWithRelations[], error: null as string | null };
  const result = await measureAsync("weekly-control:tickets_by_ids", () =>
    supabase.from("tickets").select(ticketSnapshotSelect).in("id", ids).not("status", "in", "(done,cancelled,rejected)").limit(1500),
  );
  return { data: (result.data ?? []) as unknown as TicketWithRelations[], error: result.error?.message ?? null };
}

async function buildWeeklySnapshotRows(supabase: Awaited<ReturnType<typeof createClient>>, period: WeeklyPeriod) {
  const start = new Date(`${period.week_start}T00:00:00`);
  const end = endOfDay(new Date(`${period.week_end}T00:00:00`));
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [createdResult, completedResult, plannedResult, waitingResult, previousCarryOverResult] = await Promise.all([
    measureAsync("weekly-control:snapshot_created", () =>
      supabase.from("tickets").select(ticketSnapshotSelect).gte("created_at", startIso).lte("created_at", endIso).limit(1500),
    ),
    queryCompletedTickets(supabase, start, end),
    measureAsync("weekly-control:snapshot_planned", () =>
      supabase
        .from("work_plan_items")
        .select(`ticket_id, worker:workers(id,name), ticket:tickets(${ticketSnapshotSelect}), work_plan:work_plans!inner(id,title,status,period_start,period_end)`)
        .lte("work_plan.period_start", period.week_end)
        .gte("work_plan.period_end", period.week_start)
        .limit(1500),
    ),
    measureAsync("weekly-control:snapshot_waiting_confirmation", () =>
      supabase
        .from("tickets")
        .select(ticketSnapshotSelect)
        .eq("status", "waiting_admin_confirmation")
        .gte("worker_completed_at", startIso)
        .lte("worker_completed_at", endIso)
        .limit(1500),
    ),
    queryPreviousCarryOverTicketIds(supabase, period.week_start),
  ]);

  const carryOverResult = await queryTicketsByIds(supabase, previousCarryOverResult.ids);
  const snapshot = new Map<string, { ticket: TicketWithRelations; role: WeeklyTicketRole }>();
  const createdTickets = (createdResult.data ?? []) as unknown as TicketWithRelations[];
  const completedTickets = completedResult.data;
  const plannedTickets = ((plannedResult.data ?? []) as any[]).map(asTicket).filter(Boolean) as TicketWithRelations[];
  const waitingTickets = (waitingResult.data ?? []) as unknown as TicketWithRelations[];
  const carryOverTickets = carryOverResult.data;

  for (const ticket of createdTickets) addTicket(snapshot, ticket, "created");
  for (const ticket of completedTickets) addTicket(snapshot, ticket, "completed");
  for (const ticket of plannedTickets) addTicket(snapshot, ticket, "planned");

  const weeklyTickets = new Map<string, TicketWithRelations>();
  for (const ticket of [...createdTickets, ...completedTickets, ...plannedTickets, ...waitingTickets]) weeklyTickets.set(ticket.id, ticket);
  for (const ticket of weeklyTickets.values()) if (isHighPriority(ticket)) addTicket(snapshot, ticket, "hot");

  const unresolvedTickets = new Map<string, TicketWithRelations>();
  for (const ticket of [...createdTickets, ...plannedTickets, ...waitingTickets]) unresolvedTickets.set(ticket.id, ticket);
  for (const ticket of unresolvedTickets.values()) if (!inactiveStatuses.has(ticket.status)) addTicket(snapshot, ticket, "unresolved");

  for (const ticket of carryOverTickets) {
    if (inactiveStatuses.has(ticket.status)) continue;
    addTicket(snapshot, ticket, "carried_over");
    addTicket(snapshot, ticket, "unresolved");
  }

  const error = createdResult.error?.message ?? completedResult.error ?? plannedResult.error?.message ?? waitingResult.error?.message ?? previousCarryOverResult.error ?? carryOverResult.error ?? null;
  return { rows: Array.from(snapshot.values()), error };
}

export async function getWeeklyControlSummary(period: WeeklyPeriod | null): Promise<QueryResult<WeeklySummary>> {
  if (!hasSupabaseEnv()) return emptyWithError(emptySummary);
  if (!period) return { data: emptySummary, error: null };
  if (period.status === "archived" || period.status === "closed") return { data: periodToSummary(period), error: null };
  const supabase = await createClient();
  const snapshot = await buildWeeklySnapshotRows(supabase, period);
  return { data: buildSummary(snapshot.rows), error: snapshot.error };
}

export async function createWeeklySnapshot(periodId: string): Promise<QueryResult<{ period: WeeklyPeriod | null; summary: WeeklySummary; snapshotCount: number; message: string }>> {
  if (!hasSupabaseEnv()) return emptyWithError({ period: null, summary: emptySummary, snapshotCount: 0, message: missingSupabaseMessage });
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: periodData, error: periodError } = await measureAsync("weekly-control:close_period_load", () =>
    supabase.from("weekly_periods").select("*").eq("id", periodId).maybeSingle(),
  );
  if (periodError) return { data: { period: null, summary: emptySummary, snapshotCount: 0, message: periodError.message }, error: periodError.message };
  const period = periodData as WeeklyPeriod | null;
  if (!period) return { data: { period: null, summary: emptySummary, snapshotCount: 0, message: "Період не знайдено." }, error: "Період не знайдено." };
  if (period.status === "archived" || period.status === "closed") {
    return { data: { period, summary: periodToSummary(period), snapshotCount: 0, message: "Тиждень уже закрито." }, error: null };
  }

  const snapshotResult = await buildWeeklySnapshotRows(supabase, period);
  const rows = snapshotResult.rows;
  const upsertRows = rows.map((row) => snapshotRow(period.id, row.ticket, row.role));
  const summary = buildSummary(rows);
  let mutationError = snapshotResult.error;

  if (upsertRows.length > 0) {
    const { error } = await measureAsync("weekly-control:snapshot_upsert", () =>
      supabase.from("weekly_period_tickets").upsert(upsertRows, { onConflict: "weekly_period_id,ticket_id,role" }),
    );
    if (error && !mutationError) mutationError = error.message;
  }

  const unresolvedRows = rows.filter((row) => row.role === "unresolved");
  if (unresolvedRows.length > 0) {
    const historyRows = unresolvedRows.map((row) => ({
      ticket_id: row.ticket.id,
      actor_id: user?.id ?? null,
      action: "Тиждень закрито. Заявка перенесена в контроль наступного тижня.",
      metadata: { weekly_period_id: period.id, week_start: period.week_start, week_end: period.week_end },
    }));
    const { error } = await measureAsync("weekly-control:unresolved_history", () => supabase.from("ticket_history").insert(historyRows));
    if (error && !mutationError) mutationError = error.message;
  }

  const { data: updated, error: updateError } = await measureAsync("weekly-control:archive_period", () =>
    supabase
      .from("weekly_periods")
      .update({ status: "archived", closed_at: new Date().toISOString(), archived_at: new Date().toISOString(), closed_by: user?.id ?? null, summary_json: summary })
      .eq("id", period.id)
      .select("*")
      .single(),
  );
  if (updateError && !mutationError) mutationError = updateError.message;

  const periodEnd = endOfDay(new Date(`${period.week_end}T00:00:00`));
  const nextRange = getCurrentWeekRange(addDays(periodEnd, 1));
  await getOrCreatePeriodForRange(nextRange.startIso, nextRange.endIso, "current");

  return {
    data: {
      period: (updated ?? period) as WeeklyPeriod,
      summary,
      snapshotCount: upsertRows.length,
      message: mutationError ? "Тиждень закрито частково. Перевірте журнал помилок." : "Тиждень закрито та додано в архів.",
    },
    error: mutationError,
  };
}

export async function closeWeeklyPeriod(periodId: string) {
  return createWeeklySnapshot(periodId);
}