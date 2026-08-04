import type { TicketStatus, TicketWithRelations } from "@/types/domain";

export type DirectorDisplayTone = "green" | "red" | "orange" | "blue" | "amber" | "gray";

export type DirectorDisplayStatus = {
  label: string;
  tone: DirectorDisplayTone;
};

type DirectorStatusTicket = Pick<TicketWithRelations, "status" | "source" | "sent_to_worker_at">;

export function getDirectorTicketDisplayStatus(
  ticket: DirectorStatusTicket,
  isInPlan: boolean,
): DirectorDisplayStatus {
  if (ticket.status === "done") return { label: "Виконана", tone: "green" };
  if (ticket.status === "rejected" || ticket.status === "cancelled") return { label: "Відхилена", tone: "red" };
  if (ticket.status === "waiting_admin_confirmation") return { label: "Очікує підтвердження виконання", tone: "amber" };
  if (ticket.status === "in_progress") return { label: "В роботі", tone: "orange" };
  if (ticket.sent_to_worker_at) return { label: "Передана виконавцю", tone: "blue" };
  if (isInPlan) return { label: "Додана в план виконання", tone: "blue" };
  if (ticket.status === "pending_review" && ticket.source === "director_portal") return { label: "Очікує перевірки", tone: "amber" };
  return { label: "Підтверджена адміністратором", tone: "gray" };
}

export function directorStatusToneForBadge(tone: DirectorDisplayTone) {
  if (tone === "blue" || tone === "amber") return "orange";
  return tone === "gray" ? "gray" : tone;
}

export function isDirectorPendingStatus(status: TicketStatus) {
  return status === "pending_review";
}
