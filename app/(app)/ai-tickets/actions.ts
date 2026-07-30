"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { measureAsync } from "@/lib/performance";
import { createClient } from "@/lib/supabase/server";
import { findRecommendedWorkerForTicket } from "@/lib/supabase/worker-queries";
import { sendTicketToWorker } from "@/lib/telegram/worker-notifications";
import type { TicketPriority } from "@/types/domain";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type PendingAiTicket = {
  id: string;
  status: string;
  source: string | null;
  category_id: string;
  assignee_worker_id: string | null;
};

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function getPendingAiTicket(ticketId: string, label = "ai-ticket:load") {
  const supabase = await createClient();
  const { data, error } = await measureAsync(label, () =>
    supabase
      .from("tickets")
      .select("id, status, source, category_id, assignee_worker_id")
      .eq("id", ticketId)
      .eq("status", "pending_review")
      .in("source", ["telegram_group", "telegram_private_test"])
      .maybeSingle(),
  );

  return {
    supabase,
    ticket: data as PendingAiTicket | null,
    error,
  };
}

async function addHistory(
  supabase: SupabaseClient,
  ticketId: string,
  actorId: string,
  action: string,
  metadata: Record<string, unknown>,
  label = "ai-ticket:history",
) {
  await measureAsync(label, () =>
    supabase.from("ticket_history").insert({
      ticket_id: ticketId,
      actor_id: actorId,
      action,
      metadata,
    }),
  );
}

function revalidateAiTicketViews(ticketId: string) {
  revalidatePath("/ai-tickets");
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
}

export async function confirmAiTicketAction(ticketId: string) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const { supabase, ticket, error } = await getPendingAiTicket(
    ticketId,
    "ai-ticket:confirm:load",
  );
  if (error || !ticket)
    redirect(
      `/ai-tickets?error=${encodeURIComponent("AI-заявку не знайдено або її вже опрацьовано.")}`,
    );

  const existingWorkerResult = ticket.assignee_worker_id
    ? await measureAsync("ai-ticket:confirm:worker", () =>
        supabase
          .from("workers")
          .select("id, name, telegram_id")
          .eq("id", ticket.assignee_worker_id)
          .maybeSingle(),
      )
    : { data: null, error: null };

  if (existingWorkerResult.error)
    redirect(
      `/ai-tickets?error=${encodeURIComponent(existingWorkerResult.error.message)}`,
    );

  const recommendedWorkerResult = existingWorkerResult.data
    ? { data: existingWorkerResult.data, error: null }
    : await measureAsync("ai-ticket:confirm:recommended-worker", () =>
        findRecommendedWorkerForTicket(ticket),
      );

  if (recommendedWorkerResult.error)
    redirect(
      `/ai-tickets?error=${encodeURIComponent(recommendedWorkerResult.error)}`,
    );

  const worker = recommendedWorkerResult.data;
  const autoAssigned = !ticket.assignee_worker_id;
  const now = new Date().toISOString();

  if (!worker) {
    const { error: updateError } = await measureAsync(
      "ai-ticket:confirm:update",
      () =>
        supabase
          .from("tickets")
          .update({ status: "new", updated_at: now })
          .eq("id", ticketId),
    );
    if (updateError)
      redirect(`/ai-tickets?error=${encodeURIComponent(updateError.message)}`);

    await addHistory(
      supabase,
      ticketId,
      user.id,
      "AI-заявку підтверджено без виконавця",
      {
        from: "pending_review",
        to: "new",
        reason: "no_available_worker",
        source: "ai_tickets",
      },
      "ai-ticket:confirm:history",
    );

    revalidateAiTicketViews(ticketId);
    revalidatePath("/dashboard");
    redirect("/ai-tickets?success=confirmed_no_worker");
  }

  const { error: updateError } = await measureAsync(
    "ai-ticket:confirm:update",
    () =>
      supabase
        .from("tickets")
        .update({
          status: "assigned",
          assignee_worker_id: worker.id,
          assigned_at: now,
          updated_at: now,
        })
        .eq("id", ticketId),
  );
  if (updateError)
    redirect(`/ai-tickets?error=${encodeURIComponent(updateError.message)}`);

  await addHistory(
    supabase,
    ticketId,
    user.id,
    "AI-заявку підтверджено та призначено виконавця",
    {
      from: "pending_review",
      to: "assigned",
      worker_id: worker.id,
      worker_name: worker.name,
      auto_assigned: autoAssigned,
      source: "ai_tickets",
    },
    "ai-ticket:confirm:history",
  );

  const telegramResult = await measureAsync("ai-ticket:confirm:telegram", () =>
    sendTicketToWorker(ticketId, worker.id, user.id),
  );
  revalidateAiTicketViews(ticketId);
  revalidatePath("/workers");
  revalidatePath("/dashboard");

  if (telegramResult.ok) redirect("/ai-tickets?success=confirmed_sent");

  await addHistory(
    supabase,
    ticketId,
    user.id,
    "Не вдалося автоматично надіслати заявку виконавцю в Telegram",
    {
      source: "ai_tickets",
      worker_id: worker.id,
      worker_name: worker.name,
      error: telegramResult.error,
    },
    "ai-ticket:confirm:telegram-error-history",
  );
  redirect(
    `/ai-tickets?error=${encodeURIComponent(`Заявку підтверджено і призначено, але Telegram не надіслано: ${telegramResult.error}`)}`,
  );
}

export async function rejectAiTicketAction(ticketId: string) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const { supabase, ticket, error } = await getPendingAiTicket(
    ticketId,
    "ai-ticket:reject:load",
  );
  if (error || !ticket)
    redirect(
      `/ai-tickets?error=${encodeURIComponent("AI-заявку не знайдено або її вже опрацьовано.")}`,
    );

  const { error: updateError } = await measureAsync(
    "ai-ticket:reject:update",
    () =>
      supabase
        .from("tickets")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", ticketId),
  );
  if (updateError)
    redirect(`/ai-tickets?error=${encodeURIComponent(updateError.message)}`);

  await addHistory(
    supabase,
    ticketId,
    user.id,
    "AI-заявку відхилено",
    { from: "pending_review", to: "rejected", source: "ai_tickets" },
    "ai-ticket:reject:history",
  );
  revalidatePath("/ai-tickets");
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect("/ai-tickets?success=rejected");
}

export async function updateAiTicketAction(
  ticketId: string,
  formData: FormData,
) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const { supabase, ticket, error } = await getPendingAiTicket(
    ticketId,
    "ai-ticket:update:load",
  );
  if (error || !ticket)
    redirect(
      `/ai-tickets?error=${encodeURIComponent("AI-заявку не знайдено або її вже опрацьовано.")}`,
    );

  const title = text(formData, "title");
  const description = text(formData, "description");
  const objectId = text(formData, "object_id");
  const categoryId = text(formData, "category_id");
  const priority = text(formData, "priority") as TicketPriority;
  const recommendedDepartment = text(formData, "recommended_department");

  if (!title || !description || !objectId || !categoryId || !priority) {
    redirect(
      `/ai-tickets?error=${encodeURIComponent("Заповніть назву, опис, обʼєкт, категорію та пріоритет.")}`,
    );
  }

  const { error: updateError } = await measureAsync("ai-ticket:update", () =>
    supabase
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
      .eq("id", ticketId),
  );
  if (updateError)
    redirect(`/ai-tickets?error=${encodeURIComponent(updateError.message)}`);

  await addHistory(
    supabase,
    ticketId,
    user.id,
    "AI-заявку відредаговано перед підтвердженням",
    {
      source: "ai_tickets",
      status: "pending_review",
    },
    "ai-ticket:update:history",
  );
  revalidatePath("/ai-tickets");
  revalidatePath(`/tickets/${ticketId}`);
  redirect("/ai-tickets?success=updated");
}

export async function assignWorkerToAiTicketAction(
  ticketId: string,
  formData: FormData,
) {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const workerId = text(formData, "worker_id");
  if (!workerId)
    redirect(`/ai-tickets?error=${encodeURIComponent("Оберіть виконавця.")}`);

  const supabase = await createClient();
  const [
    { data: ticket, error: ticketError },
    { data: worker, error: workerError },
  ] = await Promise.all([
    measureAsync("ai-ticket:assign-worker:ticket", () =>
      supabase
        .from("tickets")
        .select("id, status, source")
        .eq("id", ticketId)
        .maybeSingle(),
    ),
    measureAsync("ai-ticket:assign-worker:worker", () =>
      supabase
        .from("workers")
        .select("id, name, is_active")
        .eq("id", workerId)
        .eq("is_active", true)
        .maybeSingle(),
    ),
  ]);

  if (ticketError || !ticket)
    redirect(
      `/ai-tickets?error=${encodeURIComponent("AI-заявку не знайдено.")}`,
    );
  if (
    !Array.from(["telegram_group", "telegram_private_test"]).includes(
      ticket.source ?? "",
    )
  ) {
    redirect(
      `/ai-tickets?error=${encodeURIComponent("Це не AI-заявка Telegram.")}`,
    );
  }
  if (workerError || !worker)
    redirect(
      `/ai-tickets?error=${encodeURIComponent("Активного виконавця не знайдено.")}`,
    );

  const now = new Date().toISOString();
  const { error: updateError } = await measureAsync(
    "ai-ticket:assign-worker",
    () =>
      supabase
        .from("tickets")
        .update({
          assignee_worker_id: worker.id,
          assigned_at: now,
          updated_at: now,
        })
        .eq("id", ticketId),
  );
  if (updateError)
    redirect(`/ai-tickets?error=${encodeURIComponent(updateError.message)}`);

  await addHistory(
    supabase,
    ticketId,
    user.id,
    `Призначено виконавця: ${worker.name}`,
    {
      source: "ai_tickets",
      worker_id: worker.id,
      worker_name: worker.name,
    },
    "ai-ticket:assign-worker:history",
  );

  revalidatePath("/ai-tickets");
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  redirect("/ai-tickets?success=worker_assigned");
}
