import type { TicketPriority } from "@/types/domain";

export type AiWorkType =
  | "repair"
  | "install"
  | "replace"
  | "inspect"
  | "administrative"
  | "cleaning"
  | "safety"
  | "other";

export type AiPriority = Extract<TicketPriority, "low" | "medium" | "high" | "critical">;

export type AiDepartmentSuggestion = string | null;

export type AiWorkItem = {
  title: string;
  description: string;
  category: string;
  workType: AiWorkType;
  priority: AiPriority;
  recommendedDepartment: AiDepartmentSuggestion;
  confidence: number;
  reasoning: string;
};

export type AiWorkItemAnalysis = {
  isTicketMessage: boolean;
  objectId: string | null;
  objectName: string | null;
  address: string | null;
  confidence: number;
  workItems: AiWorkItem[];
  tickets: AiWorkItem[];
  missingFields: string[];
  reason: string;
};

export type AiParsedTicket = AiWorkItem;
export type AiGroupMessageAnalysis = AiWorkItemAnalysis;
