import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import type { Category, Ticket, TicketWithRelations, Worker, WorkerStats, WorkerWithCategories } from "@/types/domain";
import type { QueryResult } from "./queries";

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

function normalizeWorker(worker: WorkerWithCategories): WorkerWithCategories {
  return {
    ...worker,
    categories: (worker.worker_categories ?? []).map((item) => item.category).filter(Boolean) as Category[],
  };
}

const inactiveTicketStatuses = ["done", "completed", "cancelled", "rejected"];

export async function getWorkers(): Promise<QueryResult<WorkerWithCategories[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workers")
    .select("*, worker_categories(*, category:categories(*))")
    .order("is_active", { ascending: false })
    .order("name");

  return { data: ((data ?? []) as WorkerWithCategories[]).map(normalizeWorker), error: error?.message ?? null };
}

export async function getActiveWorkers(): Promise<QueryResult<WorkerWithCategories[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workers")
    .select("*, worker_categories(*, category:categories(*))")
    .eq("is_active", true)
    .order("name");

  return { data: ((data ?? []) as WorkerWithCategories[]).map(normalizeWorker), error: error?.message ?? null };
}

export async function getWorkerById(id: string): Promise<QueryResult<WorkerWithCategories | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workers")
    .select("*, worker_categories(*, category:categories(*))")
    .eq("id", id)
    .maybeSingle();

  return { data: data ? normalizeWorker(data as WorkerWithCategories) : null, error: error?.message ?? null };
}

export async function getWorkersByCategory(categoryId: string): Promise<QueryResult<WorkerWithCategories[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const workers = await getActiveWorkers();
  if (workers.error) return workers;
  return {
    data: workers.data.filter((worker) => worker.categories?.some((category) => category.id === categoryId)),
    error: null,
  };
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
  const { data, error } = await supabase
    .from("tickets")
    .select("assignee_worker_id,status")
    .not("assignee_worker_id", "is", null);

  if (error) return { data: null, error: error.message };

  const activeCounts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ assignee_worker_id: string | null; status: string }>) {
    if (inactiveTicketStatuses.includes(row.status)) continue;
    if (!row.assignee_worker_id) continue;
    activeCounts.set(row.assignee_worker_id, (activeCounts.get(row.assignee_worker_id) ?? 0) + 1);
  }

  const preferredWorkers = workers.filter((worker) => worker.categories?.some((category) => category.id === ticket.category_id));
  const candidates = preferredWorkers.length > 0 ? preferredWorkers : workers;
  const [recommendedWorker] = [...candidates].sort((left, right) => {
    const workloadDiff = (activeCounts.get(left.id) ?? 0) - (activeCounts.get(right.id) ?? 0);
    return workloadDiff || left.name.localeCompare(right.name, "uk");
  });

  return { data: recommendedWorker ?? null, error: null };
}

export async function getWorkerStats(): Promise<QueryResult<WorkerStats[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const workersResult = await getWorkers();
  if (workersResult.error) return { data: [], error: workersResult.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("assignee_worker_id,status,admin_rating")
    .not("assignee_worker_id", "is", null);
  if (error) return { data: [], error: error.message };

  const rows = (data ?? []) as Array<{ assignee_worker_id: string | null; status: string; admin_rating: number | null }>;
  const stats = workersResult.data.map((worker) => {
    const assigned = rows.filter((row) => row.assignee_worker_id === worker.id);
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
  *,
  object:objects(*),
  category:categories(*),
  creator:profiles!tickets_created_by_fkey(*),
  assignee:profiles!tickets_assigned_to_fkey(*)
`;

export async function getTicketsByWorkerId(workerId: string): Promise<QueryResult<TicketWithRelations[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select(workerTicketSelect)
    .eq("assignee_worker_id", workerId)
    .order("created_at", { ascending: false });

  return { data: (data ?? []) as TicketWithRelations[], error: error?.message ?? null };
}
