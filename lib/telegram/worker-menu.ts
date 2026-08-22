import { priorityLabels, statusLabels } from "@/lib/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { answerCallbackQuery, editTelegramMessageText, sendTelegramMessage, type TelegramCallbackQuery } from "@/lib/telegram/client";
import { createWorkerDoneToken } from "@/lib/telegram/worker-notifications";
import type { TicketPriority, TicketStatus } from "@/types/domain";

type InlineButton = { text: string; callback_data: string };
type WorkerMenuSection = "active" | "pending" | "done";

type WorkerMenuPlan = {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
};

type WorkerMenuTicket = {
  id: string;
  number: string | null;
  title: string | null;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category?: { name?: string | null } | { name?: string | null }[] | null;
  object?: { name?: string | null; address?: string | null } | { name?: string | null; address?: string | null }[] | null;
};

type WorkerMenuItem = {
  id: string;
  worker_id: string | null;
  ticket?: WorkerMenuTicket | WorkerMenuTicket[] | null;
};

type WorkerMenuWorker = {
  id: string;
  name: string | null;
  telegram_id: string | null;
};

type WorkerMenuContext = {
  plan: WorkerMenuPlan;
  worker: WorkerMenuWorker;
  items: Array<WorkerMenuItem & { ticket: WorkerMenuTicket }>;
};

const PAGE_SIZE = 5;
const ACTIVE_STATUSES: TicketStatus[] = ["new", "assigned", "in_progress"];
const PENDING_STATUSES: TicketStatus[] = ["waiting_admin_confirmation"];
const DONE_STATUSES: TicketStatus[] = ["done"];

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function compact(value?: string | null) {
  return value?.trim() || "-";
}

function truncate(value?: string | null, limit = 140) {
  const text = compact(value).replace(/\s+/g, " ");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function periodLabel(plan: WorkerMenuPlan) {
  return `${formatDate(plan.period_start)} — ${formatDate(plan.period_end)}`;
}

function ticketAddress(ticket: WorkerMenuTicket) {
  const object = firstRelation(ticket.object);
  return object?.address || object?.name || "-";
}

function ticketCategory(ticket: WorkerMenuTicket) {
  return firstRelation(ticket.category)?.name ?? "-";
}

function workText(ticket: WorkerMenuTicket, limit = 140) {
  return truncate(ticket.title || ticket.description, limit);
}

function callback(action: string, planId: string, ...parts: Array<string | number>) {
  return ["wm", action, planId, ...parts].join(":");
}

function menuKeyboard(planId: string): InlineButton[][] {
  return [
    [{ text: "📋 В роботі", callback_data: callback("a", planId, 0) }],
    [{ text: "⏳ На підтвердженні", callback_data: callback("p", planId, 0) }],
    [{ text: "✅ Виконані", callback_data: callback("d", planId, 0) }],
  ];
}

export function buildWorkerPlanMenuMessage(plan: WorkerMenuPlan, worker: Pick<WorkerMenuWorker, "name">, activeCount: number) {
  return [
    "📅 План робіт отримано",
    "",
    `👷 Виконавець: ${compact(worker.name)}`,
    `🗓 Період: ${periodLabel(plan)}`,
    `📋 Заявок в роботі: ${activeCount}`,
    "",
    "Натисніть кнопку нижче, щоб переглянути заявки.",
  ].join("\n");
}

export function buildWorkerPlanMenuKeyboard(planId: string): InlineButton[][] {
  return [
    [{ text: "📋 Відкрити заявки", callback_data: callback("a", planId, 0) }],
    [{ text: "⏳ На підтвердженні", callback_data: callback("p", planId, 0) }],
    [{ text: "✅ Виконані", callback_data: callback("d", planId, 0) }],
  ];
}

function sectionConfig(section: WorkerMenuSection) {
  if (section === "pending") return { title: "⏳ На підтвердженні", empty: "⏳ На підтвердженні заявок немає.", statuses: PENDING_STATUSES };
  if (section === "done") return { title: "✅ Виконані заявки", empty: "✅ Виконаних заявок ще немає.", statuses: DONE_STATUSES };
  return { title: "📋 Заявки в роботі", empty: "📋 Заявок в роботі немає.", statuses: ACTIVE_STATUSES };
}

async function loadContext(planId: string, telegramUserId: number): Promise<{ context: WorkerMenuContext | null; error: string | null }> {
  const supabase = createAdminClient();
  const [{ data: planData, error: planError }, { data: workerData, error: workerError }] = await Promise.all([
    supabase.from("work_plans").select("id,title,period_start,period_end").eq("id", planId).maybeSingle(),
    supabase.from("workers").select("id,name,telegram_id").eq("telegram_id", String(telegramUserId)).maybeSingle(),
  ]);

  if (planError) return { context: null, error: planError.message };
  if (workerError) return { context: null, error: workerError.message };
  const plan = planData as WorkerMenuPlan | null;
  const worker = workerData as WorkerMenuWorker | null;
  if (!plan) return { context: null, error: "План не знайдено." };
  if (!worker) return { context: null, error: "Виконавця не знайдено або Telegram не підключено." };

  const { data: itemsData, error: itemsError } = await supabase
    .from("work_plan_items")
    .select("id,worker_id,ticket:tickets(id,number,title,description,status,priority,assignee_worker_id,category:categories(name),object:objects(name,address))")
    .eq("work_plan_id", planId)
    .eq("worker_id", worker.id)
    .order("sort_order", { ascending: true });
  if (itemsError) return { context: null, error: itemsError.message };

  const items = ((itemsData ?? []) as WorkerMenuItem[])
    .map((item) => ({ ...item, ticket: firstRelation(item.ticket) }))
    .filter((item): item is WorkerMenuItem & { ticket: WorkerMenuTicket } => Boolean(item.ticket));

  return { context: { plan, worker, items }, error: null };
}

function filterItems(context: WorkerMenuContext, section: WorkerMenuSection) {
  const config = sectionConfig(section);
  return context.items.filter((item) => config.statuses.includes(item.ticket.status));
}

function sectionFromAction(action: string): WorkerMenuSection {
  if (action === "p") return "pending";
  if (action === "d") return "done";
  return "active";
}

function listText(context: WorkerMenuContext, section: WorkerMenuSection, page: number) {
  const items = filterItems(context, section);
  const config = sectionConfig(section);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const visible = items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  if (items.length === 0) {
    return [
      config.empty,
      "",
      `👷 ${compact(context.worker.name)}`,
      `🗓 ${periodLabel(context.plan)}`,
    ].join("\n");
  }
  return [
    config.title,
    `Сторінка ${safePage + 1}/${totalPages}`,
    `👷 ${compact(context.worker.name)}`,
    `🗓 ${periodLabel(context.plan)}`,
    "",
    visible.map((item, index) => [
      `${safePage * PAGE_SIZE + index + 1}. ${compact(item.ticket.number)}`,
      `📍 ${ticketAddress(item.ticket)}`,
      `📝 ${workText(item.ticket)}`,
    ].join("\n")).join("\n\n"),
    "",
    "Оберіть заявку для перегляду:",
  ].join("\n");
}

function listKeyboard(context: WorkerMenuContext, section: WorkerMenuSection, page: number): InlineButton[][] {
  const items = filterItems(context, section);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const visible = items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const action = section === "pending" ? "p" : section === "done" ? "d" : "a";
  const rows: InlineButton[][] = visible.map((item, index) => [
    { text: `Відкрити ${compact(item.ticket.number)}`, callback_data: callback("o", context.plan.id, safePage * PAGE_SIZE + index, safePage, action) },
  ]);
  const nav: InlineButton[] = [];
  if (safePage > 0) nav.push({ text: "⬅️ Назад", callback_data: callback(action, context.plan.id, safePage - 1) });
  if (safePage < totalPages - 1) nav.push({ text: "➡️ Далі", callback_data: callback(action, context.plan.id, safePage + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "📅 Меню", callback_data: callback("m", context.plan.id) }]);
  return rows;
}

function ticketCardText(context: WorkerMenuContext, section: WorkerMenuSection, itemIndex: number) {
  const items = filterItems(context, section);
  const item = items[itemIndex] ?? items[0];
  const ticket = item.ticket;
  return [
    `📋 Заявка ${itemIndex + 1} із ${items.length}`,
    "",
    compact(ticket.number),
    "",
    "📍 Об’єкт:",
    ticketAddress(ticket),
    "",
    "🏷 Категорія:",
    ticketCategory(ticket),
    "",
    "⚡ Пріоритет:",
    priorityLabels[ticket.priority] ?? ticket.priority,
    "",
    "📝 Опис:",
    compact(ticket.description || ticket.title),
    "",
    "Статус:",
    statusLabels[ticket.status] ?? ticket.status,
  ].join("\n");
}

async function ticketCardKeyboard(context: WorkerMenuContext, section: WorkerMenuSection, itemIndex: number, page: number, listAction: string): Promise<InlineButton[][]> {
  const items = filterItems(context, section);
  const item = items[itemIndex] ?? items[0];
  const rows: InlineButton[][] = [];
  if (ACTIVE_STATUSES.includes(item.ticket.status)) {
    const tokenResult = await createWorkerDoneToken(item.ticket.id, context.worker.id);
    if (tokenResult.token) rows.push([{ text: "✅ Виконав", callback_data: `wd:${tokenResult.token}` }]);
  }
  rows.push([{ text: "⬅️ Назад до списку", callback_data: callback(listAction || "a", context.plan.id, page) }]);
  const nav: InlineButton[] = [];
  if (itemIndex > 0) nav.push({ text: "⬅️ Попередня", callback_data: callback("o", context.plan.id, itemIndex - 1, page, listAction || "a") });
  if (itemIndex < items.length - 1) nav.push({ text: "➡️ Наступна", callback_data: callback("o", context.plan.id, itemIndex + 1, page, listAction || "a") });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "📅 Меню", callback_data: callback("m", context.plan.id) }]);
  return rows;
}

function menuText(context: WorkerMenuContext) {
  return [
    "👷 Кабінет виконавця",
    "",
    `Виконавець: ${compact(context.worker.name)}`,
    `Період: ${periodLabel(context.plan)}`,
    "",
    `📋 В роботі: ${filterItems(context, "active").length}`,
    `⏳ На підтвердженні: ${filterItems(context, "pending").length}`,
    `✅ Виконані: ${filterItems(context, "done").length}`,
    "",
    "Оберіть дію:",
  ].join("\n");
}

async function replaceMessage(callbackQuery: TelegramCallbackQuery, text: string, keyboard: InlineButton[][]) {
  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;
  if (!chatId) return;
  if (messageId) {
    try {
      await editTelegramMessageText(chatId, messageId, text, keyboard);
      return;
    } catch (error) {
      console.warn("[telegram-worker-menu] edit failed; falling back to sendMessage", { error: error instanceof Error ? error.message : String(error) });
    }
  }
  await sendTelegramMessage(chatId, text, keyboard);
}

export function isWorkerMenuCallbackData(data: string) {
  return data.startsWith("wm:");
}

export async function handleWorkerMenuCallback(callbackQuery: TelegramCallbackQuery) {
  const data = callbackQuery.data ?? "";
  const [, action = "m", planId = "", first = "0", second = "0", third = "a"] = data.split(":");
  if (!planId) {
    await answerCallbackQuery(callbackQuery.id, "Некоректне меню.");
    return { handled: true, ok: false, reason: "invalid_worker_menu_payload" } as const;
  }
  const { context, error } = await loadContext(planId, callbackQuery.from.id);
  if (error || !context) {
    await answerCallbackQuery(callbackQuery.id, error ?? "Не вдалося відкрити меню.");
    return { handled: true, ok: false, reason: "worker_menu_context_failed" } as const;
  }

  await answerCallbackQuery(callbackQuery.id);

  if (action === "m") {
    await replaceMessage(callbackQuery, menuText(context), menuKeyboard(context.plan.id));
    return { handled: true, ok: true, reason: "worker_menu" } as const;
  }

  if (action === "o") {
    const index = Number(first);
    const page = Number(second);
    const listAction = third || "a";
    const section = sectionFromAction(listAction);
    const sectionItems = filterItems(context, section);
    const safeIndex = Number.isFinite(index) ? Math.min(Math.max(index, 0), Math.max(sectionItems.length - 1, 0)) : 0;
    const safePage = Number.isFinite(page) ? Math.max(page, 0) : 0;
    if (sectionItems.length === 0) {
      await replaceMessage(callbackQuery, listText(context, section, safePage), listKeyboard(context, section, safePage));
      return { handled: true, ok: true, reason: "worker_ticket_open_empty_section" } as const;
    }
    await replaceMessage(callbackQuery, ticketCardText(context, section, safeIndex), await ticketCardKeyboard(context, section, safeIndex, safePage, listAction));
    return { handled: true, ok: true, reason: "worker_ticket_open" } as const;
  }

  const page = Number(first);
  const safePage = Number.isFinite(page) ? Math.max(page, 0) : 0;
  const section = sectionFromAction(action);
  await replaceMessage(callbackQuery, listText(context, section, safePage), listKeyboard(context, section, safePage));
  return { handled: true, ok: true, reason: `worker_${section}_list` } as const;
}
