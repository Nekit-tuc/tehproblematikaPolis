import type { AiGroupMessageAnalysis, AiWorkItem } from "@/types/ai";
import type { Category, CompanyObject, Profile, TicketPriority } from "@/types/domain";
import type { StoreMatchResult } from "@/lib/stores/match-store";
import type { TelegramMessage } from "@/lib/telegram/client";

type BuildTicketDraftInput = {
  number: string;
  workItem: AiWorkItem;
  object: CompanyObject;
  category: Category;
  requester: Profile;
  message: TelegramMessage;
  sourceGroupId: string;
  originalText: string;
  analysis: AiGroupMessageAnalysis;
  localStoreMatch: StoreMatchResult;
  telegramUserName: string | null;
  source?: "telegram_group" | "telegram_private_test";
};

export function buildPendingReviewTicketDraft({
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
  telegramUserName,
  source = "telegram_group",
}: BuildTicketDraftInput) {
  const telegramUserId = message.from?.id ? String(message.from.id) : null;
  return {
    number,
    title: workItem.title,
    description: workItem.description,
    status: "pending_review",
    priority: workItem.priority as TicketPriority,
    object_id: object.id,
    category_id: category.id,
    created_by: requester.id,
    source,
    telegram_chat_id: String(message.chat.id),
    telegram_message_id: String(message.message_id),
    telegram_source_group_id: sourceGroupId,
    telegram_user_id: telegramUserId,
    telegram_user_name: telegramUserName,
    original_message_text: originalText,
    ai_confidence: workItem.confidence,
    ai_raw_result: { localStoreMatch, analysis, workItem },
    recommended_department: workItem.recommendedDepartment,
  };
}
