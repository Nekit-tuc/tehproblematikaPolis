import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { measureAsync } from "@/lib/performance";
import { ensureWeeklyDraftPlansForAutoRouting, getAutoWorkPlanRoutePreview } from "@/lib/supabase/work-plans";
import type {
  Category,
  CompanyObject,
  TicketPriority,
  TicketStatus,
  WorkerWithCategories,
} from "@/types/domain";
import type { QueryResult } from "./queries";

export type AiTicketListItem = {
  id: string;
  number: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  object_id: string;
  category_id: string;
  assignee_worker_id?: string | null;
  source?: string | null;
  telegram_source_group_id?: string | null;
  telegram_user_id?: string | null;
  telegram_user_name?: string | null;
  original_message_text?: string | null;
  ai_confidence?: number | null;
  recommended_department?: string | null;
  repeat_count?: number;
  last_repeat_at?: string | null;
  created_at: string;
  updated_at: string;
  object?: Pick<
    CompanyObject,
    | "id"
    | "name"
    | "object_number"
    | "city"
    | "district"
    | "address"
    | "is_active"
  > | null;
  category?: Pick<Category, "id" | "name" | "is_active"> | null;
};

export type AiTicketsFilters = {
  q?: string;
  object?: string;
  category?: string;
  priority?: string;
  confidence?: string;
  date?: string;
  page?: number;
  limit?: number;
};

export type AiTicketsPageData = {
  tickets: AiTicketListItem[];
  total: number;
};

type SupabaseListResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};

export type AiTicketsMeta = {
  objects: Array<
    Pick<
      CompanyObject,
      | "id"
      | "name"
      | "object_number"
      | "city"
      | "district"
      | "address"
      | "is_active"
    >
  >;
  categories: Array<
    Pick<Category, "id" | "name" | "description" | "is_active" | "created_at">
  >;
  workers: WorkerWithCategories[];
};

export type AiTicketConfirmReadiness = {
  ticketId: string;
  canConfirm: boolean;
  suggestedWorkerId: string | null;
  suggestedWorkerName: string | null;
  targetPlanTitle: string | null;
  routeStatus:
    | "ready"
    | "missing_category"
    | "category_not_mapped"
    | "worker_not_found"
    | "plan_not_ready"
    | "already_planned";
  warning: string | null;
};

const aiTicketListSelect = `
  id,
  number,
  title,
  description,
  status,
  priority,
  object_id,
  category_id,
  assignee_worker_id,
  source,
  telegram_source_group_id,
  telegram_user_id,
  telegram_user_name,
  original_message_text,
  ai_confidence,
  recommended_department,
  repeat_count,
  last_repeat_at,
  created_at,
  updated_at,
  object:objects(id, name, object_number, city, district, address, is_active),
  category:categories(id, name, is_active)
`;

const activeSources = ["telegram_group", "telegram_private_test"];

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

function sanitizeSearch(value: string) {
  return value.replace(/[%,]/g, " ").trim();
}

function applyAiTicketFilters(query: any, filters: AiTicketsFilters) {
  let next = query.eq("status", "pending_review").in("source", activeSources);

  if (filters.object && filters.object !== "all")
    next = next.eq("object_id", filters.object);
  if (filters.category && filters.category !== "all")
    next = next.eq("category_id", filters.category);
  if (filters.priority && filters.priority !== "all")
    next = next.eq("priority", filters.priority);
  if (filters.date)
    next = next
      .gte("created_at", `${filters.date}T00:00:00`)
      .lt("created_at", `${filters.date}T23:59:59.999`);

  if (filters.confidence === "high") next = next.gte("ai_confidence", 0.85);
  if (filters.confidence === "medium")
    next = next.gte("ai_confidence", 0.6).lt("ai_confidence", 0.85);
  if (filters.confidence === "low")
    next = next.or("ai_confidence.is.null,ai_confidence.lt.0.6");

  const search = filters.q ? sanitizeSearch(filters.q) : "";
  if (search) {
    const pattern = `%${search}%`;
    next = next.or(
      `title.ilike.${pattern},description.ilike.${pattern},original_message_text.ilike.${pattern}`,
    );
  }

  return next;
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function normalizeAiTicket(
  row: AiTicketListItem & {
    object?: AiTicketListItem["object"] | AiTicketListItem["object"][];
    category?: AiTicketListItem["category"] | AiTicketListItem["category"][];
  },
): AiTicketListItem {
  return {
    ...row,
    object: normalizeRelation(row.object),
    category: normalizeRelation(row.category),
  };
}

function normalizeWorker(worker: WorkerWithCategories): WorkerWithCategories {
  return {
    ...worker,
    categories: (worker.worker_categories ?? [])
      .map((item) => normalizeRelation(item.category))
      .filter((category): category is Category => Boolean(category?.is_active)),
  };
}

function normalizePlanningText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[\/\\–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findWorkerByRoute(workers: WorkerWithCategories[], workerName: string | null | undefined) {
  const expected = normalizePlanningText(workerName);
  if (!expected) return null;
  return workers.find((worker) => {
    const actual = normalizePlanningText(worker.name);
    return actual === expected || actual.includes(expected) || expected.includes(actual);
  }) ?? null;
}

export async function getAiTicketConfirmReadiness(
  tickets: AiTicketListItem[],
  workers: WorkerWithCategories[],
): Promise<QueryResult<Map<string, AiTicketConfirmReadiness>>> {
  const empty = new Map<string, AiTicketConfirmReadiness>();
  if (!hasSupabaseEnv()) return { data: empty, error: missingSupabaseMessage };
  if (tickets.length === 0) return { data: empty, error: null };

  return measureAsync("ai-tickets:confirm-readiness", async () => {
    const ticketIds = tickets.map((ticket) => ticket.id);
    const [plansResult, existingItemsResult] = await Promise.all([
      ensureWeeklyDraftPlansForAutoRouting(new Date(), { skipCarryOver: true }),
      (async () => {
        const supabase = await createClient();
        return measureAsync("ai-tickets:confirm-readiness:existing", () =>
          supabase
            .from("work_plan_items")
            .select("ticket_id, work_plan:work_plans!inner(id,title,status)")
            .in("ticket_id", ticketIds)
            .in("work_plan.status", ["draft", "sent", "partially_done"])
        );
      })(),
    ]);

    if (plansResult.error) return { data: empty, error: plansResult.error };
    if (existingItemsResult.error) return { data: empty, error: existingItemsResult.error.message };

    const plannedTicketIds = new Set((existingItemsResult.data ?? []).map((item) => item.ticket_id).filter(Boolean));
    const draftPlanTitles = new Set(plansResult.data.plans.filter((plan) => plan.status === "draft").map((plan) => plan.title));
    const readiness = new Map<string, AiTicketConfirmReadiness>();

    for (const ticket of tickets) {
      if (plannedTicketIds.has(ticket.id)) {
        readiness.set(ticket.id, {
          ticketId: ticket.id,
          canConfirm: true,
          suggestedWorkerId: ticket.assignee_worker_id ?? null,
          suggestedWorkerName: workers.find((worker) => worker.id === ticket.assignee_worker_id)?.name ?? null,
          targetPlanTitle: null,
          routeStatus: "already_planned",
          warning: "Заявка вже є в активному плані.",
        });
        continue;
      }

      if (!ticket.category_id || !ticket.category?.name) {
        readiness.set(ticket.id, {
          ticketId: ticket.id,
          canConfirm: false,
          suggestedWorkerId: null,
          suggestedWorkerName: null,
          targetPlanTitle: null,
          routeStatus: "missing_category",
          warning: "Перед підтвердженням потрібно вибрати категорію.",
        });
        continue;
      }

      const assignedWorker = ticket.assignee_worker_id ? workers.find((worker) => worker.id === ticket.assignee_worker_id) ?? null : null;
      const route = getAutoWorkPlanRoutePreview({
        categoryName: ticket.category.name,
        worker: assignedWorker ? { name: assignedWorker.name, telegram_username: assignedWorker.telegram_username ?? null } : null,
      });

      if (!route.found || !route.planTitle) {
        readiness.set(ticket.id, {
          ticketId: ticket.id,
          canConfirm: true,
          suggestedWorkerId: assignedWorker?.id ?? null,
          suggestedWorkerName: assignedWorker?.name ?? null,
          targetPlanTitle: null,
          routeStatus: "category_not_mapped",
          warning: "Для категорії не знайдено маршрут у план.",
        });
        continue;
      }

      const suggestedWorker = assignedWorker ?? findWorkerByRoute(workers, route.workerName);
      if (!suggestedWorker) {
        readiness.set(ticket.id, {
          ticketId: ticket.id,
          canConfirm: true,
          suggestedWorkerId: null,
          suggestedWorkerName: null,
          targetPlanTitle: route.planTitle,
          routeStatus: "worker_not_found",
          warning: "Маршрут знайдено, але виконавця не визначено.",
        });
        continue;
      }

      const planReady = draftPlanTitles.has(route.planTitle);
      readiness.set(ticket.id, {
        ticketId: ticket.id,
        canConfirm: true,
        suggestedWorkerId: suggestedWorker.id,
        suggestedWorkerName: suggestedWorker.name,
        targetPlanTitle: route.planTitle,
        routeStatus: planReady ? "ready" : "plan_not_ready",
        warning: planReady ? null : "Чернетку потрібного плану не знайдено.",
      });
    }

    return { data: readiness, error: null };
  });
}

export async function getAiTicketsPage(
  filters: AiTicketsFilters,
): Promise<QueryResult<AiTicketsPageData>> {
  if (!hasSupabaseEnv()) return emptyWithError({ tickets: [], total: 0 });
  const supabase = await createClient();
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 30);
  const page = Math.max(filters.page ?? 1, 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const [countResult, pageResult] = (await Promise.all([
    measureAsync("ai-tickets:count", () =>
      applyAiTicketFilters(
        supabase.from("tickets").select("id", { count: "exact", head: true }),
        filters,
      ),
    ),
    measureAsync("ai-tickets:page", () =>
      applyAiTicketFilters(
        supabase.from("tickets").select(aiTicketListSelect),
        filters,
      )
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
  ])) as [
    SupabaseListResult<{ id: string }>,
    SupabaseListResult<
      AiTicketListItem & {
        object?: AiTicketListItem["object"][];
        category?: AiTicketListItem["category"][];
      }
    >,
  ];

  const error = countResult.error ?? pageResult.error;
  return {
    data: {
      tickets: (
        (pageResult.data ?? []) as unknown as Array<
          AiTicketListItem & {
            object?: AiTicketListItem["object"][];
            category?: AiTicketListItem["category"][];
          }
        >
      ).map(normalizeAiTicket),
      total: countResult.count ?? 0,
    },
    error: error?.message ?? null,
  };
}

export const getAiTicketsMeta = cache(
  async function getAiTicketsMeta(): Promise<QueryResult<AiTicketsMeta>> {
    if (!hasSupabaseEnv())
      return emptyWithError({ objects: [], categories: [], workers: [] });
    const supabase = await createClient();

    const [objectsResult, categoriesResult, workersResult] = await Promise.all([
      measureAsync("ai-tickets:meta:objects", () =>
        supabase
          .from("objects")
          .select("id, name, object_number, city, district, address, is_active")
          .eq("is_active", true)
          .order("name")
          .limit(1000),
      ),
      measureAsync("ai-tickets:meta:categories", () =>
        supabase
          .from("categories")
          .select("id, name, description, is_active, created_at")
          .eq("is_active", true)
          .order("name"),
      ),
      measureAsync("ai-tickets:meta:workers", () =>
        supabase
          .from("workers")
          .select(
            `
          id,
          name,
          phone,
          telegram_username,
          telegram_id,
          is_active,
          notes,
          created_at,
          updated_at,
          worker_categories(id, worker_id, category_id, created_at, category:categories(id, name, description, is_active, created_at))
        `,
          )
          .eq("is_active", true)
          .order("name"),
      ),
    ]);

    const error =
      objectsResult.error ?? categoriesResult.error ?? workersResult.error;
    return {
      data: {
        objects: (objectsResult.data ?? []) as AiTicketsMeta["objects"],
        categories: (categoriesResult.data ??
          []) as AiTicketsMeta["categories"],
        workers: (
          (workersResult.data ?? []) as unknown as WorkerWithCategories[]
        ).map(normalizeWorker),
      },
      error: error?.message ?? null,
    };
  },
);
