"use server";

import { redirect } from "next/navigation";
import { directorEmailFromPhone, isValidDirectorPhone } from "@/lib/auth/director";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function fail(message: string): never {
  redirect(`/director/login?error=${encodeURIComponent(message)}`);
}

export async function directorLoginAction(formData: FormData) {
  if (!hasSupabaseEnv()) fail("Supabase не налаштований.");
  const phone = value(formData, "phone");
  const password = value(formData, "password");
  if (!isValidDirectorPhone(phone) || !password) fail("Вкажіть телефон і пароль.");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: directorEmailFromPhone(phone), password });
  if (error || !data.user) fail("Невірний телефон або пароль.");
  const { data: profile } = await supabase.from("profiles").select("id, role, is_active, approval_status").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active || profile.role !== "store_director") {
    await supabase.auth.signOut();
    fail("Цей акаунт не є акаунтом директора.");
  }
  if (profile.approval_status === "pending") redirect("/director/pending");
  if (profile.approval_status === "rejected") redirect("/director/rejected");
  redirect("/director/tickets");
}