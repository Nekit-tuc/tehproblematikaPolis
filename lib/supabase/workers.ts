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

export async function deleteOrDeactivateWorker(workerId: string) {
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("assignee_worker_id", workerId);
  if (countError) return { data: null, error: countError, mode: null as "deleted" | "deactivated" | null };

  if ((count ?? 0) > 0) {
    const result = await supabase
      .from("workers")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", workerId);
    return { data: result.data, error: result.error, mode: result.error ? null : "deactivated" as const };
  }

  const actionDelete = await supabase.from("worker_ticket_actions").delete().eq("worker_id", workerId);
  if (actionDelete.error) return { data: null, error: actionDelete.error, mode: null as "deleted" | "deactivated" | null };

  const categoriesDelete = await supabase.from("worker_categories").delete().eq("worker_id", workerId);
  if (categoriesDelete.error) return { data: null, error: categoriesDelete.error, mode: null as "deleted" | "deactivated" | null };

  const workerDelete = await supabase.from("workers").delete().eq("id", workerId);
  return { data: workerDelete.data, error: workerDelete.error, mode: workerDelete.error ? null : "deleted" as const };
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

export async function unassignTicketWorker({
  ticketId,
  actorId,
  fromStatus,
  workerId,
}: {
  ticketId: string;
  actorId?: string | null;
  fromStatus?: TicketStatus;
  workerId?: string | null;
}) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const nextStatus: TicketStatus = fromStatus === "assigned" || fromStatus === "waiting_admin_confirmation" ? "new" : (fromStatus ?? "new");
  const updateResult = await supabase
    .from("tickets")
    .update({
      assignee_worker_id: null,
      assigned_at: null,
      sent_to_worker_at: null,
      worker_completed_at: null,
      status: nextStatus,
      updated_at: now,
    })
    .eq("id", ticketId);
  if (updateResult.error) return updateResult;

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: actorId ?? null,
    action: "Виконавця знято із заявки",
    metadata: { worker_id: workerId ?? null, from: fromStatus, to: nextStatus },
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
