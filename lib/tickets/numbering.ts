export const TICKET_NUMBER_RETRY_LIMIT = 3;

type TicketNumberError = { code?: string; message?: string } | null | undefined;

export function isDuplicateTicketNumberError(error: TicketNumberError) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "23505" || message.includes("tickets_number_key") || message.includes("duplicate key value");
}

function parseTicketNumber(number: string, prefix: string) {
  if (!number.startsWith(prefix)) return 0;
  const parsed = Number.parseInt(number.replace(prefix, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fallbackTicketNumber(supabase: any) {
  const year = new Date().getFullYear();
  const prefix = `PSD-${year}-`;
  const { data, error } = await supabase
    .from("tickets")
    .select("number")
    .like("number", `${prefix}%`)
    .order("number", { ascending: false })
    .limit(25);
  if (error) throw error;

  const current = (data ?? []).reduce((max: number, row: { number?: string | null }) => Math.max(max, parseTicketNumber(row.number ?? "", prefix)), 0);
  return `${prefix}${String(current + 1).padStart(4, "0")}`;
}

export async function generateTicketNumber(supabase: any) {
  try {
    const { data, error } = await supabase.rpc("next_ticket_number");
    if (!error && typeof data === "string" && data.trim()) return data.trim();
    if (error) console.warn("[ticket-number] next_ticket_number rpc failed; using fallback", { message: error.message });
  } catch (error) {
    console.warn("[ticket-number] next_ticket_number rpc unavailable; using fallback", { error });
  }

  return fallbackTicketNumber(supabase);
}
