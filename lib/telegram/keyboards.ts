import type { Category, CompanyObject } from "@/types/domain";
import { chunkButtons } from "./client";

export function mainMenuKeyboard() {
  return [[{ text: "Створити заявку", callback_data: "ticket:start" }]];
}

export function objectKeyboard(objects: CompanyObject[]) {
  return chunkButtons(objects.map((object) => ({ text: object.name, callback_data: `object:${object.id}` })), 1);
}

export function categoryKeyboard(categories: Category[]) {
  return chunkButtons(categories.map((category) => ({ text: category.name, callback_data: `category:${category.id}` })), 1);
}

export function skipPhotoKeyboard() {
  return [[{ text: "Пропустити фото", callback_data: "photos:done" }]];
}

export function photoLimitKeyboard() {
  return [[{ text: "Підтвердити", callback_data: "photos:done" }]];
}

export function photoNextStepKeyboard() {
  return [
    [{ text: "Додати ще фото", callback_data: "photos:more" }],
    [{ text: "Перейти до підтвердження", callback_data: "photos:done" }],
  ];
}

export function confirmationKeyboard() {
  return [
    [{ text: "Створити заявку", callback_data: "ticket:confirm" }],
    [{ text: "Скасувати", callback_data: "ticket:cancel" }],
  ];
}

export function restartTicketKeyboard() {
  return [[{ text: "Створити заявку", callback_data: "ticket:start" }]];
}
