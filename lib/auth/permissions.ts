import type { PhotoType, Profile, TicketWithRelations, UserRole } from "@/types/domain";

export const roles: UserRole[] = ["admin", "management", "tech_manager", "worker", "store_manager"];

export function canAccessRoute(role: UserRole, pathname: string) {
  if (role === "admin") return true;
  if (pathname.startsWith("/settings")) return false;
  if (pathname.startsWith("/users")) return role === "management";
  if (pathname.startsWith("/reports")) return role === "management" || role === "tech_manager";
  if (pathname.startsWith("/work-planning")) return role === "management" || role === "tech_manager";
  if (pathname.startsWith("/workers")) return role === "management" || role === "tech_manager";
  if (pathname.startsWith("/ai-test")) return role === "management" || role === "tech_manager";
  if (pathname.startsWith("/ai-tickets")) return role === "management" || role === "tech_manager";
  if (pathname.startsWith("/tickets/new")) return role === "tech_manager" || role === "store_manager";
  if (pathname.startsWith("/objects")) return role === "management" || role === "tech_manager";
  return pathname.startsWith("/dashboard") || pathname.startsWith("/tickets");
}

export function canViewTicket(profile: Profile, ticket: Pick<TicketWithRelations, "assigned_to" | "object_id" | "created_by">) {
  if (["admin", "management", "tech_manager"].includes(profile.role)) return true;
  if (profile.role === "worker") return ticket.assigned_to === profile.id;
  if (profile.role === "store_manager") return ticket.object_id === profile.object_id;
  return false;
}

export function canEditTicket(profile: Profile, ticket: Pick<TicketWithRelations, "assigned_to" | "object_id" | "created_by">) {
  if (profile.role === "admin" || profile.role === "tech_manager") return true;
  if (profile.role === "worker") return ticket.assigned_to === profile.id;
  if (profile.role === "store_manager") return ticket.object_id === profile.object_id || ticket.created_by === profile.id;
  return false;
}

export function canConfirmTicket(profile: Profile) {
  return profile.role === "admin" || profile.role === "management" || profile.role === "tech_manager";
}

export function canAddTicketPhoto(profile: Profile, ticket: Pick<TicketWithRelations, "assigned_to" | "object_id" | "created_by">, type: PhotoType) {
  if (profile.role === "admin" || profile.role === "tech_manager") return true;
  if (profile.role === "worker") return ticket.assigned_to === profile.id && (type === "progress" || type === "after");
  if (profile.role === "store_manager") {
    return type === "before" && (ticket.object_id === profile.object_id || ticket.created_by === profile.id);
  }
  return false;
}

export function canCreateTicket(profile: Profile) {
  return profile.role === "admin" || profile.role === "tech_manager" || profile.role === "store_manager";
}

export function canViewUsers(profile: Profile) {
  return profile.role === "admin" || profile.role === "management";
}

export function canViewReports(profile: Profile) {
  return profile.role === "admin" || profile.role === "management" || profile.role === "tech_manager";
}

export function canUseWorkPlanning(profile: Profile) {
  return profile.role === "admin" || profile.role === "management" || profile.role === "tech_manager";
}

export function canManageWorkers(profile: Profile) {
  return profile.role === "admin" || profile.role === "management" || profile.role === "tech_manager";
}

export function canUnassignWorkerFromTicket(profile: Profile) {
  return profile.role === "admin" || profile.role === "management" || profile.role === "tech_manager";
}

export function canHardDeleteTicket(profile: Profile) {
  return profile.role === "admin";
}

export function canUseAiTest(profile: Profile) {
  return profile.role === "admin" || profile.role === "management" || profile.role === "tech_manager";
}

export function canViewSettings(profile: Profile) {
  return profile.role === "admin";
}
