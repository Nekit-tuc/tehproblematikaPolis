"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApprovalStatus } from "@/types/domain";

async function requireDirectorAdmin() {
  return requireRole(["admin", "management", "tech_manager"]);
}

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function refresh(profileId?: string) {
  revalidatePath("/objects/directors");
  if (profileId) revalidatePath(`/objects/directors/${profileId}`);
}

export async function approveDirectorAccountAction(profileId: string) {
  const { profile } = await requireDirectorAdmin();
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("profiles").update({ approval_status: "approved", is_active: true }).eq("id", profileId).eq("role", "store_director");
  if (error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(error.message)}`);
  const links = await supabase.from("director_objects").update({ approval_status: "approved", approved_at: now, approved_by_profile_id: profile.id, rejected_at: null }).eq("profile_id", profileId).eq("approval_status", "pending");
  if (links.error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(links.error.message)}`);
  refresh(profileId);
  redirect(`/objects/directors/${profileId}?success=approved`);
}

export async function rejectDirectorAccountAction(profileId: string, formData: FormData) {
  await requireDirectorAdmin();
  const note = value(formData, "note");
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("profiles").update({ approval_status: "rejected", rejected_at: now, rejection_reason: note || null }).eq("id", profileId).eq("role", "store_director");
  if (error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(error.message)}`);
  const links = await supabase.from("director_objects").update({ approval_status: "rejected", rejected_at: now, rejection_reason: note || null, note: note || null }).eq("profile_id", profileId).eq("approval_status", "pending");
  if (links.error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(links.error.message)}`);
  refresh(profileId);
  redirect(`/objects/directors/${profileId}?success=rejected`);
}

export async function updateDirectorProfileAction(profileId: string, formData: FormData) {
  await requireDirectorAdmin();
  const fullName = value(formData, "fullName");
  const phone = value(formData, "phone");
  const approvalStatus = value(formData, "approvalStatus") as ApprovalStatus;
  if (!fullName || !["pending", "approved", "rejected"].includes(approvalStatus)) redirect(`/objects/directors/${profileId}?error=validation`);
  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName, phone: phone || null, approval_status: approvalStatus }).eq("id", profileId).eq("role", "store_director");
  if (error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(error.message)}`);
  refresh(profileId);
  redirect(`/objects/directors/${profileId}?success=updated`);
}

export async function addDirectorObjectLinkAction(profileId: string, formData: FormData) {
  const { profile } = await requireDirectorAdmin();
  const objectId = value(formData, "objectId");
  const phone = value(formData, "phone");
  if (!objectId) redirect(`/objects/directors/${profileId}?error=object-required`);
  const supabase = createAdminClient();
  const { error } = await supabase.from("director_objects").upsert({ profile_id: profileId, object_id: objectId, phone: phone || null, approval_status: "approved", approved_at: new Date().toISOString(), approved_by_profile_id: profile.id }, { onConflict: "profile_id,object_id" });
  if (error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(error.message)}`);
  refresh(profileId);
  redirect(`/objects/directors/${profileId}?success=link-added`);
}

export async function removeDirectorObjectLinkAction(profileId: string, linkId: string) {
  await requireDirectorAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("director_objects").delete().eq("id", linkId).eq("profile_id", profileId);
  if (error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(error.message)}`);
  refresh(profileId);
  redirect(`/objects/directors/${profileId}?success=link-removed`);
}

export async function approveDirectorObjectLinkAction(profileId: string, linkId: string) {
  const { profile } = await requireDirectorAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("director_objects").update({ approval_status: "approved", approved_at: new Date().toISOString(), approved_by_profile_id: profile.id, rejected_at: null }).eq("id", linkId).eq("profile_id", profileId);
  if (error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(error.message)}`);
  refresh(profileId);
  redirect(`/objects/directors/${profileId}?success=link-approved`);
}

export async function setPrimaryDirectorObjectAction(profileId: string, linkId: string) {
  await requireDirectorAdmin();
  const supabase = createAdminClient();
  const reset = await supabase.from("director_objects").update({ is_primary: false }).eq("profile_id", profileId);
  if (reset.error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(reset.error.message)}`);
  const selected = await supabase.from("director_objects").update({ is_primary: true }).eq("id", linkId).eq("profile_id", profileId);
  if (selected.error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(selected.error.message)}`);
  refresh(profileId);
  redirect(`/objects/directors/${profileId}?success=primary`);
}

export async function approveObjectRequestAction(profileId: string, requestId: string, formData: FormData) {
  const { profile } = await requireDirectorAdmin();
  const objectId = value(formData, "objectId");
  if (!objectId) redirect(`/objects/directors/${profileId}?error=object-required`);
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const request = await supabase.from("director_object_requests").update({ status: "approved", resolved_object_id: objectId, approved_at: now, approved_by_profile_id: profile.id }).eq("id", requestId).eq("profile_id", profileId);
  if (request.error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(request.error.message)}`);
  const link = await supabase.from("director_objects").upsert({ profile_id: profileId, object_id: objectId, approval_status: "approved", approved_at: now, approved_by_profile_id: profile.id }, { onConflict: "profile_id,object_id" });
  if (link.error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(link.error.message)}`);
  refresh(profileId);
  redirect(`/objects/directors/${profileId}?success=request-approved`);
}

export async function rejectObjectRequestAction(profileId: string, requestId: string, formData: FormData) {
  await requireDirectorAdmin();
  const note = value(formData, "note");
  const supabase = createAdminClient();
  const { error } = await supabase.from("director_object_requests").update({ status: "rejected", rejected_at: new Date().toISOString(), rejection_reason: note || null, admin_note: note || null }).eq("id", requestId).eq("profile_id", profileId);
  if (error) redirect(`/objects/directors/${profileId}?error=${encodeURIComponent(error.message)}`);
  refresh(profileId);
  redirect(`/objects/directors/${profileId}?success=request-rejected`);
}