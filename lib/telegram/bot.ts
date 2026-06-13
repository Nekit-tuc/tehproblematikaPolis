import type { Profile } from "@/types/domain";
import { answerCallbackQuery, chunkButtons, sendTelegramMessage, type TelegramCallbackQuery, type TelegramMessage, type TelegramUpdate } from "./client";
import { clearTelegramSession, getTelegramSession, saveTelegramSession, type TelegramSessionRecord, type TelegramTicketPayload } from "./session";
import { buildTelegramTicketSummary, createTicketFromTelegram, findTelegramProfile, getActiveCategories, getAvailableObjects, ticketUrl } from "./tickets";

const MAX_TELEGRAM_PHOTOS = 5;

function telegramIdFromMessage(message: TelegramMessage) {
  return message.from?.id ? String(message.from.id) : null;
}

function telegramIdFromCallback(callback: TelegramCallbackQuery) {
  return String(callback.from.id);
}

async function requireProfile(telegramId: string, chatId: number) {
  const profile = await findTelegramProfile(telegramId);
  if (!profile) {
    await sendTelegramMessage(chatId, "Ваш Telegram ще не прив'язаний до системи. Зверніться до адміністратора.");
    return null;
  }
  return profile;
}

async function showMainMenu(chatId: number, profile: Profile) {
  const objects = await getAvailableObjects(profile);
  const objectText = objects.length === 1 ? `\nВаш об'єкт: ${objects[0].name}` : "";
  await sendTelegramMessage(chatId, `Вітаю, ${profile.full_name}.${objectText}`, [[{ text: "Створити заявку", callback_data: "ticket:start" }]]);
}

async function startTicket(chatId: number, telegramId: string, profile: Profile) {
  const objects = await getAvailableObjects(profile);
  if (objects.length === 0) {
    await sendTelegramMessage(chatId, "До вашого профілю не прив'язано активний об'єкт. Зверніться до адміністратора.");
    return;
  }

  const payload: TelegramTicketPayload = {};
  if (objects.length === 1) {
    payload.object_id = objects[0].id;
    await saveTelegramSession({ telegram_id: telegramId, step: "category", payload });
    await showCategories(chatId);
    return;
  }

  await saveTelegramSession({ telegram_id: telegramId, step: "object", payload });
  await sendTelegramMessage(
    chatId,
    "Оберіть об'єкт:",
    chunkButtons(objects.map((object) => ({ text: object.name, callback_data: `object:${object.id}` })), 1),
  );
}

async function showCategories(chatId: number) {
  const categories = await getActiveCategories();
  if (categories.length === 0) {
    await sendTelegramMessage(chatId, "У системі немає активних категорій. Адміністратор має додати категорії в налаштуваннях або виконати seed.");
    return;
  }

  await sendTelegramMessage(
    chatId,
    "Оберіть категорію:",
    chunkButtons(categories.map((category) => ({ text: category.name, callback_data: `category:${category.id}` })), 1),
  );
}

async function showPhotoStep(chatId: number) {
  await sendTelegramMessage(chatId, "Надішліть до 5 фото проблеми або пропустіть цей крок.", [[{ text: "Пропустити фото", callback_data: "photos:done" }]]);
}

async function showConfirmation(chatId: number, session: TelegramSessionRecord, profile: Profile) {
  const summary = await buildTelegramTicketSummary(session.payload, profile);
  await saveTelegramSession({ ...session, step: "confirm" });
  await sendTelegramMessage(chatId, summary, [
    [{ text: "Створити заявку", callback_data: "ticket:confirm" }],
    [{ text: "Скасувати", callback_data: "ticket:cancel" }],
  ]);
}

async function handleMessage(message: TelegramMessage) {
  const telegramId = telegramIdFromMessage(message);
  if (!telegramId) return;
  const chatId = message.chat.id;
  const profile = await requireProfile(telegramId, chatId);
  if (!profile) return;

  if (message.text === "/start") {
    await clearTelegramSession(telegramId);
    await showMainMenu(chatId, profile);
    return;
  }

  const session = await getTelegramSession(telegramId);
  if (!session) {
    await showMainMenu(chatId, profile);
    return;
  }

  if (session.step === "description" && message.text) {
    const description = message.text.trim();
    if (description.length < 10) {
      await sendTelegramMessage(chatId, "Опишіть проблему трохи детальніше, мінімум 10 символів.");
      return;
    }
    await saveTelegramSession({ ...session, step: "photos", payload: { ...session.payload, description } });
    await showPhotoStep(chatId);
    return;
  }

  if (session.step === "photos" && message.photo?.length) {
    const current = session.payload.photo_file_ids ?? [];
    if (current.length >= MAX_TELEGRAM_PHOTOS) {
      await sendTelegramMessage(chatId, "Вже додано максимум 5 фото. Перейдіть до підтвердження.", [[{ text: "Підтвердити", callback_data: "photos:done" }]]);
      return;
    }
    const largestPhoto = message.photo[message.photo.length - 1];
    const photo_file_ids = [...current, largestPhoto.file_id].slice(0, MAX_TELEGRAM_PHOTOS);
    await saveTelegramSession({ ...session, payload: { ...session.payload, photo_file_ids } });
    await sendTelegramMessage(chatId, `Фото додано (${photo_file_ids.length}/5).`, [
      [{ text: "Додати ще фото", callback_data: "photos:more" }],
      [{ text: "Перейти до підтвердження", callback_data: "photos:done" }],
    ]);
    return;
  }

  await sendTelegramMessage(chatId, "Скористайтесь кнопками або надішліть /start, щоб почати заново.");
}

async function handleCallback(callback: TelegramCallbackQuery) {
  const telegramId = telegramIdFromCallback(callback);
  const chatId = callback.message?.chat.id;
  if (!chatId || !callback.data) return;
  await answerCallbackQuery(callback.id);

  const profile = await requireProfile(telegramId, chatId);
  if (!profile) return;

  if (callback.data === "ticket:start") {
    await startTicket(chatId, telegramId, profile);
    return;
  }

  if (callback.data === "ticket:cancel") {
    await clearTelegramSession(telegramId);
    await sendTelegramMessage(chatId, "Створення заявки скасовано.", [[{ text: "Створити заявку", callback_data: "ticket:start" }]]);
    return;
  }

  const session = await getTelegramSession(telegramId);
  if (!session) {
    await showMainMenu(chatId, profile);
    return;
  }

  if (callback.data.startsWith("object:") && session.step === "object") {
    const objectId = callback.data.replace("object:", "");
    await saveTelegramSession({ ...session, step: "category", payload: { ...session.payload, object_id: objectId } });
    await showCategories(chatId);
    return;
  }

  if (callback.data.startsWith("category:") && session.step === "category") {
    const categoryId = callback.data.replace("category:", "");
    await saveTelegramSession({ ...session, step: "description", payload: { ...session.payload, category_id: categoryId } });
    await sendTelegramMessage(chatId, "Коротко опишіть проблему одним повідомленням.");
    return;
  }

  if (callback.data === "photos:more" && session.step === "photos") {
    await sendTelegramMessage(chatId, "Надішліть наступне фото.");
    return;
  }

  if (callback.data === "photos:done" && session.step === "photos") {
    await showConfirmation(chatId, session, profile);
    return;
  }

  if (callback.data === "ticket:confirm" && session.step === "confirm") {
    const ticket = await createTicketFromTelegram(profile, session.payload);
    await clearTelegramSession(telegramId);
    await sendTelegramMessage(chatId, `Заявку ${ticket.number} створено.\n${ticketUrl(ticket.id)}`, [[{ text: "Створити ще заявку", callback_data: "ticket:start" }]]);
    return;
  }

  await sendTelegramMessage(chatId, "Ця дія вже неактуальна. Надішліть /start, щоб почати заново.");
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.message) await handleMessage(update.message);
  if (update.callback_query) await handleCallback(update.callback_query);
}
