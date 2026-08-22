"use server";

import { revalidatePath } from "next/cache";
import { canConfirmTicket, canEditTicket, canUnassignWorkerFromTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { getTicket } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { assignTicketToWorker, unassignTicketWorker } from "@/lib/supabase/workers";
import { syncTicketPlanningAfterUpdate } from "@/lib/supabase/work-plans";
import type { TicketStatus } from "@/types/domain";

export type QuickTicketActionResult = {
  ok: boolean;
  message: string;
};

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

const allowedStatuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation", "done", "cancelled"];

function error(message: string): QuickTicketActionResult {
  return { ok: false, message };
}

function success(message: string): QuickTicketActionResult {
  return { ok: true, message };
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateTicketViews(ticketId: string, workPlanId: string) {
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/work-planning");
  revalidatePath(`/work-planning/${workPlanId}`);
}

export async function quickUpdateTicketStatusAction(workPlanId: string, ticketId: string, formData: FormData): Promise<QuickTicketActionResult> {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) return error(ticketResult.error ?? "Заявку не знайдено.");
  if (!canEditTicket(profile, ticket)) return error("Недостатньо прав для зміни статусу.");

  const status = readString(formData, "status") as TicketStatus;
  if (!allowedStatuses.includes(status)) return error("Некоректний статус.");

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("tickets")
    .update({
      status,
      completed_at: status === "done" ? now : null,
      updated_at: now,
    })
    .eq("id", ticketId);
  if (updateError) return error(updateError.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: statusActionLabels[status],
    metadata: { from: ticket.status, to: status, source: "work_plan_quick_modal" },
  });

  revalidateTicketViews(ticketId, workPlanId);
  return success("Статус оновлено.");
}

export async function quickAddTicketCommentAction(workPlanId: string, ticketId: string, formData: FormData): Promise<QuickTicketActionResult> {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) return error(ticketResult.error ?? "Заявку не знайдено.");
  if (!canEditTicket(profile, ticket)) return error("Недостатньо прав для коментаря.");

  const body = readString(formData, "body");
  if (!body) return error("Введіть текст коментаря.");
  if (body.length > 500) return error("Коментар має бути до 500 символів.");

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("ticket_comments").insert({ ticket_id: ticketId, author_id: user.id, body });
  if (insertError) return error(insertError.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Додано коментар",
    metadata: { comment_preview: body.slice(0, 120), source: "work_plan_quick_modal" },
  });

  revalidateTicketViews(ticketId, workPlanId);
  return success("Коментар додано.");
}

export async function quickAssignWorkerAction(workPlanId: string, ticketId: string, formData: FormData): Promise<QuickTicketActionResult> {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) return error(ticketResult.error ?? "Заявку не знайдено.");
  if (!canConfirmTicket(profile)) return error("Недостатньо прав для призначення виконавця.");

  const workerId = readString(formData, "workerId");
  if (!workerId) return error("Оберіть виконавця.");

  const supabase = await createClient();
  const { data: worker, error: workerError } = await supabase.from("workers").select("id,name,is_active").eq("id", workerId).eq("is_active", true).maybeSingle();
  if (workerError) return error(workerError.message);
  if (!worker) return error("Активного виконавця не знайдено.");

  const result = await assignTicketToWorker({ ticketId, workerId, actorId: user.id, fromStatus: ticket.status });
  if (result.error) return error(result.error.message);
  const sync = await syncTicketPlanningAfterUpdate({ ticketId, actorProfileId: user.id, reason: "worker_changed", preferredWorkerId: workerId });
  if (sync.error) console.warn("[ticket-plan-sync] quick worker sync warning", { ticketId, error: sync.error });

  revalidateTicketViews(ticketId, workPlanId);
  revalidatePath("/workers");
  return success(sync.data.synced ? `Виконавця призначено: ${worker.name}. План синхронізовано.` : `Виконавця призначено: ${worker.name}. ${sync.data.warnings[0] ?? ""}`.trim());
}

export async function quickUnassignWorkerAction(workPlanId: string, ticketId: string): Promise<QuickTicketActionResult> {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) return error(ticketResult.error ?? "Заявку не знайдено.");
  if (!canUnassignWorkerFromTicket(profile)) return error("Недостатньо прав для зняття виконавця.");
  if (!ticket.assignee_worker_id) return error("У заявки немає призначеного виконавця.");

  const result = await unassignTicketWorker({
    ticketId,
    actorId: user.id,
    fromStatus: ticket.status,
    workerId: ticket.assignee_worker_id,
  });
  if (result.error) return error(result.error.message);
  const sync = await syncTicketPlanningAfterUpdate({ ticketId, actorProfileId: user.id, reason: "worker_unassigned" });
  if (sync.error) console.warn("[ticket-plan-sync] quick unassign sync warning", { ticketId, error: sync.error });

  revalidateTicketViews(ticketId, workPlanId);
  revalidatePath("/workers");
  return success(sync.data.synced ? "Виконавця знято із заявки. План синхронізовано." : `Виконавця знято із заявки. ${sync.data.warnings[0] ?? ""}`.trim());
}

export async function quickUpdateTicketCategoryAction(workPlanId: string, ticketId: string, formData: FormData): Promise<QuickTicketActionResult> {
  const { user, profile } = await requireAuth();
  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) return error(ticketResult.error ?? "Заявку не знайдено.");
  if (!canConfirmTicket(profile)) return error("Недостатньо прав для зміни категорії.");

  const categoryId = readString(formData, "categoryId");
  if (!categoryId) return error("Оберіть категорію.");
  if (categoryId === ticket.category_id) return success("Категорію не змінено.");

  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id,name,is_active")
    .eq("id", categoryId)
    .eq("is_active", true)
    .maybeSingle();
  if (categoryError) return error(categoryError.message);
  if (!category) return error("Активну категорію не знайдено.");

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("tickets")
    .update({ category_id: categoryId, updated_at: now })
    .eq("id", ticketId);
  if (updateError) return error(updateError.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: `Категорію заявки змінено: ${ticket.category?.name ?? "Без категорії"} → ${category.name}`,
    metadata: {
      from_category_id: ticket.category_id,
      to_category_id: categoryId,
      from_category_name: ticket.category?.name ?? null,
      to_category_name: category.name,
      source: "work_plan_quick_modal",
      note: "Після зміни категорії запускається синхронізація планування.",
    },
  });
  const sync = await syncTicketPlanningAfterUpdate({ ticketId, actorProfileId: user.id, reason: "category_changed", categoryId });
  if (sync.error) console.warn("[ticket-plan-sync] quick category sync warning", { ticketId, error: sync.error });

  revalidateTicketViews(ticketId, workPlanId);
  return success(sync.data.synced ? `Категорію змінено: ${category.name}. План синхронізовано.` : `Категорію змінено: ${category.name}. ${sync.data.warnings[0] ?? ""}`.trim());
}
