import type { ObjectType, TicketPriority, TicketStatus, UserRole } from "@/types/domain";

export const roleLabels: Record<UserRole, string> = {
  admin: "Адміністратор",
  management: "Керівництво",
  tech_manager: "Технічний менеджер",
  worker: "Виконавець",
  store_manager: "Керуючий об'єктом",
};

export const statusLabels: Record<TicketStatus, string> = {
  new: "Нова",
  in_progress: "В роботі",
  waiting: "Очікує",
  done: "Виконана",
  cancelled: "Скасована",
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
