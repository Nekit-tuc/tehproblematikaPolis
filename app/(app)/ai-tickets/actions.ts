"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { TicketPriority } from "@/types/domain";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function getPendingAiTicket(ticketId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("id, status, source")
    .eq("id", ticketId)
    .eq("status", "pending_review")
    .in("source", ["telegram_group", "telegram_private_test"])
    .maybeSingle();
  return { supabase, ticket: data as { id: string; status: string; source: string | null } | null, error };
}

async function addHistory(ticketId: string, actorId: string, action: string, metadata: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: actorId,
    action,
    metadata,
  });
}

export async function confirmAiTicketAction(ticketId: string) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const { supabase, ticket, error } = await getPendingAiTicket(ticketId);
  if (error || !ticket) redirect(`/ai-tickets?error=${encodeURIComponent("AI-заявку не знайдено або її вже опрацьовано.")}`);

  const { error: updateError } = await supabase
    .from("tickets")
    .update({ status: "new", updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (updateError) redirect(`/ai-tickets?error=${encodeURIComponent(updateError.message)}`);

  await addHistory(ticketId, user.id, "AI-заявку підтверджено", { from: "pending_review", to: "new", source: "ai_tickets" });
  revalidatePath("/ai-tickets");
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect("/ai-tickets?success=confirmed");
}

export async function rejectAiTicketAction(ticketId: string) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const { supabase, ticket, error } = await getPendingAiTicket(ticketId);
  if (error || !ticket) redirect(`/ai-tickets?error=${encodeURIComponent("AI-заявку не знайдено або її вже опрацьовано.")}`);

  const { error: updateError } = await supabase
    .from("tickets")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (updateError) redirect(`/ai-tickets?error=${encodeURIComponent(updateError.message)}`);

  await addHistory(ticketId, user.id, "AI-заявку відхилено", { from: "pending_review", to: "rejected", source: "ai_tickets" });
  revalidatePath("/ai-tickets");
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect("/ai-tickets?success=rejected");
}

export async function updateAiTicketAction(ticketId: string, formData: FormData) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const { supabase, ticket, error } = await getPendingAiTicket(ticketId);
  if (error || !ticket) redirect(`/ai-tickets?error=${encodeURIComponent("AI-заявку не знайдено або її вже опрацьовано.")}`);

  const title = text(formData, "title");
  const description = text(formData, "description");
  const objectId = text(formData, "object_id");
  const categoryId = text(formData, "category_id");
  const priority = text(formData, "priority") as TicketPriority;
  const recommendedDepartment = text(formData, "recommended_department");

  if (!title || !description || !objectId || !categoryId || !priority) {
    redirect(`/ai-tickets?error=${encodeURIComponent("Заповніть назву, опис, обʼєкт, категорію та пріоритет.")}`);
  }

  const { error: updateError } = await supabase
    .from("tickets")
    .update({
      title,
      description,
      object_id: objectId,
      category_id: categoryId,
      priority,
      recommended_department: recommendedDepartment || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (updateError) redirect(`/ai-tickets?error=${encodeURIComponent(updateError.message)}`);

  await addHistory(ticketId, user.id, "AI-заявку відредаговано перед підтвердженням", {
    source: "ai_tickets",
    status: "pending_review",
  });
  revalidatePath("/ai-tickets");
  revalidatePath(`/tickets/${ticketId}`);
  redirect("/ai-tickets?success=updated");
}

export async function assignWorkerToAiTicketAction(ticketId: string, formData: FormData) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const workerId = text(formData, "worker_id");
  if (!workerId) redirect(`/ai-tickets?error=${encodeURIComponent("Оберіть виконавця.")}`);

  const supabase = await createClient();
  const [{ data: ticket, error: ticketError }, { data: worker, error: workerError }] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, status, source")
      .eq("id", ticketId)
      .maybeSingle(),
    supabase
      .from("workers")
      .select("id, name, is_active")
      .eq("id", workerId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (ticketError || !ticket) redirect(`/ai-tickets?error=${encodeURIComponent("AI-заявку не знайдено.")}`);
  if (!["telegram_group", "telegram_private_test"].includes(ticket.source ?? "")) {
    redirect(`/ai-tickets?error=${encodeURIComponent("Це не AI-заявка Telegram.")}`);
  }
  if (workerError || !worker) redirect(`/ai-tickets?error=${encodeURIComponent("Активного виконавця не знайдено.")}`);

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("tickets")
    .update({
      assignee_worker_id: worker.id,
      assigned_at: now,
      updated_at: now,
    })
    .eq("id", ticketId);
  if (updateError) redirect(`/ai-tickets?error=${encodeURIComponent(updateError.message)}`);

  await addHistory(ticketId, user.id, `Призначено виконавця: ${worker.name}`, {
    source: "ai_tickets",
    worker_id: worker.id,
    worker_name: worker.name,
  });

  revalidatePath("/ai-tickets");
  revalidatePath("/tickets");
  revalidatePath("/workers");
  revalidatePath(`/workers/${worker.id}`);
  revalidatePath(`/tickets/${ticketId}`);
  redirect("/ai-tickets?success=worker_assigned");
}
