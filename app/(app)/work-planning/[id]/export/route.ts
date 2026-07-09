import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { getWorkPlanById, getWorkPlanItems } from "@/lib/supabase/work-plans";

type RouteProps = {
  params: Promise<{ id: string }>;
};

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

function filename(plan: { period_start: string; period_end: string }) {
  return `Plan_robit_${plan.period_start}_${plan.period_end}.csv`;
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

  const header = ["№", "Номер заявки", "Об'єкт", "Адреса", "Категорія", "Пріоритет", "Статус", "Виконавець", "Опис", "Дата створення"];
  const rows = itemsResult.data.map((item, index) => {
    const ticket = item.ticket;
    return csvRow([
      index + 1,
      ticket?.number,
      ticket?.object?.name,
      ticket?.object?.address,
      ticket?.category?.name ?? item.category,
      ticket?.priority ? priorityLabels[ticket.priority] : "",
      ticket?.status ? statusLabels[ticket.status] : "",
      item.worker?.name,
      ticket?.title || ticket?.description,
      ticket?.created_at,
    ]);
  });
  const csv = [`\uFEFF${csvRow(header)}`, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename(planResult.data)}"`,
    },
  });
}
