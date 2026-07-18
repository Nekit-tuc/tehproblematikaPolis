import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYYHHMM, getTicketReportRows, getTicketReportSummary, type TicketReportRow } from "@/lib/reports/ticket-report-format";
import { getTicketsForPrint } from "@/lib/supabase/queries";

export const runtime = "nodejs";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function isDateParam(value?: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function periodFromRequest(request: Request) {
  const url = new URL(request.url);
  const weekStart = startOfWeek();
  const explicitFrom = url.searchParams.get("from");
  const explicitTo = url.searchParams.get("to");
  const hasExplicitPeriod = isDateParam(explicitFrom) && isDateParam(explicitTo);
  return {
    from: isDateParam(explicitFrom) ? explicitFrom! : toInputDate(weekStart),
    to: isDateParam(explicitTo) ? explicitTo! : toInputDate(addDays(weekStart, 6)),
    hasExplicitPeriod,
    status: url.searchParams.get("status") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
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

async function buildWorkbook(rows: TicketReportRow[], from: string, to: string) {
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
  worksheet.getCell("A2").value = "\u0417\u0432\u0456\u0442 \u043f\u043e \u0437\u0430\u044f\u0432\u043a\u0430\u0445";
  worksheet.getCell("A2").font = { bold: true, size: 20, color: { argb: "FF111827" } };
  worksheet.getCell("A3").value = `\u041f\u0435\u0440\u0456\u043e\u0434: ${formatDateDDMMYYYY(from)} - ${formatDateDDMMYYYY(to)}`;
  worksheet.getCell("A4").value = `\u0421\u0444\u043e\u0440\u043c\u043e\u0432\u0430\u043d\u043e: ${formatDateTimeDDMMYYYYHHMM(new Date())}`;
  for (const rowNumber of [3, 4]) worksheet.getRow(rowNumber).font = { size: 10, color: { argb: "FF6B7280" } };

  const kpi = [
    ["\u0423\u0441\u044c\u043e\u0433\u043e \u0437\u0430\u044f\u0432\u043e\u043a", summary.total],
    ["\u0412\u0438\u043a\u043e\u043d\u0430\u043d\u043e", summary.completed],
    ["\u041d\u0435 \u0432\u0438\u043a\u043e\u043d\u0430\u043d\u043e", summary.unresolved],
    ["\u041d\u0430 \u043f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043d\u0456", summary.waitingConfirmation],
    ["\u0412\u0438\u0441\u043e\u043a\u0438\u0439 \u043f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442", summary.highPriority],
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
  const header = ["\u2116", "\u041d\u043e\u043c\u0435\u0440 \u0437\u0430\u044f\u0432\u043a\u0438", "\u0414\u0430\u0442\u0430", "\u0410\u0434\u0440\u0435\u0441\u0430", "\u041e\u043f\u0438\u0441 \u0437\u0430\u044f\u0432\u043a\u0438", "\u0412\u0438\u043a\u043e\u043d\u0430\u0432\u0435\u0446\u044c", "\u0421\u0442\u0430\u0442\u0443\u0441", "\u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442"];
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
    worksheet.getCell("A9").value = "\u0417\u0430 \u0432\u0438\u0431\u0440\u0430\u043d\u0438\u0439 \u043f\u0435\u0440\u0456\u043e\u0434 \u0437\u0430\u044f\u0432\u043e\u043a \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e.";
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
    from: period.from,
    to: period.to,
    status: period.status,
    category: period.category,
    priority: period.priority,
    q: period.q?.trim(),
    sort: period.sort,
    limit: 2000,
  });

  if (ticketsResult.error) return NextResponse.json({ error: ticketsResult.error }, { status: 500 });

  const rows = getTicketReportRows(ticketsResult.data);
  const workbook = await buildWorkbook(rows, period.from, period.to);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename(period.from, period.to, period.hasExplicitPeriod)}"`,
      "Cache-Control": "no-store",
    },
  });
}
