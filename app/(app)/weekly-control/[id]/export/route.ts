import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { getWorkWeekLabel } from "@/lib/date/work-week";
import { addKeyValueSection, addTable, addTitle, createReportWorkbook, formatDate, safeWorksheetName, setupWorksheet, workbookToBuffer, XLSX_CONTENT_TYPE, type ReportColumn } from "@/lib/reports/excel";
import { getWeeklyPeriodDetails } from "@/lib/supabase/weekly-control";

export const runtime = "nodejs";

const priorityLabels: Record<string, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

const statusLabels: Record<string, string> = {
  pending_review: "Очікує підтвердження",
  new: "Нова",
  assigned: "Призначена",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "На підтвердженні",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

const roleLabels: Record<string, string> = {
  created: "Створені",
  planned: "У планах",
  completed: "Виконані",
  carried_over: "Перенесені",
  hot: "Гарячі",
  unresolved: "Невиконані",
};

function label(value: string | null | undefined, labels: Record<string, string>) {
  if (!value) return "";
  return labels[value] ?? value;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const { id } = await params;
  const result = await getWeeklyPeriodDetails(id);
  if (!result.data.period) return NextResponse.json({ error: "Period not found" }, { status: 404 });

  const { period, tickets, summary } = result.data;
  const columns: ReportColumn[] = [
    { header: "№", width: 8 },
    { header: "Номер заявки", width: 16 },
    { header: "Дата", width: 14 },
    { header: "Адреса", width: 34 },
    { header: "Опис роботи", width: 44 },
    { header: "Категорія", width: 24 },
    { header: "Виконавець", width: 24 },
    { header: "Статус", width: 22 },
    { header: "Пріоритет", width: 16 },
    { header: "Роль у тижні", width: 18 },
    { header: "Виконано", width: 14 },
  ];

  const workbook = createReportWorkbook();
  const worksheet = workbook.addWorksheet(safeWorksheetName("Weekly Control", "Weekly Control"));
  setupWorksheet(worksheet, columns);
  addTitle(worksheet, "POLISSYA SERVICE DESK AI", `Тижневий контроль: ${getWorkWeekLabel(period.week_start, period.week_end)}`, columns.length);
  addKeyValueSection(worksheet, "Підсумок", [
    ["Статус тижня", period.status, period.title ?? ""],
    ["Створено", summary.totalCreated, "Заявки, створені за тиждень"],
    ["У планах", summary.totalPlanned, "Заявки з планів робіт"],
    ["Виконано", summary.totalCompleted, "Виконані за тиждень"],
    ["Невиконані", summary.totalUnresolved, "Активні на момент snapshot"],
    ["Очікують підтвердження", summary.totalWaitingAdminConfirmation, "Потребують дії адміністратора"],
    ["Перенесені", summary.totalCarriedOver, "Перейшли в наступний період"],
    ["Гарячі", summary.totalHot, "Пріоритетні або ризикові"],
  ]);
  addTable(
    worksheet,
    columns,
    tickets.map((ticket, index) => [
      index + 1,
      ticket.ticket_number,
      formatDate(ticket.created_at_snapshot),
      ticket.object_address || ticket.object_name,
      ticket.ticket_title,
      ticket.category_name,
      ticket.assignee_worker_name,
      label(ticket.status_at_close, statusLabels),
      label(ticket.priority, priorityLabels),
      label(ticket.role, roleLabels),
      formatDate(ticket.completed_at_snapshot),
    ]),
    { title: "Заявки тижня" },
  );

  const buffer = await workbookToBuffer(workbook);
  const filename = `weekly-control-${period.week_start.slice(0, 10)}-${period.week_end.slice(0, 10)}.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
