import { getCategories, getObjects, getTickets, type QueryResult } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { getWorkers } from "@/lib/supabase/worker-queries";
import { getWeeklyPeriodDetails, type WeeklyPeriodDetails, type WeeklyPeriodTicket } from "@/lib/supabase/weekly-control";
import type { Category, CompanyObject, TicketPriority, TicketStatus, TicketWithRelations, WorkerWithCategories } from "@/types/domain";

export type ReportsPeriod = "this_week" | "previous_week" | "month" | "custom";

export type ReportsPeriodRange = {
  period: ReportsPeriod;
  from: string;
  to: string;
  label: string;
};

export type ReportsTopRow = {
  id: string;
  name: string;
  subtitle?: string | null;
  count: number;
  total?: number;
  completed?: number;
  unresolved?: number;
};

export type ReportsDailyPoint = {
  iso: string;
  label: string;
  count: number;
  completed: number;
};

export type ReportTicketRow = {
  id: string;
  number: string;
  title: string;
  objectName: string;
  categoryName: string;
  assigneeName: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  objectAddress: string;
  description: string;
};

export type ObjectReportRow = {
  id: string;
  rank: number;
  name: string;
  address: string;
  total: number;
  completed: number;
  unresolved: number;
  problematic: number;
  completionRate: number;
  averageCompletionDays: number | null;
  topCategory: string | null;
};

export type WorkerReportRow = {
  id: string;
  name: string;
  initials: string;
  assigned: number;
  completed: number;
  unresolved: number;
  waitingConfirmation: number;
  efficiency: number;
  slaRate: number | null;
  averageCompletionDays: number | null;
};

export type CategoryReportRow = {
  id: string;
  name: string;
  total: number;
  completed: number;
  unresolved: number;
  problematic: number;
  completionRate: number;
  topObjects: ReportsTopRow[];
};

export type ReportsDashboardData = {
  periodRange: ReportsPeriodRange;
  totalTickets: number;
  completedTickets: number;
  unresolvedTickets: number;
  problematicTickets: number;
  waitingConfirmationTickets: number;
  completionRate: number;
  topProblemObjects: ReportsTopRow[];
  topCategories: ReportsTopRow[];
  topWorkers: ReportsTopRow[];
  weeklyTrend: ReportsDailyPoint[];
  directorSummaryText: string;
  directorRecommendations: string[];
  objectCount: number;
  workerCount: number;
  categoryCount: number;
  exportHref: string;
  tickets: {
    all: ReportTicketRow[];
    completed: ReportTicketRow[];
    unresolved: ReportTicketRow[];
    waitingConfirmation: ReportTicketRow[];
  };
  objectRows: ObjectReportRow[];
  workerRows: WorkerReportRow[];
  categoryRows: CategoryReportRow[];
};

const inactiveStatuses = new Set(["done", "cancelled", "rejected"]);

type PlannedTicketAssignment = {
  ticket: TicketWithRelations;
  workerId: string | null;
  workerName: string | null;
};

const plannedTicketSelect = `
  ticket_id,
  worker_id,
  worker:workers(id,name),
  ticket:tickets!inner(
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
    created_at,
    updated_at,
    object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
    category:categories(id, name, description, is_active, created_at),
    assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at),
    worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at)
  ),
  work_plan:work_plans!inner(id,status,period_start,period_end)
`;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function atStartOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function atEndOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function startOfWeek(date: Date) {
  const value = atStartOfDay(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return value;
}

function formatRangeLabel(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${formatter.format(new Date(`${from}T12:00:00`))} - ${formatter.format(new Date(`${to}T12:00:00`))}`;
}

export function getReportsPeriodRange(period: string | undefined, customFrom?: string, customTo?: string): ReportsPeriodRange {
  const selected = period === "previous_week" || period === "month" || period === "custom" ? period : "this_week";
  const now = new Date();
  if (selected === "previous_week") {
    const start = addDays(startOfWeek(now), -7);
    const end = addDays(start, 6);
    const from = isoDate(start);
    const to = isoDate(end);
    return { period: selected, from, to, label: `Минулий тиждень · ${formatRangeLabel(from, to)}` };
  }
  if (selected === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = now;
    const from = isoDate(start);
    const to = isoDate(end);
    return { period: selected, from, to, label: `Поточний місяць · ${formatRangeLabel(from, to)}` };
  }
  if (selected === "custom" && customFrom && customTo) {
    return { period: selected, from: customFrom, to: customTo, label: `Період · ${formatRangeLabel(customFrom, customTo)}` };
  }
  const start = startOfWeek(now);
  const end = addDays(start, 6);
  const from = isoDate(start);
  const to = isoDate(end);
  return { period: "this_week", from, to, label: `Цей тиждень · ${formatRangeLabel(from, to)}` };
}


export type ReportExportType = "weekly" | "objects" | "workers" | "categories" | "director";

export function reportsExportHref(type: ReportExportType, period: ReportsPeriod, from: string, to: string, periodId?: string | null) {
  const params = new URLSearchParams({ type });
  if (periodId) {
    params.set("periodId", periodId);
    return `/reports/export?${params.toString()}`;
  }
  if (period === "custom") {
    params.set("period", "custom");
    params.set("from", from);
    params.set("to", to);
  } else {
    params.set("period", period);
  }
  return `/reports/export?${params.toString()}`;
}

export function reportsPeriodHref(basePath: string, period: ReportsPeriod, from: string, to: string, periodId?: string | null) {
  if (periodId) return `${basePath}?periodId=${periodId}`;
  if (period === "custom") return `${basePath}?period=custom&from=${from}&to=${to}`;
  return `${basePath}?period=${period}`;
}

function ticketCreatedInRange(ticket: TicketWithRelations, from: Date, to: Date) {
  const createdAt = new Date(ticket.created_at);
  return createdAt >= from && createdAt <= to;
}

function completionDate(ticket: TicketWithRelations) {
  return ticket.admin_confirmed_at ?? ticket.worker_completed_at ?? ticket.completed_at ?? (ticket.status === "done" ? ticket.updated_at : null);
}

function ticketCompletedInRange(ticket: TicketWithRelations, from: Date, to: Date) {
  const value = completionDate(ticket);
  if (!value || ticket.status !== "done") return false;
  const date = new Date(value);
  return date >= from && date <= to;
}

function uniqueTickets(tickets: TicketWithRelations[]) {
  const map = new Map<string, TicketWithRelations>();
  for (const ticket of tickets) if (ticket.id) map.set(ticket.id, ticket);
  return Array.from(map.values());
}

function plannedWorkerName(row: unknown) {
  const value = (row as { worker?: { name?: string | null } | Array<{ name?: string | null }> | null }).worker;
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value?.name ?? null;
}

function plannedTicket(row: unknown) {
  const value = (row as { ticket?: TicketWithRelations | TicketWithRelations[] | null }).ticket;
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function getPlannedAssignmentsForPeriod(from: string, to: string): Promise<QueryResult<PlannedTicketAssignment[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plan_items")
    .select(plannedTicketSelect)
    .lte("work_plan.period_start", to)
    .gte("work_plan.period_end", from)
    .limit(2000);
  const rows = ((data ?? []) as unknown[]).map((row) => {
    const ticket = plannedTicket(row);
    if (!ticket) return null;
    return {
      ticket,
      workerId: (row as { worker_id?: string | null }).worker_id ?? ticket.assignee_worker_id ?? null,
      workerName: plannedWorkerName(row) ?? ticket.worker?.name ?? null,
    } satisfies PlannedTicketAssignment;
  }).filter((row): row is PlannedTicketAssignment => Boolean(row));
  return { data: rows, error: error?.message ?? null };
}

function plannedWorkerMap(assignments: PlannedTicketAssignment[]) {
  const map = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    if (!assignment.workerId) continue;
    const set = map.get(assignment.ticket.id) ?? new Set<string>();
    set.add(assignment.workerId);
    map.set(assignment.ticket.id, set);
  }
  return map;
}

function hydratePlannedWorkerNames(tickets: TicketWithRelations[], assignments: PlannedTicketAssignment[]) {
  const names = new Map(assignments.filter((item) => item.workerId && item.workerName).map((item) => [item.workerId!, item.workerName!]));
  return tickets.map((ticket) => {
    if (ticket.worker?.name || !ticket.assignee_worker_id) return ticket;
    const plannedName = names.get(ticket.assignee_worker_id);
    return plannedName ? { ...ticket, worker: { id: ticket.assignee_worker_id, name: plannedName } as TicketWithRelations["worker"] } : ticket;
  });
}

function isUnresolved(ticket: TicketWithRelations) {
  return !inactiveStatuses.has(ticket.status);
}

function isProblematic(ticket: TicketWithRelations) {
  const olderThanSevenDays = new Date(ticket.created_at).getTime() < Date.now() - 7 * 86400000;
  return isUnresolved(ticket) && (ticket.priority === "critical" || ticket.priority === "high" || ticket.status === "waiting_admin_confirmation" || olderThanSevenDays);
}

function daysBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  return Math.max(0, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
}

function average(values: number[]) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function ticketAssigneeName(ticket: TicketWithRelations) {
  return ticket.worker?.name ?? ticket.assignee?.full_name ?? "Не призначено";
}

function toTicketRow(ticket: TicketWithRelations): ReportTicketRow {
  return {
    id: ticket.id,
    number: ticket.number,
    title: ticket.title,
    objectName: ticket.object?.name ?? "Об'єкт не вказано",
    categoryName: ticket.category?.name ?? "Без категорії",
    assigneeName: ticketAssigneeName(ticket),
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.created_at,
    objectAddress: ticket.object?.address ?? "",
    description: ticket.description ?? "",
  };
}

function topObjects(tickets: TicketWithRelations[]): ReportsTopRow[] {
  const grouped = new Map<string, ReportsTopRow>();
  for (const ticket of tickets.filter(isProblematic)) {
    const id = ticket.object_id ?? "unknown";
    const existing = grouped.get(id) ?? { id, name: ticket.object?.name ?? "Об'єкт не вказано", subtitle: ticket.object?.address ?? null, count: 0, total: 0, completed: 0, unresolved: 0 };
    existing.count += 1;
    existing.total = (existing.total ?? 0) + 1;
    existing.unresolved = (existing.unresolved ?? 0) + (isUnresolved(ticket) ? 1 : 0);
    grouped.set(id, existing);
  }
  return Array.from(grouped.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "uk-UA")).slice(0, 5);
}

function topCategories(tickets: TicketWithRelations[]): ReportsTopRow[] {
  const grouped = new Map<string, ReportsTopRow>();
  for (const ticket of tickets) {
    const id = ticket.category_id ?? "unknown";
    const existing = grouped.get(id) ?? { id, name: ticket.category?.name ?? "Без категорії", count: 0, completed: 0, unresolved: 0 };
    existing.count += 1;
    existing.completed = (existing.completed ?? 0) + (ticket.status === "done" ? 1 : 0);
    existing.unresolved = (existing.unresolved ?? 0) + (isUnresolved(ticket) ? 1 : 0);
    grouped.set(id, existing);
  }
  return Array.from(grouped.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "uk-UA")).slice(0, 5);
}

function topWorkers(tickets: TicketWithRelations[]): ReportsTopRow[] {
  const grouped = new Map<string, ReportsTopRow>();
  for (const ticket of tickets.filter((item) => item.assignee_worker_id || item.assigned_to)) {
    const id = ticket.assignee_worker_id ?? ticket.assigned_to ?? "unknown";
    const name = ticketAssigneeName(ticket);
    const existing = grouped.get(id) ?? { id, name, count: 0, completed: 0, unresolved: 0 };
    existing.count += 1;
    existing.completed = (existing.completed ?? 0) + (ticket.status === "done" ? 1 : 0);
    existing.unresolved = (existing.unresolved ?? 0) + (isUnresolved(ticket) ? 1 : 0);
    grouped.set(id, existing);
  }
  return Array.from(grouped.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "uk-UA")).slice(0, 5);
}

function buildTrend(tickets: TicketWithRelations[], from: Date, to: Date): ReportsDailyPoint[] {
  const dayCount = Math.min(31, Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1));
  const formatter = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" });
  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(from, index);
    const iso = isoDate(date);
    const dayStart = atStartOfDay(date);
    const dayEnd = atEndOfDay(date);
    return {
      iso,
      label: formatter.format(date),
      count: tickets.filter((ticket) => ticketCreatedInRange(ticket, dayStart, dayEnd)).length,
      completed: tickets.filter((ticket) => ticketCompletedInRange(ticket, dayStart, dayEnd)).length,
    };
  });
}

function mostFrequentCategory(tickets: TicketWithRelations[]) {
  return topCategories(tickets)[0]?.name ?? null;
}

function buildObjectRows(objects: CompanyObject[], tickets: TicketWithRelations[], completedTicketIds?: Set<string>): ObjectReportRow[] {
  const rows = objects.map((object) => {
    const scoped = tickets.filter((ticket) => ticket.object_id === object.id);
    const completed = scoped.filter((ticket) => completedTicketIds ? completedTicketIds.has(ticket.id) : ticket.status === "done");
    const unresolved = scoped.filter(isUnresolved);
    const problematic = scoped.filter(isProblematic);
    const completionDays = completed.map((ticket) => daysBetween(ticket.created_at, completionDate(ticket))).filter((value): value is number => typeof value === "number");
    return {
      id: object.id,
      rank: 0,
      name: object.name,
      address: object.address,
      total: scoped.length,
      completed: completed.length,
      unresolved: unresolved.length,
      problematic: problematic.length,
      completionRate: percent(completed.length, scoped.length),
      averageCompletionDays: average(completionDays),
      topCategory: mostFrequentCategory(scoped),
    };
  });
  return rows.sort((a, b) => b.problematic - a.problematic || b.total - a.total || a.name.localeCompare(b.name, "uk-UA")).map((row, index) => ({ ...row, rank: index + 1 }));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function ticketBelongsToWorker(ticket: TicketWithRelations, worker: WorkerWithCategories, plannedByTicket?: Map<string, Set<string>>) {
  return ticket.assignee_worker_id === worker.id || Boolean(plannedByTicket?.get(ticket.id)?.has(worker.id));
}

function buildWorkerRows(workers: WorkerWithCategories[], tickets: TicketWithRelations[], completedTicketIds?: Set<string>, plannedByTicket?: Map<string, Set<string>>): WorkerReportRow[] {
  return workers.map((worker) => {
    const scoped = tickets.filter((ticket) => ticketBelongsToWorker(ticket, worker, plannedByTicket));
    const completed = scoped.filter((ticket) => completedTicketIds ? completedTicketIds.has(ticket.id) : ticket.status === "done");
    const unresolved = scoped.filter(isUnresolved);
    const waitingConfirmation = scoped.filter((ticket) => ticket.status === "waiting_admin_confirmation");
    const completionDays = completed.map((ticket) => daysBetween(ticket.created_at, completionDate(ticket))).filter((value): value is number => typeof value === "number");
    const slaTickets = scoped.filter((ticket) => ticket.due_at && completionDate(ticket));
    const slaDone = slaTickets.filter((ticket) => new Date(completionDate(ticket)!).getTime() <= new Date(ticket.due_at!).getTime()).length;
    return {
      id: worker.id,
      name: worker.name,
      initials: initials(worker.name),
      assigned: scoped.length,
      completed: completed.length,
      unresolved: unresolved.length,
      waitingConfirmation: waitingConfirmation.length,
      efficiency: percent(completed.length, scoped.length),
      slaRate: slaTickets.length ? percent(slaDone, slaTickets.length) : null,
      averageCompletionDays: average(completionDays),
    };
  }).sort((a, b) => b.completed - a.completed || b.assigned - a.assigned || a.name.localeCompare(b.name, "uk-UA"));
}

function buildCategoryRows(categories: Category[], tickets: TicketWithRelations[], completedTicketIds?: Set<string>): CategoryReportRow[] {
  return categories.map((category) => {
    const scoped = tickets.filter((ticket) => ticket.category_id === category.id);
    const completed = scoped.filter((ticket) => completedTicketIds ? completedTicketIds.has(ticket.id) : ticket.status === "done");
    const unresolved = scoped.filter(isUnresolved);
    const problematic = scoped.filter(isProblematic);
    const objects = new Map<string, ReportsTopRow>();
    for (const ticket of scoped) {
      const id = ticket.object_id ?? "unknown";
      const existing = objects.get(id) ?? { id, name: ticket.object?.name ?? "Об'єкт не вказано", subtitle: ticket.object?.address ?? null, count: 0 };
      existing.count += 1;
      objects.set(id, existing);
    }
    return {
      id: category.id,
      name: category.name,
      total: scoped.length,
      completed: completed.length,
      unresolved: unresolved.length,
      problematic: problematic.length,
      completionRate: percent(completed.length, scoped.length),
      topObjects: Array.from(objects.values()).sort((a, b) => b.count - a.count).slice(0, 3),
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "uk-UA"));
}

function buildDirectorSummary(total: number, completed: number, unresolved: number, topCategory?: ReportsTopRow, topObject?: ReportsTopRow) {
  if (total === 0) return "Недостатньо даних для висновків за обраний період.";
  const parts = [`За обраний період створено ${total} заявок. Виконано ${completed}, не виконано ${unresolved}.`];
  if (topCategory) parts.push(`Найбільше звернень по категорії ${topCategory.name}.`);
  if (topObject) parts.push(`Найпроблемніший об'єкт: ${topObject.name}.`);
  return parts.join(" ");
}

function buildDirectorRecommendations(completionRate: number, problematicCount: number, unresolvedCount: number, highUnresolved: number) {
  const recommendations: string[] = [];
  if (completionRate < 70) recommendations.push("Потрібно посилити контроль виконання.");
  if (problematicCount > 0) recommendations.push("Рекомендується перевірити проблемні об'єкти.");
  if (highUnresolved > 0 || unresolvedCount >= 10) recommendations.push("Є накопичення невиконаних заявок.");
  if (recommendations.length === 0) recommendations.push("Критичних відхилень за період не виявлено.");
  return recommendations;
}


function snapshotStatus(row: WeeklyPeriodTicket): TicketStatus {
  const value = row.status_at_close;
  if (value === "pending_review" || value === "new" || value === "assigned" || value === "in_progress" || value === "waiting" || value === "waiting_admin_confirmation" || value === "done" || value === "cancelled" || value === "rejected") return value;
  return "new";
}

function snapshotPriority(row: WeeklyPeriodTicket): TicketPriority {
  const value = row.priority;
  if (value === "low" || value === "medium" || value === "high" || value === "critical") return value;
  return "medium";
}

function snapshotIsUnresolved(row: WeeklyPeriodTicket) {
  return !inactiveStatuses.has(snapshotStatus(row));
}

function snapshotIsProblematic(row: WeeklyPeriodTicket) {
  const status = snapshotStatus(row);
  const priority = snapshotPriority(row);
  return snapshotIsUnresolved(row) && (priority === "critical" || priority === "high" || status === "waiting_admin_confirmation" || row.role === "carried_over" || row.role === "hot");
}

function snapshotTicketKey(row: WeeklyPeriodTicket) {
  return row.ticket_id;
}

function uniqueSnapshotTickets(rows: WeeklyPeriodTicket[]) {
  const map = new Map<string, WeeklyPeriodTicket>();
  for (const row of rows) {
    if (!map.has(snapshotTicketKey(row))) map.set(snapshotTicketKey(row), row);
  }
  return Array.from(map.values());
}

function snapshotTicketRow(row: WeeklyPeriodTicket): ReportTicketRow {
  return {
    id: row.ticket_id,
    number: row.ticket_number ?? "-",
    title: row.ticket_title ?? "-",
    objectName: row.object_name ?? "-",
    categoryName: row.category_name ?? "-",
    assigneeName: row.assignee_worker_name ?? "-",
    status: snapshotStatus(row),
    priority: snapshotPriority(row),
    createdAt: row.created_at_snapshot ?? row.added_at,
    objectAddress: row.object_address ?? "",
    description: row.ticket_title ?? "",
  };
}

function snapshotTopRows(rows: WeeklyPeriodTicket[], getId: (row: WeeklyPeriodTicket) => string, getName: (row: WeeklyPeriodTicket) => string, getSubtitle?: (row: WeeklyPeriodTicket) => string | null | undefined) {
  const grouped = new Map<string, ReportsTopRow>();
  for (const row of rows) {
    const id = getId(row);
    const existing = grouped.get(id) ?? { id, name: getName(row), subtitle: getSubtitle?.(row) ?? null, count: 0, completed: 0, unresolved: 0 };
    existing.count += 1;
    existing.completed = (existing.completed ?? 0) + (snapshotStatus(row) === "done" ? 1 : 0);
    existing.unresolved = (existing.unresolved ?? 0) + (snapshotIsUnresolved(row) ? 1 : 0);
    grouped.set(id, existing);
  }
  return Array.from(grouped.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "uk-UA"));
}

function buildSnapshotObjectRows(rows: WeeklyPeriodTicket[]): ObjectReportRow[] {
  return snapshotTopRows(rows, (row) => row.object_name ?? "unknown", (row) => row.object_name ?? "-", (row) => row.object_address).map((top, index) => {
    const scoped = rows.filter((row) => (row.object_name ?? "unknown") === top.id);
    const completed = scoped.filter((row) => snapshotStatus(row) === "done").length;
    const unresolved = scoped.filter(snapshotIsUnresolved).length;
    const problematic = scoped.filter(snapshotIsProblematic).length;
    const categories = snapshotTopRows(scoped, (row) => row.category_name ?? "unknown", (row) => row.category_name ?? "-");
    return {
      id: top.id,
      rank: index + 1,
      name: top.name,
      address: top.subtitle ?? "",
      total: scoped.length,
      completed,
      unresolved,
      problematic,
      completionRate: percent(completed, scoped.length),
      averageCompletionDays: null,
      topCategory: categories[0]?.name ?? null,
    };
  });
}

function buildSnapshotWorkerRows(rows: WeeklyPeriodTicket[]): WorkerReportRow[] {
  return snapshotTopRows(rows, (row) => row.assignee_worker_name ?? "unknown", (row) => row.assignee_worker_name ?? "-").map((top) => {
    const scoped = rows.filter((row) => (row.assignee_worker_name ?? "unknown") === top.id);
    const completed = scoped.filter((row) => snapshotStatus(row) === "done").length;
    const unresolved = scoped.filter(snapshotIsUnresolved).length;
    const waitingConfirmation = scoped.filter((row) => snapshotStatus(row) === "waiting_admin_confirmation").length;
    return {
      id: top.id,
      name: top.name,
      initials: initials(top.name),
      assigned: scoped.length,
      completed,
      unresolved,
      waitingConfirmation,
      efficiency: percent(completed, scoped.length),
      slaRate: null,
      averageCompletionDays: null,
    };
  });
}

function buildSnapshotCategoryRows(rows: WeeklyPeriodTicket[]): CategoryReportRow[] {
  return snapshotTopRows(rows, (row) => row.category_name ?? "unknown", (row) => row.category_name ?? "-").map((top) => {
    const scoped = rows.filter((row) => (row.category_name ?? "unknown") === top.id);
    const completed = scoped.filter((row) => snapshotStatus(row) === "done").length;
    const unresolved = scoped.filter(snapshotIsUnresolved).length;
    const problematic = scoped.filter(snapshotIsProblematic).length;
    return {
      id: top.id,
      name: top.name,
      total: scoped.length,
      completed,
      unresolved,
      problematic,
      completionRate: percent(completed, scoped.length),
      topObjects: snapshotTopRows(scoped, (row) => row.object_name ?? "unknown", (row) => row.object_name ?? "-", (row) => row.object_address).slice(0, 3),
    };
  });
}

function buildSnapshotTrend(rows: WeeklyPeriodTicket[], from: string, to: string): ReportsDailyPoint[] {
  const fromDate = atStartOfDay(new Date(`${from}T00:00:00`));
  const toDate = atEndOfDay(new Date(`${to}T00:00:00`));
  const dayCount = Math.min(31, Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1));
  const formatter = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" });
  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(fromDate, index);
    const iso = isoDate(date);
    const dayStart = atStartOfDay(date);
    const dayEnd = atEndOfDay(date);
    const inDay = rows.filter((row) => {
      const value = new Date(row.created_at_snapshot ?? row.added_at);
      return value >= dayStart && value <= dayEnd;
    });
    return { iso, label: formatter.format(date), count: inDay.length, completed: inDay.filter((row) => snapshotStatus(row) === "done").length };
  });
}

function snapshotPeriodRange(details: WeeklyPeriodDetails): ReportsPeriodRange {
  const from = details.period?.week_start ?? isoDate(new Date());
  const to = details.period?.week_end ?? from;
  return { period: "custom", from, to, label: `${details.period?.title ?? "\u0410\u0440\u0445\u0456\u0432\u043D\u0438\u0439 \u0442\u0438\u0436\u0434\u0435\u043D\u044C"} \u00B7 ${formatRangeLabel(from, to)}` };
}

function buildSnapshotReportsData(details: WeeklyPeriodDetails, periodId: string): ReportsDashboardData {
  const uniqueRows = uniqueSnapshotTickets(details.tickets);
  const periodRange = snapshotPeriodRange(details);
  const completedRows = uniqueRows.filter((row) => snapshotStatus(row) === "done");
  const unresolvedRows = uniqueRows.filter(snapshotIsUnresolved);
  const waitingRows = uniqueRows.filter((row) => snapshotStatus(row) === "waiting_admin_confirmation");
  const problematicRows = uniqueRows.filter(snapshotIsProblematic);
  const categoryTopRows = snapshotTopRows(uniqueRows, (row) => row.category_name ?? "unknown", (row) => row.category_name ?? "-").slice(0, 5);
  const objectTopRows = snapshotTopRows(problematicRows, (row) => row.object_name ?? "unknown", (row) => row.object_name ?? "-", (row) => row.object_address).slice(0, 5);
  const workerTopRows = snapshotTopRows(uniqueRows.filter((row) => row.assignee_worker_name), (row) => row.assignee_worker_name ?? "unknown", (row) => row.assignee_worker_name ?? "-").slice(0, 5);
  const completionRate = percent(completedRows.length, uniqueRows.length);
  const highUnresolved = unresolvedRows.filter((row) => snapshotPriority(row) === "critical" || snapshotPriority(row) === "high").length;
  return {
    periodRange,
    totalTickets: uniqueRows.length,
    completedTickets: completedRows.length,
    unresolvedTickets: unresolvedRows.length,
    problematicTickets: problematicRows.length,
    waitingConfirmationTickets: waitingRows.length,
    completionRate,
    topProblemObjects: objectTopRows,
    topCategories: categoryTopRows,
    topWorkers: workerTopRows,
    weeklyTrend: buildSnapshotTrend(uniqueRows, periodRange.from, periodRange.to),
    directorSummaryText: buildDirectorSummary(uniqueRows.length, completedRows.length, unresolvedRows.length, categoryTopRows[0], objectTopRows[0]),
    directorRecommendations: buildDirectorRecommendations(completionRate, problematicRows.length, unresolvedRows.length, highUnresolved),
    objectCount: new Set(uniqueRows.map((row) => row.object_name).filter(Boolean)).size,
    workerCount: new Set(uniqueRows.map((row) => row.assignee_worker_name).filter(Boolean)).size,
    categoryCount: new Set(uniqueRows.map((row) => row.category_name).filter(Boolean)).size,
    exportHref: `/reports/export?periodId=${periodId}`,
    tickets: {
      all: uniqueRows.map(snapshotTicketRow),
      completed: completedRows.map(snapshotTicketRow),
      unresolved: unresolvedRows.map(snapshotTicketRow),
      waitingConfirmation: waitingRows.map(snapshotTicketRow),
    },
    objectRows: buildSnapshotObjectRows(uniqueRows),
    workerRows: buildSnapshotWorkerRows(uniqueRows),
    categoryRows: buildSnapshotCategoryRows(uniqueRows),
  };
}

export async function getReportsDashboardData(periodParam?: string, customFrom?: string, customTo?: string, periodId?: string | null): Promise<QueryResult<ReportsDashboardData>> {
  if (periodId) {
    const snapshotResult = await getWeeklyPeriodDetails(periodId);
    return { data: buildSnapshotReportsData(snapshotResult.data, periodId), error: snapshotResult.error };
  }
  const periodRange = getReportsPeriodRange(periodParam, customFrom, customTo);
  const fromDate = atStartOfDay(new Date(`${periodRange.from}T00:00:00`));
  const toDate = atEndOfDay(new Date(`${periodRange.to}T00:00:00`));
  const [ticketsResult, objectsResult, categoriesResult, workersResult, plannedResult] = await Promise.all([
    getTickets({ limit: null }),
    getObjects(),
    getCategories(),
    getWorkers(),
    getPlannedAssignmentsForPeriod(periodRange.from, periodRange.to),
  ]);

  const tickets = ticketsResult.data;
  const createdInPeriod = tickets.filter((ticket) => ticketCreatedInRange(ticket, fromDate, toDate));
  const completedInPeriod = tickets.filter((ticket) => ticketCompletedInRange(ticket, fromDate, toDate));
  const plannedAssignments = plannedResult.data;
  const plannedTickets = hydratePlannedWorkerNames(plannedAssignments.map((assignment) => assignment.ticket), plannedAssignments);
  const periodTickets = uniqueTickets([...createdInPeriod, ...completedInPeriod, ...plannedTickets]);
  const completedTicketIds = new Set(completedInPeriod.map((ticket) => ticket.id));
  const plannedTicketIds = new Set(plannedTickets.map((ticket) => ticket.id));
  const plannedByTicket = plannedWorkerMap(plannedAssignments);
  const unresolvedInPeriod = periodTickets.filter((ticket) => (ticketCreatedInRange(ticket, fromDate, toDate) || plannedTicketIds.has(ticket.id)) && isUnresolved(ticket));
  const waitingConfirmation = periodTickets.filter((ticket) => ticket.status === "waiting_admin_confirmation" && (plannedTicketIds.has(ticket.id) || ticketCreatedInRange(ticket, fromDate, toDate) || (ticket.worker_completed_at ? new Date(ticket.worker_completed_at) >= fromDate && new Date(ticket.worker_completed_at) <= toDate : false)));
  const problematicInPeriod = periodTickets.filter((ticket) => isProblematic(ticket) || (plannedTicketIds.has(ticket.id) && isUnresolved(ticket)));
  const categoryTopRows = topCategories(periodTickets);
  const objectTopRows = topObjects(problematicInPeriod.length ? problematicInPeriod : periodTickets);
  const workerRows = buildWorkerRows(workersResult.data, periodTickets, completedTicketIds, plannedByTicket);
  const workerTopRows = workerRows.filter((row) => row.assigned > 0).slice(0, 5).map((row) => ({ id: row.id, name: row.name, count: row.assigned, completed: row.completed, unresolved: row.unresolved }));
  const completionRate = percent(completedInPeriod.length, periodTickets.length);
  const exportParams = new URLSearchParams({ from: periodRange.from, to: periodRange.to });
  const highUnresolved = unresolvedInPeriod.filter((ticket) => ticket.priority === "critical" || ticket.priority === "high").length;

  const completedRows = completedInPeriod.map(toTicketRow);
  const unresolvedRows = unresolvedInPeriod.map(toTicketRow);
  const waitingRows = waitingConfirmation.map(toTicketRow);

  return {
    data: {
      periodRange,
      totalTickets: periodTickets.length,
      completedTickets: completedInPeriod.length,
      unresolvedTickets: unresolvedInPeriod.length,
      problematicTickets: problematicInPeriod.length,
      waitingConfirmationTickets: waitingConfirmation.length,
      completionRate,
      topProblemObjects: objectTopRows,
      topCategories: categoryTopRows,
      topWorkers: workerTopRows,
      weeklyTrend: buildTrend(periodTickets, fromDate, toDate),
      directorSummaryText: buildDirectorSummary(periodTickets.length, completedInPeriod.length, unresolvedInPeriod.length, categoryTopRows[0], objectTopRows[0]),
      directorRecommendations: buildDirectorRecommendations(completionRate, problematicInPeriod.length, unresolvedInPeriod.length, highUnresolved),
      objectCount: objectsResult.data.length,
      workerCount: workersResult.data.length,
      categoryCount: categoriesResult.data.length,
      exportHref: `/reports/export?${exportParams.toString()}`,
      tickets: {
        all: periodTickets.map(toTicketRow),
        completed: completedRows,
        unresolved: unresolvedRows,
        waitingConfirmation: waitingRows,
      },
      objectRows: buildObjectRows(objectsResult.data, periodTickets, completedTicketIds),
      workerRows,
      categoryRows: buildCategoryRows(categoriesResult.data, periodTickets, completedTicketIds),
    },
    error: ticketsResult.error ?? objectsResult.error ?? categoriesResult.error ?? workersResult.error ?? plannedResult.error,
  };
}