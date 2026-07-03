import { createClient } from "@/lib/supabase/server";
import type { TicketStatus } from "@/types/domain";

export type WorkerPayload = {
  name: string;
  phone?: string | null;
  telegram_username?: string | null;
  telegram_id?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export async function createWorker(payload: WorkerPayload) {
  const supabase = await createClient();
  return supabase
    .from("workers")
    .insert({
      name: payload.name,
      phone: payload.phone || null,
      telegram_username: payload.telegram_username || null,
      telegram_id: payload.telegram_id || null,
      notes: payload.notes || null,
      is_active: payload.is_active ?? true,
    })
    .select("*")
    .single();
}

export async function updateWorker(workerId: string, payload: WorkerPayload) {
  const supabase = await createClient();
  return supabase
    .from("workers")
    .update({
      name: payload.name,
      phone: payload.phone || null,
      telegram_username: payload.telegram_username || null,
      telegram_id: payload.telegram_id || null,
      notes: payload.notes || null,
      is_active: payload.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workerId)
    .select("*")
    .single();
}

export async function deactivateWorker(workerId: string) {
  const supabase = await createClient();
  return supabase.from("workers").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", workerId);
}

export async function assignCategoriesToWorker(workerId: string, categoryIds: string[]) {
  const supabase = await createClient();
  const uniqueCategoryIds = Array.from(new Set(categoryIds.filter(Boolean)));
  const deleteResult = await supabase.from("worker_categories").delete().eq("worker_id", workerId);
  if (deleteResult.error) return deleteResult;
  if (uniqueCategoryIds.length === 0) return { data: null, error: null };
  return supabase.from("worker_categories").insert(
    uniqueCategoryIds.map((categoryId) => ({
      worker_id: workerId,
      category_id: categoryId,
    })),
  );
}

export async function assignTicketToWorker({
  ticketId,
  workerId,
  actorId,
  fromStatus,
}: {
  ticketId: string;
  workerId: string;
  actorId?: string | null;
  fromStatus?: TicketStatus;
}) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("tickets")
    .update({
      assignee_worker_id: workerId,
      assigned_at: now,
      status: "assigned",
      updated_at: now,
    })
    .eq("id", ticketId);
  if (updateResult.error) return updateResult;

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: actorId ?? null,
    action: "Призначено виконавця",
    metadata: { worker_id: workerId, from: fromStatus, to: "assigned" },
  });

  return updateResult;
}

export async function markTicketSentToWorker(ticketId: string, workerId: string, actorId?: string | null) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("tickets")
    .update({ sent_to_worker_at: now, updated_at: now })
    .eq("id", ticketId)
    .eq("assignee_worker_id", workerId);
  if (updateResult.error) return updateResult;

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: actorId ?? null,
    action: "Заявку надіслано виконавцю в Telegram",
    metadata: { worker_id: workerId },
  });

  return updateResult;
}

export async function markWorkerCompletedTicket(ticketId: string, workerId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("tickets")
    .update({
      status: "waiting_admin_confirmation",
      worker_completed_at: now,
      updated_at: now,
    })
    .eq("id", ticketId)
    .eq("assignee_worker_id", workerId);
  if (updateResult.error) return updateResult;

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: null,
    action: "Виконавець позначив заявку виконаною",
    metadata: { worker_id: workerId, to: "waiting_admin_confirmation" },
  });

  return updateResult;
}

export async function confirmWorkerCompletion({
  ticketId,
  actorId,
  rating,
  feedback,
}: {
  ticketId: string;
  actorId?: string | null;
  rating?: number | null;
  feedback?: string | null;
}) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("tickets")
    .update({
      status: "done",
      completed_at: now,
      admin_confirmed_at: now,
      admin_rating: rating ?? null,
      admin_feedback: feedback || null,
      updated_at: now,
    })
    .eq("id", ticketId);
  if (updateResult.error) return updateResult;

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: actorId ?? null,
    action: "Адміністратор підтвердив виконання",
    metadata: { to: "done", rating: rating ?? null, feedback: feedback || null },
  });

  return updateResult;
}
