import { storeAddresses, type StoreAddress } from "@/lib/data/store-addresses";

export type StoreMatchStatus = "exact" | "high_confidence" | "ambiguous" | "not_found";

export type StoreMatchCandidate = {
  store: StoreAddress;
  score: number;
  matchedBy: "name" | "address" | "alias" | "city_address" | "normalized";
};

export type StoreMatchResult = {
  status: StoreMatchStatus;
  bestMatch: StoreAddress | null;
  candidates: StoreMatchCandidate[];
  confidence: number;
  reason: string;
};

export type StoreMatch = StoreMatchResult;

const STREET_WORDS = new Set(["вул", "вулиця", "проспект", "пр", "провулок", "м", "місто", "район", "магазин"]);

export function normalizeStoreText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’ʼ`´]/g, "'")
    .replace(/[“”„«»"]/g, "'")
    .replace(/[.,:;()\-–—/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalizeStoreText(value).replace(/\s+/g, "");
}

function tokens(value: string) {
  return normalizeStoreText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STREET_WORDS.has(token));
}

function hasHouseNumber(value: string) {
  return /\b\d+[a-zа-яіїєґ]?\b/iu.test(value);
}

function tokenScore(text: string, candidate: string) {
  const textTokens = new Set(tokens(text));
  const candidateTokens = tokens(candidate);
  if (textTokens.size === 0 || candidateTokens.length === 0) return 0;
  const matched = candidateTokens.filter((token) => textTokens.has(token)).length;
  return matched / candidateTokens.length;
}

function candidateValues(store: StoreAddress) {
  return [
    { value: store.name, matchedBy: "name" as const, base: 98 },
    { value: store.address, matchedBy: "address" as const, base: 100 },
    { value: `${store.city} ${store.address}`, matchedBy: "city_address" as const, base: 94 },
    ...store.aliases.map((alias) => ({ value: alias, matchedBy: "alias" as const, base: 96 })),
  ];
}

function scoreStore(text: string, store: StoreAddress): StoreMatchCandidate {
  const normalizedText = normalizeStoreText(text);
  const compactText = compact(text);
  let best: StoreMatchCandidate = { store, score: 0, matchedBy: "normalized" };

  for (const candidate of candidateValues(store)) {
    const normalizedCandidate = normalizeStoreText(candidate.value);
    const compactCandidate = compact(candidate.value);
    if (!normalizedCandidate) continue;

    if (normalizedText.includes(normalizedCandidate)) {
      if (candidate.base > best.score) best = { store, score: candidate.base, matchedBy: candidate.matchedBy };
      continue;
    }

    if (compactCandidate && compactText.includes(compactCandidate)) {
      const score = candidate.base - 1;
      if (score > best.score) best = { store, score, matchedBy: candidate.matchedBy };
      continue;
    }

    const overlap = tokenScore(normalizedText, normalizedCandidate);
    if (overlap >= 0.35) {
      const numberPenalty = hasHouseNumber(store.address) && !hasHouseNumber(normalizedText) ? 18 : 0;
      const score = Math.round(candidate.base * overlap) - numberPenalty;
      if (score > best.score) best = { store, score, matchedBy: candidate.matchedBy };
    }
  }

  const allText = `${store.name} ${store.city} ${store.district} ${store.address} ${store.aliases.join(" ")}`;
  const normalizedScore = Math.round(78 * tokenScore(normalizedText, allText)) - (hasHouseNumber(store.address) && !hasHouseNumber(normalizedText) ? 20 : 0);
  if (normalizedScore > best.score) best = { store, score: normalizedScore, matchedBy: "normalized" };

  return { ...best, score: Math.max(0, Math.min(100, best.score)) };
}

function buildResult(candidates: StoreMatchCandidate[]): StoreMatchResult {
  const [best, second] = candidates;
  if (!best || best.score < 45) {
    return {
      status: "not_found",
      bestMatch: null,
      candidates: candidates.slice(0, 5),
      confidence: 0,
      reason: "Локальний довідник не знайшов достатньо схожий об'єкт.",
    };
  }

  const closeCandidates = candidates.filter((candidate) => best.score - candidate.score <= 8);
  const hasAmbiguousHouseNumber = closeCandidates.length > 1 && closeCandidates.some((candidate) => hasHouseNumber(candidate.store.address));
  if (second && best.score < 95 && (closeCandidates.length > 1 || hasAmbiguousHouseNumber)) {
    return {
      status: "ambiguous",
      bestMatch: null,
      candidates: closeCandidates.slice(0, 5),
      confidence: best.score / 100,
      reason: "Знайдено кілька схожих об'єктів, потрібне уточнення AI.",
    };
  }

  if (best.score >= 95) {
    return {
      status: "exact",
      bestMatch: best.store,
      candidates: candidates.slice(0, 5),
      confidence: best.score / 100,
      reason: "Локально знайдено точний збіг об'єкта.",
    };
  }

  if (best.score >= 78) {
    return {
      status: "high_confidence",
      bestMatch: best.store,
      candidates: candidates.slice(0, 5),
      confidence: best.score / 100,
      reason: "Локально знайдено об'єкт з високою впевненістю.",
    };
  }

  return {
    status: "ambiguous",
    bestMatch: null,
    candidates: candidates.slice(0, 5),
    confidence: best.score / 100,
    reason: "Локальний збіг недостатньо впевнений.",
  };
}

export function getStoreCandidatesForAi(text: string) {
  const normalizedText = normalizeStoreText(text);
  if (!normalizedText) return [];
  return storeAddresses
    .map((store) => scoreStore(normalizedText, store))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function matchStore(text: string): StoreMatchResult {
  return buildResult(getStoreCandidatesForAi(text));
}

export function isReliableStoreMatch(match: StoreMatchResult | null | undefined) {
  return match?.status === "exact" || match?.status === "high_confidence";
}
