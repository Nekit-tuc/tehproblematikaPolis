import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { getCurrentProfile } from "@/lib/auth/server";
import { canViewTicket } from "@/lib/auth/permissions";
import { measureAsync } from "@/lib/performance";
import type { Category, CompanyObject, Profile, TicketCommentWithAuthor, TicketHistory, TicketPhotoWithUrl, TicketWithRelations } from "@/types/domain";

export type QueryResult<T> = { data: T; error: string | null };

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

export async function getProfiles(): Promise<QueryResult<Profile[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("profiles:list", () =>
    supabase
      .from("profiles")
      .select("id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at")
      .order("full_name"),
  );
  return { data: (data ?? []) as Profile[], error: error?.message ?? null };
}

export async function getObjects(): Promise<QueryResult<CompanyObject[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase
    .from("objects")
    .select("id, name, type, object_number, city, district, address, aliases, manager_id, is_active, created_at")
    .order("name");
  if (profile.role === "store_manager" && profile.object_id) query = query.eq("id", profile.object_id);
  const { data, error } = await measureAsync("objects:list", () => query);
  return { data: (data ?? []) as CompanyObject[], error: error?.message ?? null };
}

export async function getCategories(): Promise<QueryResult<Category[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("categories:active", () =>
    supabase.from("categories").select("id, name, description, is_active, created_at").eq("is_active", true).order("name"),
  );
  return { data: (data ?? []) as Category[], error: error?.message ?? null };
}

export async function getAllCategories(): Promise<QueryResult<Category[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("categories:all", () =>
    supabase.from("categories").select("id, name, description, is_active, created_at").eq("is_active", true).order("name"),
  );
  return { data: (data ?? []) as Category[], error: error?.message ?? null };
}

const ticketSelect = `
  *,
  object:objects(*),
  category:categories(*),
  creator:profiles!tickets_created_by_fkey(*),
  assignee:profiles!tickets_assigned_to_fkey(*)
`;

const ticketListSelect = `
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
  due_at,
  completed_at,
  assigned_at,
  sent_to_worker_at,
  worker_completed_at,
  admin_confirmed_at,
  admin_rating,
  admin_feedback,
  source,
  telegram_source_group_id,
  ai_confidence,
  recommended_department,
  created_at,
  updated_at,
  object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
  category:categories(id, name, description, is_active, created_at),
  assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at),
  worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at)
`;

type TicketQueryOptions = {
  limit?: number | null;
  status?: string;
  source?: string | string[];
};

export type TicketListFilters = {
  status?: string;
  category?: string;
  priority?: string;
  q?: string;
  sort?: string;
  page?: number;
  limit?: number;
};

export type TicketPageResult = {
  tickets: TicketWithRelations[];
  total: number;
  page: number;
  limit: number;
};

export async function getTickets(options: TicketQueryOptions = {}): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase.from("tickets").select(ticketListSelect).order("created_at", { ascending: false });
  if (profile.role === "worker") query = query.eq("assigned_to", profile.id);
  if (profile.role === "store_manager") {
    query = profile.object_id ? query.eq("object_id", profile.object_id) : query.eq("created_by", profile.id);
  }
  if (options.status) query = query.eq("status", options.status);
  if (Array.isArray(options.source)) query = query.in("source", options.source);
  else if (options.source) query = query.eq("source", options.source);
  if (options.limit !== null) query = query.limit(options.limit ?? 50);
  const { data, error } = await measureAsync("tickets:list", () => query);
  return { data: (data ?? []) as unknown as TicketWithRelations[], error: error?.message ?? null };
}

export async function getRecentTickets(limit = 8): Promise<QueryResult<TicketWithRelations[]>> {
  return getTickets({ limit });
}


function applyTicketAccess(query: any, profile: Profile) {
  if (profile.role === "worker") return query.eq("assigned_to", profile.id);
  if (profile.role === "store_manager") return profile.object_id ? query.eq("object_id", profile.object_id) : query.eq("created_by", profile.id);
  return query;
}

function applyTicketFilters(query: any, filters: TicketListFilters) {
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.category && filters.category !== "all") query = query.eq("category_id", filters.category);
  if (filters.priority && filters.priority !== "all") query = query.eq("priority", filters.priority);
  const search = filters.q?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    query = query.or(`number.ilike.%${escaped}%,title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }
  return query;
}

export async function getTicketsPage(filters: TicketListFilters = {}): Promise<QueryResult<TicketPageResult>> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  if (!hasSupabaseEnv()) return emptyWithError({ tickets: [], total: 0, page, limit });
  const profile = await getCurrentProfile();
  if (!profile) return emptyWithError({ tickets: [], total: 0, page, limit });
  const supabase = await createClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from("tickets").select(ticketListSelect, { count: "exact" });
  query = applyTicketAccess(query, profile);
  query = applyTicketFilters(query, filters);
  if (filters.sort === "priority_asc" || filters.sort === "priority_desc") {
    query = query.order("priority", { ascending: filters.sort === "priority_asc" }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  query = query.range(from, to);

  const { data, count, error } = await measureAsync("tickets:page", () => query);
  return { data: { tickets: (data ?? []) as unknown as TicketWithRelations[], total: count ?? 0, page, limit }, error: error?.message ?? null };
}

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>;

async function countTickets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  label: string,
  build: (query: any) => CountQuery,
) {
  const base = supabase.from("tickets").select("id", { count: "exact", head: true });
  const query = build(base);
  const { count, error } = await measureAsync(label, () => query);
  return { count: count ?? 0, error: error?.message ?? null };
}

export async function getDashboardStats(): Promise<QueryResult<{
  active: number;
  newTickets: number;
  inProgress: number;
  pendingReview: number;
  critical: number;
  done: number;
  objects: number;
}>> {
  if (!hasSupabaseEnv()) {
    return emptyWithError({ active: 0, newTickets: 0, inProgress: 0, pendingReview: 0, critical: 0, done: 0, objects: 0 });
  }
  const supabase = await createClient();
  const [active, newTickets, inProgress, pendingReview, critical, done, objects] = await Promise.all([
    countTickets(supabase, "dashboard:count_active", (query) => query.not("status", "in", "(done,cancelled,rejected)")),
    countTickets(supabase, "dashboard:count_new", (query) => query.eq("status", "new")),
    measureAsync("dashboard:count_planned_in_progress", () =>
      supabase
        .from("work_plan_items")
        .select("ticket_id, ticket:tickets!inner(status), work_plan:work_plans!inner(status)")
        .in("work_plan.status", ["sent", "partially_done"])
        .not("ticket.status", "in", "(done,cancelled,rejected)"),
    ),
    countTickets(supabase, "dashboard:count_pending_review", (query) => query.eq("status", "pending_review")),
    countTickets(supabase, "dashboard:count_critical", (query) => query.eq("priority", "critical")),
    countTickets(supabase, "dashboard:count_done", (query) => query.eq("status", "done")),
    measureAsync("dashboard:count_objects", () => supabase.from("objects").select("id", { count: "exact", head: true }).eq("is_active", true)),
  ]);
  const error = active.error ?? newTickets.error ?? inProgress.error?.message ?? pendingReview.error ?? critical.error ?? done.error ?? objects.error?.message ?? null;
  return {
    data: {
      active: active.count,
      newTickets: newTickets.count,
      inProgress: new Set(((inProgress.data ?? []) as Array<{ ticket_id: string }>).map((row) => row.ticket_id)).size,
      pendingReview: pendingReview.count,
      critical: critical.count,
      done: done.count,
      objects: objects.count ?? 0,
    },
    error,
  };
}

export async function getTicket(id: string): Promise<QueryResult<TicketWithRelations | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: "Потрібно увійти в систему." };
  const supabase = await createClient();
  const { data, error } = await measureAsync("ticket:detail", () =>
    supabase.from("tickets").select(ticketSelect).eq("id", id).maybeSingle(),
  );
  const ticket = data as TicketWithRelations | null;
  if (ticket && !canViewTicket(profile, ticket)) return { data: null, error: "Недостатньо прав для перегляду цієї заявки." };
  return { data: ticket, error: error?.message ?? null };
}

export async function getRelatedTicketsBySourceGroup(sourceGroupId: string, currentTicketId: string): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("tickets:related", () => supabase
    .from("tickets")
    .select(ticketListSelect)
    .eq("telegram_source_group_id", sourceGroupId)
    .neq("id", currentTicketId)
    .order("created_at", { ascending: true })
    .limit(20));
  return { data: (data ?? []) as unknown as TicketWithRelations[], error: error?.message ?? null };
}

export async function getTicketComments(ticketId: string): Promise<QueryResult<TicketCommentWithAuthor[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("ticket:comments", () => supabase
    .from("ticket_comments")
    .select("id, ticket_id, author_id, body, created_at, author:profiles!ticket_comments_author_id_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true }));
  return { data: (data ?? []) as unknown as TicketCommentWithAuthor[], error: error?.message ?? null };
}

export async function getTicketHistory(ticketId: string): Promise<QueryResult<TicketHistory[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("ticket:history", () => supabase
    .from("ticket_history")
    .select("id, ticket_id, actor_id, action, metadata, created_at, actor:profiles!ticket_history_actor_id_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true }));
  return { data: (data ?? []) as unknown as TicketHistory[], error: error?.message ?? null };
}

export async function getTicketPhotos(ticketId: string): Promise<QueryResult<TicketPhotoWithUrl[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("ticket:photos", () => supabase
    .from("ticket_photos")
    .select("id, ticket_id, uploaded_by, type, storage_path, caption, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true }));
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
