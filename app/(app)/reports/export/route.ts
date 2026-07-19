import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { addKeyValueSection, addTable, addTitle, createReportWorkbook, formatDate, safeWorksheetName, setupWorksheet, workbookToBuffer, XLSX_CONTENT_TYPE, type ReportColumn } from "@/lib/reports/excel";
import { getReportsDashboardData, type ReportExportType, type ReportsDashboardData } from "@/lib/supabase/report-queries";
import type { TicketPriority, TicketStatus } from "@/types/domain";

export const runtime = "nodejs";

const exportTypes = new Set<ReportExportType>(["weekly", "objects", "workers", "categories", "director"]);

const sheetNames: Record<ReportExportType, string> = {
  weekly: "Weekly Report",
  objects: "Objects",
  workers: "Workers",
  categories: "Categories",
  director: "Director",
};

const fileNames: Record<ReportExportType, string> = {
  weekly: "weekly-report.xlsx",
  objects: "objects-report.xlsx",
  workers: "workers-report.xlsx",
  categories: "categories-report.xlsx",
  director: "director-summary.xlsx",
};

const statusUa: Partial<Record<TicketStatus, string>> = {
  pending_review: "Очікує підтвердження",
  new: "Нова",
  assigned: "Призначена",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "Очікує підтвердження виконання",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

const priorityUa: Partial<Record<TicketPriority, string>> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

function statusLabel(status: TicketStatus | string | null | undefined) {
  if (!status) return "";
  return statusUa[status as TicketStatus] ?? status;
}

function priorityLabel(priority: TicketPriority | string | null | undefined) {
  if (!priority) return "";
  return priorityUa[priority as TicketPriority] ?? priority;
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function completionText(completed: number, total: number) {
  return total > 0 ? `${Math.round((completed / total) * 100)}%` : "0%";
}

function periodSubtitle(data: ReportsDashboardData) {
  return `Період: ${data.periodRange.label} (${formatDate(data.periodRange.from)} - ${formatDate(data.periodRange.to)})`;
}

function prepareWorksheet(data: ReportsDashboardData, type: ReportExportType, columns: ReportColumn[]) {
  const workbook = createReportWorkbook();
  const worksheet = workbook.addWorksheet(safeWorksheetName(sheetNames[type], sheetNames[type]));
  setupWorksheet(worksheet, columns);
  addTitle(worksheet, "POLISSYA SERVICE DESK AI", periodSubtitle(data), columns.length);
  return { workbook, worksheet };
}

function buildWeeklyWorkbook(data: ReportsDashboardData) {
  const columns: ReportColumn[] = [
    { header: "№ заявки", width: 16 },
    { header: "Дата", width: 14 },
    { header: "Об'єкт", width: 26 },
    { header: "Адреса", width: 32 },
    { header: "Категорія", width: 24 },
    { header: "Виконавець", width: 22 },
    { header: "Статус", width: 22 },
    { header: "Пріоритет", width: 16 },
    { header: "Опис", width: 52 },
  ];
  const { workbook, worksheet } = prepareWorksheet(data, "weekly", columns);
  addKeyValueSection(worksheet, "KPI", [
    ["Усього", data.totalTickets, "Заявки за період"],
    ["Виконано", data.completedTickets, completionText(data.completedTickets, data.totalTickets)],
    ["Не виконано", data.unresolvedTickets, "Активні або незавершені заявки"],
    ["Проблемні", data.problematicTickets, "Ризикові або прострочені заявки"],
  ]);
  addTable(
    worksheet,
    columns,
    data.tickets.all.map((ticket) => [
      ticket.number,
      formatDate(ticket.createdAt),
      ticket.objectName,
      ticket.objectAddress,
      ticket.categoryName,
      ticket.assigneeName,
      statusLabel(ticket.status),
      priorityLabel(ticket.priority),
      ticket.description,
    ]),
    { title: "Заявки" },
  );
  return workbook;
}

function buildObjectsWorkbook(data: ReportsDashboardData) {
  const columns: ReportColumn[] = [
    { header: "Об'єкт", width: 28 },
    { header: "Адреса", width: 36 },
    { header: "Усього", width: 12 },
    { header: "Виконано", width: 12 },
    { header: "Не виконано", width: 14 },
    { header: "Проблемні", width: 14 },
    { header: "% виконання", width: 14 },
    { header: "Топ категорія", width: 26 },
  ];
  const { workbook, worksheet } = prepareWorksheet(data, "objects", columns);
  addTable(
    worksheet,
    columns,
    data.objectRows.map((row) => [row.name, row.address, row.total, row.completed, row.unresolved, row.problematic, percent(row.completionRate), row.topCategory ?? ""]),
    { title: "Звіт по об'єктах" },
  );
  return workbook;
}

function buildWorkersWorkbook(data: ReportsDashboardData) {
  const columns: ReportColumn[] = [
    { header: "Виконавець", width: 28 },
    { header: "Призначено", width: 14 },
    { header: "Виконано", width: 12 },
    { header: "Не виконано", width: 14 },
    { header: "Очікує підтвердження", width: 22 },
    { header: "Ефективність %", width: 16 },
  ];
  const { workbook, worksheet } = prepareWorksheet(data, "workers", columns);
  addTable(
    worksheet,
    columns,
    data.workerRows.map((row) => [row.name, row.assigned, row.completed, row.unresolved, row.waitingConfirmation, percent(row.efficiency)]),
    { title: "Звіт по виконавцях" },
  );
  return workbook;
}

function buildCategoriesWorkbook(data: ReportsDashboardData) {
  const columns: ReportColumn[] = [
    { header: "Категорія", width: 30 },
    { header: "Усього", width: 12 },
    { header: "Виконано", width: 12 },
    { header: "Не виконано", width: 14 },
    { header: "Проблемні", width: 14 },
    { header: "% виконання", width: 14 },
  ];
  const { workbook, worksheet } = prepareWorksheet(data, "categories", columns);
  addTable(
    worksheet,
    columns,
    data.categoryRows.map((row) => [row.name, row.total, row.completed, row.unresolved, row.problematic, percent(row.completionRate)]),
    { title: "Звіт по категоріях" },
  );
  return workbook;
}

function buildDirectorWorkbook(data: ReportsDashboardData) {
  const columns: ReportColumn[] = [
    { header: "Показник", width: 30 },
    { header: "Значення", width: 22 },
    { header: "Коментар", width: 58 },
  ];
  const { workbook, worksheet } = prepareWorksheet(data, "director", columns);
  addKeyValueSection(worksheet, "Підсумок", [
    ["Період", data.periodRange.label, "Обраний період звіту"],
    ["Усього заявок", data.totalTickets, "Створено за період"],
    ["Виконано", data.completedTickets, completionText(data.completedTickets, data.totalTickets)],
    ["Не виконано", data.unresolvedTickets, "Активні заявки, що потребують контролю"],
    ["Проблемні", data.problematicTickets, "Ризикові, пріоритетні або прострочені заявки"],
    ["Очікують підтвердження", data.waitingConfirmationTickets, "Потребують дії адміністратора"],
    ["Найпроблемніший об'єкт", data.topProblemObjects[0]?.name ?? "-", data.topProblemObjects[0] ? `${data.topProblemObjects[0].count} проблемних заявок` : "Проблемних об'єктів не знайдено"],
    ["Топ категорія", data.topCategories[0]?.name ?? "-", data.topCategories[0] ? `${data.topCategories[0].count} заявок` : "Заявок за категоріями немає"],
    ["Резюме", data.directorSummaryText, ""],
    ...data.directorRecommendations.map((item) => ["Рекомендація", item, ""]),
  ]);
  return workbook;
}

function buildWorkbook(type: ReportExportType, data: ReportsDashboardData) {
  if (type === "weekly") return buildWeeklyWorkbook(data);
  if (type === "objects") return buildObjectsWorkbook(data);
  if (type === "workers") return buildWorkersWorkbook(data);
  if (type === "categories") return buildCategoriesWorkbook(data);
  return buildDirectorWorkbook(data);
}

function getExportType(request: NextRequest): ReportExportType {
  const typeParam = request.nextUrl.searchParams.get("type") as ReportExportType | null;
  return typeParam && exportTypes.has(typeParam) ? typeParam : "weekly";
}

export async function GET(request: NextRequest) {
  await requireRole(["admin", "management", "tech_manager"]);

  const params = request.nextUrl.searchParams;
  const type = getExportType(request);
  const result = await getReportsDashboardData(params.get("period") ?? undefined, params.get("from") ?? undefined, params.get("to") ?? undefined, params.get("periodId"));
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  const workbook = buildWorkbook(type, result.data);
  const buffer = await workbookToBuffer(workbook);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileNames[type]}"`,
      "Cache-Control": "no-store",
    },
  });
}