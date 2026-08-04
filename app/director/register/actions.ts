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

function normalizeAddress(address: string) {
  return address.replace(/\s+/g, " ").trim().slice(0, 200);
}

function uniqueAddresses(addresses: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const address of addresses.map(normalizeAddress).filter((item) => item.length >= 5)) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(address);
  }
  return result;
}

function nextObjectNumber(existingNumbers: string[]) {
  const numeric = existingNumbers
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));
  if (numeric.length === 0) return "001";
  const max = numeric.reduce(
    (current, value) => {
      const number = Number.parseInt(value, 10);
      return number > current.number ? { number, width: value.length } : current;
    },
    { number: 0, width: 3 },
  );
  return String(max.number + 1).padStart(Math.max(max.width, 3), "0");
}

async function createDirectorRegistrationObject(admin: ReturnType<typeof createAdminClient>, address: string, profileId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: numbers, error: numbersError } = await measureAsync("director-register:object_numbers", () =>
      admin.from("objects").select("object_number").order("object_number", { ascending: false }).limit(500),
    );
    if (numbersError) return { objectId: null, error: numbersError.message };
    const candidate = nextObjectNumber(((numbers ?? []) as Array<{ object_number: string | null }>).map((item) => item.object_number ?? ""));
    const objectNumber = attempt === 0 ? candidate : nextObjectNumber([...((numbers ?? []) as Array<{ object_number: string | null }>).map((item) => item.object_number ?? ""), candidate]);
    const { data, error } = await measureAsync("director-register:create_object", () =>
      admin
        .from("objects")
        .insert({
          name: address,
          type: "store",
          object_number: objectNumber,
          city: "Житомир",
          district: null,
          address,
          manager_id: null,
          is_active: true,
          source: "director_registration",
          created_by_profile_id: profileId,
          needs_admin_review: true,
          admin_note: "Створено директором під час реєстрації. Потрібно заповнити дані об'єкта.",
        })
        .select("id")
        .single(),
    );
    if (!error && data) return { objectId: (data as { id: string }).id, error: null };
    if (!error?.message?.toLowerCase().includes("duplicate")) return { objectId: null, error: error?.message ?? "Не вдалося створити об'єкт." };
  }
  return { objectId: null, error: "Не вдалося підібрати унікальний номер об'єкта." };
}

export async function registerDirectorAction(formData: FormData) {
  if (!hasSupabaseEnv()) fail("Supabase не налаштований.");

  const fullName = value(formData, "fullName");
  const phone = value(formData, "phone");
  const password = value(formData, "password");
  const objectIds = [...new Set(values(formData, "objectIds"))];
  const newAddresses = uniqueAddresses(value(formData, "requestedAddresses").split(/\r?\n/));

  if (fullName.length < 2) fail("Вкажіть ім'я директора.");
  if (!isValidDirectorPhone(phone)) fail("Вкажіть коректний робочий номер телефону.");
  if (password.length < 6) fail("Пароль має містити щонайменше 6 символів.");
  if (objectIds.length === 0 && newAddresses.length === 0) fail("Оберіть магазин або додайте адресу нового магазину.");

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

  const linkedObjectIds: string[] = [];
  if (objectIds.length > 0) {
    const { data: objects, error: objectsError } = await admin.from("objects").select("id").in("id", objectIds).eq("is_active", true);
    if (objectsError) fail(objectsError.message);
    linkedObjectIds.push(...(objects ?? []).map((item) => item.id));
  }

  for (const address of newAddresses) {
    const created = await createDirectorRegistrationObject(admin, address, userId);
    if (created.error || !created.objectId) fail(created.error ?? "Не вдалося створити новий об'єкт.");
    linkedObjectIds.push(created.objectId);
  }

  if (linkedObjectIds.length > 0) {
    const links = linkedObjectIds.map((objectId, index) => ({ profile_id: userId, object_id: objectId, phone: normalizedPhone, is_primary: index === 0, approval_status: "pending" }));
    const { error } = await measureAsync("director-register:director_objects", () => admin.from("director_objects").upsert(links, { onConflict: "profile_id,object_id" }));
    if (error) fail(error.message);
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/director/pending");
}