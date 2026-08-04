"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function adminError(code: string): never {
  redirect(`/admin/login?error=${encodeURIComponent(code)}`);
}

export async function adminLoginAction(formData: FormData) {
  if (!hasSupabaseEnv()) adminError("supabase-env");

  const email = readString(formData, "email");
  const password = readString(formData, "password");
  if (!email || !password) adminError("validation");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) adminError("credentials");

  const { data: profile } = await supabase.from("profiles").select("id, role, is_active, approval_status").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    adminError("profile");
  }

  if (profile.role === "store_director") {
    if (profile.approval_status === "pending") redirect("/director/pending");
    if (profile.approval_status === "rejected") redirect("/director/rejected");
    redirect("/director");
  }

  redirect("/dashboard");
}
