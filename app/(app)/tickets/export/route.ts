import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { getPreviousWorkWeekRange, getWorkWeekLabel, getWorkWeekRange } from "@/lib/date/work-week";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYYHHMM, getTicketReportRows, getTicketReportSummary, type TicketReportRow } from "@/lib/reports/ticket-report-format";
import { getTicketsForPrint } from "@/lib/supabase/queries";

export const runtime = "nodejs";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

function isDateParam(value?: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function periodFromRequest(request: Request) {
  const url = new URL(request.url);
  const currentWorkWeek = getWorkWeekRange();
  const previousWorkWeek = getPreviousWorkWeekRange();
  const period = url.searchParams.get("period");
  const activePeriod: "this_week" | "previous_week" | undefined = period === "this_week" || period === "previous_week" ? period : undefined;
  const activeWorkWeek = activePeriod === "previous_week" ? previousWorkWeek : currentWorkWeek;
  const explicitFrom = url.searchParams.get("from");
  const explicitTo = url.searchParams.get("to");
  const hasExplicitPeriod = !activePeriod && isDateParam(explicitFrom) && isDateParam(explicitTo);
  return {
    period: activePeriod,
    from: activePeriod ? activeWorkWeek.startDate : isDateParam(explicitFrom) ? explicitFrom! : currentWorkWeek.startDate,
    to: activePeriod ? activeWorkWeek.endDate : isDateParam(explicitTo) ? explicitTo! : currentWorkWeek.endDate,
    label: activePeriod ? getWorkWeekLabel(activeWorkWeek.start, activeWorkWeek.end) : "",
    hasExplicitPeriod,
    status: url.searchParams.get("status") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    worker: url.searchParams.get("worker") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    hideDone: url.searchParams.get("status") === "done" ? false : url.searchParams.get("hideDone") !== "false",
  };
}

function filename(from: string, to: string, hasExplicitPeriod: boolean) {
  return hasExplicitPeriod ? `tickets-${from}-${to}.xlsx` : "tickets-current-week.xlsx";
}

function applyStatusStyle(cell: ExcelJS.Cell, row: TicketReportRow) {
  if (row.rawStatus === "done") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F7ED" } };
    cell.font = { color: { argb: "FF166534" }, bold: true, size: 10 };
    return;
  }
  if (row.rawStatus === "waiting_admin_confirmation") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3D6" } };
    cell.font = { color: { argb: "FF92400E" }, bold: true, size: 10 };
    return;
  }
  if (row.rawStatus === "pending_review") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    cell.font = { color: { argb: "FF1D4ED8" }, bold: true, size: 10 };
    return;
  }
  if (row.rawStatus === "assigned" || row.rawStatus === "in_progress") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    cell.font = { color: { argb: "FF374151" }, bold: true, size: 10 };
    return;
  }
  if (row.rawStatus === "rejected" || row.rawStatus === "cancelled") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    cell.font = { color: { argb: "FF991B1B" }, bold: true, size: 10 };
  }
}

function applyPriorityStyle(cell: ExcelJS.Cell, row: TicketReportRow) {
  if (row.rawPriority === "critical" || row.rawPriority === "high") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEDD5" } };
    cell.font = { color: { argb: "FFC2410C" }, bold: true, size: 10 };
    return;
  }
  if (row.rawPriority === "medium") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    cell.font = { color: { argb: "FF92400E" }, bold: true, size: 10 };
    return;
  }
  if (row.rawPriority === "low") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F7ED" } };
    cell.font = { color: { argb: "FF166534" }, bold: true, size: 10 };
  }
}

async function buildWorkbook(rows: TicketReportRow[], from: string, to: string, periodLabel?: string) {
  const summary = getTicketReportSummary(rows);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Service Desk AI";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Tickets", {
    views: [{ state: "frozen", ySplit: 8 }],
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
    { key: "number", width: 16 },
    { key: "date", width: 14 },
    { key: "address", width: 30 },
    { key: "description", width: 65 },
    { key: "workerName", width: 24 },
    { key: "status", width: 20 },
    { key: "priority", width: 16 },
  ];

  worksheet.mergeCells("A1:H1");
  worksheet.mergeCells("A2:H2");
  worksheet.mergeCells("A3:H3");
  worksheet.mergeCells("A4:H4");

  worksheet.getCell("A1").value = "POLISSYA SERVICE DESK AI";
  worksheet.getCell("A1").font = { bold: true, size: 12, color: { argb: "FFF97316" } };
  worksheet.getCell("A2").value = "Звіт по заявках";
  worksheet.getCell("A2").font = { bold: true, size: 20, color: { argb: "FF111827" } };
  worksheet.getCell("A3").value = `Період: ${periodLabel || `${formatDateDDMMYYYY(from)} - ${formatDateDDMMYYYY(to)}`}`;
  worksheet.getCell("A4").value = `Сформовано: ${formatDateTimeDDMMYYYYHHMM(new Date())}`;
  for (const rowNumber of [3, 4]) worksheet.getRow(rowNumber).font = { size: 10, color: { argb: "FF6B7280" } };

  const kpi = [
    ["Усього заявок", summary.total],
    ["Виконано", summary.completed],
    ["Не виконано", summary.unresolved],
    ["На підтвердженні", summary.waitingConfirmation],
    ["Високий пріоритет", summary.highPriority],
  ];
  const kpiCells = ["A6", "C6", "E6", "G6", "A7"];
  kpi.forEach(([label, value], index) => {
    const cell = worksheet.getCell(kpiCells[index]);
    cell.value = `${label}: ${value}`;
    cell.font = { bold: true, size: 10, color: { argb: "FF111827" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
    cell.border = thinBorder;
  });

  const headerRowNumber = 8;
  const header = ["№", "Номер заявки", "Дата", "Адреса", "Опис заявки", "Виконавець", "Статус", "Пріоритет"];
  worksheet.getRow(headerRowNumber).values = header;
  worksheet.getRow(headerRowNumber).height = 26;
  worksheet.getRow(headerRowNumber).eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });

  if (rows.length === 0) {
    worksheet.mergeCells("A9:H9");
    worksheet.getCell("A9").value = "За вибраний період заявок не знайдено.";
    worksheet.getCell("A9").font = { size: 11, color: { argb: "FF6B7280" } };
    worksheet.getCell("A9").alignment = { vertical: "middle", horizontal: "left" };
  }

  for (const row of rows) {
    const excelRow = worksheet.addRow([row.index, row.number, row.date, row.address, row.description, row.workerName, row.status, row.priority]);
    excelRow.height = Math.min(55, Math.max(32, Math.ceil(row.description.length / 80) * 16));
    const fill = row.index % 2 === 0 ? "FFF9FAFB" : "FFFFFFFF";
    excelRow.eachCell((cell, columnNumber) => {
      cell.font = { size: 10, color: { argb: "FF111827" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.alignment = { vertical: "top", horizontal: columnNumber === 1 ? "center" : "left", wrapText: columnNumber === 4 || columnNumber === 5 };
      cell.border = thinBorder;
    });
    applyStatusStyle(excelRow.getCell(7), row);
    applyPriorityStyle(excelRow.getCell(8), row);
  }

  const lastRow = Math.max(headerRowNumber, worksheet.rowCount);
  worksheet.autoFilter = { from: `A${headerRowNumber}`, to: `H${lastRow}` };
  return workbook;
}

export async function GET(request: Request) {
  await requireAuth();
  const period = periodFromRequest(request);
  const ticketsResult = await getTicketsForPrint({
    period: period.period,
    from: period.from,
    to: period.to,
    status: period.status,
    category: period.category,
    priority: period.priority,
    worker: period.worker,
    source: period.source,
    q: period.q?.trim(),
    sort: period.sort,
    hideDone: period.hideDone,
    limit: 2000,
  });

  if (ticketsResult.error) return NextResponse.json({ error: ticketsResult.error }, { status: 500 });

  const rows = getTicketReportRows(ticketsResult.data);
  const workbook = await buildWorkbook(rows, period.from, period.to, period.label);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename(period.from, period.to, period.hasExplicitPeriod)}"`,
      "Cache-Control": "no-store",
    },
  });
}
