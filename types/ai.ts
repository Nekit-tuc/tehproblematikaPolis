import type { TicketPriority } from "@/types/domain";

export type AiPriority = TicketPriority;

export type AiParsedTicket = {
  title: string;
  description: string;
  category: string;
  priority: AiPriority;
  recommendedDepartment: string | null;
  confidence: number;
};

export type AiGroupMessageAnalysis = {
  isTicketMessage: boolean;
  objectId: string | null;
  objectName: string | null;
  address: string | null;
  confidence: number;
  tickets: AiParsedTicket[];
  missingFields: string[];
  reason: string;
};
