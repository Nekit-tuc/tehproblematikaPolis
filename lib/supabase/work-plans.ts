import { measureAsync } from "@/lib/performance";
import { getNextWorkWeekRange } from "@/lib/date/work-week";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { sendWorkPlanToWorker } from "@/lib/telegram/work-plan-notifications";
import type { TicketStatus, TicketWithRelations, Worker } from "@/types/domain";
import type { QueryResult } from "./queries";

export type WorkPlanStatus = "draft" | "sent" | "partially_done" | "done" | "cancelled";

export type WorkPlan = {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  status: WorkPlanStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  sent_at?: string | null;
  notes?: string | null;
  items_count?: number;
  done_items_count?: number;
  without_worker_count?: number;
  worker_name?: string | null;
};

export type WorkPlanningSummary = {
  totalActive: number;
  plannedActive: number;
  unplannedActive: number;
};

export type WorkPlanningWeekOverview = {
  startDate: string;
  endDate: string;
  label: "previous" | "current" | "next" | "future";
  plansCount: number;
  ticketsCount: number;
  draftCount: number;
  sentCount: number;
  doneCount: number;
  notDoneCount: number;
  withoutWorkerCount: number;
};

export type PlanningTicket = TicketWithRelations & {
  isPlanned: boolean;
  plannedPlanId: string | null;
  plannedPlanTitle: string | null;
  plannedPlanStatus: WorkPlanStatus | null;
  plannedPlanPeriodStart: string | null;
  plannedPlanPeriodEnd: string | null;
};

export type ActivePlannedTicket = {
  ticketId: string;
  ticketNumber: string | null;
  planId: string;
  planTitle: string;
  planStatus: WorkPlanStatus;
  planPeriodStart: string;
  planPeriodEnd: string;
};

export type WorkPlanItem = {
  id: string;
  work_plan_id: string;
  ticket_id: string;
  worker_id?: string | null;
  category?: string | null;
  sort_order: number;
  created_at: string;
  ticket?: TicketWithRelations | null;
  worker?: Worker | null;
};

export type WorkPlanDispatchStatus = "sent" | "failed" | "skipped_no_telegram";
export type SendWorkPlanMode = "initial" | "retry_failed" | "resend_all";

export type WorkPlanDispatch = {
  id: string;
  work_plan_id: string;
  worker_id?: string | null;
  telegram_chat_id?: string | null;
  sent_at: string;
  status: WorkPlanDispatchStatus;
  message_id?: string | null;
  error?: string | null;
  worker?: Worker | null;
};

export type PlanningFilters = {
  from?: string;
  to?: string;
  categoryId?: string;
  workerId?: string;
  status?: TicketStatus | "";
  objectId?: string;
  assignment?: "all" | "with_worker" | "without_worker";
  limit?: number;
};

export type CreateWorkPlanInput = {
  title: string;
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
  createdBy?: string | null;
};

export type UpdateWorkPlanInput = {
  title: string;
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
};

const planningStatuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting_admin_confirmation"];
const activeWorkPlanStatuses: WorkPlanStatus[] = ["draft", "sent", "partially_done"];
type AutoWorkPlanConfig = {
  title: string;
  categoryName: string;
  workerName: string;
  telegramUsername?: string | null;
  telegramId?: string | null;
  categoryMatchers: string[];
  workerMatchers: string[];
};

const autoWorkPlanConfigs: AutoWorkPlanConfig[] = [
  {
    title: "Максим — буд роботи",
    categoryName: "Будівельні роботи",
    workerName: "Максим",
    telegramUsername: "maks8700",
    telegramId: "6494218954",
    categoryMatchers: ["будівельні роботи"],
    workerMatchers: ["максим"],
  },
  {
    title: "Нікіта — студенти/організаційні питання",
    categoryName: "Студенти",
    workerName: "Нікіта",
    telegramUsername: "Ta_pac",
    telegramId: "5023071549",
    categoryMatchers: ["студенти", "організаційні", "організаційні питання"],
    workerMatchers: ["нікіта", "никита"],
  },
  {
    title: "Женя — важливі питання/електрика",
    categoryName: "Електрика",
    workerName: "Женя",
    telegramUsername: "Yevheniy_romaniuk",
    telegramId: "1005448960",
    categoryMatchers: ["електрика"],
    workerMatchers: ["женя", "євген", "евген"],
  },
  {
    title: "Віталік — загальні будроботи/сварка",
    categoryName: "Буд-роботи, зварювальні, ремонтні проф",
    workerName: "Віталіка бригада",
    categoryMatchers: ["буд-роботи", "зварювальні", "ремонтні проф", "сварка", "зварка"],
    workerMatchers: ["віталіка бригада", "віталік бригада", "бригада віталіка"],
  },
  {
    title: "Денис — сантехніка",
    categoryName: "Сантехніка",
    workerName: "Денис сантехнік",
    telegramUsername: "denis20260",
    telegramId: "5953788759",
    categoryMatchers: ["сантехніка", "сантех"],
    workerMatchers: ["денис сантехнік", "денис"],
  },
  {
    title: "Віталік — вікна/двері/фурнітура",
    categoryName: "Вікна / двері / фурнітура",
    workerName: "Віталік, фурнітура вікна/двері",
    telegramId: "1826329291",
    categoryMatchers: ["вікна", "двері", "фурнітура", "вікна двері фурнітура"],
    workerMatchers: ["віталік фурнітура вікна двері", "фурнітура вікна двері"],
  },
  {
    title: "Лена — каналізація",
    categoryName: "Каналізація",
    workerName: "Лена (менеджер Гени)",
    telegramId: "5356376176",
    categoryMatchers: ["каналізація", "канал"],
    workerMatchers: ["лена менеджер гени", "лена", "менеджер гени"],
  },
];

const planningTicketSelect = `
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
  worker_completed_at,
  assigned_at,
  source,
  repeat_count,
  last_repeat_at,
  created_at,
  updated_at,
  object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
  category:categories(id, name, description, is_active, created_at)
`;

const planItemSelect = `
  id,
  work_plan_id,
  ticket_id,
  worker_id,
  category,
  sort_order,
  created_at,
  worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at),
  ticket:tickets(
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
    worker_completed_at,
    assigned_at,
    source,
    repeat_count,
    last_repeat_at,
    created_at,
    updated_at,
    worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at),
    object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
    category:categories(id, name, description, is_active, created_at)
  )
`;

const dispatchSelect = `
  id,
  work_plan_id,
  worker_id,
  telegram_chat_id,
  sent_at,
  status,
  message_id,
  error,
  worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at)
`;

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

function normalizePlanningText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[\/\\–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function autoPlanNote(config: AutoWorkPlanConfig) {
  return `Автоматична чернетка. Виконавець: ${config.workerName}. Категорія: ${config.categoryName}.`;
}

function autoPlanConfigForCategory(categoryName: string | null | undefined) {
  const normalized = normalizePlanningText(categoryName);
  if (!normalized) return null;
  return autoWorkPlanConfigs.find((config) =>
    config.categoryMatchers.some((matcher) => {
      const normalizedMatcher = normalizePlanningText(matcher);
      return normalized.includes(normalizedMatcher) || normalizedMatcher.includes(normalized);
    }),
  ) ?? null;
}

function autoPlanConfigForTitle(title: string | null | undefined) {
  const normalizedTitle = normalizePlanningText(title);
  if (!normalizedTitle) return null;
  return autoWorkPlanConfigs.find((config) => normalizePlanningText(config.title) === normalizedTitle) ?? null;
}

function workerMatches(worker: Pick<Worker, "name" | "telegram_username">, config: AutoWorkPlanConfig) {
  const workerName = normalizePlanningText(worker.name);
  const telegramUsername = normalizePlanningText(worker.telegram_username?.replace(/^@/, ""));
  const expectedUsername = normalizePlanningText(config.telegramUsername?.replace(/^@/, ""));
  if (expectedUsername && telegramUsername === expectedUsername) return true;
  const expectedName = normalizePlanningText(config.workerName);
  if (workerName === expectedName || workerName.includes(expectedName) || expectedName.includes(workerName)) return true;
  return config.workerMatchers.some((matcher) => {
    const normalizedMatcher = normalizePlanningText(matcher);
    return workerName === normalizedMatcher || workerName.includes(normalizedMatcher) || normalizedMatcher.includes(workerName) || telegramUsername === normalizedMatcher;
  });
}

async function findAutoPlanWorkerId(supabase: ReturnType<typeof createAdminClient>, config: AutoWorkPlanConfig | null) {
  if (!config) return null;
  if (config.telegramId) {
    const byTelegramId = await measureAsync("work-planning:auto_worker_by_telegram_id", () =>
      supabase.from("workers").select("id, name, telegram_username, telegram_id").eq("is_active", true).eq("telegram_id", config.telegramId).maybeSingle(),
    );
    if (byTelegramId.error) {
      console.warn("[work-planning:auto] worker telegram_id lookup failed", { error: byTelegramId.error.message, planTitle: config.title, workerName: config.workerName });
    } else if (byTelegramId.data) {
      return (byTelegramId.data as Pick<Worker, "id">).id;
    }
  }

  if (config.telegramUsername) {
    const username = config.telegramUsername.replace(/^@/, "").toLowerCase();
    const byUsername = await measureAsync("work-planning:auto_worker_by_username", () =>
      supabase.from("workers").select("id, name, telegram_username, telegram_id").eq("is_active", true).ilike("telegram_username", username).maybeSingle(),
    );
    if (byUsername.error) {
      console.warn("[work-planning:auto] worker username lookup failed", { error: byUsername.error.message, planTitle: config.title, workerName: config.workerName });
    } else if (byUsername.data) {
      return (byUsername.data as Pick<Worker, "id">).id;
    }
  }

  const { data, error } = await measureAsync("work-planning:auto_worker_lookup", () =>
    supabase.from("workers").select("id, name, telegram_username, telegram_id").eq("is_active", true).limit(200),
  );
  if (error) {
    console.warn("[work-planning:auto] worker lookup failed", { error: error.message, planTitle: config.title });
    return null;
  }
  const worker = ((data ?? []) as Array<Pick<Worker, "id" | "name" | "telegram_username">>).find((row) => workerMatches(row, config));
  if (!worker) {
    console.warn("[work-planning:auto] worker not found", {
      planTitle: config.title,
      workerName: config.workerName,
      telegramUsername: config.telegramUsername ?? null,
      telegramId: config.telegramId ?? null,
    });
  }
  return worker?.id ?? null;
}

type ActivePlanItemRow = {
  ticket_id: string;
  ticket?: { number?: string | null } | { number?: string | null }[] | null;
  work_plan?: {
    id: string;
    title: string;
    status: WorkPlanStatus;
    period_start: string;
    period_end: string;
  } | {
    id: string;
    title: string;
    status: WorkPlanStatus;
    period_start: string;
    period_end: string;
  }[] | null;
};

function planFromRow(row: ActivePlanItemRow) {
  const plan = Array.isArray(row.work_plan) ? row.work_plan[0] : row.work_plan;
  return plan ?? null;
}

function ticketFromRow(row: ActivePlanItemRow) {
  const ticket = Array.isArray(row.ticket) ? row.ticket[0] : row.ticket;
  return ticket ?? null;
}

async function getActivePlannedItemRows(ticketIds: string[]) {
  if (ticketIds.length === 0) return { data: [] as ActivePlanItemRow[], error: null };
  const supabase = await createClient();
  const { data, error } = await measureAsync("work-planning:active_planned_items", () =>
    supabase
      .from("work_plan_items")
      .select(`
        ticket_id,
        ticket:tickets(number),
        work_plan:work_plans!inner(id, title, status, period_start, period_end)
      `)
      .in("ticket_id", ticketIds)
      .in("work_plan.status", activeWorkPlanStatuses),
  );
  return { data: (data ?? []) as unknown as ActivePlanItemRow[], error: error?.message ?? null };
}

function plannedInfoMap(rows: ActivePlanItemRow[]) {
  const map = new Map<string, ActivePlannedTicket>();
  for (const row of rows) {
    const plan = planFromRow(row);
    if (!plan || map.has(row.ticket_id)) continue;
    map.set(row.ticket_id, {
      ticketId: row.ticket_id,
      ticketNumber: ticketFromRow(row)?.number ?? null,
      planId: plan.id,
      planTitle: plan.title,
      planStatus: plan.status,
      planPeriodStart: plan.period_start,
      planPeriodEnd: plan.period_end,
    });
  }
  return map;
}

export async function getActivePlannedTickets(ticketIds: string[]): Promise<QueryResult<ActivePlannedTicket[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const uniqueTicketIds = Array.from(new Set(ticketIds.filter(Boolean)));
  const rowsResult = await getActivePlannedItemRows(uniqueTicketIds);
  if (rowsResult.error) return { data: [], error: rowsResult.error };
  return { data: Array.from(plannedInfoMap(rowsResult.data).values()), error: null };
}

export async function getPlanningTickets(filters: PlanningFilters = {}): Promise<QueryResult<PlanningTicket[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase
    .from("tickets")
    .select(planningTicketSelect)
    .in("status", planningStatuses)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59`);
  if (filters.categoryId && filters.categoryId !== "all") query = query.eq("category_id", filters.categoryId);
  if (filters.workerId && filters.workerId !== "all") query = query.eq("assignee_worker_id", filters.workerId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.objectId && filters.objectId !== "all") query = query.eq("object_id", filters.objectId);
  if (filters.assignment === "with_worker") query = query.not("assignee_worker_id", "is", null);
  if (filters.assignment === "without_worker") query = query.is("assignee_worker_id", null);

  const { data, error } = await measureAsync("work-planning:tickets", () => query);
  if (error) return { data: [], error: error.message };

  const tickets = (data ?? []) as unknown as TicketWithRelations[];
  const plannedRowsResult = await getActivePlannedItemRows(tickets.map((ticket) => ticket.id));
  const plannedMap = plannedInfoMap(plannedRowsResult.data);
  const ticketsWithPlanning = tickets.map((ticket) => {
    const planned = plannedMap.get(ticket.id);
    return {
      ...ticket,
      isPlanned: Boolean(planned),
      plannedPlanId: planned?.planId ?? null,
      plannedPlanTitle: planned?.planTitle ?? null,
      plannedPlanStatus: planned?.planStatus ?? null,
      plannedPlanPeriodStart: planned?.planPeriodStart ?? null,
      plannedPlanPeriodEnd: planned?.planPeriodEnd ?? null,
    };
  });
  return { data: ticketsWithPlanning, error: plannedRowsResult.error };
}

export async function getTicketsGroupedByCategory(filters: PlanningFilters = {}) {
  const ticketsResult = await getPlanningTickets(filters);
  const groups = new Map<string, { categoryName: string; tickets: PlanningTicket[] }>();
  for (const ticket of ticketsResult.data) {
    const categoryId = ticket.category_id || "uncategorized";
    const categoryName = ticket.category?.name ?? "Без категорії";
    const group = groups.get(categoryId) ?? { categoryName, tickets: [] };
    group.tickets.push(ticket);
    groups.set(categoryId, group);
  }
  return { data: Array.from(groups.entries()).map(([categoryId, group]) => ({ categoryId, ...group })), error: ticketsResult.error };
}

export async function createWorkPlan(input: CreateWorkPlanInput): Promise<QueryResult<WorkPlan | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await measureAsync("work-planning:create_plan", () =>
    supabase
      .from("work_plans")
      .insert({
        title: input.title,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        notes: input.notes || null,
        created_by: input.createdBy || null,
      })
      .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes")
      .single(),
  );
  return { data: data as WorkPlan | null, error: error?.message ?? null };
}

export async function ensureWeeklyDraftPlansForAutoRouting(date = new Date()): Promise<QueryResult<{ periodStart: string; periodEnd: string; plans: WorkPlan[]; created: number }>> {
  if (!hasSupabaseEnv()) return emptyWithError({ periodStart: "", periodEnd: "", plans: [], created: 0 });
  const supabase = createAdminClient();
  const range = getNextWorkWeekRange(date);
  const titles = autoWorkPlanConfigs.map((config) => config.title);

  const { data: existingData, error: existingError } = await measureAsync("work-planning:auto_existing_plans", () =>
    supabase
      .from("work_plans")
      .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes")
      .eq("period_start", range.startDate)
      .eq("period_end", range.endDate)
      .in("title", titles)
      .in("status", activeWorkPlanStatuses),
  );
  if (existingError) return { data: { periodStart: range.startDate, periodEnd: range.endDate, plans: [], created: 0 }, error: existingError.message };

  const existing = (existingData ?? []) as WorkPlan[];
  const existingTitles = new Set(existing.map((plan) => plan.title));
  const missing = autoWorkPlanConfigs.filter((config) => !existingTitles.has(config.title));
  let createdPlans: WorkPlan[] = [];

  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await measureAsync("work-planning:auto_create_plans", () =>
      supabase
        .from("work_plans")
        .insert(missing.map((config) => ({
          title: config.title,
          period_start: range.startDate,
          period_end: range.endDate,
          status: "draft",
          notes: autoPlanNote(config),
        })))
        .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes"),
    );
    if (insertError) return { data: { periodStart: range.startDate, periodEnd: range.endDate, plans: existing, created: 0 }, error: insertError.message };
    createdPlans = (inserted ?? []) as WorkPlan[];
  }

  await Promise.all(existing.map(async (plan) => {
    const config = autoPlanConfigForTitle(plan.title);
    if (!config) return;
    const expectedNote = autoPlanNote(config);
    if (plan.notes && plan.notes !== "Автоматична чернетка. Створено системою для розподілу заявок із Telegram-бота.") return;
    const { error } = await measureAsync("work-planning:auto_update_plan_note", () =>
      supabase.from("work_plans").update({ notes: expectedNote }).eq("id", plan.id),
    );
    if (error) console.warn("[work-planning:auto] plan note update failed", { planId: plan.id, title: plan.title, error: error.message });
    else plan.notes = expectedNote;
  }));

  return {
    data: {
      periodStart: range.startDate,
      periodEnd: range.endDate,
      plans: [...existing, ...createdPlans],
      created: createdPlans.length,
    },
    error: null,
  };
}

export async function getDraftWorkPlansForMove(excludePlanId?: string): Promise<QueryResult<WorkPlan[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase
    .from("work_plans")
    .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes")
    .eq("status", "draft")
    .order("period_start", { ascending: true })
    .order("title", { ascending: true })
    .limit(100);
  if (excludePlanId) query = query.neq("id", excludePlanId);
  const { data, error } = await measureAsync("work-planning:draft_plans_for_move", () => query);
  return { data: (data ?? []) as WorkPlan[], error: error?.message ?? null };
}

export async function autoAddTelegramTicketToWeeklyDraftPlan(input: {
  ticketId: string;
  categoryName?: string | null;
}) {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = createAdminClient();

  const { data: ticketData, error: ticketError } = await measureAsync("work-planning:auto_ticket_lookup", () =>
    supabase
      .from("tickets")
      .select("id, source, category_id, assignee_worker_id, category:categories(name)")
      .eq("id", input.ticketId)
      .maybeSingle(),
  );
  if (ticketError) return { data: null, error: ticketError.message };
  const ticket = ticketData as { id: string; source?: string | null; category_id?: string | null; assignee_worker_id?: string | null; category?: { name?: string | null } | { name?: string | null }[] | null } | null;
  if (!ticket) return { data: null, error: "Ticket not found" };
  if (ticket.source !== "telegram_group" && ticket.source !== "telegram_private_test") return { data: { added: false, reason: "not_telegram_ticket" }, error: null };

  const category = Array.isArray(ticket.category) ? ticket.category[0] : ticket.category;
  const categoryName = input.categoryName ?? category?.name ?? null;
  const config = autoPlanConfigForCategory(categoryName);
  if (!config) return { data: { added: false, reason: "category_not_mapped" }, error: null };

  const existingItemResult = await measureAsync("work-planning:auto_existing_item", () =>
    supabase
      .from("work_plan_items")
      .select("id, work_plan:work_plans!inner(id,status,title)")
      .eq("ticket_id", input.ticketId)
      .in("work_plan.status", activeWorkPlanStatuses)
      .limit(1)
      .maybeSingle(),
  );
  if (existingItemResult.error) return { data: null, error: existingItemResult.error.message };
  if (existingItemResult.data) return { data: { added: false, reason: "ticket_already_planned" }, error: null };

  const plansResult = await ensureWeeklyDraftPlansForAutoRouting();
  if (plansResult.error) return { data: null, error: plansResult.error };
  const plan = plansResult.data.plans.find((item) => item.title === config.title && item.status === "draft");
  if (!plan) return { data: { added: false, reason: "plan_not_found" }, error: null };

  const workerId = ticket.assignee_worker_id ?? await findAutoPlanWorkerId(supabase, config);
  const countResult = await measureAsync("work-planning:auto_plan_item_count", () =>
    supabase.from("work_plan_items").select("id", { count: "exact", head: true }).eq("work_plan_id", plan.id),
  );
  const sortOrder = countResult.count ?? 0;

  const { data: inserted, error: insertError } = await measureAsync("work-planning:auto_add_item", () =>
    supabase
      .from("work_plan_items")
      .insert({
        work_plan_id: plan.id,
        ticket_id: input.ticketId,
        worker_id: workerId,
        category: categoryName,
        sort_order: sortOrder,
      })
      .select("id")
      .single(),
  );
  if (insertError) {
    if (insertError.code === "23505") return { data: { added: false, reason: "ticket_already_in_target_plan" }, error: null };
    return { data: null, error: insertError.message };
  }

  await supabase.from("ticket_history").insert({
    ticket_id: input.ticketId,
    actor_id: null,
    action: `Заявку автоматично додано до плану: ${plan.title}`,
    metadata: {
      work_plan_id: plan.id,
      work_plan_title: plan.title,
      category: categoryName,
      worker_id: workerId,
      source: "telegram_auto_planning",
    },
  });

  return { data: { added: true, planId: plan.id, planTitle: plan.title, workerId, itemId: (inserted as { id?: string } | null)?.id ?? null }, error: null };
}

export async function addTicketsToWorkPlan(workPlanId: string, ticketIds: string[]) {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const uniqueTicketIds = Array.from(new Set(ticketIds.filter(Boolean)));
  if (uniqueTicketIds.length === 0) return { data: null, error: "Оберіть хоча б одну заявку для плану." };

  const supabase = await createClient();
  const { data: tickets, error: ticketError } = await measureAsync("work-planning:selected_tickets", () =>
    supabase
      .from("tickets")
      .select("id, assignee_worker_id, category:categories(name)")
      .in("id", uniqueTicketIds),
  );
  if (ticketError) return { data: null, error: ticketError.message };

  const rows = ((tickets ?? []) as Array<{ id: string; assignee_worker_id?: string | null; category?: { name?: string | null } | { name?: string | null }[] | null }>).map((ticket, index) => {
    const category = Array.isArray(ticket.category) ? ticket.category[0] : ticket.category;
    return {
      work_plan_id: workPlanId,
      ticket_id: ticket.id,
      worker_id: ticket.assignee_worker_id ?? null,
      category: category?.name ?? null,
      sort_order: index,
    };
  });

  if (rows.length === 0) return { data: null, error: "Вибрані заявки не знайдено." };
  const { data, error } = await measureAsync("work-planning:add_items", () =>
    supabase.from("work_plan_items").insert(rows).select("id"),
  );
  return { data, error: error?.message ?? null };
}

export async function removeTicketFromWorkPlan(workPlanId: string, ticketId: string) {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plan_items")
    .delete()
    .eq("work_plan_id", workPlanId)
    .eq("ticket_id", ticketId)
    .select("id");
  return { data, error: error?.message ?? null };
}

export async function getWorkPlans(filters: { from?: string; to?: string; limit?: number } = {}): Promise<QueryResult<WorkPlan[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase
    .from("work_plans")
    .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes, work_plan_items(id, ticket_id, worker_id, worker:workers(id, name), ticket:tickets(id, status, assignee_worker_id))")
    .order("period_start", { ascending: true })
    .order("title", { ascending: true })
    .limit(filters.limit ?? 50);

  if (filters.from) query = query.gte("period_start", filters.from);
  if (filters.to) query = query.lt("period_start", filters.to);

  const { data, error } = await measureAsync("work-planning:plans", () => query);

  const plans = ((data ?? []) as unknown as WeekOverviewPlanRow[]).map((plan) => {
    const items = plan.work_plan_items ?? [];
    const workerCounts = new Map<string, { name: string; count: number }>();
    for (const item of items) {
      const worker = rowWorker(item);
      if (!worker?.id || !worker.name) continue;
      const current = workerCounts.get(worker.id) ?? { name: worker.name, count: 0 };
      current.count += 1;
      workerCounts.set(worker.id, current);
    }
    const primaryWorker = [...workerCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
    return {
      ...plan,
      items_count: items.length,
      done_items_count: items.filter((item) => rowTicket(item)?.status === "done").length,
      without_worker_count: items.filter((item) => {
        const ticket = rowTicket(item);
        return !item.worker_id && !ticket?.assignee_worker_id;
      }).length,
      worker_name: primaryWorker?.name ?? null,
    };
  });
  return { data: plans, error: error?.message ?? null };
}

function emptyWeekOverview(week: Pick<WorkPlanningWeekOverview, "startDate" | "endDate" | "label">): WorkPlanningWeekOverview {
  return {
    startDate: week.startDate,
    endDate: week.endDate,
    label: week.label,
    plansCount: 0,
    ticketsCount: 0,
    draftCount: 0,
    sentCount: 0,
    doneCount: 0,
    notDoneCount: 0,
    withoutWorkerCount: 0,
  };
}

type WeekOverviewPlanRow = WorkPlan & {
  work_plan_items?: Array<{
    id: string;
    ticket_id?: string | null;
    worker_id?: string | null;
    worker?: { id: string; name: string } | { id: string; name: string }[] | null;
    ticket?: { id: string; status: TicketStatus; assignee_worker_id?: string | null } | { id: string; status: TicketStatus; assignee_worker_id?: string | null }[] | null;
  }> | null;
};

type WeekOverviewBasePlanRow = Pick<WorkPlan, "id" | "period_start" | "status">;

type WeekOverviewItemRow = {
  id: string;
  work_plan_id: string;
  ticket_id?: string | null;
  worker_id?: string | null;
  ticket?: { id: string; status: TicketStatus; assignee_worker_id?: string | null } | { id: string; status: TicketStatus; assignee_worker_id?: string | null }[] | null;
};

function rowTicket(item: NonNullable<WeekOverviewPlanRow["work_plan_items"]>[number]) {
  return Array.isArray(item.ticket) ? item.ticket[0] : item.ticket;
}

function rowWorker(item: NonNullable<WeekOverviewPlanRow["work_plan_items"]>[number]) {
  return Array.isArray(item.worker) ? item.worker[0] : item.worker;
}

function overviewRowTicket(item: WeekOverviewItemRow) {
  return Array.isArray(item.ticket) ? item.ticket[0] : item.ticket;
}

export async function getWorkPlanningWeeksOverview(weeks: Array<Pick<WorkPlanningWeekOverview, "startDate" | "endDate" | "label">>): Promise<QueryResult<WorkPlanningWeekOverview[]>> {
  const overview = weeks.map(emptyWeekOverview);
  if (!hasSupabaseEnv()) return { data: overview, error: missingSupabaseMessage };
  if (weeks.length === 0) return { data: [], error: null };

  const supabase = await createClient();
  const firstStart = weeks[0].startDate;
  const lastEnd = weeks[weeks.length - 1].endDate;
  const ticketIdsByWeek = new Map<string, Set<string>>();

  const { data: plansData, error: plansError } = await measureAsync("work-planning:weeks_overview:plans", () =>
    supabase
      .from("work_plans")
      .select("id, period_start, status")
      .gte("period_start", firstStart)
      .lt("period_start", lastEnd)
      .limit(500),
  );

  if (plansError) return { data: overview, error: plansError.message };

  const plans = (plansData ?? []) as unknown as WeekOverviewBasePlanRow[];
  const planIds = plans.map((plan) => plan.id);
  const weekStartByPlanId = new Map<string, string>();

  for (const plan of plans) {
    const week = overview.find((item) => plan.period_start >= item.startDate && plan.period_start < item.endDate);
    if (!week) continue;
    weekStartByPlanId.set(plan.id, week.startDate);
    week.plansCount += 1;
    if (plan.status === "draft") week.draftCount += 1;
    if (plan.status === "sent" || plan.status === "partially_done") week.sentCount += 1;
  }

  if (planIds.length === 0) return { data: overview, error: null };

  const { data: itemsData, error: itemsError } = await measureAsync("work-planning:weeks_overview:items", () =>
    supabase
      .from("work_plan_items")
      .select("id, work_plan_id, ticket_id, worker_id, ticket:tickets(id, status, assignee_worker_id)")
      .in("work_plan_id", planIds)
      .limit(5000),
  );

  if (itemsError) return { data: overview, error: itemsError.message };

  for (const item of (itemsData ?? []) as unknown as WeekOverviewItemRow[]) {
    const weekStart = weekStartByPlanId.get(item.work_plan_id);
    if (!weekStart) continue;
    const week = overview.find((entry) => entry.startDate === weekStart);
    if (!week) continue;
    const ticketIds = ticketIdsByWeek.get(week.startDate) ?? new Set<string>();
    ticketIdsByWeek.set(week.startDate, ticketIds);
    const ticket = overviewRowTicket(item);
    const ticketId = ticket?.id ?? item.ticket_id;
    if (ticketId) ticketIds.add(ticketId);
    if (ticket?.status === "done") week.doneCount += 1;
    if (ticket?.status && !["done", "rejected", "cancelled"].includes(ticket.status)) week.notDoneCount += 1;
    if (!item.worker_id && !ticket?.assignee_worker_id) week.withoutWorkerCount += 1;
  }

  for (const week of overview) {
    week.ticketsCount = ticketIdsByWeek.get(week.startDate)?.size ?? 0;
  }

  return { data: overview, error: null };
}

export async function getWorkPlanById(id: string): Promise<QueryResult<WorkPlan | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plans")
    .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes")
    .eq("id", id)
    .maybeSingle();
  return { data: data as WorkPlan | null, error: error?.message ?? null };
}

export async function updateWorkPlan(id: string, input: UpdateWorkPlanInput): Promise<QueryResult<WorkPlan | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plans")
    .update({
      title: input.title,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      notes: input.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes")
    .maybeSingle();
  return { data: data as WorkPlan | null, error: error?.message ?? null };
}

export async function getWorkPlanItems(id: string): Promise<QueryResult<WorkPlanItem[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plan_items")
    .select(planItemSelect)
    .eq("work_plan_id", id)
    .order("sort_order", { ascending: true });
  return { data: (data ?? []) as unknown as WorkPlanItem[], error: error?.message ?? null };
}

export async function getWorkPlanItemsForPlans(planIds: string[]): Promise<QueryResult<WorkPlanItem[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const uniquePlanIds = Array.from(new Set(planIds.filter(Boolean)));
  if (uniquePlanIds.length === 0) return { data: [], error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plan_items")
    .select(planItemSelect)
    .in("work_plan_id", uniquePlanIds)
    .order("work_plan_id", { ascending: true })
    .order("sort_order", { ascending: true });

  return { data: (data ?? []) as unknown as WorkPlanItem[], error: error?.message ?? null };
}

export async function removeWorkPlanItem(workPlanId: string, ticketId: string) {
  const planResult = await getWorkPlanById(workPlanId);
  if (planResult.error) return { data: null, error: planResult.error };
  if (!planResult.data) return { data: null, error: "План не знайдено." };
  if (planResult.data.status !== "draft") return { data: null, error: "Змінювати склад можна тільки у чернетці плану." };
  return removeTicketFromWorkPlan(workPlanId, ticketId);
}

export async function moveWorkPlanItemToDraftPlan(input: {
  itemId: string;
  currentPlanId: string;
  targetPlanId: string;
  actorId: string;
}): Promise<QueryResult<{ targetPlanId: string } | null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  if (!input.itemId || !input.currentPlanId || !input.targetPlanId) return { data: null, error: "Заявку або план не знайдено." };
  if (input.currentPlanId === input.targetPlanId) return { data: null, error: "Оберіть інший план для перенесення." };

  const supabase = await createClient();
  const [itemResult, targetPlanResult] = await Promise.all([
    measureAsync("work-planning:move_item_load", () =>
      supabase
        .from("work_plan_items")
        .select("id, work_plan_id, ticket_id, worker_id, category, sort_order")
        .eq("id", input.itemId)
        .eq("work_plan_id", input.currentPlanId)
        .maybeSingle(),
    ),
    measureAsync("work-planning:move_target_plan", () =>
      supabase
        .from("work_plans")
        .select("id, title, period_start, period_end, status, created_by, created_at, updated_at, sent_at, notes")
        .eq("id", input.targetPlanId)
        .maybeSingle(),
    ),
  ]);

  if (itemResult.error) return { data: null, error: itemResult.error.message };
  if (targetPlanResult.error) return { data: null, error: targetPlanResult.error.message };
  const item = itemResult.data as { id: string; work_plan_id: string; ticket_id: string; worker_id?: string | null; category?: string | null; sort_order?: number | null } | null;
  const targetPlan = targetPlanResult.data as WorkPlan | null;
  if (!item) return { data: null, error: "Заявку в поточному плані не знайдено." };
  if (!targetPlan) return { data: null, error: "Цільовий план не знайдено." };
  if (targetPlan.status !== "draft") return { data: null, error: "Перенести заявку можна тільки в план-чернетку." };

  const duplicateResult = await measureAsync("work-planning:move_duplicate_check", () =>
    supabase
      .from("work_plan_items")
      .select("id")
      .eq("work_plan_id", input.targetPlanId)
      .eq("ticket_id", item.ticket_id)
      .limit(1)
      .maybeSingle(),
  );
  if (duplicateResult.error) return { data: null, error: duplicateResult.error.message };
  if (duplicateResult.data) return { data: null, error: "Ця заявка вже є у вибраному плані." };

  let workerId = item.worker_id ?? null;
  if (!workerId) {
    const targetConfig = autoPlanConfigForTitle(targetPlan.title);
    if (targetConfig) workerId = await findAutoPlanWorkerId(createAdminClient(), targetConfig);
  }

  const { error: updateError } = await measureAsync("work-planning:move_item_update", () =>
    supabase
      .from("work_plan_items")
      .update({ work_plan_id: input.targetPlanId, worker_id: workerId })
      .eq("id", input.itemId)
      .eq("work_plan_id", input.currentPlanId),
  );
  if (updateError) return { data: null, error: updateError.message };

  await supabase.from("ticket_history").insert({
    ticket_id: item.ticket_id,
    actor_id: input.actorId,
    action: `Заявку перенесено в інший план: ${targetPlan.title}`,
    metadata: {
      from_work_plan_id: input.currentPlanId,
      to_work_plan_id: input.targetPlanId,
      to_work_plan_title: targetPlan.title,
      worker_id: workerId,
    },
  });

  return { data: { targetPlanId: input.targetPlanId }, error: null };
}

export async function updateWorkPlanStatus(id: string, status: WorkPlanStatus) {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return { data, error: error?.message ?? null };
}

export async function cancelWorkPlan(workPlanId: string) {
  const planResult = await getWorkPlanById(workPlanId);
  if (planResult.error) return { data: null, error: planResult.error };
  if (!planResult.data) return { data: null, error: "План не знайдено." };
  if (planResult.data.status !== "draft") return { data: null, error: "Скасувати можна тільки чернетку плану." };
  return updateWorkPlanStatus(workPlanId, "cancelled");
}

export async function getWorkPlanDispatches(workPlanId: string): Promise<QueryResult<WorkPlanDispatch[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_plan_dispatches")
    .select(dispatchSelect)
    .eq("work_plan_id", workPlanId)
    .order("sent_at", { ascending: false });
  return { data: (data ?? []) as unknown as WorkPlanDispatch[], error: error?.message ?? null };
}

function groupedItemsByWorker(items: WorkPlanItem[]) {
  const groups = new Map<string, WorkPlanItem[]>();
  for (const item of items) {
    if (!item.worker_id) continue;
    const group = groups.get(item.worker_id) ?? [];
    group.push(item);
    groups.set(item.worker_id, group);
  }
  return groups;
}

function latestDispatchByWorker(dispatches: WorkPlanDispatch[]) {
  const latest = new Map<string, WorkPlanDispatch>();
  for (const dispatch of dispatches) {
    if (!dispatch.worker_id || latest.has(dispatch.worker_id)) continue;
    latest.set(dispatch.worker_id, dispatch);
  }
  return latest;
}

function filterWorkerGroupsByMode(
  workerGroups: Map<string, WorkPlanItem[]>,
  dispatches: WorkPlanDispatch[],
  mode: SendWorkPlanMode,
) {
  if (mode === "initial" || mode === "resend_all") return workerGroups;

  const latest = latestDispatchByWorker(dispatches);
  const retryGroups = new Map<string, WorkPlanItem[]>();
  for (const [workerId, items] of workerGroups.entries()) {
    const lastDispatch = latest.get(workerId);
    if (!lastDispatch || lastDispatch.status === "failed" || lastDispatch.status === "skipped_no_telegram") {
      retryGroups.set(workerId, items);
    }
  }
  return retryGroups;
}

async function createDispatchRow(input: {
  workPlanId: string;
  workerId: string;
  telegramChatId?: string | null;
  status: WorkPlanDispatchStatus;
  messageId?: string | null;
  error?: string | null;
}) {
  const supabase = await createClient();
  return supabase.from("work_plan_dispatches").insert({
    work_plan_id: input.workPlanId,
    worker_id: input.workerId,
    telegram_chat_id: input.telegramChatId ?? null,
    status: input.status,
    message_id: input.messageId ?? null,
    error: input.error ?? null,
  });
}

const WORK_PLAN_SEND_CONCURRENCY = 4;

type WorkerSendResult = {
  sent: number;
  failed: number;
  skipped: number;
};

async function sendWorkPlanToWorkerGroup(input: {
  workPlanId: string;
  plan: WorkPlan;
  workerId: string;
  items: WorkPlanItem[];
}): Promise<WorkerSendResult> {
  const { workPlanId, plan, workerId, items } = input;
  const worker = items[0]?.worker;
  if (!worker) {
    await createDispatchRow({ workPlanId, workerId, status: "failed", error: "Виконавця не знайдено." });
    return { sent: 0, failed: 1, skipped: 0 };
  }

  if (!worker.telegram_id) {
    await createDispatchRow({ workPlanId, workerId, status: "skipped_no_telegram", error: "У виконавця не підключено Telegram." });
    return { sent: 0, failed: 0, skipped: 1 };
  }

  const result = await sendWorkPlanToWorker(worker, plan, items);
  if (result.ok) {
    await createDispatchRow({
      workPlanId,
      workerId,
      telegramChatId: worker.telegram_id,
      status: "sent",
      messageId: result.messageIds.join(","),
    });
    return { sent: 1, failed: 0, skipped: 0 };
  }

  await createDispatchRow({
    workPlanId,
    workerId,
    telegramChatId: worker.telegram_id,
    status: "failed",
    error: result.error,
  });
  return { sent: 0, failed: 1, skipped: 0 };
}


export async function getWorkPlanningSummary(): Promise<QueryResult<WorkPlanningSummary>> {
  if (!hasSupabaseEnv()) return emptyWithError({ totalActive: 0, plannedActive: 0, unplannedActive: 0 });
  const supabase = await createClient();
  const activeStatuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation", "pending_review"];

  const [activeTicketsResult, plannedRowsResult] = await Promise.all([
    measureAsync("work-planning:summary_active_tickets", () =>
      supabase.from("tickets").select("id", { count: "exact" }).in("status", activeStatuses),
    ),
    measureAsync("work-planning:summary_planned_items", () =>
      supabase
        .from("work_plan_items")
        .select("ticket_id, ticket:tickets!inner(status), work_plan:work_plans!inner(status)")
        .in("work_plan.status", ["sent", "partially_done"])
        .in("ticket.status", activeStatuses),
    ),
  ]);

  if (activeTicketsResult.error) return { data: { totalActive: 0, plannedActive: 0, unplannedActive: 0 }, error: activeTicketsResult.error.message };
  if (plannedRowsResult.error) return { data: { totalActive: activeTicketsResult.count ?? 0, plannedActive: 0, unplannedActive: activeTicketsResult.count ?? 0 }, error: plannedRowsResult.error.message };

  const totalActive = activeTicketsResult.count ?? 0;
  const plannedActive = new Set(((plannedRowsResult.data ?? []) as Array<{ ticket_id: string }>).map((row) => row.ticket_id)).size;
  return { data: { totalActive, plannedActive, unplannedActive: Math.max(totalActive - plannedActive, 0) }, error: null };
}

export async function getWorkPlanActiveTicketCount(): Promise<QueryResult<number>> {
  const summary = await getWorkPlanningSummary();
  return { data: summary.data.plannedActive, error: summary.error };
}

export async function deleteWorkPlan(workPlanId: string, actorId: string): Promise<QueryResult<null>> {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };

  const planResult = await getWorkPlanById(workPlanId);
  if (planResult.error) return { data: null, error: planResult.error };
  if (!planResult.data) return { data: null, error: "План не знайдено." };
  if (planResult.data.status === "done") {
    return { data: null, error: "Завершений план не можна видалити. Його можна переглянути в архіві." };
  }

  const itemsResult = await getWorkPlanItems(workPlanId);
  if (itemsResult.error) return { data: null, error: itemsResult.error };

  const supabase = await createClient();
  const ticketIds = Array.from(new Set(itemsResult.data.map((item) => item.ticket_id).filter(Boolean)));

  if (ticketIds.length > 0) {
    const historyRows = ticketIds.map((ticketId) => ({
      ticket_id: ticketId,
      actor_id: actorId,
      action: "План робіт видалено. Заявку повернуто до доступних для планування.",
      metadata: { work_plan_id: workPlanId, work_plan_status: planResult.data?.status ?? null },
    }));
    const { error: historyError } = await supabase.from("ticket_history").insert(historyRows);
    if (historyError) return { data: null, error: historyError.message };
  }

  const { error: dispatchError } = await supabase.from("work_plan_dispatches").delete().eq("work_plan_id", workPlanId);
  if (dispatchError) return { data: null, error: dispatchError.message };

  const { error: itemsError } = await supabase.from("work_plan_items").delete().eq("work_plan_id", workPlanId);
  if (itemsError) return { data: null, error: itemsError.message };

  const { error } = await supabase.from("work_plans").delete().eq("id", workPlanId);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function sendWorkPlanToWorkers(
  workPlanId: string,
  options: { mode?: SendWorkPlanMode } = {},
): Promise<QueryResult<{ sent: number; failed: number; skipped: number } | null>> {
  const mode = options.mode ?? "initial";
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const planResult = await getWorkPlanById(workPlanId);
  if (planResult.error) return { data: null, error: planResult.error };
  if (!planResult.data) return { data: null, error: "План не знайдено." };
  const plan = planResult.data;
  if (mode === "initial" && plan.status !== "draft") {
    return { data: null, error: "Первинне надсилання доступне тільки для чернетки плану." };
  }
  if (mode !== "initial" && (plan.status === "draft" || plan.status === "cancelled")) {
    return { data: null, error: "Повторне надсилання доступне тільки для вже надісланого активного плану." };
  }

  const dispatchesResult = await getWorkPlanDispatches(workPlanId);
  if (dispatchesResult.error) return { data: null, error: dispatchesResult.error };

  const itemsResult = await getWorkPlanItems(workPlanId);
  if (itemsResult.error) return { data: null, error: itemsResult.error };
  const workerGroups = groupedItemsByWorker(itemsResult.data);
  if (workerGroups.size === 0) return { data: null, error: "У плані немає заявок із призначеними виконавцями." };

  const targetGroups = filterWorkerGroupsByMode(workerGroups, dispatchesResult.data, mode);
  if (targetGroups.size === 0) return { data: { sent: 0, failed: 0, skipped: 0 }, error: null };

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const workerEntries = Array.from(targetGroups.entries());
  for (let index = 0; index < workerEntries.length; index += WORK_PLAN_SEND_CONCURRENCY) {
    const batch = workerEntries.slice(index, index + WORK_PLAN_SEND_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(([workerId, items]) => sendWorkPlanToWorkerGroup({ workPlanId, plan, workerId, items })),
    );

    for (const [resultIndex, result] of results.entries()) {
      if (result.status === "fulfilled") {
        sent += result.value.sent;
        failed += result.value.failed;
        skipped += result.value.skipped;
        continue;
      }

      failed += 1;
      const [workerId] = batch[resultIndex];
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      await createDispatchRow({ workPlanId, workerId, status: "failed", error: message });
    }
  }

  if (mode === "initial" && sent > 0) {
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("work_plans")
      .update({ status: "sent", sent_at: now, updated_at: now })
      .eq("id", workPlanId);
    if (error) return { data: null, error: error.message };
  }

  return { data: { sent, failed, skipped }, error: null };
}
