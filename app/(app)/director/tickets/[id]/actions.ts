"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApprovedDirector } from "@/lib/auth/server";
import { measureAsync } from "@/lib/performance";
import {
  directorOwnsTicketObject,
  getActFiles,
  getWorkCompletionActForTicket,
  nextWorkCompletionActNumber,
  uploadWorkCompletionActPhotos,
  validateActPhotos,
} from "@/lib/supabase/work-completion-acts";
import { getDirectorTicket } from "@/lib/supabase/director-queries";
import { createClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWith(ticketId: string, key: string, message: string): never {
  redirect(`/director/tickets/${ticketId}?${key}=${encodeURIComponent(message)}`);
}

export async function confirmDirectorWorkCompletionAction(ticketId: string, formData: FormData) {
  const { profile } = await requireApprovedDirector();
  const ticketResult = await getDirectorTicket(profile.id, ticketId);
  const ticket = ticketResult.data;
  if (!ticket) redirectWith(ticketId, "error", ticketResult.error ?? "Заявку не знайдено.");
  if (ticket.source !== "director_portal") redirectWith(ticketId, "error", "Це не заявка директорського порталу.");
  if (ticket.status !== "waiting_admin_confirmation") redirectWith(ticketId, "error", "Акт доступний тільки після позначки виконавця про виконання.");

  const ownershipResult = await directorOwnsTicketObject(profile.id, ticket.object_id);
  if (ownershipResult.error) redirectWith(ticketId, "error", ownershipResult.error);
  if (!ownershipResult.data) redirectWith(ticketId, "error", "Недостатньо прав для підтвердження цієї заявки.");

  const existingAct = await getWorkCompletionActForTicket(ticketId);
  if (existingAct.error) redirectWith(ticketId, "error", existingAct.error);
  if (existingAct.data) redirect(`/director/tickets/${ticketId}?success=act_exists`);

  const files = getActFiles(formData);
  const photoValidation = validateActPhotos(files);
  if (photoValidation) redirectWith(ticketId, "error", photoValidation);

  const actNumberResult = await nextWorkCompletionActNumber();
  if (actNumberResult.error || !actNumberResult.data) redirectWith(ticketId, "error", actNumberResult.error ?? "Не вдалося згенерувати номер акту.");

  const directorComment = readString(formData, "directorComment");
  const now = new Date().toISOString();
  const completedAt = ticket.worker_completed_at ?? now;
  const workDescription = ticket.description || ticket.title;
  if (workDescription.trim().length < 5) redirectWith(ticketId, "error", "Опис роботи занадто короткий для акту.");

  const supabase = await createClient();
  const { data: act, error: actError } = await measureAsync("work-act:create", () =>
    supabase
      .from("work_completion_acts")
      .insert({
        ticket_id: ticket.id,
        object_id: ticket.object_id,
        director_profile_id: profile.id,
        worker_id: ticket.assignee_worker_id ?? null,
        act_number: actNumberResult.data,
        work_description: workDescription,
        director_comment: directorComment || null,
        completed_at: completedAt,
        confirmed_at: now,
        created_by_profile_id: profile.id,
      })
      .select("id, act_number")
      .single(),
  );
  if (actError) {
    if (actError.code === "23505") redirect(`/director/tickets/${ticketId}?success=act_exists`);
    redirectWith(ticketId, "error", actError.message);
  }

  const createdAct = act as { id: string; act_number: string };
  const photoResult = await uploadWorkCompletionActPhotos({
    actId: createdAct.id,
    ticketId: ticket.id,
    profileId: profile.id,
    files,
  });
  if (photoResult.error) redirectWith(ticketId, "error", photoResult.error);

  const { error: ticketError } = await measureAsync("work-act:update-ticket", () =>
    supabase
      .from("tickets")
      .update({
        status: "done",
        completed_at: completedAt,
        admin_confirmed_at: now,
        updated_at: now,
      })
      .eq("id", ticket.id),
  );
  if (ticketError) redirectWith(ticketId, "error", ticketError.message);

  await supabase.from("ticket_history").insert({
    ticket_id: ticket.id,
    actor_id: profile.id,
    action: "Директор підтвердив виконання. Акт створено.",
    metadata: {
      source: "director_portal",
      act_id: createdAct.id,
      act_number: createdAct.act_number,
      photo_count: files.length,
      from: ticket.status,
      to: "done",
    },
  });

  revalidatePath("/director/tickets");
  revalidatePath(`/director/tickets/${ticket.id}`);
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/reports");
  redirect(`/director/tickets/${ticket.id}?success=act_created`);
}
