import type { TelegramUpdate } from "./client";
import { sendTelegramMessage } from "./client";
import { handleTelegramCallback } from "./handlers";
import { handleTelegramGroupMessage } from "./group-intake";

function allowedPrivateTestUserIds() {
  return new Set(
    (process.env.TELEGRAM_TEST_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isAllowedPrivateTestUser(userId: number | undefined) {
  return Boolean(userId && allowedPrivateTestUserIds().has(String(userId)));
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.message) {
    const isPrivate = update.message.chat.type === "private";
    const allowedPrivateTestUser = isAllowedPrivateTestUser(update.message.from?.id);
    if (isPrivate && update.message.text?.trim() === "/start") {
      if (!allowedPrivateTestUser) {
        console.info("[telegram-private-test]", { chatType: "private", userId: update.message.from?.id ? String(update.message.from.id) : null, allowedPrivateTestUser, result: "ignored", reason: "private_user_not_allowed" });
        return { handled: true, created: false, reason: "private_user_not_allowed" } as const;
      }
      await sendTelegramMessage(update.message.chat.id, "Привіт. Це тестовий режим Service Desk AI. Надішли текст заявки, і я створю AI-заявку на перевірку.");
      console.info("[telegram-private-test]", { chatType: "private", userId: String(update.message.from?.id), allowedPrivateTestUser, result: "processed", reason: "start_message_sent" });
      return { handled: true, created: false, reason: "start_message_sent" } as const;
    }

    const result = await handleTelegramGroupMessage(update.message);
    if (result.handled && !result.created) console.info("[telegram-group-intake]", result.reason);
    if (result.handled && result.created) console.info("[telegram-group-intake] created", result.numbers);
    return result;
  }
  if (update.callback_query) {
    await handleTelegramCallback(update.callback_query);
    return { handled: true, created: false, reason: "callback_query_processed" } as const;
  }
  return { handled: false, created: false, reason: "unsupported_update" } as const;
}
