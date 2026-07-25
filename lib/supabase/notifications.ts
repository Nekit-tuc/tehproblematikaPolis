import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { QueryResult } from "./queries";

export type AppNotification = {
  id: string;
  type: "ticket" | "ai" | "worker_done" | "plan" | "plan_error" | "delete";
  title: string;
  description: string;
  href?: string;
  created_at: string;
  important?: boolean;
};

function empty(): QueryResult<AppNotification[]> {
  return { data: [], error: missingSupabaseMessage };
}

function ticketNumber(row: any) {
  const ticket = Array.isArray(row.ticket) ? row.ticket[0] : row.ticket;
  return ticket?.number ?? "Заявка";
}

export async function getComputedNotifications(limit = 20): Promise<QueryResult<AppNotification[]>> {
  if (!hasSupabaseEnv()) return empty();
  const supabase = await createClient();
  const [recentTickets, pendingAi, waitingAdmin, history, dispatches] = await Promise.all([
    supabase.from("tickets").select("id, number, title, status, source, created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("tickets").select("id, number, title, created_at").eq("status", "pending_review").in("source", ["telegram_group", "telegram_private_test"]).order("created_at", { ascending: false }).limit(8),
    supabase.from("tickets").select("id, number, title, created_at").eq("status", "waiting_admin_confirmation").order("created_at", { ascending: false }).limit(8),
    supabase.from("ticket_history").select("id, ticket_id, action, created_at, ticket:tickets(id, number)").order("created_at", { ascending: false }).limit(8),
    supabase.from("work_plan_dispatches").select("id, work_plan_id, status, error, sent_at, work_plan:work_plans(id, title)").order("sent_at", { ascending: false }).limit(8),
  ]);

  const error = recentTickets.error ?? pendingAi.error ?? waitingAdmin.error ?? history.error ?? dispatches.error;
  if (error) return { data: [], error: error.message };

  const items: AppNotification[] = [];
  for (const ticket of pendingAi.data ?? []) {
    items.push({ id: `ai-${ticket.id}`, type: "ai", title: "AI-заявка очікує підтвердження", description: `${ticket.number}: ${ticket.title ?? "Без назви"}`, href: "/ai-tickets", created_at: ticket.created_at, important: true });
  }
  for (const ticket of waitingAdmin.data ?? []) {
    items.push({ id: `worker-${ticket.id}`, type: "worker_done", title: "Виконавець завершив роботу", description: `${ticket.number} очікує підтвердження адміністратора`, href: `/tickets/${ticket.id}`, created_at: ticket.created_at, important: true });
  }
  for (const ticket of recentTickets.data ?? []) {
    items.push({ id: `ticket-${ticket.id}`, type: ticket.source?.startsWith("telegram") ? "ai" : "ticket", title: "Нова заявка", description: `${ticket.number}: ${ticket.title ?? "Без назви"}`, href: `/tickets/${ticket.id}`, created_at: ticket.created_at, important: ticket.status === "new" });
  }
  for (const row of history.data ?? []) {
    const action = String(row.action ?? "Оновлено заявку");
    items.push({ id: `history-${row.id}`, type: action.toLowerCase().includes("видал") || action.toLowerCase().includes("знят") ? "delete" : "ticket", title: action, description: `Зміна по ${ticketNumber(row)}`, href: row.ticket_id ? `/tickets/${row.ticket_id}` : undefined, created_at: row.created_at });
  }
  for (const row of dispatches.data ?? []) {
    const plan = Array.isArray(row.work_plan) ? row.work_plan[0] : row.work_plan;
    const failed = row.status === "failed" || row.status === "skipped_no_telegram";
    items.push({ id: `dispatch-${row.id}`, type: failed ? "plan_error" : "plan", title: failed ? "Є помилка надсилання плану" : "План робіт надіслано", description: plan?.title ?? row.error ?? "Telegram-розсилка плану", href: row.work_plan_id ? `/work-planning/${row.work_plan_id}` : "/work-planning", created_at: row.sent_at, important: failed });
  }

  return { data: items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit), error: null };
}

export async function getAttentionNotificationCount(): Promise<QueryResult<number>> {
  if (!hasSupabaseEnv()) return { data: 0, error: missingSupabaseMessage };
  const supabase = await createClient();
  const [pendingAi, waitingAdmin, newTickets, failedDispatches] = await Promise.all([
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "pending_review").in("source", ["telegram_group", "telegram_private_test"]),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "waiting_admin_confirmation"),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("work_plan_dispatches").select("id", { count: "exact", head: true }).in("status", ["failed", "skipped_no_telegram"]),
  ]);

  const error = pendingAi.error ?? waitingAdmin.error ?? newTickets.error ?? failedDispatches.error;
  return {
    data: (pendingAi.count ?? 0) + (waitingAdmin.count ?? 0) + (newTickets.count ?? 0) + (failedDispatches.count ?? 0),
    error: error?.message ?? null,
  };
}
