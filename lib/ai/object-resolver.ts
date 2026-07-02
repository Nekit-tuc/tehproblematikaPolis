import { isReliableStoreMatch, matchStore, type StoreMatchBy, type StoreMatchCandidate, type StoreMatchResult, type StoreObjectRecord } from "@/lib/stores/match-store";
import type { CompanyObject, ObjectType } from "@/types/domain";

export type ObjectResolverStatus = "resolved" | "ambiguous" | "not_found";
export type ObjectResolverSource = "local_exact" | "local_high_confidence" | "ai_candidate_choice" | "not_resolved";

export type ObjectResolverCandidate = {
  id: string;
  name: string;
  address: string;
  objectNumber: string | null;
  city: string;
  district: string | null;
  objectType: ObjectType;
  aliases: string[];
  score: number;
  matchedBy: StoreMatchBy;
  matchedAlias: string | null;
  matchedTokens: string[];
  missingTokens: string[];
};

export type ResolvedObject = {
  id: string;
  name: string;
  address: string;
  objectNumber: string | null;
  city: string;
  district: string | null;
  objectType: ObjectType;
  aliases: string[];
};

export type ObjectResolverResult = {
  status: ObjectResolverStatus;
  source: ObjectResolverSource;
  bestMatch: ResolvedObject | null;
  candidates: ObjectResolverCandidate[];
  allowedObjectIds: string[];
  confidence: number;
  reason: string;
  localStoreMatch: StoreMatchResult;
};

function objectType(record: StoreObjectRecord): ObjectType {
  if ("type" in record && record.type) return record.type;
  if ("objectType" in record && record.objectType) return record.objectType;
  return "store";
}

function objectNumber(record: StoreObjectRecord | undefined) {
  return record && "object_number" in record && typeof record.object_number === "string" ? record.object_number : null;
}

function aliases(record: StoreObjectRecord | undefined, fallback: string[]) {
  if (!record) return fallback;
  const manualAliases = "aliases" in record && Array.isArray(record.aliases) ? record.aliases : [];
  const aliasesText = "aliases_text" in record && typeof record.aliases_text === "string" ? record.aliases_text.split(/\r?\n|,/g) : [];
  return [...new Set([...manualAliases, ...aliasesText, ...fallback].map((value) => value.trim()).filter(Boolean))];
}

function recordById(records: StoreObjectRecord[], id: string) {
  return records.find((record) => record.id === id);
}

function toResolvedObject(match: StoreMatchCandidate["store"], records: StoreObjectRecord[]): ResolvedObject {
  const record = recordById(records, match.id);
  return {
    id: match.id,
    name: record?.name ?? match.name,
    address: record?.address ?? match.address,
    objectNumber: objectNumber(record),
    city: record?.city ?? match.city,
    district: record?.district ?? match.district ?? null,
    objectType: record ? objectType(record) : match.objectType,
    aliases: aliases(record, match.aliases),
  };
}

function toCandidate(candidate: StoreMatchCandidate, records: StoreObjectRecord[]): ObjectResolverCandidate {
  const resolved = toResolvedObject(candidate.store, records);
  return {
    ...resolved,
    score: candidate.score,
    matchedBy: candidate.matchedBy,
    matchedAlias: candidate.matchedAlias ?? null,
    matchedTokens: candidate.matchedTokens,
    missingTokens: candidate.missingTokens,
  };
}

export function resolveObjectFromMessage(text: string, records: StoreObjectRecord[]): ObjectResolverResult {
  const localStoreMatch = matchStore(text, records);
  const candidates = localStoreMatch.candidates.slice(0, 5).map((candidate) => toCandidate(candidate, records));
  if (isReliableStoreMatch(localStoreMatch) && localStoreMatch.bestMatch) {
    const bestMatch = toResolvedObject(localStoreMatch.bestMatch, records);
    return {
      status: "resolved",
      source: localStoreMatch.status === "exact" ? "local_exact" : "local_high_confidence",
      bestMatch,
      candidates,
      allowedObjectIds: [bestMatch.id],
      confidence: localStoreMatch.confidence,
      reason: localStoreMatch.reason,
      localStoreMatch,
    };
  }

  const unresolvedStatus = localStoreMatch.status === "ambiguous" && localStoreMatch.confidence >= 0.85 ? "ambiguous" : "not_found";
  return {
    status: unresolvedStatus,
    source: "not_resolved",
    bestMatch: null,
    candidates,
    allowedObjectIds: [],
    confidence: localStoreMatch.confidence,
    reason: localStoreMatch.reason,
    localStoreMatch,
  };
}

export function findResolvedCompanyObject(objects: CompanyObject[], resolver: ObjectResolverResult, analysisObjectId: string | null | undefined) {
  const resolvedId = resolver.status === "resolved" ? resolver.bestMatch?.id : analysisObjectId;
  if (!resolvedId) return null;
  if (resolver.status !== "resolved" && !resolver.allowedObjectIds.includes(resolvedId)) return null;
  return objects.find((object) => object.id === resolvedId) ?? null;
}
