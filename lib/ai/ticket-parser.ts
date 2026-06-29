import type { AiParsedTicket, AiPriority } from "@/types/ai";
import { extractWorkItemTexts, extractWorkItems, looksLikeWorkMessage, normalizeWorkText } from "./work-item-extractor";
import { classifyWorkItem, inferCategory } from "./work-classifier";
import { inferPriority } from "./priority-engine";

export type AiTicketPriority = AiPriority;
export type AiTicketCategory = string;

export type AiTicketClassification = {
  isTicket: boolean;
  hasProblemDescription: boolean;
  objectId: string | null;
  objectName: string | null;
  address: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: AiPriority | null;
  recommendedDepartment: string | null;
  confidence: number;
  missingFields: string[];
  rawText: string;
  mode: "mock" | "openai-ready";
  problemDescription?: string | null;
  recommendedAssignee?: string | null;
};

export function normalizeTicketText(text: string) {
  return normalizeWorkText(text).replace(/\s+/g, " ").trim();
}

export function splitPotentialTasks(text: string, objectHints: string[] = []) {
  return extractWorkItemTexts(text, objectHints);
}

export function shortTitleFromText(text: string) {
  const normalized = normalizeTicketText(text)
    .replace(/^(потрібно|треба|необхідно)\s+/iu, "")
    .trim();
  if (!normalized) return null;
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized[0].toUpperCase() + normalized.slice(1);
}

export function recommendedDepartmentForCategory(category: string) {
  return classifyWorkItem(category).recommendedDepartment ?? "Технічний відділ";
}

export function recommendedAssigneeForCategory(category: string) {
  return recommendedDepartmentForCategory(category);
}

export function looksLikeTicket(text: string) {
  return looksLikeWorkMessage(text);
}

export function hasProblemDescription(text: string) {
  const normalized = normalizeTicketText(text);
  return normalized.length >= 12 && looksLikeTicket(normalized);
}

export function parsePotentialTickets(text: string, objectHints: string[] = []): AiParsedTicket[] {
  return extractWorkItems(text, objectHints);
}

export { inferCategory, inferPriority };
