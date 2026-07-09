"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { addTicketsToWorkPlan, createWorkPlan } from "@/lib/supabase/work-plans";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function selectedTicketIds(formData: FormData) {
  return formData
    .getAll("ticketIds")
    .map((value) => typeof value === "string" ? value : "")
    .filter(Boolean);
}

function fail(message: string): never {
  redirect(`/work-planning?error=${encodeURIComponent(message)}`);
}

function publicErrorMessage(message?: string | null) {
  if (!message) return "Не вдалося створити план.";
  const lower = message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("violates row-level security")) {
    return "Не вдалося створити план. Перевірте права доступу або RLS.";
  }
  if (message.length > 180) return "Не вдалося створити план. Деталі помилки записано в логах сервера.";
  return message;
}

export async function createWorkPlanAction(formData: FormData) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const title = text(formData, "title");
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  const notes = text(formData, "notes");
  const ticketIds = selectedTicketIds(formData);

  if (!title) fail("Вкажіть назву плану.");
  if (!periodStart || !periodEnd) fail("Вкажіть період плану.");
  if (new Date(periodStart) > new Date(periodEnd)) fail("Дата початку не може бути пізніше дати завершення.");
  if (ticketIds.length === 0) fail("Оберіть хоча б одну заявку для плану.");

  const planResult = await createWorkPlan({
    title,
    periodStart,
    periodEnd,
    notes,
    createdBy: user.id,
  });
  if (planResult.error || !planResult.data) {
    console.error("[work-planning] create plan failed", { error: planResult.error });
    fail(publicErrorMessage(planResult.error));
  }

  const itemsResult = await addTicketsToWorkPlan(planResult.data.id, ticketIds);
  if (itemsResult.error) {
    console.error("[work-planning] add tickets to plan failed", {
      error: itemsResult.error,
      workPlanId: planResult.data.id,
      ticketCount: ticketIds.length,
    });
    fail(publicErrorMessage(itemsResult.error));
  }

  revalidatePath("/work-planning");
  redirect("/work-planning?success=created");
}
