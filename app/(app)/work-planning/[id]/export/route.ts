import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { getWorkPlanById, getWorkPlanItems, type WorkPlan, type WorkPlanItem } from "@/lib/supabase/work-plans";
import type { TicketPriority, TicketStatus } from "@/types/domain";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

type ExportRow = {
  item: WorkPlanItem;
  index: number;
  ticketNumber: string;
  date: string;
  address: string;
  description: string;
  workerName: string;
  status: string;
  priority: string;
};

const priorityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

function filename(plan: Pick<WorkPlan, "period_start" | "period_end">) {
  return `work-plan-${plan.period_start}-${plan.period_end}.xlsx`;
}

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

function rowPriorityWeight(row: WorkPlanItem) {
  return priorityOrder[row.ticket?.priority ?? ""] ?? 9;
}

function prepareRows(items: WorkPlanItem[]): ExportRow[] {
  const unique = new Map<string, WorkPlanItem>();
  for (const item of items) {
    const key = item.ticket_id || item.id;
    const existing = unique.get(key);
    if (!existing || item.sort_order < existing.sort_order) unique.set(key, item);
  }

  return Array.from(unique.values())
    .sort((a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (a.worker?.name ?? "").localeCompare(b.worker?.name ?? "", "uk-UA") ||
      rowPriorityWeight(a) - rowPriorityWeight(b) ||
      (a.ticket?.object?.address ?? "").localeCompare(b.ticket?.object?.address ?? "", "uk-UA") ||
      (a.ticket?.number ?? "").localeCompare(b.ticket?.number ?? "", "uk-UA"),
    )
    .map((item, index) => {
      const ticket = item.ticket;
      return {
        item,
        index: index + 1,
        ticketNumber: ticket?.number ?? "Без номера",
        date: formatDate(ticket?.created_at),
        address: cleanText(ticket?.object?.address || ticket?.object?.name) || "Без адреси",
        description: cleanText(ticket?.title || ticket?.description) || "Без опису",
        workerName: cleanText(item.worker?.name) || "Не призначено",
        status: ticketStatusLabel(ticket?.status),
        priority: ticketPriorityLabel(ticket?.priority),
      };
    });
}

function applyStatusStyle(cell: ExcelJS.Cell, status: string) {
  if (status === statusLabels.done) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F7ED" } };
    cell.font = { color: { argb: "FF166534" }, bold: true, size: 10 };
    return;
  }
  if (status === statusLabels.waiting_admin_confirmation) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3D6" } };
    cell.font = { color: { argb: "FF92400E" }, bold: true, size: 10 };
    return;
  }
  if (status === statusLabels.assigned || status === statusLabels.in_progress) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    cell.font = { color: { argb: "FF1D4ED8" }, bold: true, size: 10 };
    return;
  }
  if (status === statusLabels.rejected || status === statusLabels.cancelled) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    cell.font = { color: { argb: "FF991B1B" }, bold: true, size: 10 };
  }
}

function applyPriorityStyle(cell: ExcelJS.Cell, priority: string) {
  if (priority === priorityLabels.critical || priority === priorityLabels.high) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEDD5" } };
    cell.font = { color: { argb: "FFC2410C" }, bold: true, size: 10 };
    return;
  }
  if (priority === priorityLabels.medium) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    cell.font = { color: { argb: "FF92400E" }, bold: true, size: 10 };
    return;
  }
  if (priority === priorityLabels.low) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F7ED" } };
    cell.font = { color: { argb: "FF166534" }, bold: true, size: 10 };
  }
}

async function buildWorkbook(plan: WorkPlan, items: WorkPlanItem[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Service Desk AI";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Work Plan", {
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
    { key: "index", width: 6 },
    { key: "ticketNumber", width: 16 },
    { key: "date", width: 14 },
    { key: "address", width: 28 },
    { key: "description", width: 58 },
    { key: "workerName", width: 24 },
    { key: "status", width: 22 },
    { key: "priority", width: 16 },
  ];

  worksheet.mergeCells("A1:H1");
  worksheet.mergeCells("A2:H2");
  worksheet.mergeCells("A3:H3");
  worksheet.mergeCells("A4:H4");

  worksheet.getCell("A1").value = "POLISSYA SERVICE DESK AI";
  worksheet.getCell("A1").font = { bold: true, size: 12, color: { argb: "FFF97316" } };
  worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };

  worksheet.getCell("A2").value = "План робіт";
  worksheet.getCell("A2").font = { bold: true, size: 20, color: { argb: "FF111827" } };
  worksheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left" };

  worksheet.getCell("A3").value = `Період: ${formatDate(plan.period_start)} - ${formatDate(plan.period_end)}`;
  worksheet.getCell("A4").value = `Назва плану: ${plan.title}`;
  for (const rowNumber of [3, 4]) {
    worksheet.getRow(rowNumber).font = { size: 10, color: { argb: "FF6B7280" } };
    worksheet.getRow(rowNumber).alignment = { vertical: "middle", horizontal: "left" };
  }
  worksheet.getRow(1).height = 20;
  worksheet.getRow(2).height = 28;
  worksheet.getRow(3).height = 18;
  worksheet.getRow(4).height = 18;

  const header = ["№", "Номер заявки", "Дата", "Адреса", "Опис роботи", "Виконавець", "Статус", "Пріоритет"];
  worksheet.getRow(6).values = header;
  worksheet.getRow(6).height = 28;
  worksheet.getRow(6).eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });

  const rows = prepareRows(items);
  for (const row of rows) {
    const excelRow = worksheet.addRow([row.index, row.ticketNumber, row.date, row.address, row.description, row.workerName, row.status, row.priority]);
    excelRow.height = Math.min(58, Math.max(32, Math.ceil(row.description.length / 70) * 16));
    const fill = row.index % 2 === 0 ? "FFF9FAFB" : "FFFFFFFF";
    excelRow.eachCell((cell, columnNumber) => {
      cell.font = { size: 10, color: { argb: "FF111827" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.alignment = { vertical: "top", horizontal: columnNumber === 1 ? "center" : "left", wrapText: columnNumber === 4 || columnNumber === 5 };
      cell.border = thinBorder;
    });
    applyStatusStyle(excelRow.getCell(7), row.status);
    applyPriorityStyle(excelRow.getCell(8), row.priority);
  }

  const lastTableRow = Math.max(6, worksheet.rowCount);
  worksheet.autoFilter = { from: "A6", to: `H${lastTableRow}` };

  const summaryStart = lastTableRow + 2;
  const workersCount = new Set(rows.map((row) => row.workerName).filter((name) => name && name !== "Не призначено")).size;
  const generatedAt = new Date();
  const summaryRows = [
    [`Всього заявок: ${rows.length}`],
    [`Виконавців: ${workersCount}`],
    [`Сформовано: ${formatDateTime(generatedAt)}`],
    ["Service Desk AI"],
  ];
  summaryRows.forEach((value, index) => {
    const row = worksheet.getRow(summaryStart + index);
    row.values = value;
    row.font = { size: 10, color: { argb: index === 3 ? "FFF97316" : "FF374151" }, bold: index === 0 || index === 3 };
  });

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.protection = { locked: false };
    });
  });

  return workbook;
}

export async function GET(_request: Request, { params }: RouteProps) {
  await requireRole(["admin", "management", "tech_manager"]);
  const { id } = await params;
  const [planResult, itemsResult] = await Promise.all([
    getWorkPlanById(id),
    getWorkPlanItems(id),
  ]);

  if (planResult.error || itemsResult.error) {
    return NextResponse.json({ error: planResult.error ?? itemsResult.error }, { status: 500 });
  }
  if (!planResult.data) {
    return NextResponse.json({ error: "План не знайдено." }, { status: 404 });
  }

  const workbook = await buildWorkbook(planResult.data, itemsResult.data);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename(planResult.data)}"`,
      "Cache-Control": "no-store",
    },
  });
}
