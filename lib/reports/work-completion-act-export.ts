import ExcelJS from "exceljs";
import { measureAsync } from "@/lib/performance";
import { getWorkCompletionActForTicket } from "@/lib/supabase/work-completion-acts";
import { formatDate } from "@/lib/utils";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

function value(value?: string | number | null) {
  return value ?? "";
}

function addRow(worksheet: ExcelJS.Worksheet, label: string, data: string | number | null | undefined) {
  const row = worksheet.addRow([label, value(data)]);
  row.eachCell((cell, index) => {
    cell.border = thinBorder;
    cell.alignment = { vertical: "top", wrapText: true };
    cell.font = { size: 11, bold: index === 1, color: { argb: "FF111827" } };
    if (index === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
  });
}

export function safeActFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

export async function buildWorkCompletionActWorkbook(ticketId: string) {
  return measureAsync("work-act:export", async () => {
    const actResult = await getWorkCompletionActForTicket(ticketId);
    if (actResult.error) return { workbook: null, actNumber: "", error: actResult.error, status: 500 };
    const act = actResult.data;
    if (!act) return { workbook: null, actNumber: "", error: "Акт виконаних робіт не знайдено.", status: 404 };

    const ticket = act.ticket;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Polissya Service Desk AI";
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet("Work Completion Act", {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: {
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
    });

    worksheet.columns = [
      { key: "label", width: 32 },
      { key: "value", width: 72 },
    ];

    worksheet.mergeCells("A1:B1");
    worksheet.getCell("A1").value = "Акт виконаних робіт";
    worksheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF111827" } };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };

    worksheet.mergeCells("A2:B2");
    worksheet.getCell("A2").value = `Сформовано: ${formatDate(new Date().toISOString())}`;
    worksheet.getCell("A2").font = { size: 10, color: { argb: "FF6B7280" } };
    worksheet.addRow([]);

    addRow(worksheet, "Номер акту", act.act_number);
    addRow(worksheet, "Номер заявки", ticket?.number);
    addRow(worksheet, "Дата виконання", formatDate(act.completed_at));
    addRow(worksheet, "Дата підтвердження директором", formatDate(act.confirmed_at));
    addRow(worksheet, "Магазин / об'єкт", act.object?.name);
    addRow(worksheet, "Адреса", act.object?.address);
    addRow(worksheet, "Директор", act.director?.full_name);
    addRow(worksheet, "Телефон директора", ticket?.director_phone ?? act.director?.phone);
    addRow(worksheet, "Категорія", ticket?.category?.name);
    addRow(worksheet, "Виконавець", act.worker?.name);
    addRow(worksheet, "Опис роботи", act.work_description);
    addRow(worksheet, "Коментар директора", act.director_comment);
    addRow(worksheet, "Статус заявки", ticket?.status);
    addRow(worksheet, "Фото до акту", act.photos && act.photos.length > 0 ? `${act.photos.length} фото: ${act.photos.map((photo) => photo.file_name || photo.storage_path).join(", ")}` : "Немає");

    worksheet.eachRow((row) => {
      row.height = Math.max(row.height ?? 18, 22);
    });

    return { workbook, actNumber: act.act_number, error: null, status: 200 };
  });
}
