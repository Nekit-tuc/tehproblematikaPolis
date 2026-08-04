import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Profile, UserRole } from "@/types/domain";

export async function getCurrentUser() {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export async function requireAuth() {
  if (!hasSupabaseEnv()) redirect("/login?error=supabase-env");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) redirect("/login?error=profile");
  return { user, profile };
}

export async function requireRole(allowedRoles: UserRole[]) {
  const auth = await requireAuth();
  if (!allowedRoles.includes(auth.profile.role)) redirect("/dashboard?error=forbidden");
  return auth;
}

export async function requireApprovedDirector() {
  const auth = await requireRole(["store_director"]);
  const status = auth.profile.approval_status ?? "approved";
  if (status === "pending") redirect("/director/pending");
  if (status === "rejected") redirect("/director/rejected");
  return auth;
}
