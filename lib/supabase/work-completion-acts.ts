import { addDays, atStartOfDay, formatDateYYYYMMDD, getPreviousWorkWeekRange, getWorkWeekRange } from "@/lib/date/work-week";
import { measureAsync } from "@/lib/performance";
import { ALLOWED_PHOTO_TYPES, PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import type {
  Category,
  CompanyObject,
  Profile,
  TicketStatus,
  TicketWithRelations,
  WorkCompletionAct,
  WorkCompletionActPhoto,
  WorkCompletionActWithRelations,
  Worker,
} from "@/types/domain";
import type { QueryResult } from "./queries";

export const MAX_ACT_PHOTOS = 5;
export const MAX_ACT_PHOTO_SIZE = 10 * 1024 * 1024;

type ActRow = WorkCompletionActWithRelations & {
  director?: Profile | Profile[] | null;
  object?: WorkCompletionActWithRelations["object"] | WorkCompletionActWithRelations["object"][] | null;
  worker?: WorkCompletionActWithRelations["worker"] | WorkCompletionActWithRelations["worker"][] | null;
  ticket?: TicketWithRelations | TicketWithRelations[] | null;
  photos?: WorkCompletionActPhoto[] | null;
};

const actSelect = `
  id,
  ticket_id,
  object_id,
  director_profile_id,
  worker_id,
  act_number,
  work_description,
  director_comment,
  completed_at,
  confirmed_at,
  created_at,
  updated_at,
  created_by_profile_id,
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
    completed_at,
    worker_completed_at,
    admin_confirmed_at,
    sent_to_worker_at,
    source,
    director_profile_id,
    director_phone,
    created_at,
    updated_at,
    category:categories(id, name, description, is_active, created_at)
  ),
  object:objects(id, name, type, object_number, city, district, address, source, created_by_profile_id, needs_admin_review, admin_note, is_active, created_at),
  director:profiles!work_completion_acts_director_profile_id_fkey(id, full_name, email, role, phone, is_active, created_at),
  worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at),
  photos:work_completion_act_photos(id, act_id, ticket_id, storage_path, file_name, content_type, size_bytes, created_at, uploaded_by_profile_id)
`;

const actListSelect = actSelect.replace("ticket:tickets(", "ticket:tickets!inner(");

export type ActPeriod = "this_week" | "previous_week" | "current_month" | "custom";

export type ActFilters = {
  period?: ActPeriod;
  objectId?: string;
  categoryId?: string;
  workerId?: string;
  directorId?: string;
  ticketStatus?: TicketStatus | "all";
  completedFrom?: string;
  completedTo?: string;
  confirmedFrom?: string;
  confirmedTo?: string;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
};

export type ActFilterMeta = {
  objects: CompanyObject[];
  categories: Category[];
  workers: Worker[];
  directors: Profile[];
};

function singleRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function toAct(row: ActRow | null): WorkCompletionActWithRelations | null {
  if (!row) return null;
  return {
    ...row,
    ticket: singleRelation(row.ticket),
    object: singleRelation(row.object),
    director: singleRelation(row.director),
    worker: singleRelation(row.worker),
    photos: row.photos ?? [],
  };
}

export function getActFiles(formData: FormData, key = "photos") {
  return formData
    .getAll(key)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export function validateActPhotos(files: File[]) {
  if (files.length > MAX_ACT_PHOTOS) return `Можна завантажити максимум ${MAX_ACT_PHOTOS} фото до акту.`;
  for (const file of files) {
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return `Файл ${file.name} має недозволений формат. Дозволено jpg, jpeg, png, webp.`;
    if (file.size > MAX_ACT_PHOTO_SIZE) return `Файл ${file.name} більший за 10 MB.`;
  }
  return null;
}

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp"].includes(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export async function getWorkCompletionActForTicket(ticketId: string): Promise<QueryResult<WorkCompletionActWithRelations | null>> {
  const supabase = await createClient();
  const { data, error } = await measureAsync("admin-ticket:act", () =>
    supabase.from("work_completion_acts").select(actSelect).eq("ticket_id", ticketId).maybeSingle(),
  );
  return { data: toAct(data as ActRow | null), error: error?.message ?? null };
}

export async function getWorkCompletionActsForTickets(ticketIds: string[]): Promise<QueryResult<Map<string, WorkCompletionAct>>> {
  const map = new Map<string, WorkCompletionAct>();
  const ids = Array.from(new Set(ticketIds.filter(Boolean)));
  if (ids.length === 0) return { data: map, error: null };
  const supabase = await createClient();
  const { data, error } = await measureAsync("director-ticket:act-status", () =>
    supabase
      .from("work_completion_acts")
      .select("id, ticket_id, object_id, director_profile_id, worker_id, act_number, work_description, director_comment, completed_at, confirmed_at, created_at, updated_at, created_by_profile_id")
      .in("ticket_id", ids),
  );
  if (error) return { data: map, error: error.message };
  for (const row of (data ?? []) as WorkCompletionAct[]) map.set(row.ticket_id, row);
  return { data: map, error: null };
}

export async function nextWorkCompletionActNumber(): Promise<QueryResult<string>> {
  const supabase = await createClient();
  const { data, error } = await measureAsync("work-act:number", () => supabase.rpc("next_work_completion_act_number"));
  return { data: typeof data === "string" ? data : "", error: error?.message ?? null };
}

export async function uploadWorkCompletionActPhotos(input: {
  actId: string;
  ticketId: string;
  profileId: string;
  files: File[];
}) {
  const validationError = validateActPhotos(input.files);
  if (validationError) return { error: validationError };
  if (input.files.length === 0) return { error: null };

  const supabase = await createClient();
  const rows: Array<Omit<WorkCompletionActPhoto, "id" | "created_at">> = [];

  for (const [index, file] of input.files.entries()) {
    const storagePath = `acts/${input.ticketId}/${input.actId}/${Date.now()}-${index}-${crypto.randomUUID()}.${extensionFor(file)}`;
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) return { error: uploadError.message };
    rows.push({
      act_id: input.actId,
      ticket_id: input.ticketId,
      storage_path: storagePath,
      file_name: file.name,
      content_type: file.type,
      size_bytes: file.size,
      uploaded_by_profile_id: input.profileId,
    });
  }

  const { error } = await measureAsync("work-act:photos", () => supabase.from("work_completion_act_photos").insert(rows));
  return { error: error?.message ?? null };
}

export async function directorOwnsTicketObject(profileId: string, objectId: string): Promise<QueryResult<boolean>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("director_objects")
    .select("id")
    .eq("profile_id", profileId)
    .eq("object_id", objectId)
    .eq("approval_status", "approved")
    .maybeSingle();
  return { data: Boolean(data), error: error?.message ?? null };
}

function isDate(value: string | null | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function dayStartIso(value: string) {
  return atStartOfDay(new Date(`${value}T00:00:00`)).toISOString();
}

function nextDayStartIso(value: string) {
  return addDays(atStartOfDay(new Date(`${value}T00:00:00`)), 1).toISOString();
}

export function getDefaultActDateRange(period: ActPeriod = "current_month") {
  const now = new Date();
  if (period === "this_week") {
    const range = getWorkWeekRange(now);
    return { from: range.startIso, to: range.endIso, fromDate: range.startDate, toDate: range.endDate };
  }
  if (period === "previous_week") {
    const range = getPreviousWorkWeekRange(now);
    return { from: range.startIso, to: range.endIso, fromDate: range.startDate, toDate: range.endDate };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    fromDate: formatDateYYYYMMDD(start),
    toDate: formatDateYYYYMMDD(end),
  };
}

export function resolveActDateRange(filters: ActFilters, defaultPeriod: ActPeriod) {
  if (filters.period === "custom" && isDate(filters.completedFrom) && isDate(filters.completedTo)) {
    return {
      from: dayStartIso(filters.completedFrom!),
      to: nextDayStartIso(filters.completedTo!),
      fromDate: filters.completedFrom!,
      toDate: filters.completedTo!,
    };
  }
  return getDefaultActDateRange(filters.period ?? defaultPeriod);
}

function applyActFilters(query: any, filters: ActFilters, defaultPeriod: ActPeriod) {
  const completedRange = resolveActDateRange(filters, defaultPeriod);
  let nextQuery = query.gte("completed_at", completedRange.from).lt("completed_at", completedRange.to);
  if (filters.objectId && filters.objectId !== "all") nextQuery = nextQuery.eq("object_id", filters.objectId);
  if (filters.workerId && filters.workerId !== "all") nextQuery = nextQuery.eq("worker_id", filters.workerId);
  if (filters.directorId && filters.directorId !== "all") nextQuery = nextQuery.eq("director_profile_id", filters.directorId);
  if (filters.categoryId && filters.categoryId !== "all") nextQuery = nextQuery.eq("ticket.category_id", filters.categoryId);
  if (filters.ticketStatus && filters.ticketStatus !== "all") nextQuery = nextQuery.eq("ticket.status", filters.ticketStatus);
  if (isDate(filters.confirmedFrom)) nextQuery = nextQuery.gte("confirmed_at", dayStartIso(filters.confirmedFrom!));
  if (isDate(filters.confirmedTo)) nextQuery = nextQuery.lt("confirmed_at", nextDayStartIso(filters.confirmedTo!));
  if (isDate(filters.createdFrom)) nextQuery = nextQuery.gte("ticket.created_at", dayStartIso(filters.createdFrom!));
  if (isDate(filters.createdTo)) nextQuery = nextQuery.lt("ticket.created_at", nextDayStartIso(filters.createdTo!));
  return nextQuery;
}

async function getDirectorApprovedObjectIds(profileId: string): Promise<QueryResult<string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("director_objects")
    .select("object_id")
    .eq("profile_id", profileId)
    .eq("approval_status", "approved");
  return { data: ((data ?? []) as Array<{ object_id: string }>).map((row) => row.object_id), error: error?.message ?? null };
}

export async function getDirectorActs(profileId: string, filters: ActFilters = {}): Promise<QueryResult<WorkCompletionActWithRelations[]>> {
  const objectIdsResult = await getDirectorApprovedObjectIds(profileId);
  if (objectIdsResult.error) return { data: [], error: objectIdsResult.error };
  if (objectIdsResult.data.length === 0) return { data: [], error: null };
  const supabase = await createClient();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 2000);
  const query = applyActFilters(
    supabase
      .from("work_completion_acts")
      .select(actListSelect)
      .in("object_id", objectIdsResult.data)
      .order("completed_at", { ascending: false })
      .limit(limit),
    filters,
    "current_month",
  );
  const response = (await measureAsync("director-acts:list", () => query)) as { data: unknown[] | null; error: { message: string } | null };
  const { data, error } = response;
  return { data: ((data ?? []) as ActRow[]).map(toAct).filter(Boolean) as WorkCompletionActWithRelations[], error: error?.message ?? null };
}

export async function getAdminActs(filters: ActFilters = {}): Promise<QueryResult<WorkCompletionActWithRelations[]>> {
  const supabase = await createClient();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 2000);
  const query = applyActFilters(
    supabase.from("work_completion_acts").select(actListSelect).order("completed_at", { ascending: false }).limit(limit),
    filters,
    "this_week",
  );
  const response = (await measureAsync("admin-acts:list", () => query)) as { data: unknown[] | null; error: { message: string } | null };
  const { data, error } = response;
  return { data: ((data ?? []) as ActRow[]).map(toAct).filter(Boolean) as WorkCompletionActWithRelations[], error: error?.message ?? null };
}

export async function getDirectorActFilterMeta(profileId: string): Promise<QueryResult<ActFilterMeta>> {
  const supabase = await createClient();
  const objectsResult = await measureAsync("director-acts:meta_objects", () =>
    supabase
      .from("director_objects")
      .select("object:objects(id, name, type, object_number, city, district, address, source, created_by_profile_id, needs_admin_review, admin_note, is_active, created_at)")
      .eq("profile_id", profileId)
      .eq("approval_status", "approved")
      .order("is_primary", { ascending: false }),
  );
  if (objectsResult.error) return { data: { objects: [], categories: [], workers: [], directors: [] }, error: objectsResult.error.message };
  const objects = ((objectsResult.data ?? []) as Array<{ object?: CompanyObject | CompanyObject[] | null }>)
    .map((row) => singleRelation(row.object))
    .filter(Boolean) as CompanyObject[];
  const objectIds = objects.map((object) => object.id);
  const [categoriesResult, workersResult] = await Promise.all([
    measureAsync("director-acts:meta_categories", () =>
      supabase.from("categories").select("id, name, description, is_active, created_at").eq("is_active", true).order("name"),
    ),
    objectIds.length
      ? measureAsync("director-acts:meta_workers", () =>
          supabase
            .from("work_completion_acts")
            .select("worker:workers(id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at)")
            .in("object_id", objectIds)
            .not("worker_id", "is", null)
            .limit(500),
        )
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (categoriesResult.error) return { data: { objects, categories: [], workers: [], directors: [] }, error: categoriesResult.error.message };
  if (workersResult.error) return { data: { objects, categories: [], workers: [], directors: [] }, error: workersResult.error.message };
  return {
    data: {
      objects,
      categories: (categoriesResult.data ?? []) as Category[],
      workers: dedupeWorkers((workersResult.data ?? []) as Array<{ worker?: Worker | Worker[] | null }>),
      directors: [],
    },
    error: null,
  };
}

export async function getAdminActFilterMeta(): Promise<QueryResult<ActFilterMeta>> {
  const supabase = await createClient();
  const [objectsResult, categoriesResult, workersResult, directorsResult] = await Promise.all([
    measureAsync("admin-acts:meta_objects", () =>
      supabase
        .from("objects")
        .select("id, name, type, object_number, city, district, address, source, created_by_profile_id, needs_admin_review, admin_note, is_active, created_at")
        .order("object_number", { ascending: true })
        .limit(500),
    ),
    measureAsync("admin-acts:meta_categories", () =>
      supabase.from("categories").select("id, name, description, is_active, created_at").eq("is_active", true).order("name"),
    ),
    measureAsync("admin-acts:meta_workers", () =>
      supabase.from("workers").select("id, name, phone, telegram_username, telegram_id, is_active, notes, created_at, updated_at").eq("is_active", true).order("name"),
    ),
    measureAsync("admin-acts:meta_directors", () =>
      supabase.from("profiles").select("id, full_name, email, role, phone, is_active, created_at").eq("role", "store_director").order("full_name"),
    ),
  ]);
  const error = objectsResult.error ?? categoriesResult.error ?? workersResult.error ?? directorsResult.error;
  return {
    data: {
      objects: (objectsResult.data ?? []) as CompanyObject[],
      categories: (categoriesResult.data ?? []) as Category[],
      workers: (workersResult.data ?? []) as Worker[],
      directors: (directorsResult.data ?? []) as Profile[],
    },
    error: error?.message ?? null,
  };
}

function dedupeWorkers(rows: Array<{ worker?: Worker | Worker[] | null }>) {
  const map = new Map<string, Worker>();
  for (const row of rows) {
    const worker = singleRelation(row.worker);
    if (worker?.id) map.set(worker.id, worker);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "uk"));
}
