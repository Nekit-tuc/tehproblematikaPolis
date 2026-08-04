"use server";

import { redirect } from "next/navigation";
import { directorEmailFromPhone, isValidDirectorPhone } from "@/lib/auth/director";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function directorError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function loginAction(formData: FormData) {
  if (!hasSupabaseEnv()) directorError("Supabase не налаштований.");

  const phone = readString(formData, "phone");
  const password = readString(formData, "password");
  if (!isValidDirectorPhone(phone) || !password) directorError("Вкажіть телефон і пароль.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: directorEmailFromPhone(phone), password });
  if (error || !data.user) directorError("Невірний телефон або пароль.");

  const { data: profile } = await supabase.from("profiles").select("id, role, is_active, approval_status").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    directorError("Акаунт не активний або профіль не знайдено.");
  }

  if (profile.role !== "store_director") {
    await supabase.auth.signOut();
    redirect("/admin/login?error=admin-login-required");
  }

  if (profile.approval_status === "pending") redirect("/director/pending");
  if (profile.approval_status === "rejected") redirect("/director/rejected");
  redirect("/director");
}

export async function logoutAction() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
