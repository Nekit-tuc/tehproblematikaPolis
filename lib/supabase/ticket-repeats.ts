import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRepeatText } from "@/lib/tickets/repeat-detector";

export type TicketRepeat = {
  id: string;
  ticket_id: string;
  source_message_id: string | null;
  source_chat_id: string | null;
  raw_text: string;
  normalized_text: string | null;
  detected_by: string;
  confidence: number | null;
  created_by_name: string | null;
  created_at: string;
};

export type CreateTicketRepeatInput = {
  ticketId: string;
  sourceMessageId?: string | null;
  sourceChatId?: string | null;
  rawText: string;
  detectedBy?: string;
  confidence?: number | null;
  createdByName?: string | null;
};

export async function createTicketRepeat(input: CreateTicketRepeatInput) {
  const supabase = createAdminClient();

  if (input.sourceChatId && input.sourceMessageId) {
    const { data: existing, error: existingError } = await supabase
      .from("ticket_repeats")
      .select("id,ticket_id")
      .eq("source_chat_id", input.sourceChatId)
      .eq("source_message_id", input.sourceMessageId)
      .maybeSingle();

    if (existingError) return { data: null, error: existingError.message };
    if (existing) return { data: { repeat: existing, alreadyRecorded: true }, error: null };
  }

  const now = new Date().toISOString();
  const { data: repeat, error: insertError } = await supabase
    .from("ticket_repeats")
    .insert({
      ticket_id: input.ticketId,
      source_message_id: input.sourceMessageId ?? null,
      source_chat_id: input.sourceChatId ?? null,
      raw_text: input.rawText,
      normalized_text: normalizeRepeatText(input.rawText),
      detected_by: input.detectedBy ?? "rule",
      confidence: input.confidence ?? null,
      created_by_name: input.createdByName ?? null,
    })
    .select("id,ticket_id")
    .single();

  if (insertError) return { data: null, error: insertError.message };

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("repeat_count")
    .eq("id", input.ticketId)
    .single();

  if (ticketError) return { data: null, error: ticketError.message };

  const repeatCount = Number((ticket as { repeat_count?: number | null } | null)?.repeat_count ?? 0) + 1;
  const { error: updateError } = await supabase
    .from("tickets")
    .update({ repeat_count: repeatCount, last_repeat_at: now, updated_at: now })
    .eq("id", input.ticketId);

  if (updateError) return { data: null, error: updateError.message };

  return { data: { repeat, alreadyRecorded: false, repeatCount }, error: null };
}

export async function getTicketRepeats(ticketId: string, limit = 5) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_repeats")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return { data: (data ?? []) as TicketRepeat[], error: error?.message ?? null };
}
