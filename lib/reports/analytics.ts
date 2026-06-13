import * as XLSX from "xlsx";
import { objectTypeLabels, priorityLabels, statusLabels } from "@/lib/labels";
import type { Category, CompanyObject, Profile, TicketPriority, TicketStatus, TicketWithRelations } from "@/types/domain";

export interface ReportFilters {
  from?: string;
  to?: string;
  status?: TicketStatus | "";
  categoryId?: string;
  objectId?: string;
  assigneeId?: string;
  priority?: TicketPriority | "";
}

function toDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function daysBetween(start?: string | null, end?: string | null) {
  const startDate = toDate(start);
  if (!startDate) return "";
  const endDate = toDate(end) ?? new Date();
  return Math.max(0, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000));
}

function isOverdue(ticket: TicketWithRelations) {
  const dueAt = toDate(ticket.due_at);
  if (!dueAt || ticket.status === "done" || ticket.status === "cancelled") return false;
  return dueAt.getTime() < Date.now();
}

export function filterTickets(tickets: TicketWithRelations[], filters: ReportFilters) {
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59`) : null;

  return tickets.filter((ticket) => {
    const createdAt = new Date(ticket.created_at);
    if (from && createdAt < from) return false;
    if (to && createdAt > to) return false;
    if (filters.status && ticket.status !== filters.status) return false;
    if (filters.categoryId && ticket.category_id !== filters.categoryId) return false;
    if (filters.objectId && ticket.object_id !== filters.objectId) return false;
    if (filters.assigneeId && ticket.assigned_to !== filters.assigneeId) return false;
    if (filters.priority && ticket.priority !== filters.priority) return false;
    return true;
  });
}

export function buildTicketRows(tickets: TicketWithRelations[]) {
  return tickets.map((ticket) => ({
    "№ заявки": ticket.number,
    "Дата створення": toDate(ticket.created_at),
    "Об'єкт": ticket.object?.name ?? "",
    "Адреса": ticket.object?.address ?? "",
    "Категорія": ticket.category?.name ?? "",
    "Опис": ticket.description,
    "Статус": statusLabels[ticket.status],
    "Пріоритет": priorityLabels[ticket.priority],
    "Виконавець": ticket.assignee?.full_name ?? "Не призначено",
    "Дедлайн": toDate(ticket.due_at),
    "Дата виконання": toDate(ticket.completed_at),
    "Дата закриття": ticket.status === "done" || ticket.status === "cancelled" ? toDate(ticket.completed_at ?? ticket.updated_at) : null,
    "Днів у роботі": daysBetween(ticket.created_at, ticket.completed_at),
  }));
}

export function buildObjectRows(tickets: TicketWithRelations[], objects: CompanyObject[]) {
  return objects.map((object) => {
    const scoped = tickets.filter((ticket) => ticket.object_id === object.id);
    return {
      "Об'єкт": object.name,
      "Тип об'єкта": objectTypeLabels[object.type],
      "Всього заявок": scoped.length,
      "Нові": scoped.filter((ticket) => ticket.status === "new").length,
      "В роботі": scoped.filter((ticket) => ticket.status === "in_progress" || ticket.status === "waiting").length,
      "Виконано": scoped.filter((ticket) => ticket.status === "done").length,
      "Закрито": scoped.filter((ticket) => ticket.status === "done" || ticket.status === "cancelled").length,
      "Прострочено": scoped.filter(isOverdue).length,
    };
  });
}

export function buildWorkerRows(tickets: TicketWithRelations[], profiles: Profile[]) {
  const workers = profiles.filter((profile) => profile.role === "worker" || tickets.some((ticket) => ticket.assigned_to === profile.id));
  return workers.map((worker) => {
    const scoped = tickets.filter((ticket) => ticket.assigned_to === worker.id);
    const done = scoped.filter((ticket) => ticket.completed_at);
    const avgDays = done.length ? done.reduce((sum, ticket) => sum + Number(daysBetween(ticket.created_at, ticket.completed_at) || 0), 0) / done.length : 0;
    return {
      "Виконавець": worker.full_name,
      "Всього призначено": scoped.length,
      "В роботі": scoped.filter((ticket) => ticket.status === "in_progress" || ticket.status === "waiting").length,
      "Виконано": scoped.filter((ticket) => ticket.status === "done").length,
      "Прострочено": scoped.filter(isOverdue).length,
      "Середній час виконання": Number(avgDays.toFixed(1)),
    };
  });
}

export function buildCategoryRows(tickets: TicketWithRelations[], categories: Category[]) {
  const total = tickets.length || 1;
  return categories.map((category) => {
    const scoped = tickets.filter((ticket) => ticket.category_id === category.id);
    const done = scoped.filter((ticket) => ticket.completed_at);
    const avgDays = done.length ? done.reduce((sum, ticket) => sum + Number(daysBetween(ticket.created_at, ticket.completed_at) || 0), 0) / done.length : 0;
    return {
      "Категорія": category.name,
      "Кількість заявок": scoped.length,
      "Відсоток від загальної кількості": `${((scoped.length / total) * 100).toFixed(1)}%`,
      "Середній час виконання": Number(avgDays.toFixed(1)),
    };
  });
}

function addSheet(workbook: XLSX.WorkBook, name: string, rows: Record<string, unknown>[], widths: number[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1:A1");
  for (let column = range.s.c; column <= range.e.c; column++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = { font: { bold: true } };
  }
  for (const address of Object.keys(worksheet)) {
    const cell = worksheet[address];
    if (cell && cell.t === "d") cell.z = "dd.mm.yyyy";
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

export function buildReportsWorkbook({
  tickets,
  objects,
  profiles,
  categories,
}: {
  tickets: TicketWithRelations[];
  objects: CompanyObject[];
  profiles: Profile[];
  categories: Category[];
}) {
  const workbook = XLSX.utils.book_new();
  addSheet(workbook, "Заявки", buildTicketRows(tickets), [14, 14, 24, 32, 22, 44, 16, 14, 24, 14, 16, 16, 14]);
  addSheet(workbook, "По об'єктах", buildObjectRows(tickets, objects), [26, 18, 14, 10, 12, 12, 12, 14]);
  addSheet(workbook, "По виконавцях", buildWorkerRows(tickets, profiles), [26, 18, 12, 12, 14, 22]);
  addSheet(workbook, "По категоріях", buildCategoryRows(tickets, categories), [28, 18, 28, 22]);
  return workbook;
}
