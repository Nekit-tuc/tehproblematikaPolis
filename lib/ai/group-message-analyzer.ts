import { getStoreCandidatesForAi, isReliableStoreMatch, matchStore, type StoreMatchResult } from "@/lib/stores/match-store";
import type { ObjectResolverCandidate, ObjectResolverResult } from "@/lib/ai/object-resolver";
import type { AiGroupMessageAnalysis, AiPriority } from "@/types/ai";
import { getOpenAiClient, getOpenAiModel, hasOpenAiApiKey } from "./openai-client";
import { serviceDeskCategories, serviceDeskDepartments, serviceDeskPriorities, serviceDeskWorkTypes, ticketClassifierSystemPrompt } from "./prompts";
import { parseAiAnalysisJsonWithMeta, safeNoTicket, safeObjectMissing, withTicketAlias } from "./safe-json";
import { extractWorkItems, looksLikeWorkMessage } from "./work-item-extractor";

export type AnalyzeTelegramGroupMessageInput = {
  text: string;
  localStoreMatch?: StoreMatchResult | null;
  objectResolver?: ObjectResolverResult | null;
  categories?: readonly string[];
  priorities?: readonly AiPriority[];
  recommendedDepartments?: readonly string[];
};

export type AiAnalyzerMode = "openai" | "fallback";

export type AnalyzeTelegramGroupMessageResult = {
  analysis: AiGroupMessageAnalysis;
  mode: AiAnalyzerMode;
  model: string | null;
  openaiConfigured: boolean;
  fallbackReason?: string;
  openaiValidationError?: string | null;
};

class OpenAiAnalyzerError extends Error {
  constructor(
    public readonly code: "sdk" | "request" | "invalid_json",
    message: string,
    public readonly rawContentSnippet?: string,
  ) {
    super(message);
  }
}

const workItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "category", "workType", "priority", "recommendedDepartment", "confidence", "reasoning"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category: { type: "string" },
    workType: { type: "string", enum: ["repair", "install", "replace", "inspect", "administrative", "cleaning", "safety", "other"] },
    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
    recommendedDepartment: { type: ["string", "null"] },
    confidence: { type: "number" },
    reasoning: { type: "string" },
  },
} as const;

const aiWorkItemsAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["isTicketMessage", "objectId", "objectName", "address", "confidence", "workItems", "tickets", "missingFields", "reason", "mode", "model"],
  properties: {
    isTicketMessage: { type: "boolean" },
    objectId: { type: ["string", "null"] },
    objectName: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
    confidence: { type: "number" },
    workItems: { type: "array", items: workItemSchema },
    tickets: { type: "array", items: workItemSchema },
    missingFields: { type: "array", items: { type: "string" } },
    reason: { type: "string" },
    mode: { type: "string" },
    model: { type: "string" },
  },
} as const;

function objectHintsFromMatch(match: StoreMatchResult | null) {
  const store = match?.bestMatch;
  if (!store) return [];
  return [store.id, store.name, store.address, store.city, store.district, ...store.aliases].filter(Boolean);
}

function fallbackAnalyze(input: AnalyzeTelegramGroupMessageInput, localStoreMatch: StoreMatchResult, fallbackReason?: string): AnalyzeTelegramGroupMessageResult {
  const text = input.text?.trim() ?? "";
  if (!looksLikeWorkMessage(text)) {
    return {
      analysis: safeNoTicket(),
      mode: "fallback",
      model: null,
      openaiConfigured: hasOpenAiApiKey(),
      fallbackReason: fallbackReason ?? "Повідомлення не схоже на технічну заявку.",
    };
  }

  if (!isReliableStoreMatch(localStoreMatch) || !localStoreMatch.bestMatch) {
    return {
      analysis: safeObjectMissing(),
      mode: "fallback",
      model: null,
      openaiConfigured: hasOpenAiApiKey(),
      fallbackReason: fallbackReason ?? "Object Matcher не визначив об'єкт з достатньою впевненістю.",
    };
  }

  const workItems = extractWorkItems(text, objectHintsFromMatch(localStoreMatch));
  const itemConfidence = workItems.length > 0 ? Math.min(...workItems.map((item) => item.confidence)) : 0;
  const confidence = workItems.length > 0 ? Math.min(0.98, 0.42 + localStoreMatch.confidence * 0.35 + itemConfidence * 0.2) : 0.45;
  const missingFields = workItems.length === 0 ? ["workItems"] : [];

  return {
    analysis: withTicketAlias({
      isTicketMessage: true,
      objectId: localStoreMatch.bestMatch.id,
      objectName: localStoreMatch.bestMatch.name,
      address: localStoreMatch.bestMatch.address,
      confidence,
      workItems,
      missingFields,
      openAiSelectedObjectId: null,
      objectOverrideIgnored: false,
      finalObjectId: localStoreMatch.bestMatch.id,
      objectResolver: input.objectResolver
        ? {
            status: input.objectResolver.status,
            source: input.objectResolver.source,
            confidence: input.objectResolver.confidence,
            reason: input.objectResolver.reason,
          }
        : undefined,
      reason: workItems.length > 0 ? "Повідомлення розібрано локальним AI v2 fallback parser у Work Items." : "Не вдалося виділити окремі роботи.",
    }),
    mode: "fallback",
    model: null,
    openaiConfigured: hasOpenAiApiKey(),
    fallbackReason,
  };
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

function candidatesForAi(match: StoreMatchResult, text: string, resolver?: ObjectResolverResult | null) {
  if (resolver?.candidates.length) {
    return resolver.candidates.slice(0, 5).map((candidate) => ({
      objectId: candidate.id,
      objectName: candidate.name,
      address: candidate.address,
      objectNumber: candidate.objectNumber,
      city: candidate.city,
      district: candidate.district,
      aliases: candidate.aliases,
      score: candidate.score,
      matchedBy: candidate.matchedBy,
      matchedAlias: candidate.matchedAlias,
      matchedTokens: candidate.matchedTokens,
      missingTokens: candidate.missingTokens,
    }));
  }
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
    matchedAlias: candidate.matchedAlias ?? null,
    matchedTokens: candidate.matchedTokens,
    missingTokens: candidate.missingTokens,
  }));
}

function buildPrompt({
  text,
  localStoreMatch,
  objectResolver,
  categories,
  priorities,
  departments,
}: {
  text: string;
  localStoreMatch: StoreMatchResult;
  objectResolver?: ObjectResolverResult | null;
  categories: readonly string[];
  priorities: readonly AiPriority[];
  departments: readonly string[];
}) {
  const reliable = isReliableStoreMatch(localStoreMatch);
  const resolvedObject = objectResolver?.status === "resolved" ? objectResolver.bestMatch : storeForAi(localStoreMatch);
  const objectCandidates = candidatesForAi(localStoreMatch, text, objectResolver);
  const allowedObjectIds = objectResolver?.allowedObjectIds ?? objectCandidates.map((candidate) => candidate.objectId);
  return JSON.stringify({
    originalMessageText: text,
    objectResolver: objectResolver
      ? {
          status: objectResolver.status,
          source: objectResolver.source,
          confidence: objectResolver.confidence,
          reason: objectResolver.reason,
          bestMatch: objectResolver.bestMatch,
          allowedObjectIds,
        }
      : null,
    localStoreMatch: {
      status: localStoreMatch.status,
      confidence: localStoreMatch.confidence,
      reason: localStoreMatch.reason,
      bestMatch: localStoreMatch.bestMatch
        ? {
            objectId: localStoreMatch.bestMatch.id,
            objectName: localStoreMatch.bestMatch.name,
            address: localStoreMatch.bestMatch.address,
            city: localStoreMatch.bestMatch.city,
            district: localStoreMatch.bestMatch.district,
            aliases: localStoreMatch.bestMatch.aliases,
          }
        : null,
      candidates: objectCandidates,
    },
    resolvedObject,
    fixedStore: resolvedObject,
    objectCandidates,
    allowedObjectIds,
    objectSelectionPolicy:
      objectResolver?.status === "resolved" || reliable
        ? "resolvedObject is already selected by local Object Resolver. Use only resolvedObject. Do not change objectId/objectName/address."
        : "No local object is resolved. Choose only from allowedObjectIds/objectCandidates. If unsure, return objectId=null, workItems=[], tickets=[], missingFields includes object. Never invent objects.",
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
          description: "string without store name/address",
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
      mode: "openai",
      model: getOpenAiModel(),
    },
  });
}

function resolverCandidateToStore(candidate: ObjectResolverCandidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    address: candidate.address,
  };
}

function enforceObjectPolicy(analysis: AiGroupMessageAnalysis, localStoreMatch: StoreMatchResult, objectResolver?: ObjectResolverResult | null): AiGroupMessageAnalysis {
  if (!analysis.isTicketMessage) return withTicketAlias(analysis);

  if (objectResolver?.status === "resolved" && objectResolver.bestMatch) {
    const openAiSelectedObjectId = analysis.objectId;
    const objectOverrideIgnored = Boolean(openAiSelectedObjectId && openAiSelectedObjectId !== objectResolver.bestMatch.id);
    if (objectOverrideIgnored) {
      console.warn("[ai-analyzer] OpenAI object override ignored", {
        selectedObjectId: openAiSelectedObjectId,
        forcedObjectId: objectResolver.bestMatch.id,
        forcedObjectName: objectResolver.bestMatch.name,
      });
    }

    return withTicketAlias({
      ...analysis,
      objectId: objectResolver.bestMatch.id,
      objectName: objectResolver.bestMatch.name,
      address: objectResolver.bestMatch.address,
      openAiSelectedObjectId,
      objectOverrideIgnored,
      finalObjectId: objectResolver.bestMatch.id,
      objectResolver: {
        status: objectResolver.status,
        source: objectResolver.source,
        confidence: objectResolver.confidence,
        reason: objectResolver.reason,
      },
      missingFields: analysis.missingFields.filter((field) => field !== "object"),
    });
  }

  if (isReliableStoreMatch(localStoreMatch) && localStoreMatch.bestMatch) {
    const openAiSelectedObjectId = analysis.objectId;
    const objectOverrideIgnored = Boolean(openAiSelectedObjectId && openAiSelectedObjectId !== localStoreMatch.bestMatch.id);
    if (objectOverrideIgnored) {
      console.warn("[ai-analyzer] OpenAI object override ignored", {
        selectedObjectId: openAiSelectedObjectId,
        forcedObjectId: localStoreMatch.bestMatch.id,
        forcedObjectName: localStoreMatch.bestMatch.name,
      });
    }

    return withTicketAlias({
      ...analysis,
      objectId: localStoreMatch.bestMatch.id,
      objectName: localStoreMatch.bestMatch.name,
      address: localStoreMatch.bestMatch.address,
      openAiSelectedObjectId,
      objectOverrideIgnored,
      finalObjectId: localStoreMatch.bestMatch.id,
      missingFields: analysis.missingFields.filter((field) => field !== "object"),
    });
  }

  const resolverCandidate =
    objectResolver && analysis.objectId && objectResolver.allowedObjectIds.includes(analysis.objectId)
      ? objectResolver.candidates.find((candidate) => candidate.id === analysis.objectId)
      : undefined;
  const chosen = resolverCandidate
    ? resolverCandidateToStore(resolverCandidate)
    : objectResolver
      ? null
      : localStoreMatch.candidates.find((candidate) => candidate.store.id === analysis.objectId)?.store;
  if (!chosen || analysis.confidence < 0.7) return safeObjectMissing("Не вдалося впевнено визначити об'єкт.");
  return withTicketAlias({
    ...analysis,
    objectId: chosen.id,
    objectName: chosen.name,
    address: chosen.address,
    openAiSelectedObjectId: analysis.objectId,
    objectOverrideIgnored: false,
    finalObjectId: chosen.id,
    objectResolver: objectResolver
      ? {
          status: "resolved",
          source: "ai_candidate_choice",
          confidence: objectResolver.confidence,
          reason: objectResolver.reason,
        }
      : undefined,
    missingFields: analysis.missingFields.filter((field) => field !== "object"),
  });
}

async function analyzeWithOpenAi(input: AnalyzeTelegramGroupMessageInput, localStoreMatch: StoreMatchResult): Promise<{ analysis: AiGroupMessageAnalysis; validationError: string | null }> {
  const { client, error } = await getOpenAiClient();
  if (!client) throw new OpenAiAnalyzerError(error === "OpenAI SDK error" ? "sdk" : "request", error ?? "OpenAI request failed");
  const categories = input.categories ?? serviceDeskCategories;
  const priorities = input.priorities ?? serviceDeskPriorities;
  const departments = input.recommendedDepartments ?? serviceDeskDepartments;

  let content: string | null | undefined;
  try {
    const completion = await createOpenAiCompletion({
      client,
      input,
      localStoreMatch,
      categories,
      priorities,
      departments,
    });
    content = completion.choices[0]?.message?.content;
    console.log("OpenAI raw response:", redactPotentialSecrets(content ?? ""));
  } catch (requestError) {
    throw new OpenAiAnalyzerError("request", shortErrorMessage(requestError));
  }

  if (!content) throw new OpenAiAnalyzerError("invalid_json", "OpenAI returned invalid JSON", "");

  let parsed: { analysis: AiGroupMessageAnalysis; validationError: string | null };
  try {
    parsed = parseAiAnalysisJsonWithMeta({
      content,
      allowedCategories: categories,
      allowedPriorities: priorities,
      allowedDepartments: departments,
    });
  } catch (parseError) {
    console.error("[ai-analyzer] OpenAI JSON parsing failed", parseError);
    throw new OpenAiAnalyzerError("invalid_json", `OpenAI returned invalid JSON: ${rawContentSnippet(content)}`, rawContentSnippet(content));
  }
  return {
    analysis: enforceObjectPolicy(parsed.analysis, localStoreMatch, input.objectResolver),
    validationError: parsed.validationError,
  };
}

async function createOpenAiCompletion({
  client,
  input,
  localStoreMatch,
  categories,
  priorities,
  departments,
}: {
  client: NonNullable<Awaited<ReturnType<typeof getOpenAiClient>>["client"]>;
  input: AnalyzeTelegramGroupMessageInput;
  localStoreMatch: StoreMatchResult;
  categories: readonly string[];
  priorities: readonly AiPriority[];
  departments: readonly string[];
}) {
  const messages = [
    { role: "system" as const, content: ticketClassifierSystemPrompt },
    { role: "user" as const, content: buildPrompt({ text: input.text, localStoreMatch, objectResolver: input.objectResolver, categories, priorities, departments }) },
  ];

  try {
    return await client.chat.completions.create({
      model: getOpenAiModel(),
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ai_work_items_analysis",
          strict: true,
          schema: aiWorkItemsAnalysisJsonSchema,
        },
      },
      messages,
    });
  } catch (schemaError) {
    if (!isJsonSchemaUnsupportedError(schemaError)) throw schemaError;
    console.warn("[ai-analyzer] json_schema response_format is not supported, retrying with json_object.", schemaError);
    return client.chat.completions.create({
      model: getOpenAiModel(),
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages,
    });
  }
}

function isJsonSchemaUnsupportedError(error: unknown) {
  const message = shortErrorMessage(error).toLowerCase();
  return message.includes("json_schema") || message.includes("response_format") || message.includes("schema");
}

function shortErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 180);
  return "unknown error";
}

function fallbackReasonFromOpenAiError(error: unknown) {
  if (error instanceof OpenAiAnalyzerError) {
    if (error.code === "sdk") return "OpenAI SDK error";
    if (error.code === "invalid_json") return error.message;
    return `OpenAI request failed: ${error.message}`;
  }
  return `OpenAI request failed: ${shortErrorMessage(error)}`;
}

function rawContentSnippet(content: string) {
  return redactPotentialSecrets(content).replace(/\s+/g, " ").trim().slice(0, 200);
}

function redactPotentialSecrets(value: string) {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]");
}

export async function analyzeTelegramGroupMessageWithMeta(input: AnalyzeTelegramGroupMessageInput): Promise<AnalyzeTelegramGroupMessageResult> {
  const text = input.text?.trim() ?? "";
  const localStoreMatch = input.localStoreMatch ?? matchStore(text);

  if (!hasOpenAiApiKey()) {
    console.warn("[ai-analyzer] OPENAI_API_KEY is not configured, using AI v2 fallback parser.");
    return fallbackAnalyze(input, localStoreMatch, "OPENAI_API_KEY is not configured");
  }

  try {
    const { analysis, validationError } = await analyzeWithOpenAi(input, localStoreMatch);
    return { analysis, mode: "openai", model: getOpenAiModel(), openaiConfigured: true, openaiValidationError: validationError };
  } catch (error) {
    const fallbackReason = fallbackReasonFromOpenAiError(error);
    console.error("[ai-analyzer] OpenAI analysis failed, using AI v2 fallback parser.", error);
    return fallbackAnalyze(input, localStoreMatch, fallbackReason);
  }
}

export async function analyzeTelegramGroupMessage(input: AnalyzeTelegramGroupMessageInput): Promise<AiGroupMessageAnalysis> {
  const result = await analyzeTelegramGroupMessageWithMeta(input);
  return result.analysis;
}
