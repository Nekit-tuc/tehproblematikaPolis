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
  const district = text(formData, "district");
  const address = text(formData, "address");
  const managerId = text(formData, "manager_id");
  const isActive = bool(formData, "is_active");

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
    },
  };
}

export async function createObjectAction(formData: FormData) {
  await requireRole(["admin"]);
  const payload = readObjectPayload(formData);
  if (!payload.ok) redirect(`/objects?error=${encodeURIComponent(payload.error)}`);

  const supabase = await createClient();
  const { error } = await supabase.from("objects").insert(payload.data);
  if (error) redirect(`/objects?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/objects");
  redirect("/objects?success=created");
}

export async function updateObjectAction(objectId: string, formData: FormData) {
  await requireRole(["admin"]);
  const payload = readObjectPayload(formData);
  if (!payload.ok) redirect(`/objects?error=${encodeURIComponent(payload.error)}`);

  const supabase = await createClient();
  const { error } = await supabase.from("objects").update(payload.data).eq("id", objectId);
  if (error) redirect(`/objects?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/objects");
  redirect("/objects?success=updated");
}
