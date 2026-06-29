import { storeAddresses, type StoreAddress } from "@/lib/data/store-addresses";
import type { CompanyObject, ObjectType } from "@/types/domain";

export type StoreMatchStatus = "exact" | "high_confidence" | "ambiguous" | "not_found";

export type StoreObjectRecord = StoreAddress | (CompanyObject & { aliases?: string[] | null; objectType?: ObjectType | null });

export type StoreMatchBy =
  | "name"
  | "address"
  | "alias"
  | "city_address"
  | "district_address"
  | "street_number"
  | "object_number"
  | "tokens"
  | "compact"
  | "normalized";

export type StoreMatchCandidate = {
  store: StoreAddress;
  score: number;
  matchedBy: StoreMatchBy;
  matchedTokens: string[];
  missingTokens: string[];
};

export type StoreMatchResult = {
  status: StoreMatchStatus;
  bestMatch: StoreAddress | null;
  candidates: StoreMatchCandidate[];
  confidence: number;
  reason: string;
};

export type StoreMatch = StoreMatchResult;

const STOP_WORDS = new Set([
  "м",
  "місто",
  "вул",
  "вулиця",
  "проспект",
  "пр",
  "провулок",
  "площа",
  "майдан",
  "район",
  "магазин",
  "склад",
  "офіс",
  "тех",
  "технічна",
  "технічні",
  "проблематика",
  "проблема",
  "проблеми",
]);

const TOKEN_REPLACEMENTS: Record<string, string> = {
  небесної: "небесна",
  небесну: "небесна",
  небесній: "небесна",
  сотні: "сотня",
  сотню: "сотня",
  хлібної: "хлібна",
  хлібну: "хлібна",
  хлібній: "хлібна",
  богунії: "богунія",
  богуния: "богунія",
  богунію: "богунія",
  привокзальна: "привокзальний",
  привокзального: "привокзальний",
  привокзальному: "привокзальний",
  київської: "київська",
  київську: "київська",
  шевченка: "шевченка",
  параджанова: "параджанова",
};

export function normalizeStoreText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’ʼ`´]/g, "'")
    .replace(/[“”„«»"]/g, "'")
    .replace(/[№#]/g, " ")
    .replace(/(\p{L})(\d)/giu, "$1 $2")
    .replace(/(\d)(\p{L})/giu, "$1 $2")
    .replace(/\b(вул\.?|вулиця|просп\.?|пр\.?|пров\.?|провулок)\b/giu, " ")
    .replace(/[.,:;()\-–—/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(token: string) {
  const normalized = token.toLowerCase().replace(/[’ʼ`´]/g, "'").trim();
  if (!normalized) return "";
  const replaced = TOKEN_REPLACEMENTS[normalized] ?? normalized;
  if (/^\d+[a-zа-яіїєґ]?$/.test(replaced)) return replaced;
  return replaced
    .replace(/(ою|ею|ові|еві|ами|ями|ах|ях)$/u, "")
    .replace(/(ої|ій|ого|ому|ою|ою|а|у|ю|і|и)$/u, (ending) => {
      if (replaced.length <= ending.length + 4) return ending;
      return "";
    });
}

export function tokenizeStoreText(value: string) {
  return normalizeStoreText(value)
    .split(" ")
    .map(normalizeToken)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function compact(value: string) {
  return tokenizeStoreText(value).join("");
}

function getStoreType(record: StoreObjectRecord): ObjectType {
  if ("objectType" in record && record.objectType) return record.objectType;
  if ("type" in record && record.type) return record.type;
  return "store";
}

function toStoreAddress(record: StoreObjectRecord): StoreAddress {
  const aliases = "aliases" in record && Array.isArray(record.aliases) ? record.aliases : [];
  return {
    id: record.id,
    name: record.name,
    address: record.address,
    city: record.city,
    district: record.district ?? "",
    aliases,
    objectType: getStoreType(record),
  };
}

function objectNumber(record: StoreObjectRecord) {
  return "object_number" in record && typeof record.object_number === "string" ? record.object_number : null;
}

function candidateValues(record: StoreObjectRecord) {
  const aliases = "aliases" in record && Array.isArray(record.aliases) ? record.aliases : [];
  const number = objectNumber(record);
  return [
    { value: record.name, matchedBy: "name" as const, base: 95 },
    { value: record.address, matchedBy: "address" as const, base: 95 },
    { value: `${record.city} ${record.address}`, matchedBy: "city_address" as const, base: 94 },
    { value: `${record.district ?? ""} ${record.address}`, matchedBy: "district_address" as const, base: 92 },
    ...(number ? [{ value: number, matchedBy: "object_number" as const, base: 62 }] : []),
    ...aliases.map((alias) => ({ value: alias, matchedBy: "alias" as const, base: 92 })),
  ].filter((candidate) => candidate.value.trim().length > 0);
}

function importantTokens(record: StoreObjectRecord) {
  const values = [record.name, record.address, record.district ?? "", objectNumber(record) ?? "", ...("aliases" in record && Array.isArray(record.aliases) ? record.aliases : [])];
  const all = values.flatMap(tokenizeStoreText);
  const numbers = all.filter((token) => /\d/.test(token));
  const words = all.filter((token) => !/\d/.test(token) && token.length > 2);
  return unique([...words, ...numbers]);
}

function streetNumberTokens(record: StoreObjectRecord) {
  const addressTokens = tokenizeStoreText(record.address);
  const numberTokens = addressTokens.filter((token) => /\d/.test(token));
  const wordTokens = addressTokens.filter((token) => !/\d/.test(token) && token.length > 2);
  return unique([...wordTokens, ...numberTokens]);
}

function tokenOverlap(textTokens: Set<string>, candidateTokens: string[]) {
  const important = candidateTokens.filter((token) => token.length > 0 && !STOP_WORDS.has(token));
  if (important.length === 0) return { ratio: 0, matchedTokens: [], missingTokens: [] };
  const matchedTokens = important.filter((token) => textTokens.has(token));
  const missingTokens = important.filter((token) => !textTokens.has(token));
  return { ratio: matchedTokens.length / important.length, matchedTokens: unique(matchedTokens), missingTokens: unique(missingTokens) };
}

function buildCandidate(record: StoreObjectRecord, score: number, matchedBy: StoreMatchBy, matchedTokens: string[], missingTokens: string[]): StoreMatchCandidate {
  return {
    store: toStoreAddress(record),
    score: Math.max(0, Math.min(100, Math.round(score))),
    matchedBy,
    matchedTokens: unique(matchedTokens),
    missingTokens: unique(missingTokens),
  };
}

function betterCandidate(current: StoreMatchCandidate, next: StoreMatchCandidate) {
  if (next.score > current.score) return next;
  if (next.score === current.score && next.matchedTokens.length > current.matchedTokens.length) return next;
  return current;
}

function scoreRecord(text: string, record: StoreObjectRecord): StoreMatchCandidate {
  const normalizedText = normalizeStoreText(text);
  const textTokens = new Set(tokenizeStoreText(text));
  const compactText = compact(text);
  const allImportantTokens = importantTokens(record);
  let best = buildCandidate(record, 0, "normalized", [], allImportantTokens);

  for (const candidate of candidateValues(record)) {
    const candidateTokens = tokenizeStoreText(candidate.value);
    const normalizedCandidate = normalizeStoreText(candidate.value);
    const compactCandidate = compact(candidate.value);
    const overlap = tokenOverlap(textTokens, candidateTokens);

    if (normalizedCandidate && normalizedText.includes(normalizedCandidate)) {
      best = betterCandidate(best, buildCandidate(record, candidate.base, candidate.matchedBy, candidateTokens, []));
      continue;
    }

    if (compactCandidate && compactText.includes(compactCandidate)) {
      best = betterCandidate(best, buildCandidate(record, Math.max(candidate.base, 95), "compact", candidateTokens, []));
      continue;
    }

    if (overlap.ratio > 0) {
      const hasNumber = candidateTokens.some((token) => /\d/.test(token));
      const matchedNumber = overlap.matchedTokens.some((token) => /\d/.test(token));
      const numberPenalty = hasNumber && !matchedNumber ? 22 : 0;
      const objectNumberPenalty = candidate.matchedBy === "object_number" ? 18 : 0;
      const score = candidate.base * overlap.ratio - numberPenalty - objectNumberPenalty;
      best = betterCandidate(best, buildCandidate(record, score, candidate.matchedBy, overlap.matchedTokens, overlap.missingTokens));
    }
  }

  const streetTokens = streetNumberTokens(record);
  const streetOverlap = tokenOverlap(textTokens, streetTokens);
  const streetHasNumber = streetTokens.some((token) => /\d/.test(token));
  const streetMatchedNumber = streetOverlap.matchedTokens.some((token) => /\d/.test(token));
  if (streetOverlap.ratio > 0) {
    const base = streetOverlap.ratio === 1 && streetHasNumber && streetMatchedNumber ? 93 : 82 * streetOverlap.ratio;
    const penalty = streetHasNumber && !streetMatchedNumber ? 25 : 0;
    best = betterCandidate(best, buildCandidate(record, base - penalty, "street_number", streetOverlap.matchedTokens, streetOverlap.missingTokens));
  }

  const importantOverlap = tokenOverlap(textTokens, allImportantTokens);
  if (importantOverlap.ratio > 0) {
    const hasAnyNumber = allImportantTokens.some((token) => /\d/.test(token));
    const matchedNumber = importantOverlap.matchedTokens.some((token) => /\d/.test(token));
    const completeImportantScore = importantOverlap.ratio === 1 ? 88 : 78 * importantOverlap.ratio;
    const penalty = hasAnyNumber && !matchedNumber ? 24 : 0;
    best = betterCandidate(best, buildCandidate(record, completeImportantScore - penalty, "tokens", importantOverlap.matchedTokens, importantOverlap.missingTokens));
  }

  return best;
}

function buildResult(candidates: StoreMatchCandidate[]): StoreMatchResult {
  const sorted = candidates.sort((a, b) => b.score - a.score || b.matchedTokens.length - a.matchedTokens.length);
  const [best, second] = sorted;
  const topFive = sorted.slice(0, 5);

  if (!best || best.score < 50) {
    return {
      status: "not_found",
      bestMatch: null,
      candidates: topFive,
      confidence: 0,
      reason: "Object Matcher v2 не знайшов достатньо схожий об'єкт.",
    };
  }

  const gap = second ? best.score - second.score : 100;
  const closeCandidates = sorted.filter((candidate) => best.score - candidate.score <= 7);

  if (closeCandidates.length > 1 && best.score < 95) {
    return {
      status: "ambiguous",
      bestMatch: null,
      candidates: closeCandidates.slice(0, 5),
      confidence: best.score / 100,
      reason: "Object Matcher v2 знайшов кілька близьких кандидатів.",
    };
  }

  if (best.score >= 95 && gap >= 5) {
    return {
      status: "exact",
      bestMatch: best.store,
      candidates: topFive,
      confidence: best.score / 100,
      reason: "Object Matcher v2 знайшов точний збіг об'єкта.",
    };
  }

  if (best.score >= 85) {
    return {
      status: "high_confidence",
      bestMatch: best.store,
      candidates: topFive,
      confidence: best.score / 100,
      reason: "Object Matcher v2 знайшов об'єкт з високою впевненістю.",
    };
  }

  return {
    status: "ambiguous",
    bestMatch: null,
    candidates: topFive,
    confidence: best.score / 100,
    reason: "Object Matcher v2 має частковий збіг, але впевненості недостатньо.",
  };
}

export function getStoreCandidatesForAi(text: string, records: StoreObjectRecord[] = storeAddresses) {
  const normalizedText = normalizeStoreText(text);
  if (!normalizedText) return [];
  return records.map((record) => scoreRecord(normalizedText, record)).sort((a, b) => b.score - a.score || b.matchedTokens.length - a.matchedTokens.length).slice(0, 5);
}

export function matchStore(text: string, records: StoreObjectRecord[] = storeAddresses): StoreMatchResult {
  return buildResult(getStoreCandidatesForAi(text, records));
}

export function matchStoreFromObjects(text: string, objects: StoreObjectRecord[]): StoreMatchResult {
  return matchStore(text, objects);
}

export function isReliableStoreMatch(match: StoreMatchResult | null | undefined) {
  return match?.status === "exact" || match?.status === "high_confidence";
}
