import type { Profile } from "@/types/domain";
import { answerCallbackQuery, sendTelegramMessage, type TelegramCallbackQuery, type TelegramMessage } from "./client";
import {
  categoryKeyboard,
  confirmationKeyboard,
  mainMenuKeyboard,
  objectKeyboard,
  photoLimitKeyboard,
  photoNextStepKeyboard,
  restartTicketKeyboard,
  skipPhotoKeyboard,
} from "./keyboards";
import { mainMenuText, photoAddedText, telegramMessages, ticketCreatedText } from "./messages";
import { clearTelegramSession, getTelegramSession, saveTelegramSession, type TelegramSessionRecord, type TelegramTicketPayload } from "./session";
import { buildTelegramTicketSummary, createTicketFromTelegram, findTelegramProfile, getActiveCategories, getAvailableObjects, ticketUrl } from "./tickets";

const MAX_TELEGRAM_PHOTOS = 5;
const LEGACY_CALLBACK_VALUES = new Set(["ticket:start", "ticket:cancel", "photos:more", "photos:done", "ticket:confirm"]);
const LEGACY_CALLBACK_PREFIXES = ["object:", "category:"];

export function isLegacyTelegramCallbackData(data: string | undefined) {
  if (!data) return false;
  if (data.startsWith("wd:")) return false;
  return LEGACY_CALLBACK_VALUES.has(data) || LEGACY_CALLBACK_PREFIXES.some((prefix) => data.startsWith(prefix));
}

function telegramIdFromMessage(message: TelegramMessage) {
  return message.from?.id ? String(message.from.id) : null;
}

function telegramIdFromCallback(callback: TelegramCallbackQuery) {
  return String(callback.from.id);
}

async function requireProfile(telegramId: string, chatId: number) {
  const profile = await findTelegramProfile(telegramId);
  if (!profile) {
    await sendTelegramMessage(chatId, telegramMessages.unlinkedProfile);
    return null;
  }
  return profile;
}

async function showMainMenu(chatId: number, profile: Profile) {
  const objects = await getAvailableObjects(profile);
  await sendTelegramMessage(chatId, mainMenuText(profile, objects.length === 1 ? objects[0].name : undefined), mainMenuKeyboard());
}

async function startTicket(chatId: number, telegramId: string, profile: Profile) {
  const objects = await getAvailableObjects(profile);
  if (objects.length === 0) {
    await sendTelegramMessage(chatId, telegramMessages.noActiveObject);
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
  await sendTelegramMessage(chatId, telegramMessages.chooseObject, objectKeyboard(objects));
}

async function showCategories(chatId: number) {
  const categories = await getActiveCategories();
  if (categories.length === 0) {
    await sendTelegramMessage(chatId, telegramMessages.noCategories);
    return;
  }

  await sendTelegramMessage(chatId, telegramMessages.chooseCategory, categoryKeyboard(categories));
}

async function showPhotoStep(chatId: number) {
  await sendTelegramMessage(chatId, telegramMessages.photoStep, skipPhotoKeyboard());
}

async function showConfirmation(chatId: number, session: TelegramSessionRecord, profile: Profile) {
  const summary = await buildTelegramTicketSummary(session.payload, profile);
  await saveTelegramSession({ ...session, step: "confirm" });
  await sendTelegramMessage(chatId, summary, confirmationKeyboard());
}

export async function handleTelegramMessage(message: TelegramMessage) {
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
      await sendTelegramMessage(chatId, telegramMessages.descriptionTooShort);
      return;
    }
    await saveTelegramSession({ ...session, step: "photos", payload: { ...session.payload, description } });
    await showPhotoStep(chatId);
    return;
  }

  if (session.step === "photos" && message.photo?.length) {
    const current = session.payload.photo_file_ids ?? [];
    if (current.length >= MAX_TELEGRAM_PHOTOS) {
      await sendTelegramMessage(chatId, telegramMessages.photoLimit, photoLimitKeyboard());
      return;
    }
    const largestPhoto = message.photo[message.photo.length - 1];
    const photo_file_ids = [...current, largestPhoto.file_id].slice(0, MAX_TELEGRAM_PHOTOS);
    await saveTelegramSession({ ...session, payload: { ...session.payload, photo_file_ids } });
    await sendTelegramMessage(chatId, photoAddedText(photo_file_ids.length), photoNextStepKeyboard());
    return;
  }

  await sendTelegramMessage(chatId, telegramMessages.fallback);
}

export async function handleTelegramCallback(callback: TelegramCallbackQuery) {
  const telegramId = telegramIdFromCallback(callback);
  const chatId = callback.message?.chat.id;
  if (!chatId || !callback.data) return;

  if (callback.data.startsWith("wd:")) {
    console.warn("[telegram-legacy-callback] worker callback rejected by legacy handler", {
      callbackDataPrefix: "wd",
      callbackDataLength: Buffer.byteLength(callback.data, "utf8"),
    });
    return;
  }

  if (!isLegacyTelegramCallbackData(callback.data)) {
    console.warn("[telegram-legacy-callback] unsupported callback rejected", {
      callbackDataPrefix: callback.data.split(":")[0] || "unknown",
      callbackDataLength: Buffer.byteLength(callback.data, "utf8"),
    });
    await answerCallbackQuery(callback.id, "Ця дія вже неактуальна або не підтримується.");
    return;
  }

  await answerCallbackQuery(callback.id);

  const profile = await requireProfile(telegramId, chatId);
  if (!profile) return;

  if (callback.data === "ticket:start") {
    await startTicket(chatId, telegramId, profile);
    return;
  }

  if (callback.data === "ticket:cancel") {
    await clearTelegramSession(telegramId);
    await sendTelegramMessage(chatId, telegramMessages.cancelled, restartTicketKeyboard());
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
    await sendTelegramMessage(chatId, telegramMessages.enterDescription);
    return;
  }

  if (callback.data === "photos:more" && session.step === "photos") {
    await sendTelegramMessage(chatId, telegramMessages.sendNextPhoto);
    return;
  }

  if (callback.data === "photos:done" && session.step === "photos") {
    await showConfirmation(chatId, session, profile);
    return;
  }

  if (callback.data === "ticket:confirm" && session.step === "confirm") {
    const ticket = await createTicketFromTelegram(profile, session.payload);
    await clearTelegramSession(telegramId);
    await sendTelegramMessage(chatId, ticketCreatedText(ticket.number, ticketUrl(ticket.id)), restartTicketKeyboard());
    return;
  }

  await sendTelegramMessage(chatId, telegramMessages.staleAction);
}
