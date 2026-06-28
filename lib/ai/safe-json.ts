import type { AiGroupMessageAnalysis, AiParsedTicket, AiPriority } from "@/types/ai";

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

export function safeNoTicket(reason = "Повідомлення не схоже на технічну заявку."): AiGroupMessageAnalysis {
  return {
    isTicketMessage: false,
    objectId: null,
    objectName: null,
    address: null,
    confidence: 0,
    tickets: [],
    missingFields: ["problem_description"],
    reason,
  };
}

export function safeObjectMissing(reason = "Не вдалося впевнено визначити об'єкт."): AiGroupMessageAnalysis {
  return {
    isTicketMessage: true,
    objectId: null,
    objectName: null,
    address: null,
    confidence: 0.4,
    tickets: [],
    missingFields: ["object"],
    reason,
  };
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
    objectId: asStringOrNull(value.objectId),
    objectName: asStringOrNull(value.objectName),
    address: asStringOrNull(value.address),
    confidence: clampConfidence(value.confidence),
    tickets,
    missingFields,
    reason: asStringOrNull(value.reason) ?? "AI проаналізував повідомлення.",
  } satisfies AiGroupMessageAnalysis;
}
