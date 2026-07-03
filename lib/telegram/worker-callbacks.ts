import { createAdminClient } from "@/lib/supabase/admin";
import { answerCallbackQuery, type TelegramCallbackQuery } from "@/lib/telegram/client";

export async function handleWorkerDoneCallback(callback: TelegramCallbackQuery) {
  const data = callback.data ?? "";
  const [, ticketId, workerId] = data.split(":");
  if (!ticketId || !workerId) {
    await answerCallbackQuery(callback.id, "Некоректна кнопка.");
    return { handled: true, ok: false, reason: "invalid_worker_done_payload" } as const;
  }

  const supabase = createAdminClient();
  const { data: worker, error: workerError } = await supabase.from("workers").select("*").eq("id", workerId).maybeSingle();
  if (workerError || !worker) {
    await answerCallbackQuery(callback.id, "Виконавця не знайдено.");
    return { handled: true, ok: false, reason: "worker_not_found" } as const;
  }

  if (worker.telegram_id && String(worker.telegram_id) !== String(callback.from.id)) {
    await answerCallbackQuery(callback.id, "Ця заявка призначена іншому виконавцю.");
    console.warn("[telegram-worker]", { result: "rejected", reason: "telegram_id_mismatch", ticketId, workerId, telegramUserId: callback.from.id });
    return { handled: true, ok: false, reason: "telegram_id_mismatch" } as const;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("tickets")
    .update({ status: "waiting_admin_confirmation", worker_completed_at: now, updated_at: now })
    .eq("id", ticketId)
    .eq("assignee_worker_id", workerId);
  if (error) {
    await answerCallbackQuery(callback.id, "Не вдалося оновити заявку.");
    console.error("[telegram-worker]", { result: "error", reason: error.message, ticketId, workerId });
    return { handled: true, ok: false, reason: error.message } as const;
  }

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: null,
    action: "Виконавець позначив заявку виконаною",
    metadata: { worker_id: workerId, telegram_user_id: String(callback.from.id), to: "waiting_admin_confirmation" },
  });

  await answerCallbackQuery(callback.id, "Готово. Заявку передано адміністратору на підтвердження.");
  console.info("[telegram-worker]", { result: "worker_done", ticketId, workerId });
  return { handled: true, ok: true, reason: "worker_done" } as const;
}
