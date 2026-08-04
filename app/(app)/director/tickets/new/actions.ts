"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApprovedDirector } from "@/lib/auth/server";
import { measureAsync } from "@/lib/performance";
import { createClient } from "@/lib/supabase/server";
import { generateTicketNumber, isDuplicateTicketNumberError, TICKET_NUMBER_RETRY_LIMIT } from "@/lib/tickets/numbering";
import type { TicketPriority } from "@/types/domain";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function errorRedirect(message: string): never {
  redirect(`/director/tickets/new?error=${encodeURIComponent(message)}`);
}

export async function createDirectorTicketAction(formData: FormData) {
  const { user, profile } = await requireApprovedDirector();
  const objectId = value(formData, "objectId");
  const categoryId = value(formData, "categoryId");
  const phone = value(formData, "phone");
  const description = value(formData, "description");

  if (!objectId) errorRedirect("Оберіть магазин.");
  if (!categoryId) errorRedirect("Оберіть категорію.");
  if (description.length < 10) errorRedirect("Опис має містити щонайменше 10 символів.");

  const supabase = await createClient();
  const [directorObjectResult, categoryResult] = await Promise.all([
    measureAsync("director:create_object_check", () => supabase.from("director_objects").select("id, phone, approval_status, object:objects(id, is_active, name)").eq("profile_id", profile.id).eq("object_id", objectId).eq("approval_status", "approved").maybeSingle()),
    measureAsync("director:create_category_check", () => supabase.from("categories").select("id, name, is_active").eq("id", categoryId).eq("is_active", true).maybeSingle()),
  ]);

  if (directorObjectResult.error) errorRedirect(directorObjectResult.error.message);
  if (categoryResult.error) errorRedirect(categoryResult.error.message);
  if (!directorObjectResult.data) errorRedirect("Цей магазин ще не підтверджений для вашого профілю.");
  if (!categoryResult.data) errorRedirect("Активну категорію не знайдено.");

  const title = description.length > 80 ? `${description.slice(0, 77)}...` : description;
  const priority: TicketPriority = "medium";
  let ticket: { id: string } | null = null;
  let number = "";
  let lastError: { message?: string; code?: string } | null = null;

  for (let attempt = 1; attempt <= TICKET_NUMBER_RETRY_LIMIT; attempt += 1) {
    number = await generateTicketNumber(supabase);
    const { data, error } = await measureAsync("director:create_ticket", () => supabase.from("tickets").insert({ number, title, description, status: "pending_review", priority, object_id: objectId, category_id: categoryId, created_by: user.id, created_by_profile_id: user.id, director_profile_id: profile.id, director_phone: phone || (directorObjectResult.data as { phone?: string | null }).phone || profile.phone || null, source: "director_portal", assigned_to: null, assignee_worker_id: null }).select("id").single());
    if (!error && data) { ticket = data as { id: string }; break; }
    lastError = error;
    if (isDuplicateTicketNumberError(error) && attempt < TICKET_NUMBER_RETRY_LIMIT) continue;
    break;
  }

  if (!ticket) errorRedirect(lastError?.message ?? "Не вдалося створити заявку.");
  const { error: historyError } = await supabase.from("ticket_history").insert({ ticket_id: ticket.id, actor_id: user.id, action: "Директор створив заявку", metadata: { source: "director_portal", status: "pending_review" } });
  if (historyError) errorRedirect(historyError.message);

  revalidatePath("/director/tickets");
  revalidatePath("/tickets");
  redirect("/director/tickets?success=created");
}