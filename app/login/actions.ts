"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginAction(formData: FormData) {
  if (!hasSupabaseEnv()) redirect("/login?error=supabase-env");

  const email = readString(formData, "email");
  const password = readString(formData, "password");
  if (!email || !password) redirect("/login?error=validation");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect("/login?error=credentials");

  const { data: profile } = await supabase.from("profiles").select("id, role, is_active, approval_status").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=profile");
  }

  if (profile.role === "store_director") {
    if (profile.approval_status === "pending") redirect("/director/pending");
    if (profile.approval_status === "rejected") redirect("/director/rejected");
    redirect("/director/tickets");
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
