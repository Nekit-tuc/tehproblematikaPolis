"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAddTicketPhoto, canConfirmTicket, canEditTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { getFiles, uploadTicketPhotos } from "@/lib/photos";
import { getTicket } from "@/lib/supabase/queries";
import { assignTicketToWorker, confirmWorkerCompletion } from "@/lib/supabase/workers";
import { createClient } from "@/lib/supabase/server";
import { sendTicketToWorker } from "@/lib/telegram/worker-notifications";
import type { PhotoType, TicketStatus } from "@/types/domain";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWith(ticketId: string, key: string, message: string): never {
  redirect(`/tickets/${ticketId}?${key}=${encodeURIComponent(message)}`);
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

export async function confirmTicketAction(ticketId: string) {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено");
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для підтвердження заявки.");
  if (ticket.status !== "pending_review") redirectWith(ticketId, "statusError", "Підтвердити можна тільки заявку, що очікує підтвердження.");

  const supabase = await createClient();
  const { error } = await supabase.from("tickets").update({ status: "new", completed_at: null, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) redirectWith(ticketId, "statusError", error.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Заявку підтверджено",
    metadata: { from: ticket.status, to: "new" },
  });

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
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticketId}?statusSuccess=assigned`);
}

export async function sendTicketToWorkerAction(ticketId: string, formData: FormData) {
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
  redirect(`/tickets/${ticketId}?statusSuccess=sent`);
}

export async function confirmWorkerCompletionAction(ticketId: string, formData: FormData) {
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

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
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
