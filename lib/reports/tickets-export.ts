import * as XLSX from "xlsx";
import { priorityLabels, statusLabels } from "@/lib/labels";
import type { TicketWithRelations } from "@/types/domain";

export function buildTicketsWorkbook(tickets: TicketWithRelations[]) {
  const rows = tickets.map((ticket) => ({
    "Номер": ticket.number,
    "Назва": ticket.title,
    "Статус": statusLabels[ticket.status],
    "Пріоритет": priorityLabels[ticket.priority],
    "Категорія": ticket.category?.name ?? "",
    "Об'єкт": ticket.object?.name ?? "",
    "Виконавець": ticket.assignee?.full_name ?? "Не призначено",
    "Створено": ticket.created_at,
    "Термін": ticket.due_at ?? "",
  }));
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Заявки");
  return workbook;
}
