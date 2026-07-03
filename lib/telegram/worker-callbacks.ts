import { createAdminClient } from "@/lib/supabase/admin";
import { answerCallbackQuery, sendTelegramMessage, type TelegramCallbackQuery } from "@/lib/telegram/client";

type WorkerTicketAction = {
  id: string;
  token: string;
  ticket_id: string;
  worker_id: string;
  action: string;
  used_at?: string | null;
  expires_at?: string | null;
};

type WorkerTicket = {
  id: string;
  number: string;
  status: string;
  assignee_worker_id?: string | null;
};

type WorkerRecord = {
  id: string;
  telegram_id?: string | null;
};

function logWorkerCallback(payload: Record<string, unknown>) {
  console.info("[telegram-worker-callback]", payload);
}

export async function handleWorkerDoneCallback(callback: TelegramCallbackQuery) {
  const callbackData = callback.data ?? "";
  const callbackDataLength = Buffer.byteLength(callbackData, "utf8");
  const token = callbackData.startsWith("wd:") ? callbackData.slice(3).trim() : "";

  logWorkerCallback({ handled: true, stage: "received", callbackData, callbackDataLength, token });

  if (!token) {
    await answerCallbackQuery(callback.id, "Некоректна кнопка.");
    return { handled: true, ok: false, reason: "invalid_worker_done_payload" } as const;
  }

  const supabase = createAdminClient();
  const { data: actionRow, error: actionError } = await supabase
    .from("worker_ticket_actions")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  const action = actionRow as WorkerTicketAction | null;
  if (actionError || !action) {
    await answerCallbackQuery(callback.id, "Кнопка недійсна або застаріла.");
    logWorkerCallback({ handled: true, stage: "action_not_found", callbackData, callbackDataLength, token, error: actionError?.message ?? null });
    return { handled: true, ok: false, reason: "token_not_found" } as const;
  }

  const ticketId = action.ticket_id;
  const workerId = action.worker_id;
  logWorkerCallback({ handled: true, stage: "action_found", token, ticketId, workerId, action: action.action });

  if (action.action !== "worker_done") {
    await answerCallbackQuery(callback.id, "Некоректна дія.");
    return { handled: true, ok: false, reason: "invalid_action" } as const;
  }

  if (action.used_at) {
    await answerCallbackQuery(callback.id, "Ця дія вже була виконана.");
    logWorkerCallback({ handled: true, stage: "already_used", token, ticketId, workerId });
    return { handled: true, ok: false, reason: "token_already_used" } as const;
  }

  if (action.expires_at && new Date(action.expires_at).getTime() < Date.now()) {
    await answerCallbackQuery(callback.id, "Кнопка недійсна або застаріла.");
    logWorkerCallback({ handled: true, stage: "expired", token, ticketId, workerId });
    return { handled: true, ok: false, reason: "token_expired" } as const;
  }

  const [{ data: ticketRow, error: ticketError }, { data: workerRow, error: workerError }] = await Promise.all([
    supabase.from("tickets").select("id,number,status,assignee_worker_id").eq("id", ticketId).maybeSingle(),
    supabase.from("workers").select("id,telegram_id").eq("id", workerId).maybeSingle(),
  ]);

  const ticket = ticketRow as WorkerTicket | null;
  const worker = workerRow as WorkerRecord | null;

  if (ticketError || !ticket) {
    await answerCallbackQuery(callback.id, "Заявку не знайдено.");
    logWorkerCallback({ handled: true, stage: "ticket_not_found", token, ticketId, workerId, error: ticketError?.message ?? null });
    return { handled: true, ok: false, reason: "ticket_not_found" } as const;
  }

  if (workerError || !worker) {
    await answerCallbackQuery(callback.id, "Виконавця не знайдено.");
    logWorkerCallback({ handled: true, stage: "worker_not_found", token, ticketId, workerId, error: workerError?.message ?? null });
    return { handled: true, ok: false, reason: "worker_not_found" } as const;
  }

  if (ticket.status === "done") {
    await answerCallbackQuery(callback.id, "Заявка вже завершена.");
    logWorkerCallback({ handled: true, stage: "already_completed", token, ticketId, workerId, previousStatus: ticket.status });
    return { handled: true, ok: false, reason: "ticket_already_completed" } as const;
  }

  if (ticket.assignee_worker_id !== workerId) {
    await answerCallbackQuery(callback.id, "Заявка вже не призначена цьому виконавцю.");
    logWorkerCallback({ handled: true, stage: "assignment_mismatch", token, ticketId, workerId, currentAssigneeWorkerId: ticket.assignee_worker_id });
    return { handled: true, ok: false, reason: "assignment_mismatch" } as const;
  }

  if (worker.telegram_id && String(worker.telegram_id) !== String(callback.from.id)) {
    await answerCallbackQuery(callback.id, "Ця заявка призначена іншому виконавцю.");
    logWorkerCallback({ handled: true, stage: "telegram_id_mismatch", token, ticketId, workerId, telegramUserId: callback.from.id });
    return { handled: true, ok: false, reason: "telegram_id_mismatch" } as const;
  }

  const now = new Date().toISOString();
  const newStatus = "waiting_admin_confirmation";
  const updateResult = await supabase
    .from("tickets")
    .update({ status: newStatus, worker_completed_at: now, updated_at: now })
    .eq("id", ticketId)
    .eq("assignee_worker_id", workerId);

  if (updateResult.error) {
    await answerCallbackQuery(callback.id, "Не вдалося оновити заявку.");
    logWorkerCallback({ handled: false, stage: "ticket_update_failed", token, ticketId, workerId, error: updateResult.error.message });
    return { handled: true, ok: false, reason: updateResult.error.message } as const;
  }

  await supabase.from("worker_ticket_actions").update({ used_at: now }).eq("id", action.id);
  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: null,
    action: "Виконавець позначив заявку як виконану",
    metadata: {
      worker_id: workerId,
      telegram_user_id: String(callback.from.id),
      previous_status: ticket.status,
      new_status: newStatus,
      action_token_id: action.id,
    },
  });

  await answerCallbackQuery(callback.id, "Заявку позначено як виконану. Очікується підтвердження адміністратора.");
  if (callback.message?.chat.id) {
    await sendTelegramMessage(callback.message.chat.id, "✅ Виконання зафіксовано. Очікується підтвердження адміністратора.");
  }

  logWorkerCallback({
    handled: true,
    stage: "completed",
    token,
    ticketId,
    workerId,
    previousStatus: ticket.status,
    newStatus,
    callbackData,
    callbackDataLength,
  });

  return { handled: true, ok: true, reason: "worker_done_callback" } as const;
}
