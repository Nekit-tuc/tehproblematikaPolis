import { supabase } from "./supabase";

export type Profile = {
  id: string;
  full_name: string;
  role: string;
  phone: string | null;
  approval_status: "pending" | "approved" | "rejected" | null;
  is_active: boolean;
};

export type StoreObject = {
  id: string;
  name: string;
  object_number: string | null;
  address: string;
  city: string | null;
  district: string | null;
  is_active?: boolean | null;
};

export type Category = {
  id: string;
  name: string;
};

export type Ticket = {
  id: string;
  number: string;
  title: string | null;
  description: string | null;
  status: string;
  priority: string | null;
  object_id: string;
  category_id: string | null;
  created_at: string;
  completed_at: string | null;
  worker_completed_at: string | null;
  sent_to_worker_at: string | null;
  object?: StoreObject | null;
  category?: Category | null;
  isInPlan: boolean;
  hasAct: boolean;
  displayStatus: string;
};

type DirectorObjectRow = {
  id: string;
  phone: string | null;
  approval_status?: string | null;
  object?: StoreObject | StoreObject[] | null;
};

type TicketRow = Omit<Ticket, "isInPlan" | "hasAct" | "displayStatus" | "object" | "category"> & {
  object?: StoreObject | StoreObject[] | null;
  category?: Category | Category[] | null;
};

const TICKET_NUMBER_RETRY_LIMIT = 3;

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getCurrentProfile(userId: string) {
  const { data, error } = await supabase.from("profiles").select("id, full_name, role, phone, approval_status, is_active").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Profile | null;
}

export async function getApprovedDirectorObjects(profileId: string) {
  const { data, error } = await supabase
    .from("director_objects")
    .select("id, phone, object:objects(id, name, object_number, address, city, district)")
    .eq("profile_id", profileId)
    .eq("approval_status", "approved")
    .order("is_primary", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as DirectorObjectRow[]).map((row) => one(row.object)).filter(Boolean) as StoreObject[];
}

export async function getActiveCategories() {
  const { data, error } = await supabase.from("categories").select("id, name").eq("is_active", true).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}

async function getPlanMembership(ticketIds: string[]) {
  if (ticketIds.length === 0) return new Set<string>();
  const { data } = await supabase.from("work_plan_items").select("ticket_id").in("ticket_id", ticketIds).limit(500);
  return new Set((data ?? []).map((row: { ticket_id: string | null }) => row.ticket_id).filter(Boolean) as string[]);
}

async function getActMembership(ticketIds: string[]) {
  if (ticketIds.length === 0) return new Set<string>();
  const { data } = await supabase.from("work_completion_acts").select("ticket_id").in("ticket_id", ticketIds).limit(500);
  return new Set((data ?? []).map((row: { ticket_id: string | null }) => row.ticket_id).filter(Boolean) as string[]);
}

export function directorDisplayStatus(ticket: Pick<Ticket, "status" | "sent_to_worker_at">, isInPlan: boolean) {
  if (ticket.status === "done") return "Виконана";
  if (ticket.status === "rejected" || ticket.status === "cancelled") return "Відхилена";
  if (ticket.status === "waiting_admin_confirmation") return "На підтвердженні";
  if (ticket.status === "in_progress") return "В роботі";
  if (ticket.sent_to_worker_at) return "Передана";
  if (isInPlan) return "У плані";
  if (ticket.status === "pending_review") return "На перевірці";
  return "Підтверджена";
}

export async function getDirectorTickets(profileId: string) {
  const objects = await getApprovedDirectorObjects(profileId);
  const objectIds = objects.map((object) => object.id);
  if (objectIds.length === 0) return { objects, tickets: [] as Ticket[] };

  const { data, error } = await supabase
    .from("tickets")
    .select(
      [
        "id",
        "number",
        "title",
        "description",
        "status",
        "priority",
        "object_id",
        "category_id",
        "created_at",
        "completed_at",
        "worker_completed_at",
        "sent_to_worker_at",
        "object:objects(id, name, object_number, address, city, district)",
        "category:categories(id, name)",
      ].join(", "),
    )
    .eq("source", "director_portal")
    .in("object_id", objectIds)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as TicketRow[];
  const ticketIds = rows.map((ticket) => ticket.id);
  const [plans, acts] = await Promise.all([getPlanMembership(ticketIds), getActMembership(ticketIds)]);

  return {
    objects,
    tickets: rows.map((ticket) => {
      const isInPlan = plans.has(ticket.id);
      return {
        ...ticket,
        object: one(ticket.object),
        category: one(ticket.category),
        isInPlan,
        hasAct: acts.has(ticket.id),
        displayStatus: directorDisplayStatus(ticket, isInPlan),
      };
    }),
  };
}

async function fallbackTicketNumber() {
  const year = new Date().getFullYear();
  const prefix = `PSD-${year}-`;
  const { data, error } = await supabase.from("tickets").select("number").like("number", `${prefix}%`).order("number", { ascending: false }).limit(25);
  if (error) throw new Error(error.message);
  const current = (data ?? []).reduce((max: number, row: { number?: string | null }) => {
    const parsed = Number.parseInt((row.number ?? "").replace(prefix, ""), 10);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return `${prefix}${String(current + 1).padStart(4, "0")}`;
}

async function generateTicketNumber() {
  const { data, error } = await supabase.rpc("next_ticket_number");
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return fallbackTicketNumber();
}

function isDuplicateTicketNumberError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "23505" || message.includes("tickets_number_key") || message.includes("duplicate key value");
}

async function getApprovedDirectorObjectLink(profileId: string, objectId: string) {
  const { data, error } = await supabase
    .from("director_objects")
    .select("id, phone, approval_status, object:objects(id, name, object_number, address, city, district, is_active)")
    .eq("profile_id", profileId)
    .eq("object_id", objectId)
    .eq("approval_status", "approved")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as DirectorObjectRow | null;
}

async function getActiveCategoryById(categoryId: string) {
  const { data, error } = await supabase.from("categories").select("id, name").eq("id", categoryId).eq("is_active", true).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Category | null;
}

export async function createDirectorTicket(input: {
  profile: Profile;
  objectId: string;
  categoryId: string;
  phone: string;
  description: string;
}) {
  const description = input.description.trim();
  if (!input.objectId) throw new Error("Оберіть магазин.");
  if (!input.categoryId) throw new Error("Оберіть категорію.");
  if (description.length < 10) throw new Error("Опис має містити щонайменше 10 символів.");

  const [directorObject, category] = await Promise.all([getApprovedDirectorObjectLink(input.profile.id, input.objectId), getActiveCategoryById(input.categoryId)]);
  if (!directorObject) throw new Error("Цей магазин ще не підтверджений для вашого профілю.");
  if (!category) throw new Error("Активну категорію не знайдено.");

  const title = description.length > 80 ? `${description.slice(0, 77)}...` : description;
  let ticket: { id: string } | null = null;
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 1; attempt <= TICKET_NUMBER_RETRY_LIMIT; attempt += 1) {
    const number = await generateTicketNumber();
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        number,
        title,
        description,
        status: "pending_review",
        priority: "medium",
        object_id: input.objectId,
        category_id: input.categoryId,
        created_by: input.profile.id,
        created_by_profile_id: input.profile.id,
        director_profile_id: input.profile.id,
        director_phone: input.phone || directorObject.phone || input.profile.phone || null,
        source: "director_portal",
        assigned_to: null,
        assignee_worker_id: null,
      })
      .select("id")
      .single();

    if (!error && data) {
      ticket = data as { id: string };
      break;
    }

    lastError = error;
    if (isDuplicateTicketNumberError(error) && attempt < TICKET_NUMBER_RETRY_LIMIT) continue;
    break;
  }

  if (!ticket) throw new Error(lastError?.message ?? "Не вдалося створити заявку.");

  const { error: historyError } = await supabase.from("ticket_history").insert({
    ticket_id: ticket.id,
    actor_id: input.profile.id,
    action: "Директор створив заявку з мобільного застосунку",
    metadata: { source: "director_portal", status: "pending_review", mobile: true },
  });

  if (historyError) throw new Error(historyError.message);

  return ticket.id;
}
