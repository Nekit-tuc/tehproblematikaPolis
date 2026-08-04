import type { ObjectType, TicketPriority, TicketStatus, UserRole } from "@/types/domain";

export const roleLabels: Record<UserRole, string> = {
  admin: "Адміністратор",
  management: "Керівництво",
  tech_manager: "Технічний менеджер",
  worker: "Виконавець",
  store_manager: "Керуючий об'єктом",
  store_director: "Директор магазину",
};

export const statusLabels: Record<TicketStatus, string> = {
  pending_review: "Очікує підтвердження",
  new: "Нова",
  assigned: "Призначена",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "Очікує підтвердження виконання",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

export const priorityLabels: Record<TicketPriority, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

export const objectTypeLabels: Record<ObjectType, string> = {
  store: "Магазин",
  warehouse: "Склад",
  production: "Виробництво",
  office: "Офіс",
  other: "Інше",
};
