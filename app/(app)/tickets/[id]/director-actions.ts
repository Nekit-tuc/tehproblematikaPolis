"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canConfirmTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { measureAsync } from "@/lib/performance";
import { addConfirmedTicketToWeeklyDraftPlan } from "@/lib/supabase/work-plans";
import { getTicket } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import type { TicketStatus } from "@/types/domain";

function readString(formData: FormData | undefined, key: string) {
  const value = formData?.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWith(ticketId: string, key: string, message: string): never {
  redirect(`/tickets/${ticketId}?${key}=${encodeURIComponent(message)}`);
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

export async function confirmDirectorTicketAction(ticketId: string) {
  const { user, profile } = await requireAuth();
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для підтвердження заявки директора.");

  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено.");
  if (ticket.source !== "director_portal") redirectWith(ticketId, "statusError", "Це не заявка від директора.");
  if (ticket.status !== "pending_review") redirectWith(ticketId, "statusError", "Підтвердити можна тільки заявку, що очікує перевірки.");
  if (!ticket.object_id) redirectWith(ticketId, "statusError", "Перед підтвердженням виберіть об'єкт.");
  if (!ticket.category_id) redirectWith(ticketId, "statusError", "Перед підтвердженням виберіть категорію.");

  const supabase = await createClient();
  const now = new Date().toISOString();
  const nextStatus: TicketStatus = ticket.assignee_worker_id ? "assigned" : "new";
  const { error: updateError } = await measureAsync("director-ticket:confirm", () =>
    supabase
      .from("tickets")
      .update({
        status: nextStatus,
        admin_confirmed_at: now,
        confirmed_by_profile_id: user.id,
        completed_at: null,
        updated_at: now,
      })
      .eq("id", ticketId),
  );
  if (updateError) redirectWith(ticketId, "statusError", updateError.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: user.id,
    action: "Адміністратор підтвердив заявку директора",
    metadata: { from: ticket.status, to: nextStatus, source: "director_portal" },
  });

  const planResult = await addConfirmedTicketToWeeklyDraftPlan(ticketId, user.id);
  const warning = planResult.error || !planResult.data.added ? planWarningMessage(planResult.data.reason) : "";

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/work-planning");
  revalidatePath("/director/tickets");

  if (warning) redirect(`/tickets/${ticketId}?statusSuccess=confirmed&statusWarning=${encodeURIComponent(warning)}`);
  redirect(`/tickets/${ticketId}?statusSuccess=confirmed`);
}

export async function rejectDirectorTicketAction(ticketId: string, formData?: FormData) {
  const { user, profile } = await requireAuth();
  if (!canConfirmTicket(profile)) redirectWith(ticketId, "statusError", "Недостатньо прав для відхилення заявки директора.");

  const ticketResult = await getTicket(ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "statusError", ticketResult.error ?? "Заявку не знайдено.");
  if (ticket.source !== "director_portal") redirectWith(ticketId, "statusError", "Це не заявка від директора.");
  if (ticket.status !== "pending_review") redirectWith(ticketId, "statusError", "Відхилити можна тільки заявку, що очікує перевірки.");

  const reason = readString(formData, "reason");
  const supabase = await createClient();
  const { error } = await measureAsync("director-ticket:reject", () =>
    supabase
      .from("tickets")
      .update({ status: "rejected", completed_at: null, updated_at: new Date().toISOString() })
      .eq("id", ticketId),
  );
  if (error) redirectWith(ticketId, "statusError", error.message);

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
  redirect(`/tickets/${ticketId}?statusSuccess=rejected`);
}
