import type { TicketPriority, TicketStatus, TicketWithRelations } from "@/types/domain";

export type TicketReportRow = {
  index: number;
  ticketId: string;
  number: string;
  date: string;
  createdAt: string;
  address: string;
  description: string;
  workerName: string;
  status: string;
  rawStatus: TicketStatus;
  priority: string;
  rawPriority: TicketPriority;
};

export type TicketReportSummary = {
  total: number;
  completed: number;
  unresolved: number;
  waitingConfirmation: number;
  highPriority: number;
};

const statusMap: Record<TicketStatus, string> = {
  pending_review: "На AI-перевірці",
  new: "Нова",
  assigned: "Призначена",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "На підтвердженні",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

const priorityMap: Record<TicketPriority, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

const priorityOrder: Record<TicketPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function formatDateDDMMYYYY(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

export function formatDateTimeDDMMYYYYHHMM(value: Date) {
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}

export function mapTicketStatus(status?: TicketStatus | string | null) {
  if (!status) return "";
  return statusMap[status as TicketStatus] ?? status;
}

export function mapPriority(priority?: TicketPriority | string | null) {
  if (!priority) return "Не вказано";
  return priorityMap[priority as TicketPriority] ?? priority;
}

export function cleanTicketReportText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function getTicketReportRows(tickets: TicketWithRelations[]) {
  return [...tickets]
    .sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
      (a.object?.address ?? a.object?.name ?? "").localeCompare(b.object?.address ?? b.object?.name ?? "", "uk-UA") ||
      (a.number ?? "").localeCompare(b.number ?? "", "uk-UA"),
    )
    .map<TicketReportRow>((ticket, index) => ({
      index: index + 1,
      ticketId: ticket.id,
      number: ticket.number ?? "Без номера",
      date: formatDateDDMMYYYY(ticket.created_at),
      createdAt: ticket.created_at,
      address: cleanTicketReportText(ticket.object?.address || ticket.object?.name) || "Без адреси",
      description: cleanTicketReportText(ticket.title || ticket.description) || "Без опису",
      workerName: cleanTicketReportText(ticket.worker?.name || ticket.assignee?.full_name) || "Не призначено",
      status: mapTicketStatus(ticket.status),
      rawStatus: ticket.status,
      priority: mapPriority(ticket.priority),
      rawPriority: ticket.priority,
    }));
}

export function getTicketReportSummary(rows: TicketReportRow[]): TicketReportSummary {
  return {
    total: rows.length,
    completed: rows.filter((row) => row.rawStatus === "done").length,
    unresolved: rows.filter((row) => !["done", "cancelled", "rejected"].includes(row.rawStatus)).length,
    waitingConfirmation: rows.filter((row) => row.rawStatus === "waiting_admin_confirmation").length,
    highPriority: rows.filter((row) => row.rawPriority === "high" || row.rawPriority === "critical").length,
  };
}
