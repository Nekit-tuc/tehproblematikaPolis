import { priorityLabels } from "@/lib/labels";
import { sendTelegramMessage } from "@/lib/telegram/client";
import type { WorkPlan, WorkPlanItem } from "@/lib/supabase/work-plans";
import type { Worker } from "@/types/domain";

type TelegramSendMessageResult = {
  message_id: number;
};

type SendWorkPlanResult =
  | { ok: true; messageIds: string[] }
  | { ok: false; error: string };

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function compact(value?: string | null) {
  return value?.trim() || "-";
}

function planUrl(planId: string) {
  const url = appUrl();
  return url ? `${url}/work-planning/${planId}` : undefined;
}

function ticketsUrl() {
  const url = appUrl();
  return url ? `${url}/tickets` : undefined;
}

function itemText(item: WorkPlanItem, index: number) {
  const ticket = item.ticket;
  return [
    `${index + 1}. ${compact(ticket?.number)}`,
    `Об'єкт: ${compact(ticket?.object?.name)}`,
    `Категорія: ${compact(ticket?.category?.name ?? item.category)}`,
    `Пріоритет: ${ticket?.priority ? priorityLabels[ticket.priority] : "-"}`,
    `Робота: ${compact(ticket?.title || ticket?.description)}`,
  ].join("\n");
}

function splitMessage(header: string, itemBlocks: string[], footer: string) {
  const chunks: string[] = [];
  let current = header;
  for (const block of itemBlocks) {
    const next = `${current}\n\n${block}`;
    if (next.length > 3400) {
      chunks.push(current);
      current = block;
    } else {
      current = next;
    }
  }
  const withFooter = `${current}\n\n${footer}`;
  if (withFooter.length > 3800) {
    chunks.push(current);
    chunks.push(footer);
  } else {
    chunks.push(withFooter);
  }
  return chunks;
}

export function buildWorkPlanTelegramMessage(plan: WorkPlan, worker: Worker, items: WorkPlanItem[]) {
  const header = [
    "План робіт на тиждень",
    "",
    `Період: ${plan.period_start} - ${plan.period_end}`,
    `Виконавець: ${worker.name}`,
  ].join("\n");
  const blocks = items.map((item, index) => itemText(item, index));
  return splitMessage(header, blocks, "Дякую за роботу!");
}

export async function sendWorkPlanToWorker(worker: Worker, plan: WorkPlan, items: WorkPlanItem[]): Promise<SendWorkPlanResult> {
  if (!worker.telegram_id) return { ok: false, error: "У виконавця не підключено Telegram." };
  const parts = buildWorkPlanTelegramMessage(plan, worker, items);
  const messageIds: string[] = [];
  const keyboard = [
    [
      ...(planUrl(plan.id) ? [{ text: "Відкрити план", url: planUrl(plan.id) }] : []),
      ...(ticketsUrl() ? [{ text: "Перейти до заявок", url: ticketsUrl() }] : []),
    ],
  ].filter((row) => row.length > 0);

  try {
    for (const [index, part] of parts.entries()) {
      const result = await sendTelegramMessage(worker.telegram_id, part, index === parts.length - 1 ? keyboard : undefined) as TelegramSendMessageResult;
      messageIds.push(String(result.message_id));
    }
    console.info("[work-plan-dispatch]", {
      result: "sent",
      workerId: worker.id,
      workPlanId: plan.id,
      parts: parts.length,
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
