"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

async function requireDirectorLinkAdmin() {
  return requireRole(["admin", "management", "tech_manager"]);
}

function refreshObjectsAndDirectors() {
  revalidatePath("/objects");
  revalidatePath("/objects/directors");
  revalidatePath("/director");
  revalidatePath("/director/tickets");
  revalidatePath("/dashboard");
}

function redirectObjectsSuccess(success: string) {
  redirect(`/objects?success=${success}`);
}

async function loadDirectorAndObject(supabase: ReturnType<typeof createAdminClient>, directorProfileId: string, objectId: string) {
  const [directorResult, objectResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, role, approval_status").eq("id", directorProfileId).maybeSingle(),
    supabase.from("objects").select("id, name").eq("id", objectId).maybeSingle(),
  ]);
  if (directorResult.error) return { error: directorResult.error.message };
  if (objectResult.error) return { error: objectResult.error.message };
  const director = directorResult.data as { id: string; full_name?: string | null; phone?: string | null; role?: string | null; approval_status?: string | null } | null;
  const object = objectResult.data as { id: string; name?: string | null } | null;
  if (!director || director.role !== "store_director") return { error: "Обраний профіль не є директором магазину." };
  if (!object) return { error: "Об'єкт не знайдено." };
  return { director, object, error: null };
}

async function resetPrimaryForObject(supabase: ReturnType<typeof createAdminClient>, objectId: string) {
  return supabase.from("director_objects").update({ is_primary: false }).eq("object_id", objectId);
}

export async function linkDirectorToObjectAction(formData: FormData) {
  const { profile } = await requireDirectorLinkAdmin();
  const directorProfileId = text(formData, "directorProfileId");
  const objectId = text(formData, "objectId");
  const phone = text(formData, "phone");
  const isPrimary = bool(formData, "isPrimary");
  if (!directorProfileId || !objectId) redirect(`/objects?error=${encodeURIComponent("Оберіть директора та об'єкт.")}`);

  const supabase = createAdminClient();
  const context = await loadDirectorAndObject(supabase, directorProfileId, objectId);
  if (context.error) redirect(`/objects?error=${encodeURIComponent(context.error)}`);

  if (isPrimary) {
    const reset = await resetPrimaryForObject(supabase, objectId);
    if (reset.error) redirect(`/objects?error=${encodeURIComponent(reset.error.message)}`);
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("director_objects").upsert({
    profile_id: directorProfileId,
    object_id: objectId,
    phone: phone || context.director?.phone || null,
    approval_status: "approved",
    is_primary: isPrimary,
    approved_at: now,
    approved_by_profile_id: profile.id,
    rejected_at: null,
    rejection_reason: null,
  }, { onConflict: "profile_id,object_id" });
  if (error) redirect(`/objects?error=${encodeURIComponent(error.message)}`);

  refreshObjectsAndDirectors();
  redirectObjectsSuccess("director-linked");
}

export async function unlinkDirectorFromObjectAction(formData: FormData) {
  await requireDirectorLinkAdmin();
  const directorProfileId = text(formData, "directorProfileId");
  const objectId = text(formData, "objectId");
  if (!directorProfileId || !objectId) redirect(`/objects?error=${encodeURIComponent("Прив'язку не знайдено.")}`);

  const supabase = createAdminClient();
  const { error } = await supabase.from("director_objects").delete().eq("profile_id", directorProfileId).eq("object_id", objectId);
  if (error) redirect(`/objects?error=${encodeURIComponent(error.message)}`);

  refreshObjectsAndDirectors();
  redirectObjectsSuccess("director-unlinked");
}

export async function approveDirectorObjectLinkFromObjectsAction(formData: FormData) {
  const { profile } = await requireDirectorLinkAdmin();
  const linkId = text(formData, "linkId");
  const objectId = text(formData, "objectId");
  const isPrimary = bool(formData, "isPrimary");
  if (!linkId || !objectId) redirect(`/objects?error=${encodeURIComponent("Прив'язку не знайдено.")}`);

  const supabase = createAdminClient();
  if (isPrimary) {
    const reset = await resetPrimaryForObject(supabase, objectId);
    if (reset.error) redirect(`/objects?error=${encodeURIComponent(reset.error.message)}`);
  }
  const { error } = await supabase
    .from("director_objects")
    .update({
      approval_status: "approved",
      is_primary: isPrimary,
      approved_at: new Date().toISOString(),
      approved_by_profile_id: profile.id,
      rejected_at: null,
      rejection_reason: null,
    })
    .eq("id", linkId)
    .eq("object_id", objectId);
  if (error) redirect(`/objects?error=${encodeURIComponent(error.message)}`);

  refreshObjectsAndDirectors();
  redirectObjectsSuccess("director-link-approved");
}

export async function rejectDirectorObjectLinkFromObjectsAction(formData: FormData) {
  await requireDirectorLinkAdmin();
  const linkId = text(formData, "linkId");
  const objectId = text(formData, "objectId");
  const note = text(formData, "note");
  if (!linkId || !objectId) redirect(`/objects?error=${encodeURIComponent("Прив'язку не знайдено.")}`);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("director_objects")
    .update({
      approval_status: "rejected",
      is_primary: false,
      rejected_at: new Date().toISOString(),
      rejection_reason: note || null,
      note: note || null,
    })
    .eq("id", linkId)
    .eq("object_id", objectId);
  if (error) redirect(`/objects?error=${encodeURIComponent(error.message)}`);

  refreshObjectsAndDirectors();
  redirectObjectsSuccess("director-link-rejected");
}

export async function setPrimaryDirectorForObjectAction(formData: FormData) {
  await requireDirectorLinkAdmin();
  const linkId = text(formData, "linkId");
  const objectId = text(formData, "objectId");
  if (!linkId || !objectId) redirect(`/objects?error=${encodeURIComponent("Прив'язку не знайдено.")}`);

  const supabase = createAdminClient();
  const reset = await resetPrimaryForObject(supabase, objectId);
  if (reset.error) redirect(`/objects?error=${encodeURIComponent(reset.error.message)}`);
  const selected = await supabase.from("director_objects").update({ is_primary: true, approval_status: "approved" }).eq("id", linkId).eq("object_id", objectId);
  if (selected.error) redirect(`/objects?error=${encodeURIComponent(selected.error.message)}`);

  refreshObjectsAndDirectors();
  redirectObjectsSuccess("director-primary");
}
