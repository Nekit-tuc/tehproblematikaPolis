import type { AiGroupMessageAnalysis, AiPriority, AiWorkItem, AiWorkType } from "@/types/ai";

const WORK_TYPES: AiWorkType[] = ["repair", "install", "replace", "inspect", "administrative", "cleaning", "safety", "other"];

export type ParsedAiAnalysis = {
  analysis: AiGroupMessageAnalysis;
  validationError: string | null;
};

export function extractJsonObject(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return candidate.slice(firstBrace, lastBrace + 1).trim();
}

export function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

export function withTicketAlias(analysis: Omit<AiGroupMessageAnalysis, "tickets"> & { tickets?: AiWorkItem[] }): AiGroupMessageAnalysis {
  const workItems = analysis.workItems ?? [];
  return { ...analysis, workItems, tickets: workItems };
}

export function safeNoTicket(reason = "Повідомлення не схоже на технічну заявку."): AiGroupMessageAnalysis {
  return withTicketAlias({
    isTicketMessage: false,
    objectId: null,
    objectName: null,
    address: null,
    confidence: 0,
    workItems: [],
    missingFields: ["problem_description"],
    reason,
  });
}

export function safeObjectMissing(reason = "Не вдалося впевнено визначити об'єкт."): AiGroupMessageAnalysis {
  return withTicketAlias({
    isTicketMessage: true,
    objectId: null,
    objectName: null,
    address: null,
    confidence: 0.4,
    workItems: [],
    missingFields: ["object"],
    reason,
  });
}

function asStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePriority(value: unknown, allowedPriorities: readonly AiPriority[], warnings: string[]) {
  if (typeof value === "string" && allowedPriorities.includes(value as AiPriority)) return value as AiPriority;
  warnings.push(`priority normalized from ${String(value)} to medium`);
  return "medium";
}

function normalizeWorkType(value: unknown, warnings: string[]) {
  if (typeof value === "string" && WORK_TYPES.includes(value as AiWorkType)) return value as AiWorkType;
  warnings.push(`workType normalized from ${String(value)} to other`);
  return "other";
}

function normalizeCategory(value: unknown, allowedCategories: readonly string[], warnings: string[]) {
  const fallback = allowedCategories[allowedCategories.length - 1] ?? "Інше";
  if (typeof value !== "string") {
    warnings.push(`category normalized from ${String(value)} to ${fallback}`);
    return fallback;
  }

  const category = allowedCategories.find((allowed) => allowed === value) ?? allowedCategories.find((allowed) => allowed.toLowerCase() === value.toLowerCase());
  if (category) return category;

  warnings.push(`category normalized from ${value} to ${fallback}`);
  return fallback;
}

function normalizeDepartment(value: unknown, allowedDepartments: readonly string[]) {
  const department = asStringOrNull(value);
  if (!department) return null;
  if (department === "Технічний відділ") return department;
  return allowedDepartments.find((allowed) => allowed === department) ?? allowedDepartments.find((allowed) => allowed.toLowerCase() === department.toLowerCase()) ?? "Технічний відділ";
}

export function parseAiAnalysisJsonWithMeta({
  content,
  allowedCategories,
  allowedPriorities,
  allowedDepartments,
}: {
  content: string;
  allowedCategories: readonly string[];
  allowedPriorities: readonly AiPriority[];
  allowedDepartments: readonly string[];
}): ParsedAiAnalysis {
  const warnings: string[] = [];
  const jsonText = extractJsonObject(content);
  if (!jsonText) throw new Error("AI response does not contain a JSON object");

  const raw = JSON.parse(jsonText) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("AI response JSON is not an object");
  const value = raw as Record<string, unknown>;

  if (value.isTicketMessage !== true) {
    return {
      analysis: safeNoTicket(asStringOrNull(value.reason) ?? undefined),
      validationError: null,
    };
  }

  const workItemsArray = Array.isArray(value.workItems) ? value.workItems : null;
  const ticketsArray = Array.isArray(value.tickets) ? value.tickets : null;
  const hasWorkItems = Boolean(workItemsArray && workItemsArray.length > 0);
  const hasTickets = Boolean(ticketsArray && ticketsArray.length > 0);
  const rawWorkItems: unknown[] | null = hasWorkItems
    ? workItemsArray
    : hasTickets
      ? ticketsArray
      : workItemsArray
        ? workItemsArray
        : ticketsArray
          ? ticketsArray
          : null;

  if (!rawWorkItems) throw new Error("AI response workItems/tickets is not an array");
  if (!ticketsArray && workItemsArray) warnings.push("tickets missing; using workItems alias");
  if (!workItemsArray && ticketsArray) warnings.push("workItems missing; using tickets alias");
  if (!("mode" in value)) warnings.push("mode missing from OpenAI JSON");
  if (!("model" in value)) warnings.push("model missing from OpenAI JSON");

  const workItems: AiWorkItem[] = rawWorkItems.map((ticket): AiWorkItem => {
    if (!ticket || typeof ticket !== "object") throw new Error("AI response workItem is not an object");
    const item = ticket as Record<string, unknown>;
    const title = asStringOrNull(item.title);
    const description = asStringOrNull(item.description);
    if (!title || !description) throw new Error("AI response workItem title/description is missing");

    return {
      title,
      description,
      category: normalizeCategory(item.category, allowedCategories, warnings),
      workType: normalizeWorkType(item.workType, warnings),
      priority: normalizePriority(item.priority, allowedPriorities, warnings),
      recommendedDepartment: normalizeDepartment(item.recommendedDepartment, allowedDepartments),
      confidence: clampConfidence(item.confidence),
      reasoning: asStringOrNull(item.reasoning) ?? "AI визначив окрему роботу з повідомлення Telegram-групи.",
    };
  });

  const missingFields = Array.isArray(value.missingFields) ? value.missingFields.filter((field): field is string => typeof field === "string") : [];
  if (workItems.length === 0 && !missingFields.includes("workItems")) missingFields.push("workItems");

  const analysis = withTicketAlias({
    isTicketMessage: true,
    objectId: asStringOrNull(value.objectId),
    objectName: asStringOrNull(value.objectName),
    address: asStringOrNull(value.address),
    confidence: clampConfidence(value.confidence),
    workItems,
    missingFields,
    reason: asStringOrNull(value.reason) ?? "AI проаналізував повідомлення.",
  });

  return {
    analysis,
    validationError: warnings.length > 0 ? warnings.join("; ") : null,
  };
}

export function parseAiAnalysisJson(input: {
  content: string;
  allowedCategories: readonly string[];
  allowedPriorities: readonly AiPriority[];
  allowedDepartments: readonly string[];
}) {
  return parseAiAnalysisJsonWithMeta(input).analysis;
}
