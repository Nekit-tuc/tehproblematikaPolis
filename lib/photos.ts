import { createClient } from "@/lib/supabase/server";
import type { PhotoType, Profile, TicketWithRelations } from "@/types/domain";

export const MAX_PHOTOS_PER_UPLOAD = 5;
export const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_BUCKET = "ticket-photos";

export const photoTypeLabels: Record<PhotoType, string> = {
  before: "ДО",
  progress: "В процесі",
  after: "ПІСЛЯ",
};

export const photoHistoryLabels: Record<PhotoType, string> = {
  before: "Додано фото ДО",
  progress: "Додано фото В процесі",
  after: "Додано фото ПІСЛЯ",
};

export function getFiles(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export function validatePhotos(files: File[]) {
  if (files.length > MAX_PHOTOS_PER_UPLOAD) return `Можна завантажити максимум ${MAX_PHOTOS_PER_UPLOAD} фото за один раз.`;
  for (const file of files) {
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return `Файл ${file.name} має недозволений формат. Дозволено jpg, jpeg, png, webp.`;
    if (file.size > MAX_PHOTO_SIZE) return `Файл ${file.name} більший за 8 MB.`;
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

export async function uploadTicketPhotos({
  files,
  profile,
  ticket,
  type,
}: {
  files: File[];
  profile: Profile;
  ticket: Pick<TicketWithRelations, "id" | "number">;
  type: PhotoType;
}) {
  const validationError = validatePhotos(files);
  if (validationError) return { error: validationError };
  if (files.length === 0) return { error: null };

  const supabase = await createClient();
  const uploaded: string[] = [];

  for (const [index, file] of files.entries()) {
    const storagePath = `${ticket.id}/${type}/${Date.now()}-${index}-${crypto.randomUUID()}.${extensionFor(file)}`;
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) return { error: uploadError.message };

    uploaded.push(storagePath);
    const { error: insertError } = await supabase.from("ticket_photos").insert({
      ticket_id: ticket.id,
      uploaded_by: profile.id,
      type,
      storage_path: storagePath,
      caption: file.name,
    });
    if (insertError) return { error: insertError.message };
  }

  await supabase.from("ticket_history").insert({
    ticket_id: ticket.id,
    actor_id: profile.id,
    action: photoHistoryLabels[type],
    metadata: { type, count: uploaded.length, paths: uploaded },
  });

  return { error: null };
}
