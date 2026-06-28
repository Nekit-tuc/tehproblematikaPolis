"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAddTicketPhoto, canConfirmTicket, canEditTicket, canViewTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { getFiles, uploadTicketPhotos } from "@/lib/photos";
import { getTicket } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import type { PhotoType, TicketStatus } from "@/types/domain";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const statusActionLabels: Record<TicketStatus, string> = {
  pending_review: "Статус змінено: Очікує підтвердження",
  new: "Статус змінено: Нова",
  in_progress: "Статус змінено: В роботі",
  waiting: "Статус змінено: Очікує",
  done: "Статус змінено: Виконана",
  cancelled: "Статус змінено: Скасована",
  rejected: "Статус змінено: Відхилена",
};

export async function uploadTicketPhotosAction(ticketId: string, type: PhotoType, formData: FormData) {
  const { profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirect(`/tickets/${ticketId}?photoError=${encodeURIComponent(ticketResult.error ?? "Заявку не знайдено")}`);
  if (!canAddTicketPhoto(profile, ticket, type)) {
    redirect(`/tickets/${ticketId}?photoError=${encodeURIComponent("Недостатньо прав для завантаження фото цього типу.")}`);
  }

  const files = getFiles(formData, "photos");
  if (files.length === 0) redirect(`/tickets/${ticketId}?photoError=${encodeURIComponent("Оберіть хоча б одне фото.")}`);
  const result = await uploadTicketPhotos({ files, profile, ticket, type });
  if (result.error) redirect(`/tickets/${ticketId}?photoError=${encodeURIComponent(result.error)}`);

  revalidatePath(`/tickets/${ticketId}`);
  redirect(`/tickets/${ticketId}?photoSuccess=${type}`);
}

export async function addTicketCommentAction(ticketId: string, formData: FormData) {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirect(`/tickets/${ticketId}?commentError=${encodeURIComponent(ticketResult.error ?? "Заявку не знайдено")}`);
  if (!canViewTicket(profile, ticket)) redirect(`/tickets/${ticketId}?commentError=${encodeURIComponent("Недостатньо прав для коментаря.")}`);

  const body = readString(formData, "body");
  if (!body) redirect(`/tickets/${ticketId}?commentError=${encodeURIComponent("Введіть текст коментаря.")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("ticket_comments").insert({
    ticket_id: ticketId,
    author_id: user.id,
    body,
  });
  if (error) redirect(`/tickets/${ticketId}?commentError=${encodeURIComponent(error.message)}`);

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
  if (!ticket) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent(ticketResult.error ?? "Заявку не знайдено")}`);
  if (!canEditTicket(profile, ticket)) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent("Недостатньо прав для зміни статусу.")}`);

  const status = readString(formData, "status") as TicketStatus;
  const allowed: TicketStatus[] = ["new", "in_progress", "waiting", "done", "cancelled"];
  if (!allowed.includes(status)) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent("Некоректний статус.")}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (error) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent(error.message)}`);

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
  if (!ticket) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent(ticketResult.error ?? "Заявку не знайдено")}`);
  if (!canConfirmTicket(profile)) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent("Недостатньо прав для підтвердження заявки.")}`);
  if (ticket.status !== "pending_review") redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent("Підтвердити можна тільки заявку, що очікує підтвердження.")}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({
      status: "new",
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (error) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent(error.message)}`);

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
  if (!ticket) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent(ticketResult.error ?? "Заявку не знайдено")}`);
  if (!canConfirmTicket(profile)) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent("Недостатньо прав для відхилення заявки.")}`);
  if (ticket.status !== "pending_review") redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent("Відхилити можна тільки заявку, що очікує підтвердження.")}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({
      status: "rejected",
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (error) redirect(`/tickets/${ticketId}?statusError=${encodeURIComponent(error.message)}`);

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
