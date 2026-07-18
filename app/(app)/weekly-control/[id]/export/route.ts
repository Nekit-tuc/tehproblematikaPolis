import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { getWeeklyPeriodDetails } from "@/lib/supabase/weekly-control";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const { id } = await params;
  const result = await getWeeklyPeriodDetails(id);
  if (!result.data.period) return NextResponse.json({ error: "Period not found" }, { status: 404 });

  const headers = ["№", "Номер заявки", "Назва", "Об'єкт", "Адреса", "Категорія", "Пріоритет", "Статус на момент закриття", "Виконавець", "Роль у тижні", "Створено", "Виконано"];
  const rows = result.data.tickets.map((ticket, index) => [
    index + 1,
    ticket.ticket_number,
    ticket.ticket_title,
    ticket.object_name,
    ticket.object_address,
    ticket.category_name,
    ticket.priority,
    ticket.status_at_close,
    ticket.assignee_worker_name,
    ticket.role,
    ticket.created_at_snapshot,
    ticket.completed_at_snapshot,
  ]);
  const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const filename = `weekly-control-${result.data.period.week_start}-${result.data.period.week_end}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}