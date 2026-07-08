import type { TelegramUpdate } from "./client";
import { answerCallbackQuery } from "./client";
import { handleTelegramCallback, isLegacyTelegramCallbackData } from "./handlers";
import { handleTelegramGroupMessage } from "./group-intake";
import { handleWorkerDoneCallback } from "./worker-callbacks";
import { linkWorkerTelegramFromStart } from "./worker-linking";

function callbackPrefix(data: string) {
  return data.split(":")[0] || "unknown";
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    const data = update.callback_query.data ?? "";
    const callbackDataLength = Buffer.byteLength(data, "utf8");

    if (data.startsWith("wd:")) {
      console.info("[telegram-callback-router]", {
        updateId: update.update_id,
        callbackDataPrefix: "wd",
        callbackDataLength,
        route: "worker_done",
      });
      await handleWorkerDoneCallback(update.callback_query);
      return { handled: true, created: false, reason: "worker_done_callback" } as const;
    }

    if (!isLegacyTelegramCallbackData(data)) {
      console.warn("[telegram-callback-router]", {
        updateId: update.update_id,
        callbackDataPrefix: callbackPrefix(data),
        callbackDataLength,
        route: "unsupported_callback",
      });
      await answerCallbackQuery(update.callback_query.id, "Ця дія вже неактуальна або не підтримується.");
      return { handled: true, created: false, reason: "unsupported_callback_query" } as const;
    }

    console.info("[telegram-callback-router]", {
      updateId: update.update_id,
      callbackDataPrefix: callbackPrefix(data),
      callbackDataLength,
      route: "legacy_ticket_flow",
    });
    await handleTelegramCallback(update.callback_query);
    return { handled: true, created: false, reason: "callback_query_processed" } as const;
  }

  if (update.message) {
    const isPrivate = update.message.chat.type === "private";

    if (isPrivate && update.message.text?.trim() === "/start") {
      const linkResult = await linkWorkerTelegramFromStart(update.message);
      return { handled: true, created: false, reason: linkResult.reason } as const;
    }

    const result = await handleTelegramGroupMessage(update.message);
    if (result.handled && !result.created) console.info("[telegram-group-intake]", result.reason);
    if (result.handled && result.created) console.info("[telegram-group-intake] created", result.numbers);
    return result;
  }

  return { handled: false, created: false, reason: "unsupported_update" } as const;
}
