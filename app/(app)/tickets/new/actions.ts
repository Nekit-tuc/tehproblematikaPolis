"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getCurrentProfile } from "@/lib/auth/server";
import { canCreateTicket } from "@/lib/auth/permissions";
import { getFiles, uploadTicketPhotos, validatePhotos } from "@/lib/photos";
import type { TicketPriority, TicketStatus } from "@/types/domain";

const ticketPriorities: TicketPriority[] = ["low", "medium", "high", "critical"];

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

async function nextTicketNumber() {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const prefix = `PSD-${year}-`;
  const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).like("number", `${prefix}%`);
  return `${prefix}${String((count ?? 0) + 1).padStart(3, "0")}`;
}

export async function createTicketAction(formData: FormData) {
  if (!hasSupabaseEnv()) redirect("/tickets/new?error=supabase-env");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const profile = await getCurrentProfile();
  if (!profile || !canCreateTicket(profile)) redirect("/dashboard?error=forbidden");

  const title = value(formData, "title");
  const description = value(formData, "description");
  const objectId = value(formData, "object_id");
  const categoryId = value(formData, "category_id");
  const priority = value(formData, "priority") as TicketPriority;
  const assignedTo = value(formData, "assigned_to");
  const dueAt = value(formData, "due_at");
  const beforePhotos = getFiles(formData, "before_photos");

  if (!title || !description || !objectId || !categoryId || !priority || !ticketPriorities.includes(priority)) {
    redirect("/tickets/new?error=validation");
  }
  if (title.length < 3 || description.length < 10) {
    redirect("/tickets/new?error=validation-length");
  }
  if (profile.role === "store_manager" && profile.object_id !== objectId) {
    redirect("/tickets/new?error=object");
  }
  const photoValidationError = validatePhotos(beforePhotos);
  if (photoValidationError) redirect(`/tickets/new?error=${encodeURIComponent(photoValidationError)}`);

  const [{ data: selectedObject, error: objectError }, { data: selectedCategory, error: categoryError }] = await Promise.all([
    supabase.from("objects").select("id,is_active").eq("id", objectId).maybeSingle(),
    supabase.from("categories").select("id,is_active").eq("id", categoryId).maybeSingle(),
  ]);
  if (objectError || !selectedObject || !selectedObject.is_active) redirect("/tickets/new?error=object-missing");
  if (categoryError || !selectedCategory || !selectedCategory.is_active) redirect("/tickets/new?error=category-missing");

  const number = await nextTicketNumber();
  const initialStatus: TicketStatus = "new";
  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      number,
      title,
      description,
      status: initialStatus,
      object_id: objectId,
      category_id: categoryId,
      priority,
      created_by: auth.user.id,
      assigned_to: assignedTo || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !ticket) redirect(`/tickets/new?error=${encodeURIComponent(error?.message ?? "insert")}`);

  const { error: historyError } = await supabase.from("ticket_history").insert({
    ticket_id: ticket.id,
    actor_id: auth.user.id,
    action: "Заявку створено",
    metadata: { status: initialStatus },
  });
  if (historyError) redirect(`/tickets/new?error=${encodeURIComponent(historyError.message)}`);

  if (beforePhotos.length > 0) {
    const uploadResult = await uploadTicketPhotos({
      files: beforePhotos,
      profile,
      ticket: { id: ticket.id, number },
      type: "before",
    });
    if (uploadResult.error) redirect(`/tickets/new?error=${encodeURIComponent(uploadResult.error)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/tickets");
  redirect(`/tickets/${ticket.id}`);
}
