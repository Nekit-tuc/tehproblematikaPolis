import { createAdminClient } from "@/lib/supabase/admin";
import { answerCallbackQuery, type TelegramCallbackQuery } from "@/lib/telegram/client";

export async function handleWorkerDoneCallback(callback: TelegramCallbackQuery) {
  const data = callback.data ?? "";
  const token = data.startsWith("wd:") ? data.slice(3).trim() : "";

  if (!token) {
    await answerCallbackQuery(callback.id, "Некоректна кнопка.");
    return { handled: true, ok: false, reason: "invalid_worker_done_payload" } as const;
  }

  const supabase = createAdminClient();
  const { data: action, error: actionError } = await supabase
    .from("worker_ticket_actions")
    .select("*, ticket:tickets(*), worker:workers(*)")
    .eq("token", token)
    .maybeSingle();

  if (actionError || !action) {
    await answerCallbackQuery(callback.id, "Кнопка вже недійсна або не знайдена.");
    console.warn("[telegram-worker]", { result: "rejected", reason: actionError?.message ?? "token_not_found", callbackDataLength: Buffer.byteLength(data, "utf8") });
    return { handled: true, ok: false, reason: "token_not_found" } as const;
  }

  const ticket = action.ticket;
  const worker = action.worker;
  const ticketId = action.ticket_id as string;
  const workerId = action.worker_id as string;

  if (action.action !== "worker_done") {
    await answerCallbackQuery(callback.id, "Некоректна дія.");
    return { handled: true, ok: false, reason: "invalid_action" } as const;
  }

  if (action.used_at) {
    await answerCallbackQuery(callback.id, "Цю дію вже виконано.");
    return { handled: true, ok: false, reason: "token_already_used" } as const;
  }

  if (action.expires_at && new Date(action.expires_at).getTime() < Date.now()) {
    await answerCallbackQuery(callback.id, "Термін дії кнопки завершився.");
    return { handled: true, ok: false, reason: "token_expired" } as const;
  }

  if (!ticket || ticket.assignee_worker_id !== workerId) {
    await answerCallbackQuery(callback.id, "Заявка вже не призначена цьому виконавцю.");
    console.warn("[telegram-worker]", { result: "rejected", reason: "assignment_mismatch", ticketId, workerId });
    return { handled: true, ok: false, reason: "assignment_mismatch" } as const;
  }

  if (worker?.telegram_id && String(worker.telegram_id) !== String(callback.from.id)) {
    await answerCallbackQuery(callback.id, "Ця заявка призначена іншому виконавцю.");
    console.warn("[telegram-worker]", { result: "rejected", reason: "telegram_id_mismatch", ticketId, workerId, telegramUserId: callback.from.id });
    return { handled: true, ok: false, reason: "telegram_id_mismatch" } as const;
  }

  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("tickets")
    .update({ status: "waiting_admin_confirmation", worker_completed_at: now, updated_at: now })
    .eq("id", ticketId)
    .eq("assignee_worker_id", workerId);

  if (updateResult.error) {
    await answerCallbackQuery(callback.id, "Не вдалося оновити заявку.");
    console.error("[telegram-worker]", { result: "error", reason: updateResult.error.message, ticketId, workerId });
    return { handled: true, ok: false, reason: updateResult.error.message } as const;
  }

  await supabase.from("worker_ticket_actions").update({ used_at: now }).eq("id", action.id);
  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: null,
    action: "Виконавець позначив заявку виконаною",
    metadata: { worker_id: workerId, telegram_user_id: String(callback.from.id), to: "waiting_admin_confirmation", action_token_id: action.id },
  });

  await answerCallbackQuery(callback.id, "Готово. Заявку передано адміністратору на підтвердження.");
  console.info("[telegram-worker]", { result: "worker_done", ticketId, workerId, callbackDataLength: Buffer.byteLength(data, "utf8") });
  return { handled: true, ok: true, reason: "worker_done" } as const;
}
