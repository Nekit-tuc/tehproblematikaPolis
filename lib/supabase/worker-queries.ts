import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import type { Category, Worker, WorkerStats, WorkerWithCategories } from "@/types/domain";
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
