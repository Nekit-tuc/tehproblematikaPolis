"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { getWorkWeekRange } from "@/lib/date/work-week";
import { cancelWorkPlan, moveWorkPlanItemToDraftPlan, removeWorkPlanItem, sendWorkPlanToWorkers, updateWorkPlan, type SendWorkPlanMode } from "@/lib/supabase/work-plans";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function fail(workPlanId: string, message: string): never {
  redirect(`/work-planning/${workPlanId}?error=${encodeURIComponent(message)}`);
}

function success(workPlanId: string, code: string): never {
  redirect(`/work-planning/${workPlanId}?success=${code}`);
}

function publicError(message?: string | null) {
  if (!message) return "Дію не виконано.";
  if (message.length > 180) return "Дію не виконано. Деталі записано в логах сервера.";
  return message;
}

function normalizeWorkPlanPeriod(periodStart: string, periodEnd: string) {
  const range = getWorkWeekRange(new Date(`${periodStart}T17:00:00`));
  if (periodEnd && periodEnd !== range.endDate) {
    console.warn("[work-planning] period_end normalized to work week boundary", { periodStart, periodEnd, normalizedEnd: range.endDate });
  }
  return { periodStart: range.startIso, periodEnd: range.endIso };
}

async function sendPlanWithMode(workPlanId: string, mode: SendWorkPlanMode, successPrefix: string) {
  await requireRole(["admin", "management", "tech_manager"]);
  const result = await sendWorkPlanToWorkers(workPlanId, { mode });
  if (result.error || !result.data) {
    console.error("[work-planning] send failed", { workPlanId, mode, error: result.error });
    fail(workPlanId, publicError(result.error));
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  success(workPlanId, `${successPrefix}_${result.data.sent}_${result.data.failed}_${result.data.skipped}`);
}

export async function updateWorkPlanAction(workPlanId: string, formData: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const title = text(formData, "title");
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  const notes = text(formData, "notes");

  if (!title) fail(workPlanId, "Вкажіть назву плану.");
  if (!periodStart || !periodEnd) fail(workPlanId, "Вкажіть період плану.");
  if (new Date(periodStart) > new Date(periodEnd)) fail(workPlanId, "Дата початку не може бути пізніше дати завершення.");

  const normalizedPeriod = normalizeWorkPlanPeriod(periodStart, periodEnd);
  const result = await updateWorkPlan(workPlanId, { title, periodStart: normalizedPeriod.periodStart, periodEnd: normalizedPeriod.periodEnd, notes });
  if (result.error || !result.data) {
    console.error("[work-planning] update failed", { workPlanId, error: result.error });
    fail(workPlanId, publicError(result.error ?? "План не знайдено або він уже не є чернеткою."));
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  success(workPlanId, "updated");
}

export async function removeWorkPlanItemAction(workPlanId: string, formData: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const ticketId = text(formData, "ticket_id");
  if (!ticketId) fail(workPlanId, "Заявку не знайдено.");

  const result = await removeWorkPlanItem(workPlanId, ticketId);
  if (result.error) {
    console.error("[work-planning] remove item failed", { workPlanId, ticketId, error: result.error });
    fail(workPlanId, publicError(result.error));
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  success(workPlanId, "item_removed");
}

export async function moveWorkPlanItemAction(workPlanId: string, formData: FormData) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const itemId = text(formData, "item_id");
  const targetPlanId = text(formData, "target_plan_id");
  if (!itemId) fail(workPlanId, "Заявку в плані не знайдено.");
  if (!targetPlanId) fail(workPlanId, "Оберіть план для перенесення.");

  const result = await moveWorkPlanItemToDraftPlan({
    itemId,
    currentPlanId: workPlanId,
    targetPlanId,
    actorId: user.id,
  });
  if (result.error || !result.data) {
    console.error("[work-planning] move item failed", { workPlanId, itemId, targetPlanId, error: result.error });
    fail(workPlanId, publicError(result.error));
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  revalidatePath(`/work-planning/${result.data.targetPlanId}`);
  revalidatePath("/tickets");
  success(workPlanId, "item_moved");
}

export async function cancelWorkPlanAction(workPlanId: string) {
  await requireRole(["admin", "management", "tech_manager"]);
  const result = await cancelWorkPlan(workPlanId);
  if (result.error) {
    console.error("[work-planning] cancel failed", { workPlanId, error: result.error });
    fail(workPlanId, publicError(result.error));
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  success(workPlanId, "cancelled");
}

export async function sendWorkPlanAction(workPlanId: string) {
  await sendPlanWithMode(workPlanId, "initial", "sent");
}

export async function retryFailedWorkPlanDispatchAction(workPlanId: string) {
  await sendPlanWithMode(workPlanId, "retry_failed", "retry");
}

export async function resendWorkPlanToAllAction(workPlanId: string) {
  await sendPlanWithMode(workPlanId, "resend_all", "resend");
}
