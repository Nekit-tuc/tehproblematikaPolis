import * as XLSX from "xlsx";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { buildReportsWorkbook, filterTickets, type ReportFilters } from "@/lib/reports/analytics";
import { getReportsDashboardData, type ReportExportType, type ReportsDashboardData } from "@/lib/supabase/report-queries";
import { getCategories, getObjects, getProfiles, getTickets } from "@/lib/supabase/queries";
import type { TicketPriority, TicketStatus } from "@/types/domain";

type CsvRow = Array<string | number | null | undefined>;

const csvExportTypes = new Set<ReportExportType>(["weekly", "objects", "workers", "categories", "director"]);

const csvFileNames: Record<ReportExportType, string> = {
  weekly: "weekly-report.csv",
  objects: "objects-report.csv",
  workers: "workers-report.csv",
  categories: "categories-report.csv",
  director: "director-summary.csv",
};

const statusUa: Partial<Record<TicketStatus, string>> = {
  pending_review: "\u041E\u0447\u0456\u043A\u0443\u0454 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F",
  new: "\u041D\u043E\u0432\u0430",
  assigned: "\u041F\u0440\u0438\u0437\u043D\u0430\u0447\u0435\u043D\u0430",
  in_progress: "\u0412 \u0440\u043E\u0431\u043E\u0442\u0456",
  waiting: "\u041E\u0447\u0456\u043A\u0443\u0454",
  waiting_admin_confirmation: "\u041E\u0447\u0456\u043A\u0443\u0454 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043D\u044F",
  done: "\u0412\u0438\u043A\u043E\u043D\u0430\u043D\u0430",
  cancelled: "\u0421\u043A\u0430\u0441\u043E\u0432\u0430\u043D\u0430",
  rejected: "\u0412\u0456\u0434\u0445\u0438\u043B\u0435\u043D\u0430",
};

const priorityUa: Partial<Record<TicketPriority, string>> = {
  low: "\u041D\u0438\u0437\u044C\u043A\u0438\u0439",
  medium: "\u0421\u0435\u0440\u0435\u0434\u043D\u0456\u0439",
  high: "\u0412\u0438\u0441\u043E\u043A\u0438\u0439",
  critical: "\u041A\u0440\u0438\u0442\u0438\u0447\u043D\u0438\u0439",
};

function filtersFromUrl(request: NextRequest): ReportFilters {
  const params = request.nextUrl.searchParams;
  return {
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    status: (params.get("status") || "") as TicketStatus | "",
    categoryId: params.get("categoryId") || undefined,
    objectId: params.get("objectId") || undefined,
    assigneeId: params.get("assigneeId") || undefined,
    priority: (params.get("priority") || "") as TicketPriority | "",
  };
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csvResponse(type: ReportExportType, rows: CsvRow[]) {
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFileNames[type]}"`,
      "Cache-Control": "no-store",
    },
  });
}

function dateCell(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function completionText(completed: number, total: number) {
  return total > 0 ? `${Math.round((completed / total) * 100)}%` : "0%";
}

function buildWeeklyCsv(data: ReportsDashboardData): CsvRow[] {
  return [
    ["\u2116 \u0437\u0430\u044F\u0432\u043A\u0438", "\u0414\u0430\u0442\u0430", "\u041E\u0431'\u0454\u043A\u0442", "\u0410\u0434\u0440\u0435\u0441\u0430", "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F", "\u0412\u0438\u043A\u043E\u043D\u0430\u0432\u0435\u0446\u044C", "\u0421\u0442\u0430\u0442\u0443\u0441", "\u041F\u0440\u0456\u043E\u0440\u0438\u0442\u0435\u0442", "\u041E\u043F\u0438\u0441"],
    ...data.tickets.all.map((ticket) => [
      ticket.number,
      dateCell(ticket.createdAt),
      ticket.objectName,
      ticket.objectAddress,
      ticket.categoryName,
      ticket.assigneeName,
      statusUa[ticket.status] ?? ticket.status,
      priorityUa[ticket.priority] ?? ticket.priority,
      ticket.description,
    ]),
  ];
}

function buildObjectsCsv(data: ReportsDashboardData): CsvRow[] {
  return [
    ["\u041E\u0431'\u0454\u043A\u0442", "\u0410\u0434\u0440\u0435\u0441\u0430", "\u0423\u0441\u044C\u043E\u0433\u043E", "\u0412\u0438\u043A\u043E\u043D\u0430\u043D\u043E", "\u041D\u0435 \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043E", "\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u043D\u0456", "% \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043D\u044F", "\u0422\u043E\u043F \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F"],
    ...data.objectRows.map((row) => [row.name, row.address, row.total, row.completed, row.unresolved, row.problematic, `${row.completionRate}%`, row.topCategory ?? ""]),
  ];
}

function buildWorkersCsv(data: ReportsDashboardData): CsvRow[] {
  return [
    ["\u0412\u0438\u043A\u043E\u043D\u0430\u0432\u0435\u0446\u044C", "\u041F\u0440\u0438\u0437\u043D\u0430\u0447\u0435\u043D\u043E", "\u0412\u0438\u043A\u043E\u043D\u0430\u043D\u043E", "\u041D\u0435 \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043E", "\u041E\u0447\u0456\u043A\u0443\u0454 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F", "\u0415\u0444\u0435\u043A\u0442\u0438\u0432\u043D\u0456\u0441\u0442\u044C %"],
    ...data.workerRows.map((row) => [row.name, row.assigned, row.completed, row.unresolved, row.waitingConfirmation, `${row.efficiency}%`]),
  ];
}

function buildCategoriesCsv(data: ReportsDashboardData): CsvRow[] {
  return [
    ["\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F", "\u0423\u0441\u044C\u043E\u0433\u043E", "\u0412\u0438\u043A\u043E\u043D\u0430\u043D\u043E", "\u041D\u0435 \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043E", "\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u043D\u0456", "% \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043D\u044F"],
    ...data.categoryRows.map((row) => [row.name, row.total, row.completed, row.unresolved, row.problematic, `${row.completionRate}%`]),
  ];
}

function buildDirectorCsv(data: ReportsDashboardData): CsvRow[] {
  return [
    ["\u041F\u043E\u043A\u0430\u0437\u043D\u0438\u043A", "\u0417\u043D\u0430\u0447\u0435\u043D\u043D\u044F", "\u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440"],
    ["\u041F\u0435\u0440\u0456\u043E\u0434", data.periodRange.label, "\u041E\u0431\u0440\u0430\u043D\u0438\u0439 \u043F\u0435\u0440\u0456\u043E\u0434 \u0437\u0432\u0456\u0442\u0443"],
    ["\u0423\u0441\u044C\u043E\u0433\u043E \u0437\u0430\u044F\u0432\u043E\u043A", data.totalTickets, "\u0421\u0442\u0432\u043E\u0440\u0435\u043D\u043E \u0437\u0430 \u043F\u0435\u0440\u0456\u043E\u0434"],
    ["\u0412\u0438\u043A\u043E\u043D\u0430\u043D\u043E", data.completedTickets, completionText(data.completedTickets, data.totalTickets)],
    ["\u041D\u0435 \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043E", data.unresolvedTickets, "\u0410\u043A\u0442\u0438\u0432\u043D\u0456 \u0437\u0430\u044F\u0432\u043A\u0438, \u0449\u043E \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u044E\u0442\u044C \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044E"],
    ["\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u043D\u0456", data.problematicTickets, "\u0420\u0438\u0437\u0438\u043A\u043E\u0432\u0456, \u043F\u0440\u0456\u043E\u0440\u0438\u0442\u0435\u0442\u043D\u0456 \u0430\u0431\u043E \u043F\u0440\u043E\u0441\u0442\u0440\u043E\u0447\u0435\u043D\u0456 \u0437\u0430\u044F\u0432\u043A\u0438"],
    ["\u041E\u0447\u0456\u043A\u0443\u044E\u0442\u044C \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F", data.waitingConfirmationTickets, "\u041F\u043E\u0442\u0440\u0435\u0431\u0443\u044E\u0442\u044C \u0434\u0456\u0457 \u0430\u0434\u043C\u0456\u043D\u0456\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430"],
    ["\u041D\u0430\u0439\u043F\u0440\u043E\u0431\u043B\u0435\u043C\u043D\u0456\u0448\u0438\u0439 \u043E\u0431'\u0454\u043A\u0442", data.topProblemObjects[0]?.name ?? "-", data.topProblemObjects[0] ? `${data.topProblemObjects[0].count} \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u043D\u0438\u0445 \u0437\u0430\u044F\u0432\u043E\u043A` : "\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u043D\u0438\u0445 \u043E\u0431'\u0454\u043A\u0442\u0456\u0432 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E"],
    ["\u0422\u043E\u043F \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F", data.topCategories[0]?.name ?? "-", data.topCategories[0] ? `${data.topCategories[0].count} \u0437\u0430\u044F\u0432\u043E\u043A` : "\u0417\u0430\u044F\u0432\u043E\u043A \u0437\u0430 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F\u043C\u0438 \u043D\u0435\u043C\u0430\u0454"],
    ["\u0420\u0435\u0437\u044E\u043C\u0435", data.directorSummaryText, ""],
    ...data.directorRecommendations.map((item) => ["\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0456\u044F", item, ""] satisfies CsvRow),
  ];
}

function rowsForType(type: ReportExportType, data: ReportsDashboardData): CsvRow[] {
  if (type === "weekly") return buildWeeklyCsv(data);
  if (type === "objects") return buildObjectsCsv(data);
  if (type === "workers") return buildWorkersCsv(data);
  if (type === "categories") return buildCategoriesCsv(data);
  return buildDirectorCsv(data);
}

async function csvExport(request: NextRequest, type: ReportExportType) {
  const params = request.nextUrl.searchParams;
  const result = await getReportsDashboardData(params.get("period") ?? undefined, params.get("from") ?? undefined, params.get("to") ?? undefined, params.get("periodId"));
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return csvResponse(type, rowsForType(type, result.data));
}

export async function GET(request: NextRequest) {
  await requireRole(["admin", "management", "tech_manager"]);
  const typeParam = request.nextUrl.searchParams.get("type") as ReportExportType | null;
  if (typeParam && csvExportTypes.has(typeParam)) return csvExport(request, typeParam);

  const [ticketsResult, objectsResult, profilesResult, categoriesResult] = await Promise.all([
    getTickets({ limit: null }),
    getObjects(),
    getProfiles(),
    getCategories(),
  ]);
  const error = ticketsResult.error ?? objectsResult.error ?? profilesResult.error ?? categoriesResult.error;
  if (error) return NextResponse.json({ error }, { status: 400 });

  const tickets = filterTickets(ticketsResult.data, filtersFromUrl(request));
  const workbook = buildReportsWorkbook({
    tickets,
    objects: objectsResult.data,
    profiles: profilesResult.data,
    categories: categoriesResult.data,
  });
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="polissya-service-desk-report.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}