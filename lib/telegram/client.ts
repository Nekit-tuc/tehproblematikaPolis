type InlineButton = { text: string; callback_data?: string; url?: string };

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: { id: number; type?: "private" | "group" | "supergroup" | "channel"; title?: string };
  from?: TelegramUser;
  text?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

function token() {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return value;
}

async function telegramRequest<T>(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !data.ok) throw new Error(data.description ?? `Telegram ${method} failed`);
  return data.result as T;
}

export async function sendTelegramMessage(chatId: string | number, text: string, keyboard?: InlineButton[][]) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    disable_web_page_preview: true,
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function getTelegramFileUrl(fileId: string) {
  const file = await telegramRequest<{ file_path: string }>("getFile", { file_id: fileId });
  return `https://api.telegram.org/file/bot${token()}/${file.file_path}`;
}

export async function downloadTelegramFile(fileId: string) {
  const url = await getTelegramFileUrl(fileId);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Не вдалося завантажити фото з Telegram.");
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const bytes = await response.arrayBuffer();
  return { bytes, contentType };
}

export function chunkButtons(buttons: InlineButton[], size = 2) {
  const rows: InlineButton[][] = [];
  for (let index = 0; index < buttons.length; index += size) {
    rows.push(buttons.slice(index, index + size));
  }
  return rows;
}
