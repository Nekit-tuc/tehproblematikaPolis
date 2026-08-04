import { getDirectorTicketDisplayStatus, type DirectorDisplayStatus } from "@/lib/director/director-ticket-status";
import { measureAsync } from "@/lib/performance";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getWorkCompletionActsForTickets } from "@/lib/supabase/work-completion-acts";
import { ensureWeeklyDraftPlansForAutoRouting, type WorkPlan } from "@/lib/supabase/work-plans";
import type { ApprovalStatus, Category, CompanyObject, Profile, TicketWithRelations, WorkCompletionAct } from "@/types/domain";
import type { QueryResult } from "./queries";

type DirectorObjectRow = {
  id: string;
  profile_id: string;
  object_id: string;
  phone: string | null;
  is_primary: boolean;
  approval_status?: ApprovalStatus | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  note?: string | null;
  object?: CompanyObject | CompanyObject[] | null;
};

export type DirectorObject = {
  id: string;
  profileId: string;
  objectId: string;
  phone: string | null;
  isPrimary: boolean;
  approvalStatus: ApprovalStatus;
  approvedAt: string | null;
  rejectedAt: string | null;
  note: string | null;
  object: CompanyObject | null;
};

export type DirectorObjectRequest = {
  id: string;
  profile_id: string;
  requested_address: string;
  status: ApprovalStatus;
  resolved_object_id?: string | null;
  admin_note?: string | null;
  created_at: string;
  updated_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
};

export type DirectorPlanLink = {
  ticketId: string;
  planId: string;
  planTitle: string;
  planStatus: string;
  periodStart: string;
  periodEnd: string;
};

export type DirectorTicket = TicketWithRelations & {
  isInPlan: boolean;
  displayStatus: string;
  displayStatusInfo: DirectorDisplayStatus;
  planLink: DirectorPlanLink | null;
  workCompletionAct: WorkCompletionAct | null;
};

export type AdminDirectorAccount = Profile & {
  directorObjects: DirectorObject[];
  objectRequests: DirectorObjectRequest[];
};

type PlanAddReason =
  | "added"
  | "already_planned"
  | "supabase_missing"
  | "ticket_not_found"
  | "not_director_ticket"
  | "closed_ticket"
  | "missing_category"
  | "category_not_mapped"
  | "ensure_failed"
  | "plan_not_found"
  | "existing_error"
  | "insert_error";

export type AddDirectorTicketToPlanResult = {
  added: boolean;
  reason: PlanAddReason;
  planId?: string;
  planTitle?: string;
  itemId?: string | null;
};

type AutoDirectorPlanConfig = {
  title: string;
  categoryMatchers: string[];
};

const autoDirectorPlanConfigs: AutoDirectorPlanConfig[] = [
  { title: "Максим — буд роботи", categoryMatchers: ["будівельні роботи", "буд роботи"] },
  { title: "Нікіта — студенти/організаційні питання", categoryMatchers: ["студенти", "організаційні", "організаційні питання"] },
  { title: "Женя — важливі питання/електрика", categoryMatchers: ["електрика"] },
  { title: "Віталік — загальні будроботи/сварка", categoryMatchers: ["буд-роботи", "зварювальні", "ремонтні проф", "сварка", "зварка"] },
  { title: "Денис — сантехніка", categoryMatchers: ["сантехніка", "сантех"] },
  { title: "Віталік — вікна/двері/фурнітура", categoryMatchers: ["вікна", "двері", "фурнітура", "вікна двері фурнітура"] },
  { title: "Лена — каналізація", categoryMatchers: ["каналізація", "канал"] },
];

const directorObjectSelect = [
  "id",
  "profile_id",
  "object_id",
  "phone",
  "is_primary",
  "approval_status",
  "approved_at",
  "rejected_at",
  "note",
  "object:objects(id, name, type, object_number, city, district, address, source, created_by_profile_id, needs_admin_review, admin_note, is_active, created_at)",
].join(", ");

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

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

function rowObject(row: DirectorObjectRow) {
  return Array.isArray(row.object) ? row.object[0] ?? null : row.object ?? null;
}

function toDirectorObject(row: DirectorObjectRow): DirectorObject {
  return {
    id: row.id,
    profileId: row.profile_id,
    objectId: row.object_id,
    phone: row.phone,
    isPrimary: row.is_primary,
    approvalStatus: row.approval_status ?? "approved",
    approvedAt: row.approved_at ?? null,
    rejectedAt: row.rejected_at ?? null,
    note: row.note ?? null,
    object: rowObject(row),
  };
}

function normalizePlanningText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[ʼ'`]/g, "'")
    .replace(/[\/\\–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function autoPlanConfigForCategory(categoryName: string | null | undefined) {
  const normalized = normalizePlanningText(categoryName);
  if (!normalized) return null;
  return autoDirectorPlanConfigs.find((config) =>
    config.categoryMatchers.some((matcher) => {
      const normalizedMatcher = normalizePlanningText(matcher);
      return normalized.includes(normalizedMatcher) || normalizedMatcher.includes(normalized);
    }),
  ) ?? null;
}

function singleRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getDirectorObjects(
  profileId: string,
  approvalStatuses: ApprovalStatus[] | null = ["approved"],
): Promise<QueryResult<DirectorObject[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  let query = supabase
    .from("director_objects")
    .select(directorObjectSelect)
    .eq("profile_id", profileId)
    .order("is_primary", { ascending: false });
  if (approvalStatuses) query = query.in("approval_status", approvalStatuses);
  const { data, error } = await measureAsync("director:objects", () => query);
  return { data: ((data ?? []) as unknown as DirectorObjectRow[]).map(toDirectorObject), error: error?.message ?? null };
}

export async function getDirectorCategories(): Promise<QueryResult<Category[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = await createClient();
  const { data, error } = await measureAsync("director:categories", () =>
    supabase.from("categories").select("id, name, description, is_active, created_at").eq("is_active", true).order("name"),
  );
  return { data: (data ?? []) as Category[], error: error?.message ?? null };
}

export async function getDirectorRegistrationObjects(): Promise<QueryResult<CompanyObject[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = createAdminClient();
  const { data, error } = await measureAsync("director-register:objects", () =>
    supabase
      .from("objects")
      .select("id, name, type, object_number, city, district, address, source, created_by_profile_id, needs_admin_review, admin_note, is_active, created_at")
      .eq("is_active", true)
      .order("object_number", { ascending: true })
      .limit(300),
  );
  return { data: (data ?? []) as CompanyObject[], error: error?.message ?? null };
}

export async function getDirectorPendingOverview(profileId: string) {
  if (!hasSupabaseEnv()) return { data: null, error: missingSupabaseMessage };
  const supabase = await createClient();
  const [profileResult, objectsResult, requestsResult] = await Promise.all([
    measureAsync("director-pending:profile", () => supabase.from("profiles").select("*").eq("id", profileId).maybeSingle()),
    getDirectorObjects(profileId, null),
    measureAsync("director-pending:requests", () =>
      supabase
        .from("director_object_requests")
        .select("id, profile_id, requested_address, status, resolved_object_id, admin_note, created_at, updated_at, approved_at, rejected_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false }),
    ),
  ]);
  if (profileResult.error) return { data: null, error: profileResult.error.message };
  if (objectsResult.error) return { data: null, error: objectsResult.error };
  if (requestsResult.error) return { data: null, error: requestsResult.error.message };
  return {
    data: {
      profile: profileResult.data as Profile | null,
      objects: objectsResult.data,
      requests: (requestsResult.data ?? []) as DirectorObjectRequest[],
    },
    error: null,
  };
}

async function getPlannedTicketLinks(ticketIds: string[]) {
  const links = new Map<string, DirectorPlanLink>();
  if (ticketIds.length === 0) return links;
  const supabase = await createClient();
  const { data, error } = await measureAsync("director-ticket:plan-links", () =>
    supabase
      .from("work_plan_items")
      .select("ticket_id, work_plan:work_plans!inner(id, title, status, period_start, period_end)")
      .in("ticket_id", ticketIds)
      .in("work_plan.status", ["draft", "sent", "partially_done", "done"])
      .order("created_at", { ascending: false }),
  );
  if (error) return links;
  for (const row of (data ?? []) as Array<{ ticket_id: string | null; work_plan?: any }>) {
    if (!row.ticket_id || links.has(row.ticket_id)) continue;
    const plan = singleRelation(row.work_plan);
    if (!plan) continue;
    links.set(row.ticket_id, {
      ticketId: row.ticket_id,
      planId: plan.id,
      planTitle: plan.title,
      planStatus: plan.status,
      periodStart: plan.period_start,
      periodEnd: plan.period_end,
    });
  }
  return links;
}

function withDirectorStatus(ticket: TicketWithRelations, planLink: DirectorPlanLink | null, workCompletionAct: WorkCompletionAct | null): DirectorTicket {
  const displayStatusInfo = getDirectorTicketDisplayStatus(ticket, Boolean(planLink));
  return {
    ...ticket,
    isInPlan: Boolean(planLink),
    displayStatus: displayStatusInfo.label,
    displayStatusInfo,
    planLink,
    workCompletionAct,
  };
}

export async function getDirectorTickets(profileId: string, limit = 30): Promise<QueryResult<DirectorTicket[]>> {
  const objectsResult = await getDirectorObjects(profileId, ["approved"]);
  if (objectsResult.error) return { data: [], error: objectsResult.error };
  const objectIds = objectsResult.data.map((item) => item.objectId);
  if (objectIds.length === 0) return { data: [], error: null };
  const supabase = await createClient();
  const { data, error } = await measureAsync("director-ticket:director-list", () =>
    supabase
      .from("tickets")
      .select(directorTicketSelect)
      .eq("source", "director_portal")
      .in("object_id", objectIds)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  if (error) return { data: [], error: error.message };
  const tickets = (data ?? []) as unknown as TicketWithRelations[];
  const ticketIds = tickets.map((ticket) => ticket.id);
  const [plannedLinks, actsResult] = await Promise.all([getPlannedTicketLinks(ticketIds), getWorkCompletionActsForTickets(ticketIds)]);
  if (actsResult.error) return { data: [], error: actsResult.error };
  return { data: tickets.map((ticket) => withDirectorStatus(ticket, plannedLinks.get(ticket.id) ?? null, actsResult.data.get(ticket.id) ?? null)), error: null };
}

export async function getDirectorTicket(profileId: string, ticketId: string): Promise<QueryResult<DirectorTicket | null>> {
  const objectsResult = await getDirectorObjects(profileId, ["approved"]);
  if (objectsResult.error) return { data: null, error: objectsResult.error };
  const objectIds = objectsResult.data.map((item) => item.objectId);
  if (objectIds.length === 0) return { data: null, error: null };
  const supabase = await createClient();
  const { data, error } = await measureAsync("director:ticket_detail", () =>
    supabase
      .from("tickets")
      .select(directorTicketSelect)
      .eq("id", ticketId)
      .eq("source", "director_portal")
      .in("object_id", objectIds)
      .maybeSingle(),
  );
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  const ticket = data as unknown as TicketWithRelations;
  const [plannedLinks, actsResult] = await Promise.all([getPlannedTicketLinks([ticket.id]), getWorkCompletionActsForTickets([ticket.id])]);
  if (actsResult.error) return { data: null, error: actsResult.error };
  return { data: withDirectorStatus(ticket, plannedLinks.get(ticket.id) ?? null, actsResult.data.get(ticket.id) ?? null), error: null };
}

export async function addDirectorTicketToWeeklyDraftPlan(
  ticketId: string,
  actorId: string,
): Promise<QueryResult<AddDirectorTicketToPlanResult>> {
  if (!hasSupabaseEnv()) return { data: { added: false, reason: "supabase_missing" }, error: missingSupabaseMessage };
  const supabase = createAdminClient();
  const { data: ticketData, error: ticketError } = await measureAsync("director-ticket:add-to-plan:ticket", () =>
    supabase
      .from("tickets")
      .select("id, source, status, category_id, assignee_worker_id, category:categories(name)")
      .eq("id", ticketId)
      .maybeSingle(),
  );
  if (ticketError) return { data: { added: false, reason: "ticket_not_found" }, error: ticketError.message };
  const ticket = ticketData as {
    id: string;
    source?: string | null;
    status?: string | null;
    category_id?: string | null;
    assignee_worker_id?: string | null;
    category?: { name?: string | null } | { name?: string | null }[] | null;
  } | null;
  if (!ticket) return { data: { added: false, reason: "ticket_not_found" }, error: null };
  if (ticket.source !== "director_portal") return { data: { added: false, reason: "not_director_ticket" }, error: null };
  if (ticket.status === "done" || ticket.status === "rejected" || ticket.status === "cancelled") {
    return { data: { added: false, reason: "closed_ticket" }, error: null };
  }

  const category = singleRelation(ticket.category);
  const categoryName = category?.name ?? null;
  if (!ticket.category_id || !categoryName) return { data: { added: false, reason: "missing_category" }, error: null };
  const config = autoPlanConfigForCategory(categoryName);
  if (!config) return { data: { added: false, reason: "category_not_mapped" }, error: null };

  const plansResult = await ensureWeeklyDraftPlansForAutoRouting();
  if (plansResult.error) return { data: { added: false, reason: "ensure_failed" }, error: plansResult.error };
  const plan = plansResult.data.plans.find((item: WorkPlan) => item.title === config.title && item.status === "draft");
  if (!plan) return { data: { added: false, reason: "plan_not_found" }, error: null };

  const existingResult = await measureAsync("director-ticket:add-to-plan:existing", () =>
    supabase
      .from("work_plan_items")
      .select("id")
      .eq("work_plan_id", plan.id)
      .eq("ticket_id", ticketId)
      .limit(1)
      .maybeSingle(),
  );
  if (existingResult.error) return { data: { added: false, reason: "existing_error" }, error: existingResult.error.message };
  if (existingResult.data) {
    return { data: { added: false, reason: "already_planned", planId: plan.id, planTitle: plan.title }, error: null };
  }

  const countResult = await measureAsync("director-ticket:add-to-plan:count", () =>
    supabase.from("work_plan_items").select("id", { count: "exact", head: true }).eq("work_plan_id", plan.id),
  );
  const sortOrder = countResult.count ?? 0;
  const { data: inserted, error: insertError } = await measureAsync("director-ticket:add-to-plan:insert", () =>
    supabase
      .from("work_plan_items")
      .insert({
        work_plan_id: plan.id,
        ticket_id: ticketId,
        worker_id: ticket.assignee_worker_id ?? null,
        category: categoryName,
        sort_order: sortOrder,
      })
      .select("id")
      .single(),
  );
  if (insertError) {
    if (insertError.code === "23505") return { data: { added: false, reason: "already_planned", planId: plan.id, planTitle: plan.title }, error: null };
    return { data: { added: false, reason: "insert_error" }, error: insertError.message };
  }

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    actor_id: actorId,
    action: "Заявку додано в план виконання",
    metadata: {
      source: "director_portal",
      work_plan_id: plan.id,
      work_plan_title: plan.title,
      category: categoryName,
      worker_id: ticket.assignee_worker_id ?? null,
    },
  });

  return {
    data: {
      added: true,
      reason: "added",
      planId: plan.id,
      planTitle: plan.title,
      itemId: (inserted as { id?: string } | null)?.id ?? null,
    },
    error: null,
  };
}

async function getDirectorProfiles(status?: ApprovalStatus): Promise<QueryResult<Profile[]>> {
  if (!hasSupabaseEnv()) return emptyWithError([]);
  const supabase = createAdminClient();
  let query = supabase.from("profiles").select("*").eq("role", "store_director").order("created_at", { ascending: false }).limit(50);
  if (status) query = query.eq("approval_status", status);
  const { data, error } = await measureAsync("objects-directors:list_profiles", () => query);
  return { data: (data ?? []) as Profile[], error: error?.message ?? null };
}

export async function getAdminDirectorAccounts(status?: ApprovalStatus): Promise<QueryResult<AdminDirectorAccount[]>> {
  const profilesResult = await getDirectorProfiles(status);
  if (profilesResult.error) return { data: [], error: profilesResult.error };
  const profiles = profilesResult.data;
  if (profiles.length === 0) return { data: [], error: null };
  const ids = profiles.map((profile) => profile.id);
  const supabase = createAdminClient();
  const [objectsResult, requestsResult] = await Promise.all([
    measureAsync("objects-directors:list_objects", () => supabase.from("director_objects").select(directorObjectSelect).in("profile_id", ids).order("created_at", { ascending: false })),
    measureAsync("objects-directors:list_requests", () =>
      supabase
        .from("director_object_requests")
        .select("id, profile_id, requested_address, status, resolved_object_id, admin_note, created_at, updated_at, approved_at, rejected_at")
        .in("profile_id", ids)
        .order("created_at", { ascending: false }),
    ),
  ]);
  if (objectsResult.error) return { data: [], error: objectsResult.error.message };
  if (requestsResult.error) return { data: [], error: requestsResult.error.message };
  const objects = ((objectsResult.data ?? []) as unknown as DirectorObjectRow[]).map(toDirectorObject);
  const requests = (requestsResult.data ?? []) as DirectorObjectRequest[];
  return {
    data: profiles.map((profile) => ({
      ...profile,
      directorObjects: objects.filter((item) => item.profileId === profile.id),
      objectRequests: requests.filter((item) => item.profile_id === profile.id),
    })),
    error: null,
  };
}

export async function getAdminDirectorAccount(profileId: string): Promise<QueryResult<AdminDirectorAccount | null>> {
  if (!hasSupabaseEnv()) return emptyWithError(null);
  const supabase = createAdminClient();
  const [profileResult, objectsResult, requestsResult] = await Promise.all([
    measureAsync("objects-directors:detail_profile", () => supabase.from("profiles").select("*").eq("id", profileId).eq("role", "store_director").maybeSingle()),
    measureAsync("objects-directors:detail_objects", () => supabase.from("director_objects").select(directorObjectSelect).eq("profile_id", profileId).order("is_primary", { ascending: false })),
    measureAsync("objects-directors:detail_requests", () =>
      supabase
        .from("director_object_requests")
        .select("id, profile_id, requested_address, status, resolved_object_id, admin_note, created_at, updated_at, approved_at, rejected_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false }),
    ),
  ]);
  if (profileResult.error) return { data: null, error: profileResult.error.message };
  if (objectsResult.error) return { data: null, error: objectsResult.error.message };
  if (requestsResult.error) return { data: null, error: requestsResult.error.message };
  if (!profileResult.data) return { data: null, error: null };
  return {
    data: {
      ...(profileResult.data as Profile),
      directorObjects: ((objectsResult.data ?? []) as unknown as DirectorObjectRow[]).map(toDirectorObject),
      objectRequests: (requestsResult.data ?? []) as DirectorObjectRequest[],
    },
    error: null,
  };
}
