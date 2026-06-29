import type { AiGroupMessageAnalysis, AiPriority, AiWorkItem, AiWorkType } from "@/types/ai";

const WORK_TYPES: AiWorkType[] = ["repair", "install", "replace", "inspect", "administrative", "cleaning", "safety", "other"];

export function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
}

export function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

export function withTicketAlias(analysis: Omit<AiGroupMessageAnalysis, "tickets"> & { tickets?: AiWorkItem[] }): AiGroupMessageAnalysis {
  const workItems = analysis.workItems ?? [];
  return { ...analysis, workItems, tickets: analysis.tickets ?? workItems };
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

function requirePriority(value: unknown, allowedPriorities: readonly AiPriority[]) {
  if (typeof value === "string" && allowedPriorities.includes(value as AiPriority)) return value as AiPriority;
  throw new Error(`AI response priority is not allowed: ${String(value)}`);
}

function requireWorkType(value: unknown) {
  if (typeof value === "string" && WORK_TYPES.includes(value as AiWorkType)) return value as AiWorkType;
  throw new Error(`AI response workType is not allowed: ${String(value)}`);
}

function requireCategory(value: unknown, allowedCategories: readonly string[]) {
  if (typeof value !== "string") throw new Error("AI response category is not a string");
  const exact = allowedCategories.find((category) => category === value);
  const caseInsensitive = allowedCategories.find((category) => category.toLowerCase() === value.toLowerCase());
  const category = exact ?? caseInsensitive;
  if (!category) throw new Error(`AI response category is not allowed: ${value}`);
  return category;
}

function normalizeDepartment(value: unknown, allowedDepartments: readonly string[]) {
  const department = asStringOrNull(value);
  if (!department) return null;
  if (department === "Технічний відділ") return department;
  return allowedDepartments.find((allowed) => allowed === department) ?? allowedDepartments.find((allowed) => allowed.toLowerCase() === department.toLowerCase()) ?? "Технічний відділ";
}

export function parseAiAnalysisJson({
  content,
  allowedCategories,
  allowedPriorities,
  allowedDepartments,
}: {
  content: string;
  allowedCategories: readonly string[];
  allowedPriorities: readonly AiPriority[];
  allowedDepartments: readonly string[];
}) {
  const jsonText = extractJsonObject(content);
  if (!jsonText) throw new Error("AI response does not contain a JSON object");
  const raw = JSON.parse(jsonText) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("AI response JSON is not an object");
  const value = raw as Record<string, unknown>;

  if (value.isTicketMessage !== true) return safeNoTicket(asStringOrNull(value.reason) ?? undefined);

  const rawWorkItems = Array.isArray(value.workItems) ? value.workItems : Array.isArray(value.tickets) ? value.tickets : null;
  if (!rawWorkItems) throw new Error("AI response workItems/tickets is not an array");

  const workItems: AiWorkItem[] = rawWorkItems.map((ticket): AiWorkItem => {
    if (!ticket || typeof ticket !== "object") throw new Error("AI response workItem is not an object");
    const item = ticket as Record<string, unknown>;
    const title = asStringOrNull(item.title);
    const description = asStringOrNull(item.description);
    if (!title || !description) throw new Error("AI response workItem title/description is missing");
    return {
      title,
      description,
      category: requireCategory(item.category, allowedCategories),
      workType: requireWorkType(item.workType),
      priority: requirePriority(item.priority, allowedPriorities),
      recommendedDepartment: normalizeDepartment(item.recommendedDepartment, allowedDepartments),
      confidence: clampConfidence(item.confidence),
      reasoning: asStringOrNull(item.reasoning) ?? "AI визначив окрему роботу з повідомлення Telegram-групи.",
    };
  });

  const missingFields = Array.isArray(value.missingFields) ? value.missingFields.filter((field): field is string => typeof field === "string") : [];
  if (workItems.length === 0 && !missingFields.includes("workItems")) missingFields.push("workItems");

  return withTicketAlias({
    isTicketMessage: true,
    objectId: asStringOrNull(value.objectId),
    objectName: asStringOrNull(value.objectName),
    address: asStringOrNull(value.address),
    confidence: clampConfidence(value.confidence),
    workItems,
    missingFields,
    reason: asStringOrNull(value.reason) ?? "AI проаналізував повідомлення.",
  });
}
