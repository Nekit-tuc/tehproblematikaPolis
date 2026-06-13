"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readCategoryPayload(formData: FormData) {
  const name = text(formData, "name");
  const description = text(formData, "description");
  const isActive = formData.get("is_active") === "on";

  if (!name) {
    return { ok: false as const, error: "Вкажіть назву категорії." };
  }

  return {
    ok: true as const,
    data: {
      name,
      description: description || null,
      is_active: isActive,
    },
  };
}

export async function createCategoryAction(formData: FormData) {
  await requireRole(["admin"]);
  const payload = readCategoryPayload(formData);
  if (!payload.ok) redirect(`/settings?error=${encodeURIComponent(payload.error)}`);

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert(payload.data);
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/settings");
  revalidatePath("/tickets/new");
  redirect("/settings?success=category-created");
}

export async function updateCategoryAction(categoryId: string, formData: FormData) {
  await requireRole(["admin"]);
  const payload = readCategoryPayload(formData);
  if (!payload.ok) redirect(`/settings?error=${encodeURIComponent(payload.error)}`);

  const supabase = await createClient();
  const { error } = await supabase.from("categories").update(payload.data).eq("id", categoryId);
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/settings");
  revalidatePath("/tickets/new");
  redirect("/settings?success=category-updated");
}
