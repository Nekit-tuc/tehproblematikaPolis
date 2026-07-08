import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram/client";

type SendResult = { ok: true } | { ok: false; error: string };

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function createActionToken() {
  return randomBytes(9).toString("base64url");
}

async function createWorkerDoneToken(ticketId: string, workerId: string) {
  const supabase = createAdminClient();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const token = createActionToken();
    const { error } = await supabase.from("worker_ticket_actions").insert({
      token,
      ticket_id: ticketId,
      worker_id: workerId,
      action: "worker_done",
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    });

    if (!error) {
      console.info("[telegram-worker]", { result: "token_created", ticketId, workerId, tokenLength: token.length });
      return { token, error: null };
    }

    if (!error.message.toLowerCase().includes("duplicate")) return { token: null, error: error.message };
  }

  return { token: null, error: "Не вдалося створити короткий Telegram token." };
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
  if (!worker.telegram_id) {
    console.warn("[telegram-worker]", {
      result: "send_skipped",
      reason: "telegram_not_connected",
      ticketId,
      workerId,
      hasTelegramUsername: Boolean(worker.telegram_username),
    });
    return { ok: false, error: "У виконавця не підключено Telegram. Він має відкрити бота і натиснути /start." };
  }

  if (ticket.assignee_worker_id !== workerId) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("tickets")
      .update({ assignee_worker_id: workerId, assigned_at: now, status: "assigned", updated_at: now })
      .eq("id", ticketId);
    if (error) return { ok: false, error: error.message };
  }

  const tokenResult = await createWorkerDoneToken(ticketId, workerId);
  if (!tokenResult.token) return { ok: false, error: tokenResult.error ?? "Не вдалося створити Telegram token." };

  const callbackData = `wd:${tokenResult.token}`;
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

  console.info("[telegram-worker]", {
    result: "send_attempt",
    ticketId,
    workerId,
    callbackDataLength: Buffer.byteLength(callbackData, "utf8"),
    tokenCreated: true,
  });

  try {
    await sendTelegramMessage(worker.telegram_id, text, [
      [
        ...(url ? [{ text: "Відкрити заявку", url }] : []),
        { text: "Виконав", callback_data: callbackData },
      ],
    ]);
  } catch (error) {
    console.error("[telegram-worker]", {
      result: "send_error",
      ticketId,
      workerId,
      callbackDataLength: Buffer.byteLength(callbackData, "utf8"),
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "Telegram send failed" };
  }

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
    metadata: { worker_id: workerId, callback_data_length: Buffer.byteLength(callbackData, "utf8") },
  });

  console.info("[telegram-worker]", {
    result: "send_success",
    ticketId,
    workerId,
    callbackDataLength: Buffer.byteLength(callbackData, "utf8"),
  });
  return { ok: true };
}
