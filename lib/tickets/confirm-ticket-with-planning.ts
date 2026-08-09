import { canConfirmTicket } from "@/lib/auth/permissions";
import { measureAsync } from "@/lib/performance";
import { createAdminClient } from "@/lib/supabase/admin";
import { addConfirmedTicketToWeeklyDraftPlan, type ConfirmedTicketPlanReason } from "@/lib/supabase/work-plans";
import type { Profile, TicketStatus } from "@/types/domain";

export type ConfirmTicketPlanningMode = "current_week" | "next_week" | "no_plan";

export type ConfirmTicketWithPlanningOptions = {
  actorProfileId: string;
  planningMode?: ConfirmTicketPlanningMode;
  preferredWorkerId?: string | null;
  sourceContext?: string | null;
  expectedSource?: string | string[];
  requireObject?: boolean;
  requireCategory?: boolean;
};

export type ConfirmTicketPlanningResult = {
  mode: ConfirmTicketPlanningMode;
  added: boolean;
  reason: ConfirmedTicketPlanReason | "no_plan" | "current_week_not_supported" | "permission_denied" | "invalid_status" | "worker_not_found";
  warning?: string;
  planId?: string;
  planTitle?: string;
  itemId?: string | null;
  workerId?: string | null;
};

export type ConfirmTicketWithPlanningResult = {
  ok: boolean;
  ticketId: string;
  source: string | null;
  nextStatus?: TicketStatus;
  planning: ConfirmTicketPlanningResult;
  error?: string;
};

function defaultPlanningMode(source?: string | null): ConfirmTicketPlanningMode {
  if (source === "director_portal") return "next_week";
  return "next_week";
}

function sourceMatches(source: string | null | undefined, expected?: string | string[]) {
  if (!expected) return true;
  const expectedSources = Array.isArray(expected) ? expected : [expected];
  return expectedSources.includes(source ?? "");
}

export function confirmedTicketPlanWarning(reason?: string | null) {
  if (!reason || reason === "added" || reason === "already_planned" || reason === "no_plan") return "";
  if (reason === "current_week_not_supported") return "Заявку підтверджено, але додавання в поточний тиждень ще не увімкнено. Додайте заявку в план вручну або оберіть наступний тиждень.";
  if (reason === "missing_category") return "Заявку підтверджено, але не додано в план: у заявки не вибрано категорію.";
  if (reason === "category_not_mapped") return "Заявку підтверджено, але не додано в план виконання. Для цієї категорії не знайдено план або виконавця.";
  if (reason === "plan_not_found") return "Заявку підтверджено, але не додано в план виконання. Чернетку потрібного плану не знайдено.";
  if (reason === "ensure_failed") return "Заявку підтверджено, але не вдалося підготувати чернетки планів тижня.";
  if (reason === "closed_ticket") return "Заявку підтверджено, але її не додано в план, бо вона вже закрита.";
  if (reason === "pending_review_not_confirmed") return "Заявку не додано в план, бо вона ще очікує підтвердження.";
  if (reason === "worker_not_found") return "Заявку не підтверджено: вибраного активного виконавця не знайдено.";
  if (reason === "permission_denied") return "Недостатньо прав для підтвердження заявки.";
  if (reason === "invalid_status") return "Підтвердити можна тільки заявку, що очікує перевірки.";
  return "Заявку підтверджено, але не додано в план. Перевірте категорію або виконавця.";
}

async function loadActorProfile(actorProfileId: string) {
  const supabase = createAdminClient();
  const { data, error } = await measureAsync("ticket-confirm:actor-profile", () =>
    supabase.from("profiles").select("*").eq("id", actorProfileId).maybeSingle(),
  );
  return { profile: data as Profile | null, error };
}

async function writeHistory(input: {
  ticketId: string;
  actorId: string;
  action: string;
  metadata: Record<string, unknown>;
  label?: string;
}) {
  const supabase = createAdminClient();
  await measureAsync(input.label ?? "ticket-confirm:history", () =>
    supabase.from("ticket_history").insert({
      ticket_id: input.ticketId,
      actor_id: input.actorId,
      action: input.action,
      metadata: input.metadata,
    }),
  );
}

export async function confirmTicketWithPlanningDecision(
  ticketId: string,
  options: ConfirmTicketWithPlanningOptions,
): Promise<ConfirmTicketWithPlanningResult> {
  const supabase = createAdminClient();
  const actorResult = await loadActorProfile(options.actorProfileId);
  if (actorResult.error || !actorResult.profile) {
    return {
      ok: false,
      ticketId,
      source: null,
      error: actorResult.error?.message ?? "Профіль користувача не знайдено.",
      planning: { mode: options.planningMode ?? "next_week", added: false, reason: "permission_denied" },
    };
  }
  if (!canConfirmTicket(actorResult.profile)) {
    return {
      ok: false,
      ticketId,
      source: null,
      error: "Недостатньо прав для підтвердження заявки.",
      planning: { mode: options.planningMode ?? "next_week", added: false, reason: "permission_denied" },
    };
  }

  const { data: ticketData, error: ticketError } = await measureAsync("ticket-confirm:load", () =>
    supabase
      .from("tickets")
      .select("id, source, status, category_id, object_id, assignee_worker_id")
      .eq("id", ticketId)
      .maybeSingle(),
  );
  const ticket = ticketData as {
    id: string;
    source?: string | null;
    status?: TicketStatus | string | null;
    category_id?: string | null;
    object_id?: string | null;
    assignee_worker_id?: string | null;
  } | null;

  const mode = options.planningMode ?? defaultPlanningMode(ticket?.source);
  if (ticketError || !ticket) {
    return {
      ok: false,
      ticketId,
      source: null,
      error: ticketError?.message ?? "Заявку не знайдено.",
      planning: { mode, added: false, reason: "ticket_not_found" },
    };
  }
  if (ticket.status !== "pending_review") {
    return {
      ok: false,
      ticketId,
      source: ticket.source ?? null,
      error: "Підтвердити можна тільки заявку, що очікує перевірки.",
      planning: { mode, added: false, reason: "invalid_status" },
    };
  }
  if (!sourceMatches(ticket.source, options.expectedSource)) {
    return {
      ok: false,
      ticketId,
      source: ticket.source ?? null,
      error: "Джерело заявки не відповідає цій дії.",
      planning: { mode, added: false, reason: "invalid_status" },
    };
  }
  if (options.requireObject && !ticket.object_id) {
    return {
      ok: false,
      ticketId,
      source: ticket.source ?? null,
      error: "Перед підтвердженням виберіть об'єкт.",
      planning: { mode, added: false, reason: "invalid_status" },
    };
  }
  if (options.requireCategory && !ticket.category_id) {
    return {
      ok: false,
      ticketId,
      source: ticket.source ?? null,
      error: "Перед підтвердженням виберіть категорію.",
      planning: { mode, added: false, reason: "missing_category" },
    };
  }

  let workerId = options.preferredWorkerId || ticket.assignee_worker_id || null;
  if (options.preferredWorkerId) {
    const { data: worker, error: workerError } = await measureAsync("ticket-confirm:preferred-worker", () =>
      supabase.from("workers").select("id").eq("id", options.preferredWorkerId).eq("is_active", true).maybeSingle(),
    );
    if (workerError || !worker) {
      return {
        ok: false,
        ticketId,
        source: ticket.source ?? null,
        error: workerError?.message ?? "Активного виконавця не знайдено.",
        planning: { mode, added: false, reason: "worker_not_found" },
      };
    }
    workerId = options.preferredWorkerId;
  }

  const nextStatus: TicketStatus = workerId ? "assigned" : "new";
  const now = new Date().toISOString();
  const updatePayload: Record<string, string | null> = {
    status: nextStatus,
    completed_at: null,
    admin_confirmed_at: now,
    confirmed_by_profile_id: options.actorProfileId,
    updated_at: now,
  };
  if (options.preferredWorkerId) {
    updatePayload.assignee_worker_id = options.preferredWorkerId;
    updatePayload.assigned_at = now;
  }

  const { error: updateError } = await measureAsync("ticket-confirm:update", () =>
    supabase.from("tickets").update(updatePayload).eq("id", ticketId),
  );
  if (updateError) {
    return {
      ok: false,
      ticketId,
      source: ticket.source ?? null,
      error: updateError.message,
      planning: { mode, added: false, reason: "insert_error" },
    };
  }

  await writeHistory({
    ticketId,
    actorId: options.actorProfileId,
    action: "Заявку підтверджено",
    metadata: {
      from: ticket.status,
      to: nextStatus,
      source: ticket.source ?? null,
      source_context: options.sourceContext ?? null,
      planning_mode: mode,
      preferred_worker_id: options.preferredWorkerId ?? null,
    },
    label: "ticket-confirm:history-confirmed",
  });

  if (mode === "no_plan") {
    await writeHistory({
      ticketId,
      actorId: options.actorProfileId,
      action: "Заявку підтверджено без додавання в план",
      metadata: { source: ticket.source ?? null, source_context: options.sourceContext ?? null, planning_mode: mode },
      label: "ticket-confirm:history-no-plan",
    });
    return {
      ok: true,
      ticketId,
      source: ticket.source ?? null,
      nextStatus,
      planning: { mode, added: false, reason: "no_plan", workerId },
    };
  }

  if (mode === "current_week") {
    await writeHistory({
      ticketId,
      actorId: options.actorProfileId,
      action: "Заявку підтверджено, але не додано в план поточного тижня",
      metadata: { source: ticket.source ?? null, source_context: options.sourceContext ?? null, planning_mode: mode, reason: "current_week_not_supported" },
      label: "ticket-confirm:history-current-week-warning",
    });
    return {
      ok: true,
      ticketId,
      source: ticket.source ?? null,
      nextStatus,
      planning: {
        mode,
        added: false,
        reason: "current_week_not_supported",
        warning: confirmedTicketPlanWarning("current_week_not_supported"),
        workerId,
      },
    };
  }

  const planResult = await addConfirmedTicketToWeeklyDraftPlan(ticketId, options.actorProfileId);
  const planReason = planResult.error ? "insert_error" : planResult.data.reason;
  const warning = confirmedTicketPlanWarning(planReason);
  if (warning) {
    await writeHistory({
      ticketId,
      actorId: options.actorProfileId,
      action: "Заявку підтверджено, але не додано в план виконання",
      metadata: {
        reason: planResult.error ?? planResult.data.reason,
        source: ticket.source ?? null,
        source_context: options.sourceContext ?? null,
        planning_mode: mode,
      },
      label: "ticket-confirm:history-plan-warning",
    });
  }

  return {
    ok: true,
    ticketId,
    source: ticket.source ?? null,
    nextStatus,
    planning: {
      mode,
      added: planResult.data.added,
      reason: planReason,
      warning: warning || undefined,
      planId: planResult.data.planId,
      planTitle: planResult.data.planTitle,
      itemId: planResult.data.itemId,
      workerId: planResult.data.workerId ?? workerId,
    },
  };
}
