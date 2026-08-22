"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAddTicketPhoto, canConfirmTicket, canEditTicket, canHardDeleteTicket, canUnassignWorkerFromTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { getFiles, uploadTicketPhotos } from "@/lib/photos";
import { measureAsync } from "@/lib/performance";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTicket } from "@/lib/supabase/queries";
import { assignTicketToWorker, confirmWorkerCompletion, unassignTicketWorker } from "@/lib/supabase/workers";
import { createClient } from "@/lib/supabase/server";
import { sendTicketToWorker, sendWorkerCompletionConfirmedNotification } from "@/lib/telegram/worker-notifications";
import { confirmTicketWithPlanningDecision } from "@/lib/tickets/confirm-ticket-with-planning";
import { syncTicketPlanningAfterUpdate, type TicketPlanningSyncResult } from "@/lib/supabase/work-plans";
import type { PhotoType, TicketStatus } from "@/types/domain";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeTicketReturnTo(value?: string | null) {
  if (!value) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return null;
  if (value.toLowerCase().startsWith("javascript:")) return null;
  const allowedPrefixes = ["/tickets", "/ai-tickets", "/dashboard", "/work-planning", "/director/tickets", "/workers", "/weekly-control", "/reports"];
  return allowedPrefixes.some((prefix) => value.startsWith(prefix)) ? value : null;
}

function returnToFromForm(formData?: FormData) {
  return formData ? safeTicketReturnTo(readString(formData, "returnTo")) : null;
}

function ticketDetailHref(ticketId: string, returnTo?: string | null) {
  const params = new URLSearchParams();
  const safeReturnTo = safeTicketReturnTo(returnTo);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  const query = params.toString();
  return query ? `/tickets/${ticketId}?${query}` : `/tickets/${ticketId}`;
}

function appendSearchParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

function redirectWith(ticketId: string, key: string, message: string, returnTo?: string | null): never {
  redirect(appendSearchParam(ticketDetailHref(ticketId, returnTo), key, message));
}

function redirectSuccess(ticketId: string, key: string, value: string, returnTo?: string | null): never {
  redirect(appendSearchParam(ticketDetailHref(ticketId, returnTo), key, value));
}

function syncWarningText(sync: TicketPlanningSyncResult) {
  if (sync.errors.length > 0) return sync.errors[0];
  if (sync.warnings.length > 0) return sync.warnings[0];
  return null;
}

function redirectWithSyncResult(ticketId: string, successValue: string, sync: TicketPlanningSyncResult, returnTo?: string | null): never {
  let url = appendSearchParam(ticketDetailHref(ticketId, returnTo), "statusSuccess", successValue);
  const warning = syncWarningText(sync);
  if (warning) url = appendSearchParam(url, "statusWarning", warning);
  redirect(url);
}

function deleteErrorRedirect(ticketId: string, message: string, returnTo?: string | null): never {
  console.error("[ticket-delete] failed", { ticketId, message });
  redirectWith(ticketId, "statusError", message, returnTo);
}

function confirmedPlanWarning(reason?: string | null) {
  if (!reason || reason === "added" || reason === "already_planned") return "";
  if (reason === "missing_category") return "Заявку підтверджено, але не додано в план: у заявки не вибрано категорію.";
  if (reason === "category_not_mapped") return "Заявку підтверджено, але не додано в план виконання. Для цієї категорії не знайдено план або виконавця.";
  if (reason === "plan_not_found") return "Заявку підтверджено, але не додано в план виконання. Чернетку потрібного плану не знайдено.";
  if (reason === "ensure_failed") return "Заявку підтверджено, але не вдалося підготувати чернетки планів тижня.";
  if (reason === "closed_ticket") return "Заявку підтверджено, але її не додано в план, бо вона вже закрита.";
  return "Заявку підтверджено, але не додано в план. Перевірте категорію або виконавця.";
}

const statusActionLabels: Record<TicketStatus, string> = {
  pending_review: "Статус змінено: Очікує підтвердження",
  new: "Статус змінено: Нова",
  assigned: "Статус змінено: Призначена",
  in_progress: "Статус змінено: В роботі",
  waiting: "Статус змінено: Очікує",
  waiting_admin_confirmation: "Статус змінено: Очікує підтвердження виконання",
  done: "Статус змінено: Виконана",
  cancelled: "Статус змінено: Скасована",
  rejected: "Статус змінено: Відхилена",
};

export async function uploadTicketPhotosAction(ticketId: string, type: PhotoType, formData: FormData) {
  const startedAt = performance.now();
  const returnTo = returnToFromForm(formData);
  const { profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "photoError", ticketResult.error ?? "Заявку не знайдено", returnTo);
  if (!canAddTicketPhoto(profile, ticket, type)) redirectWith(ticketId, "photoError", "Недостатньо прав для завантаження фото цього типу.", returnTo);

  const files = getFiles(formData, "photos");
  if (files.length === 0) redirectWith(ticketId, "photoError", "Оберіть хоча б одне фото.", returnTo);
  const result = await uploadTicketPhotos({ files, profile, ticket, type });
  if (result.error) redirectWith(ticketId, "photoError", result.error, returnTo);

  revalidatePath(`/tickets/${ticketId}`);
  console.info(`[perf] ticket:photo_upload ${Math.round(performance.now() - startedAt)}ms`);
  redirectSuccess(ticketId, "photoSuccess", type, returnTo);
}

export async function addTicketCommentAction(ticketId: string, formData: FormData) {
  const returnTo = returnToFromForm(formData);
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "commentError", ticketResult.error ?? "Заявку не знайдено", returnTo);
  if (!canEditTicket(profile, ticket)) redirectWith(ticketId, "commentError", "Недостатньо прав для коментаря.", returnTo);

  const body = readString(formData, "body");
  if (!body) redirectWith(ticketId, "commentError", "Введіть текст коментаря.", returnTo);

  const supabase = await createClient();
  const { error } = await supabase.from("ticket_comments").insert({ ticket_id: ticketId, author_id: user.id, body });
  if (error) redirectWith(ticketId, "commentError", error.message, returnTo);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Додано коментар",
    metadata: { comment_preview: body.slice(0, 120) },
  });

  revalidatePath(`/tickets/${ticketId}`);
  redirectSuccess(ticketId, "commentSuccess", "1", returnTo);
}

export async function updateTicketStatusAction(ticketId: string, formData: FormData) {
  const returnTo = returnToFromForm(formData);
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено", returnTo);
  if (!canEditTicket(profile, ticket)) redirectWith(ticketId, "statusError", "Недостатньо прав для зміни статусу.", returnTo);

  const status = readString(formData, "status") as TicketStatus;
  const allowed: TicketStatus[] = ["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation", "done", "cancelled"];
  if (!allowed.includes(status)) redirectWith(ticketId, "statusError", "Некоректний статус.", returnTo);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message, returnTo);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: statusActionLabels[status],
    metadata: { from: ticket.status, to: status },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirectSuccess(ticketId, "statusSuccess", "1", returnTo);
}

export async function updateTicketCategoryAction(ticketId: string, formData: FormData) {
  const returnTo = returnToFromForm(formData);
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено", returnTo);
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для зміни категорії.", returnTo);

  const categoryId = readString(formData, "categoryId");
  if (!categoryId) redirectWith(ticketId, "statusError", "Оберіть категорію.", returnTo);
  if (categoryId === ticket.category_id) redirectSuccess(ticketId, "statusSuccess", "category", returnTo);

  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id,name,is_active")
    .eq("id", categoryId)
    .eq("is_active", true)
    .maybeSingle();
  if (categoryError) redirectWith(ticketId, "statusError", categoryError.message, returnTo);
  if (!category) redirectWith(ticketId, "statusError", "Активну категорію не знайдено.", returnTo);

  const { error } = await supabase
    .from("tickets")
    .update({ category_id: categoryId, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message, returnTo);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: `Категорію заявки змінено: ${ticket.category?.name ?? "Без категорії"} → ${category.name}`,
    metadata: {
      from_category_id: ticket.category_id,
      to_category_id: categoryId,
      from_category_name: ticket.category?.name ?? null,
      to_category_name: category.name,
      source: "ticket_detail",
    },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/work-planning");
  const sync = await syncTicketPlanningAfterUpdate({ ticketId, actorProfileId: user.id, reason: "category_changed", categoryId });
  if (sync.error) console.warn("[ticket-plan-sync] category sync warning", { ticketId, error: sync.error });
  revalidatePath("/work-planning");
  redirectWithSyncResult(ticketId, sync.data.synced ? "category_plan_synced" : "category", sync.data, returnTo);
}

export async function confirmTicketAction(ticketId: string, formData?: FormData) {
  const returnTo = returnToFromForm(formData);
  const { user } = await requireAuth();
  const result = await confirmTicketWithPlanningDecision(ticketId, {
    actorProfileId: user.id,
    planningMode: "next_week",
    sourceContext: "ticket_detail",
  });
  if (!result.ok) redirectWith(ticketId, "statusError", result.error ?? confirmedPlanWarning(result.planning.reason), returnTo);

  if (result.source === "director_portal") revalidatePath("/director/tickets");
  revalidatePath("/ai-tickets");
  revalidatePath("/work-planning");
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  if (result.planning.warning) redirect(appendSearchParam(appendSearchParam(ticketDetailHref(ticketId, returnTo), "statusSuccess", "confirmed"), "statusWarning", result.planning.warning));
  if (result.planning.reason === "already_planned") redirectSuccess(ticketId, "statusSuccess", "confirmed_already_planned", returnTo);
  redirectSuccess(ticketId, "statusSuccess", "confirmed_planned", returnTo);
}

export async function rejectTicketAction(ticketId: string, formData?: FormData) {
  const returnTo = returnToFromForm(formData);
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено", returnTo);
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для відхилення заявки.", returnTo);
  if (ticket.status !== "pending_review") redirectWith(ticketId, "statusError", "Відхилити можна тільки заявку, що очікує підтвердження.", returnTo);

  const supabase = await createClient();
  const { error } = await supabase.from("tickets").update({ status: "rejected", completed_at: null, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message, returnTo);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Заявку відхилено",
    metadata: { from: ticket.status, to: "rejected" },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirectSuccess(ticketId, "statusSuccess", "rejected", returnTo);
}

export async function assignWorkerAction(ticketId: string, formData: FormData) {
  const startedAt = performance.now();
  const returnTo = returnToFromForm(formData);
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено", returnTo);
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для призначення виконавця.", returnTo);

  const workerId = readString(formData, "workerId");
  if (!workerId) redirectWith(ticketId, "statusError", "Оберіть виконавця.", returnTo);

  const result = await assignTicketToWorker({ ticketId, workerId, actorId: user.id, fromStatus: ticket.status });
  if (result.error) redirectWith(ticketId, "statusError", result.error.message, returnTo);
  const sync = await syncTicketPlanningAfterUpdate({ ticketId, actorProfileId: user.id, reason: "worker_changed", preferredWorkerId: workerId });
  if (sync.error) console.warn("[ticket-plan-sync] worker sync warning", { ticketId, error: sync.error });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/work-planning");
  console.info(`[perf] worker:assign ${Math.round(performance.now() - startedAt)}ms`);
  redirectWithSyncResult(ticketId, sync.data.synced ? "assigned_plan_synced" : "assigned", sync.data, returnTo);
}

export async function unassignWorkerAction(ticketId: string, formData: FormData) {
  const { user, profile } = await requireAuth();
  const returnTo = returnToFromForm(formData);
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) {
    const message = ticketResult.error ?? "Заявку не знайдено";
    redirectWith(ticketId, "statusError", message, returnTo);
  }
  if (!canUnassignWorkerFromTicket(profile)) {
    const message = "Недостатньо прав для зняття виконавця із заявки.";
    redirectWith(ticketId, "statusError", message, returnTo);
  }
  if (!ticket.assignee_worker_id) {
    const message = "У заявки немає призначеного виконавця.";
    redirectWith(ticketId, "statusError", message, returnTo);
  }

  const result = await unassignTicketWorker({
    ticketId,
    actorId: user.id,
    fromStatus: ticket.status,
    workerId: ticket.assignee_worker_id,
  });
  if (result.error) {
    redirectWith(ticketId, "statusError", result.error.message, returnTo);
  }
  const sync = await syncTicketPlanningAfterUpdate({ ticketId, actorProfileId: user.id, reason: "worker_unassigned" });
  if (sync.error) console.warn("[ticket-plan-sync] unassign sync warning", { ticketId, error: sync.error });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/workers");
  revalidatePath("/work-planning");
  if (returnTo) revalidatePath(returnTo.split("?")[0] || "/tickets");
  redirectWithSyncResult(ticketId, sync.data.synced ? "unassigned_plan_synced" : "unassigned", sync.data, returnTo);
}

export async function sendTicketToWorkerAction(ticketId: string, formData: FormData) {
  const startedAt = performance.now();
  const returnTo = returnToFromForm(formData);
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено", returnTo);
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для надсилання заявки виконавцю.", returnTo);

  const workerId = readString(formData, "workerId") || ticket.assignee_worker_id;
  if (!workerId) redirectWith(ticketId, "statusError", "Спочатку призначте виконавця.", returnTo);

  const result = await sendTicketToWorker(ticketId, workerId, user.id);
  if (!result.ok) redirectWith(ticketId, "statusError", result.error, returnTo);

  revalidatePath(`/tickets/${ticketId}`);
  console.info(`[perf] telegram:send_to_worker_action ${Math.round(performance.now() - startedAt)}ms`);
  redirectSuccess(ticketId, "statusSuccess", "sent", returnTo);
}

export async function confirmWorkerCompletionAction(ticketId: string, formData: FormData) {
  const startedAt = performance.now();
  const returnTo = returnToFromForm(formData);
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено", returnTo);
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для підтвердження виконання.", returnTo);
  if (ticket.status !== "waiting_admin_confirmation") redirectWith(ticketId, "statusError", "Заявка не очікує підтвердження виконання.", returnTo);

  const rating = Number(readString(formData, "rating"));
  const safeRating = Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null;
  const feedback = readString(formData, "feedback");
  const result = await confirmWorkerCompletion({ ticketId, actorId: user.id, rating: safeRating, feedback });
  if (result.error) redirectWith(ticketId, "statusError", result.error.message, returnTo);

  if (ticket.assignee_worker_id) {
    const notifyResult = await sendWorkerCompletionConfirmedNotification(ticketId, ticket.assignee_worker_id);
    if (!notifyResult.ok) {
      console.warn("[worker-confirmation] telegram_send_failed", { ticketId, workerId: ticket.assignee_worker_id, reason: notifyResult.error });
    }
  } else {
    console.warn("[worker-confirmation] worker_missing", { ticketId });
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  console.info(`[perf] worker:confirm_completion ${Math.round(performance.now() - startedAt)}ms`);
  redirectSuccess(ticketId, "statusSuccess", "worker_confirmed", returnTo);
}

export async function returnWorkerCompletionAction(ticketId: string, formData: FormData) {
  const returnTo = returnToFromForm(formData);
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено", returnTo);
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для повернення заявки.", returnTo);

  const feedback = readString(formData, "feedback");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({ status: "assigned", admin_feedback: feedback || null, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message, returnTo);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Виконання повернено виконавцю",
    metadata: { from: ticket.status, to: "assigned", feedback: feedback || null },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirectSuccess(ticketId, "statusSuccess", "worker_returned", returnTo);
}

export async function hardDeleteTicketAction(ticketId: string, formData?: FormData) {
  const startedAt = performance.now();
  const { profile } = await requireAuth();
  const returnTo = returnToFromForm(formData);
  if (!canHardDeleteTicket(profile)) deleteErrorRedirect(ticketId, "Повністю видаляти заявки може тільки адміністратор.", returnTo);

  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) deleteErrorRedirect(ticketId, ticketResult.error ?? "Заявку не знайдено", returnTo);

  const supabase = createAdminClient();
  const { data: photos, error: photosLoadError } = await measureAsync("ticket:delete_photos_lookup", () =>
    supabase.from("ticket_photos").select("storage_path").eq("ticket_id", ticketId),
  );
  if (photosLoadError) deleteErrorRedirect(ticketId, photosLoadError.message, returnTo);

  const storagePaths = (photos ?? [])
    .map((photo) => typeof photo.storage_path === "string" ? photo.storage_path : "")
    .filter(Boolean);
  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from("ticket-photos").remove(storagePaths);
    if (storageError) console.error("[ticket-delete] storage cleanup failed", { ticketId, message: storageError.message });
  }

  const dependentDeletes = [
    supabase.from("worker_ticket_actions").delete().eq("ticket_id", ticketId),
    supabase.from("ticket_comments").delete().eq("ticket_id", ticketId),
    supabase.from("ticket_photos").delete().eq("ticket_id", ticketId),
    supabase.from("ticket_history").delete().eq("ticket_id", ticketId),
  ];
  const results = await Promise.all(dependentDeletes);
  const dependencyError = results.find((result) => result.error)?.error;
  if (dependencyError) deleteErrorRedirect(ticketId, dependencyError.message, returnTo);

  const { data: deletedTicket, error } = await supabase.from("tickets").delete().eq("id", ticketId).select("id").maybeSingle();
  if (error) deleteErrorRedirect(ticketId, error.message, returnTo);
  if (!deletedTicket) deleteErrorRedirect(ticketId, "Заявку не видалено: запис не знайдено або delete зачепив 0 рядків.", returnTo);

  revalidatePath("/tickets");
  revalidatePath("/ai-tickets");
  revalidatePath("/workers");
  console.info(`[perf] ticket:delete ${Math.round(performance.now() - startedAt)}ms`);
  redirect(appendSearchParam(returnTo ?? "/tickets", "success", "deleted"));
}
