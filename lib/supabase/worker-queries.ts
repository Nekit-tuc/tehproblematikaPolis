import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { measureAsync } from "@/lib/performance";
import type { Category, Ticket, TicketWithRelations, Worker, WorkerStats, WorkerWithCategories } from "@/types/domain";
import type { QueryResult } from "./queries";

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

function normalizeWorker(worker: WorkerWithCategories): WorkerWithCategories {
  return {
    ...worker,
    categories: (worker.worker_categories ?? [])
      .map((item) => Array.isArray(item.category) ? item.category[0] : item.category)
      .filter((category): category is Category => Boolean(category?.is_active)),
  };
}

const inactiveTicketStatuses = ["done", "completed", "cancelled", "rejected"];
const workerSelect = `
  id,
  name,
  phone,
  telegram_username,
  telegram_id,
  is_active,
  notes,
  created_at,
  updated_at,
  worker_categories(
    id,
    worker_id,
    category_id,
    created_at,
    category:categories(id, name, description, is_active, created_at)
  )
`;

export async function getWorkers(): Promise<QueryResult<WorkerWithCategories[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:list", () => supabase
    .from("workers")
    .select(workerSelect)
    .order("is_active", { ascending: false })
    .order("name"));

  return { data: ((data ?? []) as unknown as WorkerWithCategories[]).map(normalizeWorker), error: error?.message ?? null };
}

export async function getActiveWorkers(): Promise<QueryResult<WorkerWithCategories[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:active", () => supabase
    .from("workers")
    .select(workerSelect)
    .eq("is_active", true)
    .order("name"));

  return { data: ((data ?? []) as unknown as WorkerWithCategories[]).map(normalizeWorker), error: error?.message ?? null };
}

export async function getWorkerById(id: string): Promise<QueryResult<WorkerWithCategories | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await measureAsync("worker:detail", () => supabase
    .from("workers")
    .select(workerSelect)
    .eq("id", id)
    .maybeSingle());

  return { data: data ? normalizeWorker(data as unknown as WorkerWithCategories) : null, error: error?.message ?? null };
}

export async function getWorkersByCategory(categoryId: string): Promise<QueryResult<WorkerWithCategories[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:by_category", () => supabase
    .from("workers")
    .select(workerSelect)
    .eq("is_active", true)
    .eq("worker_categories.category_id", categoryId)
    .order("name"));
  return { data: ((data ?? []) as unknown as WorkerWithCategories[]).map(normalizeWorker), error: error?.message ?? null };
}

export async function findRecommendedWorkerForTicket(
  ticket: Pick<Ticket, "category_id">,
): Promise<QueryResult<WorkerWithCategories | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };

  const workersResult = await getActiveWorkers();
  if (workersResult.error) return { data: null, error: workersResult.error };

  const workers = workersResult.data.filter((worker) => Boolean(worker.telegram_id));
  if (workers.length === 0) return { data: null, error: null };

  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:workload", () => supabase
    .from("tickets")
    .select("assignee_worker_id,status")
    .not("assignee_worker_id", "is", null));

  if (error) return { data: null, error: error.message };

  const activeCounts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ assignee_worker_id: string | null; status: string }>) {
    if (inactiveTicketStatuses.includes(row.status)) continue;
    if (!row.assignee_worker_id) continue;
    activeCounts.set(row.assignee_worker_id, (activeCounts.get(row.assignee_worker_id) ?? 0) + 1);
  }

  const candidates = workers.filter((worker) => worker.categories?.some((category) => category.id === ticket.category_id));
  if (candidates.length === 0) {
    console.info("[worker-auto-assignment] no_worker_found", { categoryId: ticket.category_id });
    return { data: null, error: null };
  }
  const [recommendedWorker] = [...candidates].sort((left, right) => {
    const workloadDiff = (activeCounts.get(left.id) ?? 0) - (activeCounts.get(right.id) ?? 0);
    return workloadDiff || left.name.localeCompare(right.name, "uk");
  });

  if (recommendedWorker) {
    console.info("[worker-auto-assignment] assigned", {
      categoryId: ticket.category_id,
      workerId: recommendedWorker.id,
      activeTickets: activeCounts.get(recommendedWorker.id) ?? 0,
    });
  }

  return { data: recommendedWorker ?? null, error: null };
}

export async function getWorkerStats(): Promise<QueryResult<WorkerStats[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const workersResult = await getWorkers();
  if (workersResult.error) return { data: [], error: workersResult.error };

  const supabase = await createClient();
  const { data, error } = await measureAsync("workers:stats_rows", () => supabase
    .from("tickets")
    .select("assignee_worker_id,status,admin_rating")
    .not("assignee_worker_id", "is", null));
  if (error) return { data: [], error: error.message };

  const rows = (data ?? []) as Array<{ assignee_worker_id: string | null; status: string; admin_rating: number | null }>;
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.assignee_worker_id) continue;
    const scoped = grouped.get(row.assignee_worker_id) ?? [];
    scoped.push(row);
    grouped.set(row.assignee_worker_id, scoped);
  }
  const stats = workersResult.data.map((worker) => {
    const assigned = grouped.get(worker.id) ?? [];
    const ratings = assigned.map((row) => row.admin_rating).filter((rating): rating is number => typeof rating === "number");
    return {
      worker,
      total: assigned.length,
      active: assigned.filter((row) => !["done", "cancelled", "rejected"].includes(row.status)).length,
      done: assigned.filter((row) => row.status === "done").length,
      waitingConfirmation: assigned.filter((row) => row.status === "waiting_admin_confirmation").length,
      averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    };
  });

  return { data: stats, error: null };
}

const workerTicketSelect = `
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
  created_at,
  updated_at,
  object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
  category:categories(id, name, description, is_active, created_at),
  creator:profiles!tickets_created_by_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at),
  assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, object_id, default_object_id, telegram_id, telegram_username, phone, is_active, created_at)
`;

export async function getTicketsByWorkerId(workerId: string): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("worker:tickets", () => supabase
    .from("tickets")
    .select(workerTicketSelect)
    .eq("assignee_worker_id", workerId)
    .order("created_at", { ascending: false })
    .limit(100));

  return { data: (data ?? []) as unknown as TicketWithRelations[], error: error?.message ?? null };
}

