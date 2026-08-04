"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { ObjectType } from "@/types/domain";

type ObjectPayloadResult =
  | { ok: false; error: string }
  | {
      ok: true;
      data: {
        name: string;
        type: ObjectType;
        object_number: string;
        city: string;
        district: string | null;
        address: string;
        aliases: string[];
        manager_id: string | null;
        is_active: boolean;
        needs_admin_review: boolean;
        admin_note: string | null;
      };
    };

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function bool(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function aliases(formData: FormData) {
  return [
    ...new Set(
      text(formData, "aliases")
        .split(/\r?\n|,/g)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function readObjectPayload(formData: FormData): ObjectPayloadResult {
  const name = text(formData, "name");
  const type = text(formData, "type") as ObjectType;
  const objectNumber = text(formData, "object_number");
  const city = text(formData, "city");
  const district = text(formData, "other_district") || text(formData, "district");
  const address = text(formData, "address");
  const managerId = text(formData, "manager_id");
  const isActive = bool(formData, "is_active");
  const needsAdminReview = bool(formData, "needs_admin_review");
  const adminNote = text(formData, "admin_note");

  if (!name || !type || !objectNumber || !city || !address) {
    return { ok: false, error: "Заповніть назву, тип, номер, місто/район і адресу." };
  }

  return {
    ok: true,
    data: {
      name,
      type,
      object_number: objectNumber,
      city,
      district: district || null,
      address,
      aliases: aliases(formData),
      manager_id: managerId || null,
      is_active: isActive,
      needs_admin_review: needsAdminReview,
      admin_note: adminNote || null,
    },
  };
}

function objectErrorMessage(message: string) {
  if (message.includes("objects_object_number_unique_idx") || message.toLowerCase().includes("duplicate key value")) {
    return "Об'єкт з таким номером уже існує. Введіть інший номер.";
  }
  return "Не вдалося зберегти об'єкт. Перевірте дані та спробуйте ще раз.";
}

export async function createObjectAction(formData: FormData) {
  await requireRole(["admin"]);
  const payload = readObjectPayload(formData);
  if (!payload.ok) redirect(`/objects?error=${encodeURIComponent(payload.error)}`);

  const supabase = await createClient();
  const { error } = await supabase.from("objects").insert(payload.data);
  if (error) redirect(`/objects?error=${encodeURIComponent(objectErrorMessage(error.message))}`);

  revalidatePath("/objects");
  redirect("/objects?success=created");
}

export async function updateObjectAction(objectId: string, formData: FormData) {
  await requireRole(["admin"]);
  const payload = readObjectPayload(formData);
  if (!payload.ok) redirect(`/objects?error=${encodeURIComponent(payload.error)}`);

  const supabase = await createClient();
  const { error } = await supabase.from("objects").update(payload.data).eq("id", objectId);
  if (error) redirect(`/objects?error=${encodeURIComponent(objectErrorMessage(error.message))}`);

  revalidatePath("/objects");
  redirect("/objects?success=updated");
}

export async function setObjectActiveAction(objectId: string, isActive: boolean) {
  await requireRole(["admin"]);

  const supabase = await createClient();
  const { error } = await supabase.from("objects").update({ is_active: isActive }).eq("id", objectId);
  if (error) redirect(`/objects?error=${encodeURIComponent(objectErrorMessage(error.message))}`);

  revalidatePath("/objects");
  redirect(`/objects?success=${isActive ? "activated" : "deactivated"}`);
}

export async function deactivateObjectAction(objectId: string) {
  await setObjectActiveAction(objectId, false);
}