"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { getWorkWeekRange } from "@/lib/date/work-week";
import { addTicketsToWorkPlan, closeWorkWeekAndRefreshPlans, createWorkPlan, deleteWorkPlan, ensureWeeklyDraftPlansForAutoRouting, getActivePlannedTickets } from "@/lib/supabase/work-plans";

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

function plannedTicketsError(numbers: string[]) {
  const suffix = numbers.length > 0 ? ` Заявки: ${numbers.slice(0, 8).join(", ")}.` : "";
  return `Деякі заявки вже заплановані в іншому активному плані. Оновіть список і виберіть інші заявки.${suffix}`;
}

function normalizeWorkPlanPeriod(periodStart: string, periodEnd: string) {
  const range = getWorkWeekRange(new Date(`${periodStart}T17:00:00`));
  if (periodEnd && periodEnd !== range.endDate) {
    console.warn("[work-planning] period_end normalized to work week boundary", { periodStart, periodEnd, normalizedEnd: range.endDate });
  }
  return { periodStart: range.startIso, periodEnd: range.endIso };
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

  const plannedTicketsResult = await getActivePlannedTickets(ticketIds);
  if (plannedTicketsResult.error) {
    console.error("[work-planning] planned tickets check failed", { error: plannedTicketsResult.error });
    fail(publicErrorMessage(plannedTicketsResult.error));
  }
  if (plannedTicketsResult.data.length > 0) {
    console.error("[work-planning] create plan blocked because tickets are already planned", {
      ticketIds: plannedTicketsResult.data.map((ticket) => ticket.ticketId),
      planIds: plannedTicketsResult.data.map((ticket) => ticket.planId),
    });
    fail(plannedTicketsError(plannedTicketsResult.data.map((ticket) => ticket.ticketNumber).filter(Boolean) as string[]));
  }

  const normalizedPeriod = normalizeWorkPlanPeriod(periodStart, periodEnd);
  const planResult = await createWorkPlan({
    title,
    periodStart: normalizedPeriod.periodStart,
    periodEnd: normalizedPeriod.periodEnd,
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

export async function deleteWorkPlanAction(workPlanId: string) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const result = await deleteWorkPlan(workPlanId, user.id);
  if (result.error) {
    console.error("[work-planning] delete failed", { workPlanId, error: result.error });
    redirect(`/work-planning?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/work-planning");
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/weekly-control");
  redirect("/work-planning?success=deleted");
}

export async function ensureAutoDraftPlansAction() {
  await requireRole(["admin", "management", "tech_manager"]);
  const result = await ensureWeeklyDraftPlansForAutoRouting();
  if (result.error) {
    console.error("[work-planning] auto drafts failed", { error: result.error });
    redirect(`/work-planning?error=${encodeURIComponent(publicErrorMessage(result.error))}`);
  }

  revalidatePath("/work-planning");
  redirect(`/work-planning?week=${result.data.periodStart}&success=auto_drafts&created=${result.data.created}&carried=${result.data.carriedOver}`);
}

export async function closeWorkWeekAndRefreshPlansAction(formData: FormData) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const range = getWorkWeekRange();
  const result = await closeWorkWeekAndRefreshPlans({ range, actorId: user.id });
  if (result.error) {
    console.error("[work-planning] week close refresh failed", { weekStart: range.startDate, error: result.error });
    redirect(`/work-planning?week=${range.startDate}&error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/work-planning");
  revalidatePath("/dashboard");
  revalidatePath("/tickets");
  revalidatePath("/weekly-control");
  revalidatePath("/reports");
  revalidatePath("/director/tickets");

  const params = new URLSearchParams({
    week: range.startDate,
    success: result.data.alreadyClosed ? "week_already_closed" : "week_closed",
    closed: String(result.data.plansClosed),
    kept: String(result.data.doneKept),
    released: String(result.data.notDoneReleased),
    currentCreated: String(result.data.currentDraftPlansCreated),
    currentDrafts: String(result.data.currentDraftPlansCount),
  });
  redirect(`/work-planning?${params.toString()}`);
}
