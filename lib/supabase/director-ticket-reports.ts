import { getDirectorTicketDisplayStatus } from "@/lib/director/director-ticket-status";
import { measureAsync } from "@/lib/performance";
import { createClient } from "@/lib/supabase/server";
import { getWorkCompletionActsForTickets } from "@/lib/supabase/work-completion-acts";
import type { Category, CompanyObject, TicketStatus, TicketWithRelations, WorkCompletionAct, Worker } from "@/types/domain";
import type { QueryResult } from "./queries";

export type DirectorTicketReportFilters = {
  objectId?: string;
  categoryId?: string;
  status?: TicketStatus | "all";
  workerId?: string;
  createdFrom?: string;
  createdTo?: string;
  completedFrom?: string;
  completedTo?: string;
  limit?: number;
};

export type DirectorTicketReportRow = TicketWithRelations & {
  isInPlan: boolean;
  displayStatus: string;
  workCompletionAct: WorkCompletionAct | null;
};

export type DirectorTicketReportMeta = {
  objects: CompanyObject[];
  categories: Category[];
  workers: Worker[];
};

const directorTicketSelect = [
  "id",
  "number",
  "title",
  "description",
  "status",
  "priority",
  "object_id",
  "category_id",
  "created_by",
  "assigned_to",
  "assignee_worker_id",
  "completed_at",
  "worker_completed_at",
  "admin_confirmed_at",
  "sent_to_worker_at",
  "source",
  "created_by_profile_id",
  "director_profile_id",
  "director_phone",
  "confirmed_by_profile_id",
  "repeat_count",
  "last_repeat_at",
  "created_at",
  "updated_at",
  "object:objects(id, name, type, object_number, city, district, address, source, created_by_profile_id, needs_admin_review, admin_note, is_active, created_at)",
  "category:categories(id, name, description, is_active, created_at)",
  "worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at)",
].join(", ");

function isDate(value: string | null | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function dayStartIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function nextDayStartIso(value: string) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

async function getApprovedDirectorObjects(profileId: string): Promise<QueryResult<CompanyObject[]>> {
  const supabase = await createClient();
  const { data, error } = await measureAsync("director-tickets:report_objects", () =>
    supabase
      .from("director_objects")
      .select("object:objects(id, name, type, object_number, city, district, address, source, created_by_profile_id, needs_admin_review, admin_note, is_active, created_at)")
      .eq("profile_id", profileId)
      .eq("approval_status", "approved")
      .order("is_primary", { ascending: false }),
  );
  if (error) return { data: [], error: error.message };
  const objects = ((data ?? []) as Array<{ object?: CompanyObject | CompanyObject[] | null }>)
    .map((row) => (Array.isArray(row.object) ? row.object[0] ?? null : row.object ?? null))
    .filter(Boolean) as CompanyObject[];
  return { data: objects, error: null };
}

async function getPlanMembership(ticketIds: string[]) {
  const map = new Set<string>();
  if (ticketIds.length === 0) return map;
  const supabase = await createClient();
  const { data } = await measureAsync("director-tickets:report_plan_links", () =>
    supabase.from("work_plan_items").select("ticket_id").in("ticket_id", ticketIds).limit(1000),
  );
  for (const row of (data ?? []) as Array<{ ticket_id: string | null }>) {
    if (row.ticket_id) map.add(row.ticket_id);
  }
  return map;
}

function applyTicketFilters(query: any, filters: DirectorTicketReportFilters) {
  let nextQuery = query;
  if (filters.objectId && filters.objectId !== "all") nextQuery = nextQuery.eq("object_id", filters.objectId);
  if (filters.categoryId && filters.categoryId !== "all") nextQuery = nextQuery.eq("category_id", filters.categoryId);
  if (filters.status && filters.status !== "all") nextQuery = nextQuery.eq("status", filters.status);
  if (filters.workerId && filters.workerId !== "all") nextQuery = nextQuery.eq("assignee_worker_id", filters.workerId);
  if (isDate(filters.createdFrom)) nextQuery = nextQuery.gte("created_at", dayStartIso(filters.createdFrom!));
  if (isDate(filters.createdTo)) nextQuery = nextQuery.lt("created_at", nextDayStartIso(filters.createdTo!));
  if (isDate(filters.completedFrom)) nextQuery = nextQuery.gte("completed_at", dayStartIso(filters.completedFrom!));
  if (isDate(filters.completedTo)) nextQuery = nextQuery.lt("completed_at", nextDayStartIso(filters.completedTo!));
  return nextQuery;
}

export async function getDirectorTicketsReport(profileId: string, filters: DirectorTicketReportFilters = {}): Promise<QueryResult<DirectorTicketReportRow[]>> {
  const objectsResult = await getApprovedDirectorObjects(profileId);
  if (objectsResult.error) return { data: [], error: objectsResult.error };
  const objectIds = objectsResult.data.map((object) => object.id);
  if (objectIds.length === 0) return { data: [], error: null };

  const supabase = await createClient();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 2000);
  const query = applyTicketFilters(
    supabase
      .from("tickets")
      .select(directorTicketSelect)
      .eq("source", "director_portal")
      .in("object_id", objectIds)
      .order("created_at", { ascending: false })
      .limit(limit),
    filters,
  );
  const response = (await measureAsync("director-tickets:report_list", () => query)) as { data: unknown[] | null; error: { message: string } | null };
  const { data, error } = response;
  if (error) return { data: [], error: error.message };

  const tickets = (data ?? []) as unknown as TicketWithRelations[];
  const ticketIds = tickets.map((ticket) => ticket.id);
  const [plans, actsResult] = await Promise.all([getPlanMembership(ticketIds), getWorkCompletionActsForTickets(ticketIds)]);
  if (actsResult.error) return { data: [], error: actsResult.error };

  return {
    data: tickets.map((ticket) => {
      const isInPlan = plans.has(ticket.id);
      return {
        ...ticket,
        isInPlan,
        displayStatus: getDirectorTicketDisplayStatus(ticket, isInPlan).label,
        workCompletionAct: actsResult.data.get(ticket.id) ?? null,
      };
    }),
    error: null,
  };
}

export async function getDirectorTicketReportMeta(profileId: string): Promise<QueryResult<DirectorTicketReportMeta>> {
  const objectsResult = await getApprovedDirectorObjects(profileId);
  if (objectsResult.error) return { data: { objects: [], categories: [], workers: [] }, error: objectsResult.error };
  const supabase = await createClient();
  const [categoriesResult, workersResult] = await Promise.all([
    measureAsync("director-tickets:report_categories", () =>
      supabase.from("categories").select("id, name, description, is_active, created_at").eq("is_active", true).order("name"),
    ),
    measureAsync("director-tickets:report_workers", () =>
      supabase.from("workers").select("id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at").eq("is_active", true).order("name"),
    ),
  ]);
  const error = categoriesResult.error ?? workersResult.error;
  return {
    data: {
      objects: objectsResult.data,
      categories: (categoriesResult.data ?? []) as Category[],
      workers: (workersResult.data ?? []) as Worker[],
    },
    error: error?.message ?? null,
  };
}
