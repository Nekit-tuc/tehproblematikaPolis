import { measureAsync } from "@/lib/performance";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv, missingSupabaseMessage } from "@/lib/supabase/env";
import type { ApprovalStatus, CompanyObject, Profile } from "@/types/domain";
import type { QueryResult } from "./queries";

export type ObjectDirectorLink = {
  id: string;
  profileId: string;
  objectId: string;
  phone: string | null;
  isPrimary: boolean;
  approvalStatus: ApprovalStatus;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  director: Profile | null;
};

export type DirectorOption = Pick<Profile, "id" | "full_name" | "phone" | "email" | "approval_status"> & {
  activeLinkCount: number;
};

export type DirectorWithoutObject = DirectorOption;

export type ObjectWithDirectorLinks = CompanyObject & {
  directorLinks: ObjectDirectorLink[];
  approvedDirectorLinks: ObjectDirectorLink[];
  pendingDirectorLinks: ObjectDirectorLink[];
  rejectedDirectorLinks: ObjectDirectorLink[];
};

export type ObjectDirectorAudit = {
  totalDirectors: number;
  directorsWithLinks: number;
  approvedLinks: number;
  pendingLinks: number;
  rejectedLinks: number;
  objectsWithoutApprovedDirector: number;
  directorsWithoutObject: number;
  objectsPendingReview: number;
};

export type ObjectDirectorFilter = "all" | "without_director" | "pending" | "needs_review";

export type ObjectDirectorSyncPage = {
  objects: ObjectWithDirectorLinks[];
  total: number;
  page: number;
  limit: number;
  directors: DirectorOption[];
  directorsWithoutObjects: DirectorWithoutObject[];
  audit: ObjectDirectorAudit;
};

type DirectorObjectRow = {
  id: string;
  profile_id: string;
  object_id: string;
  phone: string | null;
  is_primary: boolean;
  approval_status?: ApprovalStatus | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  director?: Profile | Profile[] | null;
};

export type ObjectDirectorSyncFilters = {
  q?: string;
  type?: string;
  status?: string;
  district?: string;
  directorFilter?: ObjectDirectorFilter;
  page?: number;
  limit?: number;
};

function emptyWithError<T>(data: T): QueryResult<T> {
  return { data, error: missingSupabaseMessage };
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function objectNumber(object: CompanyObject) {
  return object.object_number || object.id.slice(0, 8);
}

function toDirectorLink(row: DirectorObjectRow): ObjectDirectorLink {
  return {
    id: row.id,
    profileId: row.profile_id,
    objectId: row.object_id,
    phone: row.phone,
    isPrimary: Boolean(row.is_primary),
    approvalStatus: row.approval_status ?? "approved",
    approvedAt: row.approved_at ?? null,
    rejectedAt: row.rejected_at ?? null,
    rejectionReason: row.rejection_reason ?? null,
    director: firstRelation(row.director),
  };
}

function directorLabelText(director: Pick<Profile, "full_name" | "phone" | "email" | "approval_status">) {
  return [director.full_name, director.phone, director.email, director.approval_status].filter(Boolean).join(" ");
}

function matchesSearch(object: CompanyObject, links: ObjectDirectorLink[], query?: string) {
  const search = normalize(query);
  if (!search) return true;
  const text = [
    object.name,
    objectNumber(object),
    object.address,
    object.city,
    object.district,
    ...(object.aliases ?? []),
    ...links.map((link) => link.director ? directorLabelText(link.director) : ""),
  ].join(" ").toLowerCase();
  return text.includes(search);
}

function matchesObjectFilters(object: CompanyObject, links: ObjectDirectorLink[], filters: ObjectDirectorSyncFilters) {
  if (filters.type && filters.type !== "all" && object.type !== filters.type) return false;
  if (filters.status === "active" && !object.is_active) return false;
  if (filters.status === "inactive" && object.is_active) return false;
  if (filters.district && filters.district !== "all" && (object.district ?? "") !== filters.district) return false;
  if (!matchesSearch(object, links, filters.q)) return false;
  const approvedCount = links.filter((link) => link.approvalStatus === "approved").length;
  const pendingCount = links.filter((link) => link.approvalStatus === "pending").length;
  if (filters.directorFilter === "without_director") return approvedCount === 0;
  if (filters.directorFilter === "pending") return pendingCount > 0;
  if (filters.directorFilter === "needs_review") return Boolean(object.needs_admin_review || object.source === "director_registration");
  return true;
}

export async function getObjectDirectorSyncPage(filters: ObjectDirectorSyncFilters = {}): Promise<QueryResult<ObjectDirectorSyncPage>> {
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const empty: ObjectDirectorSyncPage = { objects: [], total: 0, page, limit, directors: [], directorsWithoutObjects: [], audit: { totalDirectors: 0, directorsWithLinks: 0, approvedLinks: 0, pendingLinks: 0, rejectedLinks: 0, objectsWithoutApprovedDirector: 0, directorsWithoutObject: 0, objectsPendingReview: 0 } };
  if (!hasSupabaseEnv()) return emptyWithError(empty);

  const supabase = createAdminClient();
  const [objectsResult, linksResult, directorsResult] = await Promise.all([
    measureAsync("objects-director-sync:objects", () =>
      supabase
        .from("objects")
        .select("id, name, type, object_number, city, district, address, aliases, manager_id, source, created_by_profile_id, needs_admin_review, admin_note, is_active, created_at")
        .order("name")
        .limit(3000),
    ),
    measureAsync("objects-director-sync:links", () =>
      supabase
        .from("director_objects")
        .select("id, profile_id, object_id, phone, is_primary, approval_status, approved_at, rejected_at, rejection_reason, director:profiles(id, full_name, email, role, phone, approval_status, is_active, created_at)")
        .order("created_at", { ascending: false })
        .limit(5000),
    ),
    measureAsync("objects-director-sync:directors", () =>
      supabase
        .from("profiles")
        .select("id, full_name, email, role, phone, approval_status, is_active, created_at")
        .eq("role", "store_director")
        .order("full_name", { ascending: true })
        .limit(1000),
    ),
  ]);

  const error = objectsResult.error ?? linksResult.error ?? directorsResult.error;
  if (error) return { data: empty, error: error.message };

  const links = ((linksResult.data ?? []) as unknown as DirectorObjectRow[]).map(toDirectorLink);
  const linksByObject = new Map<string, ObjectDirectorLink[]>();
  const activeLinkProfileIds = new Set<string>();
  for (const link of links) {
    const group = linksByObject.get(link.objectId) ?? [];
    group.push(link);
    linksByObject.set(link.objectId, group);
    if (link.approvalStatus === "approved" || link.approvalStatus === "pending") activeLinkProfileIds.add(link.profileId);
  }

  const directors = ((directorsResult.data ?? []) as Profile[]).map((director) => ({
    id: director.id,
    full_name: director.full_name,
    phone: director.phone ?? null,
    email: director.email,
    approval_status: director.approval_status ?? "approved",
    activeLinkCount: links.filter((link) => link.profileId === director.id && (link.approvalStatus === "approved" || link.approvalStatus === "pending")).length,
  }));
  const directorsWithoutObjects = directors.filter((director) => (director.approval_status === "approved" || director.approval_status === "pending") && !activeLinkProfileIds.has(director.id));

  const objects = ((objectsResult.data ?? []) as CompanyObject[]).map((object) => {
    const directorLinks = linksByObject.get(object.id) ?? [];
    return {
      ...object,
      directorLinks,
      approvedDirectorLinks: directorLinks.filter((link) => link.approvalStatus === "approved"),
      pendingDirectorLinks: directorLinks.filter((link) => link.approvalStatus === "pending"),
      rejectedDirectorLinks: directorLinks.filter((link) => link.approvalStatus === "rejected"),
    };
  });

  const filtered = objects.filter((object) => matchesObjectFilters(object, object.directorLinks, filters));
  const from = (page - 1) * limit;
  const paged = filtered.slice(from, from + limit);
  const approvedLinks = links.filter((link) => link.approvalStatus === "approved").length;
  const pendingLinks = links.filter((link) => link.approvalStatus === "pending").length;
  const rejectedLinks = links.filter((link) => link.approvalStatus === "rejected").length;
  const objectsWithoutApprovedDirector = objects.filter((object) => object.approvedDirectorLinks.length === 0).length;
  const objectsPendingReview = objects.filter((object) => object.needs_admin_review || object.source === "director_registration").length;

  return {
    data: {
      objects: paged,
      total: filtered.length,
      page,
      limit,
      directors,
      directorsWithoutObjects,
      audit: {
        totalDirectors: directors.length,
        directorsWithLinks: directors.length - directorsWithoutObjects.length,
        approvedLinks,
        pendingLinks,
        rejectedLinks,
        objectsWithoutApprovedDirector,
        directorsWithoutObject: directorsWithoutObjects.length,
        objectsPendingReview,
      },
    },
    error: null,
  };
}
