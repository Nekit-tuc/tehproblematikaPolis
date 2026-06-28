import { isReliableStoreMatch, matchStore, type StoreMatch } from "@/lib/stores/match-store";
import type { AiGroupMessageAnalysis, AiParsedTicket, AiPriority } from "@/types/ai";
import { getOpenAiClient, getOpenAiModel, hasOpenAiApiKey } from "./openai-client";
import { serviceDeskCategories, serviceDeskPriorities, ticketClassifierSystemPrompt } from "./prompts";
import {
  hasProblemDescription,
  looksLikeTicket,
  parsePotentialTickets,
  type AiTicketClassification,
} from "./ticket-parser";

export type AnalyzeGroupMessageInput = {
  text: string;
  source?: "telegram" | "telegram_group" | "manual" | "api";
  storeMatch?: StoreMatch | null;
  categories?: readonly string[];
  priorities?: readonly AiPriority[];
  recommendedDepartments?: readonly string[];
};

const defaultRecommendedDepartments = [
  "Сантехнік",
  "Електрик",
  "Будівельна бригада",
  "Студентська бригада",
  "Холодильне обладнання",
  "Кліматична служба",
  "IT / POS",
  "Технічний менеджер",
  "Технічний відділ",
] as const;

function objectHintsFromMatch(match: StoreMatch | null) {
  if (!match || match.status !== "matched") return [];
  return [match.store.id, match.store.name, match.store.address, match.store.city, match.store.district, ...match.store.aliases];
}

function notTicketAnalysis(): AiGroupMessageAnalysis {
  return {
    isTicketMessage: false,
    objectId: null,
    objectName: null,
    address: null,
    confidence: 0,
    tickets: [],
    missingFields: ["problem_description"],
    reason: "Повідомлення не схоже на технічну заявку.",
  };
}

function mockAnalyzeGroupMessage(input: AnalyzeGroupMessageInput, storeMatch: StoreMatch | null): AiGroupMessageAnalysis {
  const text = input.text?.trim() ?? "";
  const isTicketMessage = looksLikeTicket(text);
  const hasDescription = hasProblemDescription(text);

  if (!isTicketMessage) return notTicketAnalysis();

  if (!storeMatch) {
    return {
      isTicketMessage: true,
      objectId: null,
      objectName: null,
      address: null,
      confidence: 0.38,
      tickets: [],
      missingFields: ["object"],
      reason: "Об'єкт не знайдено у довіднику.",
    };
  }

  if (storeMatch.status === "ambiguous") {
    return {
      isTicketMessage: true,
      objectId: null,
      objectName: null,
      address: null,
      confidence: storeMatch.confidence,
      tickets: [],
      missingFields: ["object"],
      reason: "Збіг об'єкта неоднозначний.",
    };
  }

  if (!isReliableStoreMatch(storeMatch)) {
    return {
      isTicketMessage: true,
      objectId: null,
      objectName: null,
      address: null,
      confidence: storeMatch.confidence,
      tickets: [],
      missingFields: ["object"],
      reason: "Збіг об'єкта має низьку впевненість.",
    };
  }

  const tickets = hasDescription ? parsePotentialTickets(text, objectHintsFromMatch(storeMatch)) : [];
  const ticketConfidence = tickets.length > 0 ? Math.min(...tickets.map((ticket) => ticket.confidence)) : 0;
  const confidence = Math.min(0.98, 0.35 + storeMatch.confidence * 0.35 + (hasDescription ? 0.18 : 0) + ticketConfidence * 0.12);
  const missingFields = [
    !hasDescription ? "problem_description" : null,
    tickets.length === 0 ? "tickets" : null,
  ].filter(Boolean) as string[];

  return {
    isTicketMessage: true,
    objectId: storeMatch.store.id,
    objectName: storeMatch.store.name,
    address: storeMatch.store.address,
    confidence,
    tickets,
    missingFields,
    reason: tickets.length > 0 ? "Повідомлення розібрано на окремі заявки." : "Не вдалося виділити окремі проблеми.",
  };
}

function extractJson(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
}

function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function asStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePriority(value: unknown, allowedPriorities: readonly AiPriority[]) {
  return typeof value === "string" && allowedPriorities.includes(value as AiPriority) ? (value as AiPriority) : "medium";
}

function normalizeCategory(value: unknown, allowedCategories: readonly string[]) {
  if (typeof value !== "string") return allowedCategories[allowedCategories.length - 1] ?? "Інше";
  return allowedCategories.find((category) => category === value) ?? allowedCategories.find((category) => category.toLowerCase() === value.toLowerCase()) ?? allowedCategories[allowedCategories.length - 1] ?? "Інше";
}

function normalizeDepartment(value: unknown, allowedDepartments: readonly string[]) {
  const department = asStringOrNull(value);
  if (!department) return null;
  if (department === "Технічний відділ") return department;
  return allowedDepartments.find((allowed) => allowed === department) ?? allowedDepartments.find((allowed) => allowed.toLowerCase() === department.toLowerCase()) ?? "Технічний відділ";
}

function validateOpenAiAnalysis({
  raw,
  storeMatch,
  allowedCategories,
  allowedPriorities,
  allowedDepartments,
}: {
  raw: unknown;
  storeMatch: StoreMatch | null;
  allowedCategories: readonly string[];
  allowedPriorities: readonly AiPriority[];
  allowedDepartments: readonly string[];
}): AiGroupMessageAnalysis {
  if (!raw || typeof raw !== "object") throw new Error("AI response is not an object");
  const value = raw as Record<string, unknown>;
  const isTicketMessage = value.isTicketMessage === true;

  if (!isTicketMessage) return notTicketAnalysis();
  if (!storeMatch || storeMatch.status !== "matched" || !isReliableStoreMatch(storeMatch)) {
    return {
      isTicketMessage: true,
      objectId: null,
      objectName: null,
      address: null,
      confidence: 0,
      tickets: [],
      missingFields: ["object"],
      reason: "Об'єкт не знайдено або збіг недостатньо надійний.",
    };
  }

  if (!Array.isArray(value.tickets)) throw new Error("AI response tickets is not an array");

  const tickets: AiParsedTicket[] = value.tickets
    .map((ticket): AiParsedTicket | null => {
      if (!ticket || typeof ticket !== "object") return null;
      const item = ticket as Record<string, unknown>;
      const title = asStringOrNull(item.title);
      const description = asStringOrNull(item.description);
      if (!title || !description) return null;
      return {
        title,
        description,
        category: normalizeCategory(item.category, allowedCategories),
        priority: normalizePriority(item.priority, allowedPriorities),
        recommendedDepartment: normalizeDepartment(item.recommendedDepartment, allowedDepartments),
        confidence: clampConfidence(item.confidence),
      };
    })
    .filter((ticket): ticket is AiParsedTicket => Boolean(ticket));

  const missingFields = Array.isArray(value.missingFields) ? value.missingFields.filter((field): field is string => typeof field === "string") : [];
  if (tickets.length === 0 && !missingFields.includes("tickets")) missingFields.push("tickets");

  return {
    isTicketMessage: true,
    objectId: storeMatch.store.id,
    objectName: storeMatch.store.name,
    address: storeMatch.store.address,
    confidence: clampConfidence(value.confidence),
    tickets,
    missingFields,
    reason: asStringOrNull(value.reason) ?? "AI проаналізував повідомлення.",
  };
}

function buildUserPrompt({
  text,
  storeMatch,
  categories,
  priorities,
  recommendedDepartments,
}: {
  text: string;
  storeMatch: StoreMatch | null;
  categories: readonly string[];
  priorities: readonly AiPriority[];
  recommendedDepartments: readonly string[];
}) {
  const reliableStore = storeMatch?.status === "matched" && isReliableStoreMatch(storeMatch)
    ? {
        status: storeMatch.status,
        quality: storeMatch.quality,
        objectId: storeMatch.store.id,
        objectName: storeMatch.store.name,
        address: storeMatch.store.address,
        city: storeMatch.store.city,
        district: storeMatch.store.district,
        aliases: storeMatch.store.aliases,
      }
    : storeMatch
      ? { status: storeMatch.status, quality: storeMatch.quality, confidence: storeMatch.confidence }
      : null;

  return JSON.stringify({
    text,
    storeMatch: reliableStore,
    allowedCategories: categories,
    allowedPriorities: priorities,
    allowedRecommendedDepartments: recommendedDepartments,
    requiredJsonShape: {
      isTicketMessage: "boolean",
      objectId: "string|null",
      objectName: "string|null",
      address: "string|null",
      confidence: "number 0..1",
      tickets: [
        {
          title: "string",
          description: "string",
          category: "one of allowedCategories",
          priority: "one of allowedPriorities",
          recommendedDepartment: "one of allowedRecommendedDepartments|null|Технічний відділ",
          confidence: "number 0..1",
        },
      ],
      missingFields: "string[]",
      reason: "string",
    },
  });
}

async function analyzeWithOpenAi(input: AnalyzeGroupMessageInput, storeMatch: StoreMatch | null): Promise<AiGroupMessageAnalysis> {
  const client = getOpenAiClient();
  if (!client) throw new Error("OPENAI_API_KEY is not configured");

  const categories = input.categories ?? serviceDeskCategories;
  const priorities = input.priorities ?? serviceDeskPriorities;
  const recommendedDepartments = input.recommendedDepartments ?? defaultRecommendedDepartments;
  const completion = await client.chat.completions.create({
    model: getOpenAiModel(),
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ticketClassifierSystemPrompt },
      { role: "user", content: buildUserPrompt({ text: input.text, storeMatch, categories, priorities, recommendedDepartments }) },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty response");
  const jsonText = extractJson(content);
  if (!jsonText) throw new Error("OpenAI response is not JSON");
  return validateOpenAiAnalysis({
    raw: JSON.parse(jsonText),
    storeMatch,
    allowedCategories: categories,
    allowedPriorities: priorities,
    allowedDepartments: recommendedDepartments,
  });
}

export async function analyzeGroupMessage(input: AnalyzeGroupMessageInput): Promise<AiGroupMessageAnalysis> {
  const storeMatch = input.storeMatch ?? matchStore(input.text ?? "");

  if (!hasOpenAiApiKey()) {
    console.warn("[ai-classifier] OPENAI_API_KEY is not configured, using mock fallback.");
    return mockAnalyzeGroupMessage(input, storeMatch);
  }

  try {
    return await analyzeWithOpenAi(input, storeMatch);
  } catch (error) {
    console.error("[ai-classifier] OpenAI analysis failed, using mock fallback.", error);
    return mockAnalyzeGroupMessage(input, storeMatch);
  }
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
