import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { getCurrentProfile } from "@/lib/auth/server";
import { canViewTicket } from "@/lib/auth/permissions";
import type { Category, CompanyObject, Profile, TicketCommentWithAuthor, TicketHistory, TicketPhotoWithUrl, TicketWithRelations } from "@/types/domain";

export type QueryResult<T> = { data: T; error: string | null };

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

export async function getProfiles(): Promise<QueryResult<Profile[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").order("full_name");
  return { data: (data ?? []) as Profile[], error: error?.message ?? null };
}

export async function getObjects(): Promise<QueryResult<CompanyObject[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase.from("objects").select("*").order("name");
  if (profile.role === "store_manager" && profile.object_id) query = query.eq("id", profile.object_id);
  const { data, error } = await query;
  return { data: (data ?? []) as CompanyObject[], error: error?.message ?? null };
}

export async function getCategories(): Promise<QueryResult<Category[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("*").eq("is_active", true).order("name");
  return { data: (data ?? []) as Category[], error: error?.message ?? null };
}

export async function getAllCategories(): Promise<QueryResult<Category[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("*").eq("is_active", true).order("name");
  return { data: (data ?? []) as Category[], error: error?.message ?? null };
}

const ticketSelect = `
  *,
  object:objects(*),
  category:categories(*),
  creator:profiles!tickets_created_by_fkey(*),
  assignee:profiles!tickets_assigned_to_fkey(*)
`;

export async function getTickets(): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase.from("tickets").select(ticketSelect).order("created_at", { ascending: false });
  if (profile.role === "worker") query = query.eq("assigned_to", profile.id);
  if (profile.role === "store_manager") {
    query = profile.object_id ? query.eq("object_id", profile.object_id) : query.eq("created_by", profile.id);
  }
  const { data, error } = await query;
  return { data: (data ?? []) as TicketWithRelations[], error: error?.message ?? null };
}

export async function getTicket(id: string): Promise<QueryResult<TicketWithRelations | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: "Потрібно увійти в систему." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tickets").select(ticketSelect).eq("id", id).maybeSingle();
  const ticket = data as TicketWithRelations | null;
  if (ticket && !canViewTicket(profile, ticket)) return { data: null, error: "Недостатньо прав для перегляду цієї заявки." };
  return { data: ticket, error: error?.message ?? null };
}

export async function getRelatedTicketsBySourceGroup(sourceGroupId: string, currentTicketId: string): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select(ticketSelect)
    .eq("telegram_source_group_id", sourceGroupId)
    .neq("id", currentTicketId)
    .order("created_at", { ascending: true });
  return { data: (data ?? []) as TicketWithRelations[], error: error?.message ?? null };
}

export async function getTicketComments(ticketId: string): Promise<QueryResult<TicketCommentWithAuthor[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_comments")
    .select("*, author:profiles!ticket_comments_author_id_fkey(*)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  return { data: (data ?? []) as TicketCommentWithAuthor[], error: error?.message ?? null };
}

export async function getTicketHistory(ticketId: string): Promise<QueryResult<TicketHistory[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_history")
    .select("*, actor:profiles!ticket_history_actor_id_fkey(*)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  return { data: (data ?? []) as TicketHistory[], error: error?.message ?? null };
}

export async function getTicketPhotos(ticketId: string): Promise<QueryResult<TicketPhotoWithUrl[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_photos")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) return { data: [], error: error.message };

  const photos = (data ?? []) as TicketPhotoWithUrl[];
  const signed = await Promise.all(
    photos.map(async (photo) => {
      const { data: signedData } = await supabase.storage.from("ticket-photos").createSignedUrl(photo.storage_path, 60 * 10);
      return { ...photo, url: signedData?.signedUrl ?? null };
    }),
  );
  return { data: signed, error: null };
}
