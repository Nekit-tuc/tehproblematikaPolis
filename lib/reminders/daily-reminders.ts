import { formatWorkWeekDateRange, getCurrentWorkWeek } from "@/lib/date/work-week";
import { sendAdminPushNotification } from "@/lib/push/send-push-notification";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram/client";
import type { TicketPriority, TicketStatus } from "@/types/domain";

type WorkerReminderTicket = {
  id: string;
  status: TicketStatus;
  priority: TicketPriority;
  updated_at: string;
};

type WorkerReminderPlanItem = {
  worker_id: string | null;
  ticket_id: string;
  work_plan?: {
    id: string;
    period_start: string;
    period_end: string;
    status: string;
  } | {
    id: string;
    period_start: string;
    period_end: string;
    status: string;
  }[] | null;
  ticket?: WorkerReminderTicket | WorkerReminderTicket[] | null;
};

type WorkerReminderWorker = {
  id: string;
  name: string | null;
  telegram_id: string | null;
};

export type WorkerDailyReminderSummary = {
  workerId: string;
  workerName: string;
  telegramId: string;
  currentWeek: {
    startDate: string;
    endDate: string;
    label: string;
  };
  menuPlanId: string | null;
  activeCount: number;
  pendingConfirmationCount: number;
  doneCount: number;
  attentionCount: number;
  unplannedAssignedCount: number;
  hasAnythingToSend: boolean;
};

export type AdminAttentionSummary = {
  directorPendingTickets: number;
  aiPendingTickets: number;
  waitingAdminConfirmation: number;
  pendingDirectorRegistrations: number;
  activeUnplannedTickets: number;
  oldActivePlanTickets: number;
  activeWithoutWorker: number;
  activeWithoutCategory: number;
  workersWithoutTelegram: number;
  totalAttentionCount: number;
};

export type DailyRemindersResult = {
  success: boolean;
  dryRun: boolean;
  workersChecked: number;
  workerMessagesSent: number;
  adminPushSent: number;
  warnings: string[];
  errors: string[];
  workerSummaries: WorkerDailyReminderSummary[];
  adminSummary: AdminAttentionSummary;
};

const ACTIVE_TICKET_STATUSES: TicketStatus[] = ["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation"];
const WORKER_ACTIVE_STATUSES: TicketStatus[] = ["new", "assigned", "in_progress"];
const WORKER_PENDING_STATUSES: TicketStatus[] = ["waiting_admin_confirmation"];
const ACTIVE_PLAN_STATUSES = ["draft", "sent", "partially_done"];
const ATTENTION_STALE_DAYS = 3;

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function countUnique(ticketIds: Iterable<string>) {
  return new Set(Array.from(ticketIds).filter(Boolean)).size;
}

function olderThanDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() > days * 24 * 60 * 60 * 1000;
}

function isAttentionTicket(ticket: WorkerReminderTicket) {
  return ticket.priority === "high" || ticket.priority === "critical" || olderThanDays(ticket.updated_at, ATTENTION_STALE_DAYS);
}

function periodPlan(row: WorkerReminderPlanItem) {
  return firstRelation(row.work_plan);
}

function rowTicket(row: WorkerReminderPlanItem) {
  return firstRelation(row.ticket);
}

function compact(value: string | null | undefined, fallback: string) {
  return (value ?? fallback).replace(/\s+/g, " ").trim() || fallback;
}

function workerReminderText(summary: WorkerDailyReminderSummary) {
  const lines = [
    "👷 Нагадування по заявках",
    "",
    `Доброго ранку, ${summary.workerName}.`,
    "",
    `📅 Робочий тиждень: ${summary.currentWeek.label}`,
    "",
    `📋 В роботі: ${summary.activeCount}`,
    `⏳ На підтвердженні: ${summary.pendingConfirmationCount}`,
    `⚠️ Потребують уваги: ${summary.attentionCount}`,
  ];

  if (summary.unplannedAssignedCount > 0) {
    lines.push(`Не в плані: ${summary.unplannedAssignedCount}`);
  }

  lines.push("", "Натисніть кнопку нижче, щоб відкрити актуальні заявки.");
  return lines.join("\n");
}

export async function getWorkersDailyReminderSummaries(): Promise<{ summaries: WorkerDailyReminderSummary[]; warnings: string[]; errors: string[] }> {
  const supabase = createAdminClient();
  const currentWeek = getCurrentWorkWeek();
  const weekLabel = formatWorkWeekDateRange(currentWeek.start, currentWeek.end);
  const warnings: string[] = [];
  const errors: string[] = [];

  const [workersResult, planItemsResult, assignedTicketsResult] = await Promise.all([
    supabase
      .from("workers")
      .select("id,name,telegram_id,is_active")
      .eq("is_active", true)
      .not("telegram_id", "is", null)
      .order("name", { ascending: true }),
    supabase
      .from("work_plan_items")
      .select(`
        worker_id,
        ticket_id,
        work_plan:work_plans!inner(id,period_start,period_end,status),
        ticket:tickets!inner(id,status,priority,updated_at)
      `)
      .in("work_plan.status", ACTIVE_PLAN_STATUSES)
      .gte("work_plan.period_start", currentWeek.startDate)
      .lte("work_plan.period_end", currentWeek.endDate)
      .limit(5000),
    supabase
      .from("tickets")
      .select("id,status,priority,updated_at,assignee_worker_id")
      .in("status", ACTIVE_TICKET_STATUSES)
      .not("assignee_worker_id", "is", null)
      .limit(5000),
  ]);

  if (workersResult.error) errors.push(`workers: ${workersResult.error.message}`);
  if (planItemsResult.error) errors.push(`work_plan_items: ${planItemsResult.error.message}`);
  if (assignedTicketsResult.error) errors.push(`assigned tickets: ${assignedTicketsResult.error.message}`);

  const workers = ((workersResult.data ?? []) as Array<WorkerReminderWorker & { is_active?: boolean }>).filter((worker) => worker.telegram_id);
  const planItems = (planItemsResult.data ?? []) as unknown as WorkerReminderPlanItem[];
  const assignedTickets = (assignedTicketsResult.data ?? []) as Array<WorkerReminderTicket & { assignee_worker_id?: string | null }>;
  const plannedTicketIds = new Set(planItems.map((item) => item.ticket_id).filter(Boolean));
  const planItemsByWorker = new Map<string, WorkerReminderPlanItem[]>();
  const assignedTicketsByWorker = new Map<string, Array<WorkerReminderTicket & { assignee_worker_id?: string | null }>>();

  for (const item of planItems) {
    if (!item.worker_id) continue;
    const group = planItemsByWorker.get(item.worker_id) ?? [];
    group.push(item);
    planItemsByWorker.set(item.worker_id, group);
  }

  for (const ticket of assignedTickets) {
    if (!ticket.assignee_worker_id) continue;
    const group = assignedTicketsByWorker.get(ticket.assignee_worker_id) ?? [];
    group.push(ticket);
    assignedTicketsByWorker.set(ticket.assignee_worker_id, group);
  }

  const summaries = workers.map((worker) => {
    const workerPlanItems = planItemsByWorker.get(worker.id) ?? [];
    const workerAssignedTickets = assignedTicketsByWorker.get(worker.id) ?? [];
    const ticketsById = new Map<string, WorkerReminderTicket>();

    for (const item of workerPlanItems) {
      const ticket = rowTicket(item);
      if (ticket) ticketsById.set(ticket.id, ticket);
    }
    for (const ticket of workerAssignedTickets) ticketsById.set(ticket.id, ticket);

    const tickets = Array.from(ticketsById.values());
    const activeCount = tickets.filter((ticket) => WORKER_ACTIVE_STATUSES.includes(ticket.status)).length;
    const pendingConfirmationCount = tickets.filter((ticket) => WORKER_PENDING_STATUSES.includes(ticket.status)).length;
    const doneCount = tickets.filter((ticket) => ticket.status === "done").length;
    const attentionCount = tickets.filter((ticket) => WORKER_ACTIVE_STATUSES.includes(ticket.status) && isAttentionTicket(ticket)).length;
    const unplannedAssignedCount = countUnique(
      workerAssignedTickets
        .filter((ticket) => !plannedTicketIds.has(ticket.id) && ACTIVE_TICKET_STATUSES.includes(ticket.status))
        .map((ticket) => ticket.id),
    );
    const menuPlanId = workerPlanItems[0] ? periodPlan(workerPlanItems[0])?.id ?? null : null;

    if (!menuPlanId && (activeCount > 0 || pendingConfirmationCount > 0)) {
      warnings.push(`${compact(worker.name, "Виконавець")} має актуальні заявки, але немає активного плану поточного тижня для Telegram-меню.`);
    }

    return {
      workerId: worker.id,
      workerName: compact(worker.name, "Виконавець"),
      telegramId: worker.telegram_id!,
      currentWeek: {
        startDate: currentWeek.startDate,
        endDate: currentWeek.endDate,
        label: weekLabel,
      },
      menuPlanId,
      activeCount,
      pendingConfirmationCount,
      doneCount,
      attentionCount,
      unplannedAssignedCount,
      hasAnythingToSend: activeCount > 0 || pendingConfirmationCount > 0,
    };
  });

  return { summaries, warnings, errors };
}

export async function getAdminAttentionSummary(): Promise<{ summary: AdminAttentionSummary; errors: string[] }> {
  const supabase = createAdminClient();
  const currentWeek = getCurrentWorkWeek();
  const errors: string[] = [];

  const [
    directorPendingTickets,
    aiPendingTickets,
    waitingAdminConfirmation,
    pendingDirectorRegistrations,
    activeWithoutWorker,
    activeWithoutCategory,
    activeTickets,
    currentWeekPlanned,
    oldActivePlanItems,
    workersWithoutTelegram,
    noTelegramActiveTickets,
    noTelegramPlanItems,
  ] = await Promise.all([
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "pending_review").eq("source", "director_portal"),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "pending_review").neq("source", "director_portal"),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "waiting_admin_confirmation"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "store_director").eq("approval_status", "pending"),
    supabase.from("tickets").select("id", { count: "exact", head: true }).in("status", ACTIVE_TICKET_STATUSES).is("assignee_worker_id", null),
    supabase.from("tickets").select("id", { count: "exact", head: true }).in("status", ACTIVE_TICKET_STATUSES).is("category_id", null),
    supabase.from("tickets").select("id").in("status", ACTIVE_TICKET_STATUSES).limit(5000),
    supabase
      .from("work_plan_items")
      .select("ticket_id, ticket:tickets!inner(status), work_plan:work_plans!inner(status,period_start,period_end)")
      .in("ticket.status", ACTIVE_TICKET_STATUSES)
      .in("work_plan.status", ACTIVE_PLAN_STATUSES)
      .gte("work_plan.period_start", currentWeek.startDate)
      .lte("work_plan.period_end", currentWeek.endDate)
      .limit(5000),
    supabase
      .from("work_plan_items")
      .select("ticket_id, ticket:tickets!inner(status), work_plan:work_plans!inner(status,period_end)")
      .in("ticket.status", ACTIVE_TICKET_STATUSES)
      .in("work_plan.status", ACTIVE_PLAN_STATUSES)
      .lt("work_plan.period_end", currentWeek.startDate)
      .limit(5000),
    supabase.from("workers").select("id").eq("is_active", true).is("telegram_id", null).limit(5000),
    supabase
      .from("tickets")
      .select("assignee_worker_id")
      .in("status", ACTIVE_TICKET_STATUSES)
      .not("assignee_worker_id", "is", null)
      .limit(5000),
    supabase
      .from("work_plan_items")
      .select("worker_id, ticket:tickets!inner(status), work_plan:work_plans!inner(status)")
      .in("ticket.status", ACTIVE_TICKET_STATUSES)
      .in("work_plan.status", ACTIVE_PLAN_STATUSES)
      .not("worker_id", "is", null)
      .limit(5000),
  ]);

  const results = [
    directorPendingTickets,
    aiPendingTickets,
    waitingAdminConfirmation,
    pendingDirectorRegistrations,
    activeWithoutWorker,
    activeWithoutCategory,
    activeTickets,
    currentWeekPlanned,
    oldActivePlanItems,
    workersWithoutTelegram,
    noTelegramActiveTickets,
    noTelegramPlanItems,
  ];
  for (const result of results) {
    if (result.error) errors.push(result.error.message);
  }

  const activeCount = (activeTickets.data ?? []).length;
  const plannedActiveCount = countUnique(((currentWeekPlanned.data ?? []) as Array<{ ticket_id: string }>).map((row) => row.ticket_id));
  const activeUnplannedTickets = Math.max(activeCount - plannedActiveCount, 0);
  const oldActivePlanTickets = countUnique(((oldActivePlanItems.data ?? []) as Array<{ ticket_id: string }>).map((row) => row.ticket_id));
  const workerIdsWithoutTelegram = new Set(((workersWithoutTelegram.data ?? []) as Array<{ id: string }>).map((worker) => worker.id));
  const noTelegramWorkersWithWork = new Set<string>();
  for (const ticket of (noTelegramActiveTickets.data ?? []) as Array<{ assignee_worker_id?: string | null }>) {
    if (ticket.assignee_worker_id && workerIdsWithoutTelegram.has(ticket.assignee_worker_id)) noTelegramWorkersWithWork.add(ticket.assignee_worker_id);
  }
  for (const item of (noTelegramPlanItems.data ?? []) as Array<{ worker_id?: string | null }>) {
    if (item.worker_id && workerIdsWithoutTelegram.has(item.worker_id)) noTelegramWorkersWithWork.add(item.worker_id);
  }

  const summary = {
    directorPendingTickets: directorPendingTickets.count ?? 0,
    aiPendingTickets: aiPendingTickets.count ?? 0,
    waitingAdminConfirmation: waitingAdminConfirmation.count ?? 0,
    pendingDirectorRegistrations: pendingDirectorRegistrations.count ?? 0,
    activeUnplannedTickets,
    oldActivePlanTickets,
    activeWithoutWorker: activeWithoutWorker.count ?? 0,
    activeWithoutCategory: activeWithoutCategory.count ?? 0,
    workersWithoutTelegram: noTelegramWorkersWithWork.size,
    totalAttentionCount: 0,
  };

  summary.totalAttentionCount =
    summary.directorPendingTickets +
    summary.aiPendingTickets +
    summary.waitingAdminConfirmation +
    summary.pendingDirectorRegistrations +
    summary.activeUnplannedTickets +
    summary.oldActivePlanTickets +
    summary.activeWithoutWorker +
    summary.activeWithoutCategory +
    summary.workersWithoutTelegram;

  return { summary, errors };
}

export async function sendWorkerDailyReminder(summary: WorkerDailyReminderSummary) {
  if (!summary.hasAnythingToSend) return { sent: false, skipped: true, reason: "nothing_to_send" };
  if (!summary.menuPlanId) return { sent: false, skipped: true, reason: "missing_menu_plan" };

  await sendTelegramMessage(summary.telegramId, workerReminderText(summary), [
    [{ text: "📋 В роботі", callback_data: `wm:a:${summary.menuPlanId}:0` }],
    [{ text: "⏳ На підтвердженні", callback_data: `wm:p:${summary.menuPlanId}:0` }],
    [{ text: "✅ Виконані", callback_data: `wm:d:${summary.menuPlanId}:0` }],
    [{ text: "📅 Меню", callback_data: `wm:m:${summary.menuPlanId}` }],
  ]);
  return { sent: true, skipped: false, reason: "sent" };
}

export async function sendAdminDailyReminder(summary: AdminAttentionSummary, dryRun: boolean) {
  if (summary.totalAttentionCount === 0) return { sent: 0, failed: 0, skipped: true };
  if (dryRun) return { sent: 0, failed: 0, skipped: false };

  const result = await sendAdminPushNotification({
    title: "Ранковий контроль заявок",
    body: `Нові: ${summary.directorPendingTickets + summary.aiPendingTickets} · Виконані чекають: ${summary.waitingAdminConfirmation} · Не в плані: ${summary.activeUnplannedTickets}`,
    url: "/dashboard",
    tag: "admin-daily-reminder",
    data: {
      type: "admin_daily_reminder",
      url: "/dashboard",
      ...summary,
    },
  });

  return { sent: result.sent, failed: result.failed, skipped: false };
}

export async function runDailyReminders(input: { dryRun?: boolean } = {}): Promise<DailyRemindersResult> {
  const dryRun = input.dryRun === true;
  const warnings: string[] = [];
  const errors: string[] = [];
  const workerResult = await getWorkersDailyReminderSummaries();
  const adminResult = await getAdminAttentionSummary();
  warnings.push(...workerResult.warnings);
  errors.push(...workerResult.errors, ...adminResult.errors);

  let workerMessagesSent = 0;
  for (const summary of workerResult.summaries) {
    if (!summary.hasAnythingToSend) continue;
    if (dryRun) continue;
    try {
      const result = await sendWorkerDailyReminder(summary);
      if (result.sent) workerMessagesSent += 1;
      if (result.skipped && result.reason !== "nothing_to_send") warnings.push(`${summary.workerName}: ${result.reason}`);
    } catch (error) {
      errors.push(`${summary.workerName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let adminPushSent = 0;
  try {
    const adminPush = await sendAdminDailyReminder(adminResult.summary, dryRun);
    adminPushSent = adminPush.sent;
  } catch (error) {
    errors.push(`admin push: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.info("[daily-reminders] finished", {
    dryRun,
    workersChecked: workerResult.summaries.length,
    workerMessagesSent,
    adminPushSent,
    warnings: warnings.length,
    errors: errors.length,
  });

  return {
    success: true,
    dryRun,
    workersChecked: workerResult.summaries.length,
    workerMessagesSent,
    adminPushSent,
    warnings,
    errors,
    workerSummaries: workerResult.summaries,
    adminSummary: adminResult.summary,
  };
}
