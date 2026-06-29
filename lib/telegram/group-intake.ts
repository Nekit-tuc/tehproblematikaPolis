import { analyzeTelegramGroupMessage } from "@/lib/ai/group-message-analyzer";
import { buildPendingReviewTicketDraft } from "@/lib/ai/ticket-builder";
import { matchStore, normalizeStoreText, type StoreMatchResult } from "@/lib/stores/match-store";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiWorkItem } from "@/types/ai";
import type { Category, CompanyObject, Profile } from "@/types/domain";
import type { TelegramMessage } from "./client";

type IntakeResult =
  | { handled: false; reason: string }
  | { handled: true; created: false; reason: string }
  | { handled: true; created: true; ticketIds: string[]; numbers: string[] };

function isGroupMessage(message: TelegramMessage) {
  return message.chat.type === "group" || message.chat.type === "supergroup";
}

function telegramUserName(message: TelegramMessage) {
  const user = message.from;
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return user.username ? `${name || user.username} (@${user.username})` : name || null;
}

function normalize(value: string | null | undefined) {
  return normalizeStoreText(value ?? "");
}

function objectScore(object: CompanyObject, aliases: string[]) {
  const haystack = normalize(`${object.name} ${object.address} ${object.city} ${object.district ?? ""} ${object.object_number ?? ""}`);
  return aliases.reduce((score, alias) => {
    const normalizedAlias = normalize(alias);
    if (!normalizedAlias) return score;
    if (haystack.includes(normalizedAlias) || normalizedAlias.includes(haystack)) return Math.max(score, 2);
    const aliasTokens = normalizedAlias.split(" ").filter((token) => token.length > 2);
    const matched = aliasTokens.filter((token) => haystack.includes(token)).length;
    return Math.max(score, matched);
  }, 0);
}

async function findObject(objects: CompanyObject[], analysisObjectId: string, localStoreMatch: StoreMatchResult) {
  const matchedStore =
    localStoreMatch.bestMatch?.id === analysisObjectId
      ? localStoreMatch.bestMatch
      : localStoreMatch.candidates.find((candidate) => candidate.store.id === analysisObjectId)?.store;
  if (!matchedStore) return null;

  const aliases = [matchedStore.name, matchedStore.address, matchedStore.city, matchedStore.district, matchedStore.id, ...matchedStore.aliases];
  const scored = objects
    .filter((object) => object.type === matchedStore.objectType)
    .map((object) => ({ object, score: objectScore(object, aliases) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.object ?? null;
}

function findCategory(categories: Category[], categoryName: string | null) {
  const fallback = categories.find((category) => normalize(category.name) === normalize("Інше")) ?? categories[0] ?? null;
  if (!categoryName) return fallback;
  return categories.find((category) => normalize(category.name) === normalize(categoryName)) ?? categories.find((category) => normalize(category.name).includes(normalize(categoryName)) || normalize(categoryName).includes(normalize(category.name))) ?? fallback;
}

async function nextTicketNumber(supabase: ReturnType<typeof createAdminClient>) {
  const year = new Date().getFullYear();
  const prefix = `PSD-${year}-`;
  const { data } = await supabase
    .from("tickets")
    .select("number")
    .like("number", `${prefix}%`)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const current = typeof data?.number === "string" ? Number.parseInt(data.number.replace(prefix, ""), 10) : 0;
  return `${prefix}${String(Number.isFinite(current) ? current + 1 : 1).padStart(4, "0")}`;
}

async function requesterForTelegramUser(supabase: ReturnType<typeof createAdminClient>, telegramId: string | null) {
  if (telegramId) {
    const { data } = await supabase.from("profiles").select("*").eq("telegram_id", telegramId).eq("is_active", true).maybeSingle();
    if (data) return data as Profile;
  }

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_active", true)
    .in("role", ["admin", "tech_manager", "management"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

async function createPendingTicket({
  supabase,
  workItem,
  object,
  category,
  requester,
  message,
  sourceGroupId,
  originalText,
  analysis,
  localStoreMatch,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  workItem: AiWorkItem;
  object: CompanyObject;
  category: Category;
  requester: Profile;
  message: TelegramMessage;
  sourceGroupId: string;
  originalText: string;
  analysis: Awaited<ReturnType<typeof analyzeTelegramGroupMessage>>;
  localStoreMatch: StoreMatchResult;
}) {
  const number = await nextTicketNumber(supabase);
  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert(buildPendingReviewTicketDraft({
      number,
      workItem,
      object,
      category,
      requester,
      message,
      sourceGroupId,
      originalText,
      analysis,
      localStoreMatch,
      telegramUserName: telegramUserName(message),
    }))
    .select("id, number")
    .single();

  if (error || !ticket) {
    console.error("[telegram-group-intake] ticket insert failed", error?.message);
    return null;
  }

  await supabase.from("ticket_history").insert({
    ticket_id: ticket.id,
    actor_id: requester.id,
    action: "AI створив заявку з Telegram-групи на підтвердження",
    metadata: {
      source: "telegram_group",
      telegram_chat_id: String(message.chat.id),
      telegram_message_id: String(message.message_id),
      telegram_source_group_id: sourceGroupId,
      ai_confidence: workItem.confidence,
      local_store_match: {
        status: localStoreMatch.status,
        confidence: localStoreMatch.confidence,
        bestMatch: localStoreMatch.bestMatch?.id ?? null,
      },
      recommended_department: workItem.recommendedDepartment,
    },
  });

  return ticket as { id: string; number: string };
}

export async function handleTelegramGroupMessage(message: TelegramMessage): Promise<IntakeResult> {
  if (!isGroupMessage(message)) return { handled: false, reason: "private_or_non_group_message" };
  if (message.from?.is_bot) return { handled: true, created: false, reason: "bot_message" };

  const text = message.text?.trim() ?? "";
  if (!text) return { handled: true, created: false, reason: "empty_message" };
  if (text.startsWith("/")) return { handled: true, created: false, reason: "command_ignored" };

  const localStoreMatch = matchStore(text);
  const analysis = await analyzeTelegramGroupMessage({ text, localStoreMatch });
  if (!analysis.isTicketMessage) return { handled: true, created: false, reason: "not_ticket" };
  if (!analysis.objectId) return { handled: true, created: false, reason: "store_not_found" };
  if (analysis.confidence < 0.6) return { handled: true, created: false, reason: "low_confidence" };
  const workItems = analysis.workItems.length > 0 ? analysis.workItems : analysis.tickets;
  if (workItems.length === 0) return { handled: true, created: false, reason: "no_work_items" };

  const eligibleWorkItems = workItems.filter((item) => item.confidence >= 0.6);
  if (eligibleWorkItems.length === 0) return { handled: true, created: false, reason: "no_confident_work_items" };

  const supabase = createAdminClient();
  const [{ data: objects }, { data: categories }] = await Promise.all([
    supabase.from("objects").select("*").eq("is_active", true),
    supabase.from("categories").select("*").eq("is_active", true),
  ]);
  const object = await findObject((objects ?? []) as CompanyObject[], analysis.objectId, localStoreMatch);
  if (!object) return { handled: true, created: false, reason: "database_object_not_found" };

  const telegramUserId = message.from?.id ? String(message.from.id) : null;
  const requester = await requesterForTelegramUser(supabase, telegramUserId);
  if (!requester) return { handled: true, created: false, reason: "requester_profile_not_found" };

  const sourceGroupId = `${message.chat.id}_${message.message_id}`;
  const created = [];
  for (const workItem of eligibleWorkItems) {
    const category = findCategory((categories ?? []) as Category[], workItem.category);
    if (!category) {
      console.info("[telegram-group-intake] category_not_found", { category: workItem.category });
      continue;
    }

    const ticket = await createPendingTicket({
      supabase,
      workItem,
      object,
      category,
      requester,
      message,
      sourceGroupId,
      originalText: text,
      analysis,
      localStoreMatch,
    });
    if (ticket) created.push(ticket);
  }

  if (created.length === 0) return { handled: true, created: false, reason: "ticket_insert_failed" };
  return { handled: true, created: true, ticketIds: created.map((ticket) => ticket.id), numbers: created.map((ticket) => ticket.number) };
}
