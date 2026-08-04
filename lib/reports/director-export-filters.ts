import { resolveActDateRange, type ActFilters, type ActPeriod } from "@/lib/supabase/work-completion-acts";
import type { DirectorTicketReportFilters } from "@/lib/supabase/director-ticket-reports";
import type { TicketStatus } from "@/types/domain";

const ticketStatuses: Array<TicketStatus | "all"> = [
  "all",
  "pending_review",
  "new",
  "assigned",
  "in_progress",
  "waiting",
  "waiting_admin_confirmation",
  "done",
  "cancelled",
  "rejected",
];

const actPeriods: ActPeriod[] = ["this_week", "previous_week", "current_month", "custom"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function date(value: string | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value : undefined;
}

function option(value: string | undefined) {
  return value && value !== "all" ? value : undefined;
}

export function parseActFilters(searchParams: Record<string, string | string[] | undefined>, defaultPeriod: ActPeriod): ActFilters {
  const rawPeriod = first(searchParams.period);
  const period = rawPeriod && actPeriods.includes(rawPeriod as ActPeriod) ? (rawPeriod as ActPeriod) : defaultPeriod;
  return {
    period,
    objectId: option(first(searchParams.object)),
    categoryId: option(first(searchParams.category)),
    workerId: option(first(searchParams.worker)),
    directorId: option(first(searchParams.director)),
    ticketStatus: ticketStatuses.includes(first(searchParams.status) as TicketStatus) ? (first(searchParams.status) as TicketStatus | "all") : undefined,
    completedFrom: date(first(searchParams.completedFrom)),
    completedTo: date(first(searchParams.completedTo)),
    confirmedFrom: date(first(searchParams.confirmedFrom)),
    confirmedTo: date(first(searchParams.confirmedTo)),
    createdFrom: date(first(searchParams.createdFrom)),
    createdTo: date(first(searchParams.createdTo)),
  };
}

export function parseDirectorTicketFilters(searchParams: Record<string, string | string[] | undefined>): DirectorTicketReportFilters {
  const status = first(searchParams.status);
  return {
    objectId: option(first(searchParams.object)),
    categoryId: option(first(searchParams.category)),
    workerId: option(first(searchParams.worker)),
    status: ticketStatuses.includes(status as TicketStatus) ? (status as TicketStatus | "all") : undefined,
    createdFrom: date(first(searchParams.createdFrom)),
    createdTo: date(first(searchParams.createdTo)),
    completedFrom: date(first(searchParams.completedFrom)),
    completedTo: date(first(searchParams.completedTo)),
  };
}

export function queryStringFromFilters(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== "all") params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function actPeriodLabel(filters: ActFilters, defaultPeriod: ActPeriod) {
  const range = resolveActDateRange(filters, defaultPeriod);
  return `${range.fromDate} - ${range.toDate}`;
}

export function ticketPeriodLabel(filters: DirectorTicketReportFilters) {
  if (filters.createdFrom || filters.createdTo) return `${filters.createdFrom ?? "початок"} - ${filters.createdTo ?? "сьогодні"}`;
  if (filters.completedFrom || filters.completedTo) return `${filters.completedFrom ?? "початок"} - ${filters.completedTo ?? "сьогодні"}`;
  return "усі доступні дати";
}
