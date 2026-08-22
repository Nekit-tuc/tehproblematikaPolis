"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import {
  addTicketsToSelectedWeekPlans,
  type DashboardPlanRefreshTargetWeek,
} from "@/lib/supabase/dashboard-plan-refresh";

const targetWeeks: DashboardPlanRefreshTargetWeek[] = ["current_week", "next_week"];

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function updatePlansFromDashboardAction(formData: FormData) {
  const { profile } = await requireRole(["admin", "management", "tech_manager"]);
  const targetWeekValue = readString(formData, "targetWeek");
  const targetWeek = targetWeeks.includes(targetWeekValue as DashboardPlanRefreshTargetWeek)
    ? (targetWeekValue as DashboardPlanRefreshTargetWeek)
    : null;
  const ticketIds = formData
    .getAll("ticketId")
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim());

  if (!targetWeek || ticketIds.length === 0) {
    redirect("/dashboard?planRefresh=error&message=" + encodeURIComponent("Оберіть тиждень і хоча б одну заявку."));
  }

  const workerOverrides: Record<string, string> = {};
  for (const ticketId of ticketIds) {
    const workerId = readString(formData, `workerId:${ticketId}`);
    if (workerId) workerOverrides[ticketId] = workerId;
  }

  const result = await addTicketsToSelectedWeekPlans({
    actorId: profile.id,
    targetWeek,
    ticketIds,
    workerOverrides,
  });

  revalidatePath("/dashboard");
  revalidatePath("/work-planning");
  revalidatePath("/tickets");
  for (const ticketId of ticketIds) revalidatePath(`/tickets/${ticketId}`);

  if (result.error || !result.data) {
    redirect("/dashboard?planRefresh=error&message=" + encodeURIComponent(result.error ?? "Не вдалося оновити плани."));
  }

  const params = new URLSearchParams({
    planRefresh: "success",
    added: String(result.data.added),
    already: String(result.data.alreadyPlanned),
    skipped: String(result.data.skipped),
    errors: String(result.data.errors),
  });
  redirect(`/dashboard?${params.toString()}`);
}