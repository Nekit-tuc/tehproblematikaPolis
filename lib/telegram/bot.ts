import type { TelegramUpdate } from "./client";
import { handleTelegramCallback } from "./handlers";
import { handleTelegramGroupMessage } from "./group-intake";

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.message) {
    const result = await handleTelegramGroupMessage(update.message);
    if (result.handled && !result.created) console.info("[telegram-group-intake]", result.reason);
    if (result.handled && result.created) console.info("[telegram-group-intake] created", result.numbers);
  }
  if (update.callback_query) await handleTelegramCallback(update.callback_query);
}
