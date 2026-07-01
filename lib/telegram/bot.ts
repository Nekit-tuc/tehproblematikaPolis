import type { TelegramUpdate } from "./client";
import { handleTelegramCallback } from "./handlers";
import { handleTelegramGroupMessage } from "./group-intake";

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.message) {
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
