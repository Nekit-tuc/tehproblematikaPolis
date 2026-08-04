import { createReportWorkbook, setupWorksheet } from "@/lib/reports/excel";
import type ExcelJS from "exceljs";
import type { WorkCompletionActWithRelations } from "@/types/domain";

const actColumns = [
  { header: "№", width: 6 },
  { header: "Номер акту", width: 18 },
  { header: "Номер заявки", width: 18 },
  { header: "Дата виконання", width: 18 },
  { header: "Дата підтвердження", width: 20 },
  { header: "Магазин", width: 26 },
  { header: "Адреса", width: 34 },
  { header: "Директор", width: 24 },
  { header: "Телефон директора", width: 20 },
  { header: "Категорія", width: 22 },
  { header: "Виконавець", width: 22 },
  { header: "Опис роботи", width: 44 },
  { header: "Коментар директора", width: 36 },
  { header: "Статус заявки", width: 18 },
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

export function buildActsListWorkbook(acts: WorkCompletionActWithRelations[], scope: "director" | "admin", periodLabel: string) {
  const workbook = createReportWorkbook();
  const worksheet = workbook.addWorksheet("Work Completion Acts");
  setupWorksheet(worksheet, actColumns);

  for (const [index, act] of acts.entries()) {
    worksheet.addRow([
      index + 1,
      act.act_number,
      act.ticket?.number ?? "",
      formatDateTime(act.completed_at),
      formatDateTime(act.confirmed_at),
      act.object?.name ?? "",
      act.object?.address ?? "",
      act.director?.full_name ?? "",
      act.ticket?.director_phone ?? act.director?.phone ?? "",
      act.ticket?.category?.name ?? "",
      act.worker?.name ?? "",
      act.work_description,
      act.director_comment ?? "",
      act.ticket?.status ?? "",
    ]);
  }

  styleHeader(
    worksheet,
    actColumns.length,
    "Акти виконаних робіт",
    `${scope === "director" ? "Кабінет директора" : "Адмінський звіт"} · Період: ${periodLabel} · Кількість: ${acts.length}`,
  );

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

export function safeExportPart(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}
