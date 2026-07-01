import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_BUCKET } from "@/lib/photos";
import { priorityLabels } from "@/lib/labels";
import { generateTicketNumber, isDuplicateTicketNumberError, TICKET_NUMBER_RETRY_LIMIT } from "@/lib/tickets/numbering";
import type { Category, CompanyObject, Profile, TicketPriority, TicketWithRelations } from "@/types/domain";
import { downloadTelegramFile, sendTelegramMessage } from "./client";
import type { TelegramTicketPayload } from "./session";

const DEFAULT_PRIORITY: TicketPriority = "medium";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export async function findTelegramProfile(telegramId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("telegram_id", telegramId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function getAvailableObjects(profile: Profile) {
  const supabase = createAdminClient();
  const defaultObjectId = profile.default_object_id ?? profile.object_id;
  if (defaultObjectId) {
    const { data, error } = await supabase.from("objects").select("*").eq("id", defaultObjectId).eq("is_active", true).maybeSingle();
    if (error) throw error;
    return data ? [data as CompanyObject] : [];
  }

  if (["admin", "management", "tech_manager"].includes(profile.role)) {
    const { data, error } = await supabase.from("objects").select("*").eq("is_active", true).order("name");
    if (error) throw error;
    return (data ?? []) as CompanyObject[];
  }

  return [];
}

export async function getActiveCategories() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("categories").select("*").eq("is_active", true).order("name");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function buildTelegramTicketSummary(payload: TelegramTicketPayload, profile: Profile) {
  const supabase = createAdminClient();
  const [{ data: object }, { data: category }] = await Promise.all([
    supabase.from("objects").select("name,address,city").eq("id", payload.object_id).maybeSingle(),
    supabase.from("categories").select("name").eq("id", payload.category_id).maybeSingle(),
  ]);

  return [
    "Перевірте заявку:",
    `Об'єкт: ${object?.name ?? "-"}`,
    `Категорія: ${category?.name ?? "-"}`,
    `Пріоритет: ${priorityLabels[DEFAULT_PRIORITY]}`,
    `Від: ${profile.full_name}`,
    `Опис: ${payload.description ?? "-"}`,
    `Фото: ${payload.photo_file_ids?.length ?? 0}`,
  ].join("\n");
}

function extensionFor(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

async function uploadTelegramPhotos(ticketId: string, profileId: string, fileIds: string[]) {
  const supabase = createAdminClient();
  const uploaded: string[] = [];
  for (const [index, fileId] of fileIds.entries()) {
    const file = await downloadTelegramFile(fileId);
    const path = `${ticketId}/before/telegram-${Date.now()}-${index}-${crypto.randomUUID()}.${extensionFor(file.contentType)}`;
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file.bytes, {
      contentType: file.contentType,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    uploaded.push(path);

    const { error: photoError } = await supabase.from("ticket_photos").insert({
      ticket_id: ticketId,
      uploaded_by: profileId,
      type: "before",
      storage_path: path,
      caption: "Фото з Telegram",
    });
    if (photoError) throw photoError;
  }

  if (uploaded.length > 0) {
    const { error } = await supabase.from("ticket_history").insert({
      ticket_id: ticketId,
      actor_id: profileId,
      action: "Додано фото ДО через Telegram-бот",
      metadata: { type: "before", count: uploaded.length, paths: uploaded },
    });
    if (error) throw error;
  }
}

export async function createTicketFromTelegram(profile: Profile, payload: TelegramTicketPayload) {
  if (!payload.object_id || !payload.category_id || !payload.description) {
    throw new Error("Неповні дані заявки.");
  }

  const supabase = createAdminClient();
  const title = payload.description.length > 80 ? `${payload.description.slice(0, 77)}...` : payload.description;
  let ticket: TicketWithRelations | null = null;
  let number = "";
  let lastError: { message?: string; code?: string } | null = null;
  for (let attempt = 1; attempt <= TICKET_NUMBER_RETRY_LIMIT; attempt += 1) {
    number = await generateTicketNumber(supabase);
    console.info("[telegram-ticket] generated ticket number", { number, retryCount: attempt - 1 });
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        number,
        title,
        description: payload.description,
        status: "new",
        priority: DEFAULT_PRIORITY,
        object_id: payload.object_id,
        category_id: payload.category_id,
        created_by: profile.id,
      })
      .select("*, object:objects(*), category:categories(*), creator:profiles!tickets_created_by_fkey(*)")
      .single();

    if (!error && data) {
      ticket = data as TicketWithRelations;
      console.info("[telegram-ticket] ticket insert succeeded", { ticketId: ticket.id, number, retryCount: attempt - 1 });
      break;
    }
    lastError = error;
    if (isDuplicateTicketNumberError(error) && attempt < TICKET_NUMBER_RETRY_LIMIT) {
      console.warn("[telegram-ticket] duplicate ticket number; retrying", { number, retryCount: attempt });
      continue;
    }
    break;
  }
  if (!ticket) throw lastError ?? new Error("Ticket insert failed");

  const { error: historyError } = await supabase.from("ticket_history").insert({
    ticket_id: ticket.id,
    actor_id: profile.id,
    action: "Заявку створено через Telegram-бот",
    metadata: { status: "new", source: "telegram" },
  });
  if (historyError) throw historyError;

  const photoIds = payload.photo_file_ids ?? [];
  if (photoIds.length > 0) await uploadTelegramPhotos(ticket.id, profile.id, photoIds);

  await notifyAdminsAboutTicket(ticket);
  return ticket;
}

export async function notifyAdminsAboutTicket(ticket: TicketWithRelations) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("telegram_id")
    .eq("is_active", true)
    .in("role", ["admin", "management"])
    .not("telegram_id", "is", null);
  if (error) throw error;

  const message = [
    `Нова заявка ${ticket.number}`,
    `Об'єкт: ${ticket.object?.name ?? "-"}`,
    `Категорія: ${ticket.category?.name ?? "-"}`,
    `Пріоритет: ${priorityLabels[ticket.priority]}`,
    `Опис: ${ticket.description}`,
    `Від: ${ticket.creator?.full_name ?? "-"}`,
    `Переглянути: ${appUrl()}/tickets/${ticket.id}`,
  ].join("\n");

  await Promise.allSettled((data ?? []).map((profile) => sendTelegramMessage(profile.telegram_id, message)));
}

export async function notifyRequesterTicketAccepted(ticket: TicketWithRelations) {
  const telegramId = ticket.creator?.telegram_id;
  if (!telegramId) return;
  await sendTelegramMessage(telegramId, `Вашу заявку ${ticket.number} прийнято в роботу.`);
}

export function ticketUrl(ticketId: string) {
  return `${appUrl()}/tickets/${ticketId}`;
}
