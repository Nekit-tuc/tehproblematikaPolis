import { getCurrentUser } from "@/lib/auth/server";
import { measureAsync } from "@/lib/performance";
import { getNextWorkWeekRange, getWorkWeekRange } from "@/lib/date/work-week";
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

export function getCurrentWeekRange(date = new Date()) {
  const current = getWorkWeekRange(date);
  const next = getNextWorkWeekRange(date);
  return {
    start: current.start,
    end: current.end,
    startIso: current.startDate,
    endIso: current.endDate,
    nextStartIso: next.startDate,
    nextEndIso: next.endDate,
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
  return value >= start && value < end;
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
      supabase.from("tickets").select(ticketSnapshotSelect).eq("status", "done").gte(field, startIso).lt(field, endIso).limit(1000),
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


function snapshotKey(value: { ticket_id?: string | null; ticket?: TicketWithRelations | null; role: WeeklyTicketRole }) {
  const ticketId = value.ticket_id ?? value.ticket?.id;
  return ticketId ? `${ticketId}:${value.role}` : null;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function buildWeeklySnapshotRows(supabase: Awaited<ReturnType<typeof createClient>>, period: WeeklyPeriod) {
  const start = new Date(`${period.week_start}T00:00:00`);
  const end = new Date(`${period.week_end}T00:00:00`);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [createdResult, completedResult, plannedResult, waitingResult] = await Promise.all([
    measureAsync("weekly-control:snapshot_created", () =>
      supabase.from("tickets").select(ticketSnapshotSelect).gte("created_at", startIso).lt("created_at", endIso).limit(1500),
    ),
    queryCompletedTickets(supabase, start, end),
    measureAsync("weekly-control:snapshot_planned", () =>
      supabase
        .from("work_plan_items")
        .select(`ticket_id, worker:workers(id,name), ticket:tickets(${ticketSnapshotSelect}), work_plan:work_plans!inner(id,title,status,period_start,period_end)`)
        .gte("work_plan.period_start", period.week_start)
        .lt("work_plan.period_start", period.week_end)
        .limit(1500),
    ),
    measureAsync("weekly-control:snapshot_waiting_confirmation", () =>
      supabase
        .from("tickets")
        .select(ticketSnapshotSelect)
        .eq("status", "waiting_admin_confirmation")
        .gte("worker_completed_at", startIso)
        .lt("worker_completed_at", endIso)
        .limit(1500),
    ),
  ]);

  const snapshot = new Map<string, { ticket: TicketWithRelations; role: WeeklyTicketRole }>();
  const createdTickets = (createdResult.data ?? []) as unknown as TicketWithRelations[];
  const completedTickets = completedResult.data;
  const plannedTickets = ((plannedResult.data ?? []) as any[]).map(asTicket).filter(Boolean) as TicketWithRelations[];
  const waitingTickets = (waitingResult.data ?? []) as unknown as TicketWithRelations[];

  for (const ticket of createdTickets) addTicket(snapshot, ticket, "created");
  for (const ticket of completedTickets) addTicket(snapshot, ticket, "completed");
  for (const ticket of plannedTickets) addTicket(snapshot, ticket, "planned");

  const weeklyTickets = new Map<string, TicketWithRelations>();
  for (const ticket of [...createdTickets, ...completedTickets, ...plannedTickets, ...waitingTickets]) weeklyTickets.set(ticket.id, ticket);
  for (const ticket of weeklyTickets.values()) if (isHighPriority(ticket)) addTicket(snapshot, ticket, "hot");

  const unresolvedTickets = new Map<string, TicketWithRelations>();
  for (const ticket of [...createdTickets, ...plannedTickets, ...waitingTickets]) unresolvedTickets.set(ticket.id, ticket);
  for (const ticket of unresolvedTickets.values()) if (!inactiveStatuses.has(ticket.status)) addTicket(snapshot, ticket, "unresolved");

  const error = createdResult.error?.message ?? completedResult.error ?? plannedResult.error?.message ?? waitingResult.error?.message ?? null;
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

  const periodEnd = new Date(`${period.week_end}T00:00:00`);
  const nextRange = getCurrentWeekRange(periodEnd);
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

export async function rebuildArchivedWeeklySnapshot(periodId: string): Promise<QueryResult<{ period: WeeklyPeriod | null; summary: WeeklySummary; snapshotCount: number; removedStaleRows: number; message: string }>> {
  if (!hasSupabaseEnv()) return emptyWithError({ period: null, summary: emptySummary, snapshotCount: 0, removedStaleRows: 0, message: missingSupabaseMessage });
  const supabase = await createClient();
  const { data: periodData, error: periodError } = await measureAsync("weekly-control:rebuild_period_load", () =>
    supabase.from("weekly_periods").select("*").eq("id", periodId).maybeSingle(),
  );
  if (periodError) return { data: { period: null, summary: emptySummary, snapshotCount: 0, removedStaleRows: 0, message: periodError.message }, error: periodError.message };
  const period = periodData as WeeklyPeriod | null;
  if (!period) return { data: { period: null, summary: emptySummary, snapshotCount: 0, removedStaleRows: 0, message: "\u041F\u0435\u0440\u0456\u043E\u0434 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E." }, error: "\u041F\u0435\u0440\u0456\u043E\u0434 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E." };
  if (period.status !== "archived" && period.status !== "closed") {
    return {
      data: { period, summary: periodToSummary(period), snapshotCount: 0, removedStaleRows: 0, message: "\u041F\u0435\u0440\u0435\u0440\u0430\u0445\u0443\u043D\u043E\u043A \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \u0442\u0456\u043B\u044C\u043A\u0438 \u0434\u043B\u044F \u0437\u0430\u043A\u0440\u0438\u0442\u0438\u0445 \u0430\u0440\u0445\u0456\u0432\u0456\u0432." },
      error: "\u041F\u0435\u0440\u0435\u0440\u0430\u0445\u0443\u043D\u043E\u043A \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \u0442\u0456\u043B\u044C\u043A\u0438 \u0434\u043B\u044F \u0437\u0430\u043A\u0440\u0438\u0442\u0438\u0445 \u0430\u0440\u0445\u0456\u0432\u0456\u0432.",
    };
  }

  const snapshotResult = await buildWeeklySnapshotRows(supabase, period);
  if (snapshotResult.error) {
    return { data: { period, summary: periodToSummary(period), snapshotCount: 0, removedStaleRows: 0, message: snapshotResult.error }, error: snapshotResult.error };
  }

  const rows = snapshotResult.rows;
  const upsertRows = rows.map((row) => snapshotRow(period.id, row.ticket, row.role));
  const summary = buildSummary(rows);
  const newKeys = new Set(rows.map(snapshotKey).filter(Boolean));

  let mutationError: string | null = null;
  if (upsertRows.length > 0) {
    const { error } = await measureAsync("weekly-control:rebuild_snapshot_upsert", () =>
      supabase.from("weekly_period_tickets").upsert(upsertRows, { onConflict: "weekly_period_id,ticket_id,role" }),
    );
    if (error) mutationError = error.message;
  }
  if (mutationError) return { data: { period, summary: periodToSummary(period), snapshotCount: 0, removedStaleRows: 0, message: mutationError }, error: mutationError };

  const existingResult = await measureAsync("weekly-control:rebuild_existing_rows", () =>
    supabase.from("weekly_period_tickets").select("id,ticket_id,role").eq("weekly_period_id", period.id).limit(3000),
  );
  if (existingResult.error) return { data: { period, summary: periodToSummary(period), snapshotCount: upsertRows.length, removedStaleRows: 0, message: existingResult.error.message }, error: existingResult.error.message };

  const staleIds = ((existingResult.data ?? []) as Array<{ id: string; ticket_id: string | null; role: WeeklyTicketRole }>).filter((row) => {
    const key = snapshotKey(row);
    return !key || !newKeys.has(key);
  }).map((row) => row.id);

  for (const ids of chunks(staleIds, 200)) {
    const { error } = await measureAsync("weekly-control:rebuild_delete_stale", () =>
      supabase.from("weekly_period_tickets").delete().in("id", ids),
    );
    if (error && !mutationError) mutationError = error.message;
  }
  if (mutationError) return { data: { period, summary: periodToSummary(period), snapshotCount: upsertRows.length, removedStaleRows: 0, message: mutationError }, error: mutationError };

  const { data: updated, error: updateError } = await measureAsync("weekly-control:rebuild_update_summary", () =>
    supabase
      .from("weekly_periods")
      .update({ summary_json: summary })
      .eq("id", period.id)
      .select("*")
      .single(),
  );
  if (updateError) return { data: { period, summary: periodToSummary(period), snapshotCount: upsertRows.length, removedStaleRows: staleIds.length, message: updateError.message }, error: updateError.message };

  return {
    data: {
      period: (updated ?? period) as WeeklyPeriod,
      summary,
      snapshotCount: upsertRows.length,
      removedStaleRows: staleIds.length,
      message: "\u0410\u0440\u0445\u0456\u0432 \u043F\u0435\u0440\u0435\u0440\u0430\u0445\u043E\u0432\u0430\u043D\u043E \u0437\u0430 \u043D\u043E\u0432\u043E\u044E \u043B\u043E\u0433\u0456\u043A\u043E\u044E.",
    },
    error: null,
  };
}

export async function closeWeeklyPeriod(periodId: string) {
  return createWeeklySnapshot(periodId);
}
