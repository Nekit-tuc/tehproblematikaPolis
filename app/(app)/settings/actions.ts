"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { serviceDeskCategories } from "@/lib/ai/category-taxonomy";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readCategoryPayload(formData: FormData) {
  const name = text(formData, "name");
  const description = text(formData, "description");

  if (!name) {
    return { ok: false as const, error: "Вкажіть назву категорії." };
  }

  if (!(serviceDeskCategories as readonly string[]).includes(name)) {
    return { ok: false as const, error: "Категорія має бути однією із 7 системних категорій Service Desk AI." };
  }

  return {
    ok: true as const,
    data: {
      name,
      description: description || null,
      is_active: true,
    },
  };
}

export async function createCategoryAction(formData: FormData) {
  await requireRole(["admin"]);
  redirect(`/settings?error=${encodeURIComponent("Категорії є системними. Додавання нових категорій вимкнено.")}`);
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
