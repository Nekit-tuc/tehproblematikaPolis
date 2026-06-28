import { matchStore, type StoreMatchResult } from "@/lib/stores/match-store";
import type { AiPriority } from "@/types/ai";
import { hasOpenAiApiKey } from "./openai-client";
import { analyzeTelegramGroupMessage } from "./group-message-analyzer";
import type { AiTicketClassification } from "./ticket-parser";

export type AnalyzeGroupMessageInput = {
  text: string;
  source?: "telegram" | "telegram_group" | "manual" | "api";
  storeMatch?: StoreMatchResult | null;
  localStoreMatch?: StoreMatchResult | null;
  categories?: readonly string[];
  priorities?: readonly AiPriority[];
  recommendedDepartments?: readonly string[];
};

export async function analyzeGroupMessage(input: AnalyzeGroupMessageInput) {
  const localStoreMatch = input.localStoreMatch ?? input.storeMatch ?? matchStore(input.text ?? "");
  return analyzeTelegramGroupMessage({
    text: input.text,
    localStoreMatch,
    categories: input.categories,
    priorities: input.priorities,
    recommendedDepartments: input.recommendedDepartments,
  });
}

export type ClassifyTicketInput = AnalyzeGroupMessageInput;

export async function classifyTicketMessage(input: ClassifyTicketInput): Promise<AiTicketClassification> {
  const analysis = await analyzeGroupMessage(input);
  const firstTicket = analysis.tickets[0] ?? null;

  return {
    isTicket: analysis.isTicketMessage,
    hasProblemDescription: !analysis.missingFields.includes("problem_description"),
    objectId: analysis.objectId,
    objectName: analysis.objectName,
    address: analysis.address,
    title: firstTicket?.title ?? null,
    description: firstTicket?.description ?? null,
    category: firstTicket?.category ?? null,
    priority: firstTicket?.priority ?? null,
    recommendedDepartment: firstTicket?.recommendedDepartment ?? null,
    confidence: analysis.confidence,
    missingFields: analysis.missingFields,
    rawText: input.text ?? "",
    mode: hasOpenAiApiKey() ? "openai-ready" : "mock",
    problemDescription: firstTicket?.description ?? null,
    recommendedAssignee: firstTicket?.recommendedDepartment ?? null,
  };
}
