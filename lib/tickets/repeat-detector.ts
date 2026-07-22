import { createAdminClient } from "@/lib/supabase/admin";

const CLOSED_STATUSES = ["done", "rejected", "cancelled"] as const;
const LOOKBACK_DAYS = 90;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "have", "need", "needs",
  "na", "u", "v", "ta", "i", "a", "do", "po", "za", "ne", "ye", "e", "ce", "sho", "shcho",
  "potribno", "treba", "magazin", "mahazyn", "tex", "teh", "problematika", "bud", "duzhe",
]);

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/[']/g, ""],
  [/[.,:;!?()\[\]{}\"??\-_/\\]/g, " "],
  [/\b\u0432\u0443\u043b\b|\b\u0432\u0443\u043b\u0438\u0446\u044f\b|\b\u043c\b/g, " "],
  [/\s+/g, " "],
];

const CATEGORY_GROUPS: Record<string, string[]> = {
  construction: ["budivel", "bud", "plit", "fasad", "bord", "dver", "vikn", "zamok", "ruchk", "furnitur", "stilec", "shurop", "zvary", "profil", "remont"],
  plumbing: ["santeh", "kran", "zmishuv", "unitaz", "voda", "teche", "kap", "boiler", "bachok"],
  sewerage: ["kanal", "zliv", "trub", "rinv", "stik", "kanaliz"],
  electricity: ["elektr", "svit", "lampa", "rozet", "vymyk", "avtomat", "naprug"],
  students: ["student", "rozvantazh", "vynest", "perenest", "prybrat"],
};

export type RepeatDetectorInput = {
  objectId: string | null | undefined;
  categoryId?: string | null;
  categoryName?: string | null;
  description: string;
  rawText: string;
  sourceMessageId?: string | null;
  sourceChatId?: string | null;
};

export type RepeatDetectorResult = {
  isStrongRepeat: boolean;
  candidateTicketId?: string;
  confidence: number;
  reason: string;
};

type OpenTicketRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  category_id?: string | null;
  status?: string | null;
  category?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
};

function latinize(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u0456\u0457]/g, "i")
    .replace(/\u0454/g, "e")
    .replace(/\u0491/g, "g")
    .replace(/\u0430/g, "a")
    .replace(/\u0431/g, "b")
    .replace(/\u0432/g, "v")
    .replace(/\u0433/g, "h")
    .replace(/\u0434/g, "d")
    .replace(/\u0435/g, "e")
    .replace(/\u0436/g, "zh")
    .replace(/\u0437/g, "z")
    .replace(/\u0438/g, "y")
    .replace(/\u0439/g, "i")
    .replace(/\u043a/g, "k")
    .replace(/\u043b/g, "l")
    .replace(/\u043c/g, "m")
    .replace(/\u043d/g, "n")
    .replace(/\u043e/g, "o")
    .replace(/\u043f/g, "p")
    .replace(/\u0440/g, "r")
    .replace(/\u0441/g, "s")
    .replace(/\u0442/g, "t")
    .replace(/\u0443/g, "u")
    .replace(/\u0444/g, "f")
    .replace(/\u0445/g, "h")
    .replace(/\u0446/g, "c")
    .replace(/\u0447/g, "ch")
    .replace(/\u0448/g, "sh")
    .replace(/\u0449/g, "shch")
    .replace(/\u044e/g, "yu")
    .replace(/\u044f/g, "ya")
    .replace(/\u044c/g, "");
}

export function normalizeRepeatText(value: string) {
  let normalized = latinize(value ?? "");
  for (const [pattern, replacement] of REPLACEMENTS) normalized = normalized.replace(pattern, replacement);
  return normalized.trim();
}

function stemToken(token: string) {
  return token
    .replace(/(amy|iamy|yamy|ovoyi|evoyi|oyi|iyu|oyu|eiu|ogo|omu|ami|akh|yah|iy|yi|oi|ei|iv|ev|om|em|am|u|a|y|i|e)$/g, "")
    .slice(0, 32);
}

export function extractRepeatKeywords(value: string) {
  const normalized = normalizeRepeatText(value);
  const tokens = normalized.split(" ").map(stemToken).filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return Array.from(new Set(tokens));
}

function keywordOverlap(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  const intersection = a.filter((token) => bSet.has(token)).length;
  return intersection / Math.min(a.length, b.length);
}

function categoryGroup(value?: string | null) {
  const normalized = normalizeRepeatText(value ?? "");
  const tokens = extractRepeatKeywords(normalized);
  for (const [group, matchers] of Object.entries(CATEGORY_GROUPS)) {
    if (matchers.some((matcher) => normalized.includes(matcher) || tokens.some((token) => token.includes(matcher)))) return group;
  }
  return null;
}

function rowCategory(row: OpenTicketRow) {
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  return category ?? null;
}

function categoryIsSimilar(input: RepeatDetectorInput, row: OpenTicketRow) {
  const category = rowCategory(row);
  if (input.categoryId && row.category_id && input.categoryId === row.category_id) return true;
  const inputName = normalizeRepeatText(input.categoryName ?? "");
  const rowName = normalizeRepeatText(category?.name ?? "");
  if (inputName && rowName && inputName === rowName) return true;
  const inputGroup = categoryGroup((input.categoryName ?? "") + " " + input.description + " " + input.rawText);
  const rowGroup = categoryGroup((category?.name ?? "") + " " + (row.title ?? "") + " " + (row.description ?? ""));
  return Boolean(inputGroup && rowGroup && inputGroup === rowGroup);
}

export async function detectRepeatCandidate(input: RepeatDetectorInput): Promise<RepeatDetectorResult> {
  if (!input.objectId) return { isStrongRepeat: false, confidence: 0, reason: "object_missing" };

  const sourceText = (input.description ?? "") + " " + (input.rawText ?? "");
  const sourceKeywords = extractRepeatKeywords(sourceText);
  if (sourceKeywords.length === 0) return { isStrongRepeat: false, confidence: 0, reason: "keywords_missing" };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("id,title,description,category_id,status,category:categories(id,name)")
    .eq("object_id", input.objectId)
    .not("status", "in", "(" + CLOSED_STATUSES.join(",") + ")")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  let best: { id: string; confidence: number; reason: string; strong: boolean } | null = null;
  for (const row of (data ?? []) as OpenTicketRow[]) {
    const rowKeywords = extractRepeatKeywords((row.title ?? "") + " " + (row.description ?? ""));
    const overlap = keywordOverlap(sourceKeywords, rowKeywords);
    const sameCategory = categoryIsSimilar(input, row);
    const strong = (sameCategory && overlap >= 0.35) || overlap >= 0.5;
    const confidence = Math.min(0.98, sameCategory ? 0.55 + overlap : strong ? 0.85 + Math.min(overlap - 0.5, 0.13) : overlap);
    const reason = sameCategory ? "same_object_similar_category_overlap_" + overlap.toFixed(2) : "same_object_overlap_" + overlap.toFixed(2);
    if (!best || confidence > best.confidence) best = { id: row.id, confidence, reason, strong };
    if (strong && best.id === row.id) break;
  }

  if (!best) return { isStrongRepeat: false, confidence: 0, reason: "no_open_tickets_for_object" };
  return {
    isStrongRepeat: best.strong || best.confidence >= 0.85,
    candidateTicketId: best.id,
    confidence: Number(best.confidence.toFixed(2)),
    reason: best.reason,
  };
}
