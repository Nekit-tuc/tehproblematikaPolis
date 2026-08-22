import { sendWorkerCompletedPush } from "@/lib/push/send-push-notification";
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
  title?: string | null;
  description?: string | null;
  status: string;
  assignee_worker_id?: string | null;
  object?: { name?: string | null; address?: string | null } | { name?: string | null; address?: string | null }[] | null;
};

type WorkerRecord = {
  id: string;
  name?: string | null;
  telegram_id?: string | null;
};

function tokenPreview(token: string) {
  if (!token) return null;
  return `${token.slice(0, 4)}...${token.slice(-3)}`;
}

function logWorkerCallback(payload: Record<string, unknown>) {
  console.info("[worker-done-callback]", payload);
}
async function sendWorkerCompletedPushSafely(ticket: WorkerTicket, worker: WorkerRecord) {
  try {
    await Promise.race([
      sendWorkerCompletedPush(ticket, worker),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch (error) {
    console.error("[push] worker completed push failed", {
      ticketId: ticket.id,
      workerId: worker.id,
      error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    });
  }
}

export async function handleWorkerDoneCallback(callback: TelegramCallbackQuery) {
  const callbackData = callback.data ?? "";
  const callbackDataLength = Buffer.byteLength(callbackData, "utf8");
  const callbackDataPrefix = callbackData.split(":")[0] || "unknown";
  const token = callbackData.startsWith("wd:") ? callbackData.slice(3).trim() : "";

  logWorkerCallback({
    handled: true,
    stage: "received",
    callbackDataPrefix,
    callbackDataLength,
    tokenPreview: tokenPreview(token),
    actionFound: false,
  });

  if (!token) {
    await answerCallbackQuery(callback.id, "Некоректна кнопка.");
    logWorkerCallback({ handled: true, result: "invalid_payload", callbackDataPrefix, callbackDataLength, tokenPreview: null });
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
    logWorkerCallback({
      handled: true,
      stage: "action_not_found",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: false,
      result: "token_not_found",
      error: actionError?.message ?? null,
    });
    return { handled: true, ok: false, reason: "token_not_found" } as const;
  }

  const ticketId = action.ticket_id;
  const workerId = action.worker_id;
  logWorkerCallback({
    handled: true,
    stage: "action_found",
    callbackDataPrefix,
    callbackDataLength,
    tokenPreview: tokenPreview(token),
    actionFound: true,
    ticketId,
    workerId,
    action: action.action,
    usedAtBefore: action.used_at ?? null,
  });

  if (action.action !== "worker_done") {
    await answerCallbackQuery(callback.id, "Некоректна дія.");
    logWorkerCallback({
      handled: true,
      stage: "invalid_action",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: true,
      ticketId,
      workerId,
      action: action.action,
      result: "invalid_action",
    });
    return { handled: true, ok: false, reason: "invalid_action" } as const;
  }

  if (action.used_at) {
    await answerCallbackQuery(callback.id, "Ця кнопка вже була використана або неактуальна. Скористайтесь останнім повідомленням з планом.");
    logWorkerCallback({
      handled: true,
      stage: "already_used",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: true,
      ticketId,
      workerId,
      usedAtBefore: action.used_at,
      result: "token_already_used",
    });
    return { handled: true, ok: false, reason: "token_already_used" } as const;
  }

  if (action.expires_at && new Date(action.expires_at).getTime() < Date.now()) {
    await answerCallbackQuery(callback.id, "Дія вже неактуальна. Скористайтесь останнім повідомленням з планом.");
    logWorkerCallback({
      handled: true,
      stage: "expired",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: true,
      ticketId,
      workerId,
      usedAtBefore: action.used_at ?? null,
      result: "token_expired",
    });
    return { handled: true, ok: false, reason: "token_expired" } as const;
  }

  const [{ data: ticketRow, error: ticketError }, { data: workerRow, error: workerError }] = await Promise.all([
    supabase.from("tickets").select("id,number,title,description,status,assignee_worker_id,object:objects(name,address)").eq("id", ticketId).maybeSingle(),
    supabase.from("workers").select("id,name,telegram_id").eq("id", workerId).maybeSingle(),
  ]);

  const ticket = ticketRow as WorkerTicket | null;
  const worker = workerRow as WorkerRecord | null;

  if (ticketError || !ticket) {
    await answerCallbackQuery(callback.id, "Заявку не знайдено.");
    logWorkerCallback({
      handled: true,
      stage: "ticket_not_found",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: true,
      ticketId,
      workerId,
      result: "ticket_not_found",
      error: ticketError?.message ?? null,
    });
    return { handled: true, ok: false, reason: "ticket_not_found" } as const;
  }

  if (workerError || !worker) {
    await answerCallbackQuery(callback.id, "Виконавця не знайдено.");
    logWorkerCallback({
      handled: true,
      stage: "worker_not_found",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: true,
      ticketId,
      workerId,
      result: "worker_not_found",
      error: workerError?.message ?? null,
    });
    return { handled: true, ok: false, reason: "worker_not_found" } as const;
  }

  if (ticket.status === "waiting_admin_confirmation" || ticket.status === "done") {
    const now = new Date().toISOString();
    await supabase.from("worker_ticket_actions").update({ used_at: now }).eq("id", action.id);
    await answerCallbackQuery(callback.id, "Заявка вже позначена як виконана або підтверджена.");
    logWorkerCallback({
      handled: true,
      stage: "already_marked_done",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: true,
      ticketId,
      workerId,
      previousStatus: ticket.status,
      newStatus: ticket.status,
      result: "ticket_already_marked_done",
    });
    return { handled: true, ok: false, reason: "ticket_already_marked_done" } as const;
  }

  if (ticket.assignee_worker_id !== workerId) {
    await answerCallbackQuery(callback.id, "Ви не призначені виконавцем цієї заявки.");
    logWorkerCallback({
      handled: true,
      stage: "assignment_mismatch",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: true,
      ticketId,
      workerId,
      previousStatus: ticket.status,
      currentAssigneeWorkerId: ticket.assignee_worker_id,
      result: "assignment_mismatch",
    });
    return { handled: true, ok: false, reason: "assignment_mismatch" } as const;
  }

  if (worker.telegram_id && String(worker.telegram_id) !== String(callback.from.id)) {
    await answerCallbackQuery(callback.id, "Ця заявка призначена іншому виконавцю.");
    logWorkerCallback({
      handled: true,
      stage: "telegram_id_mismatch",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: true,
      ticketId,
      workerId,
      previousStatus: ticket.status,
      telegramUserId: callback.from.id,
      result: "telegram_id_mismatch",
    });
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
    logWorkerCallback({
      handled: true,
      stage: "ticket_update_failed",
      callbackDataPrefix,
      callbackDataLength,
      tokenPreview: tokenPreview(token),
      actionFound: true,
      ticketId,
      workerId,
      previousStatus: ticket.status,
      newStatus,
      result: "ticket_update_failed",
      error: updateResult.error.message,
    });
    return { handled: true, ok: false, reason: updateResult.error.message } as const;
  }

  await supabase.from("worker_ticket_actions").update({ used_at: now }).eq("id", action.id);
  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: null,
    action: "Виконавець позначив заявку як виконану через Telegram",
    metadata: {
      worker_id: workerId,
      telegram_user_id: String(callback.from.id),
      previous_status: ticket.status,
      new_status: newStatus,
      action_token_id: action.id,
    },
  });

  await answerCallbackQuery(callback.id, `Заявку ${ticket.number ?? ""} позначено як виконану. Очікується підтвердження адміністратора.`);
  if (callback.message?.chat.id) {
    const { data: planItem } = await supabase
      .from("work_plan_items")
      .select("work_plan_id, work_plan:work_plans!inner(id,status)")
      .eq("ticket_id", ticketId)
      .eq("worker_id", workerId)
      .in("work_plan.status", ["draft", "sent", "partially_done"])
      .limit(1)
      .maybeSingle();
    const planId = (planItem as { work_plan_id?: string | null } | null)?.work_plan_id ?? null;
    await sendTelegramMessage(
      callback.message.chat.id,
      [
        `✅ Заявку ${ticket.number ?? ""} позначено як виконану.`,
        "Вона очікує підтвердження.",
      ].join("\n"),
      planId ? [
        [{ text: "📋 До заявок в роботі", callback_data: `wm:a:${planId}:0` }],
        [{ text: "⏳ На підтвердженні", callback_data: `wm:p:${planId}:0` }],
        [{ text: "📅 Меню", callback_data: `wm:m:${planId}` }],
      ] : undefined,
    );
  }

  await sendWorkerCompletedPushSafely(ticket, worker);

  logWorkerCallback({
    handled: true,
    stage: "completed",
    tokenPreview: tokenPreview(token),
    actionFound: true,
    ticketId,
    workerId,
    previousStatus: ticket.status,
    newStatus,
    callbackDataPrefix,
    callbackDataLength,
    usedAtBefore: action.used_at ?? null,
    result: "worker_done_completed",
  });

  return { handled: true, ok: true, reason: "worker_done_completed" } as const;
}
