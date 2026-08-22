"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canConfirmTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { measureAsync } from "@/lib/performance";
import { getTicket } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { confirmTicketWithPlanningDecision } from "@/lib/tickets/confirm-ticket-with-planning";
import type { TicketStatus } from "@/types/domain";

function readString(formData: FormData | undefined, key: string) {
  const value = formData?.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeTicketReturnTo(value?: string | null) {
  if (!value) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return null;
  if (value.toLowerCase().startsWith("javascript:")) return null;
  const allowedPrefixes = ["/tickets", "/ai-tickets", "/dashboard", "/work-planning", "/director/tickets", "/workers", "/weekly-control", "/reports"];
  return allowedPrefixes.some((prefix) => value.startsWith(prefix)) ? value : null;
}

function ticketDetailHref(ticketId: string, returnTo?: string | null) {
  const params = new URLSearchParams();
  const safeReturnTo = safeTicketReturnTo(returnTo);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  const query = params.toString();
  return query ? `/tickets/${ticketId}?${query}` : `/tickets/${ticketId}`;
}

function appendSearchParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

function redirectWith(ticketId: string, key: string, message: string, returnTo?: string | null): never {
  redirect(appendSearchParam(ticketDetailHref(ticketId, returnTo), key, message));
}

function redirectSuccess(ticketId: string, key: string, value: string, returnTo?: string | null): never {
  redirect(appendSearchParam(ticketDetailHref(ticketId, returnTo), key, value));
}

function planWarningMessage(reason: string) {
  if (reason === "already_planned") return "";
  if (reason === "missing_category") return "Заявку підтверджено, але не додано в план: у заявки не вибрано категорію.";
  if (reason === "category_not_mapped") return "Заявку підтверджено, але не додано в план виконання. Для цієї категорії не знайдено план або виконавця.";
  if (reason === "plan_not_found") return "Заявку підтверджено, але не додано в план виконання. Чернетку потрібного плану не знайдено.";
  if (reason === "ensure_failed") return "Заявку підтверджено, але не вдалося підготувати чернетки планів тижня.";
  if (reason === "closed_ticket") return "Заявку підтверджено, але її не додано в план, бо вона вже закрита.";
  return "Заявку підтверджено, але не додано в план. Перевірте категорію або виконавця.";
}

export async function confirmDirectorTicketAction(ticketId: string, formData?: FormData) {
  const { user } = await requireAuth();
  const returnTo = safeTicketReturnTo(readString(formData, "returnTo"));
  const requestedPlanningMode = readString(formData, "planningMode");
  const planningMode = requestedPlanningMode === "no_plan" ? "no_plan" : "next_week";
  const result = await confirmTicketWithPlanningDecision(ticketId, {
    actorProfileId: user.id,
    planningMode,
    sourceContext: planningMode === "no_plan" ? "director_ticket_detail_no_plan" : "director_ticket_detail",
    expectedSource: "director_portal",
    requireObject: true,
    requireCategory: true,
  });
  if (!result.ok) redirectWith(ticketId, "statusError", result.error ?? planWarningMessage(result.planning.reason), returnTo);

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/work-planning");
  revalidatePath("/director/tickets");

  if (result.planning.warning) redirect(appendSearchParam(appendSearchParam(ticketDetailHref(ticketId, returnTo), "statusSuccess", "confirmed"), "statusWarning", result.planning.warning));
  if (planningMode === "no_plan") redirectSuccess(ticketId, "statusSuccess", "confirmed_no_plan", returnTo);
  if (result.planning.reason === "already_planned") redirectSuccess(ticketId, "statusSuccess", "confirmed_already_planned", returnTo);
  redirectSuccess(ticketId, "statusSuccess", "confirmed_planned", returnTo);
}

export async function rejectDirectorTicketAction(ticketId: string, formData?: FormData) {
  const { user, profile } = await requireAuth();
  const returnTo = safeTicketReturnTo(readString(formData, "returnTo"));
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для відхилення заявки директора.", returnTo);

  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено.", returnTo);
  if (ticket.source !== "director_portal") redirectWith(ticketId, "statusError", "Це не заявка від директора.", returnTo);
  if (ticket.status !== "pending_review") redirectWith(ticketId, "statusError", "Відхилити можна тільки заявку, що очікує перевірки.", returnTo);

  const reason = readString(formData, "reason");
  const supabase = await createClient();
  const { error } = await measureAsync("director-ticket:reject", () =>
    supabase
      .from("tickets")
      .update({ status: "rejected", completed_at: null, updated_at: new Date().toISOString() })
      .eq("id", ticketId),
  );
  if (error) redirectWith(ticketId, "statusError", error.message, returnTo);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Адміністратор відхилив заявку директора",
    metadata: { from: ticket.status, to: "rejected", reason: reason || null, source: "director_portal" },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/director/tickets");
  redirectSuccess(ticketId, "statusSuccess", "rejected", returnTo);
}
