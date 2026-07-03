import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram/client";

type SendResult = { ok: true } | { ok: false; error: string };

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export async function sendTicketToWorker(ticketId: string, workerId: string, actorId?: string | null): Promise<SendResult> {
  const supabase = createAdminClient();
  const [{ data: ticket, error: ticketError }, { data: worker, error: workerError }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, object:objects(*), category:categories(*)")
      .eq("id", ticketId)
      .maybeSingle(),
    supabase.from("workers").select("*").eq("id", workerId).maybeSingle(),
  ]);

  if (ticketError) return { ok: false, error: ticketError.message };
  if (workerError) return { ok: false, error: workerError.message };
  if (!ticket) return { ok: false, error: "Заявку не знайдено." };
  if (!worker) return { ok: false, error: "Виконавця не знайдено." };
  if (!worker.telegram_id) return { ok: false, error: "У виконавця не вказано Telegram ID." };

  if (ticket.assignee_worker_id !== workerId) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("tickets")
      .update({ assignee_worker_id: workerId, assigned_at: now, status: "assigned", updated_at: now })
      .eq("id", ticketId);
    if (error) return { ok: false, error: error.message };
  }

  const url = appUrl() ? `${appUrl()}/tickets/${ticketId}` : undefined;
  const text = [
    `Нова заявка ${ticket.number}`,
    "",
    `Об'єкт: ${ticket.object?.name ?? "-"}`,
    `Адреса: ${ticket.object?.address ?? "-"}`,
    `Категорія: ${ticket.category?.name ?? "-"}`,
    `Пріоритет: ${ticket.priority}`,
    "",
    ticket.title,
    ticket.description,
  ].join("\n");

  await sendTelegramMessage(worker.telegram_id, text, [
    [
      ...(url ? [{ text: "Відкрити заявку", url }] : []),
      { text: "Виконав", callback_data: `worker_done:${ticketId}:${workerId}` },
    ],
  ]);

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("tickets")
    .update({ sent_to_worker_at: now, updated_at: now })
    .eq("id", ticketId)
    .eq("assignee_worker_id", workerId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: actorId ?? null,
    action: "Заявку надіслано виконавцю в Telegram",
    metadata: { worker_id: workerId },
  });

  console.info("[telegram-worker]", { result: "sent", ticketId, workerId });
  return { ok: true };
}
