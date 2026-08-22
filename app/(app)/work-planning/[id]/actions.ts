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

function safeWorkPlanningReturnTo(value?: string | null) {
  if (!value) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return null;
  if (!value.startsWith("/work-planning")) return null;
  return value;
}

function detailHref(workPlanId: string, returnTo?: string | null) {
  const params = new URLSearchParams();
  const safeReturnTo = safeWorkPlanningReturnTo(returnTo);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  const query = params.toString();
  return query ? `/work-planning/${workPlanId}?${query}` : `/work-planning/${workPlanId}`;
}

function withMessage(href: string, key: "error" | "success", value: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${key}=${encodeURIComponent(value)}`;
}

function returnToFromForm(formData?: FormData) {
  return formData ? safeWorkPlanningReturnTo(text(formData, "returnTo")) : null;
}

function fail(workPlanId: string, message: string, returnTo?: string | null): never {
  redirect(withMessage(detailHref(workPlanId, returnTo), "error", message));
}

function success(workPlanId: string, code: string, returnTo?: string | null): never {
  redirect(withMessage(detailHref(workPlanId, returnTo), "success", code));
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

async function sendPlanWithMode(workPlanId: string, mode: SendWorkPlanMode, successPrefix: string, formData?: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const returnTo = returnToFromForm(formData);
  const result = await sendWorkPlanToWorkers(workPlanId, { mode });
  if (result.error || !result.data) {
    console.error("[work-planning] send failed", { workPlanId, mode, error: result.error });
    fail(workPlanId, publicError(result.error), returnTo);
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  success(workPlanId, `${successPrefix}_${result.data.sent}_${result.data.failed}_${result.data.skipped}`, returnTo);
}

export async function updateWorkPlanAction(workPlanId: string, formData: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const returnTo = returnToFromForm(formData);
  const title = text(formData, "title");
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  const notes = text(formData, "notes");

  if (!title) fail(workPlanId, "Вкажіть назву плану.", returnTo);
  if (!periodStart || !periodEnd) fail(workPlanId, "Вкажіть період плану.", returnTo);
  if (new Date(periodStart) > new Date(periodEnd)) fail(workPlanId, "Дата початку не може бути пізніше дати завершення.", returnTo);

  const normalizedPeriod = normalizeWorkPlanPeriod(periodStart, periodEnd);
  const result = await updateWorkPlan(workPlanId, { title, periodStart: normalizedPeriod.periodStart, periodEnd: normalizedPeriod.periodEnd, notes });
  if (result.error || !result.data) {
    console.error("[work-planning] update failed", { workPlanId, error: result.error });
    fail(workPlanId, publicError(result.error ?? "План не знайдено або він уже не є чернеткою."), returnTo);
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  success(workPlanId, "updated", returnTo);
}

export async function removeWorkPlanItemAction(workPlanId: string, formData: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const returnTo = returnToFromForm(formData);
  const ticketId = text(formData, "ticket_id");
  if (!ticketId) fail(workPlanId, "Заявку не знайдено.", returnTo);

  const result = await removeWorkPlanItem(workPlanId, ticketId);
  if (result.error) {
    console.error("[work-planning] remove item failed", { workPlanId, ticketId, error: result.error });
    fail(workPlanId, publicError(result.error), returnTo);
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  success(workPlanId, "item_removed", returnTo);
}

export async function moveWorkPlanItemAction(workPlanId: string, formData: FormData) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const returnTo = returnToFromForm(formData);
  const itemId = text(formData, "item_id");
  const targetPlanId = text(formData, "target_plan_id");
  if (!itemId) fail(workPlanId, "Заявку в плані не знайдено.", returnTo);
  if (!targetPlanId) fail(workPlanId, "Оберіть план для перенесення.", returnTo);

  const result = await moveWorkPlanItemToDraftPlan({
    itemId,
    currentPlanId: workPlanId,
    targetPlanId,
    actorId: user.id,
  });
  if (result.error || !result.data) {
    console.error("[work-planning] move item failed", { workPlanId, itemId, targetPlanId, error: result.error });
    fail(workPlanId, publicError(result.error), returnTo);
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  revalidatePath(`/work-planning/${result.data.targetPlanId}`);
  revalidatePath("/tickets");
  success(workPlanId, "item_moved", returnTo);
}

export async function cancelWorkPlanAction(workPlanId: string, formData?: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const returnTo = returnToFromForm(formData);
  const result = await cancelWorkPlan(workPlanId);
  if (result.error) {
    console.error("[work-planning] cancel failed", { workPlanId, error: result.error });
    fail(workPlanId, publicError(result.error), returnTo);
  }

  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
  success(workPlanId, "cancelled", returnTo);
}

export async function sendWorkPlanAction(workPlanId: string, formData?: FormData) {
  await sendPlanWithMode(workPlanId, "initial", "sent", formData);
}

export async function retryFailedWorkPlanDispatchAction(workPlanId: string, formData?: FormData) {
  await sendPlanWithMode(workPlanId, "retry_failed", "retry", formData);
}

export async function resendWorkPlanToAllAction(workPlanId: string, formData?: FormData) {
  await sendPlanWithMode(workPlanId, "resend_all", "resend", formData);
}
