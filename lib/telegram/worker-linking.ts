import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage, type TelegramMessage } from "@/lib/telegram/client";

type WorkerLookupRow = {
  id: string;
  name: string;
  telegram_username?: string | null;
};

const messages = {
  usernameNotFound: "\u0412\u0430\u0448 Telegram username \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e \u0432 \u0441\u0438\u0441\u0442\u0435\u043c\u0456. \u0417\u0432\u0435\u0440\u043d\u0456\u0442\u044c\u0441\u044f \u0434\u043e \u0430\u0434\u043c\u0456\u043d\u0456\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430.",
  linkFailed: "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u043f\u0456\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u0438 Telegram. \u0417\u0432\u0435\u0440\u043d\u0456\u0442\u044c\u0441\u044f \u0434\u043e \u0430\u0434\u043c\u0456\u043d\u0456\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430.",
  linked: "Telegram \u043f\u0456\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e. \u0422\u0435\u043f\u0435\u0440 \u0432\u0438 \u0431\u0443\u0434\u0435\u0442\u0435 \u043e\u0442\u0440\u0438\u043c\u0443\u0432\u0430\u0442\u0438 \u0437\u0430\u044f\u0432\u043a\u0438 \u0442\u0443\u0442.",
};

function normalizeTelegramUsername(username?: string | null) {
  return (username ?? "").trim().replace(/^@+/, "").toLowerCase();
}

export async function linkWorkerTelegramFromStart(message: TelegramMessage) {
  const chatId = message.chat.id;
  const telegramUserId = message.from?.id;
  const username = normalizeTelegramUsername(message.from?.username);

  if (!telegramUserId || !username) {
    await sendTelegramMessage(chatId, messages.usernameNotFound);
    console.info("[telegram-worker-link]", {
      result: "username_missing",
      chatId: String(chatId),
      telegramUserId: telegramUserId ? String(telegramUserId) : null,
    });
    return { handled: true, linked: false, reason: "worker_username_missing" } as const;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workers")
    .select("id,name,telegram_username")
    .not("telegram_username", "is", null);

  if (error) {
    console.error("[telegram-worker-link]", {
      result: "lookup_failed",
      chatId: String(chatId),
      telegramUserId: String(telegramUserId),
      username,
      error: error.message,
    });
    await sendTelegramMessage(chatId, messages.linkFailed);
    return { handled: true, linked: false, reason: "worker_lookup_failed" } as const;
  }

  const workers = (data ?? []) as WorkerLookupRow[];
  const worker = workers.find((item) => normalizeTelegramUsername(item.telegram_username) === username);

  if (!worker) {
    await sendTelegramMessage(chatId, messages.usernameNotFound);
    console.info("[telegram-worker-link]", {
      result: "worker_not_found",
      chatId: String(chatId),
      telegramUserId: String(telegramUserId),
      username,
    });
    return { handled: true, linked: false, reason: "worker_not_found_by_username" } as const;
  }

  const { error: updateError } = await supabase
    .from("workers")
    .update({ telegram_id: String(chatId), updated_at: new Date().toISOString() })
    .eq("id", worker.id);

  if (updateError) {
    console.error("[telegram-worker-link]", {
      result: "update_failed",
      workerId: worker.id,
      chatId: String(chatId),
      telegramUserId: String(telegramUserId),
      username,
      error: updateError.message,
    });
    await sendTelegramMessage(chatId, messages.linkFailed);
    return { handled: true, linked: false, reason: "worker_update_failed" } as const;
  }

  await sendTelegramMessage(chatId, messages.linked);
  console.info("[telegram-worker-link]", {
    result: "linked",
    workerId: worker.id,
    chatId: String(chatId),
    telegramUserId: String(telegramUserId),
    username,
  });
  return { handled: true, linked: true, workerId: worker.id, reason: "worker_telegram_linked" } as const;
}
