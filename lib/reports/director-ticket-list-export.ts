import type ExcelJS from "exceljs";
import { createReportWorkbook, setupWorksheet } from "@/lib/reports/excel";
import type { DirectorTicketReportRow } from "@/lib/supabase/director-ticket-reports";

const ticketColumns = [
  { header: "№", width: 6 },
  { header: "Номер заявки", width: 18 },
  { header: "Дата створення", width: 18 },
  { header: "Дата виконання", width: 18 },
  { header: "Магазин", width: 26 },
  { header: "Адреса", width: 34 },
  { header: "Категорія", width: 22 },
  { header: "Виконавець", width: 22 },
  { header: "Статус для директора", width: 26 },
  { header: "Опис", width: 48 },
  { header: "Акт", width: 18 },
];

function formatDateTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function styleHeader(worksheet: ExcelJS.Worksheet, columnCount: number, title: string, subtitle: string) {
  worksheet.insertRow(1, [title]);
  worksheet.insertRow(2, [subtitle]);
  worksheet.insertRow(3, []);
  worksheet.mergeCells(1, 1, 1, columnCount);
  worksheet.mergeCells(2, 1, 2, columnCount);
  worksheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF111827" } };
  worksheet.getRow(2).font = { size: 10, color: { argb: "FF6B7280" } };
}

export function buildDirectorTicketsWorkbook(tickets: DirectorTicketReportRow[], periodLabel: string) {
  const workbook = createReportWorkbook();
  const worksheet = workbook.addWorksheet("Director Tickets");
  setupWorksheet(worksheet, ticketColumns);

  for (const [index, ticket] of tickets.entries()) {
    worksheet.addRow([
      index + 1,
      ticket.number,
      formatDateTime(ticket.created_at),
      formatDateTime(ticket.completed_at ?? ticket.worker_completed_at),
      ticket.object?.name ?? "",
      ticket.object?.address ?? "",
      ticket.category?.name ?? "",
      ticket.worker?.name ?? "",
      ticket.displayStatus,
      ticket.description || ticket.title,
      ticket.workCompletionAct?.act_number ?? "Немає",
    ]);
  }

  styleHeader(worksheet, ticketColumns.length, "Заявки директора", `Період: ${periodLabel} · Кількість: ${tickets.length}`);

  worksheet.eachRow((row, rowIndex) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: rowIndex <= 3 ? "middle" : "top", wrapText: true };
      if (rowIndex === 4) {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
      }
      if (rowIndex > 3) {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
      }
    });
  });

  return workbook;
}
