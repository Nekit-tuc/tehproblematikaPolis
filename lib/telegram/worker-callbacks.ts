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

type ActivePlanItem = {
  work_plan_id: string;
  worker_id?: string | null;
  work_plan?: { id?: string | null; status?: string | null } | { id?: string | null; status?: string | null }[] | null;
};

type WorkerDoneReasonCode =
  | "ticket_completed"
  | "ticket_not_found"
  | "worker_not_found"
  | "telegram_worker_mismatch"
  | "waiting_admin_confirmation"
  | "done"
  | "pending_review"
  | "rejected"
  | "cancelled"
  | "status_not_allowed"
  | "assignment_mismatch"
  | "moved_to_other_worker"
  | "stale_active_plan"
  | "ticket_update_failed";

type WorkerDoneResult = {
  success: boolean;
  reasonCode: WorkerDoneReasonCode;
  message: string;
  ticket?: WorkerTicket;
  worker?: WorkerRecord;
  previousStatus?: string;
  newStatus?: string;
  activePlanId?: string | null;
  error?: string | null;
};

const WORKER_DONE_ALLOWED_STATUSES = ["new", "assigned", "in_progress", "waiting"];
const ACTIVE_WORK_PLAN_STATUSES = ["draft", "sent", "partially_done"];

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

function blockedStatusResult(ticket: WorkerTicket): WorkerDoneResult | null {
  if (ticket.status === "waiting_admin_confirmation") {
    return {
      success: false,
      reasonCode: "waiting_admin_confirmation",
      message: "Ця заявка вже позначена як виконана і очікує підтвердження.",
      ticket,
      previousStatus: ticket.status,
    };
  }
  if (ticket.status === "done") {
    return {
      success: false,
      reasonCode: "done",
      message: "Ця заявка вже виконана.",
      ticket,
      previousStatus: ticket.status,
    };
  }
  if (ticket.status === "pending_review") {
    return {
      success: false,
      reasonCode: "pending_review",
      message: "Ця заявка ще не підтверджена адміністратором.",
      ticket,
      previousStatus: ticket.status,
    };
  }
  if (ticket.status === "rejected") {
    return {
      success: false,
      reasonCode: "rejected",
      message: "Ця заявка відхилена і не може бути виконана.",
      ticket,
      previousStatus: ticket.status,
    };
  }
  if (ticket.status === "cancelled") {
    return {
      success: false,
      reasonCode: "cancelled",
      message: "Ця заявка скасована і не може бути виконана.",
      ticket,
      previousStatus: ticket.status,
    };
  }
  if (!WORKER_DONE_ALLOWED_STATUSES.includes(ticket.status)) {
    return {
      success: false,
      reasonCode: "status_not_allowed",
      message: "Ця заявка зараз не може бути позначена як виконана.",
      ticket,
      previousStatus: ticket.status,
    };
  }
  return null;
}

async function completeTicketFromWorkerTelegram(input: {
  supabase: ReturnType<typeof createAdminClient>;
  action: WorkerTicketAction;
  telegramUserId: number | string;
  source: "old_callback" | "worker_menu";
}): Promise<WorkerDoneResult> {
  const { supabase, action, telegramUserId, source } = input;
  const ticketId = action.ticket_id;
  const workerId = action.worker_id;
  const telegramId = String(telegramUserId);

  const [
    { data: ticketRow, error: ticketError },
    { data: workerRow, error: workerError },
    { data: telegramWorkerRow },
    { data: activePlanRows, error: activePlanError },
  ] = await Promise.all([
    supabase.from("tickets").select("id,number,title,description,status,assignee_worker_id,object:objects(name,address)").eq("id", ticketId).maybeSingle(),
    supabase.from("workers").select("id,name,telegram_id").eq("id", workerId).maybeSingle(),
    supabase.from("workers").select("id,name,telegram_id").eq("telegram_id", telegramId).maybeSingle(),
    supabase
      .from("work_plan_items")
      .select("work_plan_id,worker_id,work_plan:work_plans!inner(id,status)")
      .eq("ticket_id", ticketId)
      .in("work_plan.status", ACTIVE_WORK_PLAN_STATUSES),
  ]);

  const ticket = ticketRow as WorkerTicket | null;
  const worker = workerRow as WorkerRecord | null;
  const telegramWorker = telegramWorkerRow as WorkerRecord | null;
  const activePlanItems = ((activePlanRows ?? []) as ActivePlanItem[]).filter((item) => {
    const plan = firstRelation(item.work_plan);
    return plan?.status ? ACTIVE_WORK_PLAN_STATUSES.includes(plan.status) : true;
  });

  if (ticketError || !ticket) {
    return { success: false, reasonCode: "ticket_not_found", message: "Заявку не знайдено.", error: ticketError?.message ?? null };
  }
  if (workerError || !worker) {
    return { success: false, reasonCode: "worker_not_found", message: "Виконавця не знайдено.", ticket, error: workerError?.message ?? null };
  }

  const statusResult = blockedStatusResult(ticket);
  if (statusResult) {
    return { ...statusResult, worker };
  }

  if (!telegramWorker || telegramWorker.id !== worker.id || (worker.telegram_id && String(worker.telegram_id) !== telegramId)) {
    return {
      success: false,
      reasonCode: "telegram_worker_mismatch",
      message: "Ця заявка призначена іншому виконавцю.",
      ticket,
      worker,
      previousStatus: ticket.status,
    };
  }

  const sameWorkerActiveItems = activePlanItems.filter((item) => item.worker_id === worker.id);
  const otherWorkerActiveItems = activePlanItems.filter((item) => item.worker_id && item.worker_id !== worker.id);
  const activePlanId = sameWorkerActiveItems[0]?.work_plan_id ?? null;

  if (otherWorkerActiveItems.length > 0 && sameWorkerActiveItems.length === 0) {
    return {
      success: false,
      reasonCode: "moved_to_other_worker",
      message: "Ця заявка перенесена в інший план або до іншого виконавця. Відкрийте актуальний план.",
      ticket,
      worker,
      previousStatus: ticket.status,
    };
  }

  if (ticket.assignee_worker_id && ticket.assignee_worker_id !== worker.id) {
    return {
      success: false,
      reasonCode: "assignment_mismatch",
      message: "Ця заявка вже закріплена за іншим виконавцем.",
      ticket,
      worker,
      previousStatus: ticket.status,
    };
  }

  if (!ticket.assignee_worker_id && sameWorkerActiveItems.length === 0) {
    return {
      success: false,
      reasonCode: "stale_active_plan",
      message: "Ця заявка вже не входить до актуального плану. Відкрийте новий план робіт.",
      ticket,
      worker,
      previousStatus: ticket.status,
    };
  }

  if (activePlanError) {
    console.warn("[worker-done-callback]", {
      stage: "active_plan_lookup_warning",
      ticketId,
      workerId,
      reasonCode: "active_plan_lookup_failed",
      error: activePlanError.message,
    });
  }

  const now = new Date().toISOString();
  const newStatus = "waiting_admin_confirmation";
  let updateQuery = supabase
    .from("tickets")
    .update({ status: newStatus, worker_completed_at: now, updated_at: now })
    .eq("id", ticketId)
    .in("status", WORKER_DONE_ALLOWED_STATUSES);

  if (ticket.assignee_worker_id === worker.id) {
    updateQuery = updateQuery.eq("assignee_worker_id", worker.id);
  }

  const { data: updatedTicket, error: updateError } = await updateQuery.select("id").maybeSingle();
  if (updateError || !updatedTicket) {
    return {
      success: false,
      reasonCode: "ticket_update_failed",
      message: "Не вдалося оновити заявку. Відкрийте актуальний план робіт і спробуйте ще раз.",
      ticket,
      worker,
      previousStatus: ticket.status,
      newStatus,
      activePlanId,
      error: updateError?.message ?? "Ticket status or assignment changed before update.",
    };
  }

  await supabase.from("worker_ticket_actions").update({ used_at: now }).eq("id", action.id);
  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: null,
    action: "Виконавець позначив заявку як виконану через Telegram",
    metadata: {
      worker_id: workerId,
      telegram_user_id: telegramId,
      previous_status: ticket.status,
      new_status: newStatus,
      action_token_id: action.id,
      source,
    },
  });

  return {
    success: true,
    reasonCode: "ticket_completed",
    message: `✅ Заявку ${ticket.number ?? ""} позначено як виконану. Вона очікує підтвердження.`,
    ticket,
    worker,
    previousStatus: ticket.status,
    newStatus,
    activePlanId,
  };
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

  const completion = await completeTicketFromWorkerTelegram({
    supabase,
    action,
    telegramUserId: callback.from.id,
    source: "old_callback",
  });

  await answerCallbackQuery(callback.id, completion.message);
  logWorkerCallback({
    handled: true,
    stage: completion.success ? "completed" : "blocked",
    tokenPreview: tokenPreview(token),
    actionFound: true,
    ticketId,
    workerId,
    previousStatus: completion.previousStatus ?? null,
    newStatus: completion.newStatus ?? completion.previousStatus ?? null,
    callbackDataPrefix,
    callbackDataLength,
    usedAtBefore: action.used_at ?? null,
    reasonCode: completion.reasonCode,
    result: completion.reasonCode,
    success: completion.success,
    error: completion.error ?? null,
  });

  if (!completion.success || !completion.ticket || !completion.worker) {
    return { handled: true, ok: false, reason: completion.reasonCode } as const;
  }

  const ticket = completion.ticket;
  const worker = completion.worker;
  const newStatus = completion.newStatus ?? "waiting_admin_confirmation";

  if (callback.message?.chat.id) {
    const planId = completion.activePlanId ?? null;
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
    stage: "push_sent",
    tokenPreview: tokenPreview(token),
    actionFound: true,
    ticketId,
    workerId,
    previousStatus: completion.previousStatus,
    newStatus,
    callbackDataPrefix,
    callbackDataLength,
    usedAtBefore: action.used_at ?? null,
    result: "worker_done_completed",
  });

  return { handled: true, ok: true, reason: "worker_done_completed" } as const;
}
