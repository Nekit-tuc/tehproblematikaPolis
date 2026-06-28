import type { Profile } from "@/types/domain";

export const telegramMessages = {
  unlinkedProfile: "Ваш Telegram ще не прив'язаний до системи. Зверніться до адміністратора.",
  noActiveObject: "До вашого профілю не прив'язано активний об'єкт. Зверніться до адміністратора.",
  noCategories: "У системі немає активних категорій. Адміністратор має додати категорії в налаштуваннях або виконати seed.",
  chooseObject: "Оберіть об'єкт:",
  chooseCategory: "Оберіть категорію:",
  enterDescription: "Коротко опишіть проблему одним повідомленням.",
  descriptionTooShort: "Опишіть проблему трохи детальніше, мінімум 10 символів.",
  photoStep: "Надішліть до 5 фото проблеми або пропустіть цей крок.",
  photoLimit: "Вже додано максимум 5 фото. Перейдіть до підтвердження.",
  sendNextPhoto: "Надішліть наступне фото.",
  cancelled: "Створення заявки скасовано.",
  staleAction: "Ця дія вже неактуальна. Надішліть /start, щоб почати заново.",
  fallback: "Скористайтесь кнопками або надішліть /start, щоб почати заново.",
};

export function mainMenuText(profile: Profile, objectName?: string) {
  const objectText = objectName ? `\nВаш об'єкт: ${objectName}` : "";
  return `Вітаю, ${profile.full_name}.${objectText}`;
}

export function photoAddedText(count: number) {
  return `Фото додано (${count}/5).`;
}

export function ticketCreatedText(number: string, url: string) {
  return `Заявку ${number} створено.\n${url}`;
}
