"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { closeWeeklyPeriod, rebuildArchivedWeeklySnapshot } from "@/lib/supabase/weekly-control";

export async function closeWeeklyPeriodAction(formData: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const periodId = String(formData.get("periodId") ?? "");
  if (!periodId) redirect("/weekly-control?error=missing-period");

  const result = await closeWeeklyPeriod(periodId);
  revalidatePath("/dashboard");
  revalidatePath("/weekly-control");
  revalidatePath(`/weekly-control/${periodId}`);
  revalidatePath("/work-planning");
  revalidatePath("/tickets");

  if (result.error) redirect(`/weekly-control?error=close-failed&period=${periodId}`);
  redirect(`/weekly-control/${periodId}?success=closed`);
}

export async function rebuildWeeklyArchiveAction(formData: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const periodId = String(formData.get("periodId") ?? "");
  if (!periodId) redirect("/weekly-control?error=missing-period");

  const result = await rebuildArchivedWeeklySnapshot(periodId);
  revalidatePath("/dashboard");
  revalidatePath("/weekly-control");
  revalidatePath(`/weekly-control/${periodId}`);
  revalidatePath("/reports");
  revalidatePath("/reports/weekly");
  revalidatePath("/reports/director");

  if (result.error) redirect(`/weekly-control/${periodId}?error=rebuild-failed`);
  redirect(`/weekly-control/${periodId}?success=recalculated`);
}
