"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { assignCategoriesToWorker, createWorker, deactivateWorker, deleteOrDeactivateWorker, updateWorker } from "@/lib/supabase/workers";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readCategories(formData: FormData) {
  return formData
    .getAll("categoryIds")
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean);
}

function workerPayload(formData: FormData) {
  return {
    name: readString(formData, "name"),
    phone: readString(formData, "phone"),
    telegram_username: readString(formData, "telegram_username").replace(/^@/, ""),
    telegram_id: readString(formData, "telegram_id"),
    notes: readString(formData, "notes"),
    is_active: formData.get("is_active") === "on",
  };
}

function errorUrl(message: string) {
  return `/workers?error=${encodeURIComponent(message)}`;
}

export async function createWorkerAction(formData: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const payload = workerPayload(formData);
  if (!payload.name) redirect(errorUrl("Вкажіть ім'я виконавця."));

  const result = await createWorker(payload);
  if (result.error || !result.data) redirect(errorUrl(result.error?.message ?? "Не вдалося створити виконавця."));

  const categoriesResult = await assignCategoriesToWorker(result.data.id, readCategories(formData));
  if (categoriesResult.error) redirect(errorUrl(categoriesResult.error.message));

  revalidatePath("/workers");
  redirect("/workers?success=created");
}

export async function updateWorkerAction(workerId: string, formData: FormData) {
  await requireRole(["admin", "management", "tech_manager"]);
  const payload = workerPayload(formData);
  if (!payload.name) redirect(errorUrl("Вкажіть ім'я виконавця."));

  const result = await updateWorker(workerId, payload);
  if (result.error) redirect(errorUrl(result.error.message));

  const categoriesResult = await assignCategoriesToWorker(workerId, readCategories(formData));
  if (categoriesResult.error) redirect(errorUrl(categoriesResult.error.message));

  revalidatePath("/workers");
  redirect("/workers?success=updated");
}

export async function deactivateWorkerAction(workerId: string) {
  await requireRole(["admin", "management", "tech_manager"]);
  const result = await deactivateWorker(workerId);
  if (result.error) redirect(errorUrl(result.error.message));

  revalidatePath("/workers");
  redirect("/workers?success=deactivated");
}

export async function deleteOrDeactivateWorkerAction(workerId: string) {
  await requireRole(["admin"]);
  const result = await deleteOrDeactivateWorker(workerId);
  if (result.error) redirect(errorUrl(result.error.message));

  revalidatePath("/workers");
  revalidatePath(`/workers/${workerId}`);
  redirect(`/workers?success=${result.mode === "deleted" ? "deleted" : "deactivated"}`);
}
