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

  const { data: profile } = await supabase.from("profiles").select("id, role, is_active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=profile");
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
