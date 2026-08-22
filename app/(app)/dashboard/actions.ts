"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import {
  addTicketsToSelectedWeekPlans,
  autoPlanAllActiveTickets,
  type DashboardPlanRefreshTargetWeek,
  type DashboardPlanRefreshSummary,
} from "@/lib/supabase/dashboard-plan-refresh";

const targetWeeks: DashboardPlanRefreshTargetWeek[] = ["current_week", "next_week"];

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTargetWeek(formData: FormData) {
  const targetWeekValue = readString(formData, "targetWeek");
  return targetWeeks.includes(targetWeekValue as DashboardPlanRefreshTargetWeek)
    ? (targetWeekValue as DashboardPlanRefreshTargetWeek)
    : null;
}

function appendSummaryParams(params: URLSearchParams, summary: DashboardPlanRefreshSummary) {
  params.set("added", String(summary.added));
  params.set("already", String(summary.alreadyPlanned));
  params.set("skipped", String(summary.skipped));
  params.set("errors", String(summary.errors));
  const visibleDetails = summary.details.filter((detail) => detail.status !== "added");
  const reasonCounts = new Map<string, number>();
  for (const detail of visibleDetails) {
    reasonCounts.set(detail.reasonText, (reasonCounts.get(detail.reasonText) ?? 0) + 1);
  }
  const reasonGroups = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => `${reason} — ${count}`)
    .join("\n");
  const details = visibleDetails
    .slice(0, 20)
    .map((detail) => detail.message)
    .join("\n");
  params.set("detailsTotal", String(visibleDetails.length));
  if (reasonGroups) params.set("reasonGroups", reasonGroups);
  if (details) params.set("details", details);
}

export async function updatePlansFromDashboardAction(formData: FormData) {
  const { profile } = await requireRole(["admin", "management", "tech_manager"]);
  const targetWeek = readTargetWeek(formData);
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
  });
  appendSummaryParams(params, result.data);
  redirect(`/dashboard?${params.toString()}`);
}

export async function autoPlanAllActiveTicketsAction(formData: FormData) {
  const { profile } = await requireRole(["admin", "management", "tech_manager"]);
  const targetWeek = readTargetWeek(formData);

  if (!targetWeek) {
    redirect("/dashboard?planRefresh=error&message=" + encodeURIComponent("Оберіть тиждень для автопланування."));
  }

  const result = await autoPlanAllActiveTickets({
    actorId: profile.id,
    targetWeek,
  });

  revalidatePath("/dashboard");
  revalidatePath("/work-planning");
  revalidatePath("/tickets");
  revalidatePath("/weekly-control");

  if (result.error || !result.data) {
    redirect("/dashboard?planRefresh=error&message=" + encodeURIComponent(result.error ?? "Не вдалося виконати автопланування."));
  }

  const params = new URLSearchParams({ planRefresh: "auto" });
  appendSummaryParams(params, result.data);
  redirect(`/dashboard?${params.toString()}`);
}
