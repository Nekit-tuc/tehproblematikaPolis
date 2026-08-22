import { priorityLabels } from "@/lib/labels";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { createWorkerDoneToken } from "@/lib/telegram/worker-notifications";
import { buildWorkerPlanMenuKeyboard, buildWorkerPlanMenuMessage } from "@/lib/telegram/worker-menu";
import type { WorkPlan, WorkPlanItem } from "@/lib/supabase/work-plans";
import type { Worker } from "@/types/domain";

type TelegramSendMessageResult = {
  message_id: number;
};

type SendWorkPlanResult =
  | { ok: true; messageIds: string[] }
  | { ok: false; error: string };

const MAX_ITEMS_PER_MESSAGE = 8;
const DESCRIPTION_LIMIT = 160;

function compact(value?: string | null) {
  return value?.trim() || "-";
}

function truncate(value?: string | null, limit = DESCRIPTION_LIMIT) {
  const text = compact(value).replace(/\s+/g, " ");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

function categorySummary(items: WorkPlanItem[]) {
  const categories = new Set<string>();
  for (const item of items) {
    const category = item.ticket?.category?.name ?? item.category;
    if (category) categories.add(category);
  }
  return categories.size === 1 ? Array.from(categories)[0] : null;
}

function chunkItems(items: WorkPlanItem[]) {
  const chunks: WorkPlanItem[][] = [];
  for (let index = 0; index < items.length; index += MAX_ITEMS_PER_MESSAGE) {
    chunks.push(items.slice(index, index + MAX_ITEMS_PER_MESSAGE));
  }
  return chunks;
}

function itemText(item: WorkPlanItem, index: number, includeCategory: boolean) {
  const ticket = item.ticket;
  const lines = [
    `${index + 1}. ${compact(ticket?.number)}`,
    `Об'єкт: ${compact(ticket?.object?.name)}`,
  ];
  if (includeCategory) lines.push(`Категорія: ${compact(ticket?.category?.name ?? item.category)}`);
  lines.push(
    `Пріоритет: ${ticket?.priority ? priorityLabels[ticket.priority] : "-"}`,
    `Опис: ${truncate(ticket?.description || ticket?.title)}`,
  );
  return lines.join("\n");
}

function buildChunkText(plan: WorkPlan, worker: Worker, chunk: WorkPlanItem[], chunkIndex: number, totalChunks: number) {
  const category = categorySummary(chunk);
  return [
    `План робіт на тиждень${totalChunks > 1 ? ` - частина ${chunkIndex + 1}/${totalChunks}` : ""}`,
    "",
    `Період: ${plan.period_start} - ${plan.period_end}`,
    `Виконавець: ${worker.name}`,
    category ? `Категорія: ${category}` : null,
    "",
    "Заявки:",
    "",
    chunk.map((item, index) => itemText(item, index, !category)).join("\n\n"),
    "",
    "Натискайте “Виконав” окремо по кожній заявці після завершення роботи.",
  ].filter(Boolean).join("\n");
}

export function buildWorkPlanTelegramMessage(plan: WorkPlan, worker: Worker, items: WorkPlanItem[]) {
  const chunks = chunkItems(items);
  return chunks.map((chunk, index) => buildChunkText(plan, worker, chunk, index, chunks.length));
}

async function createKeyboard(worker: Worker, chunk: WorkPlanItem[]) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const item of chunk) {
    const ticket = item.ticket;
    if (!ticket?.id) continue;
    const tokenResult = await createWorkerDoneToken(ticket.id, worker.id);
    if (!tokenResult.token) {
      return { rows: [], error: tokenResult.error ?? "Не вдалося створити Telegram token для заявки." };
    }
    const callbackData = `wd:${tokenResult.token}`;
    rows.push([{ text: `✅ ${ticket.number ?? "Заявка"} Виконав`, callback_data: callbackData }]);
    console.info("[work-plan-dispatch]", {
      result: "button_created",
      workerId: worker.id,
      ticketId: ticket.id,
      callbackDataLength: Buffer.byteLength(callbackData, "utf8"),
    });
  }
  return { rows, error: null };
}

export async function sendWorkPlanToWorker(worker: Worker, plan: WorkPlan, items: WorkPlanItem[]): Promise<SendWorkPlanResult> {
  if (!worker.telegram_id) return { ok: false, error: "У виконавця не підключено Telegram." };
  if (items.length === 0) return { ok: false, error: "У плані немає заявок для надсилання." };
  const messageIds: string[] = [];

  try {
    const activeCount = items.filter((item) => {
      const status = item.ticket?.status;
      return status === "new" || status === "assigned" || status === "in_progress";
    }).length;
    const result = await sendTelegramMessage(
      worker.telegram_id,
      buildWorkerPlanMenuMessage(plan, worker, activeCount),
      buildWorkerPlanMenuKeyboard(plan.id),
    ) as TelegramSendMessageResult;
    messageIds.push(String(result.message_id));
    console.info("[work-plan-dispatch]", {
      result: "sent",
      workerId: worker.id,
      workPlanId: plan.id,
      mode: "worker_menu",
      tickets: items.length,
    });
    return { ok: true, messageIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[work-plan-dispatch]", {
      result: "failed",
      workerId: worker.id,
      workPlanId: plan.id,
      error: message,
    });
    return { ok: false, error: message };
  }
}
