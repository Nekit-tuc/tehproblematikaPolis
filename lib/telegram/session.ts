import { createAdminClient } from "@/lib/supabase/admin";

export type TelegramStep = "idle" | "object" | "category" | "description" | "photos" | "confirm";

export type TelegramTicketPayload = {
  object_id?: string;
  category_id?: string;
  description?: string;
  photo_file_ids?: string[];
};

export type TelegramSessionRecord = {
  telegram_id: string;
  step: TelegramStep;
  payload: TelegramTicketPayload;
};

export async function getTelegramSession(telegramId: string): Promise<TelegramSessionRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("telegram_sessions")
    .select("telegram_id,step,payload")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (error) throw error;
  return data as TelegramSessionRecord | null;
}

export async function saveTelegramSession(session: TelegramSessionRecord) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("telegram_sessions").upsert(
    {
      telegram_id: session.telegram_id,
      step: session.step,
      payload: session.payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_id" },
  );
  if (error) throw error;
}

export async function clearTelegramSession(telegramId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("telegram_sessions").delete().eq("telegram_id", telegramId);
  if (error) throw error;
}
