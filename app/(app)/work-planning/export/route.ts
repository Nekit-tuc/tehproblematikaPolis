import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { getWorkWeekLabel, getWorkWeekRange, type WorkWeekRange } from "@/lib/date/work-week";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { getWorkPlanItemsForPlans, getWorkPlans, type WorkPlan, type WorkPlanItem } from "@/lib/supabase/work-plans";
import type { TicketPriority, TicketStatus } from "@/types/domain";

export const runtime = "nodejs";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function cleanText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function ticketStatusLabel(status?: string | null) {
  if (!status) return "";
  return statusLabels[status as TicketStatus] ?? status;
}

function ticketPriorityLabel(priority?: string | null) {
  if (!priority) return "Не вказано";
  return priorityLabels[priority as TicketPriority] ?? priority;
}

function filename(week: { startDate: string; endDate: string }) {
  return `work-plans-${week.startDate}-${week.endDate}.xlsx`;
}

type WeeklyPlanRows = Array<{ plan: WorkPlan; items: WorkPlanItem[] }>;

async function buildWorkbook(week: WorkWeekRange, rowsByPlan: WeeklyPlanRows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Service Desk AI";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Weekly Plans", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  worksheet.columns = [
    { key: "plan", width: 28 },
    { key: "index", width: 6 },
    { key: "ticketNumber", width: 16 },
    { key: "date", width: 14 },
    { key: "address", width: 30 },
    { key: "description", width: 58 },
    { key: "workerName", width: 24 },
    { key: "status", width: 22 },
    { key: "priority", width: 16 },
  ];

  worksheet.mergeCells("A1:I1");
  worksheet.mergeCells("A2:I2");
  worksheet.mergeCells("A3:I3");
  worksheet.mergeCells("A4:I4");
  worksheet.getCell("A1").value = "POLISSYA SERVICE DESK AI";
  worksheet.getCell("A1").font = { bold: true, size: 12, color: { argb: "FFF97316" } };
  worksheet.getCell("A2").value = "Плани робіт за тиждень";
  worksheet.getCell("A2").font = { bold: true, size: 20, color: { argb: "FF111827" } };
  worksheet.getCell("A3").value = `Період: ${getWorkWeekLabel(week.start, week.end)}`;
  worksheet.getCell("A4").value = `Сформовано: ${formatDateTime(new Date())}`;
  for (const rowNumber of [1, 2, 3, 4]) {
    worksheet.getRow(rowNumber).alignment = { vertical: "middle", horizontal: "left" };
  }
  for (const rowNumber of [3, 4]) worksheet.getRow(rowNumber).font = { size: 10, color: { argb: "FF6B7280" } };

  const header = ["План", "№", "Номер заявки", "Дата", "Адреса", "Опис роботи", "Виконавець", "Статус", "Пріоритет"];
  worksheet.getRow(6).values = header;
  worksheet.getRow(6).height = 28;
  worksheet.getRow(6).eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });

  let index = 1;
  for (const { plan, items } of rowsByPlan) {
    if (items.length === 0) {
      const row = worksheet.addRow([plan.title, "", "", "", "", "", cleanText(plan.worker_name) || "Не призначено", plan.status, ""]);
      row.eachCell((cell) => {
        cell.font = { size: 10, color: { argb: "FF6B7280" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
        cell.border = thinBorder;
      });
      continue;
    }

    const uniqueItems = Array.from(new Map(items.map((item) => [item.ticket_id || item.id, item])).values())
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    for (const item of uniqueItems) {
      const ticket = item.ticket;
      const row = worksheet.addRow([
        plan.title,
        index,
        ticket?.number ?? "Без номера",
        formatDate(ticket?.created_at),
        cleanText(ticket?.object?.address || ticket?.object?.name) || "Без адреси",
        cleanText(ticket?.title || ticket?.description) || "Без опису",
        cleanText(item.worker?.name || plan.worker_name) || "Не призначено",
        ticketStatusLabel(ticket?.status),
        ticketPriorityLabel(ticket?.priority),
      ]);
      row.height = Math.min(58, Math.max(32, Math.ceil(String(row.getCell(6).value ?? "").length / 70) * 16));
      row.eachCell((cell, columnNumber) => {
        cell.font = { size: 10, color: { argb: "FF111827" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? "FFF9FAFB" : "FFFFFFFF" } };
        cell.alignment = { vertical: "top", horizontal: columnNumber === 2 ? "center" : "left", wrapText: columnNumber === 1 || columnNumber === 5 || columnNumber === 6 };
        cell.border = thinBorder;
      });
      index += 1;
    }
  }

  const lastRow = Math.max(6, worksheet.rowCount);
  worksheet.autoFilter = { from: "A6", to: `I${lastRow}` };
  return workbook;
}

export async function GET(request: NextRequest) {
  await requireRole(["admin", "management", "tech_manager"]);
  const url = new URL(request.url);
  const weekParam = url.searchParams.get("week");
  const week = getWorkWeekRange(weekParam ? new Date(`${weekParam}T17:00:00`) : new Date());

  const plansResult = await getWorkPlans({ from: week.startIso, to: week.endIso, limit: 300 });
  if (plansResult.error) return NextResponse.json({ error: plansResult.error }, { status: 500 });
  if (plansResult.data.length === 0) return NextResponse.json({ error: "На цей тиждень планів не знайдено." }, { status: 404 });

  const itemsResult = await getWorkPlanItemsForPlans(plansResult.data.map((plan) => plan.id));
  if (itemsResult.error) return NextResponse.json({ error: itemsResult.error }, { status: 500 });

  const itemsByPlanId = new Map<string, WorkPlanItem[]>();
  for (const item of itemsResult.data) {
    const items = itemsByPlanId.get(item.work_plan_id) ?? [];
    items.push(item);
    itemsByPlanId.set(item.work_plan_id, items);
  }

  const workbook = await buildWorkbook(week, plansResult.data.map((plan) => ({ plan, items: itemsByPlanId.get(plan.id) ?? [] })));
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename(week)}"`,
      "Cache-Control": "no-store",
    },
  });
}
