import { measureAsync } from "@/lib/performance";
import { PHOTO_BUCKET, ALLOWED_PHOTO_TYPES } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TicketWithRelations, WorkCompletionAct, WorkCompletionActPhoto, WorkCompletionActWithRelations } from "@/types/domain";
import type { QueryResult } from "./queries";

export const MAX_ACT_PHOTOS = 5;
export const MAX_ACT_PHOTO_SIZE = 10 * 1024 * 1024;

type ActRow = WorkCompletionActWithRelations & {
  director?: Profile | Profile[] | null;
  object?: WorkCompletionActWithRelations["object"] | WorkCompletionActWithRelations["object"][] | null;
  worker?: WorkCompletionActWithRelations["worker"] | WorkCompletionActWithRelations["worker"][] | null;
  ticket?: TicketWithRelations | TicketWithRelations[] | null;
  photos?: WorkCompletionActPhoto[] | null;
};

const actSelect = `
  id,
  ticket_id,
  object_id,
  director_profile_id,
  worker_id,
  act_number,
  work_description,
  director_comment,
  completed_at,
  confirmed_at,
  created_at,
  updated_at,
  created_by_profile_id,
  ticket:tickets(
    id,
    number,
    title,
    description,
    status,
    priority,
    object_id,
    category_id,
    created_by,
    assigned_to,
    assignee_worker_id,
    completed_at,
    worker_completed_at,
    admin_confirmed_at,
    source,
    director_profile_id,
    director_phone,
    created_at,
    updated_at,
    category:categories(id, name, description, is_active, created_at)
  ),
  object:objects(id, name, type, object_number, city, district, address, source, created_by_profile_id, needs_admin_review, admin_note, is_active, created_at),
  director:profiles!work_completion_acts_director_profile_id_fkey(id, full_name, email, role, phone, is_active, created_at),
  worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at),
  photos:work_completion_act_photos(id, act_id, ticket_id, storage_path, file_name, content_type, size_bytes, created_at, uploaded_by_profile_id)
`;

function singleRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function toAct(row: ActRow | null): WorkCompletionActWithRelations | null {
  if (!row) return null;
  return {
    ...row,
    ticket: singleRelation(row.ticket),
    object: singleRelation(row.object),
    director: singleRelation(row.director),
    worker: singleRelation(row.worker),
    photos: row.photos ?? [],
  };
}

export function getActFiles(formData: FormData, key = "photos") {
  return formData
    .getAll(key)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export function validateActPhotos(files: File[]) {
  if (files.length > MAX_ACT_PHOTOS) return `Можна завантажити максимум ${MAX_ACT_PHOTOS} фото до акту.`;
  for (const file of files) {
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return `Файл ${file.name} має недозволений формат. Дозволено jpg, jpeg, png, webp.`;
    if (file.size > MAX_ACT_PHOTO_SIZE) return `Файл ${file.name} більший за 10 MB.`;
  }
  return null;
}

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp"].includes(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export async function getWorkCompletionActForTicket(ticketId: string): Promise<QueryResult<WorkCompletionActWithRelations | null>> {
  const supabase = await createClient();
  const { data, error } = await measureAsync("admin-ticket:act", () =>
    supabase.from("work_completion_acts").select(actSelect).eq("ticket_id", ticketId).maybeSingle(),
  );
  return { data: toAct(data as ActRow | null), error: error?.message ?? null };
}

export async function getWorkCompletionActsForTickets(ticketIds: string[]): Promise<QueryResult<Map<string, WorkCompletionAct>>> {
  const map = new Map<string, WorkCompletionAct>();
  const ids = Array.from(new Set(ticketIds.filter(Boolean)));
  if (ids.length === 0) return { data: map, error: null };
  const supabase = await createClient();
  const { data, error } = await measureAsync("director-ticket:act-status", () =>
    supabase
      .from("work_completion_acts")
      .select("id, ticket_id, object_id, director_profile_id, worker_id, act_number, work_description, director_comment, completed_at, confirmed_at, created_at, updated_at, created_by_profile_id")
      .in("ticket_id", ids),
  );
  if (error) return { data: map, error: error.message };
  for (const row of (data ?? []) as WorkCompletionAct[]) map.set(row.ticket_id, row);
  return { data: map, error: null };
}

export async function nextWorkCompletionActNumber(): Promise<QueryResult<string>> {
  const supabase = await createClient();
  const { data, error } = await measureAsync("work-act:number", () => supabase.rpc("next_work_completion_act_number"));
  return { data: typeof data === "string" ? data : "", error: error?.message ?? null };
}

export async function uploadWorkCompletionActPhotos(input: {
  actId: string;
  ticketId: string;
  profileId: string;
  files: File[];
}) {
  const validationError = validateActPhotos(input.files);
  if (validationError) return { error: validationError };
  if (input.files.length === 0) return { error: null };

  const supabase = await createClient();
  const rows: Array<Omit<WorkCompletionActPhoto, "id" | "created_at">> = [];

  for (const [index, file] of input.files.entries()) {
    const storagePath = `acts/${input.ticketId}/${input.actId}/${Date.now()}-${index}-${crypto.randomUUID()}.${extensionFor(file)}`;
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) return { error: uploadError.message };
    rows.push({
      act_id: input.actId,
      ticket_id: input.ticketId,
      storage_path: storagePath,
      file_name: file.name,
      content_type: file.type,
      size_bytes: file.size,
      uploaded_by_profile_id: input.profileId,
    });
  }

  const { error } = await measureAsync("work-act:photos", () => supabase.from("work_completion_act_photos").insert(rows));
  return { error: error?.message ?? null };
}

export async function directorOwnsTicketObject(profileId: string, objectId: string): Promise<QueryResult<boolean>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("director_objects")
    .select("id")
    .eq("profile_id", profileId)
    .eq("object_id", objectId)
    .eq("approval_status", "approved")
    .maybeSingle();
  return { data: Boolean(data), error: error?.message ?? null };
}
