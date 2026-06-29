import { getStoreCandidatesForAi, isReliableStoreMatch, matchStore, type StoreMatchResult } from "@/lib/stores/match-store";
import type { AiGroupMessageAnalysis, AiPriority } from "@/types/ai";
import { getOpenAiClient, getOpenAiModel, hasOpenAiApiKey } from "./openai-client";
import { serviceDeskCategories, serviceDeskDepartments, serviceDeskPriorities, serviceDeskWorkTypes, ticketClassifierSystemPrompt } from "./prompts";
import { parseAiAnalysisJson, safeNoTicket, safeObjectMissing, withTicketAlias } from "./safe-json";
import { extractWorkItems, looksLikeWorkMessage } from "./work-item-extractor";

export type AnalyzeTelegramGroupMessageInput = {
  text: string;
  localStoreMatch?: StoreMatchResult | null;
  categories?: readonly string[];
  priorities?: readonly AiPriority[];
  recommendedDepartments?: readonly string[];
};

function objectHintsFromMatch(match: StoreMatchResult | null) {
  const store = match?.bestMatch;
  if (!store) return [];
  return [store.id, store.name, store.address, store.city, store.district, ...store.aliases].filter(Boolean);
}

function mockAnalyze(input: AnalyzeTelegramGroupMessageInput, localStoreMatch: StoreMatchResult): AiGroupMessageAnalysis {
  const text = input.text?.trim() ?? "";
  if (!looksLikeWorkMessage(text)) return safeNoTicket();
  if (!isReliableStoreMatch(localStoreMatch) || !localStoreMatch.bestMatch) return safeObjectMissing();

  const workItems = extractWorkItems(text, objectHintsFromMatch(localStoreMatch));
  const itemConfidence = workItems.length > 0 ? Math.min(...workItems.map((item) => item.confidence)) : 0;
  const confidence = workItems.length > 0 ? Math.min(0.98, 0.42 + localStoreMatch.confidence * 0.35 + itemConfidence * 0.2) : 0.45;
  const missingFields = workItems.length === 0 ? ["workItems"] : [];

  return withTicketAlias({
    isTicketMessage: true,
    objectId: localStoreMatch.bestMatch.id,
    objectName: localStoreMatch.bestMatch.name,
    address: localStoreMatch.bestMatch.address,
    confidence,
    workItems,
    missingFields,
    reason: workItems.length > 0 ? "Повідомлення розібрано локальним AI v2 fallback parser у Work Items." : "Не вдалося виділити окремі роботи.",
  });
}

function storeForAi(match: StoreMatchResult) {
  if (!isReliableStoreMatch(match) || !match.bestMatch) return null;
  return {
    objectId: match.bestMatch.id,
    objectName: match.bestMatch.name,
    address: match.bestMatch.address,
    city: match.bestMatch.city,
    district: match.bestMatch.district,
    aliases: match.bestMatch.aliases,
  };
}

function candidatesForAi(match: StoreMatchResult, text: string) {
  const candidates = match.candidates.length > 0 ? match.candidates : getStoreCandidatesForAi(text);
  return candidates.slice(0, 5).map((candidate) => ({
    objectId: candidate.store.id,
    objectName: candidate.store.name,
    address: candidate.store.address,
    city: candidate.store.city,
    district: candidate.store.district,
    aliases: candidate.store.aliases,
    score: candidate.score,
    matchedBy: candidate.matchedBy,
    matchedTokens: candidate.matchedTokens,
    missingTokens: candidate.missingTokens,
  }));
}

function buildPrompt({
  text,
  localStoreMatch,
  categories,
  priorities,
  departments,
}: {
  text: string;
  localStoreMatch: StoreMatchResult;
  categories: readonly string[];
  priorities: readonly AiPriority[];
  departments: readonly string[];
}) {
  return JSON.stringify({
    text,
    localStoreMatchStatus: localStoreMatch.status,
    localStoreMatchReason: localStoreMatch.reason,
    fixedStore: storeForAi(localStoreMatch),
    candidateStores: isReliableStoreMatch(localStoreMatch) ? [] : candidatesForAi(localStoreMatch, text),
    allowedCategories: categories,
    allowedPriorities: priorities,
    allowedWorkTypes: serviceDeskWorkTypes,
    allowedRecommendedDepartments: departments,
    requiredJsonShape: {
      isTicketMessage: "boolean",
      objectId: "string|null",
      objectName: "string|null",
      address: "string|null",
      confidence: "number 0..1",
      workItems: [
        {
          title: "string",
          description: "string",
          category: "one of allowedCategories",
          workType: "one of allowedWorkTypes",
          priority: "one of allowedPriorities",
          recommendedDepartment: "one of allowedRecommendedDepartments|null|Технічний відділ",
          confidence: "number 0..1",
          reasoning: "string",
        },
      ],
      tickets: "same array as workItems for backward compatibility",
      missingFields: "string[]",
      reason: "string",
    },
  });
}

function enforceObjectPolicy(analysis: AiGroupMessageAnalysis, localStoreMatch: StoreMatchResult): AiGroupMessageAnalysis {
  if (!analysis.isTicketMessage) return withTicketAlias(analysis);

  if (isReliableStoreMatch(localStoreMatch) && localStoreMatch.bestMatch) {
    return withTicketAlias({
      ...analysis,
      objectId: localStoreMatch.bestMatch.id,
      objectName: localStoreMatch.bestMatch.name,
      address: localStoreMatch.bestMatch.address,
      missingFields: analysis.missingFields.filter((field) => field !== "object"),
    });
  }

  const chosen = localStoreMatch.candidates.find((candidate) => candidate.store.id === analysis.objectId)?.store;
  if (!chosen || analysis.confidence < 0.7) return safeObjectMissing("Не вдалося впевнено визначити об'єкт.");
  return withTicketAlias({
    ...analysis,
    objectId: chosen.id,
    objectName: chosen.name,
    address: chosen.address,
    missingFields: analysis.missingFields.filter((field) => field !== "object"),
  });
}

async function analyzeWithOpenAi(input: AnalyzeTelegramGroupMessageInput, localStoreMatch: StoreMatchResult): Promise<AiGroupMessageAnalysis> {
  const client = getOpenAiClient();
  if (!client) throw new Error("OPENAI_API_KEY is not configured");
  const categories = input.categories ?? serviceDeskCategories;
  const priorities = input.priorities ?? serviceDeskPriorities;
  const departments = input.recommendedDepartments ?? serviceDeskDepartments;

  const completion = await client.chat.completions.create({
    model: getOpenAiModel(),
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ticketClassifierSystemPrompt },
      { role: "user", content: buildPrompt({ text: input.text, localStoreMatch, categories, priorities, departments }) },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty response");
  const parsed = parseAiAnalysisJson({
    content,
    allowedCategories: categories,
    allowedPriorities: priorities,
    allowedDepartments: departments,
  });
  return enforceObjectPolicy(parsed, localStoreMatch);
}

export async function analyzeTelegramGroupMessage(input: AnalyzeTelegramGroupMessageInput): Promise<AiGroupMessageAnalysis> {
  const text = input.text?.trim() ?? "";
  const localStoreMatch = input.localStoreMatch ?? matchStore(text);

  if (!hasOpenAiApiKey()) {
    console.warn("[ai-analyzer] OPENAI_API_KEY is not configured, using AI v2 fallback parser.");
    return mockAnalyze(input, localStoreMatch);
  }

  try {
    return await analyzeWithOpenAi(input, localStoreMatch);
  } catch (error) {
    console.error("[ai-analyzer] OpenAI analysis failed, using AI v2 fallback parser.", error);
    return mockAnalyze(input, localStoreMatch);
  }
}
