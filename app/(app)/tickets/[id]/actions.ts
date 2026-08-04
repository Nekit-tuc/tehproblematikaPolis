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
import { addDirectorTicketToWeeklyDraftPlan } from "@/lib/supabase/director-queries";
import { sendTicketToWorker, sendWorkerCompletionConfirmedNotification } from "@/lib/telegram/worker-notifications";
import type { PhotoType, TicketStatus } from "@/types/domain";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWith(ticketId: string, key: string, message: string): never {
  redirect(`/tickets/${ticketId}?${key}=${encodeURIComponent(message)}`);
}

function appendSearchParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

function deleteErrorRedirect(ticketId: string, message: string, returnTo?: string): never {
  console.error("[ticket-delete] failed", { ticketId, message });
  if (returnTo) redirect(appendSearchParam(returnTo, "error", message));
  redirectWith(ticketId, "statusError", message);
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
  const { profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "photoError", ticketResult.error ?? "Заявку не знайдено");
  if (!canAddTicketPhoto(profile, ticket, type)) redirectWith(ticketId, "photoError", "Недостатньо прав для завантаження фото цього типу.");

  const files = getFiles(formData, "photos");
  if (files.length === 0) redirectWith(ticketId, "photoError", "Оберіть хоча б одне фото.");
  const result = await uploadTicketPhotos({ files, profile, ticket, type });
  if (result.error) redirectWith(ticketId, "photoError", result.error);

  revalidatePath(`/tickets/${ticketId}`);
  console.info(`[perf] ticket:photo_upload ${Math.round(performance.now() - startedAt)}ms`);
  redirect(`/tickets/${ticketId}?photoSuccess=${type}`);
}

export async function addTicketCommentAction(ticketId: string, formData: FormData) {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "commentError", ticketResult.error ?? "Заявку не знайдено");
  if (!canEditTicket(profile, ticket)) redirectWith(ticketId, "commentError", "Недостатньо прав для коментаря.");

  const body = readString(formData, "body");
  if (!body) redirectWith(ticketId, "commentError", "Введіть текст коментаря.");

  const supabase = await createClient();
  const { error } = await supabase.from("ticket_comments").insert({ ticket_id: ticketId, author_id: user.id, body });
  if (error) redirectWith(ticketId, "commentError", error.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Додано коментар",
    metadata: { comment_preview: body.slice(0, 120) },
  });

  revalidatePath(`/tickets/${ticketId}`);
  redirect(`/tickets/${ticketId}?commentSuccess=1`);
}

export async function updateTicketStatusAction(ticketId: string, formData: FormData) {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено");
  if (!canEditTicket(profile, ticket)) redirectWith(ticketId, "statusError", "Недостатньо прав для зміни статусу.");

  const status = readString(formData, "status") as TicketStatus;
  const allowed: TicketStatus[] = ["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation", "done", "cancelled"];
  if (!allowed.includes(status)) redirectWith(ticketId, "statusError", "Некоректний статус.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: statusActionLabels[status],
    metadata: { from: ticket.status, to: status },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticketId}?statusSuccess=1`);
}

export async function updateTicketCategoryAction(ticketId: string, formData: FormData) {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено");
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для зміни категорії.");

  const categoryId = readString(formData, "categoryId");
  if (!categoryId) redirectWith(ticketId, "statusError", "Оберіть категорію.");
  if (categoryId === ticket.category_id) redirect(`/tickets/${ticketId}?statusSuccess=category`);

  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id,name,is_active")
    .eq("id", categoryId)
    .eq("is_active", true)
    .maybeSingle();
  if (categoryError) redirectWith(ticketId, "statusError", categoryError.message);
  if (!category) redirectWith(ticketId, "statusError", "Активну категорію не знайдено.");

  const { error } = await supabase
    .from("tickets")
    .update({ category_id: categoryId, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message);

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
  redirect(`/tickets/${ticketId}?statusSuccess=category`);
}

export async function confirmTicketAction(ticketId: string) {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено");
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для підтвердження заявки.");
  if (ticket.status !== "pending_review") redirectWith(ticketId, "statusError", "Підтвердити можна тільки заявку, що очікує підтвердження.");

  const supabase = await createClient();
  const isDirectorTicket = ticket.source === "director_portal";
  const nextStatus: TicketStatus = isDirectorTicket && ticket.assignee_worker_id ? "assigned" : "new";
  const updatePayload: Record<string, string | null> = {
    status: nextStatus,
    completed_at: null,
    updated_at: new Date().toISOString(),
  };
  if (isDirectorTicket) {
    updatePayload.admin_confirmed_at = new Date().toISOString();
    updatePayload.confirmed_by_profile_id = user.id;
  }

  const { error } = await supabase.from("tickets").update(updatePayload).eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Заявку підтверджено",
    metadata: { from: ticket.status, to: nextStatus, source: isDirectorTicket ? "director_portal" : ticket.source ?? null },
  });

  if (isDirectorTicket) {
    const planResult = await addDirectorTicketToWeeklyDraftPlan(ticketId, user.id);
    if (planResult.error) console.warn("[director] add to plan failed", { ticketId, error: planResult.error });
    revalidatePath("/director/tickets");
    revalidatePath("/work-planning");
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticketId}?statusSuccess=confirmed`);
}

export async function rejectTicketAction(ticketId: string) {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено");
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для відхилення заявки.");
  if (ticket.status !== "pending_review") redirectWith(ticketId, "statusError", "Відхилити можна тільки заявку, що очікує підтвердження.");

  const supabase = await createClient();
  const { error } = await supabase.from("tickets").update({ status: "rejected", completed_at: null, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Заявку відхилено",
    metadata: { from: ticket.status, to: "rejected" },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticketId}?statusSuccess=rejected`);
}

export async function assignWorkerAction(ticketId: string, formData: FormData) {
  const startedAt = performance.now();
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено");
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для призначення виконавця.");

  const workerId = readString(formData, "workerId");
  if (!workerId) redirectWith(ticketId, "statusError", "Оберіть виконавця.");

  const result = await assignTicketToWorker({ ticketId, workerId, actorId: user.id, fromStatus: ticket.status });
  if (result.error) redirectWith(ticketId, "statusError", result.error.message);

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  console.info(`[perf] worker:assign ${Math.round(performance.now() - startedAt)}ms`);
  redirect(`/tickets/${ticketId}?statusSuccess=assigned`);
}

export async function unassignWorkerAction(ticketId: string, formData: FormData) {
  const { user, profile } = await requireAuth();
  const returnTo = readString(formData, "returnTo");
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) {
    const message = ticketResult.error ?? "Заявку не знайдено";
    if (returnTo) redirect(appendSearchParam(returnTo, "statusError", message));
    redirectWith(ticketId, "statusError", message);
  }
  if (!canUnassignWorkerFromTicket(profile)) {
    const message = "Недостатньо прав для зняття виконавця із заявки.";
    if (returnTo) redirect(appendSearchParam(returnTo, "statusError", message));
    redirectWith(ticketId, "statusError", message);
  }
  if (!ticket.assignee_worker_id) {
    const message = "У заявки немає призначеного виконавця.";
    if (returnTo) redirect(appendSearchParam(returnTo, "statusError", message));
    redirectWith(ticketId, "statusError", message);
  }

  const result = await unassignTicketWorker({
    ticketId,
    actorId: user.id,
    fromStatus: ticket.status,
    workerId: ticket.assignee_worker_id,
  });
  if (result.error) {
    if (returnTo) redirect(appendSearchParam(returnTo, "statusError", result.error.message));
    redirectWith(ticketId, "statusError", result.error.message);
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/workers");
  if (returnTo) {
    revalidatePath(returnTo.split("?")[0] || "/workers");
    redirect(appendSearchParam(returnTo, "statusSuccess", "unassigned"));
  }
  redirect(`/tickets/${ticketId}?statusSuccess=unassigned`);
}

export async function sendTicketToWorkerAction(ticketId: string, formData: FormData) {
  const startedAt = performance.now();
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено");
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для надсилання заявки виконавцю.");

  const workerId = readString(formData, "workerId") || ticket.assignee_worker_id;
  if (!workerId) redirectWith(ticketId, "statusError", "Спочатку призначте виконавця.");

  const result = await sendTicketToWorker(ticketId, workerId, user.id);
  if (!result.ok) redirectWith(ticketId, "statusError", result.error);

  revalidatePath(`/tickets/${ticketId}`);
  console.info(`[perf] telegram:send_to_worker_action ${Math.round(performance.now() - startedAt)}ms`);
  redirect(`/tickets/${ticketId}?statusSuccess=sent`);
}

export async function confirmWorkerCompletionAction(ticketId: string, formData: FormData) {
  const startedAt = performance.now();
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено");
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для підтвердження виконання.");
  if (ticket.status !== "waiting_admin_confirmation") redirectWith(ticketId, "statusError", "Заявка не очікує підтвердження виконання.");

  const rating = Number(readString(formData, "rating"));
  const safeRating = Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null;
  const feedback = readString(formData, "feedback");
  const result = await confirmWorkerCompletion({ ticketId, actorId: user.id, rating: safeRating, feedback });
  if (result.error) redirectWith(ticketId, "statusError", result.error.message);

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
  redirect(`/tickets/${ticketId}?statusSuccess=worker_confirmed`);
}

export async function returnWorkerCompletionAction(ticketId: string, formData: FormData) {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено");
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для повернення заявки.");

  const feedback = readString(formData, "feedback");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({ status: "assigned", admin_feedback: feedback || null, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Виконання повернено виконавцю",
    metadata: { from: ticket.status, to: "assigned", feedback: feedback || null },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticketId}?statusSuccess=worker_returned`);
}

export async function hardDeleteTicketAction(ticketId: string, formData?: FormData) {
  const startedAt = performance.now();
  const { profile } = await requireAuth();
  const returnTo = formData ? readString(formData, "returnTo") : "";
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
  redirect("/tickets?success=deleted");
}
