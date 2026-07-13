"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { cancelWorkPlan, removeWorkPlanItem, sendWorkPlanToWorkers, updateWorkPlan, type SendWorkPlanMode } from "@/lib/supabase/work-plans";

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

  const result = await updateWorkPlan(workPlanId, { title, periodStart, periodEnd, notes });
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
