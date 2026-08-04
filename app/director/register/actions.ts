"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { directorEmailFromPhone, isValidDirectorPhone, normalizeDirectorPhone } from "@/lib/auth/director";
import { measureAsync } from "@/lib/performance";

function values(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean);
}

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function fail(message: string): never {
  redirect(`/director/register?error=${encodeURIComponent(message)}`);
}

export async function registerDirectorAction(formData: FormData) {
  if (!hasSupabaseEnv()) fail("Supabase не налаштований.");

  const fullName = value(formData, "fullName");
  const phone = value(formData, "phone");
  const password = value(formData, "password");
  const objectIds = values(formData, "objectIds");
  const requestedAddresses = value(formData, "requestedAddresses")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 5);

  if (fullName.length < 2) fail("Вкажіть ім'я директора.");
  if (!isValidDirectorPhone(phone)) fail("Вкажіть коректний робочий номер телефону.");
  if (password.length < 6) fail("Пароль має містити щонайменше 6 символів.");
  if (objectIds.length === 0 && requestedAddresses.length === 0) fail("Оберіть магазин або додайте адресу нового магазину.");

  const normalizedPhone = normalizeDirectorPhone(phone);
  const email = directorEmailFromPhone(phone);
  const admin = createAdminClient();

  const existingProfile = await measureAsync("director-register:existing_phone", () =>
    admin.from("profiles").select("id").or(`phone.eq.${normalizedPhone},email.eq.${email}`).maybeSingle(),
  );
  if (existingProfile.error) fail(existingProfile.error.message);
  if (existingProfile.data) fail("Акаунт з таким номером вже існує.");

  const authResult = await measureAsync("director-register:auth_user", () =>
    admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone: normalizedPhone, role: "store_director" },
    }),
  );
  if (authResult.error || !authResult.data.user) fail(authResult.error?.message ?? "Не вдалося створити користувача.");
  const userId = authResult.data.user.id;

  const profileResult = await measureAsync("director-register:profile", () =>
    admin.from("profiles").upsert({ id: userId, full_name: fullName, email, phone: normalizedPhone, role: "store_director", approval_status: "pending", is_active: true }).select("id").single(),
  );
  if (profileResult.error) {
    await admin.auth.admin.deleteUser(userId);
    fail(profileResult.error.message);
  }

  if (objectIds.length > 0) {
    const { data: objects, error: objectsError } = await admin.from("objects").select("id").in("id", objectIds).eq("is_active", true);
    if (objectsError) fail(objectsError.message);
    const safeObjectIds = (objects ?? []).map((item) => item.id);
    if (safeObjectIds.length > 0) {
      const links = safeObjectIds.map((objectId, index) => ({ profile_id: userId, object_id: objectId, phone: normalizedPhone, is_primary: index === 0, approval_status: "pending" }));
      const { error } = await measureAsync("director-register:director_objects", () => admin.from("director_objects").upsert(links, { onConflict: "profile_id,object_id" }));
      if (error) fail(error.message);
    }
  }

  if (requestedAddresses.length > 0) {
    const rows = requestedAddresses.map((requested_address) => ({ profile_id: userId, requested_address, status: "pending" }));
    const { error } = await measureAsync("director-register:object_requests", () => admin.from("director_object_requests").insert(rows));
    if (error) fail(error.message);
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/director/pending");
}