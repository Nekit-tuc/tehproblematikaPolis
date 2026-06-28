import { storeAddresses, type StoreAddress } from "@/lib/data/store-addresses";

export type StoreMatchQuality = "exact" | "high_confidence" | "partial";

export type StoreMatchCandidate = {
  store: StoreAddress;
  score: number;
  confidence: number;
  matchedBy: "name" | "alias" | "address" | "city_address" | "tokens";
  matchedText: string;
};

export type StoreMatch =
  | {
      status: "matched";
      quality: StoreMatchQuality;
      store: StoreAddress;
      score: number;
      confidence: number;
      matchedBy: StoreMatchCandidate["matchedBy"];
      candidates: StoreMatchCandidate[];
    }
  | {
      status: "ambiguous";
      quality: "ambiguous";
      store: null;
      score: number;
      confidence: number;
      matchedBy: "ambiguous";
      candidates: StoreMatchCandidate[];
    };

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

function tokens(value: string) {
  return normalizeStoreText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STREET_WORDS.has(token));
}

function tokenScore(text: string, candidate: string) {
  const textTokens = new Set(tokens(text));
  const candidateTokens = tokens(candidate);
  if (textTokens.size === 0 || candidateTokens.length === 0) return 0;
  const matched = candidateTokens.filter((token) => textTokens.has(token)).length;
  return matched / candidateTokens.length;
}

function hasHouseNumber(value: string) {
  return /\b\d+[a-zа-яіїєґ]?\b/iu.test(value);
}

function scoreCandidate(text: string, store: StoreAddress): StoreMatchCandidate | null {
  const normalizedText = normalizeStoreText(text);
  const searchable = [
    { value: store.name, matchedBy: "name" as const, base: 98 },
    { value: store.address, matchedBy: "address" as const, base: 100 },
    ...store.aliases.map((alias) => ({ value: alias, matchedBy: "alias" as const, base: 96 })),
  ];

  let best: StoreMatchCandidate | null = null;
  for (const candidate of searchable) {
    const normalizedCandidate = normalizeStoreText(candidate.value);
    if (!normalizedCandidate) continue;

    if (normalizedText.includes(normalizedCandidate)) {
      const score = candidate.base;
      best = { store, score, confidence: score / 100, matchedBy: candidate.matchedBy, matchedText: candidate.value };
      continue;
    }

    const overlap = tokenScore(normalizedText, normalizedCandidate);
    if (overlap >= 0.8) {
      const score = Math.round(candidate.base * overlap);
      if (!best || score > best.score) best = { store, score, confidence: score / 100, matchedBy: candidate.matchedBy, matchedText: candidate.value };
    }
  }

  const cityAddress = `${store.city} ${store.address}`;
  const cityAddressOverlap = tokenScore(normalizedText, cityAddress);
  if (cityAddressOverlap >= 0.65) {
    const numberPenalty = hasHouseNumber(store.address) && !hasHouseNumber(normalizedText) ? 18 : 0;
    const score = Math.round(92 * cityAddressOverlap) - numberPenalty;
    if (!best || score > best.score) best = { store, score, confidence: Math.max(0, score) / 100, matchedBy: "city_address", matchedText: cityAddress };
  }

  const fullText = `${store.name} ${store.city} ${store.district} ${store.address} ${store.aliases.join(" ")}`;
  const overlap = tokenScore(normalizedText, fullText);
  if (overlap >= 0.35) {
    const numberPenalty = hasHouseNumber(store.address) && !hasHouseNumber(normalizedText) ? 20 : 0;
    const score = Math.round(78 * overlap) - numberPenalty;
    if (!best || score > best.score) best = { store, score, confidence: Math.max(0, score) / 100, matchedBy: "tokens", matchedText: fullText };
  }

  return best && best.score >= 45 ? best : null;
}

function qualityForScore(score: number): StoreMatchQuality {
  if (score >= 95) return "exact";
  if (score >= 78) return "high_confidence";
  return "partial";
}

export function isReliableStoreMatch(match: StoreMatch | null) {
  return match?.status === "matched" && (match.quality === "exact" || match.quality === "high_confidence");
}

export function matchStore(text: string): StoreMatch | null {
  const normalizedText = normalizeStoreText(text);
  if (!normalizedText) return null;

  const candidates = storeAddresses
    .map((store) => scoreCandidate(normalizedText, store))
    .filter((candidate): candidate is StoreMatchCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return null;

  const [best, second] = candidates;
  const closeCandidates = candidates.filter((candidate) => best.score - candidate.score <= 8);
  const ambiguousBySharedStreet = closeCandidates.length > 1 && best.score < 95;
  const ambiguousByNumberlessAddress = closeCandidates.length > 1 && closeCandidates.some((candidate) => hasHouseNumber(candidate.store.address)) && !hasHouseNumber(normalizedText);

  if (second && (ambiguousBySharedStreet || ambiguousByNumberlessAddress)) {
    return {
      status: "ambiguous",
      quality: "ambiguous",
      store: null,
      score: best.score,
      confidence: best.confidence,
      matchedBy: "ambiguous",
      candidates: closeCandidates,
    };
  }

  return {
    status: "matched",
    quality: qualityForScore(best.score),
    store: best.store,
    score: best.score,
    confidence: best.confidence,
    matchedBy: best.matchedBy,
    candidates,
  };
}
